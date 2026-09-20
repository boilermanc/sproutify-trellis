import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  MarketingEvent, ViewState, Brand, Branch, SpokeConnection,
  BranchStatsResult, BranchContext, ScheduledPost, VideoAdJob,
} from '../types';
import { Article } from '../src/data/helpContent';
import { supabase } from '../lib/supabase';
import { getPublishedPosts, PublishedPost, fetchRecentEvents } from '../lib/supabaseService';
import { fetchAllSpokesOrders, NormalizedOrder, testSpokeConnectionById } from '../spokeConnector';
import { upsertSpokeConnection } from '../services/spokeConnectionsService';
import { fetchScheduledPosts } from '../services/scheduledPostService';
import { getVideoAdJobs } from '../services/videoAdService';
import { fetchBrandInsights, MetaInsights } from '../services/metaInsightsService';
import { EmailEventRow } from '../services/emailReportingService';
import {
  computeWindowTotals, buildTimeline,
  buildQueue, buildBranchCards, getWhatWorked, fetchSnoozes, snoozeItem,
} from '../services/dashboardService';
import {
  DashboardTab, TimeWindow, WhatWorked, QueueItem, QueueOutcome, SystemHealthReport, SystemRow,
} from '../components/dashboard/types';
import ControlRoom from '../components/dashboard/ControlRoom';
import MorningStandup from '../components/dashboard/MorningStandup';
import BranchBoard from '../components/dashboard/BranchBoard';
import EmailPulse from '../components/dashboard/EmailPulse';
import BusinessOverview from '../components/dashboard/BusinessOverview';
import { RefreshCw, Loader2 } from 'lucide-react';
import { fetchOpenLeadCountsByBranch } from '../leadService';
import { fetchDashboardEmailEvents } from '../supabase/functions/_shared/system-health.mjs';
import { fetchCampaigns, Campaign } from '../supabaseService';
import { listTrellisUsers } from '../trellisUsersService';
import { TrellisUser } from '../types';
import WeeklyActions from '../components/dashboard/WeeklyActions';
import { WeeklyActionCandidate, WeeklyActionState, WeeklyActionStateStatus } from '../components/dashboard/types';
import {
  DEFAULT_WEEKLY_ACTION_BUDGET, buildWeeklyActionCandidates, fetchWeeklyActionStates,
  saveWeeklyActionState, selectWeeklyActions,
} from '../services/weeklyActionsService';

// The three tabs replace the old overview page wholesale. Sage is deliberately
// absent here (no briefing, no "strategic action" banner) — the floating chat in
// Layout is unaffected. Nothing on this page renders a number that isn't
// traceable to a live source; see docs/design_handoff_dashboard_redesign.
interface DashboardProps {
  onViewChange?: (view: ViewState) => void;
  events: MarketingEvent[];
  brand: Brand;
  spokeConnections: SpokeConnection[];
  // Lets the inline "Sync" action in the standup/control queue write the
  // re-tested connection back into App state so the stale item actually clears.
  onSpokeConnectionsChange?: (conns: SpokeConnection[]) => void;
  branchStats: BranchStatsResult;
  branches?: Branch[];
  branchContext?: BranchContext;
  onOpenArticle?: (article: Article) => void;
  // Still passed by App.tsx for the old page; unused here and kept optional so
  // the call sites don't need editing.
  tasks?: unknown;
  profiles?: unknown;
  savedConnections?: unknown;
  onToggleFavorite?: unknown;
  scheduledPosts?: unknown;
  setScheduledPosts?: unknown;
  onOpenCampaignDraft?: (id: string) => void;
}

const TABS: { id: DashboardTab; label: string }[] = [
  { id: 'control', label: 'Control Room' },
  { id: 'standup', label: 'Morning Standup' },
  { id: 'board', label: 'Branch Board' },
];

const WINDOW_KEY = 'trellis_dashboard_window';

