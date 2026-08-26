import type {
  PromoCaptureAssetRow, PromoCaptureRunResult, PromoCaptureScenarioRow,
} from "./types.ts";

const SHA = /^[a-f0-9]{40}$/i;
const SHA256 = /^[a-f0-9]{64}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class PromoCaptureReadinessError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PromoCaptureReadinessError";
    this.code = code;
  }
}

function record(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function configured(value: unknown): value is string {
  return typeof value === "string" && !!value.trim() && value !== "unconfigured";
}

function captureBaseUrl(value: unknown) {
  if (!configured(value)) throw new PromoCaptureReadinessError("PROMO_CAPTURE_ENVIRONMENT_REQUIRED", "A verified capture base URL is required before capture can be queued.");
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new PromoCaptureReadinessError("PROMO_CAPTURE_ENVIRONMENT_INVALID", "Capture base URL is invalid."); }
  if (parsed.protocol !== "https:") throw new PromoCaptureReadinessError("PROMO_CAPTURE_ENVIRONMENT_INSECURE", "Production capture requires an HTTPS base URL.");
  if (parsed.username || parsed.password) throw new PromoCaptureReadinessError("PROMO_CAPTURE_ENVIRONMENT_CREDENTIALS", "Capture base URLs cannot contain credentials.");
  const host = parsed.hostname.toLowerCase();
  const privateIpv4 = /^(?:127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/;
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1" || host === "0.0.0.0" || privateIpv4.test(host)) {
    throw new PromoCaptureReadinessError("PROMO_CAPTURE_ENVIRONMENT_PRIVATE", "Production capture cannot target a local or private-network host.");
  }
  parsed.hash = "";
  parsed.search = "";
  parsed.pathname = parsed.pathname.replace(/\/$/, "");
  return parsed.toString().replace(/\/$/, "");
}

