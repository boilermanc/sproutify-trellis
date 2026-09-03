import { Buffer } from 'node:buffer';

import { canonicalPromoJson, sha256Hex } from '../promo-render-worker/preflight.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const record = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const fail = (code, message) => { throw new PromoVoiceWorkerError(code, message); };

export class PromoVoiceWorkerError extends Error {
  constructor(code, message) { super(message); this.name = 'PromoVoiceWorkerError'; this.code = code; }
}

export function inspectPromoVoiceClaim({ job, worker_id, project, now = new Date() }) {
  if (!record(job) || !UUID.test(String(job.id || '')) || !UUID.test(String(job.project_id || ''))
    || !UUID.test(String(job.revision_id || '')) || !UUID.test(String(job.lease_token || ''))
    || job.job_type !== 'voice_generate' || job.status !== 'running' || job.worker_id !== worker_id) {
    fail('PROMO_VOICE_CLAIM_INVALID', 'Voice claim identity or ownership is invalid.');
  }
  if (!Number.isFinite(Date.parse(job.lease_expires_at)) || Date.parse(job.lease_expires_at) <= now.getTime()) {
    fail('PROMO_VOICE_LEASE_EXPIRED', 'Voice claim lease is not active.');
  }
  if (!SHA256.test(String(job.input_fingerprint || ''))
    || sha256Hex(Buffer.from(canonicalPromoJson(job.input), 'utf8')) !== job.input_fingerprint) {
    fail('PROMO_VOICE_INPUT_FINGERPRINT_INVALID', 'Voice input does not match its server fingerprint.');
  }
  if (!record(project) || project.id !== job.project_id || project.current_revision_id !== job.revision_id) {
    fail('PROMO_VOICE_REVISION_STALE', 'Voice claim no longer targets the active project revision.');
  }
  const input = job.input;
  if (!record(input) || input.schema_version !== '1.0.0' || ![1, 2, 3].includes(input.take_number)
    || !['natural', 'warm_authority', 'launch_energy'].includes(input.direction)
    || typeof input.voice_profile_id !== 'string' || !input.voice_profile_id
    || !Number.isFinite(input.target_seconds) || input.target_seconds < 1 || input.target_seconds > 600
    || !record(input.delivery) || typeof input.delivery.persona !== 'string' || !input.delivery.persona.trim()
    || !Array.isArray(input.delivery.qualities) || !input.delivery.qualities.length
    || !Number.isInteger(input.delivery.pace_wpm) || input.delivery.pace_wpm < 80 || input.delivery.pace_wpm > 240
    || !Array.isArray(input.delivery.avoid) || !record(input.script) || !Array.isArray(input.script.phrases)
    || !input.script.phrases.length || input.script.phrases.some(phrase => !record(phrase)
      || typeof phrase.phrase_id !== 'string' || !phrase.phrase_id || typeof phrase.speech_text !== 'string'
      || !phrase.speech_text.trim() || !['none', 'light', 'strong'].includes(phrase.emphasis))) {
    fail('PROMO_VOICE_INPUT_INVALID', 'Voice input does not match the bounded generation contract.');
  }
  return Object.freeze({
    take_number: input.take_number, direction: input.direction, target_seconds: input.target_seconds,
    voice_profile_id: input.voice_profile_id,
    delivery: Object.freeze({ ...input.delivery, qualities: Object.freeze([...input.delivery.qualities]), avoid: Object.freeze([...input.delivery.avoid]) }),
    phrases: Object.freeze(input.script.phrases.map(phrase => Object.freeze({ ...phrase }))),
  });
}

export function buildPromoVoicePrompt(plan, phrases = plan.phrases) {
  const direction = {
    natural: 'Natural and conversational; no announcer cadence.',
    warm_authority: 'Warm, grounded authority; confident without a hard sell.',
    launch_energy: 'Controlled launch energy; lively without shouting or exaggeration.',
  }[plan.direction];
  return [
    `Audio profile: ${plan.delivery.persona}`,
    `Qualities: ${plan.delivery.qualities.join(', ')}.`,
    `Pace: approximately ${plan.delivery.pace_wpm} words per minute.`,
    `Direction: ${direction}`,
    plan.delivery.avoid.length ? `Avoid: ${plan.delivery.avoid.join(', ')}.` : '',
    'Read only the script below. Preserve its words and order exactly; do not add an introduction, commentary, or closing.',
    'SCRIPT:',
    phrases.map(phrase => phrase.speech_text).join(' '),
  ].filter(Boolean).join('\n');
}
