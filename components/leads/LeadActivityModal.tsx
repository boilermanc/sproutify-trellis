import React, { useEffect, useState } from 'react';
import { CalendarDays, Loader2, Phone, StickyNote } from 'lucide-react';
import { Lead } from '../../types';
import CrmModal from './CrmModal';

export type QuickActivityKind = 'call' | 'note' | 'meeting';

export interface ActivitySubmission {
  type: 'lead_call' | 'lead_note' | 'lead_meeting';
  payload: Record<string, unknown>;
  nextActionAt?: string;
}

export function buildActivitySubmission(input: {
  kind: QuickActivityKind;
  outcome: string;
  summary: string;
  meetingDate: string;
  nextFollowUp: string;
}): ActivitySubmission {
  const nextActionAt = input.nextFollowUp ? `${input.nextFollowUp}T12:00:00.000Z` : undefined;
  if (input.kind === 'note') {
    return { type: 'lead_note', payload: { text: input.summary.trim() } };
  }
  if (input.kind === 'meeting') {
    return {
      type: 'lead_meeting',
      payload: { meeting_at: input.meetingDate, summary: input.summary.trim() },
      nextActionAt,
    };
  }
  return {
    type: 'lead_call',
    payload: { outcome: input.outcome, summary: input.summary.trim() },
    nextActionAt,
  };
}

const CONFIG = {
  call: { title: 'Log Call', icon: Phone },
  note: { title: 'Log Note', icon: StickyNote },
  meeting: { title: 'Log Meeting', icon: CalendarDays },
};

interface LeadActivityModalProps {
  lead: Lead;
  kind: QuickActivityKind;
  pending: boolean;
  onClose: () => void;
  onSubmit: (submission: ActivitySubmission) => Promise<void>;
}

const LeadActivityModal: React.FC<LeadActivityModalProps> = ({ lead, kind, pending, onClose, onSubmit }) => {
  const [outcome, setOutcome] = useState('connected');
  const [summary, setSummary] = useState('');
  const [meetingDate, setMeetingDate] = useState('');
  const [nextFollowUp, setNextFollowUp] = useState('');
  const config = CONFIG[kind];

  useEffect(() => {
    setOutcome('connected');
    setSummary('');
    setMeetingDate('');
    setNextFollowUp('');
  }, [kind, lead.id]);

  const valid = summary.trim().length > 0 && (kind !== 'meeting' || Boolean(meetingDate));

  return (
    <CrmModal title={config.title} subtitle={lead.profile?.email || 'Lead activity'} icon={config.icon} pending={pending} onClose={onClose}>
      <form
        className="space-y-5 p-6"
        onSubmit={event => {
          event.preventDefault();
          if (valid) void onSubmit(buildActivitySubmission({ kind, outcome, summary, meetingDate, nextFollowUp }));
        }}
      >
        {kind === 'call' && <label className="block space-y-2 text-xs font-bold text-slate-300">Outcome<select autoFocus value={outcome} onChange={event => setOutcome(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0A0E27] p-3 text-white outline-none focus:border-cyan-400/50"><option value="connected">Connected</option><option value="voicemail">Voicemail</option><option value="no_answer">No answer</option></select></label>}
        {kind === 'meeting' && <label className="block space-y-2 text-xs font-bold text-slate-300">Meeting date *<input autoFocus type="date" value={meetingDate} onChange={event => setMeetingDate(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0A0E27] p-3 text-white outline-none focus:border-cyan-400/50" /></label>}
        <label className="block space-y-2 text-xs font-bold text-slate-300">{kind === 'note' ? 'Note *' : 'Summary *'}<textarea autoFocus={kind === 'note'} rows={5} value={summary} onChange={event => setSummary(event.target.value)} className="w-full resize-y rounded-xl border border-white/10 bg-[#0A0E27] p-3 text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/50" placeholder={kind === 'note' ? 'Add an internal note…' : 'What happened?'} /></label>
        {kind !== 'note' && <label className="block space-y-2 text-xs font-bold text-slate-300">Next follow-up<input type="date" value={nextFollowUp} onChange={event => setNextFollowUp(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0A0E27] p-3 text-white outline-none focus:border-cyan-400/50" /></label>}
        <div className="flex justify-end gap-3 border-t border-white/10 pt-5">
          <button type="button" onClick={onClose} disabled={pending} className="rounded-xl px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-400 hover:bg-white/5 disabled:opacity-40">Cancel</button>
          <button type="submit" disabled={pending || !valid} className="flex items-center gap-2 rounded-xl bg-[#00D9FF] px-5 py-3 text-xs font-black uppercase tracking-wider text-[#07101D] disabled:cursor-not-allowed disabled:opacity-40">{pending ? <Loader2 className="animate-spin" size={16} /> : React.createElement(config.icon, { size: 16 })} Save activity</button>
        </div>
      </form>
    </CrmModal>
  );
};

export default LeadActivityModal;
