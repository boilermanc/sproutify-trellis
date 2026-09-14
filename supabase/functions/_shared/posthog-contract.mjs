export const EVENT_MAP = Object.freeze({
  user_signed_up: 'product_signup',
  account_created: 'product_signup',
  signup_completed: 'product_signup',
  onboarding_completed: 'product_onboarding_completed',
  activation_milestone_reached: 'product_activated',
  first_record_added: 'product_activated',
  meaningful_return: 'product_returned',
});

export const DEFAULT_POSTHOG_EVENTS = [
  'user_signed_up', 'account_created', 'onboarding_completed',
  'activation_milestone_reached', 'core_feature_milestone', 'meaningful_return',
];
export const DEFAULT_POSTHOG_PROPERTIES = [
  'platform', 'feature', 'milestone', 'app_version', 'return_interval_bucket',
];

export function getPosthogBranchDefaults(branchSlug) {
  if (branchSlug === 'rekkrd') {
    return {
      allowed_events: [
        'signup_completed', 'first_record_added', 'discogs_connected',
        'discogs_import_completed', 'collection_value_viewed', 'third_spin_logged',
      ],
      allowed_properties: ['platform', 'surface', 'placement', 'value'],
    };
  }
  return {
    allowed_events: [...DEFAULT_POSTHOG_EVENTS],
    allowed_properties: [...DEFAULT_POSTHOG_PROPERTIES],
  };
}

// Queries and webhook ingestion must agree on which events represent a lifecycle step.
export function posthogEventsForType(eventType) {
  return Object.keys(EVENT_MAP).filter(event => EVENT_MAP[event] === eventType);
}

export function posthogLifecycleForBranch(branchSlug) {
  // Preserve the deployed Rejoice install/identity proxy until it emits lifecycle events.
  const rejoice = branchSlug === 'rejoice';
  return {
    signup_events: rejoice ? ['Application Installed'] : posthogEventsForType('product_signup'),
    onboarding_events: rejoice ? ['$identify'] : posthogEventsForType('product_onboarding_completed'),
    activation_events: posthogEventsForType('product_activated'),
    labels: {
      signed_up: rejoice ? 'Installed' : 'Signed up',
      onboarded: rejoice ? 'Identified' : 'Onboarded',
      activated: 'Activated',
    },
    conversion_labels: {
      signup_to_onboarding: rejoice ? 'Install → identified' : 'Signup → onboarding',
      onboarding_to_activation: rejoice ? 'Identified → activated' : 'Onboarding → activation',
    },
  };
}

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
