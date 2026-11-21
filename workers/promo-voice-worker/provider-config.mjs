import { PromoVoiceWorkerError } from './preflight.mjs';

const SAFE_VOICE = /^[A-Za-z][A-Za-z0-9_-]{0,79}$/;

export function resolveGeminiVoice({ voiceProfileId, defaultVoice = 'Kore', voiceMapJson = '' }) {
  if (typeof voiceProfileId !== 'string' || !voiceProfileId.trim() || !SAFE_VOICE.test(defaultVoice)) {
    throw new PromoVoiceWorkerError('PROMO_VOICE_PROVIDER_CONFIG_INVALID', 'Voice profile resolution is not configured safely.');
  }
  let mappings = {};
  if (voiceMapJson) {
    try {
      mappings = JSON.parse(voiceMapJson);
    } catch {
      throw new PromoVoiceWorkerError('PROMO_VOICE_PROVIDER_CONFIG_INVALID', 'PROMO_GEMINI_VOICE_MAP_JSON must be valid JSON.');
    }
    if (!mappings || typeof mappings !== 'object' || Array.isArray(mappings) || Object.keys(mappings).length > 100) {
      throw new PromoVoiceWorkerError('PROMO_VOICE_PROVIDER_CONFIG_INVALID', 'Gemini voice mappings must be a bounded JSON object.');
    }
  }
  const selected = mappings[voiceProfileId] ?? defaultVoice;
  if (typeof selected !== 'string' || !SAFE_VOICE.test(selected)) {
    throw new PromoVoiceWorkerError('PROMO_VOICE_PROVIDER_CONFIG_INVALID', `Gemini voice mapping is invalid for profile ${voiceProfileId}.`);
  }
  return selected;
}
