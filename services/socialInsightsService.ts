import { supabase } from '../lib/supabase';

// ─── Social Insights Service ────────────────────────────────────────
// Reads `social_post_insights` — a TIME SERIES table (one row per fetch,
// never an upsert). Two independent n8n sync jobs write here on a
// schedule: `S2-instagram-insights-sync.json` for Instagram media, and a
// Facebook Page-insights sync for Facebook posts. Each row carries a
// `platform` column so callers can tell which shape applies:
//   - Instagram rows populate the flat impressions/reach/likes/comments/
//     saves/shares columns.
//   - Facebook Page posts have no `saves` metric (that column is always
//     NULL) and carry their real numbers in `raw` (post_impressions,
//     post_impressions_unique, post_engaged_users, post_clicks,
//     post_reactions_by_type_total) — the flat columns don't mean
//     anything for a Facebook Page post.
// This service reads both latest-per-post badges and complete append-only
// history; it never writes — writing is the n8n workflows' job.
// ────────────────────────────────────────────────────────────────────

export type SocialInsightPlatform = 'instagram' | 'facebook';

export interface FacebookRawInsights {
  post_impressions?: number | null;
  post_impressions_unique?: number | null;
  post_engaged_users?: number | null;
  post_clicks?: number | null;
  post_reactions_by_type_total?: number | Record<string, number> | null;
  [key: string]: unknown;
}

export interface PostInsightSnapshot {
  id: string;
  scheduled_post_id: string;
  platform: SocialInsightPlatform;
  impressions: number;
  reach: number;
  likes: number;
  comments: number;
  saves: number | null; // null on Facebook rows — Page posts have no saves metric
  shares: number;
  raw: FacebookRawInsights | Record<string, unknown> | null;
  fetched_at: string;
}

function normalizeInsight(row: any): PostInsightSnapshot {
  return {
    id: String(row.id || `${row.scheduled_post_id}_${row.fetched_at}`),
    scheduled_post_id: String(row.scheduled_post_id || ''),
    platform: (row.platform as SocialInsightPlatform) ?? 'instagram',
    impressions: row.impressions ?? 0,
    reach: row.reach ?? 0,
    likes: row.likes ?? 0,
    comments: row.comments ?? 0,
    saves: row.saves ?? null,
    shares: row.shares ?? 0,
    raw: parseJsonbField<Record<string, unknown> | null>(row.raw, null),
    fetched_at: row.fetched_at,
  };
}

/**
 * Reads the complete append-only insight history for Scheduler publications.
 * Queries are chunked by post identity and paged so PostgREST row limits do not
 * silently truncate long-running experiments.
 */
export async function fetchInsightHistory(scheduledPostIds: string[]): Promise<PostInsightSnapshot[]> {
  const ids = Array.from(new Set(scheduledPostIds.filter(Boolean)));
  if (ids.length === 0) return [];

  const snapshots: PostInsightSnapshot[] = [];
  const idChunkSize = 50;
  const pageSize = 1000;
  for (let offset = 0; offset < ids.length; offset += idChunkSize) {
    const chunk = ids.slice(offset, offset + idChunkSize);
    for (let page = 0; ; page += 1) {
      const from = page * pageSize;
      const { data, error } = await supabase
        .from('social_post_insights')
        .select('id, scheduled_post_id, platform, impressions, reach, likes, comments, saves, shares, raw, fetched_at')
        .in('scheduled_post_id', chunk)
        .order('fetched_at', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throw new Error(`Could not load social insight history: ${error.message}`);
      const rows = (data as any[]) || [];
      snapshots.push(...rows.map(normalizeInsight));
      if (rows.length < pageSize) break;
    }
  }

  return snapshots.sort((a, b) => b.fetched_at.localeCompare(a.fetched_at));
}

// n8n's Supabase node (and, defensively, any other writer) can stringify a
// JSONB column instead of leaving it native — normalize on read the same
// way services/scheduledPostService.ts and pages/PostPerformance.tsx do.
function parseJsonbField<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value as T;
  try {
    const parsed = JSON.parse(value);
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
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

  try {
    const history = await fetchInsightHistory(scheduledPostIds);
    for (const snapshot of history) {
      const postId = snapshot.scheduled_post_id;
      if (!postId || result.has(postId)) continue; // first occurrence = newest, thanks to the order() above
      result.set(postId, snapshot);
    }
  } catch {
    return new Map();
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════
// Platform-aware display metrics — never fabricates: a missing number
// stays null so the UI can render "—" instead of a fake zero. Instagram
// rows read the flat columns; Facebook rows read `raw`, since the flat
// columns don't correspond to real Facebook metrics.
// ═══════════════════════════════════════════════════════════════

export type DisplayInsightMetrics =
  | { platform: 'instagram'; impressions: number; reach: number; saves: number | null; shares: number }
  | {
      platform: 'facebook';
      impressions: number | null;
      reachUnique: number | null;
      engagedUsers: number | null;
      clicks: number | null;
      reactions: number | null;
    };

/** Picks the right numbers for a snapshot's platform — never mixes the two shapes. */
export function getDisplayInsights(snapshot: PostInsightSnapshot): DisplayInsightMetrics {
  if (snapshot.platform === 'facebook') {
    const raw = (snapshot.raw ?? {}) as FacebookRawInsights;
    const reactionsRaw = raw.post_reactions_by_type_total;
    const reactions =
      typeof reactionsRaw === 'number'
        ? reactionsRaw
        : reactionsRaw && typeof reactionsRaw === 'object'
          ? Object.values(reactionsRaw).reduce((sum: number, v) => sum + (Number(v) || 0), 0)
          : null;
    return {
      platform: 'facebook',
      impressions: raw.post_impressions ?? null,
      reachUnique: raw.post_impressions_unique ?? null,
      engagedUsers: raw.post_engaged_users ?? null,
      clicks: raw.post_clicks ?? null,
      reactions,
    };
  }
  return {
    platform: 'instagram',
    impressions: snapshot.impressions,
    reach: snapshot.reach,
    saves: snapshot.saves,
    shares: snapshot.shares,
  };
}

// ═══════════════════════════════════════════════════════════════
// Derived metrics — pure helpers, divide-by-zero-safe (null, not NaN/Infinity),
// same convention as ctr()/cpc()/cpm() in services/adPerformanceService.ts.
// Instagram-only: Facebook Page posts have no saves metric to rate.
// ═══════════════════════════════════════════════════════════════

/** (likes + comments + saves + shares) / impressions, as a percentage. */
export function engagementRate(snapshot: PostInsightSnapshot): number | null {
  if (!snapshot.impressions || snapshot.saves === null) return null;
  const engagements = snapshot.likes + snapshot.comments + snapshot.saves + snapshot.shares;
  return (engagements / Math.max(snapshot.impressions, 1)) * 100;
}

/** saves / impressions, as a percentage. */
export function saveRate(snapshot: PostInsightSnapshot): number | null {
  if (!snapshot.impressions || snapshot.saves === null) return null;
  return (snapshot.saves / Math.max(snapshot.impressions, 1)) * 100;
}

/** shares / impressions, as a percentage. */
export function shareRate(snapshot: PostInsightSnapshot): number | null {
  if (!snapshot.impressions) return null;
  return (snapshot.shares / Math.max(snapshot.impressions, 1)) * 100;
}
