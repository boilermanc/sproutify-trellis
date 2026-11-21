import { Buffer } from 'node:buffer';

import { postgresJsonbText } from '../promo-render-worker/executor.mjs';
import { canonicalPromoJson, sha256Hex } from '../promo-render-worker/preflight.mjs';
import { inspectPromoVoiceAlignmentClaim } from './alignment-preflight.mjs';
import { PromoVoiceWorkerError } from './preflight.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const adapter = (adapters, name) => {
  if (typeof adapters?.[name] !== 'function') throw new Error(`Voice alignment adapter ${name} is required.`);
  return adapters[name];
};

export async function executePromoVoiceAlignmentClaim({ job, worker_id, project, take, audioAsset, assetBound, adapters }) {
  const heartbeat = adapter(adapters, 'heartbeat');
  const upload = adapter(adapters, 'upload');
  const complete = adapter(adapters, 'complete');
  const fail = adapter(adapters, 'fail');
  const cleanup = adapter(adapters, 'cleanup');
  const randomUuid = adapter(adapters, 'randomUuid');
  let uploadedPath = null;
  const keepLease = async progress => {
    if (await heartbeat({ job_id: job.id, worker_id, lease_token: job.lease_token, progress }) !== true) {
      throw new PromoVoiceWorkerError('PROMO_VOICE_ALIGNMENT_LEASE_LOST', 'Voice alignment lease expired or changed ownership.');
    }
  };
  try {
    const plan = inspectPromoVoiceAlignmentClaim({ job, worker_id, project, take, audioAsset, assetBound });
    await keepLease(25);
    const alignmentAssetId = randomUuid();
    if (!UUID.test(String(alignmentAssetId || ''))) {
      throw new PromoVoiceWorkerError('PROMO_VOICE_ALIGNMENT_OUTPUT_ID_INVALID', 'Voice alignment requires a UUID asset identifier.');
    }
    const alignment = Object.freeze({
      schema_version: '1.0.0', take_id: plan.take_id, audio_asset_id: plan.audio_asset_id,
      words: plan.words, phrases: plan.phrases,
    });
    const bytes = Buffer.from(postgresJsonbText(alignment), 'utf8');
    const checksum = sha256Hex(bytes);
    uploadedPath = `${job.project_id}/${alignmentAssetId}/alignment.json`;
    await upload({
      bucket: 'promo-assets', path: uploadedPath, bytes, content_type: 'application/json', upsert: false,
      metadata: {
        sha256: checksum, payload_fingerprint_sha256: checksum,
        job_id: job.id, input_fingerprint: job.input_fingerprint, kind: 'voice_alignment',
      },
    });
    await keepLease(95);
    const outputFingerprint = sha256Hex(Buffer.from(canonicalPromoJson({
      schema_version: '1.0.0', job_id: job.id, input_fingerprint: job.input_fingerprint,
      take_id: plan.take_id, alignment_asset_id: alignmentAssetId, checksum_sha256: checksum,
    }), 'utf8'));
    const completed = await complete({
      job_id: job.id, worker_id, lease_token: job.lease_token, alignment_asset_id: alignmentAssetId,
      checksum_sha256: checksum, file_size_bytes: bytes.length, alignment, output_fingerprint: outputFingerprint,
    });
    if (completed !== true) throw new PromoVoiceWorkerError('PROMO_VOICE_ALIGNMENT_COMPLETION_REJECTED', 'Atomic voice alignment completion rejected the lease or output contract.');
    return Object.freeze({ completed: true, alignment_asset_id: alignmentAssetId, alignment, checksum_sha256: checksum, output_fingerprint: outputFingerprint });
  } catch (error) {
    if (uploadedPath) try { await cleanup({ bucket: 'promo-assets', paths: [uploadedPath] }); } catch { /* best effort */ }
    const code = error instanceof PromoVoiceWorkerError ? error.code : 'PROMO_VOICE_ALIGNMENT_EXECUTOR_FAILED';
    try {
      await fail({
        job_id: job.id, worker_id, lease_token: job.lease_token, error_code: code,
        error_message: error instanceof Error ? error.message.slice(0, 1000) : 'Promo voice alignment failed.',
        retryable: !(error instanceof PromoVoiceWorkerError),
      });
    } catch { /* lease may be gone */ }
    throw error;
  }
}
