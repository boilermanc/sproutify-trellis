import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  applyPromoVoiceAlignmentAdoption, applyPromoVoiceGenerationAdoption,
  buildPromoVoiceAlignmentJobInput, buildPromoVoiceGenerationJobInput,
} from '../supabase/functions/_shared/promo-voice.ts';
import { createDraftPromoManifest } from '../supabase/functions/_shared/promo-studio.ts';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

function fixture() {
  const manifest = createDraftPromoManifest({
    projectId: '10000000-0000-0000-0000-000000000001', revisionId: '20000000-0000-0000-0000-000000000001',
    ownerId: '30000000-0000-0000-0000-000000000001', organizationId: '00000000-0000-0000-0000-000000000001',
    branch: { id: '40000000-0000-0000-0000-000000000001', slug: 'rekkrd', name: 'Rekkrd' },
    title: 'Voice contract', prompt: 'Create approved voice.', targetSeconds: 10, formats: ['9:16'], now: '2026-08-25T12:00:00.000Z',
  });
  manifest.script.status = 'approved';
  manifest.script.approved_text = 'See the signal chain. Stakkd puts your system in order.';
  manifest.script.pronunciations = { Stakkd: 'Stacked' };
  manifest.script.phrases = [
    { id: 'phrase-1', display_text: 'See the signal chain.', speech_text: 'See the sig-nuhl chain.', evidence_refs: [], emphasis: 'light' },
    { id: 'phrase-2', display_text: 'Stakkd puts your system in order.', speech_text: 'Stacked puts your system in order.', evidence_refs: [], emphasis: 'strong' },
  ];
  manifest.brand.voice_profile = {
    name: 'Rekkrd Voice', persona: 'Collector and enthusiast, not announcer',
    qualities: ['warm', 'restrained'], pace_wpm: 145, avoid: ['hard sell'],
  };
  manifest.voice.profile_id = 'rekkrd-brand-voice';
  return manifest;
}

test('voice generation uses approved speech text and stays provider-neutral', () => {
  const input = buildPromoVoiceGenerationJobInput(fixture(), 'warm_authority');
  assert.equal(input.take_number, 1);
  assert.equal(input.voice_profile_id, 'rekkrd-brand-voice');
  assert.deepEqual(input.script.phrases.map(phrase => phrase.speech_text), [
    'See the sig-nuhl chain.', 'Stacked puts your system in order.',
  ]);
  assert.doesNotMatch(JSON.stringify(input), /display_text|Stakkd puts|provider|model|voice_id|api.?key|token|password/i);
});

test('voice generation fails closed until review and configuration are complete', () => {
  const unapproved = fixture();
  unapproved.script.status = 'review';
  assert.throws(() => buildPromoVoiceGenerationJobInput(unapproved, 'natural'), /Approve the script/i);

  const missingProfile = fixture();
  missingProfile.voice.profile_id = null;
  assert.throws(() => buildPromoVoiceGenerationJobInput(missingProfile, 'natural'), /configured voice profile/i);

  const invalidDirection = fixture();
  assert.throws(() => buildPromoVoiceGenerationJobInput(invalidDirection, 'dramatic'), /supported voice direction/i);

  const full = fixture();
  full.voice.takes = [1, 2, 3].map(take_number => ({ take_number, direction: 'natural', status: 'failed' }));
  assert.throws(() => buildPromoVoiceGenerationJobInput(full, 'warm_authority'), /at most three/i);

  const invalidConfidence = fixture();
  invalidConfidence.voice.minimum_alignment_confidence = 2;
  assert.throws(() => buildPromoVoiceGenerationJobInput(invalidConfidence, 'natural'), /between zero and one/i);
});

test('voice generation honors server-side take reservations', () => {
  const input = buildPromoVoiceGenerationJobInput(fixture(), 'warm_authority', [
    { take_number: 1, direction: 'natural' },
  ]);
  assert.equal(input.take_number, 2);
  assert.throws(
    () => buildPromoVoiceGenerationJobInput(fixture(), 'natural', [{ take_number: 1, direction: 'natural' }]),
    /already has an active take/i,
  );
});

test('alignment is bound to an active manifest audio take and approved phrases', () => {
  const manifest = fixture();
  manifest.voice.takes = [{
    id: 'voice-take-1', take_number: 1, direction: 'natural', status: 'aligning',
    audio_asset_id: 'asset-voice-1', alignment_asset_id: null, words: [], phrases: [],
  }];
  const input = buildPromoVoiceAlignmentJobInput(manifest, 'voice-take-1');
  assert.deepEqual(input.phrases, [
    { phrase_id: 'phrase-1', speech_text: 'See the sig-nuhl chain.' },
    { phrase_id: 'phrase-2', speech_text: 'Stacked puts your system in order.' },
  ]);
  assert.equal(input.audio_asset_id, 'asset-voice-1');

  assert.throws(() => buildPromoVoiceAlignmentJobInput(manifest, 'invented'), /does not belong/i);
  manifest.voice.takes[0].audio_asset_id = null;
  assert.throws(() => buildPromoVoiceAlignmentJobInput(manifest, 'voice-take-1'), /generated audio asset/i);

  const invalidConfidence = fixture();
  invalidConfidence.voice.minimum_alignment_confidence = -0.1;
  assert.throws(() => buildPromoVoiceAlignmentJobInput(invalidConfidence, 'voice-take-1'), /between zero and one/i);
});