export function buildPromoCaptureJobInput(manifestValue: unknown, sourceValue: unknown, scenarioIdValue: unknown) {
  if (!record(manifestValue) || !record(manifestValue.promo) || !record(manifestValue.evidence)
    || !record(manifestValue.script) || !record(manifestValue.captures) || !Array.isArray(manifestValue.captures.scenarios)
    || !record(sourceValue)) {
    throw new PromoCaptureReadinessError("PROMO_CAPTURE_MANIFEST_INVALID", "Capture manifest or branch source is invalid.");
  }
  if (manifestValue.script.status !== "approved") throw new PromoCaptureReadinessError("PROMO_CAPTURE_SCRIPT_NOT_APPROVED", "Approve the script before capture can be queued.");
  if (!record(manifestValue.evidence.repository) || !SHA.test(String(manifestValue.evidence.repository.commit_sha || ""))) {
    throw new PromoCaptureReadinessError("PROMO_CAPTURE_EVIDENCE_REQUIRED", "Pinned repository evidence is required before capture can be queued.");
  }
  const baseUrl = captureBaseUrl(sourceValue.capture_base_url);
  if (captureBaseUrl(manifestValue.evidence.capture_environment) !== baseUrl) throw new PromoCaptureReadinessError("PROMO_CAPTURE_ENVIRONMENT_MISMATCH", "Manifest capture environment does not match the active branch source.");
  if (!configured(sourceValue.capture_fixture_key)) throw new PromoCaptureReadinessError("PROMO_CAPTURE_FIXTURE_REQUIRED", "A server-side capture fixture key is required before capture can be queued.");
  const scenarioId = typeof scenarioIdValue === "string" ? scenarioIdValue : "";
  const scenario = manifestValue.captures.scenarios.find((item: any) => item?.id === scenarioId);
  if (!record(scenario)) throw new PromoCaptureReadinessError("PROMO_CAPTURE_SCENARIO_UNKNOWN", "Capture scenario does not belong to the active manifest.");
  if (!["draft", "failed", "stale"].includes(scenario.status)) throw new PromoCaptureReadinessError("PROMO_CAPTURE_SCENARIO_NOT_QUEUEABLE", "Only draft, failed, or stale capture scenarios can be queued.");
  if (scenario.commit_sha !== manifestValue.evidence.repository.commit_sha) throw new PromoCaptureReadinessError("PROMO_CAPTURE_COMMIT_MISMATCH", "Capture scenario commit does not match pinned repository evidence.");
  if (scenario.repository_ref !== sourceValue.default_ref) throw new PromoCaptureReadinessError("PROMO_CAPTURE_REF_MISMATCH", "Capture scenario ref does not match the active branch source.");
  if (captureBaseUrl(scenario.environment) !== baseUrl) throw new PromoCaptureReadinessError("PROMO_CAPTURE_ENVIRONMENT_MISMATCH", "Capture scenario environment does not match the active branch source.");
  if (scenario.fixture !== sourceValue.capture_fixture_key) throw new PromoCaptureReadinessError("PROMO_CAPTURE_FIXTURE_MISMATCH", "Capture scenario fixture does not match the active branch source.");
  if ((scenario.auth_profile_key || null) !== (sourceValue.capture_auth_profile_key || null)) throw new PromoCaptureReadinessError("PROMO_CAPTURE_AUTH_PROFILE_MISMATCH", "Capture scenario auth profile does not match the active branch source.");
  if (!Array.isArray(scenario.assertions) || !scenario.assertions.length) throw new PromoCaptureReadinessError("PROMO_CAPTURE_ASSERTIONS_REQUIRED", "At least one capture assertion is required.");
  if (scenario.contains_pii !== false) throw new PromoCaptureReadinessError("PROMO_CAPTURE_PII_UNSAFE", "Capture scenarios must declare that fixture output contains no PII.");
  const routes = Array.isArray(manifestValue.evidence.routes) ? manifestValue.evidence.routes : [];
  if (!routes.some((route: any) => route?.path === scenario.route)) throw new PromoCaptureReadinessError("PROMO_CAPTURE_ROUTE_UNVERIFIED", "Capture route is not present in verified repository evidence.");
  if (!configured(sourceValue.id) || !configured(scenario.key) || !Number.isInteger(scenario.version) || scenario.version < 1) {
    throw new PromoCaptureReadinessError("PROMO_CAPTURE_IDENTITY_INVALID", "Capture source and scenario identity are required.");
  }
  return {
    schema_version: "1.0.0",
    scenario_id: scenario.id,
    scenario_key: scenario.key,
    scenario_version: scenario.version,
    branch_source_id: sourceValue.id,
    expected_commit_sha: scenario.commit_sha,
  };
}

function captureScenarioRow(value: unknown): value is PromoCaptureScenarioRow {
  return record(value) && typeof value.id === "string" && typeof value.scenario_key === "string"
    && typeof value.scenario_version === "number" && typeof value.repository_ref === "string"
    && typeof value.commit_sha === "string" && typeof value.route === "string"
    && typeof value.status === "string" && record(value.definition) && typeof value.definition.id === "string";
}

function captureRunResult(value: unknown): value is PromoCaptureRunResult {
  return record(value) && ["id", "job_id", "project_id", "revision_id", "scenario_id", "status", "video_asset_id", "trace_asset_id"]
    .every(key => typeof value[key] === "string")
    && Array.isArray(value.still_asset_ids) && value.still_asset_ids.every((id: unknown) => typeof id === "string")
    && record(value.evidence) && Array.isArray(value.evidence.assertions)
    && value.evidence.assertions.every((assertion: unknown) => record(assertion) && assertion.passed === true)
    && Array.isArray(value.evidence.masks_applied);
}

