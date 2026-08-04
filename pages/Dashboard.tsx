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
  computeWindowTotals, fetchWebhookHealth, buildSystemRows, buildTimeline,
  buildQueue, buildBranchCards, getWhatWorked, fetchSnoozes, snoozeItem,
} from '../services/dashboardService';
import {
  DashboardTab, TimeWindow, WebhookHealth, WhatWorked, QueueItem, QueueOutcome,
} from '../components/dashboard/types';
import ControlRoom from '../components/dashboard/ControlRoom';
import MorningStandup from '../components/dashboard/MorningStandup';
import BranchBoard from '../components/dashboard/BranchBoard';
import EmailPulse from '../components/dashboard/EmailPulse';
import { RefreshCw, Loader2 } from 'lucide-react';

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
  onViewChange, spokeConnections, onSpokeConnectionsChange, branchStats, branches = [], branchContext,
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
  const [webhooks, setWebhooks] = useState<WebhookHealth[]>([]);
  const [whatWorked, setWhatWorked] = useState<WhatWorked | null>(null);
  const [snoozed, setSnoozed] = useState<Record<string, string>>({});
  const [recentEvents, setRecentEvents] = useState<MarketingEvent[]>([]);

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
      ordersRes, postsRes, emailRes, schedRes, jobsRes, workedRes, snoozeRes, eventsRes,
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
        (async () => {
          const { data, error } = await supabase
            .from('email_events')
            .select('id,email,event_type,campaign_subject,campaign_id,resend_email_id,occurred_at,metadata')
            .gte('occurred_at', since)
            .order('occurred_at', { ascending: false })
            .range(0, 9999);
          if (error) throw error;
          return (data || []) as EmailEventRow[];
        })(),
        'email events', [] as EmailEventRow[],
      ),
      settle(fetchScheduledPosts(), 'scheduled posts', [] as ScheduledPost[]),
      settle(getVideoAdJobs(undefined, 100), 'creative jobs', [] as VideoAdJob[]),
      settle(getWhatWorked(timeWindow), 'post performance', null as WhatWorked | null),
      settle(fetchSnoozes(), 'snoozes', {} as Record<string, string>),
      settle(fetchRecentEvents(50), 'recent events', [] as MarketingEvent[]),
    ]);

    setOrders(ordersRes);
    setPublishedPosts(postsRes);
    setEmailEvents(emailRes);
    setDbScheduled(schedRes);
    setVideoAdJobs(jobsRes);
    setWhatWorked(workedRes);
    setSnoozed(snoozeRes);
    setRecentEvents(eventsRes);

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

  // Webhook health is probed SERVER-SIDE against n8n (webhook-health edge fn
  // POSTs an empty body to every webhook). Keep it OUT of loadAll: loadAll's
  // deps (spokeConnections, branches, timeWindow) stream in on mount and each
  // change re-ran the whole loader, so several overlapping runs would all miss
  // the 5-min health cache at once and stampede n8n with redundant probes.
  // Here it runs exactly once on mount, and again only on an explicit refresh,
  // with an in-flight guard so rapid refreshes coalesce into one probe.
  const healthInFlight = useRef<Promise<void> | null>(null);
  const loadWebhookHealth = useCallback((force = false): Promise<void> => {
    if (healthInFlight.current) return healthInFlight.current;
    const p = (async () => {
      try {
        setWebhooks(await fetchWebhookHealth(force));
      } catch (err) {
        console.error('[dashboard] webhook health failed:', err);
      }
    })().finally(() => { healthInFlight.current = null; });
    healthInFlight.current = p;
    return p;
  }, []);

  useEffect(() => { loadWebhookHealth(false); }, [loadWebhookHealth]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([loadAll(), loadWebhookHealth(true), branchStats.refresh?.()]);
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
        await Promise.all([loadAll(), branchStats.refresh?.()]);
        setOutcomes(prev => ({ ...prev, [item.key]: { item, status: 'success', message: 'Synced just now', at: nowIso } }));
      } else {
        setOutcomes(prev => ({ ...prev, [item.key]: { item, status: 'error', message: result.error || 'Sync failed — check the connection.', at: nowIso } }));
      }
    } catch (err) {
      console.error('[dashboard] inline sync failed for', connectionId, err);
      setOutcomes(prev => ({ ...prev, [item.key]: { item, status: 'error', message: err instanceof Error ? err.message : 'Sync failed.', at: new Date().toISOString() } }));
    } finally {
      setSyncingConnIds(prev => prev.filter(id => id !== connectionId));
    }
  }, [spokeConnections, onSpokeConnectionsChange, loadAll, branchStats, handleRefresh, dismissOutcome]);

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

  const systems = useMemo(
    () => buildSystemRows(webhooks, spokeConnections, emailEvents),
    [webhooks, spokeConnections, emailEvents],
  );

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
    return buildQueue(spokeConnections, dbScheduled, webhooks, videoAdJobs, scopedBranches, branchStats)
      .filter(item => {
        const until = snoozed[item.key];
        return !until || new Date(until).getTime() <= now;
      });
  }, [spokeConnections, dbScheduled, webhooks, videoAdJobs, scopedBranches, branchStats, snoozed]);

  const branchCards = useMemo(
    () => buildBranchCards(scopedBranches, branchStats, orders, metaInsights, publishedPosts, spokeConnections, timeWindow),
    [scopedBranches, branchStats, orders, metaInsights, publishedPosts, spokeConnections, timeWindow],
  );

  const degradedCount = useMemo(() => systems.filter(s => s.status !== 'ok').length, [systems]);

  const badgeFor = (id: DashboardTab) =>
    id === 'control' ? timeline.length : id === 'standup' ? queue.length : branchCards.length;

  const goToStandup = useCallback(() => selectTab('standup'), [selectTab]);
  const goToBranches = useCallback(() => onViewChange?.('branches' as ViewState), [onViewChange]);

  return (
    <div className="-m-4 lg:-m-8 min-h-full bg-[#F6F7F9]">
      {/* The page title and branch picker already live in Layout's header, so
          the window toggle and status pill ride with the tab bar rather than
          splicing into that shared header. */}
      <div className="bg-white border-b border-[#E5E7EB] px-5 lg:px-8">
        <div className="flex items-center justify-between gap-4 overflow-x-auto">
          <nav className="flex gap-7" role="tablist" aria-label="Dashboard views">
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
                  className={`flex items-center gap-2 py-3.5 px-0.5 text-[13px] font-bold whitespace-nowrap border-b-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E698F] focus-visible:ring-offset-2 ${
                    active
                      ? 'text-[#0B4A6B] border-[#0B4A6B]'
                      : 'text-[#6B7280] border-transparent hover:text-[#374151] hover:border-[#E5E7EB]'
                  }`}
                >
                  {t.label}
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

          <div className="flex items-center gap-2.5 py-2 shrink-0">
            <div className="flex items-center gap-1.5">
              {(['7d', '30d'] as TimeWindow[]).map(w => (
                <button
                  key={w}
                  onClick={() => selectWindow(w)}
                  className={`px-3 py-[7px] rounded-[7px] text-[12px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E698F] focus-visible:ring-offset-2 ${
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
              title={degradedCount ? 'Jump to system health' : 'All monitored systems responding'}
              className={`flex items-center gap-2 px-3 py-[7px] rounded-lg text-[12px] font-bold border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E698F] focus-visible:ring-offset-2 ${
                degradedCount
                  ? 'bg-[#FEF2F2] border-[#FECACA] text-[#B91C1C]'
                  : 'bg-[#ECFDF5] border-[#A7F3D0] text-[#047857]'
              }`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${degradedCount ? 'bg-[#EF4444]' : 'bg-[#10B981]'}`} />
              {degradedCount
                ? `${degradedCount} system${degradedCount === 1 ? '' : 's'} degraded`
                : 'All systems healthy'}
            </button>

            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              aria-label="Refresh dashboard"
              className="p-2 rounded-lg border border-[#E5E7EB] text-[#6B7280] hover:text-[#374151] hover:border-[#CBD5E1] transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E698F] focus-visible:ring-offset-2"
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

      <div className="px-5 lg:px-7 py-5">
        {tab === 'control' && (
          <ControlRoom
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
