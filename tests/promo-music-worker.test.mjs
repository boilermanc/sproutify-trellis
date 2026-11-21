import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { resolveLyriaProfile } from '../workers/promo-music-worker/config.mjs';
import { normalizeMusicToWav } from '../workers/promo-music-worker/audio.mjs';
import { executePromoMusicClaim } from '../workers/promo-music-worker/executor.mjs';
import { generateLyriaMusic } from '../workers/promo-music-worker/lyria.mjs';
import { buildPromoMusicPrompt, inspectPromoMusicClaim } from '../workers/promo-music-worker/preflight.mjs';
import { createPromoMusicRuntime } from '../workers/promo-music-worker/runtime.mjs';
import { canonicalPromoJson, sha256Hex } from '../workers/promo-render-worker/preflight.mjs';

const id = suffix => `81000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const wav = () => {
  const value = Buffer.alloc(64);
  value.write('RIFF', 0, 'ascii'); value.write('WAVE', 8, 'ascii');
  return value;
};

function fixture() {
  const input = {
    schema_version: '1.0.0', music_profile_id: 'branch-sonic-v1', take_number: 1,
    direction: 'balanced', target_seconds: 10, instrumental: true,
    sonic_profile: { qualities: ['warm', 'restrained'], avoid: ['vocals', 'hard sell'] },
    brief: {
      mood: 'assured', tempo_min_bpm: 88, tempo_max_bpm: 98,
      instrumentation: ['soft synth bass', 'restrained percussion'],
      energy_arc: [{ phrase_id: 'phrase-1', direction: 'open gently' }, { phrase_id: 'phrase-2', direction: 'lift once' }],
      accent_phrase_ids: ['phrase-2'], ending: 'clean resolved tail', avoid: ['artist imitation'],
    },
  };
  const project = { id: id(1), branch_id: id(2), current_revision_id: id(3) };
  const worker_id = 'promo-music-test';
  const job = {
    id: id(4), project_id: project.id, revision_id: project.current_revision_id, job_type: 'music_generate',
    status: 'running', worker_id, lease_token: id(5), lease_expires_at: '2099-01-01T00:00:00.000Z',
    input, input_fingerprint: sha256Hex(Buffer.from(canonicalPromoJson(input), 'utf8')),
  };
  return { job, project, worker_id };
}

const artifact = () => ({
  bytes: wav(), duration_seconds: 10, instrumental_requested: true,
  provider: 'google-lyria', model: 'lyria-3-clip-preview', provider_job_id: 'interaction-1', estimated_cost_usd: 0.04,
});

test('music preflight is branch-neutral, fingerprinted, and bans imitation', () => {
  const context = fixture();
  const plan = inspectPromoMusicClaim(context);
  const prompt = buildPromoMusicPrompt(plan);
  assert.match(prompt, /pure instrumental/i);
  assert.match(prompt, /No singing, spoken words/i);
  assert.doesNotMatch(prompt, /Rekkrd|LaneWise|ATL Urban Farms/i);
  context.job.input.brief.mood = 'in the style of a named artist';
  context.job.input_fingerprint = sha256Hex(Buffer.from(canonicalPromoJson(context.job.input), 'utf8'));
  assert.throws(() => inspectPromoMusicClaim(context), error => error.code === 'PROMO_MUSIC_IMITATION_BLOCKED');
});

test('Lyria provider adapter uses the server-selected model and audio response contract', async () => {
  let request;
  const result = await generateLyriaMusic({
    apiKey: 'server-key', model: 'lyria-3-clip-preview', prompt: 'Pure instrumental.',
    fetcher: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ interaction: { id: 'interaction-1', output_audio: { data: wav().toString('base64') } } }) };
    },
  });
  assert.equal(request.url, 'https://generativelanguage.googleapis.com/v1beta/interactions');
  assert.deepEqual(JSON.parse(request.options.body).response_format, { type: 'audio' });
  assert.equal(JSON.parse(request.options.body).model, 'lyria-3-clip-preview');
  assert.equal(result.provider_job_id, 'interaction-1');
  assert.equal(result.bytes.subarray(0, 4).toString('ascii'), 'RIFF');
});

test('FFmpeg normalization produces a measured stereo WAV at the requested duration', async () => {
  const source = await readFile(new URL('../work/promo-studio/ps-002/assets/lyria-stakkd-bed.mp3', import.meta.url));
  const result = await normalizeMusicToWav({ bytes: source, targetSeconds: 1 });
  assert.equal(result.bytes.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(result.bytes.subarray(8, 12).toString('ascii'), 'WAVE');
  assert.ok(result.duration_seconds >= 1 && result.duration_seconds < 1.1);
});

test('music executor uploads an immutable WAV and completes only through the music RPC adapter', async () => {
  const context = fixture(); const calls = { uploads: [], completions: [], failures: [] };
  const ids = [id(6), id(7)];
  const result = await executePromoMusicClaim({ ...context, adapters: {
    heartbeat: async () => true, randomUuid: () => ids.shift(), generate: async () => artifact(),
    upload: async value => { calls.uploads.push(value); }, complete: async value => { calls.completions.push(value); return true; },
    fail: async value => { calls.failures.push(value); return true; }, cleanup: async () => assert.fail('no cleanup expected'),
  } });
  assert.equal(result.completed, true);
  assert.equal(calls.uploads[0].path, `${context.project.id}/${id(7)}/music.wav`);
  assert.equal(calls.uploads[0].upsert, false);
  assert.equal(calls.uploads[0].metadata.kind, 'music_master');
  assert.deepEqual(calls.completions[0].cue_markers.map(item => item.name), ['phrase-1', 'phrase-2']);
  assert.equal(calls.failures.length, 0);
});

test('music executor cleans up an orphan upload when atomic completion rejects it', async () => {
  const context = fixture(); const cleanups = []; const ids = [id(6), id(7)];
  await assert.rejects(() => executePromoMusicClaim({ ...context, adapters: {
    heartbeat: async () => true, randomUuid: () => ids.shift(), generate: async () => artifact(), upload: async () => {},
    complete: async () => false, fail: async () => true, cleanup: async value => { cleanups.push(value); },
  } }), error => error.code === 'PROMO_MUSIC_COMPLETION_REJECTED');
  assert.deepEqual(cleanups[0].paths, [`${context.project.id}/${id(7)}/music.wav`]);
});

test('music runtime is default-off and resolves profile configuration only on an enabled claim', async () => {
  let clients = 0;
  const disabled = createPromoMusicRuntime({ environment: {}, clientFactory: () => { clients += 1; } });
  assert.deepEqual(await disabled.processOnce(), { claimed: false, disabled: true });
  assert.equal(clients, 0);
  assert.deepEqual(resolveLyriaProfile({ profileId: 'branch-sonic-v1', profileMapJson: JSON.stringify({
    'branch-sonic-v1': { model: 'lyria-3-clip-preview', estimated_cost_usd: 0.04 },
  }) }), { model: 'lyria-3-clip-preview', estimated_cost_usd: 0.04 });
});

test('enabled music runtime claims only music jobs and atomically completes them', async () => {
  const context = fixture(); const rpcCalls = []; const uploads = [];
  let claimed = false; const ids = [id(6), id(7)];
  const query = rows => ({ select() { return this; }, eq(key, value) { this.rows = (this.rows || rows).filter(row => row[key] === value); return this; }, maybeSingle() { return Promise.resolve({ data: (this.rows || rows)[0], error: null }); } });
  const db = {
    rpc: async (name, parameters) => {
      rpcCalls.push({ name, parameters });
      if (name === 'claim_promo_job') { if (claimed) return { data: [], error: null }; claimed = true; return { data: [context.job], error: null }; }
      return { data: true, error: null };
    },
    from: () => query([context.project]),
    storage: { from: bucket => ({ upload: async (path, bytes, options) => { uploads.push({ bucket, path, bytes, options }); return { error: null }; }, remove: async () => ({ error: null }) }) },
  };
  const runtime = createPromoMusicRuntime({
    environment: {
      SUPABASE_URL: 'https://hub.example', SUPABASE_SERVICE_ROLE_KEY: 'server-only', GEMINI_API_KEY: 'server-provider-key',
      PROMO_MUSIC_CLAIMS_ENABLED: 'true', PROMO_MUSIC_WORKER_ID: context.worker_id,
      PROMO_LYRIA_PROFILE_MAP_JSON: JSON.stringify({ 'branch-sonic-v1': { model: 'lyria-3-clip-preview', estimated_cost_usd: 0.04 } }),
    }, clientFactory: () => db, uuid: () => ids.shift(),
    generateProvider: async () => ({ bytes: Buffer.from('provider'), provider: 'google-lyria', model: 'lyria-3-clip-preview', provider_job_id: 'interaction-1' }),
    normalize: async () => ({ bytes: wav(), duration_seconds: 10 }),
  });
  const result = await runtime.processOnce();
  assert.equal(result.completed, true);
  assert.deepEqual(rpcCalls[0], { name: 'claim_promo_job', parameters: {
    p_worker_id: context.worker_id, p_lease_seconds: 600, p_job_types: ['music_generate'],
  } });
  assert.equal(rpcCalls.some(call => call.name === 'complete_promo_music_generation_job'), true);
  assert.equal(rpcCalls.some(call => call.name === 'complete_promo_job'), false);
  assert.equal(uploads[0].options.upsert, false);
});
