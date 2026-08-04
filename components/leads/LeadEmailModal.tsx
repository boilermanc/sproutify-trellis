import React, { useEffect, useState } from 'react';
import { AlertTriangle, Loader2, Mail, ShieldAlert } from 'lucide-react';
import { Lead, LeadEmailEligibility } from '../../types';
import CrmModal from './CrmModal';

interface LeadEmailModalProps {
  lead: Lead;
  eligibility: LeadEmailEligibility | null;
  checkingEligibility: boolean;
  pending: boolean;
  eligibilityError: string;
  onClose: () => void;
  onSubmit: (input: { subject: string; body: string }) => Promise<void>;
}

const LeadEmailModal: React.FC<LeadEmailModalProps> = ({
  lead,
  eligibility,
  checkingEligibility,
  pending,
  eligibilityError,
  onClose,
  onSubmit,
}) => {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  useEffect(() => { setSubject(''); setBody(''); }, [lead.id]);

  const blocked = Boolean(eligibility?.hardBlocked) || Boolean(eligibilityError);
  const valid = subject.trim().length > 0 && body.trim().length > 0 && !blocked && !checkingEligibility;

  return (
    <CrmModal title="Send Email" subtitle="One-to-one inquiry correspondence" icon={Mail} pending={pending} onClose={onClose}>
      <form className="space-y-5 p-6" onSubmit={event => { event.preventDefault(); if (valid) void onSubmit({ subject: subject.trim(), body: body.trim() }); }}>
        {checkingEligibility && <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-xs text-slate-400"><Loader2 className="animate-spin text-cyan-300" size={15} />Checking suppression and consent status…</div>}
        {eligibilityError && <div className="flex gap-3 rounded-xl border border-rose-400/25 bg-rose-400/[0.06] p-4 text-xs leading-5 text-rose-200"><ShieldAlert className="shrink-0" size={18} /><span><strong className="block text-white">Email eligibility could not be verified</strong>{eligibilityError} Sending is disabled.</span></div>}
        {eligibility?.hardBlocked && <div className="flex gap-3 rounded-xl border border-rose-400/25 bg-rose-400/[0.06] p-4 text-xs leading-5 text-rose-200"><ShieldAlert className="shrink-0" size={18} /><span><strong className="block text-white">Sending blocked</strong>This address has a {eligibility.hardBlockReasons.join(' and ')} suppression. Resolve the suppression outside this screen before contacting it.</span></div>}
        {eligibility?.marketingUnsubscribed && !eligibility.hardBlocked && <div className="flex gap-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] p-4 text-xs leading-5 text-amber-200"><AlertTriangle className="shrink-0" size={18} /><span>This contact has unsubscribed from marketing emails; keep this strictly about their inquiry.</span></div>}
        <label className="block space-y-2 text-xs font-bold text-slate-300">To<input value={lead.profile?.email || ''} readOnly className="w-full cursor-not-allowed rounded-xl border border-white/10 bg-white/[0.025] p-3 text-slate-400 outline-none" /></label>
        <label className="block space-y-2 text-xs font-bold text-slate-300">Subject *<input autoFocus value={subject} onChange={event => setSubject(event.target.value)} disabled={blocked} className="w-full rounded-xl border border-white/10 bg-[#0A0E27] p-3 text-white outline-none focus:border-cyan-400/50 disabled:opacity-40" /></label>
        <label className="block space-y-2 text-xs font-bold text-slate-300">Message *<textarea rows={9} value={body} onChange={event => setBody(event.target.value)} disabled={blocked} className="w-full resize-y rounded-xl border border-white/10 bg-[#0A0E27] p-3 text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/50 disabled:opacity-40" placeholder="Write a plain-text message about this inquiry…" /></label>
        <div className="flex justify-end gap-3 border-t border-white/10 pt-5"><button type="button" onClick={onClose} disabled={pending} className="rounded-xl px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-400 hover:bg-white/5 disabled:opacity-40">Cancel</button><button type="submit" disabled={pending || !valid} className="flex items-center gap-2 rounded-xl bg-[#00D9FF] px-5 py-3 text-xs font-black uppercase tracking-wider text-[#07101D] disabled:cursor-not-allowed disabled:opacity-40">{pending ? <Loader2 className="animate-spin" size={16} /> : <Mail size={16} />} Send email</button></div>
      </form>
    </CrmModal>
  );
};

export default LeadEmailModal;
