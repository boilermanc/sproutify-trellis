import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  PROMO_MANIFEST_SCHEMA_VERSION,
  PromoManifestValidationError,
  canonicalizePromoJson,
  fingerprintPromoManifest,
  parsePromoManifest,
  promoManifestJsonSchema,
  safeParsePromoManifest,
} from '../features/promo-studio/schemas/promoManifest.ts';

const fixtureUrl = new URL('../features/promo-studio/schemas/fixtures/rekkrd.manifest.v1.json', import.meta.url);
const fixture = async () => JSON.parse(await readFile(fixtureUrl, 'utf8'));

const expectCode = (value, code, gate = 'final') => {
  assert.throws(
    () => parsePromoManifest(value, { gate }),
    error => error instanceof PromoManifestValidationError && error.issues.some(item => item.code === code),
  );
};

test('Rekkrd Promo Manifest v1 round-trips at the final gate', async () => {
  const input = await fixture();
  const parsed = parsePromoManifest(input, { gate: 'final' });
  const roundTripped = parsePromoManifest(JSON.parse(JSON.stringify(parsed)), { gate: 'final' });
  assert.deepEqual(roundTripped, parsed);
  assert.equal(parsed.schema_version, PROMO_MANIFEST_SCHEMA_VERSION);
  assert.equal(parsed.promo.branch.slug, 'rekkrd');
  assert.equal(parsed.scenes[0].visual.kind, 'real_ui_capture');
});

test('JSON Schema export preserves the canonical object contract', () => {
  assert.equal(promoManifestJsonSchema.type, 'object');
  assert.ok(promoManifestJsonSchema.properties?.schema_version);
  assert.ok(promoManifestJsonSchema.properties?.evidence);
  assert.ok(promoManifestJsonSchema.properties?.voice);
});

test('unsupported strict-mode claims block final approval with a stable code', async () => {
  const input = await fixture();
  input.evidence.claims[0].status = 'unsupported';
  input.evidence.claims[0].approved = false;
  expectCode(input, 'PROMO_UNSUPPORTED_CLAIM_BLOCKED');
  assert.equal(safeParsePromoManifest(input, { gate: 'draft' }).success, true);
});

test('unknown scene assets fail with a stable reference code', async () => {
  const input = await fixture();
  input.scenes[0].visual.asset_id = 'missing-capture';
  expectCode(input, 'PROMO_ASSET_REFERENCE_MISSING');
});

test('invalid caption and voice timings fail with stable timing codes', async () => {
  const caption = await fixture();
  caption.captions.cues[0].end_seconds = 99;
  expectCode(caption, 'PROMO_CAPTION_TIMING_INVALID');

  const voice = await fixture();
  voice.voice.takes[0].phrases[0].end_seconds = 9;
  expectCode(voice, 'PROMO_VOICE_TIMING_INVALID');
});

test('real UI scenes cannot omit capture provenance', async () => {
  const input = await fixture();
  input.scenes[0].visual.capture_scenario_id = null;
  expectCode(input, 'PROMO_CAPTURE_PROVENANCE_MISSING');
});

test('selected voice and music takes are singular and referentially valid', async () => {
  const voice = await fixture();
  voice.voice.takes.push({ ...voice.voice.takes[0], id: 'voice-take-c', take_number: 3, selected: true });
  expectCode(voice, 'PROMO_VOICE_SELECTION_MULTIPLE');

  const music = await fixture();
  music.music.selected_take_id = 'missing-music';
  expectCode(music, 'PROMO_MUSIC_SELECTION_INVALID');
});

test('display spelling and speech pronunciation remain separate manifest data', async () => {
  const input = parsePromoManifest(await fixture());
  assert.match(input.script.phrases[1].display_text, /Stakkd/);
  assert.match(input.script.phrases[1].speech_text, /Stacked/);
  assert.equal(input.script.pronunciations.Stakkd, 'stacked');
});

test('canonical fingerprints are deterministic across object key ordering', async () => {
  const input = await fixture();
  const reordered = Object.fromEntries(Object.entries(input).reverse());
  assert.equal(canonicalizePromoJson(input), canonicalizePromoJson(reordered));
  assert.equal(await fingerprintPromoManifest(input), await fingerprintPromoManifest(reordered));
  assert.match(await fingerprintPromoManifest(input), /^[a-f0-9]{64}$/);
});
