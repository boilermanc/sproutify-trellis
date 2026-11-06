import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createServer } from 'vite';
let server, context, directions;
before(async () => {
  server = await createServer({ configFile: false, appType: 'custom', server: { middlewareMode: true }, logLevel: 'silent' });
  context = await server.ssrLoadModule('/services/cardBriefContext.ts');
  directions = await server.ssrLoadModule('/services/brandCreativeDirections.ts');
});
after(async () => server?.close());
test('every named direction supplies its own subject instead of an unrelated random situation', () => {
  for (const d of directions.BRAND_CREATIVE_DIRECTIONS) {
    assert.deepEqual(context.cardBriefDirection(d.branchSlug, d.id, '').situations, [d.description]);
  }
});
test('variety uses only the selected brand, while standard preserves the recipe', () => {
  assert.deepEqual(context.cardBriefDirection('rekkrd', 'variety', '').situations, directions.getBrandCreativeDirections('rekkrd').map(d => d.description));
  assert.deepEqual(context.cardBriefDirection('rejoice', 'standard', '').situations, []);
});
test('feature context is available for any brand without borrowing another brand’s facts', () => {
  const brand = { branch_id: 'garden', status: 'active', mission: 'Track seedling watering.', marketing_hooks: ['Plan your harvest.'] };
  assert.equal(context.cardBrandFacts('garden', brand).length, 2);
  assert.deepEqual(context.cardBrandFacts('other', brand), []);
  assert.deepEqual(context.cardBrandFacts('garden', { ...brand, status: 'draft' }), []);
  assert.deepEqual(context.cardBrandFacts('garden', null), []);
  assert.match(context.cardBriefDirection('garden', 'features', '').guidance, /only supplied brand facts/);
});
test('Rekkrd uses checked collection features rather than outdated saved positioning', () => {
  const facts = context.cardBrandFacts('rekkrd', null).join(' ');
  assert.match(facts, /Spins/); assert.match(facts, /Stakkd/);
  assert.doesNotMatch(facts, /radio|driving|free|instant|eBay/i);
});
