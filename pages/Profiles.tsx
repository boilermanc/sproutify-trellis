import { matchesCollectionFilter } from '../services/profileCollection.mjs';
import { profileDisplayName } from '../services/profileIdentity.mjs';
import { ProfileMembership } from '../components/ProfileMembership';
import { currentSubscription, subscriptionState, compareProfileSubscriptions } from '../services/profileSubscriptions.mjs';

import React, { useState, useMemo, useEffect } from 'react';
import { Profile, MarketingEvent, Branch, SpokeConnection, EnrichedProfile, BranchStatsResult, BranchContext, BranchConsentMap, BranchConsentEntry } from '../types';
import { Article } from '../src/data/helpContent';
import HelpLink from '../src/components/HelpLink';
import { fetchBranches } from '../lib/supabaseService';
import { supabase } from '../supabaseService';
import { getConsentSummary, updateBranchConsent } from '../consentUtils';
import {
  Search, Tag, MoreHorizontal, X, Edit3,
  History, Globe, GraduationCap, Sprout, Heart, Building2,
  FilterX, Users, MousePointer2, Sparkles, Zap,
  Clock, ArrowUpRight, ShieldCheck, Activity,
  Fingerprint, Loader2, GitBranch, ChevronLeft, ChevronRight,
  Radio, RefreshCw, AlertCircle, DollarSign, Calendar,
  SlidersHorizontal, ChevronDown
} from 'lucide-react';
import { ProfileDetailDrawer } from './ProfileDetailDrawer';
import { getConsentLabel } from '../utils';

interface ProfilesProps {
  onTestFlow?: (email: string) => void;
  events: MarketingEvent[];
  spokeConnections: SpokeConnection[];
  branchStats: BranchStatsResult;
  branchContext?: BranchContext;
  onOpenArticle?: (article: Article) => void;
}

const SITE_ICONS: Record<string, any> = {
'atlurbanfarms.com': Building2,
'micro.sproutify.app': Sprout,
'farm.sproutify.app': Sprout,
'school.sproutify.app': GraduationCap,
'letsrejoice.app': Heart,
};

