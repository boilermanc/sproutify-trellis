import React from 'react';
import { Database, CalendarDays, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { ViewState } from '../../types';
import {
  BranchCardData,
  BranchHealth,
  QueueItem,
  Severity,
  SystemRow,
  SystemStatus,
  TimeWindow,
  TimelineItem,
  TimelineState,
  WindowTotals,
} from './types';

// ── Props ──────────────────────────────────────────────────────────

interface ControlRoomProps {
  branchCards: BranchCardData[];
  timeline: TimelineItem[];
  systems: SystemRow[];
  queue: QueueItem[];
  totals: WindowTotals;
  window: TimeWindow;
  isLoading: boolean;
  onViewChange?: (view: ViewState) => void;
  onSelectBranch: (slug: string) => void;
  onSeeAllQueue: () => void; // switches to the Morning Standup tab
  onConnectSpoke: () => void; // empty-state CTA
}

// ── Design tokens (per docs/design_handoff_dashboard_redesign) ──────

const HEALTH_DOT: Record<BranchHealth, string> = {
  healthy: '#10B981',
  aging: '#F59E0B',
  stale: '#F59E0B',
  down: '#EF4444',
  offline: '#94A3B8',
};

const SYSTEM_DOT: Record<SystemStatus, string> = {
  ok: '#10B981',
  stale: '#F59E0B',
  down: '#EF4444',
  error: '#EF4444',
};

const STATE_CHIP: Record<TimelineState, { dot: string; bg: string; text: string; label: string }> = {
  posted: { dot: '#10B981', bg: '#ECFDF5', text: '#047857', label: 'POSTED' },
  synced: { dot: '#10B981', bg: '#ECFDF5', text: '#047857', label: 'SYNCED' },
  queued: { dot: '#0EA5E9', bg: '#F0F9FF', text: '#0369A1', label: 'QUEUED' },
  waiting: { dot: '#F59E0B', bg: '#FFFBEB', text: '#B45309', label: 'WAITING' },
  error: { dot: '#EF4444', bg: '#FEF2F2', text: '#B91C1C', label: 'ERROR' },
  at_risk: { dot: '#EF4444', bg: '#FEF2F2', text: '#B91C1C', label: 'AT RISK' },
  empty: { dot: '#94A3B8', bg: '#F8FAFC', text: '#64748B', label: 'EMPTY' },
};

const SEVERITY_COLOR: Record<Severity, string> = {
  blocking: '#DC2626',
  overdue: '#EA580C',
  stale: '#D97706',
  waiting: '#1E698F',
  idle: '#64748B',
};

const SKELETON = 'bg-[#E5E7EB]/60 animate-pulse rounded';
const FOCUS_RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1E698F] focus-visible:ring-offset-2';

// ── Formatting helpers ───────────────────────────────────────────────

function formatCurrency(value: number): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(1)}k`;
  return `${sign}$${abs.toFixed(0)}`;
}

function formatSignedInt(n: number | null): string | null {
  if (n === null) return null;
  return `${n > 0 ? '+' : ''}${n.toLocaleString()}`;
}

function formatSignedPct(n: number | null): string | null {
  if (n === null) return null;
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;
}

function formatSignedPts(n: number | null): string | null {
  if (n === null) return null;
  return `${n > 0 ? '+' : ''}${n.toFixed(1)} pts`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function timeAgoShort(iso: string): string {
  const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

// ── Branch strip ──────────────────────────────────────────────────

const BranchStripSkeleton: React.FC = () => (
  <div className="grid grid-cols-3 xl:grid-cols-5 gap-3">
    {Array.from({ length: 5 }).map((_, i) => (
      <div key={i} className="bg-white border border-[#E5E7EB] rounded-[10px] p-[14px] flex flex-col gap-[9px]">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 ${SKELETON}`} />
          <div className={`h-3 w-16 ${SKELETON}`} />
        </div>
        <div className={`h-6 w-20 ${SKELETON}`} />
        <div className={`h-3 w-24 ${SKELETON}`} />
      </div>
    ))}
  </div>
);

const BranchEmptyState: React.FC<{ onConnectSpoke: () => void }> = ({ onConnectSpoke }) => (
  <div className="bg-white border border-[#E5E7EB] rounded-[10px] p-8 flex flex-col items-center justify-center text-center gap-2">
    <Database size={28} className="text-[#CBD5E1]" />
    <p className="text-[14px] font-bold text-[#475569]">No branches connected yet</p>
    <p className="text-[12px] text-[#94A3B8]">Connect a spoke to see profiles, orders and revenue here.</p>
    <button
      type="button"
      onClick={onConnectSpoke}
      className={`mt-2 bg-[#0B4A6B] hover:bg-[#093a55] transition-colors duration-150 text-white text-[12px] font-semibold px-4 py-2 rounded-[8px] ${FOCUS_RING}`}
    >
      Connect your first spoke
    </button>
  </div>
);

