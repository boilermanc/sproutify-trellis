import React from 'react';
import { Ban, CircleDollarSign, Clock3, Target, Trophy } from 'lucide-react';
import { Lead } from '../../types';

export interface LeadMetricsResult {
  openCount: number;
  openValue: number;
  winRate: number | null;
  addedLast30Days: number;
  stageCounts: Record<string, number>;
}

export function calculateLeadMetrics(
  filteredLeads: Lead[],
  allPipelineLeads: Lead[],
  stages: string[],
  now = Date.now()
): LeadMetricsResult {
  const openLeads = filteredLeads.filter(lead => lead.status === 'open');
  const decisions = allPipelineLeads.filter(lead => lead.status === 'won' || lead.status === 'lost');
  const won = decisions.filter(lead => lead.status === 'won').length;
  const thirtyDaysAgo = now - 30 * 86400000;
  return {
    openCount: openLeads.length,
    openValue: openLeads.reduce((total, lead) => total + (lead.estimated_value || 0), 0),
    winRate: decisions.length > 0 ? (won / decisions.length) * 100 : null,
    addedLast30Days: filteredLeads.filter(lead => new Date(lead.created_at).getTime() >= thirtyDaysAgo).length,
    stageCounts: Object.fromEntries(stages.map(stage => [stage, filteredLeads.filter(lead => lead.stage === stage).length])),
  };
}

interface LeadMetricsProps {
  filteredLeads: Lead[];
  allPipelineLeads: Lead[];
  stages: string[];
  unsubscribedCount: number | null;
}

export function countUnsubscribedLeads(leads: Lead[], unsubscribedEmails: Set<string>): number {
  return new Set(
    leads
      .map(lead => String(lead.profile?.email || '').trim().toLowerCase())
      .filter(email => email && unsubscribedEmails.has(email))
  ).size;
}

const LeadMetrics: React.FC<LeadMetricsProps> = ({ filteredLeads, allPipelineLeads, stages, unsubscribedCount }) => {
  const metrics = calculateLeadMetrics(filteredLeads, allPipelineLeads, stages);
  const cards = [
    { label: 'Open leads', value: metrics.openCount.toLocaleString(), icon: Target, color: 'text-cyan-300' },
    { label: 'Open value', value: new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(metrics.openValue), icon: CircleDollarSign, color: 'text-emerald-300' },
    { label: 'Win rate · all-time', value: metrics.winRate == null ? '—' : `${metrics.winRate.toFixed(1)}%`, icon: Trophy, color: 'text-amber-300' },
    { label: 'Added · 30 days', value: metrics.addedLast30Days.toLocaleString(), icon: Clock3, color: 'text-indigo-300' },
    { label: 'Unsubscribed', value: unsubscribedCount == null ? '—' : unsubscribedCount.toLocaleString(), icon: Ban, color: 'text-rose-300' },
  ];

  return (
    <section className="rounded-2xl border border-white/10 bg-[#10142E] p-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map(card => <div key={card.label} className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-[#0A0E27] px-4 py-3"><card.icon size={17} className={card.color} /><div><p className="text-[9px] font-black uppercase tracking-widest text-slate-600">{card.label}</p><p className="mt-0.5 text-lg font-black text-white">{card.value}</p></div></div>)}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">{stages.map(stage => <span key={stage} className="rounded-full border border-white/[0.07] bg-white/[0.03] px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-slate-400"><span className="mr-1.5 text-cyan-300">{metrics.stageCounts[stage] || 0}</span>{stage}</span>)}</div>
    </section>
  );
};

export default LeadMetrics;
