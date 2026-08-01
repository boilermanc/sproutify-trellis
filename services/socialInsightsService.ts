import { supabase } from '../lib/supabase';

// ─── Social Insights Service ────────────────────────────────────────
// Reads `social_post_insights` — a TIME SERIES table (one row per fetch,
// never an upsert) that `S2-instagram-insights-sync.json` writes to every
// 6 hours for posts this app already published to Instagram. This service
// only ever reads the latest snapshot per post; it never writes — writing
// is the n8n workflow's job.
// ────────────────────────────────────────────────────────────────────

export interface PostInsightSnapshot {
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  saves: number;
  shares: number;
  fetched_at: string;
}

/**
 * Fetches the most recent insight snapshot for each of the given
 * `scheduled_social_posts.id` values. Supabase JS has no clean DISTINCT ON,
 * so this pulls every matching row ordered newest-first and keeps only the
 * first occurrence per post id client-side.
 *
 * Never throws — a lookup failure (network, RLS, missing table row) yields
 * an empty map so a badge that can't load never breaks the History list.
 */
export async function fetchLatestInsights(scheduledPostIds: string[]): Promise<Map<string, PostInsightSnapshot>> {
  const result = new Map<string, PostInsightSnapshot>();
  const ids = Array.from(new Set(scheduledPostIds.filter(Boolean)));
  if (ids.length === 0) return result;

  try {
    const { data, error } = await supabase
      .from('social_post_insights')
      .select('scheduled_post_id, impressions, reach, likes, comments, saves, shares, fetched_at')
      .in('scheduled_post_id', ids)
      .order('fetched_at', { ascending: false });

    if (error) throw error;

    for (const row of (data as any[]) ?? []) {
      const postId = row.scheduled_post_id;
      if (!postId || result.has(postId)) continue; // first occurrence = newest, thanks to the order() above
      result.set(postId, {
        impressions: row.impressions ?? 0,
        reach: row.reach ?? 0,
        likes: row.likes ?? 0,
        comments: row.comments ?? 0,
        saves: row.saves ?? 0,
        shares: row.shares ?? 0,
        fetched_at: row.fetched_at,
      });
    }
  } catch {
    return new Map();
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════
// Derived metrics — pure helpers, divide-by-zero-safe (null, not NaN/Infinity),
// same convention as ctr()/cpc()/cpm() in services/adPerformanceService.ts.
// ═══════════════════════════════════════════════════════════════

/** (likes + comments + saves + shares) / impressions, as a percentage. */
export function engagementRate(snapshot: PostInsightSnapshot): number | null {
  if (!snapshot.impressions) return null;
  const engagements = snapshot.likes + snapshot.comments + snapshot.saves + snapshot.shares;
  return (engagements / Math.max(snapshot.impressions, 1)) * 100;
}

/** saves / impressions, as a percentage. */
export function saveRate(snapshot: PostInsightSnapshot): number | null {
  if (!snapshot.impressions) return null;
  return (snapshot.saves / Math.max(snapshot.impressions, 1)) * 100;
}

/** shares / impressions, as a percentage. */
export function shareRate(snapshot: PostInsightSnapshot): number | null {
  if (!snapshot.impressions) return null;
  return (snapshot.shares / Math.max(snapshot.impressions, 1)) * 100;
}
