export const EVENT_MAP = Object.freeze({
  user_signed_up: 'product_signup',
  account_created: 'product_signup',
  onboarding_completed: 'product_onboarding_completed',
  activation_milestone_reached: 'product_activated',
  meaningful_return: 'product_returned',
});

const SENSITIVE_KEYS = /(journal|prayer|mood|emotion|faith|belief|message|content|text|note|url|path|email|name|phone|address|token|secret)/i;

export function canonicalEventType(eventName) {
  return EVENT_MAP[eventName] || 'product_feature_milestone';
}

function scalarCategory(value) {
  if (value === null) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return undefined;
  const clean = value.trim();
  if (!clean || clean.length > 100 || clean.includes('\n') || /https?:\/\//i.test(clean) || clean.includes('@')) return undefined;
  return clean;
}

export function sanitizePosthogProperties(properties, allowed) {
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) return {};
  const output = {};
  for (const key of allowed) {
    if (SENSITIVE_KEYS.test(key)) continue;
    const value = scalarCategory(properties[key]);
    if (value !== undefined) output[key] = value;
  }
  return output;
}

export function normalizePosthogEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 320 ? email : null;
}

export function qualifyPosthogEventId(projectId, eventUuid) {
  const clean = String(eventUuid || '').trim();
  if (!/^[A-Za-z0-9:_-]{8,200}$/.test(clean)) return null;
  return `${projectId}:${clean}`;
}
