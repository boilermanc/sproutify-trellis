import React, { useState } from 'react';
import { CalendarClock, CheckCircle2, ChevronDown, Clock3, X } from 'lucide-react';
import { TrellisUser, ViewState } from '../../types';
import { WeeklyActionCandidate } from './types';

interface Props {
  actions: WeeklyActionCandidate[];
  users: TrellisUser[];
  scopeLabel: string;
  refreshedAt: string | null;
  budgetMinutes: number;
  isLoading: boolean;
  onOpen: (action: WeeklyActionCandidate) => void;
  onComplete: (action: WeeklyActionCandidate) => void;
  onDismiss: (action: WeeklyActionCandidate) => void;
  onDefer: (action: WeeklyActionCandidate, until: string) => void;
  onAssign: (action: WeeklyActionCandidate, ownerId: string) => void;
  onViewChange?: (view: ViewState) => void;
}

const WeeklyActions: React.FC<Props> = ({ actions, users, scopeLabel, refreshedAt, budgetMinutes, isLoading, onOpen, onComplete, onDismiss, onDefer, onAssign }) => {
  const [expanded, setExpanded] = useState<string | null>(null);
  const total = actions.reduce((sum, action) => sum + action.effortMinutes, 0);
  const deferTomorrow = (action: WeeklyActionCandidate) => {
    const next = new Date();
    next.setDate(next.getDate() + 1);
    next.setHours(9, 0, 0, 0);
    onDefer(action, next.toISOString());
  };

  return (
    <section className="rounded-sm border border-[#DDE5EA] bg-white p-[18px]" aria-labelledby="weekly-actions-title">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 id="weekly-actions-title" className="text-[14px] font-bold text-[#111827]">This week&apos;s actions</h2>
          <p className="mt-1 text-[11px] text-[#64748B]">{scopeLabel} · {total} min selected / {budgetMinutes} min budget</p>
        </div>
        <span className="text-[10px] text-[#94A3B8]">{refreshedAt ? `Refreshed ${new Date(refreshedAt).toLocaleString()}` : 'Refresh pending'}</span>
      </div>

      {isLoading ? (
        <div className="mt-4 space-y-3" aria-label="Loading weekly actions">
          {[0, 1].map(item => <div key={item} className="h-28 animate-pulse rounded-sm bg-[#F1F5F9]" />)}
        </div>
      ) : actions.length === 0 ? (
        <div className="mt-5 flex flex-col items-center py-5 text-center">
          <CheckCircle2 size={28} className="text-emerald-500" />
          <p className="mt-2 text-[13px] font-bold text-[#1F2937]">Nothing needs your attention right now</p>
          <p className="mt-1 text-[11px] text-[#64748B]">No eligible prepared work fits the current brand scope and time budget.</p>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {actions.map(action => (
            <article key={action.key} className="rounded-sm border border-[#E5E7EB] p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="text-[12px] font-bold leading-5 text-[#111827]">{action.title}</h3>
                  <p className="mt-0.5 text-[11px] leading-4 text-[#64748B]">{action.why}</p>
                </div>
                <span className="flex shrink-0 items-center gap-1 text-[10px] font-semibold text-[#475569]"><Clock3 size={12} />{action.effortMinutes} min est.</span>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <select
                  aria-label={`Owner for ${action.title}`}
                  value={action.ownerId || ''}
                  onChange={event => onAssign(action, event.target.value)}
                  className="max-w-[150px] rounded-sm border border-[#D1D5DB] bg-white px-2 py-1.5 text-[10px] text-[#374151]"
                >
                  <option value="">Unassigned</option>
                  {users.filter(user => user.status === 'active' && action.eligibleOwnerIds.includes(user.id)).map(user => <option key={user.id} value={user.id}>{user.full_name || user.email}</option>)}
                </select>
                <button type="button" onClick={() => onOpen(action)} className="rounded-sm bg-[#0B4A6B] px-3 py-1.5 text-[10px] font-bold text-white hover:bg-[#093A55]">{action.primaryLabel}</button>
                <button type="button" onClick={() => onComplete(action)} className="text-[10px] font-bold text-emerald-700">Mark complete</button>
                <button type="button" onClick={() => deferTomorrow(action)} className="flex items-center gap-1 text-[10px] font-bold text-[#64748B]"><CalendarClock size={12} />Defer</button>
                <button type="button" onClick={() => onDismiss(action)} aria-label={`Skip ${action.title}`} className="text-[#94A3B8] hover:text-[#475569]"><X size={13} /></button>
              </div>

              <button type="button" onClick={() => setExpanded(expanded === action.key ? null : action.key)} className="mt-3 flex items-center gap-1 text-[10px] font-bold text-[#1E698F]">
                Evidence and next step <ChevronDown size={12} className={expanded === action.key ? 'rotate-180' : ''} />
              </button>
              {expanded === action.key && (
                <div className="mt-2 space-y-2 border-t border-[#F1F5F9] pt-2 text-[10px] leading-4 text-[#475569]">
                  <p><strong>Evidence:</strong> {action.evidence}</p>
                  <p><strong>Prepared next step:</strong> {action.preparedStep}</p>
                  <p><strong>Check afterward:</strong> {action.resultCheck}</p>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
};

export default WeeklyActions;
