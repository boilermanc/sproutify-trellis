import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let service;
before(async () => {
  server = await createServer({ appType: 'custom', configFile: false, logLevel: 'silent', root: process.cwd(), server: { middlewareMode: true } });
  service = await server.ssrLoadModule('/services/creativeStudioIdeas.ts');
});
after(async () => server?.close());

const branch = { id: 'branch-id', slug: 'alpha', name: 'Alpha', website_url: 'https://alpha.example' };
const brand = { branch_id: 'alpha', status: 'active', mission: 'Teach practical growing skills.', target_audience: 'New gardeners', voice: 'Helpful', marketing_hooks: ['Grow with confidence'] };
const job = (id, overrides = {}) => ({ id, branch: 'alpha', status: 'completed', format: 'static', created_at: '2026-10-01T00:00:00Z', request_payload: { message: id }, ...overrides });

test('recent history is branch-scoped, newest first, bounded, and excludes Card Studio backgrounds', () => {
  const jobs = [job('old'), job('foreign', { branch: 'beta' }), job('background', { request_payload: { purpose: 'card_background' } }), job('new', { created_at: '2026-10-03T00:00:00Z' })];
  const original = structuredClone(jobs);
  assert.deepEqual(service.recentCreativeJobs(jobs, 'alpha').map(item => item.id), ['new', 'old']);
  assert.deepEqual(jobs, original);
  assert.equal(service.recentCreativeJobs(Array.from({ length: 15 }, (_, i) => job(String(i))), 'alpha').length, 6);
});

test('history distinguishes completion from publication and scheduling', () => {
  assert.equal(service.creativeHistoryStatus(job('draft')), 'Draft · ready');
  assert.equal(service.creativeHistoryStatus(job('published', { publish_status: 'published' })), 'Published');
  assert.equal(service.creativeHistoryStatus(job('published', { status: 'published' })), 'Published');
  assert.equal(service.creativeHistoryStatus(job('scheduled', { publish_status: 'scheduled' })), 'Scheduled');
  assert.equal(service.creativeHistoryStatus(job('failed', { status: 'failed' })), 'Generation failed');
  assert.equal(service.creativeHistoryStatus(job('review', { status: 'awaiting_approval' })), 'Needs review');
});

test('history titles support original requests, JSON copy, text scripts, and empty records', () => {
  assert.equal(service.creativeHistoryTitle(job('request')), 'request');
  assert.equal(service.creativeHistoryTitle(job('json', { request_payload: {}, script: '{"headline":"Hello"}' })), 'Hello');
  assert.equal(service.creativeHistoryTitle(job('text', { request_payload: {}, script: 'Spoken introduction' })), 'Spoken introduction');
  assert.equal(service.creativeHistoryTitle(job('blank', { request_payload: {} })), 'Untitled creative');
});

test('context excludes other brands, arbitrary request fields, credentials, and unsupported performance', () => {
  const context = service.buildCreativeIdeaContext(branch, brand, [job('safe', { request_payload: { message: 'Payment 4111 1111 1111 1111', api_key: 'never-send-this' }, caption: 'hello' }), job('foreign', { branch: 'beta' })]);
  const text = JSON.stringify(context);
  assert.equal(context.audience, 'New gardeners');
  assert.equal(context.recent.length, 1);
  assert.ok(text.includes('[REDACTED_CC]'));
  assert.ok(!text.includes('4111'));
  assert.ok(!text.includes('never-send-this'));
  assert.ok(!text.includes('foreign'));
  const wrongBrand = service.buildCreativeIdeaContext(branch, { ...brand, branch_id: 'beta' }, []);
  assert.equal(wrongBrand.summary, '');
  assert.deepEqual(wrongBrand.hooks, []);
  const archived = service.buildCreativeIdeaContext(branch, { ...brand, status: 'archived' }, []);
  assert.equal(archived.audience, '');
});

test('missing history is explicitly unknown and cannot leak stale jobs into suggestions', () => {
  const context = service.buildCreativeIdeaContext(branch, brand, [job('stale')], false);
  assert.equal(context.historyAvailable, false);
  assert.deepEqual(context.recent, []);
  const prompt = service.buildCreativeIdeasPrompt(context);
  assert.match(prompt, /No performance data is supplied/);
  assert.match(prompt, /untrusted reference data/);
  assert.match(prompt, /Missing history is unknown/);
});

test('three usable starter ideas work for arbitrary brands, including missing DNA', () => {
  for (const name of ['Rekkrd', 'ATL Urban Farms', 'A Brand Added Tomorrow']) {
    const context = service.buildCreativeIdeaContext({ ...branch, name }, null, []);
    const ideas = service.starterCreativeIdeas(context);
    assert.equal(ideas.length, 3);
    assert.deepEqual(ideas.map(idea => idea.format), ['video', 'static', 'carousel']);
    assert.ok(ideas.every(idea => idea.brief.includes(name) && idea.hook && idea.rationale));
  }
});

const generated = () => ({ ideas: ['video', 'static', 'carousel'].map(format => ({ title: `${format} direction`, hook: `A ${format} hook`, brief: `Create a ${format} about confirmed facts.`, rationale: 'An idea to test.', format })) });

test('validates exactly three distinct, bounded ideas and supported formats', () => {
  assert.equal(service.parseCreativeIdeas(JSON.stringify(generated())).length, 3);
  const invalid = [];
  invalid.push({ ideas: generated().ideas.slice(0, 2) });
  invalid.push({ ideas: [...generated().ideas, generated().ideas[0]] });
  for (const edit of [
    idea => { idea.format = 'podcast'; },
    idea => { idea.brief = ''; },
    idea => { idea.title = 'long title '.repeat(12); },
  ]) { const output = generated(); edit(output.ideas[0]); invalid.push(output); }
  const duplicates = generated(); duplicates.ideas[1].brief = duplicates.ideas[0].brief; invalid.push(duplicates);
  const formats = generated(); formats.ideas[1].format = 'video'; invalid.push(formats);
  for (const output of invalid) assert.throws(() => service.parseCreativeIdeas(JSON.stringify(output)));
  assert.throws(() => service.parseCreativeIdeas('not json'));
});

test('sanitizes model output before it can populate a brief', () => {
  const output = generated(); output.ideas[0].brief = 'Do not repeat 4111 1111 1111 1111.';
  assert.match(service.parseCreativeIdeas(JSON.stringify(output))[0].brief, /\[REDACTED_CC\]/);
});
