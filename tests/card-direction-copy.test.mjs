import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

// A brand creative direction fixes the card's LOOK, not its WORDS. These tests
// pin that split: the director's copy survives, the direction's visual identity
// is always applied. Regression guard for the bug where every card in a
// direction rendered one of a handful of hardcoded overlay lines regardless of
// the brief.

let server;
let directions;

before(async () => {
  server = await createServer({ appType: 'custom', configFile: false, logLevel: 'silent', root: process.cwd(), server: { middlewareMode: true } });
  directions = await server.ssrLoadModule('/services/brandCreativeDirections.ts');
});

after(async () => server?.close());

const DIRECTION = {
  id: 'joy-worth-noticing',
  branchSlug: 'rejoice',
  label: 'Joy Worth Noticing',
  description: 'Celebration, gratitude, music, friendship.',
  wordmark: 'Rejoice',
  wordmarkSubtitle: 'Bible Study for How You Feel',
  photoBrief: 'A joyful everyday moment among friends in warm light.',
  styleNotes: 'Warm editorial lifestyle photography.',
  scrimStrength: 0.42,
  safeOverlay: { heading: 'Make room for joy.', footer: 'Explore joy in scripture' },
};

const generated = (overrides = {}) => ({
  id: 'concept-1',
  template: 'editorial',
  palette: { bg1: '#1c2b23', text: '#f8f7f2', muted: '#9aa79f', accent: '#d98c4a' },
  eyebrow: 'FOR THE WEARY SOUL',
  logoText: 'Rejoice',
  caption: 'A caption.',
  rationale: 'Leads with noticing rather than striving.',
  model: 'test',
  ...overrides,
});

test("keeps the director's headline and footer instead of the preset's", () => {
  const out = directions.applyBrandCreativeDirection(
    generated({ heading: 'Notice the good today.', footer: 'One small moment' }),
    DIRECTION,
  );
  assert.equal(out.heading, 'Notice the good today.');
  assert.equal(out.footer, 'One small moment');
});

test('reads the headline from `statement` when that is where the director put it', () => {
  const out = directions.applyBrandCreativeDirection(
    generated({ statement: 'Joy is not a reward for finishing.' }),
    DIRECTION,
  );
  assert.equal(out.heading, 'Joy is not a reward for finishing.');
});

test('falls back to the direction copy when the director wrote none', () => {
  const out = directions.applyBrandCreativeDirection(generated(), DIRECTION);
  assert.equal(out.heading, 'Make room for joy.');
  assert.equal(out.footer, 'Explore joy in scripture');
});

test('falls back on a footer too long to fit the one-line tracked band', () => {
  const out = directions.applyBrandCreativeDirection(
    generated({ footer: 'Open the app and explore joy in scripture with a friend today' }),
    DIRECTION,
  );
  assert.equal(out.footer, 'Explore joy in scripture');
});

test("applies the direction's visual identity regardless of the copy", () => {
  const out = directions.applyBrandCreativeDirection(
    generated({ heading: 'Notice the good today.', bullets: [{ text: 'one' }], scrimStrength: 0.9 }),
    DIRECTION,
  );
  assert.equal(out.template, 'editorial');
  assert.equal(out.creativeDirectionId, 'joy-worth-noticing');
  assert.equal(out.wordmark, 'Rejoice');
  assert.equal(out.wordmarkSubtitle, 'Bible Study for How You Feel');
  assert.equal(out.photo_brief, DIRECTION.photoBrief);
  assert.equal(out.scrimStrength, 0.42);
  assert.deepEqual(out.bullets, []);
  assert.equal(out.backgroundUrl, undefined);
});

test("keeps the director's rationale so the reviewer sees why this copy", () => {
  const out = directions.applyBrandCreativeDirection(
    generated({ heading: 'Notice the good today.' }),
    DIRECTION,
  );
  assert.match(out.rationale, /Joy Worth Noticing/);
  assert.match(out.rationale, /noticing rather than striving/);
});

test('the direction brief asks for fresh copy rather than reusing the overlay', () => {
  const brief = directions.buildCreativeDirectionBrief(DIRECTION, 'instagram', 'Write posts about noticing small good things.');
  assert.match(brief, /Write posts about noticing small good things\./);
  assert.match(brief, /DO NOT reuse these lines/);
  assert.match(brief, /FRESH headline/);
  // The old wording handed the preset over as approved copy to stamp on.
  assert.doesNotMatch(brief, /Approved overlay/);
});

test('every seeded direction still has a fallback overlay to degrade to', () => {
  for (const direction of directions.BRAND_CREATIVE_DIRECTIONS) {
    assert.ok(direction.safeOverlay.heading.trim(), `${direction.id} has no fallback heading`);
    assert.ok(direction.safeOverlay.footer.trim().length <= 44, `${direction.id} fallback footer is too long to render`);
  }
});
