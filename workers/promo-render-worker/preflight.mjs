import { createHash } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const HEX = /^#[0-9a-f]{6}$/i;
const SAFE_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))(?!.*\\)[^\u0000-\u001f]+$/;
const MAX_ASSET_BYTES = 1024 * 1024 * 1024;
const MAX_TOTAL_BYTES = 3 * MAX_ASSET_BYTES;

export class PromoRenderPreflightError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PromoRenderPreflightError';
    this.code = code;
  }
}

const fail = (code, message) => { throw new PromoRenderPreflightError(code, message); };
const record = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);

export const canonicalPromoJson = value => {
  const normalize = item => {
    if (Array.isArray(item)) return item.map(normalize);
    if (record(item)) return Object.fromEntries(
      Object.entries(item).sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalize(entry)]),
    );
    if (typeof item === 'number' && !Number.isFinite(item)) fail('PROMO_RENDER_INPUT_INVALID', 'Render input contains a non-finite number.');
    return item;
  };
  return JSON.stringify(normalize(value));
};

export const sha256Hex = bytes => createHash('sha256').update(bytes).digest('hex');
export const fingerprintPromoInput = input => sha256Hex(Buffer.from(canonicalPromoJson(input), 'utf8'));

const validateClaim = (job, workerId, now) => {
  if (!record(job) || !UUID.test(String(job.id || '')) || !UUID.test(String(job.project_id || ''))
    || !UUID.test(String(job.revision_id || '')) || !UUID.test(String(job.lease_token || ''))) {
    fail('PROMO_RENDER_CLAIM_INVALID', 'Claimed render identity is invalid.');
  }
  if (!['preview_render', 'final_render'].includes(job.job_type) || job.status !== 'running'
    || typeof workerId !== 'string' || !workerId.trim() || job.worker_id !== workerId.trim()) {
    fail('PROMO_RENDER_CLAIM_INVALID', 'Render claim does not belong to this worker.');
  }
  const leaseExpiresAt = Date.parse(job.lease_expires_at);
  if (!Number.isFinite(leaseExpiresAt) || leaseExpiresAt <= now.getTime()) {
    fail('PROMO_RENDER_LEASE_EXPIRED', 'Render claim lease is not active.');
  }
  if (!SHA256.test(String(job.input_fingerprint || '')) || !record(job.input)
    || fingerprintPromoInput(job.input) !== job.input_fingerprint) {
    fail('PROMO_RENDER_INPUT_FINGERPRINT_INVALID', 'Claimed render input does not match its server fingerprint.');
  }
};

const validateInput = (job, compositionSourceSha256) => {
  const input = job.input;
  const expectedMode = job.job_type === 'preview_render' ? 'preview' : 'final';
  if (input.schema_version !== '1.0.0' || input.mode !== expectedMode || !record(input.format)
    || input.format.name !== '9:16' || input.format.width !== 1080 || input.format.height !== 1920
    || !record(input.timeline) || input.timeline.fps !== 30 || !finite(input.timeline.target_seconds)
    || input.timeline.target_seconds < 1 || input.timeline.target_seconds > 600
    || !Array.isArray(input.timeline.scenes) || !input.timeline.scenes.length
    || !Array.isArray(input.timeline.captions) || !input.timeline.captions.length) {
    fail('PROMO_RENDER_INPUT_INVALID', 'Claimed render input does not match the vertical render contract.');
  }
  const profile = input.render_profile;
  if (!record(profile) || profile.composition !== 'vertical-ui-story' || profile.composition_version !== 'v1'
    || profile.composition_registry_version !== '1.0.0' || profile.composition_status !== 'render_verified'
    || profile.video_codec !== 'h264' || profile.pixel_format !== 'yuv420p'
    || profile.audio_codec !== 'aac' || profile.audio_sample_rate !== 48000
    || profile.integrated_lufs !== -14 || profile.true_peak_dbfs !== -1.5
    || !SHA256.test(String(profile.composition_source_fingerprint_sha256 || ''))
    || !SHA256.test(String(profile.expected_ffmpeg_fingerprint || ''))) {
    fail('PROMO_RENDER_PROFILE_INVALID', 'Claimed render profile is not the registered vertical profile.');
  }
  if (!SHA256.test(String(compositionSourceSha256 || ''))
    || profile.composition_source_fingerprint_sha256 !== compositionSourceSha256) {
    fail('PROMO_RENDER_COMPOSITION_FINGERPRINT_INVALID', 'Worker composition source does not match the claimed registry fingerprint.');
  }
  const sceneSeconds = input.timeline.scenes.reduce((sum, scene) => {
    if (!record(scene) || !UUID.test(String(scene.visual?.asset_id || '')) || !finite(scene.duration_seconds)
      || scene.duration_seconds <= 0 || !Number.isInteger(scene.position)) {
      fail('PROMO_RENDER_TIMELINE_INVALID', 'Render scenes require materialized UUID assets and positive durations.');
    }
    return sum + scene.duration_seconds;
  }, 0);
  if (Math.abs(sceneSeconds - input.timeline.target_seconds) > 0.05) {
    fail('PROMO_RENDER_TIMELINE_INVALID', 'Render scene durations do not fill the target timebase.');
  }
  if (input.timeline.captions.some(cue => !record(cue) || typeof cue.text !== 'string' || !cue.text.trim()
    || !finite(cue.start_seconds) || !finite(cue.end_seconds) || cue.start_seconds < 0
    || cue.end_seconds <= cue.start_seconds || cue.end_seconds > input.timeline.target_seconds)) {
    fail('PROMO_RENDER_CAPTIONS_INVALID', 'Render captions are invalid or outside the target timebase.');
  }
  if (!UUID.test(String(input.timeline.voice_asset_id || '')) || !UUID.test(String(input.timeline.music_asset_id || ''))) {
    fail('PROMO_RENDER_AUDIO_ASSET_INVALID', 'Voice and music inputs must be materialized UUID assets.');
  }
};

