import { Buffer } from 'node:buffer';
import { canonicalPromoJson, sha256Hex } from '../promo-render-worker/preflight.mjs';
import { inspectPromoMusicClaim, PromoMusicPreflightError } from './preflight.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const requireAdapter = (adapters, name) => {
  if (typeof adapters?.[name] !== 'function') throw new Error(`Music executor adapter ${name} is required.`);
  return adapters[name];
};

export function buildPromoMusicCompletion(job, plan, artifact, { takeId, audioAssetId }) {
  if (!UUID.test(String(takeId || '')) || !UUID.test(String(audioAssetId || '')) || takeId === audioAssetId) {
    throw new PromoMusicPreflightError('PROMO_MUSIC_OUTPUT_ID_INVALID', 'Music output requires distinct UUID identifiers.');
  }
  if (!Buffer.isBuffer(artifact?.bytes) || artifact.bytes.length < 44 || artifact.bytes.subarray(0, 4).toString('ascii') !== 'RIFF'
    || artifact.bytes.subarray(8, 12).toString('ascii') !== 'WAVE'
    || !Number.isFinite(artifact.duration_seconds) || artifact.duration_seconds < plan.target_seconds || artifact.duration_seconds > 600
    || artifact.instrumental_requested !== true || typeof artifact.provider !== 'string' || !artifact.provider.trim()
    || typeof artifact.model !== 'string' || !artifact.model.trim() || typeof artifact.provider_job_id !== 'string'
    || !artifact.provider_job_id.trim() || !Number.isFinite(artifact.estimated_cost_usd) || artifact.estimated_cost_usd < 0) {
    throw new PromoMusicPreflightError('PROMO_MUSIC_OUTPUT_INVALID', 'Music output failed the WAV, duration, instrumental-request, or provider contract.');
  }
  const checksum = sha256Hex(artifact.bytes);
  const cue_markers = plan.brief.energy_arc.map((cue, index, all) => ({
    name: cue.phrase_id, at_seconds: Number(((index / all.length) * plan.target_seconds).toFixed(3)), confidence: null,
  }));
  const output_fingerprint = sha256Hex(Buffer.from(canonicalPromoJson({
    schema_version: '1.0.0', job_id: job.id, input_fingerprint: job.input_fingerprint,
    take_id: takeId, audio_asset_id: audioAssetId, checksum_sha256: checksum,
    duration_seconds: artifact.duration_seconds, provider_job_id: artifact.provider_job_id, cue_markers,
  }), 'utf8'));
  return Object.freeze({
    take_id: takeId, audio_asset_id: audioAssetId,
    path: `${job.project_id}/${audioAssetId}/music.wav`, bytes: artifact.bytes,
    checksum_sha256: checksum, duration_seconds: artifact.duration_seconds,
    provider: artifact.provider.trim(), model: artifact.model.trim(), provider_job_id: artifact.provider_job_id.trim(),
    cue_markers, estimated_cost_usd: artifact.estimated_cost_usd, output_fingerprint,
  });
}

export async function executePromoMusicClaim({ job, worker_id, project, adapters }) {
  const heartbeat = requireAdapter(adapters, 'heartbeat');
  const randomUuid = requireAdapter(adapters, 'randomUuid');
  const generate = requireAdapter(adapters, 'generate');
  const upload = requireAdapter(adapters, 'upload');
  const complete = requireAdapter(adapters, 'complete');
  const fail = requireAdapter(adapters, 'fail');
  const cleanup = requireAdapter(adapters, 'cleanup');
  const uploadedPaths = [];
  const keepLease = async progress => {
    if (await heartbeat({ job_id: job.id, worker_id, lease_token: job.lease_token, progress }) !== true) {
      throw new PromoMusicPreflightError('PROMO_MUSIC_LEASE_LOST', 'Music lease expired or changed ownership.');
    }
  };
  try {
    const plan = inspectPromoMusicClaim({ job, worker_id, project });
    await keepLease(10);
    const artifact = await generate({ plan, heartbeat: keepLease });
    await keepLease(80);
    const completion = buildPromoMusicCompletion(job, plan, artifact, { takeId: randomUuid(), audioAssetId: randomUuid() });
    await upload({
      bucket: 'promo-assets', path: completion.path, bytes: completion.bytes, content_type: 'audio/wav', upsert: false,
      metadata: { job_id: job.id, input_fingerprint: job.input_fingerprint,
        sha256: completion.checksum_sha256, kind: 'music_master' },
    });
    uploadedPaths.push(completion.path);
    await keepLease(95);
    const completed = await complete({
      job_id: job.id, worker_id, lease_token: job.lease_token,
      take_id: completion.take_id, audio_asset_id: completion.audio_asset_id,
      checksum_sha256: completion.checksum_sha256, file_size_bytes: completion.bytes.length,
      duration_seconds: completion.duration_seconds, provider: completion.provider, model: completion.model,
      provider_job_id: completion.provider_job_id, cue_markers: completion.cue_markers,
      estimated_cost_usd: completion.estimated_cost_usd, output_fingerprint: completion.output_fingerprint,
    });
    if (completed !== true) throw new PromoMusicPreflightError('PROMO_MUSIC_COMPLETION_REJECTED', 'Atomic music completion rejected the lease or output contract.');
    return Object.freeze({ completed: true, ...completion });
  } catch (error) {
    if (uploadedPaths.length) {
      try { await cleanup({ bucket: 'promo-assets', paths: [...uploadedPaths] }); } catch { /* best effort */ }
    }
    const code = error instanceof PromoMusicPreflightError ? error.code : 'PROMO_MUSIC_EXECUTOR_FAILED';
    try { await fail({
      job_id: job.id, worker_id, lease_token: job.lease_token, error_code: code,
      error_message: error instanceof Error ? error.message.slice(0, 1000) : 'Promo music executor failed.',
      retryable: !(error instanceof PromoMusicPreflightError),
    }); } catch { /* lease may be gone */ }
    throw error;
  }
}
