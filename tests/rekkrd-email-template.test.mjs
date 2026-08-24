import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const templateUrl = new URL('../docs/email-templates/rekkrd-founder-letter.html', import.meta.url);
const migrationUrl = new URL('../supabase/migrations/20260824173000_seed_rekkrd_founder_letter_email_template.sql', import.meta.url);
const senderUrl = new URL('../supabase/functions/campaign-sender/index.ts', import.meta.url);

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
  assert.doesNotMatch(html, /href="#"/);
});

test('seed is branch-scoped, idempotent, and uses the canonical HTML', async () => {
  const [html, sql] = await Promise.all([
    readFile(templateUrl, 'utf8'),
    readFile(migrationUrl, 'utf8'),
  ]);
  const embeddedHtml = sql.match(/\$rekkrd_html\$([\s\S]*?)\$rekkrd_html\$/)?.[1];

  assert.equal(embeddedHtml, html.trimEnd());
  assert.match(sql, /WHERE b\.slug = 'rekkrd'/);
  assert.match(sql, /ON CONFLICT \(id\) DO UPDATE/);
  assert.match(sql, /'Rekkrd Founder Letter'/);
});

test('send worker removes the complete greeting block when a name is unavailable', async () => {
  const sender = await readFile(senderUrl, 'utf8');

  assert.match(sender, /IF_FIRST_NAME/);
  assert.match(sender, /firstName \? content : ""/);
  assert.match(sender, /r\.first_name\?\.trim\(\)/);
});
