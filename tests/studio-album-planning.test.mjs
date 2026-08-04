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
