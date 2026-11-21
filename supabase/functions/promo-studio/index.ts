import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import {
  PROMO_APPROVAL_DECISIONS, PROMO_APPROVAL_GATES, PROMO_JOB_TYPES,
  applyPromoClaimApproval, applyPromoScriptApproval, assertPromoApprovalStatePreserved,
  cleanPromoText, createDraftPromoManifest,
  fingerprintPromoJson, isPromoUuid,
  sanitizePromoJson, sanitizePromoText, validatePromoCreate, validatePromoRevision,
} from "../_shared/promo-studio.ts";
import { buildGitHubEvidenceMap } from "../_shared/github-evidence.ts";
import { applyPromoCaptureAdoption, buildPromoCaptureJobInput } from "../_shared/promo-capture.ts";
import {
  applyPromoVoiceAlignmentAdoption, applyPromoVoiceGenerationAdoption,
  buildPromoVoiceAlignmentJobInput, buildPromoVoiceGenerationJobInput,
} from "../_shared/promo-voice.ts";
import { applyPromoMusicAdoption, buildPromoMusicGenerationJobInput } from "../_shared/promo-music.ts";
import { buildPromoRenderJobInput } from "../_shared/promo-render.ts";
import {
  buildPromoCreativeDirectorPrompt, materializePromoCreativePlan, parsePromoCreativePlan,
} from "../_shared/promo-creative-plan.ts";
import {
  buildPromoBranchReadiness, validatePromoBranchSourceUpdate,
} from "../_shared/promo-branch-readiness.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ORGANIZATION_ID = "00000000-0000-0000-0000-000000000001";
const BUCKET = "promo-assets";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...CORS, "content-type": "application/json" },
});

async function requireUser(req: Request) {
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return { response: json({ error: "Missing Authorization header" }, 401) };
  const auth = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authorization } } });
  const { data, error } = await auth.auth.getUser();
  if (error || !data.user) return { response: json({ error: "Not authenticated" }, 401) };
  return { user: data.user };
}

async function operatorFor(db: any, userId: string) {
  const { data } = await db.from("trellis_users").select("id,role,status")
    .eq("auth_user_id", userId).eq("status", "active").in("role", ["owner", "admin", "operator"]).maybeSingle();
  return data;
}

async function branchIdsFor(db: any, operatorId: string): Promise<string[]> {
  const { data, error } = await db.from("trellis_user_branches").select("branch_id").eq("trellis_user_id", operatorId);
  if (error) throw new Error("Could not verify branch access.");
  return (data || []).map((row: any) => row.branch_id);
}

async function requireProject(db: any, userId: string, operator: any, projectId: unknown) {
  if (!isPromoUuid(projectId)) throw new Error("A valid Promo Studio project is required.");
  const { data: project, error } = await db.from("promo_projects").select("*").eq("id", projectId).maybeSingle();
  if (error || !project) throw new Error("Promo Studio project not found.");
  if (project.created_by === userId) return project;
  const branchIds = await branchIdsFor(db, operator.id);
  if (!project.branch_id || !branchIds.includes(project.branch_id)) throw new Error("You do not have access to this Promo Studio project.");
  return project;
}

async function audit(db: any, input: { projectId: string; revisionId?: string | null; jobId?: string | null; event: string; stage?: string; actorId: string; details?: unknown }) {
  const { error } = await db.from("promo_events").insert({
    project_id: input.projectId, revision_id: input.revisionId || null, job_id: input.jobId || null,
    event_type: input.event, stage: input.stage || null, actor_id: input.actorId,
    correlation_id: crypto.randomUUID(), details: sanitizePromoJson(input.details || {}),
  });
  if (error) throw new Error(`Could not write Promo Studio audit event: ${error.message}`);
}

