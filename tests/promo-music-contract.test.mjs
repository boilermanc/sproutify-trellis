import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { applyPromoMusicAdoption, buildPromoMusicGenerationJobInput } from '../supabase/functions/_shared/promo-music.ts';
import { createDraftPromoManifest } from '../supabase/functions/_shared/promo-studio.ts';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

function fixture() {
  const manifest = createDraftPromoManifest({
    projectId: '10000000-0000-0000-0000-000000000001', revisionId: '20000000-0000-0000-0000-000000000001',
    ownerId: '30000000-0000-0000-0000-000000000001', organizationId: '00000000-0000-0000-0000-000000000001',
    branch: { id: '40000000-0000-0000-0000-000000000001', slug: 'rekkrd', name: 'Rekkrd' },
    title: 'Music contract', prompt: 'Create an instrumental bed.', targetSeconds: 10, formats: ['9:16'], now: '2026-08-25T12:00:00.000Z',
  });
  manifest.script.status = 'approved';
  manifest.script.phrases = [
    { id: 'phrase-1', display_text: 'See the signal chain.', speech_text: 'See the signal chain.', evidence_refs: [], emphasis: 'light' },
    { id: 'phrase-2', display_text: 'Stakkd puts your system in order.', speech_text: 'Stacked puts your system in order.', evidence_refs: [], emphasis: 'strong' },
  ];
  manifest.brand.sonic_profile = { qualities: ['warm analog', 'restrained'], avoid: ['vocals', 'hard sell'] };
  manifest.music.profile_id = 'rekkrd-sonic-identity';
  manifest.music.brief = JSON.stringify({
    instrumental: true, mood: 'warm and assured', tempo_min_bpm: 88, tempo_max_bpm: 98,
    instrumentation: ['soft synth bass', 'restrained percussion'],
    energy_arc: [{ phrase_id: 'phrase-1', direction: 'open gently' }, { phrase_id: 'phrase-2', direction: 'lift once' }],
    accent_phrase_ids: ['phrase-2'], ending: 'clean resolved tail', avoid: ['vocals', 'artist imitation'],
  });
  return manifest;
}

test('music generation is structured, instrumental, and provider-neutral', () => {
  const manifest = fixture();
  const brief = JSON.parse(manifest.music.brief);
  brief.energy_arc[0].provider = 'browser-provider';
  brief.energy_arc[0].api_key = 'browser-secret';
  manifest.music.brief = JSON.stringify(brief);
  const input = buildPromoMusicGenerationJobInput(manifest, 'balanced');
  assert.equal(input.take_number, 1);
  assert.equal(input.target_seconds, 10);
  assert.equal(input.instrumental, true);
  assert.equal(input.brief.energy_arc[1].phrase_id, 'phrase-2');
  assert.deepEqual(input.brief.energy_arc[0], { phrase_id: 'phrase-1', direction: 'open gently' });
  assert.doesNotMatch(JSON.stringify(input), /provider|model|api.?key|token|password|audio_url|storage/i);
});

test('music generation fails closed on approval, profile, and brief errors', () => {
  const unapproved = fixture();
  unapproved.script.status = 'review';
  assert.throws(() => buildPromoMusicGenerationJobInput(unapproved, 'balanced'), /Approve the script/i);

  const missingProfile = fixture();
  missingProfile.music.profile_id = null;
  assert.throws(() => buildPromoMusicGenerationJobInput(missingProfile, 'balanced'), /sonic profile/i);

  const vocals = fixture();
  vocals.music.brief = JSON.stringify({ ...JSON.parse(vocals.music.brief), instrumental: false });
  assert.throws(() => buildPromoMusicGenerationJobInput(vocals, 'balanced'), /incomplete or outside/i);

  const unknownPhrase = fixture();
  unknownPhrase.music.brief = JSON.stringify({ ...JSON.parse(unknownPhrase.music.brief), accent_phrase_ids: ['invented'] });
  assert.throws(() => buildPromoMusicGenerationJobInput(unknownPhrase, 'balanced'), /approved script phrases/i);

  const subSecond = fixture();
  subSecond.promo.target_seconds = 0.5;
  assert.throws(() => buildPromoMusicGenerationJobInput(subSecond, 'balanced'), /between 1 and 600/i);
});

