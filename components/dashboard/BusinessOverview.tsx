import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, Loader2, Users, WalletCards, X } from 'lucide-react';
import { Branch, BranchContext, SpokeConnection, ViewState } from '../../types';
import { NormalizedOrder } from '../../spokeConnector';
import { fetchBusinessOverview, BusinessMetric, BusinessOverviewResult } from '../../services/businessOverviewService';
import { TimeWindow } from './types';
import { rankBusinessActions } from '../../services/jevActionService';

interface Props {
  branches: Branch[];
  branchContext?: BranchContext;
  spokeConnections: SpokeConnection[];
  orders: NormalizedOrder[];
  window: TimeWindow;
  refreshKey: number;
  onViewChange?: (view: ViewState) => void;
}

const stateLabel: Record<BusinessMetric['state'], string> = {
  available: 'Verified', partial: 'Partial coverage', unconnected: 'Not connected', not_applicable: 'Not applicable', error: 'Source error',
};

const stateStyle: Record<BusinessMetric['state'], string> = {
  available: 'bg-emerald-50 text-emerald-700', partial: 'bg-amber-50 text-amber-700',
  unconnected: 'bg-slate-100 text-slate-600', not_applicable: 'bg-slate-100 text-slate-500', error: 'bg-rose-50 text-rose-700',
};

const metricIcon = { registrations: Users, paying: WalletCards, expired: AlertTriangle, ending: Clock3 };

