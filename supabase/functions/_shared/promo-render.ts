const SHA256 = /^[a-f0-9]{64}$/i;
const SAFE_KEY = /^[A-Za-z][A-Za-z0-9._-]{0,79}$/;

export class PromoRenderReadinessError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PromoRenderReadinessError";
    this.code = code;
  }
}

function record(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function configured(value: unknown): value is string {
  return typeof value === "string" && !!value.trim() && value !== "unconfigured";
}

function near(left: number, right: number, tolerance = 0.001) {
  return Math.abs(left - right) <= tolerance;
}

export function buildPromoRenderJobInput(
  manifestValue: unknown,
  assetRowsValue: unknown,
  approvalsValue: unknown,
  selectedPreviewAssetIdValue: unknown,
  jobTypeValue: unknown,
  formatValue: unknown,
) {
  if (!record(manifestValue) || !record(manifestValue.promo) || !record(manifestValue.script)
    || !record(manifestValue.captions) || !record(manifestValue.voice) || !record(manifestValue.music)
    || !record(manifestValue.captures) || !record(manifestValue.render)
    || !Array.isArray(manifestValue.assets) || !Array.isArray(manifestValue.scenes)
    || !Array.isArray(manifestValue.script.phrases) || !Array.isArray(manifestValue.captions.cues)
    || !Array.isArray(manifestValue.voice.takes) || !Array.isArray(manifestValue.music.takes)
    || !Array.isArray(manifestValue.format_variants) || !Array.isArray(manifestValue.captures.scenarios)) {
    throw new PromoRenderReadinessError("PROMO_RENDER_MANIFEST_INVALID", "Render manifest is invalid.");
  }
  const jobType = typeof jobTypeValue === "string" ? jobTypeValue : "";
  if (!["preview_render", "final_render"].includes(jobType)) {
    throw new PromoRenderReadinessError("PROMO_RENDER_JOB_INVALID", "Choose preview or final render.");
  }
  if (manifestValue.script.status !== "approved") {
    throw new PromoRenderReadinessError("PROMO_RENDER_SCRIPT_NOT_APPROVED", "Approve the script before rendering.");
  }
  const targetSeconds = Number(manifestValue.promo.target_seconds);
  if (!Number.isFinite(targetSeconds) || targetSeconds < 1 || targetSeconds > 600) {
    throw new PromoRenderReadinessError("PROMO_RENDER_TARGET_INVALID", "Render target duration must be between 1 and 600 seconds.");
  }
  const format = typeof formatValue === "string" ? formatValue : "";
  if (format !== "9:16") {
    throw new PromoRenderReadinessError("PROMO_RENDER_FORMAT_UNSUPPORTED", "The current proof contract supports only 9:16 rendering.");
  }
  const variant = manifestValue.format_variants.find((item: any) => item?.format === format);
  if (!record(variant) || variant.width !== 1080 || variant.height !== 1920) {
    throw new PromoRenderReadinessError("PROMO_RENDER_DIMENSIONS_INVALID", "Vertical proof rendering requires a 1080x1920 format variant.");
  }
  if (!["contain", "cover", "guided"].includes(variant.crop_policy) || !record(variant.safe_area)
    || [variant.safe_area.top, variant.safe_area.right, variant.safe_area.bottom, variant.safe_area.left]
      .some(value => !Number.isFinite(value) || value < 0)
    || variant.safe_area.top + variant.safe_area.bottom >= variant.height
    || variant.safe_area.left + variant.safe_area.right >= variant.width) {
    throw new PromoRenderReadinessError("PROMO_RENDER_SAFE_AREA_INVALID", "Vertical proof safe area and crop policy are invalid.");
  }
  const render = manifestValue.render;
  if (!configured(render.composition) || !SAFE_KEY.test(render.composition)
    || !configured(render.composition_version) || !SAFE_KEY.test(render.composition_version)
    || render.fps !== 30 || render.video_codec !== "h264" || render.pixel_format !== "yuv420p"
    || render.audio_codec !== "aac" || render.audio_sample_rate !== 48000
    || !near(render.integrated_lufs, -14) || !near(render.true_peak_dbfs, -1.5)
    || !SHA256.test(String(render.ffmpeg_fingerprint || ""))) {
    throw new PromoRenderReadinessError("PROMO_RENDER_PROFILE_INVALID", "Render settings do not match the proven vertical delivery profile.");
  }

  const phraseById = new Map(manifestValue.script.phrases.map((phrase: any) => [phrase?.id, phrase]));
  if (manifestValue.safety?.strict_claims === true && (!Array.isArray(manifestValue.evidence?.claims)
    || manifestValue.evidence.claims.some((claim: any) => !["verified", "user_attested"].includes(claim?.status) || claim?.approved !== true))) {
    throw new PromoRenderReadinessError("PROMO_RENDER_CLAIMS_NOT_APPROVED", "Strict rendering requires every claim to be verified and approved.");
  }
  const captions = manifestValue.captions.cues.map((cue: any) => {
    const phrase = phraseById.get(cue?.phrase_id);
    if (!record(cue) || !configured(cue.id) || !record(phrase) || !configured(phrase.display_text)
      || !Number.isFinite(cue.start_seconds) || !Number.isFinite(cue.end_seconds)
      || cue.start_seconds < 0 || cue.end_seconds <= cue.start_seconds || cue.end_seconds > targetSeconds) {
      throw new PromoRenderReadinessError("PROMO_RENDER_CAPTIONS_INVALID", "Captions must map to approved display phrases inside the render timebase.");
    }
    return {
      cue_id: cue.id,
      phrase_id: cue.phrase_id,
      start_seconds: cue.start_seconds,
      end_seconds: cue.end_seconds,
      text: phrase.display_text,
    };
  });
  if (!captions.length) throw new PromoRenderReadinessError("PROMO_RENDER_CAPTIONS_REQUIRED", "At least one approved caption cue is required.");

  const selectedVoice = manifestValue.voice.takes.find((take: any) => take?.id === manifestValue.voice.selected_take_id);
  const selectedMusic = manifestValue.music.takes.find((take: any) => take?.id === manifestValue.music.selected_take_id);
  if (!record(selectedVoice) || selectedVoice.status !== "ready" || selectedVoice.selected !== true
    || !configured(selectedVoice.audio_asset_id) || !Number.isFinite(selectedVoice.duration_seconds)
    || selectedVoice.duration_seconds <= 0 || selectedVoice.duration_seconds > targetSeconds
    || (!selectedVoice.words?.length && !selectedVoice.phrases?.length)) {
    throw new PromoRenderReadinessError("PROMO_RENDER_VOICE_NOT_READY", "A selected, aligned voice master is required before rendering.");
  }
  const timings = [...(Array.isArray(selectedVoice.words) ? selectedVoice.words : []), ...(Array.isArray(selectedVoice.phrases) ? selectedVoice.phrases : [])];
  if (timings.some((timing: any) => !Number.isFinite(timing?.confidence)
    || timing.confidence < manifestValue.voice.minimum_alignment_confidence)) {
    throw new PromoRenderReadinessError("PROMO_RENDER_ALIGNMENT_LOW", "Selected voice timing is below the required confidence.");
  }
  if (!record(selectedMusic) || selectedMusic.status !== "ready" || selectedMusic.selected !== true
    || !configured(selectedMusic.audio_asset_id) || !Number.isFinite(selectedMusic.duration_seconds)
    || selectedMusic.duration_seconds < targetSeconds) {
    throw new PromoRenderReadinessError("PROMO_RENDER_MUSIC_NOT_READY", "A selected instrumental music master covering the full render is required.");
  }

  const captureById = new Map(manifestValue.captures.scenarios.map((capture: any) => [capture?.id, capture]));
  const generatedVisualSceneIds: string[] = [];
  const scenes = [...manifestValue.scenes].sort((left: any, right: any) => Number(left?.position) - Number(right?.position)).map((scene: any, index: number) => {
    if (!record(scene) || !record(scene.anchor) || !record(scene.duration) || !record(scene.visual) || !record(scene.transition)
      || !configured(scene.id) || scene.position !== index || !phraseById.has(scene.anchor.phrase_id)
      || !["start", "end"].includes(scene.anchor.edge)
      || !Number.isFinite(scene.duration.min_seconds) || !Number.isFinite(scene.duration.preferred_seconds)
      || !Number.isFinite(scene.duration.max_seconds) || scene.duration.min_seconds <= 0
      || scene.duration.min_seconds > scene.duration.preferred_seconds || scene.duration.preferred_seconds > scene.duration.max_seconds
      || !configured(scene.visual.kind) || !["cut", "fade", "dissolve", "slide"].includes(scene.transition.type)
      || !Number.isFinite(scene.transition.duration_seconds) || scene.transition.duration_seconds < 0
      || scene.transition.duration_seconds > scene.duration.preferred_seconds) {
      throw new PromoRenderReadinessError("PROMO_RENDER_SCENE_INVALID", "Every render scene requires an approved phrase anchor, duration, and visual.");
    }
    if (scene.visual.kind === "real_ui_capture") {
      const capture = captureById.get(scene.visual.capture_scenario_id);
      if (!record(capture) || capture.status !== "verified" || !Array.isArray(capture.assertions)
        || capture.assertions.some((assertion: any) => assertion?.passed !== true)) {
        throw new PromoRenderReadinessError("PROMO_RENDER_CAPTURE_NOT_VERIFIED", "Real UI scenes require verified capture assertions.");
      }
    }
    if (!configured(scene.visual.asset_id)) {
      throw new PromoRenderReadinessError("PROMO_RENDER_SCENE_ASSET_REQUIRED", "Every render scene requires a materialized visual asset.");
    }
    if (scene.visual.kind === "generated_visual") {
      if (scene.visual.generated_visual_disclosed !== true) {
        throw new PromoRenderReadinessError("PROMO_RENDER_GENERATED_UNDISCLOSED", "Generated visual scenes require disclosure before rendering.");
      }
      generatedVisualSceneIds.push(scene.id);
    }
    return {
      scene_id: scene.id,
      position: scene.position,
      anchor: { phrase_id: scene.anchor.phrase_id, edge: scene.anchor.edge },
      duration_seconds: scene.duration.preferred_seconds,
      visual: {
        kind: scene.visual.kind,
        asset_id: scene.visual.asset_id,
        capture_scenario_id: scene.visual.capture_scenario_id || null,
        generated_visual_disclosed: scene.visual.generated_visual_disclosed === true,
      },
      transition: { type: scene.transition.type, duration_seconds: scene.transition.duration_seconds },
    };
  });
  if (!scenes.length || !near(scenes.reduce((sum, scene) => sum + scene.duration_seconds, 0), targetSeconds, 0.05)) {
    throw new PromoRenderReadinessError("PROMO_RENDER_TIMELINE_INVALID", "Preferred scene durations must fill the target render timebase.");
  }

  const requiredAssetIds = new Set([
    selectedVoice.audio_asset_id,
    selectedMusic.audio_asset_id,
    ...scenes.map(scene => scene.visual.asset_id),
  ]);
  const manifestAssetById = new Map(manifestValue.assets.map((asset: any) => [asset?.id, asset]));
  const assetRows = Array.isArray(assetRowsValue) ? assetRowsValue.filter(record) : [];
  const rowById = new Map(assetRows.map(row => [row.id, row]));
  for (const assetId of requiredAssetIds) {
    const asset = manifestAssetById.get(assetId);
    const row = rowById.get(assetId);
    if (!record(asset) || !record(row) || row.status !== "ready" || row.revision_id !== manifestValue.promo.revision_id
      || row.storage_bucket !== "promo-assets" || !configured(row.storage_path)
      || !SHA256.test(String(row.checksum_sha256 || "")) || row.checksum_sha256 !== asset.checksum_sha256) {
      throw new PromoRenderReadinessError("PROMO_RENDER_ASSET_NOT_READY", "Every render input must be a checksum-verified private asset from the active revision.");
    }
    if (jobType === "final_render" && asset.provenance?.approved !== true) {
      throw new PromoRenderReadinessError("PROMO_RENDER_ASSET_NOT_APPROVED", "Final rendering requires every input asset to be approved.");
    }
  }
  const approvals = Array.isArray(approvalsValue) ? approvalsValue.filter(record) : [];
  const selectedPreviewAssetId = typeof selectedPreviewAssetIdValue === "string" ? selectedPreviewAssetIdValue : "";
  const selectedPreviewAsset = rowById.get(selectedPreviewAssetId);
  const latestPreviewDecision = approvals
    .filter(approval => approval.revision_id === manifestValue.promo.revision_id && approval.gate === "preview"
      && approval.subject_type === "asset" && approval.subject_id === selectedPreviewAssetId)
    .sort((left, right) => String(right.created_at || "").localeCompare(String(left.created_at || "")))[0];
  if (jobType === "final_render" && (!record(selectedPreviewAsset) || selectedPreviewAsset.kind !== "render_preview"
    || selectedPreviewAsset.revision_id !== manifestValue.promo.revision_id || selectedPreviewAsset.status !== "ready"
    || selectedPreviewAsset.storage_bucket !== "promo-assets" || !configured(selectedPreviewAsset.storage_path)
    || selectedPreviewAsset.mime_type !== "video/mp4" || selectedPreviewAsset.width !== 1080
    || selectedPreviewAsset.height !== 1920 || !SHA256.test(String(selectedPreviewAsset.checksum_sha256 || "")))) {
    throw new PromoRenderReadinessError("PROMO_RENDER_PREVIEW_NOT_SELECTED", "Select a verified current-revision preview before final rendering.");
  }
  if (jobType === "final_render" && latestPreviewDecision?.decision !== "approved") {
    throw new PromoRenderReadinessError("PROMO_RENDER_PREVIEW_NOT_APPROVED", "Approve the current preview before final rendering.");
  }

  return {
    schema_version: "1.0.0",
    mode: jobType === "preview_render" ? "preview" : "final",
    format: {
      name: "9:16", width: 1080, height: 1920, crop_policy: variant.crop_policy,
      safe_area: variant.safe_area,
    },
    timeline: {
      target_seconds: targetSeconds,
      fps: 30,
      scenes,
      captions,
      voice_asset_id: selectedVoice.audio_asset_id,
      music_asset_id: selectedMusic.audio_asset_id,
    },
    render_profile: {
      composition: render.composition,
      composition_version: render.composition_version,
      video_codec: "h264",
      pixel_format: "yuv420p",
      audio_codec: "aac",
      audio_sample_rate: 48000,
      integrated_lufs: -14,
      true_peak_dbfs: -1.5,
      expected_ffmpeg_fingerprint: render.ffmpeg_fingerprint,
    },
    review: {
      provenance_overlay: jobType === "preview_render",
      generated_visual_scene_ids: generatedVisualSceneIds,
      approved_preview_asset_id: jobType === "final_render" ? selectedPreviewAssetId : null,
    },
    qa: {
      expected_width: 1080,
      expected_height: 1920,
      expected_fps: 30,
      duration_tolerance_seconds: 0.05,
      require_faststart: true,
      require_tv_color_range: true,
    },
  };
}
