
import React, { useState, useMemo, useEffect } from 'react';
import { Profile, MarketingEvent, Branch, SpokeConnection } from '../types';
import { getProfiles, fetchBranches } from '../lib/supabaseService';
import { fetchAllSpokesProfiles, NormalizedSpokeProfile } from '../spokeConnector';
import {
  Search, Tag, MoreHorizontal, X, Edit3,
  History, Globe, GraduationCap, Sprout, Heart, Building2,
  FilterX, Users, MousePointer2, Sparkles, Zap,
  Clock, ArrowUpRight, DatabaseZap, ShieldCheck, Activity,
  Fingerprint, Loader2, GitBranch, ChevronLeft, ChevronRight,
  Radio, RefreshCw, AlertCircle, Link
} from 'lucide-react';

interface ProfilesProps {
  onTestFlow?: (email: string) => void;
  events: MarketingEvent[];
  spokeConnections: SpokeConnection[];
}

const SITE_ICONS: Record<string, any> = {
  'atlurbanfarms.com': Building2,
  'micro.sproutify.app': Sprout,
  'farm.sproutify.app': Sprout,
  'school.sproutify.app': GraduationCap,
  'letsrejoice.app': Heart,
};

// BranchBadge component for displaying branch pills
const BranchBadge: React.FC<{ slug: string; branchMap: Record<string, Branch> }> = ({ slug, branchMap }) => {
  const branch = branchMap[slug];

  if (branch) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase text-white"
        style={{ backgroundColor: branch.primary_color }}
      >
        <GitBranch size={10} />
        {branch.name}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase bg-slate-200 text-slate-600">
      <GitBranch size={10} />
      {slug}
    </span>
  );
};

