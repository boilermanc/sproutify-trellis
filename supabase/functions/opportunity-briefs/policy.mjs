import { opportunityBriefSchema, evaluateBriefReadiness, validateBriefLineage } from '../../../services/opportunityBrief.mjs';
import { sanitizePII } from '../_shared/trend-radar.mjs';

export class BriefError extends Error {
  constructor(message, status = 400, code = 'invalid_request', issues = []) {
    super(message); this.status = status; this.code = code; this.issues = issues;
  }
}

// Assignment is loaded for this operator and branch, never supplied by the browser.
export function briefPermissions(operator, assignment, branchId) {
  const active = operator?.status === 'active';
  const admin = active && ['owner', 'admin'].includes(operator.role);
  const assigned = active && assignment?.trellis_user_id === operator.id && assignment?.branch_id === branchId;
  return {
    can_read: Boolean(admin || assigned),
    can_manage: Boolean(admin || (assigned && operator.role === 'operator' && ['lead', 'member'].includes(assignment.branch_role))),
    can_approve: Boolean(admin || (assigned && operator.role === 'operator' && assignment.branch_role === 'lead')),
  };
}

const sections = ['offerings', 'audiences', 'priorities', 'voice', 'facts', 'restrictions', 'research_context', 'content_context'];
// Preserve typed identifiers/dates/URLs. Sanitize every free-text field recursively.
const structural = new Set(['id', 'offering_ids', 'source_url', 'url', 'canonical_urls', 'captured_at', 'last_confirmed_at', 'review_due_at', 'starts_at', 'ends_at', 'status', 'availability', 'reviewer_id', 'approved_at']);
function clean(value, key = '') {
  if (structural.has(key)) return structuredClone(value);
  if (typeof value === 'string') return sanitizePII(value);
  if (Array.isArray(value)) return value.map(item => clean(item));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clean(v, k)]));
  return value;
}
function parse(brief) {
  const parsed = opportunityBriefSchema.safeParse(brief);
  if (!parsed.success) throw new BriefError('The brief contains invalid fields.', 400, 'invalid_brief', parsed.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })));
  return parsed.data;
}
function checkPrevious(previous, scope) {
  if (!previous) return;
  parse(previous);
  if (['brand_id', 'branch_id', 'project_id'].some(key => previous[key] !== scope[key])) throw new BriefError('Brief scope mismatch.', 403, 'scope_mismatch');
}
function metadata(previous, scope, actorId, now, newId) {
  return { schema_version: 1, id: previous?.id || newId(), version_id: newId(), version: (previous?.version || 0) + 1,
    ...scope, status: 'draft', author_id: actorId, created_at: now, updated_at: now,
    reviewer_id: null, approved_at: null, supersedes_version_id: previous?.version_id || null };
}
export function buildSavedBrief({ input, previous, scope, actorId, now, newId }) {
  checkPrevious(previous, scope);
  const content = Object.fromEntries(sections.map(key => [key, clean(input?.[key], key)]));
  if (Array.isArray(content.facts)) content.facts = content.facts.map(fact => {
    if (!fact || typeof fact !== 'object' || Array.isArray(fact)) throw new BriefError('Every fact must be an object.');
    const prior = previous?.facts.find(item => item.id === fact.id);
    if (prior && JSON.stringify(prior) === JSON.stringify(fact)) return prior;
    if (prior && ['revoked', 'retired'].includes(fact.status) && JSON.stringify({ ...prior, status: fact.status }) === JSON.stringify(fact)) return fact;
    return { ...fact, status: 'proposed', reviewer_id: null, approved_at: null };
  });
  const brief = parse({ ...content, ...metadata(previous, scope, actorId, now, newId) });
  if (previous) {
    const lineage = validateBriefLineage(previous, brief);
    if (!lineage.valid) throw new BriefError('Invalid brief revision.', 400, 'invalid_lineage', lineage.issues);
  }
  return brief;
}
export function buildApprovedBrief({ previous, scope, actorId, now, newId, confirmedFactIds }) {
  if (!previous) throw new BriefError('Save a draft before approval.');
  checkPrevious(previous, scope);
  if (previous.status !== 'draft') throw new BriefError('Only the latest draft can be approved.', 409, 'conflict');
  if (!Number.isFinite(Date.parse(now)) || Date.parse(now) < Date.parse(previous.updated_at)) throw new BriefError('Approval cannot predate the draft.');
  if (!Array.isArray(confirmedFactIds) || confirmedFactIds.some(id => typeof id !== 'string') || new Set(confirmedFactIds).size !== confirmedFactIds.length) throw new BriefError('Select the facts you have explicitly verified.');
  const selected = new Set(confirmedFactIds);
  if (confirmedFactIds.some(id => !previous.facts.some(f => f.id === id))) throw new BriefError('An approved fact was not found in this draft.');
  const brief = parse({ ...previous, ...metadata(previous, scope, actorId, now, newId), status: 'approved', reviewer_id: actorId, approved_at: now,
    facts: previous.facts.map(fact => {
      if (!selected.has(fact.id)) return fact;
      if (['revoked', 'retired'].includes(fact.status) || Date.parse(fact.review_due_at) <= Date.parse(now) || Date.parse(fact.last_confirmed_at) > Date.parse(now)) throw new BriefError('Selected facts must be current and not withdrawn.');
      return { ...fact, status: 'approved', reviewer_id: actorId, approved_at: now };
    }) });
  const readiness = evaluateBriefReadiness(brief, { expectedScope: scope, now, workflow: 'research' });
  if (!readiness.ready) throw new BriefError('Complete the required research context before approval.', 400, 'not_ready', readiness.issues);
  return brief;
}