const ATL_SPOKE_PROJECT_REF = 'povudgtvzggnxwgtjexa';
const isAtlProfileSource = (source: { name?: string; supabase_url?: string }) => {
  const normalizedName = String(source.name || '').toLowerCase().replace(/\.(com|app|io|net|org)$/, '').replace(/[^a-z0-9]/g, '');
  return normalizedName === 'atlurbanfarms' || String(source.supabase_url || '').includes(ATL_SPOKE_PROJECT_REF);
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

const profileLastLoginAt = (profile: EnrichedProfile): string | undefined => {
  const metadata = profile.metadata || {};
  const candidates = [
    profile.last_login_at,
    metadata.last_login_at,
    metadata.last_sign_in_at,
    metadata.last_seen_at,
  ];
  return candidates.find(value => typeof value === 'string' && value.length > 0 && !Number.isNaN(new Date(value).getTime()));
};

const formatListDate = (value?: string): string => value
  ? new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  : '—';

const Profiles: React.FC<ProfilesProps> = ({ onTestFlow, events, spokeConnections, branchStats, branchContext, onOpenArticle }) => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Profiles always read from the live business sources. The legacy local
  // profile path remains below for now, but it is no longer exposed as a user
  // choice on the Profiles screen.
  const [dataSource] = useState<'local' | 'federated'>('federated');
  const [selectedSpokeIds, setSelectedSpokeIds] = useState<Set<string>>(new Set());
  const [selectedFederatedProfile, setSelectedFederatedProfile] = useState<EnrichedProfile | null>(null);

  // Derive federated profiles from branchStats filtered by selected spokes.
  // Nothing is shown until the user picks at least one branch — an empty
  // selection means "no branch chosen yet", not "show everything".
  const federatedProfiles = useMemo(() => {
    if (selectedSpokeIds.size === 0) return [];
    return branchStats.enrichedProfiles.filter(p => selectedSpokeIds.has(p._spoke_id));
  }, [branchStats.enrichedProfiles, selectedSpokeIds]);

  // Selectable data sources = active spoke connections + Hub-native branches.
  // ATL remains active for Campaign Builder and live newsletter sends; it is
  // intentionally omitted only from this customer-profile browser.
  // (still-janes-daughter and friends have no spoke DB, so they would otherwise
  // never appear in the picker and their subscribers stay invisible here).
  const dataSources = useMemo(() => ([
    ...spokeConnections
      .filter(c => c.status === 'active' && !isAtlProfileSource(c))
      .map(c => ({ id: c.id, name: c.name, isHub: false })),
    ...(branchStats.hubSources || [])
      .filter(s => !isAtlProfileSource(s))
      .map(s => ({ id: s.id, name: s.name, isHub: true })),
  ]), [spokeConnections, branchStats.hubSources]);
  const isFederating = branchStats.isLoading;
  const federationError = branchStats.errors.length > 0 ? branchStats.errors.join('; ') : null;

  const profileStats = useMemo(() => {
    if (federatedProfiles.length === 0) return null;

    const withOrders = federatedProfiles.filter(p => p.order_stats && p.order_stats.order_count > 0);
    const totalLTV = withOrders.reduce((sum, p) => sum + (p.order_stats?.ltv || 0), 0);
    const totalOrders = withOrders.reduce((sum, p) => sum + (p.order_stats?.order_count || 0), 0);
    const vipCount = withOrders.filter(p => (p.order_stats?.ltv || 0) >= 50).length;
    const avgOrderValue = totalOrders > 0 ? totalLTV / totalOrders : 0;

    // Consent breakdown
    const optedIn = federatedProfiles.filter(p => p.subscribed === true).length;
    const optedOut = federatedProfiles.filter(p => p.subscribed === false).length;
    const consentUnverified = federatedProfiles.filter(p => p.subscribed === undefined || p.subscribed === null).length;

    return {
      totalProfiles: federatedProfiles.length,
      withOrders: withOrders.length,
      withoutOrders: federatedProfiles.length - withOrders.length,
      totalLTV,
      totalOrders,
      vipCount,
      avgOrderValue,
      optedIn,
      optedOut,
      consentUnverified,
    };
  }, [federatedProfiles]);

  const [searchTerm, setSearchTerm] = useState('');
  const [planFilter, setPlanFilter] = useState('all');
  const [activityFilter, setActivityFilter] = useState('all');
  const [collectionFilter, setCollectionFilter] = useState('all');
  const [profileSort, setProfileSort] = useState('signup-newest');
  const [showFilters, setShowFilters] = useState(false);
  const [showMoreStats, setShowMoreStats] = useState(false);
  const planOptions = useMemo(() => [...new Set(federatedProfiles.map(p => currentSubscription(p.subscription_records)?.plan).filter(Boolean))].sort() as string[], [federatedProfiles]);
  useEffect(() => { setPlanFilter('all'); }, [selectedSpokeIds]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);

  const [editingConsent, setEditingConsent] = useState<BranchConsentMap | null>(null);
  const [consentSaveStatus, setConsentSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [consentSaveError, setConsentSaveError] = useState<string | null>(null);

  const [selectedSites, setSelectedSites] = useState<string[]>([]);
  const [selectedSegments, setSelectedSegments] = useState<string[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [subscriptionFilter, setSubscriptionFilter] = useState<'all' | 'subscribed' | 'unsubscribed'>('all');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Fetch branches for display.
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        setError(null);
        // Prefer branchContext.allBranches if available, otherwise fetch independently
        if (branchContext && branchContext.allBranches.length > 0) {
          setBranches(branchContext.allBranches as any);
        } else {
          const branchesData = await fetchBranches();
          setBranches(branchesData);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch data');
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [branchContext]);

  // Do not auto-select on mount. The operator deliberately chooses one
  // business before any customer profiles are shown.

  const selectBusiness = (id: string) => {
    setSelectedSpokeIds(new Set([id]));
    setSelectedFederatedProfile(null);
    setPlanFilter('all');
    setActivityFilter('all');
    setCollectionFilter('all');
    setProfileSort('signup-newest');
    setCurrentPage(1);
  };

  const activeConnectionCount = dataSources.length;
  const selectedBusinessId = selectedSpokeIds.size === 1 ? Array.from(selectedSpokeIds)[0] : '';
  const selectedBusiness = dataSources.find(source => source.id === selectedBusinessId);
  const showMembershipColumn = selectedBusiness?.name.toLowerCase().includes('rekkrd') ?? false;
  const showLastLoginColumn = federatedProfiles.some(profile => Boolean(profileLastLoginAt(profile)));
  const showOrdersColumn = federatedProfiles.some(profile => Boolean(profile.order_stats));
  const activeFilterCount = (showMembershipColumn ? [planFilter, activityFilter, collectionFilter] : [])
    .filter(value => value !== 'all').length;

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

  useEffect(() => {
    if (selectedProfile) {
      setEditingConsent(getConsentSummary(selectedProfile));
    } else {
      setEditingConsent(null);
    }
  }, [selectedProfile]);

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
      return matchesSearch && matchesSite && matchesSegment && matchesTag && matchesSub;
    });
  }, [profiles, searchTerm, selectedSites, selectedSegments, selectedTags, subscriptionFilter]);

  // Federated view renders federatedProfiles directly, so the search box has to
  // filter THIS list (the 'filtered' memo above only feeds the 'local' view).
  const filteredFederatedProfiles = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return federatedProfiles.filter(p =>
      !q || (p.email && p.email.toLowerCase().includes(q)) ||
      (p.first_name && p.first_name.toLowerCase().includes(q)) ||
      (p.last_name && p.last_name.toLowerCase().includes(q)) ||
      (p.phone && p.phone.toLowerCase().includes(q)) ||
      (p.id && p.id.toLowerCase().includes(q))
    )
    .filter(p => planFilter === 'all' || (planFilter === '__unknown' ? !currentSubscription(p.subscription_records)?.plan : currentSubscription(p.subscription_records)?.plan === planFilter))
    .filter(p => activityFilter === 'all' || subscriptionState(currentSubscription(p.subscription_records)) === activityFilter)
    .filter(p => matchesCollectionFilter(p, collectionFilter))
    .sort((a, b) => compareProfileSubscriptions(a, b, profileSort));
  }, [federatedProfiles, searchTerm, planFilter, activityFilter, collectionFilter, profileSort]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, selectedSites, selectedSegments, selectedTags, subscriptionFilter, selectedSpokeIds, planFilter, activityFilter, collectionFilter, profileSort, dataSource]);

  // Pagination calculations
  const totalPages = Math.ceil((dataSource === 'federated' ? filteredFederatedProfiles.length : filtered.length) / pageSize);
  const paginatedFederatedProfiles = filteredFederatedProfiles.slice((currentPage - 1) * pageSize, currentPage * pageSize);
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
      <div className="bg-red-50 border border-red-200 rounded-sm p-8 text-center">
        <p className="text-red-700 font-bold mb-2">Failed to load profiles</p>
        <p className="text-red-600 text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 relative h-full pb-20">
      <div className="bg-white rounded-sm border border-slate-200 overflow-hidden">
        {/* Compact command bar: business, search, filters, and refresh share one row. */}
        <div className="flex flex-col xl:flex-row xl:items-center gap-3 p-3" role="group" aria-label="Profile command bar">
          <label className="sr-only" htmlFor="profile-business">Select business</label>
          <select
            id="profile-business"
            aria-label="Select business"
            value={selectedBusinessId}
            onChange={(event) => event.target.value && selectBusiness(event.target.value)}
            disabled={activeConnectionCount === 0}
            className="h-11 w-full xl:w-56 bg-white border border-slate-200 rounded-sm px-3 text-sm font-bold text-black focus:outline-none focus:ring-2 focus:ring-emerald-500 disabled:bg-slate-50 disabled:text-black"
          >
            <option value="">Choose a business</option>
            {dataSources.map((connection) => (
              <option key={connection.id} value={connection.id}>{connection.name}</option>
            ))}
          </select>

          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="search"
              aria-label="Search profiles"
              placeholder="Search by name, email, phone, or customer ID..."
              className="h-11 w-full pl-10 pr-3 bg-slate-50 border border-slate-200 rounded-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 transition font-bold text-sm text-black placeholder:text-black"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              disabled={!selectedBusinessId}
            />
          </div>

          <button
            type="button"
            aria-expanded={showFilters}
            aria-controls="profile-filters"
            onClick={() => setShowFilters(value => !value)}
            disabled={!selectedBusinessId}
            className="h-11 inline-flex items-center justify-center gap-2 px-4 bg-white border border-slate-200 rounded-sm text-xs font-bold text-black hover:bg-slate-50 transition disabled:opacity-50"
          >
            <SlidersHorizontal size={15} />
            Filters
            {activeFilterCount > 0 && (
              <span className="min-w-5 h-5 px-1 rounded-full bg-slate-800 text-white text-[10px] inline-flex items-center justify-center">{activeFilterCount}</span>
            )}
          </button>

          <button
            type="button"
            onClick={() => branchStats.refresh()}
            disabled={isFederating || activeConnectionCount === 0}
            className="h-11 inline-flex items-center justify-center gap-2 px-4 bg-emerald-600 text-white rounded-sm font-bold text-xs hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw size={14} className={isFederating ? 'animate-spin' : ''} />
            <span>{isFederating ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>

        {/* KPI Summary Bar */}
        {dataSource === 'federated' && profileStats && (
          <div className="flex flex-wrap items-center gap-y-2 border-t border-slate-100 px-3 py-2.5">
            <div className="flex items-baseline gap-1.5 pr-4 mr-4 border-r border-slate-200">
              <span className="text-base font-black text-black">{profileStats.totalProfiles}</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-black">profiles</span>
            </div>
            {showOrdersColumn && <>
              <div className="flex items-baseline gap-1.5 pr-4 mr-4 border-r border-slate-200">
                <span className="text-base font-black text-black">{profileStats.totalOrders.toLocaleString()}</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-black">orders</span>
              </div>
              <div className="flex items-baseline gap-1.5 pr-4 mr-4 border-r border-slate-200">
                <span className="text-base font-black text-black">${profileStats.totalLTV.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-black">revenue</span>
              </div>
            </>}
            <div className="flex items-baseline gap-1.5 pr-4 mr-4 border-r border-slate-200">
              <span className="text-base font-black text-black">{profileStats.optedIn}</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-black">opted in</span>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-base font-black text-black">{profileStats.optedOut}</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-black">opted out</span>
            </div>
            <button
              type="button"
              aria-expanded={showMoreStats}
              onClick={() => setShowMoreStats(value => !value)}
              className="ml-auto inline-flex items-center gap-1 px-2 py-1 text-[10px] font-bold text-black"
            >
              More stats <ChevronDown size={13} className={`transition-transform ${showMoreStats ? 'rotate-180' : ''}`} />
            </button>
            {showMoreStats && (
              <div className="basis-full flex flex-wrap gap-x-6 gap-y-1 pt-2 border-t border-slate-100 text-xs text-black">
                {showOrdersColumn && <>
                  <span><b>${profileStats.avgOrderValue.toFixed(2)}</b> average order</span>
                  <span><b>{profileStats.vipCount}</b> VIP customers</span>
                  <span><b>{profileStats.withOrders}</b> profiles with orders</span>
                </>}
                {profileStats.consentUnverified > 0 && <span><b>{profileStats.consentUnverified}</b> consent unverified</span>}
              </div>
            )}
          </div>
        )}

        {dataSource === 'federated' && selectedSpokeIds.size > 0 && showFilters && (
          <div id="profile-filters" className="border-t border-slate-100 bg-slate-50/70 p-3 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[repeat(4,minmax(0,1fr))_auto] gap-3 items-end">
              {showMembershipColumn && <>
                <label className="text-[10px] font-bold uppercase tracking-wider text-black">Plan
                  <select aria-label="Plan filter" value={planFilter} onChange={event => setPlanFilter(event.target.value)} className="block w-full mt-1 border border-slate-200 bg-white rounded-sm p-2 text-xs normal-case tracking-normal text-black">
                    <option value="all">All plans</option><option value="__unknown">Unknown plan</option>
                    {planOptions.map(plan => <option key={plan} value={plan}>{plan}</option>)}
                  </select>
                </label>
                <label className="text-[10px] font-bold uppercase tracking-wider text-black">Subscription activity
                  <select aria-label="Subscription activity" value={activityFilter} onChange={event => setActivityFilter(event.target.value)} className="block w-full mt-1 border border-slate-200 bg-white rounded-sm p-2 text-xs normal-case tracking-normal text-black">
                    <option value="all">All activity</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="unknown">Unknown</option>
                  </select>
                </label>
                <label className="text-[10px] font-bold uppercase tracking-wider text-black">Collection
                  <select aria-label="Collection filter" value={collectionFilter} onChange={event => setCollectionFilter(event.target.value)} className="block w-full mt-1 border border-slate-200 bg-white rounded-sm p-2 text-xs normal-case tracking-normal text-black">
                    <option value="all">All collections</option><option value="empty">No records yet</option><option value="has_records">Has records</option><option value="unknown">Count unknown</option>
                  </select>
                </label>
              </>}
              <label className="text-[10px] font-bold uppercase tracking-wider text-black">Sort profiles
                <select aria-label="Sort profiles" value={profileSort} onChange={event => setProfileSort(event.target.value)} className="block w-full mt-1 border border-slate-200 bg-white rounded-sm p-2 text-xs normal-case tracking-normal text-black">
                  <option value="signup-newest">Signup: newest first</option><option value="signup-oldest">Signup: oldest first</option>
                  {showMembershipColumn && <><option value="plan">Plan: A–Z</option><option value="active">Active first</option><option value="ending">End date: earliest first</option><option value="records">Records added: most first</option></>}
                </select>
              </label>
              <button onClick={() => { setPlanFilter('all'); setActivityFilter('all'); setCollectionFilter('all'); setSearchTerm(''); }} className="h-9 px-2 text-xs font-bold text-black">Clear filters</button>
            </div>
            {showMembershipColumn && collectionFilter === 'empty' && <p className="text-xs text-black">Only confirmed empty collections are included. To target Rekkrd users, select Rekkrd in Campaign Builder and choose the saved audience “Rekkrd: No records yet”. Email consent and suppression still apply.</p>}
            {showMembershipColumn && <p className="text-[11px] text-black">Activity uses reported subscription status and period dates—not email consent or recent app usage. Missing data stays unknown.</p>}
          </div>
        )}

        {activeConnectionCount === 0 && (
          <div className="border-t border-slate-100 p-3">
            <div className="px-4 py-3 bg-amber-50 border border-amber-100 rounded-sm flex items-center space-x-2">
              <AlertCircle size={16} className="text-amber-600" />
              <span className="text-sm font-bold text-amber-700">No active connections. Add connections in Settings → Connections.</span>
            </div>
          </div>
        )}

        {federationError && (
          <div className="border-t border-slate-100 p-3 flex items-center space-x-2 bg-rose-50">
            <AlertCircle size={16} className="text-rose-500" />
            <span className="text-sm font-bold text-rose-700">{federationError}</span>
          </div>
        )}
      </div>
      {/* Empty-selection gate: in federated mode, require a branch pick before loading profiles */}
      {dataSource === 'federated' && activeConnectionCount > 0 && selectedSpokeIds.size === 0 ? (
        <div className="bg-white rounded-[3rem] border border-slate-200  p-12 sm:p-20 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-sm bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-5">
            <GitBranch size={28} className="text-emerald-600" />
          </div>
          <h3 className="text-lg font-black text-black">Select a business to view profiles</h3>
          <p className="mt-2 max-w-md text-sm font-bold text-black">
            Choose one business above. Each business keeps its own customer profiles, communications, consent, and order history.
          </p>
        </div>
      ) : (
      <div className="bg-white rounded-[3rem] border border-slate-200  overflow-hidden">
        {/* Mobile cards — the full table is unreadable on a phone */}
        <div className="lg:hidden divide-y divide-slate-50">
          {dataSource === 'local' ? (
            paginatedProfiles.map((profile) => (
              <button
                key={profile.id}
                onClick={() => setSelectedProfileId(profile.id)}
                className={`w-full text-left flex items-center gap-3 p-4 text-black transition ${selectedProfileId === profile.id ? 'bg-emerald-50/50' : 'hover:bg-slate-50/80'}`}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-black text-black text-sm truncate">{profileDisplayName(profile)}</p>
                  <p className="text-[10px] text-black font-mono truncate">{profile.email}</p>
                  {profile.branches.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {profile.branches.map((slug) => (
                        <BranchBadge key={slug} slug={slug} branchMap={branchMap} />
                      ))}
                    </div>
                  )}
                </div>
                <ChevronRight size={16} className="text-slate-300 shrink-0" />
              </button>
            ))
          ) : (
            paginatedFederatedProfiles.map((profile, index) => (
              <button
                key={`${profile._spoke_id}-${profile.email}-${index}`}
                onClick={() => setSelectedFederatedProfile(profile)}
                className="w-full text-left flex items-center gap-3 p-4 text-black hover:bg-slate-50/80 transition"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-black text-black text-sm truncate">
                    {profileDisplayName(profile)}
                    {profile.order_stats && profile.order_stats.ltv >= 50 && (
                      <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700">VIP</span>
                    )}
                  </p>
                  <p className="text-[10px] text-black font-mono truncate">{profile.email}</p>
                  {profile.phone && <p className="mt-1 text-[11px] font-medium text-black truncate">{profile.phone}</p>}
                  <p className="mt-1 text-[11px] text-black">{(profile as EnrichedProfile & { _order_only?: boolean })._order_only ? 'First order' : 'Signed up'}: <span className="font-semibold">{formatListDate(profile.created_at)}</span></p>
                  {showMembershipColumn && <ProfileMembership profile={profile} compact showSignup={false} />}
                  {showLastLoginColumn && profileLastLoginAt(profile) && (
                    <p className="mt-1.5 text-[10px] text-black">Last login: <span className="font-semibold">{formatListDate(profileLastLoginAt(profile))}</span></p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    {showOrdersColumn && profile.order_stats && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-black"><DollarSign className="w-3 h-3" />{profile.order_stats.ltv.toFixed(2)} · {profile.order_stats.order_count} orders</span>
                    )}
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                      profile.subscribed
                        ? 'bg-emerald-50 text-black border border-emerald-100'
                        : profile.subscribed === false
                        ? 'bg-rose-50 text-black border border-rose-100'
                        : 'bg-amber-50 text-black border border-amber-100'
                    }`}>
                      {profile.subscribed === true ? 'Sub' : profile.subscribed === false ? 'Unsub' : 'Unverified'}
                    </span>
                  </div>
                </div>
                <ChevronRight size={16} className="text-slate-300 shrink-0" />
              </button>
            ))
          )}
        </div>
        <div className="overflow-x-auto">
        <table className="hidden lg:table w-full text-left text-black border-collapse">
          <thead>
            <tr className="border-b border-slate-100">
              {dataSource === 'local' ? (
                <>
                  <th className="px-10 py-6 text-[10px] font-black text-black uppercase tracking-widest">Profile Identity</th>
                  <th className="px-10 py-6 text-[10px] font-black text-black uppercase tracking-widest text-center">Spoke UUID</th>
                  <th className="px-10 py-6 text-[10px] font-black text-black uppercase tracking-widest">Presence</th>
                  <th className="px-10 py-6 text-[10px] font-black text-black uppercase tracking-widest text-right">Last Sync</th>
                </>
              ) : (
                <>
                  <th className="px-8 py-5 text-[10px] font-black text-black uppercase tracking-widest">Profile</th>
                  {showMembershipColumn && <th className="px-6 py-5 text-[10px] font-black text-black uppercase tracking-widest">Membership</th>}
                  {showLastLoginColumn && <th className="px-6 py-5 text-[10px] font-black text-black uppercase tracking-widest">Last login</th>}
                  {showOrdersColumn && <th className="px-6 py-5 text-[10px] font-black text-black uppercase tracking-widest">Orders</th>}
                  <th className="px-8 py-5 text-[10px] font-black text-black uppercase tracking-widest text-right">Email consent</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {dataSource === 'local' ? (
              paginatedProfiles.map((profile) => (
                <tr key={profile.id} onClick={() => setSelectedProfileId(profile.id)} className={`hover:bg-slate-50/80 transition-colors cursor-pointer group ${selectedProfileId === profile.id ? 'bg-emerald-50/50' : ''}`}>
                  <td className="px-10 py-6">
                    <div>
                      <p className="font-black text-black text-sm">{profileDisplayName(profile)}</p>
                      <p className="text-[10px] text-black font-mono">{profile.email}</p>
                    </div>
                  </td>
                  <td className="px-10 py-6 text-center">
                     <div className="inline-flex items-center space-x-2 bg-slate-50 px-3 py-1 rounded-sm border border-slate-100">
                        <Fingerprint size={10} className="text-indigo-400" />
                        <span className="text-[10px] font-mono text-black font-bold">{profile.spoke_uuid || 'UNSET'}</span>
                     </div>
                  </td>
                  <td className="px-10 py-6">
                    <div className="flex flex-wrap gap-1">
                      {profile.branches.map((slug) => (
                        <BranchBadge key={slug} slug={slug} branchMap={branchMap} />
                      ))}
                    </div>
                  </td>
                  <td className="px-10 py-6 text-right font-black text-[10px] text-black">{new Date(profile.last_event_timestamp || profile.last_active || '').toLocaleDateString()}</td>
                </tr>
              ))
            ) : (
              paginatedFederatedProfiles.map((profile, index) => (
                <tr
                  key={`${profile._spoke_id}-${profile.email}-${index}`}
                  className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                  onClick={() => setSelectedFederatedProfile(profile)}
                >
                  <td className="px-8 py-5 w-[38%]">
                      <div className="min-w-0">
                        <p className="font-black text-black text-sm">
                          {profileDisplayName(profile)}
                          {profile.order_stats && profile.order_stats.ltv >= 50 && (
                            <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-black">
                              VIP
                            </span>
                          )}
                        </p>
                        <p className="text-[10px] text-black font-mono break-all">{profile.email}</p>
                        {profile.phone && <p className="mt-1 text-[11px] font-medium text-black">{profile.phone}</p>}
                        <p className="mt-1 text-[10px] text-black">{(profile as EnrichedProfile & { _order_only?: boolean })._order_only ? 'First order' : 'Signed up'}: <span className="font-semibold">{formatListDate(profile.created_at)}</span></p>
                      </div>
                  </td>
                  {showMembershipColumn && <td className="px-6 py-5 min-w-48">
                    <ProfileMembership profile={profile} compact showSignup={false} />
                  </td>}
                  {showLastLoginColumn && <td className="px-6 py-5 whitespace-nowrap">
                    {profileLastLoginAt(profile) ? (
                      <div>
                        <p className="text-sm font-semibold text-black">{formatListDate(profileLastLoginAt(profile))}</p>
                        <p className="mt-1 text-[10px] text-black">Reported by business</p>
                      </div>
                    ) : (
                      <span className="text-xs text-black">Not available</span>
                    )}
                  </td>}
                  {showOrdersColumn && <td className="px-6 py-5 whitespace-nowrap">
                    {profile.order_stats ? (
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-black">
                          <span className="text-black">${profile.order_stats.ltv.toFixed(2)}</span>
                          <span className="mx-1.5 text-black">·</span>
                          {profile.order_stats.order_count} {profile.order_stats.order_count === 1 ? 'order' : 'orders'}
                        </p>
                        <p className="text-[10px] text-black">Last purchase {formatListDate(profile.order_stats.last_purchase_at)}</p>
                      </div>
                    ) : (
                      <span className="text-xs text-black">No orders</span>
                    )}
                  </td>}
                  <td className="px-8 py-5 text-right">
                    <div className="flex flex-col items-end gap-1">
                      <span className={`inline-flex items-center px-2 py-1 rounded-sm text-[10px] font-bold uppercase ${
                        profile.subscribed
                          ? 'bg-emerald-50 text-black border border-emerald-100'
                          : profile.subscribed === false
                          ? 'bg-rose-50 text-black border border-rose-100'
                          : 'bg-amber-50 text-black border border-amber-100'
                      }`}>
                        {profile.subscribed === true ? 'Subscribed' : profile.subscribed === false ? 'Unsubscribed' : 'Unverified'}
                      </span>
                      {(() => {
                        const source = profile.subscribed !== undefined && profile.subscribed !== null ? 'spoke_native' : 'import_default';
                        const consent = getConsentLabel(source);
                        return (
                          <span className="text-[8px] font-bold uppercase tracking-widest text-black">
                            {consent.label}
                          </span>
                        );
                      })()}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
        {dataSource === 'federated' && filteredFederatedProfiles.length === 0 && <p className="p-6 text-sm text-black" role="status">{isFederating ? 'Loading profiles…' : 'No profiles match these filters.'}</p>}

        {/* Pagination Controls */}
        <div className="px-4 sm:px-10 py-4 sm:py-6 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <label className="text-[10px] font-black text-black uppercase tracking-widest">Per page</label>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="appearance-none bg-slate-50 border border-slate-200 rounded-sm px-3 py-2 text-sm font-bold text-black focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
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
              className="p-2 rounded-sm border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
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
                    className={`w-10 h-10 rounded-sm text-sm font-bold transition ${
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
              className="p-2 rounded-sm border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              <ChevronRight size={18} className="text-slate-600" />
            </button>
          </div>

          <div className="text-[10px] font-black text-black uppercase tracking-widest">
            Page {currentPage} of {totalPages || 1}
          </div>
        </div>
      </div>
      )}

      {selectedProfile && (
        <>
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-40" onClick={() => setSelectedProfileId(null)}></div>
          <div className="fixed top-0 right-0 h-full w-full max-w-xl bg-white  z-50 animate-in slide-in-from-right duration-300 flex flex-col">
            <div className="p-10 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <h3 className="font-black text-slate-800   text-xs">Identity Intelligence Slide</h3>
                <HelpLink articleId="art_federated_model" variant="icon-only" onOpenArticle={onOpenArticle!} />
              </div>
              <button onClick={() => setSelectedProfileId(null)} className="p-2 text-slate-400 hover:text-slate-900 bg-slate-50 rounded-sm"><X size={24} /></button>
            </div>
            <div className="p-10 space-y-10 flex-1 overflow-y-auto custom-scrollbar">
               <div className="flex items-center space-x-6">
                  <div className={`w-24 h-24 rounded-sm flex items-center justify-center text-4xl font-black ${selectedProfile.is_subscribed ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{profileDisplayName(selectedProfile).charAt(0).toUpperCase()}</div>
                  <div>
                    <h4 className="text-2xl font-black text-slate-800">{profileDisplayName(selectedProfile)}</h4>
                    <p className="text-sm text-slate-400 font-mono mb-4">{selectedProfile.email}</p>
                    <div className="space-y-2">
                       <div className="px-4 py-2 bg-slate-50 border border-slate-100 text-slate-400 rounded-sm text-[10px] font-black uppercase tracking-widest italic flex items-center">
                          <ShieldCheck size={14} className="mr-2" /> Composite Identity Lock
                       </div>
                       <div className="px-4 py-2 bg-indigo-50 border border-indigo-100 text-indigo-700 rounded-sm text-[10px] font-black uppercase tracking-widest flex items-center">
                          <Fingerprint size={14} className="mr-2" /> ID: {selectedProfile.spoke_uuid}
                       </div>
                    </div>
                  </div>
               </div>
               <div className="grid grid-cols-2 gap-4">
                  <div className="bg-slate-50 p-6 rounded-sm border border-slate-100">
                     <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Estimated LTV</p>
                     <p className="text-2xl font-black text-slate-800">${selectedProfile.ltv.toLocaleString()}</p>
                  </div>
                  <div className="bg-slate-50 p-6 rounded-sm border border-slate-100">
                     <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Engagement Pulse</p>
                     {/* `|| 85` used to render here, so every customer showed a
                         fabricated 85% — including genuinely disengaged ones,
                         because 0 is falsy. No signal now reads as no signal. */}
                     {selectedProfile.engagement_score == null ? (
                       <p className="text-2xl font-black text-slate-300" title="No email engagement recorded for this address yet">—</p>
                     ) : (
                       <p className="text-2xl font-black text-emerald-600">{selectedProfile.engagement_score}%</p>
                     )}
                  </div>
               </div>
               {/* Per-Branch Consent Panel */}
               {editingConsent && (
                 <div className="bg-white p-6 rounded-sm border border-slate-200  space-y-4">
                   <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex items-center">
                     <ShieldCheck size={14} className="mr-2 text-emerald-600" />
                     Branch Consent
                   </h5>
                   <p className="text-[10px] text-slate-400">Subscription status per branch. Changes are per-branch — unsubscribing from one does not affect others.</p>
                   {(Object.entries(editingConsent) as [string, BranchConsentEntry][]).map(([branchSlug, consent]) => {
                     const branchInfo = branchContext?.allBranches.find(b => b.slug === branchSlug);
                     return (
                       <div key={branchSlug} className="flex items-center justify-between p-3 rounded-sm border border-slate-100 hover:border-slate-200 transition">
                         <div className="flex items-center space-x-3">
                           <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: branchInfo?.primary_color || '#94a3b8' }} />
                           <div>
                             <p className="text-xs font-bold text-slate-700">{branchInfo?.name || branchSlug}</p>
                             <p className="text-[10px] text-slate-400">
                               {consent.subscribed && !consent.paused ? 'Opted In' : consent.paused ? 'Paused' : 'Unsubscribed'}
                             </p>
                           </div>
                         </div>
                         <div className="flex items-center space-x-2">
                           <button
                             onClick={() => {
                               setEditingConsent(updateBranchConsent(editingConsent, branchSlug, !consent.subscribed, consent.paused));
                             }}
                             className={`px-3 py-1 rounded-sm text-[10px] font-black uppercase tracking-widest transition ${
                               consent.subscribed
                                 ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                 : 'bg-slate-100 text-slate-400 hover:bg-slate-200'
                             }`}
                           >
                             {consent.subscribed ? 'Subscribed' : 'Unsubscribed'}
                           </button>
                           {consent.subscribed && (
                             <button
                               onClick={() => {
                                 setEditingConsent(updateBranchConsent(editingConsent, branchSlug, consent.subscribed, !consent.paused));
                               }}
                               className={`px-3 py-1 rounded-sm text-[10px] font-black uppercase tracking-widest transition ${
                                 consent.paused
                                   ? 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                                   : 'bg-slate-50 text-slate-400 hover:bg-slate-100'
                               }`}
                             >
                               {consent.paused ? 'Paused' : 'Active'}
                             </button>
                           )}
                         </div>
                       </div>
                     );
                   })}
                   {consentSaveStatus === 'error' && consentSaveError && (
                     <div className="flex items-center space-x-2 p-3 bg-rose-50 border border-rose-100 rounded-sm">
                       <AlertCircle size={14} className="text-rose-500 shrink-0" />
                       <span className="text-xs font-bold text-rose-700">{consentSaveError}</span>
                     </div>
                   )}
                   {consentSaveStatus === 'saved' && (
                     <div className="flex items-center space-x-2 p-3 bg-emerald-50 border border-emerald-100 rounded-sm">
                       <ShieldCheck size={14} className="text-emerald-500 shrink-0" />
                       <span className="text-xs font-bold text-emerald-700">Consent updated successfully.</span>
                     </div>
                   )}
                   <button
                     disabled={consentSaveStatus === 'saving'}
                     onClick={async () => {
                       if (!selectedProfile || !editingConsent) return;
                       setConsentSaveStatus('saving');
                       setConsentSaveError(null);
                       try {
                         const consentValues = Object.values(editingConsent) as BranchConsentEntry[];
                         const newSubscribed = consentValues.some(c => c.subscribed);
                         const newPaused = consentValues.every(c => c.paused);
                         const { error } = await supabase
                           .from('profiles')
                           .update({
                             branch_consent: editingConsent,
                             is_subscribed: newSubscribed,
                             marketing_pause: newPaused,
                           })
                           .eq('id', selectedProfile.id);
                         if (error) throw error;
                         setProfiles(prev => prev.map(p =>
                           p.id === selectedProfile.id
                             ? { ...p, branch_consent: editingConsent, is_subscribed: newSubscribed, marketing_pause: newPaused }
                             : p
                         ));
                         setConsentSaveStatus('saved');
                         setTimeout(() => setConsentSaveStatus('idle'), 2500);
                       } catch (err) {
                         console.error('Failed to update consent:', err);
                         setConsentSaveError(err instanceof Error ? err.message : 'Failed to save consent changes.');
                         setConsentSaveStatus('error');
                       }
                     }}
                     className="w-full py-3 bg-emerald-600 text-white rounded-sm text-xs font-black uppercase tracking-widest hover:bg-emerald-700 transition  disabled:opacity-50 disabled:cursor-not-allowed"
                   >
                     {consentSaveStatus === 'saving' ? 'Saving…' : 'Save Consent Changes'}
                   </button>
                 </div>
               )}
               <div className="bg-indigo-900 p-8 rounded-sm text-white relative overflow-hidden ">
                  <div className="absolute top-0 right-0 p-4 opacity-10"><Sparkles size={80} /></div>
                  <h5 className="text-[10px] font-black text-indigo-300 uppercase tracking-widest mb-4">Sage Orchestration Advice</h5>
                  <p className="text-sm font-medium italic mb-6">"Identify user behavior across {selectedProfile.branches.length} spokes. UUID tracking ensures identity pivots are captured during email migration."</p>
                  <button onClick={() => onTestFlow?.(selectedProfile.email)} className="w-full py-4 bg-indigo-500 hover:bg-indigo-400 text-white rounded-sm text-xs font-black uppercase tracking-widest transition">Preview Sync Strategy</button>
               </div>
            </div>
          </div>
        </>
      )}

      {/* Federated Profile Detail Drawer */}
      <ProfileDetailDrawer
        profile={selectedFederatedProfile}
        onClose={() => setSelectedFederatedProfile(null)}
      />
    </div>
  );
};

export default Profiles;
