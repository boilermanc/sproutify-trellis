import React from 'react';
import { Loader2, Recycle, XCircle } from 'lucide-react';

interface LeadBulkBarProps {
  count: number;
  stages: string[];
  targetStage: string;
  pending: boolean;
  progress: { completed: number; total: number } | null;
  failures: Array<{ email: string; reason: string }>;
  onTargetStageChange: (stage: string) => void;
  onApplyStage: () => void;
  onMarkLost: () => void;
  onRecycle: () => void;
  onClear: () => void;
}

const LeadBulkBar: React.FC<LeadBulkBarProps> = ({ count, stages, targetStage, pending, progress, failures, onTargetStageChange, onApplyStage, onMarkLost, onRecycle, onClear }) => (
  <section className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.055] p-4">
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-xs font-black text-white">{count} selected</span>
      <select value={targetStage} onChange={event => onTargetStageChange(event.target.value)} disabled={pending} className="rounded-xl border border-white/10 bg-[#0A0E27] px-3 py-2 text-xs font-bold capitalize text-slate-200 outline-none disabled:opacity-40">{stages.map(stage => <option key={stage} value={stage}>{stage}</option>)}</select>
      <button type="button" onClick={onApplyStage} disabled={pending || !targetStage} className="rounded-xl bg-cyan-400 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-[#07101D] disabled:opacity-40">Apply stage</button>
      <button type="button" onClick={onMarkLost} disabled={pending} className="flex items-center gap-1.5 rounded-xl border border-slate-400/20 bg-slate-400/[0.06] px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-300 disabled:opacity-40"><XCircle size={13} />Mark lost</button>
      <button type="button" onClick={onRecycle} disabled={pending} className="flex items-center gap-1.5 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-[10px] font-black uppercase tracking-wider text-amber-300 disabled:opacity-40"><Recycle size={13} />Recycle</button>
      <button type="button" onClick={onClear} disabled={pending} className="ml-auto text-[10px] font-black uppercase tracking-wider text-slate-500 hover:text-white disabled:opacity-40">Clear</button>
      {pending && progress && <span className="flex items-center gap-2 text-[10px] font-bold text-cyan-300"><Loader2 className="animate-spin" size={13} />{progress.completed}/{progress.total}</span>}
    </div>
    {failures.length > 0 && <div className="mt-3 rounded-xl border border-rose-400/20 bg-rose-400/[0.05] p-3"><p className="text-[9px] font-black uppercase tracking-widest text-rose-300">{failures.length} update{failures.length === 1 ? '' : 's'} failed</p><div className="mt-2 space-y-1">{failures.map((failure, index) => <p key={`${failure.email}-${index}`} className="text-[10px] text-rose-200"><span className="font-bold">{failure.email}</span> · {failure.reason}</p>)}</div></div>}
  </section>
);

export default LeadBulkBar;
