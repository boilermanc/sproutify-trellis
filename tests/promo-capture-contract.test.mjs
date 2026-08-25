import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { buildPromoCaptureJobInput } from '../supabase/functions/_shared/promo-capture.ts';
import { createDraftPromoManifest } from '../supabase/functions/_shared/promo-studio.ts';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

function fixture() {
  const manifest = createDraftPromoManifest({
    projectId: '10000000-0000-0000-0000-000000000001', revisionId: '20000000-0000-0000-0000-000000000001',
    ownerId: '30000000-0000-0000-0000-000000000001', organizationId: '00000000-0000-0000-0000-000000000001',
    branch: { id: '40000000-0000-0000-0000-000000000001', slug: 'rekkrd', name: 'Rekkrd' },
    title: 'Capture contract', prompt: 'Capture verified UI.', targetSeconds: 10, formats: ['9:16'], now: '2026-08-25T12:00:00.000Z',
  });
  manifest.script.status = 'approved';
  manifest.evidence.repository = {
    provider: 'github', full_name: 'boilermanc/rekkrd', ref: 'main', commit_sha: 'a'.repeat(40),
    source_worktree_dirty: false, source_diff_sha256: null, permitted_paths: ['src'], prohibited_paths: [],
  };
  manifest.evidence.capture_environment = 'https://capture.example.test/';
  manifest.evidence.routes = [{ id: 'preview', path: '/preview', evidence_refs: ['route:preview'] }];
  manifest.captures.scenarios = [{
    id: 'capture-plan-preview', key: 'rekkrd.preview', version: 1, repository_ref: 'main',
    commit_sha: 'a'.repeat(40), source_diff_sha256: null, environment: 'https://capture.example.test',
    route: '/preview', fixture: 'rekkrd-synthetic-v1', auth_profile_key: null,
    viewport: { width: 1440, height: 2560 }, selectors: ['[data-testid="preview"]'], masks: [],
    assertions: [{ kind: 'visible_text_or_selector', value: 'Preview', passed: false }],
    contains_pii: false, artifact_asset_ids: [], status: 'draft',
  }];
  const source = {
    id: '50000000-0000-0000-0000-000000000001', default_ref: 'main',
    capture_base_url: 'https://capture.example.test/', capture_fixture_key: 'rekkrd-synthetic-v1',
    capture_auth_profile_key: null,
  };
  return { manifest, source };
}

test('capture queue input is authoritative, minimal, and secret-free', () => {
  const { manifest, source } = fixture();
  const input = buildPromoCaptureJobInput(manifest, source, 'capture-plan-preview');
  assert.deepEqual(input, {
    schema_version: '1.0.0', scenario_id: 'capture-plan-preview', scenario_key: 'rekkrd.preview',
    scenario_version: 1, branch_source_id: source.id, expected_commit_sha: 'a'.repeat(40),
  });
  assert.doesNotMatch(JSON.stringify(input), /base_url|fixture|auth|token|cookie|password/i);
});

test('capture queueing fails closed on every unresolved production prerequisite', () => {
  const missingEnvironment = fixture();
  missingEnvironment.source.capture_base_url = null;
  assert.throws(() => buildPromoCaptureJobInput(missingEnvironment.manifest, missingEnvironment.source, 'capture-plan-preview'), /base URL/i);

  const privateTarget = fixture();
  privateTarget.source.capture_base_url = 'https://127.0.0.1';
  assert.throws(() => buildPromoCaptureJobInput(privateTarget.manifest, privateTarget.source, 'capture-plan-preview'), /private-network/i);

  const credentialTarget = fixture();
  credentialTarget.source.capture_base_url = 'https://user:password@capture.example.test';
  assert.throws(() => buildPromoCaptureJobInput(credentialTarget.manifest, credentialTarget.source, 'capture-plan-preview'), /credentials/i);

  const unapproved = fixture();
  unapproved.manifest.script.status = 'review';
  assert.throws(() => buildPromoCaptureJobInput(unapproved.manifest, unapproved.source, 'capture-plan-preview'), /Approve the script/i);

  const mismatchedCommit = fixture();
  mismatchedCommit.manifest.captures.scenarios[0].commit_sha = 'b'.repeat(40);
  assert.throws(() => buildPromoCaptureJobInput(mismatchedCommit.manifest, mismatchedCommit.source, 'capture-plan-preview'), /commit/i);

  const unsafe = fixture();
  unsafe.manifest.captures.scenarios[0].contains_pii = true;
  assert.throws(() => buildPromoCaptureJobInput(unsafe.manifest, unsafe.source, 'capture-plan-preview'), /PII/i);

  const inventedRoute = fixture();
  inventedRoute.manifest.captures.scenarios[0].route = '/invented';
  assert.throws(() => buildPromoCaptureJobInput(inventedRoute.manifest, inventedRoute.source, 'capture-plan-preview'), /verified repository evidence/i);
});

test('capture jobs are resolved server-side while the deployed worker remains no-op only', async () => {
  const [edge, worker, service, readme] = await Promise.all([
    read('../supabase/functions/promo-studio/index.ts'), read('../supabase/functions/promo-worker/index.ts'),
    read('../services/promoStudioService.ts'),
    read('../workers/promo-capture-worker/README.md'),
  ]);
  assert.match(edge, /jobType === "capture"/);
  assert.match(edge, /buildPromoCaptureJobInput\(revision\.manifest, source, body\.scenario_id\)/);
  assert.match(edge, /const serverResolvedJob = \["capture", "voice_generate", "voice_align", "music_generate"\]\.includes\(jobType\)/);
  assert.match(edge, /const dependencies = serverResolvedJob \? \[\]/);
  assert.match(edge, /const idempotencyKey = \(serverResolvedJob \? ""/);
  assert.match(worker, /p_job_types: \["noop"\]/);
  assert.doesNotMatch(worker, /p_job_types: \["capture"\]/);
  assert.match(service, /job_type: 'capture', scenario_id: scenarioId/);
  assert.match(readme, /intentionally not executable yet/i);
});
