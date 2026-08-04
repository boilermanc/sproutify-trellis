import React, { useMemo, useState } from 'react';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import {
  QueueItem,
  QueueOutcome,
  WindowTotals,
  TimeWindow,
  BranchCardData,
  BranchHealth,
  SystemRow,
  SystemStatus,
  WhatWorked,
  PerformerPost,
  Severity,
  SEVERITY_RANK,
} from './types';
import { ViewState } from '../../types';
import { SOCIAL_PLATFORM_META } from '../../utils';

interface MorningStandupProps {
  queue: QueueItem[];
  totals: WindowTotals;
  window: TimeWindow;
  branchCards: BranchCardData[];
  systems: SystemRow[];
  whatWorked: WhatWorked | null;
  isLoading: boolean;
  onViewChange?: (view: ViewState) => void;
  onSnooze: (key: string) => void;
  onInlineSync: (item: QueueItem) => void;
  syncingConnIds?: string[];
  outcomes?: Record<string, QueueOutcome>;
  onDismissOutcome?: (key: string) => void;
}

// ── design tokens ────────────────────────────────────────────────
const SEVERITY_COLORS: Record<Severity, string> = {
  blocking: '#DC2626',
  overdue: '#EA580C',
  stale: '#D97706',
  waiting: '#1E698F',
  idle: '#64748B',
};

const HEALTH_COLOR: Record<BranchHealth, string> = {
  healthy: '#10B981',
  aging: '#F59E0B',
  stale: '#F59E0B',
  down: '#EF4444',
  offline: '#94A3B8',
};

const TONE_COLOR: Record<'blocking' | 'warning' | 'positive', string> = {
  blocking: '#B91C1C',
  warning: '#B45309',
  positive: '#047857',
};

const STATUS_COLOR: Record<SystemStatus, string> = {
  ok: '#10B981',
  stale: '#F59E0B',
  down: '#EF4444',
  error: '#EF4444',
};

const PERFORMER_STYLES: Record<'top' | 'bottom', { border: string; bg: string; eyebrow: string; label: string; stripe: string }> = {
  top: {
    border: '#D1FAE5',
    bg: '#F0FDF4',
    eyebrow: '#059669',
    label: 'Top performer',
    stripe: 'bg-[repeating-linear-gradient(135deg,#A7F3D0,#A7F3D0_5px,#ECFDF5_5px,#ECFDF5_10px)]',
  },
  bottom: {
    border: '#FDE68A',
    bg: '#FFFBEB',
    eyebrow: '#B45309',
    label: 'Underperformed',
    stripe: 'bg-[repeating-linear-gradient(135deg,#FDE68A,#FDE68A_5px,#FFFBEB_5px,#FFFBEB_10px)]',
  },
};

// ── formatting helpers ───────────────────────────────────────────
const formatNumber = (n: number | null): string => (n == null ? '—' : n.toLocaleString());

const formatCurrency = (n: number | null): string => {
  if (n == null) return '—';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(1)}k`;
  return `${sign}$${Math.round(abs)}`;
};

const formatCompact = (n: number | null): string => {
  if (n == null) return '—';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1000) return `${sign}${(abs / 1000).toFixed(1)}k`;
  return `${sign}${Math.round(abs)}`;
};

const fmtPctDelta = (v: number | null): { text: string; positive: boolean } | null =>
  v == null ? null : { text: `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`, positive: v >= 0 };

const fmtCountDelta = (v: number | null): { text: string; positive: boolean } | null =>
  v == null ? null : { text: `${v >= 0 ? '+' : ''}${Math.round(v)}`, positive: v >= 0 };

const fmtPtsDelta = (v: number | null): { text: string; positive: boolean } | null =>
  v == null ? null : { text: `${v >= 0 ? '+' : ''}${v.toFixed(1)} pts`, positive: v >= 0 };

const ageShort = (iso: string | null): string | null => {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return null;
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return '<1h';
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
};

// ── small building blocks ────────────────────────────────────────
const SkeletonBlock: React.FC<{ className?: string }> = ({ className }) => (
  <div className={`animate-pulse rounded-xl bg-[#E5E7EB]/60 ${className ?? ''}`} />
);

