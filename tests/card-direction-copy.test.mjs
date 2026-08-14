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
    generated({ heading: 'Notice the good today.', footer: 'One small moment' }),
    DIRECTION,
  );
  assert.match(out.rationale, /Joy Worth Noticing/);
  assert.match(out.rationale, /noticing rather than striving/);
  // Both lines are the director's, so nothing should be flagged.
  assert.doesNotMatch(out.rationale, /Stock/);
});

test('flags on the card when stock copy had to be used', () => {
  const bothStock = directions.applyBrandCreativeDirection(generated(), DIRECTION);
  assert.match(bothStock.rationale, /Stock headline and footer/);

  const footerOnly = directions.applyBrandCreativeDirection(
    generated({ heading: 'Notice the good today.', footer: 'A footer far too long to fit on the single tracked line' }),
    DIRECTION,
  );
  assert.match(footerOnly.rationale, /Stock footer/);

  const headingOnly = directions.applyBrandCreativeDirection(
    generated({ footer: 'One small moment' }),
    DIRECTION,
  );
  assert.match(headingOnly.rationale, /Stock headline/);
  assert.doesNotMatch(headingOnly.rationale, /Stock headline and footer/);
});

test('the direction brief never shows the model the preset overlay lines', () => {
  const brief = directions.buildCreativeDirectionBrief(DIRECTION, 'instagram', 'Write posts about noticing small good things.');
  assert.match(brief, /Write posts about noticing small good things\./);
  // The preset lines must not appear in the brief AT ALL. Sent as "approved
  // overlay" copy they were stamped on verbatim; sent as a "tone reference --
  // do not reuse" the model copied them anyway.
  assert.doesNotMatch(brief, /Make room for joy/);
  assert.doesNotMatch(brief, /Explore joy in scripture/);
  assert.doesNotMatch(brief, /Approved overlay/);
  assert.match(brief, /headline .* and the footer for this concept from the brief/);
});

// Rejoice is a phone app, so its scenes carry a phone — but an image model
// given a phone screen invents a garbled fake UI, which on a Bible-study brand
// reads as fabricated scripture. The object is allowed; its content is not.
test('every Rejoice scene includes a phone with an unreadable screen', () => {
  const rejoice = directions.BRAND_CREATIVE_DIRECTIONS.filter(d => d.branchSlug === 'rejoice');
  assert.ok(rejoice.length > 0, 'no Rejoice directions seeded');
  for (const direction of rejoice) {
    assert.match(direction.photoBrief, /phone/i, `${direction.id} has no phone in the scene`);
    assert.match(
      direction.photoBrief,
      /screen (is )?dark|dark screen|screen dark|face-down|angled away/i,
      `${direction.id} does not keep the phone screen unreadable`,
    );
    assert.match(direction.styleNotes, /never show a visible interface/i, `${direction.id} is missing the screen rule`);
  }
});

test('every seeded direction still has a fallback overlay to degrade to', () => {
  for (const direction of directions.BRAND_CREATIVE_DIRECTIONS) {
    assert.ok(direction.safeOverlay.heading.trim(), `${direction.id} has no fallback heading`);
    assert.ok(direction.safeOverlay.footer.trim().length <= 44, `${direction.id} fallback footer is too long to render`);
  }
});
