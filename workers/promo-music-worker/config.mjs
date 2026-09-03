const record = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

export function resolveLyriaProfile({ profileId, profileMapJson }) {
  let map;
  try { map = JSON.parse(profileMapJson || '{}'); } catch { throw new Error('PROMO_LYRIA_PROFILE_MAP_JSON must be valid JSON.'); }
  const profile = record(map) ? map[profileId] : null;
  if (!record(profile) || typeof profile.model !== 'string' || !/^lyria-[a-z0-9.-]{1,100}$/i.test(profile.model)
    || !Number.isFinite(Number(profile.estimated_cost_usd)) || Number(profile.estimated_cost_usd) < 0) {
    throw new Error(`No approved Lyria configuration exists for music profile ${profileId}.`);
  }
  return Object.freeze({ model: profile.model, estimated_cost_usd: Number(profile.estimated_cost_usd) });
}
