
// Branch display name mapping
export const BRANCH_DISPLAY_NAMES: Record<string, string> = {
  'atlurbanfarms.com': 'ATL Urban Farms',
  'farm.sproutify.app': 'Sproutify Farm',
  'school.sproutify.app': 'Sproutify School',
  'micro.sproutify.app': 'Sproutify Micro',
  'letsrejoice.app': 'Rejoice',
};

export const formatBranchName = (branch: string): string => {
  return BRANCH_DISPLAY_NAMES[branch] || branch
    .replace(/\.(com|app|io)$/, '')
    .replace(/\./g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());
};

// Relative time formatter
export const timeAgo = (dateString: string): string => {
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(dateString).toLocaleDateString();
};

// Consent source display
export const getConsentLabel = (source?: string): { label: string; color: string } => {
  switch (source) {
    case 'spoke_native': return { label: 'Verified by Spoke', color: 'emerald' };
    case 'import_explicit': return { label: 'Import Verified', color: 'blue' };
    case 'import_default': return { label: 'Consent Unverified', color: 'amber' };
    case 'mock': return { label: 'Mock Data', color: 'slate' };
    default: return { label: 'Consent Unverified', color: 'amber' };
  }
};
