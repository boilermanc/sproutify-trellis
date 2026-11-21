import { z } from 'zod';

// Pure contract only: callers must authenticate scope and sanitize text before AI use.
const text = z.string().trim().min(1);
const texts = z.array(text);
const timestamp = z.string().datetime({ offset: true });
const url = text.refine((value) => {
  try {
    const parsed = new URL(value);
    return ['https:', 'http:'].includes(parsed.protocol) && !parsed.username && !parsed.password;
  } catch { return false; }
}, 'Expected an HTTP(S) URL without embedded credentials');
const scopeSchema = z.object({ brand_id: text, branch_id: text, project_id: text }).strict();
const evidenceSchema = z.object({
  id: text, source_url: url, title: text, captured_at: timestamp,
  excerpt: text.nullable(), record_reference: text.nullable(),
}).strict().refine((item) => item.excerpt !== null || item.record_reference !== null, {
  message: 'Evidence requires an excerpt or record reference, not only a URL',
});
const factSchema = z.object({
  id: text, claim: text, evidence: z.array(evidenceSchema).min(1),
  last_confirmed_at: timestamp, review_due_at: timestamp,
  status: z.enum(['proposed', 'approved', 'revoked', 'retired']),
  reviewer_id: text.nullable(), approved_at: timestamp.nullable(), offering_ids: texts,
}).strict();

export const opportunityBriefSchema = z.object({
  schema_version: z.literal(1), id: text, version_id: text,
  version: z.number().int().positive(),
  brand_id: text, branch_id: text, project_id: text,
  status: z.enum(['draft', 'review', 'approved', 'retired']),
  author_id: text, created_at: timestamp, updated_at: timestamp,
  reviewer_id: text.nullable(), approved_at: timestamp.nullable(),
  supersedes_version_id: text.nullable(),
  offerings: z.array(z.object({
    id: text, name: text, type: text, source_url: url,
    availability: z.enum(['available', 'limited', 'unavailable', 'unknown']), markets: texts,
  }).strict()),
  audiences: z.array(z.object({
    id: text, description: text, needs: texts, offering_ids: texts, exclusions: texts,
  }).strict()),
  priorities: z.array(z.object({
    id: text, outcome: text, weight: z.number().min(0).max(1).nullable(),
    starts_at: timestamp.nullable(), ends_at: timestamp.nullable(),
  }).strict()),
  voice: z.object({
    tone: z.string(), examples: texts, preferred_terms: texts, avoided_terms: texts, channel_rules: texts,
  }).strict(),
  facts: z.array(factSchema),
  restrictions: z.object({
    prohibited_claims: texts, required_caveats: texts, disallowed_topics: texts, review_conditions: texts,
  }).strict(),
  research_context: z.object({
    markets: texts, languages: texts, topic_seeds: texts, competitors: texts,
    source_preferences: texts, seasonal_context: texts,
  }).strict(),
  content_context: z.object({
    canonical_urls: z.array(url), allowed_channels: texts,
    calls_to_action: z.array(z.object({ label: text, url }).strict()),
  }).strict(),
}).strict().superRefine((brief, ctx) => {
  const fail = (path, message) => ctx.addIssue({ code: 'custom', path, message });
  const unique = (items, path) => {
    const seen = new Set();
    items.forEach((id, index) => {
      if (seen.has(id)) fail([...path, index], `Duplicate identifier: ${id}`);
      seen.add(id);
    });
  };
  for (const key of ['offerings', 'audiences', 'priorities', 'facts']) {
    unique(brief[key].map((item) => item.id), [key]);
  }
  unique(brief.facts.flatMap((fact) => fact.evidence.map((item) => item.id)), ['facts', 'evidence']);
  const offerings = new Set(brief.offerings.map((item) => item.id));
  for (const key of ['audiences', 'facts']) brief[key].forEach((item, index) => {
    unique(item.offering_ids, [key, index, 'offering_ids']);
    item.offering_ids.forEach((id, refIndex) => {
      if (!offerings.has(id)) fail([key, index, 'offering_ids', refIndex], 'Unknown offering reference');
    });
  });
  if (brief.supersedes_version_id === brief.version_id) fail(['supersedes_version_id'], 'A version cannot supersede itself');
  if ((brief.version === 1) !== (brief.supersedes_version_id === null)) {
    fail(['supersedes_version_id'], 'Only the initial version has no predecessor');
  }
  if (Date.parse(brief.updated_at) < Date.parse(brief.created_at)) fail(['updated_at'], 'Update predates creation');
  if (brief.status === 'approved') {
    if (!brief.reviewer_id || !brief.approved_at) fail(['approved_at'], 'Approval requires a reviewer and timestamp');
    if (brief.approved_at && Date.parse(brief.approved_at) < Date.parse(brief.updated_at)) {
      fail(['approved_at'], 'Approval predates the latest edit');
    }
  }
  if (['draft', 'review'].includes(brief.status) && (brief.reviewer_id || brief.approved_at)) {
    fail(['approved_at'], 'Unapproved versions must not inherit approval');
  }
  brief.priorities.forEach((priority, index) => {
    if (priority.starts_at && priority.ends_at && Date.parse(priority.starts_at) >= Date.parse(priority.ends_at)) {
      fail(['priorities', index, 'ends_at'], 'Priority must end after its start');
    }
  });
  brief.facts.forEach((fact, index) => {
    if (Date.parse(fact.last_confirmed_at) > Date.parse(brief.updated_at)) {
      fail(['facts', index, 'last_confirmed_at'], 'Fact confirmation postdates the latest brief edit');
    }
    if (brief.status === 'approved' && fact.approved_at && brief.approved_at &&
        Date.parse(fact.approved_at) > Date.parse(brief.approved_at)) {
      fail(['facts', index, 'approved_at'], 'Fact approval postdates the approved brief snapshot');
    }
    if (Date.parse(fact.review_due_at) <= Date.parse(fact.last_confirmed_at)) {
      fail(['facts', index, 'review_due_at'], 'Review must be due after confirmation');
    }
    if (fact.status === 'approved' && (!fact.reviewer_id || !fact.approved_at)) {
      fail(['facts', index, 'approved_at'], 'Approved facts require reviewer and approval timestamp');
    }
    if (fact.approved_at && Date.parse(fact.approved_at) < Date.parse(fact.last_confirmed_at)) {
      fail(['facts', index, 'approved_at'], 'Fact approval predates confirmation');
    }
    fact.evidence.forEach((evidence, evidenceIndex) => {
      if (Date.parse(evidence.captured_at) > Date.parse(fact.last_confirmed_at)) {
        fail(['facts', index, 'evidence', evidenceIndex, 'captured_at'], 'Evidence was captured after confirmation');
      }
    });
  });
});

