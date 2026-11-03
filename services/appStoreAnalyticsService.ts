import { supabase } from '../lib/supabase';
import { AppStoreAnalyticsResult } from '../types';

async function errorMessage(error: unknown, fallback: string): Promise<string> {
  const context = (error as any)?.context;
  if (context instanceof Response) {
    try {
      const payload = await context.clone().json();
      if (payload?.error) return String(payload.error);
    } catch { /* use transport message */ }
  }
  return (error as any)?.message || fallback;
}

export async function fetchAppStoreAnalytics(
  windowDays: 7 | 30 | 90 = 30,
  branchIds: string[] = [],
): Promise<AppStoreAnalyticsResult> {
  const { data, error } = await supabase.functions.invoke('app-store-analytics', {
    body: { op: 'status', window_days: windowDays, branch_ids: branchIds },
  });
  if (error) throw new Error(await errorMessage(error, 'App Store analytics request failed'));
  if (data?.error) throw new Error(data.error);
  return data as AppStoreAnalyticsResult;
}

export async function syncAppStoreAnalytics(appId: string): Promise<void> {
  if (!appId.trim()) throw new Error('Choose a connected app before syncing');
  const { data, error } = await supabase.functions.invoke('app-store-analytics', { body: { op: 'sync', app_id: appId } });
  if (error) throw new Error(await errorMessage(error, 'App Store analytics sync failed'));
  if (data?.error) throw new Error(data.error);
  if (!Array.isArray(data?.results) || !data.results.length) throw new Error('No supported app was available to sync');
  const failed = data?.results?.find((result: { ok: boolean }) => !result.ok);
  if (failed) throw new Error(failed.error || 'App download sync failed');
}
