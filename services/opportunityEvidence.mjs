import { z } from 'zod';

// Provider-independent validation only. Callers authorize scope and sanitize permitted
// extracts before storage/model use. This module neither fetches nor verifies a source.
const text = z.string().trim().min(1);
const timestamp = z.string().datetime({ offset: true });
const scopeSchema = z.object({ brand_id: text, branch_id: text, project_id: text }).strict();
const sourceUrl = text.refine(value => {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password; }
  catch { return false; }
}, 'Source URL must be HTTP(S) without credentials');

export const opportunityObservationSchema = z.object({
  id: text, scope: scopeSchema, provider: text, dataset_scope: text,
  query: text, geography: text, language: text,
  kind: z.enum(['measurement', 'trend_feed', 'seasonal', 'discussion', 'research', 'hypothesis']),
  observed_at: timestamp, captured_at: timestamp, published_at: timestamp.nullable(), expires_at: timestamp,
  source: z.object({
    url: sourceUrl.nullable(), record_id: text.nullable(), title: text,
    excerpt: text.nullable(), record_reference: text.nullable(),
    permission_status: z.enum(['approved', 'unknown', 'denied']), permission_reference: text.nullable(),
  }).strict(),
  period: z.object({ start: timestamp, end: timestamp, complete: z.boolean(), granularity: text, timezone: text }).strict().nullable(),
  metric: z.object({
    name: text, value: z.number().finite().nonnegative().nullable(), unit: text,
    kind: z.enum(['count', 'index', 'rank', 'rate']),
    interpretation: z.enum(['search_demand', 'site_visibility', 'campaign_performance', 'discussion_activity', 'other']),
    raw_value: z.union([z.string(), z.number().finite(), z.null()]), estimated: z.boolean(),
  }).strict().nullable(),
  methodology: text, limitations: z.array(text),
  review: z.object({ reviewer_id: text, reviewed_at: timestamp }).strict().nullable(),
}).strict().superRefine((item, ctx) => {
  const fail = (path, message) => ctx.addIssue({ code: 'custom', path, message });
  if (!item.source.url && !item.source.record_id) fail(['source'], 'A source URL or external record ID is required');
  if (!item.source.excerpt && !item.source.record_reference) fail(['source'], 'A supporting excerpt or report reference is required');
  if (Date.parse(item.observed_at) > Date.parse(item.captured_at)) fail(['observed_at'], 'Observation cannot postdate capture');
  if (item.published_at && Date.parse(item.published_at) > Date.parse(item.captured_at)) fail(['published_at'], 'Publication cannot postdate capture');
  if (Date.parse(item.expires_at) <= Date.parse(item.captured_at)) fail(['expires_at'], 'Expiry must follow capture');
  if (item.period) {
    if (Date.parse(item.period.start) >= Date.parse(item.period.end)) fail(['period'], 'Reporting period must have positive duration');
    if (Date.parse(item.period.start) > Date.parse(item.observed_at)) fail(['period'], 'Reporting period cannot start after observation');
    if (item.period.complete && Date.parse(item.period.end) > Date.parse(item.captured_at)) fail(['period'], 'A complete period cannot end after capture');
  }
  if (item.kind === 'measurement' && (!item.metric || !item.period)) fail(['metric'], 'Measurements require metric and reporting period');
  if (['seasonal', 'research', 'hypothesis'].includes(item.kind) && item.metric) fail(['metric'], 'Context is not a measured metric; retain measurements as separate observations');
});

/** expectedScope and now are explicit so wrong-brand and stale evidence fail closed. */
export function validateObservation(input, { expectedScope, now } = {}) {
  const parsed = opportunityObservationSchema.safeParse(input);
  const scope = scopeSchema.safeParse(expectedScope);
  const clock = timestamp.safeParse(now);
  const issues = [];
  const add = (code, message) => issues.push({ code, message });
  if (!parsed.success) for (const issue of parsed.error.issues) issues.push({ code: 'invalid_observation', path: issue.path.join('.'), message: issue.message });
  if (!scope.success) add('invalid_scope', 'A trusted complete brand scope is required');
  if (!clock.success) add('invalid_clock', 'An explicit evaluation timestamp is required');
  if (issues.length) return { valid: false, observation: null, issues };
  const observation = parsed.data;
  if (Object.keys(scope.data).some(key => observation.scope[key] !== scope.data[key])) add('scope_mismatch', 'Observation belongs to another brand scope');
  if (Date.parse(observation.captured_at) > Date.parse(now)) add('future_capture', 'Evidence capture is in the future');
  if (observation.review && Date.parse(observation.review.reviewed_at) > Date.parse(now)) add('future_review', 'Human review is in the future');
  if (Date.parse(observation.expires_at) <= Date.parse(now)) add('expired', 'Observation requires refresh');
  if (observation.source.permission_status !== 'approved' || !observation.source.permission_reference) add('permission_unverified', 'Collection permission must be recorded');
  if (observation.kind === 'seasonal' && !observation.review) add('unreviewed_seasonal', 'Seasonal context requires a recorded human review');
  return { valid: issues.length === 0, observation: issues.length ? null : observation, issues };
}

