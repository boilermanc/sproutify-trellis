import fs from 'node:fs';
import path from 'node:path';

export class ProofContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ProofContractError';
    this.code = code;
  }
}

const requireValue = (value, code, message) => {
  if (value === null || value === undefined || value === '') {
    throw new ProofContractError(code, message);
  }
};

export function validateManifest(manifest, { allowFoundationAssets = false, assetDir } = {}) {
  requireValue(manifest.project?.branch_slug, 'PROMO_PROOF_BRANCH_MISSING', 'A Trellis branch slug is required.');
  requireValue(manifest.project?.display_name, 'PROMO_PROOF_BRANCH_NAME_MISSING', 'A branch display name is required.');
  if (manifest.duration_seconds !== 10) {
    throw new ProofContractError('PS002_DURATION_INVALID', 'PS-002 must be exactly 10 seconds.');
  }
  if (manifest.fps !== 30 || manifest.format?.width !== 1080 || manifest.format?.height !== 1920) {
    throw new ProofContractError('PS002_FORMAT_INVALID', 'PS-002 must be 1080x1920 at 30 fps.');
  }
  if (!Array.isArray(manifest.captions) || manifest.captions.length === 0) {
    throw new ProofContractError('PS002_CAPTIONS_MISSING', 'At least one measured caption cue is required.');
  }
  for (const cue of manifest.captions) {
    if (!cue.text || cue.start_seconds < 0 || cue.end_seconds <= cue.start_seconds || cue.end_seconds > 10) {
      throw new ProofContractError('PS002_CAPTION_INVALID', 'Caption cues must be non-empty and inside the timebase.');
    }
  }

  if (!allowFoundationAssets) {
    if (manifest.capture?.kind !== 'real_ui_capture') {
      throw new ProofContractError('PS002_REAL_CAPTURE_REQUIRED', 'A verified real product UI capture is required.');
    }
    requireValue(manifest.capture.environment, 'PS002_CAPTURE_ENVIRONMENT_MISSING', 'Capture environment is required.');
    requireValue(manifest.capture.commit_sha, 'PS002_CAPTURE_COMMIT_MISSING', 'Pinned Rekkrd commit SHA is required.');
    if (manifest.capture.source_worktree_dirty === true) {
      requireValue(manifest.capture.source_diff_sha256, 'PS002_CAPTURE_DIFF_MISSING', 'Dirty capture source requires an exact diff checksum.');
    }
    requireValue(manifest.capture.checksum_sha256, 'PS002_CAPTURE_CHECKSUM_MISSING', 'Capture checksum is required.');
    if (manifest.capture.assertions_passed !== true) {
      throw new ProofContractError('PS002_CAPTURE_ASSERTIONS_FAILED', 'Capture assertions must pass.');
    }
    if (manifest.voice?.provider?.includes('foundation-only')) {
      throw new ProofContractError('PS002_REAL_VOICE_REQUIRED', 'A real provider voice take is required.');
    }
    requireValue(manifest.voice?.model, 'PS002_VOICE_MODEL_MISSING', 'Voice model provenance is required.');
    requireValue(manifest.voice?.voice_id, 'PS002_VOICE_ID_MISSING', 'Voice ID provenance is required.');
    requireValue(manifest.voice?.checksum_sha256, 'PS002_VOICE_CHECKSUM_MISSING', 'Voice checksum is required.');
    if (manifest.music?.provider?.includes('foundation-only')) {
      throw new ProofContractError('PS002_REAL_MUSIC_REQUIRED', 'A real provider music take is required.');
    }
    requireValue(manifest.music?.model, 'PS002_MUSIC_MODEL_MISSING', 'Music model provenance is required.');
    requireValue(manifest.music?.provider_job_id, 'PS002_MUSIC_JOB_MISSING', 'Music provider job provenance is required.');
    requireValue(manifest.music?.checksum_sha256, 'PS002_MUSIC_CHECKSUM_MISSING', 'Music checksum is required.');
    requireValue(manifest.end_card?.logo_file, 'PS002_BRAND_LOGO_MISSING', 'An approved branch logo asset is required.');
    requireValue(manifest.end_card?.logo_checksum_sha256, 'PS002_BRAND_LOGO_CHECKSUM_MISSING', 'Brand logo checksum is required.');
  }
  if (manifest.capture?.contains_pii !== false) {
    throw new ProofContractError('PS002_PII_STATUS_INVALID', 'Capture must explicitly record contains_pii=false.');
  }

  for (const key of ['capture', 'voice', 'music']) {
    requireValue(manifest[key]?.file, `PS002_${key.toUpperCase()}_FILE_MISSING`, `${key} file is required.`);
    if (assetDir && !fs.existsSync(path.join(assetDir, manifest[key].file))) {
      throw new ProofContractError(`PS002_${key.toUpperCase()}_ASSET_MISSING`, `${key} asset does not exist.`);
    }
  }
  if (assetDir && manifest.end_card?.logo_file && !fs.existsSync(path.join(assetDir, manifest.end_card.logo_file))) {
    throw new ProofContractError('PS002_BRAND_LOGO_ASSET_MISSING', 'Brand logo asset does not exist.');
  }
  return manifest;
}

export function validateProbe(probe) {
  const video = probe.streams?.find(stream => stream.codec_type === 'video');
  const audio = probe.streams?.find(stream => stream.codec_type === 'audio');
  const duration = Number(probe.format?.duration);
  if (!video || video.width !== 1080 || video.height !== 1920) {
    throw new ProofContractError('PS002_QA_DIMENSIONS', 'Output must contain a 1080x1920 video stream.');
  }
  if (video.codec_name !== 'h264' || video.pix_fmt !== 'yuv420p') {
    throw new ProofContractError('PS002_QA_VIDEO_CODEC', 'Output must be H.264 yuv420p.');
  }
  if (!['30/1', '30000/1000'].includes(video.avg_frame_rate)) {
    throw new ProofContractError('PS002_QA_FRAME_RATE', 'Output must be constant 30 fps.');
  }
  if (!audio || audio.codec_name !== 'aac' || Number(audio.sample_rate) !== 48000) {
    throw new ProofContractError('PS002_QA_AUDIO', 'Output must contain 48 kHz AAC audio.');
  }
  if (!Number.isFinite(duration) || Math.abs(duration - 10) > 0.12) {
    throw new ProofContractError('PS002_QA_DURATION', 'Output duration must be 10 seconds within 120 ms.');
  }
  return { width: video.width, height: video.height, fps: 30, duration, video: 'h264/yuv420p', audio: 'aac/48000' };
}

export function validateLoudness(measurement) {
  const integratedLufs = Number(measurement.input_i);
  const truePeakDbfs = Number(measurement.input_tp);
  if (!Number.isFinite(integratedLufs) || Math.abs(integratedLufs - (-14)) > 1) {
    throw new ProofContractError('PS002_QA_LOUDNESS', 'Integrated loudness must be approximately -14 LUFS (within 1 LU).');
  }
  if (!Number.isFinite(truePeakDbfs) || truePeakDbfs > -0.8) {
    throw new ProofContractError('PS002_QA_TRUE_PEAK', 'True peak must be at or below -0.8 dBFS.');
  }
  return { integrated_lufs: integratedLufs, true_peak_dbfs: truePeakDbfs };
}
