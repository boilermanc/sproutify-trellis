import React, { useEffect, useState } from 'react';
import { CheckCircle2, FileText, Loader2 } from 'lucide-react';
import { Lead } from '../../types';
import CrmModal from './CrmModal';

export type QuoteStatus = 'sent' | 'accepted' | 'declined';

export function buildQuotePayload(input: {
  amount: string;
  description: string;
  status: QuoteStatus;
}): { amount: number; description: string; status: QuoteStatus } {
  return {
    amount: Number(input.amount),
    description: input.description.trim(),
    status: input.status,
  };
}

interface LeadQuoteModalProps {
  lead: Lead;
  pending: boolean;
  acceptedLogged: boolean;
  onClose: () => void;
  onSubmit: (payload: ReturnType<typeof buildQuotePayload>) => Promise<void>;
  onMarkWon: () => Promise<void>;
}

const LeadQuoteModal: React.FC<LeadQuoteModalProps> = ({ lead, pending, acceptedLogged, onClose, onSubmit, onMarkWon }) => {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<QuoteStatus>('sent');

  useEffect(() => {
    setAmount(lead.estimated_value != null ? String(lead.estimated_value) : '');
    setDescription('');
    setStatus('sent');
  }, [lead.id, lead.estimated_value]);

  const numericAmount = Number(amount);
  const valid = Number.isFinite(numericAmount) && numericAmount > 0 && description.trim().length > 0;

  return (
    <CrmModal title="Log Quote" subtitle={lead.profile?.email || 'Lead quote'} icon={FileText} pending={pending} onClose={onClose}>
      {acceptedLogged ? (
        <div className="space-y-5 p-6">
          <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] p-6 text-center">
            <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-400 text-[#07101D]"><CheckCircle2 size={22} /></span>
            <h3 className="text-lg font-black text-white">Accepted quote logged</h3>
            <p className="mt-2 text-sm text-slate-400">Would you like to move this lead to the won stage now?</p>
          </div>
          <div className="flex justify-end gap-3"><button type="button" onClick={onClose} disabled={pending} className="rounded-xl px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-400 hover:bg-white/5 disabled:opacity-40">Not yet</button><button type="button" onClick={() => void onMarkWon()} disabled={pending} className="flex items-center gap-2 rounded-xl bg-emerald-400 px-5 py-3 text-xs font-black uppercase tracking-wider text-[#07101D] disabled:opacity-40">{pending ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />} Mark won</button></div>
        </div>
      ) : (
        <form className="space-y-5 p-6" onSubmit={event => { event.preventDefault(); if (valid) void onSubmit(buildQuotePayload({ amount, description, status })); }}>
          <label className="block space-y-2 text-xs font-bold text-slate-300">Amount *<input autoFocus type="number" min="0.01" step="0.01" value={amount} onChange={event => setAmount(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0A0E27] p-3 text-white outline-none focus:border-cyan-400/50" /></label>
          <label className="block space-y-2 text-xs font-bold text-slate-300">Description *<textarea rows={5} value={description} onChange={event => setDescription(event.target.value)} className="w-full resize-y rounded-xl border border-white/10 bg-[#0A0E27] p-3 text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/50" placeholder="What does this quote cover?" /></label>
          <label className="block space-y-2 text-xs font-bold text-slate-300">Status<select value={status} onChange={event => setStatus(event.target.value as QuoteStatus)} className="w-full rounded-xl border border-white/10 bg-[#0A0E27] p-3 text-white outline-none focus:border-cyan-400/50"><option value="sent">Sent</option><option value="accepted">Accepted</option><option value="declined">Declined</option></select></label>
          <div className="flex justify-end gap-3 border-t border-white/10 pt-5"><button type="button" onClick={onClose} disabled={pending} className="rounded-xl px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-400 hover:bg-white/5 disabled:opacity-40">Cancel</button><button type="submit" disabled={pending || !valid} className="flex items-center gap-2 rounded-xl bg-[#00D9FF] px-5 py-3 text-xs font-black uppercase tracking-wider text-[#07101D] disabled:cursor-not-allowed disabled:opacity-40">{pending ? <Loader2 className="animate-spin" size={16} /> : <FileText size={16} />} Log quote</button></div>
        </form>
      )}
    </CrmModal>
  );
};

export default LeadQuoteModal;
