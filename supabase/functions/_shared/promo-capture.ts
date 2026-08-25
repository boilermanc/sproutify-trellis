const SHA = /^[a-f0-9]{40}$/i;

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
