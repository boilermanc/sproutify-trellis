import fs from 'node:fs';
import path from 'node:path';

const readLocalEnv = repoRoot => {
  const envPath = path.join(repoRoot, '.env.local');
  const env = fs.readFileSync(envPath, 'utf8');
  return Object.fromEntries(env.split(/\r?\n/).flatMap(line => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    return match ? [[match[1], match[2].trim().replace(/^['"]|['"]$/g, '')]] : [];
  }));
};

export async function loadGeminiKey(repoRoot) {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const env = readLocalEnv(repoRoot);
  if (env.VITE_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    const response = await fetch(`${env.VITE_SUPABASE_URL}/rest/v1/tenant_secrets?select=gemini_api_key&organization_id=eq.00000000-0000-0000-0000-000000000001&limit=1`, {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    });
    if (response.ok) {
      const rows = await response.json();
      if (rows?.[0]?.gemini_api_key) return rows[0].gemini_api_key;
    }
  }
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is unavailable.');
  return env.GEMINI_API_KEY;
}

export async function requestGoogleAudio({ endpoint, key, body }) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Google audio ${response.status}: ${JSON.stringify(result).slice(0, 700)}`);
  return result;
}

export function extractInteractionAudio(result) {
  if (result?.output_audio?.data) return { data: result.output_audio.data, mimeType: result.output_audio.mime_type || 'audio/mpeg' };
  for (const step of result?.steps || []) {
    const content = step?.model_output?.content || step?.content || [];
    const audio = content.find?.(item => item?.type === 'audio' && item?.data);
    if (audio) return { data: audio.data, mimeType: audio.mime_type || 'audio/mpeg' };
  }
  throw new Error(`Google audio response did not contain audio. Keys: ${Object.keys(result).join(', ')}`);
}

export function writePcmWav(file, base64, { sampleRate = 24000, channels = 1, bitsPerSample = 16 } = {}) {
  const pcm = Buffer.from(base64, 'base64');
  const header = Buffer.alloc(44);
  const byteRate = sampleRate * channels * bitsPerSample / 8;
  const blockAlign = channels * bitsPerSample / 8;
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(file, Buffer.concat([header, pcm]));
}
