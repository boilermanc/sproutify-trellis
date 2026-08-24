import React, { useEffect, useMemo, useState } from 'react';
import {
  X, Loader2, Search, MailCheck, Eye, MousePointerClick, MailX, AlertTriangle, Users, Ban,
} from 'lucide-react';
import { fetchCampaignRecipients, CampaignRecipient } from '../services/emailReportingService';

type Filter = 'all' | 'opened' | 'clicked' | 'bounced' | 'complained' | 'unsubscribed';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'opened', label: 'Opened' },
  { key: 'clicked', label: 'Clicked' },
  { key: 'bounced', label: 'Bounced' },
  { key: 'complained', label: 'Complained' },
  { key: 'unsubscribed', label: 'Unsubscribed' },
];

const fmtWhen = (iso: string | null): string => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  catch { return '—'; }
};

interface Props {
  campaignId: string;
  campaignSubject: string;
  branches?: string[];
  onClose: () => void;
}

// Per-campaign recipient list — "who opened/clicked/complained" without having to
// open each customer's profile one at a time. Reads email_events, grouped by
// recipient (see fetchCampaignRecipients).
export const CampaignRecipientsModal: React.FC<Props> = ({ campaignId, campaignSubject, branches = [], onClose }) => {
  const [recipients, setRecipients] = useState<CampaignRecipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadedCount, setLoadedCount] = useState(0);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadedCount(0);
    fetchCampaignRecipients(campaignId, branches, (rowsSoFar) => {
      if (!cancelled) setLoadedCount(rowsSoFar);
    }).then((rows) => {
      if (!cancelled) setRecipients(rows);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [campaignId, branches]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return recipients.filter((r) => {
      if (query && !r.email.includes(query)) return false;
      if (filter === 'all') return true;
      if (filter === 'opened') return r.opened;
      if (filter === 'clicked') return r.clicked;
      if (filter === 'bounced') return r.bounced;
      if (filter === 'complained') return r.complained;
      if (filter === 'unsubscribed') return r.unsubscribed;
      return true;
    });
  }, [recipients, filter, search]);

  const counts = useMemo(() => ({
    opened: recipients.filter((r) => r.opened).length,
    clicked: recipients.filter((r) => r.clicked).length,
    bounced: recipients.filter((r) => r.bounced).length,
    complained: recipients.filter((r) => r.complained).length,
    unsubscribed: recipients.filter((r) => r.unsubscribed).length,
  }), [recipients]);

  return (
    <>
      <div className="fixed inset-0 z-[110] bg-slate-900/70 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
        <div
          className="bg-white w-full max-w-2xl max-h-[88vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-white/20"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-slate-900 text-emerald-400 flex items-center justify-center shrink-0">
                <Users size={18} />
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight truncate">Recipients</h2>
                <p className="text-xs text-slate-400 truncate" title={campaignSubject}>{campaignSubject}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-slate-50 rounded-lg transition shrink-0">
              <X size={20} />
            </button>
          </div>

          <div className="px-6 pt-4 shrink-0">
            <label className="relative block mb-3">
              <span className="sr-only">Search recipients by email</span>
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by email..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-xs font-medium text-slate-700 placeholder:text-slate-400 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition ${
                    filter === f.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {f.label}
                  {f.key !== 'all' && ` (${counts[f.key]})`}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {loading ? (
              <div className="flex flex-col items-center justify-center gap-3 py-16">
                <Loader2 size={22} className="animate-spin text-emerald-500" />
                <p className="text-xs font-bold text-slate-400">
                  {loadedCount > 0 ? `Loading recipients… ${loadedCount.toLocaleString()} so far` : 'Loading recipients…'}
                </p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                  {recipients.length === 0 ? 'No recipient data yet' : 'No matches'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map((r) => (
                  <div key={r.email} className="bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-700 truncate">{r.email}</span>
                      <span className="text-[10px] text-slate-400 shrink-0">{fmtWhen(r.lastEventAt)}</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      {r.delivered && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 text-[9px] font-black uppercase tracking-widest"><MailCheck size={10} /> Delivered</span>
                      )}
                      {r.opened && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 text-[9px] font-black uppercase tracking-widest"><Eye size={10} /> Opened</span>
                      )}
                      {r.clicked && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-100 text-violet-700 text-[9px] font-black uppercase tracking-widest"><MousePointerClick size={10} /> Clicked</span>
                      )}
                      {r.bounced && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-100 text-red-700 text-[9px] font-black uppercase tracking-widest"><MailX size={10} /> Bounced</span>
                      )}
                      {r.complained && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 text-[9px] font-black uppercase tracking-widest"><AlertTriangle size={10} /> Complained</span>
                      )}
                      {r.unsubscribed && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-200 text-slate-700 text-[9px] font-black uppercase tracking-widest"><Ban size={10} /> Unsubscribed</span>
                      )}
                    </div>
                    {r.linkUrls.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {r.linkUrls.map((url) => (
                          <a
                            key={url}
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block text-[10px] text-violet-600 hover:text-violet-800 hover:underline truncate"
                            title={url}
                          >
                            → {url}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="px-6 py-3 border-t border-slate-100 shrink-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 text-center">
              {filtered.length} of {recipients.length} recipients
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default CampaignRecipientsModal;
