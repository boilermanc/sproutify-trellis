import React, { useState } from 'react';
import { ChevronDown, ChevronRight, CircleDollarSign, GripVertical, Loader2 } from 'lucide-react';
import { Lead } from '../../types';

export function parseFarmOrOrg(notes?: string | null): string {
  if (!notes) return '';
  const preferredLabels = ['farm name', 'farm', 'organization', 'organisation', 'org', 'school', 'company'];
  const pairs = notes.split('|').map(part => part.trim()).map(part => {
    const separator = part.indexOf(':');
    return separator > 0
      ? { label: part.slice(0, separator).trim().toLowerCase(), value: part.slice(separator + 1).trim() }
      : null;
  }).filter((pair): pair is { label: string; value: string } => Boolean(pair?.value));
  for (const label of preferredLabels) {
    const match = pairs.find(pair => pair.label === label);
    if (match) return match.value;
  }
  return '';
}

export function daysSince(value: string, now = Date.now()): number {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return 0;
  return Math.max(0, Math.floor((now - timestamp) / 86400000));
}

const leadName = (lead: Lead) => [lead.profile?.first_name, lead.profile?.last_name].filter(Boolean).join(' ') || lead.profile?.email || 'Unknown lead';

interface LeadBoardProps {
  stages: string[];
  leads: Lead[];
  stageDates: Record<string, string>;
  pendingLeadId: string | null;
  onMove: (lead: Lead, stage: string) => Promise<void>;
}

const LeadBoard: React.FC<LeadBoardProps> = ({ stages, leads, stageDates, pendingLeadId, onMove }) => {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set(['won', 'lost']));
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);

  const toggleCollapsed = (stage: string) => setCollapsed(current => {
    const next = new Set(current);
    if (next.has(stage)) next.delete(stage); else next.add(stage);
    return next;
  });

  return (
    <div className="overflow-x-auto pb-3">
      <div className="flex min-w-max gap-4">
        {stages.map(stage => {
          const stageLeads = leads.filter(lead => lead.stage === stage);
          const isCollapsed = collapsed.has(stage);
          return (
            <section
              key={stage}
              className={`w-72 shrink-0 rounded-[1.5rem] border bg-[#10142E] transition ${dragOverStage === stage ? 'border-cyan-400/50 bg-cyan-400/[0.04]' : 'border-white/10'}`}
              onDragOver={event => { event.preventDefault(); setDragOverStage(stage); }}
              onDragLeave={() => setDragOverStage(current => current === stage ? null : current)}
              onDrop={event => {
                event.preventDefault();
                setDragOverStage(null);
                const leadId = event.dataTransfer.getData('text/lead-id');
                const lead = leads.find(item => item.id === leadId);
                if (lead && lead.stage !== stage) void onMove(lead, stage);
              }}
            >
              <button type="button" onClick={() => toggleCollapsed(stage)} className="flex w-full items-center justify-between px-4 py-4 text-left" aria-expanded={!isCollapsed}>
                <span className="flex items-center gap-2"><span className="text-xs font-black uppercase tracking-wider text-white">{stage}</span><span className="rounded-full bg-white/[0.07] px-2 py-0.5 text-[9px] font-black text-slate-400">{stageLeads.length}</span></span>
                {isCollapsed ? <ChevronRight size={15} className="text-slate-500" /> : <ChevronDown size={15} className="text-slate-500" />}
              </button>
              {!isCollapsed && <div className="space-y-3 border-t border-white/[0.07] p-3">
                {stageLeads.map(lead => {
                  const org = parseFarmOrOrg(lead.notes);
                  const stageStart = stageDates[lead.id] || lead.created_at;
                  return (
                    <article key={lead.id} draggable={pendingLeadId !== lead.id} onDragStart={event => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/lead-id', lead.id); }} className="rounded-2xl border border-white/10 bg-[#0A0E27] p-4 shadow-lg shadow-slate-950/20">
                      <div className="flex items-start gap-2"><GripVertical className="mt-0.5 shrink-0 cursor-grab text-slate-700" size={15} /><div className="min-w-0 flex-1"><h4 className="truncate text-sm font-black text-white">{leadName(lead)}</h4>{org && <p className="mt-1 truncate text-[10px] text-cyan-300/70">{org}</p>}</div>{pendingLeadId === lead.id && <Loader2 className="animate-spin text-cyan-300" size={14} />}</div>
                      <div className="mt-4 flex items-center justify-between text-[10px] text-slate-500"><span className="flex items-center gap-1"><CircleDollarSign size={12} />{lead.estimated_value == null ? 'No estimate' : `$${lead.estimated_value.toLocaleString()}`}</span><span>{daysSince(stageStart)}d in stage</span></div>
                      <label className="mt-3 block"><span className="sr-only">Move {leadName(lead)} to stage</span><select value={lead.stage} onChange={event => { if (event.target.value !== lead.stage) void onMove(lead, event.target.value); }} disabled={pendingLeadId === lead.id} className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-2 py-2 text-[10px] font-bold capitalize text-slate-300 outline-none focus:border-cyan-400/40 disabled:opacity-40">{stages.map(option => <option key={option} value={option}>{option}</option>)}</select></label>
                    </article>
                  );
                })}
                {stageLeads.length === 0 && <div className="rounded-xl border border-dashed border-white/10 py-8 text-center text-[10px] text-slate-600">Drop a lead here</div>}
              </div>}
            </section>
          );
        })}
      </div>
    </div>
  );
};

export default LeadBoard;
