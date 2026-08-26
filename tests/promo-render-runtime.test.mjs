import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createPromoRenderRuntime } from '../workers/clip-render-worker/promo-worker.mjs';
import { createRekkrdRenderClaimFixture } from '../workers/promo-render-worker/fixtures/rekkrd-preview.mjs';
import { fingerprintPromoInput } from '../workers/promo-render-worker/preflight.mjs';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const activate = fixture => {
  fixture.job.input.render_profile.composition_worker_enabled = true;
  fixture.job.input_fingerprint = fingerprintPromoInput(fixture.job.input);
  return fixture;
};
const artifact = () => ({
  bytes: Buffer.from('runtime-render'), width: 1080, height: 1920, fps: 30, duration_seconds: 10,
  video_codec: 'h264', pixel_format: 'yuv420p', audio_codec: 'aac', audio_sample_rate: 48000,
  faststart: true, color_range: 'tv', integrated_lufs: -14.11, true_peak_dbfs: -1.84,
});

const query = source => {
  let rows = [...source];
  const builder = {
    select: () => builder,
    eq: (key, value) => { rows = rows.filter(row => row[key] === value); return builder; },
    single: async () => ({ data: rows[0] || null, error: rows[0] ? null : { message: 'not found' } }),
    then: (resolve, reject) => Promise.resolve({ data: rows, error: null }).then(resolve, reject),
  };
  return builder;
};

test('runtime does not initialize credentials or claim jobs unless the explicit kill switch is enabled', async () => {
  let clients = 0;
  const runtime = createPromoRenderRuntime({
    environment: {}, clientFactory: () => { clients += 1; throw new Error('must not initialize'); },
  });
  assert.equal(runtime.config.claimsEnabled, false);
  assert.deepEqual(await runtime.processOnce(), { claimed: false, disabled: true });
  assert.equal(clients, 0);
});

test('enabled runtime claims only render jobs and completes through the isolated executor', async () => {
  const fixture = activate(createRekkrdRenderClaimFixture());
  const rpcCalls = [];
  const uploads = [];
  let claimed = false;
  const db = {
    rpc: async (name, parameters) => {
      rpcCalls.push({ name, parameters });
      if (name === 'claim_promo_job') {
        if (claimed) return { data: [], error: null };
        claimed = true;
        return { data: [fixture.job], error: null };
      }
      return { data: true, error: null };
    },
    from: table => query(table === 'promo_projects' ? [fixture.project]
      : table === 'promo_approvals' ? fixture.approvals
        : table === 'promo_revision_assets' ? fixture.assetBindingIds.map(asset_id => ({
          asset_id, project_id: fixture.project.id, revision_id: fixture.job.revision_id,
        })) : fixture.assets),
    storage: { from: bucket => ({
      createSignedUrl: async storagePath => ({ data: { signedUrl: `https://storage.invalid/object?path=${encodeURIComponent(storagePath)}` }, error: null }),
      upload: async (storagePath, bytes, options) => { uploads.push({ bucket, storagePath, bytes, options }); return { error: null }; },
      remove: async () => ({ error: null }),
    }) },
  };
  const runtime = createPromoRenderRuntime({
    environment: {
      SUPABASE_URL: 'https://horvjqqifgrzxesuxtfm.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'server-only',
      PROMO_RENDER_CLAIMS_ENABLED: 'true', PROMO_RENDER_WORKER_ID: fixture.workerId,
    },
    clientFactory: () => db, render: async () => artifact(),
    fetchImpl: async url => {
      const storagePath = new URL(url).searchParams.get('path');
      const asset = fixture.assets.find(item => item.storage_path === storagePath);
      const bytes = fixture.bytesByAssetId.get(asset.id);
      return new Response(bytes, { status: 200, headers: { 'content-length': String(bytes.length) } });
    },
  });
  const result = await runtime.processOnce();
  assert.equal(result.claimed, true);
  assert.equal(result.completed, true);
  assert.deepEqual(rpcCalls[0], {
    name: 'claim_promo_job',
    parameters: { p_worker_id: fixture.workerId, p_lease_seconds: 900, p_job_types: ['preview_render', 'final_render'] },
  });
  assert.equal(rpcCalls.some(call => call.name === 'complete_promo_render_job'), true);
  assert.equal(rpcCalls.some(call => call.name === 'complete_promo_job'), false);
  assert.equal(uploads.length, 2);
  assert.equal(uploads.every(upload => upload.bucket === 'promo-assets' && upload.options.upsert === false), true);
  assert.equal(uploads[1].options.metadata.sha256, uploads[1].options.metadata.payload_fingerprint_sha256);
});

