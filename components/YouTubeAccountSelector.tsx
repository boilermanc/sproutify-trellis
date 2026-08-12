import React, { useEffect, useMemo } from 'react';
import { Branch, BranchSocialAccountsMap, SocialAccount } from '../types';

interface Props {
  branchSlug: string | null;
  branches: Branch[];
  accountsByBranch: BranchSocialAccountsMap;
  value: string;
  onChange: (accountId: string) => void;
  disabled?: boolean;
}

export function activeYouTubeAccounts(
  branchSlug: string | null,
  branches: Branch[],
  accountsByBranch: BranchSocialAccountsMap,
): SocialAccount[] {
  const branch = branches.find(candidate => candidate.slug === branchSlug);
  if (!branch) return [];
  return (accountsByBranch[branch.id] || []).filter(account =>
    account.platform === 'youtube'
    && Boolean(account.id)
    && account.status === 'active'
    && account.is_connected,
  );
}

export function youtubeAccountLabel(accountId: string | null, accountsByBranch: BranchSocialAccountsMap): string {
  if (!accountId) return 'Legacy destination';
  const account = Object.values(accountsByBranch).flat().find(candidate => candidate.id === accountId);
  return account ? (account.display_name || account.handle || 'YouTube channel') : 'Unavailable channel';
}

const YouTubeAccountSelector: React.FC<Props> = ({ branchSlug, branches, accountsByBranch, value, onChange, disabled }) => {
  const accounts = useMemo(
    () => activeYouTubeAccounts(branchSlug, branches, accountsByBranch),
    [branchSlug, branches, accountsByBranch],
  );

  useEffect(() => {
    if (accounts.some(account => account.id === value)) return;
    const preferred = accounts.find(account => account.is_primary) || accounts[0];
    onChange(preferred?.id || '');
  }, [accounts, value, onChange]);

  return <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500">
    YouTube channel
    <select
      value={value}
      onChange={event => onChange(event.target.value)}
      disabled={disabled || accounts.length === 0}
      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold normal-case tracking-normal text-slate-700 outline-none focus:border-emerald-500 disabled:bg-slate-100 disabled:text-slate-400"
    >
      {accounts.length === 0 && <option value="">Connect a YouTube channel for this branch first</option>}
      {accounts.map(account => <option key={account.id} value={account.id}>
        {account.display_name || account.handle}{account.is_primary ? ' · primary' : ''} ({account.handle})
      </option>)}
    </select>
    {accounts.length === 0 && <span className="mt-1.5 block normal-case font-medium tracking-normal text-amber-600">No active account is available. Connect it from Branches → Social accounts.</span>}
  </label>;
};

export default YouTubeAccountSelector;
