import React, { useEffect, useState } from 'react';
import { Clock3, Eye, Loader2, MailCheck, Pause, Play, Send, StopCircle, X } from 'lucide-react';
import { LeadEmailMessage, LeadEmailSequenceEnrollment, LeadEmailSequenceStep, LeadSequenceMode } from '../../types';
import { renderLeadComplianceFooter, renderLeadSequenceHtml } from '../../supabase/functions/_shared/lead-sequence-template';

interface Props {
  enrollment: LeadEmailSequenceEnrollment | null | undefined;
  loading: boolean;
  disabled?: boolean;
  previewFirstName?: string | null;
  previewRecipientEmail?: string | null;
  previewScope?: string | null;
  onStart: (mode: LeadSequenceMode) => Promise<void>;
  onAction: (action: 'approve_next' | 'pause' | 'resume' | 'stop', stepNumber?: number) => Promise<void>;
}

const formatWhen = (value: string | null) => value
  ? new Date(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  : 'Waiting for approval';

const HUB_URL = ((import.meta as any).env?.VITE_SUPABASE_URL || 'https://horvjqqifgrzxesuxtfm.supabase.co').replace(/\/$/, '');

const LeadSequencePanel: React.FC<Props> = ({ enrollment, loading, disabled, previewFirstName, previewRecipientEmail, previewScope, onStart, onAction }) => {
  const [mode, setMode] = useState<LeadSequenceMode>('approval');
  const [referralConfirmed, setReferralConfirmed] = useState(false);
  const [working, setWorking] = useState(false);
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);
  const [previewStep, setPreviewStep] = useState<LeadEmailSequenceStep | null>(null);
  useEffect(() => {
    setSelectedStepId(null);
    setPreviewStep(null);
  }, [enrollment?.id, enrollment?.next_step_number, enrollment?.status]);
  useEffect(() => {
    if (!previewStep) return undefined;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPreviewStep(null);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [previewStep]);
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
      <p className="text-xs leading-5 text-slate-400">Create the sequence first, then choose any unsent email. Nothing sends until you select and approve an email. Replies, suppression, qualification, won, and lost stop it automatically.</p>
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => setMode('approval')} className={`rounded-lg border px-3 py-2 text-[10px] font-black uppercase tracking-wider ${mode === 'approval' ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200' : 'border-white/10 text-slate-500'}`}>Approve each</button>
        <button type="button" onClick={() => setMode('automatic')} className={`rounded-lg border px-3 py-2 text-[10px] font-black uppercase tracking-wider ${mode === 'automatic' ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-200' : 'border-white/10 text-slate-500'}`}>Automatic</button>
      </div>
      <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl border border-white/15 bg-slate-950/35 px-3 py-2.5 text-[10px] font-bold leading-4 text-white">
        <input type="checkbox" checked={referralConfirmed} onChange={event => setReferralConfirmed(event.target.checked)} className="mt-0.5 h-4 w-4 accent-emerald-400" />
        <span>I confirmed this person belongs on the Tower Farm referral list.</span>
      </label>
      <button type="button" disabled={working || disabled || !referralConfirmed} onClick={() => void run(() => onStart(mode))} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-400 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-[#0a2420] disabled:cursor-not-allowed disabled:opacity-40">{working ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}Create sequence & choose email</button>
    </section>
  );

  const latestByStep = new Map<string, LeadEmailMessage>(
    enrollment.messages.filter(message => message.step_id).map(message => [message.step_id!, message]),
  );
  const active = ['active', 'awaiting_approval', 'paused'].includes(enrollment.status);
  const selectedApprovalStep = enrollment.status === 'awaiting_approval'
    ? enrollment.steps.find(step => step.id === selectedStepId)
    : undefined;
  const approvalArmed = !!selectedApprovalStep;
  const previewEmail = previewRecipientEmail || 'lead@example.com';
  const previewHtml = previewStep
    ? renderLeadSequenceHtml(
      previewStep.template_key,
      previewFirstName || 'there',
      renderLeadComplianceFooter(previewEmail, previewScope || 'sproutify-farm', HUB_URL),
    )
    : '';
  return (
    <>
    <section className="rounded-2xl border border-cyan-400/20 bg-cyan-400/[0.035] p-4">
      <div className="flex items-start justify-between gap-3">
        <div><h3 className="text-[10px] font-black uppercase tracking-widest text-cyan-200">{enrollment.sequence?.name || 'Lead sequence'}</h3><p className="mt-1 text-[10px] capitalize text-slate-500">{enrollment.mode} · {enrollment.status.replace(/_/g, ' ')}</p></div>
        {working && <Loader2 size={16} className="animate-spin text-cyan-300" />}
      </div>
      {enrollment.status === 'awaiting_approval' && <p className="mt-3 rounded-lg border border-cyan-300/20 bg-cyan-300/[0.07] px-3 py-2 text-[10px] font-bold text-cyan-100">Click anywhere on an unsent email card to select it. Click its number only to preview.</p>}
      <div className="mt-4 space-y-2">
        {enrollment.steps.map(step => {
          const message = latestByStep.get(step.id);
          const isNext = step.step_number === enrollment.next_step_number && active;
          const selectable = enrollment.status === 'awaiting_approval' && (!message || message.status === 'failed');
          const selected = selectable && selectedStepId === step.id;
          return <div key={step.id} onClick={() => { if (selectable && !working) setSelectedStepId(step.id); }} className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${selected ? 'border-cyan-400 bg-cyan-50 ring-2 ring-cyan-100' : 'border-slate-200 bg-white'} ${selectable ? 'cursor-pointer hover:border-cyan-300 hover:bg-cyan-50/60' : ''}`}>
            <button type="button" onClick={event => { event.stopPropagation(); setPreviewStep(step); }} aria-label={`Preview email ${step.step_number}: ${step.name}`} title={`Preview email ${step.step_number}`} className={`group relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[9px] font-black transition hover:scale-105 hover:ring-2 hover:ring-cyan-200 ${message?.sent_at ? 'bg-emerald-100 text-emerald-700' : isNext ? 'bg-cyan-100 text-cyan-700' : 'bg-slate-100 text-slate-600'}`}>
              {step.step_number}
              <Eye size={9} className="absolute -bottom-1 -right-1 rounded-full bg-white text-cyan-600 opacity-0 transition group-hover:opacity-100" />
            </button>
            <button type="button" disabled={!selectable || working} onClick={() => setSelectedStepId(step.id)} className={`min-w-0 flex-1 text-left ${selectable ? 'cursor-pointer' : 'cursor-default'}`}>
              <span className="block truncate text-[11px] font-bold text-slate-700">{step.name}</span>
              <span className="block text-[9px] text-slate-500">{message && message.status !== 'failed' ? `${message.status}${message.resend_email_id ? ' · tracked' : ''} · click number to preview` : selectable ? (selected ? 'Selected · ready to approve' : `${message?.status === 'failed' ? 'Failed · ' : ''}Click here to select · click number to preview`) : isNext ? `${formatWhen(enrollment.next_run_at)} · click number to preview` : `+${step.delay_days} days · click number to preview`}</span>
            </button>
          </div>;
        })}
      </div>
      {enrollment.exit_reason && <p className="mt-3 rounded-lg border border-rose-300/20 bg-rose-300/[0.07] px-3 py-2 text-[10px] font-bold text-rose-100">Sending locked: {enrollment.exit_reason.replace(/^email_/, '').replace(/_/g, ' ')}.</p>}
      {active && <div className="mt-3 flex flex-wrap gap-2">
        {enrollment.status === 'awaiting_approval' && <button type="button" disabled={working || !approvalArmed} onClick={() => selectedApprovalStep && void run(() => onAction('approve_next', selectedApprovalStep.step_number))} className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-400 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-[#071b25] disabled:cursor-not-allowed disabled:opacity-40"><Send size={12} />Approve & send{selectedApprovalStep ? ` email ${selectedApprovalStep.step_number}` : ''}</button>}
        {enrollment.status === 'active' && <button type="button" disabled={working} onClick={() => void run(() => onAction('pause'))} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-slate-300"><Pause size={12} />Pause</button>}
        {enrollment.status === 'paused' && <button type="button" disabled={working} onClick={() => void run(() => onAction('resume'))} className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/30 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-cyan-300"><Clock3 size={12} />Resume</button>}
        <button type="button" disabled={working} onClick={() => void run(() => onAction('stop'))} className="inline-flex items-center gap-1.5 rounded-lg border border-rose-400/20 px-3 py-2 text-[9px] font-black uppercase tracking-wider text-rose-300"><StopCircle size={12} />Stop</button>
      </div>}
    </section>
    {previewStep && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`Email ${previewStep.step_number} preview`} onMouseDown={event => { if (event.target === event.currentTarget) setPreviewStep(null); }}>
      <div className="flex h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-[#10142E] shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 py-4">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-cyan-300">Email {previewStep.step_number} · {previewStep.name}</p>
            <h3 className="mt-1 text-base font-black text-white">{previewStep.subject_template}</h3>
            <p className="mt-1 text-[10px] text-slate-400">Previewed for {previewFirstName || 'there'} · {previewEmail}</p>
          </div>
          <button type="button" onClick={() => setPreviewStep(null)} className="rounded-xl border border-white/10 p-2 text-slate-400 transition hover:bg-white/10 hover:text-white" aria-label="Close email preview"><X size={18} /></button>
        </div>
        <div className="min-h-0 flex-1 bg-slate-200 p-3 sm:p-5">
          <iframe title={`Email ${previewStep.step_number}: ${previewStep.name}`} srcDoc={previewHtml} sandbox="allow-popups" className="h-full w-full rounded-xl border-0 bg-white shadow-inner" />
        </div>
      </div>
    </div>}
    </>
  );
};

export default LeadSequencePanel;
