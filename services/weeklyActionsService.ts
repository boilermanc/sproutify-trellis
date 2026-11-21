import { supabase } from '../lib/supabase';
import { Campaign } from '../supabaseService';
import { TrellisUser } from '../types';
import { QueueItem, WeeklyActionCandidate, WeeklyActionState, WeeklyActionStateStatus } from '../components/dashboard/types';
import { selectWeeklyActions as applyWeeklyActionRules } from './weeklyActionsRules.mjs';
import type { BusinessOverviewResult } from './businessOverviewService';

export const DEFAULT_WEEKLY_ACTION_BUDGET = 120;
export const MAX_WEEKLY_ACTIONS = 3;

const effortForQueue = (item: QueueItem) => item.severity === 'blocking' ? 30 : item.severity === 'overdue' ? 25 : 20;
const priorityForQueue = (item: QueueItem) => ({ blocking: 100, overdue: 90, stale: 75, waiting: 65, idle: 40 })[item.severity];

const canOwnBranch = (user: TrellisUser, branchSlugs: string[], branchIdsBySlug: Record<string, string>) => {
  if (user.status !== 'active') return false;
  if (user.role === 'owner' || user.role === 'admin') return true;
  if (branchSlugs.length === 0) return true;
  const allowedIds = new Set(user.branches.map(branch => branch.branch_id));
  return branchSlugs.every(slug => allowedIds.has(branchIdsBySlug[slug]));
};

const ownerFor = (
  preferredId: string | null | undefined,
  users: TrellisUser[],
  branchSlugs: string[],
  branchIdsBySlug: Record<string, string>,
) => {
  const eligible = users.filter(user => canOwnBranch(user, branchSlugs, branchIdsBySlug));
  const preferred = eligible.find(user => user.id === preferredId);
  const owner = preferred || eligible[0] || null;
  return { ownerId: owner?.id || null, ownerName: owner?.full_name || owner?.email || 'Unassigned', eligibleOwnerIds: eligible.map(user => user.id) };
};