function safeFilename(value: unknown) {
  const filename = cleanPromoText(value, 160).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  if (!filename) throw new Error("A valid filename is required.");
  return filename;
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function persistPromoReviewProjection(db: any, projectId: string, revisionId: string, manifest: Record<string, any>) {
  const writes = await Promise.all([
    manifest.evidence.claims.length ? db.from("promo_claims").insert(manifest.evidence.claims.map((claim: any) => ({
      project_id: projectId, revision_id: revisionId, claim_key: claim.id, claim_text: claim.text,
      claim_type: claim.claim_type, evidence_status: claim.status, evidence_refs: claim.evidence_refs, approved: claim.approved,
    }))) : Promise.resolve({ error: null }),
    manifest.scenes.length ? db.from("promo_scenes").insert(manifest.scenes.map((scene: any) => ({
      project_id: projectId, revision_id: revisionId, scene_key: scene.id, position: scene.position,
      name: scene.name, purpose: scene.purpose, phrase_anchor: scene.anchor,
      duration_policy: scene.duration, visual_kind: scene.visual.kind, layout: scene.layout,
      provenance: { claim_ids: scene.claim_ids, capture_scenario_id: scene.visual.capture_scenario_id },
    }))) : Promise.resolve({ error: null }),
    manifest.captures.scenarios.length ? db.from("promo_capture_scenarios").insert(manifest.captures.scenarios.map((scenario: any) => ({
      project_id: projectId, revision_id: revisionId, scenario_key: scenario.key,
      scenario_version: scenario.version, repository_ref: scenario.repository_ref,
      commit_sha: scenario.commit_sha, environment: scenario.environment, route: scenario.route,
      auth_profile_key: scenario.auth_profile_key, definition: scenario, status: scenario.status,
    }))) : Promise.resolve({ error: null }),
  ]);
  const error = writes.find(result => result.error)?.error;
  if (error) throw new Error(`Could not persist Promo Studio review data: ${error.message}`);
}

async function persistPromoRevisionAssetBindings(db: any, input: {
  projectId: string; sourceRevisionId: string; targetRevisionId: string;
  manifest: Record<string, any>; adoptedAssetIds?: string[];
  adoptedBindingReason?: "capture_adoption" | "voice_adoption" | "music_adoption" | "manual_adoption";
}) {
  const assetIds = [...new Set((Array.isArray(input.manifest.assets) ? input.manifest.assets : [])
    .map((asset: any) => asset?.id))];
  if (!assetIds.length) return;
  if (assetIds.some(assetId => !isPromoUuid(assetId))) throw new Error("Manifest assets require materialized UUIDs before revision binding.");
  const { data: sourceBindings, error: sourceError } = await db.from("promo_revision_assets")
    .select("asset_id").eq("project_id", input.projectId).eq("revision_id", input.sourceRevisionId)
    .in("asset_id", assetIds);
  if (sourceError || sourceBindings?.length !== assetIds.length) {
    throw new Error("Every manifest asset must already be bound to the active parent revision.");
  }
  const adopted = new Set(input.adoptedAssetIds || []);
  const { error } = await db.from("promo_revision_assets").insert(assetIds.map(assetId => ({
    project_id: input.projectId, revision_id: input.targetRevisionId, asset_id: assetId,
    binding_reason: adopted.has(assetId) ? (input.adoptedBindingReason || "manual_adoption") : "revision_carry_forward",
  })));
  if (error) throw new Error(`Could not bind Promo Studio revision assets: ${error.message}`);
}

async function createManifestRevision(db: any, input: {
  project: any; current: any; candidate: Record<string, any>; userId: string; reason: string;
  diff?: unknown[]; adoptedAssetIds?: string[];
  adoptedBindingReason?: "capture_adoption" | "voice_adoption" | "music_adoption" | "manual_adoption";
}) {
  const revisionId = crypto.randomUUID();
  const revisionNumber = Number(input.current.revision_number) + 1;
  const candidate = structuredClone(input.candidate);
  if (!candidate?.promo) throw new Error("Manifest promo identity is required.");
  Object.assign(candidate.promo, {
    id: input.project.id, organization_id: input.project.organization_id, owner_id: input.project.created_by,
    revision_id: revisionId, revision: revisionNumber, parent_revision_id: input.current.id,
    updated_at: new Date().toISOString(),
  });
  const manifest = validatePromoRevision(candidate, input.project.id, revisionId, revisionNumber);
  const fingerprint = await fingerprintPromoJson(manifest);
  const { data: revision, error } = await db.from("promo_manifest_revisions").insert({
    id: revisionId, project_id: input.project.id, revision_number: revisionNumber, parent_revision_id: input.current.id,
    created_by: input.userId, reason: input.reason, manifest, manifest_fingerprint: fingerprint,
    diff: sanitizePromoJson(input.diff || []),
  }).select("*").single();
  if (error) throw new Error(`Could not create Promo Manifest revision: ${error.message}`);
  try {
    await persistPromoReviewProjection(db, input.project.id, revisionId, manifest);
    await persistPromoRevisionAssetBindings(db, {
      projectId: input.project.id, sourceRevisionId: input.current.id, targetRevisionId: revisionId,
      manifest, adoptedAssetIds: input.adoptedAssetIds, adoptedBindingReason: input.adoptedBindingReason,
    });
    const { data: activated, error: projectError } = await db.from("promo_projects")
      .update({
        current_revision_id: revisionId, status: manifest.promo.status,
        selected_preview_render_id: null, final_approved_at: null,
      })
      .eq("id", input.project.id).eq("current_revision_id", input.current.id).select("id").maybeSingle();
    if (projectError || !activated) throw new Error(projectError?.message || "Project changed while the revision was being saved. Reload and try again.");
  } catch (revisionError) {
    await db.from("promo_manifest_revisions").delete().eq("id", revisionId);
    throw revisionError;
  }
  return { revision, manifest, fingerprint, revisionId, revisionNumber };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const auth = await requireUser(req);
  if (auth.response) return auth.response;
  const userId = auth.user!.id;
  const db = createClient(SUPABASE_URL, SERVICE_KEY);
  const operator = await operatorFor(db, userId);
  if (!operator) return json({ error: "Marketing operator access required" }, 403);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }
  const action = cleanPromoText(body?.action, 60);

  try {
    if (action === "list_projects") {
      const branchIds = await branchIdsFor(db, operator.id);
      let query = db.from("promo_projects").select("*").order("updated_at", { ascending: false }).limit(100);
      query = branchIds.length
        ? query.or(`created_by.eq.${userId},branch_id.in.(${branchIds.join(",")})`)
        : query.eq("created_by", userId);
      const { data, error } = await query;
      if (error) throw new Error(`Could not load Promo Studio projects: ${error.message}`);
      return json({ projects: data || [] });
    }

    if (action === "list_branch_readiness") {
      const { data: activeBranches, error: branchError } = await db.from("branches")
        .select("id,name,slug,is_active").eq("is_active", true).order("name");
      if (branchError) throw new Error(`Could not load Promo Studio branches: ${branchError.message}`);
      const allowedIds = ["owner", "admin"].includes(operator.role)
        ? new Set((activeBranches || []).map((branch: any) => branch.id))
        : new Set(await branchIdsFor(db, operator.id));
      const visibleBranches = (activeBranches || []).filter((branch: any) => allowedIds.has(branch.id));
      if (!visibleBranches.length) return json({ branches: [], can_configure: ["owner", "admin"].includes(operator.role) });
      const visibleIds = visibleBranches.map((branch: any) => branch.id);
      const visibleSlugs = visibleBranches.map((branch: any) => branch.slug);
      const [{ data: sources, error: sourceError }, { data: identities, error: identityError },
        { data: accounts, error: accountError }] = await Promise.all([
        db.from("promo_branch_sources").select("*").in("branch_id", visibleIds),
        db.from("brand_identities").select("id,branch_id,name,status,color_palette,typography,updated_at")
          .in("branch_id", visibleSlugs).eq("status", "active"),
        db.from("branch_social_accounts").select("id,branch_id,platform,status,is_primary,handle")
          .in("branch_id", visibleIds).eq("platform", "instagram"),
      ]);
      if (sourceError || identityError || accountError) {
        throw new Error(sourceError?.message || identityError?.message || accountError?.message || "Could not load branch readiness.");
      }
      return json({
        branches: buildPromoBranchReadiness({
          branches: visibleBranches, sources: sources || [], brandIdentities: identities || [], socialAccounts: accounts || [],
        }),
        can_configure: ["owner", "admin"].includes(operator.role),
      });
    }

    if (action === "upsert_branch_source") {
      if (!["owner", "admin"].includes(operator.role)) throw new Error("Owner or admin access is required to configure branch evidence.");
      const input = validatePromoBranchSourceUpdate(body);
      const { data: branch, error: branchError } = await db.from("branches").select("id,slug,is_active")
        .eq("id", input.branchId).eq("is_active", true).maybeSingle();
      if (branchError || !branch) throw new Error("The selected branch is unavailable.");
      const { data: source, error } = await db.from("promo_branch_sources").upsert({
        organization_id: ORGANIZATION_ID, branch_id: branch.id, repository_provider: "github",
        repository_full_name: input.repositoryFullName, default_ref: input.defaultRef,
        permitted_paths: input.permittedPaths, prohibited_paths: input.prohibitedPaths,
        capture_base_url: input.captureBaseUrl, capture_fixture_key: input.captureFixtureKey,
        capture_auth_profile_key: input.captureAuthProfileKey, is_active: true,
        metadata: { configured_via: "promo_studio", configured_by: userId },
      }, { onConflict: "branch_id" }).select("*").single();
      if (error || !source) throw new Error(`Could not save branch evidence source: ${error?.message || "unknown error"}`);
      return json({ source });
    }

    if (action === "create_project") {
      const input = validatePromoCreate(body);
      const { data: branch, error: branchError } = await db.from("branches").select("id,name,slug,is_active")
        .eq("id", input.branchId).eq("is_active", true).maybeSingle();
      if (branchError || !branch) throw new Error("The selected branch is unavailable.");
      if (!["owner", "admin"].includes(operator.role)) {
        const branchIds = await branchIdsFor(db, operator.id);
        if (!branchIds.includes(branch.id)) throw new Error("You do not have access to the selected branch.");
      }
      const projectId = crypto.randomUUID();
      const revisionId = crypto.randomUUID();
      const now = new Date().toISOString();
      const manifest = createDraftPromoManifest({
        projectId, revisionId, ownerId: userId, organizationId: ORGANIZATION_ID,
        branch, title: input.title, prompt: input.prompt, targetSeconds: input.targetSeconds,
        formats: input.formats, now,
      });
      const fingerprint = await fingerprintPromoJson(manifest);
      const { data: project, error: projectError } = await db.from("promo_projects").insert({
        id: projectId, organization_id: ORGANIZATION_ID, branch_id: branch.id, created_by: userId,
        title: input.title, request_prompt: input.prompt, target_seconds: input.targetSeconds,
        requested_formats: input.formats, status: "draft",
      }).select("*").single();
      if (projectError) throw new Error(`Could not create Promo Studio project: ${projectError.message}`);
      const { data: revision, error: revisionError } = await db.from("promo_manifest_revisions").insert({
        id: revisionId, project_id: projectId, revision_number: 1, created_by: userId,
        reason: "Initial draft", manifest, manifest_fingerprint: fingerprint,
      }).select("*").single();
      if (revisionError) {
        await db.from("promo_projects").delete().eq("id", projectId);
        throw new Error(`Could not create initial Promo Manifest: ${revisionError.message}`);
      }
      const { error: updateError } = await db.from("promo_projects").update({ current_revision_id: revision.id }).eq("id", projectId);
      if (updateError) throw new Error(`Could not activate initial Promo Manifest: ${updateError.message}`);
      await audit(db, { projectId, revisionId, event: "project.created", stage: "draft", actorId: userId, details: { fingerprint } });
      return json({ project: { ...project, current_revision_id: revision.id }, revision }, 201);
    }

    const project = await requireProject(db, userId, operator, body.project_id);

    if (action === "scan_repository_evidence") {
      const { data: source } = await db.from("promo_branch_sources").select("*")
        .eq("branch_id", project.branch_id).eq("is_active", true).maybeSingle();
      if (!source) throw new Error("This branch has no verified product repository mapping.");
      const map = await buildGitHubEvidenceMap({
        repository: source.repository_full_name,
        ref: source.default_ref,
        permitted_paths: source.permitted_paths,
        prohibited_paths: source.prohibited_paths,
      }, { token: Deno.env.get("GITHUB_READ_TOKEN") || Deno.env.get("GITHUB_TOKEN") || undefined });
      await audit(db, {
        projectId: project.id, revisionId: project.current_revision_id,
        event: "evidence.repository_scanned", stage: "intelligence", actorId: userId,
        details: {
          repository: map.repository, commit_sha: map.commit_sha, permitted_paths: map.permitted_paths,
          scanned_file_count: map.scanned_files.length, route_count: map.routes.length,
          selector_count: map.test_selectors.length, skipped_count: map.skipped.length,
        },
      });
      return json({ evidence_map: map });
    }

    if (action === "generate_creative_plan") {
      if (!project.current_revision_id) throw new Error("Project has no active manifest revision.");
      const [{ data: source, error: sourceError }, { data: current, error: currentError }] = await Promise.all([
        db.from("promo_branch_sources").select("*").eq("branch_id", project.branch_id).eq("is_active", true).maybeSingle(),
        db.from("promo_manifest_revisions").select("*").eq("id", project.current_revision_id).single(),
      ]);
      if (sourceError || !source) throw new Error("This branch has no verified product repository mapping.");
      if (currentError || !current) throw new Error("Could not load the active Promo Manifest.");
      const branchSlug = current.manifest?.promo?.branch?.slug;
      const { data: activeBrandIdentities, error: brandIdentityError } = await db.from("brand_identities")
        .select("id,branch_id,name,status,voice,color_palette,typography,updated_at")
        .eq("branch_id", branchSlug).eq("status", "active").limit(2);
      if (brandIdentityError || activeBrandIdentities?.length !== 1) {
        throw new Error("Creative planning requires one complete active Brand Identity for this branch.");
      }
      const evidence = await buildGitHubEvidenceMap({
        repository: source.repository_full_name, ref: source.default_ref,
        permitted_paths: source.permitted_paths, prohibited_paths: source.prohibited_paths,
      }, { token: Deno.env.get("GITHUB_READ_TOKEN") || Deno.env.get("GITHUB_TOKEN") || undefined });
      const geminiKey = Deno.env.get("GEMINI_API_KEY") || (await db.from("tenant_secrets")
        .select("gemini_api_key").eq("organization_id", ORGANIZATION_ID).maybeSingle()).data?.gemini_api_key;
      if (!geminiKey) throw new Error("Promo Creative Director requires a server-side Gemini key.");
      const promptVersion = "promo-creative-director-v1";
      const model = "gemini-3-flash-preview";
      const prompt = buildPromoCreativeDirectorPrompt({
        request: current.manifest.request.prompt, targetSeconds: project.target_seconds,
        formats: project.requested_formats, branchName: current.manifest.promo.branch.display_name, evidence,
      });
      const modelResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
        }),
      });
      if (!modelResponse.ok) throw new Error(`Promo Creative Director provider failed (${modelResponse.status}).`);
      const providerPayload = await modelResponse.json();
      const rawText = providerPayload?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (typeof rawText !== "string" || !rawText.trim()) throw new Error("Promo Creative Director returned no plan.");
      let rawPlan: unknown;
      try { rawPlan = JSON.parse(rawText); } catch { throw new Error("Promo Creative Director returned invalid JSON."); }
      const plan = parsePromoCreativePlan(sanitizePromoJson(rawPlan), evidence);
      const revisionId = crypto.randomUUID();
      const revisionNumber = Number(current.revision_number) + 1;
      const now = new Date().toISOString();
      const assetId = crypto.randomUUID();
      const assetPath = `${project.id}/${revisionId}/creative-plan-response.json`;
      const rawBytes = new TextEncoder().encode(JSON.stringify(plan));
      const rawChecksum = await sha256Hex(rawBytes);
      const manifest = materializePromoCreativePlan(current.manifest, plan, evidence, source, activeBrandIdentities[0]);
      Object.assign(manifest.promo, {
        id: project.id, organization_id: project.organization_id, owner_id: project.created_by,
        revision_id: revisionId, revision: revisionNumber, parent_revision_id: current.id, updated_at: now,
      });
      manifest.assets.push({
        id: assetId, kind: "provider_response", role: "creative_director_validated_response",
        storage_bucket: BUCKET, storage_path: assetPath, mime_type: "application/json", checksum_sha256: rawChecksum,
        duration_seconds: null, width: null, height: null,
        provenance: { source_kind: "provider", source_ref: `${model}:${promptVersion}`, generated: true, approved: false },
      });
      const validatedManifest = validatePromoRevision(manifest, project.id, revisionId, revisionNumber);
      const fingerprint = await fingerprintPromoJson(validatedManifest);
      const { error: uploadError } = await db.storage.from(BUCKET).upload(assetPath, rawBytes, { contentType: "application/json", upsert: false });
      if (uploadError) throw new Error(`Could not store the validated Creative Director response: ${uploadError.message}`);
      const cleanup = async () => { await db.storage.from(BUCKET).remove([assetPath]); await db.from("promo_manifest_revisions").delete().eq("id", revisionId); };
      const { data: revision, error: revisionError } = await db.from("promo_manifest_revisions").insert({
        id: revisionId, project_id: project.id, revision_number: revisionNumber, parent_revision_id: current.id,
        created_by: userId, reason: "Generated evidence-bound creative plan", manifest: validatedManifest,
        manifest_fingerprint: fingerprint, diff: [{ op: "creative_plan", prompt_version: promptVersion, model }],
      }).select("*").single();
      if (revisionError) { await cleanup(); throw new Error(`Could not create the Creative Director revision: ${revisionError.message}`); }
      const normalizedWrites = await Promise.all([
        db.from("promo_assets").insert({
          id: assetId, project_id: project.id, revision_id: revisionId, kind: "provider_response",
          role: "creative_director_validated_response", status: "ready", storage_bucket: BUCKET,
          storage_path: assetPath, mime_type: "application/json", checksum_sha256: rawChecksum,
          file_size_bytes: rawBytes.byteLength, generated: true, approved: false,
          provenance: { model, prompt_version: promptVersion, evidence_commit: evidence.commit_sha },
        }),
        db.from("promo_claims").insert(validatedManifest.evidence.claims.map((claim: any) => ({
          project_id: project.id, revision_id: revisionId, claim_key: claim.id, claim_text: claim.text,
          claim_type: claim.claim_type, evidence_status: claim.status, evidence_refs: claim.evidence_refs, approved: false,
        }))),
        db.from("promo_scenes").insert(validatedManifest.scenes.map((scene: any) => ({
          project_id: project.id, revision_id: revisionId, scene_key: scene.id, position: scene.position,
          name: scene.name, purpose: scene.purpose, phrase_anchor: scene.anchor,
          duration_policy: scene.duration, visual_kind: scene.visual.kind, layout: scene.layout,
          provenance: { claim_ids: scene.claim_ids, capture_scenario_id: scene.visual.capture_scenario_id },
        }))),
        validatedManifest.captures.scenarios.length
          ? db.from("promo_capture_scenarios").insert(validatedManifest.captures.scenarios.map((scenario: any) => ({
            project_id: project.id, revision_id: revisionId, scenario_key: scenario.key,
            scenario_version: scenario.version, repository_ref: scenario.repository_ref,
            commit_sha: scenario.commit_sha, environment: scenario.environment, route: scenario.route,
            auth_profile_key: scenario.auth_profile_key, definition: scenario, status: "draft",
          })))
          : Promise.resolve({ error: null }),
      ]);
      const writeError = normalizedWrites.find(result => result.error)?.error;
      if (writeError) { await cleanup(); throw new Error(`Could not persist the Creative Director review data: ${writeError.message}`); }
      const { error: projectError } = await db.from("promo_projects").update({
        current_revision_id: revisionId, status: "script_review",
        selected_preview_render_id: null, final_approved_at: null,
      }).eq("id", project.id);
      if (projectError) { await cleanup(); throw new Error(`Could not activate the Creative Director revision: ${projectError.message}`); }
      await audit(db, {
        projectId: project.id, revisionId, event: "creative_plan.generated", stage: "script_review", actorId: userId,
        details: { model, prompt_version: promptVersion, evidence_commit: evidence.commit_sha, claim_count: plan.claims.length, scene_count: plan.storyboard.length, fingerprint },
      });
      return json({ revision, plan, claims: validatedManifest.evidence.claims }, 201);
    }

    if (action === "get_project") {
      const [revision, revisions, jobs, approvals, assets, captureRuns, voiceTakes, musicTakes, events, source] = await Promise.all([
        project.current_revision_id ? db.from("promo_manifest_revisions").select("*").eq("id", project.current_revision_id).maybeSingle() : { data: null, error: null },
        db.from("promo_manifest_revisions").select("id,revision_number,parent_revision_id,reason,schema_version,manifest_fingerprint,immutable_at,created_at,created_by").eq("project_id", project.id).order("revision_number", { ascending: false }).limit(50),
        db.from("promo_jobs").select("*").eq("project_id", project.id).order("created_at", { ascending: false }).limit(100),
        db.from("promo_approvals").select("*").eq("project_id", project.id).order("created_at", { ascending: false }).limit(100),
        db.from("promo_assets").select("*").eq("project_id", project.id).neq("status", "archived").order("created_at", { ascending: false }).limit(200),
        project.current_revision_id ? db.from("promo_capture_runs").select("*").eq("project_id", project.id)
          .eq("revision_id", project.current_revision_id).order("created_at", { ascending: false }).limit(50) : { data: [], error: null },
        db.from("promo_voice_takes").select("*").eq("project_id", project.id).order("created_at", { ascending: false }).limit(50),
        db.from("promo_music_takes").select("*").eq("project_id", project.id).order("created_at", { ascending: false }).limit(50),
        db.from("promo_events").select("*").eq("project_id", project.id).order("created_at", { ascending: false }).limit(100),
        db.from("promo_branch_sources").select("*").eq("branch_id", project.branch_id).eq("is_active", true).maybeSingle(),
      ]);
      for (const result of [revision, revisions, jobs, approvals, assets, captureRuns, voiceTakes, musicTakes, events, source]) if (result.error) throw new Error(`Could not load Promo Studio project: ${result.error.message}`);
      return json({ project, source: source.data, revision: revision.data, revisions: revisions.data || [], jobs: jobs.data || [], approvals: approvals.data || [], assets: assets.data || [], capture_runs: captureRuns.data || [], voice_takes: voiceTakes.data || [], music_takes: musicTakes.data || [], events: events.data || [] });
    }

    if (action === "create_revision") {
      if (!project.current_revision_id) throw new Error("Project has no active manifest revision.");
      const { data: current, error: currentError } = await db.from("promo_manifest_revisions").select("*").eq("id", project.current_revision_id).single();
      if (currentError) throw new Error("Could not load the active Promo Manifest.");
      const reason = sanitizePromoText(body.reason, 1000) || "Updated draft";
      assertPromoApprovalStatePreserved(current.manifest, body.manifest);
      const { revision, manifest, fingerprint, revisionId, revisionNumber } = await createManifestRevision(db, {
        project, current, candidate: body.manifest, userId, reason,
        diff: Array.isArray(body.diff) ? body.diff : [],
      });
      await audit(db, { projectId: project.id, revisionId, event: "manifest.revised", stage: manifest.promo.status as string, actorId: userId, details: { revision_number: revisionNumber, fingerprint, reason } });
      return json({ revision });
    }

    if (action === "adopt_capture") {
      if (!project.current_revision_id || !isPromoUuid(body.capture_run_id)) {
        throw new Error("A valid current capture run is required.");
      }
      const [{ data: current, error: currentError }, { data: run, error: runError }] = await Promise.all([
        db.from("promo_manifest_revisions").select("*").eq("id", project.current_revision_id).single(),
        db.from("promo_capture_runs").select("*").eq("id", body.capture_run_id)
          .eq("project_id", project.id).eq("revision_id", project.current_revision_id)
          .eq("status", "succeeded").maybeSingle(),
      ]);
      if (currentError || !current) throw new Error("Could not load the active Promo Manifest.");
      if (runError || !run) throw new Error("Succeeded capture run not found on the active revision.");
      const stillIds = Array.isArray(run.still_asset_ids) ? run.still_asset_ids : [];
      const artifactIds = [run.video_asset_id, ...stillIds, run.trace_asset_id];
      if (artifactIds.some(assetId => !isPromoUuid(assetId)) || new Set(artifactIds).size !== artifactIds.length) {
        throw new Error("Capture run artifact identity is invalid.");
      }
      const [{ data: scenario, error: scenarioError }, { data: assets, error: assetsError }, { data: events, error: eventsError }] = await Promise.all([
        db.from("promo_capture_scenarios").select("*").eq("id", run.scenario_id)
          .eq("project_id", project.id).eq("revision_id", current.id).eq("status", "verified").maybeSingle(),
        db.from("promo_assets").select("*").eq("project_id", project.id).eq("revision_id", current.id)
          .in("id", artifactIds).eq("status", "ready"),
        db.from("promo_events").select("job_id").eq("project_id", project.id).eq("revision_id", current.id)
          .eq("event_type", "job.succeeded").eq("stage", "capture")
          .contains("details", { capture_run_id: run.id }).limit(2),
      ]);
      if (scenarioError || !scenario) throw new Error("Verified capture scenario not found on the active revision.");
      if (assetsError || assets?.length !== artifactIds.length) throw new Error("Verified capture artifacts are incomplete.");
      if (eventsError || events?.length !== 1 || !isPromoUuid(events[0].job_id)) {
        throw new Error("Capture completion audit lineage is missing or ambiguous.");
      }
      const candidate = applyPromoCaptureAdoption(current.manifest, scenario, { ...run, job_id: events[0].job_id }, assets);
      const created = await createManifestRevision(db, {
        project, current, candidate, userId, reason: `Adopted verified capture ${scenario.scenario_key}`,
        adoptedAssetIds: artifactIds, adoptedBindingReason: "capture_adoption",
        diff: [{ op: "capture_adoption", capture_run_id: run.id, scenario_key: scenario.scenario_key,
          source_revision_id: current.id, artifact_asset_ids: artifactIds }],
      });
      await audit(db, {
        projectId: project.id, revisionId: created.revisionId, event: "capture.adopted", stage: "capture",
        actorId: userId, details: { capture_run_id: run.id, scenario_key: scenario.scenario_key,
          source_revision_id: current.id, artifact_asset_ids: artifactIds, fingerprint: created.fingerprint },
      });
      return json({ revision: created.revision, capture_run_id: run.id }, 201);
    }

    if (["adopt_voice_generation", "adopt_voice_alignment", "adopt_music"].includes(action)) {
      if (!project.current_revision_id || !isPromoUuid(body.take_id)) throw new Error("A valid completed audio take is required.");
      const { data: current, error: currentError } = await db.from("promo_manifest_revisions").select("*")
        .eq("id", project.current_revision_id).single();
      if (currentError || !current) throw new Error("Could not load the active Promo Manifest.");

      const voiceAction = action.startsWith("adopt_voice");
      const expectedStage = action === "adopt_voice_generation" ? "voice_generate"
        : action === "adopt_voice_alignment" ? "voice_align" : "music_generate";
      const takeQuery = voiceAction
        ? db.from("promo_voice_takes").select("*").eq("id", body.take_id).eq("project_id", project.id).maybeSingle()
        : db.from("promo_music_takes").select("*").eq("id", body.take_id).eq("project_id", project.id).maybeSingle();
      const [{ data: take, error: takeError }, { data: events, error: eventsError }] = await Promise.all([
        takeQuery,
        db.from("promo_events").select("job_id,details").eq("project_id", project.id)
          .eq("revision_id", current.id).eq("event_type", "job.succeeded").eq("stage", expectedStage)
          .contains("details", { take_id: body.take_id }).limit(2),
      ]);
      if (takeError || !take) throw new Error("Completed audio take was not found for this project.");
      if (eventsError || events?.length !== 1 || !isPromoUuid(events[0].job_id)) {
        throw new Error("Audio completion audit lineage is missing or ambiguous.");
      }

      const assetId = action === "adopt_voice_alignment" ? take.alignment_asset_id : take.audio_asset_id;
      if (!isPromoUuid(assetId)) throw new Error("Completed audio result has no verified output asset.");
      const { data: asset, error: assetError } = await db.from("promo_assets").select("*")
        .eq("id", assetId).eq("project_id", project.id).eq("revision_id", current.id)
        .eq("status", "ready").maybeSingle();
      if (assetError || !asset) throw new Error("Completed audio output is not ready on the active revision.");

      const candidate = action === "adopt_voice_generation"
        ? applyPromoVoiceGenerationAdoption(current.manifest, take, asset, events[0].job_id)
        : action === "adopt_voice_alignment"
        ? applyPromoVoiceAlignmentAdoption(current.manifest, take, asset, asset.provenance?.alignment, events[0].job_id)
        : applyPromoMusicAdoption(current.manifest, take, asset, events[0].job_id);
      const gate = action === "adopt_music" ? "music" : "voice";
      const finalSelection = action !== "adopt_voice_generation";
      const created = await createManifestRevision(db, {
        project, current, candidate, userId,
        reason: action === "adopt_voice_generation" ? `Adopted voice take ${take.take_number} for alignment`
          : action === "adopt_voice_alignment" ? `Approved aligned voice take ${take.take_number}`
          : `Approved music take ${take.take_number}`,
        adoptedAssetIds: [asset.id], adoptedBindingReason: gate === "voice" ? "voice_adoption" : "music_adoption",
        diff: [{ op: action, take_id: take.id, source_revision_id: current.id, artifact_asset_ids: [asset.id] }],
      });
      if (finalSelection) {
        const { error: approvalError } = await db.from("promo_approvals").insert({
          project_id: project.id, revision_id: created.revisionId, gate, subject_type: "take",
          subject_id: take.id, decision: "approved", decided_by: userId,
          reason: gate === "voice" ? "Approved aligned voice take" : "Approved music take",
        });
        const takeTable = gate === "voice" ? "promo_voice_takes" : "promo_music_takes";
        const { error: selectionError } = await db.from(takeTable)
          .update({ selected: true, updated_at: new Date().toISOString() }).eq("id", take.id);
        if (approvalError || selectionError) {
          await db.from("promo_projects").update({
            current_revision_id: current.id, status: current.manifest.promo.status,
            selected_preview_render_id: project.selected_preview_render_id, final_approved_at: project.final_approved_at,
          }).eq("id", project.id).eq("current_revision_id", created.revisionId);
          await db.from("promo_manifest_revisions").delete().eq("id", created.revisionId);
          throw new Error(`Could not record ${gate} approval: ${approvalError?.message || selectionError?.message}`);
        }
      }
      await audit(db, {
        projectId: project.id, revisionId: created.revisionId, event: `${gate}.adopted`, stage: expectedStage,
        actorId: userId, details: { take_id: take.id, source_revision_id: current.id,
          artifact_asset_ids: [asset.id], selected: finalSelection, fingerprint: created.fingerprint },
      });
      return json({ revision: created.revision, take_id: take.id, selected: finalSelection }, 201);
    }

    if (action === "approve_claim" || action === "approve_script") {
      if (!project.current_revision_id) throw new Error("Project has no active manifest revision.");
      const { data: current, error: currentError } = await db.from("promo_manifest_revisions").select("*").eq("id", project.current_revision_id).single();
      if (currentError || !current) throw new Error("Could not load the active Promo Manifest.");
      const claimId = action === "approve_claim" ? cleanPromoText(body.claim_id, 80) : null;
      const candidate = action === "approve_claim"
        ? applyPromoClaimApproval(current.manifest, claimId)
        : applyPromoScriptApproval(current.manifest);
      const gate = action === "approve_claim" ? "claims" : "script";
      const subjectType = action === "approve_claim" ? "claim" : "script";
      const subjectId = action === "approve_claim" ? claimId! : "approved-script";
      const reason = action === "approve_claim" ? `Approved claim ${claimId}` : "Approved script for audio review";
      const created = await createManifestRevision(db, {
        project, current, candidate, userId, reason,
        diff: [{ op: "approval", gate, subject_type: subjectType, subject_id: subjectId, decision: "approved" }],
      });
      const { data: approval, error: approvalError } = await db.from("promo_approvals").insert({
        project_id: project.id, revision_id: created.revisionId, gate, subject_type: subjectType,
        subject_id: subjectId, decision: "approved", decided_by: userId, reason,
      }).select("*").single();
      if (approvalError) {
        await db.from("promo_projects").update({
          current_revision_id: current.id, status: current.manifest.promo.status,
          selected_preview_render_id: project.selected_preview_render_id, final_approved_at: project.final_approved_at,
        })
          .eq("id", project.id).eq("current_revision_id", created.revisionId);
        await db.from("promo_manifest_revisions").delete().eq("id", created.revisionId);
        throw new Error(`Could not record Promo Studio approval: ${approvalError.message}`);
      }
      await audit(db, {
        projectId: project.id, revisionId: created.revisionId, event: "approval.recorded", stage: gate, actorId: userId,
        details: { decision: "approved", subject_type: subjectType, subject_id: subjectId, fingerprint: created.fingerprint },
      });
      return json({ revision: created.revision, approval }, 201);
    }

    if (action === "archive_project") {
      const now = new Date().toISOString();
      const { data, error } = await db.from("promo_projects").update({ status: "archived", archived_at: now }).eq("id", project.id).select("*").single();
      if (error) throw new Error(`Could not archive Promo Studio project: ${error.message}`);
      await audit(db, { projectId: project.id, revisionId: project.current_revision_id, event: "project.archived", actorId: userId });
      return json({ project: data });
    }

    if (action === "create_job") {
      if (!project.current_revision_id) throw new Error("Project has no active manifest revision.");
      const jobType = cleanPromoText(body.job_type, 60);
      if (!PROMO_JOB_TYPES.has(jobType)) throw new Error("Unsupported Promo Studio job type.");
      const serverResolvedJob = ["capture", "voice_generate", "voice_align", "music_generate", "preview_render", "final_render"].includes(jobType);
      const dependencies = serverResolvedJob ? [] : (Array.isArray(body.dependency_job_ids) ? body.dependency_job_ids : []);
      if (dependencies.some((id: unknown) => !isPromoUuid(id))) throw new Error("Job dependencies must be valid job IDs.");
      let input: unknown;
      if (jobType === "capture") {
        const [{ data: revision, error: revisionError }, { data: source, error: sourceError }] = await Promise.all([
          db.from("promo_manifest_revisions").select("manifest").eq("id", project.current_revision_id).single(),
          db.from("promo_branch_sources").select("*").eq("branch_id", project.branch_id).eq("is_active", true).maybeSingle(),
        ]);
        if (revisionError || !revision) throw new Error("Could not load the active Promo Manifest for capture.");
        if (sourceError || !source) throw new Error("This branch has no active capture source mapping.");
        input = buildPromoCaptureJobInput(revision.manifest, source, body.scenario_id);
      } else if (jobType === "voice_generate" || jobType === "voice_align") {
        const [{ data: revision, error: revisionError }, { data: voiceReservations, error: reservationsError }] = await Promise.all([
          db.from("promo_manifest_revisions").select("manifest").eq("id", project.current_revision_id).single(),
          jobType === "voice_generate"
            ? db.from("promo_jobs").select("input").eq("revision_id", project.current_revision_id)
              .eq("job_type", "voice_generate").in("status", ["queued", "running", "succeeded"])
            : Promise.resolve({ data: [], error: null }),
        ]);
        if (revisionError || !revision) throw new Error("Could not load the active Promo Manifest for voice work.");
        if (reservationsError) throw new Error("Could not verify existing voice take reservations.");
        input = jobType === "voice_generate"
          ? buildPromoVoiceGenerationJobInput(revision.manifest, body.direction, (voiceReservations || []).map((job: any) => job.input))
          : buildPromoVoiceAlignmentJobInput(revision.manifest, body.take_id);
      } else if (jobType === "music_generate") {
        const [{ data: revision, error: revisionError }, { data: musicReservations, error: reservationsError }] = await Promise.all([
          db.from("promo_manifest_revisions").select("manifest").eq("id", project.current_revision_id).single(),
          db.from("promo_jobs").select("input").eq("revision_id", project.current_revision_id)
            .eq("job_type", "music_generate").in("status", ["queued", "running", "succeeded"]),
        ]);
        if (revisionError || !revision) throw new Error("Could not load the active Promo Manifest for music work.");
        if (reservationsError) throw new Error("Could not verify existing music take reservations.");
        input = buildPromoMusicGenerationJobInput(
          revision.manifest, body.direction, (musicReservations || []).map((job: any) => job.input),
        );
      } else if (jobType === "preview_render" || jobType === "final_render") {
        const { data: branch, error: branchError } = await db.from("branches")
          .select("id,slug,name,is_active").eq("id", project.branch_id).eq("is_active", true).maybeSingle();
        if (branchError || !branch) throw new Error("Could not verify the active render branch.");
        const { data: revision, error: revisionError } = await db.from("promo_manifest_revisions")
          .select("manifest").eq("id", project.current_revision_id).single();
        if (revisionError || !revision) throw new Error("Could not load the active Promo Manifest for rendering.");
        const [{ data: assets, error: assetsError }, { data: bindings, error: bindingsError },
          { data: approvals, error: approvalsError }, { data: brandIdentities, error: brandIdentityError }] = await Promise.all([
          db.from("promo_assets").select("id,revision_id,kind,status,storage_bucket,storage_path,mime_type,checksum_sha256,width,height")
            .eq("project_id", project.id).eq("status", "ready"),
          db.from("promo_revision_assets").select("asset_id").eq("project_id", project.id)
            .eq("revision_id", project.current_revision_id),
          db.from("promo_approvals").select("revision_id,gate,subject_type,subject_id,decision,created_at").eq("project_id", project.id)
            .eq("revision_id", project.current_revision_id),
          db.from("brand_identities").select("id,branch_id,name,status,color_palette,typography,updated_at")
            .eq("branch_id", branch.slug).eq("status", "active").order("updated_at", { ascending: false }).limit(2),
        ]);
        if (assetsError || bindingsError || approvalsError || brandIdentityError) throw new Error("Could not verify render assets, bindings, approvals, and presentation.");
        if (brandIdentities?.length !== 1) throw new Error("Rendering requires one unambiguous active Brand Identity for this branch.");
        input = buildPromoRenderJobInput(
          revision.manifest, assets || [], approvals || [], project.selected_preview_render_id, jobType, body.format, branch,
          brandIdentities[0], (bindings || []).map((binding: any) => binding.asset_id),
        );
      } else {
        input = sanitizePromoJson(body.input && typeof body.input === "object" ? body.input : {});
      }
      const inputFingerprint = await fingerprintPromoJson(input);
      const idempotencyKey = (serverResolvedJob ? "" : cleanPromoText(body.idempotency_key, 200)) || `${project.current_revision_id}:${jobType}:${inputFingerprint}`;
      const { data, error } = await db.from("promo_jobs").insert({
        project_id: project.id, revision_id: project.current_revision_id, created_by: userId,
        job_type: jobType, idempotency_key: idempotencyKey, dependency_job_ids: dependencies,
        input_fingerprint: inputFingerprint, input, priority: Math.max(-10, Math.min(10, Number(body.priority) || 0)),
      }).select("*").single();
      if (error) {
        const { data: existing } = await db.from("promo_jobs").select("*").eq("project_id", project.id).eq("idempotency_key", idempotencyKey).maybeSingle();
        if (existing) return json({ job: existing, idempotent: true });
        throw new Error(`Could not queue Promo Studio job: ${error.message}`);
      }
      await audit(db, { projectId: project.id, revisionId: project.current_revision_id, jobId: data.id, event: "job.queued", stage: jobType, actorId: userId, details: { input_fingerprint: inputFingerprint, dependencies } });
      return json({ job: data }, 201);
    }

    if (action === "cancel_job" || action === "retry_job") {
      if (!isPromoUuid(body.job_id)) throw new Error("A valid Promo Studio job is required.");
      const { data: job } = await db.from("promo_jobs").select("*").eq("id", body.job_id).eq("project_id", project.id).maybeSingle();
      if (!job) throw new Error("Promo Studio job not found.");
      const retry = action === "retry_job";
      if (retry && !["failed", "cancelled"].includes(job.status)) throw new Error("Only failed or cancelled jobs can be retried.");
      if (!retry && !["queued", "running"].includes(job.status)) throw new Error("Only queued or running jobs can be cancelled.");
      const changes = retry
        ? { status: "queued", progress: 0, worker_id: null, lease_token: null, lease_expires_at: null, heartbeat_at: null, error_code: null, error_message: null, completed_at: null, queued_at: new Date().toISOString() }
        : { status: job.status === "queued" ? "cancelled" : "cancel_requested", completed_at: job.status === "queued" ? new Date().toISOString() : null };
      const { data, error } = await db.from("promo_jobs").update(changes).eq("id", job.id).select("*").single();
      if (error) throw new Error(`Could not ${retry ? "retry" : "cancel"} Promo Studio job: ${error.message}`);
      await audit(db, { projectId: project.id, revisionId: job.revision_id, jobId: job.id, event: retry ? "job.retried" : "job.cancel_requested", stage: job.job_type, actorId: userId });
      return json({ job: data });
    }

    if (action === "record_approval") {
      const gate = cleanPromoText(body.gate, 40);
      const decision = cleanPromoText(body.decision, 40);
      if (!PROMO_APPROVAL_GATES.has(gate) || !PROMO_APPROVAL_DECISIONS.has(decision)) throw new Error("Approval gate or decision is invalid.");
      if (decision === "approved" && ["claims", "script"].includes(gate)) throw new Error("Claims and scripts must use their gated approval actions.");
      if (gate === "preview") throw new Error("Preview decisions must use the selected preview review action.");
      const revisionId = cleanPromoText(body.revision_id || project.current_revision_id, 80);
      const { data: revision } = await db.from("promo_manifest_revisions").select("id").eq("id", revisionId).eq("project_id", project.id).maybeSingle();
      if (!revision) throw new Error("Approval revision does not belong to this project.");
      const subjectType = cleanPromoText(body.subject_type, 80);
      const subjectId = cleanPromoText(body.subject_id, 160);
      if (!subjectType || !subjectId) throw new Error("Approval subject is required.");
      const { data, error } = await db.from("promo_approvals").insert({
        project_id: project.id, revision_id: revision.id, gate, subject_type: subjectType,
        subject_id: subjectId, decision, decided_by: userId, reason: sanitizePromoText(body.reason, 1000) || null,
      }).select("*").single();
      if (error) throw new Error(`Could not record Promo Studio approval: ${error.message}`);
      await audit(db, { projectId: project.id, revisionId: revision.id, event: "approval.recorded", stage: gate, actorId: userId, details: { decision, subject_type: subjectType, subject_id: subjectId } });
      return json({ approval: data }, 201);
    }

    if (action === "select_preview") {
      if (!project.current_revision_id || !isPromoUuid(body.asset_id)) throw new Error("A valid current preview asset is required.");
      const { data: asset, error: assetError } = await db.from("promo_assets").select("*")
        .eq("id", body.asset_id).eq("project_id", project.id).eq("revision_id", project.current_revision_id)
        .eq("kind", "render_preview").eq("status", "ready").maybeSingle();
      if (assetError || !asset || asset.storage_bucket !== BUCKET || asset.mime_type !== "video/mp4"
        || asset.width !== 1080 || asset.height !== 1920 || !/^[a-f0-9]{64}$/.test(asset.checksum_sha256 || "")) {
        throw new Error("Select a verified 1080x1920 preview from the active revision.");
      }
      const { data: jobs, error: jobError } = await db.from("promo_jobs").select("id")
        .eq("project_id", project.id).eq("revision_id", project.current_revision_id)
        .eq("job_type", "preview_render").eq("status", "succeeded").contains("output_asset_ids", [asset.id]).limit(1);
      if (jobError || !jobs?.length) throw new Error("The selected preview was not produced by a succeeded preview render job.");
      const { data: updated, error: updateError } = await db.from("promo_projects")
        .update({ selected_preview_render_id: asset.id, status: "final_review", final_approved_at: null })
        .eq("id", project.id).eq("current_revision_id", project.current_revision_id).select("*").single();
      if (updateError || !updated) throw new Error("Could not select the current Promo Studio preview.");
      await audit(db, {
        projectId: project.id, revisionId: project.current_revision_id, event: "preview.selected", stage: "preview",
        actorId: userId, details: { asset_id: asset.id, render_job_id: jobs[0].id },
      });
      return json({ project: updated, asset });
    }

    if (action === "review_preview") {
      const decision = cleanPromoText(body.decision, 40);
      if (!PROMO_APPROVAL_DECISIONS.has(decision)) throw new Error("Preview decision is invalid.");
      if (!project.current_revision_id || !isPromoUuid(project.selected_preview_render_id)) {
        throw new Error("Select a current preview before recording a decision.");
      }
      const { data: asset } = await db.from("promo_assets").select("id").eq("id", project.selected_preview_render_id)
        .eq("project_id", project.id).eq("revision_id", project.current_revision_id)
        .eq("kind", "render_preview").eq("status", "ready").maybeSingle();
      if (!asset) throw new Error("The selected preview is no longer ready for review.");
      const reason = sanitizePromoText(body.reason, 1000) || null;
      const { data: approval, error } = await db.from("promo_approvals").insert({
        project_id: project.id, revision_id: project.current_revision_id, gate: "preview", subject_type: "asset",
        subject_id: asset.id, decision, decided_by: userId, reason,
      }).select("*").single();
      if (error || !approval) throw new Error(`Could not record preview decision: ${error?.message || "unknown error"}`);
      await audit(db, {
        projectId: project.id, revisionId: project.current_revision_id, event: "approval.recorded", stage: "preview",
        actorId: userId, details: { decision, subject_type: "asset", subject_id: asset.id },
      });
      return json({ approval }, 201);
    }

    if (action === "schedule_final_publish") {
      if (!project.current_revision_id || !isPromoUuid(body.asset_id)) throw new Error("A valid final render is required.");
      const caption = sanitizePromoText(body.caption, 2200);
      if (!caption) throw new Error("A publish caption is required.");
      const scheduledFor = new Date(String(body.scheduled_for || ""));
      if (!Number.isFinite(scheduledFor.getTime())) throw new Error("A valid publishing time is required.");
      const idempotencyKey = `${project.current_revision_id}:instagram:${body.asset_id}:${scheduledFor.toISOString()}`;
      const { data: scheduledPostId, error } = await db.rpc("approve_and_schedule_promo_post", {
        p_project_id: project.id, p_revision_id: project.current_revision_id, p_asset_id: body.asset_id,
        p_actor_id: userId, p_caption: caption, p_scheduled_for: scheduledFor.toISOString(),
        p_idempotency_key: idempotencyKey,
      });
      if (error || !isPromoUuid(scheduledPostId)) {
        throw new Error(error?.message || "Final render did not pass the approval and scheduling contract.");
      }
      return json({ scheduled_post_id: scheduledPostId }, 201);
    }

    if (action === "create_asset_upload") {
      const revisionId = cleanPromoText(body.revision_id || project.current_revision_id, 80);
      const { data: revision } = await db.from("promo_manifest_revisions").select("id").eq("id", revisionId).eq("project_id", project.id).maybeSingle();
      if (!revision) throw new Error("Asset revision does not belong to this project.");
      const assetId = crypto.randomUUID();
      const filename = safeFilename(body.filename);
      const path = `${project.id}/${assetId}/${filename}`;
      const kind = cleanPromoText(body.kind, 60);
      const role = cleanPromoText(body.role, 120);
      const mimeType = cleanPromoText(body.mime_type, 120);
      if (!kind || !role || !mimeType) throw new Error("Asset kind, role, and MIME type are required.");
      const { data: asset, error } = await db.from("promo_assets").insert({
        id: assetId, project_id: project.id, revision_id: revision.id, kind, role,
        storage_bucket: BUCKET, storage_path: path, mime_type: mimeType,
        generated: body.generated === true, provenance: sanitizePromoJson(body.provenance || {}),
      }).select("*").single();
      if (error) throw new Error(`Could not register Promo Studio asset: ${error.message}`);
      const { data: upload, error: uploadError } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
      if (uploadError) throw new Error(`Could not authorize Promo Studio upload: ${uploadError.message}`);
      await audit(db, { projectId: project.id, revisionId: revision.id, event: "asset.upload_authorized", stage: kind, actorId: userId, details: { asset_id: asset.id } });
      return json({ asset, upload: { path: upload.path, token: upload.token } }, 201);
    }

    if (action === "complete_asset_upload") {
      if (!isPromoUuid(body.asset_id)) throw new Error("A valid Promo Studio asset is required.");
      const { data: asset } = await db.from("promo_assets").select("*").eq("id", body.asset_id).eq("project_id", project.id).maybeSingle();
      if (!asset || asset.status !== "uploading") throw new Error("Upload is not awaiting completion.");
      const { data: file, error: downloadError } = await db.storage.from(asset.storage_bucket).download(asset.storage_path);
      if (downloadError || !file) throw new Error("Uploaded Promo Studio asset could not be verified.");
      const bytes = await file.arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const checksum = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
      const { data, error } = await db.from("promo_assets").update({ status: "ready", checksum_sha256: checksum, file_size_bytes: bytes.byteLength }).eq("id", asset.id).select("*").single();
      if (error) throw new Error(`Could not complete Promo Studio asset: ${error.message}`);
      await audit(db, { projectId: project.id, revisionId: asset.revision_id, event: "asset.ready", stage: asset.kind, actorId: userId, details: { asset_id: asset.id, checksum_sha256: checksum } });
      return json({ asset: data });
    }

    if (action === "sign_asset") {
      if (!isPromoUuid(body.asset_id)) throw new Error("A valid Promo Studio asset is required.");
      const { data: asset } = await db.from("promo_assets").select("*").eq("id", body.asset_id).eq("project_id", project.id).eq("status", "ready").maybeSingle();
      if (!asset) throw new Error("Ready Promo Studio asset not found.");
      const { data, error } = await db.storage.from(asset.storage_bucket).createSignedUrl(asset.storage_path, 900);
      if (error || !data?.signedUrl) throw new Error("Could not authorize Promo Studio asset.");
      return json({ asset_id: asset.id, signed_url: data.signedUrl, expires_in: 900 });
    }

    return json({ error: "Unknown Promo Studio action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Promo Studio request failed.";
    const status = /access|operator/i.test(message) ? 403 : /not found/i.test(message) ? 404 : 400;
    return json({ error: message }, status);
  }
});
