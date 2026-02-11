
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

// Social platform metadata
export const SOCIAL_PLATFORM_META: Record<string, { label: string; color: string; urlPrefix: string }> = {
  instagram: { label: 'Instagram', color: 'pink', urlPrefix: 'https://instagram.com/' },
  x: { label: 'X', color: 'slate', urlPrefix: 'https://x.com/' },
  linkedin: { label: 'LinkedIn', color: 'blue', urlPrefix: 'https://linkedin.com/company/' },
  facebook: { label: 'Facebook', color: 'blue', urlPrefix: 'https://facebook.com/' },
  tiktok: { label: 'TikTok', color: 'slate', urlPrefix: 'https://tiktok.com/@' },
  youtube: { label: 'YouTube', color: 'red', urlPrefix: 'https://youtube.com/@' },
};

// Platform icon/color maps — shared by BranchCommandCenter and SocialHub
import {
  Instagram, Twitter, Linkedin, Facebook, Music, Play,
  type LucideIcon,
} from 'lucide-react';

export const PLATFORM_ICONS: Record<string, LucideIcon> = {
  instagram: Instagram,
  x: Twitter,
  linkedin: Linkedin,
  facebook: Facebook,
  tiktok: Music,
  youtube: Play,
};

export const PLATFORM_COLORS: Record<string, string> = {
  instagram: 'text-pink-500',
  x: 'text-slate-800',
  linkedin: 'text-blue-700',
  facebook: 'text-blue-600',
  tiktok: 'text-slate-900',
  youtube: 'text-red-600',
};

export const getSocialUrl = (account: { platform: string; handle: string; profile_url?: string }): string => {
  if (account.profile_url) return account.profile_url;
  const meta = SOCIAL_PLATFORM_META[account.platform];
  if (!meta) return '#';
  const cleanHandle = account.handle.replace(/^@/, '');
  return meta.urlPrefix + cleanHandle;
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
