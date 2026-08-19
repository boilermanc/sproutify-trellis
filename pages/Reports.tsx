
import React, { useState, useMemo } from 'react';
import { SpokeConnection, EnrichedProfile, BranchStatsResult, BranchContext, TrellisReport } from '../types';
import { Article } from '../src/data/helpContent';
import EmailPerformancePanel from '../components/EmailPerformancePanel';
import PostHogAnalyticsPanel from '../components/PostHogAnalyticsPanel';
import YouTubePerformancePanel from '../components/YouTubePerformancePanel';
import SocialPerformancePanel from '../components/SocialPerformancePanel';
import EventRegistrationPanel from '../components/EventRegistrationPanel';
import {
  BarChart3, Users, DollarSign, Tag, Mail, Youtube, Activity, Share2,
  ShieldCheck, AlertTriangle, Crown,
  Heart, UserX, PauseCircle, Loader2, Radio, FileText, Globe, CalendarDays
} from 'lucide-react';

type ReportsTab = 'audience' | 'social' | 'email' | 'events' | 'youtube' | 'product' | 'blueprints';
const REPORTS_TABS: { id: ReportsTab; label: string; icon: typeof Users }[] = [
  { id: 'audience', label: 'Audience', icon: Users },
  { id: 'social', label: 'Social', icon: Share2 },
  { id: 'email', label: 'Email', icon: Mail },
  { id: 'events', label: 'Events', icon: CalendarDays },
  { id: 'youtube', label: 'YouTube', icon: Youtube },
  { id: 'product', label: 'Product', icon: Activity },
  { id: 'blueprints', label: 'Blueprints', icon: FileText },
];

// ═══════════════════════════════════════════════════════════════
// STATIC DATA (outside component to avoid re-creation per render)
// ═══════════════════════════════════════════════════════════════

const REPORT_BLUEPRINTS: TrellisReport[] = [
  { id: 'rep_1', name: 'Audience Growth & Segmentation', type: 'system', metrics: ['Profile Growth Rate', 'Segment Distribution', 'Subscription Trends'], spokes: ['All Spokes'] },
  { id: 'rep_2', name: 'Revenue & LTV Distribution', type: 'system', metrics: ['Total Revenue', 'Avg LTV', 'VIP Identification', 'Purchase Frequency'], spokes: ['All Spokes'] },
  { id: 'rep_3', name: 'Campaign Performance Overview', type: 'system', metrics: ['Open Rate', 'Click Rate', 'Bounce Rate', 'Audience Reach'], spokes: ['All Spokes'] },
  { id: 'rep_4', name: 'Per-Campaign Email Breakdown', type: 'system', metrics: ['Per-Campaign Open Rate', 'Per-Campaign Click Rate', 'Delivery Volume', 'Recent Campaign Trend'], spokes: ['All Spokes'] },
  { id: 'rep_5', name: 'Product Adoption & Retention', type: 'system', metrics: ['DAU / WAU / MAU', 'Lifecycle Funnel', '7-Day Retention', '30-Day Retention', 'Feature Milestones'], spokes: ['PostHog-Connected Branches'] },
];