const validationIssues = (error, prefix = '') => error.issues.map((issue) => ({
  code: 'invalid_contract', path: [prefix, ...issue.path].filter((part) => part !== '').join('.'),
  message: issue.message, severity: 'error',
}));

/** Readiness is policy, not authorization. expectedScope must come from a trusted caller. */
export function evaluateBriefReadiness(input, options = {}) {
  const { expectedScope, now, workflow = 'research' } = options ?? {};
  const issues = [];
  const add = (code, path, message, severity = 'error') => issues.push({ code, path, message, severity });
  const parsed = opportunityBriefSchema.safeParse(input);
  const scope = scopeSchema.safeParse(expectedScope);
  if (!parsed.success) issues.push(...validationIssues(parsed.error));
  if (!scope.success) issues.push(...validationIssues(scope.error, 'expectedScope'));
  const clock = now instanceof Date ? now.getTime() : timestamp.safeParse(now).success ? Date.parse(now) : NaN;
  if (!Number.isFinite(clock)) add('invalid_clock', 'now', 'An explicit valid evaluation time is required');
  if (!['research', 'drafting'].includes(workflow)) add('invalid_workflow', 'workflow', 'Unknown readiness workflow');
  const result = (brief, eligible_facts = []) => ({
    ready: !issues.some((issue) => issue.severity === 'error'), workflow, issues, eligible_facts, brief,
  });
  if (issues.length) return result(null);
  const brief = parsed.data;
  for (const key of ['brand_id', 'branch_id', 'project_id']) {
    if (brief[key] !== scope.data[key]) add('scope_mismatch', key, 'Brief does not belong to the expected scope');
  }
  if (brief.status !== 'approved') add('brief_not_approved', 'status', 'An approved brief version is required');
  for (const key of ['created_at', 'updated_at', 'approved_at']) {
    if (brief[key] && Date.parse(brief[key]) > clock) add('future_date', key, 'Brief timestamp is in the future');
  }
  // Never expose usable facts from an unsafe version or mismatched brand.
  if (issues.length) return result(null);
  for (const key of ['offerings', 'audiences']) {
    if (!brief[key].length) add('missing_context', key, `At least one ${key === 'offerings' ? 'offering' : 'audience'} is required`);
  }
  const activePriorities = brief.priorities.filter((priority) =>
    (!priority.starts_at || Date.parse(priority.starts_at) <= clock) &&
    (!priority.ends_at || Date.parse(priority.ends_at) > clock));
  if (!activePriorities.length) add('missing_context', 'priorities', 'At least one active business priority is required');
  for (const key of ['markets', 'languages', 'topic_seeds']) {
    if (!brief.research_context[key].length) add('missing_context', `research_context.${key}`, 'Research context is required');
  }
  const eligible = brief.facts.filter((fact, index) => {
    if (fact.status !== 'approved') {
      add('fact_not_approved', `facts.${index}`, 'Fact is not approved for generation', 'warning');
      return false;
    }
    if (Date.parse(fact.last_confirmed_at) > clock || Date.parse(fact.approved_at) > clock) {
      add('future_fact', `facts.${index}`, 'Fact confirmation or approval is in the future', 'warning');
      return false;
    }
    if (Date.parse(fact.review_due_at) <= clock) {
      add('stale_fact', `facts.${index}`, 'Fact is due for review and cannot support a new draft', 'warning');
      return false;
    }
    return true;
  });
  if (workflow === 'drafting') {
    if (!brief.voice.tone.trim()) add('missing_context', 'voice.tone', 'Drafting requires brand voice');
    if (!brief.content_context.allowed_channels.length) add('missing_context', 'content_context.allowed_channels', 'Drafting requires an allowed channel');
    if (!brief.content_context.calls_to_action.length) add('missing_context', 'content_context.calls_to_action', 'Drafting requires an approved call to action');
    if (!eligible.length) add('no_eligible_facts', 'facts', 'Drafting requires at least one fresh approved fact');
  }
  return result(brief, issues.some((issue) => issue.severity === 'error') ? [] : eligible);
}

