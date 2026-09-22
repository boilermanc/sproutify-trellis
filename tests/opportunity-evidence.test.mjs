import test from 'node:test';
import assert from 'node:assert/strict';
import { validateObservation, observationIdentity, compareObservations, classifyObservation } from '../services/opportunityEvidence.mjs';

const scope = { brand_id: 'brand-a', branch_id: 'branch-a', project_id: 'project-a' };
const options = { expectedScope: scope, now: '2026-09-22T12:00:00Z' };
function observation(overrides = {}) {
  return {
    id: 'observation-current', scope, provider: 'permitted-report', dataset_scope: 'account-x:property-y', query: 'fall seedlings', geography: 'US', language: 'en', kind: 'measurement',
    observed_at: '2026-09-20T00:00:00Z', captured_at: '2026-09-21T00:00:00Z', published_at: null, expires_at: '2026-10-21T00:00:00Z',
    source: { url: 'https://source.example/report', record_id: 'report-series', title: 'Fictional permitted report', excerpt: null, record_reference: 'row:fall-seedlings', permission_status: 'approved', permission_reference: 'owner-reviewed-license' },
    period: { start: '2026-09-13T00:00:00Z', end: '2026-09-20T00:00:00Z', complete: true, granularity: 'week', timezone: 'UTC' },
    metric: { name: 'searches', value: 120, unit: 'search_count', kind: 'count', interpretation: 'search_demand', raw_value: 'approximately 120', estimated: true },
    methodology: 'fictional-report-v1', limitations: ['Synthetic test data only'], review: null, ...overrides,
  };
}
function before() {
  const item = observation({ id: 'observation-before' });
  item.period = { ...item.period, start: '2026-09-06T00:00:00Z', end: '2026-09-13T00:00:00Z' };
  item.metric.value = 100;
  return item;
}

test('valid evidence preserves exact original query and raw provider representation', () => {
  const input = observation({ query: 'FALL  seedlings' });
  const original = structuredClone(input);
  const result = validateObservation(input, options);
  assert.equal(result.valid, true);
  assert.equal(result.observation.query, 'FALL  seedlings');
  assert.equal(result.observation.metric.raw_value, 'approximately 120');
  assert.deepEqual(input, original);
});

for (const key of ['brand_id', 'branch_id', 'project_id']) test(`wrong ${key} fails closed`, () => {
  const item = observation({ scope: { ...scope, [key]: 'other' } });
  assert.equal(validateObservation(item, options).valid, false);
  assert.deepEqual(classifyObservation(item, options).classes, []);
});

test('missing trusted scope or explicit clock fails closed', () => {
  for (const opts of [{}, { expectedScope: scope }, { ...options, now: '2026-02-30T00:00:00Z' }]) assert.equal(validateObservation(observation(), opts).valid, false);
});

test('source URL alone, unsafe URLs and unverified permissions are insufficient', () => {
  for (const patch of [{ excerpt: null, record_reference: null }, { url: 'javascript:alert(1)' }, { url: 'https://user:secret@example.com' }, { permission_status: 'unknown' }, { permission_reference: null }, { url: null, record_id: null }]) {
    const item = observation(); Object.assign(item.source, patch);
    assert.equal(validateObservation(item, options).valid, false);
  }
});

test('invalid dates, future capture, expired evidence and backwards periods fail closed', () => {
  for (const patch of [{ captured_at: '2026-02-30T00:00:00Z' }, { captured_at: '2026-09-23T00:00:00Z' }, { observed_at: '2026-09-25T00:00:00Z' }, { expires_at: options.now }]) assert.equal(validateObservation(observation(patch), options).valid, false);
  const item = observation(); item.period.end = item.period.start;
  assert.equal(validateObservation(item, options).valid, false);
});

test('unstarted reporting period cannot claim observed demand, even when incomplete', () => {
  const item = observation();
  item.period = { ...item.period, start: '2026-09-25T00:00:00Z', end: '2026-10-02T00:00:00Z', complete: false };
  assert.equal(validateObservation(item, options).valid, false);
  assert.deepEqual(classifyObservation(item, options).classes, []);
});

test('current incomplete reporting period may end in the future without implying a full count', () => {
  const item = observation();
  item.period = { ...item.period, start: '2026-09-20T00:00:00Z', end: '2026-09-27T00:00:00Z', complete: false };
  assert.equal(validateObservation(item, options).valid, true);
  assert.equal(compareObservations(before(), item, options).reason, 'incomplete_period');
});

test('NaN, infinity and negative observed quantities are rejected without coercion', () => {
  for (const value of [NaN, Infinity, -1, '100']) {
    const item = observation(); item.metric.value = value;
    assert.equal(validateObservation(item, options).valid, false);
  }
});

test('compatible adjacent periods compute growth with original observation lineage', () => {
  assert.deepEqual(compareObservations(before(), observation(), options), { comparable: true, reason: null, change_percent: 20, previous_id: 'observation-before', current_id: 'observation-current' });
  assert.deepEqual(classifyObservation(observation(), options, before()).classes, ['observed_search_demand', 'measured_increase']);
});

for (const field of ['provider', 'dataset_scope', 'geography', 'language', 'methodology', 'query']) test(`different ${field} is not comparable`, () => {
  const item = observation({ [field]: 'different' });
  assert.equal(compareObservations(before(), item, options).comparable, false);
});

