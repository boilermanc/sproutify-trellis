import { Buffer } from 'node:buffer';
import { canonicalPromoJson, sha256Hex } from '../promo-render-worker/preflight.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIRECTIONS = new Set(['understated', 'balanced', 'energetic']);
const record = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const strings = (value, minimum = 0) => Array.isArray(value) && value.length >= minimum && value.length <= 30
  && value.every(item => typeof item === 'string' && item.trim() && item.length <= 500);

export class PromoMusicPreflightError extends Error {
  constructor(code, message) { super(message); this.name = 'PromoMusicPreflightError'; this.code = code; }
}
const fail = (code, message) => { throw new PromoMusicPreflightError(code, message); };

export function inspectPromoMusicClaim({ job, worker_id, project, now = new Date() }) {
  if (!record(job) || !UUID.test(String(job.id || '')) || !UUID.test(String(job.project_id || ''))
    || !UUID.test(String(job.revision_id || '')) || !UUID.test(String(job.lease_token || ''))
    || job.job_type !== 'music_generate' || job.status !== 'running' || job.worker_id !== String(worker_id || '').trim()) {
    fail('PROMO_MUSIC_CLAIM_INVALID', 'Music claim does not belong to this worker.');
  }
  if (!Number.isFinite(Date.parse(job.lease_expires_at)) || Date.parse(job.lease_expires_at) <= now.getTime()) {
    fail('PROMO_MUSIC_LEASE_EXPIRED', 'Music claim lease is not active.');
  }
  const input = job.input;
  if (!record(input) || input.schema_version !== '1.0.0'
    || sha256Hex(Buffer.from(canonicalPromoJson(input), 'utf8')) !== job.input_fingerprint) {
    fail('PROMO_MUSIC_INPUT_FINGERPRINT_INVALID', 'Music input does not match its server fingerprint.');
  }
  if (!record(project) || project.id !== job.project_id || project.current_revision_id !== job.revision_id) {
    fail('PROMO_MUSIC_REVISION_STALE', 'Music no longer targets the active project revision.');
  }
  if (typeof input.music_profile_id !== 'string' || !input.music_profile_id.trim()
    || !Number.isInteger(input.take_number) || input.take_number < 1 || input.take_number > 3
    || !DIRECTIONS.has(input.direction) || input.instrumental !== true
    || !Number.isFinite(input.target_seconds) || input.target_seconds < 1 || input.target_seconds > 600
    || !record(input.sonic_profile) || !strings(input.sonic_profile.qualities, 1) || !strings(input.sonic_profile.avoid)
    || !record(input.brief) || typeof input.brief.mood !== 'string' || !input.brief.mood.trim()
    || !Number.isInteger(input.brief.tempo_min_bpm) || !Number.isInteger(input.brief.tempo_max_bpm)
    || input.brief.tempo_min_bpm < 40 || input.brief.tempo_max_bpm > 220
    || input.brief.tempo_min_bpm > input.brief.tempo_max_bpm || !strings(input.brief.instrumentation, 1)
    || !strings(input.brief.accent_phrase_ids) || !strings(input.brief.avoid)
    || typeof input.brief.ending !== 'string' || !input.brief.ending.trim() || input.brief.ending.length > 500
    || !Array.isArray(input.brief.energy_arc) || input.brief.energy_arc.length < 1 || input.brief.energy_arc.length > 30
    || input.brief.energy_arc.some(item => !record(item) || typeof item.phrase_id !== 'string'
      || typeof item.direction !== 'string' || !item.phrase_id.trim() || !item.direction.trim())) {
    fail('PROMO_MUSIC_INPUT_INVALID', 'Music input is outside the approved structured contract.');
  }
  const creativeDirection = [input.brief.mood, input.brief.ending, ...input.brief.instrumentation,
    ...input.sonic_profile.qualities, ...input.brief.energy_arc.map(item => item.direction)].join(' ');
  if (/\b(?:in the style of|sounds? like|imitat(?:e|ing)|named artist)\b/i.test(creativeDirection)) {
    fail('PROMO_MUSIC_IMITATION_BLOCKED', 'Named-artist imitation instructions are not allowed.');
  }
  return Object.freeze(structuredClone(input));
}

export function buildPromoMusicPrompt(plan) {
  return [
    `Create pure instrumental music lasting at least ${plan.target_seconds} seconds.`,
    'No singing, spoken words, chants, vocal samples, lyrics, or artist imitation.',
    `Direction: ${plan.direction}. Mood: ${plan.brief.mood}.`,
    `Tempo: ${plan.brief.tempo_min_bpm}-${plan.brief.tempo_max_bpm} BPM.`,
    `Instrumentation: ${plan.brief.instrumentation.join(', ')}.`,
    `Sonic qualities: ${plan.sonic_profile.qualities.join(', ')}.`,
    `Ending: ${plan.brief.ending || 'clean resolved ending'}.`,
    `Avoid: ${[...plan.sonic_profile.avoid, ...plan.brief.avoid].join(', ')}.`,
  ].join(' ');
}
