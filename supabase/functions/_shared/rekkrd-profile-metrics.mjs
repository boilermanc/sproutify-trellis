export const REKKRD_PROJECT_HOST = 'cvqqiuhloefvaaacwxkg.supabase.co';

export function isRekkrdConnection(url) {
  try { return new URL(url).hostname === REKKRD_PROJECT_HOST; } catch { return false; }
}

// Return only owner counts, never collection titles, photos or notes.
export function countCollectionRecords(rows) {
  const counts = new Map();
  for (const row of rows) {
    if (typeof row.user_id !== 'string' || !row.user_id) continue;
    counts.set(row.user_id, (counts.get(row.user_id) || 0) + 1);
  }
  return Array.from(counts, ([customer_id, record_count]) => ({ customer_id, record_count }));
}
