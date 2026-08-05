import React, { useEffect, useMemo, useState } from 'react';
import { X, Loader2, Search, ShieldOff } from 'lucide-react';
import { fetchSuppressions, SuppressionRow } from '../services/emailReportingService';

const REASON_LABEL: Record<string, string> = {
  unsubscribe: 'Unsubscribed',
  bounce: 'Hard Bounce',
  complaint: 'Complaint',
  manual: 'Manual',
};

const fmtWhen = (iso: string): string => {
  try { return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  catch { return '—'; }
};

interface Props {
  // Pass a specific reason ('complaint', 'bounce', 'unsubscribe', 'manual') to
  // scope the list, or omit for every suppressed address.
  reason?: string;
  title: string;
  onClose: () => void;
}

// Org-wide "who unsubscribed / complained / bounced" list, sourced from
// email_suppressions — answers "who complained?" directly instead of paging
// through campaigns or customer profiles one at a time.
export const SuppressionListModal: React.FC<Props> = ({ reason, title, onClose }) => {
  const [rows, setRows] = useState<SuppressionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchSuppressions(reason).then((data) => {
      if (!cancelled) setRows(data);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reason]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((r) => r.email.includes(query) || (r.campaign_subject || '').toLowerCase().includes(query));
  }, [rows, search]);

  return (
    <>
      <div className="fixed inset-0 z-[110] bg-slate-900/70 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
        <div
          className="bg-white w-full max-w-xl max-h-[85vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-white/20"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-slate-900 text-emerald-400 flex items-center justify-center shrink-0">
                <ShieldOff size={18} />
              </div>
              <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight truncate">{title}</h2>
            </div>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-slate-50 rounded-lg transition shrink-0">
              <X size={20} />
            </button>
          </div>

          <div className="px-6 pt-4 shrink-0">
            <label className="relative block">
              <span className="sr-only">Search by email or campaign</span>
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by email or campaign..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-xs font-medium text-slate-700 placeholder:text-slate-400 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"
              />
            </label>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={22} className="animate-spin text-emerald-500" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                  {rows.length === 0 ? 'None yet' : 'No matches'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map((r) => (
                  <div key={`${r.email}-${r.reason}`} className="bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-700 truncate">{r.email}</span>
                      <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-700 text-[9px] font-black uppercase tracking-widest shrink-0">
                        {REASON_LABEL[r.reason] || r.reason}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-1">
                      <span className="text-[10px] text-slate-400 truncate" title={r.campaign_subject || undefined}>
                        {r.campaign_subject || (r.source ? `via ${r.source}` : '—')}
                      </span>
                      <span className="text-[10px] text-slate-400 shrink-0">{fmtWhen(r.created_at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="px-6 py-3 border-t border-slate-100 shrink-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 text-center">
              {filtered.length} of {rows.length}
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default SuppressionListModal;
