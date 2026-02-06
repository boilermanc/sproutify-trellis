import { createClient, SupabaseClient } from '@supabase/supabase-js';
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

interface ConnectionInput {
  id: string;
  name: string;
  supabase_url: string;
  supabase_key: string;
  tables: { customers?: string; orders?: string; legacy_orders?: string };
}

// ---------------------------------------------------------------------------
// generateSnapshot
// ---------------------------------------------------------------------------
export async function generateSnapshot(
  connection: ConnectionInput,
  source: 'manual' | 'on_connect' = 'on_connect',
): Promise<BranchSnapshot> {
  const spoke = createClient(connection.supabase_url, connection.supabase_key);

  // ---- Customers / Profiles ------------------------------------------------
  let totalProfiles = 0;
  let activeSubscribers = 0;
  const genderBreakdown: Record<string, number> = { male: 0, female: 0, unknown: 0 };

  if (connection.tables.customers) {
    const table = connection.tables.customers;

    // Total count
    const { count } = await spoke
      .from(table)
      .select('*', { count: 'exact', head: true });
    totalProfiles = count ?? 0;

    // First names for gender prediction (limit 500)
    const { data: nameRows } = await spoke
      .from(table)
      .select('first_name')
      .limit(500);

    if (nameRows && nameRows.length > 0) {
      await loadNameCache();
      for (const row of nameRows) {
        const prediction = predictGenderSync(row.first_name);
        genderBreakdown[prediction.gender] =
          (genderBreakdown[prediction.gender] || 0) + 1;
      }
      // Scale up if we sampled
      if (totalProfiles > nameRows.length) {
        const scale = totalProfiles / nameRows.length;
        for (const key of Object.keys(genderBreakdown)) {
          genderBreakdown[key] = Math.round(genderBreakdown[key] * scale);
        }
      }
    }

    // Active subscribers — try is_subscribed first, fall back to newsletter_opt_in
    const { count: subCount } = await spoke
      .from(table)
      .select('*', { count: 'exact', head: true })
      .eq('is_subscribed', true);

    if (subCount !== null && subCount > 0) {
      activeSubscribers = subCount;
    } else {
      const { count: optInCount } = await spoke
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq('newsletter_opt_in', true);
      activeSubscribers = optInCount ?? 0;
    }
  }

  // ---- Orders ---------------------------------------------------------------
  let totalOrders = 0;
  let totalRevenue = 0;
  let avgOrderValue = 0;
  let topProducts: { name: string; count: number }[] = [];

  const orderTable = connection.tables.orders || connection.tables.legacy_orders;
  if (orderTable) {
    try {
      // Aggregate counts
      const { count: orderCount } = await spoke
        .from(orderTable)
        .select('*', { count: 'exact', head: true });
      totalOrders = orderCount ?? 0;

      // Revenue: fetch totals (limit 5000 rows for reasonable performance)
      const { data: orderRows } = await spoke
        .from(orderTable)
        .select('total')
        .limit(5000);

      if (orderRows && orderRows.length > 0) {
        const sampleRevenue = orderRows.reduce(
          (sum: number, r: any) => sum + (parseFloat(r.total) || 0),
          0,
        );
        // Scale if we only sampled
        if (totalOrders > orderRows.length) {
          const scale = totalOrders / orderRows.length;
          totalRevenue = sampleRevenue * scale;
        } else {
          totalRevenue = sampleRevenue;
        }
        avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
      }

      // Top products — try to group from order_items or line_items
      // If no separate items table, skip
      topProducts = await fetchTopProducts(spoke, connection.tables);
    } catch (err) {
      console.error(`[branchSnapshot] Order fetch error for ${connection.name}:`, err);
    }
  }

  // ---- Build snapshot -------------------------------------------------------
  const snapshot: BranchSnapshot = {
    branch_id: connection.id,
    branch_name: connection.name,
    branch_url: connection.supabase_url,
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

  return snapshot;
}

// ---------------------------------------------------------------------------
// Top products helper
// ---------------------------------------------------------------------------
async function fetchTopProducts(
  spoke: SupabaseClient,
  tables: ConnectionInput['tables'],
): Promise<{ name: string; count: number }[]> {
  // Try common item table names
  const candidates = ['order_items', 'line_items'];
  for (const candidate of candidates) {
    try {
      const { data, error } = await spoke
        .from(candidate)
        .select('product_name')
        .limit(2000);

      if (error || !data || data.length === 0) continue;

      const counts: Record<string, number> = {};
      for (const row of data) {
        const name = (row as any).product_name || 'Unknown';
        counts[name] = (counts[name] || 0) + 1;
      }
      return Object.entries(counts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
    } catch {
      // table doesn't exist, try next
    }
  }
  return [];
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
