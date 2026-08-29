import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let planning;

before(async () => {
  server = await createServer({ appType: 'custom', configFile: false, logLevel: 'silent', root: process.cwd(), server: { middlewareMode: true } });
  planning = await server.ssrLoadModule('/services/studioAlbumPlanning.ts');
});

after(async () => server?.close());

test('plans a 60-minute album within the generator-safe track range', () => {
  const plan = planning.planStudioRuntime(60 * 60, 150);
  assert.equal(plan.track_count, 24);
  assert.equal(plan.track_durations.reduce((sum, value) => sum + value, 0), 3600);
  assert.ok(plan.track_durations.every(value => value >= 30 && value <= 165));
});

test('uses at least the number of tracks needed for the 165-second ceiling', () => {
  const plan = planning.planStudioRuntime(60 * 60, 165, 1);
  assert.equal(plan.track_count, 22);
  assert.equal(plan.track_durations.reduce((sum, value) => sum + value, 0), 3600);
});

test('rejects runtimes above the supported 40-track production limit', () => {
  assert.throws(() => planning.planStudioRuntime(111 * 60, 165), /production limit/);
});

test('rejects an impossible distribution instead of silently overshooting', () => {
  assert.throws(() => planning.distributeStudioRuntime(60, 10), /cannot cover/);
});

test('includes the requested creative starting points', () => {
  assert.deepEqual(planning.STUDIO_STYLE_PRESETS.slice(0, 3).map(preset => preset.id), ['groovy_organ', 'jazz_spy', 'saturday_morning_lounge']);
});

test('includes French Riviera ’60s as a distinct cinematic lounge preset', () => {
  const preset = planning.getStudioStylePreset('french_riviera_60s');
  assert.equal(preset.name, 'French Riviera ’60s');
  assert.equal(preset.genre, '1960s French Riviera Cinematic Lounge');
  assert.equal(preset.bpm_range, '105–120 BPM');
  assert.equal(preset.vocal_direction, 'instrumental');
  assert.equal(preset.paired_art_style_id, 'photoreal_60s');
  assert.match(preset.prompt_guidance, /light bossa nova/);
  assert.match(preset.prompt_guidance, /lightly syncopated Latin swing/);
  assert.match(preset.prompt_guidance, /No vocals, modern synthesizers/);
  assert.ok(preset.instruments.includes('nylon-string bossa nova guitar'));
  assert.ok(preset.instruments.includes('sweeping strings'));
});

test('includes Mystical New Age as a pulsed, vocal-textured chillout preset', () => {
  const preset = planning.getStudioStylePreset('mystical_new_age');
  assert.equal(preset.name, 'Mystical New Age');
  assert.equal(preset.genre, 'Mystical New Age Chillout');
  assert.equal(preset.bpm_range, '75–90 BPM');
  assert.equal(preset.vocal_direction, 'mostly_instrumental');
  assert.equal(preset.mood_collection, 'Mystical New Age');
  assert.equal(preset.paired_art_style_id, undefined);
  assert.match(preset.prompt_guidance, /steady softened downtempo pulse/);
  assert.match(preset.prompt_guidance, /rather than verse-and-chorus sections/);
  assert.match(preset.prompt_guidance, /warm, and emotionally uplifting rather than dark/);
  assert.match(preset.prompt_guidance, /No intelligible lyrics, pop vocals/);
  assert.ok(preset.instruments.includes('delicate wordless female vocalizations'));
});

test('includes the low-cortisol Quiet Intelligence preset with restrained generation guidance', () => {
  const preset = planning.getStudioStylePreset('quiet_intelligence');
  assert.equal(preset.name, 'Quiet Intelligence');
  assert.equal(preset.genre, 'Minimalist Ambient Jazz');
  assert.equal(preset.bpm_range, '68–78 BPM');
  assert.equal(preset.vocal_direction, 'instrumental');
  assert.match(preset.prompt_guidance, /generous silence/i);
  assert.match(preset.prompt_guidance, /No vocals/);
  assert.ok(preset.instruments.includes('Rhodes electric piano'));
  assert.ok(preset.instruments.includes('muted trumpet'));
  assert.equal(preset.paired_art_style_id, 'cinematic_architectural_minimalism');
});

test('includes the After Midnight Smooth Noir Jazz preset and its visual pairing', () => {
  const preset = planning.getStudioStylePreset('smooth_noir_jazz');
  assert.equal(preset.name, 'Smooth Noir Jazz');
  assert.equal(preset.mood_collection, 'After Midnight');
  assert.equal(preset.bpm_range, '55–70 BPM');
  assert.equal(preset.paired_art_style_id, 'cinematic_vintage_noir');
  assert.match(preset.prompt_guidance, /memorable but understated saxophone melody/i);
  assert.match(preset.prompt_guidance, /No upbeat swing/);
});

test('includes the Morning Flow Positive Chill House preset and its visual pairing', () => {
  const preset = planning.getStudioStylePreset('positive_chill_house');
  assert.equal(preset.name, 'Positive Chill House');
  assert.equal(preset.mood_collection, 'Morning Flow');
  assert.equal(preset.bpm_range, '105–115 BPM');
  assert.equal(preset.vocal_direction, 'instrumental');
  assert.equal(preset.paired_art_style_id, 'sunlit_lifestyle_editorial');
  assert.match(preset.prompt_guidance, /never intelligible lyrics/i);
  assert.match(preset.prompt_guidance, /No festival EDM/);
});
