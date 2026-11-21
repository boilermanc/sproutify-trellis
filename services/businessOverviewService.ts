import { Branch, BranchContext, EnrichedProfile, PostHogAnalyticsResult, PostHogConnection, SpokeConnection } from '../types';
import { NormalizedOrder } from '../spokeConnector';
import { fetchPosthogAnalytics, fetchPosthogConnections } from './posthogService';
import { computeFirstTimeBuyers, computeProfileRegistrations, formatBusinessRange } from './businessOverviewContract.mjs';
import { TimeWindow } from '../components/dashboard/types';

export type BusinessMetricState = 'available' | 'partial' | 'unconnected' | 'not_applicable' | 'error';

export interface BusinessMetricBranchDetail {
  branchId: string;
  branchName: string;
  branchSlug: string;
  value: number | null;
  state: BusinessMetricState;
  source: string;
  reason: string;
  refreshedAt: string | null;
}

export interface BusinessMetric {
  key: 'registrations' | 'paying' | 'expired' | 'ending';
  label: string;
  value: number | null;
  state: BusinessMetricState;
  covered: number;
  eligible: number;
  sourceLabel: string;
  explanation: string;
  details: BusinessMetricBranchDetail[];
}

export interface BusinessOverviewResult {
  rangeLabel: string;
  refreshedAt: string;
  metrics: BusinessMetric[];
  errors: string[];
}

const metric = (input: Omit<BusinessMetric, 'key'> & { key: BusinessMetric['key'] }): BusinessMetric => input;

const productAnalyticsCache = new Map<string, { expiresAt: number; promise: Promise<{ connections: PostHogConnection[]; results: PostHogAnalyticsResult[]; failures: number }> }>();

function loadProductAnalytics(scoped: Branch[], window: TimeWindow) {
  const key = `${window}:${scoped.map(branch => branch.id).sort().join('|')}`;
  const cached = productAnalyticsCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;
  const promise = fetchPosthogConnections().then(async connections => {
    const active = connections.filter(connection => connection.status === 'active' && scoped.some(branch => branch.id === connection.branch_id));
    const settled = await Promise.allSettled(active.map(connection => fetchPosthogAnalytics(connection.id, window === '30d' ? 30 : 7)));
    return {
      connections: active,
      results: settled.filter((item): item is PromiseFulfilledResult<PostHogAnalyticsResult> => item.status === 'fulfilled').map(item => item.value),
      failures: settled.filter(item => item.status === 'rejected').length,
    };
  });
  productAnalyticsCache.set(key, { expiresAt: Date.now() + 5 * 60_000, promise });
  promise.catch(() => productAnalyticsCache.delete(key));
  return promise;
}

function scopedBranches(branches: Branch[], context?: BranchContext): Branch[] {
  if (!context || context.isAllSelected) return branches;
  const selected = new Set(context.activeBranchSlugs);
  return branches.filter(branch => selected.has(branch.slug));
}

