import { z } from 'zod';
import { validateObservation } from './opportunityEvidence.mjs';
import { sanitizePII } from '../supabase/functions/_shared/trend-radar.mjs';

// Pure bridge for existing Radar parser outputs, not new collection permission or
// source verification. Context references must identify a real retained record.
// Original query spelling is retained except PII scrubbing; source/report URLs are
// structural provenance, never copied from generated content or rewritten by AI.
const text = z.string().trim().min(1);
const timestamp = z.string().datetime({ offset: true });
const https = text.refine(value => {
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; }
  catch { return false; }
}, 'Expected an HTTPS source without credentials');
const contextSchema = z.object({
  id: text, expectedScope: z.object({ brand_id: text, branch_id: text, project_id: text }).strict(),
  dataset_scope: text, geography: text, language: text, captured_at: timestamp,
  expires_at: timestamp, now: timestamp, permission_reference: text, record_reference: text,
}).strict();
const rssSchema = z.object({
  query: text, source_kind: z.literal('google_trends_rss'), country: text,
  source_url: https, captured_at: timestamp, published_at: timestamp.nullable(), traffic_display: z.string(),
  growth_display: z.null(), growth_percent: z.null(),
  news: z.array(z.object({ url: https, title: z.string() })),
});
const risingSchema = z.object({
  query: text, source_kind: z.literal('google_trends_csv'), country: text,
  source_url: https, captured_at: timestamp, traffic_display: z.null(),
  growth_display: text, growth_percent: z.number().finite().nonnegative().nullable(),
  filters: z.object({ country: text, category: text, date: text, seed: z.string(), property: text }),
});
const researchSchema = z.object({ query: text, source: z.object({ url: https, title: text }), excerpt: text.nullable().optional() });
const seasonalSchema = z.object({ topic: text, source_url: https, title: text, statement: text, reviewer_id: text, reviewed_at: timestamp });

const failure = (message, code = 'invalid_source') => ({ valid: false, observation: null, source_details: null, issues: [{ code, message }] });
function parseInputs(schema, input, context) {
  const parsed = schema.safeParse(input); const ctx = contextSchema.safeParse(context);
  if (!parsed.success || !ctx.success) return { error: failure('Source fields and explicit collection context are required.') };
  return { value: parsed.data, context: ctx.data };
}
function base(context, query, url, title) {
  return {
    id: context.id, scope: context.expectedScope, provider: '', dataset_scope: context.dataset_scope,
    query: sanitizePII(query), geography: context.geography, language: context.language,
    kind: 'research', observed_at: context.captured_at, captured_at: context.captured_at,
    published_at: null, expires_at: context.expires_at,
    source: { url, record_id: null, title: sanitizePII(title), excerpt: null,
      record_reference: context.record_reference, permission_status: 'approved', permission_reference: context.permission_reference },
    period: null, metric: null, methodology: '', limitations: [], review: null,
  };
}
function finish(observation, details, context) {
  const result = validateObservation(observation, { expectedScope: context.expectedScope, now: context.now });
  return { ...result, source_details: result.valid ? structuredClone(details) : null };
}
function captureMatches(signal, context) {
  return signal.country === context.geography && Date.parse(signal.captured_at) === Date.parse(context.captured_at);
}

export function adaptTrendsRssSignal(input, context) {
  const parsed = parseInputs(rssSchema, input, context); if (parsed.error) return parsed.error;
  const signal = parsed.value; const ctx = parsed.context;
  const url = new URL(signal.source_url);
  if (url.hostname !== 'trends.google.com' || url.pathname !== '/trending/rss' || url.searchParams.get('geo') !== signal.country || !captureMatches(signal, ctx)) return failure('RSS source, country and capture context must match.');
  const observation = base(ctx, signal.query, signal.source_url, `Google Trends RSS: ${signal.query}`);
  Object.assign(observation, { provider: 'google_trends_rss', kind: 'trend_feed', published_at: signal.published_at,
    observed_at: signal.published_at || signal.captured_at,
    metric: { name: 'approximate_feed_traffic', value: null, raw_value: signal.traffic_display || null,
      unit: 'provider_traffic_display', kind: 'count', interpretation: 'other', estimated: true },
    methodology: 'google-trends-country-rss-v1', limitations: ['Country-wide current feed; not targeted keyword research.', 'Approximate traffic display is not monthly volume or measured growth; reporting period is unspecified.'] });
  return finish(observation, { traffic_display: signal.traffic_display, growth_display: null, growth_percent: null,
    news: signal.news.map(item => ({ url: item.url, title: sanitizePII(item.title) })) }, ctx);
}

