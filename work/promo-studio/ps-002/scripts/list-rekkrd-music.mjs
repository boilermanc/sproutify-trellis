import fs from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(import.meta.dirname, '../../../..');
const envText = fs.readFileSync(path.join(repoRoot, '.env.local'), 'utf8');
const env = Object.fromEntries(envText.split(/\r?\n/).flatMap(line => {
  const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  return match ? [[match[1], match[2].trim()]] : [];
}));
const baseUrl = env.VITE_SUPABASE_URL?.replace(/\/$/, '');
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!baseUrl || !serviceKey) throw new Error('Hub Supabase service configuration is unavailable.');

const query = new URLSearchParams({
  branch: 'eq.rekkrd',
  status: 'eq.completed',
  audio_url: 'not.is.null',
  select: 'id,title,prompt,genre,mood,vocal_style,duration_seconds,provider,model,audio_url,storage_bucket,storage_path,completed_at',
  order: 'completed_at.desc',
  limit: '10',
});
const response = await fetch(`${baseUrl}/rest/v1/music_generations?${query}`, {
  headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
});
if (!response.ok) throw new Error(`Music candidate query failed (${response.status}).`);
console.log(JSON.stringify(await response.json(), null, 2));
