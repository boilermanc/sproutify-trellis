import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const templateUrl = new URL('../docs/email-templates/rekkrd-founder-letter.html', import.meta.url);
const migrationUrl = new URL('../supabase/migrations/20260824223413_update_rekkrd_founder_footer.sql', import.meta.url);
const senderUrl = new URL('../supabase/functions/campaign-sender/index.ts', import.meta.url);
const templateId = '8d8ff75e-f0e5-4b8a-9852-c8fdaf3c3759';

const requiredDestinationUrls = [
  'https://rekkrd.com',
  'https://www.instagram.com/rekkrdapp/',
  'https://www.facebook.com/profile.php?id=61590210250901',
  'https://www.youtube.com/@RekkrdAfterDark',
  'https://www.youtube.com/@RekkrdListeningRoom',
  'https://rekkrd.com/listening-room',
  'https://rekkrd.com/support',
  'https://www.sweetwater.technology',
];

const requiredTokens = [
  'first_name',
  'intro_copy',
  'story_copy',
  'positioning_copy',
  'announcement_label',
  'announcement_headline',
  'announcement_copy',
  'cta_url',
  'cta_text',
  'supporting_copy',
  'feedback_copy',
  'unsubscribe_url',
];

test('Rekkrd founder letter exposes reusable campaign fields and compliance tokens', async () => {
  const html = await readFile(templateUrl, 'utf8');

  for (const token of requiredTokens) {
    assert.match(html, new RegExp(`\\{\\{${token}\\}\\}`), `missing {{${token}}}`);
  }
  assert.match(html, /role="presentation"/);
  assert.match(html, /max-width:600px/);
  assert.match(html, /<!-- IF_FIRST_NAME -->[\s\S]*?Hey \{\{first_name\}\},[\s\S]*?<!-- END_IF_FIRST_NAME -->/);
  for (const url of requiredDestinationUrls) {
    assert.ok(html.includes(`href="${url}"`), `missing destination ${url}`);
  }
  assert.match(html, /Built by/);
  assert.match(html, /Sweetwater Technology/);
  assert.equal(html.match(/\{\{unsubscribe_url\}\}/g)?.length, 1);
  assert.match(html, /href="\{\{unsubscribe_url\}\}"/);
  assert.doesNotMatch(html, /RESEND_UNSUBSCRIBE_URL/);
  assert.doesNotMatch(html, /href="#"/);
  assert.doesNotMatch(html, /href="\s*"/);
  assert.doesNotMatch(html, /href="\[https?:\/\//);
});

test('footer update is ID- and branch-scoped and uses the canonical HTML', async () => {
  const [html, sql] = await Promise.all([
    readFile(templateUrl, 'utf8'),
    readFile(migrationUrl, 'utf8'),
  ]);
  const embeddedHtml = sql.match(/\$rekkrd_html\$([\s\S]*?)\$rekkrd_html\$/)?.[1];

  assert.equal(embeddedHtml?.replace(/\r\n/g, '\n'), html.trimEnd().replace(/\r\n/g, '\n'));
  assert.match(sql, /AND b\.slug = 'rekkrd'/);
  assert.ok(sql.includes(templateId));
  assert.match(sql, /GET DIAGNOSTICS updated_count = ROW_COUNT/);
  assert.match(sql, /updated_count <> 1/);
});

test('send worker removes the complete greeting block when a name is unavailable', async () => {
  const sender = await readFile(senderUrl, 'utf8');

  assert.match(sender, /IF_FIRST_NAME/);
  assert.match(sender, /firstName \? content : ""/);
  assert.match(sender, /r\.first_name\?\.trim\(\)/);
});
