
import React, { useState, useEffect, useMemo } from 'react';
import { Profile, MarketingEvent, MarketingTask, ViewState, Brand, Branch, SpokeConnection, BranchStatsResult, BranchContext } from '../types';
import { Article } from '../src/data/helpContent';
import HelpLink from '../src/components/HelpLink';
import { MOCK_BRIEFING } from '../constants';
import { fetchRecentEvents } from '../lib/supabaseService';
import { fetchAllSpokesOrders, NormalizedOrder } from '../spokeConnector';
import { timeAgo } from '../utils';
import {
  Globe, Sparkles, ChevronDown, ChevronRight, X, Target,
  LifeBuoy, ShieldAlert, Activity, Zap, ArrowRight, Database, RefreshCw, Loader2,
  Package, DollarSign, GitBranch, AlertTriangle, Clock, Send, Rocket
} from 'lucide-react';

interface CampaignRecord {
  id: string;
  name: string;
  launchedAt: string;
  audienceSize: number;
  branches: string[];
  presets: string[];
  template: string;
  trigger: string;
  status: 'deployed' | 'scheduled' | 'draft';
}

interface DashboardProps {
  onViewChange?: (view: ViewState) => void;
  events: MarketingEvent[];
  tasks: MarketingTask[];
  profiles: Profile[];
  brand: Brand;
  spokeConnections: SpokeConnection[];
  branchStats: BranchStatsResult;
  branches: Branch[];
  branchContext?: BranchContext;
  onOpenArticle?: (article: Article) => void;
}

/** Classify how fresh a timestamp is */
function getFreshness(ts?: string): { label: string; isStale: boolean; isWarning: boolean } {
  if (!ts) return { label: 'Never synced', isStale: true, isWarning: true };
  const hours = (Date.now() - new Date(ts).getTime()) / (1000 * 60 * 60);
  if (hours < 1) return { label: 'Just now', isStale: false, isWarning: false };
  if (hours < 24) return { label: `${Math.floor(hours)}h ago`, isStale: false, isWarning: false };
  if (hours < 48) return { label: `${Math.floor(hours)}h ago`, isStale: false, isWarning: true };
  const days = Math.floor(hours / 24);
  return { label: `${days}d ago`, isStale: true, isWarning: true };
}

