import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Mail,
  MailX,
  MousePointerClick,
  RefreshCw,
  Search,
  ShieldOff,
  TrendingUp,
} from 'lucide-react';
import {
  fetchCampaignEmailStats,
  fetchSuppressionSummary,
  CampaignEmailStat,
  SuppressionSummary,
} from '../services/emailReportingService';
import { CampaignRecipientsModal } from './CampaignRecipientsModal';
import { LinkClickSummaryModal } from './LinkClickSummaryModal';
import { SuppressionListModal } from './SuppressionListModal';
import EmailEngagementCohorts from './EmailEngagementCohorts';
import { BranchInfo, EnrichedProfile } from '../types';

const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100) : 0);
const CAMPAIGNS_PER_PAGE = 10;
const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
  catch { return '—'; }
};

interface EmailPerformancePanelProps {
  branches: BranchInfo[];
  profiles: EnrichedProfile[];
}

// Live email delivery + engagement reporting, sourced from Resend webhook events,
// the Hub suppression list, and federated order summaries for correlation.
export const EmailPerformancePanel: React.FC<EmailPerformancePanelProps> = ({ branches, profiles }) => {
  const [stats, setStats] = useState<CampaignEmailStat[]>([]);
  const [suppression, setSuppression] = useState<SuppressionSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [viewingSubject, setViewingSubject] = useState<string | null>(null);
  const [linkSubject, setLinkSubject] = useState<string | null>(null);
  const [suppressionView, setSuppressionView] = useState<{ reason?: string; title: string } | null>(null);

  const load = async () => {
    setLoading(true);
    const [s, sup] = await Promise.all([fetchCampaignEmailStats(), fetchSuppressionSummary()]);
    setStats(s);
    setSuppression(sup);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const totals = useMemo(() => {
    return stats.reduce(
      (acc, r) => {
        acc.sent += r.sent; acc.delivered += r.delivered; acc.opened += r.opened;
        acc.clicked += r.clicked; acc.bounced += r.bounced; acc.complained += r.complained;
        return acc;
      },
      { sent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, complained: 0 },
    );
  }, [stats]);

  const hasData = stats.length > 0;
  const filteredStats = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    if (!query) return stats;
    return stats.filter((row) => row.campaign_subject.toLocaleLowerCase().includes(query));
  }, [searchQuery, stats]);
  const pageCount = Math.max(1, Math.ceil(filteredStats.length / CAMPAIGNS_PER_PAGE));
  const currentPage = Math.min(page, pageCount);
  const paginatedStats = useMemo(() => {
    const start = (currentPage - 1) * CAMPAIGNS_PER_PAGE;
    return filteredStats.slice(start, start + CAMPAIGNS_PER_PAGE);
  }, [currentPage, filteredStats]);

  useEffect(() => { setPage(1); }, [searchQuery]);

  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);

  return (
    <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center shadow-lg">
            <Mail size={22} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Email Performance</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Live from Resend delivery events</p>
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          Refresh
        </button>
      </div>

      <EmailEngagementCohorts branches={branches} profiles={profiles} />

      {/* Suppression summary — click any tile to see who's in it */}
      {suppression && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <button
            type="button"
            onClick={() => setSuppressionView({ title: 'All Suppressed' })}
            className="bg-slate-50 rounded-2xl p-4 text-center hover:bg-slate-100 transition cursor-pointer"
          >
            <p className="text-2xl font-black text-slate-700">{suppression.total}</p>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-1 flex items-center justify-center gap-1"><ShieldOff size={11} /> Suppressed</p>
          </button>
          <button
            type="button"
            onClick={() => setSuppressionView({ reason: 'unsubscribe', title: 'Unsubscribed' })}
            className="bg-amber-50 rounded-2xl p-4 text-center hover:bg-amber-100 transition cursor-pointer"
          >
            <p className="text-2xl font-black text-amber-600">{suppression.unsubscribe}</p>
            <p className="text-[9px] font-black uppercase tracking-widest text-amber-500 mt-1">Unsubscribed</p>
          </button>
          <button
            type="button"
            onClick={() => setSuppressionView({ reason: 'bounce', title: 'Hard Bounces' })}
            className="bg-rose-50 rounded-2xl p-4 text-center hover:bg-rose-100 transition cursor-pointer"
          >
            <p className="text-2xl font-black text-rose-600">{suppression.bounce}</p>
            <p className="text-[9px] font-black uppercase tracking-widest text-rose-500 mt-1">Hard Bounces</p>
          </button>
          <button
            type="button"
            onClick={() => setSuppressionView({ reason: 'complaint', title: 'Complaints' })}
            className="bg-purple-50 rounded-2xl p-4 text-center hover:bg-purple-100 transition cursor-pointer"
          >
            <p className="text-2xl font-black text-purple-600">{suppression.complaint}</p>
            <p className="text-[9px] font-black uppercase tracking-widest text-purple-500 mt-1">Complaints</p>
          </button>
        </div>
      )}

      {loading && !hasData ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-emerald-500" />
        </div>
      ) : !hasData ? (
        <div className="text-center py-12 px-6">
          <MailX size={32} className="text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-black text-slate-500 uppercase tracking-widest mb-2">No email events yet</p>
          <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
            Delivery, open, click and bounce data appears here once you send a campaign <b>and</b> Resend is configured to
            POST events to the <span className="font-mono text-[11px] bg-slate-100 px-1.5 py-0.5 rounded">resend-webhook</span> endpoint.
            Add that URL under <b>Resend → Webhooks</b> and subscribe to the <span className="font-mono text-[11px]">email.*</span> events.
          </p>
        </div>
      ) : (
        <>
          {/* Aggregate rate strip */}
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 text-center">
              <p className="text-[9px] font-black uppercase tracking-widest text-emerald-500 flex items-center justify-center gap-1"><TrendingUp size={11} /> Open Rate</p>
              <p className="text-2xl font-black text-emerald-600 mt-1">{pct(totals.opened, totals.delivered || totals.sent)}%</p>
            </div>
            <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4 text-center">
              <p className="text-[9px] font-black uppercase tracking-widest text-blue-500 flex items-center justify-center gap-1"><MousePointerClick size={11} /> Click Rate</p>
              <p className="text-2xl font-black text-blue-600 mt-1">{pct(totals.clicked, totals.delivered || totals.sent)}%</p>
            </div>
            <div className="rounded-2xl border border-rose-100 bg-rose-50/50 p-4 text-center">
              <p className="text-[9px] font-black uppercase tracking-widest text-rose-500 flex items-center justify-center gap-1"><AlertTriangle size={11} /> Bounce Rate</p>
              <p className="text-2xl font-black text-rose-600 mt-1">{pct(totals.bounced, totals.sent || totals.delivered)}%</p>
            </div>
          </div>

          {/* Per-campaign search */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
            <label className="relative block sm:max-w-sm sm:flex-1">
              <span className="sr-only">Search email campaigns by subject</span>
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search campaign subjects..."
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-xs font-medium text-slate-700 placeholder:text-slate-400 outline-none transition focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"
              />
            </label>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
              {filteredStats.length} {filteredStats.length === 1 ? 'campaign' : 'campaigns'}
            </p>
          </div>

          {/* Per-campaign table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[9px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                  <th className="py-2 pr-3">Campaign (subject)</th>
                  <th className="py-2 px-2 text-right">Sent</th>
                  <th className="py-2 px-2 text-right">Delivered</th>
                  <th className="py-2 px-2 text-right">Opened</th>
                  <th className="py-2 px-2 text-right">Clicked</th>
                  <th className="py-2 px-2 text-right">Bounced</th>
                  <th className="py-2 pl-2 text-right">Last event</th>
                  <th className="py-2 pl-2 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {paginatedStats.map((r) => (
                  <tr key={r.campaign_subject} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="py-3 pr-3 text-xs font-bold text-slate-700 max-w-[240px] truncate" title={r.campaign_subject}>{r.campaign_subject}</td>
                    <td className="py-3 px-2 text-right text-xs text-slate-500">{r.sent}</td>
                    <td className="py-3 px-2 text-right text-xs text-slate-500">{r.delivered}</td>
                    <td className="py-3 px-2 text-right text-xs font-bold text-emerald-600">{r.opened} <span className="text-slate-300 font-normal">({pct(r.opened, r.delivered || r.sent)}%)</span></td>
                    <td className="py-3 px-2 text-right text-xs font-bold text-blue-600">
                      {r.clicked > 0 ? (
                        <button
                          type="button"
                          onClick={() => setLinkSubject(r.campaign_subject)}
                          title="See which links were clicked, and who clicked them"
                          className="underline decoration-dotted underline-offset-4 hover:text-violet-600 transition"
                        >
                          {r.clicked}
                        </button>
                      ) : (
                        r.clicked
                      )}
                    </td>
                    <td className="py-3 px-2 text-right text-xs font-bold text-rose-600">{r.bounced}</td>
                    <td className="py-3 pl-2 text-right text-[10px] text-slate-400">{fmtDate(r.last_event_at)}</td>
                    <td className="py-3 pl-2 text-right">
                      <button
                        type="button"
                        onClick={() => setViewingSubject(r.campaign_subject)}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 text-[9px] font-black uppercase tracking-widest whitespace-nowrap"
                      >
                        Recipients
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredStats.length === 0 ? (
            <div className="py-10 text-center">
              <Search size={24} className="mx-auto mb-2 text-slate-300" />
              <p className="text-xs font-black uppercase tracking-widest text-slate-400">No matching campaigns</p>
              <p className="mt-1 text-xs text-slate-400">Try a different subject search.</p>
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Showing {(currentPage - 1) * CAMPAIGNS_PER_PAGE + 1}–{Math.min(currentPage * CAMPAIGNS_PER_PAGE, filteredStats.length)} of {filteredStats.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((value) => Math.max(1, value - 1))}
                  disabled={currentPage === 1}
                  aria-label="Previous campaign page"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft size={15} />
                </button>
                <span className="min-w-20 text-center text-[10px] font-black uppercase tracking-widest text-slate-500">
                  Page {currentPage} of {pageCount}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
                  disabled={currentPage === pageCount}
                  aria-label="Next campaign page"
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}
          <p className="text-[10px] text-slate-400 mt-4 leading-relaxed">
            Campaigns are matched by subject line. Batch sends can't tag individual messages, so if two campaigns share a subject their
            events combine here. Every count is unique recipients, not raw events — a retried send or repeat open only counts once.
          </p>
        </>
      )}

      {viewingSubject && (
        <CampaignRecipientsModal campaignSubject={viewingSubject} onClose={() => setViewingSubject(null)} />
      )}
      {linkSubject && (
        <LinkClickSummaryModal campaignSubject={linkSubject} onClose={() => setLinkSubject(null)} />
      )}
      {suppressionView && (
        <SuppressionListModal
          reason={suppressionView.reason}
          title={suppressionView.title}
          onClose={() => setSuppressionView(null)}
        />
      )}
    </div>
  );
};

export default EmailPerformancePanel;