const BusinessOverview: React.FC<Props> = ({ branches, branchContext, spokeConnections, orders, window, refreshKey, onViewChange }) => {
  const [result, setResult] = useState<BusinessOverviewResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<BusinessMetric | null>(null);
  const [rankedActionIds, setRankedActionIds] = useState<string[]>([]);
  const scopeKey = branchContext?.activeBranchSlugs.join('|') || 'all';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchBusinessOverview({ branches, branchContext, spokeConnections, orders, window })
      .then(data => { if (!cancelled) setResult(data); })
      .catch(() => { if (!cancelled) setResult(null); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [branches, scopeKey, spokeConnections, orders, window, refreshKey]);

  const actions = useMemo(() => {
    if (!result) return [];
    const registrations = result.metrics.find(metric => metric.key === 'registrations');
    return [
      registrations?.value != null ? { id: 'review-registrations',
        title: 'Review this week’s verified registrations', detail: `${registrations.value.toLocaleString()} verified signup${registrations.value === 1 ? '' : 's'} are ready to inspect in Product Analytics.`, owner: 'Sheree', effort: '15 min', view: 'reports' as ViewState,
      } : null,
      { id: 'verify-payment-source', title: 'Verify the next payment source', detail: 'Confirm first-payment, renewal, refund, and test-account rules so another branch can enter the paying-customer total.', owner: 'Clint', effort: '30 min', view: 'branches' as ViewState },
      { id: 'connect-trial-lifecycle', title: 'Connect authoritative trial lifecycle data', detail: 'Map trial status, scheduled end, grace, extension, cancellation, and conversion before follow-up actions are enabled.', owner: 'Clint', effort: '45 min', view: 'settings' as ViewState },
    ].filter(Boolean).slice(0, 3) as Array<{ id: string; title: string; detail: string; owner: string; effort: string; view: ViewState }>;
  }, [result]);

  useEffect(() => {
    let cancelled = false;
    setRankedActionIds([]);
    rankBusinessActions(actions.map(({ id, title, detail, owner, effort }) => ({ id, title, detail, owner, effort })))
      .then(ids => { if (!cancelled) setRankedActionIds(ids); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [actions]);

  const displayedActions = useMemo(() => {
    if (!rankedActionIds.length) return actions;
    const rank = new Map<string, number>(rankedActionIds.map((id, index) => [id, index]));
    return [...actions].sort((a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99));
  }, [actions, rankedActionIds]);

  return (
    <section className="mb-[18px] border border-[#DCE3E8] bg-white p-4 sm:p-6" aria-labelledby="business-overview-title">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#0B6B4B]">Business overview</p>
          <h1 id="business-overview-title" className="mt-1 text-2xl font-black tracking-[-0.03em] text-[#0F172A]">Your business</h1>
          <p className="mt-1 text-xs text-[#64748B]">{result?.rangeLabel || (window === '30d' ? 'Last 30 days' : 'Last 7 days')} · America/New_York</p>
        </div>
        <div className="text-left text-[10px] font-semibold text-[#64748B] sm:text-right">
          {loading ? <span className="inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" />Updating sources…</span> : result ? `Updated ${new Date(result.refreshedAt).toLocaleString()}` : 'Business sources unavailable'}
          {result?.errors.map(error => <p key={error} className="mt-1 text-amber-700">{error}</p>)}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {(result?.metrics || []).map(metric => {
          const Icon = metricIcon[metric.key];
          return <button key={metric.key} type="button" onClick={() => setSelected(metric)} className="min-h-[150px] border border-[#E5E7EB] p-4 text-left transition hover:border-[#94A3B8] hover:bg-[#F8FAFC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0B6B4B]">
            <div className="flex items-start justify-between gap-2"><Icon size={18} className="text-[#0B6B4B]" /><span className={`rounded-full px-2 py-1 text-[8px] font-black uppercase tracking-wider ${stateStyle[metric.state]}`}>{stateLabel[metric.state]}</span></div>
            <p className="mt-5 text-[11px] font-black uppercase tracking-[0.09em] text-[#64748B]">{metric.label}</p>
            <p className="mt-1 text-3xl font-black tracking-[-0.04em] text-[#0F172A]">{loading ? '…' : metric.value == null ? '—' : metric.value.toLocaleString()}</p>
            <p className="mt-2 text-[10px] font-semibold text-[#64748B]">{metric.covered}/{metric.eligible} branches verified · View details</p>
          </button>;
        })}
        {loading && !result && Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-[150px] animate-pulse bg-slate-100" />)}
      </div>

      <div className="mt-6 border-t border-[#E5E7EB] pt-5">
        <div className="mb-3 flex items-center justify-between gap-3"><div><h2 className="text-base font-black text-[#0F172A]">What needs your attention</h2><p className="text-[11px] text-[#64748B]">Prepared work within a two-hour combined weekly budget</p></div><span className="rounded-full bg-[#ECFDF5] px-3 py-1 text-[10px] font-black text-[#047857]">≤ 2 hours</span></div>
        <div className="grid gap-2 lg:grid-cols-3">
          {displayedActions.map((action, index) => <div key={action.title} className="flex min-h-[124px] flex-col border border-[#E5E7EB] p-4">
            <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-wider text-[#64748B]"><span>{index + 1}</span><span>{action.owner}</span><span>·</span><span>{action.effort}</span></div>
            <p className="mt-2 text-sm font-black text-[#0F172A]">{action.title}</p><p className="mt-1 flex-1 text-[11px] leading-relaxed text-[#64748B]">{action.detail}</p>
            <button type="button" onClick={() => onViewChange?.(action.view)} className="mt-3 inline-flex items-center gap-1 self-start text-[11px] font-black text-[#0B6B4B]">Open <ArrowRight size={12} /></button>
          </div>)}
        </div>
      </div>

      {selected && <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/35" role="dialog" aria-modal="true" aria-label={`${selected.label} details`} onMouseDown={event => { if (event.target === event.currentTarget) setSelected(null); }}>
        <div className="h-full w-full max-w-xl overflow-y-auto bg-white p-5 shadow-2xl sm:p-7">
          <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-widest text-[#0B6B4B]">Metric details</p><h2 className="mt-1 text-2xl font-black text-[#0F172A]">{selected.label}</h2><p className="mt-2 text-sm leading-relaxed text-[#64748B]">{selected.explanation}</p></div><button type="button" onClick={() => setSelected(null)} className="p-2 text-[#64748B]" aria-label="Close details"><X size={20} /></button></div>
          <div className="mt-6 space-y-3">{selected.details.map(detail => <div key={detail.branchId} className="border border-[#E5E7EB] p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-black text-[#0F172A]">{detail.branchName}</p><p className="mt-1 text-[10px] font-semibold text-[#64748B]">{detail.source}</p></div><div className="text-right"><p className="text-xl font-black text-[#0F172A]">{detail.value == null ? '—' : detail.value.toLocaleString()}</p><span className={`inline-block rounded-full px-2 py-1 text-[8px] font-black uppercase ${stateStyle[detail.state]}`}>{stateLabel[detail.state]}</span></div></div><p className="mt-3 text-xs leading-relaxed text-[#64748B]">{detail.reason}</p>{detail.refreshedAt && <p className="mt-2 text-[9px] text-[#94A3B8]">Source refreshed {new Date(detail.refreshedAt).toLocaleString()}</p>}</div>)}</div>
          <div className="mt-6 flex items-start gap-2 bg-[#F8FAFC] p-4 text-xs leading-relaxed text-[#475569]"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-[#0B6B4B]" />A zero is shown only when a connected source successfully reports no matching records. Missing or uncertain coverage remains an em dash.</div>
        </div>
      </div>}
    </section>
  );
};

export default BusinessOverview;
