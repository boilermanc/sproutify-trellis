const MUSIC_DIRECTIONS = new Set(["understated", "balanced", "energetic"]);

export class PromoMusicReadinessError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PromoMusicReadinessError";
    this.code = code;
  }
}

function record(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function configured(value: unknown): value is string {
  return typeof value === "string" && !!value.trim() && value !== "unconfigured";
}

function configuredStrings(value: unknown, min = 0, max = 20): value is string[] {
  return Array.isArray(value) && value.length >= min && value.length <= max && value.every(configured);
}

function manifestAsset(row: Record<string, any>) {
  if (!configured(row.id) || row.status !== "ready" || row.kind !== "music_master"
    || !configured(row.role) || !configured(row.storage_bucket) || !configured(row.storage_path)
    || row.mime_type !== "audio/wav" || !/^[a-f0-9]{64}$/i.test(String(row.checksum_sha256 || ""))) {
    throw new PromoMusicReadinessError("PROMO_MUSIC_ASSET_INVALID", "Completed music asset is incomplete or not ready.");
  }
  return {
    id: row.id, kind: row.kind, role: row.role, storage_bucket: row.storage_bucket,
    storage_path: row.storage_path, mime_type: row.mime_type, checksum_sha256: row.checksum_sha256,
    duration_seconds: Number(row.duration_seconds), width: null, height: null,
    provenance: {
      source_kind: "provider", source_ref: `job:${row.provenance?.job_id || "unknown"}`,
      generated: true, approved: true,
    },
  };
}

function parseBrief(value: unknown) {
  if (!configured(value)) throw new PromoMusicReadinessError("PROMO_MUSIC_BRIEF_REQUIRED", "An approved structured music brief is required.");
  let brief: unknown;
  try { brief = JSON.parse(value); } catch { throw new PromoMusicReadinessError("PROMO_MUSIC_BRIEF_INVALID", "Music brief must be valid structured JSON."); }
  if (!record(brief) || brief.instrumental !== true || !configured(brief.mood)
    || !Number.isInteger(brief.tempo_min_bpm) || !Number.isInteger(brief.tempo_max_bpm)
    || brief.tempo_min_bpm < 40 || brief.tempo_max_bpm > 220 || brief.tempo_min_bpm > brief.tempo_max_bpm
    || !configuredStrings(brief.instrumentation, 1) || !Array.isArray(brief.energy_arc) || !brief.energy_arc.length
    || brief.energy_arc.length > 30 || !configuredStrings(brief.accent_phrase_ids)
    || !configured(brief.ending) || !configuredStrings(brief.avoid)) {
    throw new PromoMusicReadinessError("PROMO_MUSIC_BRIEF_INVALID", "Music brief is incomplete or outside supported bounds.");
  }
  return brief;
}

export function buildPromoMusicGenerationJobInput(manifestValue: unknown, directionValue: unknown, reservationsValue: unknown = []) {
  if (!record(manifestValue) || !record(manifestValue.promo) || !record(manifestValue.brand)
    || !record(manifestValue.script) || !record(manifestValue.music) || !Array.isArray(manifestValue.script.phrases)
    || !Array.isArray(manifestValue.music.takes)) {
    throw new PromoMusicReadinessError("PROMO_MUSIC_MANIFEST_INVALID", "Music manifest is invalid.");
  }
  if (manifestValue.script.status !== "approved") {
    throw new PromoMusicReadinessError("PROMO_MUSIC_SCRIPT_NOT_APPROVED", "Approve the script before music can be queued.");
  }
  if (!configured(manifestValue.music.profile_id) || !record(manifestValue.brand.sonic_profile)
    || !configuredStrings(manifestValue.brand.sonic_profile.qualities, 1)
    || !configuredStrings(manifestValue.brand.sonic_profile.avoid)) {
    throw new PromoMusicReadinessError("PROMO_MUSIC_PROFILE_REQUIRED", "A configured sonic profile is required before music can be queued.");
  }
  if (!Number.isFinite(manifestValue.promo.target_seconds) || manifestValue.promo.target_seconds < 1 || manifestValue.promo.target_seconds > 600) {
    throw new PromoMusicReadinessError("PROMO_MUSIC_TARGET_INVALID", "Music target duration must be between 1 and 600 seconds.");
  }
  const direction = typeof directionValue === "string" ? directionValue : "";
  if (!MUSIC_DIRECTIONS.has(direction)) throw new PromoMusicReadinessError("PROMO_MUSIC_DIRECTION_INVALID", "Choose a supported music direction.");
  if (manifestValue.music.takes.length >= 3) throw new PromoMusicReadinessError("PROMO_MUSIC_TAKE_LIMIT", "A Promo Manifest can contain at most three music takes.");

  const reservations = Array.isArray(reservationsValue) ? reservationsValue.filter(record) : [];
  if (manifestValue.music.takes.some((take: any) => take?.direction === direction && take?.status !== "failed")
    || reservations.some(reservation => reservation.direction === direction)) {
    throw new PromoMusicReadinessError("PROMO_MUSIC_DIRECTION_EXISTS", "That music direction already has an active take.");
  }
  const usedTakeNumbers = new Set([
    ...manifestValue.music.takes.map((take: any) => Number(take?.take_number)),
    ...reservations.map(reservation => Number(reservation.take_number)),
  ]);
  const takeNumber = [1, 2, 3].find(number => !usedTakeNumbers.has(number));
  if (!takeNumber) throw new PromoMusicReadinessError("PROMO_MUSIC_TAKE_LIMIT", "A Promo Manifest can contain at most three music takes.");

  const brief = parseBrief(manifestValue.music.brief);
  const phraseIds = new Set(manifestValue.script.phrases.map((phrase: any) => phrase?.id).filter(configured));
  if (brief.energy_arc.some((cue: any) => !record(cue) || !configured(cue.phrase_id)
    || !phraseIds.has(cue.phrase_id) || !configured(cue.direction))) {
    throw new PromoMusicReadinessError("PROMO_MUSIC_PHRASE_UNKNOWN", "Music energy cues must reference approved script phrases.");
  }
  if (brief.accent_phrase_ids.some((phraseId: string) => !phraseIds.has(phraseId))) {
    throw new PromoMusicReadinessError("PROMO_MUSIC_PHRASE_UNKNOWN", "Music accents must reference approved script phrases.");
  }

  return {
    schema_version: "1.0.0",
    music_profile_id: manifestValue.music.profile_id,
    take_number: takeNumber,
    direction,
    target_seconds: manifestValue.promo.target_seconds,
    instrumental: true,
    sonic_profile: {
      qualities: manifestValue.brand.sonic_profile.qualities,
      avoid: manifestValue.brand.sonic_profile.avoid,
    },
    brief: {
      mood: brief.mood,
      tempo_min_bpm: brief.tempo_min_bpm,
      tempo_max_bpm: brief.tempo_max_bpm,
      instrumentation: brief.instrumentation,
      energy_arc: brief.energy_arc.map((cue: any) => ({ phrase_id: cue.phrase_id, direction: cue.direction })),
      accent_phrase_ids: brief.accent_phrase_ids,
      ending: brief.ending,
      avoid: brief.avoid,
    },
  };
}

export function applyPromoMusicAdoption(
  manifestValue: unknown,
  takeValue: unknown,
  audioAssetValue: unknown,
  jobIdValue: unknown,
) {
  if (!record(manifestValue) || !record(manifestValue.music) || !Array.isArray(manifestValue.music.takes)
    || !record(manifestValue.voice) || !record(manifestValue.promo) || !record(manifestValue.run_lineage)
    || !Array.isArray(manifestValue.assets)) {
    throw new PromoMusicReadinessError("PROMO_MUSIC_MANIFEST_INVALID", "Music manifest is invalid.");
  }
  if (!record(takeValue) || !record(audioAssetValue) || !configured(jobIdValue)
    || !configured(takeValue.id) || !Number.isInteger(takeValue.take_number)
    || !MUSIC_DIRECTIONS.has(takeValue.direction) || !configured(takeValue.provider)
    || !configured(takeValue.model) || takeValue.status !== "ready" || takeValue.selected !== false
    || takeValue.audio_asset_id !== audioAssetValue.id || !Number.isFinite(Number(takeValue.duration_seconds))
    || Number(takeValue.duration_seconds) < Number(manifestValue.promo.target_seconds)) {
    throw new PromoMusicReadinessError("PROMO_MUSIC_RESULT_INVALID", "Completed music generation result is invalid.");
  }
  if (manifestValue.music.takes.some((take: any) => take?.id === takeValue.id
    || Number(take?.take_number) === Number(takeValue.take_number))) {
    throw new PromoMusicReadinessError("PROMO_MUSIC_RESULT_DUPLICATE", "Music take is already present in the active manifest.");
  }
  const manifest = structuredClone(manifestValue);
  const asset = manifestAsset(audioAssetValue);
  manifest.assets.push(asset);
  for (const take of manifest.music.takes) take.selected = false;
  manifest.music.takes.push({
    id: takeValue.id, take_number: Number(takeValue.take_number), direction: takeValue.direction,
    provider: takeValue.provider, model: takeValue.model, provider_job_id: takeValue.provider_job_id || null,
    audio_asset_id: takeValue.audio_asset_id, duration_seconds: Number(takeValue.duration_seconds),
    selected: true, status: "ready", cue_markers: Array.isArray(takeValue.cue_markers) ? takeValue.cue_markers : [],
  });
  manifest.music.selected_take_id = takeValue.id;
  manifest.run_lineage.job_ids = [...new Set([...(manifest.run_lineage.job_ids || []), jobIdValue])];
  if (configured(takeValue.provider_job_id)) manifest.run_lineage.provider_ids = [...new Set([...(manifest.run_lineage.provider_ids || []), takeValue.provider_job_id])];
  manifest.run_lineage.output_checksums = [...new Set([...(manifest.run_lineage.output_checksums || []), audioAssetValue.checksum_sha256])];
  manifest.run_lineage.estimated_cost_usd = Number(manifest.run_lineage.estimated_cost_usd || 0) + Math.max(0, Number(takeValue.estimated_cost_usd || 0));
  manifest.promo.status = manifest.voice.selected_take_id ? "asset_review" : "audio_review";
  return manifest;
}
