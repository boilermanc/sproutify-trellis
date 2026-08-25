import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildPromoRenderJobInput } from '../../../supabase/functions/_shared/promo-render.ts';
import { fingerprintPromoInput, sha256Hex } from '../preflight.mjs';

const fixtureDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(fixtureDir, '../../..');
const manifestPath = path.join(repoRoot, 'features', 'promo-studio', 'schemas', 'fixtures', 'rekkrd.manifest.v1.json');
const assetRoot = path.join(repoRoot, 'work', 'promo-studio', 'ps-002', 'assets');
const ids = Object.freeze({
  job: '90000000-0000-4000-8000-000000000001', lease: '90000000-0000-4000-8000-000000000002',
  capture: '90000000-0000-4000-8000-000000000101', logo: '90000000-0000-4000-8000-000000000102',
  voice: '90000000-0000-4000-8000-000000000103', music: '90000000-0000-4000-8000-000000000104',
  preview: '90000000-0000-4000-8000-000000000105',
});
const sourceByOriginalId = Object.freeze({
  'asset-stakkd-capture': { id: ids.capture, file: 'rekkrd-stakkd-preview.png', mime: 'image/png' },
  'asset-rekkrd-logo': { id: ids.logo, file: 'rekkrd-app-icon.png', mime: 'image/png' },
  'asset-voice-kore': { id: ids.voice, file: 'gemini-voice-kore.wav', mime: 'audio/wav' },
  'asset-music-lyria': { id: ids.music, file: 'lyria-stakkd-bed.mp3', mime: 'audio/mpeg' },
});

export function createRekkrdRenderClaimFixture({ mode = 'preview' } = {}) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.render.composition = 'vertical-ui-story';
  manifest.render.composition_version = 'v1';
  const idMap = new Map(Object.entries(sourceByOriginalId).map(([oldId, source]) => [oldId, source.id]));
  for (const asset of manifest.assets) asset.id = idMap.get(asset.id);
  for (const scene of manifest.scenes) scene.visual.asset_id = idMap.get(scene.visual.asset_id);
  for (const take of manifest.voice.takes) if (take.audio_asset_id) take.audio_asset_id = idMap.get(take.audio_asset_id);
  for (const take of manifest.music.takes) if (take.audio_asset_id) take.audio_asset_id = idMap.get(take.audio_asset_id);

  const bytesByAssetId = new Map();
  const assets = manifest.assets.map(asset => {
    const source = Object.values(sourceByOriginalId).find(candidate => candidate.id === asset.id);
    const sourcePath = path.join(assetRoot, source.file);
    const bytes = readFileSync(sourcePath);
    if (sha256Hex(bytes) !== asset.checksum_sha256) throw new Error(`Fixture checksum drifted for ${source.file}`);
    bytesByAssetId.set(asset.id, bytes);
    return {
      id: asset.id, project_id: manifest.promo.id, revision_id: manifest.promo.revision_id,
      kind: asset.kind, status: 'ready', storage_bucket: 'promo-assets',
      storage_path: `${manifest.promo.id}/${asset.id}/${source.file}`, mime_type: source.mime,
      checksum_sha256: asset.checksum_sha256, file_size_bytes: statSync(sourcePath).size,
    };
  });
  const approvals = [];
  let selectedPreviewAssetId = null;
  if (mode === 'final') {
    selectedPreviewAssetId = ids.preview;
    assets.push({
      id: ids.preview, project_id: manifest.promo.id, revision_id: manifest.promo.revision_id,
      kind: 'render_preview', status: 'ready', storage_bucket: 'promo-assets',
      storage_path: `${manifest.promo.id}/${ids.preview}/preview.mp4`, mime_type: 'video/mp4',
      checksum_sha256: 'a'.repeat(64), file_size_bytes: 1234, width: 1080, height: 1920,
    });
    approvals.push({
      revision_id: manifest.promo.revision_id, gate: 'preview', subject_type: 'asset',
      subject_id: ids.preview, decision: 'approved', created_at: '2026-08-25T20:00:00.000Z',
    });
  }
  const input = buildPromoRenderJobInput(
    manifest, assets, approvals, selectedPreviewAssetId,
    mode === 'final' ? 'final_render' : 'preview_render', '9:16',
    { id: manifest.promo.branch.id, slug: manifest.promo.branch.slug },
  );
  const workerId = 'promo-render-fixture';
  const job = {
    id: ids.job, project_id: manifest.promo.id, revision_id: manifest.promo.revision_id,
    job_type: mode === 'final' ? 'final_render' : 'preview_render', status: 'running',
    worker_id: workerId, lease_token: ids.lease, lease_expires_at: '2099-01-01T00:00:00.000Z',
    input, input_fingerprint: fingerprintPromoInput(input),
  };
  const project = { id: manifest.promo.id, current_revision_id: manifest.promo.revision_id, selected_preview_render_id: selectedPreviewAssetId };
  const componentPath = path.join(repoRoot, 'workers', 'clip-render-worker', 'remotion', 'PromoVerticalStory.tsx');
  const pipelinePath = path.join(repoRoot, 'work', 'promo-studio', 'vertical-ui-story-v1', 'scripts', 'render-sample.mjs');
  const normalizedHash = file => sha256Hex(Buffer.from(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), 'utf8'));
  return { job, project, approvals, assets, bytesByAssetId, workerId,
    compositionSourceSha256: normalizedHash(componentPath), pipelineFingerprint: normalizedHash(pipelinePath) };
}
