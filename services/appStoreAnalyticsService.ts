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

export async function syncAppStoreAnalytics(): Promise<void> {
  const { data, error } = await supabase.functions.invoke('app-store-analytics', { body: { op: 'sync' } });
  if (error) throw new Error(await errorMessage(error, 'App Store analytics sync failed'));
  if (data?.error) throw new Error(data.error);
}
