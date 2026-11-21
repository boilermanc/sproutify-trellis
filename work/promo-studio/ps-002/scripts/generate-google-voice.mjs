import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGeminiKey, requestGoogleAudio, writePcmWav } from './google-audio-client.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const proofRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(proofRoot, '../../..');
const manifest = JSON.parse(fs.readFileSync(path.join(proofRoot, 'manifest', 'proof-manifest.json'), 'utf8'));
const output = path.join(proofRoot, 'assets', 'gemini-voice-kore.wav');
const model = 'gemini-2.5-flash-preview-tts';
const voice = 'Kore';
const spokenText = manifest.script.speech_text || manifest.script.text;
const prompt = `Read exactly this script once. Warm, assured product-demo voice. Natural pace, crisp diction, no added words: ${spokenText}`;

const result = await requestGoogleAudio({
  endpoint: `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
  key: await loadGeminiKey(repoRoot),
  body: {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
    },
  },
});
const audio = result?.candidates?.[0]?.content?.parts?.find(part => part?.inlineData?.data)?.inlineData;
if (!audio?.data) throw new Error('Gemini TTS response did not contain inline PCM audio.');
writePcmWav(output, audio.data);
console.log(JSON.stringify({ output, provider: 'google-gemini-tts', model, voice, mime_type: audio.mimeType || 'audio/L16' }, null, 2));
