import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('Promo Studio is a first-class Trellis route and branch-scoped workspace', async () => {
  const [types, app, layout, page] = await Promise.all([
    read('../types.ts'), read('../App.tsx'), read('../components/Layout.tsx'), read('../pages/PromoStudio.tsx'),
  ]);
  assert.match(types, /'promo-studio'/);
  assert.match(app, /case 'promo-studio'/);
  assert.match(layout, /id: 'promo-studio'/);
  assert.match(page, /branch_id: branchId/);
  assert.match(page, /What is real, and what is missing/);
});

test('browser mutations use only the Promo Studio Edge Function', async () => {
  const service = await read('../services/promoStudioService.ts');
  assert.match(service, /functions\.invoke\('promo-studio'/);
  assert.doesNotMatch(service, /\.from\(['"]promo_/);
});

test('no-op worker claims only no-op jobs and completes with lease identity', async () => {
  const [worker, migration] = await Promise.all([
    read('../supabase/functions/promo-worker/index.ts'),
    read('../supabase/migrations/20260825162352_add_promo_studio_foundation.sql'),
  ]);
  assert.match(worker, /p_job_types: \["noop"\]/);
  assert.match(worker, /p_lease_token: job\.lease_token/);
  assert.match(worker, /complete_promo_job/);
  assert.match(migration, /p_job_types JSONB DEFAULT NULL/);
  assert.match(migration, /p_job_types \? j\.job_type/);
});
