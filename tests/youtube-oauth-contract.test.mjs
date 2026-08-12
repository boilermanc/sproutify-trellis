import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL('../supabase/migrations/20260812175054_add_account_scoped_social_credentials.sql', import.meta.url);
const permissionMigrationUrl = new URL('../supabase/migrations/20260812180340_narrow_account_credential_rpc_permissions.sql', import.meta.url);
const oauthUrl = new URL('../supabase/functions/youtube-oauth/index.ts', import.meta.url);
const serviceUrl = new URL('../services/socialService.ts', import.meta.url);
const wizardUrl = new URL('../pages/PlatformSetupWizard.tsx', import.meta.url);

test('credential uniqueness includes the branch social account identity', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  assert.match(sql, /UNIQUE NULLS NOT DISTINCT \(branch_id, platform, branch_social_account_id\)/);
  assert.match(sql, /REFERENCES public\.branch_social_accounts\(id\) ON DELETE CASCADE/);
  assert.match(sql, /Social account does not belong to this branch\/platform/);
});

test('account credential RPCs are explicitly permissioned and keep decrypted reads service-only', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const permissions = await readFile(permissionMigrationUrl, 'utf8');
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.upsert_social_account_credential[\s\S]+FROM PUBLIC, anon/);
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.get_social_account_credential[\s\S]+FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.get_social_account_credential[\s\S]+TO service_role/);
  assert.match(permissions, /REVOKE ALL ON FUNCTION public\.upsert_social_account_credential[\s\S]+FROM PUBLIC, anon, authenticated/);
  assert.match(permissions, /GRANT EXECUTE ON FUNCTION public\.upsert_social_account_credential[\s\S]+TO service_role/);
  assert.match(permissions, /save_social_account_app_credentials/);
  assert.doesNotMatch(permissions, /p_access_token|p_refresh_token/);
});

test('YouTube OAuth verifies the immutable channel ID before storing tokens', async () => {
  const source = await readFile(oauthUrl, 'utf8');
  const lookup = source.indexOf('channels?part=id,snippet&mine=true');
  const comparison = source.indexOf('channel.id !== credential.expected_external_account_id');
  const storage = source.indexOf('upsert_social_account_credential');

  assert.ok(lookup > -1, 'must call channels.list(mine=true)');
  assert.ok(comparison > lookup, 'must compare the returned channel after lookup');
  assert.ok(storage > comparison, 'must not store tokens before channel verification');
  assert.match(source, /access_type: "offline"/);
  assert.match(source, /youtube\.upload/);
  assert.match(source, /yt-analytics\.readonly/);
  assert.match(source, /signState/);
  assert.match(source, /verifyState/);
});

test('frontend routes YouTube through its account-scoped endpoint and requires a channel choice', async () => {
  const [service, wizard] = await Promise.all([
    readFile(serviceUrl, 'utf8'),
    readFile(wizardUrl, 'utf8'),
  ]);
  assert.match(service, /platform === 'youtube' \? 'youtube-oauth' : 'social-oauth'/);
  assert.match(service, /p_branch_social_account_id/);
  assert.match(wizard, /Exact YouTube Channel/);
  assert.match(wizard, /selectedSocialAccountId/);
  assert.match(wizard, /youtube-oauth\/callback/);
});
