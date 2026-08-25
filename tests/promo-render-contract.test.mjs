import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { buildPromoRenderJobInput } from '../supabase/functions/_shared/promo-render.ts';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');

async function fixture() {
  const manifest = JSON.parse(await read('../features/promo-studio/schemas/fixtures/rekkrd.manifest.v1.json'));
  const assets = manifest.assets.map(asset => ({
    id: asset.id,
    revision_id: manifest.promo.revision_id,
    status: 'ready',
    storage_bucket: 'promo-assets',
    storage_path: `${manifest.promo.id}/${asset.id}/asset`,
    checksum_sha256: asset.checksum_sha256,
  }));
  const selectedPreviewAssetId = '11111111-1111-4111-8111-111111111111';
  assets.push({
    id: selectedPreviewAssetId,
    revision_id: manifest.promo.revision_id,
    kind: 'render_preview',
    status: 'ready',
    storage_bucket: 'promo-assets',
    storage_path: `${manifest.promo.id}/${selectedPreviewAssetId}/preview.mp4`,
    mime_type: 'video/mp4',
    checksum_sha256: 'a'.repeat(64),
    width: 1080,
    height: 1920,
  });
  const approvals = [{
    revision_id: manifest.promo.revision_id, gate: 'preview', subject_type: 'asset', subject_id: selectedPreviewAssetId,
    decision: 'approved', created_at: '2026-08-25T20:00:00.000Z',
  }];
  return { manifest, assets, approvals, selectedPreviewAssetId };
}

test('preview render input is vertical, asset-ID-only, and derives caption text from approved display copy', async () => {
  const { manifest, assets } = await fixture();
  manifest.captions.cues[0].text = 'browser supplied replacement';
  const input = buildPromoRenderJobInput(manifest, assets, [], null, 'preview_render', '9:16');
  assert.equal(input.mode, 'preview');
  assert.deepEqual(input.format, {
    name: '9:16', width: 1080, height: 1920, crop_policy: 'contain',
    safe_area: { top: 96, right: 48, bottom: 180, left: 48 },
  });
  assert.equal(input.timeline.captions[0].text, manifest.script.phrases[0].display_text);
  assert.equal(input.review.provenance_overlay, true);
  assert.doesNotMatch(JSON.stringify(input), /storage_path|storage_bucket|signed_url|browser supplied|api.?key|token|password/i);
});

test('rendering fails closed until capture, audio, timeline, assets, and profile are ready', async () => {
  const unverified = await fixture();
  unverified.manifest.captures.scenarios[0].assertions[0].passed = false;
  assert.throws(() => buildPromoRenderJobInput(unverified.manifest, unverified.assets, [], null, 'preview_render', '9:16'), /verified capture assertions/i);

  const missingAsset = await fixture();
  missingAsset.assets = missingAsset.assets.filter(asset => asset.id !== missingAsset.manifest.voice.selected_take_id);
  missingAsset.assets = missingAsset.assets.filter(asset => asset.id !== 'asset-voice-kore');
  assert.throws(() => buildPromoRenderJobInput(missingAsset.manifest, missingAsset.assets, [], null, 'preview_render', '9:16'), /checksum-verified private asset/i);

  const shortMusic = await fixture();
  shortMusic.manifest.music.takes[0].duration_seconds = 5;
  assert.throws(() => buildPromoRenderJobInput(shortMusic.manifest, shortMusic.assets, [], null, 'preview_render', '9:16'), /covering the full render/i);

  const badTimeline = await fixture();
  badTimeline.manifest.scenes[0].duration.preferred_seconds = 6;
  assert.throws(() => buildPromoRenderJobInput(badTimeline.manifest, badTimeline.assets, [], null, 'preview_render', '9:16'), /fill the target render timebase/i);

  const wrongProfile = await fixture();
  wrongProfile.manifest.render.pixel_format = 'yuv444p';
  assert.throws(() => buildPromoRenderJobInput(wrongProfile.manifest, wrongProfile.assets, [], null, 'preview_render', '9:16'), /proven vertical delivery profile/i);

  const unsafeArea = await fixture();
  unsafeArea.manifest.format_variants[0].safe_area.top = 1900;
  assert.throws(() => buildPromoRenderJobInput(unsafeArea.manifest, unsafeArea.assets, [], null, 'preview_render', '9:16'), /safe area/i);

  const unapprovedClaim = await fixture();
  unapprovedClaim.manifest.evidence.claims[0].approved = false;
  assert.throws(() => buildPromoRenderJobInput(unapprovedClaim.manifest, unapprovedClaim.assets, [], null, 'preview_render', '9:16'), /every claim/i);
});