const PerformerCard: React.FC<{ post: PerformerPost; tone: 'top' | 'bottom' }> = ({ post, tone }) => {
  const style = PERFORMER_STYLES[tone];
  const platformLabel = SOCIAL_PLATFORM_META[post.platform?.toLowerCase()]?.label ?? post.platform;
  const metaParts: string[] = [post.branchName, platformLabel];
  if (post.engagementRate != null) metaParts.push(`${post.engagementRate.toFixed(1)}% eng`);
  if (post.reach != null) metaParts.push(`${formatCompact(post.reach)} reach`);

  return (
    <div className="rounded-xl border p-3" style={{ borderColor: style.border, backgroundColor: style.bg }}>
      <div className="flex gap-3">
        {post.imageUrl ? (
          <img src={post.imageUrl} alt="" className="h-[52px] w-[52px] flex-shrink-0 rounded-lg object-cover" />
        ) : (
          <div className={`h-[52px] w-[52px] flex-shrink-0 rounded-lg ${style.stripe}`} />
        )}
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.12em]" style={{ color: style.eyebrow }}>
            {style.label}
          </p>
          <p className="truncate text-[13px] font-bold text-[#0F172A]">&ldquo;{post.title}&rdquo;</p>
          <p className="truncate text-[11px] text-[#475569]">{metaParts.join(' · ')}</p>
        </div>
      </div>
    </div>
  );
};

// ── Queue card ───────────────────────────────────────────────────
// Renders one "needs you" row in three states: actionable (default),
// completed (green, after a real success), or errored (red, retryable).
// The completed/errored states come from a QueueOutcome — never optimistic —
// and stay put with a Dismiss control so the user, not a timer, clears them.
const QueueCard: React.FC<{
  item: QueueItem;
  outcome?: QueueOutcome;
  isSyncing: boolean;
  onPrimary: (item: QueueItem) => void;
  onSnooze: (key: string) => void;
  onDismissOutcome?: (key: string) => void;
}> = ({ item, outcome, isSyncing, onPrimary, onSnooze, onDismissOutcome }) => {
  const [dismissing, setDismissing] = useState(false);
  const color = SEVERITY_COLORS[item.severity];
  const age = ageShort(item.occurredAt);

  // Play the exit animation, then remove the card once it has run.
  const handleDismiss = () => {
    setDismissing(true);
    window.setTimeout(() => onDismissOutcome?.(item.key), 250);
  };

  if (outcome?.status === 'success') {
    return (
      <div
        className={`flex items-center gap-4 rounded-xl border border-[#A7F3D0] px-[18px] py-4 queue-complete-flash ${dismissing ? 'queue-dismissing' : ''}`}
      >
        <span className="h-full w-1 flex-shrink-0 self-stretch rounded-full bg-[#10B981]" />
        <CheckCircle2 size={22} className="queue-check-pop flex-shrink-0 text-[#059669]" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-[11px] font-bold text-[#64748B]">{item.branchName}</span>
          <p className="text-[14px] font-bold leading-tight tracking-[-0.01em] text-[#065F46]">{item.title}</p>
          <p className="text-[12px] font-semibold text-[#059669]">{outcome.message}</p>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="flex-shrink-0 rounded-lg border border-[#A7F3D0] bg-white px-[15px] py-[9px] text-[11px] font-extrabold uppercase tracking-[0.06em] text-[#059669] transition-colors duration-150 hover:bg-[#ECFDF5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10B981] focus-visible:ring-offset-2"
        >
          Dismiss
        </button>
      </div>
    );
  }

  if (outcome?.status === 'error') {
    return (
      <div
        className={`flex items-center gap-4 rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-[18px] py-4 ${dismissing ? 'queue-dismissing' : ''}`}
      >
        <span className="h-full w-1 flex-shrink-0 self-stretch rounded-full bg-[#DC2626]" />
        <AlertCircle size={22} className="flex-shrink-0 text-[#DC2626]" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-[11px] font-bold text-[#64748B]">{item.branchName}</span>
          <p className="text-[14px] font-bold leading-tight tracking-[-0.01em] text-[#991B1B]">{item.title}</p>
          <p className="text-[12px] leading-[1.45] text-[#B91C1C]">{outcome.message}</p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => onPrimary(item)}
            disabled={isSyncing}
            className="rounded-lg bg-[#0F172A] px-[15px] py-[9px] text-[11px] font-extrabold uppercase tracking-[0.06em] text-white transition-colors duration-150 hover:bg-[#1E698F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E698F] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-[#0F172A]"
          >
            {isSyncing ? 'Retrying…' : 'Retry'}
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="rounded-lg border border-[#E2E8F0] bg-white px-3 py-[9px] text-[11px] font-semibold text-[#94A3B8] transition-colors duration-150 hover:bg-[#F9FAFB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E698F] focus-visible:ring-offset-2"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-4 rounded-xl border border-[#E5E9EE] bg-white px-[18px] py-4 transition-colors duration-150 hover:bg-[#F9FAFB]">
      <span className="h-full w-1 flex-shrink-0 self-stretch rounded-full" style={{ backgroundColor: color }} />
      <div className="flex w-[74px] flex-shrink-0 flex-col gap-1">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color }}>
          {item.severity}
        </span>
        {age && <span className="font-mono text-[10px] font-semibold text-[#94A3B8]">{age}</span>}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 flex-shrink-0 rounded-[2px]" style={{ backgroundColor: item.branchColor }} />
          <span className="truncate text-[11px] font-bold text-[#64748B]">{item.branchName}</span>
        </div>
        <p className="text-[14px] font-bold leading-tight tracking-[-0.01em] text-[#0F172A]">{item.title}</p>
        <p className="text-[12px] leading-[1.45] text-[#64748B]">{item.detail}</p>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => onPrimary(item)}
          disabled={isSyncing}
          className="rounded-lg bg-[#0F172A] px-[15px] py-[9px] text-[11px] font-extrabold uppercase tracking-[0.06em] text-white transition-colors duration-150 hover:bg-[#1E698F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E698F] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-[#0F172A]"
        >
          {isSyncing ? 'Syncing…' : item.actionLabel}
        </button>
        <button
          type="button"
          onClick={() => onSnooze(item.key)}
          className="rounded-lg border border-[#E2E8F0] px-3 py-[9px] text-[11px] font-semibold text-[#94A3B8] transition-colors duration-150 hover:bg-[#F9FAFB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E698F] focus-visible:ring-offset-2"
        >
          Snooze
        </button>
      </div>
    </div>
  );
};

