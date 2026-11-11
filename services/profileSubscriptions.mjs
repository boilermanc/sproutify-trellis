export function dateValue(value) {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

export function subscriptionState(subscription, now = Date.now()) {
  if (!subscription) return 'unknown';
  const status = subscriptionSourceStatus(subscription);
  if (['expired', 'canceled', 'cancelled', 'unpaid', 'incomplete_expired', 'paused'].includes(status)) return 'inactive';
  if (!['active', 'trialing', 'trial'].includes(status)) return 'unknown';
  const endDate = subscriptionEnd(subscription);
  const end = dateValue(endDate);
  if (endDate && end === null) return 'unknown';
  if (end !== null && end <= now) return 'inactive';
  const startDate = ['trialing', 'trial'].includes(status) ? subscription.trial_start || subscription.started_at : subscription.started_at;
  const start = dateValue(startDate);
  if (startDate && start === null) return 'unknown';
  if (start !== null && start > now) return 'unknown';
  return 'active';
}

export function subscriptionSourceStatus(subscription) {
  return String((subscription?.provider === 'app_store' ? subscription.iap_status : null) || subscription?.status || '').trim().toLowerCase();
}

export function subscriptionEnd(subscription) {
  if (!subscription) return undefined;
  if (subscription.provider === 'app_store') return subscription.iap_current_period_end || subscription.expires_at;
  if (['trialing', 'trial'].includes(subscriptionSourceStatus(subscription))) return subscription.trial_end || subscription.expires_at;
  if (subscriptionSourceStatus(subscription) === 'expired' && !subscription.expires_at) return subscription.trial_end;
  return subscription.expires_at;
}

export function subscriptionEndLabel(subscription, now = Date.now()) {
  const trial = ['trialing', 'trial'].includes(subscriptionSourceStatus(subscription)) ||
    (subscriptionSourceStatus(subscription) === 'expired' && subscription.provider !== 'app_store' && !subscription.expires_at && !!subscription.trial_end);
  const past = dateValue(subscriptionEnd(subscription));
  return `${trial ? 'Trial' : 'Period'} ${past !== null && past <= now ? 'ended' : 'ends'}`;
}

// Preserve all history; prefer a currently active subscription, then newest record.
export function currentSubscription(records = [], now = Date.now()) {
  return [...records].sort((a, b) => {
    const active = Number(subscriptionState(b, now) === 'active') - Number(subscriptionState(a, now) === 'active');
    return active || (dateValue(b.created_at) ?? dateValue(b.started_at) ?? 0) - (dateValue(a.created_at) ?? dateValue(a.started_at) ?? 0) || String(a.id).localeCompare(String(b.id));
  })[0];
}

export function attachProfileSubscriptions(profiles, subscriptions) {
  const byId = new Map();
  const byEmail = new Map();
  for (const sub of subscriptions) {
    for (const [map, value] of [[byId, sub.customer_id], [byEmail, sub.email?.trim().toLowerCase()]]) {
      if (!value) continue;
      const key = `${sub._spoke_id}:${value}`;
      map.set(key, [...(map.get(key) || []), sub]);
    }
  }
  return profiles.map(profile => {
    // Prefer the stable customer ID. Email is a fallback within the same spoke.
    const records = byId.get(`${profile._spoke_id}:${profile.id}`) || byEmail.get(`${profile._spoke_id}:${profile.email?.trim().toLowerCase()}`) || [];
    return { ...profile, subscription_records: records };
  });
}

export function formatProfileDate(value) {
  const time = dateValue(value);
  if (time === null) return 'Unknown';
  // A source date without a time zone is a calendar date, not midnight UTC.
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : time).toLocaleDateString();
}

export function compareProfileSubscriptions(a, b, sort, now = Date.now()) {
  if (sort === 'records') {
    const av = a.collection_record_count;
    const bv = b.collection_record_count;
    if (av === undefined) return bv === undefined ? 0 : 1;
    return bv === undefined ? -1 : bv - av;
  }
  const left = currentSubscription(a.subscription_records, now);
  const right = currentSubscription(b.subscription_records, now);
  if (sort === 'plan') return String(left?.plan || '\uffff').localeCompare(String(right?.plan || '\uffff'));
  if (sort === 'active') {
    const rank = { active: 0, inactive: 1, unknown: 2 };
    return rank[subscriptionState(left, now)] - rank[subscriptionState(right, now)];
  }
  const av = dateValue(sort === 'ending' ? subscriptionEnd(left) : a.created_at);
  const bv = dateValue(sort === 'ending' ? subscriptionEnd(right) : b.created_at);
  if (av === null) return bv === null ? 0 : 1;
  if (bv === null) return -1;
  return sort === 'signup-newest' ? bv - av : av - bv;
}
