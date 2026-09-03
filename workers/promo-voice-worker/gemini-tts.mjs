import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';

import { PromoVoiceWorkerError } from './preflight.mjs';

const writeAscii = (buffer, offset, value) => buffer.write(value, offset, 'ascii');

export function pcm16MonoToWav(pcm, sampleRate = 24000) {
  if (!Buffer.isBuffer(pcm) || pcm.length < 2 || pcm.length % 2 !== 0) {
    throw new PromoVoiceWorkerError('PROMO_VOICE_PROVIDER_AUDIO_INVALID', 'Gemini returned invalid PCM16 audio.');
  }
  const wav = Buffer.alloc(44 + pcm.length);
  writeAscii(wav, 0, 'RIFF'); wav.writeUInt32LE(36 + pcm.length, 4); writeAscii(wav, 8, 'WAVE');
  writeAscii(wav, 12, 'fmt '); wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24); wav.writeUInt32LE(sampleRate * 2, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  writeAscii(wav, 36, 'data'); wav.writeUInt32LE(pcm.length, 40); pcm.copy(wav, 44);
  return wav;
}

export function extractPcm16MonoWav(wav) {
  if (!Buffer.isBuffer(wav) || wav.length < 46 || wav.subarray(0, 4).toString('ascii') !== 'RIFF'
    || wav.subarray(8, 12).toString('ascii') !== 'WAVE') {
    throw new PromoVoiceWorkerError('PROMO_VOICE_PROVIDER_AUDIO_INVALID', 'Gemini returned an invalid WAV container.');
  }
  let format = null;
  let pcm = null;
  for (let offset = 12; offset + 8 <= wav.length;) {
    const kind = wav.subarray(offset, offset + 4).toString('ascii');
    const size = wav.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + size;
    if (end > wav.length) throw new PromoVoiceWorkerError('PROMO_VOICE_PROVIDER_AUDIO_INVALID', 'Gemini WAV chunks are truncated.');
    if (kind === 'fmt ' && size >= 16) format = {
      encoding: wav.readUInt16LE(start), channels: wav.readUInt16LE(start + 2),
      sampleRate: wav.readUInt32LE(start + 4), bits: wav.readUInt16LE(start + 14),
    };
    if (kind === 'data') pcm = wav.subarray(start, end);
    offset = end + (size % 2);
  }
  if (!format || format.encoding !== 1 || format.channels !== 1 || format.bits !== 16
    || format.sampleRate !== 24000 || !pcm || pcm.length < 2 || pcm.length % 2 !== 0) {
    throw new PromoVoiceWorkerError('PROMO_VOICE_PROVIDER_AUDIO_INVALID', 'Gemini WAV must be 24 kHz mono PCM16.');
  }
  return pcm;
}

export async function generateGeminiVoice({ apiKey, prompt, voice = 'Kore', model = 'gemini-3.1-flash-tts-preview', fetcher = fetch }) {
  if (typeof apiKey !== 'string' || !apiKey || typeof prompt !== 'string' || !prompt.trim()) {
    throw new PromoVoiceWorkerError('PROMO_VOICE_PROVIDER_CONFIG_INVALID', 'Gemini voice provider configuration is incomplete.');
  }
  const response = await fetcher('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey, 'Api-Revision': '2026-05-20' },
    body: JSON.stringify({
      model, input: prompt, response_format: { type: 'audio' },
      generation_config: { speech_config: [{ voice }] },
    }),
  });
  if (!response.ok) throw new PromoVoiceWorkerError('PROMO_VOICE_PROVIDER_FAILED', `Gemini TTS failed (${response.status}).`);
  const payload = await response.json();
  const encoded = payload?.interaction?.output_audio?.data || payload?.output_audio?.data;
  if (typeof encoded !== 'string' || !encoded) throw new PromoVoiceWorkerError('PROMO_VOICE_PROVIDER_AUDIO_MISSING', 'Gemini TTS returned no audio.');
  const raw = Buffer.from(encoded, 'base64');
  const pcm = raw.subarray(0, 4).toString('ascii') === 'RIFF' ? extractPcm16MonoWav(raw) : raw;
  const wav = pcm16MonoToWav(pcm);
  return Object.freeze({
    bytes: wav, duration_seconds: pcm.length / (24000 * 2), provider: 'google-gemini', model,
    voice_id: voice, provider_job_id: String(payload?.interaction?.id || payload?.id || crypto.randomUUID()),
    settings: Object.freeze({ sample_rate_hz: 24000, channels: 1, sample_width_bytes: 2, api_revision: '2026-05-20' }),
    estimated_cost_usd: 0,
  });
}

export async function generateGeminiVoiceByPhrase({
  apiKey, phraseRequests, voice = 'Kore', model = 'gemini-3.1-flash-tts-preview',
  gapMilliseconds = 120, fetcher = fetch, onPhrase = async () => {},
}) {
  if (!Array.isArray(phraseRequests) || !phraseRequests.length || phraseRequests.length > 80
    || phraseRequests.some(item => !item || typeof item.phrase_id !== 'string' || !item.phrase_id
      || typeof item.prompt !== 'string' || !item.prompt.trim())
    || !Number.isInteger(gapMilliseconds) || gapMilliseconds < 0 || gapMilliseconds > 1000
    || typeof onPhrase !== 'function') {
    throw new PromoVoiceWorkerError('PROMO_VOICE_PROVIDER_CONFIG_INVALID', 'Segmented voice requests are invalid.');
  }
  const gap = Buffer.alloc(Math.round(24000 * 2 * gapMilliseconds / 1000));
  const chunks = [];
  const phraseTimings = [];
  const providerJobIds = [];
  let sampleCursor = 0;
  for (const [index, item] of phraseRequests.entries()) {
    const artifact = await generateGeminiVoice({ apiKey, prompt: item.prompt, voice, model, fetcher });
    const pcm = extractPcm16MonoWav(artifact.bytes);
    const start = sampleCursor / 24000;
    chunks.push(pcm);
    sampleCursor += pcm.length / 2;
    const end = sampleCursor / 24000;
    phraseTimings.push({ phrase_id: item.phrase_id, start_seconds: start, end_seconds: end, confidence: 1 });
    providerJobIds.push(artifact.provider_job_id);
    if (index < phraseRequests.length - 1 && gap.length) {
      chunks.push(gap);
      sampleCursor += gap.length / 2;
    }
    await onPhrase({ index, completed: index + 1, total: phraseRequests.length });
  }
  const pcm = Buffer.concat(chunks);
  const providerJobIdsHash = createHash('sha256').update(providerJobIds.join('\n')).digest('hex');
  const providerBatchId = providerJobIdsHash.slice(0, 32);
  return Object.freeze({
    bytes: pcm16MonoToWav(pcm), duration_seconds: sampleCursor / 24000,
    provider: 'google-gemini', model, voice_id: voice, provider_job_id: `interaction-batch-${providerBatchId}`,
    settings: Object.freeze({
      sample_rate_hz: 24000, channels: 1, sample_width_bytes: 2, api_revision: '2026-05-20',
      segmented_generation: true, inter_phrase_gap_ms: gapMilliseconds,
      phrase_timings: Object.freeze(phraseTimings.map(item => Object.freeze(item))),
      provider_segment_count: providerJobIds.length, provider_job_ids_hash: providerJobIdsHash,
    }),
    estimated_cost_usd: 0,
  });
}
