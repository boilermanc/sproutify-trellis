import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import test from 'node:test';

import { executePromoCaptureClaim } from '../workers/promo-capture-worker/executor.mjs';
import { inspectPromoCaptureClaim } from '../workers/promo-capture-worker/preflight.mjs';
import { fingerprintPromoInput } from '../workers/promo-render-worker/preflight.mjs';

const id = suffix => `90000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;

function fixture() {
  const input = { schema_version: '1.0.0', scenario_id: 'capture-plan-preview', scenario_key: 'rekkrd.preview',
    scenario_version: 1, branch_source_id: id(4), expected_commit_sha: 'a'.repeat(40) };
  const project = { id: id(1), branch_id: id(2), current_revision_id: id(3) };
  const job = { id: id(5), project_id: project.id, revision_id: project.current_revision_id,
    job_type: 'capture', status: 'running', worker_id: 'capture-worker-1', lease_token: id(6),
    lease_expires_at: '2099-01-01T00:00:00.000Z', input, input_fingerprint: fingerprintPromoInput(input) };
  const branch_source = { id: input.branch_source_id, branch_id: project.branch_id, is_active: true,
    default_ref: 'main', capture_base_url: 'https://capture.example.test',
    capture_fixture_key: 'rekkrd-fixture-v1', capture_auth_profile_key: 'rekkrd-auth-v1' };
  const definition = { id: input.scenario_id, key: input.scenario_key, version: 1, repository_ref: 'main',
    commit_sha: input.expected_commit_sha, environment: branch_source.capture_base_url, route: '/preview?screen=Stakkd',
    fixture: branch_source.capture_fixture_key, auth_profile_key: branch_source.capture_auth_profile_key,
    viewport: { width: 1080, height: 1920 }, selectors: ['[data-testid="stakkd"]'], masks: ['[data-private]'],
    assertions: [{ kind: 'visible_text_or_selector', value: 'Stakkd', passed: false }],
    contains_pii: false, artifact_asset_ids: [], status: 'draft' };
  const scenario = { id: id(7), project_id: project.id, revision_id: project.current_revision_id,
    scenario_key: input.scenario_key, scenario_version: 1, repository_ref: 'main', commit_sha: input.expected_commit_sha,
    environment: branch_source.capture_base_url, route: definition.route,
    auth_profile_key: branch_source.capture_auth_profile_key, definition, status: 'draft' };
  return { job, worker_id: job.worker_id, project, branch_source, scenario };
}

const artifact = context => ({
  video: { bytes: Buffer.from('video'), width: 1080, height: 1920, duration_seconds: 10 },
  stills: [{ bytes: Buffer.from('still'), width: 1080, height: 1920 }],
  assertions: [{ kind: 'visible_text_or_selector', value: 'Stakkd', passed: true }],
  masks_applied: ['[data-private]'], contains_pii: false,
  route: context.scenario.route, commit_sha: context.scenario.commit_sha,
});
test('preflight resolves only live branch-authoritative capture instructions', () => {
  const context = fixture();
  const plan = inspectPromoCaptureClaim(context);
  assert.equal(plan.capture_url, 'https://capture.example.test/preview?screen=Stakkd');
  assert.equal(plan.fixture_key, 'rekkrd-fixture-v1');
  assert.equal(plan.auth_profile_key, 'rekkrd-auth-v1');
  assert.equal(JSON.stringify(plan).includes('password'), false);

  const tampered = fixture();
  tampered.job.input.expected_commit_sha = 'b'.repeat(40);
  assert.throws(() => inspectPromoCaptureClaim(tampered), error => error.code === 'PROMO_CAPTURE_INPUT_FINGERPRINT_INVALID');
  const stale = fixture();
  stale.branch_source.capture_fixture_key = 'changed';
  assert.throws(() => inspectPromoCaptureClaim(stale), error => error.code === 'PROMO_CAPTURE_SCENARIO_INVALID');
  const local = fixture();
  local.branch_source.capture_base_url = 'https://127.0.0.1';
  assert.throws(() => inspectPromoCaptureClaim(local), error => error.code === 'PROMO_CAPTURE_ENVIRONMENT_INVALID');
});

test('executor resolves secrets, uploads immutable evidence, and calls atomic completion', async () => {
  const context = fixture();
  const uploads = []; const completions = []; const failures = [];
  const ids = [id(10), id(11), id(12), id(13)];
  const result = await executePromoCaptureClaim({ ...context, adapters: {
    heartbeat: async () => true, randomUuid: () => ids.shift(),
    resolveFixture: async key => ({ key, secret: 'fixture-secret' }),
    resolveAuthProfile: async key => ({ key, cookie: 'auth-secret' }),
    capture: async ({ plan, fixture: resolvedFixture, auth }) => {
      assert.equal(plan.capture_url.startsWith('https://capture.example.test/'), true);
      assert.equal(resolvedFixture.secret, 'fixture-secret'); assert.equal(auth.cookie, 'auth-secret');
      return artifact(context);
    },
    upload: async value => { uploads.push(value); }, complete: async value => { completions.push(value); return true; },
    fail: async value => { failures.push(value); return true; },
    cleanup: async () => assert.fail('successful capture must not clean up'),
  } });
  assert.equal(result.completed, true);
  assert.deepEqual(uploads.map(item => [item.content_type, item.upsert]), [
    ['video/mp4', false], ['image/png', false], ['application/json', false],
  ]);
  assert.equal(JSON.stringify(uploads).includes('fixture-secret'), false);
  assert.equal(JSON.stringify(uploads).includes('auth-secret'), false);
  assert.equal(completions[0].evidence.assertions[0].passed, true);
  assert.equal(completions[0].trace_checksum_sha256, uploads[2].metadata.payload_fingerprint_sha256);
  assert.equal(failures.length, 0);
});

test('executor fails closed and removes uploads when atomic completion rejects', async () => {
  const context = fixture(); const uploads = []; const cleanups = []; const failures = [];
  const ids = [id(10), id(11), id(12), id(13)];
  await assert.rejects(executePromoCaptureClaim({ ...context, adapters: {
    heartbeat: async () => true, randomUuid: () => ids.shift(),
    resolveFixture: async () => ({}), resolveAuthProfile: async () => ({}),
    capture: async () => artifact(context), upload: async value => { uploads.push(value); },
    complete: async () => false, cleanup: async value => { cleanups.push(value); },
    fail: async value => { failures.push(value); return true; },
  } }), error => error.code === 'PROMO_CAPTURE_COMPLETION_REJECTED');
  assert.deepEqual(cleanups[0].paths, uploads.map(item => item.path));
  assert.equal(failures[0].retryable, false);
});
