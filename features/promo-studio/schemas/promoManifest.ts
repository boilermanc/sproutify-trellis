import { z } from 'zod';

export const PROMO_MANIFEST_SCHEMA_VERSION = '1.0.0' as const;
export const PROMO_FORMATS = ['9:16', '16:9', '1:1'] as const;
export const PROMO_VISUAL_KINDS = [
  'real_ui_capture',
  'repository_asset',
  'generated_visual',
  'stock_or_user_asset',
  'text_graphic',
] as const;

// Trellis uses the all-zero UUID as its single-tenant organization sentinel,
// so use canonical UUID shape instead of Zod's RFC-version-restricted parser.
const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const sha256 = z.string().regex(/^[a-f0-9]{64}$/i);
const gitSha = z.string().regex(/^[a-f0-9]{40}$/i);
const nonEmpty = z.string().trim().min(1);
const jsonObject = z.record(z.string(), z.unknown());
const timestamp = z.string().datetime({ offset: true });

const sourceRefSchema = z.object({
  id: nonEmpty,
  kind: z.enum(['repository', 'route', 'capture', 'brand_asset', 'user_attestation']),
  locator: nonEmpty,
  checksum_sha256: sha256.nullable().default(null),
}).strict();

const assetSchema = z.object({
  id: nonEmpty,
  kind: z.enum([
    'capture_still', 'capture_video', 'capture_trace', 'repository_asset', 'brand_logo',
    'voice_master', 'voice_preview', 'voice_alignment', 'music_master', 'music_preview',
    'sfx', 'render_preview', 'render_master', 'qa_report', 'contact_sheet', 'provider_response',
  ]),
  role: nonEmpty,
  storage_bucket: nonEmpty.nullable().default(null),
  storage_path: nonEmpty,
  mime_type: nonEmpty,
  checksum_sha256: sha256,
  duration_seconds: z.number().nonnegative().nullable().default(null),
  width: z.number().int().positive().nullable().default(null),
  height: z.number().int().positive().nullable().default(null),
  provenance: z.object({
    source_kind: z.enum(['repository', 'real_ui_capture', 'provider', 'user_upload', 'render']),
    source_ref: nonEmpty,
    generated: z.boolean(),
    approved: z.boolean(),
  }).strict(),
}).strict();

const claimSchema = z.object({
  id: nonEmpty,
  text: nonEmpty,
  claim_type: z.enum(['product_feature', 'product_positioning', 'brand', 'cta', 'user_attested']),
  status: z.enum(['verified', 'user_attested', 'unsupported', 'stale']),
  evidence_refs: z.array(nonEmpty),
  approved: z.boolean(),
}).strict();

const timingSchema = z.object({
  word: nonEmpty,
  start_seconds: z.number().nonnegative(),
  end_seconds: z.number().positive(),
  confidence: z.number().min(0).max(1),
}).strict();

const voiceTakeSchema = z.object({
  id: nonEmpty,
  take_number: z.number().int().min(1).max(3),
  direction: z.enum(['natural', 'warm_authority', 'launch_energy']),
  provider: nonEmpty,
  model: nonEmpty,
  voice_id: nonEmpty,
  settings: jsonObject,
  provider_job_id: nonEmpty.nullable().default(null),
  audio_asset_id: nonEmpty.nullable().default(null),
  alignment_asset_id: nonEmpty.nullable().default(null),
  duration_seconds: z.number().positive().nullable().default(null),
  selected: z.boolean(),
  status: z.enum(['queued', 'generating', 'aligning', 'ready', 'failed']),
  words: z.array(timingSchema),
  phrases: z.array(z.object({
    phrase_id: nonEmpty,
    start_seconds: z.number().nonnegative(),
    end_seconds: z.number().positive(),
    confidence: z.number().min(0).max(1),
  }).strict()),
}).strict();

const musicTakeSchema = z.object({
  id: nonEmpty,
  take_number: z.number().int().min(1).max(3),
  direction: z.enum(['understated', 'balanced', 'energetic']),
  provider: nonEmpty,
  model: nonEmpty,
  provider_job_id: nonEmpty.nullable().default(null),
  audio_asset_id: nonEmpty.nullable().default(null),
  duration_seconds: z.number().positive().nullable().default(null),
  selected: z.boolean(),
  status: z.enum(['queued', 'generating', 'ready', 'failed']),
  cue_markers: z.array(z.object({
    name: nonEmpty,
    at_seconds: z.number().nonnegative(),
    confidence: z.number().min(0).max(1).nullable().default(null),
  }).strict()),
}).strict();

