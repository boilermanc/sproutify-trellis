import React, { useMemo } from 'react';
import { Mail } from 'lucide-react';
import { ViewState } from '../../types';
import { EmailEventRow } from '../../services/emailReportingService';
import { TimeWindow } from './types';

// ── Props ──────────────────────────────────────────────────────────

interface EmailPulseProps {
  events: EmailEventRow[]; // from services/emailReportingService — already fetched by Dashboard
  window: TimeWindow; // '7d' | '30d'
  isLoading: boolean;
  onViewChange?: (view: ViewState) => void;
}

// ── Design tokens (per docs/design_handoff_dashboard_redesign) ──────

const SKELETON = 'bg-[#E5E7EB]/60 animate-pulse rounded';
const FOCUS_RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1E698F] focus-visible:ring-offset-2';
const CARD = 'bg-white border border-[#E5E7EB] rounded-[12px] p-[18px] flex flex-col gap-[14px]';

// ── Derived data shape ────────────────────────────────────────────

interface RecentCampaign {
  subject: string;
  delivered: number;
  opened: number;
  openRate: number | null;
  latestAt: string;
}

interface EmailPulseDerived {
  hasActivity: boolean;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  openRate: number | null;
  clickRate: number | null;
  openRateDelta: number | null;
  clickRateDelta: number | null;
  bounceWarning: boolean;
  recentCampaign: RecentCampaign | null;
}

// ── Formatting helpers ───────────────────────────────────────────────

function formatPct(n: number | null): string {
  return n === null ? '—' : `${n.toFixed(1)}%`;
}

function formatSignedPts(n: number | null): string | null {
  if (n === null) return null;
  return `${n > 0 ? '+' : ''}${n.toFixed(1)} pts`;
}

function truncate(text: string, max = 48): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

// ── Compute helpers ──────────────────────────────────────────────────

function countByType(list: EmailEventRow[], type: string): number {
  let n = 0;
  for (const e of list) if (e.event_type === type) n++;
  return n;
}

function computeRate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? (numerator / denominator) * 100 : null;
}

function useEmailPulse(events: EmailEventRow[], window: TimeWindow): EmailPulseDerived {
  return useMemo(() => {
    const days = window === '7d' ? 7 : 30;
    const msPerDay = 24 * 60 * 60 * 1000;
    const now = Date.now();
    const currentStart = now - days * msPerDay;
    const priorStart = now - 2 * days * msPerDay;
    const priorEnd = currentStart;

    const currentEvents = events.filter((e) => {
      const t = new Date(e.occurred_at).getTime();
      return t >= currentStart && t <= now;
    });
    const priorEvents = events.filter((e) => {
      const t = new Date(e.occurred_at).getTime();
      return t >= priorStart && t < priorEnd;
    });

    const delivered = countByType(currentEvents, 'delivered');
    const opened = countByType(currentEvents, 'opened');
    const clicked = countByType(currentEvents, 'clicked');
    const bounced = countByType(currentEvents, 'bounced');

    const priorDelivered = countByType(priorEvents, 'delivered');
    const priorOpened = countByType(priorEvents, 'opened');
    const priorClicked = countByType(priorEvents, 'clicked');

    const openRate = computeRate(opened, delivered);
    const clickRate = computeRate(clicked, delivered);
    const priorOpenRate = computeRate(priorOpened, priorDelivered);
    const priorClickRate = computeRate(priorClicked, priorDelivered);

    const openRateDelta = openRate !== null && priorOpenRate !== null ? openRate - priorOpenRate : null;
    const clickRateDelta = clickRate !== null && priorClickRate !== null ? clickRate - priorClickRate : null;

    const bounceWarning = delivered > 0 && bounced / delivered > 0.05;

    // Most recent campaign: group current-window events by subject, pick the
    // group whose newest event is the newest overall.
    const bySubject = new Map<string, EmailEventRow[]>();
    for (const e of currentEvents) {
      if (!e.campaign_subject) continue;
      const arr = bySubject.get(e.campaign_subject);
      if (arr) arr.push(e);
      else bySubject.set(e.campaign_subject, [e]);
    }

    let recentCampaign: RecentCampaign | null = null;
    let latestTime = -Infinity;
    for (const [subject, list] of bySubject) {
      const maxAt = list.reduce((max, e) => Math.max(max, new Date(e.occurred_at).getTime()), -Infinity);
      if (maxAt > latestTime) {
        latestTime = maxAt;
        const d = countByType(list, 'delivered');
        const o = countByType(list, 'opened');
        recentCampaign = {
          subject,
          delivered: d,
          opened: o,
          openRate: computeRate(o, d),
          latestAt: new Date(maxAt).toISOString(),
        };
      }
    }

    return {
      hasActivity: currentEvents.length > 0,
      delivered,
      opened,
      clicked,
      bounced,
      openRate,
      clickRate,
      openRateDelta,
      clickRateDelta,
      bounceWarning,
      recentCampaign,
    };
  }, [events, window]);
}

// ── Skeleton ─────────────────────────────────────────────────────────

const EmailPulseSkeleton: React.FC = () => (
  <div className={CARD}>
    <div className="flex items-center justify-between">
      <div className={`h-4 w-28 ${SKELETON}`} />
      <div className={`h-3 w-20 ${SKELETON}`} />
    </div>
    <div className="grid grid-cols-4 gap-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-1">
          <div className={`h-5 w-12 ${SKELETON}`} />
          <div className={`h-3 w-14 ${SKELETON}`} />
        </div>
      ))}
    </div>
    <div className="flex items-center gap-6 pt-1">
      <div className="flex flex-col gap-1">
        <div className={`h-5 w-16 ${SKELETON}`} />
        <div className={`h-3 w-16 ${SKELETON}`} />
      </div>
      <div className="flex flex-col gap-1">
        <div className={`h-5 w-16 ${SKELETON}`} />
        <div className={`h-3 w-16 ${SKELETON}`} />
      </div>
    </div>
    <div className="pt-2 border-t border-[#E5E7EB] flex flex-col gap-2">
      <div className={`h-3 w-40 ${SKELETON}`} />
      <div className={`h-4 w-56 ${SKELETON}`} />
    </div>
  </div>
);

