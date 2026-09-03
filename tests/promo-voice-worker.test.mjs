import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';

import { executePromoVoiceClaim } from '../workers/promo-voice-worker/executor.mjs';
import { executePromoVoiceAlignmentClaim } from '../workers/promo-voice-worker/alignment-executor.mjs';
import { inspectPromoVoiceAlignmentClaim } from '../workers/promo-voice-worker/alignment-preflight.mjs';
import { generateGeminiVoice, generateGeminiVoiceByPhrase, pcm16MonoToWav } from '../workers/promo-voice-worker/gemini-tts.mjs';
import { buildPromoVoicePrompt, inspectPromoVoiceClaim } from '../workers/promo-voice-worker/preflight.mjs';
import { resolveGeminiVoice } from '../workers/promo-voice-worker/provider-config.mjs';
import { canonicalPromoJson, sha256Hex } from '../workers/promo-render-worker/preflight.mjs';

const ids = {
  job: '10000000-0000-4000-8000-000000000001', project: '20000000-0000-4000-8000-000000000001',
  revision: '30000000-0000-4000-8000-000000000001', lease: '40000000-0000-4000-8000-000000000001',
  take: '50000000-0000-4000-8000-000000000001', asset: '60000000-0000-4000-8000-000000000001',
};
const workerId = 'promo-voice-test';

function fixture() {
  const input = {
    schema_version: '1.0.0', voice_profile_id: 'lanewise-voice-v1', take_number: 1,
    direction: 'warm_authority', target_seconds: 10,
    delivery: { persona: 'Clear, practical road guidance.', qualities: ['reassuring', 'direct'], pace_wpm: 150, avoid: ['hard sell'] },
    script: { pronunciations: {}, phrases: [{ phrase_id: 'phrase-1', speech_text: 'Know the lane before you commit.', emphasis: 'light' }] },
    minimum_alignment_confidence: 0.8,
  };
  return {
    job: {
      id: ids.job, project_id: ids.project, revision_id: ids.revision, job_type: 'voice_generate', status: 'running',
      worker_id: workerId, lease_token: ids.lease, lease_expires_at: new Date(Date.now() + 300000).toISOString(),
      input, input_fingerprint: sha256Hex(Buffer.from(canonicalPromoJson(input), 'utf8')),
    },
    project: { id: ids.project, current_revision_id: ids.revision, branch_id: '70000000-0000-4000-8000-000000000001' },
  };
}

test('voice preflight is branch-neutral and builds an exact-script direction prompt', () => {
  const { job, project } = fixture();
  const plan = inspectPromoVoiceClaim({ job, worker_id: workerId, project });
  const prompt = buildPromoVoicePrompt(plan);
  assert.match(prompt, /Clear, practical road guidance/);
  assert.match(prompt, /Know the lane before you commit\./);
  assert.match(prompt, /Preserve its words and order exactly/i);
  assert.doesNotMatch(prompt, /Rekkrd|Stakkd|ATL Urban Farms/i);
});

test('approved voice profile IDs resolve to branch-specific server configuration', () => {
  const voiceMapJson = JSON.stringify({
    'lanewise-voice-v1': 'Charon',
    'atlurbanfarms-voice-v1': 'Kore',
  });
  assert.equal(resolveGeminiVoice({ voiceProfileId: 'lanewise-voice-v1', voiceMapJson }), 'Charon');
  assert.equal(resolveGeminiVoice({ voiceProfileId: 'atlurbanfarms-voice-v1', voiceMapJson }), 'Kore');
  assert.equal(resolveGeminiVoice({ voiceProfileId: 'rejoice-voice-v1', voiceMapJson, defaultVoice: 'Aoede' }), 'Aoede');
  assert.throws(() => resolveGeminiVoice({ voiceProfileId: 'lanewise-voice-v1', voiceMapJson: '{bad' }), /valid JSON/i);
});

