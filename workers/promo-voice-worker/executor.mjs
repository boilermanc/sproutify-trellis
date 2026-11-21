import { Buffer } from 'node:buffer';

import { canonicalPromoJson, sha256Hex } from '../promo-render-worker/preflight.mjs';
import { buildPromoVoicePrompt, inspectPromoVoiceClaim, PromoVoiceWorkerError } from './preflight.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const adapter = (adapters, name) => {
  if (typeof adapters?.[name] !== 'function') throw new Error(`Voice executor adapter ${name} is required.`);
  return adapters[name];
};

export async function executePromoVoiceClaim({ job, worker_id, project, adapters }) {
  const heartbeat = adapter(adapters, 'heartbeat');
  const generate = adapter(adapters, 'generate');
  const upload = adapter(adapters, 'upload');
  const complete = adapter(adapters, 'complete');
  const fail = adapter(adapters, 'fail');
  const cleanup = adapter(adapters, 'cleanup');
  const randomUuid = adapter(adapters, 'randomUuid');
  let uploadedPath = null;
  const keepLease = async progress => {
    if (await heartbeat({ job_id: job.id, worker_id, lease_token: job.lease_token, progress }) !== true) {
      throw new PromoVoiceWorkerError('PROMO_VOICE_LEASE_LOST', 'Voice lease expired or changed ownership.');
    }
  };
  try {
    const plan = inspectPromoVoiceClaim({ job, worker_id, project });
    await keepLease(10);
    const artifact = await generate({ prompt: buildPromoVoicePrompt(plan), plan, heartbeat: keepLease });
    if (!Buffer.isBuffer(artifact?.bytes) || artifact.bytes.length < 46 || artifact.bytes.subarray(0, 4).toString('ascii') !== 'RIFF'
      || !Number.isFinite(artifact.duration_seconds) || artifact.duration_seconds <= 0 || artifact.duration_seconds > 600
      || typeof artifact.provider !== 'string' || !artifact.provider || typeof artifact.model !== 'string' || !artifact.model
      || typeof artifact.voice_id !== 'string' || !artifact.voice_id || typeof artifact.provider_job_id !== 'string' || !artifact.provider_job_id) {
      throw new PromoVoiceWorkerError('PROMO_VOICE_OUTPUT_INVALID', 'Voice provider output is not a bounded WAV result.');
    }
    await keepLease(75);
    const takeId = randomUuid();
    const audioAssetId = randomUuid();
    if (!UUID.test(takeId) || !UUID.test(audioAssetId) || takeId === audioAssetId) {
      throw new PromoVoiceWorkerError('PROMO_VOICE_OUTPUT_ID_INVALID', 'Voice output requires distinct UUID identifiers.');
    }
    const checksum = sha256Hex(artifact.bytes);
    uploadedPath = `${job.project_id}/${audioAssetId}/voice.wav`;
    await upload({
      bucket: 'promo-assets', path: uploadedPath, bytes: artifact.bytes, content_type: 'audio/wav', upsert: false,
      metadata: { sha256: checksum, job_id: job.id, input_fingerprint: job.input_fingerprint, kind: 'voice_master' },
    });
    await keepLease(95);
    const outputFingerprint = sha256Hex(Buffer.from(canonicalPromoJson({
      schema_version: '1.0.0', job_id: job.id, input_fingerprint: job.input_fingerprint,
      take_id: takeId, audio_asset_id: audioAssetId, checksum_sha256: checksum,
      provider_job_id: artifact.provider_job_id,
    }), 'utf8'));
    const completed = await complete({
      job_id: job.id, worker_id, lease_token: job.lease_token, take_id: takeId, audio_asset_id: audioAssetId,
      checksum_sha256: checksum, file_size_bytes: artifact.bytes.length, duration_seconds: artifact.duration_seconds,
      provider: artifact.provider, model: artifact.model, voice_id: artifact.voice_id,
      provider_job_id: artifact.provider_job_id, settings: artifact.settings || {},
      estimated_cost_usd: Math.max(0, Number(artifact.estimated_cost_usd || 0)), output_fingerprint: outputFingerprint,
    });
    if (completed !== true) throw new PromoVoiceWorkerError('PROMO_VOICE_COMPLETION_REJECTED', 'Atomic voice completion rejected the lease or output contract.');
    return Object.freeze({ completed: true, take_id: takeId, audio_asset_id: audioAssetId, checksum_sha256: checksum, output_fingerprint: outputFingerprint });
  } catch (error) {
    if (uploadedPath) try { await cleanup({ bucket: 'promo-assets', paths: [uploadedPath] }); } catch { /* best effort */ }
    const code = error instanceof PromoVoiceWorkerError ? error.code : 'PROMO_VOICE_EXECUTOR_FAILED';
    try {
      await fail({ job_id: job.id, worker_id, lease_token: job.lease_token, error_code: code,
        error_message: error instanceof Error ? error.message.slice(0, 1000) : 'Promo voice executor failed.',
        retryable: !(error instanceof PromoVoiceWorkerError) });
    } catch { /* lease may be gone */ }
    throw error;
  }
}
