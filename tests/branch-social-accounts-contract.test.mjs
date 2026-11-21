import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationUrl = new URL('../supabase/migrations/20260812172928_add_branch_social_accounts.sql', import.meta.url);
const privilegeMigrationUrl = new URL('../supabase/migrations/20260812173342_restrict_branch_social_accounts_privileges.sql', import.meta.url);
const serviceUrl = new URL('../services/branchSocialAccountsService.ts', import.meta.url);

test('registry supports multiple YouTube accounts per branch using immutable channel IDs', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /UNIQUE \(branch_id, platform, external_account_id\)/);
  assert.doesNotMatch(sql, /UNIQUE \(branch_id, platform\)(?!,)/);
  assert.match(sql, /UCwk6PPLPh_txSnDf-pzPCJA/);
  assert.match(sql, /UC-O8IHGO4buM4NkOPmc59mw/);
  assert.match(sql, /WHERE b\.slug = 'rekkrd'/);
});

test('registry is RLS protected and exposes no OAuth token columns', async () => {
  const sql = await readFile(migrationUrl, 'utf8');
  const privileges = await readFile(privilegeMigrationUrl, 'utf8');

  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /private\.is_active_trellis_user\(\)/);
  assert.match(sql, /private\.can_manage_marketing\(\)/);
  assert.doesNotMatch(sql, /access_token|refresh_token|client_secret/i);
  assert.match(privileges, /REVOKE ALL .* FROM anon, authenticated/);
  assert.match(privileges, /GRANT SELECT, INSERT, UPDATE, DELETE .* TO authenticated/);
});

test('frontend reads and writes the durable registry', async () => {
  const service = await readFile(serviceUrl, 'utf8');

  assert.match(service, /\.from\('branch_social_accounts'\)/);
  assert.match(service, /export async function fetchBranchSocialAccounts/);
  assert.match(service, /export async function replaceBranchSocialAccounts/);
  assert.match(service, /migrateLegacyBranchSocialAccounts/);
});
