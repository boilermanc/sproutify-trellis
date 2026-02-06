import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { SpokeConnection, EnrichedProfile, BranchStatsResult, SpokeStats } from '../types';
import { fetchEnrichedProfiles } from '../spokeConnector';

export function useBranchStats(spokeConnections: SpokeConnection[]): BranchStatsResult {
  const [enrichedProfiles, setEnrichedProfiles] = useState<EnrichedProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);

  const connectionsRef = useRef(spokeConnections);
  connectionsRef.current = spokeConnections;

  const fetchData = useCallback(async () => {
    const connections = connectionsRef.current;
    const active = connections.filter(c => c.status === 'active');
    if (active.length === 0) {
      setEnrichedProfiles([]);
      setErrors([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const { profiles, errors: fetchErrors } = await fetchEnrichedProfiles(connections);
      setEnrichedProfiles(profiles);
      setErrors(fetchErrors);
      setLastFetchedAt(new Date().toISOString());
    } catch (err) {
      setEnrichedProfiles([]);
      setErrors([err instanceof Error ? err.message : 'Failed to fetch federated data']);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [spokeConnections, fetchData]);

  const { spokeStats, spokeStatsList, totals } = useMemo(() => {
    const statsMap: Record<string, SpokeStats> = {};
    const now = Date.now();
    const ninetyDays = 90 * 24 * 60 * 60 * 1000;

    // Initialize from connection metadata
    for (const conn of spokeConnections) {
      statsMap[conn.id] = {
        spokeId: conn.id,
        spokeName: conn.name,
        supabaseUrl: conn.supabase_url,
        connectionStatus: conn.status,
        lastTestedAt: conn.last_tested_at,
        lastError: conn.last_error,
        profileCount: 0,
        subscribedCount: 0,
        unsubscribedCount: 0,
        totalRevenue: 0,
        totalOrders: 0,
        avgOrderValue: 0,
        avgLTV: 0,
        repeatBuyerCount: 0,
        oneTimeBuyerCount: 0,
        profilesWithOrders: 0,
        profilesWithoutOrders: 0,
        vipCount: 0,
        activeIn90Days: 0,
        dormantCount: 0,
        genderDistribution: { male: 0, female: 0, unknown: 0 },
        ageDistribution: {},
        topProducts: [],
      };
    }

    // Product tracking per spoke
    const spokeProducts: Record<string, Map<string, { revenue: number; quantity: number; buyers: Set<string> }>> = {};

    // Single pass over all profiles
    for (const profile of enrichedProfiles) {
      const sid = profile._spoke_id;
      if (!statsMap[sid]) continue;
      const s = statsMap[sid];

      s.profileCount++;

      if (profile.subscribed === true) s.subscribedCount++;
      else if (profile.subscribed === false) s.unsubscribedCount++;

      const os = profile.order_stats;
      if (os && os.order_count > 0) {
        s.profilesWithOrders++;
        s.totalRevenue += os.ltv;
        s.totalOrders += os.order_count;
        if (os.ltv >= 50) s.vipCount++;
        if (os.order_count > 1) s.repeatBuyerCount++;
        else s.oneTimeBuyerCount++;

        if (os.last_purchase_at && (now - new Date(os.last_purchase_at).getTime()) < ninetyDays) {
          s.activeIn90Days++;
        } else {
          s.dormantCount++;
        }

        if (os.products_purchased) {
          if (!spokeProducts[sid]) spokeProducts[sid] = new Map();
          for (const prod of os.products_purchased) {
            const existing = spokeProducts[sid].get(prod.product_name) || { revenue: 0, quantity: 0, buyers: new Set<string>() };
            existing.revenue += prod.total_spent;
            existing.quantity += prod.total_quantity;
            existing.buyers.add(profile.email);
            spokeProducts[sid].set(prod.product_name, existing);
          }
        }
      } else {
        s.profilesWithoutOrders++;
      }

      const gender = profile._predicted_demographics?.gender?.gender || 'unknown';
      if (gender === 'male' || gender === 'female') {
        s.genderDistribution[gender]++;
      } else {
        s.genderDistribution.unknown++;
      }
      const ageRange = profile._predicted_demographics?.age?.age_range || 'unknown';
      s.ageDistribution[ageRange] = (s.ageDistribution[ageRange] || 0) + 1;
    }

    // Finalize per-spoke computed fields
    for (const sid of Object.keys(statsMap)) {
      const s = statsMap[sid];
      s.avgOrderValue = s.totalOrders > 0 ? s.totalRevenue / s.totalOrders : 0;
      s.avgLTV = s.profilesWithOrders > 0 ? s.totalRevenue / s.profilesWithOrders : 0;

      if (spokeProducts[sid]) {
        s.topProducts = Array.from(spokeProducts[sid].entries())
          .map(([name, data]) => ({ name, revenue: data.revenue, quantity: data.quantity, buyers: data.buyers.size }))
          .sort((a, b) => b.revenue - a.revenue)
          .slice(0, 5);
      }
    }

    // Global totals
    const list = Object.values(statsMap).sort((a, b) => b.profileCount - a.profileCount);
    const totalProfilesWithOrders = list.reduce((s, x) => s + x.profilesWithOrders, 0);
    const totalRevenue = list.reduce((s, x) => s + x.totalRevenue, 0);
    const totalOrders = list.reduce((s, x) => s + x.totalOrders, 0);

    const t = {
      profiles: enrichedProfiles.length,
      revenue: totalRevenue,
      orders: totalOrders,
      avgOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
      avgLTV: totalProfilesWithOrders > 0 ? totalRevenue / totalProfilesWithOrders : 0,
      subscribedCount: list.reduce((s, x) => s + x.subscribedCount, 0),
      unsubscribedCount: list.reduce((s, x) => s + x.unsubscribedCount, 0),
      vipCount: list.reduce((s, x) => s + x.vipCount, 0),
      repeatBuyers: list.reduce((s, x) => s + x.repeatBuyerCount, 0),
      activeIn90Days: list.reduce((s, x) => s + x.activeIn90Days, 0),
      profilesWithOrders: totalProfilesWithOrders,
    };

    return { spokeStats: statsMap, spokeStatsList: list, totals: t };
  }, [enrichedProfiles, spokeConnections]);

  return {
    enrichedProfiles,
    spokeStats,
    spokeStatsList,
    totals,
    isLoading,
    errors,
    lastFetchedAt,
    refresh: fetchData,
  };
}
