import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractInteractionAudio, loadGeminiKey, requestGoogleAudio } from './google-audio-client.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const proofRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(proofRoot, '../../..');
const output = path.join(proofRoot, 'assets', 'lyria-stakkd-bed.mp3');
const model = 'lyria-3-clip-preview';
const prompt = 'Instrumental only. Warm analog hi-fi pulse, restrained percussion, soft synth bass, 94 BPM, no vocals, no artist references, designed as unobtrusive product-demo underscore.';

const result = await requestGoogleAudio({
  endpoint: 'https://generativelanguage.googleapis.com/v1beta/interactions',
  key: await loadGeminiKey(repoRoot),
  body: { model, input: prompt, response_format: { type: 'audio' } },
});
const audio = extractInteractionAudio(result);
fs.writeFileSync(output, Buffer.from(audio.data, 'base64'));
console.log(JSON.stringify({ output, provider: 'google-lyria', model, interaction_id: result.id || null, mime_type: audio.mimeType, prompt }, null, 2));
