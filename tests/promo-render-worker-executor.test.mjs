import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPromoRenderCompletion, executePromoRenderClaim, postgresJsonbText } from '../workers/promo-render-worker/executor.mjs';
import { createRekkrdRenderClaimFixture } from '../workers/promo-render-worker/fixtures/rekkrd-preview.mjs';
import { fingerprintPromoInput, sha256Hex } from '../workers/promo-render-worker/preflight.mjs';

const outputBytes = Buffer.from('verified-render-output');
const verifiedArtifact = () => ({
  bytes: outputBytes, width: 1080, height: 1920, fps: 30, duration_seconds: 10,
  video_codec: 'h264', pixel_format: 'yuv420p', audio_codec: 'aac', audio_sample_rate: 48000,
  faststart: true, color_range: 'tv', integrated_lufs: -14.11, true_peak_dbfs: -1.84,
});
const activate = fixture => {
  fixture.job.input.render_profile.composition_worker_enabled = true;
  fixture.job.input_fingerprint = fingerprintPromoInput(fixture.job.input);
  return fixture;
};
const context = fixture => ({
  job: fixture.job, worker_id: fixture.workerId, project: fixture.project,
  approvals: fixture.approvals, assets: fixture.assets,
  composition_source_sha256: fixture.compositionSourceSha256,
  pipeline_fingerprint: fixture.pipelineFingerprint,
});

test('completion produces PostgreSQL JSONB bytes and deterministic private object contracts', () => {
  const fixture = activate(createRekkrdRenderClaimFixture());
  const completion = buildPromoRenderCompletion(fixture.job, verifiedArtifact(), {
    renderAssetId: '90000000-0000-4000-8000-000000000301',
    qaAssetId: '90000000-0000-4000-8000-000000000302',
  });
  assert.equal(completion.render_path, `${fixture.job.project_id}/90000000-0000-4000-8000-000000000301/preview.mp4`);
  assert.equal(completion.qa_path, `${fixture.job.project_id}/90000000-0000-4000-8000-000000000302/qa.json`);
  assert.equal(completion.render_checksum_sha256, sha256Hex(outputBytes));
  assert.equal(completion.qa_bytes.toString('utf8'), postgresJsonbText(completion.qa));
  assert.equal(completion.qa_checksum_sha256, sha256Hex(completion.qa_bytes));
  assert.match(completion.output_fingerprint, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(completion.qa_bytes.toString('utf8'), /storage_path|signed_url|service_role/i);
});

test('executor performs heartbeat, verified download, render, immutable upload, and atomic completion', async () => {
  const fixture = activate(createRekkrdRenderClaimFixture());
  const heartbeats = [];
  const uploads = [];
  const completions = [];
  const failures = [];
  const ids = ['90000000-0000-4000-8000-000000000301', '90000000-0000-4000-8000-000000000302'];
  const result = await executePromoRenderClaim({
    ...context(fixture),
    adapters: {
      heartbeat: async value => { heartbeats.push(value); return true; },
      randomUuid: () => ids.shift(),
      signAsset: async ({ path }) => `https://storage.invalid/object?path=${encodeURIComponent(path)}`,
      fetchAsset: async url => {
        const storagePath = new URL(url).searchParams.get('path');
        const asset = fixture.assets.find(item => item.storage_path === storagePath);
        return fixture.bytesByAssetId.get(asset.id);
      },
      render: async ({ resolvedAssets, heartbeat }) => {
        assert.equal(resolvedAssets.size, 4);
        await heartbeat(60);
        return verifiedArtifact();
      },
      upload: async value => { uploads.push(value); },
      complete: async value => { completions.push(value); return true; },
      fail: async value => { failures.push(value); return true; },
      cleanup: async () => assert.fail('successful execution must not clean up'),
    },
  });
  assert.equal(result.completed, true);
  assert.deepEqual(heartbeats.map(item => item.progress), [10, 25, 60, 85, 95]);
  assert.equal(uploads.length, 2);
  assert.deepEqual(uploads.map(item => [item.bucket, item.content_type, item.upsert]), [
    ['promo-assets', 'video/mp4', false], ['promo-assets', 'application/json', false],
  ]);
  assert.equal(uploads[1].metadata.sha256, uploads[1].metadata.payload_fingerprint_sha256);
  assert.equal(completions.length, 1);
  assert.equal(completions[0].qa.output_checksum_sha256, uploads[0].metadata.sha256);
  assert.equal(failures.length, 0);
});

test('executor fails closed and removes uploaded objects when atomic completion rejects', async () => {
  const fixture = activate(createRekkrdRenderClaimFixture());
  const uploads = [];
  const cleanups = [];
  const failures = [];
  const ids = ['90000000-0000-4000-8000-000000000301', '90000000-0000-4000-8000-000000000302'];
  await assert.rejects(executePromoRenderClaim({
    ...context(fixture),
    adapters: {
      heartbeat: async () => true, randomUuid: () => ids.shift(),
      signAsset: async ({ path }) => `https://storage.invalid/object?path=${encodeURIComponent(path)}`,
      fetchAsset: async url => {
        const asset = fixture.assets.find(item => item.storage_path === new URL(url).searchParams.get('path'));
        return fixture.bytesByAssetId.get(asset.id);
      },
      render: async () => verifiedArtifact(), upload: async value => { uploads.push(value); },
      complete: async () => false, cleanup: async value => { cleanups.push(value); },
      fail: async value => { failures.push(value); return true; },
    },
  }), error => error.code === 'PROMO_RENDER_COMPLETION_REJECTED');
  assert.equal(uploads.length, 2);
  assert.deepEqual(cleanups[0].paths, uploads.map(item => item.path));
  assert.equal(failures[0].retryable, false);
});

test('executor rejects delivery QA drift before upload', async () => {
  const fixture = activate(createRekkrdRenderClaimFixture());
  const failures = [];
  const ids = ['90000000-0000-4000-8000-000000000301', '90000000-0000-4000-8000-000000000302'];
  await assert.rejects(executePromoRenderClaim({
    ...context(fixture),
    adapters: {
      heartbeat: async () => true, randomUuid: () => ids.shift(),
      signAsset: async ({ path }) => `https://storage.invalid/object?path=${encodeURIComponent(path)}`,
      fetchAsset: async url => {
        const asset = fixture.assets.find(item => item.storage_path === new URL(url).searchParams.get('path'));
        return fixture.bytesByAssetId.get(asset.id);
      },
      render: async () => ({ ...verifiedArtifact(), width: 720 }),
      upload: async () => assert.fail('invalid media must not upload'),
      complete: async () => assert.fail('invalid media must not complete'),
      cleanup: async () => {}, fail: async value => { failures.push(value); return true; },
    },
  }), error => error.code === 'PROMO_RENDER_OUTPUT_QA_FAILED');
  assert.equal(failures[0].retryable, false);
});
