import { supabase as hubClient } from '../lib/supabase';
import { predictGenderSync, loadNameCache } from '../demographicsService';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface BranchSnapshot {
  id?: string;
  branch_id: string;
  branch_name: string;
  branch_url?: string;
  total_profiles: number;
  gender_breakdown: Record<string, number>;
  age_breakdown: Record<string, number>;
  total_orders: number;
  total_revenue: number;
  avg_order_value: number;
  top_products: { name: string; count: number }[];
  active_subscribers: number;
  churn_risk_high: number;
  snapshot_source: 'manual' | 'on_connect' | 'scheduled';
  created_at?: string;
}

// ---------------------------------------------------------------------------
// generateSnapshot
// ---------------------------------------------------------------------------
// Spoke aggregates (counts, name/total/product samples) are computed
// SERVER-SIDE by the spoke-query Edge Function `snapshot` op, so the spoke key
// never reaches the browser. We finish demographic prediction, revenue scaling,
// and top-product counting client-side.
export async function generateSnapshot(
  connectionId: string,
  source: 'manual' | 'on_connect' = 'on_connect',
): Promise<BranchSnapshot> {
  const { data, error } = await hubClient.functions.invoke('spoke-query', {
    body: { op: 'snapshot', connection_id: connectionId },
  });
  if (error) throw new Error(error.message || 'Snapshot fetch failed');
  if (data?.error) throw new Error(data.error);

  const totalProfiles: number = data.total_profiles || 0;
  const activeSubscribers: number = data.active_subscribers || 0;
  const firstNames: string[] = data.first_names || [];
  const totalOrders: number = data.total_orders || 0;
  const orderTotals: number[] = data.order_totals || [];
  const productNames: string[] = data.product_names || [];

  // ---- Gender breakdown from sampled first names (scaled to total) ---------
  const genderBreakdown: Record<string, number> = { male: 0, female: 0, unknown: 0 };
  if (firstNames.length > 0) {
    await loadNameCache();
    for (const name of firstNames) {
      const prediction = predictGenderSync(name);
      genderBreakdown[prediction.gender] = (genderBreakdown[prediction.gender] || 0) + 1;
    }
    if (totalProfiles > firstNames.length) {
      const scale = totalProfiles / firstNames.length;
      for (const key of Object.keys(genderBreakdown)) {
        genderBreakdown[key] = Math.round(genderBreakdown[key] * scale);
      }
    }
  }

  // ---- Revenue from sampled order totals (scaled to total orders) ----------
  let totalRevenue = 0;
  let avgOrderValue = 0;
  if (orderTotals.length > 0) {
    const sampleRevenue = orderTotals.reduce((sum, v) => sum + (v || 0), 0);
    totalRevenue = totalOrders > orderTotals.length
      ? sampleRevenue * (totalOrders / orderTotals.length)
      : sampleRevenue;
    avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  }

  // ---- Top products from sampled product names -----------------------------
  const productCounts: Record<string, number> = {};
  for (const name of productNames) {
    const n = name || 'Unknown';
    productCounts[n] = (productCounts[n] || 0) + 1;
  }
  const topProducts = Object.entries(productCounts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    branch_id: connectionId,
    branch_name: data.name || connectionId,
    branch_url: data.supabase_url,
    total_profiles: totalProfiles,
    gender_breakdown: genderBreakdown,
    age_breakdown: { unknown: totalProfiles },
    total_orders: totalOrders,
    total_revenue: Math.round(totalRevenue * 100) / 100,
    avg_order_value: Math.round(avgOrderValue * 100) / 100,
    top_products: topProducts,
    active_subscribers: activeSubscribers,
    churn_risk_high: 0,
    snapshot_source: source,
  };
}

// ---------------------------------------------------------------------------
// saveSnapshot
// ---------------------------------------------------------------------------
export async function saveSnapshot(snapshot: BranchSnapshot): Promise<boolean> {
  if (!hubClient) {
    console.error('[branchSnapshot] No hub client available — cannot save snapshot');
    return false;
  }

  try {
    const { error } = await hubClient
      .from('branch_snapshots')
      .insert({
        branch_id: snapshot.branch_id,
        branch_name: snapshot.branch_name,
        branch_url: snapshot.branch_url,
        total_profiles: snapshot.total_profiles,
        gender_breakdown: snapshot.gender_breakdown,
        age_breakdown: snapshot.age_breakdown,
        total_orders: snapshot.total_orders,
        total_revenue: snapshot.total_revenue,
        avg_order_value: snapshot.avg_order_value,
        top_products: snapshot.top_products,
        active_subscribers: snapshot.active_subscribers,
        churn_risk_high: snapshot.churn_risk_high,
        snapshot_source: snapshot.snapshot_source,
        created_at: new Date().toISOString(),
      });

    if (error) {
      console.error('[branchSnapshot] Failed to save snapshot:', error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[branchSnapshot] Unexpected error saving snapshot:', err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// getLatestSnapshots — most recent snapshot per branch
// ---------------------------------------------------------------------------
export async function getLatestSnapshots(): Promise<BranchSnapshot[]> {
  if (!hubClient) {
    console.error('[branchSnapshot] No hub client available');
    return [];
  }

  try {
    // Supabase JS doesn't support DISTINCT ON directly.
    // Fetch recent snapshots ordered by branch + date, then dedupe client-side.
    const { data, error } = await hubClient
      .from('branch_snapshots')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      console.error('[branchSnapshot] Failed to fetch latest snapshots:', error.message);
      return [];
    }

    // Keep only the first (most recent) per branch_id
    const seen = new Set<string>();
    const latest: BranchSnapshot[] = [];
    for (const row of data || []) {
      if (!seen.has(row.branch_id)) {
        seen.add(row.branch_id);
        latest.push(row as BranchSnapshot);
      }
    }
    return latest;
  } catch (err) {
    console.error('[branchSnapshot] Unexpected error fetching snapshots:', err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// getSnapshotHistory — historical snapshots for a single branch
// ---------------------------------------------------------------------------
export async function getSnapshotHistory(
  branchId: string,
  limit: number = 30,
): Promise<BranchSnapshot[]> {
  if (!hubClient) {
    console.error('[branchSnapshot] No hub client available');
    return [];
  }

  try {
    const { data, error } = await hubClient
      .from('branch_snapshots')
      .select('*')
      .eq('branch_id', branchId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[branchSnapshot] Failed to fetch snapshot history:', error.message);
      return [];
    }

    return (data || []) as BranchSnapshot[];
  } catch (err) {
    console.error('[branchSnapshot] Unexpected error fetching history:', err);
    return [];
  }
}
