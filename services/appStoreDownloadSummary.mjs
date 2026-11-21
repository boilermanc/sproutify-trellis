/** Summarize only the canonical Standard downloads report; absent data stays unknown. */
export function summarizeDownloads(snapshots) {
  const daily = new Map();
  const countries = new Map();
  const totals = { first: null, redownloads: null, updates: null };
  for (const snapshot of snapshots) {
    if (snapshot.report_name !== 'App Downloads Standard') continue;
    const metrics = snapshot.metrics || {};
    if (!['First-Time Downloads', 'Redownloads', 'Updates'].some(key => typeof metrics[key] === 'number' && Number.isFinite(metrics[key]) && metrics[key] >= 0)) continue;
    const day = daily.get(snapshot.metric_date) || { date: snapshot.metric_date, first: null, redownloads: null };
    for (const [field, key] of [['first', 'First-Time Downloads'], ['redownloads', 'Redownloads'], ['updates', 'Updates']]) {
      const value = metrics[key];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) continue;
      totals[field] = (totals[field] ?? 0) + value;
      if (field !== 'updates') day[field] = (day[field] ?? 0) + value;
    }
    daily.set(snapshot.metric_date, day);
    for (const [key, value] of Object.entries(metrics)) {
      const match = /^Territory:([^:]+):First-Time Downloads$/.exec(key);
      if (match && typeof value === 'number' && Number.isFinite(value) && value >= 0) countries.set(match[1], (countries.get(match[1]) || 0) + value);
    }
  }
  return { totals, daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)), countries: [...countries].sort((a, b) => b[1] - a[1]) };
}
