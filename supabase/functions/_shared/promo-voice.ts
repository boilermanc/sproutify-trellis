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

function manifestAsset(row: Record<string, any>, approved: boolean) {
  if (!configured(row.id) || row.status !== "ready" || !configured(row.kind) || !configured(row.role)
    || !configured(row.storage_bucket) || !configured(row.storage_path) || !configured(row.mime_type)
    || !/^[a-f0-9]{64}$/i.test(String(row.checksum_sha256 || ""))) {
    throw new PromoVoiceReadinessError("PROMO_VOICE_ASSET_INVALID", "Completed voice assets are incomplete or not ready.");
  }
  return {
    id: row.id, kind: row.kind, role: row.role, storage_bucket: row.storage_bucket,
    storage_path: row.storage_path, mime_type: row.mime_type, checksum_sha256: row.checksum_sha256,
    duration_seconds: row.duration_seconds == null ? null : Number(row.duration_seconds),
    width: row.width == null ? null : Number(row.width), height: row.height == null ? null : Number(row.height),
    provenance: {
      source_kind: "provider", source_ref: `job:${row.provenance?.job_id || "unknown"}`,
      generated: true, approved,
    },
  };
}

function appendLineage(manifest: Record<string, any>, jobId: string, providerJobId: unknown, checksum: unknown, cost: unknown) {
  manifest.run_lineage.job_ids = [...new Set([...(manifest.run_lineage.job_ids || []), jobId])];
  if (configured(providerJobId)) manifest.run_lineage.provider_ids = [...new Set([...(manifest.run_lineage.provider_ids || []), providerJobId])];
  if (typeof checksum === "string" && /^[a-f0-9]{64}$/i.test(checksum)) {
    manifest.run_lineage.output_checksums = [...new Set([...(manifest.run_lineage.output_checksums || []), checksum])];
  }
  manifest.run_lineage.estimated_cost_usd = Number(manifest.run_lineage.estimated_cost_usd || 0) + Math.max(0, Number(cost || 0));
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

export function applyPromoVoiceGenerationAdoption(
  manifestValue: unknown,
  takeValue: unknown,
  audioAssetValue: unknown,
  jobIdValue: unknown,
) {
  const manifest = structuredClone(voiceManifest(manifestValue));
  if (!record(takeValue) || !record(audioAssetValue) || !configured(jobIdValue)
    || !configured(takeValue.id) || !Number.isInteger(takeValue.take_number)
    || !VOICE_DIRECTIONS.has(takeValue.direction) || !configured(takeValue.provider)
    || !configured(takeValue.model) || !configured(takeValue.voice_id)
    || takeValue.status !== "aligning" || takeValue.selected !== false
    || takeValue.audio_asset_id !== audioAssetValue.id || takeValue.alignment_asset_id != null
    || !Number.isFinite(Number(takeValue.duration_seconds)) || Number(takeValue.duration_seconds) <= 0) {
    throw new PromoVoiceReadinessError("PROMO_VOICE_RESULT_INVALID", "Completed voice generation result is invalid.");
  }
  if (manifest.voice.takes.some((take: any) => take?.id === takeValue.id
    || Number(take?.take_number) === Number(takeValue.take_number))) {
    throw new PromoVoiceReadinessError("PROMO_VOICE_RESULT_DUPLICATE", "Voice take is already present in the active manifest.");
  }
  const asset = manifestAsset(audioAssetValue, false);
  if (asset.kind !== "voice_master" || asset.mime_type !== "audio/wav") {
    throw new PromoVoiceReadinessError("PROMO_VOICE_ASSET_INVALID", "Voice generation requires a WAV voice master.");
  }
  manifest.assets.push(asset);
  manifest.voice.takes.push({
    id: takeValue.id, take_number: Number(takeValue.take_number), direction: takeValue.direction,
    provider: takeValue.provider, model: takeValue.model, voice_id: takeValue.voice_id,
    settings: record(takeValue.settings) ? takeValue.settings : {}, provider_job_id: takeValue.provider_job_id || null,
    audio_asset_id: takeValue.audio_asset_id, alignment_asset_id: null,
    duration_seconds: Number(takeValue.duration_seconds), selected: false, status: "aligning", words: [], phrases: [],
  });
  appendLineage(manifest, jobIdValue, takeValue.provider_job_id, audioAssetValue.checksum_sha256, takeValue.estimated_cost_usd);
  manifest.promo.status = "audio_review";
  return manifest;
}

export function applyPromoVoiceAlignmentAdoption(
  manifestValue: unknown,
  takeValue: unknown,
  alignmentAssetValue: unknown,
  alignmentValue: unknown,
  jobIdValue: unknown,
) {
  const manifest = structuredClone(voiceManifest(manifestValue));
  if (!record(takeValue) || !record(alignmentAssetValue) || !record(alignmentValue) || !configured(jobIdValue)
    || takeValue.status !== "ready" || takeValue.alignment_asset_id !== alignmentAssetValue.id
    || alignmentValue.take_id !== takeValue.id || alignmentValue.audio_asset_id !== takeValue.audio_asset_id
    || !Array.isArray(alignmentValue.words) || !Array.isArray(alignmentValue.phrases) || !alignmentValue.phrases.length) {
    throw new PromoVoiceReadinessError("PROMO_VOICE_ALIGNMENT_RESULT_INVALID", "Completed voice alignment result is invalid.");
  }
  const take = manifest.voice.takes.find((item: any) => item?.id === takeValue.id);
  if (!record(take) || take.status !== "aligning" || take.audio_asset_id !== takeValue.audio_asset_id) {
    throw new PromoVoiceReadinessError("PROMO_VOICE_TAKE_UNKNOWN", "Aligned voice take is not awaiting adoption in the active manifest.");
  }
  const phraseById = new Map<string, any>(manifest.script.phrases.map((phrase: any) => [phrase.id, phrase]));
  if (alignmentValue.phrases.length !== phraseById.size || alignmentValue.phrases.some((phrase: any) =>
    !record(phrase) || !phraseById.has(phrase.phrase_id) || !Number.isFinite(phrase.start_seconds)
    || !Number.isFinite(phrase.end_seconds) || phrase.end_seconds <= phrase.start_seconds
    || !Number.isFinite(phrase.confidence) || phrase.confidence < manifest.voice.minimum_alignment_confidence)) {
    throw new PromoVoiceReadinessError("PROMO_VOICE_ALIGNMENT_RESULT_INVALID", "Voice alignment must cover every approved phrase above the confidence threshold.");
  }
  const asset = manifestAsset(alignmentAssetValue, true);
  if (asset.kind !== "voice_alignment" || asset.mime_type !== "application/json") {
    throw new PromoVoiceReadinessError("PROMO_VOICE_ASSET_INVALID", "Voice alignment requires a verified JSON timing asset.");
  }
  manifest.assets.push(asset);
  for (const item of manifest.voice.takes) item.selected = item.id === take.id;
  Object.assign(take, {
    alignment_asset_id: alignmentAssetValue.id, status: "ready", selected: true,
    words: alignmentValue.words, phrases: alignmentValue.phrases,
  });
  manifest.voice.selected_take_id = take.id;
  manifest.voice.timing_source = alignmentValue.words.length ? "provider_words" : "forced_alignment";
  manifest.captions.timing_source = "voice_phrases";
  manifest.captions.cues = alignmentValue.phrases.map((phrase: any, index: number) => ({
    id: `caption-${index + 1}-${phrase.phrase_id}`, phrase_id: phrase.phrase_id,
    start_seconds: phrase.start_seconds, end_seconds: phrase.end_seconds,
    text: phraseById.get(phrase.phrase_id).display_text,
  }));
  appendLineage(manifest, jobIdValue, null, alignmentAssetValue.checksum_sha256, 0);
  manifest.promo.status = manifest.music.selected_take_id ? "asset_review" : "audio_review";
  return manifest;
}