test('metric definition, unit, estimate basis and incomplete periods cannot be mixed', () => {
  for (const patch of [{ name: 'clicks' }, { unit: 'percent' }, { estimated: false }, { interpretation: 'campaign_performance' }]) {
    const item = observation(); Object.assign(item.metric, patch);
    assert.equal(compareObservations(before(), item, options).comparable, false);
  }
  const item = observation(); item.period.complete = false;
  assert.equal(compareObservations(before(), item, options).reason, 'incomplete_period');
});

test('overlapping, gapped, unequal-duration and different-zone periods are not compared', () => {
  for (const patch of [{ start: '2026-09-12T00:00:00Z' }, { start: '2026-09-14T00:00:00Z', end: '2026-09-21T00:00:00Z' }, { timezone: 'America/New_York' }, { granularity: 'month' }]) {
    const item = observation(); Object.assign(item.period, patch);
    assert.equal(compareObservations(before(), item, options).comparable, false);
  }
});

test('zero baseline and missing quantity stay unknown rather than infinity or zero', () => {
  const previous = before(); previous.metric.value = 0;
  assert.equal(compareObservations(previous, observation(), options).reason, 'zero_baseline');
  previous.metric.value = null;
  assert.equal(compareObservations(previous, observation(), options).reason, 'missing_value');
  assert.deepEqual(classifyObservation(previous, options).classes, ['measurement_unavailable']);
});

test('decline and no change are not rising or proof of long-term steady demand', () => {
  const item = observation(); item.metric.value = 0;
  assert.equal(compareObservations(before(), item, options).change_percent, -100);
  assert.ok(classifyObservation(item, options, before()).classes.includes('measured_decrease'));
  item.metric.value = 100;
  assert.deepEqual(classifyObservation(item, options, before()).classes, ['observed_search_demand', 'measured_unchanged']);
});

test('rebased indexes, rank and rate changes are not fabricated percentage demand growth', () => {
  for (const kind of ['index', 'rank', 'rate']) {
    const a = before(); const b = observation(); a.metric.kind = b.metric.kind = kind;
    assert.equal(compareObservations(a, b, options).reason, 'unsupported_metric_kind');
    assert.deepEqual(classifyObservation(b, options, a).classes, ['observed_metric']);
  }
});

test('site visibility remains site visibility, not total keyword demand', () => {
  const item = observation(); item.metric.interpretation = 'site_visibility';
  assert.deepEqual(classifyObservation(item, options).classes, ['observed_metric']);
});

test('feed, discussion, research and hypotheses remain distinct from measured growth', () => {
  for (const [kind, label] of [['trend_feed', 'current_trend_feed'], ['discussion', 'discussion_signal'], ['research', 'source_backed_research'], ['hypothesis', 'research_hypothesis']]) {
    const item = observation({ kind, metric: null, period: null });
    assert.deepEqual(classifyObservation(item, options, before()).classes, [label]);
  }
});

test('seasonal timing needs a recorded review and cannot contain invented demand', () => {
  const item = observation({ kind: 'seasonal', metric: null, period: null });
  assert.equal(validateObservation(item, options).valid, false);
  item.review = { reviewer_id: 'reviewer', reviewed_at: '2026-09-20T00:00:00Z' };
  assert.deepEqual(classifyObservation(item, options).classes, ['seasonally_relevant']);
  item.metric = observation().metric;
  assert.equal(validateObservation(item, options).valid, false);
});

test('human seasonal review may happen after collection, but never in the future', () => {
  const item = observation({ kind: 'seasonal', metric: null, period: null,
    review: { reviewer_id: 'reviewer', reviewed_at: '2026-09-22T10:00:00Z' } });
  assert.equal(validateObservation(item, options).valid, true);
  assert.deepEqual(classifyObservation(item, options).classes, ['seasonally_relevant']);
  item.review.reviewed_at = '2026-09-22T13:00:00Z';
  const result = validateObservation(item, options);
  assert.equal(result.valid, false);
  assert.ok(result.issues.some(issue => issue.code === 'future_review'));
});

test('expired historical baseline requires a reviewed reuse policy before comparison', () => {
  const previous = before(); previous.expires_at = options.now;
  const result = compareObservations(previous, observation(), options);
  assert.equal(result.comparable, false);
  assert.equal(result.change_percent, null);
  assert.ok(result.issues.some(issue => issue.code === 'expired'));
});

test('duplicate report identity ignores local IDs and recapture time but retains reporting history', () => {
  const a = observation(); const b = observation({ id: 'new-internal-id', captured_at: '2026-09-22T00:00:00Z', query: 'ＦＡＬＬ   seedlings' });
  assert.equal(observationIdentity(a), observationIdentity(b));
  assert.notEqual(observationIdentity(a), observationIdentity(before()));
  b.metric.value = 150;
  assert.equal(observationIdentity(a), observationIdentity(b), 'a provider correction is same report identity, not independent corroboration');
  b.dataset_scope = 'different-account';
  assert.notEqual(observationIdentity(a), observationIdentity(b));
});

test('feed observations retain distinct occurrence times and no opportunity ID is generated', () => {
  const a = observation({ kind: 'trend_feed', period: null, metric: null });
  const b = { ...a, observed_at: '2026-09-21T00:00:00Z' };
  assert.notEqual(observationIdentity(a), observationIdentity(b));
  assert.equal('opportunity_id' in validateObservation(a, options).observation, false);
});
