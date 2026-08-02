import React, { useEffect, useMemo, useState } from 'react';
import {
  Rocket, RefreshCw, Loader2, X, Calendar, Users, Mail, MailCheck, Eye,
  MousePointerClick, MailX, AlertTriangle, Send, Clock, ChevronRight, Tag, GitBranch,
} from 'lucide-react';
import { fetchCampaigns, Campaign, retryCampaign, fetchCampaignRecipientStats, CampaignRecipientStats } from '../supabaseService';
import { fetchCampaignEmailStats, CampaignEmailStat } from '../services/emailReportingService';
import { BranchContext } from '../types';

interface CampaignsProps {
  branchContext?: BranchContext;
  addToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const pct = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100) : 0);

const fmtDate = (iso: string | null): string => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return '—'; }
};

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  scheduled: 'bg-blue-100 text-blue-700',
  active: 'bg-emerald-100 text-emerald-700',
  completed: 'bg-violet-100 text-violet-700',
  paused: 'bg-amber-100 text-amber-700',
};

// The real delivery state, driven by the campaign-sender worker (distinct from
// the lifecycle `status` above).
const SEND_STATUS_STYLE: Record<string, string> = {
  queued: 'bg-amber-100 text-amber-700',
  sending: 'bg-blue-100 text-blue-700',
  sent: 'bg-emerald-100 text-emerald-700',
  partial: 'bg-orange-100 text-orange-700',
  failed: 'bg-red-100 text-red-700',
};
const SEND_STATUS_LABEL: Record<string, string> = {
  queued: 'Queued', sending: 'Sending', sent: 'Sent', partial: 'Partial send', failed: 'Failed',
};

// Stats are aggregated by subject on the Hub, so we match a campaign to its stats by subject line.
const emptyStat = (subject: string): CampaignEmailStat => ({
  campaign_subject: subject, sent: 0, delivered: 0, opened: 0, clicked: 0,
  bounced: 0, complained: 0, first_event_at: null, last_event_at: null,
});

