const atlDay = new Intl.DateTimeFormat('en-CA', {timeZone:'America/New_York', year:'numeric', month:'2-digit', day:'2-digit'});

export function validRequest({start, end, ids}) {
  const day = value => typeof value === 'string' && /^\d{4}-\d\d-\d\d$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().startsWith(value);
  return day(start) && day(end) && start <= end && Array.isArray(ids) && ids.length > 0
    && ids.length <= 500 && ids.every(id => typeof id === 'string' && /^\d{1,30}$/.test(id))
    && new Set(ids).size === ids.length;
}

// Input consists of eligible orders across recorded history, oldest first.
export function summarize(orders, {start,end,ids}) {
  const seen = new Set();
  const ads = Object.fromEntries(ids.map(id => [id, {orders:0, buyers:0, unknown:0}]));
  let unmatched = 0;
  for (const order of orders) {
    const identity = (order.customers?.email?.trim() || order.guest_email?.trim() || '').toLowerCase();
    const first = identity && !seen.has(identity);
    if (identity) seen.add(identity);
    const day = atlDay.format(new Date(order.created_at));
    if (day < start || day > end) continue;
    const ad = ads[order.marketing_attribution?.ad_id];
    if (!ad || !Object.hasOwn(ads, order.marketing_attribution?.ad_id)) { unmatched++; continue; }
    ad.orders++;
    if (first) ad.buyers++;
    if (!identity) ad.unknown++;
  }
  return {ads, unmatched};
}
