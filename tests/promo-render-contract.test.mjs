import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { buildPromoRenderJobInput as buildServerPromoRenderJobInput } from '../supabase/functions/_shared/promo-render.ts';
import { PROMO_COMPOSITION_REGISTRY_VERSION } from '../supabase/functions/_shared/promo-compositions.ts';

const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const brandIdentityFor = manifest => ({
  id: '90000000-0000-4000-8000-000000000003', branch_id: manifest.promo.branch.slug,
  name: `Identity for ${manifest.promo.branch.slug}`, status: 'active',
  color_palette: { primary: '#112233', secondary: '#223344', accent: '#cc5500', neutral: '#f4f4f4' },
  typography: { heading: 'Source Heading', body: 'Source Body' }, updated_at: '2026-08-25T12:00:00.000Z',
});
const buildPromoRenderJobInput = (manifest, assets, approvals, selectedPreviewAssetId, jobType, format, assetBindingIds = null) =>
  buildServerPromoRenderJobInput(
    manifest, assets, approvals, selectedPreviewAssetId, jobType, format,
    { id: manifest.promo.branch.id, slug: manifest.promo.branch.slug, name: manifest.promo.branch.display_name, is_active: true },
    brandIdentityFor(manifest),
    assetBindingIds,
  );

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

  const unknownComposition = await fixture();
  unknownComposition.manifest.render.composition = 'BrowserSuppliedComposition';
  assert.throws(
    () => buildPromoRenderJobInput(unknownComposition.manifest, unknownComposition.assets, [], null, 'preview_render', '9:16'),
    error => error.code === 'PROMO_RENDER_COMPOSITION_UNKNOWN',
  );

  const wrongVersion = await fixture();
  wrongVersion.manifest.render.composition_version = 'ps-002-v2';
  assert.throws(
    () => buildPromoRenderJobInput(wrongVersion.manifest, wrongVersion.assets, [], null, 'preview_render', '9:16'),
    error => error.code === 'PROMO_RENDER_COMPOSITION_UNKNOWN',
  );

  const wrongPipeline = await fixture();
  wrongPipeline.manifest.render.composition = 'vertical-ui-story';
  wrongPipeline.manifest.render.composition_version = 'v1';
  assert.throws(
    () => buildPromoRenderJobInput(wrongPipeline.manifest, wrongPipeline.assets, [], null, 'preview_render', '9:16'),
    error => error.code === 'PROMO_RENDER_PIPELINE_FINGERPRINT_INVALID',
  );

  const crossBranchProof = await fixture();
  crossBranchProof.manifest.promo.branch.slug = 'another-branch';
  assert.throws(
    () => buildPromoRenderJobInput(crossBranchProof.manifest, crossBranchProof.assets, [], null, 'preview_render', '9:16'),
    error => error.code === 'PROMO_RENDER_COMPOSITION_SCOPE_INVALID',
  );

  const mismatchedBranch = await fixture();
  assert.throws(
    () => buildServerPromoRenderJobInput(
      mismatchedBranch.manifest, mismatchedBranch.assets, [], null, 'preview_render', '9:16',
      { id: mismatchedBranch.manifest.promo.branch.id, slug: 'another-branch', name: 'Another Branch', is_active: true },
      brandIdentityFor(mismatchedBranch.manifest),
    ),
    error => error.code === 'PROMO_RENDER_BRANCH_MISMATCH',
  );

  const unsafeArea = await fixture();
  unsafeArea.manifest.format_variants[0].safe_area.top = 1900;
  assert.throws(() => buildPromoRenderJobInput(unsafeArea.manifest, unsafeArea.assets, [], null, 'preview_render', '9:16'), /safe area/i);

  const unapprovedClaim = await fixture();
  unapprovedClaim.manifest.evidence.claims[0].approved = false;
  assert.throws(() => buildPromoRenderJobInput(unapprovedClaim.manifest, unapprovedClaim.assets, [], null, 'preview_render', '9:16'), /every claim/i);
});

test('branch-neutral compositions resolve only from the pinned registry', async () => {
  const firstBranch = await fixture();
  firstBranch.manifest.promo.branch.slug = 'atl-urban-farms';
  firstBranch.manifest.render.composition = 'vertical-ui-story';
  firstBranch.manifest.render.composition_version = 'v1';
  firstBranch.manifest.render.ffmpeg_fingerprint = '0a9e6171f5890e5308058f3ed06f3abfd68361d5cbae97c45b5b481613bb258e';
  const firstInput = buildPromoRenderJobInput(firstBranch.manifest, firstBranch.assets, [], null, 'preview_render', '9:16');

  const secondBranch = await fixture();
  secondBranch.manifest.promo.branch.slug = 'farm-sproutify';
  secondBranch.manifest.render.composition = 'vertical-ui-story';
  secondBranch.manifest.render.composition_version = 'v1';
  secondBranch.manifest.render.ffmpeg_fingerprint = '0a9e6171f5890e5308058f3ed06f3abfd68361d5cbae97c45b5b481613bb258e';
  const secondInput = buildPromoRenderJobInput(secondBranch.manifest, secondBranch.assets, [], null, 'preview_render', '9:16');

  for (const input of [firstInput, secondInput]) {
    assert.equal(input.render_profile.composition, 'vertical-ui-story');
    assert.equal(input.render_profile.composition_version, 'v1');
    assert.equal(input.render_profile.composition_registry_version, PROMO_COMPOSITION_REGISTRY_VERSION);
    assert.equal(input.render_profile.composition_status, 'worker_enabled');
    assert.equal(input.render_profile.composition_worker_enabled, true);
    assert.match(input.render_profile.composition_source_fingerprint_sha256, /^[a-f0-9]{64}$/);
    assert.equal(input.render_profile.expected_ffmpeg_fingerprint, '0a9e6171f5890e5308058f3ed06f3abfd68361d5cbae97c45b5b481613bb258e');
  }
});

