import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, MailCheck, RefreshCw, Search } from 'lucide-react';
import { Lead } from '../../types';
import { fetchLeadEmailOutbox, LeadEmailOutboxMessage } from '../../services/leadSequenceService';
import CrmModal from './CrmModal';

type StatusFilter = 'all' | 'sent' | 'delivered' | 'opened' | 'clicked' | 'replied' | 'issues';

const FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'sent', label: 'Sent' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'opened', label: 'Opened' },
  { value: 'clicked', label: 'Clicked' },
  { value: 'replied', label: 'Replied' },
  { value: 'issues', label: 'Issues' },
];

const ISSUE_STATUSES = ['bounced', 'complained', 'failed', 'suppressed'];
const POSITIVE_STATUSES = ['sent', 'delivered', 'opened', 'clicked', 'replied'];

const formatWhen = (value: string | null): string => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
};

const statusClass = (status: string, active: boolean): string => {
  if (!active) return 'border-slate-200 bg-slate-50 text-slate-300';
  if (ISSUE_STATUSES.includes(status)) return 'border-rose-200 bg-rose-50 text-rose-600';
  if (status === 'replied') return 'border-violet-200 bg-violet-50 text-violet-600';
  if (status === 'clicked') return 'border-indigo-200 bg-indigo-50 text-indigo-600';
  if (status === 'opened') return 'border-cyan-200 bg-cyan-50 text-cyan-600';
  return 'border-emerald-200 bg-emerald-50 text-emerald-600';
};

interface Props {
  leads: Lead[];
  scopeLabel: string;
  onClose: () => void;
}

const LeadEmailOutboxModal: React.FC<Props> = ({ leads, scopeLabel, onClose }) => {
  const [messages, setMessages] = useState<LeadEmailOutboxMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const leadIds = useMemo(() => leads.map(lead => lead.id), [leads]);
  const leadNames = useMemo(() => new Map(leads.map(lead => [lead.id,
    [lead.profile?.first_name, lead.profile?.last_name].filter(Boolean).join(' ').trim() || lead.profile?.email || 'Unknown lead',
  ])), [leads]);

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true); else setLoading(true);
    setError('');
    try {
      setMessages(await fetchLeadEmailOutbox(leadIds));
    } catch (loadError) {
      console.error('Failed to load lead email outbox:', loadError);
      setError('Could not load the lead email outbox.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [leadIds]);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => { void load(true); }, 15000);
    return () => window.clearInterval(interval);
  }, [load]);

  const counts = useMemo(() => ({
    all: messages.length,
    sent: messages.filter(message => message.events.includes('sent')).length,
    delivered: messages.filter(message => message.events.includes('delivered')).length,
    opened: messages.filter(message => message.events.includes('opened')).length,
    clicked: messages.filter(message => message.events.includes('clicked')).length,
    replied: messages.filter(message => message.events.includes('replied')).length,
    issues: messages.filter(message => message.events.some(status => ISSUE_STATUSES.includes(status))).length,
  }), [messages]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return messages.filter(message => {
      const name = leadNames.get(message.lead_id) || '';
      if (query && !`${name} ${message.recipient_email} ${message.subject}`.toLowerCase().includes(query)) return false;
      if (filter === 'all') return true;
      if (filter === 'issues') return message.events.some(status => ISSUE_STATUSES.includes(status));
      return message.events.includes(filter);
    });
  }, [filter, leadNames, messages, search]);

  return (
    <CrmModal title="Lead Email Outbox" subtitle={`${scopeLabel} · refreshes every 15 seconds`} icon={MailCheck} onClose={onClose} maxWidth="max-w-6xl">
      <div className="space-y-4 p-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <label className="relative block lg:w-96">
            <span className="sr-only">Search sent lead emails</span>
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search recipient, lead, or subject…" className="w-full rounded-xl border border-white/10 bg-[#0A0E27] py-2.5 pl-10 pr-3 text-xs text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/50" />
          </label>
          <button type="button" onClick={() => void load(true)} disabled={refreshing} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-300 hover:bg-white/5 disabled:opacity-40">
            {refreshing ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />} Refresh
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map(option => (
            <button key={option.value} type="button" onClick={() => setFilter(option.value)} className={`rounded-full px-3 py-2 text-[9px] font-black uppercase tracking-wider ${filter === option.value ? 'bg-cyan-400 text-[#07101D]' : 'bg-white/5 text-slate-400 hover:bg-white/10'}`}>
              {option.label} <span className="ml-1 opacity-70">{counts[option.value]}</span>
            </button>
          ))}
        </div>

        {error && <div className="flex items-center gap-2 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-4 py-3 text-xs text-rose-300"><AlertTriangle size={15} />{error}</div>}

        {loading ? (
          <div className="flex items-center justify-center gap-3 py-20 text-sm text-slate-400"><Loader2 className="animate-spin text-cyan-300" size={20} />Loading sent emails…</div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 py-16 text-center"><MailCheck className="mx-auto mb-3 text-slate-600" size={30} /><p className="text-sm font-black text-white">No matching lead emails</p><p className="mt-1 text-xs text-slate-500">Sent sequence and manual lead emails will appear here.</p></div>
        ) : (
          <div className="max-h-[58vh] overflow-auto rounded-2xl border border-white/10 bg-[#0A0E27]">
            <table className="w-full min-w-[980px] text-left">
              <thead className="sticky top-0 z-10 bg-[#0A0E27] text-[9px] font-black uppercase tracking-widest text-slate-500"><tr><th className="px-4 py-3">Lead / Recipient</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Sent</th><th className="px-4 py-3">Tracking</th></tr></thead>
              <tbody className="divide-y divide-white/[0.06]">
                {filtered.map(message => (
                  <tr key={message.id} className="align-top hover:bg-white/[0.025]">
                    <td className="px-4 py-4"><p className="text-xs font-black text-white">{leadNames.get(message.lead_id) || 'Unknown lead'}</p><p className="mt-1 text-[10px] text-slate-400">{message.recipient_email}</p></td>
                    <td className="max-w-md px-4 py-4"><p className="truncate text-xs font-bold text-slate-200" title={message.subject}>{message.subject}</p><p className="mt-1 text-[10px] text-slate-500">{message.step ? `Step ${message.step.step_number} · ${message.step.name}` : 'Manual email'}</p>{message.last_error && <p className="mt-1 text-[10px] text-rose-300" title={message.last_error}>{message.last_error}</p>}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-[10px] text-slate-400">{formatWhen(message.sent_at || message.created_at)}</td>
                    <td className="px-4 py-4"><div className="flex flex-wrap gap-1.5">{[...POSITIVE_STATUSES, ...ISSUE_STATUSES].map(status => {
                      const active = message.events.includes(status);
                      if (ISSUE_STATUSES.includes(status) && !active) return null;
                      return <span key={status} className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-wider ${statusClass(status, active)}`}>{active && <CheckCircle2 size={9} />}{status}</span>;
                    })}</div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-right text-[10px] text-slate-500">Showing {filtered.length} of {messages.length} outbound lead emails</p>
      </div>
    </CrmModal>
  );
};

export default LeadEmailOutboxModal;
