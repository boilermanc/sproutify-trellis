import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTrendsRss, importRisingCsv, groundingSources } from '../supabase/functions/_shared/trend-radar.mjs';
import { classifyObservation, compareObservations, observationIdentity } from '../services/opportunityEvidence.mjs';
import { adaptTrendsRssSignal, adaptRisingCsvSignal, adaptGroundedResearch, adaptSeasonalBaseline } from '../services/opportunitySourceAdapters.mjs';

const captured = '2026-09-21T12:00:00Z';
const context = { id: 'observation-1', expectedScope: { brand_id: 'brand', branch_id: 'branch', project_id: 'project' }, dataset_scope: 'permitted-fixture', geography: 'US', language: 'en', captured_at: captured, expires_at: '2026-10-01T00:00:00Z', now: '2026-09-22T12:00:00Z', permission_reference: 'approved-owner-permission', record_reference: 'retained-import:1' };
const xml = '<rss><channel><item><title>fall seedlings</title><ht:approx_traffic>20K+</ht:approx_traffic><pubDate>Mon, 21 Sep 2026 08:00:00 GMT</pubDate><ht:news_item><ht:news_item_title>Planting news</ht:news_item_title><ht:news_item_url>https://news.example/planting</ht:news_item_url></ht:news_item></item></channel></rss>';
const rss = () => parseTrendsRss(xml, 'US', captured)[0];
const explore = 'https://trends.google.com/trends/explore?geo=US&date=today%2012-m&cat=269&q=gardening';
const rising = display => importRisingCsv(`RISING\nfall seedlings,${display}`, explore, captured, Date.parse(context.now))[0];
const research = () => ({ query: 'seedlings care guide', source: groundingSources({ groundingMetadata: { groundingChunks: [{ web: { uri: 'https://extension.example/care', title: 'Care guide' } }] } })[0] });
const seasonal = () => ({ topic: 'fall planting', source_url: 'https://extension.example/calendar', title: 'Reviewed planting calendar', statement: 'This reviewed local calendar suggests planning fall planting now.', reviewer_id: 'real-owner-reference', reviewed_at: context.now });

test('actual RSS parser output bridges without treating approximate traffic as monthly volume', () => {
  const source = rss(); const original = structuredClone(source);
  const result = adaptTrendsRssSignal(source, context);
  assert.equal(result.valid, true);
  assert.equal(result.observation.query, source.query);
  assert.equal(result.observation.metric.value, null);
  assert.equal(result.observation.metric.raw_value, '20K+');
  assert.equal(result.observation.period, null);
  assert.equal(result.source_details.news[0].url, source.news[0].url);
  assert.deepEqual(classifyObservation(result.observation, context).classes, ['current_trend_feed']);
  assert.deepEqual(source, original);
});

test('RSS source URL, geographic context and actual capture cannot be substituted', () => {
  for (const patch of [{ source_url: 'https://trends.google.com.evil.example/trending/rss?geo=US' }, { country: 'GB' }, { captured_at: '2026-09-20T12:00:00Z' }, { source_kind: 'google_trends_csv' }]) assert.equal(adaptTrendsRssSignal({ ...rss(), ...patch }, context).valid, false);
});

test('Rising percentage is kept as provider-reported raw growth, not computed demand', () => {
  const result = adaptRisingCsvSignal(rising('50%'), context);
  assert.equal(result.valid, true);
  assert.equal(result.observation.metric.value, 50);
  assert.equal(result.observation.metric.raw_value, '50%');
  assert.equal(result.observation.metric.unit, 'percent_change');
  assert.equal(result.source_details.filters.date, 'today 12-m');
  assert.equal(result.observation.period, null);
  assert.equal(compareObservations(result.observation, { ...result.observation, id: 'second' }, context).comparable, false);
});

test('Rising Breakout never becomes zero, infinity or an invented percentage', () => {
  const result = adaptRisingCsvSignal(rising('Breakout'), context);
  assert.equal(result.valid, true);
  assert.equal(result.observation.metric.value, null);
  assert.equal(result.observation.metric.raw_value, 'Breakout');
  assert.equal(result.source_details.growth_percent, null);
});

test('Rising source filters and display must match the parsed export', () => {
  for (const patch of [{ country: 'GB' }, { growth_percent: 99 }, { growth_display: 'Breakout' }, { source_url: 'https://trends.google.com/trends/explore?geo=GB&date=today%2012-m' }]) assert.equal(adaptRisingCsvSignal({ ...rising('50%'), ...patch }, context).valid, false);
  const source = rising('Breakout'); source.growth_percent = 5000;
  assert.equal(adaptRisingCsvSignal(source, context).valid, false);
  const wrongPath = rising('50%'); wrongPath.source_url = wrongPath.source_url.replace('/trends/explore', '/trends/explore-fake');
  assert.equal(adaptRisingCsvSignal(wrongPath, context).valid, false);
});

test('different Rising filters keep distinct observation identities', () => {
  const a = adaptRisingCsvSignal(rising('50%'), context).observation;
  const source = importRisingCsv('RISING\nfall seedlings,50%', explore.replace('cat=269', 'cat=0'), captured, Date.parse(context.now))[0];
  const b = adaptRisingCsvSignal(source, context).observation;
  assert.notEqual(observationIdentity(a), observationIdentity(b));
});

test('groundingSources output stays source-backed research with original source URL and no metrics', () => {
  const result = adaptGroundedResearch(research(), context);
  assert.equal(result.valid, true);
  assert.equal(result.observation.source.url, research().source.url);
  assert.equal(result.observation.metric, null);
  assert.deepEqual(classifyObservation(result.observation, context).classes, ['source_backed_research']);
});

test('grounding URL alone without retained batch/reference is insufficient evidence', () => {
  const { record_reference, ...missingReference } = context;
  assert.equal(adaptGroundedResearch(research(), missingReference).valid, false);
});

test('seasonal owner-reviewed baseline permits review after collection but not future approval', () => {
  const result = adaptSeasonalBaseline(seasonal(), context);
  assert.equal(result.valid, true);
  assert.deepEqual(classifyObservation(result.observation, context).classes, ['seasonally_relevant']);
  assert.equal(result.observation.metric, null);
  assert.equal(adaptSeasonalBaseline({ ...seasonal(), reviewed_at: '2026-09-23T00:00:00Z' }, context).valid, false);
  assert.equal(adaptSeasonalBaseline({ ...seasonal(), reviewer_id: '' }, context).valid, false);
});

test('all bridges require explicit permissions, brand scope, language and expiry', () => {
  for (const [adapter, input] of [[adaptTrendsRssSignal, rss()], [adaptRisingCsvSignal, rising('50%')], [adaptGroundedResearch, research()], [adaptSeasonalBaseline, seasonal()]]) {
    for (const missing of ['permission_reference', 'expectedScope', 'language', 'expires_at', 'captured_at']) {
      const ctx = { ...context }; delete ctx[missing];
      assert.equal(adapter(input, ctx).valid, false);
    }
    assert.equal(adapter(input, { ...context, expires_at: context.now }).valid, false);
  }
});

test('free-text claims and excerpts are scrubbed, while source URLs are preserved', () => {
  const result = adaptGroundedResearch({ ...research(), excerpt: 'Contact person@example.com, SSN 123-45-6789' }, context);
  assert.equal(result.valid, true);
  assert.ok(!result.observation.source.excerpt.includes('person@example.com'));
  assert.ok(!result.observation.source.excerpt.includes('123-45-6789'));
  assert.equal(result.observation.source.url, research().source.url);
});