test('voice jobs are resolved server-side and the dedicated worker remains explicitly gated', async () => {
  const [edge, worker, voiceWorker, service, readme, migration, constants] = await Promise.all([
    read('../supabase/functions/promo-studio/index.ts'), read('../supabase/functions/promo-worker/index.ts'),
    read('../workers/promo-voice-worker/run.mjs'),
    read('../services/promoStudioService.ts'), read('../workers/promo-voice-worker/README.md'),
    read('../supabase/migrations/20260825201900_reserve_promo_voice_take_numbers.sql'), read('../constants.ts'),
  ]);
  assert.match(edge, /\["capture", "voice_generate", "voice_align", "music_generate", "preview_render", "final_render"\]\.includes\(jobType\)/);
  assert.match(edge, /buildPromoVoiceGenerationJobInput\(revision\.manifest, body\.direction, \(voiceReservations \|\| \[\]\)\.map/);
  assert.match(edge, /buildPromoVoiceAlignmentJobInput\(revision\.manifest, body\.take_id\)/);
  assert.match(worker, /p_job_types: \["noop"\]/);
  assert.doesNotMatch(worker, /p_job_types: \["voice_generate"/);
  assert.match(voiceWorker, /PROMO_VOICE_CLAIMS_ENABLED/);
  assert.match(voiceWorker, /p_job_types: \['voice_generate', 'voice_align'\]/);
  assert.match(voiceWorker, /complete_promo_voice_generation_job/);
  assert.match(voiceWorker, /complete_promo_voice_alignment_job/);
  assert.match(service, /job_type: 'voice_generate', direction/);
  assert.match(service, /job_type: 'voice_align', take_id: takeId/);
  assert.match(readme, /Claims are disabled by default/i);
  assert.match(readme, /PROMO_GEMINI_VOICE_MAP_JSON/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_voice_generation_take_reservation/);
  assert.match(migration, /status IN \('queued','running','succeeded'\)/);
  assert.match(constants, /PROMO_VOICE_TAKE_RESERVATION_SQL_SCHEMA/);
});

test('completed voice and alignment results enter the manifest only through explicit adoption', () => {
  const generated = applyPromoVoiceGenerationAdoption(fixture(), {
    id: '50000000-0000-0000-0000-000000000001', take_number: 1, direction: 'warm_authority',
    provider: 'google', model: 'gemini-tts', voice_id: 'rekkrd-warm', settings: {}, provider_job_id: 'provider-voice-1',
    audio_asset_id: '60000000-0000-0000-0000-000000000001', alignment_asset_id: null,
    duration_seconds: 9.5, selected: false, status: 'aligning', estimated_cost_usd: 0.02,
  }, {
    id: '60000000-0000-0000-0000-000000000001', kind: 'voice_master', role: 'voice-take-1',
    status: 'ready', storage_bucket: 'promo-assets', storage_path: 'project/voice.wav', mime_type: 'audio/wav',
    checksum_sha256: 'a'.repeat(64), duration_seconds: 9.5, width: null, height: null,
    provenance: { job_id: '70000000-0000-0000-0000-000000000001' },
  }, '70000000-0000-0000-0000-000000000001');
  assert.equal(generated.voice.takes[0].status, 'aligning');
  assert.equal(generated.voice.selected_take_id, null);
  assert.equal(generated.assets[0].kind, 'voice_master');

  const aligned = applyPromoVoiceAlignmentAdoption(generated, {
    id: generated.voice.takes[0].id, audio_asset_id: generated.voice.takes[0].audio_asset_id,
    alignment_asset_id: '80000000-0000-0000-0000-000000000001', status: 'ready',
  }, {
    id: '80000000-0000-0000-0000-000000000001', kind: 'voice_alignment', role: 'voice-take-1',
    status: 'ready', storage_bucket: 'promo-assets', storage_path: 'project/alignment.json', mime_type: 'application/json',
    checksum_sha256: 'b'.repeat(64), duration_seconds: null, width: null, height: null,
    provenance: { job_id: '90000000-0000-0000-0000-000000000001' },
  }, {
    take_id: generated.voice.takes[0].id, audio_asset_id: generated.voice.takes[0].audio_asset_id, words: [],
    phrases: [
      { phrase_id: 'phrase-1', start_seconds: 0, end_seconds: 4, confidence: 0.96 },
      { phrase_id: 'phrase-2', start_seconds: 4, end_seconds: 9.5, confidence: 0.94 },
    ],
  }, '90000000-0000-0000-0000-000000000001');
  assert.equal(aligned.voice.selected_take_id, generated.voice.takes[0].id);
  assert.equal(aligned.voice.takes[0].selected, true);
  assert.deepEqual(aligned.captions.cues.map(cue => cue.text), ['See the signal chain.', 'Stakkd puts your system in order.']);
});

test('voice completion RPCs are lease-bound and service-role-only', async () => {
  const [migration, constants, edge, service] = await Promise.all([
    read('../supabase/migrations/20260903160245_complete_promo_audio_jobs.sql'), read('../constants.ts'),
    read('../supabase/functions/promo-studio/index.ts'), read('../services/promoStudioService.ts'),
  ]);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.complete_promo_voice_generation_job/);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.complete_promo_voice_alignment_job/);
  assert.match(migration, /j\.worker_id = trim\(p_worker_id\)[\s\S]*j\.lease_token = p_lease_token/);
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.complete_promo_voice_generation_job[\s\S]*FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.complete_promo_voice_alignment_job[\s\S]*TO service_role/);
  assert.match(constants, /PROMO_AUDIO_COMPLETION_SQL_SCHEMA/);
  assert.match(edge, /applyPromoVoiceGenerationAdoption/);
  assert.match(edge, /applyPromoVoiceAlignmentAdoption/);
  assert.match(service, /adopt_voice_generation/);
  assert.match(service, /adopt_voice_alignment/);
});