export function buildWeeklyActionCandidates(params: {
  queue: QueueItem[];
  campaigns: Campaign[];
  users: TrellisUser[];
  branchIdsBySlug: Record<string, string>;
  activeBranchSlugs: string[];
  businessOverview?: BusinessOverviewResult | null;
}): WeeklyActionCandidate[] {
  const { queue, campaigns, users, branchIdsBySlug, activeBranchSlugs, businessOverview } = params;
  const inScope = (slugs: string[]) => activeBranchSlugs.length === 0 || slugs.length === 0 || slugs.some(slug => activeBranchSlugs.includes(slug));
  const branchSlugFor = (value: string) => branchIdsBySlug[value]
    ? value
    : Object.entries(branchIdsBySlug).find(([, id]) => id === value)?.[0] || value;
  const candidates: WeeklyActionCandidate[] = [];

  const registrations = businessOverview?.metrics.find(metric => metric.key === 'registrations');
  const verifiedRegistrationSlugs = registrations?.details
    .filter(detail => detail.state === 'available' && detail.value !== null)
    .map(detail => detail.branchSlug) || [];
  if (registrations?.value != null && registrations.value > 0 && verifiedRegistrationSlugs.length > 0) {
    const owner = ownerFor(null, users, verifiedRegistrationSlugs, branchIdsBySlug);
    candidates.push({
      key: `business-registration-review:${verifiedRegistrationSlugs.slice().sort().join(',')}`,
      kind: 'business_metric_review',
      title: `Review ${registrations.value.toLocaleString()} verified registration${registrations.value === 1 ? '' : 's'}`,
      why: 'These are verified product signups in the selected business period, ready for an aggregate follow-up review.',
      evidence: `${registrations.value.toLocaleString()} registrations · ${registrations.covered}/${registrations.eligible} branches verified · ${registrations.sourceLabel}`,
      branchSlugs: verifiedRegistrationSlugs,
      ...owner,
      effortMinutes: 15,
      preparedStep: 'Open Product Analytics with the current brand scope, confirm the registration pattern, and record any supported follow-up work.',
      primaryLabel: 'Review registrations',
      destination: 'reports',
      resultCheck: 'After review, confirm any follow-up is recorded through an existing approved workflow; this action does not create an outreach list.',
      sourceUpdatedAt: businessOverview.refreshedAt,
      priority: 85,
    });
  }

  for (const campaign of campaigns) {
    const campaignBranchSlugs = campaign.branches.map(branchSlugFor);
    if (campaign.status !== 'draft' || !inScope(campaignBranchSlugs)) continue;
    const owner = ownerFor(campaign.owner_id, users, campaignBranchSlugs, branchIdsBySlug);
    const updated = campaign.updated_at || campaign.created_at;
    candidates.push({
      key: `campaign-draft:${campaign.id}`,
      kind: 'campaign_draft',
      title: `Finish ${campaign.name || 'campaign draft'}`,
      why: 'Useful work is already prepared and waiting for a decision.',
      evidence: `${campaign.audience_size || 0} audience members · saved ${new Date(updated).toLocaleDateString()}`,
      branchSlugs: campaignBranchSlugs,
      ...owner,
      effortMinutes: 35,
      preparedStep: 'Open the saved builder state, verify audience consent and suppression, then decide whether it is ready to launch.',
      primaryLabel: 'Review campaign draft',
      destination: 'campaign-builder',
      destinationId: campaign.id,
      resultCheck: 'After review, confirm the draft was updated or that a separately approved launch completed successfully.',
      sourceUpdatedAt: updated,
      priority: 80,
    });
  }

  for (const item of queue) {
    if (item.severity === 'idle' || !inScope(item.branchSlug ? [item.branchSlug] : [])) continue;
    const branchSlugs = item.branchSlug ? [item.branchSlug] : [];
    const owner = ownerFor(null, users, branchSlugs, branchIdsBySlug);
    candidates.push({
      key: `queue:${item.key}`,
      kind: 'operational_review',
      title: item.title,
      why: item.detail,
      evidence: `${item.branchName} · ${item.severity} · verified in the live action queue`,
      branchSlugs,
      ...owner,
      effortMinutes: effortForQueue(item),
      preparedStep: `Open ${item.actionLabel.toLowerCase()} and resolve the specific queued record.`,
      primaryLabel: item.actionLabel,
      destination: item.actionView || 'dashboard',
      resultCheck: 'Refresh Overview and confirm the underlying queue item clears or shows a verified outcome.',
      sourceUpdatedAt: item.occurredAt || new Date(0).toISOString(),
      priority: priorityForQueue(item),
    });
  }

  return candidates.sort((a, b) => b.priority - a.priority || Date.parse(b.sourceUpdatedAt) - Date.parse(a.sourceUpdatedAt));
}

export function selectWeeklyActions(
  candidates: WeeklyActionCandidate[],
  states: Record<string, WeeklyActionState>,
  budgetMinutes = DEFAULT_WEEKLY_ACTION_BUDGET,
  now = new Date(),
): WeeklyActionCandidate[] {
  return applyWeeklyActionRules(candidates, states, budgetMinutes, now) as WeeklyActionCandidate[];
}

export async function fetchWeeklyActionStates(): Promise<Record<string, WeeklyActionState>> {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return {};
  const { data, error } = await supabase.from('dashboard_action_states').select('*').eq('user_id', auth.user.id);
  if (error) throw error;
  return Object.fromEntries((data || []).map((row: any) => [row.action_key, {
    actionKey: row.action_key,
    status: row.status,
    ownerId: row.owner_id,
    deferredUntil: row.deferred_until,
    sourceUpdatedAt: row.source_updated_at,
    completedAt: row.completed_at,
  }]));
}

export async function saveWeeklyActionState(candidate: WeeklyActionCandidate, status: WeeklyActionStateStatus, ownerId: string | null, deferredUntil: string | null) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Sign in to save weekly action state.');
  const { error } = await supabase.from('dashboard_action_states').upsert({
    user_id: auth.user.id,
    action_key: candidate.key,
    status,
    owner_id: ownerId,
    deferred_until: deferredUntil,
    source_updated_at: candidate.sourceUpdatedAt,
    completed_at: status === 'completed' ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,action_key' });
  if (error) throw error;
}