export async function fetchBusinessOverview(input: {
  branches: Branch[];
  branchContext?: BranchContext;
  spokeConnections: SpokeConnection[];
  orders: NormalizedOrder[];
  profiles: EnrichedProfile[];
  window: TimeWindow;
}): Promise<BusinessOverviewResult> {
  const scoped = scopedBranches(input.branches, input.branchContext);
  const errors: string[] = [];
  const connectionByBranch = new Map(scoped.filter(b => b.spoke_connection_id).map(b => [b.id, b.spoke_connection_id as string]));
  let posthogConnections: PostHogConnection[] = [];
  let posthogResults: PostHogAnalyticsResult[] = [];

  try {
    const analytics = await loadProductAnalytics(scoped, input.window);
    posthogConnections = analytics.connections;
    posthogResults = analytics.results;
    const failures = analytics.failures;
    if (failures) errors.push(`${failures} product analytics source${failures === 1 ? '' : 's'} could not be refreshed.`);
  } catch {
    errors.push('Product analytics connections could not be loaded.');
  }

  const posthogByBranch = new Map(posthogResults.map(result => [result.branch_id, result]));
  const registrationDetails: BusinessMetricBranchDetail[] = scoped.map(branch => {
    const result = posthogByBranch.get(branch.id);
    const connectionId = connectionByBranch.get(branch.id);
    if (branch.slug === 'rekkrd' && result) return {
      branchId: branch.id, branchName: branch.name, branchSlug: branch.slug,
      value: result.data.lifecycle_funnel.signed_up, state: 'available', source: 'PostHog · signup_completed',
      reason: 'Distinct Rekkrd signup events in the selected product-analytics window.', refreshedAt: result.fetched_at,
    };
    if (branch.slug === 'rejoice' && result) return {
      branchId: branch.id, branchName: branch.name, branchSlug: branch.slug,
      value: null, state: 'partial', source: 'PostHog',
      reason: 'The current Rejoice signal combines signup and app-install events, so it is not promoted as registrations.', refreshedAt: result.fetched_at,
    };
    if (branch.slug === 'sproutify-home' && connectionId) {
      const sourceProfiles = input.profiles.filter(profile => profile._spoke_id === connectionId);
      const windowed = computeProfileRegistrations(sourceProfiles, connectionId, input.window);
      const activeSubscribers = sourceProfiles.filter(profile => profile.subscribed === true).length;
      return {
        branchId: branch.id, branchName: branch.name, branchSlug: branch.slug,
        value: windowed.registrations, state: 'partial', source: 'Sproutify Home · trellis_home_customers.created_at',
        reason: `${windowed.newsletterOptIns} of ${windowed.registrations} new signup${windowed.registrations === 1 ? '' : 's'} opted into the newsletter. Current audience: ${sourceProfiles.length} profiles and ${activeSubscribers} active subscribers. Customer creation is used as the registration signal until the auth contract is signed off.`,
        refreshedAt: new Date().toISOString(),
      };
    }
    return {
      branchId: branch.id, branchName: branch.name, branchSlug: branch.slug,
      value: null, state: 'unconnected', source: 'Registration source not verified',
      reason: 'A profile or customer creation timestamp is not automatically an account registration.', refreshedAt: null,
    };
  });
  const registrationAvailable = registrationDetails.filter(detail => detail.value !== null);

  const buyerDetails: BusinessMetricBranchDetail[] = scoped.map(branch => {
    const connectionId = connectionByBranch.get(branch.id);
    if (branch.slug === 'atlurbanfarms' && connectionId) return {
      branchId: branch.id, branchName: branch.name, branchSlug: branch.slug,
      value: computeFirstTimeBuyers(input.orders, connectionId, input.window), state: 'partial', source: 'ATL orders + legacy_orders',
      reason: 'Provisional first-time buyers from paid timestamps or paid/completed fulfillment states. Legacy deduplication and refunds still require source-owner sign-off.',
      refreshedAt: new Date().toISOString(),
    };
    return {
      branchId: branch.id, branchName: branch.name, branchSlug: branch.slug,
      value: null, state: ['once-upon-a-drawing', 'still-janes-daughter', 'sweetwater-urban-farms'].includes(branch.slug) ? 'not_applicable' : 'unconnected',
      source: 'Payment source not verified', reason: 'No confirmed first-payment contract is available for this branch.', refreshedAt: null,
    };
  });
  const buyerValues = buyerDetails.filter(detail => detail.value !== null);

  const trialDetails = scoped.map((branch): BusinessMetricBranchDetail => ({
    branchId: branch.id,
    branchName: branch.name,
    branchSlug: branch.slug,
    value: null,
    state: ['atlurbanfarms', 'once-upon-a-drawing', 'still-janes-daughter', 'sweetwater-urban-farms'].includes(branch.slug) ? 'not_applicable' : 'unconnected',
    source: 'Trial lifecycle not connected',
    reason: 'Trellis does not yet receive authoritative trial state, grace, extension, cancellation, and conversion fields.',
    refreshedAt: null,
  }));

  const latestRefresh = [...registrationDetails, ...buyerDetails]
    .map(detail => detail.refreshedAt).filter((value): value is string => !!value).sort().at(-1) || new Date().toISOString();

  return {
    rangeLabel: formatBusinessRange(input.window),
    refreshedAt: latestRefresh,
    errors,
    metrics: [
      metric({
        key: 'registrations', label: 'New registrations',
        value: registrationAvailable.length ? registrationAvailable.reduce((sum, detail) => sum + (detail.value || 0), 0) : null,
        state: registrationAvailable.length ? (registrationAvailable.length === scoped.length && registrationAvailable.every(detail => detail.state === 'available') ? 'available' : 'partial') : errors.length ? 'error' : 'unconnected',
        covered: registrationAvailable.length, eligible: scoped.length, sourceLabel: 'Verified product signup events',
        explanation: 'Only branches with a verified account-registration event contribute to this total.', details: registrationDetails,
      }),
      metric({
        key: 'paying', label: scoped.length === 1 && scoped[0]?.slug === 'atlurbanfarms' ? 'First-time buyers' : 'New paying / first-time buyers',
        value: buyerValues.length ? buyerValues.reduce((sum, detail) => sum + (detail.value || 0), 0) : null,
        state: buyerValues.length ? 'partial' : 'unconnected', covered: buyerValues.length, eligible: scoped.length,
        sourceLabel: 'Provisional paid-order evidence',
        explanation: 'Available ATL values remain provisional until legacy-order, refund, and payment-state rules are signed off.', details: buyerDetails,
      }),
      metric({
        key: 'expired', label: 'Trials expired', value: null, state: 'unconnected', covered: 0, eligible: scoped.length,
        sourceLabel: 'Authoritative billing lifecycle required',
        explanation: 'Trellis will not infer expiry from a period-end timestamp alone.', details: trialDetails,
      }),
      metric({
        key: 'ending', label: 'Trials ending soon', value: null, state: 'unconnected', covered: 0, eligible: scoped.length,
        sourceLabel: 'Next 7 calendar days',
        explanation: 'Requires current trial eligibility plus scheduled end, grace, extension, and paid-conversion state.', details: trialDetails,
      }),
    ],
  };
}
