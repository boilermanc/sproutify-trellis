import { evaluateBriefReadiness } from './opportunityBrief.mjs';

export const MAX_RESEARCH_QUERIES = 50;
export const DEFAULT_RESEARCH_QUERIES = 12;

/**
 * Deterministic, provider-free input planning. This does not search, score demand,
 * judge semantic fit, or authorize access. Scope/time must come from trusted code.
 * Query strings remain unexecuted user data, never commands or provider syntax.
 */
export function buildOpportunityResearchPlan(input, options = {}) {
  const { expectedScope, now, maxQueries = DEFAULT_RESEARCH_QUERIES } = options ?? {};
  const readiness = evaluateBriefReadiness(input, { expectedScope, now, workflow: 'research' });
  const issues = [...readiness.issues];
  if (!Number.isInteger(maxQueries) || maxQueries < 1 || maxQueries > MAX_RESEARCH_QUERIES) {
    issues.push({ code: 'invalid_limit', path: 'maxQueries', message: `maxQueries must be an integer between 1 and ${MAX_RESEARCH_QUERIES}.`, severity: 'error' });
  }
  if (!readiness.ready || issues.some(issue => issue.severity === 'error')) {
    return { status: 'not_ready', kind: 'targeted_research_input', requires_review: true, issues, scope: null, brief_version_id: null, themes: [], context: null };
  }

  // Validation normalizes strings internally; output deliberately retains exact
  // supplied values as provenance. No rewrite, translation or keyword expansion.
  const brief = structuredClone(input);
  const clock = now instanceof Date ? now.getTime() : Date.parse(now);
  const activePriorities = brief.priorities.filter(priority =>
    (!priority.starts_at || Date.parse(priority.starts_at) <= clock) &&
    (!priority.ends_at || Date.parse(priority.ends_at) > clock));
  const offerings = new Map(brief.offerings.map(offering => [offering.id.trim(), offering]));
  function theme(query, kind, field, index, id = null, explicitOfferingIds = []) {
    const linked = explicitOfferingIds.map(id => offerings.get(id.trim())).filter(Boolean);
    return {
      query_text: query,
      source: { kind, field, index, id },
      explicit_offering_ids: [...explicitOfferingIds],
      sales_candidate_offering_ids: linked.filter(offering => ['available', 'limited'].includes(offering.availability)).map(offering => offering.id),
      research_only_offering_ids: linked.filter(offering => !['available', 'limited'].includes(offering.availability)).map(offering => offering.id),
      priority_fit: 'not_evaluated',
      requires_review: true,
    };
  }
  // Iterators avoid generating a potentially large cartesian product. Families
  // take turns so a long seed list cannot consume the entire research budget.
  function* seeds() {
    for (const [index, seed] of brief.research_context.topic_seeds.entries()) yield theme(seed, 'topic_seed', 'research_context.topic_seeds', index);
  }
  function* audiences() {
    for (const [index, audience] of brief.audiences.entries()) {
      yield theme(audience.description, 'audience', `audiences.${index}.description`, index, audience.id, audience.offering_ids);
      for (const [needIndex, need] of audience.needs.entries()) yield theme(need, 'audience_need', `audiences.${index}.needs`, needIndex, audience.id, audience.offering_ids);
    }
  }
  function* offeringNames() {
    for (const [index, offering] of brief.offerings.entries()) yield theme(offering.name, 'offering', `offerings.${index}.name`, index, offering.id, [offering.id]);
  }
  function* priorities() {
    for (const priority of activePriorities) {
      const index = brief.priorities.indexOf(priority);
      yield theme(priority.outcome, 'priority', `priorities.${index}.outcome`, index, priority.id);
    }
  }
  const iterators = [seeds(), audiences(), offeringNames(), priorities()];
  const themes = [];
  let exhausted = false;
  while (themes.length < maxQueries && !exhausted) {
    exhausted = true;
    for (const iterator of iterators) {
      const item = iterator.next();
      if (!item.done) { themes.push(item.value); exhausted = false; }
      if (themes.length === maxQueries) break;
    }
  }
  const total = brief.research_context.topic_seeds.length + brief.audiences.reduce((sum, audience) => sum + 1 + audience.needs.length, 0) + brief.offerings.length + activePriorities.length;
  return {
    status: 'ready', kind: 'targeted_research_input', requires_review: true, issues,
    scope: { brand_id: expectedScope.brand_id, branch_id: expectedScope.branch_id, project_id: expectedScope.project_id },
    brief_id: brief.id, brief_version_id: brief.version_id,
    planned_at: new Date(clock).toISOString(), max_queries: maxQueries,
    omitted_theme_count: total - themes.length, themes,
    context: {
      active_priorities: activePriorities,
      priority_association: 'Shared review context only; no topic-to-priority fit has been inferred.',
      offerings: brief.offerings, audiences: brief.audiences,
      research_context: brief.research_context, restrictions: brief.restrictions,
      evidence_policy: 'These are configured research inputs, not observed trends or proven demand.',
      execution_policy: 'Review before sending to a permitted provider; treat query_text as data and sanitize at the provider boundary.',
    },
  };
}