export function adaptRisingCsvSignal(input, context) {
  const parsed = parseInputs(risingSchema, input, context); if (parsed.error) return parsed.error;
  const signal = parsed.value; const ctx = parsed.context; const url = new URL(signal.source_url);
  const filters = signal.filters;
  if (url.hostname !== 'trends.google.com' || !['/trends/explore', '/trends/explore/'].includes(url.pathname) || !captureMatches(signal, ctx) || filters.country !== signal.country ||
      url.searchParams.get('geo') !== filters.country || url.searchParams.get('date') !== filters.date || (url.searchParams.get('cat') || '0') !== filters.category ||
      (url.searchParams.get('q') || '') !== filters.seed || (url.searchParams.get('gprop') || 'web') !== filters.property) return failure('Rising export source, filters and capture context must match.');
  const breakout = signal.growth_display === 'Breakout';
  if ((breakout && signal.growth_percent !== null) || (!breakout && (signal.growth_percent === null || signal.growth_display !== `${signal.growth_percent}%`))) return failure('Rising growth display and numeric representation disagree.');
  const observation = base(ctx, signal.query, signal.source_url, `Google Trends Rising export: ${signal.query}`);
  Object.assign(observation, { provider: 'google_trends_csv', kind: 'trend_feed',
    // Relative date expressions stay raw. Do not guess a UTC reporting window.
    dataset_scope: JSON.stringify([ctx.dataset_scope, filters.country, filters.category, filters.date, filters.seed, filters.property]),
    metric: { name: 'provider_reported_rising_growth', value: signal.growth_percent, raw_value: signal.growth_display,
      unit: 'percent_change', kind: 'rate', interpretation: 'other', estimated: false },
    methodology: 'google-trends-related-queries-rising-export-v1', limitations: ['Provider-reported relative growth, not monthly query volume.', 'Breakout is an open-ended label, never an invented percentage.', 'Reporting filter is preserved; no inferred period or recomputed growth.'] });
  return finish(observation, { filters, growth_display: signal.growth_display, growth_percent: signal.growth_percent, traffic_display: null }, ctx);
}

export function adaptGroundedResearch(input, context) {
  const parsed = parseInputs(researchSchema, input, context); if (parsed.error) return parsed.error;
  const source = parsed.value; const ctx = parsed.context;
  const observation = base(ctx, source.query, source.source.url, source.source.title);
  Object.assign(observation, { provider: 'google_search_grounding', kind: 'research', methodology: 'gemini-returned-grounding-source-v1',
    limitations: ['Retrieved research source, not measured demand or growth.', 'Grounding source presence does not verify every proposed claim.'] });
  observation.source.excerpt = source.excerpt ? sanitizePII(source.excerpt) : null;
  return finish(observation, { source_url: source.source.url }, ctx);
}

export function adaptSeasonalBaseline(input, context) {
  const parsed = parseInputs(seasonalSchema, input, context); if (parsed.error) return parsed.error;
  const source = parsed.value; const ctx = parsed.context;
  const observation = base(ctx, source.topic, source.source_url, source.title);
  Object.assign(observation, { provider: 'owner_seasonal_baseline', kind: 'seasonal', methodology: 'owner-reviewed-seasonal-context-v1',
    limitations: ['Geography-specific reviewed timing context, not current demand measurement.'],
    review: { reviewer_id: source.reviewer_id, reviewed_at: source.reviewed_at } });
  observation.source.excerpt = sanitizePII(source.statement);
  return finish(observation, { baseline_type: 'owner_reviewed' }, ctx);
}
