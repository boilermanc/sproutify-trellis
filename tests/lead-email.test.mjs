import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { createServer } from 'vite';

let server;
let classifyLeadEmailEligibility;
let leadPlainTextToHtml;
let buildLeadEmailHtml;
let LEAD_CC_RECIPIENTS;
let LEAD_EMAIL_TEMPLATES;
let applyLeadTemplate;
let extractLatestReply;
let emailList;
let renderLeadComplianceFooter;
let renderLeadSequenceHtml;

before(async () => {
  server = await createServer({ appType: 'custom', configFile: false, logLevel: 'silent', root: process.cwd(), server: { middlewareMode: true } });
  ({ classifyLeadEmailEligibility, leadPlainTextToHtml, buildLeadEmailHtml, LEAD_CC_RECIPIENTS } = await server.ssrLoadModule('/leadService.ts'));
  ({ LEAD_EMAIL_TEMPLATES, applyLeadTemplate } = await server.ssrLoadModule('/components/leads/leadEmailTemplates.ts'));
  ({ extractLatestReply, emailList } = await server.ssrLoadModule('/supabase/functions/_shared/reply-content.ts'));
  ({ renderLeadComplianceFooter, renderLeadSequenceHtml } = await server.ssrLoadModule('/supabase/functions/_shared/lead-sequence-template.ts'));
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

test('offers a cleaned Sproutify Farm HTML partnership template with the real logo', () => {
  const template = LEAD_EMAIL_TEMPLATES.find(item => item.id === 'new-farm-partnership-html');
  assert.ok(template);
  assert.equal(template.name, 'Introducing Sproutify Farm — HTML');
  assert.equal(template.subject, 'Introducing Sproutify Farm for your Tower Farm project');
  assert.equal(template.bodyFormat, 'html');
  assert.match(template.body, />Introducing Sproutify Farm<\/p>/);
  assert.match(template.body, /Tower &amp; port management/);
  assert.match(template.body, /Reply to Schedule a Demo/);
  assert.doesNotMatch(template.body, /and we\.<\/p>|\(link to farm\.sproutify\.app\)/);
  assert.match(template.body, /https:\/\/www\.sproutify\.app\/images\/sproutify-farm-white\.png/);
  assert.match(template.body, /<!-- SPROUTIFY_COMPLIANCE_FOOTER -->/);
  assert.doesNotMatch(template.body, /\{\{body_copy\}\}|#8217;|href="#"/);
  assert.doesNotMatch(template.body, /Congratulations on your new Tower Farm|Congrats on your new Tower Farm/);
});

test('keeps only the newly written Outlook reply', () => {
  const reply = extractLatestReply(`I have not ordered anything from you.\n\nSara\n\n**********************************************\nSHAHLA SARA MAHDAVI\n\n________________________________\nFrom: Sheree <sheree@sproutify.app>\nSubject: Original message\nOriginal copy and tracked URLs`);
  assert.equal(reply, 'I have not ordered anything from you.\n\nSara');
});

test('strips Gmail quoted replies and normalizes CC addresses', () => {
  assert.equal(extractLatestReply('Thanks for the note.\n\nOn Thu, Aug 20, 2026 at 9:00 AM Sheree wrote:\n> Original'), 'Thanks for the note.');
  assert.deepEqual(emailList(['Bret <bret.bowlin@towerfarms.com>', 'Sheree <SHEREE@SPROUTIFY.APP>']), [
    'bret.bowlin@towerfarms.com',
    'sheree@sproutify.app',
  ]);
});

test('renders every farm sequence template from the shared production renderer', () => {
  const footer = renderLeadComplianceFooter('diana@example.com', 'sproutify-farm', 'https://example.supabase.co');
  const expectations = [
    ['farm-introduction', 'Introducing Sproutify Farm for your Tower Farm project'],
    ['farm-follow-up', 'Just making sure this landed'],
    ['farm-value-add', 'A smoother first harvest starts with the schedule'],
    ['farm-soft-close', 'Should I keep your Sproutify Farm access open?'],
  ];
  for (const [templateKey, heading] of expectations) {
    const html = renderLeadSequenceHtml(templateKey, 'Diana', footer);
    assert.match(html, /Hi Diana,/);
    assert.ok(html.includes(heading));
    assert.match(html, /diana%40example\.com/);
    assert.match(html, /Unsubscribe/);
  }
});

test('personalizes the HTML template and places one compliance footer at its marker', () => {
  const template = LEAD_EMAIL_TEMPLATES.find(item => item.id === 'new-farm-partnership-html');
  const filled = applyLeadTemplate(template, 'Diana');
  const html = buildLeadEmailHtml({
    body: filled.body,
    bodyFormat: filled.bodyFormat,
    recipientEmail: 'diana@example.com',
  });
  assert.match(html, /Hi Diana,/);
  assert.doesNotMatch(html, /SPROUTIFY_COMPLIANCE_FOOTER/);
  assert.equal((html.match(/>Unsubscribe</g) || []).length, 1);
});
