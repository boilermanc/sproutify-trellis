import { supabase } from '../lib/supabase';
import {
  SpokeConnection, EnrichedProfile, Branch, ScheduledPost, MarketingEvent,
  VideoAdJob, BranchStatsResult, ViewState,
} from '../types';
import { NormalizedOrder } from '../spokeConnector';
import { PublishedPost } from '../lib/supabaseService';
import { EmailEventRow } from './emailReportingService';
import { MetaInsights } from './metaInsightsService';
import { fetchLatestInsights, engagementRate } from './socialInsightsService';
import { formatBranchName, timeAgo, SOCIAL_PLATFORM_META } from '../utils';
import {
  TimeWindow, WindowMetric, WindowTotals, SystemStatus, SystemRow, WebhookHealth,
  TimelineState, TimelineItem, SEVERITY_RANK, QueueItem, BranchHealth, BranchCardData,
  PerformerPost, WhatWorked,
} from '../components/dashboard/types';

// ─── Dashboard data layer ────────────────────────────────────────────
// Data source for the redesigned Dashboard (docs/design_handoff_dashboard_redesign).
// Every exported function here is traceable to a live query — see the "Data
// honesty" section of that handoff. Missing/uncomputable data returns null or
// [], NEVER a fabricated 0 — the UI renders those as "—" or an empty state.
//
// Derivation functions (computeWindowTotals, buildSystemRows, buildTimeline,
// buildQueue, buildBranchCards) are pure and synchronous so the page can
// useMemo them over props/state it already has, rather than re-fetching.
// Only fetchWebhookHealth, getWhatWorked and the snooze CRUD functions talk
// to the network.
// ────────────────────────────────────────────────────────────────────

const MS_DAY = 24 * 60 * 60 * 1000;

// The three scheduled-post platforms that route through a dedicated n8n
// publish webhook. Used to cross-reference a scheduled post against webhook
// health for the "at risk" timeline state and the "webhook down" queue item.
const PLATFORM_WEBHOOK_PATH: Record<'instagram' | 'facebook' | 'tiktok', string> = {
  instagram: 'trellis-social-publish',
  facebook: 'trellis-facebook-publish',
  tiktok: 'trellis-tiktok-publish',
};

function platformLabel(platform: string): string {
  return SOCIAL_PLATFORM_META[platform]?.label || platform;
}

