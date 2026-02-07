import { Profile, BranchConsentEntry, BranchConsentMap } from './types';

/**
 * Check if a profile is subscribed for a specific branch.
 * Falls back to the global is_subscribed if no branch-specific consent exists.
 */
export function isSubscribedForBranch(profile: Profile, branchSlug: string): boolean {
  const branchEntry = profile.branch_consent?.[branchSlug];
  if (branchEntry) {
    return branchEntry.subscribed && !branchEntry.paused;
  }
  // Fallback to global consent
  return profile.is_subscribed && !profile.marketing_pause;
}

/**
 * Check if a profile is opted in for ANY of the given branches.
 * Used for multi-branch campaign targeting.
 */
export function isSubscribedForAnyBranch(profile: Profile, branchSlugs: string[]): boolean {
  return branchSlugs.some(slug => isSubscribedForBranch(profile, slug));
}

/**
 * Get the consent status for all branches a profile belongs to.
 * Returns a map of branch slug -> { subscribed, paused, updated_at }.
 */
export function getConsentSummary(profile: Profile): BranchConsentMap {
  if (profile.branch_consent && Object.keys(profile.branch_consent).length > 0) {
    return profile.branch_consent;
  }
  // Build from global fallback
  const fallback: BranchConsentMap = {};
  profile.branches.forEach(branch => {
    fallback[branch] = {
      subscribed: profile.is_subscribed,
      paused: profile.marketing_pause,
      updated_at: new Date().toISOString(),
    };
  });
  return fallback;
}

/**
 * Update consent for a specific branch on a profile.
 * Returns the updated branch_consent map (does NOT mutate the original).
 */
export function updateBranchConsent(
  currentConsent: BranchConsentMap | undefined,
  branchSlug: string,
  subscribed: boolean,
  paused: boolean = false,
): BranchConsentMap {
  return {
    ...(currentConsent || {}),
    [branchSlug]: {
      subscribed,
      paused,
      updated_at: new Date().toISOString(),
    },
  };
}

/**
 * Count how many branches a profile is opted into.
 */
export function subscribedBranchCount(profile: Profile): number {
  const consent = getConsentSummary(profile);
  return Object.values(consent).filter(c => c.subscribed && !c.paused).length;
}
