import React, { useEffect, useMemo, useState } from 'react';
import { Mail, RefreshCw, Loader2, MailX, TrendingUp, MousePointerClick, AlertTriangle, ShieldOff } from 'lucide-react';
import {
  fetchCampaignEmailStats,
  fetchSuppressionSummary,
  CampaignEmailStat,
  SuppressionSummary,
} from '../services/emailReportingService';

const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100) : 0);
const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
  catch { return '—'; }
};

// Live email delivery + engagement reporting, sourced from Resend webhook events
// (email_events) and the Hub suppression list. Self-contained; safe to drop anywhere.
export const EmailPerformancePanel: React.FC = () => {
  const [stats, setStats] = useState<CampaignEmailStat[]>([]);
  const [suppression, setSuppression] = useState<SuppressionSummary | null>(null);
  const [loading, setLoading] = useState(true);

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

      {/* Suppression summary */}
      {suppression && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <div className="bg-slate-50 rounded-2xl p-4 text-center">
            <p className="text-2xl font-black text-slate-700">{suppression.total}</p>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-1 flex items-center justify-center gap-1"><ShieldOff size={11} /> Suppressed</p>
          </div>
          <div className="bg-amber-50 rounded-2xl p-4 text-center">
            <p className="text-2xl font-black text-amber-600">{suppression.unsubscribe}</p>
            <p className="text-[9px] font-black uppercase tracking-widest text-amber-500 mt-1">Unsubscribed</p>
          </div>
          <div className="bg-rose-50 rounded-2xl p-4 text-center">
            <p className="text-2xl font-black text-rose-600">{suppression.bounce}</p>
            <p className="text-[9px] font-black uppercase tracking-widest text-rose-500 mt-1">Hard Bounces</p>
          </div>
          <div className="bg-purple-50 rounded-2xl p-4 text-center">
            <p className="text-2xl font-black text-purple-600">{suppression.complaint}</p>
            <p className="text-[9px] font-black uppercase tracking-widest text-purple-500 mt-1">Complaints</p>
          </div>
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
                </tr>
              </thead>
              <tbody>
                {stats.map((r) => (
                  <tr key={r.campaign_subject} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="py-3 pr-3 text-xs font-bold text-slate-700 max-w-[240px] truncate" title={r.campaign_subject}>{r.campaign_subject}</td>
                    <td className="py-3 px-2 text-right text-xs text-slate-500">{r.sent}</td>
                    <td className="py-3 px-2 text-right text-xs text-slate-500">{r.delivered}</td>
                    <td className="py-3 px-2 text-right text-xs font-bold text-emerald-600">{r.opened} <span className="text-slate-300 font-normal">({pct(r.opened, r.delivered || r.sent)}%)</span></td>
                    <td className="py-3 px-2 text-right text-xs font-bold text-blue-600">{r.clicked}</td>
                    <td className="py-3 px-2 text-right text-xs font-bold text-rose-600">{r.bounced}</td>
                    <td className="py-3 pl-2 text-right text-[10px] text-slate-400">{fmtDate(r.last_event_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-[10px] text-slate-400 mt-4 leading-relaxed">
            Campaigns are matched by subject line. Batch sends can't tag individual messages, so if two campaigns share a subject their
            events combine here. Open/click counts are unique recipients.
          </p>
        </>
      )}
    </div>
  );
};

export default EmailPerformancePanel;
