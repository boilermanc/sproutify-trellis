export const PROMO_SCHEMA_VERSION = "1.0.0";
export const PROMO_FORMATS = new Set(["9:16", "16:9", "1:1"]);
export const PROMO_JOB_TYPES = new Set([
  "noop", "intelligence_scan", "creative_plan", "voice_generate", "voice_align", "capture",
  "music_generate", "gpu_media_generate", "scene_render", "preview_render", "final_render",
  "format_export", "publish",
]);
export const PROMO_APPROVAL_GATES = new Set(["claims", "script", "storyboard", "voice", "music", "assets", "preview", "final", "publish"]);
export const PROMO_APPROVAL_DECISIONS = new Set(["approved", "changes_requested", "rejected", "revoked"]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_ANYWHERE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const SHA256 = /^[a-f0-9]{64}$/i;

export const cleanPromoText = (value: unknown, max = 1000) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max);

// Promo prompts and revision reasons are persisted. Remove the same high-risk
// direct identifiers Trellis scrubs before any downstream AI work.
export const sanitizePromoText = (value: unknown, max = 12000) => cleanPromoText(value, max)
  .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL]")
  .replace(/\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, "[PHONE]")
  .replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[SSN]")
  .replace(/\b(?:\d[ -]*?){13,19}\b/g, "[CARD]")
  .replace(/\b(?:sk|xai|key|token)[-_][A-Za-z0-9_-]{20,}\b/gi, "[SECRET]");

export function sanitizePromoJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizePromoJson);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [key, sanitizePromoJson(entry)]),
  );
  // Structural identifiers and storage paths may contain long digit runs that
  // resemble payment cards. They are provenance, not user prose.
  if (typeof value === "string" && (UUID_ANYWHERE.test(value) || SHA256.test(value))) return value;
  return typeof value === "string" ? sanitizePromoText(value, 12000) : value;
}

export function isPromoUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

export function isPromoFingerprint(value: unknown): value is string {
  return typeof value === "string" && SHA256.test(value);
}

function record(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function validatePromoCreate(value: unknown) {
  if (!record(value)) throw new Error("Project input is required.");
  const title = cleanPromoText(value.title, 160);
  const prompt = sanitizePromoText(value.prompt, 12000);
  const branchId = cleanPromoText(value.branch_id, 80);
  const targetSeconds = Number(value.target_seconds || 30);
  const formats = Array.isArray(value.formats) ? [...new Set(value.formats.map((item: unknown) => cleanPromoText(item, 10)))] : ["9:16"];
  if (!title) throw new Error("Project title is required.");
  if (!prompt) throw new Error("Describe the promo you want to create.");
  if (!isPromoUuid(branchId)) throw new Error("Choose a Trellis branch before creating a promo.");
  if (!Number.isFinite(targetSeconds) || targetSeconds <= 0 || targetSeconds > 600) throw new Error("Target duration must be between 1 and 600 seconds.");
  if (!formats.length || formats.some(format => !PROMO_FORMATS.has(format))) throw new Error("Choose at least one supported format.");
  return { title, prompt, branchId, targetSeconds, formats };
}

const REQUIRED_MANIFEST_KEYS = [
  "schema_version", "promo", "request", "evidence", "brand", "script", "assets", "captures",
  "voice", "music", "scenes", "captions", "sfx", "format_variants", "render", "safety", "run_lineage",
];

export function validatePromoRevision(value: unknown, projectId: string, revisionId: string, revisionNumber: number): Record<string, any> {
  if (!record(value)) throw new Error("Manifest must be a JSON object.");
  for (const key of REQUIRED_MANIFEST_KEYS) if (!(key in value)) throw new Error(`Manifest is missing ${key}.`);
  if (value.schema_version !== PROMO_SCHEMA_VERSION) throw new Error(`Manifest schema must be ${PROMO_SCHEMA_VERSION}.`);
  if (!record(value.promo) || value.promo.id !== projectId || value.promo.revision_id !== revisionId || value.promo.revision !== revisionNumber) {
    throw new Error("Manifest identity does not match the requested revision.");
  }
  if (!Array.isArray(value.promo.formats) || value.promo.formats.some((format: unknown) => !PROMO_FORMATS.has(String(format)))) {
    throw new Error("Manifest contains an unsupported format.");
  }
  return sanitizePromoJson(value) as Record<string, any>;
}

export function applyPromoClaimApproval(value: unknown, claimIdValue: unknown): Record<string, any> {
  if (!record(value) || !record(value.evidence) || !Array.isArray(value.evidence.claims) || !record(value.safety)) {
    throw new Error("Manifest claim ledger is invalid.");
  }
  const claimId = cleanPromoText(claimIdValue, 80);
  const manifest = structuredClone(value);
  const claim = manifest.evidence.claims.find((item: any) => item?.id === claimId);
  if (!claim) throw new Error("Claim does not belong to the active manifest.");
  if (!["verified", "user_attested"].includes(claim.status)) throw new Error("Only verified or user-attested claims can be approved.");
  if (claim.approved === true) throw new Error("Claim is already approved in the active revision.");
  claim.approved = true;
  manifest.safety.claim_approval_ids = [...new Set([
    ...(Array.isArray(manifest.safety.claim_approval_ids) ? manifest.safety.claim_approval_ids : []), claimId,
  ])];
  manifest.script.status = "review";
  manifest.promo.status = "script_review";
  return manifest;
}

export function applyPromoScriptApproval(value: unknown): Record<string, any> {
  if (!record(value) || !record(value.evidence) || !Array.isArray(value.evidence.claims) || !record(value.script) || !record(value.promo)) {
    throw new Error("Manifest script review state is invalid.");
  }
  const manifest = structuredClone(value);
  if (manifest.script.status === "approved") throw new Error("Script is already approved in the active revision.");
  if (!cleanPromoText(manifest.script.approved_text, 12000) || !Array.isArray(manifest.script.phrases) || !manifest.script.phrases.length || !Array.isArray(manifest.script.segments) || !manifest.script.segments.length) {
    throw new Error("Script content and phrase structure are required before approval.");
  }
  const blocking = manifest.evidence.claims.filter((claim: any) => !["verified", "user_attested"].includes(claim?.status) || claim?.approved !== true);
  if (blocking.length) throw new Error("Every claim must be verified and approved before script approval.");
  manifest.script.status = "approved";
  manifest.promo.status = "audio_review";
  return manifest;
}

export function assertPromoApprovalStatePreserved(currentValue: unknown, candidateValue: unknown) {
  if (!record(currentValue) || !record(candidateValue) || !record(currentValue.evidence) || !record(candidateValue.evidence)
    || !Array.isArray(currentValue.evidence.claims) || !Array.isArray(candidateValue.evidence.claims)
    || !record(currentValue.script) || !record(candidateValue.script) || !record(currentValue.safety) || !record(candidateValue.safety)) {
    throw new Error("Manifest approval state is invalid.");
  }
  const currentClaims = new Map(currentValue.evidence.claims.map((claim: any) => [claim?.id, claim]));
  if (candidateValue.evidence.claims.some((claim: any) => claim?.approved === true && currentClaims.get(claim?.id)?.approved !== true)) {
    throw new Error("Claim approval can only be granted through the claim approval gate.");
  }
  if (candidateValue.script.status === "approved" && currentValue.script.status !== "approved") {
    throw new Error("Script approval can only be granted through the script approval gate.");
  }
  const currentApprovalIds = new Set(Array.isArray(currentValue.safety.claim_approval_ids) ? currentValue.safety.claim_approval_ids : []);
  const candidateApprovalIds = Array.isArray(candidateValue.safety.claim_approval_ids) ? candidateValue.safety.claim_approval_ids : [];
  if (candidateApprovalIds.some((claimId: unknown) => !currentApprovalIds.has(claimId))) {
    throw new Error("Claim approval IDs can only be added through the claim approval gate.");
  }
}

export function canonicalPromoJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === "object") return Object.fromEntries(
      Object.entries(item as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, normalize(entry)]),
    );
    if (typeof item === "number" && !Number.isFinite(item)) throw new Error("Manifest contains a non-finite number.");
    return item;
  };
  return JSON.stringify(normalize(value));
}

