import React, { useEffect, useMemo, useState } from 'react';
import { Download, Loader2, MousePointerClick, RefreshCw, ShoppingBag, Users, X } from 'lucide-react';
import { BranchInfo, EnrichedProfile } from '../types';
import {
  CampaignEngagementRecipient,
  fetchRecentCampaignEngagement,
  RecentCampaignPerformance,
} from '../services/emailReportingService';

interface Props {
  branches: BranchInfo[];
  profiles: EnrichedProfile[];
}

interface CohortPerson {
  email: string;
  name: string;
  campaignsOpened: number;
  campaignsClicked: number;
  orderedAfterOpen: boolean;
  lastPurchaseAt: string | null;
}

interface Cohort {
  id: string;
  label: string;
  description: string;
  people: CohortPerson[];
  eligible: number;
  tone: 'emerald' | 'blue' | 'violet' | 'amber' | 'rose';
}

const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const downloadCohort = (cohort: Cohort, branchSlug: string) => {
  const header = ['Name', 'Email', 'Campaigns opened', 'Campaigns clicked', 'Ordered after open', 'Last purchase'];
  const rows = cohort.people.map((person) => [
    person.name,
    person.email,
    person.campaignsOpened,
    person.campaignsClicked,
    person.orderedAfterOpen ? 'Yes' : 'No',
    person.lastPurchaseAt || '',
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${branchSlug}-${cohort.id}-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
};

const EmailEngagementCohorts: React.FC<Props> = ({ branches, profiles }) => {
  const activeBranches = useMemo(() => branches.filter((branch) => branch.is_active), [branches]);
  const defaultBranch = useMemo(() => {
    return activeBranches.find((branch) => /atl.*urban.*farm/i.test(`${branch.slug} ${branch.name}`))?.slug
      || activeBranches[0]?.slug
      || '';
  }, [activeBranches]);
  const [branchSlug, setBranchSlug] = useState(defaultBranch);
  const [campaigns, setCampaigns] = useState<RecentCampaignPerformance[]>([]);
  const [recipientsByCampaign, setRecipientsByCampaign] = useState<Record<string, CampaignEngagementRecipient[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCohort, setSelectedCohort] = useState<Cohort | null>(null);

  useEffect(() => {
    if (!branchSlug && defaultBranch) setBranchSlug(defaultBranch);
  }, [branchSlug, defaultBranch]);

  const load = async () => {
    if (!branchSlug) return;
    setLoading(true);
    setError(null);
    const result = await fetchRecentCampaignEngagement(branchSlug, 5);
    setCampaigns(result.campaigns);
    setRecipientsByCampaign(result.recipientsByCampaign);
    setError(result.error);
    setLoading(false);
  };

  useEffect(() => { load(); }, [branchSlug]);

  const cohorts = useMemo<Cohort[]>(() => {
    if (campaigns.length === 0) return [];

    const profileByEmail = new Map<string, EnrichedProfile>();
    for (const profile of profiles) {
      const email = (profile.email || '').toLowerCase();
      if (!email) continue;
      const existing = profileByEmail.get(email);
      const currentPurchase = profile.order_stats?.last_purchase_at || '';
      const existingPurchase = existing?.order_stats?.last_purchase_at || '';
      if (!existing || currentPurchase > existingPurchase) profileByEmail.set(email, profile);
    }

    const recipientLookup = new Map<string, Map<string, CampaignEngagementRecipient>>();
    for (const campaign of campaigns) {
      recipientLookup.set(
        campaign.id,
        new Map((recipientsByCampaign[campaign.id] || []).map((recipient) => [recipient.email, recipient])),
      );
    }

    const personFor = (email: string, campaignSet: RecentCampaignPerformance[]): CohortPerson => {
      const profile = profileByEmail.get(email);
      let campaignsOpened = 0;
      let campaignsClicked = 0;
      let latestOpenAt = '';
      for (const campaign of campaignSet) {
        const recipient = recipientLookup.get(campaign.id)?.get(email);
        if (recipient?.firstOpenedAt) {
          campaignsOpened++;
          if (recipient.firstOpenedAt > latestOpenAt) latestOpenAt = recipient.firstOpenedAt;
        }
        if (recipient?.firstClickedAt) campaignsClicked++;
      }
      const lastPurchaseAt = profile?.order_stats?.last_purchase_at || null;
      return {
        email,
        name: profile ? [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim() : '',
        campaignsOpened,
        campaignsClicked,
        orderedAfterOpen: !!(latestOpenAt && lastPurchaseAt && lastPurchaseAt > latestOpenAt),
        lastPurchaseAt,
      };
    };

    const frequency = (
      campaignSet: RecentCampaignPerformance[],
      event: 'deliveredAt' | 'firstOpenedAt' | 'firstClickedAt',
    ) => {
      const counts = new Map<string, number>();
      for (const campaign of campaignSet) {
        for (const recipient of recipientsByCampaign[campaign.id] || []) {
          if (!recipient[event]) continue;
          counts.set(recipient.email, (counts.get(recipient.email) || 0) + 1);
        }
      }
      return counts;
    };

    const build = (
      id: string,
      label: string,
      description: string,
      take: number,
      minimum: number,
      tone: Cohort['tone'],
      event: 'firstOpenedAt' | 'firstClickedAt' = 'firstOpenedAt',
    ): Cohort => {
      const campaignSet = campaigns.slice(0, take);
      if (campaignSet.length < minimum) return { id, label, description, people: [], eligible: 0, tone };
      const eventCounts = frequency(campaignSet, event);
      const deliveredCounts = frequency(campaignSet, 'deliveredAt');
      const emails = [...eventCounts.entries()].filter(([, count]) => count >= minimum).map(([email]) => email);
      const eligible = [...deliveredCounts.values()].filter((count) => count >= minimum).length;
      return {
        id,
        label,
        description,
        people: emails.map((email) => personFor(email, campaignSet)).sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email)),
        eligible,
        tone,
      };
    };

    const both = build('opened-both', 'Opened both', 'Opened each of the latest two campaigns', 2, 2, 'emerald');
    const twoOfThree = build('opened-2-of-3', 'Opened 2 of 3', 'Repeat openers across the latest three campaigns', 3, 2, 'blue');
    const threeOfFive = build('opened-3-of-5', 'Opened 3 of 5', 'Consistently engaged across the latest five campaigns', 5, 3, 'violet');
    const clicked = build('clicked-latest-5', 'Clicked recently', 'Clicked at least one of the latest five campaigns', 5, 1, 'amber', 'firstClickedAt');
    const orderedPeople = both.people.filter((person) => person.orderedAfterOpen);
    const ordered: Cohort = {
      id: 'opened-both-then-ordered',
      label: 'Opened both → ordered',
      description: 'Latest purchase occurred after both tracked opens · correlated, not attributed',
      people: orderedPeople,
      eligible: both.people.length,
      tone: 'rose',
    };
    return [both, twoOfThree, threeOfFive, clicked, ordered];
  }, [campaigns, recipientsByCampaign, profiles]);

  const toneClasses: Record<Cohort['tone'], string> = {
    emerald: 'border-emerald-100 bg-emerald-50/60 text-emerald-700',
    blue: 'border-blue-100 bg-blue-50/60 text-blue-700',
    violet: 'border-violet-100 bg-violet-50/60 text-violet-700',
    amber: 'border-amber-100 bg-amber-50/60 text-amber-700',
    rose: 'border-rose-100 bg-rose-50/60 text-rose-700',
  };

  return (
    <div className="mb-6 rounded-[2rem] border border-slate-200 bg-white p-6">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-tight text-slate-800">
            <Users size={17} className="text-emerald-600" /> Engagement cohorts
          </h3>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Repeat opens, high-intent clicks, and post-open purchasing
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={branchSlug}
            onChange={(event) => setBranchSlug(event.target.value)}
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:border-emerald-400"
            aria-label="Engagement cohort branch"
          >
            {activeBranches.map((branch) => <option key={branch.id} value={branch.slug}>{branch.name}</option>)}
          </select>
          <button type="button" onClick={load} disabled={loading || !branchSlug} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 disabled:opacity-40" aria-label="Refresh engagement cohorts">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-xs font-bold text-rose-700">Couldn’t load engagement cohorts. {error}</div>
      ) : loading && campaigns.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-10 text-xs font-bold text-slate-400"><Loader2 size={16} className="animate-spin" /> Loading recipient engagement…</div>
      ) : campaigns.length < 2 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-xs text-slate-500">At least two tracked campaigns are required for repeat-engagement reporting.</div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {cohorts.map((cohort) => {
              const rate = cohort.eligible > 0 ? Math.round((cohort.people.length / cohort.eligible) * 100) : null;
              return (
                <button key={cohort.id} type="button" onClick={() => setSelectedCohort(cohort)} className={`rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${toneClasses[cohort.tone]}`}>
                  <div className="mb-2 flex items-center justify-between">
                    {cohort.id.includes('ordered') ? <ShoppingBag size={15} /> : cohort.id.includes('clicked') ? <MousePointerClick size={15} /> : <Users size={15} />}
                    <span className="text-[9px] font-black uppercase tracking-widest">View people</span>
                  </div>
                  <p className="text-2xl font-black">{cohort.people.length.toLocaleString()}</p>
                  <p className="mt-1 text-[10px] font-black uppercase tracking-widest">{cohort.label}</p>
                  <p className="mt-2 text-[10px] leading-relaxed opacity-75">{cohort.description}</p>
                  {rate !== null && <p className="mt-2 text-[10px] font-black">{rate}% of eligible recipients</p>}
                </button>
              );
            })}
          </div>
          <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-[10px] leading-relaxed text-slate-500">
            Latest campaigns: {campaigns.map((campaign) => `“${campaign.subject}”`).join(' · ')}. Purchase matches use the federated profile’s latest ATL order date and are correlation only until campaign IDs are persisted on orders.
          </div>
        </>
      )}

      {selectedCohort && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`${selectedCohort.label} recipients`}>
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <div>
                <h3 className="text-lg font-black text-slate-800">{selectedCohort.label}</h3>
                <p className="text-xs text-slate-500">{selectedCohort.people.length.toLocaleString()} people · {selectedCohort.description}</p>
              </div>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => downloadCohort(selectedCohort, branchSlug)} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50"><Download size={14} /> CSV</button>
                <button type="button" onClick={() => setSelectedCohort(null)} className="rounded-xl bg-slate-100 p-2 text-slate-500 hover:text-slate-900" aria-label="Close cohort"><X size={17} /></button>
              </div>
            </div>
            <div className="overflow-y-auto p-5">
              {selectedCohort.people.length === 0 ? <p className="py-10 text-center text-sm text-slate-400">No matching recipients.</p> : (
                <div className="divide-y divide-slate-100">
                  {selectedCohort.people.map((person) => (
                    <div key={person.email} className="grid gap-1 py-3 sm:grid-cols-[1fr_auto] sm:items-center">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-800">{person.name || person.email}</p>
                        {person.name && <p className="truncate text-xs text-slate-500">{person.email}</p>}
                      </div>
                      <div className="flex flex-wrap gap-2 text-[9px] font-black uppercase tracking-widest text-slate-500">
                        <span>{person.campaignsOpened} opened</span>
                        <span>{person.campaignsClicked} clicked</span>
                        {person.orderedAfterOpen && <span className="text-rose-600">Ordered afterward</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmailEngagementCohorts;
