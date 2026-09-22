import test from 'node:test';
import assert from 'node:assert/strict';
import { createOpportunityDraftLineage } from '../services/opportunityLineage.mjs';
import { makeBrief } from './fixtures/opportunity-brief.mjs';

function setup() {
  const brief = makeBrief();
  const expectedScope = { brand_id: brief.brand_id, branch_id: brief.branch_id, project_id: brief.project_id };
  return {
    input: { opportunity: { id: 'saved-opportunity', ...expectedScope }, draft_id: 'new-draft', brief, fact_ids: [brief.facts[0].id] },
    options: { expectedScope, now: '2026-09-22T12:00:00Z' },
  };
}

test('pins existing opportunity, separate draft and exact brief/fact/evidence version', () => {
  const { input, options } = setup();
  const before = structuredClone(input);
  const result = createOpportunityDraftLineage(input, options);
  assert.equal(result.ok, true, JSON.stringify(result.issues));
  assert.equal(result.lineage.opportunity_id, 'saved-opportunity');
  assert.equal(result.lineage.draft_id, 'new-draft');
  assert.equal(result.lineage.brief_id, input.brief.id);
  assert.equal(result.lineage.brief_version_id, input.brief.version_id);
  assert.deepEqual(result.lineage.fact_references, [{ fact_id: input.brief.facts[0].id, brief_version_id: input.brief.version_id, evidence_ids: input.brief.facts[0].evidence.map(item => item.id) }]);
  assert.deepEqual(input, before);
  input.brief.facts[0].evidence[0].id = 'edited-after-snapshot';
  assert.notEqual(result.lineage.fact_references[0].evidence_ids[0], 'edited-after-snapshot');
});

test('draft revisions preserve opportunity identity but have independent draft IDs', () => {
  const { input, options } = setup();
  const first = createOpportunityDraftLineage(input, options);
  const second = createOpportunityDraftLineage({ ...input, draft_id: 'revision-draft' }, options);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.lineage.opportunity_id, second.lineage.opportunity_id);
  assert.notEqual(first.lineage.draft_id, second.lineage.draft_id);
});

test('rejects wrong scope for either opportunity or brief, even when project matches', () => {
  for (const key of ['brand_id', 'branch_id', 'project_id']) {
    const { input, options } = setup();
    input.opportunity[key] = 'other';
    assert.equal(createOpportunityDraftLineage(input, options).ok, false);
    input.opportunity[key] = options.expectedScope[key];
    input.brief[key] = 'other';
    assert.equal(createOpportunityDraftLineage(input, options).ok, false);
  }
});

test('never silently drops unknown or duplicated selected facts', () => {
  for (const selection of [[], ['unknown'], ['unknown', 'another'], null]) {
    const { input, options } = setup();
    input.fact_ids = selection;
    assert.equal(createOpportunityDraftLineage(input, options).lineage, null);
  }
  const { input, options } = setup();
  input.fact_ids.push(input.fact_ids[0]);
  assert.equal(createOpportunityDraftLineage(input, options).ok, false);
});

test('cannot force research readiness or use stale facts to create a draft', () => {
  const { input, options } = setup();
  input.brief.facts[0].review_due_at = '2026-09-22T12:00:00Z';
  const result = createOpportunityDraftLineage(input, { ...options, workflow: 'research' });
  assert.equal(result.ok, false);
  assert.equal(result.lineage, null);
});

test('a fresh fallback fact does not silently replace the selected stale fact', () => {
  const { input, options } = setup();
  const fresh = structuredClone(input.brief.facts[0]);
  fresh.id = 'fresh-fact';
  fresh.evidence[0].id = 'fresh-evidence';
  input.brief.facts.push(fresh);
  input.brief.facts[0].review_due_at = '2026-09-22T12:00:00Z';
  const result = createOpportunityDraftLineage(input, options);
  assert.equal(result.ok, false);
  assert.equal(result.issues[0].code, 'ineligible_fact');
  input.fact_ids = [fresh.id];
  assert.equal(createOpportunityDraftLineage(input, options).ok, true);
});

test('invalid inputs and missing trust context fail closed', () => {
  for (const input of [null, undefined, [], {}, 'text']) {
    assert.equal(createOpportunityDraftLineage(input).ok, false);
  }
  const { input, options } = setup();
  assert.equal(createOpportunityDraftLineage(input, {}).ok, false);
  assert.equal(createOpportunityDraftLineage(input, { ...options, now: 'bad date' }).ok, false);
  input.draft_id = input.opportunity.id;
  assert.equal(createOpportunityDraftLineage(input, options).ok, false);
});
