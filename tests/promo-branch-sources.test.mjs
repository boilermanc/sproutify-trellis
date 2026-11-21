import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('branch product sources store repository and opaque capture references without credentials', async () => {
  const sql = await read('../supabase/migrations/20260825175823_add_promo_branch_sources.sql');
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.promo_branch_sources/);
  assert.match(sql, /UNIQUE \(branch_id\)/);
  assert.match(sql, /repository_full_name TEXT NOT NULL/);
  assert.match(sql, /capture_auth_profile_key TEXT/);
  assert.doesNotMatch(sql, /access_token|service_role_key|password|client_secret/i);
  assert.match(sql, /ALTER TABLE public\.promo_branch_sources FORCE ROW LEVEL SECURITY/);
  assert.match(sql, /private\.can_access_promo_branch_source/);
});

test('only the verified Rekkrd repository mapping is seeded and capture details stay unresolved', async () => {
  const sql = await read('../supabase/migrations/20260825175823_add_promo_branch_sources.sql');
  assert.match(sql, /'boilermanc\/rekkrd'/);
  assert.match(sql, /WHERE b\.slug = 'rekkrd'/);
  assert.doesNotMatch(sql, /capture_base_url[^\n]*https?:\/\//i);
});

test('Promo Studio resolves evidence scans and readiness from the selected branch source', async () => {
  const [edge, page, service] = await Promise.all([
    read('../supabase/functions/promo-studio/index.ts'),
    read('../pages/PromoStudio.tsx'),
    read('../services/promoStudioService.ts'),
  ]);
  assert.match(edge, /from\("promo_branch_sources"\)/);
  assert.match(edge, /repository: source\.repository_full_name/);
  assert.doesNotMatch(edge, /repository: body\.repository/);
  assert.match(edge, /source: source\.data/);
  assert.match(service, /source: PromoBranchSource \| null/);
  assert.match(page, /detail\.source\.repository_full_name/);
});
