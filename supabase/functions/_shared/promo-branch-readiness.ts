import { validateGitHubEvidenceInput } from "./github-evidence.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_KEY = /^[A-Za-z][A-Za-z0-9._-]{0,79}$/;
const HEX = /^#[0-9a-f]{6}$/i;

const record = (value: unknown): value is Record<string, any> => !!value && typeof value === "object" && !Array.isArray(value);
const clean = (value: unknown, maximum: number) => typeof value === "string" ? value.trim().slice(0, maximum) : "";

function verifiedCaptureBaseUrl(value: unknown) {
  const raw = clean(value, 500);
  if (!raw) return null;
  let parsed: URL;
  try { parsed = new URL(raw); } catch { throw new Error("Capture base URL is invalid."); }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("Capture base URL must be credential-free HTTPS without query or fragment data.");
  }
  const host = parsed.hostname.toLowerCase();
  const privateIpv4 = /^(?:127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/;
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1" || host === "0.0.0.0" || privateIpv4.test(host)) {
    throw new Error("Capture base URL cannot target a local or private-network host.");
  }
  parsed.pathname = parsed.pathname.replace(/\/$/, "");
  return parsed.toString().replace(/\/$/, "");
}

export function validatePromoBranchSourceUpdate(value: unknown) {
  if (!record(value) || !UUID.test(String(value.branch_id || ""))) throw new Error("Choose an active Trellis branch.");
  const evidence = validateGitHubEvidenceInput({
    repository: clean(value.repository_full_name, 200), ref: clean(value.default_ref, 200),
    permitted_paths: Array.isArray(value.permitted_paths) ? value.permitted_paths : [],
    prohibited_paths: Array.isArray(value.prohibited_paths) ? value.prohibited_paths : [],
  });
  const captureBaseUrl = verifiedCaptureBaseUrl(value.capture_base_url);
  const captureFixtureKey = clean(value.capture_fixture_key, 80) || null;
  const captureAuthProfileKey = clean(value.capture_auth_profile_key, 80) || null;
  if (captureFixtureKey && !SAFE_KEY.test(captureFixtureKey)) throw new Error("Capture fixture key is invalid.");
  if (captureAuthProfileKey && !SAFE_KEY.test(captureAuthProfileKey)) throw new Error("Capture auth profile key is invalid.");
  if (captureBaseUrl && !captureFixtureKey) throw new Error("A capture fixture key is required with a capture base URL.");
  if (!captureBaseUrl && (captureFixtureKey || captureAuthProfileKey)) throw new Error("Capture keys require a verified capture base URL.");
  return {
    branchId: String(value.branch_id), repositoryFullName: evidence.repository, defaultRef: evidence.ref,
    permittedPaths: evidence.permitted_paths, prohibitedPaths: evidence.prohibited_paths || [],
    captureBaseUrl, captureFixtureKey, captureAuthProfileKey,
  };
}

function identityReady(identity: unknown, branchSlug: string) {
  if (!record(identity) || identity.branch_id !== branchSlug || identity.status !== "active"
    || !record(identity.color_palette) || !record(identity.typography)) return false;
  return [identity.color_palette.primary, identity.color_palette.secondary, identity.color_palette.accent, identity.color_palette.neutral]
    .every(color => HEX.test(String(color || "")))
    && !!clean(identity.typography.heading, 100) && !!clean(identity.typography.body, 100);
}

export function buildPromoBranchReadiness(input: {
  branches: unknown[]; sources: unknown[]; brandIdentities: unknown[]; socialAccounts: unknown[];
}) {
  const sources = input.sources.filter(record);
  const identities = input.brandIdentities.filter(record);
  const accounts = input.socialAccounts.filter(record);
  return input.branches.filter(record).map(branch => {
    const source = sources.find(item => item.branch_id === branch.id && item.is_active === true) || null;
    const branchIdentities = identities.filter(item => item.branch_id === branch.slug && item.status === "active");
    const repositoryReady = !!source?.repository_full_name && !!source?.default_ref
      && Array.isArray(source?.permitted_paths) && source.permitted_paths.length > 0;
    const captureReady = repositoryReady && !!source?.capture_base_url && !!source?.capture_fixture_key;
    const brandReady = branchIdentities.length === 1 && identityReady(branchIdentities[0], String(branch.slug));
    const instagramReady = accounts.some(item => item.branch_id === branch.id && item.platform === "instagram" && item.status === "active");
    const blockers = [
      !repositoryReady && "Verified repository mapping",
      !brandReady && (branchIdentities.length > 1 ? "One unambiguous active Brand Identity" : "Complete active Brand Identity"),
      !captureReady && "Production capture environment and fixture",
      !instagramReady && "Active Instagram destination",
    ].filter(Boolean) as string[];
    return {
      branch_id: branch.id, branch_slug: branch.slug, branch_name: branch.name,
      repository_ready: repositoryReady, brand_ready: brandReady, capture_ready: captureReady,
      instagram_ready: instagramReady, generation_ready: repositoryReady && brandReady,
      fully_ready: repositoryReady && brandReady && captureReady && instagramReady,
      blockers, source,
    };
  });
}