const normalizeQuery = query => query.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
const instant = value => value === null ? null : new Date(value).toISOString();
const metricDescriptor = metric => metric ? [metric.name, metric.unit, metric.kind, metric.interpretation, metric.estimated] : null;
const periodDescriptor = period => period ? [instant(period.start), instant(period.end), period.complete, period.granularity, period.timezone] : null;

/** Not an opportunity ID or cryptographic hash. Corrections with this same key must
 * be reconciled, not silently dropped: a changed metric value is a revised report.
 * Timeless feeds use observed_at; historical reports use their reporting period.
 */
export function observationIdentity(input) {
  const item = opportunityObservationSchema.parse(input);
  return JSON.stringify([
    item.scope.brand_id, item.scope.branch_id, item.scope.project_id,
    item.provider, item.dataset_scope, item.kind, normalizeQuery(item.query), item.geography, item.language,
    item.source.record_id || item.source.url, periodDescriptor(item.period) || instant(item.observed_at),
    metricDescriptor(item.metric), item.methodology,
  ]);
}

/** Conservative comparison: complete, adjacent, equal-duration periods only.
 * Unequal calendar months require a future explicitly reviewed normalization policy.
 * Count changes retain their provider meaning, never imply sales or causal lift.
 * Rebased indexes, ranks, rates and provider-reported growth need separate policies.
 * Both snapshots must remain unexpired under their supplied retention/freshness
 * policy; reusing an expired historical baseline needs a separate reviewed policy.
 */
export function compareObservations(previous, current, options) {
  const before = validateObservation(previous, options);
  const after = validateObservation(current, options);
  const unknown = reason => ({ comparable: false, reason, change_percent: null, previous_id: previous?.id ?? null, current_id: current?.id ?? null });
  if (!before.valid || !after.valid) return { ...unknown('invalid_evidence'), issues: [...before.issues, ...after.issues] };
  const a = before.observation; const b = after.observation;
  if (a.id === b.id) return unknown('same_observation');
  if (a.kind !== 'measurement' || b.kind !== 'measurement') return unknown('not_measurements');
  const sameDataset = ['provider', 'dataset_scope', 'geography', 'language', 'methodology'].every(key => a[key] === b[key]);
  if (!sameDataset || normalizeQuery(a.query) !== normalizeQuery(b.query) || JSON.stringify(metricDescriptor(a.metric)) !== JSON.stringify(metricDescriptor(b.metric))) return unknown('incompatible_measurements');
  if (!a.period.complete || !b.period.complete) return unknown('incomplete_period');
  const duration = period => Date.parse(period.end) - Date.parse(period.start);
  if (a.period.granularity !== b.period.granularity || a.period.timezone !== b.period.timezone || duration(a.period) !== duration(b.period) || Date.parse(a.period.end) !== Date.parse(b.period.start)) return unknown('incompatible_periods');
  if (a.metric.kind !== 'count') return unknown('unsupported_metric_kind');
  if (a.metric.value === null || b.metric.value === null) return unknown('missing_value');
  if (a.metric.value === 0) return unknown('zero_baseline');
  const change = ((b.metric.value - a.metric.value) / a.metric.value) * 100;
  if (!Number.isFinite(change)) return unknown('numeric_overflow');
  return { comparable: true, reason: null, change_percent: change, previous_id: a.id, current_id: b.id };
}

/** Classes describe evidence, not model confidence. One point never proves steady
 * demand. Feed/discussion activity never gets promoted to measured query growth.
 */
export function classifyObservation(input, options, previous = null) {
  const validated = validateObservation(input, options);
  if (!validated.valid) return { classes: [], issues: validated.issues, comparison: null };
  const item = validated.observation;
  const classes = [];
  const base = { trend_feed: 'current_trend_feed', seasonal: 'seasonally_relevant', discussion: 'discussion_signal', research: 'source_backed_research', hypothesis: 'research_hypothesis' };
  if (base[item.kind]) classes.push(base[item.kind]);
  if (item.kind === 'measurement') {
    if (item.metric.value === null) classes.push('measurement_unavailable');
    else classes.push(item.metric.interpretation === 'search_demand' && item.metric.kind === 'count' ? 'observed_search_demand' : 'observed_metric');
  }
  const comparison = previous ? compareObservations(previous, item, options) : null;
  if (comparison?.comparable) classes.push(comparison.change_percent > 0 ? 'measured_increase' : comparison.change_percent < 0 ? 'measured_decrease' : 'measured_unchanged');
  return { classes, issues: [], comparison };
}
