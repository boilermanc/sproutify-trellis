import { Buffer } from 'node:buffer';

import {
  PromoRenderPreflightError,
  assertPromoRenderActivationReady,
  canonicalPromoJson,
  downloadVerifiedPromoAssets,
  inspectPromoRenderClaim,
  sha256Hex,
} from './preflight.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const finite = value => typeof value === 'number' && Number.isFinite(value);

export const postgresJsonbText = value => {
  if (Array.isArray(value)) return `[${value.map(postgresJsonbText).join(', ')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort((left, right) => {
      const leftBytes = Buffer.from(left);
      const rightBytes = Buffer.from(right);
      return leftBytes.length - rightBytes.length || Buffer.compare(leftBytes, rightBytes);
    });
    return `{${keys.map(key => `${JSON.stringify(key)}: ${postgresJsonbText(value[key])}`).join(', ')}}`;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('QA contains a non-finite number.');
  return JSON.stringify(value);
};

const verifiedArtifact = (artifact, job) => {
  const expected = job.input;
  if (!artifact || !Buffer.isBuffer(artifact.bytes) || artifact.bytes.length < 1
    || artifact.width !== expected.format.width || artifact.height !== expected.format.height
    || artifact.fps !== expected.timeline.fps || artifact.video_codec !== expected.render_profile.video_codec
    || artifact.pixel_format !== expected.render_profile.pixel_format || artifact.audio_codec !== expected.render_profile.audio_codec
    || artifact.audio_sample_rate !== expected.render_profile.audio_sample_rate || artifact.faststart !== true
    || artifact.color_range !== 'tv' || !finite(artifact.duration_seconds)
    || Math.abs(artifact.duration_seconds - expected.timeline.target_seconds) > expected.qa.duration_tolerance_seconds
    || !finite(artifact.integrated_lufs) || artifact.integrated_lufs < -14.5 || artifact.integrated_lufs > -13.5
    || !finite(artifact.true_peak_dbfs) || artifact.true_peak_dbfs > -1.5) {
    throw new PromoRenderPreflightError('PROMO_RENDER_OUTPUT_QA_FAILED', 'Rendered media did not satisfy the registered delivery profile.');
  }
  return artifact;
};

export function buildPromoRenderCompletion(job, artifact, { renderAssetId, qaAssetId }) {
  if (!UUID.test(String(renderAssetId || '')) || !UUID.test(String(qaAssetId || '')) || renderAssetId === qaAssetId) {
    throw new PromoRenderPreflightError('PROMO_RENDER_OUTPUT_ID_INVALID', 'Render completion requires distinct UUID asset IDs.');
  }
  const verified = verifiedArtifact(artifact, job);
  const renderChecksum = sha256Hex(verified.bytes);
  const qa = Object.freeze({
    schema_version: '1.0.0', passed: true, input_fingerprint: job.input_fingerprint,
    output_checksum_sha256: renderChecksum,
    ffmpeg_fingerprint: job.input.render_profile.expected_ffmpeg_fingerprint,
    width: verified.width, height: verified.height, fps: verified.fps,
    video_codec: verified.video_codec, pixel_format: verified.pixel_format,
    audio_codec: verified.audio_codec, audio_sample_rate: verified.audio_sample_rate,
    faststart: true, color_range: 'tv', duration_seconds: verified.duration_seconds,
    integrated_lufs: verified.integrated_lufs, true_peak_dbfs: verified.true_peak_dbfs,
  });
  const qaBytes = Buffer.from(postgresJsonbText(qa), 'utf8');
  const qaChecksum = sha256Hex(qaBytes);
  const outputFingerprint = sha256Hex(Buffer.from(canonicalPromoJson({
    schema_version: '1.0.0', job_id: job.id, input_fingerprint: job.input_fingerprint,
    render_asset_id: renderAssetId, qa_asset_id: qaAssetId,
    render_checksum_sha256: renderChecksum, qa_checksum_sha256: qaChecksum,
  }), 'utf8'));
  const renderKind = job.job_type === 'preview_render' ? 'render_preview' : 'render_master';
  const renderFilename = job.job_type === 'preview_render' ? 'preview.mp4' : 'final.mp4';
  return Object.freeze({
    render_asset_id: renderAssetId, qa_asset_id: qaAssetId,
    render_path: `${job.project_id}/${renderAssetId}/${renderFilename}`,
    qa_path: `${job.project_id}/${qaAssetId}/qa.json`, render_kind: renderKind,
    render_bytes: verified.bytes, qa_bytes: qaBytes, qa,
    render_checksum_sha256: renderChecksum, qa_checksum_sha256: qaChecksum,
    output_fingerprint: outputFingerprint,
  });
}

const requireAdapter = (adapters, name) => {
  if (typeof adapters?.[name] !== 'function') throw new Error(`Render executor adapter ${name} is required.`);
  return adapters[name];
};

export async function executePromoRenderClaim({
  job, worker_id, project, approvals = [], assets = [], composition_source_sha256,
  pipeline_fingerprint, adapters,
}) {
  const heartbeat = requireAdapter(adapters, 'heartbeat');
  const randomUuid = requireAdapter(adapters, 'randomUuid');
  const render = requireAdapter(adapters, 'render');
  const upload = requireAdapter(adapters, 'upload');
  const complete = requireAdapter(adapters, 'complete');
  const fail = requireAdapter(adapters, 'fail');
  const cleanup = requireAdapter(adapters, 'cleanup');
  const uploadedPaths = [];
  const keepLease = async progress => {
    if (await heartbeat({ job_id: job.id, worker_id, lease_token: job.lease_token, progress }) !== true) {
      throw new PromoRenderPreflightError('PROMO_RENDER_LEASE_LOST', 'The render lease expired or changed ownership.');
    }
  };
  try {
    const preflight = inspectPromoRenderClaim({
      job, worker_id, project, approvals, assets, composition_source_sha256, pipeline_fingerprint,
    });
    assertPromoRenderActivationReady(preflight);
    await keepLease(10);
    const resolvedAssets = await downloadVerifiedPromoAssets(preflight.asset_plan, {
      signAsset: requireAdapter(adapters, 'signAsset'), fetchAsset: requireAdapter(adapters, 'fetchAsset'),
    });
    await keepLease(25);
    const artifact = await render({ job, resolvedAssets, heartbeat: keepLease });
    await keepLease(85);
    const completion = buildPromoRenderCompletion(job, artifact, {
      renderAssetId: randomUuid(), qaAssetId: randomUuid(),
    });
    const commonMetadata = { job_id: job.id, input_fingerprint: job.input_fingerprint };
    await upload({
      bucket: 'promo-assets', path: completion.render_path, bytes: completion.render_bytes,
      content_type: 'video/mp4', upsert: false,
      metadata: { ...commonMetadata, sha256: completion.render_checksum_sha256, kind: completion.render_kind },
    });
    uploadedPaths.push(completion.render_path);
    await upload({
      bucket: 'promo-assets', path: completion.qa_path, bytes: completion.qa_bytes,
      content_type: 'application/json', upsert: false,
      metadata: {
        ...commonMetadata, sha256: completion.qa_checksum_sha256, kind: 'qa_report',
        payload_fingerprint_sha256: completion.qa_checksum_sha256,
      },
    });
    uploadedPaths.push(completion.qa_path);
    await keepLease(95);
    const completed = await complete({
      job_id: job.id, worker_id, lease_token: job.lease_token,
      render_asset_id: completion.render_asset_id, qa_asset_id: completion.qa_asset_id,
      render_checksum_sha256: completion.render_checksum_sha256,
      qa_checksum_sha256: completion.qa_checksum_sha256,
      render_file_size_bytes: completion.render_bytes.length,
      qa_file_size_bytes: completion.qa_bytes.length,
      duration_seconds: completion.qa.duration_seconds,
      output_fingerprint: completion.output_fingerprint, qa: completion.qa,
    });
    if (completed !== true) throw new PromoRenderPreflightError('PROMO_RENDER_COMPLETION_REJECTED', 'Atomic render completion rejected the lease or output contract.');
    return Object.freeze({ completed: true, ...completion });
  } catch (error) {
    if (uploadedPaths.length) {
      try { await cleanup({ bucket: 'promo-assets', paths: [...uploadedPaths] }); } catch { /* best-effort orphan cleanup */ }
    }
    const code = error instanceof PromoRenderPreflightError ? error.code : 'PROMO_RENDER_EXECUTOR_FAILED';
    const message = error instanceof Error ? error.message.slice(0, 1000) : 'Promo render executor failed.';
    try {
      await fail({
        job_id: job.id, worker_id, lease_token: job.lease_token, error_code: code,
        error_message: message, retryable: !(error instanceof PromoRenderPreflightError),
      });
    } catch { /* the lease may already be gone */ }
    throw error;
  }
}