const captureScenarioSchema = z.object({
  id: nonEmpty,
  key: nonEmpty,
  version: z.number().int().positive(),
  repository_ref: nonEmpty,
  commit_sha: gitSha,
  source_diff_sha256: sha256.nullable().default(null),
  environment: nonEmpty,
  route: nonEmpty,
  fixture: nonEmpty,
  auth_profile_key: nonEmpty.nullable().default(null),
  viewport: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).strict(),
  selectors: z.array(nonEmpty),
  masks: z.array(nonEmpty),
  assertions: z.array(z.object({ kind: nonEmpty, value: z.unknown(), passed: z.boolean() }).strict()),
  contains_pii: z.literal(false),
  artifact_asset_ids: z.array(nonEmpty),
  status: z.enum(['draft', 'verified', 'failed', 'stale']),
}).strict();

const sceneSchema = z.object({
  id: nonEmpty,
  position: z.number().int().nonnegative(),
  name: nonEmpty,
  purpose: nonEmpty,
  claim_ids: z.array(nonEmpty),
  anchor: z.object({ phrase_id: nonEmpty, edge: z.enum(['start', 'end']) }).strict(),
  duration: z.object({
    mode: z.enum(['fixed', 'flex', 'content']),
    min_seconds: z.number().positive(),
    preferred_seconds: z.number().positive(),
    max_seconds: z.number().positive(),
    locked: z.boolean(),
  }).strict(),
  visual: z.object({
    kind: z.enum(PROMO_VISUAL_KINDS),
    asset_id: nonEmpty.nullable().default(null),
    capture_scenario_id: nonEmpty.nullable().default(null),
    generated_visual_disclosed: z.boolean(),
  }).strict(),
  transition: z.object({ type: z.enum(['cut', 'fade', 'dissolve', 'slide']), duration_seconds: z.number().nonnegative() }).strict(),
  layout: jsonObject,
}).strict();