test('Gemini adapter sends the pinned audio interaction contract and wraps PCM as WAV', async () => {
  const pcm = Buffer.alloc(48000, 1);
  let request;
  const artifact = await generateGeminiVoice({
    apiKey: 'test-key', prompt: 'Read only this.', voice: 'Kore',
    fetcher: async (url, options) => {
      request = { url, options };
      return { ok: true, json: async () => ({ interaction: { id: 'interaction-1', output_audio: { data: pcm.toString('base64') } } }) };
    },
  });
  assert.equal(request.url, 'https://generativelanguage.googleapis.com/v1beta/interactions');
  assert.equal(request.options.headers['Api-Revision'], '2026-05-20');
  assert.deepEqual(JSON.parse(request.options.body).response_format, { type: 'audio' });
  assert.equal(artifact.bytes.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(artifact.duration_seconds, 1);
  assert.equal(artifact.provider_job_id, 'interaction-1');
  assert.equal(pcm16MonoToWav(Buffer.alloc(2)).length, 46);
});

test('segmented Gemini generation records exact phrase boundaries in the produced WAV', async () => {
  let requestIndex = 0;
  const phraseHeartbeats = [];
  const artifact = await generateGeminiVoiceByPhrase({
    apiKey: 'test-key', voice: 'Charon', gapMilliseconds: 100,
    phraseRequests: [
      { phrase_id: 'phrase-1', prompt: 'First phrase only.' },
      { phrase_id: 'phrase-2', prompt: 'Second phrase only.' },
    ],
    fetcher: async () => {
      const pcm = Buffer.alloc([24000, 48000][requestIndex++], 1);
      return { ok: true, json: async () => ({ interaction: { id: `interaction-${requestIndex}`, output_audio: { data: pcm.toString('base64') } } }) };
    },
    onPhrase: async value => { phraseHeartbeats.push(value.completed); },
  });
  assert.equal(artifact.duration_seconds, 1.6);
  assert.deepEqual(artifact.settings.phrase_timings, [
    { phrase_id: 'phrase-1', start_seconds: 0, end_seconds: 0.5, confidence: 1 },
    { phrase_id: 'phrase-2', start_seconds: 0.6, end_seconds: 1.6, confidence: 1 },
  ]);
  assert.equal(artifact.settings.segmented_generation, true);
  assert.match(artifact.provider_job_id, /^interaction-batch-[a-f0-9]{32}$/);
  assert.deepEqual(phraseHeartbeats, [1, 2]);
});

test('voice executor uploads deterministic private WAV metadata and uses atomic completion', async () => {
  const { job, project } = fixture();
  const calls = { heartbeats: [], uploads: [], completions: [], failures: [], cleanups: [] };
  let uuidIndex = 0;
  const result = await executePromoVoiceClaim({
    job, worker_id: workerId, project,
    adapters: {
      randomUuid: () => [ids.take, ids.asset][uuidIndex++],
      heartbeat: async value => { calls.heartbeats.push(value); return true; },
      generate: async () => ({
        bytes: pcm16MonoToWav(Buffer.alloc(48000)), duration_seconds: 1, provider: 'google-gemini',
        model: 'gemini-3.1-flash-tts-preview', voice_id: 'Kore', provider_job_id: 'interaction-1',
        settings: { sample_rate_hz: 24000 }, estimated_cost_usd: 0,
      }),
      upload: async value => { calls.uploads.push(value); },
      complete: async value => { calls.completions.push(value); return true; },
      fail: async value => { calls.failures.push(value); return true; },
      cleanup: async value => { calls.cleanups.push(value); },
    },
  });
  assert.equal(result.completed, true);
  assert.equal(calls.uploads[0].path, `${ids.project}/${ids.asset}/voice.wav`);
  assert.equal(calls.uploads[0].metadata.kind, 'voice_master');
  assert.equal(calls.uploads[0].metadata.job_id, ids.job);
  assert.equal(calls.completions[0].take_id, ids.take);
  assert.equal(calls.completions[0].audio_asset_id, ids.asset);
  assert.equal(calls.failures.length, 0);
});

test('voice executor removes an orphan upload when atomic completion rejects it', async () => {
  const { job, project } = fixture();
  const cleanups = [];
  let uuidIndex = 0;
  await assert.rejects(() => executePromoVoiceClaim({
    job, worker_id: workerId, project,
    adapters: {
      randomUuid: () => [ids.take, ids.asset][uuidIndex++], heartbeat: async () => true,
      generate: async () => ({ bytes: pcm16MonoToWav(Buffer.alloc(48000)), duration_seconds: 1,
        provider: 'google-gemini', model: 'gemini-3.1-flash-tts-preview', voice_id: 'Kore', provider_job_id: 'interaction-1' }),
      upload: async () => {}, complete: async () => false, fail: async () => true,
      cleanup: async value => { cleanups.push(value); },
    },
  }), /Atomic voice completion rejected/i);
  assert.deepEqual(cleanups[0].paths, [`${ids.project}/${ids.asset}/voice.wav`]);
});

function alignmentFixture() {
  const base = fixture();
  const input = {
    schema_version: '1.0.0', voice_profile_id: 'lanewise-voice-v1', take_id: ids.take,
    audio_asset_id: ids.asset, timing_source: 'forced_alignment', minimum_alignment_confidence: 0.8,
    phrases: [
      { phrase_id: 'phrase-1', speech_text: 'Know the lane.' },
      { phrase_id: 'phrase-2', speech_text: 'Commit with confidence.' },
    ],
  };
  return {
    job: { ...base.job, job_type: 'voice_align', input, input_fingerprint: sha256Hex(Buffer.from(canonicalPromoJson(input), 'utf8')) },
    project: base.project,
    take: {
      id: ids.take, project_id: ids.project, revision_id: '30000000-0000-4000-8000-000000000099', audio_asset_id: ids.asset,
      status: 'aligning', duration_seconds: 2.1,
      settings: { segmented_generation: true, phrase_timings: [
        { phrase_id: 'phrase-1', start_seconds: 0, end_seconds: 0.9, confidence: 1 },
        { phrase_id: 'phrase-2', start_seconds: 1.02, end_seconds: 2.1, confidence: 1 },
      ] },
    },
    audioAsset: {
      id: ids.asset, project_id: ids.project, revision_id: '30000000-0000-4000-8000-000000000099', kind: 'voice_master', status: 'ready',
      mime_type: 'audio/wav', checksum_sha256: 'a'.repeat(64),
    },
    assetBound: true,
  };
}

test('alignment preflight accepts exact segment provenance and rejects script drift', () => {
  const value = alignmentFixture();
  const plan = inspectPromoVoiceAlignmentClaim({ ...value, worker_id: workerId });
  assert.deepEqual(plan.phrases.map(item => item.phrase_id), ['phrase-1', 'phrase-2']);
  assert.equal(plan.words.length, 0);
  value.job.input.phrases[1].phrase_id = 'changed';
  value.job.input_fingerprint = sha256Hex(Buffer.from(canonicalPromoJson(value.job.input), 'utf8'));
  assert.throws(() => inspectPromoVoiceAlignmentClaim({ ...value, worker_id: workerId }), /does not match the approved script/i);
  const unbound = alignmentFixture();
  unbound.assetBound = false;
  assert.throws(() => inspectPromoVoiceAlignmentClaim({ ...unbound, worker_id: workerId }), /current verified private voice master/i);
});

test('alignment executor uploads canonical private JSON and completes atomically', async () => {
  const value = alignmentFixture();
  const calls = { uploads: [], completions: [], failures: [], cleanups: [] };
  const result = await executePromoVoiceAlignmentClaim({
    ...value, worker_id: workerId,
    adapters: {
      randomUuid: () => '80000000-0000-4000-8000-000000000001', heartbeat: async () => true,
      upload: async item => { calls.uploads.push(item); },
      complete: async item => { calls.completions.push(item); return true; },
      fail: async item => { calls.failures.push(item); return true; },
      cleanup: async item => { calls.cleanups.push(item); },
    },
  });
  assert.equal(result.completed, true);
  assert.equal(calls.uploads[0].path, `${ids.project}/80000000-0000-4000-8000-000000000001/alignment.json`);
  assert.equal(calls.uploads[0].metadata.sha256, calls.uploads[0].metadata.payload_fingerprint_sha256);
  assert.equal(calls.completions[0].alignment.phrases.length, 2);
  assert.equal(calls.completions[0].checksum_sha256, calls.uploads[0].metadata.sha256);
  assert.equal(calls.failures.length, 0);
});

test('alignment executor removes its sidecar when atomic completion rejects it', async () => {
  const value = alignmentFixture();
  const cleanups = [];
  await assert.rejects(() => executePromoVoiceAlignmentClaim({
    ...value, worker_id: workerId,
    adapters: {
      randomUuid: () => '80000000-0000-4000-8000-000000000001', heartbeat: async () => true,
      upload: async () => {}, complete: async () => false, fail: async () => true,
      cleanup: async item => { cleanups.push(item); },
    },
  }), /Atomic voice alignment completion rejected/i);
  assert.deepEqual(cleanups[0].paths, [`${ids.project}/80000000-0000-4000-8000-000000000001/alignment.json`]);
});
