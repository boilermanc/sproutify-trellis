import { fingerprintPromoInput } from '../promo-render-worker/preflight.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA = /^[a-f0-9]{40}$/;
const boundedStrings = (value, maximum = 30) => Array.isArray(value) && value.length <= maximum
  && value.every(item => typeof item === 'string' && item.trim() && item.length <= 500);
const record = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export class PromoCapturePreflightError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'PromoCapturePreflightError';
    this.code = code;
  }
}

const fail = (code, message) => { throw new PromoCapturePreflightError(code, message); };

const normalizedBaseUrl = baseUrl => {
  let base;
  try { base = new URL(baseUrl); } catch { fail('PROMO_CAPTURE_ENVIRONMENT_INVALID', 'Capture base URL is invalid.'); }
  const host = base.hostname.toLowerCase();
  const privateIpv4 = /^(?:127\.|10\.|192\.168\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.)/;
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash
    || host === 'localhost' || host.endsWith('.localhost') || host === '::1' || host === '0.0.0.0'
    || privateIpv4.test(host)) {
    fail('PROMO_CAPTURE_ENVIRONMENT_INVALID', 'Capture requires a credential-free public HTTPS base URL.');
  }
  base.pathname = base.pathname.replace(/\/$/, '');
  return base.toString().replace(/\/$/, '');
};

const publicCaptureUrl = (baseUrl, route) => {
  const normalized = normalizedBaseUrl(baseUrl);
  const base = new URL(normalized);
  if (typeof route !== 'string' || !route.startsWith('/') || route.startsWith('//') || route.length > 2000) {
    fail('PROMO_CAPTURE_ROUTE_INVALID', 'Capture route must be a bounded same-origin path.');
  }
  const target = new URL(route, `${normalized}/`);
  if (target.origin !== base.origin) fail('PROMO_CAPTURE_ROUTE_INVALID', 'Capture route escaped the configured origin.');
  return target.toString();
};

export function inspectPromoCaptureClaim({ job, worker_id, now = new Date(), project, branch_source, scenario }) {
  if (!record(job) || !UUID.test(String(job.id || '')) || !UUID.test(String(job.project_id || ''))
    || !UUID.test(String(job.revision_id || '')) || !UUID.test(String(job.lease_token || ''))
    || job.job_type !== 'capture' || job.status !== 'running' || job.worker_id !== String(worker_id || '').trim()) {
    fail('PROMO_CAPTURE_CLAIM_INVALID', 'Capture claim does not belong to this worker.');
  }
  const leaseExpiresAt = Date.parse(job.lease_expires_at);
  if (!Number.isFinite(leaseExpiresAt) || leaseExpiresAt <= now.getTime()) {
    fail('PROMO_CAPTURE_LEASE_EXPIRED', 'Capture claim lease is not active.');
  }
  if (!record(job.input) || job.input.schema_version !== '1.0.0'
    || fingerprintPromoInput(job.input) !== job.input_fingerprint) {
    fail('PROMO_CAPTURE_INPUT_FINGERPRINT_INVALID', 'Capture input does not match its server fingerprint.');
  }
  if (!record(project) || project.id !== job.project_id || project.current_revision_id !== job.revision_id
    || !UUID.test(String(project.branch_id || ''))) {
    fail('PROMO_CAPTURE_REVISION_STALE', 'Capture no longer targets the active project revision.');
  }
  if (!record(branch_source) || branch_source.id !== job.input.branch_source_id
    || branch_source.branch_id !== project.branch_id || branch_source.is_active !== true
    || branch_source.default_ref !== scenario?.repository_ref
    || typeof branch_source.capture_fixture_key !== 'string' || !branch_source.capture_fixture_key.trim()
    || (branch_source.capture_auth_profile_key || null) !== (scenario?.auth_profile_key || null)) {
    fail('PROMO_CAPTURE_SOURCE_STALE', 'Active branch capture configuration changed after queueing.');
  }
  const definition = scenario?.definition;
  if (!record(scenario) || !UUID.test(String(scenario.id || '')) || scenario.project_id !== job.project_id
    || scenario.revision_id !== job.revision_id || scenario.scenario_key !== job.input.scenario_key
    || scenario.scenario_version !== job.input.scenario_version || scenario.commit_sha !== job.input.expected_commit_sha
    || !SHA.test(String(scenario.commit_sha || '')) || !record(definition)
    || definition.id !== job.input.scenario_id || definition.key !== scenario.scenario_key
    || definition.version !== scenario.scenario_version || definition.commit_sha !== scenario.commit_sha
    || definition.repository_ref !== scenario.repository_ref || definition.route !== scenario.route
    || definition.fixture !== branch_source.capture_fixture_key
    || (definition.auth_profile_key || null) !== (branch_source.capture_auth_profile_key || null)
    || !['draft', 'failed', 'stale'].includes(scenario.status)
    || definition.contains_pii !== false || !record(definition.viewport)
    || !Number.isInteger(definition.viewport.width) || !Number.isInteger(definition.viewport.height)
    || definition.viewport.width < 320 || definition.viewport.width > 4096
    || definition.viewport.height < 320 || definition.viewport.height > 4096
    || !boundedStrings(definition.selectors) || !boundedStrings(definition.masks)
    || !Array.isArray(definition.assertions) || definition.assertions.length < 1 || definition.assertions.length > 30
    || definition.assertions.some(item => !record(item) || typeof item.kind !== 'string' || !item.kind.trim()
      || item.kind.length > 100 || !Object.hasOwn(item, 'value') || JSON.stringify(item.value).length > 500)) {
    fail('PROMO_CAPTURE_SCENARIO_INVALID', 'Capture scenario is not a bounded server-resolved declaration.');
  }
  const capture_url = publicCaptureUrl(branch_source.capture_base_url, scenario.route);
  if (normalizedBaseUrl(definition.environment) !== normalizedBaseUrl(branch_source.capture_base_url)
    || normalizedBaseUrl(scenario.environment) !== normalizedBaseUrl(branch_source.capture_base_url)) {
    fail('PROMO_CAPTURE_ENVIRONMENT_STALE', 'Scenario environment changed after queueing.');
  }
  return Object.freeze({
    job_id: job.id, project_id: job.project_id, revision_id: job.revision_id,
    scenario_row_id: scenario.id, scenario_id: definition.id, scenario_key: scenario.scenario_key,
    scenario_version: scenario.scenario_version, repository_ref: scenario.repository_ref,
    commit_sha: scenario.commit_sha, route: scenario.route, capture_url,
    fixture_key: branch_source.capture_fixture_key,
    auth_profile_key: branch_source.capture_auth_profile_key || null,
    viewport: Object.freeze({ ...definition.viewport }),
    selectors: Object.freeze([...definition.selectors]), masks: Object.freeze([...definition.masks]),
    assertions: Object.freeze(definition.assertions.map(item => Object.freeze({ kind: item.kind, value: item.value }))),
    input_fingerprint: job.input_fingerprint,
  });
}
