import React, { useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  FileText,
  Mail,
  Phone,
  Sparkles,
  StickyNote,
} from 'lucide-react';
import { TimelineEntry } from '../../types';

const EVENT_STYLES: Record<string, { icon: React.ElementType; color: string; bg: string }> = {
  lead_note: { icon: StickyNote, color: 'text-slate-300', bg: 'bg-slate-400/10' },
  lead_call: { icon: Phone, color: 'text-cyan-300', bg: 'bg-cyan-400/10' },
  lead_email: { icon: Mail, color: 'text-rose-300', bg: 'bg-rose-400/10' },
  lead_meeting: { icon: CalendarDays, color: 'text-indigo-300', bg: 'bg-indigo-400/10' },
  lead_quote: { icon: FileText, color: 'text-amber-300', bg: 'bg-amber-400/10' },
  lead_stage_change: { icon: ArrowRight, color: 'text-slate-400', bg: 'bg-white/5' },
  lead_created: { icon: Sparkles, color: 'text-slate-400', bg: 'bg-white/5' },
  lead_converted: { icon: CheckCircle2, color: 'text-emerald-300', bg: 'bg-emerald-400/10' },
};

const textValue = (payload: Record<string, unknown>, ...keys: string[]): string => {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
};

export function formatRelativeTime(value: string, now = Date.now()): string {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 'Unknown time';
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export function summarizeTimelineEntry(entry: TimelineEntry): string {
  const payload = entry.payload || {};
  switch (entry.event_type) {
    case 'lead_note':
      return textValue(payload, 'text', 'note', 'summary') || 'Note added';
    case 'lead_call': {
      const outcome = textValue(payload, 'outcome').replace(/_/g, ' ');
      const summary = textValue(payload, 'summary');
      return [outcome && `Call: ${outcome}`, summary].filter(Boolean).join(' · ') || 'Call logged';
    }
    case 'lead_email':
      return textValue(payload, 'subject') || 'Email sent';
    case 'lead_meeting': {
      const date = textValue(payload, 'meeting_at', 'date');
      const summary = textValue(payload, 'summary');
      return [date && `Meeting ${date}`, summary].filter(Boolean).join(' · ') || 'Meeting logged';
    }
    case 'lead_quote': {
      const amount = typeof payload.amount === 'number'
        ? new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' }).format(payload.amount)
        : '';
      return [amount && `Quote ${amount}`, textValue(payload, 'description')].filter(Boolean).join(' · ') || 'Quote logged';
    }
    case 'lead_stage_change':
      return `Stage: ${textValue(payload, 'from') || 'unknown'} → ${textValue(payload, 'to') || 'unknown'}`;
    case 'lead_converted':
      return 'Lead converted to won';
    case 'lead_created':
      return `Lead created${textValue(payload, 'source') ? ` from ${textValue(payload, 'source').replace(/_/g, ' ')}` : ''}`;
    default:
      return 'Lead activity';
  }
}

const detailEntries = (entry: TimelineEntry): Array<[string, string]> => (
  Object.entries(entry.payload || {})
    .filter(([key, value]) => !['lead_id', 'branch_id', 'pipeline_id'].includes(key) && value != null && value !== '')
    .map(([key, value]) => [
      key.replace(/_/g, ' '),
      typeof value === 'object' ? JSON.stringify(value) : String(value),
    ])
);

interface LeadTimelineProps {
  entries: TimelineEntry[];
  loading: boolean;
}

const LeadTimeline: React.FC<LeadTimelineProps> = ({ entries, loading }) => {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-500">Activity timeline</h3>
        {!loading && entries.length > 0 && <span className="text-[10px] font-bold text-slate-600">Newest first</span>}
      </div>

      {loading ? (
        <div className="space-y-4" aria-label="Loading lead timeline">
          {[0, 1, 2].map(item => <div key={item} className="flex animate-pulse gap-3"><div className="h-9 w-9 rounded-xl bg-white/[0.07]" /><div className="flex-1 space-y-2 pt-1"><div className="h-3 w-2/3 rounded bg-white/[0.07]" /><div className="h-2 w-24 rounded bg-white/[0.05]" /></div></div>)}
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center">
          <StickyNote className="mx-auto mb-2 text-slate-600" size={20} />
          <p className="text-xs font-bold text-slate-400">No activity recorded yet</p>
          <p className="mt-1 text-[10px] text-slate-600">Calls, notes, meetings, emails, and stage changes will appear here.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {entries.map(entry => {
            const style = EVENT_STYLES[entry.event_type] || EVENT_STYLES.lead_created;
            const Icon = style.icon;
            const details = detailEntries(entry);
            const expanded = expandedId === entry.id;
            return (
              <button
                key={entry.id}
                type="button"
                onClick={() => setExpandedId(current => current === entry.id ? null : entry.id)}
                className="flex w-full gap-3 rounded-xl px-2 py-3 text-left transition hover:bg-white/[0.035]"
                aria-expanded={expanded}
              >
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${style.bg} ${style.color}`}><Icon size={16} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-bold leading-5 text-slate-200">{summarizeTimelineEntry(entry)}</span>
                  <span className="mt-0.5 block text-[10px] text-slate-600" title={new Date(entry.created_at).toLocaleString()}>{formatRelativeTime(entry.created_at)}</span>
                  {expanded && details.length > 0 && <span className="mt-3 block space-y-1 rounded-lg bg-[#10142E] p-3">{details.map(([label, value]) => <span key={label} className="grid grid-cols-[7rem_1fr] gap-2 text-[10px]"><span className="capitalize text-slate-600">{label}</span><span className="break-words text-slate-400">{value}</span></span>)}</span>}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default LeadTimeline;