const BranchTile: React.FC<{ branch: BranchCardData; onSelectBranch: (slug: string) => void }> = ({ branch, onSelectBranch }) => {
  const profilesDeltaText = formatSignedInt(branch.profilesDelta);
  const profilesDeltaPositive = (branch.profilesDelta ?? 0) >= 0;
  return (
    <button
      type="button"
      onClick={() => onSelectBranch(branch.slug)}
      title={branch.healthLabel}
      className={`text-left w-full bg-white border border-[#E5E7EB] hover:border-[#CBD5E1] transition-colors duration-150 rounded-[10px] p-[14px] flex flex-col gap-[9px] ${FOCUS_RING}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-2 h-2 rounded-[2px] flex-shrink-0" style={{ background: branch.color }} />
        <span className="text-[12px] font-bold text-[#111827] truncate min-w-0">{branch.name}</span>
        <span
          className="w-[7px] h-[7px] rounded-full flex-shrink-0 ml-auto"
          style={{ background: HEALTH_DOT[branch.health] }}
        />
      </div>
      <div className="font-mono text-[22px] font-semibold text-[#111827] tracking-[-0.03em]">
        {formatCurrency(branch.revenue)}
      </div>
      <div className="flex items-baseline gap-1 text-[11px]">
        <span className="text-[#6B7280]">{branch.profiles.toLocaleString()} profiles</span>
        {profilesDeltaText && (
          <span className={`font-semibold ${profilesDeltaPositive ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
            {profilesDeltaText}
          </span>
        )}
      </div>
    </button>
  );
};

const BranchStrip: React.FC<{
  branchCards: BranchCardData[];
  isLoading: boolean;
  onSelectBranch: (slug: string) => void;
  onConnectSpoke: () => void;
}> = ({ branchCards, isLoading, onSelectBranch, onConnectSpoke }) => {
  if (isLoading) return <BranchStripSkeleton />;
  if (branchCards.length === 0) return <BranchEmptyState onConnectSpoke={onConnectSpoke} />;
  const sorted = [...branchCards].sort((a, b) => b.revenue - a.revenue);
  return (
    <div className="grid grid-cols-3 xl:grid-cols-5 gap-3">
      {sorted.map((branch) => (
        <BranchTile key={branch.slug} branch={branch} onSelectBranch={onSelectBranch} />
      ))}
    </div>
  );
};

// ── Today timeline ────────────────────────────────────────────────

const TimelineSkeleton: React.FC = () => (
  <div className="flex-1 bg-white border border-[#E5E7EB] rounded-xl p-[22px] flex flex-col gap-4">
    <div className="flex items-center justify-between">
      <div className={`h-4 w-56 ${SKELETON}`} />
      <div className={`h-4 w-24 ${SKELETON}`} />
    </div>
    <div className="flex flex-col gap-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className={`h-3 w-[52px] ${SKELETON}`} />
          <div className={`w-[9px] h-[9px] rounded-full ${SKELETON}`} />
          <div className={`h-3 flex-1 ${SKELETON}`} />
          <div className={`h-4 w-16 ${SKELETON}`} />
        </div>
      ))}
    </div>
  </div>
);

const TimelineEmptyState: React.FC<{ onViewChange?: (view: ViewState) => void }> = ({ onViewChange }) => (
  <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 py-10">
    <CalendarDays size={28} className="text-[#CBD5E1]" />
    <p className="text-[14px] font-bold text-[#475569]">Nothing scheduled or published today</p>
    <p className="text-[12px] text-[#94A3B8]">
      Quiet day. Draft something in Creative Studio or{' '}
      <button
        type="button"
        onClick={() => onViewChange?.('post-scheduler')}
        className={`text-[#1E698F] font-semibold rounded ${FOCUS_RING}`}
      >
        Post Scheduler
      </button>
      .
    </p>
  </div>
);

