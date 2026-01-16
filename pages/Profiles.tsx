
import React, { useState, useMemo, useEffect } from 'react';
import { Profile, MarketingEvent } from '../types';
import CustomerSitesTag from '../components/CustomerSitesTag';
import { getProfiles } from '../lib/supabaseService';
import {
  Search, Tag, MoreHorizontal, X, Edit3,
  History, Globe, GraduationCap, Sprout, Heart, Building2,
  FilterX, Users, MousePointer2, Sparkles, Zap,
  Clock, ArrowUpRight, DatabaseZap, ShieldCheck, Activity,
  Fingerprint, Loader2
} from 'lucide-react';

interface ProfilesProps {
  onTestFlow?: (email: string) => void;
  events: MarketingEvent[];
}

const SITE_ICONS: Record<string, any> = {
  'atlurbanfarms.com': Building2,
  'micro.sproutify.app': Sprout,
  'farm.sproutify.app': Sprout,
  'school.sproutify.app': GraduationCap,
  'letsrejoice.app': Heart,
};

const Profiles: React.FC<ProfilesProps> = ({ onTestFlow, events }) => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

  const [selectedSites, setSelectedSites] = useState<string[]>([]);
  const [selectedSegments, setSelectedSegments] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [subscriptionFilter, setSubscriptionFilter] = useState<'all' | 'subscribed' | 'unsubscribed'>('all');

  useEffect(() => {
    async function fetchProfiles() {
      try {
        setLoading(true);
        setError(null);
        const data = await getProfiles();
        setProfiles(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch profiles');
      } finally {
        setLoading(false);
      }
    }
    fetchProfiles();
  }, []);

  const selectedProfile = useMemo(() => 
    profiles.find(p => p.id === selectedProfileId) || null
  , [profiles, selectedProfileId]);

  const filterStats = useMemo(() => {
    const stats = {
      sites: {} as Record<string, number>,
      segments: {} as Record<string, number>,
      tags: {} as Record<string, number>,
      subscribed: 0,
      unsubscribed: 0
    };
    profiles.forEach(p => {
      p.source_sites.forEach(s => stats.sites[s] = (stats.sites[s] || 0) + 1);
      p.segments.forEach(seg => stats.segments[seg] = (stats.segments[seg] || 0) + 1);
      p.tags.forEach(t => stats.tags[t] = (stats.tags[t] || 0) + 1);
      if (p.is_subscribed) stats.subscribed++; else stats.unsubscribed++;
    });
    return stats;
  }, [profiles]);

  const filtered = useMemo(() => {
    return profiles.filter(p => {
      if (p.status !== 'active') return false;
      const matchesSearch = p.email.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           p.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           (p.spoke_uuid && p.spoke_uuid.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesSite = selectedSites.length === 0 || p.source_sites.some(s => selectedSites.includes(s));
      const matchesSegment = selectedSegments.length === 0 || p.segments.some(s => selectedSegments.includes(s));
      const matchesTag = selectedTags.length === 0 || p.tags.some(t => selectedTags.includes(t));
      const matchesSub = subscriptionFilter === 'all' || (subscriptionFilter === 'subscribed' ? p.is_subscribed : !p.is_subscribed);
      return matchesSearch && matchesSite && matchesSegment && matchesTag && matchesSub;
    });
  }, [profiles, searchTerm, selectedSites, selectedSegments, selectedTags, subscriptionFilter]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        <span className="ml-3 text-slate-600 font-medium">Loading profiles...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-8 text-center">
        <p className="text-red-700 font-bold mb-2">Failed to load profiles</p>
        <p className="text-red-600 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 relative h-full pb-20">
      <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input type="text" placeholder="Search by email, name, or Spoke UUID..." className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 transition shadow-inner font-bold text-sm" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <div className="flex items-center space-x-3">
             <div className="px-4 py-2 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center space-x-2">
                <DatabaseZap size={14} className="text-indigo-600" />
                <span className="text-[10px] font-black text-indigo-700 uppercase tracking-widest">Composite Sync: Active</span>
             </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[3rem] border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Profile Identity</th>
              <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Spoke UUID</th>
              <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Presence</th>
              <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Last Sync</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {filtered.map((profile) => (
              <tr key={profile.id} onClick={() => setSelectedProfileId(profile.id)} className={`hover:bg-slate-50/80 transition-all cursor-pointer group ${selectedProfileId === profile.id ? 'bg-emerald-50/50' : ''}`}>
                <td className="px-10 py-6">
                  <div className="flex items-center space-x-4">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg ${profile.is_subscribed ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{profile.first_name.charAt(0)}</div>
                    <div>
                      <p className="font-black text-slate-800 text-sm">{profile.first_name}</p>
                      <p className="text-[10px] text-slate-400 font-mono">{profile.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-10 py-6 text-center">
                   <div className="inline-flex items-center space-x-2 bg-slate-50 px-3 py-1 rounded-lg border border-slate-100">
                      <Fingerprint size={10} className="text-indigo-400" />
                      <span className="text-[10px] font-mono text-slate-600 font-bold">{profile.spoke_uuid || 'UNSET'}</span>
                   </div>
                </td>
                <td className="px-10 py-6"><CustomerSitesTag sites={profile.source_sites} /></td>
                <td className="px-10 py-6 text-right font-black text-[10px] text-slate-800">{new Date(profile.last_event_timestamp || profile.last_active || '').toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedProfile && (
        <>
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-40" onClick={() => setSelectedProfileId(null)}></div>
          <div className="fixed top-0 right-0 h-full w-full max-w-xl bg-white shadow-2xl z-50 animate-in slide-in-from-right duration-300 flex flex-col">
            <div className="p-10 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-black text-slate-800 uppercase tracking-widest text-xs">Identity Intelligence Slide</h3>
              <button onClick={() => setSelectedProfileId(null)} className="p-2 text-slate-400 hover:text-slate-900 bg-slate-50 rounded-xl"><X size={24} /></button>
            </div>
            <div className="p-10 space-y-10 flex-1 overflow-y-auto custom-scrollbar">
               <div className="flex items-center space-x-6">
                  <div className={`w-24 h-24 rounded-[2.5rem] flex items-center justify-center text-4xl font-black ${selectedProfile.is_subscribed ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{selectedProfile.first_name.charAt(0)}</div>
                  <div>
                    <h4 className="text-2xl font-black text-slate-800">{selectedProfile.first_name}</h4>
                    <p className="text-sm text-slate-400 font-mono mb-4">{selectedProfile.email}</p>
                    <div className="space-y-2">
                       <div className="px-4 py-2 bg-slate-50 border border-slate-100 text-slate-400 rounded-xl text-[10px] font-black uppercase tracking-widest italic flex items-center">
                          <ShieldCheck size={14} className="mr-2" /> Composite Identity Lock
                       </div>
                       <div className="px-4 py-2 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center">
                          <Fingerprint size={14} className="mr-2" /> ID: {selectedProfile.spoke_uuid}
                       </div>
                    </div>
                  </div>
               </div>
               <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                     <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Estimated LTV</p>
                     <p className="text-2xl font-black text-slate-800">${selectedProfile.ltv.toLocaleString()}</p>
                  </div>
                  <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100">
                     <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Engagement Pulse</p>
                     <p className="text-2xl font-black text-emerald-600">{selectedProfile.engagement_score || 85}%</p>
                  </div>
               </div>
               <div className="bg-indigo-900 p-8 rounded-[2.5rem] text-white relative overflow-hidden shadow-xl">
                  <div className="absolute top-0 right-0 p-4 opacity-10"><Sparkles size={80} /></div>
                  <h5 className="text-[10px] font-black text-indigo-300 uppercase tracking-widest mb-4">Sage Orchestration Advice</h5>
                  <p className="text-sm font-medium italic mb-6">"Identify user behavior across {selectedProfile.source_sites.length} spokes. UUID tracking ensures identity pivots are captured during email migration."</p>
                  <button onClick={() => onTestFlow?.(selectedProfile.email)} className="w-full py-4 bg-indigo-500 hover:bg-indigo-400 text-white rounded-xl text-xs font-black uppercase tracking-widest transition">Preview Sync Strategy</button>
               </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Profiles;
