import { supabase } from '../lib/supabase';

export interface MetaPlatformStats {
  name?: string | null;
  username?: string | null;
  fans?: number | null;
  followers?: number | null;
  posts?: number | null;
  reach_28d?: number;
  error?: string;
}

export interface MetaInsights {
  connected: boolean;
  branch_id?: string;
  facebook?: MetaPlatformStats;
  instagram?: MetaPlatformStats;
  fetched_at?: string;
  error?: string;
}

/**
 * Fetch live Facebook + Instagram audience stats for a branch via the
 * meta-insights Edge Function. Returns { connected: false } when the brand
 * has no stored Meta credentials or the function isn't deployed yet.
 */
export async function fetchBrandInsights(branchId: string): Promise<MetaInsights> {
  try {
    const { data, error } = await supabase.functions.invoke('meta-insights', {
      body: { branch_id: branchId },
    });
    if (error) return { connected: false, error: error.message };
    return (data as MetaInsights) ?? { connected: false };
  } catch (e) {
    return { connected: false, error: e instanceof Error ? e.message : 'Failed to fetch insights' };
  }
}

// ═══════════════════════════════════════════════════════════════
// Historical follower/reach trend — read from `brand_daily_metrics`,
// the one-row-per-brand/platform/day table filled by the S4 "Daily
// Brand Metrics" n8n job. Meta only ever reports "right now", so this
// table is the ONLY source of a follower trend. Empty until that job
// has run for a couple of days — callers render a "collecting" state
// rather than a fake flat line.
// ═══════════════════════════════════════════════════════════════

export interface BrandDailyMetric {
  branch_id: string;
  captured_on: string; // YYYY-MM-DD
  platform: SocialPlatform;
  followers: number | null;
  posts: number | null;
  reach_28d: number | null;
}

export type SocialPlatform = 'facebook' | 'instagram';

/**
 * Returns daily follower/reach snapshots for the last `days` days, oldest
 * first. Never throws — a load failure (RLS, missing table) yields an empty
 * array so the panel shows its "collecting data" state instead of an error.
 */
export async function getBrandDailyMetrics(days = 30): Promise<BrandDailyMetric[]> {
  try {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().slice(0, 10);

    const { data, error } = await supabase
      .from('brand_daily_metrics')
      .select('branch_id, captured_on, platform, followers, posts, reach_28d')
      .gte('captured_on', sinceStr)
      .order('captured_on', { ascending: true });

    if (error) throw error;
    return (data as BrandDailyMetric[]) ?? [];
  } catch {
    return [];
  }
}
