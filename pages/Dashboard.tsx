
import React, { useState, useMemo } from 'react';
import { Profile, MarketingEvent, MarketingTask, ViewState, Brand } from '../types';
import { MOCK_BRIEFING } from '../constants';
import { 
  Globe, CheckSquare, ShoppingBag, Instagram, Sparkles, ChevronDown, 
  ChevronRight, X, UserPlus, Target, Heart, LifeBuoy, Clock, 
  ShieldAlert, Activity, Megaphone, BarChart3, PieChart, Zap,
  AlertCircle, ArrowRight
} from 'lucide-react';

interface DashboardProps {
  onViewChange?: (view: ViewState) => void;
  events: MarketingEvent[];
  tasks: MarketingTask[];
  profiles: Profile[];
  brand: Brand;
}

const Dashboard: React.FC<DashboardProps> = ({ onViewChange, events, tasks, profiles, brand }) => {
  const [isBriefingOpen, setIsBriefingOpen] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Simulation: Checking for items that need human action
  const pendingApprovalsCount = 2; 

  const stats = [
    { label: 'Total Global Profiles', value: profiles.length, icon: Globe, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Social Buzz Signals', value: events.filter(e => e.event_type === 'social_intent').length, icon: Instagram, color: 'text-pink-600', bg: 'bg-pink-50' },
    { label: 'Unified Support Load', value: MOCK_BRIEFING.detailed_analysis.support_load.open_tickets, icon: LifeBuoy, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Marketing Actions', value: tasks.filter(t => t.status !== 'completed').length, icon: CheckSquare, color: 'text-purple-600', bg: 'bg-purple-50' },
  ];

  // Calculate Site Distribution (Logic mirror of the 'site_load_stats' materialized view)
  const siteDistribution = useMemo(() => {
    const dist = profiles.reduce((acc, p) => {
      p.source_sites.forEach(site => {
        acc[site] = (acc[site] || 0) + 1;
      });
      return acc;
    }, {} as Record<string, number>);
    return Object.entries(dist).sort((a, b) => Number(b[1]) - Number(a[1]));
  }, [profiles]);

  return (
    <div className="space-y-8 pb-10">
      
      {/* High-Action Alert Strip */}
      {pendingApprovalsCount > 0 && (
        <div className="bg-emerald-600 text-white px-8 py-5 rounded-[2rem] shadow-xl flex items-center justify-between animate-in slide-in-from-top duration-500 border-4 border-emerald-500/50">
          <div className="flex items-center space-x-6">
            <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center animate-pulse">
              <Sparkles size={24} />
            </div>
            <div>
              <h4 className="text-lg font-black uppercase tracking-tight">Strategic Action Required</h4>
              <p className="text-emerald-100 text-xs font-bold">You have {pendingApprovalsCount} AI-generated drafts waiting for approval in the Social Hub.</p>
            </div>
          </div>
          <button 
            onClick={() => onViewChange?.('social-hub')}
            className="px-8 py-3 bg-white text-emerald-700 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-emerald-50 transition-all flex items-center space-x-3 shadow-lg"
          >
            <span>Go to Review Queue</span>
            <ArrowRight size={16} />
          </button>
        </div>
      )}

      {/* Sage Strategic Pulse - DARK THEME */}
      <div className="bg-slate-900 rounded-[2.5rem] border border-slate-800 shadow-2xl overflow-hidden transition-all duration-500 relative">
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-[100px] -mr-32 -mt-32"></div>
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-purple-500/10 rounded-full blur-[100px] -ml-32 -mb-32"></div>

        <button 
          onClick={() => setIsBriefingOpen(!isBriefingOpen)}
          className="w-full px-10 py-7 flex items-center justify-between hover:bg-white/5 transition relative z-10"
        >
          <div className="flex items-center space-x-5">
            <div 
              className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg transition-transform group-hover:scale-105"
              style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%)' }}
            >
              <Sparkles size={22} className="text-white fill-white/20" />
            </div>
            <div className="text-left">
              <h3 className="text-lg font-black text-white uppercase tracking-widest">Sage Strategic Pulse</h3>
              <div className="flex items-center space-x-3 mt-0.5">
                <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest flex items-center">
                  <Zap size={10} className="mr-1" /> Ecosystem Harmony: Active
                </span>
                <span className="text-slate-600 text-[10px]">•</span>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Brand Insights Engine</p>
              </div>
            </div>
          </div>
          <div className={`p-2 rounded-xl bg-white/5 text-slate-400 transition-all duration-500 ${isBriefingOpen ? 'rotate-180 bg-emerald-500/20 text-emerald-400' : ''}`}>
            <ChevronDown size={20} />
          </div>
        </button>

        {isBriefingOpen && (
          <div className="px-10 pb-10 animate-in fade-in slide-in-from-top-4 duration-500 relative z-10">
            <div className="p-8 bg-slate-800/50 rounded-3xl border border-slate-700/50 flex flex-col md:flex-row items-center justify-between gap-8 backdrop-blur-sm">
              <div className="space-y-2">
                <div className="flex items-center space-x-2 text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">
                  <Activity size={12} />
                  <span>Your Morning Briefing</span>
                </div>
                <p className="text-base font-medium text-slate-200 leading-relaxed max-w-2xl italic">
                  "{MOCK_BRIEFING.short_summary}"
                </p>
              </div>
              <button 
                onClick={() => setIsModalOpen(true)}
                className="px-8 py-3.5 bg-white text-slate-900 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-emerald-400 hover:text-white transition-all flex items-center space-x-3 shrink-0 shadow-xl"
              >
                <span>Full Ecosystem Health</span>
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 group hover:border-emerald-200 transition-all">
            <div className="flex justify-between items-start mb-4">
              <div className={`${stat.bg} ${stat.color} p-3 rounded-xl group-hover:scale-110 transition-transform`}>
                <stat.icon size={24} />
              </div>
            </div>
            <div>
              <p className="text-slate-500 text-sm font-medium">{stat.label}</p>
              <h3 className="text-2xl font-bold text-slate-800 mt-1">{stat.value}</h3>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          
          {/* Site Distribution & Growth (New Multi-Site Viz) */}
          <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm relative">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h3 className="text-lg font-black text-slate-800 flex items-center">
                  <PieChart size={20} className="mr-2 text-emerald-600" />
                  Site Activity Distribution
                </h3>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Real-time engagement across {siteDistribution.length} sites</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
               <div className="space-y-4">
                  {siteDistribution.map(([site, count], idx) => {
                    const totalProfiles = profiles.length;
                    const percentage = totalProfiles > 0 ? Math.round((Number(count) / totalProfiles) * 100) : 0;
                    const colors = ['bg-emerald-500', 'bg-indigo-500', 'bg-amber-500', 'bg-rose-500', 'bg-blue-500'];
                    return (
                      <div key={site} className="space-y-1.5">
                        <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-tighter">
                           <span className="text-slate-700">{site}</span>
                           <span className="text-slate-400">{count} profiles</span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                           <div 
                             className={`h-full ${colors[idx % colors.length]}`} 
                             style={{ width: `${percentage}%` }}
                           />
                        </div>
                      </div>
                    );
                  })}
               </div>
               <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                  <div className="flex items-center space-x-3 mb-4">
                     <Activity size={18} className="text-emerald-500" />
                     <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">Ecosystem Sync Health</h4>
                  </div>
                  <div className="text-4xl font-black text-slate-900 mb-2">99.8%</div>
                  <p className="text-[10px] text-slate-500 font-medium">High-speed delivery active. Sage matched 14 customer profiles across 3 spokes in the last 24h.</p>
               </div>
            </div>
          </div>

          {/* Activity Feed */}
          <div className="bg-white p-8 rounded-2xl border border-slate-100 shadow-sm">
            <h3 className="text-lg font-bold text-slate-800 mb-6 font-black uppercase tracking-tight">Recent Brand Interactions</h3>
            <div className="space-y-6">
              {events.slice(0, 5).map((event) => (
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

          <div className="bg-slate-900 p-8 rounded-3xl text-white relative overflow-hidden shadow-xl">
             <div className="absolute top-0 right-0 p-4 opacity-20">
                <Sparkles size={80} style={{ color: brand.primaryColor }} />
             </div>
             <h4 className="text-lg font-black mb-2">Strategic Dialogue</h4>
             <p className="text-slate-400 text-xs leading-relaxed mb-6">Ask Sage about audience trends, cross-site purchase behaviors, or campaign optimization ideas.</p>
             <button onClick={() => window.scrollTo(0, 1000)} className="text-[10px] font-black uppercase tracking-widest text-emerald-400 hover:text-emerald-300 transition underline">Start Strategic Discussion</button>
          </div>
        </div>
      </div>

      {/* Strategic Deep-Dive Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-4xl rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                 <div 
                   className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg"
                   style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%)' }}
                 >
                    <Sparkles size={24} className="text-white fill-white/20" />
                 </div>
                 <div>
                    <h3 className="text-2xl font-black text-slate-800">{brand.name} Ecosystem Health</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Brand Performance Insights</p>
                 </div>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:text-rose-500 transition">
                <X size={28} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-10 space-y-12 custom-scrollbar bg-slate-50/50">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                 <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                    <Target size={32} className="text-emerald-500 mb-6" />
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Campaign Momentum</h4>
                    <p className="text-4xl font-black text-slate-800 mb-2">{MOCK_BRIEFING.detailed_analysis.campaign_velocity.avg_ctr}</p>
                    <p className="text-slate-600 text-xs leading-relaxed italic">Customers on farm.sproutify.app are highly engaged right now.</p>
                 </div>
                 <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm">
                    <LifeBuoy size={32} className="text-amber-500 mb-6" />
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Team Responsiveness</h4>
                    <p className="text-4xl font-black text-slate-800 mb-2">{MOCK_BRIEFING.detailed_analysis.support_load.avg_response_time}</p>
                    <p className="text-slate-600 text-xs leading-relaxed italic">Response times are synchronized and fast across the ecosystem.</p>
                 </div>
              </div>
            </div>

            <div className="p-8 border-t border-slate-100 bg-white flex justify-end items-center space-x-4">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="px-10 py-3 bg-slate-900 text-white rounded-2xl font-black text-sm hover:bg-emerald-600 transition shadow-xl"
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
