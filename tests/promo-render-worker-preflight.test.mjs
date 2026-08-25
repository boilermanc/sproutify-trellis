import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createRekkrdRenderClaimFixture } from '../workers/promo-render-worker/fixtures/rekkrd-preview.mjs';
import { assertPromoRenderActivationReady, downloadVerifiedPromoAssets, fingerprintPromoInput, inspectPromoRenderClaim } from '../workers/promo-render-worker/preflight.mjs';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const inspect = fixture => inspectPromoRenderClaim({
  job: fixture.job, worker_id: fixture.workerId, project: fixture.project,
  approvals: fixture.approvals, assets: fixture.assets,
  composition_source_sha256: fixture.compositionSourceSha256, pipeline_fingerprint: fixture.pipelineFingerprint,
});

test('private asset plan passes structural preflight but remains activation-blocked', () => {
  const fixture = createRekkrdRenderClaimFixture();
  const preflight = inspect(fixture);
  assert.equal(preflight.asset_plan.length, 4);
  assert.equal(preflight.activation_ready, false);
  assert.deepEqual(preflight.activation_blockers, [
    'PROMO_RENDER_COMPOSITION_DISABLED', 'PROMO_RENDER_PRESENTATION_REQUIRED',
    'PROMO_RENDER_PIPELINE_FINGERPRINT_MISMATCH',
  ]);
  assert.throws(() => assertPromoRenderActivationReady(preflight), error => error.code === 'PROMO_RENDER_ACTIVATION_BLOCKED');
  assert.equal(preflight.asset_plan.every(asset => asset.storage_bucket === 'promo-assets' && !('signed_url' in asset)), true);
});

test('preflight rejects tampering, expired leases, source drift, and non-UUID assets', () => {
  const tampered = createRekkrdRenderClaimFixture();
  tampered.job.input.timeline.target_seconds = 11;
  assert.throws(() => inspect(tampered), error => error.code === 'PROMO_RENDER_INPUT_FINGERPRINT_INVALID');
  const expired = createRekkrdRenderClaimFixture();
  expired.job.lease_expires_at = '2020-01-01T00:00:00.000Z';
  assert.throws(() => inspect(expired), error => error.code === 'PROMO_RENDER_LEASE_EXPIRED');
  const malformedLease = createRekkrdRenderClaimFixture();
  malformedLease.job.lease_expires_at = 'not-a-date';
  assert.throws(() => inspect(malformedLease), error => error.code === 'PROMO_RENDER_LEASE_EXPIRED');
  const drifted = createRekkrdRenderClaimFixture();
  drifted.compositionSourceSha256 = 'f'.repeat(64);
  assert.throws(() => inspect(drifted), error => error.code === 'PROMO_RENDER_COMPOSITION_FINGERPRINT_INVALID');
  const invalidAssetId = createRekkrdRenderClaimFixture();
  invalidAssetId.job.input.timeline.voice_asset_id = 'asset-voice';
  invalidAssetId.job.input_fingerprint = fingerprintPromoInput(invalidAssetId.job.input);
  assert.throws(() => inspect(invalidAssetId), error => error.code === 'PROMO_RENDER_AUDIO_ASSET_INVALID');
});

test('presentation blocker requires approval provenance bound to the target branch', () => {
  const empty = createRekkrdRenderClaimFixture();
  empty.job.input.presentation = {};
  empty.job.input_fingerprint = fingerprintPromoInput(empty.job.input);
  assert.equal(inspect(empty).activation_blockers.includes('PROMO_RENDER_PRESENTATION_REQUIRED'), true);

  const approved = createRekkrdRenderClaimFixture();
  approved.job.input.presentation = {
    approved: true,
    approval_id: '90000000-0000-4000-8000-000000000201',
    source_branch_id: approved.project.branch_id,
    target_branch_id: approved.project.branch_id,
  };
  approved.job.input_fingerprint = fingerprintPromoInput(approved.job.input);
  assert.equal(inspect(approved).activation_blockers.includes('PROMO_RENDER_PRESENTATION_REQUIRED'), false);

  const wrongTarget = createRekkrdRenderClaimFixture();
  wrongTarget.job.input.presentation = {
    ...approved.job.input.presentation,
    target_branch_id: '90000000-0000-4000-8000-000000000202',
  };
  wrongTarget.job.input_fingerprint = fingerprintPromoInput(wrongTarget.job.input);
  assert.equal(inspect(wrongTarget).activation_blockers.includes('PROMO_RENDER_PRESENTATION_REQUIRED'), true);
});

test('final preflight revalidates selected preview and latest approval after claim', () => {
  const ready = createRekkrdRenderClaimFixture({ mode: 'final' });
  assert.equal(inspect(ready).job_id, ready.job.id);
  const changed = createRekkrdRenderClaimFixture({ mode: 'final' });
  changed.project.selected_preview_render_id = '90000000-0000-4000-8000-000000000199';
  assert.throws(() => inspect(changed), error => error.code === 'PROMO_RENDER_PREVIEW_SELECTION_STALE');
  const revoked = createRekkrdRenderClaimFixture({ mode: 'final' });
  revoked.approvals.push({ ...revoked.approvals[0], decision: 'revoked', created_at: '2026-08-25T20:01:00.000Z' });
  assert.throws(() => inspect(revoked), error => error.code === 'PROMO_RENDER_PREVIEW_APPROVAL_STALE');
});

test('download boundary verifies short-lived signed assets byte for byte', async () => {
  const fixture = createRekkrdRenderClaimFixture();
  const preflight = inspect(fixture);
  const signed = [];
  const downloaded = await downloadVerifiedPromoAssets(preflight.asset_plan, {
    signAsset: async request => { signed.push(request); return `https://storage.invalid/object?path=${encodeURIComponent(request.path)}`; },
    fetchAsset: async url => {
      const storagePath = new URL(url).searchParams.get('path');
      const asset = preflight.asset_plan.find(item => item.storage_path === storagePath);
      return fixture.bytesByAssetId.get(asset.asset_id);
    },
  });
  assert.equal(downloaded.size, 4);
  assert.equal(signed.every(request => request.bucket === 'promo-assets' && request.expires_in === 300), true);
  assert.equal([...downloaded.values()].every(asset => !('signed_url' in asset)), true);
  await assert.rejects(downloadVerifiedPromoAssets([preflight.asset_plan[0]], {
    signAsset: async () => 'https://storage.invalid/object', fetchAsset: async () => Buffer.from('corrupt'),
  }), error => error.code === 'PROMO_RENDER_ASSET_CHECKSUM_MISMATCH');
});

test('production claims remain disabled and preflight accepts no credential or browser URL inputs', async () => {
  const [worker, preflight, readme] = await Promise.all([
    read('../supabase/functions/promo-worker/index.ts'), read('../workers/promo-render-worker/preflight.mjs'),
    read('../workers/promo-render-worker/README.md'),
  ]);
  assert.match(worker, /p_job_types: \["noop"\]/);
  assert.doesNotMatch(worker, /p_job_types: \["preview_render"/);
  assert.doesNotMatch(preflight, /SUPABASE_SERVICE_ROLE_KEY|process\.env|browser_url|ffmpeg_flags/);
  assert.match(readme, /claims remain disabled/i);
});
