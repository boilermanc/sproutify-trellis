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
