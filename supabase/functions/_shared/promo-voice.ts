const VOICE_DIRECTIONS = new Set(["natural", "warm_authority", "launch_energy"]);

export class PromoVoiceReadinessError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PromoVoiceReadinessError";
    this.code = code;
  }
}

function record(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function configured(value: unknown): value is string {
  return typeof value === "string" && !!value.trim() && value !== "unconfigured";
}

function configuredStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(configured);
}

function voiceManifest(value: unknown) {
  if (!record(value) || !record(value.promo) || !record(value.brand) || !record(value.script)
    || !record(value.voice) || !Array.isArray(value.script.phrases) || !Array.isArray(value.voice.takes)) {
    throw new PromoVoiceReadinessError("PROMO_VOICE_MANIFEST_INVALID", "Voice manifest is invalid.");
  }
  if (value.script.status !== "approved") {
    throw new PromoVoiceReadinessError("PROMO_VOICE_SCRIPT_NOT_APPROVED", "Approve the script before voice work can be queued.");
  }
  if (!configured(value.voice.profile_id) || !record(value.brand.voice_profile)) {
    throw new PromoVoiceReadinessError("PROMO_VOICE_PROFILE_REQUIRED", "A configured voice profile is required before voice work can be queued.");
  }
  if (!value.script.phrases.length) {
    throw new PromoVoiceReadinessError("PROMO_VOICE_SCRIPT_EMPTY", "At least one approved script phrase is required.");
  }
  if (!Number.isFinite(value.voice.minimum_alignment_confidence)
    || value.voice.minimum_alignment_confidence < 0 || value.voice.minimum_alignment_confidence > 1) {
    throw new PromoVoiceReadinessError("PROMO_VOICE_CONFIDENCE_INVALID", "Voice alignment confidence must be between zero and one.");
  }
  const phraseIds = new Set<string>();
  for (const phrase of value.script.phrases) {
    if (!record(phrase) || !configured(phrase.id) || !configured(phrase.speech_text) || phraseIds.has(phrase.id)) {
      throw new PromoVoiceReadinessError("PROMO_VOICE_PHRASES_INVALID", "Approved voice phrases require unique IDs and non-empty speech text.");
    }
    phraseIds.add(phrase.id);
  }
  return value;
}

export function buildPromoVoiceGenerationJobInput(manifestValue: unknown, directionValue: unknown, reservationsValue: unknown = []) {
  const manifest = voiceManifest(manifestValue);
  const reservations = Array.isArray(reservationsValue) ? reservationsValue.filter(record) : [];
  const direction = typeof directionValue === "string" ? directionValue : "";
  if (!VOICE_DIRECTIONS.has(direction)) {
    throw new PromoVoiceReadinessError("PROMO_VOICE_DIRECTION_INVALID", "Choose a supported voice direction.");
  }
  if (manifest.voice.takes.length >= 3) {
    throw new PromoVoiceReadinessError("PROMO_VOICE_TAKE_LIMIT", "A Promo Manifest can contain at most three voice takes.");
  }
  if (manifest.voice.takes.some((take: any) => take?.direction === direction && take?.status !== "failed")
    || reservations.some(reservation => reservation.direction === direction)) {
    throw new PromoVoiceReadinessError("PROMO_VOICE_DIRECTION_EXISTS", "That voice direction already has an active take.");
  }
  const usedTakeNumbers = new Set([
    ...manifest.voice.takes.map((take: any) => Number(take?.take_number)),
    ...reservations.map(reservation => Number(reservation.take_number)),
  ]);
  const takeNumber = [1, 2, 3].find(number => !usedTakeNumbers.has(number));
  if (!takeNumber) throw new PromoVoiceReadinessError("PROMO_VOICE_TAKE_LIMIT", "A Promo Manifest can contain at most three voice takes.");

  const profile = manifest.brand.voice_profile;
  if (!configured(profile.name) || !configured(profile.persona) || !Number.isInteger(profile.pace_wpm)
    || profile.pace_wpm < 80 || profile.pace_wpm > 240 || !configuredStrings(profile.qualities) || !configuredStrings(profile.avoid)) {
    throw new PromoVoiceReadinessError("PROMO_VOICE_PROFILE_INVALID", "The configured voice profile is incomplete.");
  }
  if (!Number.isFinite(manifest.promo.target_seconds) || manifest.promo.target_seconds <= 0 || manifest.promo.target_seconds > 600) {
    throw new PromoVoiceReadinessError("PROMO_VOICE_TARGET_INVALID", "Voice target duration must be between 1 and 600 seconds.");
  }

  return {
    schema_version: "1.0.0",
    voice_profile_id: manifest.voice.profile_id,
    take_number: takeNumber,
    direction,
    target_seconds: manifest.promo.target_seconds,
    delivery: {
      persona: profile.persona,
      qualities: profile.qualities,
      pace_wpm: profile.pace_wpm,
      avoid: profile.avoid,
    },
    script: {
      pronunciations: record(manifest.script.pronunciations) ? manifest.script.pronunciations : {},
      phrases: manifest.script.phrases.map((phrase: any) => ({
        phrase_id: phrase.id,
        speech_text: phrase.speech_text,
        emphasis: phrase.emphasis,
      })),
    },
    minimum_alignment_confidence: manifest.voice.minimum_alignment_confidence,
  };
}

export function buildPromoVoiceAlignmentJobInput(manifestValue: unknown, takeIdValue: unknown) {
  const manifest = voiceManifest(manifestValue);
  const takeId = typeof takeIdValue === "string" ? takeIdValue : "";
  const take = manifest.voice.takes.find((item: any) => item?.id === takeId);
  if (!record(take)) {
    throw new PromoVoiceReadinessError("PROMO_VOICE_TAKE_UNKNOWN", "Voice take does not belong to the active manifest.");
  }
  if (!configured(take.audio_asset_id) || !["generating", "aligning"].includes(take.status)) {
    throw new PromoVoiceReadinessError("PROMO_VOICE_TAKE_NOT_ALIGNABLE", "Voice alignment requires a generated audio asset awaiting alignment.");
  }
  if (configured(take.alignment_asset_id) || (Array.isArray(take.words) && take.words.length) || (Array.isArray(take.phrases) && take.phrases.length)) {
    throw new PromoVoiceReadinessError("PROMO_VOICE_TAKE_ALREADY_ALIGNED", "Voice take already contains alignment output.");
  }
  return {
    schema_version: "1.0.0",
    voice_profile_id: manifest.voice.profile_id,
    take_id: take.id,
    audio_asset_id: take.audio_asset_id,
    timing_source: manifest.voice.timing_source || "forced_alignment",
    minimum_alignment_confidence: manifest.voice.minimum_alignment_confidence,
    phrases: manifest.script.phrases.map((phrase: any) => ({ phrase_id: phrase.id, speech_text: phrase.speech_text })),
  };
}