const MorningStandup: React.FC<MorningStandupProps> = ({
  queue,
  totals,
  window: timeWindow,
  branchCards,
  systems,
  whatWorked,
  isLoading,
  onViewChange,
  onSnooze,
  onInlineSync,
  syncingConnIds,
  outcomes,
  onDismissOutcome,
}) => {
  const sortedQueue = useMemo(() => {
    return [...queue].sort((a, b) => {
      const rankDiff = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      if (rankDiff !== 0) return rankDiff;
      const at = a.occurredAt ? new Date(a.occurredAt).getTime() : Number.POSITIVE_INFINITY;
      const bt = b.occurredAt ? new Date(b.occurredAt).getTime() : Number.POSITIVE_INFINITY;
      return at - bt;
    });
  }, [queue]);

  // Merge the live queue with any completed/errored outcomes. A successful
  // action resolves the item out of the derived queue, so the outcome snapshot
  // is what keeps its "done" card on screen until the user dismisses it.
  // Resolved-success cards sink to the bottom; everything else keeps severity order.
  const cards = useMemo(() => {
    const byKey = new Map<string, { item: QueueItem; outcome?: QueueOutcome }>();
    for (const i of sortedQueue) byKey.set(i.key, { item: i });
    if (outcomes) for (const o of Object.values<QueueOutcome>(outcomes)) byKey.set(o.item.key, { item: o.item, outcome: o });
    return [...byKey.values()].sort((a, b) => {
      const aDone = a.outcome?.status === 'success' ? 1 : 0;
      const bDone = b.outcome?.status === 'success' ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      return SEVERITY_RANK[a.item.severity] - SEVERITY_RANK[b.item.severity];
    });
  }, [sortedQueue, outcomes]);

  const weekRows = useMemo(
    () => [
      {
        key: 'revenue',
        value: formatCurrency(totals.revenue.value),
        label: `Revenue · ${timeWindow}`,
        delta: fmtPctDelta(totals.revenue.deltaPct),
      },
      {
        key: 'posts',
        value: formatNumber(totals.postsPublished.value),
        label: 'Posts published',
        delta: fmtCountDelta(totals.postsPublished.delta),
      },
      {
        key: 'profiles',
        value: formatNumber(totals.newProfiles.value),
        label: 'New profiles',
        delta: fmtCountDelta(totals.newProfiles.delta),
      },
      {
        key: 'opens',
        value: totals.hasEmailData ? `${totals.openRate.value.toFixed(1)}%` : '—',
        label: totals.hasEmailData ? `Email opens (${totals.bounced} bounced)` : 'Email opens',
        delta: totals.hasEmailData ? fmtPtsDelta(totals.openRate.delta) : null,
      },
    ],
    [totals, timeWindow],
  );

  const handlePrimary = (item: QueueItem) => {
    if (item.inlineAction === 'sync') {
      onInlineSync(item);
      return;
    }
    if (item.actionView) {
      onViewChange?.(item.actionView);
    }
  };

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_340px] xl:items-start">
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <SkeletonBlock className="h-3 w-32" />
            <SkeletonBlock className="h-3 w-28" />
          </div>
          <div className="flex flex-col gap-3">
            {[0, 1, 2, 3].map((i) => (
              <SkeletonBlock key={i} className="h-[92px]" />
            ))}
          </div>
          <SkeletonBlock className="h-[150px]" />
        </div>
        <div className="flex flex-col gap-[14px]">
          <SkeletonBlock className="h-[150px]" />
          <SkeletonBlock className="h-[200px]" />
          <SkeletonBlock className="h-[140px]" />
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_340px] xl:items-start">
      {/* Left column */}
      <div className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[12px] font-black uppercase tracking-[0.16em] text-[#334155]">Needs you today</h2>
          <span className="text-[11px] font-semibold text-[#94A3B8]">Ranked by cost of ignoring</span>
        </div>

        {cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <CheckCircle2 size={40} className="text-[#10B981]" />
            <p className="text-[16px] font-bold text-[#0F172A]">Nothing needs you right now</p>
            <p className="text-[13px] text-[#64748B]">All spokes healthy, nothing overdue, nothing waiting on approval.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {cards.map(({ item, outcome }) => {
              const isSyncing =
                item.inlineAction === 'sync' &&
                !!item.connectionId &&
                (syncingConnIds?.includes(item.connectionId) ?? false);
              return (
                <QueueCard
                  key={item.key}
                  item={item}
                  outcome={outcome}
                  isSyncing={isSyncing}
                  onPrimary={handlePrimary}
                  onSnooze={onSnooze}
                  onDismissOutcome={onDismissOutcome}
                />
              );
            })}
          </div>
        )}

        {whatWorked && (
          <div className="mt-[6px] rounded-xl border border-[#E5E9EE] bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[13px] font-extrabold text-[#0B4A6B]">What worked · last 7 days</h3>
              <button
                type="button"
                onClick={() => onViewChange?.('post-performance')}
                className="rounded text-[11px] font-bold text-[#1E698F] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E698F] focus-visible:ring-offset-2"
              >
                Post Performance →
              </button>
            </div>
            <div className="grid grid-cols-2 gap-[14px]">
              <PerformerCard post={whatWorked.top} tone="top" />
              <PerformerCard post={whatWorked.bottom} tone="bottom" />
            </div>
          </div>
        )}
      </div>

      {/* Right column */}
      <div className="flex flex-col gap-[14px]">
        <div className="rounded-xl border border-[#E5E9EE] bg-white p-[18px]">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[13px] font-extrabold text-[#0B4A6B]">This week</h3>
            <span className="text-[11px] font-bold text-[#94A3B8]">vs prior week</span>
          </div>
          <div className="flex flex-col gap-3">
            {weekRows.map((row) => (
              <div key={row.key} className="flex items-baseline gap-3">
                <span className="w-[76px] flex-shrink-0 font-mono text-[18px] font-semibold text-[#0B4A6B]">
                  {row.value}
                </span>
                <span className="flex-1 text-[11px] text-[#6B7280]">{row.label}</span>
                {row.delta && (
                  <span
                    className="text-[11px] font-semibold"
                    style={{ color: row.delta.positive ? '#059669' : '#DC2626' }}
                  >
                    {row.delta.text}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[#E5E9EE] bg-white p-[18px]">
          <h3 className="mb-3 text-[13px] font-extrabold text-[#0B4A6B]">Branches at a glance</h3>
          <div className="flex flex-col gap-3">
            {branchCards.length === 0 && <p className="text-[12px] text-[#94A3B8]">No branches connected yet.</p>}
            {branchCards.map((b) => (
              <div key={b.slug} className="flex items-center gap-3">
                <span
                  className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-[7px] text-[11px] font-extrabold text-white"
                  style={{ backgroundColor: b.color }}
                >
                  {b.name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-bold text-[#111827]">{b.name}</p>
                  {b.openLeads > 0 && <p className="text-[11px] font-semibold text-[#0891B2]">{b.openLeads} open leads</p>}
                  <p
                    className="truncate text-[11px] font-semibold"
                    style={{ color: b.nextAction ? TONE_COLOR[b.nextAction.tone] : '#94A3B8' }}
                  >
                    {b.nextAction ? b.nextAction.text : b.healthLabel}
                  </p>
                </div>
                <span
                  className="h-[7px] w-[7px] flex-shrink-0 rounded-full"
                  style={{ backgroundColor: HEALTH_COLOR[b.health] }}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[#E5E9EE] bg-white p-[18px]">
          <h3 className="mb-3 text-[13px] font-extrabold text-[#0B4A6B]">Pipelines running</h3>
          <div className="flex flex-col gap-[10px]">
            {systems.length === 0 && <p className="text-[12px] text-[#94A3B8]">No pipelines reporting yet.</p>}
            {systems.map((sys) => (
              <div key={sys.key} className="flex items-center gap-2">
                <span
                  className="h-[7px] w-[7px] flex-shrink-0 rounded-full"
                  style={{ backgroundColor: STATUS_COLOR[sys.status] }}
                />
                <span className="flex-1 truncate text-[12px] font-semibold text-[#334155]">{sys.name}</span>
                <span className="font-mono text-[11px] font-semibold" style={{ color: STATUS_COLOR[sys.status] }}>
                  {sys.code}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MorningStandup;
