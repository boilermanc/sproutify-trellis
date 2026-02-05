import React, { useState, useEffect, useMemo } from 'react';
import {
  Users, TrendingUp, DollarSign, ShoppingBag, MapPin, Package,
  Crown, Clock, Repeat, UserPlus, UserX, AlertTriangle,
  ChevronRight, ArrowUp, ArrowDown, BarChart3, PieChart
} from 'lucide-react';
import { EnrichedProfile } from './types';
import { SpokeConnection } from './types';
import { fetchEnrichedProfiles } from './spokeConnector';
import { PRESET_SEGMENTS } from './segmentTypes';
import { countProfilesInSegment, filterProfilesBySegment } from './segmentEngine';
import { Segment } from './segmentTypes';
import {
  loadNameCache,
  getGenderDistribution,
  getAgeDistribution,
  getNameCacheStats,
  getGenderDistributionWithOrigins,
} from './demographicsService';

interface CustomerIntelligenceProps {
  spokeConnections: SpokeConnection[];
}

export const CustomerIntelligence: React.FC<CustomerIntelligenceProps> = ({ spokeConnections }) => {
  const [profiles, setProfiles] = useState<EnrichedProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [demographicsLoaded, setDemographicsLoaded] = useState(false);

  // Fetch profiles on mount
  useEffect(() => {
    const fetchData = async () => {
      if (spokeConnections.length === 0) {
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      try {
        const { profiles: fetchedProfiles } = await fetchEnrichedProfiles(spokeConnections);
        setProfiles(fetchedProfiles);
      } catch (err) {
        console.error('Failed to fetch profiles:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [spokeConnections]);

  // Load demographics name cache
  useEffect(() => {
    const loadDemographics = async () => {
      await loadNameCache();
      setDemographicsLoaded(true);
    };
    loadDemographics();
  }, []);

  // Convert presets to segments
  const segments: Segment[] = useMemo(() =>
    PRESET_SEGMENTS.map((preset, index) => ({
      ...preset,
      id: `preset-${index}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })),
    []
  );

  // === CUSTOMER OVERVIEW STATS ===
  const overviewStats = useMemo(() => {
    const withOrders = profiles.filter(p => p.order_stats && p.order_stats.order_count > 0);
    const totalRevenue = withOrders.reduce((sum, p) => sum + (p.order_stats?.ltv || 0), 0);
    const totalOrders = withOrders.reduce((sum, p) => sum + (p.order_stats?.order_count || 0), 0);

    // Active in last 90 days
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
    const activeCustomers = withOrders.filter(p =>
      p.order_stats?.last_purchase_at && new Date(p.order_stats.last_purchase_at) >= ninetyDaysAgo
    ).length;

    // New in last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const newCustomers = profiles.filter(p =>
      p.created_at && new Date(p.created_at) >= thirtyDaysAgo
    ).length;

    return {
      totalCustomers: profiles.length,
      customersWithOrders: withOrders.length,
      activeCustomers,
      newCustomers,
      totalRevenue,
      totalOrders,
      avgLTV: withOrders.length > 0 ? totalRevenue / withOrders.length : 0,
      avgOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
    };
  }, [profiles]);

  // === SEGMENT BREAKDOWN ===
  const segmentBreakdown = useMemo(() => {
    return segments.map(segment => ({
      ...segment,
      count: countProfilesInSegment(profiles, segment),
      percentage: profiles.length > 0
        ? Math.round((countProfilesInSegment(profiles, segment) / profiles.length) * 100)
        : 0,
    }));
  }, [profiles, segments]);

  // === GEOGRAPHIC DISTRIBUTION ===
  const geoDistribution = useMemo(() => {
    const stateCount = new Map<string, number>();
    const cityCount = new Map<string, { count: number; state: string }>();

    profiles.forEach(p => {
      const state = p.shipping_address?.state;
      const city = p.shipping_address?.city;

      if (state) {
        stateCount.set(state, (stateCount.get(state) || 0) + 1);
      }
      if (city && state) {
        const key = `${city}, ${state}`;
        const existing = cityCount.get(key) || { count: 0, state };
        cityCount.set(key, { count: existing.count + 1, state });
      }
    });

    const topStates = Array.from(stateCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([state, count]) => ({ state, count, percentage: Math.round((count / profiles.length) * 100) }));

    const topCities = Array.from(cityCount.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([city, data]) => ({ city, count: data.count }));

    const withLocation = profiles.filter(p => p.shipping_address?.state).length;

    return { topStates, topCities, withLocation, withoutLocation: profiles.length - withLocation };
  }, [profiles]);

  // === PURCHASE BEHAVIOR ===
  const purchaseBehavior = useMemo(() => {
    const withOrders = profiles.filter(p => p.order_stats && p.order_stats.order_count > 0);

    // Order frequency buckets
    const frequencyBuckets = {
      '1 order': 0,
      '2-3 orders': 0,
      '4-5 orders': 0,
      '6-10 orders': 0,
      '11+ orders': 0,
    };

    withOrders.forEach(p => {
      const count = p.order_stats?.order_count || 0;
      if (count === 1) frequencyBuckets['1 order']++;
      else if (count <= 3) frequencyBuckets['2-3 orders']++;
      else if (count <= 5) frequencyBuckets['4-5 orders']++;
      else if (count <= 10) frequencyBuckets['6-10 orders']++;
      else frequencyBuckets['11+ orders']++;
    });

    // LTV tiers
    const ltvTiers = {
      '$0-$50': 0,
      '$51-$100': 0,
      '$101-$250': 0,
      '$251-$500': 0,
      '$500+': 0,
    };

    withOrders.forEach(p => {
      const ltv = p.order_stats?.ltv || 0;
      if (ltv <= 50) ltvTiers['$0-$50']++;
      else if (ltv <= 100) ltvTiers['$51-$100']++;
      else if (ltv <= 250) ltvTiers['$101-$250']++;
      else if (ltv <= 500) ltvTiers['$251-$500']++;
      else ltvTiers['$500+']++;
    });

    return { frequencyBuckets, ltvTiers };
  }, [profiles]);

  // === TOP PRODUCTS ===
  const topProducts = useMemo(() => {
    const productStats = new Map<string, { customers: Set<string>; revenue: number; quantity: number }>();

    profiles.forEach(p => {
      p.order_stats?.products_purchased?.forEach(product => {
        const existing = productStats.get(product.product_name) || {
          customers: new Set(),
          revenue: 0,
          quantity: 0
        };
        existing.customers.add(p.email);
        existing.revenue += product.total_spent;
        existing.quantity += product.total_quantity;
        productStats.set(product.product_name, existing);
      });
    });

    return Array.from(productStats.entries())
      .map(([name, stats]) => ({
        name,
        customers: stats.customers.size,
        revenue: stats.revenue,
        quantity: stats.quantity,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10);
  }, [profiles]);

  // === CUSTOMER LIFECYCLE ===
  const lifecycle = useMemo(() => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const oneEightyDaysAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

    const withOrders = profiles.filter(p => p.order_stats && p.order_stats.order_count > 0);

    let activeRecent = 0;  // Purchased in last 30 days
    let activeRegular = 0; // Purchased 31-90 days ago
    let atRisk = 0;        // Purchased 91-180 days ago
    let lapsed = 0;        // No purchase in 180+ days

    withOrders.forEach(p => {
      const lastPurchase = p.order_stats?.last_purchase_at ? new Date(p.order_stats.last_purchase_at) : null;
      if (!lastPurchase) return;

      if (lastPurchase >= thirtyDaysAgo) activeRecent++;
      else if (lastPurchase >= ninetyDaysAgo) activeRegular++;
      else if (lastPurchase >= oneEightyDaysAgo) atRisk++;
      else lapsed++;
    });

    return {
      activeRecent,
      activeRegular,
      atRisk,
      lapsed,
      neverPurchased: profiles.length - withOrders.length,
    };
  }, [profiles]);

  // === DEMOGRAPHICS ===
  const demographics = useMemo(() => {
    if (!demographicsLoaded || profiles.length === 0) {
      return {
        gender: { male: 0, female: 0, unknown: 0, byOrigin: {} },
        age: {
          '18-24': 0, '25-34': 0, '35-44': 0, '45-54': 0, '55-64': 0, '65+': 0, 'unknown': 0,
        },
        cacheStats: { loaded: false, count: 0, byOrigin: {}, byGender: {} },
      };
    }

    const genderDist = getGenderDistributionWithOrigins(profiles);
    const ageDist = getAgeDistribution(profiles);
    const cacheStats = getNameCacheStats();

    return {
      gender: genderDist,
      age: ageDist,
      cacheStats,
    };
  }, [profiles, demographicsLoaded]);

  // Color helper for bars
  const getBarColor = (index: number) => {
    const colors = ['bg-emerald-500', 'bg-blue-500', 'bg-amber-500', 'bg-purple-500', 'bg-pink-500', 'bg-teal-500', 'bg-orange-500', 'bg-indigo-500'];
    return colors[index % colors.length];
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Loading customer intelligence...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Customer Intelligence</h1>
          <p className="text-gray-500 mt-1">Deep insights into your customer base</p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold text-gray-900">{profiles.length}</p>
          <p className="text-sm text-gray-500">Total Profiles</p>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-100 rounded-xl">
              <DollarSign className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                ${overviewStats.totalRevenue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </p>
              <p className="text-xs text-gray-500">Total Revenue</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-xl">
              <TrendingUp className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                ${overviewStats.avgLTV.toFixed(0)}
              </p>
              <p className="text-xs text-gray-500">Avg Customer LTV</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-xl">
              <ShoppingBag className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                ${overviewStats.avgOrderValue.toFixed(0)}
              </p>
              <p className="text-xs text-gray-500">Avg Order Value</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-100 rounded-xl">
              <Users className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">
                {overviewStats.activeCustomers}
              </p>
              <p className="text-xs text-gray-500">Active (90 days)</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Customer Lifecycle */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-gray-400" />
            Customer Lifecycle
          </h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                <span className="text-sm text-gray-600">Active (last 30 days)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full"
                    style={{ width: `${profiles.length > 0 ? (lifecycle.activeRecent / profiles.length) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-sm font-semibold text-gray-900 w-8">{lifecycle.activeRecent}</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                <span className="text-sm text-gray-600">Regular (31-90 days)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded-full"
                    style={{ width: `${profiles.length > 0 ? (lifecycle.activeRegular / profiles.length) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-sm font-semibold text-gray-900 w-8">{lifecycle.activeRegular}</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-amber-500" />
                <span className="text-sm text-gray-600">At Risk (91-180 days)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full"
                    style={{ width: `${profiles.length > 0 ? (lifecycle.atRisk / profiles.length) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-sm font-semibold text-gray-900 w-8">{lifecycle.atRisk}</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span className="text-sm text-gray-600">Lapsed (180+ days)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-red-500 rounded-full"
                    style={{ width: `${profiles.length > 0 ? (lifecycle.lapsed / profiles.length) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-sm font-semibold text-gray-900 w-8">{lifecycle.lapsed}</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-gray-300" />
                <span className="text-sm text-gray-600">Never Purchased</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gray-300 rounded-full"
                    style={{ width: `${profiles.length > 0 ? (lifecycle.neverPurchased / profiles.length) * 100 : 0}%` }}
                  />
                </div>
                <span className="text-sm font-semibold text-gray-900 w-8">{lifecycle.neverPurchased}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Segment Distribution */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <PieChart className="w-5 h-5 text-gray-400" />
            Segment Distribution
          </h2>
          <div className="space-y-3">
            {segmentBreakdown.slice(0, 6).map((segment, idx) => (
              <div key={segment.id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${getBarColor(idx)}`} />
                  <span className="text-sm text-gray-600">{segment.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${getBarColor(idx)}`}
                      style={{ width: `${segment.percentage}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-gray-900 w-12 text-right">
                    {segment.count}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Demographics - Gender */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Users className="w-5 h-5 text-gray-400" />
            Predicted Gender
            <span className="text-xs font-normal text-gray-400 ml-auto">
              {demographics.cacheStats.count} names in database
            </span>
          </h2>

          {!demographicsLoaded ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Gender bars */}
              <div className="space-y-3 mb-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-blue-500" />
                    <span className="text-sm text-gray-600">Male</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-32 h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all"
                        style={{ width: `${profiles.length > 0 ? (demographics.gender.male / profiles.length) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-gray-900 w-12 text-right">
                      {demographics.gender.male}
                    </span>
                    <span className="text-xs text-gray-400 w-10">
                      {profiles.length > 0 ? Math.round((demographics.gender.male / profiles.length) * 100) : 0}%
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-pink-500" />
                    <span className="text-sm text-gray-600">Female</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-32 h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-pink-500 rounded-full transition-all"
                        style={{ width: `${profiles.length > 0 ? (demographics.gender.female / profiles.length) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-gray-900 w-12 text-right">
                      {demographics.gender.female}
                    </span>
                    <span className="text-xs text-gray-400 w-10">
                      {profiles.length > 0 ? Math.round((demographics.gender.female / profiles.length) * 100) : 0}%
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-gray-300" />
                    <span className="text-sm text-gray-600">Unknown</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-32 h-3 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gray-300 rounded-full transition-all"
                        style={{ width: `${profiles.length > 0 ? (demographics.gender.unknown / profiles.length) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-gray-900 w-12 text-right">
                      {demographics.gender.unknown}
                    </span>
                    <span className="text-xs text-gray-400 w-10">
                      {profiles.length > 0 ? Math.round((demographics.gender.unknown / profiles.length) * 100) : 0}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Top name origins */}
              {Object.keys(demographics.gender.byOrigin).length > 0 && (
                <div className="pt-4 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 uppercase mb-2">By Name Origin</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(demographics.gender.byOrigin)
                      .filter(([origin]) => origin !== 'unknown')
                      .sort((a, b) => (b[1].male + b[1].female) - (a[1].male + a[1].female))
                      .slice(0, 5)
                      .map(([origin, counts]) => (
                        <span
                          key={origin}
                          className="px-2 py-1 bg-gray-100 rounded-full text-xs text-gray-600 capitalize"
                        >
                          {origin}: {counts.male + counts.female}
                        </span>
                      ))
                    }
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Demographics - Age */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-gray-400" />
            Predicted Age Range
            <span className="text-xs font-normal text-gray-400 ml-auto">
              Based on behavior
            </span>
          </h2>

          <div className="space-y-3">
            {(['18-24', '25-34', '35-44', '45-54', '55-64', '65+'] as const).map((range, idx) => {
              const count = demographics.age[range];
              const colors = ['bg-emerald-400', 'bg-emerald-500', 'bg-emerald-600', 'bg-teal-500', 'bg-teal-600', 'bg-teal-700'];

              return (
                <div key={range} className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 w-16">{range}</span>
                  <div className="flex-1 mx-4">
                    <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${colors[idx]} rounded-full transition-all`}
                        style={{ width: `${profiles.length > 0 ? Math.max((count / profiles.length) * 100, count > 0 ? 3 : 0) : 0}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900 w-8 text-right">{count}</span>
                    <span className="text-xs text-gray-400 w-10">
                      {profiles.length > 0 ? Math.round((count / profiles.length) * 100) : 0}%
                    </span>
                  </div>
                </div>
              );
            })}

            {demographics.age.unknown > 0 && (
              <div className="flex items-center justify-between pt-2 border-t border-gray-100 mt-2">
                <span className="text-sm text-gray-400 w-16">Unknown</span>
                <div className="flex-1 mx-4">
                  <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gray-300 rounded-full transition-all"
                      style={{ width: `${profiles.length > 0 ? Math.max((demographics.age.unknown / profiles.length) * 100, 3) : 0}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-500 w-8 text-right">{demographics.age.unknown}</span>
                  <span className="text-xs text-gray-400 w-10">
                    {profiles.length > 0 ? Math.round((demographics.age.unknown / profiles.length) * 100) : 0}%
                  </span>
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-xs text-gray-400">
              Age predictions are estimates based on purchase behavior, order frequency, and customer tenure.
            </p>
          </div>
        </div>

        {/* Geographic Distribution */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-gray-400" />
            Top Locations
          </h2>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-3">By State</p>
              <div className="space-y-2">
                {geoDistribution.topStates.slice(0, 5).map((item, idx) => (
                  <div key={item.state} className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">{item.state}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${getBarColor(idx)}`}
                          style={{ width: `${item.percentage}%` }}
                        />
                      </div>
                      <span className="text-sm font-semibold text-gray-700 w-6 text-right">{item.count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-3">By City</p>
              <div className="space-y-2">
                {geoDistribution.topCities.slice(0, 5).map((item, idx) => (
                  <div key={item.city} className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 truncate flex-1">{item.city}</span>
                    <span className="text-sm font-semibold text-gray-700 ml-2">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100 flex justify-between text-sm">
            <span className="text-gray-500">
              <span className="font-semibold text-gray-700">{geoDistribution.withLocation}</span> with location data
            </span>
            <span className="text-gray-500">
              <span className="font-semibold text-gray-700">{geoDistribution.withoutLocation}</span> without
            </span>
          </div>
        </div>

        {/* LTV Distribution */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-gray-400" />
            LTV Distribution
          </h2>
          <div className="space-y-3">
            {Object.entries(purchaseBehavior.ltvTiers).map(([tier, count], idx) => (
              <div key={tier} className="flex items-center justify-between">
                <span className="text-sm text-gray-600 w-20">{tier}</span>
                <div className="flex-1 mx-4">
                  <div className="h-6 bg-gray-100 rounded-lg overflow-hidden">
                    <div
                      className={`h-full ${getBarColor(idx)} flex items-center justify-end pr-2`}
                      style={{
                        width: `${overviewStats.customersWithOrders > 0 ? Math.max((count / overviewStats.customersWithOrders) * 100, count > 0 ? 5 : 0) : 0}%`
                      }}
                    >
                      {count > 0 && (
                        <span className="text-xs font-semibold text-white">{count}</span>
                      )}
                    </div>
                  </div>
                </div>
                <span className="text-sm text-gray-500 w-12 text-right">
                  {overviewStats.customersWithOrders > 0 ? Math.round((count / overviewStats.customersWithOrders) * 100) : 0}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Top Products */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 lg:col-span-2">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Package className="w-5 h-5 text-gray-400" />
            Top Products by Revenue
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  <th className="pb-3">Product</th>
                  <th className="pb-3 text-right">Revenue</th>
                  <th className="pb-3 text-right">Customers</th>
                  <th className="pb-3 text-right">Qty Sold</th>
                  <th className="pb-3 text-right">Avg/Customer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {topProducts.map((product, idx) => (
                  <tr key={product.name} className="hover:bg-gray-50">
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-400 w-4">{idx + 1}</span>
                        <span className="font-medium text-gray-900">{product.name}</span>
                      </div>
                    </td>
                    <td className="py-3 text-right font-semibold text-emerald-600">
                      ${product.revenue.toFixed(2)}
                    </td>
                    <td className="py-3 text-right text-gray-600">
                      {product.customers}
                    </td>
                    <td className="py-3 text-right text-gray-600">
                      {product.quantity}
                    </td>
                    <td className="py-3 text-right text-gray-600">
                      ${(product.revenue / product.customers).toFixed(2)}
                    </td>
                  </tr>
                ))}
                {topProducts.length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-gray-500">
                      No product data available
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Order Frequency */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100 lg:col-span-2">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Repeat className="w-5 h-5 text-gray-400" />
            Order Frequency Distribution
          </h2>
          <div className="flex items-end gap-4 h-40">
            {Object.entries(purchaseBehavior.frequencyBuckets).map(([bucket, count], idx) => {
              const maxCount = Math.max(...Object.values(purchaseBehavior.frequencyBuckets));
              const height = maxCount > 0 ? (count / maxCount) * 100 : 0;

              return (
                <div key={bucket} className="flex-1 flex flex-col items-center">
                  <span className="text-sm font-semibold text-gray-700 mb-2">{count}</span>
                  <div className="w-full bg-gray-100 rounded-t-lg relative" style={{ height: '120px' }}>
                    <div
                      className={`absolute bottom-0 left-0 right-0 ${getBarColor(idx)} rounded-t-lg transition-all`}
                      style={{ height: `${height}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 mt-2 text-center">{bucket}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CustomerIntelligence;