const TimelineRow: React.FC<{ item: TimelineItem; isFirst: boolean; isLast: boolean; onViewChange?: (view: ViewState) => void }> = ({
  item,
  isFirst,
  isLast,
  onViewChange,
}) => {
  const chip = STATE_CHIP[item.state];
  return (
    <div className="grid grid-cols-[52px_15px_1fr_auto] items-stretch">
      <div className="flex items-center justify-end pr-1">
        <span className="font-mono text-[11px] text-[#9CA3AF]">{formatTime(item.at)}</span>
      </div>
      <div className="relative">
        {!isFirst && <div className="absolute left-1/2 -translate-x-1/2 top-0 h-1/2 w-px bg-[#E5E7EB]" />}
        {!isLast && <div className="absolute left-1/2 -translate-x-1/2 top-1/2 h-1/2 w-px bg-[#E5E7EB]" />}
        <div
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[9px] h-[9px] rounded-full ring-2 ring-white"
          style={{ background: chip.dot }}
        />
      </div>
      <div className="flex items-center gap-3 py-[9px] min-w-0 pr-3">
        <span className="w-[7px] h-[7px] rounded-[2px] flex-shrink-0" style={{ background: item.branchColor }} />
        <span className="text-[11px] font-semibold text-[#6B7280] w-[100px] flex-shrink-0 truncate">
          {item.branchName}
        </span>
        <span className="text-[13px] text-[#1F2937] flex-1 min-w-0 truncate">{item.text}</span>
      </div>
      <div className="flex items-center gap-2">
        <span
          className="font-mono text-[10px] font-semibold tracking-[0.06em] uppercase px-2 py-[3px] rounded-[5px] whitespace-nowrap"
          style={{ background: chip.bg, color: chip.text }}
        >
          {chip.label}
        </span>
        <span className="w-[78px] text-right flex-shrink-0">
          {item.actionLabel && (
            <button
              type="button"
              onClick={() => item.actionView && onViewChange?.(item.actionView)}
              className={`text-[11px] font-bold text-[#1E698F] rounded ${FOCUS_RING}`}
            >
              {item.actionLabel}
            </button>
          )}
        </span>
      </div>
    </div>
  );
};

