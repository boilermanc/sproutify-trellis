import React, { useEffect, useMemo, useState } from 'react';
import {
  Rocket, RefreshCw, Loader2, X, Calendar, Users, Mail, MailCheck, Eye,
  MousePointerClick, MailX, AlertTriangle, Send, Clock, ChevronRight, Tag, GitBranch, Pencil,
  Copy, Trash2, MailPlus, Ban,
} from 'lucide-react';
import { fetchCampaigns, Campaign, retryCampaign, fetchCampaignRecipientStats, CampaignRecipientStats, deleteCampaign, duplicateCampaign, fetchNonOpeners, resendToNonOpeners } from '../supabaseService';
import { fetchCampaignEmailStats, CampaignEmailStat, fetchCampaignUnsubscribedCount } from '../services/emailReportingService';
import { CampaignRecipientsModal } from '../components/CampaignRecipientsModal';
import { LinkClickSummaryModal } from '../components/LinkClickSummaryModal';
import { BranchContext } from '../types';

interface CampaignsProps {
  branchContext?: BranchContext;
  addToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
  onEditDraft?: (campaignId: string) => void;
  focusedCampaignId?: string | null;
  onFocusedCampaignOpened?: () => void;
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

// A campaign can be resent to its non-openers once the worker has actually sent
// it (so we have delivery/open events + a saved dispatch to reuse).
const canResend = (c: Campaign) => c.send_status === 'sent' || c.send_status === 'partial';

const emptyStat = (campaign: Campaign): CampaignEmailStat => ({
  campaign_id: campaign.id, campaign_name: campaign.name, campaign_subject: campaign.subject, branches: campaign.branches || [],
  sent: 0, delivered: 0, opened: 0, clicked: 0,
  bounced: 0, complained: 0, first_event_at: null, last_event_at: null,
});

const Campaigns: React.FC<CampaignsProps> = ({ branchContext, addToast, onEditDraft, focusedCampaignId, onFocusedCampaignOpened }) => {
  const [allCampaigns, setAllCampaigns] = useState<Campaign[]>([]);
  const [stats, setStats] = useState<CampaignEmailStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [resendTarget, setResendTarget] = useState<Campaign | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Honor the global Branch Scope picker (top bar). A campaign's `branches` are
  // stored as slugs, but older ones may hold display names — match either. A
  // campaign targeting no branch is treated as global and always shown.
  const campaigns = useMemo(() => {
    if (!branchContext || branchContext.isAllSelected) return allCampaigns;
    const activeBranches = branchContext.allBranches.filter(b =>
      branchContext.activeBranchSlugs.includes(b.slug)
    );
    const activeKeys = new Set<string>();
    for (const b of activeBranches) { activeKeys.add(b.slug); activeKeys.add(b.name); }
    return allCampaigns.filter(c =>
      !c.branches?.length || c.branches.some(b => activeKeys.has(b))
    );
  }, [allCampaigns, branchContext]);

  const load = async () => {
    setLoading(true);
    try {
      const [c, s] = await Promise.all([fetchCampaigns(), fetchCampaignEmailStats()]);
      setAllCampaigns(c);
      setStats(s);
    } catch (e) {
      console.error('Failed to load campaigns:', e);
      addToast?.('Failed to load campaigns.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!focusedCampaignId) return;
    const focusedCampaign = allCampaigns.find(campaign => campaign.id === focusedCampaignId);
    if (!focusedCampaign) return;
    setSelected(focusedCampaign);
    onFocusedCampaignOpened?.();
  }, [allCampaigns, focusedCampaignId, onFocusedCampaignOpened]);

  const handleDuplicate = async (c: Campaign) => {
    setBusyId(c.id);
    const { campaign, error } = await duplicateCampaign(c.id);
    setBusyId(null);
    if (campaign) { addToast?.(`Duplicated "${c.name}" as a draft.`, 'success'); load(); }
    else { addToast?.(`Couldn't duplicate: ${error}`, 'error'); }
  };

  const handleDelete = async (c: Campaign) => {
    if (!window.confirm(`Delete draft "${c.name}"? This can't be undone.`)) return;
    setBusyId(c.id);
    const { ok, error } = await deleteCampaign(c.id);
    setBusyId(null);
    if (ok) { addToast?.(`Deleted draft "${c.name}".`, 'success'); load(); }
    else { addToast?.(`Couldn't delete: ${error}`, 'error'); }
  };

  const statById = useMemo(() => {
    const m = new Map<string, CampaignEmailStat>();
    for (const s of stats) if (s.campaign_id) m.set(s.campaign_id, s);
    return m;
  }, [stats]);

  const statFor = (c: Campaign): CampaignEmailStat => statById.get(c.id) || emptyStat(c);

  const totals = useMemo(() => {
    const t = { sent: 0, delivered: 0, opened: 0, clicked: 0 };
    for (const c of campaigns) {
      const s = statById.get(c.id);
      if (s) { t.sent += s.sent; t.delivered += s.delivered; t.opened += s.opened; t.clicked += s.clicked; }
    }
    return t;
  }, [campaigns, statById]);

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
              {branchContext && !branchContext.isAllSelected
                ? `Scoped to ${branchContext.activeBranchSlugs.length} of ${branchContext.allBranches.length} branches · change in the top bar`
                : "Everything you've sent · engagement from Resend"}
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
            <p className="text-sm text-slate-400">Save a draft or launch a campaign from Campaign Builder and it will appear here.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {campaigns.map((c) => {
              const s = statFor(c);
              return (
                <div
                  key={c.id}
                  className="w-full px-6 py-5 hover:bg-slate-50/80 transition flex items-center gap-4 group"
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => c.status === 'draft' && onEditDraft ? onEditDraft(c.id) : setSelected(c)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); c.status === 'draft' && onEditDraft ? onEditDraft(c.id) : setSelected(c); } }}
                    className="flex-1 min-w-0 flex items-center gap-4 text-left cursor-pointer"
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
                    {c.status === 'draft' ? (
                      <div className="hidden sm:inline-flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-100 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-emerald-700 shrink-0">
                        <Pencil className="w-3.5 h-3.5" /> Continue Editing
                      </div>
                    ) : (
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
                    )}
                  </div>

                  {/* Row actions — resend to non-openers + duplicate any campaign; delete drafts only */}
                  <div className="flex items-center gap-1 shrink-0">
                    {canResend(c) && (
                      <button
                        type="button"
                        title="Resend to people who didn't open"
                        disabled={busyId === c.id}
                        onClick={(e) => { e.stopPropagation(); setResendTarget(c); }}
                        className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition disabled:opacity-40"
                      >
                        <MailPlus className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      title="Duplicate as a new draft"
                      disabled={busyId === c.id}
                      onClick={(e) => { e.stopPropagation(); handleDuplicate(c); }}
                      className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition disabled:opacity-40"
                    >
                      {busyId === c.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                    </button>
                    {c.status === 'draft' && (
                      <button
                        type="button"
                        title="Delete draft"
                        disabled={busyId === c.id}
                        onClick={(e) => { e.stopPropagation(); handleDelete(c); }}
                        className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition disabled:opacity-40"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                </div>
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
          onResend={(c) => { setSelected(null); setResendTarget(c); }}
        />
      )}

      {resendTarget && (
        <ResendModal
          campaign={resendTarget}
          onClose={() => setResendTarget(null)}
          addToast={addToast}
          onDone={load}
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
  onResend: (c: Campaign) => void;
}> = ({ campaign: c, stat: s, onClose, addToast, onChanged, onResend }) => {
  const [rstats, setRstats] = useState<CampaignRecipientStats | null>(null);
  const [unsubCount, setUnsubCount] = useState<number | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [showRecipients, setShowRecipients] = useState(false);
  const [showLinkClicks, setShowLinkClicks] = useState(false);
  const [showEmail, setShowEmail] = useState(false);

  useEffect(() => {
    let alive = true;
    if (c.send_status) {
      fetchCampaignRecipientStats(c.id).then((r) => { if (alive) setRstats(r); }).catch(() => {});
    }
    return () => { alive = false; };
  }, [c.id, c.send_status]);

  useEffect(() => {
    let alive = true;
    if (c.id) {
      fetchCampaignUnsubscribedCount(c.id, c.branches || []).then((n) => { if (alive) setUnsubCount(n); }).catch(() => {});
    }
    return () => { alive = false; };
  }, [c.id, c.branches]);

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
    { label: 'Clicked', value: s.clicked, sub: `${pct(s.clicked, s.delivered)}%`, icon: MousePointerClick, color: 'text-violet-600', bg: 'bg-violet-100', onClick: s.clicked > 0 ? () => setShowLinkClicks(true) : undefined },
    { label: 'Bounced', value: s.bounced, icon: MailX, color: 'text-red-600', bg: 'bg-red-100' },
    { label: 'Complained', value: s.complained, icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-100' },
    { label: 'Unsubscribed', value: unsubCount ?? 0, sub: s.delivered ? `${pct(unsubCount ?? 0, s.delivered)}%` : undefined, icon: Ban, color: 'text-slate-600', bg: 'bg-slate-200' },
  ];
  const hasEvents = s.sent + s.delivered + s.opened + s.clicked + s.bounced + s.complained > 0;
  // The exact HTML that was sent, with recipient tokens filled in for preview.
  const emailPreviewHtml = (c.dispatch?.html_template || '')
    .replace(/\{\{\s*first_name\s*\}\}/g, 'Friend')
    .replace(/\{\{\s*unsubscribe_url\s*\}\}/g, '#')
    .replace(/\{\{\s*email\s*\}\}/g, 'friend@example.com');

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

          {/* Email that went out */}
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Email sent</h3>
              {c.dispatch?.html_template && (
                <button onClick={() => setShowEmail((v) => !v)} className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-blue-600 hover:text-blue-700">
                  <Eye className="w-3.5 h-3.5" />{showEmail ? 'Hide' : 'Preview'}
                </button>
              )}
            </div>
            {c.dispatch?.from && (
              <div className="text-xs text-slate-500">From <span className="font-bold text-slate-700">{c.dispatch.from}</span></div>
            )}
            <div className="text-xs text-slate-500 break-words">Subject <span className="font-bold text-slate-700">{c.dispatch?.subject || c.subject || 'No subject'}</span></div>
            {c.dispatch?.preview_text && (
              <div className="text-xs text-slate-500 break-words">Preview text <span className="font-bold text-slate-700">{c.dispatch.preview_text}</span></div>
            )}
            {!c.dispatch?.html_template ? (
              <p className="text-[11px] italic text-slate-400">No saved email content — this campaign predates the durable outbox, or hasn't been sent yet.</p>
            ) : showEmail && (
              <iframe
                title="Email preview"
                sandbox=""
                className="w-full h-[26rem] rounded-lg border border-slate-200 bg-white"
                srcDoc={emailPreviewHtml}
              />
            )}
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
                No delivery events recorded for this campaign yet. Stats populate from accepted sends and Resend webhook events.
              </p>
            )}
            <div className="grid grid-cols-3 gap-3">
              {metrics.map((m) => {
                const Tile = m.onClick ? 'button' : 'div';
                return (
                  <Tile
                    key={m.label}
                    {...(m.onClick ? { type: 'button' as const, onClick: m.onClick, title: 'See which links were clicked, and who clicked them' } : {})}
                    className={`bg-slate-50 rounded-xl border border-slate-100 p-3 text-left w-full ${
                      m.onClick ? 'hover:border-violet-300 hover:bg-violet-50/40 transition cursor-pointer' : ''
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${m.bg}`}>
                      <m.icon className={`w-4 h-4 ${m.color}`} />
                    </div>
                    <div className={`text-xl font-black ${m.color}`}>{m.value.toLocaleString()}</div>
                    <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                      {m.label}{m.sub ? ` · ${m.sub}` : ''}
                    </div>
                    {m.onClick && (
                      <div className="text-[9px] font-black uppercase tracking-widest text-violet-500 mt-1 flex items-center gap-0.5">
                        Links <ChevronRight className="w-2.5 h-2.5" />
                      </div>
                    )}
                  </Tile>
                );
              })}
            </div>
            {hasEvents && (
              <button
                type="button"
                onClick={() => setShowRecipients(true)}
                className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition"
              >
                <Users className="w-4 h-4" />
                See who opened, clicked & complained
              </button>
            )}
            {canResend(c) && (
              <button
                type="button"
                onClick={() => onResend(c)}
                className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-700 transition"
              >
                <MailPlus className="w-4 h-4" />
                Resend to non-openers
              </button>
            )}
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
            <Mail className="w-3 h-3" /> Engagement matched by exact campaign ID via Resend delivery events
          </p>
        </div>
      </div>

      {showRecipients && c.subject && (
        <CampaignRecipientsModal campaignId={c.id} campaignSubject={c.subject} branches={c.branches || []} onClose={() => setShowRecipients(false)} />
      )}
      {showLinkClicks && c.subject && (
        <LinkClickSummaryModal
          campaignSubject={c.subject}
          campaignId={c.id}
          // We already hold the sent HTML here, so pass it and skip the by-subject
          // lookup the Reports panel has to do.
          sentHtml={c.dispatch?.html_template || ''}
          onClose={() => setShowLinkClicks(false)}
        />
      )}
    </>
  );
};

// ── Resend-to-non-openers modal ──────────────────────────────────────────────
// Computes who was sent the original but never opened it, then launches a
// follow-up campaign (same email, new subject) to exactly that audience.
const ResendModal: React.FC<{
  campaign: Campaign;
  onClose: () => void;
  addToast?: (m: string, t?: 'success' | 'error' | 'info') => void;
  onDone: () => void;
}> = ({ campaign: c, onClose, addToast, onDone }) => {
  const [loading, setLoading] = useState(true);
  const [recipients, setRecipients] = useState<Array<{ email: string; first_name: string; unsubscribe_token: string }>>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [subject, setSubject] = useState(`Reminder: ${c.subject || ''}`.trim());
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchNonOpeners(c.id, c.subject).then(({ recipients, error }) => {
      if (!alive) return;
      if (error) setLoadError(error);
      setRecipients(recipients);
      setLoading(false);
    });
    return () => { alive = false; };
  }, [c.id, c.subject]);

  const handleSend = async () => {
    if (!recipients.length || !subject.trim()) return;
    setSending(true);
    const { campaign, error } = await resendToNonOpeners(c.id, subject, recipients);
    setSending(false);
    if (campaign) {
      addToast?.(`Reminder queued to ${recipients.length.toLocaleString()} non-opener(s) — sending now.`, 'success');
      onDone();
      onClose();
    } else {
      addToast?.(`Couldn't send reminder: ${error}`, 'error');
    }
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[60]" onClick={onClose} />
      <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 pointer-events-none">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl pointer-events-auto overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-100 flex items-center justify-center shrink-0">
              <MailPlus className="w-5 h-5 text-blue-600" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-black text-slate-800">Resend to non-openers</h2>
              <p className="text-xs text-slate-400 truncate">{c.name}</p>
            </div>
          </div>

          <div className="p-6 space-y-5">
            {loading ? (
              <div className="flex items-center justify-center gap-2 text-slate-400 py-8">
                <Loader2 className="w-5 h-5 animate-spin" /> Finding who didn't open…
              </div>
            ) : (
              <>
                <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-center">
                  <div className="text-3xl font-black text-slate-800">{recipients.length.toLocaleString()}</div>
                  <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-1">
                    recipients who didn't open
                  </div>
                </div>
                {loadError && (
                  <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{loadError}</p>
                )}
                {recipients.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center">
                    Everyone who was sent this campaign has already opened it — or bounced/unsubscribed. Nothing to resend.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">New subject line</label>
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-200"
                      placeholder="Subject line"
                    />
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Same email, fresh subject. A different subject keeps this reminder's opens
                      separate from the original in your reports (and usually lifts opens).
                      Unsubscribes and bounces are re-checked at send time.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={loading || sending || recipients.length === 0 || !subject.trim()}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-blue-600 transition disabled:opacity-40"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Send reminder
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default Campaigns;