// n8n's Supabase node (and, defensively, any other writer) can stringify a
// JSONB column instead of leaving it native — normalize on read the same way
// services/scheduledPostService.ts and services/socialInsightsService.ts do.
function parseJsonbField<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value as T;
  try {
    const parsed = JSON.parse(value);
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

function tsOf(v?: string | null): number | null {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isNaN(t) ? null : t;
}

function inRange(ts: number | null, start: number, end: number): boolean {
  return ts !== null && ts >= start && ts < end;
}

function truncate(text: string, max: number): string {
  const trimmed = (text || '').trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

function hostOf(url?: string): string | null {
  if (!url) return null;
  try {
    return new URL(/^https?:\/\//.test(url) ? url : `https://${url}`).hostname;
  } catch {
    return url;
  }
}

function windowBounds(window: TimeWindow): { curStart: number; curEnd: number; priorStart: number; priorEnd: number } {
  const days = window === '30d' ? 30 : 7;
  const curEnd = Date.now();
  const curStart = curEnd - days * MS_DAY;
  const priorEnd = curStart;
  const priorStart = priorEnd - days * MS_DAY;
  return { curStart, curEnd, priorStart, priorEnd };
}

function dayBounds(): { dayStart: number; dayEnd: number } {
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return { dayStart, dayEnd: dayStart + MS_DAY };
}

// Generic windowed-metric builder: delta/deltaPct are null when the prior
// window has NO data reaching into it at all (e.g. the spoke has less history
// than the window) — that is genuinely "unknown", not zero. When the prior
// window does have history but its count/total happens to be 0, delta is a
// real number (current - 0) and only deltaPct goes null (divide-by-zero).
function toMetric(current: number, prior: number, priorWindowHasHistory: boolean): WindowMetric {
  if (!priorWindowHasHistory) return { value: current, delta: null, deltaPct: null };
  const delta = current - prior;
  const deltaPct = prior !== 0 ? (delta / prior) * 100 : null;
  return { value: current, delta, deltaPct };
}

// ═══════════════════════════════════════════════════════════════
// 1. computeWindowTotals
// ═══════════════════════════════════════════════════════════════

export function computeWindowTotals(
  orders: NormalizedOrder[],
  enrichedProfiles: EnrichedProfile[],
  publishedEvents: PublishedPost[],
  emailEvents: EmailEventRow[],
  window: TimeWindow,
): WindowTotals {
  const { curStart, curEnd, priorStart, priorEnd } = windowBounds(window);

  // ── Revenue: orders.paid_at || orders.created_at ──────────────────
  const orderPoints = orders
    .map(o => ({ ts: tsOf(o.paid_at || o.created_at), total: o.total ?? 0 }))
    .filter((o): o is { ts: number; total: number } => o.ts !== null);
  const revenueCur = orderPoints.filter(o => inRange(o.ts, curStart, curEnd)).reduce((s, o) => s + o.total, 0);
  const revenuePrior = orderPoints.filter(o => inRange(o.ts, priorStart, priorEnd)).reduce((s, o) => s + o.total, 0);
  // "Has history" = at least one order predates the current window, i.e. a
  // real prior period exists to compare against (even if its own count is 0).
  const revenueHasHistory = orderPoints.some(o => o.ts < curStart);
  const revenue = toMetric(revenueCur, revenuePrior, revenueHasHistory);

  // ── Posts published: marketing_events / event_type='social_publish' ──
  const postTimes = publishedEvents
    .map(p => tsOf(p.published_at || p.created_at))
    .filter((t): t is number => t !== null);
  const postsCur = postTimes.filter(t => inRange(t, curStart, curEnd)).length;
  const postsPrior = postTimes.filter(t => inRange(t, priorStart, priorEnd)).length;
  const postsHasHistory = postTimes.some(t => t < curStart);
  const postsPublished = toMetric(postsCur, postsPrior, postsHasHistory);

  // ── New profiles: enrichedProfiles.created_at ──────────────────────
  const profileTimes = enrichedProfiles
    .map(p => tsOf(p.created_at))
    .filter((t): t is number => t !== null);
  const profilesCur = profileTimes.filter(t => inRange(t, curStart, curEnd)).length;
  const profilesPrior = profileTimes.filter(t => inRange(t, priorStart, priorEnd)).length;
  const profilesHasHistory = profileTimes.some(t => t < curStart);
  const newProfiles = toMetric(profilesCur, profilesPrior, profilesHasHistory);

  // ── Email open rate + bounces: email_events.occurred_at ────────────
  // Deliberately NOT campaign_email_stats (aggregates by subject, no day
  // granularity — can't be windowed). Raw email_events gives real per-day cuts.
  const emailsCur = emailEvents.filter(e => inRange(tsOf(e.occurred_at), curStart, curEnd));
  const emailsPrior = emailEvents.filter(e => inRange(tsOf(e.occurred_at), priorStart, priorEnd));
  const deliveredCur = emailsCur.filter(e => e.event_type === 'delivered').length;
  const openedCur = emailsCur.filter(e => e.event_type === 'opened').length;
  const deliveredPrior = emailsPrior.filter(e => e.event_type === 'delivered').length;
  const openedPrior = emailsPrior.filter(e => e.event_type === 'opened').length;
  const bounced = emailsCur.filter(e => e.event_type === 'bounced').length;

  const hasEmailData = deliveredCur > 0;
  let openRate: WindowMetric;
  if (!hasEmailData) {
    // No delivered emails this window — the UI renders this as unavailable,
    // not as a fake 0%.
    openRate = { value: 0, delta: null, deltaPct: null };
  } else {
    const rateCur = (openedCur / deliveredCur) * 100;
    if (deliveredPrior === 0) {
      openRate = { value: rateCur, delta: null, deltaPct: null };
    } else {
      const ratePrior = (openedPrior / deliveredPrior) * 100;
      const delta = rateCur - ratePrior;
      openRate = { value: rateCur, delta, deltaPct: ratePrior !== 0 ? (delta / ratePrior) * 100 : null };
    }
  }

  return { revenue, postsPublished, newProfiles, openRate, bounced, hasEmailData };
}

// ═══════════════════════════════════════════════════════════════
// 2. fetchWebhookHealth
// ═══════════════════════════════════════════════════════════════

// Calls the webhook-health Edge Function (server-side cached ~5 min). Never
// probes n8n directly from the browser — n8n doesn't send CORS headers for
// these paths, so a browser fetch would be blocked before it ever left.
export async function fetchWebhookHealth(force = false): Promise<WebhookHealth[]> {
  try {
    const { data, error } = await supabase.functions.invoke('webhook-health', { body: { force } });
    if (error) throw error;
    return (data?.results ?? []) as WebhookHealth[];
  } catch (e) {
    console.error('fetchWebhookHealth failed:', e);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════
// 3. buildSystemRows
// ═══════════════════════════════════════════════════════════════

export function buildSystemRows(
  webhooks: WebhookHealth[],
  spokeConnections: SpokeConnection[],
  emailEvents: EmailEventRow[],
): SystemRow[] {
  const rows: SystemRow[] = [];

  // Webhooks that are down (404 — not imported/active) or erroring (network
  // failure/timeout reaching n8n at all).
  for (const w of webhooks) {
    if (w.status !== 'down' && w.status !== 'error') continue;
    rows.push({
      key: `webhook:${w.path}`,
      name: w.path,
      status: w.status,
      code: w.status === 'down' ? '404' : 'ERROR',
      detail: w.detail,
    });
  }

  // Spoke connections: erroring outright, or active but stale (>48h since
  // last successful test).
  const STALE_MS = 48 * 3600 * 1000;
  for (const c of spokeConnections) {
    if (c.status === 'error') {
      rows.push({
        key: `spoke:${c.id}`,
        name: c.name,
        status: 'error',
        code: 'ERROR',
        detail: c.last_error || 'Spoke connection is erroring.',
      });
      continue;
    }
    if (c.status !== 'active') continue;
    const lastTested = tsOf(c.last_tested_at);
    if (lastTested !== null && Date.now() - lastTested <= STALE_MS) continue;
    rows.push({
      key: `spoke:${c.id}`,
      name: c.name,
      status: 'stale',
      code: 'STALE',
      detail: lastTested === null ? 'Never synced.' : `Last synced ${timeAgo(c.last_tested_at!)}.`,
    });
  }

  // Resend dispatch health — one row, always present, summarizing the last 7
  // days regardless of the active time-window toggle (system health is
  // reported on its own fixed cadence, not the revenue window).
  const sevenDaysAgo = Date.now() - 7 * MS_DAY;
  const recent = emailEvents.filter(e => {
    const t = tsOf(e.occurred_at);
    return t !== null && t >= sevenDaysAgo;
  });
  const sent = recent.filter(e => e.event_type === 'sent').length;
  const bouncedCount = recent.filter(e => e.event_type === 'bounced').length;
  const complained = recent.filter(e => e.event_type === 'complained').length;
  const bounceRate = sent > 0 ? bouncedCount / sent : 0;
  const resendStatus: SystemStatus = complained > 0 ? 'error' : bounceRate > 0.05 ? 'stale' : 'ok';
  rows.push({
    key: 'resend:dispatch',
    name: 'Resend dispatch',
    status: resendStatus,
    code: resendStatus === 'ok' ? 'OK' : resendStatus.toUpperCase(),
    detail: `${sent} sent · ${bouncedCount} bounced · ${complained} complained (last 7 days)`,
  });

  const rank: Record<SystemStatus, number> = { down: 0, error: 1, stale: 2, ok: 3 };
  rows.sort((a, b) => rank[a.status] - rank[b.status]);
  return rows;
}

// ═══════════════════════════════════════════════════════════════
// 4. buildTimeline
// ═══════════════════════════════════════════════════════════════

export function buildTimeline(
  publishedPosts: PublishedPost[],
  scheduledPosts: ScheduledPost[],
  marketingEvents: MarketingEvent[],
  webhooks: WebhookHealth[],
  branches: Branch[],
  spokeConnections: SpokeConnection[],
): TimelineItem[] {
  const { dayStart, dayEnd } = dayBounds();
  const branchById = new Map(branches.map(b => [b.id, b] as const));
  const branchBySlug = new Map(branches.map(b => [b.slug, b] as const));
  const branchByConnectionId = new Map(
    branches.filter(b => b.spoke_connection_id).map(b => [b.spoke_connection_id as string, b] as const)
  );
  const downPaths = new Set(webhooks.filter(w => w.status === 'down').map(w => w.path));

  const items: TimelineItem[] = [];
  const touchedBranchSlugs = new Set<string>();

  const branchMeta = (branch: Branch | undefined, fallbackName: string) => ({
    branchName: branch?.name || fallbackName,
    branchColor: branch?.primary_color || '#64748B',
    branchSlug: branch?.slug ?? null,
  });

  // ── Published posts (marketing_events, event_type='social_publish') ──
  for (const post of publishedPosts) {
    const ts = tsOf(post.published_at || post.created_at);
    if (!inRange(ts, dayStart, dayEnd)) continue;
    const branch = post.branch_id ? branchById.get(post.branch_id) : undefined;
    const meta = branchMeta(branch, 'Unknown branch');
    if (meta.branchSlug) touchedBranchSlugs.add(meta.branchSlug);
    items.push({
      id: `published:${post.id}`,
      at: new Date(ts as number).toISOString(),
      ...meta,
      text: `Published to ${platformLabel(post.source)}${post.caption ? ` — "${truncate(post.caption, 60)}"` : ''}`,
      state: 'posted',
    });
  }

  // ── Scheduled posts (Post Scheduler queue), today only, past + future ──
  for (const post of scheduledPosts) {
    const ts = tsOf(post.scheduled_for);
    if (!inRange(ts, dayStart, dayEnd)) continue;
    if (post.status === 'cancelled') continue; // withdrawn — nothing to show

    const branch = (post.branch_slug && branchBySlug.get(post.branch_slug)) || branchById.get(post.branch_id);
    const meta = branchMeta(branch, formatBranchName(post.branch_slug || 'branch'));
    if (meta.branchSlug) touchedBranchSlugs.add(meta.branchSlug);

    const webhookPath = post.platform in PLATFORM_WEBHOOK_PATH
      ? PLATFORM_WEBHOOK_PATH[post.platform as keyof typeof PLATFORM_WEBHOOK_PATH]
      : undefined;
    // The highest-value rule on this page: a post scheduled to a platform
    // whose publish webhook is down will silently fail and get marked sent.
    const isAtRisk = (post.status === 'scheduled' || post.status === 'publishing')
      && !!webhookPath && downPaths.has(webhookPath);

    let state: TimelineState;
    let text: string;
    let actionLabel: string | undefined;
    let actionView: ViewState | undefined;

    if (post.status === 'published') {
      state = 'posted';
      text = `Published to ${platformLabel(post.platform)}`;
    } else if (post.status === 'failed') {
      state = 'error';
      text = `Failed to publish to ${platformLabel(post.platform)}${post.last_error ? `: ${truncate(post.last_error, 80)}` : ''}`;
      actionLabel = 'Fix';
      actionView = 'social-hub';
    } else if (isAtRisk) {
      state = 'at_risk';
      text = `Scheduled to ${platformLabel(post.platform)} — publisher is down, will fail silently`;
      actionLabel = 'Reroute';
      actionView = 'social-hub';
    } else if ((ts as number) < Date.now() && (post.status === 'scheduled' || post.status === 'publishing')) {
      // Past its scheduled time and still unpublished. TimelineState has no
      // dedicated "overdue" value (that's a Queue-only severity), so this
      // surfaces as an error — something should have fired and didn't.
      state = 'error';
      text = `Past due — has not posted to ${platformLabel(post.platform)} yet`;
      actionLabel = 'Fix';
      actionView = 'social-hub';
    } else {
      state = 'queued';
      text = `Scheduled to post to ${platformLabel(post.platform)}`;
      actionLabel = 'Preview';
      actionView = 'social-hub';
    }

    items.push({
      id: `scheduled:${post.id}`,
      at: post.scheduled_for,
      ...meta,
      text,
      state,
      actionLabel,
      actionView,
    });
  }

  // ── Spoke sync events — a connection successfully (or unsuccessfully)
  //    tested today. ──
  for (const conn of spokeConnections) {
    const ts = tsOf(conn.last_tested_at);
    if (!inRange(ts, dayStart, dayEnd)) continue;
    const branch = branchByConnectionId.get(conn.id);
    const meta = branchMeta(branch, conn.name);
    if (meta.branchSlug) touchedBranchSlugs.add(meta.branchSlug);
    items.push({
      id: `sync:${conn.id}:${ts}`,
      at: conn.last_tested_at as string,
      ...meta,
      text: conn.status === 'error' ? `${conn.name} sync failed` : `${conn.name} spoke synced`,
      state: conn.status === 'error' ? 'error' : 'synced',
      actionLabel: conn.status === 'error' ? 'Fix' : undefined,
      actionView: conn.status === 'error' ? 'branches' : undefined,
    });
  }

  // ── Other marketing_events. event_type='social_publish' rows are already
  //    covered above via publishedPosts, so skip duplicates. As of writing
  //    every marketing_events row IS a social_publish row, so this loop is a
  //    no-op today — kept for when other event types start landing there.
  //    NOTE: render-job events ("job events" per the design handoff) have no
  //    data source in this function's signature (videoAdJobs isn't passed
  //    in here, only to buildQueue) and are intentionally not represented. ──
  for (const event of marketingEvents) {
    if (event.event_type === 'social_publish') continue;
    const ts = tsOf(event.created_at);
    if (!inRange(ts, dayStart, dayEnd)) continue;
    const payloadBranchId = event.payload?.branch_id as string | undefined;
    const branch = payloadBranchId ? branchById.get(payloadBranchId) : undefined;
    const meta = branchMeta(branch, 'Ecosystem');
    if (meta.branchSlug) touchedBranchSlugs.add(meta.branchSlug);
    items.push({
      id: `event:${event.id}`,
      at: event.created_at,
      ...meta,
      text: `${event.event_type} event recorded`,
      state: 'synced',
    });
  }

  items.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  // ── Idle branches: nothing scheduled, published, or synced today. One row
  //    per branch, appended after the real chronological items — this is a
  //    genuine "no activity found" read, not a fabricated value. ──
  const emptyItems: TimelineItem[] = [];
  for (const branch of branches) {
    if (touchedBranchSlugs.has(branch.slug)) continue;
    emptyItems.push({
      id: `empty:${branch.slug}`,
      at: new Date(dayStart).toISOString(),
      branchName: branch.name,
      branchColor: branch.primary_color || '#64748B',
      branchSlug: branch.slug,
      text: 'Nothing scheduled or published today',
      state: 'empty',
      actionLabel: 'Draft',
      actionView: 'post-scheduler',
    });
  }
  emptyItems.sort((a, b) => a.branchName.localeCompare(b.branchName));

  return [...items, ...emptyItems];
}

// ═══════════════════════════════════════════════════════════════
// 5. buildQueue
// ═══════════════════════════════════════════════════════════════

export function buildQueue(
  spokeConnections: SpokeConnection[],
  scheduledPosts: ScheduledPost[],
  webhooks: WebhookHealth[],
  videoAdJobs: VideoAdJob[],
  branches: Branch[],
  branchStats: BranchStatsResult,
): QueueItem[] {
  const items: QueueItem[] = [];
  const branchByConnectionId = new Map(
    branches.filter(b => b.spoke_connection_id).map(b => [b.spoke_connection_id as string, b] as const)
  );
  const branchBySlug = new Map(branches.map(b => [b.slug, b] as const));
  const now = Date.now();
  // occurredAt === null (never happened / unknown) sorts as infinitely old —
  // "we don't even know when this started" is at least as urgent as "we know
  // it's been a while."
  const ageMs = (iso: string | null) => (iso ? now - new Date(iso).getTime() : Number.POSITIVE_INFINITY);

  // 1. Spoke connection erroring → Blocking ------------------------------
  for (const conn of spokeConnections) {
    if (conn.status !== 'error') continue;
    const branch = branchByConnectionId.get(conn.id);
    items.push({
      key: `spoke-error:${conn.id}`,
      severity: 'blocking',
      title: `${branch?.name || conn.name} spoke connection is erroring`,
      detail: conn.last_error || 'The federated read is failing — profile and revenue numbers for this branch are stale or missing.',
      branchName: branch?.name || conn.name,
      branchColor: branch?.primary_color || '#64748B',
      branchSlug: branch?.slug ?? null,
      occurredAt: conn.last_tested_at ?? null,
      actionLabel: 'Re-test',
      actionView: 'branches',
    });
  }

  // 2. Webhook down with posts routed to it → Blocking --------------------
  const platformByPath = new Map<string, 'instagram' | 'facebook' | 'tiktok'>(
    (Object.entries(PLATFORM_WEBHOOK_PATH) as ['instagram' | 'facebook' | 'tiktok', string][]).map(([p, path]) => [path, p])
  );
  for (const w of webhooks) {
    if (w.status !== 'down') continue;
    const platform = platformByPath.get(w.path);
    if (!platform) continue; // not a scheduled-post publish path

    const routed = scheduledPosts.filter(p => p.platform === platform && (p.status === 'scheduled' || p.status === 'publishing'));
    if (routed.length === 0) continue; // trigger requires posts actually routed to it
    const alreadyFailed = scheduledPosts.filter(p => p.platform === platform && p.status === 'failed');
    const affected = [...routed, ...alreadyFailed];

    const oldest = affected.reduce<string | null>((min, p) => {
      return !min || new Date(p.scheduled_for).getTime() < new Date(min).getTime() ? p.scheduled_for : min;
    }, null);

    items.push({
      key: `webhook-down:${w.path}`,
      severity: 'blocking',
      // n = posts already failed plus posts currently queued to this
      // platform — a down webhook fails all of them the same (silent) way.
      title: `${platformLabel(platform)} publishing has failed ${affected.length} times`,
      detail: w.detail,
      branchName: 'All branches',
      branchColor: '#64748B',
      branchSlug: null,
      occurredAt: oldest,
      actionLabel: 'Open flows',
      actionView: 'automations',
    });
  }

  // 3. Overdue scheduled posts, per branch → Overdue -----------------------
  const overdueByBranch = new Map<string, ScheduledPost[]>();
  for (const p of scheduledPosts) {
    if (p.status !== 'scheduled') continue;
    if (new Date(p.scheduled_for).getTime() >= now) continue;
    const key = p.branch_slug || p.branch_id;
    if (!overdueByBranch.has(key)) overdueByBranch.set(key, []);
    overdueByBranch.get(key)!.push(p);
  }
  for (const [key, posts] of overdueByBranch) {
    const first = posts[0];
    const branch = (first.branch_slug && branchBySlug.get(first.branch_slug)) || branchByConnectionId.get(first.branch_id);
    const oldest = posts.reduce((min, p) => new Date(p.scheduled_for).getTime() < new Date(min).getTime() ? p.scheduled_for : min, first.scheduled_for);
    items.push({
      key: `overdue-posts:${key}`,
      severity: 'overdue',
      title: `${posts.length} posts are past their scheduled date`,
      detail: `${branch?.name || formatBranchName(key)} has unpublished posts that should already be live.`,
      branchName: branch?.name || formatBranchName(key),
      branchColor: branch?.primary_color || '#64748B',
      branchSlug: branch?.slug ?? (first.branch_slug || null),
      occurredAt: oldest,
      actionLabel: 'Review',
      actionView: 'social-hub',
    });
  }

  // 4. Spoke last_tested_at > 48h → Stale ----------------------------------
  const STALE_MS = 48 * 3600 * 1000;
  for (const conn of spokeConnections) {
    if (conn.status !== 'active') continue;
    const lastTested = tsOf(conn.last_tested_at);
    const isStale = lastTested === null || now - lastTested > STALE_MS;
    if (!isStale) continue;
    const branch = branchByConnectionId.get(conn.id);
    // Skip a spoke that has never been synced AND has never yielded a single
    // profile — nothing has ever actually been pulled from it, so "stale"
    // would be noise, not signal (trigger 1 above already covers real errors).
    const profileCount = branchStats.spokeStats[conn.id]?.profileCount ?? 0;
    if (profileCount === 0 && lastTested === null) continue;
    items.push({
      key: `spoke-stale:${conn.id}`,
      severity: 'stale',
      title: `${branch?.name || conn.name} spoke last synced ${lastTested !== null ? timeAgo(conn.last_tested_at as string) : 'never'}`,
      detail: 'Federated profile and order data for this branch may be out of date.',
      branchName: branch?.name || conn.name,
      branchColor: branch?.primary_color || '#64748B',
      branchSlug: branch?.slug ?? null,
      occurredAt: conn.last_tested_at ?? null,
      actionLabel: 'Sync',
      inlineAction: 'sync',
    });
  }

  // 5. Video ad renders awaiting approval, per branch → Waiting ------------
  // NOTE: this function's signature is wired to VideoAdJob, not Clip
  // Studio's ClipRenderJob — the design handoff's "clips" language and
  // clip-studio destination assume the latter, which has no data source
  // here. This reflects Video Ad Lab renders and routes to video-ad-lab.
  const waitingByBranch = new Map<string, VideoAdJob[]>();
  for (const job of videoAdJobs) {
    if (job.status !== 'awaiting_approval') continue;
    if (!waitingByBranch.has(job.branch)) waitingByBranch.set(job.branch, []);
    waitingByBranch.get(job.branch)!.push(job);
  }
  for (const [slug, jobs] of waitingByBranch) {
    const branch = branchBySlug.get(slug);
    const oldest = jobs.reduce((min, j) => new Date(j.created_at).getTime() < new Date(min).getTime() ? j.created_at : min, jobs[0].created_at);
    items.push({
      key: `waiting-jobs:${slug}`,
      severity: 'waiting',
      title: `${jobs.length} ads finished rendering`,
      detail: `${branch?.name || formatBranchName(slug)} has creative waiting on a decision.`,
      branchName: branch?.name || formatBranchName(slug),
      branchColor: branch?.primary_color || '#64748B',
      branchSlug: branch?.slug ?? slug,
      occurredAt: oldest,
      actionLabel: 'Approve',
      actionView: 'video-ad-lab',
    });
  }

  // 6. Branch with no published post in >= 7 days → Idle -------------------
  // Only scheduled_social_posts (Post Scheduler) history is visible to this
  // function — posts published via the SocialHub/DraftPost approval flow
  // live in marketing_events, which isn't part of this signature. A branch
  // that posts exclusively through that other path may be undercounted, so a
  // POSITIVE last-published signal is required before flagging idle; absence
  // of Post Scheduler history alone never triggers this (never guess).
  const IDLE_MS = 7 * MS_DAY;
  const lastPublishedByBranch = new Map<string, string>();
  for (const p of scheduledPosts) {
    if (p.status !== 'published' || !p.published_at) continue;
    const key = p.branch_slug || p.branch_id;
    const existing = lastPublishedByBranch.get(key);
    if (!existing || new Date(p.published_at).getTime() > new Date(existing).getTime()) {
      lastPublishedByBranch.set(key, p.published_at);
    }
  }
  for (const branch of branches) {
    const lastAt = lastPublishedByBranch.get(branch.slug);
    if (!lastAt) continue; // no positive signal — don't guess
    if (now - new Date(lastAt).getTime() < IDLE_MS) continue;
    const conn = branch.spoke_connection_id ? spokeConnections.find(c => c.id === branch.spoke_connection_id) : undefined;
    const profileCount = conn ? (branchStats.spokeStats[conn.id]?.profileCount ?? 0) : 0;
    if (profileCount === 0) continue; // not really in active use yet
    const days = Math.floor((now - new Date(lastAt).getTime()) / MS_DAY);
    items.push({
      key: `idle-branch:${branch.slug}`,
      severity: 'idle',
      title: `${branch.name} has not posted in ${days} days`,
      detail: 'No published posts in the Post Scheduler queue for a week or more.',
      branchName: branch.name,
      branchColor: branch.primary_color || '#64748B',
      branchSlug: branch.slug,
      occurredAt: lastAt,
      actionLabel: 'Draft',
      actionView: 'post-scheduler',
    });
  }

  items.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || ageMs(b.occurredAt) - ageMs(a.occurredAt));
  return items;
}

// ═══════════════════════════════════════════════════════════════
// 6. buildBranchCards
// ═══════════════════════════════════════════════════════════════

// Daily revenue buckets over the window, oldest first. If the branch's order
// history doesn't reach back to the window start, only the days that
// actually exist are returned (left-aligned in the UI) rather than padding
// with fabricated zero-days.
function buildDailySparkline(points: { ts: number; total: number }[], windowStart: number, windowEnd: number): number[] {
  if (points.length === 0) return [];
  const startOfDay = (t: number) => {
    const d = new Date(t);
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  };
  const earliest = Math.min(...points.map(p => p.ts));
  const effectiveStart = earliest > windowStart ? startOfDay(earliest) : startOfDay(windowStart);
  const lastDay = startOfDay(windowEnd);
  const buckets: number[] = [];
  for (let d = effectiveStart; d <= lastDay; d += MS_DAY) {
    const sum = points.filter(p => p.ts >= d && p.ts < d + MS_DAY).reduce((s, p) => s + p.total, 0);
    buckets.push(sum);
  }
  return buckets;
}

export function buildBranchCards(
  branches: Branch[],
  branchStats: BranchStatsResult,
  orders: NormalizedOrder[],
  // Keyed by branch.id (the UUID the meta-insights Edge Function expects),
  // NOT branch.slug — mirrors how social_credentials/get_meta_insight_credentials
  // are keyed elsewhere in the app.
  metaInsights: Record<string, MetaInsights>,
  publishedEvents: PublishedPost[],
  spokeConnections: SpokeConnection[],
  window: TimeWindow,
): BranchCardData[] {
  const { curStart, curEnd, priorStart, priorEnd } = windowBounds(window);

  const cards: BranchCardData[] = branches.map(branch => {
    const conn = branch.spoke_connection_id
      ? spokeConnections.find(c => c.id === branch.spoke_connection_id)
      : undefined;
    const stats = conn ? branchStats.spokeStats[conn.id] : undefined;

    // ── Health — reuses the freshness taxonomy also used in the Control
    //    Room branch strip (getFreshness in the previous Dashboard.tsx). ──
    let health: BranchHealth;
    let healthLabel: string;
    if (!conn) {
      health = 'offline'; healthLabel = 'Offline';
    } else if (conn.status === 'error') {
      health = 'down'; healthLabel = 'Down';
    } else if (conn.status === 'disconnected') {
      health = 'offline'; healthLabel = 'Offline';
    } else {
      const lastTested = tsOf(conn.last_tested_at);
      const hours = lastTested === null ? Infinity : (Date.now() - lastTested) / 3600000;
      if (hours < 24) { health = 'healthy'; healthLabel = 'Healthy'; }
      else if (hours < 48) { health = 'aging'; healthLabel = 'Aging'; }
      else { health = 'stale'; healthLabel = 'Stale'; }
    }

    // ── Profiles + delta ──────────────────────────────────────────────
    const branchProfiles = conn ? branchStats.enrichedProfiles.filter(p => p._spoke_id === conn.id) : [];
    const profileTimes = branchProfiles.map(p => tsOf(p.created_at)).filter((t): t is number => t !== null);
    const profilesCurCount = profileTimes.filter(t => inRange(t, curStart, curEnd)).length;
    const profilesPriorCount = profileTimes.filter(t => inRange(t, priorStart, priorEnd)).length;
    const profilesHasHistory = profileTimes.some(t => t < curStart);
    const profilesDelta = profilesHasHistory ? profilesCurCount - profilesPriorCount : null;

    // ── Revenue + delta + sparkline ─────────────────────────────────────
    const branchOrders = conn
      ? orders
          .filter(o => o._spoke_id === conn.id)
          .map(o => ({ ts: tsOf(o.paid_at || o.created_at), total: o.total ?? 0 }))
          .filter((o): o is { ts: number; total: number } => o.ts !== null)
      : [];
    const revenueCur = branchOrders.filter(o => inRange(o.ts, curStart, curEnd)).reduce((s, o) => s + o.total, 0);
    const revenuePrior = branchOrders.filter(o => inRange(o.ts, priorStart, priorEnd)).reduce((s, o) => s + o.total, 0);
    const revenueHasHistory = branchOrders.some(o => o.ts < curStart);
    const revenueDelta = revenueHasHistory ? revenueCur - revenuePrior : null;
    const sparkline = buildDailySparkline(
      branchOrders.filter(o => inRange(o.ts, curStart, curEnd)),
      curStart,
      curEnd,
    );

    // ── Followers — current value only, no history exists so delta is
    //    always null (per BranchCardData contract). ──────────────────────
    const insights = metaInsights[branch.id];
    let followers: number | null = null;
    if (insights?.connected) {
      const igFollowers = insights.instagram?.followers;
      const fbFans = insights.facebook?.fans;
      if (igFollowers != null || fbFans != null) {
        followers = (igFollowers ?? 0) + (fbFans ?? 0);
      }
    }

    // ── Posts in window ──────────────────────────────────────────────
    const posts = publishedEvents.filter(p => {
      if (p.branch_id !== branch.id) return false;
      const ts = tsOf(p.published_at || p.created_at);
      return inRange(ts, curStart, curEnd);
    }).length;

    // ── Next action — best-effort from the signals available here (spoke
    //    health + windowed publish activity). scheduledPosts/webhooks/
    //    videoAdJobs aren't part of this function's signature, so this can't
    //    fully reproduce buildQueue()'s severity ladder for the branch;
    //    cross-reference buildQueue() output by branchSlug for the full
    //    picture (e.g. overdue posts, at-risk publishers). ──
    let nextAction: BranchCardData['nextAction'] = null;
    if (conn?.status === 'error') {
      nextAction = { text: conn.last_error || 'Spoke connection is erroring', tone: 'blocking', label: 'Re-test', view: 'branches' };
    } else if (health === 'stale') {
      nextAction = { text: `Spoke hasn't synced in over 48h`, tone: 'warning', label: 'Re-test', view: 'branches' };
    } else if (conn && posts === 0) {
      nextAction = { text: 'No posts published this window', tone: 'warning', label: 'Draft', view: 'post-scheduler' };
    }

    const card: BranchCardData = {
      slug: branch.slug,
      name: branch.name,
      color: branch.primary_color || '#64748B',
      host: hostOf(branch.website_url) || branch.slug,
      logoUrl: branch.logo_url ?? null,
      health,
      healthLabel,
      profiles: stats?.profileCount ?? 0,
      profilesDelta,
      revenue: revenueCur,
      revenueDelta,
      followers,
      followersDelta: null,
      posts,
      sparkline,
      nextAction,
    };
    return card;
  });

  // Descending revenue, matching the Control Room branch strip's ordering.
  return cards.sort((a, b) => b.revenue - a.revenue);
}

// ═══════════════════════════════════════════════════════════════
// 7. getWhatWorked
// ═══════════════════════════════════════════════════════════════

// Best/worst performer by engagement rate over the window, from
// social_post_insights joined (client-side) to scheduled_social_posts.
// Requires >= 3 posts with a COMPUTABLE engagement rate in the window —
// social_post_insights currently has 0 rows, so this returns null until data
// arrives; written correctly ahead of that so it "just works" once it does.
export async function getWhatWorked(window: TimeWindow): Promise<WhatWorked | null> {
  try {
    const days = window === '30d' ? 30 : 7;
    const sinceIso = new Date(Date.now() - days * MS_DAY).toISOString();

    const { data, error } = await supabase
      .from('scheduled_social_posts')
      .select('id, branch_slug, platform, caption, media_urls, published_at')
      .eq('status', 'published')
      .gte('published_at', sinceIso)
      .order('published_at', { ascending: false });
    if (error) throw error;

    const posts = (data || []) as {
      id: string; branch_slug: string | null; platform: string; caption: string; media_urls: unknown; published_at: string;
    }[];
    if (posts.length === 0) return null;

    const insights = await fetchLatestInsights(posts.map(p => p.id));

    const scored: { post: typeof posts[number]; rate: number; reach: number | null }[] = [];
    for (const post of posts) {
      const snapshot = insights.get(post.id);
      if (!snapshot) continue;
      // engagementRate() is null for Facebook Page posts (no saves metric) —
      // only Instagram posts with a computable rate can be ranked.
      const rate = engagementRate(snapshot);
      if (rate === null) continue;
      scored.push({ post, rate, reach: snapshot.reach ?? null });
    }

    // Below 3 ranked posts, hide the card entirely rather than crowning a
    // winner from a tiny sample.
    if (scored.length < 3) return null;

    scored.sort((a, b) => b.rate - a.rate);
    const top = scored[0];
    const bottom = scored[scored.length - 1];

    const toPerformer = (entry: typeof scored[number]): PerformerPost => {
      const mediaUrls = parseJsonbField<string[]>(entry.post.media_urls, []);
      return {
        id: entry.post.id,
        title: truncate(entry.post.caption, 80),
        branchName: formatBranchName(entry.post.branch_slug || 'branch'),
        platform: entry.post.platform,
        engagementRate: entry.rate,
        reach: entry.reach,
        imageUrl: mediaUrls[0] ?? null,
      };
    };

    return { top: toPerformer(top), bottom: toPerformer(bottom) };
  } catch (e) {
    console.error('getWhatWorked failed:', e);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════
// 8. Snooze CRUD (dashboard_snoozes, RLS-scoped to auth.uid())
// ═══════════════════════════════════════════════════════════════

// item_key → ISO expiry, unexpired only. Never throws — a failed lookup just
// means nothing is snoozed for this render.
export async function fetchSnoozes(): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) return result;

    const { data, error } = await supabase
      .from('dashboard_snoozes')
      .select('item_key, snoozed_until')
      .eq('user_id', userId)
      .gt('snoozed_until', new Date().toISOString());
    if (error) throw error;

    for (const row of (data || []) as { item_key: string; snoozed_until: string }[]) {
      result[row.item_key] = row.snoozed_until;
    }
    return result;
  } catch (e) {
    console.error('fetchSnoozes failed:', e);
    return result;
  }
}

export async function snoozeItem(key: string, hours = 24): Promise<boolean> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) return false;

    const snoozedUntil = new Date(Date.now() + hours * 3600000).toISOString();
    // Assumes a unique constraint on (user_id, item_key) — re-snoozing the
    // same item just pushes its expiry out.
    const { error } = await supabase
      .from('dashboard_snoozes')
      .upsert({ user_id: userId, item_key: key, snoozed_until: snoozedUntil }, { onConflict: 'user_id,item_key' });
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('snoozeItem failed:', e);
    return false;
  }
}

export async function unsnooze(key: string): Promise<boolean> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) return false;

    const { error } = await supabase
      .from('dashboard_snoozes')
      .delete()
      .eq('user_id', userId)
      .eq('item_key', key);
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('unsnooze failed:', e);
    return false;
  }
}
