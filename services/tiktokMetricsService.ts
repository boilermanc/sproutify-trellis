import { supabase } from '../lib/supabase';
export interface TikTokMetricPost {
  id: string; branch_id: string; video_id: string; share_url: string | null; caption: string;
  published_at: string | null; views: number | null; likes: number | null;
  comments: number | null; shares: number | null; last_synced_at: string | null; last_error: string | null;
}
export interface TikTokMetricsResult {
  posts: TikTokMetricPost[]; ready: boolean; permission_error: string | null; limit: number;
}
export async function tiktokMetrics<T>(action: 'list' | 'sync' | 'track', branchId: string, videoUrl?: string): Promise<T> {
  const { data, error } = await supabase.functions.invoke('tiktok-metrics', { body: { action, branch_id: branchId, video_url: videoUrl } });
  if (error) {
    let message = error.message;
    try { message = (await error.context?.clone().json())?.error || message; } catch { /* retain transport error */ }
    throw new Error(message || 'TikTok metrics request failed.');
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}