const validateLiveContext = (job, project, approvals, assets) => {
  if (!record(project) || project.id !== job.project_id || project.current_revision_id !== job.revision_id) {
    fail('PROMO_RENDER_REVISION_STALE', 'The claimed render no longer targets the active project revision.');
  }
  if (job.job_type !== 'final_render') return;
  const previewId = job.input.review?.approved_preview_asset_id;
  if (!UUID.test(String(previewId || '')) || project.selected_preview_render_id !== previewId) {
    fail('PROMO_RENDER_PREVIEW_SELECTION_STALE', 'The selected preview changed after this final render was queued.');
  }
  const preview = assets.find(asset => asset?.id === previewId);
  if (!record(preview) || preview.project_id !== job.project_id || preview.revision_id !== job.revision_id
    || preview.kind !== 'render_preview' || preview.status !== 'ready' || preview.storage_bucket !== 'promo-assets') {
    fail('PROMO_RENDER_PREVIEW_STALE', 'The selected preview is no longer a ready current-revision asset.');
  }
  const latest = approvals.filter(approval => approval?.revision_id === job.revision_id && approval?.gate === 'preview'
    && approval?.subject_type === 'asset' && approval?.subject_id === previewId)
    .sort((left, right) => String(right.created_at || '').localeCompare(String(left.created_at || '')))[0];
  if (latest?.decision !== 'approved') {
    fail('PROMO_RENDER_PREVIEW_APPROVAL_STALE', 'The selected preview approval was changed or revoked after queueing.');
  }
};

const buildAssetPlan = (job, assets) => {
  const roleById = new Map();
  const add = (id, role) => roleById.set(id, [...(roleById.get(id) || []), role]);
  add(job.input.timeline.voice_asset_id, 'voice');
  add(job.input.timeline.music_asset_id, 'music');
  for (const scene of job.input.timeline.scenes) add(scene.visual.asset_id, `scene:${scene.scene_id}`);
  if (UUID.test(String(job.input.presentation?.brand?.logo_asset_id || ''))) {
    add(job.input.presentation.brand.logo_asset_id, 'brand:logo');
  }
  const rowById = new Map(assets.filter(record).map(asset => [asset.id, asset]));
  const plan = [];
  let totalBytes = 0;
  for (const [assetId, roles] of roleById) {
    const asset = rowById.get(assetId);
    if (!record(asset) || asset.project_id !== job.project_id || asset.revision_id !== job.revision_id
      || asset.status !== 'ready' || asset.storage_bucket !== 'promo-assets'
      || !SAFE_PATH.test(String(asset.storage_path || ''))
      || !String(asset.storage_path).startsWith(`${job.project_id}/${assetId}/`)
      || !SHA256.test(String(asset.checksum_sha256 || ''))
      || !Number.isSafeInteger(asset.file_size_bytes) || asset.file_size_bytes < 1 || asset.file_size_bytes > MAX_ASSET_BYTES
      || typeof asset.mime_type !== 'string' || !/^(?:image|video|audio)\//.test(asset.mime_type)) {
      fail('PROMO_RENDER_ASSET_NOT_READY', `Render asset ${assetId} is not a bounded, checksum-verified private object.`);
    }
    totalBytes += asset.file_size_bytes;
    plan.push(Object.freeze({
      asset_id: assetId, roles: Object.freeze(roles), storage_bucket: 'promo-assets',
      storage_path: asset.storage_path, checksum_sha256: asset.checksum_sha256,
      file_size_bytes: asset.file_size_bytes, mime_type: asset.mime_type,
    }));
  }
  if (totalBytes > MAX_TOTAL_BYTES) fail('PROMO_RENDER_ASSETS_TOO_LARGE', 'Render inputs exceed the worker download budget.');
  return Object.freeze(plan);
};