/** Validate creation of a new draft version; never silently carry approval forward. */
export function validateBriefLineage(previous, next) {
  const before = opportunityBriefSchema.safeParse(previous);
  const after = opportunityBriefSchema.safeParse(next);
  const issues = [];
  if (!before.success) issues.push(...validationIssues(before.error, 'previous'));
  if (!after.success) issues.push(...validationIssues(after.error, 'next'));
  if (!issues.length) {
    const fail = (path, message) => issues.push({ code: 'invalid_lineage', path, message, severity: 'error' });
    for (const key of ['id', 'brand_id', 'branch_id', 'project_id']) {
      if (before.data[key] !== after.data[key]) fail(key, 'A revision must keep the same brief and scope');
    }
    if (after.data.version !== before.data.version + 1) fail('version', 'Revision must increment the version by one');
    if (after.data.version_id === before.data.version_id) fail('version_id', 'Revision requires a new immutable version ID');
    if (after.data.supersedes_version_id !== before.data.version_id) fail('supersedes_version_id', 'Revision must reference its predecessor');
    if (after.data.status !== 'draft') fail('status', 'A new revision must start as an unapproved draft');
    if (Date.parse(after.data.created_at) < Date.parse(before.data.updated_at)) fail('created_at', 'Revision cannot predate its predecessor');
    const previousFacts = new Map(before.data.facts.map((fact) => [fact.id, fact]));
    after.data.facts.forEach((fact, index) => {
      const prior = previousFacts.get(fact.id);
      // Withdrawal preserves historical attribution, but cannot smuggle content edits.
      const withdrawalOnly = prior && ['revoked', 'retired'].includes(fact.status) &&
        JSON.stringify({ ...prior, status: fact.status }) === JSON.stringify(fact);
      // Other changed facts need a fresh review; unchanged facts retain provenance.
      if (!withdrawalOnly && (!prior || JSON.stringify(prior) !== JSON.stringify(fact)) &&
          (fact.status !== 'proposed' || fact.reviewer_id !== null || fact.approved_at !== null)) {
        fail(`facts.${index}`, 'New or changed facts must start proposed with cleared approval');
      }
    });
  }
  return { valid: issues.length === 0, issues };
}