const Profiles: React.FC<ProfilesProps> = ({ onTestFlow, events, spokeConnections }) => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Federated data state
  const [federatedProfiles, setFederatedProfiles] = useState<NormalizedSpokeProfile[]>([]);
  const [isFederating, setIsFederating] = useState(false);
  const [federationError, setFederationError] = useState<string | null>(null);
  const [dataSource, setDataSource] = useState<'local' | 'federated'>('local');
  const [selectedSpokeIds, setSelectedSpokeIds] = useState<Set<string>>(new Set());

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

  const [selectedSites, setSelectedSites] = useState<string[]>([]);
  const [selectedSegments, setSelectedSegments] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [subscriptionFilter, setSubscriptionFilter] = useState<'all' | 'subscribed' | 'unsubscribed'>('all');
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string | null>(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);
        const [profilesData, branchesData] = await Promise.all([
          getProfiles(),
          fetchBranches()
        ]);
        setProfiles(profilesData);
        setBranches(branchesData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch data');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const handleFetchFederated = async () => {
    setIsFederating(true);
    setFederationError(null);
    try {
      const selectedConnections = spokeConnections.filter(
        c => c.status === 'active' && selectedSpokeIds.has(c.id)
      );
      const { profiles: fetchedProfiles, errors } = await fetchAllSpokesProfiles(selectedConnections);
      setFederatedProfiles(fetchedProfiles);
      setDataSource('federated');

      // Show any errors that occurred during fetching
      if (errors.length > 0) {
        setFederationError(errors.join('; '));
      }
    } catch (err) {
      setFederationError(err instanceof Error ? err.message : 'Failed to fetch');
    } finally {
      setIsFederating(false);
    }
  };

  const toggleSpokeSelection = (id: string) => {
    setSelectedSpokeIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllSpokes = () => {
    const activeIds = spokeConnections.filter(c => c.status === 'active').map(c => c.id);
    setSelectedSpokeIds(new Set(activeIds));
  };

  const clearSpokeSelection = () => {
    setSelectedSpokeIds(new Set());
  };

  const activeConnectionCount = spokeConnections.filter(c => c.status === 'active').length;

  // Build branchMap for fast lookup by slug
  const branchMap = useMemo(() => {
    return branches.reduce((acc, branch) => {
      acc[branch.slug] = branch;
      return acc;
    }, {} as Record<string, Branch>);
  }, [branches]);

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
      p.branches.forEach(s => stats.sites[s] = (stats.sites[s] || 0) + 1);
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
      const matchesSite = selectedSites.length === 0 || p.branches.some(s => selectedSites.includes(s));
      const matchesSegment = selectedSegments.length === 0 || p.segments.some(s => selectedSegments.includes(s));
      const matchesTag = selectedTags.length === 0 || p.tags.some(t => selectedTags.includes(t));
      const matchesSub = subscriptionFilter === 'all' || (subscriptionFilter === 'subscribed' ? p.is_subscribed : !p.is_subscribed);
      const matchesBranch = selectedBranchFilter === null || p.branches.includes(selectedBranchFilter);
      return matchesSearch && matchesSite && matchesSegment && matchesTag && matchesSub && matchesBranch;
    });
  }, [profiles, searchTerm, selectedSites, selectedSegments, selectedTags, subscriptionFilter, selectedBranchFilter]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedSites, selectedSegments, selectedTags, subscriptionFilter, selectedBranchFilter]);

  // Pagination calculations
  const totalPages = Math.ceil(filtered.length / pageSize);
  const paginatedProfiles = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filtered.slice(startIndex, startIndex + pageSize);
  }, [filtered, currentPage, pageSize]);

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

        {/* Data Source Toggle */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-4 border-t border-slate-100">
          <div className="flex items-center space-x-4">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data Source</label>
            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => setDataSource('local')}
                className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                  dataSource === 'local'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Local
              </button>
              <button
                onClick={() => setDataSource('federated')}
                className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                  dataSource === 'federated'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Live Spokes
              </button>
            </div>
          </div>

          {activeConnectionCount > 0 && (
            <div className="px-3 py-1.5 bg-emerald-50 border border-emerald-100 rounded-lg flex items-center space-x-2">
              <Link size={12} className="text-emerald-600" />
              <span className="text-[10px] font-bold text-emerald-700">
                {activeConnectionCount} active connection{activeConnectionCount !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>

        {/* Spoke Picker - only show in federated mode with active connections */}
        {dataSource === 'federated' && activeConnectionCount > 0 && (
          <div className="pt-4 border-t border-slate-100 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Select Data Sources</label>
              <div className="flex items-center space-x-3">
                <button
                  onClick={selectAllSpokes}
                  className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700 transition"
                >
                  Select All
                </button>
                <span className="text-slate-300">|</span>
                <button
                  onClick={clearSpokeSelection}
                  className="text-[10px] font-bold text-slate-500 hover:text-slate-700 transition"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {spokeConnections.filter(c => c.status === 'active').map((connection) => {
                const isSelected = selectedSpokeIds.has(connection.id);
                return (
                  <button
                    key={connection.id}
                    onClick={() => toggleSpokeSelection(connection.id)}
                    className={`flex items-center space-x-2 px-3 py-2 rounded-lg border-2 transition-all ${
                      isSelected
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-700'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded flex items-center justify-center ${
                        isSelected ? 'bg-emerald-600' : 'bg-slate-100 border border-slate-300'
                      }`}
                    >
                      {isSelected && (
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    <span className="text-xs font-bold">{connection.name}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center space-x-3 pt-2">
              <button
                onClick={handleFetchFederated}
                disabled={isFederating || selectedSpokeIds.size === 0}
                className="flex items-center space-x-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-xs hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isFederating ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <Radio size={14} />
                )}
                <span>
                  {isFederating
                    ? 'Fetching...'
                    : selectedSpokeIds.size === 0
                    ? 'Select Spokes to Fetch'
                    : `Fetch from ${selectedSpokeIds.size} Spoke${selectedSpokeIds.size !== 1 ? 's' : ''}`
                  }
                </span>
              </button>

              {selectedSpokeIds.size > 0 && (
                <span className="text-[10px] font-bold text-slate-400">
                  {selectedSpokeIds.size} of {activeConnectionCount} selected
                </span>
              )}
            </div>
          </div>
        )}

        {dataSource === 'federated' && activeConnectionCount === 0 && (
          <div className="pt-4 border-t border-slate-100">
            <div className="px-4 py-3 bg-amber-50 border border-amber-100 rounded-xl flex items-center space-x-2">
              <AlertCircle size={16} className="text-amber-600" />
              <span className="text-sm font-bold text-amber-700">No active connections. Add connections in Settings → Connections.</span>
            </div>
          </div>
        )}

        {federationError && (
          <div className="flex items-center space-x-2 p-3 bg-rose-50 border border-rose-100 rounded-xl">
            <AlertCircle size={16} className="text-rose-500" />
            <span className="text-sm font-bold text-rose-700">{federationError}</span>
          </div>
        )}

        {/* Branch Filter Row */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pt-4 border-t border-slate-100">
          <div className="flex items-center space-x-4">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Filter by Branch</label>
            <div className="relative">
              <select
                value={selectedBranchFilter || ''}
                onChange={(e) => setSelectedBranchFilter(e.target.value || null)}
                className="appearance-none bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 pr-10 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
              >
                <option value="">All Branches</option>
                {branches.map((branch) => (
                  <option key={branch.slug} value={branch.slug}>
                    {branch.name}
                  </option>
                ))}
              </select>
              <GitBranch size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
            {selectedBranchFilter && branchMap[selectedBranchFilter] && (
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: branchMap[selectedBranchFilter].primary_color }}
              />
            )}
          </div>
          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            {dataSource === 'local'
              ? `Showing ${filtered.length} of ${profiles.filter(p => p.status === 'active').length} profiles`
              : `Showing ${federatedProfiles.length} federated profiles`
            }
          </div>
        </div>
      </div>

      <div className="bg-white rounded-[3rem] border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">Profile Identity</th>
              <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">
                {dataSource === 'local' ? 'Spoke UUID' : 'Source'}
              </th>
              <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {dataSource === 'local' ? 'Presence' : 'Contact'}
              </th>
              <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">
                {dataSource === 'local' ? 'Last Sync' : 'Status'}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {dataSource === 'local' ? (
              paginatedProfiles.map((profile) => (
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
                  <td className="px-10 py-6">
                    <div className="flex flex-wrap gap-1">
                      {profile.branches.map((slug) => (
                        <BranchBadge key={slug} slug={slug} branchMap={branchMap} />
                      ))}
                    </div>
                  </td>
                  <td className="px-10 py-6 text-right font-black text-[10px] text-slate-800">{new Date(profile.last_event_timestamp || profile.last_active || '').toLocaleDateString()}</td>
                </tr>
              ))
            ) : (
              federatedProfiles.map((profile, index) => (
                <tr key={`${profile._spoke_id}-${profile.email}-${index}`} className="hover:bg-slate-50/80 transition-all">
                  <td className="px-10 py-6">
                    <div className="flex items-center space-x-4">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-lg ${profile.subscribed ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {(profile.first_name || profile.email || '?').charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-black text-slate-800 text-sm">
                          {profile.first_name || profile.email.split('@')[0]}
                          {profile.last_name && ` ${profile.last_name}`}
                        </p>
                        <p className="text-[10px] text-slate-400 font-mono">{profile.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-10 py-6 text-center">
                    <div className="inline-flex items-center space-x-2 bg-indigo-50 px-3 py-1 rounded-lg border border-indigo-100">
                      <Link size={10} className="text-indigo-500" />
                      <span className="text-[10px] font-bold text-indigo-700">{profile._spoke_name}</span>
                    </div>
                  </td>
                  <td className="px-10 py-6">
                    <div className="flex flex-wrap gap-2">
                      {profile.phone && (
                        <span className="text-[10px] font-mono text-slate-500 bg-slate-50 px-2 py-1 rounded border border-slate-100">
                          {profile.phone}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-10 py-6 text-right">
                    <span className={`inline-flex items-center px-2 py-1 rounded-lg text-[10px] font-bold uppercase ${
                      profile.subscribed
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                        : 'bg-slate-50 text-slate-500 border border-slate-100'
                    }`}>
                      {profile.subscribed ? 'Subscribed' : 'Unsubscribed'}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {/* Pagination Controls */}
        <div className="px-10 py-6 border-t border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Per page</label>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="appearance-none bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <ChevronLeft size={18} className="text-slate-600" />
            </button>

            <div className="flex items-center space-x-1">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum: number;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`w-10 h-10 rounded-xl text-sm font-bold transition ${
                      currentPage === pageNum
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || totalPages === 0}
              className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <ChevronRight size={18} className="text-slate-600" />
            </button>
          </div>

          <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
            Page {currentPage} of {totalPages || 1}
          </div>
        </div>
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
                  <p className="text-sm font-medium italic mb-6">"Identify user behavior across {selectedProfile.branches.length} spokes. UUID tracking ensures identity pivots are captured during email migration."</p>
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