const Dashboard: React.FC<DashboardProps> = ({ onViewChange, events, tasks, profiles, brand, spokeConnections, branchStats, branches, branchContext, onOpenArticle }) => {
  const [isBriefingOpen, setIsBriefingOpen] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Dashboard data loading
  const [isLoading, setIsLoading] = useState(true);
  const [recentEvents, setRecentEvents] = useState<MarketingEvent[]>([]);

  // Recent orders (only thing Dashboard still fetches independently)
  const [recentOrders, setRecentOrders] = useState<NormalizedOrder[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);

  // Campaign history from localStorage
  const [campaignHistory, setCampaignHistory] = useState<CampaignRecord[]>([]);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('trellis_campaign_history');
      if (saved) setCampaignHistory(JSON.parse(saved));
    } catch {}
  }, []);

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const recentEventsData = await fetchRecentEvents(5);
        setRecentEvents(recentEventsData);
      } catch (err) {
        console.error('Error loading dashboard data:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadDashboardData();
  }, []);

  // Fetch recent orders (raw order rows, not available from branchStats)
  useEffect(() => {
    const fetchOrdersData = async () => {
      if (!spokeConnections.some(c => c.status === 'active')) return;
      setIsLoadingOrders(true);
      try {
        const { orders } = await fetchAllSpokesOrders(spokeConnections);
        const sorted = [...orders].sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()).slice(0, 5);
        setRecentOrders(sorted);
      } catch (err) {
        console.error('Failed to fetch orders:', err);
      } finally {
        setIsLoadingOrders(false);
      }
    };
    fetchOrdersData();
  }, [spokeConnections]);

  // Simulation: Checking for items that need human action
  const pendingApprovalsCount = 2;

  const activeConnections = spokeConnections.filter(c => c.status === 'active');

  // Branch-scoped profile view — respects global branch picker
  const scopedProfiles = useMemo(() => {
    if (!branchContext || branchContext.isAllSelected) return profiles;
    return profiles.filter(p => p.branches.some(b => branchContext.activeBranchSlugs.includes(b)));
  }, [profiles, branchContext]);

  // Use branchStats for all aggregate metrics
  const spokeCounts = branchStats.spokeStats;
  const isLoadingCounts = branchStats.isLoading;
  const totalFederatedProfiles = branchStats.totals.profiles;
  const totalOrders = branchStats.totals.orders;
  const totalRevenue = branchStats.totals.revenue;
  const paidOrders = branchStats.totals.orders; // approximation: branchStats doesn't track paid specifically
  const spokesWithOrders = spokeConnections.filter(c => c.tables?.some(t => t.table_type === 'orders' && t.enabled)).length;

  // Campaign aggregate stats
  const campaignStats = useMemo(() => {
    const deployed = campaignHistory.filter(c => c.status === 'deployed');
    const scheduled = campaignHistory.filter(c => c.status === 'scheduled');
    const totalAudience = deployed.reduce((sum, c) => sum + c.audienceSize, 0);
    const uniqueBranches = new Set(deployed.flatMap(c => c.branches));
    return {
      deployedCount: deployed.length,
      scheduledCount: scheduled.length,
      totalAudience,
      branchesReached: uniqueBranches.size,
      recentCampaigns: [...campaignHistory].sort((a, b) => new Date(b.launchedAt).getTime() - new Date(a.launchedAt).getTime()).slice(0, 4),
    };
  }, [campaignHistory]);

  // Branch lookup: connectionId → branch record
  const branchByConnectionId = useMemo(() => {
    const map = new Map<string, Branch>();
    for (const b of branches) {
      if (b.spoke_connection_id) map.set(b.spoke_connection_id, b);
    }
    return map;
  }, [branches]);

  // Health counts for the header
  const healthCounts = useMemo(() => {
    let healthy = 0, warning = 0, error = 0;
    for (const c of spokeConnections) {
      if (c.status === 'error' || c.status === 'disconnected') { error++; continue; }
      const freshness = getFreshness(c.last_tested_at);
      if (freshness.isStale) warning++;
      else healthy++;
    }
    return { healthy, warning, error };
  }, [spokeConnections]);

  const stats = [
    {
      label: 'Federated Profiles',
      value: isLoadingCounts ? '...' : totalFederatedProfiles.toLocaleString(),
      icon: Globe,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      cardBg: 'bg-white',
      textColor: 'text-yale-blue',
      labelColor: 'text-slate-500',
      subtext: `${activeConnections.length} spoke${activeConnections.length !== 1 ? 's' : ''}`
    },
    {
      label: 'Total Orders',
      value: isLoadingOrders ? '...' : totalOrders.toLocaleString(),
      icon: Package,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
      cardBg: 'bg-white',
      textColor: 'text-yale-blue',
      labelColor: 'text-slate-500',
      subtext: `${paidOrders} paid`
    },
    {
      label: 'Total Revenue',
      value: isLoadingOrders ? '...' : `$${totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      icon: DollarSign,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
      cardBg: 'bg-white',
      textColor: 'text-yale-blue',
      labelColor: 'text-slate-500',
      subtext: `From ${spokesWithOrders} spoke${spokesWithOrders !== 1 ? 's' : ''}`
    },
    {
      label: 'Campaigns Deployed',
      value: campaignStats.deployedCount,
      icon: Send,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
      cardBg: 'bg-white',
      textColor: 'text-yale-blue',
      labelColor: 'text-slate-500',
      subtext: campaignStats.scheduledCount > 0 ? `${campaignStats.scheduledCount} scheduled` : `${campaignStats.totalAudience.toLocaleString()} reached`
    },
  ];

  return (
    <div className="space-y-8 pb-10">

      {/* High-Action Alert Strip */}
      {pendingApprovalsCount > 0 && (
        <div className="bg-blue-slate-2 text-white px-8 py-5 rounded-[2rem] shadow-xl flex items-center justify-between animate-in slide-in-from-top duration-500 border-4 border-blue-slate/50">
          <div className="flex items-center space-x-6">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center animate-pulse">
              <Sparkles size={24} />
            </div>
            <div>
              <h4 className="text-lg font-black uppercase tracking-tight">Strategic Action Required</h4>
              <p className="text-white/70 text-xs font-bold">You have {pendingApprovalsCount} AI-generated drafts waiting for approval in the Social Hub.</p>
            </div>
          </div>
          <button
            onClick={() => onViewChange?.('social-hub')}
            className="px-8 py-3 bg-white text-yale-blue rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-cornflower-ocean hover:text-yale-blue transition-all flex items-center space-x-3 shadow-lg"
          >
            <span>Go to Review Queue</span>
            <ArrowRight size={16} />
          </button>
        </div>
      )}

      {/* Sage Strategic Pulse - DARK THEME */}
      <div className="bg-yale-blue rounded-[2.5rem] border border-blue-slate-2 shadow-2xl overflow-hidden transition-all duration-500 relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-cornflower-ocean/10 rounded-full blur-[100px] -mr-32 -mt-32"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-slate/10 rounded-full blur-[100px] -ml-32 -mb-32"></div>

        <button
          onClick={() => setIsBriefingOpen(!isBriefingOpen)}
          className="w-full px-10 py-7 flex items-center justify-between hover:bg-white/5 transition relative z-10"
        >
          <div className="flex items-center space-x-5">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition-transform group-hover:scale-105 bg-cornflower-ocean"
            >
              <Sparkles size={22} className="text-yale-blue fill-yale-blue/20" />
            </div>
            <div className="text-left">
              <h3 className="text-lg font-black text-white uppercase tracking-widest">Sage Strategic Pulse</h3>
              <HelpLink
                articleId="art_gs_monitor_reports"
                label="What is the daily briefing?"
                variant="inline"
                onOpenArticle={onOpenArticle!}
              />
              <div className="flex items-center space-x-3 mt-0.5">
                <span className="text-[10px] text-sky-300 font-bold uppercase tracking-widest flex items-center">
                  <Zap size={10} className="mr-1" /> Ecosystem Harmony: Active
                </span>
                <span className="text-blue-slate-2 text-[10px]">•</span>
                <p className="text-[10px] text-white/60 font-bold uppercase tracking-widest">Brand Insights Engine</p>
              </div>
            </div>
          </div>
          <div className={`p-2 rounded-xl bg-white/5 text-white/50 transition-all duration-500 ${isBriefingOpen ? 'rotate-180 bg-sky-400/20 text-sky-300' : ''}`}>
            <ChevronDown size={20} />
          </div>
        </button>

        {isBriefingOpen && (
          <div className="px-10 pb-10 animate-in fade-in slide-in-from-top-4 duration-500 relative z-10">
            <div className="p-8 bg-blue-slate-2/50 rounded-3xl border border-blue-slate/50 flex flex-col md:flex-row items-center justify-between gap-8 backdrop-blur-sm">
              <div className="space-y-2">
                <div className="flex items-center space-x-2 text-[10px] font-black text-sky-300 uppercase tracking-widest mb-1">
                  <Activity size={12} />
                  <span>Your Morning Briefing</span>
                </div>
                <p className="text-base font-medium text-white/90 leading-relaxed max-w-2xl italic">
                  "{MOCK_BRIEFING.short_summary}"
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(true)}
                className="px-8 py-3.5 bg-white text-yale-blue rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-cornflower-ocean hover:text-yale-blue transition-all flex items-center space-x-3 shrink-0 shadow-xl"
              >
                <span>Full Ecosystem Health</span>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Branch Scope Indicator */}
      {branchContext && !branchContext.isAllSelected && (
        <div className="bg-indigo-50 border border-indigo-200 px-6 py-3 rounded-2xl flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <GitBranch size={16} className="text-indigo-600" />
            <span className="text-xs font-bold text-indigo-700">
              Viewing {branchContext.activeBranchSlugs.length} of {branchContext.allBranches.length} branches
            </span>
          </div>
          <span className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">
            {scopedProfiles.length} scoped profiles
          </span>
        </div>
      )}

      {/* Stats Bar */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 animate-pulse">
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 bg-slate-200 rounded-xl" />
              </div>
              <div>
                <div className="h-4 w-32 bg-slate-200 rounded mb-2" />
                <div className="h-8 w-16 bg-slate-200 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat) => (
            <div key={stat.label} className={`${stat.cardBg} p-6 rounded-2xl shadow-sm border border-blue-slate-2/20 group hover:border-cornflower-ocean/50 transition-all`}>
              <div className="flex justify-between items-start mb-4">
                <div className={`${stat.bg} ${stat.color} p-3 rounded-xl group-hover:scale-110 transition-transform`}>
                  <stat.icon size={24} />
                </div>
              </div>
              <div>
                <p className={`${stat.labelColor} text-sm font-medium`}>{stat.label}</p>
                <h3 className={`text-2xl font-bold ${stat.textColor} mt-1`}>{stat.value}</h3>
                {stat.subtext && (
                  <p className="text-xs text-slate-400 mt-1">{stat.subtext}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">

          {/* Branch Network Health */}
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm relative">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-lg font-black text-yale-blue flex items-center">
                  <GitBranch size={20} className="mr-2 text-emerald-600" />
                  Branch Network Health
                </h3>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
                  {spokeConnections.length === 0
                    ? 'No connections configured'
                    : `${spokeConnections.length} connection${spokeConnections.length !== 1 ? 's' : ''} \u2022 ${healthCounts.healthy} healthy${healthCounts.warning > 0 ? ` \u2022 ${healthCounts.warning} stale` : ''}${healthCounts.error > 0 ? ` \u2022 ${healthCounts.error} down` : ''}`}
                </p>
              </div>
              <HelpLink
                articleId="art_gs_monitor_reports"
                label="How is this calculated?"
                variant="badge"
                onOpenArticle={onOpenArticle!}
              />
              {spokeConnections.length > 0 && (
                <button
                  onClick={() => branchStats.refresh()}
                  disabled={isLoadingCounts}
                  className="p-2 text-slate-400 hover:text-emerald-600 transition disabled:opacity-50 rounded-xl hover:bg-emerald-50"
                >
                  <RefreshCw size={18} className={isLoadingCounts ? 'animate-spin' : ''} />
                </button>
              )}
            </div>

            {spokeConnections.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Database size={32} className="text-slate-400" />
                </div>
                <p className="text-lg font-bold text-slate-600 mb-2">No data sources connected</p>
                <p className="text-sm text-slate-400 mb-6 max-w-md mx-auto">
                  Connect external Supabase databases to see federated profile counts and unified analytics.
                </p>
                <button
                  onClick={() => onViewChange?.('branches')}
                  className="px-6 py-3 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-700 transition"
                >
                  Connect Your First Spoke
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {spokeConnections.map(connection => {
                  const branch = branchByConnectionId.get(connection.id);
                  const spokeData = spokeCounts[connection.id];
                  const count = spokeData?.profileCount ?? 0;
                  const percentage = totalFederatedProfiles > 0 && count > 0
                    ? Math.round((count / totalFederatedProfiles) * 100)
                    : 0;

                  const isActive = connection.status === 'active';
                  const isError = connection.status === 'error';
                  const isDisconnected = connection.status === 'disconnected';
                  const freshness = getFreshness(connection.last_tested_at);
                  const showStaleWarning = isActive && freshness.isStale;

                  const branchColor = branch?.primary_color || '#64748b';
                  const displayName = branch?.name || connection.name;

                  // Status styling
                  const statusDot = isActive && !freshness.isStale
                    ? 'bg-emerald-500'
                    : isActive && freshness.isWarning
                    ? 'bg-amber-400'
                    : isError
                    ? 'bg-rose-500'
                    : 'bg-slate-400';

                  const statusLabel = isActive && !freshness.isWarning
                    ? 'Healthy'
                    : isActive && freshness.isStale
                    ? 'Stale'
                    : isActive && freshness.isWarning
                    ? 'Aging'
                    : isError
                    ? 'Error'
                    : 'Disconnected';

                  const statusColor = isActive && !freshness.isWarning
                    ? 'text-emerald-600'
                    : isActive && freshness.isWarning
                    ? 'text-amber-600'
                    : isError
                    ? 'text-rose-600'
                    : 'text-slate-500';

                  // Card border highlights problems
                  const cardBorder = isError
                    ? 'border-rose-200 bg-rose-50/30'
                    : showStaleWarning
                    ? 'border-amber-200 bg-amber-50/20'
                    : isDisconnected
                    ? 'border-slate-200 bg-slate-50/30'
                    : 'border-slate-200';

                  return (
                    <div key={connection.id} className={`p-4 rounded-2xl border ${cardBorder} transition-all`}>
                      <div className="flex items-center justify-between">
                        {/* Left: branch identity */}
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className="w-9 h-9 rounded-xl flex items-center justify-center text-white text-sm font-black shadow-sm flex-shrink-0"
                            style={{ backgroundColor: branchColor }}
                          >
                            {branch?.logo_url ? (
                              <img src={branch.logo_url} alt="" className="w-full h-full object-contain rounded-xl" />
                            ) : (
                              displayName.charAt(0)
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-bold text-slate-800 truncate">{displayName}</span>
                              {branch?.slug && (
                                <span className="text-[10px] text-slate-400 font-mono flex-shrink-0">/{branch.slug}</span>
                              )}
                              {!branch && (
                                <span className="text-[9px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded flex-shrink-0">UNLINKED</span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot}`} />
                              <span className={`text-[10px] font-bold ${statusColor}`}>{statusLabel}</span>
                              <span className="text-[10px] text-slate-400 flex items-center gap-1">
                                <Clock size={9} />
                                {freshness.label}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Right: profile count */}
                        <div className="text-right flex-shrink-0 pl-3">
                          {isLoadingCounts ? (
                            <Loader2 size={16} className="animate-spin text-slate-400" />
                          ) : isDisconnected ? (
                            <span className="text-xs font-bold text-slate-400">Offline</span>
                          ) : (
                            <>
                              <p className="text-lg font-black text-slate-800">{count.toLocaleString()}</p>
                              <p className="text-[9px] text-slate-400 font-bold uppercase">profiles</p>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Distribution bar */}
                      {isActive && count > 0 && (
                        <div className="mt-2.5 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: isLoadingCounts ? '0%' : `${percentage}%`, backgroundColor: branchColor }}
                          />
                        </div>
                      )}

                      {/* Error message */}
                      {connection.last_error && (isError || isDisconnected) && (
                        <div className="mt-2 flex items-center gap-1.5">
                          <AlertTriangle size={12} className="text-rose-500 flex-shrink-0" />
                          <span className="text-[10px] font-bold text-rose-600 truncate">{connection.last_error}</span>
                        </div>
                      )}

                      {/* Stale sync warning */}
                      {showStaleWarning && (
                        <div className="mt-2 flex items-center gap-1.5">
                          <Clock size={12} className="text-amber-500 flex-shrink-0" />
                          <span className="text-[10px] font-bold text-amber-600">
                            Last synced {freshness.label} — data may be outdated
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Link to Command Center */}
                <button
                  onClick={() => onViewChange?.('branches')}
                  className="w-full mt-2 py-3 bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-emerald-700 transition-all flex items-center justify-center space-x-2"
                >
                  <GitBranch size={14} />
                  <span>Open Command Center</span>
                </button>
              </div>
            )}
          </div>

          {/* Campaign Velocity */}
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-lg font-black text-yale-blue flex items-center">
                  <Rocket size={20} className="mr-2 text-purple-600" />
                  Campaign Velocity
                </h3>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
                  {campaignStats.deployedCount === 0
                    ? 'No campaigns launched yet'
                    : `${campaignStats.deployedCount} deployed \u2022 ${campaignStats.totalAudience.toLocaleString()} total reach \u2022 ${campaignStats.branchesReached} branch${campaignStats.branchesReached !== 1 ? 'es' : ''}`}
                </p>
              </div>
              <button
                onClick={() => onViewChange?.('campaign-builder')}
                className="px-4 py-2 bg-purple-50 text-purple-700 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-purple-100 transition flex items-center space-x-1.5"
              >
                <Send size={12} />
                <span>New Campaign</span>
              </button>
            </div>

            {campaignStats.recentCampaigns.length === 0 ? (
              <div className="text-center py-10">
                <div className="w-14 h-14 bg-purple-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Send size={28} className="text-purple-300" />
                </div>
                <p className="text-sm font-bold text-slate-600 mb-1">No campaigns yet</p>
                <p className="text-[10px] text-slate-400 mb-4 max-w-xs mx-auto">
                  Launch your first campaign from the Campaign Builder to see metrics here.
                </p>
                <button
                  onClick={() => onViewChange?.('campaign-builder')}
                  className="px-6 py-3 bg-purple-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-purple-700 transition"
                >
                  Open Campaign Builder
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {campaignStats.recentCampaigns.map(campaign => {
                  const statusColors: Record<string, string> = {
                    deployed: 'bg-emerald-100 text-emerald-700',
                    scheduled: 'bg-amber-100 text-amber-700',
                    draft: 'bg-slate-100 text-slate-600',
                  };
                  return (
                    <div key={campaign.id} className="flex items-center justify-between p-4 rounded-2xl border border-slate-200 hover:border-purple-200 transition-all">
                      <div className="flex items-center space-x-3 min-w-0">
                        <div className="w-9 h-9 bg-purple-50 rounded-xl flex items-center justify-center flex-shrink-0">
                          <Send size={16} className="text-purple-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-slate-800 truncate">{campaign.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded ${statusColors[campaign.status] || statusColors.draft}`}>
                              {campaign.status}
                            </span>
                            <span className="text-[10px] text-slate-400">{timeAgo(campaign.launchedAt)}</span>
                            {campaign.branches.length > 0 && (
                              <span className="text-[10px] text-slate-400">
                                {campaign.branches.length} branch{campaign.branches.length !== 1 ? 'es' : ''}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 pl-3">
                        <p className="text-lg font-black text-slate-800">{campaign.audienceSize.toLocaleString()}</p>
                        <p className="text-[9px] text-slate-400 font-bold uppercase">recipients</p>
                      </div>
                    </div>
                  );
                })}

                <button
                  onClick={() => onViewChange?.('campaign-builder')}
                  className="w-full mt-2 py-3 bg-slate-50 hover:bg-purple-50 border border-slate-200 hover:border-purple-300 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-purple-700 transition-all flex items-center justify-center space-x-2"
                >
                  <Rocket size={14} />
                  <span>View All Campaigns</span>
                </button>
              </div>
            )}
          </div>

          {/* Recent Orders */}
          {recentOrders.length > 0 && (
            <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm">
              <h3 className="text-lg font-black text-yale-blue mb-6 uppercase tracking-tight flex items-center">
                <Package size={20} className="mr-2 text-blue-600" />
                Recent Orders
              </h3>
              <div className="space-y-3">
                {recentOrders.map((order, i) => (
                  <div key={order.id || i} className="flex items-center justify-between py-3 border-b border-slate-50 last:border-0">
                    <div className="flex items-center space-x-3">
                      <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                        <Package size={18} className="text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-800">
                          {order.order_number || `Order #${order.id?.slice(0, 8)}`}
                        </p>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          {order._spoke_name} • {order.status || 'pending'}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-black text-yale-blue">
                        ${(order.total || 0).toFixed(2)}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {order.created_at ? new Date(order.created_at).toLocaleDateString() : 'No date'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Activity Feed */}
          <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm">
            <h3 className="text-lg font-bold text-yale-blue mb-6 font-black uppercase tracking-tight">Recent Brand Interactions</h3>
            <div className="space-y-6">
              {recentEvents.map((event) => (
                <div key={event.id} className="flex items-start space-x-4">
                  <div className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                    {event.source.includes('app') ? <Globe size={18} /> : <Activity size={18} />}
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <div>
                         <p className="text-sm font-bold text-slate-800 capitalize">{event.event_type.replace('_', ' ')}</p>
                         <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Origin: {event.source}</p>
                      </div>
                      <span className="text-[10px] font-black text-slate-400">{new Date(event.created_at).toLocaleTimeString()}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar Widgets */}
        <div className="space-y-8">
          {/* Branch Status Card */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-black text-emerald-700 uppercase tracking-widest flex items-center">
                <GitBranch size={16} className="mr-2" />
                Branch Status
              </h3>
              {spokeConnections.some(c => c.status === 'active') && (
                <button
                  onClick={() => branchStats.refresh()}
                  disabled={isLoadingCounts}
                  className="p-1.5 text-slate-400 hover:text-emerald-600 transition disabled:opacity-50"
                >
                  <RefreshCw size={14} className={isLoadingCounts ? 'animate-spin' : ''} />
                </button>
              )}
            </div>

            {spokeConnections.length === 0 ? (
              // Empty state
              <div className="text-center py-6">
                <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center mx-auto mb-3">
                  <Database size={20} className="text-slate-400" />
                </div>
                <p className="text-sm font-medium text-slate-600 mb-1">No data sources connected</p>
                <p className="text-[10px] text-slate-400 mb-4">Connect external databases to see federated profile counts</p>
                <button
                  onClick={() => onViewChange?.('branches')}
                  className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all flex items-center justify-center space-x-2"
                >
                  <Zap size={16} />
                  <span>Connect Your First Spoke</span>
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Total federated profiles */}
                <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                  <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mb-1">
                    Total Federated Profiles
                  </p>
                  {isLoadingCounts ? (
                    <div className="flex items-center space-x-2">
                      <Loader2 size={18} className="animate-spin text-emerald-600" />
                      <span className="text-sm text-emerald-600">Loading...</span>
                    </div>
                  ) : (
                    <p className="text-3xl font-black text-emerald-700">{totalFederatedProfiles.toLocaleString()}</p>
                  )}
                </div>

                {/* Individual branch/connection rows */}
                <div className="space-y-2">
                  {spokeConnections.map(connection => {
                    const branch = branchByConnectionId.get(connection.id);
                    const spokeData = spokeCounts[connection.id];
                    const count = spokeData?.profileCount ?? 0;
                    const isActive = connection.status === 'active';
                    const isError = connection.status === 'error';
                    const freshness = getFreshness(connection.last_tested_at);
                    const branchColor = branch?.primary_color || '#64748b';

                    const dotColor = isError
                      ? 'bg-rose-500'
                      : !isActive
                      ? 'bg-slate-400'
                      : freshness.isStale
                      ? 'bg-amber-400'
                      : 'bg-emerald-500';

                    return (
                      <div
                        key={connection.id}
                        className="flex items-center justify-between p-3 bg-slate-50 rounded-xl"
                      >
                        <div className="flex items-center space-x-2 min-w-0">
                          <div
                            className="w-5 h-5 rounded flex-shrink-0"
                            style={{ backgroundColor: branchColor }}
                          />
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
                          <span className="text-xs font-bold text-slate-700 truncate">
                            {branch?.name || connection.name}
                          </span>
                        </div>
                        <span className="text-xs font-black text-slate-500 flex-shrink-0 pl-2">
                          {isLoadingCounts ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : !isActive ? (
                            <span className={isError ? 'text-rose-500' : 'text-slate-400'}>
                              {isError ? 'Error' : 'Off'}
                            </span>
                          ) : (
                            count?.toLocaleString() ?? '—'
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Manage Branches button */}
                <button
                  onClick={() => onViewChange?.('branches')}
                  className="w-full mt-4 py-3 bg-slate-50 hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-emerald-700 transition-all flex items-center justify-center space-x-2"
                >
                  <GitBranch size={14} />
                  <span>Manage Branches</span>
                </button>
              </div>
            )}
          </div>

          <div className="bg-rose-50 p-6 rounded-2xl border border-rose-100 shadow-sm">
            <h3 className="text-sm font-black text-rose-800 mb-6 uppercase tracking-widest flex items-center">
              <ShieldAlert size={16} className="mr-2" />
              Customer Support Queue
            </h3>
            <div className="space-y-4">
              <div className="p-4 bg-white rounded-xl border border-rose-200">
                <p className="text-xs font-black text-slate-800">{MOCK_BRIEFING.detailed_analysis.support_load.open_tickets} Active Conversations</p>
                <p className="text-[10px] text-slate-400 mt-1">Sage detected <b>{MOCK_BRIEFING.detailed_analysis.support_load.urgent_count}</b> customers needing immediate attention.</p>
                <button
                  onClick={() => onViewChange?.('support-hub')}
                  className="mt-4 text-[10px] font-black text-rose-600 uppercase hover:underline"
                >
                  View Support Hub
                </button>
              </div>
            </div>
          </div>

          <div className="bg-yale-blue p-8 rounded-3xl text-white relative overflow-hidden shadow-xl">
             <div className="absolute top-0 right-0 p-4 opacity-20">
                <Sparkles size={80} className="text-cornflower-ocean" />
             </div>
             <h4 className="text-lg font-black mb-2">Strategic Dialogue</h4>
             <p className="text-white/70 text-xs leading-relaxed mb-6">Ask Sage about audience trends, cross-site purchase behaviors, or campaign optimization ideas.</p>
             <button onClick={() => window.scrollTo(0, 1000)} className="text-[10px] font-black uppercase tracking-widest text-sky-300 hover:text-sky-200 transition underline">Start Strategic Discussion</button>
          </div>
        </div>
      </div>

      {/* Strategic Deep-Dive Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-yale-blue/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                 <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg bg-cornflower-ocean">
                    <Sparkles size={24} className="text-yale-blue fill-yale-blue/20" />
                 </div>
                 <div>
                    <h3 className="text-2xl font-black text-yale-blue">{brand.name} Ecosystem Health</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Brand Performance Insights</p>
                 </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:text-rose-500 transition">
                <X size={28} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-10 space-y-12 custom-scrollbar bg-slate-50/50">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                 <div className="bg-white p-8 rounded-3xl border border-blue-slate-2/20 shadow-sm">
                    <Target size={32} className="text-cornflower-ocean mb-6" />
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Campaign Momentum</h4>
                    <p className="text-4xl font-black text-yale-blue mb-2">{MOCK_BRIEFING.detailed_analysis.campaign_velocity.avg_ctr}</p>
                    <p className="text-slate-600 text-xs leading-relaxed italic">Customers on farm.sproutify.app are highly engaged right now.</p>
                 </div>
                 <div className="bg-white p-8 rounded-3xl border border-blue-slate-2/20 shadow-sm">
                    <LifeBuoy size={32} className="text-amber-500 mb-6" />
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Team Responsiveness</h4>
                    <p className="text-4xl font-black text-yale-blue mb-2">{MOCK_BRIEFING.detailed_analysis.support_load.avg_response_time}</p>
                    <p className="text-slate-600 text-xs leading-relaxed italic">Response times are synchronized and fast across the ecosystem.</p>
                 </div>
              </div>
            </div>

            <div className="p-8 border-t border-slate-100 bg-white flex justify-end items-center space-x-4">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-10 py-3 bg-blue-slate-2 text-white rounded-2xl font-black text-sm hover:bg-yale-blue transition shadow-xl"
              >
                Close Insights
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
