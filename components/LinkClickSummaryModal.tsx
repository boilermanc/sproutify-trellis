import React, { useEffect, useMemo, useState } from 'react';
import {
  X, Loader2, Search, MousePointerClick, ExternalLink, ChevronLeft, ChevronRight, Users, Link as LinkIcon,
} from 'lucide-react';
import {
  fetchCampaignLinkClicks,
  fetchLinkClickers,
  CampaignLinkClick,
  LinkClicker,
} from '../services/emailReportingService';

const fmtWhen = (iso: string | null): string => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  catch { return '—'; }
};

interface Props {
  campaignSubject: string;
  // The HTML this campaign sent, when the caller already has it (the Campaigns
  // drawer does). Omit and the service looks it up by subject.
  sentHtml?: string;
  onClose: () => void;
}

// Per-campaign link click summary — which link earned the clicks, and who
// clicked it. Two levels: the ranked link list, then one link's clickers.
export const LinkClickSummaryModal: React.FC<Props> = ({ campaignSubject, sentHtml, onClose }) => {
  const [links, setLinks] = useState<CampaignLinkClick[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Non-null = drilled into one link's clickers.
  const [selected, setSelected] = useState<CampaignLinkClick | null>(null);
  const [clickers, setClickers] = useState<LinkClicker[]>([]);
  const [clickersLoading, setClickersLoading] = useState(false);
  const [clickerSearch, setClickerSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchCampaignLinkClicks(campaignSubject, sentHtml)
      .then((rows) => { if (!cancelled) setLinks(rows); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [campaignSubject, sentHtml]);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    setClickersLoading(true);
    setClickerSearch('');
    fetchLinkClickers(campaignSubject, selected.linkUrl)
      .then((rows) => { if (!cancelled) setClickers(rows); })
      .finally(() => { if (!cancelled) setClickersLoading(false); });
    return () => { cancelled = true; };
  }, [campaignSubject, selected]);

  const totals = useMemo(() => ({
    clicks: links.reduce((n, l) => n + l.clicks, 0),
    links: links.length,
  }), [links]);

  const maxClicks = useMemo(() => links.reduce((n, l) => Math.max(n, l.clicks), 0), [links]);

  const filteredLinks = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return links;
    return links.filter((l) => l.label.toLowerCase().includes(q) || l.linkUrl.toLowerCase().includes(q));
  }, [links, search]);

  const filteredClickers = useMemo(() => {
    const q = clickerSearch.trim().toLowerCase();
    if (!q) return clickers;
    return clickers.filter((c) => c.email.includes(q));
  }, [clickers, clickerSearch]);

  return (
    <>
      <div className="fixed inset-0 z-[110] bg-slate-900/70 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
        <div
          className="bg-white w-full max-w-2xl max-h-[88vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-white/20"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              {selected ? (
                <button
                  onClick={() => setSelected(null)}
                  className="w-10 h-10 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-700 flex items-center justify-center shrink-0 transition"
                  aria-label="Back to all links"
                >
                  <ChevronLeft size={18} />
                </button>
              ) : (
                <div className="w-10 h-10 rounded-xl bg-slate-900 text-violet-400 flex items-center justify-center shrink-0">
                  <MousePointerClick size={18} />
                </div>
              )}
              <div className="min-w-0">
                <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight truncate">
                  {selected ? 'Who clicked this link' : 'Link clicks'}
                </h2>
                <p className="text-xs text-slate-400 truncate" title={selected ? selected.label : campaignSubject}>
                  {selected ? selected.label : campaignSubject}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-slate-50 rounded-lg transition shrink-0">
              <X size={20} />
            </button>
          </div>

          {selected ? (
            /* ── Level 2: who clicked this link ─────────────────────────────── */
            <>
              <div className="px-6 pt-4 shrink-0">
                <a
                  href={selected.linkUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-2 mb-3 text-[11px] text-violet-600 hover:text-violet-800 hover:underline break-all"
                  title={selected.linkUrl}
                >
                  <ExternalLink size={13} className="mt-0.5 shrink-0" />
                  {selected.linkUrl}
                </a>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="bg-violet-50 rounded-xl p-3 text-center border border-violet-100">
                    <p className="text-xl font-black text-violet-600">{selected.clicks.toLocaleString()}</p>
                    <p className="text-[9px] font-black uppercase tracking-widest text-violet-400 mt-0.5">Total clicks</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
                    <p className="text-xl font-black text-slate-700">{selected.uniqueClickers.toLocaleString()}</p>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">People</p>
                  </div>
                </div>
                <label className="relative block">
                  <span className="sr-only">Search clickers by email</span>
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="search"
                    value={clickerSearch}
                    onChange={(e) => setClickerSearch(e.target.value)}
                    placeholder="Search by email..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-xs font-medium text-slate-700 placeholder:text-slate-400 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                  />
                </label>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-4">
                {clickersLoading ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-16">
                    <Loader2 size={22} className="animate-spin text-violet-500" />
                    <p className="text-xs font-bold text-slate-400">Loading clickers…</p>
                  </div>
                ) : filteredClickers.length === 0 ? (
                  <div className="text-center py-12">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                      {clickers.length === 0 ? 'No clickers found' : 'No matches'}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredClickers.map((c) => (
                      <div key={c.email} className="bg-slate-50 rounded-xl px-4 py-3 border border-slate-100 flex items-center justify-between gap-3">
                        <span className="text-xs font-bold text-slate-700 truncate">{c.email}</span>
                        <div className="flex items-center gap-3 shrink-0">
                          {c.clicks > 1 && (
                            <span className="px-2 py-0.5 rounded-md bg-violet-100 text-violet-700 text-[9px] font-black uppercase tracking-widest">
                              ×{c.clicks}
                            </span>
                          )}
                          <span className="text-[10px] text-slate-400">{fmtWhen(c.lastClickAt)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="px-6 py-3 border-t border-slate-100 shrink-0">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 text-center">
                  {filteredClickers.length} of {clickers.length} {clickers.length === 1 ? 'person' : 'people'}
                </p>
              </div>
            </>
          ) : (
            /* ── Level 1: ranked link list ──────────────────────────────────── */
            <>
              <div className="px-6 pt-4 shrink-0">
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="bg-violet-50 rounded-xl p-3 text-center border border-violet-100">
                    <p className="text-xl font-black text-violet-600">{totals.clicks.toLocaleString()}</p>
                    <p className="text-[9px] font-black uppercase tracking-widest text-violet-400 mt-0.5">Total clicks</p>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
                    <p className="text-xl font-black text-slate-700">{totals.links.toLocaleString()}</p>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-0.5">Links clicked</p>
                  </div>
                </div>
                <label className="relative block">
                  <span className="sr-only">Search links</span>
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search links..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-xs font-medium text-slate-700 placeholder:text-slate-400 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"
                  />
                </label>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-4">
                {loading ? (
                  <div className="flex flex-col items-center justify-center gap-3 py-16">
                    <Loader2 size={22} className="animate-spin text-violet-500" />
                    <p className="text-xs font-bold text-slate-400">Loading link clicks…</p>
                  </div>
                ) : filteredLinks.length === 0 ? (
                  <div className="text-center py-12 px-4">
                    <LinkIcon size={28} className="text-slate-300 mx-auto mb-3" />
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                      {links.length === 0 ? 'No link clicks yet' : 'No matches'}
                    </p>
                    {links.length === 0 && (
                      <p className="mt-2 text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                        Per-link data needs click tracking switched on in Resend. Unsubscribe links are
                        deliberately excluded, so a campaign whose only clicks were unsubscribes shows nothing here.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredLinks.map((l) => (
                      <button
                        key={l.linkUrl}
                        type="button"
                        onClick={() => setSelected(l)}
                        className="w-full text-left bg-slate-50 rounded-xl px-4 py-3 border border-slate-100 hover:border-violet-200 hover:bg-violet-50/40 transition group"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p
                              className={`text-xs font-bold truncate ${l.labelFromEmail ? 'text-slate-700' : 'text-slate-500 italic'}`}
                              title={l.labelFromEmail ? l.label : `${l.label} (no link text in the email — derived from the URL)`}
                            >
                              {l.label}
                            </p>
                            <p className="text-[10px] text-slate-400 truncate mt-0.5" title={l.linkUrl}>{l.linkUrl}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-lg font-black text-violet-600 leading-none">{l.clicks.toLocaleString()}</p>
                            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mt-1">
                              {l.uniqueClickers.toLocaleString()} {l.uniqueClickers === 1 ? 'person' : 'people'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-violet-500"
                              style={{ width: `${maxClicks > 0 ? Math.max(3, (l.clicks / maxClicks) * 100) : 0}%` }}
                            />
                          </div>
                          <span className="text-[9px] font-black uppercase tracking-widest text-slate-300 group-hover:text-violet-500 flex items-center gap-0.5 shrink-0 transition">
                            <Users size={10} /> Who <ChevronRight size={11} />
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="px-6 py-3 border-t border-slate-100 shrink-0">
                <p className="text-[10px] text-slate-400 text-center leading-relaxed">
                  Total clicks counts every click, so one person clicking twice counts twice. Unsubscribe
                  links are excluded, matching the campaign's Clicked metric.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
};

export default LinkClickSummaryModal;
