import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Rekkrd consent maps both native preferences into branch consent', () => {
  const connector = read('spokeConnector.ts');
  const migration = read('supabase/migrations/20260824220214_fix_rekkrd_email_consent_and_campaign_stats.sql');
  assert.match(connector, /email_digest_optin/);
  assert.match(connector, /email_updates_optin/);
  assert.match(connector, /profile\.email_digest_optin === true \|\| profile\.email_updates_optin === true/);
  assert.match(migration, /'email_digest_optin', 'email_digest_optin'/);
  assert.match(migration, /'email_updates_optin', 'email_updates_optin'/);
});

test('Rekkrd branch and global unsubscribes mirror both native preferences', () => {
  const helper = read('supabase/functions/_shared/spoke-email-consent.ts');
  const unsubscribe = read('supabase/functions/unsubscribe/index.ts');
  const webhook = read('supabase/functions/resend-webhook/index.ts');
  assert.match(helper, /normalizedScope !== REKKRD_SCOPE && normalizedScope !== "global"/);
  assert.match(helper, /email_digest_optin: false, email_updates_optin: false/);
  assert.match(helper, /REKKRD_PROJECT_REF = "cvqqiuhloefvaaacwxkg"/);
  assert.match(unsubscribe, /writeBackBranchUnsubscribe\(supabase, email, scope\)/);
  assert.match(webhook, /else await writeBackBranchUnsubscribe\(supabase, email, scope\)/);
});

test('campaign statistics and recipient drill-down use exact campaign IDs', () => {
  const migration = read('supabase/migrations/20260824220214_fix_rekkrd_email_consent_and_campaign_stats.sql');
  const service = read('services/emailReportingService.ts');
  assert.match(migration, /CREATE OR REPLACE VIEW campaign_recipient_status_by_id/);
  assert.match(migration, /CREATE OR REPLACE VIEW campaign_link_clicks_by_id/);
  assert.match(migration, /COUNT\(DISTINCT lower\(email\)\) AS sent/);
  assert.match(service, /\.from\('campaign_stats_by_id'\)/);
  assert.match(service, /\.from\('campaign_recipient_status_by_id'\)/);
  assert.match(service, /\.eq\('campaign_id', campaignId\)/);
  assert.match(service, /\.in\('scope', suppressionScopesForCampaign\(branches\)\)/);
});