const Campaigns: React.FC<CampaignsProps> = ({ addToast }) => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [stats, setStats] = useState<CampaignEmailStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Campaign | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [c, s] = await Promise.all([fetchCampaigns(), fetchCampaignEmailStats()]);
      setCampaigns(c);
      setStats(s);
    } catch (e) {
      console.error('Failed to load campaigns:', e);
      addToast?.('Failed to load campaigns.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // subject -> stat lookup
  const statBySubject = useMemo(() => {
    const m = new Map<string, CampaignEmailStat>();
    for (const s of stats) if (s.campaign_subject) m.set(s.campaign_subject, s);
    return m;
  }, [stats]);

  const statFor = (c: Campaign): CampaignEmailStat => statBySubject.get(c.subject) || emptyStat(c.subject);

  const totals = useMemo(() => {
    const t = { sent: 0, delivered: 0, opened: 0, clicked: 0 };
    for (const c of campaigns) {
      const s = statBySubject.get(c.subject);
      if (s) { t.sent += s.sent; t.delivered += s.delivered; t.opened += s.opened; t.clicked += s.clicked; }
    }
    return t;
  }, [campaigns, statBySubject]);

  return (
    <div className="p-6 lg:p-10 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center shadow-lg">
            <Rocket className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Campaigns</h1>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
              Everything you've sent · engagement from Resend
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Refresh
        </button>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Campaigns', value: campaigns.length, icon: Send, color: 'text-slate-700' },
          { label: 'Delivered', value: totals.delivered, icon: MailCheck, color: 'text-emerald-600' },
          { label: 'Open Rate', value: `${pct(totals.opened, totals.delivered)}%`, icon: Eye, color: 'text-blue-600' },
          { label: 'Click Rate', value: `${pct(totals.clicked, totals.delivered)}%`, icon: MousePointerClick, color: 'text-violet-600' },
        ].map((k) => (
          <div key={k.label} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-2">
              <k.icon className={`w-4 h-4 ${k.color}`} />
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{k.label}</span>
            </div>
            <div className={`text-2xl font-black ${k.color}`}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* List */}
      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center gap-2 text-slate-400 py-20">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading campaigns…
          </div>
        ) : campaigns.length === 0 ? (
          <div className="text-center py-20 px-6">
            <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Rocket className="w-7 h-7 text-slate-300" />
            </div>
            <h3 className="text-lg font-black text-slate-700 mb-1">No campaigns yet</h3>
            <p className="text-sm text-slate-400">Launch a campaign from Campaign Builder and it'll show up here with live engagement stats.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {campaigns.map((c) => {
              const s = statFor(c);
              return (
                <button
                  key={c.id}
                  onClick={() => setSelected(c)}
                  className="w-full text-left px-6 py-5 hover:bg-slate-50/80 transition flex items-center gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-black text-slate-800 text-sm truncate">{c.name}</p>
                      <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${STATUS_STYLE[c.status] || 'bg-slate-100 text-slate-600'}`}>
                        {c.status}
                      </span>
                      {c.send_status && (
                        <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${SEND_STATUS_STYLE[c.send_status] || 'bg-slate-100 text-slate-600'}`}>
                          {SEND_STATUS_LABEL[c.send_status] || c.send_status}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 truncate mt-0.5">{c.subject || 'No subject'}</p>
                    <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-400 font-medium">
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{fmtDate(c.launched_at || c.created_at)}</span>
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" />{c.audience_size?.toLocaleString() || 0} targeted</span>
                    </div>
                  </div>
                  {/* Mini metrics */}
                  <div className="hidden md:flex items-center gap-5 shrink-0">
                    {[
                      { label: 'Sent', value: s.sent, color: 'text-slate-600' },
                      { label: 'Open', value: `${pct(s.opened, s.delivered)}%`, color: 'text-blue-600' },
                      { label: 'Click', value: `${pct(s.clicked, s.delivered)}%`, color: 'text-violet-600' },
                    ].map((m) => (
                      <div key={m.label} className="text-center w-14">
                        <div className={`text-sm font-black ${m.color}`}>{m.value}</div>
                        <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{m.label}</div>
                      </div>
                    ))}
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {selected && (
        <CampaignDetailDrawer
          campaign={selected}
          stat={statFor(selected)}
          onClose={() => setSelected(null)}
          addToast={addToast}
          onChanged={load}
        />
      )}
    </div>
  );
};

// ── Detail drawer ────────────────────────────────────────────────────────────
const CampaignDetailDrawer: React.FC<{
  campaign: Campaign;
  stat: CampaignEmailStat;
  onClose: () => void;
  addToast?: (m: string, t?: 'success' | 'error' | 'info') => void;
  onChanged: () => void;
}> = ({ campaign: c, stat: s, onClose, addToast, onChanged }) => {
  const [rstats, setRstats] = useState<CampaignRecipientStats | null>(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    let alive = true;
    if (c.send_status) {
      fetchCampaignRecipientStats(c.id).then((r) => { if (alive) setRstats(r); }).catch(() => {});
    }
    return () => { alive = false; };
  }, [c.id, c.send_status]);

  const canRetry = c.send_status === 'failed' || c.send_status === 'partial' || (!!rstats && rstats.failed > 0);
  const handleRetry = async () => {
    setRetrying(true);
    const res = await retryCampaign(c.id);
    setRetrying(false);
    if (res.ok) { addToast?.('Re-queued the failed recipients — sending now.', 'success'); onChanged(); onClose(); }
    else { addToast?.(`Retry failed: ${res.error}`, 'error'); }
  };

  const metrics = [
    { label: 'Sent', value: s.sent, icon: Send, color: 'text-slate-600', bg: 'bg-slate-100' },
    { label: 'Delivered', value: s.delivered, sub: `${pct(s.delivered, s.sent)}%`, icon: MailCheck, color: 'text-emerald-600', bg: 'bg-emerald-100' },
    { label: 'Opened', value: s.opened, sub: `${pct(s.opened, s.delivered)}%`, icon: Eye, color: 'text-blue-600', bg: 'bg-blue-100' },
    { label: 'Clicked', value: s.clicked, sub: `${pct(s.clicked, s.delivered)}%`, icon: MousePointerClick, color: 'text-violet-600', bg: 'bg-violet-100' },
    { label: 'Bounced', value: s.bounced, icon: MailX, color: 'text-red-600', bg: 'bg-red-100' },
    { label: 'Complained', value: s.complained, icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-100' },
  ];
  const hasEvents = s.sent + s.delivered + s.opened + s.clicked + s.bounced + s.complained > 0;

  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-lg bg-white shadow-2xl z-50 overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between">
          <div className="min-w-0">
            <h2 className="text-xl font-black text-slate-800 truncate">{c.name}</h2>
            <p className="text-sm text-slate-500 truncate">{c.subject || 'No subject'}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors shrink-0">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Meta */}
          <div className="flex flex-wrap gap-2">
            <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded ${STATUS_STYLE[c.status] || 'bg-slate-100 text-slate-600'}`}>{c.status}</span>
            <span className="text-[10px] font-bold px-2.5 py-1 rounded bg-slate-100 text-slate-500 flex items-center gap-1"><Clock className="w-3 h-3" />{c.trigger_type}</span>
            <span className="text-[10px] font-bold px-2.5 py-1 rounded bg-slate-100 text-slate-500 flex items-center gap-1"><Calendar className="w-3 h-3" />{fmtDate(c.launched_at || c.created_at)}</span>
          </div>

          {/* Delivery / send status (durable outbox) */}
          {c.send_status && (
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Delivery</h3>
                <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded ${SEND_STATUS_STYLE[c.send_status] || 'bg-slate-100 text-slate-600'}`}>
                  {SEND_STATUS_LABEL[c.send_status] || c.send_status}
                </span>
              </div>
              {c.send_error && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{c.send_error}</p>
              )}
              {rstats && (
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: 'Sent', value: rstats.sent, color: 'text-emerald-600' },
                    { label: 'Pending', value: rstats.pending, color: 'text-amber-600' },
                    { label: 'Failed', value: rstats.failed, color: 'text-red-600' },
                  ].map((m) => (
                    <div key={m.label} className="bg-white rounded-xl border border-slate-100 p-3 text-center">
                      <div className={`text-xl font-black ${m.color}`}>{m.value.toLocaleString()}</div>
                      <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">{m.label}</div>
                    </div>
                  ))}
                </div>
              )}
              {canRetry && (
                <button
                  onClick={handleRetry}
                  disabled={retrying}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-600 transition disabled:opacity-50"
                >
                  {retrying ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Retry failed recipients
                </button>
              )}
            </div>
          )}

          {/* Metrics grid */}
          <div>
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-3">Engagement</h3>
            {!hasEvents && (
              <p className="text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-3">
                No delivery events recorded for this subject yet. Stats populate from Resend webhook events.
              </p>
            )}
            <div className="grid grid-cols-3 gap-3">
              {metrics.map((m) => (
                <div key={m.label} className="bg-slate-50 rounded-xl border border-slate-100 p-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${m.bg}`}>
                    <m.icon className={`w-4 h-4 ${m.color}`} />
                  </div>
                  <div className={`text-xl font-black ${m.color}`}>{m.value.toLocaleString()}</div>
                  <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                    {m.label}{m.sub ? ` · ${m.sub}` : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Audience */}
          <div className="bg-slate-50 rounded-xl p-4 space-y-3">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Audience</h3>
            <div className="flex items-center gap-3 text-sm">
              <Users className="w-4 h-4 text-slate-400" />
              <span className="text-slate-700 font-bold">{c.audience_size?.toLocaleString() || 0}</span>
              <span className="text-slate-400 text-xs">contacts targeted at send time</span>
            </div>
            {c.branches?.length > 0 && (
              <div className="flex items-start gap-3 text-sm">
                <GitBranch className="w-4 h-4 text-slate-400 mt-0.5" />
                <div className="flex flex-wrap gap-1">
                  {c.branches.map((b) => (
                    <span key={b} className="text-[10px] font-bold px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-600">{b}</span>
                  ))}
                </div>
              </div>
            )}
            {c.segments?.length > 0 && (
              <div className="flex items-start gap-3 text-sm">
                <Tag className="w-4 h-4 text-slate-400 mt-0.5" />
                <div className="flex flex-wrap gap-1">
                  {c.segments.map((sg) => (
                    <span key={sg} className="text-[10px] font-bold px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-600">{sg}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {(s.first_event_at || s.last_event_at) && (
            <div className="bg-slate-50 rounded-xl p-4 space-y-2">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Activity window</h3>
              <div className="text-xs text-slate-500">First event: <span className="font-bold text-slate-700">{fmtDate(s.first_event_at)}</span></div>
              <div className="text-xs text-slate-500">Last event: <span className="font-bold text-slate-700">{fmtDate(s.last_event_at)}</span></div>
            </div>
          )}

          <p className="text-[10px] text-slate-400 text-center flex items-center justify-center gap-1">
            <Mail className="w-3 h-3" /> Engagement matched by subject line via Resend delivery events
          </p>
        </div>
      </div>
    </>
  );
};

export default Campaigns;