test('runtime rejects an oversized private response while streaming without content-length', async () => {
  const fixture = activate(createRekkrdRenderClaimFixture());
  let renderCalls = 0;
  const db = {
    rpc: async name => ({ data: name === 'claim_promo_job' ? [fixture.job] : true, error: null }),
    from: table => query(table === 'promo_projects' ? [fixture.project]
      : table === 'promo_approvals' ? fixture.approvals
        : table === 'promo_revision_assets' ? fixture.assetBindingIds.map(asset_id => ({
          asset_id, project_id: fixture.project.id, revision_id: fixture.job.revision_id,
        })) : fixture.assets),
    storage: { from: () => ({
      createSignedUrl: async () => ({ data: { signedUrl: 'https://storage.invalid/object' }, error: null }),
      upload: async () => ({ error: null }), remove: async () => ({ error: null }),
    }) },
  };
  const oversizedBytes = Math.max(...fixture.assets.map(item => item.file_size_bytes)) + 1;
  const runtime = createPromoRenderRuntime({
    environment: {
      SUPABASE_URL: 'https://horvjqqifgrzxesuxtfm.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'server-only',
      PROMO_RENDER_CLAIMS_ENABLED: 'true', PROMO_RENDER_WORKER_ID: fixture.workerId,
    },
    clientFactory: () => db,
    render: async () => { renderCalls += 1; return artifact(); },
    fetchImpl: async () => new Response(Buffer.alloc(oversizedBytes)),
  });
  await assert.rejects(runtime.processOnce(), /exceeded the download limit/);
  assert.equal(renderCalls, 0);
});

test('runtime source keeps credentials server-only and documents Node 22 plus exact dependencies', async () => {
  const [runtime, workerPackage, service, environment] = await Promise.all([
    read('../workers/clip-render-worker/promo-worker.mjs'), read('../workers/clip-render-worker/package.json'),
    read('../workers/clip-render-worker/promo-render.service.example'),
    read('../workers/clip-render-worker/promo-render.env.example'),
  ]);
  assert.match(runtime, /PROMO_RENDER_CLAIMS_ENABLED/);
  assert.match(runtime, /p_job_types: \['preview_render', 'final_render'\]/);
  assert.match(runtime, /complete_promo_render_job/);
  assert.doesNotMatch(runtime, /complete_promo_job/);
  assert.doesNotMatch(runtime, /VITE_|window\.|localStorage/);
  const packageValue = JSON.parse(workerPackage);
  assert.equal(packageValue.dependencies['@supabase/supabase-js'], '2.90.1');
  assert.equal(packageValue.engines.node, '>=22.12.0');
  assert.match(service, /EnvironmentFile=\/etc\/trellis\/promo-render\.env/);
  assert.match(service, /ExecStart=__NODE_BIN__\/node promo-worker\.mjs/);
  assert.match(service, /User=__SERVICE_USER__/);
  assert.match(service, /Group=__SERVICE_GROUP__/);
  assert.match(environment, /PROMO_RENDER_CLAIMS_ENABLED=false/);
  assert.match(environment, /SUPABASE_SERVICE_ROLE_KEY=REPLACE_WITH_HUB_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(environment, /eyJ[A-Za-z0-9_-]+\./);
});