function captureAssetRow(value: unknown): value is PromoCaptureAssetRow {
  return record(value) && ["id", "project_id", "revision_id", "kind", "role", "status", "storage_bucket", "storage_path", "mime_type", "checksum_sha256"]
    .every(key => typeof value[key] === "string") && typeof value.file_size_bytes === "number"
    && (value.duration_seconds == null || typeof value.duration_seconds === "number")
    && (value.width == null || typeof value.width === "number") && (value.height == null || typeof value.height === "number");
}

export function applyPromoCaptureAdoption(
  manifestValue: unknown,
  scenarioRowValue: unknown,
  runValue: unknown,
  assetRowsValue: unknown,
) {
  if (!record(manifestValue) || !record(manifestValue.promo) || !record(manifestValue.captures)
    || !Array.isArray(manifestValue.captures.scenarios) || !Array.isArray(manifestValue.assets)
    || !Array.isArray(manifestValue.scenes) || !record(scenarioRowValue) || !record(runValue)
    || !Array.isArray(assetRowsValue)) {
    throw new PromoCaptureReadinessError("PROMO_CAPTURE_ADOPTION_INVALID", "Capture adoption context is invalid.");
  }
  if (!captureScenarioRow(scenarioRowValue)) {
    throw new PromoCaptureReadinessError("PROMO_CAPTURE_ADOPTION_INVALID", "Capture scenario context is invalid.");
  }
  if (!captureRunResult(runValue)) {
    throw new PromoCaptureReadinessError("PROMO_CAPTURE_ADOPTION_RUN_INVALID", "Capture run is not a succeeded current-revision result.");
  }
  const scenarioRow = scenarioRowValue;
  const run = runValue;
  const scenario = manifestValue.captures.scenarios.find((item: any) => item?.id === scenarioRow.definition?.id);
  if (!record(scenario) || !["draft", "failed", "stale"].includes(scenario.status)
    || scenario.key !== scenarioRow.scenario_key || scenario.version !== scenarioRow.scenario_version
    || scenario.commit_sha !== scenarioRow.commit_sha || scenario.route !== scenarioRow.route
    || scenario.repository_ref !== scenarioRow.repository_ref || scenarioRow.status !== "verified") {
    throw new PromoCaptureReadinessError("PROMO_CAPTURE_ADOPTION_SCENARIO_STALE", "Verified capture does not match the active manifest scenario.");
  }
  if (run.status !== "succeeded" || run.project_id !== manifestValue.promo.id
    || run.revision_id !== manifestValue.promo.revision_id || run.scenario_id !== scenarioRow.id
    || !UUID.test(String(run.id || "")) || !UUID.test(String(run.job_id || ""))
    || !UUID.test(String(run.video_asset_id || ""))
    || !UUID.test(String(run.trace_asset_id || "")) || !Array.isArray(run.still_asset_ids)
    || !run.still_asset_ids.length || run.still_asset_ids.some((id: unknown) => !UUID.test(String(id || "")))
    || !record(run.evidence)) {
    throw new PromoCaptureReadinessError("PROMO_CAPTURE_ADOPTION_RUN_INVALID", "Capture run is not a succeeded current-revision result.");
  }
  const evidence = run.evidence;
  if (evidence.schema_version !== "1.0.0" || evidence.scenario_id !== scenario.id
    || evidence.scenario_key !== scenario.key || evidence.scenario_version !== scenario.version
    || evidence.commit_sha !== scenario.commit_sha || evidence.route !== scenario.route
    || evidence.contains_pii !== false || !Array.isArray(evidence.assertions)
    || !Array.isArray(evidence.masks_applied)
    || JSON.stringify(evidence.masks_applied) !== JSON.stringify(scenario.masks)
    || scenario.assertions.some((expected: any) => !evidence.assertions.some((actual: any) =>
      actual?.kind === expected?.kind && JSON.stringify(actual?.value) === JSON.stringify(expected?.value)
      && actual?.passed === true))) {
    throw new PromoCaptureReadinessError("PROMO_CAPTURE_ADOPTION_EVIDENCE_INVALID", "Capture run evidence does not satisfy the active scenario.");
  }
  const artifactIds = [run.video_asset_id, ...run.still_asset_ids, run.trace_asset_id];
  if (new Set(artifactIds).size !== artifactIds.length) {
    throw new PromoCaptureReadinessError("PROMO_CAPTURE_ADOPTION_ASSET_INVALID", "Capture artifacts must be distinct.");
  }
  const rows = new Map(assetRowsValue.filter(captureAssetRow).map(asset => [asset.id, asset]));
  if (rows.size !== artifactIds.length) {
    throw new PromoCaptureReadinessError("PROMO_CAPTURE_ADOPTION_ASSET_INVALID", "Every capture artifact must be loaded exactly once.");
  }
  const expectedKinds = new Map<string, string>([
    [run.video_asset_id, "capture_video"], [run.trace_asset_id, "capture_trace"],
    ...run.still_asset_ids.map((id: string) => [id, "capture_still"] as [string, string]),
  ]);
  for (const assetId of artifactIds) {
    const asset = rows.get(assetId);
    if (!asset || asset.project_id !== manifestValue.promo.id || asset.revision_id !== manifestValue.promo.revision_id
      || asset.status !== "ready" || asset.kind !== expectedKinds.get(assetId)
      || asset.storage_bucket !== "promo-assets" || !configured(asset.storage_path)
      || !SHA256.test(String(asset.checksum_sha256 || "")) || !Number.isSafeInteger(asset.file_size_bytes)
      || asset.file_size_bytes < 1) {
      throw new PromoCaptureReadinessError("PROMO_CAPTURE_ADOPTION_ASSET_INVALID", "Capture artifact provenance or readiness is invalid.");
    }
  }
  const manifest = structuredClone(manifestValue);
  const adoptedScenario = manifest.captures.scenarios.find((item: any) => item?.id === scenario.id);
  adoptedScenario.status = "verified";
  adoptedScenario.assertions = scenario.assertions.map((assertion: any) => ({
    kind: assertion.kind, value: assertion.value, passed: true,
  }));
  adoptedScenario.artifact_asset_ids = artifactIds;
  const existingAssetIds = new Set(manifest.assets.map((asset: any) => asset?.id));
  for (const assetId of artifactIds) {
    if (existingAssetIds.has(assetId)) {
      throw new PromoCaptureReadinessError("PROMO_CAPTURE_ADOPTION_ALREADY_APPLIED", "Capture artifact is already present in the active manifest.");
    }
    const asset = rows.get(assetId)!;
    manifest.assets.push({
      id: asset.id, kind: asset.kind, role: asset.role,
      storage_bucket: asset.storage_bucket, storage_path: asset.storage_path,
      mime_type: asset.mime_type, checksum_sha256: asset.checksum_sha256,
      duration_seconds: asset.duration_seconds == null ? null : Number(asset.duration_seconds),
      width: asset.width == null ? null : asset.width, height: asset.height == null ? null : asset.height,
      provenance: {
        source_kind: "real_ui_capture", source_ref: `${scenario.key}@${scenario.commit_sha}:${run.id}`,
        generated: false, approved: false,
      },
    });
  }
  for (const scene of manifest.scenes) {
    if (scene?.visual?.kind === "real_ui_capture" && scene.visual.capture_scenario_id === scenario.id) {
      scene.visual.asset_id = run.video_asset_id;
    }
  }
  manifest.run_lineage.job_ids = [...new Set([
    ...(Array.isArray(manifest.run_lineage?.job_ids) ? manifest.run_lineage.job_ids : []),
    run.job_id,
  ])];
  manifest.run_lineage.output_checksums = [...new Set([
    ...(Array.isArray(manifest.run_lineage?.output_checksums) ? manifest.run_lineage.output_checksums : []),
    ...artifactIds.map(id => rows.get(id)?.checksum_sha256).filter(Boolean),
  ])];
  return manifest;
}
