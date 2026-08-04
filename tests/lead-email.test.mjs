import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let classifyLeadEmailEligibility;
let leadPlainTextToHtml;

before(async () => {
  server = await createServer({ appType: 'custom', configFile: false, logLevel: 'silent', root: process.cwd(), server: { middlewareMode: true } });
  ({ classifyLeadEmailEligibility, leadPlainTextToHtml } = await server.ssrLoadModule('/leadService.ts'));
});

after(async () => { await server?.close(); });

test('hard-blocks bounce and complaint suppressions', () => {
  const result = classifyLeadEmailEligibility({ isSubscribed: true, marketingPause: false, suppressionReasons: ['bounce', 'complaint'] });
  assert.equal(result.hardBlocked, true);
  assert.deepEqual(result.hardBlockReasons, ['bounce', 'complaint']);
});

test('warns without blocking for newsletter unsubscribe state', () => {
  const result = classifyLeadEmailEligibility({ isSubscribed: false, marketingPause: false, suppressionReasons: ['unsubscribe'] });
  assert.equal(result.hardBlocked, false);
  assert.equal(result.marketingUnsubscribed, true);
});

test('escapes user text while preserving line breaks for the RPC HTML field', () => {
  const html = leadPlainTextToHtml('Hello <Farm>\nA & B');
  assert.match(html, /Hello &lt;Farm&gt;\nA &amp; B/);
  assert.doesNotMatch(html, /<Farm>/);
});
