import { evaluateBriefReadiness } from './opportunityBrief.mjs';

const scopeKeys = ['brand_id', 'branch_id', 'project_id'];
const identifier = value => typeof value === 'string' && value.trim().length > 0 && value === value.trim();

/**
 * Create metadata for a NEW draft from an already authorized opportunity and brief.
 * Callers must resolve expectedScope from trusted application state, not request data.
 * This pure helper neither authorizes a user nor persists/approves a draft.
 */
export function createOpportunityDraftLineage(input, options) {
  const fail = (code, message) => ({ ok: false, lineage: null, issues: [{ code, message }] });
  if (!input || typeof input !== 'object') return fail('invalid_input', 'Draft lineage input is required.');
  const { opportunity, draft_id, fact_ids, brief } = input;
  if (!identifier(draft_id) || !opportunity || !identifier(opportunity.id)) {
    return fail('missing_identity', 'A saved opportunity ID and separate draft ID are required.');
  }
  if (draft_id === opportunity.id) return fail('identity_collision', 'Draft and opportunity IDs must be distinct.');
  if (!options?.expectedScope || scopeKeys.some(key => !identifier(options.expectedScope[key]) || opportunity[key] !== options.expectedScope[key])) {
    return fail('scope_mismatch', 'The opportunity must belong to the expected brand, branch and project.');
  }
  if (!Array.isArray(fact_ids) || fact_ids.length === 0 || fact_ids.some(id => !identifier(id)) || new Set(fact_ids).size !== fact_ids.length) {
    return fail('invalid_fact_selection', 'Select a nonempty set of distinct fact IDs.');
  }

  const readiness = evaluateBriefReadiness(brief, { ...options, workflow: 'drafting' });
  if (!readiness.ready) return { ok: false, lineage: null, issues: readiness.issues };
  const facts = new Map(readiness.eligible_facts.map(fact => [fact.id, fact]));
  if (fact_ids.some(id => !facts.has(id))) {
    return fail('ineligible_fact', 'Every selected fact must be approved and current in this brief version.');
  }
  const snapshot = readiness.brief;
  return {
    ok: true,
    issues: [],
    lineage: {
      ...Object.fromEntries(scopeKeys.map(key => [key, options.expectedScope[key]])),
      opportunity_id: opportunity.id,
      draft_id,
      brief_id: snapshot.id,
      brief_version_id: snapshot.version_id,
      brief_version: snapshot.version,
      fact_references: fact_ids.map(id => ({
        fact_id: id,
        brief_version_id: snapshot.version_id,
        evidence_ids: facts.get(id).evidence.map(evidence => evidence.id),
      })),
    },
  };
}
