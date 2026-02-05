
import React, { useState, useEffect } from 'react';
import { Profile, MarketingEvent, MarketingTask, ViewState, Brand, SpokeConnection } from '../types';
import { MOCK_BRIEFING } from '../constants';
import { fetchRecentEvents } from '../lib/supabaseService';
import { createClient } from '@supabase/supabase-js';
import { fetchAllSpokesOrders, NormalizedOrder } from '../spokeConnector';
import {
  Globe, CheckSquare, Sparkles, ChevronDown, ChevronRight, X, Target,
  LifeBuoy, ShieldAlert, Activity, Zap, ArrowRight, Database, RefreshCw, Loader2,
  Package, DollarSign, GitBranch
} from 'lucide-react';

interface DashboardProps {
  onViewChange?: (view: ViewState) => void;
  events: MarketingEvent[];
  tasks: MarketingTask[];
  profiles: Profile[];
  brand: Brand;
  spokeConnections: SpokeConnection[];
}

const Dashboard: React.FC<DashboardProps> = ({ onViewChange, events, tasks, profiles, brand, spokeConnections }) => {
  const [isBriefingOpen, setIsBriefingOpen] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Dashboard data loading
  const [isLoading, setIsLoading] = useState(true);
  const [recentEvents, setRecentEvents] = useState<MarketingEvent[]>([]);

  // Spoke connections live data
  const [spokeCounts, setSpokeCounts] = useState<Record<string, number>>({});
  const [isLoadingCounts, setIsLoadingCounts] = useState(false);
  const [totalFederatedProfiles, setTotalFederatedProfiles] = useState(0);

  // Orders data
  const [federatedOrders, setFederatedOrders] = useState<NormalizedOrder[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);

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

  // Fetch profile counts from all active spokes
  const fetchSpokeCounts = async () => {
    setIsLoadingCounts(true);
    const counts: Record<string, number> = {};
    let total = 0;

    const activeConns = spokeConnections.filter(c => c.status === 'active');

    for (const connection of activeConns) {
      // Find the customers table config
      const customersTable = connection.tables?.find(t => t.table_type === 'customers' && t.enabled);
      if (!customersTable) {
        counts[connection.id] = 0;
        continue;
      }

      try {
        const client = createClient(connection.supabase_url, connection.supabase_key);
        const { count, error } = await client
          .from(customersTable.table_name)
          .select('*', { count: 'exact', head: true });

        if (!error && count !== null) {
          counts[connection.id] = count;
          total += count;
        }
      } catch (err) {
        counts[connection.id] = -1; // Error indicator
      }
    }

    setSpokeCounts(counts);
    setTotalFederatedProfiles(total);
    setIsLoadingCounts(false);
  };

  useEffect(() => {
    if (spokeConnections.some(c => c.status === 'active')) {
      fetchSpokeCounts();
    }
  }, [spokeConnections]);

  // Fetch orders from all spokes
  const fetchOrdersData = async () => {
    if (spokeConnections.length === 0) return;
    setIsLoadingOrders(true);
    try {
      const { orders, errors } = await fetchAllSpokesOrders(spokeConnections);
      setFederatedOrders(orders);
      if (errors.length > 0) {
        console.warn('Order fetch errors:', errors);
      }
    } catch (err) {
      console.error('Failed to fetch orders:', err);
    } finally {
      setIsLoadingOrders(false);
    }
  };

  useEffect(() => {
    if (spokeConnections.some(c => c.status === 'active')) {
      fetchOrdersData();
    }
  }, [spokeConnections]);

  // Simulation: Checking for items that need human action
  const pendingApprovalsCount = 2;

  const activeConnections = spokeConnections.filter(c => c.status === 'active');

  // Order stats calculations
  const totalOrders = federatedOrders.length;
  const totalRevenue = federatedOrders.reduce((sum, order) => sum + (order.total || 0), 0);
  const paidOrders = federatedOrders.filter(o => o.paid_at).length;
  const recentOrders = [...federatedOrders]
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
    .slice(0, 5);
  const spokesWithOrders = spokeConnections.filter(c => c.tables?.some(t => t.table_type === 'orders' && t.enabled)).length;

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
      label: 'Marketing Actions',
      value: tasks.filter(t => t.status !== 'completed').length,
      icon: CheckSquare,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
      cardBg: 'bg-white',
      textColor: 'text-yale-blue',
      labelColor: 'text-slate-500',
      subtext: 'pending tasks'
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
          
          {/* Connected Data Sources */}
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm relative">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h3 className="text-lg font-black text-yale-blue flex items-center">
                  <Database size={20} className="mr-2 text-emerald-600" />
                  Connected Data Sources
                </h3>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
                  {activeConnections.length > 0
                    ? `Live data from ${activeConnections.length} spoke${activeConnections.length > 1 ? 's' : ''}`
                    : 'No data sources connected'}
                </p>
              </div>
              {activeConnections.length > 0 && (
                <button
                  onClick={fetchSpokeCounts}
                  disabled={isLoadingCounts}
                  className="p-2 text-slate-400 hover:text-emerald-600 transition disabled:opacity-50 rounded-xl hover:bg-emerald-50"
                >
                  <RefreshCw size={18} className={isLoadingCounts ? 'animate-spin' : ''} />
                </button>
              )}
            </div>

            {activeConnections.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Database size={32} className="text-slate-400" />
                </div>
                <p className="text-lg font-bold text-slate-600 mb-2">No data sources connected</p>
                <p className="text-sm text-slate-400 mb-6 max-w-md mx-auto">
                  Connect external Supabase databases to see federated profile counts and unified analytics.
                </p>
                <button
                  onClick={() => onViewChange?.('settings')}
                  className="px-6 py-3 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-700 transition"
                >
                  Connect Your First Spoke
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
                <div className="space-y-3">
                  {activeConnections.map((connection, idx) => {
                    const count = spokeCounts[connection.id];
                    const hasError = count === -1;
                    const percentage = totalFederatedProfiles > 0 && count > 0
                      ? Math.round((count / totalFederatedProfiles) * 100)
                      : 0;
                    const colors = ['bg-emerald-500', 'bg-blue-500', 'bg-purple-500', 'bg-amber-500', 'bg-rose-500'];
                    return (
                      <div key={connection.id} className="space-y-1.5">
                        <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-tighter">
                          <div className="flex items-center space-x-2">
                            <div
                              className={`w-2 h-2 rounded-full ${
                                hasError ? 'bg-red-500' : 'bg-emerald-500'
                              }`}
                            />
                            <span className="text-yale-blue">{connection.name}</span>
                          </div>
                          <span className="text-slate-400">
                            {isLoadingCounts ? (
                              '...'
                            ) : hasError ? (
                              <span className="text-red-500">Error</span>
                            ) : (
                              `${count?.toLocaleString() ?? 0} profiles`
                            )}
                          </span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${colors[idx % colors.length]} transition-all duration-500`}
                            style={{ width: isLoadingCounts ? '0%' : `${percentage}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="bg-emerald-50 p-6 rounded-3xl border border-emerald-100">
                  <div className="flex items-center space-x-3 mb-4">
                    <Activity size={18} className="text-emerald-600" />
                    <h4 className="text-xs font-black text-emerald-700 uppercase tracking-widest">Ecosystem Sync Health</h4>
                  </div>
                  <div className="text-4xl font-black text-emerald-700 mb-2">
                    {activeConnections.length}
                  </div>
                  <p className="text-[10px] text-emerald-600 font-medium">
                    {activeConnections.length === 1
                      ? '1 data source connected and syncing'
                      : `${activeConnections.length} data sources connected and syncing`}
                  </p>
                  {totalFederatedProfiles > 0 && (
                    <p className="text-[10px] text-slate-500 font-medium mt-2">
                      {totalFederatedProfiles.toLocaleString()} total profiles across all spokes
                    </p>
                  )}
                </div>
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
          {/* Connected Spokes Card */}
          <div className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-black text-emerald-700 uppercase tracking-widest flex items-center">
                <Database size={16} className="mr-2" />
                Connected Spokes
              </h3>
              {spokeConnections.some(c => c.status === 'active') && (
                <button
                  onClick={fetchSpokeCounts}
                  disabled={isLoadingCounts}
                  className="p-1.5 text-slate-400 hover:text-emerald-600 transition disabled:opacity-50"
                >
                  <RefreshCw size={14} className={isLoadingCounts ? 'animate-spin' : ''} />
                </button>
              )}
            </div>

            {spokeConnections.filter(c => c.status === 'active').length === 0 ? (
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
              // Active connections display
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

                {/* Individual spoke rows */}
                <div className="space-y-2">
                  {spokeConnections
                    .filter(c => c.status === 'active')
                    .map(connection => {
                      const count = spokeCounts[connection.id];
                      const hasError = count === -1;
                      return (
                        <div
                          key={connection.id}
                          className="flex items-center justify-between p-3 bg-slate-50 rounded-xl"
                        >
                          <div className="flex items-center space-x-2">
                            <div
                              className={`w-2 h-2 rounded-full ${
                                hasError ? 'bg-red-500' : 'bg-emerald-500'
                              }`}
                            />
                            <span className="text-xs font-bold text-slate-700 truncate max-w-[120px]">
                              {connection.name}
                            </span>
                          </div>
                          <span className="text-xs font-black text-slate-500">
                            {isLoadingCounts ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : hasError ? (
                              <span className="text-red-500">Error</span>
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
