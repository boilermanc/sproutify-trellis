import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchTrendsRss, importRisingCsv, normalizeQuery, parseCsv, parseTrendsRss, sanitizePII, selectOpportunities, validateConfig, validateDraft } from '../supabase/functions/_shared/trend-radar.mjs';

const config = validateConfig({ website: 'https://farm.example', country: 'US', brief: 'We sell vegetable seedlings to home gardeners.', existing_pages: ['https://farm.example/planting'], interval_days: 7 });
const link = 'https://trends.google.com/trends/explore?geo=US&cat=269&date=today%2012-m&q=seedlings';
const captured = '2026-09-10T12:00:00Z';
const xml = `<?xml version="1.0"?><rss><channel><item><title><![CDATA[seedlings & soil]]></title><ht:approx_traffic>2000+</ht:approx_traffic><pubDate>Sat, 12 Sep 2026 08:00:00 GMT</pubDate><ht:news_item><ht:news_item_title>Garden &amp; seedlings</ht:news_item_title><ht:news_item_url>https://farm.example/news?a=1&amp;b=2</ht:news_item_url></ht:news_item></item></channel></rss>`;

test('country-wide RSS retains approximate traffic without inventing growth or monthly volume', () => {
  const [signal] = parseTrendsRss(xml, 'US', captured);
  assert.equal(signal.query, 'seedlings & soil');
  assert.equal(signal.traffic_display, '2000+');
  assert.equal(signal.growth_percent, null);
  assert.equal(signal.growth_display, null);
  assert.equal(signal.news[0].url, 'https://farm.example/news?a=1&b=2');
  assert.equal(signal.published_at, '2026-09-12T08:00:00.000Z');
  assert.equal(signal.captured_at, captured);
  assert.ok(!('search_volume' in signal));
});
test('empty RSS is valid; HTML error pages are failures, not zero-interest evidence', () => {
  assert.deepEqual(parseTrendsRss('<rss><channel></channel></rss>', 'US'), []);
  assert.throws(() => parseTrendsRss('<html>Rate limited</html>', 'US'), /unexpected feed/);
});
test('the feed adapter reports rate limits without retrying or fabricating a result', async () => {
  let calls = 0;
  await assert.rejects(fetchTrendsRss('US', async () => { calls++; return new Response('blocked', { status: 429 }); }), /HTTP 429/);
  assert.equal(calls, 1);
  const rows = await fetchTrendsRss('US', async url => { assert.equal(url, 'https://trends.google.com/trending/rss?geo=US'); return new Response(xml); });
  assert.equal(rows.length, 1);
});
test('CSV parser supports BOM, quoted commas, escaped quotes, and multiline fields', () => {
  assert.deepEqual(parseCsv('\uFEFFRISING\r\n"seedlings, \"\"fall\"\"",50\r\n"two\nlines",100'), [['RISING'], ['seedlings, "fall"', '50'], ['two\nlines', '100']]);
  assert.throws(() => parseCsv('RISING\n"unfinished,50'), /unfinished/);
});
test('imports Rising only, preserves filters, and treats Breakout as an open-ended label', () => {
  const rows = importRisingCsv('Category: Gardening\nTOP\nseedlings,100\nRISING\nfall seedlings,Breakout\nlettuce seedlings,50\n"seedlings, garden","5,000%"', link, captured);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].growth_percent, null);
  assert.equal(rows[0].growth_display, 'Breakout');
  assert.equal(rows[1].growth_percent, 50);
  assert.equal(rows[2].growth_percent, 5000);
  assert.deepEqual(rows[0].filters, { country: 'US', category: '269', date: 'today 12-m', seed: 'seedlings', property: 'web' });
  assert.equal(rows[0].source_url, link);
});
test('Top values, missing geography, misleading URLs, and future imports are rejected', () => {
  assert.throws(() => importRisingCsv('TOP\nseedlings,100', link, captured), /No Rising/);
  assert.throws(() => importRisingCsv('RISING\nseedlings,50', 'https://trends.google.com/trends/explore?date=today%2012-m', captured), /country and date/);
  assert.throws(() => importRisingCsv('RISING\nseedlings,50', link.replace('trends.google.com', 'trends.google.com.example'), captured), /Explore link/);
  assert.throws(() => importRisingCsv('RISING\nseedlings,50', link, '2099-01-01'), /future/);
});
test('duplicate imported queries collapse deterministically', () => {
  const rows = importRisingCsv('Query,Growth\nFall Seedlings,50%\nfall   seedlings,50%', link, captured);
  assert.equal(rows.length, 1);
  assert.equal(normalizeQuery(' ＦＡＬＬ  Seedlings '), 'fall seedlings');
});
test('configuration bounds cadence and restricts existing pages to the brand website', () => {
  assert.throws(() => validateConfig({ ...config, interval_days: 0 }), /daily or weekly/);
  assert.throws(() => validateConfig({ ...config, existing_pages: ['https://unrelated.example/article'] }), /this website/);
  assert.throws(() => validateConfig({ ...config, website: 'https://user:password@farm.example' }), /HTTPS/);
  assert.equal(validateConfig({ ...config, auto_draft: 'true' }).auto_draft, false);
});
const sources = [{ title: 'Planting guide', url: 'https://farm.example/planting' }];
const strong = { query: 'fall seedlings', title: 'A planting guide', business_fit: 'strong', rationale: 'Gardeners need timing advice.', recommendation: 'new_article', source_indexes: [0], buyer_intent: 'Plan planting' };
test('AI cannot create evidence URLs, verified growth, or opportunities without strong fit', () => {
  const output = selectOpportunities({ opportunities: [strong, { ...strong, query: 'sports', business_fit: 'weak' }, { ...strong, query: 'invented source', source_indexes: [99] }] }, sources, [], config);
  assert.equal(output.length, 1);
  assert.equal(output[0].evidence.kind, 'search_research');
  assert.equal(output[0].evidence.signal, null);
  assert.deepEqual(output[0].evidence.sources, sources);
});
test('only exact normalized signal matches inherit feed evidence', () => {
  const signals = [{ query: 'FALL  SEEDLINGS', source_kind: 'google_trends_rss', traffic_display: '1000+' }];
  const output = selectOpportunities({ opportunities: [strong, { ...strong, query: 'buy fall seedlings' }] }, sources, signals, config);
  assert.equal(output[0].evidence.kind, 'google_trends_rss');
  assert.equal(output[1].evidence.kind, 'search_research');
});
test('updates must target a known brand page and duplicate AI suggestions collapse', () => {
  const output = selectOpportunities({ opportunities: [strong, { ...strong, query: 'FALL SEEDLINGS' }, { ...strong, query: 'lettuce', recommendation: 'update_existing', existing_url: 'https://farm.example/missing' }, { ...strong, query: 'planting', recommendation: 'update_existing', existing_url: config.existing_pages[0] }] }, sources, [], config);
  assert.equal(output.length, 2);
  assert.equal(output[1].existing_url, config.existing_pages[0]);
});
test('invalid model shapes safely produce no opportunities', () => {
  assert.deepEqual(selectOpportunities({}, sources, [], config), []);
  assert.deepEqual(selectOpportunities({ opportunities: [null, false, []] }, sources, [], config), []);
});
test('drafts must contain a complete article and sanitize sensitive text', () => {
  assert.throws(() => validateDraft({ title: 'A title', article_markdown: 'An outline' }), /complete article/);
  const draft = validateDraft({ title: 'Fall planting', article_markdown: `${'A useful planting explanation. '.repeat(20)} 123-45-6789`, social_posts: [{ platform: 'facebook', text: 'Contact person@example.com' }] });
  assert.ok(!draft.article_markdown.includes('123-45-6789'));
  assert.ok(!draft.social_posts[0].text.includes('person@example.com'));
  assert.equal(sanitizePII('4111 1111 1111 1111'), '[REDACTED_NUMBER]');
  assert.equal(sanitizePII('123456789'), '[REDACTED_SSN]');
});

test('draft citations resolve trusted URLs after scrubbing without corrupting redirect IDs', () => {
  const url = 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/' + 'a'.repeat(70);
  const raw = { title: 'Planting', article_markdown: 'Useful gardening advice. '.repeat(20) + ' [Extension guide](source:0)' };
  const draft = validateDraft(raw, [{ url }]);
  assert.ok(draft.article_markdown.includes(url));
  assert.ok(!draft.article_markdown.includes('source:0'));
  const needsReview = validateDraft({ ...raw, article_markdown: raw.article_markdown + ' [1.2.3, 2.4.5]' }, [{ url }]);
  assert.equal(needsReview.citation_review_required, true);
  assert.ok(!needsReview.article_markdown.includes('[1.2.3'));
  assert.throws(() => validateDraft(raw, [{ url: 'javascript:alert(1)' }]), /unknown/);
  assert.throws(() => validateDraft({ ...raw, article_markdown: raw.article_markdown.replace('source:0','source:9') }, [{ url }]), /unknown/);
  const bibliography = validateDraft({ ...raw, article_markdown: 'Advice. '.repeat(60) }, [{ url }]);
  assert.equal(bibliography.citation_review_required, true);
  assert.ok(bibliography.article_markdown.includes(url));
});