function initialTab(): DashboardTab {
  const t = new URLSearchParams(window.location.search).get('tab');
  return t === 'standup' || t === 'board' ? t : 'control';
}

function initialWindow(): TimeWindow {
  return localStorage.getItem(WINDOW_KEY) === '30d' ? '30d' : '7d';
}

const SPROUTIFY_ORG_ID = '00000000-0000-0000-0000-000000000001';

const Dashboard: React.FC<DashboardProps> = ({
  onViewChange, onOpenCampaignDraft, spokeConnections, onSpokeConnectionsChange, branchStats, branches = [], branchContext,
}) => {
  const [tab, setTab] = useState<DashboardTab>(initialTab);
  const [timeWindow, setTimeWindow] = useState<TimeWindow>(initialWindow);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Raw data. Each slice is fetched independently so one slow spoke cannot
  // block the page — a failed fetch degrades its own card, never the whole view.
  const [orders, setOrders] = useState<NormalizedOrder[]>([]);
  const [publishedPosts, setPublishedPosts] = useState<PublishedPost[]>([]);
  const [emailEvents, setEmailEvents] = useState<EmailEventRow[]>([]);
  const [dbScheduled, setDbScheduled] = useState<ScheduledPost[]>([]);
  const [videoAdJobs, setVideoAdJobs] = useState<VideoAdJob[]>([]);
  const [metaInsights, setMetaInsights] = useState<Record<string, MetaInsights>>({});
  const [health, setHealth] = useState<SystemHealthReport | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const webhooks = useMemo(() => health?.webhooks ?? [], [health]);
  const [whatWorked, setWhatWorked] = useState<WhatWorked | null>(null);
  const [snoozed, setSnoozed] = useState<Record<string, string>>({});
  const [recentEvents, setRecentEvents] = useState<MarketingEvent[]>([]);
  const [openLeadCounts, setOpenLeadCounts] = useState<Record<string, number>>({});
  const [businessRefreshKey, setBusinessRefreshKey] = useState(0);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [team, setTeam] = useState<TrellisUser[]>([]);
  const [actionStates, setActionStates] = useState<Record<string, WeeklyActionState>>({});
  const [actionsLoading, setActionsLoading] = useState(true);
  const [actionsRefreshedAt, setActionsRefreshedAt] = useState<string | null>(null);

  // Tab lives in the URL so a reload or a shared link lands on the same view.
  const selectTab = useCallback((next: DashboardTab) => {
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', next);
    window.history.replaceState({}, '', url);
  }, []);

  const selectWindow = useCallback((next: TimeWindow) => {
    setTimeWindow(next);
    localStorage.setItem(WINDOW_KEY, next);
  }, []);

  const loadAll = useCallback(async () => {
    // 60 days of email events so a 30d window still has a prior 30d to compare.
    const since = new Date(Date.now() - 60 * 86400000).toISOString();

    const settle = <T,>(p: Promise<T>, label: string, fallback: T): Promise<T> =>
      p.catch(err => { console.error(`[dashboard] ${label} failed:`, err); return fallback; });

    const [
      ordersRes, postsRes, emailRes, schedRes, jobsRes, workedRes, snoozeRes, eventsRes, leadCountsRes,
    ] = await Promise.all([
      // fetchAllSpokesOrders returns { orders, errors } — a per-spoke failure is
      // reported rather than thrown, so unwrap and log instead of silently
      // treating a partial fetch as a complete one.
      settle(
        fetchAllSpokesOrders(spokeConnections).then(res => {
          if (res.errors?.length) console.error('[dashboard] some spokes failed:', res.errors);
          return res.orders || [];
        }),
'orders', [] as NormalizedOrder[],
      ),
      settle(getPublishedPosts(), 'published posts', [] as PublishedPost[]),
      settle(
        fetchDashboardEmailEvents(supabase, since, new Date().toISOString()),
'email events', [] as EmailEventRow[],
      ),
      settle(fetchScheduledPosts(), 'scheduled posts', [] as ScheduledPost[]),
      settle(getVideoAdJobs(undefined, 100), 'creative jobs', [] as VideoAdJob[]),
      settle(getWhatWorked(timeWindow), 'post performance', null as WhatWorked | null),
      settle(fetchSnoozes(), 'snoozes', {} as Record<string, string>),
      settle(fetchRecentEvents(50), 'recent events', [] as MarketingEvent[]),
      settle(fetchOpenLeadCountsByBranch(branches.map(branch => branch.id)), 'open lead counts', {} as Record<string, number>),
    ]);

    setOrders(ordersRes);
    setPublishedPosts(postsRes);
    setEmailEvents(emailRes);
    setDbScheduled(schedRes);
    setVideoAdJobs(jobsRes);
    setWhatWorked(workedRes);
    setSnoozed(snoozeRes);
    setRecentEvents(eventsRes);
    setOpenLeadCounts(leadCountsRes);

    // Meta insights are per-branch, keyed by branch UUID (how the meta-insights
    // function stores credentials). One branch failing must not lose the rest.
    const insightPairs = await Promise.all(
      branches.map(async b => {
        try { return [b.id, await fetchBrandInsights(b.id)] as const; }
        catch { return [b.id, null] as const; }
      }),
    );
    const map: Record<string, MetaInsights> = {};
    for (const [id, ins] of insightPairs) if (ins) map[id] = ins as MetaInsights;
    setMetaInsights(map);
  }, [spokeConnections, branches, timeWindow]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    loadAll().finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [loadAll]);

  useEffect(() => {
    let cancelled = false;
    setActionsLoading(true);
    Promise.all([fetchCampaigns(), listTrellisUsers(), fetchWeeklyActionStates()])
      .then(([campaignRows, usersResult, states]) => {
        if (cancelled) return;
        setCampaigns(campaignRows);
        setTeam(usersResult.data || []);
        setActionStates(states);
        setActionsRefreshedAt(new Date().toISOString());
      })
      .catch(error => console.error('[dashboard] weekly actions failed:', error))
      .finally(() => { if (!cancelled) setActionsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // One shared report powers the dashboard and GitHub's daily repair queue.
  // It uses safe reads, exact email counts, and fresh spoke access checks.
  const healthInFlight = useRef<Promise<void> | null>(null);
  const loadWebhookHealth = useCallback((force = false): Promise<void> => {
    if (healthInFlight.current) return healthInFlight.current;
    setHealthLoading(true);
    const p = (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('system-health', { body: {} });
        if (error || data?.version !== 1 || !Array.isArray(data?.systems)) throw new Error('Health report unavailable');
        setHealth(data as SystemHealthReport);
      } catch (err) {
        setHealth(null);
        console.error('[dashboard] system health failed:', err);
      }
    })().finally(() => { healthInFlight.current = null; setHealthLoading(false); });
    healthInFlight.current = p;
    return p;
  }, []);

  useEffect(() => {
    loadWebhookHealth(false);
    const timer = setInterval(() => loadWebhookHealth(false), 5 * 60 * 1000);
    return () => clearInterval(timer);
  }, [loadWebhookHealth]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([loadAll(), loadWebhookHealth(true), branchStats.refresh?.()]);
      setBusinessRefreshKey(value => value + 1);
    } finally {
      setIsRefreshing(false);
    }
  }, [loadAll, loadWebhookHealth, branchStats]);

  const handleSnooze = useCallback(async (key: string) => {
    // Optimistic: hide it now, roll back if the write fails.
    const until = new Date(Date.now() + 24 * 3600000).toISOString();
    setSnoozed(prev => ({ ...prev, [key]: until }));
    const ok = await snoozeItem(key, 24);
    if (!ok) {
      setSnoozed(prev => { const next = { ...prev }; delete next[key]; return next; });
      console.error('[dashboard] snooze failed for', key);
    }
  }, []);

  // The inline "Sync" on a stale-spoke queue item. Mirrors BranchCommandCenter's
  // retest: re-test the specific connection server-side, stamp last_tested_at,
  // push it into App state (so the stale item clears) AND persist it, then pull
  // fresh federated data. Without the App-state write + DB persist the item just
  // reappears — which is exactly why the old handler (a bare data reload) looked
  // like a dead button.
  const [syncingConnIds, setSyncingConnIds] = useState<string[]>([]);
  // Completed-action cards, keyed by queue item key. Set only from a real result.
  const [outcomes, setOutcomes] = useState<Record<string, QueueOutcome>>({});
  const dismissOutcome = useCallback((key: string) => {
    setOutcomes(prev => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const handleInlineSync = useCallback(async (item: QueueItem) => {
    const connectionId = item.connectionId ?? '';
    // No id (shouldn't happen for a spoke item) → fall back to a plain refresh.
    if (!connectionId) { await handleRefresh(); return; }
    setSyncingConnIds(prev => prev.includes(connectionId) ? prev : [...prev, connectionId]);
    // A retry starts from a clean slate — drop any prior outcome on this card.
    dismissOutcome(item.key);
    try {
      const result = await testSpokeConnectionById(connectionId);
      const nowIso = new Date().toISOString();
      const updated = spokeConnections.map(c =>
        c.id === connectionId
          ? result.success
            ? { ...c, status: 'active' as const, last_error: undefined, last_tested_at: nowIso }
            : { ...c, status: 'error' as const, last_error: result.error, last_tested_at: nowIso }
          : c,
      );
      onSpokeConnectionsChange?.(updated);
      const persist = updated.find(c => c.id === connectionId);
      if (persist) await upsertSpokeConnection(SPROUTIFY_ORG_ID, persist);
      if (result.success) {
        // Re-tested clean → pull fresh federated data, then mark the card done.
        await Promise.all([loadAll(), branchStats.refresh?.(), loadWebhookHealth(true)]);
        setOutcomes(prev => ({ ...prev, [item.key]: { item, status: 'success', message: 'Connection re-tested just now', at: nowIso } }));
      } else {
        setOutcomes(prev => ({ ...prev, [item.key]: { item, status: 'error', message: result.error || 'Sync failed — check the connection.', at: nowIso } }));
      }
    } catch (err) {
      console.error('[dashboard] inline sync failed for', connectionId, err);
      setOutcomes(prev => ({ ...prev, [item.key]: { item, status: 'error', message: err instanceof Error ? err.message : 'Sync failed.', at: new Date().toISOString() } }));
    } finally {
      setSyncingConnIds(prev => prev.filter(id => id !== connectionId));
    }
  }, [spokeConnections, onSpokeConnectionsChange, loadAll, branchStats, handleRefresh, dismissOutcome, loadWebhookHealth]);

  const selectBranch = useCallback((slug: string) => {
    branchContext?.setActiveBranchSlugs([slug]);
  }, [branchContext]);

  // ── Derivations ────────────────────────────────────────────────
  const activeSlugs = branchContext?.activeBranchSlugs;
  const isAllBranches = branchContext?.isAllSelected !== false;

  // Every metric on every tab respects the active branch scope.
  const scopedBranches = useMemo(
    () => (isAllBranches || !activeSlugs ? branches : branches.filter(b => activeSlugs.includes(b.slug))),
    [branches, activeSlugs, isAllBranches],
  );

  const totals = useMemo(
    () => computeWindowTotals(orders, branchStats.enrichedProfiles || [], publishedPosts, emailEvents, timeWindow),
    [orders, branchStats.enrichedProfiles, publishedPosts, emailEvents, timeWindow],
  );

  const systems = useMemo<SystemRow[]>(() => health?.systems ?? [{
    key: 'monitor:unavailable', name: 'System health check', status: 'unknown',
    code: healthLoading ? 'CHECKING' : 'UNAVAILABLE',
    detail: healthLoading ? 'Checking live sources…' : 'Health data could not be verified. Refresh to retry; see the daily GitHub health workflow for diagnostics.',
  }], [health, healthLoading]);

  // Connection checks are live observations; never persist them as a data sync.
  const checkedConnections = useMemo(() => spokeConnections.map(conn => {
    const check = health?.spokes.find(s => s.id === conn.id);
    if (!check || check.status === 'unknown') return conn;
    return { ...conn, status: check.status === 'ok' ? 'active' as const : 'error' as const,
      last_tested_at: check.checked_at, last_error: check.status === 'ok' ? undefined : check.detail };
  }), [health, spokeConnections]);

  const timeline = useMemo(
    // Email events and creative jobs are the densest live signals in the app;
    // without them the timeline reads as a quiet day when it isn't.
    () => buildTimeline(
      publishedPosts, dbScheduled, recentEvents, webhooks, scopedBranches,
      spokeConnections, emailEvents, videoAdJobs,
    ),
    [publishedPosts, dbScheduled, recentEvents, webhooks, scopedBranches,
     spokeConnections, emailEvents, videoAdJobs],
  );

  const queue = useMemo(() => {
    const now = Date.now();
    return buildQueue(checkedConnections, dbScheduled, webhooks, videoAdJobs, scopedBranches, branchStats)
      .filter(item => {
        const until = snoozed[item.key];
        return !until || new Date(until).getTime() <= now;
      });
  }, [checkedConnections, dbScheduled, webhooks, videoAdJobs, scopedBranches, branchStats, snoozed]);

  const weeklyCandidates = useMemo(() => buildWeeklyActionCandidates({
    queue,
    campaigns,
    users: team,
    branchIdsBySlug: Object.fromEntries(branches.map(branch => [branch.slug, branch.id])),
    activeBranchSlugs: scopedBranches.map(branch => branch.slug),
  }), [queue, campaigns, team, branches, scopedBranches]);
  const weeklyActions = useMemo(() => {
    const withPersistedOwners = weeklyCandidates.map(candidate => {
      const persistedOwnerId = actionStates[candidate.key]?.ownerId;
      if (!persistedOwnerId || !candidate.eligibleOwnerIds.includes(persistedOwnerId)) return candidate;
      const owner = team.find(user => user.id === persistedOwnerId);
      return { ...candidate, ownerId: persistedOwnerId, ownerName: owner?.full_name || owner?.email || 'Unassigned' };
    });
    return selectWeeklyActions(withPersistedOwners, actionStates, DEFAULT_WEEKLY_ACTION_BUDGET);
  }, [weeklyCandidates, actionStates, team]);

  const updateWeeklyAction = useCallback(async (
    action: WeeklyActionCandidate,
    status: WeeklyActionStateStatus,
    ownerId = action.ownerId,
    deferredUntil: string | null = null,
  ) => {
    try {
      await saveWeeklyActionState(action, status, ownerId, deferredUntil);
      setActionStates(previous => ({ ...previous, [action.key]: {
        actionKey: action.key, status, ownerId, deferredUntil,
        sourceUpdatedAt: action.sourceUpdatedAt,
        completedAt: status === 'completed' ? new Date().toISOString() : null,
      } }));
    } catch (error) {
      console.error('[dashboard] weekly action state failed:', error);
    }
  }, []);

  const openWeeklyAction = useCallback((action: WeeklyActionCandidate) => {
    if (action.destination === 'campaign-builder' && action.destinationId) onOpenCampaignDraft?.(action.destinationId);
    else onViewChange?.(action.destination);
  }, [onOpenCampaignDraft, onViewChange]);

  const branchCards = useMemo(
    () => buildBranchCards(scopedBranches, branchStats, orders, metaInsights, publishedPosts, checkedConnections, timeWindow)
      .map(card => ({
        ...card,
        openLeads: openLeadCounts[scopedBranches.find(branch => branch.slug === card.slug)?.id || ''] || 0,
      })),
    [scopedBranches, branchStats, orders, metaInsights, publishedPosts, checkedConnections, timeWindow, openLeadCounts],
  );

  const degradedCount = useMemo(() => systems.filter(s => s.status !== 'ok' && s.status !== 'optional').length, [systems]);

  const badgeFor = (id: DashboardTab) =>
    id === 'control' ? timeline.length : id === 'standup' ? queue.length : branchCards.length;

  const goToStandup = useCallback(() => selectTab('standup'), [selectTab]);
  const goToBranches = useCallback(() => onViewChange?.('branches' as ViewState), [onViewChange]);

  return (
    <div className="-m-3 min-h-full overflow-x-hidden bg-[#F6F7F9] sm:-m-4 lg:-m-8">
      {/* The page title and branch picker already live in Layout's header, so
          the window toggle and status pill ride with the tab bar rather than
          splicing into that shared header. */}
      <div className="border-b border-[#E5E7EB] bg-white px-3 sm:px-5 lg:px-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <nav className="grid w-full grid-cols-3 gap-1 sm:flex sm:w-auto sm:gap-7" role="tablist" aria-label="Dashboard views">
            {TABS.map(t => {
              const active = tab === t.id;
              const count = badgeFor(t.id);
              const alert = t.id === 'standup' && count > 0;
              return (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => selectTab(t.id)}
                  className={`flex min-w-0 items-center justify-center gap-1 py-3 px-0.5 text-[12px] font-bold whitespace-nowrap border-b-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E698F] focus-visible:ring-offset-2 sm:justify-start sm:gap-2 sm:py-3.5 sm:text-[13px] ${
                    active
                      ? 'text-[#0B4A6B] border-[#0B4A6B]'
                      : 'text-[#6B7280] border-transparent hover:text-[#374151] hover:border-[#E5E7EB]'
                  }`}
                >
                  <span className="sm:hidden">{t.id === 'control' ? 'Overview' : t.id === 'standup' ? 'Actions' : 'Branches'}</span>
                  <span className="hidden sm:inline">{t.label}</span>
                  <span
                    className={`rounded-full px-[7px] py-0.5 text-[10px] font-extrabold ${
                      alert ? 'bg-[#FEF3C7] text-[#B45309]' : 'bg-[#F1F5F9] text-[#64748B]'
                    }`}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </nav>

          <div className="flex w-full items-center justify-between gap-2 border-t border-[#F1F5F9] py-2 sm:w-auto sm:justify-start sm:border-t-0 sm:gap-2.5 sm:shrink-0">
            <div className="flex items-center gap-1.5">
              {(['7d', '30d'] as TimeWindow[]).map(w => (
                <button
                  key={w}
                  onClick={() => selectWindow(w)}
                  className={`px-3 py-[7px] rounded-sm text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E698F] focus-visible:ring-offset-2 ${
                    timeWindow === w
                      ? 'bg-[#111827] text-white'
                      : 'bg-white border border-[#E5E7EB] text-[#6B7280] hover:text-[#374151]'
                  }`}
                >
                  {w}
                </button>
              ))}
            </div>

            <button
              onClick={() => selectTab('control')}
              title={degradedCount ? 'Jump to system health' : 'Required health checks passed'}
              className={`flex items-center gap-2 px-3 py-[7px] rounded-sm text-[12px] font-bold border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E698F] focus-visible:ring-offset-2 ${
                degradedCount
                  ? 'bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C]'
                  : 'bg-[#ECFDF5] border-[#A7F3D0] text-[#047857]'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${degradedCount ? 'bg-[#EF4444]' : 'bg-[#10B981]'}`} />
              <span className="sm:hidden">{healthLoading ? 'Checking…' : degradedCount ? `${degradedCount} issues` : 'Healthy'}</span>
              <span className="hidden sm:inline">
                {healthLoading ? 'Checking health…' : degradedCount
                  ? `${degradedCount} health item${degradedCount === 1 ? '' : 's'} need attention`
                  : 'Required checks passed'}
              </span>
            </button>

            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              aria-label="Refresh dashboard"
              className="p-2 rounded-sm border border-[#E5E7EB] text-[#6B7280] hover:text-[#374151] hover:border-[#CBD5E1] transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E698F] focus-visible:ring-offset-2"
            >
              {isRefreshing ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
            </button>
          </div>
        </div>
      </div>

      {!isAllBranches && activeSlugs && branchContext && (
        <div className="px-5 lg:px-8 pt-3">
          <div className="inline-flex items-center gap-2 text-[11px] font-semibold text-[#6B7280]">
            Viewing {activeSlugs.length} of {branchContext.allBranches.length} branches
            <button
              onClick={() => branchContext.setActiveBranchSlugs(branchContext.allBranches.map(b => b.slug))}
              className="text-[#1E698F] font-bold hover:underline"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      <div className="px-3 py-3 sm:px-5 sm:py-5 lg:px-7">
        {tab === 'control' && (
          <BusinessOverview
            branches={branches}
            branchContext={branchContext}
            spokeConnections={spokeConnections}
            orders={orders}
            window={timeWindow}
            refreshKey={businessRefreshKey}
            onViewChange={onViewChange}
          />
        )}

        {tab === 'control' && (
          <ControlRoom
            healthLoading={healthLoading}
            branchCards={branchCards}
            timeline={timeline}
            systems={systems}
            queue={queue}
            totals={totals}
            window={timeWindow}
            isLoading={isLoading}
            onViewChange={onViewChange}
            onSelectBranch={selectBranch}
            onSeeAllQueue={goToStandup}
            onConnectSpoke={goToBranches}
            onInlineSync={handleInlineSync}
            syncingConnIds={syncingConnIds}
            outcomes={outcomes}
            onDismissOutcome={dismissOutcome}
            weeklyActions={(
              <WeeklyActions
                actions={weeklyActions}
                users={team}
                scopeLabel={isAllBranches ? 'All brands' : scopedBranches.map(branch => branch.name).join(', ')}
                refreshedAt={actionsRefreshedAt}
                budgetMinutes={DEFAULT_WEEKLY_ACTION_BUDGET}
                isLoading={isLoading || actionsLoading}
                onOpen={openWeeklyAction}
                onComplete={action => updateWeeklyAction(action, 'completed')}
                onDismiss={action => updateWeeklyAction(action, 'dismissed')}
                onDefer={(action, until) => updateWeeklyAction(action, 'deferred', action.ownerId, until)}
                onAssign={(action, ownerId) => updateWeeklyAction(action, 'active', ownerId || null)}
              />
            )}
          />
        )}

        {/* Email is the richest live dataset in the app right now, so it gets
            its own card beneath the Control Room grid rather than a single row
            inside the totals panel. */}
        {tab === 'control' && (
          <div className="mt-[18px] max-w-[520px]">
            <EmailPulse
              events={emailEvents}
              window={timeWindow}
              isLoading={isLoading}
              onViewChange={onViewChange}
            />
          </div>
        )}

        {tab === 'standup' && (
          <MorningStandup
            queue={queue}
            totals={totals}
            window={timeWindow}
            branchCards={branchCards}
            systems={systems}
            whatWorked={whatWorked}
            isLoading={isLoading}
            onViewChange={onViewChange}
            onSnooze={handleSnooze}
            onInlineSync={handleInlineSync}
            syncingConnIds={syncingConnIds}
            outcomes={outcomes}
            onDismissOutcome={dismissOutcome}
          />
        )}

        {tab === 'board' && (
          <BranchBoard
            branchCards={branchCards}
            queue={queue}
            totals={totals}
            window={timeWindow}
            systems={systems}
            isLoading={isLoading}
            onViewChange={onViewChange}
            onSelectBranch={selectBranch}
            onWorkTheList={goToStandup}
            onConnectSpoke={goToBranches}
          />
        )}
      </div>
    </div>
  );
};

export default Dashboard;