export async function fingerprintPromoJson(value: unknown) {
  const bytes = new TextEncoder().encode(canonicalPromoJson(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export function createDraftPromoManifest(input: {
  projectId: string; revisionId: string; ownerId: string; organizationId: string;
  branch: { id: string; slug: string; name: string }; title: string; prompt: string;
  targetSeconds: number; formats: string[]; now: string;
}) {
  return {
    schema_version: PROMO_SCHEMA_VERSION,
    promo: {
      id: input.projectId, organization_id: input.organizationId, owner_id: input.ownerId,
      revision_id: input.revisionId, revision: 1, parent_revision_id: null,
      branch: { id: input.branch.id, slug: input.branch.slug, display_name: input.branch.name },
      title: input.title, status: "draft", target_seconds: input.targetSeconds, formats: input.formats,
      created_at: input.now, updated_at: input.now,
    },
    request: { prompt: input.prompt, supplied_script: null, audience: null, goal: null, cta: null, target_seconds: input.targetSeconds, formats: input.formats },
    evidence: { repository: null, capture_environment: null, routes: [], facts: [], claims: [], source_refs: [] },
    brand: { profile_id: null, palette: {}, font_families: [], asset_ids: [], voice_profile: null, sonic_profile: null, prohibited_language: [], prohibited_styles: [] },
    script: { status: "draft", approved_text: "", source_refs: [], pronunciations: {}, phrases: [], segments: [] },
    assets: [], captures: { scenarios: [] },
    voice: { profile_id: null, selected_take_id: null, timing_source: null, minimum_alignment_confidence: 0.8, takes: [] },
    music: { profile_id: null, brief: "", selected_take_id: null, takes: [] }, scenes: [],
    captions: { language: "en-US", timing_source: "voice_phrases", style: {}, safe_area: { top: 0, right: 0, bottom: 0, left: 0 }, cues: [] },
    sfx: [], format_variants: [], render: null,
    safety: { strict_claims: true, provenance_preview_overlay: true, generated_visual_disclosures: [], capture_redactions: [], claim_approval_ids: [] },
    run_lineage: { job_ids: [], provider_ids: [], retries: 0, output_checksums: [], estimated_cost_usd: 0 },
  };
}
