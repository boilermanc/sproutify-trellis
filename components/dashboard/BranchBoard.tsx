import React, { useMemo } from 'react';
import { Database } from 'lucide-react';
import {
  BranchCardData,
  BranchHealth,
  QueueItem,
  WindowTotals,
  TimeWindow,
  SystemRow,
  SystemStatus,
  SEVERITY_RANK,
} from './types';
import { ViewState } from '../../types';

interface BranchBoardProps {
  branchCards: BranchCardData[];
  queue: QueueItem[];
  totals: WindowTotals;
  window: TimeWindow;
  systems: SystemRow[];
  isLoading: boolean;
  onViewChange?: (view: ViewState) => void;
  onSelectBranch: (slug: string) => void;
  onWorkTheList: () => void;
  onConnectSpoke: () => void;
}

// ── design tokens ────────────────────────────────────────────────
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

const fmtPctDelta = (v: number | null): { text: string; positive: boolean } | null =>
  v == null ? null : { text: `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`, positive: v >= 0 };

const fmtCountDelta = (v: number | null): { text: string; positive: boolean } | null =>
  v == null ? null : { text: `${v >= 0 ? '+' : ''}${Math.round(v)}`, positive: v >= 0 };

const fmtPtsDelta = (v: number | null): { text: string; positive: boolean } | null =>
  v == null ? null : { text: `${v >= 0 ? '+' : ''}${v.toFixed(1)} pts`, positive: v >= 0 };

// ── small building blocks ────────────────────────────────────────
const SkeletonBlock: React.FC<{ className?: string }> = ({ className }) => (
  <div className={`animate-pulse rounded-[10px] bg-[#E5E7EB]/60 ${className ?? ''}`} />
);

const MetricCell: React.FC<{ value: string; label: string; delta?: { text: string; positive: boolean } | null }> = ({
  value,
  label,
  delta,
}) => (
  <div>
    <p className="text-[19px] font-bold tracking-[-0.02em] text-[#111827]">{value}</p>
    <p className="text-[11px] text-[#6B7280]">
      {label}
      {delta && (
        <span className="ml-1 font-semibold" style={{ color: delta.positive ? '#059669' : '#DC2626' }}>
          {delta.text}
        </span>
      )}
    </p>
  </div>
);

const PipelineList: React.FC<{ systems: SystemRow[] }> = ({ systems }) => (
  <>
    {systems.length === 0 && <p className="text-[12px] text-[#94A3B8]">No pipelines reporting yet.</p>}
    {systems.map((sys) => (
      <div key={sys.key} className="flex items-center gap-2">
        <span className="h-[7px] w-[7px] flex-shrink-0 rounded-full" style={{ backgroundColor: STATUS_COLOR[sys.status] }} />
        <span className="flex-1 truncate text-[12px] font-semibold text-[#334155]">{sys.name}</span>
        <span className="font-mono text-[11px] font-semibold" style={{ color: STATUS_COLOR[sys.status] }}>
          {sys.code}
        </span>
      </div>
    ))}
  </>
);

const ConnectSpokeCard: React.FC<{ onConnectSpoke: () => void }> = ({ onConnectSpoke }) => (
  <div className="flex flex-col items-center justify-center gap-3 rounded-[10px] border border-[#E5E7EB] bg-white px-6 py-14 text-center">
    <Database size={28} className="text-[#CBD5E1]" />
    <p className="text-[14px] font-bold text-[#475569]">No branches connected yet</p>
    <p className="text-[12px] text-[#94A3B8]">Connect a spoke to see profiles, orders and revenue here.</p>
    <button
      type="button"
      onClick={onConnectSpoke}
      className="mt-1 rounded-lg bg-[#0B4A6B] px-4 py-2 text-[12px] font-bold text-white transition-colors duration-150 hover:bg-[#093B57] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E698F] focus-visible:ring-offset-2"
    >
      Connect your first spoke
    </button>
  </div>
);

