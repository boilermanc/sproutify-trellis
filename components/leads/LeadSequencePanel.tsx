import React, { useEffect, useState } from 'react';
import { Check, Clock3, Loader2, MailCheck, Pause, Play, Send, StopCircle } from 'lucide-react';
import { LeadEmailMessage, LeadEmailSequenceEnrollment, LeadSequenceMode } from '../../types';

interface Props {
  enrollment: LeadEmailSequenceEnrollment | null | undefined;
  loading: boolean;
  disabled?: boolean;
  onStart: (mode: LeadSequenceMode) => Promise<void>;
  onAction: (action: 'approve_next' | 'pause' | 'resume' | 'stop') => Promise<void>;
}

const formatWhen = (value: string | null) => value
  ? new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  : 'Waiting for approval';

const LeadSequencePanel: React.FC<Props> = ({ enrollment, loading, disabled, onStart, onAction }) => {
  const [mode, setMode] = useState<LeadSequenceMode>('approval');
  const [working, setWorking] = useState(false);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  useEffect(() => {
    setSelectedStepId(null);
  }, [enrollment?.id, enrollment?.next_step_number, enrollment?.status]);
  const run = async (action: () => Promise<void>) => {
    setWorking(true);
    try {
      await action();
      setSelectedStepId(null);
    } finally { setWorking(false); }
  };

  if (loading) return <section className="rounded-2xl border border-white/10 bg-white/[0.025] p-4"><Loader2 className="animate-spin text-cyan-300" size={18} /></section>;

  if (!enrollment) return (
    <section className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.04] p-4">
      <div className="mb-3 flex items-center gap-2"><MailCheck className="text-emerald-300" size={17} /><h3 className="text-[10px] font-black uppercase tracking-widest text-emerald-200">Farm follow-up sequence</h3></div>
      <p className="text-xs leading-5 text-slate-400">Four emails: introduction today, then follow-ups after 3, 5, and 7 days. Replies, suppression, qualification, won, and lost stop it automatically.</p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => setMode('approval')} className={`rounded-lg border px-3 py-2 text-[10px] font-black uppercase tracking-wider ${mode === 'approval' ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200' : 'border-white/10 text-slate-500'}`}>Approve each</button>
        <button type="button" onClick={() => setMode('automatic')} className={`rounded-lg border px-3 py-2 text-[10px] font-black uppercase tracking-wider ${mode === 'automatic' ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200' : 'border-white/10 text-slate-500'}`}>Automatic</button>
      </div>
      <button type="button" disabled={working || disabled} onClick={() => void run(() => onStart(mode))} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-[#0a2420] disabled:opacity-40">{working ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}Start sequence</button>
    </section>
  );

  const latestByStep = new Map<string, LeadEmailMessage>(
    enrollment.messages.filter(message => message.step_id).map(message => [message.step_id!, message]),
  );
  const active = ['active', 'awaiting_approval', 'paused'].includes(enrollment.status);
  const nextApprovalStep = enrollment.status === 'awaiting_approval'
    ? enrollment.steps.find(step => step.step_number === enrollment.next_step_number)
    : undefined;
  const approvalArmed = !!nextApprovalStep && selectedStepId === nextApprovalStep.id;
  return (
    <section className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.035] p-4">
      <div className="flex items-start justify-between gap-3">
        <div><h3 className="text-[10px] font-black uppercase tracking-widest text-cyan-200">{enrollment.sequence?.name || 'Lead sequence'}</h3><p className="mt-1 text-[10px] capitalize text-slate-500">{enrollment.mode} · {enrollment.status.replace(/_/g, ' ')}</p></div>
        {working && <Loader2 size={16} className="animate-spin text-cyan-300" />}
      </div>
      <div className="mt-4 space-y-2">
        {enrollment.steps.map(step => {
          const message = latestByStep.get(step.id);
          const isNext = step.step_number === enrollment.next_step_number && active;
          const selectable = enrollment.status === 'awaiting_approval' && isNext && !message;
          const selected = selectable && selectedStepId === step.id;
          return <button type="button" key={step.id} disabled={!selectable || working} onClick={() => setSelectedStepId(step.id)} className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${selected ? 'border-cyan-400 bg-cyan-50 ring-2 ring-cyan-100' : 'border-slate-200 bg-white'} ${selectable ? 'cursor-pointer hover:border-cyan-300 hover:bg-cyan-50/60' : 'cursor-default'}`}>
            <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-black ${message?.sent_at ? 'bg-emerald-100 text-emerald-700' : isNext ? 'bg-cyan-100 text-cyan-700' : 'bg-slate-100 text-slate-600'}`}>{message?.sent_at ? <Check size={12} /> : step.step_number}</span>
            <span className="min-w-0 flex-1"><span className="block truncate text-[11px] font-bold text-slate-700">{step.name}</span><span className="block text-[9px] text-slate-500">{message ? `${message.status}${message.resend_email_id ? ' · tracked' : ''}` : selectable ? (selected ? 'Selected · ready to approve' : 'Click to select this email') : isNext ? formatWhen(enrollment.next_run_at) : `+${step.delay_days} days`}</span></span>
          </button>;
        })}
      </div>
      {enrollment.exit_reason && <p className="mt-3 rounded-lg bg-white/[0.04] px-3 py-2 text-[10px] text-slate-400">Stopped: {enrollment.exit_reason.replace(/_/g, ' ')}</p>}
      {active && <div className="mt-3 flex flex-wrap gap-2">
        {enrollment.status === 'awaiting_approval' && <button type="button" disabled={working || !approvalArmed} onClick={() => void run(() => onAction('approve_next'))} className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-400 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-[#071b25] disabled:cursor-not-allowed disabled:opacity-40"><Send size={12} />Approve & send</button>}
        {enrollment.status === 'active' && <button type="button" disabled={working} onClick={() => void run(() => onAction('pause'))} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-slate-300"><Pause size={12} />Pause</button>}
        {enrollment.status === 'paused' && <button type="button" disabled={working} onClick={() => void run(() => onAction('resume'))} className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/30 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-cyan-300"><Clock3 size={12} />Resume</button>}
        <button type="button" disabled={working} onClick={() => void run(() => onAction('stop'))} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-400/20 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-rose-300"><StopCircle size={12} />Stop</button>
      </div>}
    </section>
  );
};

export default LeadSequencePanel;
