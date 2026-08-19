import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let classifyLeadEmailEligibility;
let leadPlainTextToHtml;
let buildLeadEmailHtml;
let LEAD_CC_RECIPIENTS;

before(async () => {
  server = await createServer({ appType: 'custom', configFile: false, logLevel: 'silent', root: process.cwd(), server: { middlewareMode: true } });
  ({ classifyLeadEmailEligibility, leadPlainTextToHtml, buildLeadEmailHtml, LEAD_CC_RECIPIENTS } = await server.ssrLoadModule('/leadService.ts'));
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

test('copies Bret and Sheree on outbound lead emails', () => {
  assert.deepEqual([...LEAD_CC_RECIPIENTS], [
    'bret.bowlin@towerfarms.com',
    'sheree@sproutify.app',
  ]);
});

test('preserves pasted HTML and inserts the compliance footer before the closing body tag', () => {
  const html = buildLeadEmailHtml({
    body: '<html><body><h1>Welcome</h1></body></html>',
    bodyFormat: 'html',
    recipientEmail: 'lead@example.com',
  });
  assert.match(html, /<h1>Welcome<\/h1>/);
  assert.match(html, /Unsubscribe[\s\S]*<\/body><\/html>$/);
  assert.doesNotMatch(html, /&lt;h1&gt;/);
});

test('continues escaping markup in plain-text mode', () => {
  const html = buildLeadEmailHtml({
    body: '<h1>Not HTML</h1>',
    bodyFormat: 'text',
    recipientEmail: 'lead@example.com',
  });
  assert.match(html, /&lt;h1&gt;Not HTML&lt;\/h1&gt;/);
  assert.doesNotMatch(html, /<h1>Not HTML<\/h1>/);
});
