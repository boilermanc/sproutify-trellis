import { Buffer } from 'node:buffer';

import { canonicalPromoJson, sha256Hex } from '../promo-render-worker/preflight.mjs';
import { PromoVoiceWorkerError } from './preflight.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const record = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const fail = (code, message) => { throw new PromoVoiceWorkerError(code, message); };

export function inspectPromoVoiceAlignmentClaim({ job, worker_id, project, take, audioAsset, assetBound, now = new Date() }) {
  if (!record(job) || !UUID.test(String(job.id || '')) || !UUID.test(String(job.project_id || ''))
    || !UUID.test(String(job.revision_id || '')) || !UUID.test(String(job.lease_token || ''))
    || job.job_type !== 'voice_align' || job.status !== 'running' || job.worker_id !== worker_id) {
    fail('PROMO_VOICE_ALIGNMENT_CLAIM_INVALID', 'Voice alignment claim identity or ownership is invalid.');
  }
  if (!Number.isFinite(Date.parse(job.lease_expires_at)) || Date.parse(job.lease_expires_at) <= now.getTime()) {
    fail('PROMO_VOICE_ALIGNMENT_LEASE_EXPIRED', 'Voice alignment lease is not active.');
  }
  if (!SHA256.test(String(job.input_fingerprint || ''))
    || sha256Hex(Buffer.from(canonicalPromoJson(job.input), 'utf8')) !== job.input_fingerprint) {
    fail('PROMO_VOICE_ALIGNMENT_INPUT_FINGERPRINT_INVALID', 'Voice alignment input does not match its server fingerprint.');
  }
  if (!record(project) || project.id !== job.project_id || project.current_revision_id !== job.revision_id) {
    fail('PROMO_VOICE_ALIGNMENT_REVISION_STALE', 'Voice alignment no longer targets the active project revision.');
  }
  const input = job.input;
  if (!record(input) || input.schema_version !== '1.0.0' || !UUID.test(String(input.take_id || ''))
    || !UUID.test(String(input.audio_asset_id || '')) || !Array.isArray(input.phrases) || !input.phrases.length
    || input.phrases.length > 80 || input.phrases.some(item => !record(item) || typeof item.phrase_id !== 'string'
      || !item.phrase_id || typeof item.speech_text !== 'string' || !item.speech_text.trim())
    || !Number.isFinite(input.minimum_alignment_confidence) || input.minimum_alignment_confidence < 0
    || input.minimum_alignment_confidence > 1) {
    fail('PROMO_VOICE_ALIGNMENT_INPUT_INVALID', 'Voice alignment input does not match the bounded contract.');
  }
  if (!record(take) || take.id !== input.take_id || take.project_id !== job.project_id
    || take.audio_asset_id !== input.audio_asset_id
    || take.status !== 'aligning' || !Number.isFinite(Number(take.duration_seconds)) || Number(take.duration_seconds) <= 0
    || !record(take.settings) || take.settings.segmented_generation !== true
    || !Array.isArray(take.settings.phrase_timings)) {
    fail('PROMO_VOICE_ALIGNMENT_TAKE_INVALID', 'Voice take lacks exact segmented-generation timing provenance.');
  }
  if (!record(audioAsset) || audioAsset.id !== input.audio_asset_id || audioAsset.project_id !== job.project_id
    || assetBound !== true || audioAsset.kind !== 'voice_master' || audioAsset.status !== 'ready'
    || audioAsset.mime_type !== 'audio/wav' || !SHA256.test(String(audioAsset.checksum_sha256 || ''))) {
    fail('PROMO_VOICE_ALIGNMENT_ASSET_INVALID', 'Voice alignment requires the current verified private voice master.');
  }
  const timings = take.settings.phrase_timings;
  if (timings.length !== input.phrases.length) fail('PROMO_VOICE_ALIGNMENT_TIMING_INVALID', 'Phrase timing provenance is incomplete.');
  let lastEnd = 0;
  const phrases = input.phrases.map((phrase, index) => {
    const timing = timings[index];
    if (!record(timing) || timing.phrase_id !== phrase.phrase_id
      || !Number.isFinite(timing.start_seconds) || !Number.isFinite(timing.end_seconds)
      || timing.start_seconds < lastEnd || timing.end_seconds <= timing.start_seconds
      || timing.end_seconds > Number(take.duration_seconds) + 0.001 || timing.confidence !== 1) {
      fail('PROMO_VOICE_ALIGNMENT_TIMING_INVALID', 'Phrase timing provenance is invalid or does not match the approved script.');
    }
    lastEnd = timing.end_seconds;
    return Object.freeze({
      phrase_id: phrase.phrase_id,
      start_seconds: Number(timing.start_seconds.toFixed(6)),
      end_seconds: Number(timing.end_seconds.toFixed(6)),
      confidence: 1,
    });
  });
  return Object.freeze({
    take_id: input.take_id, audio_asset_id: input.audio_asset_id,
    minimum_alignment_confidence: input.minimum_alignment_confidence,
    words: Object.freeze([]), phrases: Object.freeze(phrases),
  });
}
