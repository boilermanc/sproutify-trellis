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
  if (!Number.isFinite(manifestValue.promo.target_seconds) || manifestValue.promo.target_seconds <= 0 || manifestValue.promo.target_seconds > 600) {
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
      energy_arc: brief.energy_arc,
      accent_phrase_ids: brief.accent_phrase_ids,
      ending: brief.ending,
      avoid: brief.avoid,
    },
  };
}