// ── Empty state ──────────────────────────────────────────────────────

const EmailPulseEmpty: React.FC<{ onViewChange?: (view: ViewState) => void }> = ({ onViewChange }) => (
  <div className={CARD}>
    <div className="flex items-center justify-between">
      <h3 className="text-[13px] font-bold text-[#111827]">Email Pulse</h3>
      <button
        type="button"
        onClick={() => onViewChange?.('campaigns')}
        className={`text-[11px] font-bold text-[#1E698F] rounded ${FOCUS_RING}`}
      >
        Campaigns →
      </button>
    </div>
    <div className="flex flex-col items-center justify-center text-center gap-2 py-8">
      <Mail size={28} className="text-[#CBD5E1]" />
      <p className="text-[14px] font-bold text-[#475569]">No email activity in this window</p>
      <p className="text-[12px] text-[#94A3B8]">
        Send a campaign from{' '}
        <button
          type="button"
          onClick={() => onViewChange?.('campaign-builder')}
          className={`text-[#1E698F] font-semibold rounded ${FOCUS_RING}`}
        >
          Campaign Builder
        </button>{' '}
        to see delivery and engagement here.
      </p>
    </div>
  </div>
);

// ── Stat tile ────────────────────────────────────────────────────────

const StatTile: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <div className="flex flex-col gap-1 min-w-0">
    <span className="font-mono text-[18px] font-semibold text-[#111827] tracking-[-0.02em]">
      {value.toLocaleString()}
    </span>
    <span className="text-[11px] text-[#6B7280] truncate">{label}</span>
  </div>
);

// ── Rate block ───────────────────────────────────────────────────────

const RateBlock: React.FC<{ label: string; rate: number | null; delta: number | null }> = ({
  label,
  rate,
  delta,
}) => {
  const deltaText = formatSignedPts(delta);
  const deltaPositive = (delta ?? 0) >= 0;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[20px] font-semibold text-[#111827] tracking-[-0.02em]">
          {formatPct(rate)}
        </span>
        {deltaText && (
          <span className={`text-[11px] font-semibold ${deltaPositive ? 'text-[#059669]' : 'text-[#DC2626]'}`}>
            {deltaText}
          </span>
        )}
      </div>
      <span className="text-[11px] text-[#6B7280]">{label}</span>
    </div>
  );
};

// ── Root ──────────────────────────────────────────────────────────

const EmailPulse: React.FC<EmailPulseProps> = ({ events, window: timeWindow, isLoading, onViewChange }) => {
  const derived = useEmailPulse(events, timeWindow);

  if (isLoading) return <EmailPulseSkeleton />;
  if (!derived.hasActivity) return <EmailPulseEmpty onViewChange={onViewChange} />;

  const bounceRatio = derived.delivered > 0 ? (derived.bounced / derived.delivered) * 100 : null;

  return (
    <div className={CARD}>
      <div className="flex items-center justify-between">
        <h3 className="text-[13px] font-bold text-[#111827]">Email Pulse</h3>
        <button
          type="button"
          onClick={() => onViewChange?.('campaigns')}
          className={`text-[11px] font-bold text-[#1E698F] rounded ${FOCUS_RING}`}
        >
          Campaigns →
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <StatTile label="Delivered" value={derived.delivered} />
        <StatTile label="Opened" value={derived.opened} />
        <StatTile label="Clicked" value={derived.clicked} />
        <StatTile label="Bounced" value={derived.bounced} />
      </div>

      <div className="flex items-center gap-6 pt-1">
        <RateBlock label="Open rate" rate={derived.openRate} delta={derived.openRateDelta} />
        <RateBlock label="Click rate" rate={derived.clickRate} delta={derived.clickRateDelta} />
      </div>

      {derived.bounceWarning && bounceRatio !== null && (
        <div className="flex items-center gap-2 bg-[#FFFBEB] border border-[#FDE68A] rounded-[8px] px-3 py-[7px]">
          <span className="w-[6px] h-[6px] rounded-full flex-shrink-0" style={{ background: '#B45309' }} />
          <span className="text-[11px] font-semibold" style={{ color: '#B45309' }}>
            Bounce rate {bounceRatio.toFixed(1)}% — above the 5% deliverability threshold
          </span>
        </div>
      )}

      {derived.recentCampaign && (
        <div className="pt-2 border-t border-[#E5E7EB] flex flex-col gap-[6px]">
          <span className="text-[11px] text-[#6B7280]">Most recent campaign</span>
          <div className="flex items-baseline justify-between gap-3">
            <span
              className="text-[13px] font-semibold text-[#1F2937] truncate min-w-0"
              title={derived.recentCampaign.subject}
            >
              {truncate(derived.recentCampaign.subject)}
            </span>
            <span className="font-mono text-[11px] text-[#6B7280] flex-shrink-0">
              {derived.recentCampaign.delivered.toLocaleString()} delivered ·{' '}
              {derived.recentCampaign.openRate === null ? '—' : `${derived.recentCampaign.openRate.toFixed(1)}%`} opened
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmailPulse;
