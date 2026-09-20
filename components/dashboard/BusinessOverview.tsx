import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Loader2, Users, WalletCards, X } from 'lucide-react';
import { Branch, BranchContext, SpokeConnection } from '../../types';
import { NormalizedOrder } from '../../spokeConnector';
import { fetchBusinessOverview, BusinessMetric, BusinessOverviewResult } from '../../services/businessOverviewService';
import { TimeWindow } from './types';

interface Props {
  branches: Branch[];
  branchContext?: BranchContext;
  spokeConnections: SpokeConnection[];
  orders: NormalizedOrder[];
  window: TimeWindow;
  refreshKey: number;
  weeklyActions?: React.ReactNode;
  onResult?: (result: BusinessOverviewResult | null) => void;
}

const stateLabel: Record<BusinessMetric['state'], string> = {
  available: 'Verified', partial: 'Partial coverage', unconnected: 'Not connected', not_applicable: 'Not applicable', error: 'Source error',
};

const stateStyle: Record<BusinessMetric['state'], string> = {
  available: 'bg-emerald-50 text-emerald-700', partial: 'bg-amber-50 text-amber-700',
  unconnected: 'bg-slate-100 text-slate-600', not_applicable: 'bg-slate-100 text-slate-500', error: 'bg-rose-50 text-rose-700',
};

const metricIcon = { registrations: Users, paying: WalletCards, expired: AlertTriangle, ending: Clock3 };

const BusinessOverview: React.FC<Props> = ({ branches, branchContext, spokeConnections, orders, window, refreshKey, weeklyActions, onResult }) => {
  const [result, setResult] = useState<BusinessOverviewResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<BusinessMetric | null>(null);
  const scopeKey = branchContext?.activeBranchSlugs.join('|') || 'all';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    onResult?.(null);
    fetchBusinessOverview({ branches, branchContext, spokeConnections, orders, window })
      .then(data => { if (!cancelled) { setResult(data); onResult?.(data); } })
      .catch(() => { if (!cancelled) { setResult(null); onResult?.(null); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [branches, scopeKey, spokeConnections, orders, window, refreshKey]);

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

      <div className="mt-6 border-t border-[#E5E7EB] pt-5">{weeklyActions}</div>

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
