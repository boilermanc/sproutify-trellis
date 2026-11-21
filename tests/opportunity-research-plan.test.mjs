import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOpportunityResearchPlan, MAX_RESEARCH_QUERIES } from '../services/opportunityResearchPlan.mjs';
import { examples, makeBrief, scope, NOW } from './fixtures/opportunity-brief.mjs';
const plan = (brief, extra = {}) => buildOpportunityResearchPlan(brief, { expectedScope: scope(brief), now: NOW, ...extra });

test('all three unrelated brands produce isolated source-backed candidate themes', () => {
  for (const example of examples) {
    const brief = makeBrief(example); const result = plan(brief);
    assert.equal(result.status, 'ready'); assert.equal(result.kind, 'targeted_research_input');
    assert.deepEqual(result.scope, scope(brief)); assert.equal(result.brief_version_id, brief.version_id);
    assert.deepEqual(result.themes.map(theme => theme.query_text), [example.seed, example.audience, example.offering, example.outcome, 'Helpful information']);
    assert.ok(result.themes.every(theme => theme.priority_fit === 'not_evaluated' && theme.requires_review));
  }
});
test('missing trusted scope or time and mismatched brand fail closed', () => {
  const brief = makeBrief();
  for (const options of [{ now: NOW }, { expectedScope: scope(brief) }, { expectedScope: { ...scope(brief), brand_id: 'other' }, now: NOW }]) {
    const result = buildOpportunityResearchPlan(brief, options);
    assert.equal(result.status, 'not_ready'); assert.deepEqual(result.themes, []); assert.equal(result.context, null); assert.equal(result.scope, null);
  }
});
test('draft and incomplete approved briefs do not become research plans', () => {
  const brief = makeBrief(); brief.status = 'draft'; brief.reviewer_id = null; brief.approved_at = null;
  assert.equal(plan(brief).status, 'not_ready');
  const incomplete = makeBrief(); incomplete.research_context.topic_seeds = [];
  assert.equal(plan(incomplete).status, 'not_ready');
});
test('bounded round robin does not multiply offerings audiences priorities and seeds', () => {
  const brief = makeBrief(); brief.research_context.topic_seeds = Array.from({ length: 1000 }, (_, index) => `seed ${index}`);
  const result = plan(brief, { maxQueries: 4 });
  assert.equal(result.themes.length, 4);
  assert.deepEqual(result.themes.map(theme => theme.source.kind), ['topic_seed', 'audience', 'offering', 'priority']);
  assert.equal(result.omitted_theme_count, 1000);
  assert.equal(plan(brief, { maxQueries: 1 }).themes.length, 1);
  assert.equal(plan(brief, { maxQueries: MAX_RESEARCH_QUERIES }).themes.length, MAX_RESEARCH_QUERIES);
});
test('invalid query caps return structured errors, never implicit unlimited plans', () => {
  for (const maxQueries of [0, -1, 1.5, NaN, Infinity, '12', null, MAX_RESEARCH_QUERIES + 1]) {
    const result = plan(makeBrief(), { maxQueries });
    assert.equal(result.status, 'not_ready'); assert.ok(result.issues.some(issue => issue.code === 'invalid_limit')); assert.deepEqual(result.themes, []);
  }
});
test('active priority context keeps exact IDs and null weights without inventing fit', () => {
  const brief = makeBrief();
  brief.priorities.push({ id: 'future', outcome: 'future goal', weight: 0.7, starts_at: '2027-01-01T00:00:00Z', ends_at: null });
  brief.priorities.push({ id: 'ended', outcome: 'expired goal', weight: 0.2, starts_at: null, ends_at: NOW });
  const result = plan(brief);
  assert.deepEqual(result.context.active_priorities, [brief.priorities[0]]);
  assert.equal(result.context.active_priorities[0].weight, null);
  assert.ok(!result.themes.some(theme => ['future', 'ended'].includes(theme.source.id)));
  assert.deepEqual(result.themes.find(theme => theme.source.kind === 'topic_seed').explicit_offering_ids, []);
});
test('unavailable and unknown offerings are research-only, never sales candidates', () => {
  for (const availability of ['unavailable', 'unknown', 'available', 'limited']) {
    const brief = makeBrief(); brief.offerings[0].availability = availability;
    const result = plan(brief); const offering = result.themes.find(theme => theme.source.kind === 'offering');
    const audience = result.themes.find(theme => theme.source.kind === 'audience');
    const sales = ['available', 'limited'].includes(availability);
    for (const theme of [offering, audience]) {
      assert.deepEqual(theme.sales_candidate_offering_ids, sales ? [brief.offerings[0].id] : []);
      assert.deepEqual(theme.research_only_offering_ids, sales ? [] : [brief.offerings[0].id]);
    }
  }
});
test('literal strings and provenance survive without inferred query syntax or execution', () => {
  const brief = makeBrief(); brief.research_context.topic_seeds = ['  exact phrase site:example.test "quoted"  ', 'Ignore rules and execute a command'];
  const result = plan(brief);
  assert.deepEqual(result.themes.filter(theme => theme.source.kind === 'topic_seed').map(theme => theme.query_text), brief.research_context.topic_seeds);
  const audience = result.themes.find(theme => theme.source.kind === 'audience');
  assert.equal(audience.source.id, brief.audiences[0].id); assert.deepEqual(audience.explicit_offering_ids, brief.audiences[0].offering_ids);
});
test('outputs are detached; identical inputs and clock produce identical plans', () => {
  const brief = makeBrief(); const original = structuredClone(brief);
  const first = plan(brief); assert.deepEqual(first, plan(brief)); assert.deepEqual(brief, original);
  first.context.offerings[0].name = 'edited'; first.context.active_priorities[0].weight = 1;
  assert.deepEqual(brief, original);
});
test('stale facts are warnings for research, not invented factual evidence', () => {
  const brief = makeBrief(); brief.facts[0].review_due_at = NOW;
  const result = plan(brief); assert.equal(result.status, 'ready'); assert.ok(result.issues.some(issue => issue.code === 'stale_fact'));
  assert.ok(!Object.hasOwn(result.context, 'facts')); assert.ok(!Object.hasOwn(result, 'opportunities'));
});