test('music generation honors server-side take reservations and direction limits', () => {
  const input = buildPromoMusicGenerationJobInput(fixture(), 'energetic', [{ take_number: 1, direction: 'balanced' }]);
  assert.equal(input.take_number, 2);
  assert.throws(
    () => buildPromoMusicGenerationJobInput(fixture(), 'balanced', [{ take_number: 1, direction: 'balanced' }]),
    /already has an active take/i,
  );
});

test('music jobs are server-resolved while the dedicated worker remains independently gated', async () => {
  const [edge, worker, service, readme, runtime, migration, constants, legacy, sessionWorker] = await Promise.all([
    read('../supabase/functions/promo-studio/index.ts'), read('../supabase/functions/promo-worker/index.ts'),
    read('../services/promoStudioService.ts'), read('../workers/promo-music-worker/README.md'),
    read('../workers/promo-music-worker/runtime.mjs'),
    read('../supabase/migrations/20260825203500_reserve_promo_music_take_numbers.sql'), read('../constants.ts'),
    read('../services/musicService.ts'), read('../supabase/functions/generate-session-track/index.ts'),
  ]);
  assert.match(edge, /buildPromoMusicGenerationJobInput/);
  assert.match(edge, /job_type", "music_generate"/);
  assert.match(worker, /p_job_types: \["noop"\]/);
  assert.doesNotMatch(worker, /p_job_types: \["music_generate"/);
  assert.match(service, /job_type: 'music_generate', direction/);
  assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_music_generation_take_reservation/);
  assert.match(constants, /PROMO_MUSIC_TAKE_RESERVATION_SQL_SCHEMA/);
  assert.match(legacy, /fetch\(MUSIC_GEN_WEBHOOK/);
  assert.match(sessionWorker, /const BUCKET = "music-sessions"/);
  assert.match(readme, /PROMO_MUSIC_CLAIMS_ENABLED/);
  assert.match(runtime, /p_job_types: \['music_generate'\]/);
  assert.match(runtime, /complete_promo_music_generation_job/);
  assert.doesNotMatch(runtime, /complete_promo_job/);
});

test('completed music is selected only through explicit immutable adoption', () => {
  const manifest = applyPromoMusicAdoption(fixture(), {
    id: '50000000-0000-0000-0000-000000000001', take_number: 1, direction: 'balanced',
    provider: 'google-lyria', model: 'lyria-3', provider_job_id: 'provider-music-1',
    audio_asset_id: '60000000-0000-0000-0000-000000000001', duration_seconds: 10,
    cue_markers: [{ name: 'lift', at_seconds: 4, confidence: 0.9 }], selected: false,
    status: 'ready', estimated_cost_usd: 0.04,
  }, {
    id: '60000000-0000-0000-0000-000000000001', kind: 'music_master', role: 'music-take-1',
    status: 'ready', storage_bucket: 'promo-assets', storage_path: 'project/music.wav', mime_type: 'audio/wav',
    checksum_sha256: 'c'.repeat(64), duration_seconds: 10,
    provenance: { job_id: '70000000-0000-0000-0000-000000000001' },
  }, '70000000-0000-0000-0000-000000000001');
  assert.equal(manifest.music.selected_take_id, '50000000-0000-0000-0000-000000000001');
  assert.equal(manifest.music.takes[0].selected, true);
  assert.equal(manifest.assets[0].provenance.approved, true);
  assert.equal(manifest.run_lineage.estimated_cost_usd, 0.04);
});

test('music completion is atomic and service-role-only', async () => {
  const [migration, edge, service] = await Promise.all([
    read('../supabase/migrations/20260903160245_complete_promo_audio_jobs.sql'),
    read('../supabase/functions/promo-studio/index.ts'), read('../services/promoStudioService.ts'),
  ]);
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.complete_promo_music_generation_job/);
  assert.match(migration, /INSERT INTO public\.promo_music_takes/);
  assert.match(migration, /UPDATE public\.promo_job_attempts[\s\S]*status = 'succeeded'/);
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.complete_promo_music_generation_job[\s\S]*TO service_role/);
  assert.match(edge, /applyPromoMusicAdoption/);
  assert.match(service, /adopt_music/);
});