const BranchCard: React.FC<{
  card: BranchCardData;
  window: TimeWindow;
  onSelect: (slug: string) => void;
  onViewChange?: (view: ViewState) => void;
}> = ({ card, window: timeWindow, onSelect, onViewChange }) => {
  const maxSpark = card.sparkline.length > 0 ? Math.max(0, ...card.sparkline) : 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(card.slug)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(card.slug);
        }
      }}
      className="flex cursor-pointer flex-col overflow-hidden rounded-[10px] border border-[#E5E7EB] bg-white transition-colors duration-150 hover:border-[#CBD5E1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E698F] focus-visible:ring-offset-2"
    >
      <div className="h-[3px] w-full flex-shrink-0" style={{ backgroundColor: card.color }} />
      <div className="flex flex-1 flex-col p-[18px]">
        {/* identity row */}
        <div className="flex items-center gap-3">
          {card.logoUrl ? (
            <img src={card.logoUrl} alt="" className="h-[34px] w-[34px] flex-shrink-0 rounded-lg object-cover" />
          ) : (
            <span
              className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-lg text-[14px] font-bold text-white"
              style={{ backgroundColor: card.color }}
            >
              {card.name.charAt(0).toUpperCase()}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-bold tracking-[-0.01em] text-[#111827]">{card.name}</p>
            <p className="truncate font-mono text-[11px] text-[#9CA3AF]">{card.host}</p>
          </div>
          <div className="flex flex-shrink-0 items-center gap-[6px]">
            <span className="h-[7px] w-[7px] rounded-full" style={{ backgroundColor: HEALTH_COLOR[card.health] }} />
            <span className="text-[11px] font-semibold" style={{ color: HEALTH_COLOR[card.health] }}>
              {card.healthLabel}
            </span>
          </div>
        </div>

        {card.openLeads > 0 && (
          <div className="mt-3 inline-flex rounded-full bg-cyan-50 px-2.5 py-1 text-[11px] font-bold text-cyan-700">
            {card.openLeads.toLocaleString()} open leads
          </div>
        )}

        {/* metric grid */}
        <div className="mt-[14px] grid grid-cols-2 gap-x-[10px] gap-y-3">
          <MetricCell value={formatNumber(card.profiles)} label="profiles" delta={fmtCountDelta(card.profilesDelta)} />
          <MetricCell value={formatCurrency(card.revenue)} label={`revenue · ${timeWindow}`} />
          <MetricCell
            value={card.followers != null ? card.followers.toLocaleString() : '—'}
            label="followers"
            delta={fmtCountDelta(card.followersDelta)}
          />
          <MetricCell value={formatNumber(card.posts)} label={`posts · ${timeWindow}`} />
        </div>

        {/* sparkline — daily revenue, oldest first; fewer than 12 days renders left-aligned */}
        <div className="mt-[14px] flex h-[34px] items-end gap-[3px]">
          {card.sparkline.map((v, i) => {
            const heightPct = maxSpark > 0 ? Math.max((v / maxSpark) * 100, v > 0 ? 6 : 2) : 2;
            return (
              <span
                key={i}
                className="flex-none rounded-t-[2px]"
                style={{ width: `${100 / 12}%`, height: `${heightPct}%`, backgroundColor: card.color, opacity: 0.35 }}
              />
            );
          })}
        </div>

        {/* next action */}
        {card.nextAction && (
          <div className="mt-[14px] flex items-center justify-between gap-3 border-t border-[#F3F4F6] pt-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#9CA3AF]">Next action</p>
              <p className="truncate text-[12px] font-semibold" style={{ color: TONE_COLOR[card.nextAction.tone] }}>
                {card.nextAction.text}
              </p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                if (card.nextAction?.view) onViewChange?.(card.nextAction.view);
              }}
              className="flex-shrink-0 rounded-[7px] bg-[#111827] px-3 py-[7px] text-[11px] font-bold text-white transition-colors duration-150 hover:bg-[#1E698F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E698F] focus-visible:ring-offset-2"
            >
              {card.nextAction.label}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const SummaryCard: React.FC<{ totals: WindowTotals; window: TimeWindow; systems: SystemRow[] }> = ({
  totals,
  window: timeWindow,
  systems,
}) => {
  const metrics = [
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
      label: 'Email opens',
      delta: totals.hasEmailData ? fmtPtsDelta(totals.openRate.delta) : null,
    },
  ];

  return (
    <div className="flex flex-col overflow-hidden rounded-[10px] border border-[#E5E7EB] bg-white p-[18px]">
      <h3 className="text-[15px] font-bold tracking-[-0.01em] text-[#111827]">All branches</h3>
      <div className="mt-[14px] grid grid-cols-2 gap-x-[10px] gap-y-3">
        {metrics.map((m) => (
          <MetricCell key={m.key} value={m.value} label={m.label} delta={m.delta} />
        ))}
      </div>
      <div className="mt-auto flex flex-col gap-[10px] border-t border-[#F3F4F6] pt-3">
        <PipelineList systems={systems} />
      </div>
    </div>
  );
};

const BranchBoard: React.FC<BranchBoardProps> = ({
  branchCards,
  queue,
  totals,
  window: timeWindow,
  systems,
  isLoading,
  onViewChange,
  onSelectBranch,
  onWorkTheList,
  onConnectSpoke,
}) => {
  const alertSummary = useMemo(() => {
    const sorted = [...queue].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
    return sorted.slice(0, 3).map((q) => q.title).join(' · ');
  }, [queue]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-[18px]">
        <SkeletonBlock className="h-[54px]" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <SkeletonBlock key={i} className="h-[280px]" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[18px]">
      {queue.length > 0 && (
        <div className="flex flex-wrap items-center gap-[14px] rounded-[10px] border border-[#FED7AA] bg-[#FFF7ED] px-[18px] py-[14px]">
          <span className="h-2 w-2 flex-shrink-0 rounded-full bg-[#EA580C]" />
          <span className="flex-shrink-0 text-[14px] font-bold text-[#7C2D12]">
            {queue.length} items need a person today
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] text-[#9A3412]">{alertSummary}</span>
          <button
            type="button"
            onClick={onWorkTheList}
            className="flex-shrink-0 rounded-[7px] bg-[#EA580C] px-[14px] py-2 text-[12px] font-bold text-white transition-colors duration-150 hover:bg-[#C2410C] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E698F] focus-visible:ring-offset-2"
          >
            Work the list
          </button>
        </div>
      )}

      {branchCards.length === 0 ? (
        <ConnectSpokeCard onConnectSpoke={onConnectSpoke} />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {branchCards.map((card) => (
            <BranchCard key={card.slug} card={card} window={timeWindow} onSelect={onSelectBranch} onViewChange={onViewChange} />
          ))}
          <SummaryCard totals={totals} window={timeWindow} systems={systems} />
        </div>
      )}
    </div>
  );
};

export default BranchBoard;