test('presentation is approved, branch-bound, and preserves Rekkrd locked styling', async () => {
  const [cardStylesSource, presentationSource] = await Promise.all([
    read('../services/brandCardStyles.ts'), read('../supabase/functions/_shared/promo-presentation.ts'),
  ]);
  for (const approvedToken of ['#14100c', '#1e1811', '#efe9e0', '#9a8f80', '#e8621a', 'Playfair Display', 'JetBrains Mono']) {
    assert.match(cardStylesSource, new RegExp(approvedToken, 'i'));
    assert.match(presentationSource, new RegExp(approvedToken, 'i'));
  }
  const rekkrd = await fixture();
  const rekkrdInput = buildPromoRenderJobInput(rekkrd.manifest, rekkrd.assets, [], null, 'preview_render', '9:16');
  assert.deepEqual(rekkrdInput.presentation.brand, {
    name: rekkrd.manifest.promo.branch.display_name, logo_asset_id: null,
    background: '#14100c', surface: '#1e1811', foreground: '#efe9e0', muted: '#9a8f80', accent: '#e8621a',
    display_font: 'Playfair Display', label_font: 'JetBrains Mono',
  });
  assert.equal(rekkrdInput.presentation.approval_source, 'active_brand_identity+locked_style_registry');
  assert.equal(rekkrdInput.presentation.target_branch_id, rekkrd.manifest.promo.branch.id);

  const generic = await fixture();
  generic.manifest.promo.branch.slug = 'atlurbanfarms';
  generic.manifest.promo.branch.display_name = 'ATL Urban Farms';
  generic.manifest.render.composition = 'vertical-ui-story';
  generic.manifest.render.composition_version = 'v1';
  generic.manifest.render.ffmpeg_fingerprint = '0a9e6171f5890e5308058f3ed06f3abfd68361d5cbae97c45b5b481613bb258e';
  const genericInput = buildPromoRenderJobInput(generic.manifest, generic.assets, [], null, 'preview_render', '9:16');
  assert.deepEqual(genericInput.presentation.brand, {
    name: 'ATL Urban Farms', logo_asset_id: null,
    background: '#112233', surface: '#223344', foreground: '#f4f4f4', muted: '#f4f4f4', accent: '#cc5500',
    display_font: 'Source Heading', label_font: 'Source Body',
  });
  assert.equal(genericInput.presentation.approval_source, 'active_brand_identity');

  assert.throws(
    () => buildServerPromoRenderJobInput(
      generic.manifest, generic.assets, [], null, 'preview_render', '9:16',
      { id: generic.manifest.promo.branch.id, slug: generic.manifest.promo.branch.slug, name: 'ATL Urban Farms', is_active: true },
      null,
    ),
    error => error.code === 'PROMO_PRESENTATION_IDENTITY_NOT_READY',
  );
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

test('active revision bindings allow immutable assets from a parent revision and reject unbound assets', async () => {
  const carried = await fixture();
  const originRevisionId = '33333333-3333-4333-8333-333333333333';
  for (const asset of carried.assets) asset.revision_id = originRevisionId;
  const requiredIds = carried.manifest.assets.map(asset => asset.id);
  const input = buildPromoRenderJobInput(
    carried.manifest, carried.assets, [], null, 'preview_render', '9:16', requiredIds,
  );
  assert.equal(input.mode, 'preview');

  assert.throws(
    () => buildPromoRenderJobInput(
      carried.manifest, carried.assets, [], null, 'preview_render', '9:16', requiredIds.slice(1),
    ),
    error => error.code === 'PROMO_RENDER_ASSET_NOT_READY',
  );
});

test('render jobs are server-resolved while the deployed Edge worker remains noop-only', async () => {
  const [edge, worker, service, readme, proof] = await Promise.all([
    read('../supabase/functions/promo-studio/index.ts'), read('../supabase/functions/promo-worker/index.ts'),
    read('../services/promoStudioService.ts'), read('../workers/promo-render-worker/README.md'),
    read('../workers/clip-render-worker/proofs/ps-002/PromoProof.tsx'),
  ]);
  assert.match(edge, /revision\.manifest, assets \|\| \[\], approvals \|\| \[\], project\.selected_preview_render_id, jobType, body\.format, branch/);
  assert.match(edge, /brandIdentities\[0\]/);
  assert.match(edge, /"preview_render", "final_render"/);
  assert.match(worker, /p_job_types: \["noop"\]/);
  assert.doesNotMatch(worker, /p_job_types: \["preview_render"/);
  assert.match(service, /mode === 'preview' \? 'preview_render' : 'final_render'/);
  assert.match(readme, /non-claiming worker preflight/i);
  assert.match(proof, /#13232b/);
  assert.match(readme, /Rekkrd-specific styling/i);
});
