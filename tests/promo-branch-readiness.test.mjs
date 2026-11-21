import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  buildPromoBranchReadiness, validatePromoBranchSourceUpdate,
} from '../supabase/functions/_shared/promo-branch-readiness.ts';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const branch = (id, slug, name) => ({ id, slug, name, is_active: true });
const identity = slug => ({
  id: '90000000-0000-4000-8000-000000000001', branch_id: slug, name: slug, status: 'active',
  color_palette: { primary: '#112233', secondary: '#223344', accent: '#cc5500', neutral: '#f4f4f4' },
  typography: { heading: 'Inter', body: 'Inter' }, updated_at: '2026-09-03T12:00:00.000Z',
});

test('branch readiness is derived by branch identity instead of a Rekkrd special case', () => {
  const atlId = '10000000-0000-4000-8000-000000000001';
  const laneId = '10000000-0000-4000-8000-000000000002';
  const rows = buildPromoBranchReadiness({
    branches: [branch(atlId, 'atlurbanfarms', 'ATL Urban Farms'), branch(laneId, 'lanewise', 'LaneWise')],
    sources: [{ branch_id: atlId, is_active: true, repository_full_name: 'boilermanc/atlurbanfarms', default_ref: 'main', permitted_paths: ['src'], capture_base_url: 'https://capture.atlurbanfarms.com', capture_fixture_key: 'promo_public' }],
    brandIdentities: [identity('atlurbanfarms'), identity('lanewise')],
    socialAccounts: [{ branch_id: atlId, platform: 'instagram', status: 'active' }],
  });
  assert.equal(rows[0].fully_ready, true);
  assert.equal(rows[0].branch_slug, 'atlurbanfarms');
  assert.equal(rows[1].brand_ready, true);
  assert.equal(rows[1].repository_ready, false);
  assert.deepEqual(rows[1].blockers, ['Verified repository mapping', 'Production capture environment and fixture', 'Active Instagram destination']);
  assert.doesNotMatch(JSON.stringify(rows), /required.*rekkrd|rekkrd.*required/i);
});

test('branch source configuration accepts bounded GitHub and opaque capture references', () => {
  const parsed = validatePromoBranchSourceUpdate({
    branch_id: '10000000-0000-4000-8000-000000000001', repository_full_name: 'boilermanc/lanewise-site',
    default_ref: 'master', permitted_paths: ['src', 'public'], prohibited_paths: ['src/private'],
    capture_base_url: 'https://preview.lanewise.app/', capture_fixture_key: 'promo_public', capture_auth_profile_key: 'lanewise_demo',
  });
  assert.equal(parsed.repositoryFullName, 'boilermanc/lanewise-site');
  assert.equal(parsed.captureBaseUrl, 'https://preview.lanewise.app');
  assert.deepEqual(parsed.permittedPaths, ['src', 'public']);
});

test('branch source configuration rejects secrets, private hosts, and incomplete capture setup', () => {
  const base = {
    branch_id: '10000000-0000-4000-8000-000000000001', repository_full_name: 'boilermanc/product',
    default_ref: 'main', permitted_paths: ['src'], prohibited_paths: [],
  };
  assert.throws(() => validatePromoBranchSourceUpdate({ ...base, capture_base_url: 'https://user:pass@example.com', capture_fixture_key: 'public' }), /credential-free/i);
  assert.throws(() => validatePromoBranchSourceUpdate({ ...base, capture_base_url: 'https://127.0.0.1', capture_fixture_key: 'public' }), /private-network/i);
  assert.throws(() => validatePromoBranchSourceUpdate({ ...base, capture_base_url: 'https://preview.example.com' }), /fixture key/i);
  assert.throws(() => validatePromoBranchSourceUpdate({ ...base, capture_auth_profile_key: 'demo' }), /verified capture base URL/i);
});

test('Edge and UI expose branch-scoped readiness and admin-only source configuration', async () => {
  const [edge, page, service] = await Promise.all([
    read('../supabase/functions/promo-studio/index.ts'), read('../pages/PromoStudio.tsx'), read('../services/promoStudioService.ts'),
  ]);
  assert.match(edge, /action === "list_branch_readiness"/);
  assert.match(edge, /action === "upsert_branch_source"/);
  assert.match(edge, /Owner or admin access is required/);
  assert.match(edge, /configured_via: "promo_studio"/);
  assert.match(service, /listPromoBranchReadiness/);
  assert.match(page, /Configure branch production/);
  assert.match(page, /\['Instagram', selectedReadiness\.instagram_ready\]/);
  assert.doesNotMatch(edge, /if\s*\([^\n]*rekkrd[^\n]*\).*upsert_branch_source/i);
});
