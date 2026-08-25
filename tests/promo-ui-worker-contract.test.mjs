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
  assert.match(service, /'generate_creative_plan'/);
  assert.match(service, /'create_revision'/);
  assert.match(service, /'approve_claim'/);
  assert.match(service, /'approve_script'/);
  assert.doesNotMatch(service, /\.from\(['"]promo_/);
});

test('Creative Director output enters explicit claims and script review', async () => {
  const [page, edge] = await Promise.all([
    read('../pages/PromoStudio.tsx'), read('../supabase/functions/promo-studio/index.ts'),
  ]);
  assert.match(page, /Claims review/);
  assert.match(page, /Script review/);
  assert.match(page, /Unsupported claims block strict-mode final approval/);
  assert.match(page, /Generate evidence plan/);
  assert.match(page, /Approve claim/);
  assert.match(page, /Approve script & continue/);
  assert.match(edge, /action === "generate_creative_plan"/);
  assert.match(edge, /parsePromoCreativePlan\(sanitizePromoJson\(rawPlan\), evidence\)/);
  assert.match(edge, /status: "script_review"/);
  assert.match(edge, /approved: false/);
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