export const promoManifestSchema = z.object({
  schema_version: z.literal(PROMO_MANIFEST_SCHEMA_VERSION),
  promo: z.object({
    id: uuid,
    organization_id: uuid,
    owner_id: uuid,
    revision_id: uuid,
    revision: z.number().int().positive(),
    parent_revision_id: uuid.nullable(),
    branch: z.object({ id: uuid.nullable(), slug: nonEmpty, display_name: nonEmpty }).strict(),
    title: nonEmpty.max(160),
    status: z.enum(['draft', 'intelligence', 'planning', 'script_review', 'audio_review', 'asset_review', 'previewing', 'final_review', 'ready', 'publishing', 'published', 'failed', 'archived']),
    target_seconds: z.number().positive().max(600),
    formats: z.array(z.enum(PROMO_FORMATS)).min(1),
    created_at: timestamp,
    updated_at: timestamp,
  }).strict(),
  request: z.object({
    prompt: nonEmpty.max(12000),
    supplied_script: z.string().max(12000).nullable(),
    audience: nonEmpty.nullable(),
    goal: nonEmpty.nullable(),
    cta: z.string().trim().max(500).nullable(),
    target_seconds: z.number().positive().max(600),
    formats: z.array(z.enum(PROMO_FORMATS)).min(1),
  }).strict(),
  evidence: z.object({
    repository: z.object({
      provider: z.literal('github'),
      full_name: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
      ref: nonEmpty,
      commit_sha: gitSha,
      source_worktree_dirty: z.boolean(),
      source_diff_sha256: sha256.nullable(),
      permitted_paths: z.array(nonEmpty),
      prohibited_paths: z.array(nonEmpty),
    }).strict().nullable(),
    capture_environment: nonEmpty.nullable(),
    routes: z.array(z.object({ id: nonEmpty, path: nonEmpty, evidence_refs: z.array(nonEmpty) }).strict()),
    facts: z.array(z.object({ id: nonEmpty, text: nonEmpty, evidence_refs: z.array(nonEmpty).min(1) }).strict()),
    claims: z.array(claimSchema),
    source_refs: z.array(sourceRefSchema),
  }).strict(),
  brand: z.object({
    profile_id: nonEmpty.nullable(),
    palette: z.record(z.string(), z.string().regex(/^#[a-f0-9]{6}$/i)),
    font_families: z.array(nonEmpty),
    asset_ids: z.array(nonEmpty),
    voice_profile: z.object({
      name: nonEmpty,
      persona: nonEmpty,
      qualities: z.array(nonEmpty),
      pace_wpm: z.number().int().min(80).max(240),
      avoid: z.array(nonEmpty),
    }).strict().nullable(),
    sonic_profile: z.object({ qualities: z.array(nonEmpty), avoid: z.array(nonEmpty) }).strict().nullable(),
    prohibited_language: z.array(nonEmpty),
    prohibited_styles: z.array(nonEmpty),
  }).strict(),
  script: z.object({
    status: z.enum(['draft', 'review', 'approved']),
    approved_text: z.string().trim().max(12000),
    source_refs: z.array(nonEmpty),
    pronunciations: z.record(z.string(), nonEmpty),
    phrases: z.array(z.object({
      id: nonEmpty,
      display_text: nonEmpty,
      speech_text: nonEmpty,
      evidence_refs: z.array(nonEmpty),
      emphasis: z.enum(['none', 'light', 'strong']),
    }).strict()),
    segments: z.array(z.object({ id: nonEmpty, phrase_ids: z.array(nonEmpty).min(1), delivery_note: z.string() }).strict()),
  }).strict(),
  assets: z.array(assetSchema),
  captures: z.object({ scenarios: z.array(captureScenarioSchema) }).strict(),
  voice: z.object({
    profile_id: nonEmpty.nullable(),
    selected_take_id: nonEmpty.nullable(),
    timing_source: z.enum(['provider_words', 'forced_alignment', 'manual_phrase_alignment']).nullable(),
    minimum_alignment_confidence: z.number().min(0).max(1),
    takes: z.array(voiceTakeSchema).max(3),
  }).strict(),
  music: z.object({
    profile_id: nonEmpty.nullable(),
    brief: z.string().trim(),
    selected_take_id: nonEmpty.nullable(),
    takes: z.array(musicTakeSchema).max(3),
  }).strict(),
  scenes: z.array(sceneSchema),
  captions: z.object({
    language: nonEmpty,
    timing_source: z.enum(['voice_words', 'voice_phrases', 'manual']),
    style: jsonObject,
    safe_area: z.object({ top: z.number().nonnegative(), right: z.number().nonnegative(), bottom: z.number().nonnegative(), left: z.number().nonnegative() }).strict(),
    cues: z.array(z.object({ id: nonEmpty, phrase_id: nonEmpty, start_seconds: z.number().nonnegative(), end_seconds: z.number().positive(), text: nonEmpty }).strict()),
  }).strict(),
  sfx: z.array(z.object({
    id: nonEmpty,
    asset_id: nonEmpty,
    license_source: nonEmpty,
    phrase_id: nonEmpty.nullable(),
    at_seconds: z.number().nonnegative().nullable(),
    gain_db: z.number().min(-60).max(12),
    duck_music_db: z.number().min(-60).max(0),
  }).strict()),
  format_variants: z.array(z.object({
    format: z.enum(PROMO_FORMATS),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    safe_area: z.object({ top: z.number().nonnegative(), right: z.number().nonnegative(), bottom: z.number().nonnegative(), left: z.number().nonnegative() }).strict(),
    crop_policy: z.enum(['contain', 'cover', 'guided']),
    typography: jsonObject,
  }).strict()),
  render: z.object({
    composition: nonEmpty,
    composition_version: nonEmpty,
    fps: z.number().int().positive(),
    video_codec: nonEmpty,
    pixel_format: nonEmpty,
    audio_codec: nonEmpty,
    audio_sample_rate: z.number().int().positive(),
    integrated_lufs: z.number().min(-30).max(-5),
    true_peak_dbfs: z.number().max(0),
    ffmpeg_fingerprint: sha256,
  }).strict().nullable(),
  safety: z.object({
    strict_claims: z.boolean(),
    provenance_preview_overlay: z.boolean(),
    generated_visual_disclosures: z.array(nonEmpty),
    capture_redactions: z.array(nonEmpty),
    claim_approval_ids: z.array(nonEmpty),
  }).strict(),
  run_lineage: z.object({
    job_ids: z.array(uuid),
    provider_ids: z.array(nonEmpty),
    retries: z.number().int().nonnegative(),
    output_checksums: z.array(sha256),
    estimated_cost_usd: z.number().nonnegative(),
  }).strict(),
}).strict();

export type PromoManifest = z.infer<typeof promoManifestSchema>;
export type PromoManifestGate = 'draft' | 'final';

export interface PromoManifestIssue {
  code: string;
  path: string;
  message: string;
}

export class PromoManifestValidationError extends Error {
  readonly code = 'PROMO_MANIFEST_INVALID';
  readonly issues: PromoManifestIssue[];
  constructor(issues: PromoManifestIssue[]) {
    super(issues.map(issue => `${issue.code} at ${issue.path}: ${issue.message}`).join('\n'));
    this.name = 'PromoManifestValidationError';
    this.issues = issues;
  }
}

const issue = (code: string, path: string, message: string): PromoManifestIssue => ({ code, path, message });

function zodIssueCode(path: PropertyKey[]): string {
  const value = path.join('.');
  if (/checksum|sha256/i.test(value)) return 'PROMO_ASSET_CHECKSUM_INVALID';
  if (/claims/i.test(value)) return 'PROMO_CLAIM_INVALID';
  if (/caption|timing|words|duration/i.test(value)) return 'PROMO_TIMING_INVALID';
  return 'PROMO_MANIFEST_SCHEMA_INVALID';
}

function semanticIssues(manifest: PromoManifest, gate: PromoManifestGate): PromoManifestIssue[] {
  const issues: PromoManifestIssue[] = [];
  const assetIds = new Set(manifest.assets.map(asset => asset.id));
  const phraseIds = new Set(manifest.script.phrases.map(phrase => phrase.id));
  const claimById = new Map(manifest.evidence.claims.map(claim => [claim.id, claim]));
  const captureIds = new Set(manifest.captures.scenarios.map(capture => capture.id));
  const voiceById = new Map(manifest.voice.takes.map(take => [take.id, take]));
  const musicById = new Map(manifest.music.takes.map(take => [take.id, take]));

  if (manifest.promo.target_seconds !== manifest.request.target_seconds) {
    issues.push(issue('PROMO_TARGET_DURATION_MISMATCH', 'request.target_seconds', 'Request and project target durations must match.'));
  }
  if (new Set(manifest.promo.formats).size !== manifest.promo.formats.length) {
    issues.push(issue('PROMO_FORMAT_DUPLICATE', 'promo.formats', 'Requested formats must be unique.'));
  }
  if (gate === 'final') for (const format of manifest.promo.formats) {
    if (!manifest.format_variants.some(variant => variant.format === format)) {
      issues.push(issue('PROMO_FORMAT_VARIANT_MISSING', 'format_variants', `Missing layout for ${format}.`));
    }
  }
  if (manifest.evidence.repository?.source_worktree_dirty && !manifest.evidence.repository.source_diff_sha256) {
    issues.push(issue('PROMO_EVIDENCE_DIFF_MISSING', 'evidence.repository.source_diff_sha256', 'Dirty source evidence requires a diff checksum.'));
  }
  for (const assetId of manifest.brand.asset_ids) {
    if (!assetIds.has(assetId)) issues.push(issue('PROMO_ASSET_REFERENCE_MISSING', 'brand.asset_ids', `Unknown asset ${assetId}.`));
  }
  for (const segment of manifest.script.segments) {
    for (const phraseId of segment.phrase_ids) {
      if (!phraseIds.has(phraseId)) issues.push(issue('PROMO_PHRASE_REFERENCE_MISSING', `script.segments.${segment.id}`, `Unknown phrase ${phraseId}.`));
    }
  }
  for (const scene of manifest.scenes) {
    if (!phraseIds.has(scene.anchor.phrase_id)) issues.push(issue('PROMO_SCENE_ANCHOR_MISSING', `scenes.${scene.id}.anchor`, `Unknown phrase ${scene.anchor.phrase_id}.`));
    if (!(scene.duration.min_seconds <= scene.duration.preferred_seconds && scene.duration.preferred_seconds <= scene.duration.max_seconds)) {
      issues.push(issue('PROMO_SCENE_DURATION_INVALID', `scenes.${scene.id}.duration`, 'Scene duration must satisfy min <= preferred <= max.'));
    }
    if (scene.visual.asset_id && !assetIds.has(scene.visual.asset_id)) issues.push(issue('PROMO_ASSET_REFERENCE_MISSING', `scenes.${scene.id}.visual.asset_id`, `Unknown asset ${scene.visual.asset_id}.`));
    if (scene.visual.kind === 'real_ui_capture') {
      if (!scene.visual.capture_scenario_id || !captureIds.has(scene.visual.capture_scenario_id)) {
        issues.push(issue('PROMO_CAPTURE_PROVENANCE_MISSING', `scenes.${scene.id}.visual`, 'Real UI scenes require a verified capture scenario.'));
      }
    }
    if (scene.visual.kind === 'generated_visual' && !scene.visual.generated_visual_disclosed) {
      issues.push(issue('PROMO_GENERATED_VISUAL_UNDISCLOSED', `scenes.${scene.id}.visual`, 'Generated visuals require disclosure.'));
    }
    for (const claimId of scene.claim_ids) {
      const claim = claimById.get(claimId);
      if (!claim) issues.push(issue('PROMO_CLAIM_REFERENCE_MISSING', `scenes.${scene.id}.claim_ids`, `Unknown claim ${claimId}.`));
      else if (gate === 'final' && manifest.safety.strict_claims && (claim.status !== 'verified' || !claim.approved)) {
        issues.push(issue('PROMO_UNSUPPORTED_CLAIM_BLOCKED', `evidence.claims.${claimId}`, `Claim ${claimId} is not verified and approved.`));
      }
    }
  }
  for (const capture of manifest.captures.scenarios) {
    for (const assetId of capture.artifact_asset_ids) {
      if (!assetIds.has(assetId)) issues.push(issue('PROMO_ASSET_REFERENCE_MISSING', `captures.${capture.id}.artifact_asset_ids`, `Unknown asset ${assetId}.`));
    }
  }
  for (const cue of manifest.captions.cues) {
    if (!phraseIds.has(cue.phrase_id)) issues.push(issue('PROMO_PHRASE_REFERENCE_MISSING', `captions.cues.${cue.id}`, `Unknown phrase ${cue.phrase_id}.`));
    if (cue.end_seconds <= cue.start_seconds || cue.end_seconds > manifest.promo.target_seconds) {
      issues.push(issue('PROMO_CAPTION_TIMING_INVALID', `captions.cues.${cue.id}`, 'Caption must have positive duration inside the project timebase.'));
    }
  }
  for (const take of manifest.voice.takes) {
    for (const phrase of take.phrases) {
      if (!phraseIds.has(phrase.phrase_id)) issues.push(issue('PROMO_PHRASE_REFERENCE_MISSING', `voice.takes.${take.id}.phrases`, `Unknown phrase ${phrase.phrase_id}.`));
      if (phrase.end_seconds <= phrase.start_seconds || (take.duration_seconds != null && phrase.end_seconds > take.duration_seconds)) {
        issues.push(issue('PROMO_VOICE_TIMING_INVALID', `voice.takes.${take.id}.phrases`, 'Phrase timing must have positive duration inside the voice take.'));
      }
    }
    for (const word of take.words) {
      if (word.end_seconds <= word.start_seconds || (take.duration_seconds != null && word.end_seconds > take.duration_seconds)) {
        issues.push(issue('PROMO_VOICE_TIMING_INVALID', `voice.takes.${take.id}.words`, 'Word timing must have positive duration inside the voice take.'));
      }
    }
  }
  const selectedVoice = manifest.voice.selected_take_id ? voiceById.get(manifest.voice.selected_take_id) : null;
  const selectedMusic = manifest.music.selected_take_id ? musicById.get(manifest.music.selected_take_id) : null;
  if (manifest.voice.selected_take_id && !selectedVoice) issues.push(issue('PROMO_VOICE_SELECTION_INVALID', 'voice.selected_take_id', 'Selected voice take does not exist.'));
  if (manifest.music.selected_take_id && !selectedMusic) issues.push(issue('PROMO_MUSIC_SELECTION_INVALID', 'music.selected_take_id', 'Selected music take does not exist.'));
  if (manifest.voice.takes.filter(take => take.selected).length > 1) issues.push(issue('PROMO_VOICE_SELECTION_MULTIPLE', 'voice.takes', 'At most one voice take may be selected.'));
  if (manifest.music.takes.filter(take => take.selected).length > 1) issues.push(issue('PROMO_MUSIC_SELECTION_MULTIPLE', 'music.takes', 'At most one music take may be selected.'));

  if (gate === 'final') {
    if (!manifest.request.audience) issues.push(issue('PROMO_AUDIENCE_REQUIRED', 'request.audience', 'Final manifests require an audience.'));
    if (!manifest.request.goal) issues.push(issue('PROMO_GOAL_REQUIRED', 'request.goal', 'Final manifests require a goal.'));
    if (!manifest.evidence.repository || !manifest.evidence.capture_environment) issues.push(issue('PROMO_EVIDENCE_REQUIRED', 'evidence', 'Final manifests require repository and capture-environment evidence.'));
    if (!manifest.evidence.repository?.permitted_paths.length) issues.push(issue('PROMO_EVIDENCE_PATHS_REQUIRED', 'evidence.repository.permitted_paths', 'Final manifests require at least one permitted evidence path.'));
    if (!manifest.brand.voice_profile || !manifest.brand.sonic_profile) issues.push(issue('PROMO_BRAND_PROFILE_REQUIRED', 'brand', 'Final manifests require voice and sonic profiles.'));
    if (!manifest.script.approved_text || manifest.script.phrases.length === 0 || manifest.script.segments.length === 0) issues.push(issue('PROMO_SCRIPT_CONTENT_REQUIRED', 'script', 'Final manifests require script text, phrases, and segments.'));
    if (!manifest.voice.profile_id || !manifest.music.profile_id || !manifest.music.brief) issues.push(issue('PROMO_AUDIO_PROFILE_REQUIRED', 'voice', 'Final manifests require voice and music profiles.'));
    if (manifest.scenes.length === 0) issues.push(issue('PROMO_SCENES_REQUIRED', 'scenes', 'Final manifests require at least one scene.'));
    if (!manifest.render) issues.push(issue('PROMO_RENDER_SETTINGS_REQUIRED', 'render', 'Final manifests require render settings.'));
    if (manifest.script.status !== 'approved') issues.push(issue('PROMO_SCRIPT_APPROVAL_REQUIRED', 'script.status', 'Final manifests require an approved script.'));
    if (!selectedVoice || selectedVoice.status !== 'ready' || !selectedVoice.selected) issues.push(issue('PROMO_VOICE_SELECTION_REQUIRED', 'voice.selected_take_id', 'Final manifests require one ready selected voice take.'));
    if (!selectedMusic || selectedMusic.status !== 'ready' || !selectedMusic.selected) issues.push(issue('PROMO_MUSIC_SELECTION_REQUIRED', 'music.selected_take_id', 'Final manifests require one ready selected music take.'));
    if (selectedVoice && selectedVoice.words.length === 0 && selectedVoice.phrases.length === 0) {
      issues.push(issue('PROMO_ALIGNMENT_REQUIRED', 'voice.takes', 'Selected voice requires word or phrase timing.'));
    }
    if (selectedVoice && [...selectedVoice.words, ...selectedVoice.phrases].some(item => item.confidence < manifest.voice.minimum_alignment_confidence)) {
      issues.push(issue('PROMO_ALIGNMENT_CONFIDENCE_LOW', 'voice.takes.words', 'Selected voice alignment is below the configured confidence threshold.'));
    }
    for (const capture of manifest.captures.scenarios) {
      if (capture.status !== 'verified' || capture.assertions.some(assertion => !assertion.passed)) {
        issues.push(issue('PROMO_CAPTURE_NOT_VERIFIED', `captures.${capture.id}`, 'Final manifests require verified capture assertions.'));
      }
    }
  }
  return issues;
}

export function parsePromoManifest(value: unknown, options: { gate?: PromoManifestGate } = {}): PromoManifest {
  const parsed = promoManifestSchema.safeParse(value);
  if (!parsed.success) {
    throw new PromoManifestValidationError(parsed.error.issues.map(item => issue(
      zodIssueCode(item.path),
      item.path.join('.'),
      item.message,
    )));
  }
  const issues = semanticIssues(parsed.data, options.gate || 'draft');
  if (issues.length) throw new PromoManifestValidationError(issues);
  return parsed.data;
}

export function safeParsePromoManifest(value: unknown, options: { gate?: PromoManifestGate } = {}) {
  try {
    return { success: true as const, data: parsePromoManifest(value, options) };
  } catch (error) {
    if (error instanceof PromoManifestValidationError) return { success: false as const, error };
    throw error;
  }
}

export function canonicalizePromoJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === 'object') return Object.fromEntries(
      Object.entries(item as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalize(entry)]),
    );
    if (typeof item === 'number' && !Number.isFinite(item)) throw new Error('Cannot fingerprint non-finite numbers.');
    return item;
  };
  return JSON.stringify(normalize(value));
}

export async function fingerprintPromoManifest(value: unknown): Promise<string> {
  const manifest = parsePromoManifest(value);
  const bytes = new TextEncoder().encode(canonicalizePromoJson(manifest));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

export const promoManifestJsonSchema = z.toJSONSchema(promoManifestSchema, { target: 'draft-2020-12' });