const TodayTimeline: React.FC<{
  timeline: TimelineItem[];
  isLoading: boolean;
  onViewChange?: (view: ViewState) => void;
}> = ({ timeline, isLoading, onViewChange }) => {
  if (isLoading) return <TimelineSkeleton />;

  const eventsCount = timeline.length;
  const now = Date.now();
  const scheduledCount = timeline.filter((i) => new Date(i.at).getTime() > now).length;
  const failedCount = timeline.filter((i) => i.state === 'error' || i.state === 'at_risk').length;

  return (
    <div className="flex-1 bg-white border border-[#E5E7EB] rounded-xl p-[22px] flex flex-col gap-4 min-w-0">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h3 className="text-[15px] font-bold text-[#111827]">Today across the ecosystem</h3>
          {eventsCount > 0 && (
            <span className="font-mono text-[11px] text-[#9CA3AF]">
              {eventsCount} EVENTS · {scheduledCount} SCHEDULED · {failedCount} FAILED
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => onViewChange?.('reports')}
          className={`text-[12px] font-semibold text-[#1E698F] rounded ${FOCUS_RING}`}
        >
          Full activity log →
        </button>
      </div>
      {eventsCount === 0 ? (
        <TimelineEmptyState onViewChange={onViewChange} />
      ) : (
        <div className="flex flex-col">
          {timeline.map((item, idx) => (
            <TimelineRow
              key={item.id}
              item={item}
              isFirst={idx === 0}
              isLast={idx === timeline.length - 1}
              onViewChange={onViewChange}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ── System health ─────────────────────────────────────────────────

const SystemHealthSkeleton: React.FC = () => (
  <div className="bg-white border border-[#E5E7EB] rounded-xl p-[18px] flex flex-col gap-3">
    <div className={`h-4 w-32 ${SKELETON}`} />
    {Array.from({ length: 3 }).map((_, i) => (
      <div key={i} className="flex flex-col gap-1">
        <div className={`h-3 w-full ${SKELETON}`} />
        <div className={`h-3 w-3/4 ${SKELETON}`} />
      </div>
    ))}
  </div>
);

const SystemHealth: React.FC<{ systems: SystemRow[]; isLoading: boolean }> = ({ systems, isLoading }) => {
  if (isLoading) return <SystemHealthSkeleton />;

  const healthy = systems.every((s) => s.status === 'ok');
  const downCount = systems.filter((s) => s.status === 'down' || s.status === 'error').length;
  const staleCount = systems.filter((s) => s.status === 'stale').length;
  const summaryParts: string[] = [];
  if (downCount) summaryParts.push(`${downCount} DOWN`);
  if (staleCount) summaryParts.push(`${staleCount} STALE`);

  const cardBg = healthy ? 'bg-[#F0FDF4]' : 'bg-[#FEF2F2]';
  const cardBorder = healthy ? 'border-[#A7F3D0]' : 'border-[#FECACA]';
  const rowBorder = healthy ? 'border-[rgba(5,150,105,0.12)]' : 'border-[rgba(220,38,38,0.12)]';

  return (
    <div id="system-health" className={`${cardBg} border ${cardBorder} rounded-xl p-[18px] flex flex-col gap-3`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {healthy ? (
            <CheckCircle2 size={16} className="text-[#059669] flex-shrink-0" />
          ) : (
            <ShieldAlert size={16} className="text-[#DC2626] flex-shrink-0" />
          )}
          <span className={`text-[13px] font-bold truncate ${healthy ? 'text-[#065F46]' : 'text-[#991B1B]'}`}>
            {healthy ? 'All systems healthy' : 'System health'}
          </span>
        </div>
        {!healthy && summaryParts.length > 0 && (
          <span className="font-mono text-[10px] text-[#B91C1C] flex-shrink-0">{summaryParts.join(' · ')}</span>
        )}
      </div>
      <div className="flex flex-col">
        {systems.map((s, i) => (
          <div
            key={s.key}
            className={`flex flex-col gap-1 ${i < systems.length - 1 ? `pb-[10px] mb-[10px] border-b ${rowBorder}` : ''}`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-[6px] h-[6px] rounded-full flex-shrink-0" style={{ background: SYSTEM_DOT[s.status] }} />
              <span className="font-mono text-[11px] text-[#1F2937] truncate flex-1 min-w-0">{s.name}</span>
              <span
                className="font-mono text-[10px] font-semibold flex-shrink-0"
                style={{ color: SYSTEM_DOT[s.status] }}
              >
                {s.code}
              </span>
            </div>
            <div className="text-[11px] text-[#6B7280] leading-[1.45] pl-[14px]">{s.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// ── Queue · needs a person ────────────────────────────────────────

const QueueSkeleton: React.FC = () => (
  <div className="bg-white border border-[#E5E7EB] rounded-xl p-[18px] flex flex-col gap-[13px]">
    <div className={`h-4 w-40 ${SKELETON}`} />
    {Array.from({ length: 4 }).map((_, i) => (
      <div key={i} className="flex items-center gap-3">
        <div className={`w-1 h-8 rounded-full ${SKELETON}`} />
        <div className="flex-1 flex flex-col gap-1">
          <div className={`h-3 w-full ${SKELETON}`} />
          <div className={`h-3 w-1/2 ${SKELETON}`} />
        </div>
      </div>
    ))}
  </div>
);

const QueuePanel: React.FC<{
  queue: QueueItem[];
  isLoading: boolean;
  onSeeAllQueue: () => void;
  onViewChange?: (view: ViewState) => void;
}> = ({ queue, isLoading, onSeeAllQueue, onViewChange }) => {
  if (isLoading) return <QueueSkeleton />;

  const top4 = queue.slice(0, 4);

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-xl p-[18px] flex flex-col gap-[13px]">
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-bold text-[#111827]">Queue · needs a person</span>
        <button
          type="button"
          onClick={onSeeAllQueue}
          className={`text-[11px] font-bold text-[#1E698F] rounded ${FOCUS_RING}`}
        >
          See all {queue.length}
        </button>
      </div>
      {top4.length === 0 ? (
        <p className="text-[12px] text-[#94A3B8]">Nothing needs a person right now.</p>
      ) : (
        top4.map((item) => (
          <div key={item.key} className="flex items-stretch gap-3">
            <span className="w-1 rounded-[99px] flex-shrink-0" style={{ background: SEVERITY_COLOR[item.severity] }} />
            <div className="flex-1 min-w-0 flex flex-col gap-[2px]">
              <span className="text-[12px] font-bold text-[#1F2937] leading-[1.35]">{item.title}</span>
              <span className="text-[11px] text-[#9CA3AF] truncate">
                {item.branchName}
                {item.occurredAt ? ` · ${timeAgoShort(item.occurredAt)}` : ''}
              </span>
            </div>
            <button
              type="button"
              onClick={() => item.actionView && onViewChange?.(item.actionView)}
              className={`text-[11px] font-bold text-[#1E698F] flex-shrink-0 self-start rounded ${FOCUS_RING}`}
            >
              {item.actionLabel}
            </button>
          </div>
        ))
      )}
    </div>
  );
};

// ── {7|30}-day totals ─────────────────────────────────────────────

const TotalsSkeleton: React.FC = () => (
  <div className="bg-white border border-[#E5E7EB] rounded-xl p-[18px] flex flex-col gap-3">
    <div className={`h-4 w-28 ${SKELETON}`} />
    {Array.from({ length: 4 }).map((_, i) => (
      <div key={i} className="flex items-center gap-2">
        <div className={`h-4 w-[74px] ${SKELETON}`} />
        <div className={`h-3 flex-1 ${SKELETON}`} />
      </div>
    ))}
  </div>
);

interface TotalRow {
  key: string;
  label: string;
  value: string;
  deltaText: string | null;
  deltaPositive: boolean;
}

const TotalsPanel: React.FC<{ totals: WindowTotals; window: TimeWindow; isLoading: boolean }> = ({
  totals,
  window: timeWindow,
  isLoading,
}) => {
  if (isLoading) return <TotalsSkeleton />;

  const rows: TotalRow[] = [
    {
      key: 'revenue',
      label: `Revenue · ${timeWindow}`,
      value: formatCurrency(totals.revenue.value),
      deltaText: formatSignedPct(totals.revenue.deltaPct),
      deltaPositive: (totals.revenue.deltaPct ?? 0) >= 0,
    },
    {
      key: 'posts',
      label: 'Posts published',
      value: totals.postsPublished.value.toLocaleString(),
      deltaText: formatSignedInt(totals.postsPublished.delta),
      deltaPositive: (totals.postsPublished.delta ?? 0) >= 0,
    },
    {
      key: 'profiles',
      label: 'New profiles',
      value: totals.newProfiles.value.toLocaleString(),
      deltaText: formatSignedInt(totals.newProfiles.delta),
      deltaPositive: (totals.newProfiles.delta ?? 0) >= 0,
    },
    {
      key: 'opens',
      label: totals.hasEmailData ? `Email opens · ${totals.bounced} bounced` : 'Email opens',
      value: totals.hasEmailData ? `${totals.openRate.value.toFixed(1)}%` : '—',
      deltaText: totals.hasEmailData ? formatSignedPts(totals.openRate.delta) : null,
      deltaPositive: (totals.openRate.delta ?? 0) >= 0,
    },
  ];

  return (
    <div className="bg-white border border-[#E5E7EB] rounded-xl p-[18px] flex flex-col gap-3">
      <span className="text-[13px] font-bold text-[#111827]">{timeWindow === '7d' ? '7-day totals' : '30-day totals'}</span>
      {rows.map((row) => (
        <div key={row.key} className="flex items-baseline gap-2">
          <span className="font-mono text-[17px] font-semibold text-[#111827] w-[74px] flex-shrink-0">{row.value}</span>
          <span className="text-[11px] text-[#6B7280] flex-1 min-w-0 truncate">{row.label}</span>
          {row.deltaText && (
            <span
              className={`text-[11px] font-semibold flex-shrink-0 ${row.deltaPositive ? 'text-[#059669]' : 'text-[#DC2626]'}`}
            >
              {row.deltaText}
            </span>
          )}
        </div>
      ))}
    </div>
  );
};

// ── Root ──────────────────────────────────────────────────────────

const ControlRoom: React.FC<ControlRoomProps> = ({
  branchCards,
  timeline,
  systems,
  queue,
  totals,
  window: timeWindow,
  isLoading,
  onViewChange,
  onSelectBranch,
  onSeeAllQueue,
  onConnectSpoke,
}) => {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_330px] gap-5 items-start">
      <div className="flex flex-col gap-[18px] min-w-0">
        <BranchStrip
          branchCards={branchCards}
          isLoading={isLoading}
          onSelectBranch={onSelectBranch}
          onConnectSpoke={onConnectSpoke}
        />
        <TodayTimeline timeline={timeline} isLoading={isLoading} onViewChange={onViewChange} />
      </div>
      <div className="flex flex-col gap-[14px]">
        <SystemHealth systems={systems} isLoading={isLoading} />
        <QueuePanel queue={queue} isLoading={isLoading} onSeeAllQueue={onSeeAllQueue} onViewChange={onViewChange} />
        <TotalsPanel totals={totals} window={timeWindow} isLoading={isLoading} />
      </div>
    </div>
  );
};

export default ControlRoom;