// Extracted outside the component to prevent unmount/remount on every render
const PercentBar = ({ value, max, color }: { value: number; max: number; color: string }) => {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

interface ReportsProps {
  spokeConnections: SpokeConnection[];
  branchStats: BranchStatsResult;
  branchContext?: BranchContext;
  onOpenArticle?: (article: Article) => void;
}

const Reports: React.FC<ReportsProps> = ({ spokeConnections, branchStats, branchContext }) => {
  const [activeTab, setActiveTab] = useState<ReportsTab>('audience');

  // Use shared branchStats data, filtered by active branch context
  const isFederating = branchStats.isLoading;
  const federationError = branchStats.errors.length > 0 ? branchStats.errors.join('; ') : null;

  // Filter enriched profiles by the global branch context picker
  const profiles = useMemo(() => {
    const all = branchStats.enrichedProfiles;
    if (!branchContext || branchContext.isAllSelected) return all;

    // Build a Set of display names for the branches whose slugs are active
    const activeNames = new Set(
      branchContext.allBranches
        .filter(b => branchContext.activeBranchSlugs.includes(b.slug))
        .map(b => b.name)
    );
    return all.filter(p => activeNames.has(p._spoke_name));
  }, [branchStats.enrichedProfiles, branchContext]);

  // ═══════════════════════════════════════════════════════════════
  // CARD 1: Audience Composition
  // ═══════════════════════════════════════════════════════════════
  const audienceData = useMemo(() => {
    const total = profiles.length;

    // Gender distribution (from predicted demographics)
    const genderCounts = { male: 0, female: 0, unknown: 0 };
    profiles.forEach(p => {
      const gender = p._predicted_demographics?.gender?.gender || 'unknown';
      if (gender === 'male') genderCounts.male++;
      else if (gender === 'female') genderCounts.female++;
      else genderCounts.unknown++;
    });

    // Spoke distribution (which databases are profiles coming from)
    const spokeCounts: Record<string, number> = {};
    profiles.forEach(p => {
      const spoke = p._spoke_name || 'Unknown';
      spokeCounts[spoke] = (spokeCounts[spoke] || 0) + 1;
    });
    const topSources = Object.entries(spokeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    return { total, genderCounts, topSources };
  }, [profiles]);

  // ═══════════════════════════════════════════════════════════════
  // CARD 2: LTV & Revenue Distribution
  // ═══════════════════════════════════════════════════════════════
  const ltvData = useMemo(() => {
    const getLtv = (p: EnrichedProfile) => p.order_stats?.ltv || 0;
    const ltvs = profiles.map(getLtv);
    const total = ltvs.reduce((sum, ltv) => sum + ltv, 0);
    const avg = profiles.length > 0 ? total / profiles.length : 0;

    // Median
    const sorted = [...ltvs].sort((a, b) => a - b);
    const median = sorted.length > 0
      ? sorted[Math.floor(sorted.length / 2)]
      : 0;

    // LTV Tiers
    const tiers = {
      zero: profiles.filter(p => getLtv(p) === 0).length,
      micro: profiles.filter(p => getLtv(p) > 0 && getLtv(p) <= 50).length,
      standard: profiles.filter(p => getLtv(p) > 50 && getLtv(p) <= 200).length,
      premium: profiles.filter(p => getLtv(p) > 200 && getLtv(p) <= 500).length,
      vip: profiles.filter(p => getLtv(p) > 500).length,
    };

    // Top 10 by LTV
    const topProfiles = [...profiles]
      .sort((a, b) => getLtv(b) - getLtv(a))
      .slice(0, 10);

    return { avg, median, tiers, topProfiles, total };
  }, [profiles]);

  // ═══════════════════════════════════════════════════════════════
  // CARD 3: Subscription & Order Health
  // ═══════════════════════════════════════════════════════════════
  const subscriptionData = useMemo(() => {
    const subscribed = profiles.filter(p => p.subscribed === true).length;
    const unsubscribed = profiles.filter(p => p.subscribed === false).length;
    const unknown = profiles.filter(p => p.subscribed == null).length;

    // Order-based activity (derived from actual federated order data)
    const withOrders = profiles.filter(p => p.order_stats && p.order_stats.order_count > 0);
    const withoutOrders = profiles.length - withOrders.length;
    const repeatBuyers = profiles.filter(p => p.order_stats && p.order_stats.order_count > 1).length;
    const oneTimeBuyers = withOrders.length - repeatBuyers;

    // Recency-based engagement (from last purchase date)
    const now = Date.now();
    const recentlyActive = withOrders.filter(p => {
      const last = p.order_stats?.last_purchase_at;
      return last && (now - new Date(last).getTime()) < 90 * 24 * 60 * 60 * 1000; // 90 days
    }).length;
    const dormant = withOrders.length - recentlyActive;

    return { subscribed, unsubscribed, unknown, withOrders: withOrders.length, withoutOrders, repeatBuyers, oneTimeBuyers, recentlyActive, dormant };
  }, [profiles]);

  // ═══════════════════════════════════════════════════════════════
  // CARD 4: Product & Spoke Intelligence
  // ═══════════════════════════════════════════════════════════════
  const productData = useMemo(() => {
    // Aggregate product purchase data across all profiles
    const productCounts: Record<string, { quantity: number; revenue: number; buyers: number }> = {};
    profiles.forEach(p => {
      (p.order_stats?.products_purchased || []).forEach(prod => {
        if (!productCounts[prod.product_name]) {
          productCounts[prod.product_name] = { quantity: 0, revenue: 0, buyers: 0 };
        }
        productCounts[prod.product_name].quantity += prod.total_quantity;
        productCounts[prod.product_name].revenue += prod.total_spent;
        productCounts[prod.product_name].buyers += 1;
      });
    });
    const topProducts = Object.entries(productCounts)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 15);

    // Spoke distribution with order stats
    const spokeStats: Record<string, { profiles: number; withOrders: number; revenue: number }> = {};
    profiles.forEach(p => {
      const spoke = p._spoke_name || 'Unknown';
      if (!spokeStats[spoke]) {
        spokeStats[spoke] = { profiles: 0, withOrders: 0, revenue: 0 };
      }
      spokeStats[spoke].profiles += 1;
      if (p.order_stats && p.order_stats.order_count > 0) {
        spokeStats[spoke].withOrders += 1;
        spokeStats[spoke].revenue += p.order_stats.ltv;
      }
    });
    const spokeBreakdown = Object.entries(spokeStats)
      .sort((a, b) => b[1].revenue - a[1].revenue);

    const totalProducts = Object.keys(productCounts).length;
    const avgProductsPerBuyer = (() => {
      const buyers = profiles.filter(p => (p.order_stats?.products_purchased?.length || 0) > 0);
      if (buyers.length === 0) return 0;
      const totalPurchased = buyers.reduce((sum, p) => sum + (p.order_stats?.products_purchased?.length || 0), 0);
      return totalPurchased / buyers.length;
    })();

    return { topProducts, spokeBreakdown, totalProducts, avgProductsPerBuyer };
  }, [profiles]);

  return (
    <div className="space-y-8 pb-40">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-xl">
            <BarChart3 size={28} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Ecosystem Analytics</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Federated Spoke Intelligence</p>
          </div>
        </div>
        {isFederating && (
          <div className="flex items-center space-x-2 text-indigo-600">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-[10px] font-black uppercase tracking-widest">Federating...</span>
          </div>
        )}
        {!isFederating && profiles.length > 0 && (
          <div className="flex items-center space-x-2 text-emerald-600">
            <Radio size={14} />
            <span className="text-[10px] font-black uppercase tracking-widest">{profiles.length} profiles from {spokeConnections.filter(c => c.status === 'active').length} spokes</span>
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm w-fit overflow-x-auto max-w-full">
        {REPORTS_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center space-x-2 px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
              activeTab === tab.id ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-800'
            }`}
          >
            <tab.icon size={14} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* PRODUCT ANALYTICS (PostHog aggregate query + hourly cache)       */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {activeTab === 'product' && (
        <PostHogAnalyticsPanel
          branches={branchContext?.allBranches || []}
          branchContext={branchContext}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* SOCIAL AUDIENCE (Meta live followers + brand_daily_metrics trend) */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {activeTab === 'social' && (
        <SocialPerformancePanel
          branches={branchContext?.allBranches || []}
          branchContext={branchContext}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* LIVE EMAIL PERFORMANCE (Resend delivery events + suppression)    */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {activeTab === 'email' && (
        <EmailPerformancePanel
          branches={branchContext?.allBranches || []}
          profiles={profiles}
        />
      )}

      {activeTab === 'events' && (
        <EventRegistrationPanel spokeConnections={spokeConnections} branchContext={branchContext} />
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* YOUTUBE PERFORMANCE (Episodes + Studio Albums, E9 sync)          */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {activeTab === 'youtube' && <YouTubePerformancePanel />}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* AUDIENCE — federated profile KPIs (2x2 grid)                     */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {activeTab === 'audience' && (
        <>
          {federationError && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-start space-x-3">
              <AlertTriangle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs font-bold text-amber-700">{federationError}</p>
            </div>
          )}

          {isFederating && profiles.length === 0 ? (
            <div className="flex items-center justify-center py-24">
              <div className="text-center space-y-4">
                <Loader2 size={32} className="animate-spin text-indigo-500 mx-auto" />
                <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Fetching data from spokes...</p>
              </div>
            </div>
          ) : (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

        {/* Card 1: Audience Composition */}
        <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-8 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
                <Users size={20} />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Audience Composition</p>
            </div>
            <span className="text-4xl font-black text-slate-800">{audienceData.total.toLocaleString()}</span>
          </div>

          {/* Gender Distribution */}
          <div className="space-y-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-300">Gender Distribution</p>
            {audienceData.genderCounts.male + audienceData.genderCounts.female > 0 ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-600">Male</span>
                  <span className="font-black text-indigo-600">{audienceData.genderCounts.male} ({audienceData.total > 0 ? ((audienceData.genderCounts.male / audienceData.total) * 100).toFixed(1) : 0}%)</span>
                </div>
                <PercentBar value={audienceData.genderCounts.male} max={audienceData.total} color="bg-indigo-500" />

                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-600">Female</span>
                  <span className="font-black text-rose-500">{audienceData.genderCounts.female} ({audienceData.total > 0 ? ((audienceData.genderCounts.female / audienceData.total) * 100).toFixed(1) : 0}%)</span>
                </div>
                <PercentBar value={audienceData.genderCounts.female} max={audienceData.total} color="bg-rose-400" />

                {audienceData.genderCounts.unknown > 0 && (
                  <>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-600">Unknown</span>
                      <span className="font-black text-slate-400">{audienceData.genderCounts.unknown}</span>
                    </div>
                    <PercentBar value={audienceData.genderCounts.unknown} max={audienceData.total} color="bg-slate-300" />
                  </>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">Demographics not yet computed</p>
            )}
          </div>

          {/* Top Sources */}
          <div className="space-y-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-300">Spoke Distribution</p>
            <div className="space-y-2">
              {audienceData.topSources.length > 0 ? audienceData.topSources.map(([site, count]) => (
                <div key={site} className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-600 truncate max-w-[180px]">{site}</span>
                  <span className="text-xs font-black text-emerald-600">{count}</span>
                </div>
              )) : (
                <p className="text-xs text-slate-400 italic">No source data available</p>
              )}
            </div>
          </div>
        </div>

        {/* Card 2: LTV & Revenue Distribution */}
        <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-8 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                <DollarSign size={20} />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">LTV & Revenue</p>
            </div>
          </div>

          {/* LTV Stats */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 rounded-2xl p-4 text-center">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Avg LTV</p>
              <p className="text-2xl font-black text-slate-800">${ltvData.avg.toFixed(2)}</p>
            </div>
            <div className="bg-slate-50 rounded-2xl p-4 text-center">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Median LTV</p>
              <p className="text-2xl font-black text-slate-800">${ltvData.median.toFixed(2)}</p>
            </div>
          </div>

          {/* LTV Tiers */}
          <div className="space-y-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-300">LTV Distribution</p>
            {[
              { label: '$0 (No Revenue)', count: ltvData.tiers.zero, color: 'bg-slate-300' },
              { label: '$0.01-$50 (Micro)', count: ltvData.tiers.micro, color: 'bg-amber-400' },
              { label: '$50-$200 (Standard)', count: ltvData.tiers.standard, color: 'bg-emerald-400' },
              { label: '$200-$500 (Premium)', count: ltvData.tiers.premium, color: 'bg-indigo-500' },
              { label: '$500+ (VIP)', count: ltvData.tiers.vip, color: 'bg-purple-600' },
            ].map(tier => (
              <div key={tier.label} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-600">{tier.label}</span>
                  <span className="font-black text-slate-700">{tier.count} ({profiles.length > 0 ? ((tier.count / profiles.length) * 100).toFixed(1) : 0}%)</span>
                </div>
                <PercentBar value={tier.count} max={profiles.length} color={tier.color} />
              </div>
            ))}
          </div>

          {/* Top 10 Profiles */}
          <div className="space-y-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-300">Top 10 by LTV</p>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {ltvData.topProfiles.map((p, i) => (
                <div key={p.id || p.email} className="flex items-center justify-between text-xs py-1 border-b border-slate-50">
                  <div className="flex items-center space-x-2">
                    {i === 0 && <Crown size={12} className="text-amber-500" />}
                    <span className="font-bold text-slate-600 truncate max-w-[120px]">{p.first_name} {p.last_name || ''}</span>
                  </div>
                  <span className="font-black text-emerald-600">${(p.order_stats?.ltv || 0).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Card 3: Subscription & Order Health */}
        <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-8 space-y-6">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center">
              <ShieldCheck size={20} />
            </div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Subscription & Order Health</p>
          </div>

          {/* Subscription Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-emerald-50 rounded-2xl p-4 text-center">
              <Heart size={16} className="mx-auto text-emerald-600 mb-1" />
              <p className="text-xl font-black text-emerald-700">{subscriptionData.subscribed}</p>
              <p className="text-[8px] font-black uppercase tracking-widest text-emerald-500">Subscribed</p>
            </div>
            <div className="bg-slate-50 rounded-2xl p-4 text-center">
              <UserX size={16} className="mx-auto text-slate-500 mb-1" />
              <p className="text-xl font-black text-slate-700">{subscriptionData.unsubscribed}</p>
              <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Unsubscribed</p>
            </div>
            <div className="bg-amber-50 rounded-2xl p-4 text-center">
              <PauseCircle size={16} className="mx-auto text-amber-600 mb-1" />
              <p className="text-xl font-black text-amber-700">{subscriptionData.unknown}</p>
              <p className="text-[8px] font-black uppercase tracking-widest text-amber-500">Unknown</p>
            </div>
          </div>

          {/* Order Activity */}
          <div className="space-y-3">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-300">Order Activity</p>
            <div className="flex flex-wrap gap-2">
              <span className="px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-full text-xs font-black">
                Repeat Buyers: {subscriptionData.repeatBuyers}
              </span>
              <span className="px-3 py-1.5 bg-amber-100 text-amber-700 rounded-full text-xs font-black">
                One-Time: {subscriptionData.oneTimeBuyers}
              </span>
              <span className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-full text-xs font-black">
                No Orders: {subscriptionData.withoutOrders}
              </span>
            </div>
          </div>

          {/* Engagement Recency */}
          <div className="space-y-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-300">Purchase Recency (90 days)</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center">
                <p className="text-lg font-black text-emerald-700">{subscriptionData.recentlyActive}</p>
                <p className="text-[8px] font-black uppercase tracking-widest text-emerald-500">Recently Active</p>
              </div>
              <div className="text-center">
                <p className="text-lg font-black text-slate-700">{subscriptionData.dormant}</p>
                <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Dormant</p>
              </div>
            </div>
          </div>
        </div>

        {/* Card 4: Product & Spoke Intelligence */}
        <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-8 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center">
                <Tag size={20} />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Product & Spoke Intelligence</p>
            </div>
          </div>

          {/* Averages */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 rounded-2xl p-4 text-center">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Unique Products</p>
              <p className="text-2xl font-black text-slate-800">{productData.totalProducts}</p>
            </div>
            <div className="bg-slate-50 rounded-2xl p-4 text-center">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Avg Products/Buyer</p>
              <p className="text-2xl font-black text-slate-800">{productData.avgProductsPerBuyer.toFixed(1)}</p>
            </div>
          </div>

          {/* Top Products by Revenue */}
          <div className="space-y-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-300">Top Products by Revenue</p>
            <div className="max-h-28 overflow-y-auto space-y-1">
              {productData.topProducts.length > 0 ? productData.topProducts.map(([name, stats]) => (
                <div key={name} className="flex items-center justify-between text-xs py-1">
                  <span className="font-bold text-slate-600 truncate max-w-[180px]">{name}</span>
                  <span className="font-black text-purple-600">${stats.revenue.toFixed(0)} ({stats.buyers})</span>
                </div>
              )) : (
                <p className="text-xs text-slate-400 italic">No product data available</p>
              )}
            </div>
          </div>

          {/* Spoke Breakdown */}
          <div className="space-y-2">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-300">Spoke Performance</p>
            <div className="space-y-1.5">
              {productData.spokeBreakdown.length > 0 ? productData.spokeBreakdown.map(([spoke, stats]) => (
                <div key={spoke} className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-600 truncate max-w-[140px]">{spoke}</span>
                  <span className="font-black text-purple-600">{stats.profiles} profiles &middot; ${stats.revenue.toFixed(0)}</span>
                </div>
              )) : (
                <p className="text-xs text-slate-400 italic">No spoke data available</p>
              )}
            </div>
          </div>
        </div>
      </div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════ */}
      {/* SYSTEM REPORT BLUEPRINTS */}
      {/* ═══════════════════════════════════════════════════════════════ */}
      {activeTab === 'blueprints' && (
      <div className="space-y-6">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-cyan-50 text-cyan-600 rounded-xl flex items-center justify-center">
            <FileText size={20} />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">System Blueprints</p>
            <p className="text-xs text-slate-500">Pre-built report templates</p>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {REPORT_BLUEPRINTS.map(report => (
            <div key={report.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-black text-slate-800">{report.name}</h4>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {report.metrics.map(m => (
                  <span key={m} className="px-2 py-0.5 bg-slate-50 text-slate-500 rounded text-[9px] font-bold">{m}</span>
                ))}
              </div>
              <div className="flex items-center gap-1 pt-3 border-t border-slate-100">
                <Globe size={12} className="text-slate-400" />
                <span className="text-[9px] font-bold text-slate-400">{report.spokes.join(', ')}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
      )}
    </div>
  );
};

export default Reports;
