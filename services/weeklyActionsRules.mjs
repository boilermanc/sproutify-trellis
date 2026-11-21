export function selectWeeklyActions(candidates, states, budgetMinutes = 120, now = new Date()) {
  const chosen = [];
  let used = 0;
  for (const candidate of candidates) {
    const state = states[candidate.key];
    const sourceUnchanged = state?.sourceUpdatedAt === candidate.sourceUpdatedAt;
    if (sourceUnchanged && (state?.status === 'completed' || state?.status === 'dismissed')) continue;
    if (state?.status === 'deferred' && state.deferredUntil && Date.parse(state.deferredUntil) > now.getTime()) continue;
    if (used + candidate.effortMinutes > budgetMinutes) continue;
    chosen.push(candidate);
    used += candidate.effortMinutes;
    if (chosen.length === 3) break;
  }
  return chosen;
}