export function inspectPromoRenderClaim({
  job, worker_id, now = new Date(), project, approvals = [], assets = [],
  composition_source_sha256, pipeline_fingerprint = null,
}) {
  validateClaim(job, worker_id, now);
  validateInput(job, composition_source_sha256);
  validateLiveContext(job, project, approvals, assets);
  const asset_plan = buildAssetPlan(job, assets);
  const blockers = [];
  if (job.input.render_profile.composition_worker_enabled !== true) blockers.push('PROMO_RENDER_COMPOSITION_DISABLED');
  const presentation = job.input.presentation;
  const brand = presentation?.brand;
  if (!record(presentation) || presentation.schema_version !== '1.0.0' || presentation.approved !== true
    || !UUID.test(String(presentation.approval_id || ''))
    || !['active_brand_identity', 'active_brand_identity+locked_style_registry'].includes(presentation.approval_source)
    || !UUID.test(String(presentation.source_branch_id || ''))
    || !UUID.test(String(presentation.target_branch_id || ''))
    || presentation.source_branch_id !== project.branch_id || presentation.target_branch_id !== project.branch_id
    || !Number.isFinite(Date.parse(presentation.source_updated_at)) || !record(brand)
    || typeof brand.name !== 'string' || !brand.name.trim() || brand.name.trim().length > 120
    || (brand.logo_asset_id !== null && !UUID.test(String(brand.logo_asset_id || '')))
    || ![brand.background, brand.surface, brand.foreground, brand.muted, brand.accent].every(value => HEX.test(String(value || '')))
    || typeof brand.display_font !== 'string' || !brand.display_font.trim() || brand.display_font.trim().length > 100
    || typeof brand.label_font !== 'string' || !brand.label_font.trim() || brand.label_font.trim().length > 100) {
    blockers.push('PROMO_RENDER_PRESENTATION_REQUIRED');
  }
  if (!SHA256.test(String(pipeline_fingerprint || ''))
    || pipeline_fingerprint !== job.input.render_profile.expected_ffmpeg_fingerprint) {
    blockers.push('PROMO_RENDER_PIPELINE_FINGERPRINT_MISMATCH');
  }
  return Object.freeze({
    job_id: job.id, project_id: job.project_id, revision_id: job.revision_id,
    input_fingerprint: job.input_fingerprint, asset_plan,
    activation_ready: blockers.length === 0, activation_blockers: Object.freeze(blockers),
  });
}

export function assertPromoRenderActivationReady(preflight) {
  if (!preflight?.activation_ready) {
    fail('PROMO_RENDER_ACTIVATION_BLOCKED', `Render activation is blocked: ${(preflight?.activation_blockers || []).join(', ')}`);
  }
  return preflight;
}

export async function downloadVerifiedPromoAssets(assetPlan, { signAsset, fetchAsset }) {
  if (!Array.isArray(assetPlan) || typeof signAsset !== 'function' || typeof fetchAsset !== 'function') {
    fail('PROMO_RENDER_DOWNLOAD_INVALID', 'Verified asset downloads require a preflight plan and injected adapters.');
  }
  const resolved = new Map();
  for (const asset of assetPlan) {
    const signedUrl = await signAsset({ bucket: asset.storage_bucket, path: asset.storage_path, expires_in: 300 });
    let parsed;
    try { parsed = new URL(signedUrl); } catch { fail('PROMO_RENDER_SIGNED_URL_INVALID', 'Storage returned an invalid signed asset URL.'); }
    if (parsed.protocol !== 'https:') fail('PROMO_RENDER_SIGNED_URL_INVALID', 'Signed asset downloads require HTTPS.');
    const value = await fetchAsset(signedUrl, { max_bytes: asset.file_size_bytes });
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
    if (bytes.byteLength !== asset.file_size_bytes || sha256Hex(bytes) !== asset.checksum_sha256) {
      fail('PROMO_RENDER_ASSET_CHECKSUM_MISMATCH', `Downloaded render asset ${asset.asset_id} failed byte and checksum verification.`);
    }
    resolved.set(asset.asset_id, Object.freeze({
      asset_id: asset.asset_id, roles: asset.roles, mime_type: asset.mime_type, bytes,
    }));
  }
  return resolved;
}