test('final render requires current preview approval and approved input assets', async () => {
  const missingApproval = await fixture();
  assert.throws(() => buildPromoRenderJobInput(missingApproval.manifest, missingApproval.assets, [], missingApproval.selectedPreviewAssetId, 'final_render', '9:16'), /Approve the current preview/i);

  const unapprovedAsset = await fixture();
  unapprovedAsset.manifest.assets.find(asset => asset.id === 'asset-music-lyria').provenance.approved = false;
  assert.throws(() => buildPromoRenderJobInput(unapprovedAsset.manifest, unapprovedAsset.assets, unapprovedAsset.approvals, unapprovedAsset.selectedPreviewAssetId, 'final_render', '9:16'), /every input asset to be approved/i);

  const revokedPreview = await fixture();
  revokedPreview.approvals.push({
    revision_id: revokedPreview.manifest.promo.revision_id,
    gate: 'preview',
    subject_type: 'asset',
    subject_id: revokedPreview.selectedPreviewAssetId,
    decision: 'revoked',
    created_at: '2026-08-25T20:01:00.000Z',
  });
  assert.throws(() => buildPromoRenderJobInput(revokedPreview.manifest, revokedPreview.assets, revokedPreview.approvals, revokedPreview.selectedPreviewAssetId, 'final_render', '9:16'), /Approve the current preview/i);

  const wrongSelection = await fixture();
  assert.throws(() => buildPromoRenderJobInput(wrongSelection.manifest, wrongSelection.assets, wrongSelection.approvals, '22222222-2222-4222-8222-222222222222', 'final_render', '9:16'), /Select a verified current-revision preview/i);

  const ready = await fixture();
  const input = buildPromoRenderJobInput(ready.manifest, ready.assets, ready.approvals, ready.selectedPreviewAssetId, 'final_render', '9:16');
  assert.equal(input.mode, 'final');
  assert.equal(input.review.provenance_overlay, false);
  assert.equal(input.render_profile.integrated_lufs, -14);
  assert.equal(input.render_profile.true_peak_dbfs, -1.5);
  assert.equal(input.review.approved_preview_asset_id, ready.selectedPreviewAssetId);
});

test('render jobs are server-resolved while the production composition worker remains disabled', async () => {
  const [edge, worker, service, readme, proof] = await Promise.all([
    read('../supabase/functions/promo-studio/index.ts'), read('../supabase/functions/promo-worker/index.ts'),
    read('../services/promoStudioService.ts'), read('../workers/promo-render-worker/README.md'),
    read('../workers/clip-render-worker/proofs/ps-002/PromoProof.tsx'),
  ]);
  assert.match(edge, /revision\.manifest, assets \|\| \[\], approvals \|\| \[\], project\.selected_preview_render_id, jobType, body\.format/);
  assert.match(edge, /"preview_render", "final_render"/);
  assert.match(worker, /p_job_types: \["noop"\]/);
  assert.doesNotMatch(worker, /p_job_types: \["preview_render"/);
  assert.match(service, /mode === 'preview' \? 'preview_render' : 'final_render'/);
  assert.match(readme, /intentionally not executable yet/i);
  assert.match(proof, /#13232b/);
  assert.match(readme, /Rekkrd-specific styling/i);
});
