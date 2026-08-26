import { Buffer } from 'node:buffer';

import { canonicalPromoJson, sha256Hex } from '../promo-render-worker/preflight.mjs';
import { postgresJsonbText } from '../promo-render-worker/executor.mjs';
import { inspectPromoCaptureClaim, PromoCapturePreflightError } from './preflight.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const requireAdapter = (adapters, name) => {
  if (typeof adapters?.[name] !== 'function') throw new Error(`Capture executor adapter ${name} is required.`);
  return adapters[name];
};

const bytes = (value, label) => {
  if (!Buffer.isBuffer(value) || value.length < 1) {
    throw new PromoCapturePreflightError('PROMO_CAPTURE_OUTPUT_INVALID', `${label} bytes are missing.`);
  }
  return value;
};

export function buildPromoCaptureCompletion(job, plan, artifact, ids) {
  const allIds = [ids.captureRunId, ids.videoAssetId, ids.traceAssetId, ...(ids.stillAssetIds || [])];
  if (allIds.some(id => !UUID.test(String(id || ''))) || new Set(allIds).size !== allIds.length) {
    throw new PromoCapturePreflightError('PROMO_CAPTURE_OUTPUT_ID_INVALID', 'Capture output requires distinct UUID identifiers.');
  }
  const videoBytes = bytes(artifact?.video?.bytes, 'Capture video');
  if (artifact.video.width !== plan.viewport.width || artifact.video.height !== plan.viewport.height
    || typeof artifact.video.duration_seconds !== 'number' || !Number.isFinite(artifact.video.duration_seconds)
    || artifact.video.duration_seconds <= 0 || artifact.video.duration_seconds > 600
    || !Array.isArray(artifact.stills) || artifact.stills.length < 1 || artifact.stills.length > 12
    || artifact.stills.length !== ids.stillAssetIds.length
    || artifact.contains_pii !== false || artifact.route !== plan.route || artifact.commit_sha !== plan.commit_sha
    || JSON.stringify(artifact.masks_applied) !== JSON.stringify(plan.masks)
    || !Array.isArray(artifact.assertions)) {
    throw new PromoCapturePreflightError('PROMO_CAPTURE_OUTPUT_QA_FAILED', 'Capture output did not satisfy its scenario contract.');
  }
  const assertions = plan.assertions.map(expected => {
    const actual = artifact.assertions.find(item => item?.kind === expected.kind
      && JSON.stringify(item?.value) === JSON.stringify(expected.value));
    if (actual?.passed !== true) {
      throw new PromoCapturePreflightError('PROMO_CAPTURE_ASSERTION_FAILED', `Capture assertion ${expected.kind} did not pass.`);
    }
    return { kind: expected.kind, value: expected.value, passed: true };
  });
  const stills = artifact.stills.map((still, index) => {
    const stillBytes = bytes(still?.bytes, `Capture still ${index + 1}`);
    if (still.width !== plan.viewport.width || still.height !== plan.viewport.height) {
      throw new PromoCapturePreflightError('PROMO_CAPTURE_OUTPUT_QA_FAILED', 'Capture still dimensions changed from the scenario viewport.');
    }
    const assetId = ids.stillAssetIds[index];
    return Object.freeze({
      asset_id: assetId, path: `${job.project_id}/${assetId}/capture.png`, bytes: stillBytes,
      checksum_sha256: sha256Hex(stillBytes), file_size_bytes: stillBytes.length,
      width: still.width, height: still.height,
    });
  });
  const evidence = Object.freeze({
    schema_version: '1.0.0', scenario_id: plan.scenario_id, scenario_key: plan.scenario_key,
    scenario_version: plan.scenario_version, commit_sha: plan.commit_sha, route: plan.route,
    contains_pii: false, masks_applied: [...plan.masks], assertions,
  });
  const traceBytes = Buffer.from(postgresJsonbText(evidence), 'utf8');
  const videoChecksum = sha256Hex(videoBytes);
  const traceChecksum = sha256Hex(traceBytes);
  const outputFingerprint = sha256Hex(Buffer.from(canonicalPromoJson({
    schema_version: '1.0.0', job_id: job.id, input_fingerprint: job.input_fingerprint,
    capture_run_id: ids.captureRunId, video_asset_id: ids.videoAssetId,
    video_checksum_sha256: videoChecksum,
    stills: stills.map(item => ({ asset_id: item.asset_id, checksum_sha256: item.checksum_sha256 })),
    trace_asset_id: ids.traceAssetId, trace_checksum_sha256: traceChecksum,
  }), 'utf8'));
  return Object.freeze({
    capture_run_id: ids.captureRunId,
    video_asset_id: ids.videoAssetId, video_path: `${job.project_id}/${ids.videoAssetId}/capture.mp4`,
    video_bytes: videoBytes, video_checksum_sha256: videoChecksum,
    duration_seconds: artifact.video.duration_seconds, stills,
    trace_asset_id: ids.traceAssetId, trace_path: `${job.project_id}/${ids.traceAssetId}/trace.json`,
    trace_bytes: traceBytes, trace_checksum_sha256: traceChecksum,
    output_fingerprint: outputFingerprint, evidence,
  });
}
export async function executePromoCaptureClaim({ job, worker_id, project, branch_source, scenario, adapters }) {
  const heartbeat = requireAdapter(adapters, 'heartbeat');
  const randomUuid = requireAdapter(adapters, 'randomUuid');
  const resolveFixture = requireAdapter(adapters, 'resolveFixture');
  const resolveAuthProfile = requireAdapter(adapters, 'resolveAuthProfile');
  const capture = requireAdapter(adapters, 'capture');
  const upload = requireAdapter(adapters, 'upload');
  const complete = requireAdapter(adapters, 'complete');
  const fail = requireAdapter(adapters, 'fail');
  const cleanup = requireAdapter(adapters, 'cleanup');
  const uploadedPaths = [];
  const keepLease = async progress => {
    if (await heartbeat({ job_id: job.id, worker_id, lease_token: job.lease_token, progress }) !== true) {
      throw new PromoCapturePreflightError('PROMO_CAPTURE_LEASE_LOST', 'Capture lease expired or changed ownership.');
    }
  };
  try {
    const plan = inspectPromoCaptureClaim({ job, worker_id, project, branch_source, scenario });
    await keepLease(10);
    const fixture = await resolveFixture(plan.fixture_key);
    const auth = plan.auth_profile_key ? await resolveAuthProfile(plan.auth_profile_key) : null;
    if (!fixture || (plan.auth_profile_key && !auth)) {
      throw new PromoCapturePreflightError('PROMO_CAPTURE_SECRET_PROFILE_MISSING', 'Worker capture fixture or auth profile is unavailable.');
    }
    const artifact = await capture({ plan, fixture, auth, heartbeat: keepLease });
    await keepLease(80);
    const stillCount = Array.isArray(artifact?.stills) ? artifact.stills.length : 0;
    const completion = buildPromoCaptureCompletion(job, plan, artifact, {
      captureRunId: randomUuid(), videoAssetId: randomUuid(),
      stillAssetIds: Array.from({ length: stillCount }, () => randomUuid()), traceAssetId: randomUuid(),
    });
    const common = { job_id: job.id, input_fingerprint: job.input_fingerprint };
    const uploadOne = async value => { await upload(value); uploadedPaths.push(value.path); };
    await uploadOne({ bucket: 'promo-assets', path: completion.video_path, bytes: completion.video_bytes,
      content_type: 'video/mp4', upsert: false,
      metadata: { ...common, sha256: completion.video_checksum_sha256, kind: 'capture_video' } });
    for (const still of completion.stills) await uploadOne({
      bucket: 'promo-assets', path: still.path, bytes: still.bytes, content_type: 'image/png', upsert: false,
      metadata: { ...common, sha256: still.checksum_sha256, kind: 'capture_still' },
    });
    await uploadOne({ bucket: 'promo-assets', path: completion.trace_path, bytes: completion.trace_bytes,
      content_type: 'application/json', upsert: false,
      metadata: { ...common, sha256: completion.trace_checksum_sha256, kind: 'capture_trace',
        payload_fingerprint_sha256: completion.trace_checksum_sha256 } });
    await keepLease(95);
    const completed = await complete({
      job_id: job.id, worker_id, lease_token: job.lease_token,
      capture_run_id: completion.capture_run_id, video_asset_id: completion.video_asset_id,
      video_checksum_sha256: completion.video_checksum_sha256,
      video_file_size_bytes: completion.video_bytes.length, duration_seconds: completion.duration_seconds,
      stills: completion.stills.map(({ asset_id, checksum_sha256, file_size_bytes, width, height }) =>
        ({ asset_id, checksum_sha256, file_size_bytes, width, height })),
      trace_asset_id: completion.trace_asset_id, trace_checksum_sha256: completion.trace_checksum_sha256,
      trace_file_size_bytes: completion.trace_bytes.length,
      output_fingerprint: completion.output_fingerprint, evidence: completion.evidence,
    });
    if (completed !== true) {
      throw new PromoCapturePreflightError('PROMO_CAPTURE_COMPLETION_REJECTED', 'Atomic capture completion rejected the lease or evidence contract.');
    }
    return Object.freeze({ completed: true, ...completion });
  } catch (error) {
    if (uploadedPaths.length) {
      try { await cleanup({ bucket: 'promo-assets', paths: [...uploadedPaths] }); } catch { /* best effort */ }
    }
    const code = error instanceof PromoCapturePreflightError ? error.code : 'PROMO_CAPTURE_EXECUTOR_FAILED';
    try { await fail({ job_id: job.id, worker_id, lease_token: job.lease_token, error_code: code,
      error_message: error instanceof Error ? error.message.slice(0, 1000) : 'Promo capture executor failed.',
      retryable: !(error instanceof PromoCapturePreflightError) }); } catch { /* lease may be gone */ }
    throw error;
  }
}
