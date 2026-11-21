import { supabase } from '../lib/supabase';
import type { BranchSocialAccountsMap, SocialAccount, SocialPlatform } from '../types';

interface BranchSocialAccountRow {
  id: string;
  branch_id: string;
  platform: SocialPlatform;
  external_account_id: string | null;
  handle: string;
  display_name: string | null;
  profile_url: string | null;
  purpose: string | null;
  is_primary: boolean;
  status: 'registered' | 'pending' | 'active' | 'error' | 'revoked';
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

const toSocialAccount = (row: BranchSocialAccountRow): SocialAccount => ({
  id: row.id,
  branch_id: row.branch_id,
  platform: row.platform,
  external_account_id: row.external_account_id || undefined,
  handle: row.handle,
  display_name: row.display_name || undefined,
  profile_url: row.profile_url || undefined,
  purpose: row.purpose || undefined,
  is_primary: row.is_primary,
  status: row.status,
  metadata: row.metadata || {},
  created_at: row.created_at,
  updated_at: row.updated_at,
  is_connected: row.status === 'active',
});

export async function fetchBranchSocialAccounts(): Promise<BranchSocialAccountsMap> {
  const { data, error } = await supabase
    .from('branch_social_accounts')
    .select('*')
    .neq('status', 'revoked')
    .order('is_primary', { ascending: false })
    .order('created_at', { ascending: true });

  if (error) throw error;

  return ((data || []) as BranchSocialAccountRow[]).reduce<BranchSocialAccountsMap>((accounts, row) => {
    (accounts[row.branch_id] ||= []).push(toSocialAccount(row));
    return accounts;
  }, {});
}

/**
 * Replaces one branch's public account registry. Credential rows and OAuth
 * tokens are intentionally untouched; those remain in social_credentials.
 */
export async function replaceBranchSocialAccounts(
  branchId: string,
  accounts: SocialAccount[],
): Promise<SocialAccount[]> {
  const { data: existing, error: existingError } = await supabase
    .from('branch_social_accounts')
    .select('id')
    .eq('branch_id', branchId);

  if (existingError) throw existingError;

  const rows = accounts.map(account => ({
    id: account.id || crypto.randomUUID(),
    branch_id: branchId,
    platform: account.platform,
    external_account_id: account.external_account_id || null,
    handle: account.handle.trim(),
    display_name: account.display_name || null,
    profile_url: account.profile_url || null,
    purpose: account.purpose || null,
    is_primary: account.is_primary ?? false,
    status: account.status || (account.is_connected ? 'active' : 'registered'),
    metadata: account.metadata || {},
    updated_at: new Date().toISOString(),
  }));

  let savedRows: BranchSocialAccountRow[] = [];
  if (rows.length > 0) {
    const { data, error } = await supabase
      .from('branch_social_accounts')
      .upsert(rows, { onConflict: 'id' })
      .select('*');

    if (error) throw error;
    savedRows = (data || []) as BranchSocialAccountRow[];
  }

  const retainedIds = new Set(rows.map(row => row.id));
  const removedIds = (existing || [])
    .map(row => row.id as string)
    .filter(id => !retainedIds.has(id));

  if (removedIds.length > 0) {
    const { error } = await supabase
      .from('branch_social_accounts')
      .delete()
      .in('id', removedIds);
    if (error) throw error;
  }

  return savedRows.map(toSocialAccount);
}

/** One-time, additive import of the old browser-only sidecar. */
export async function migrateLegacyBranchSocialAccounts(): Promise<void> {
  const raw = localStorage.getItem('trellis_branch_social_accounts');
  if (!raw) return;

  let legacy: BranchSocialAccountsMap;
  try {
    legacy = JSON.parse(raw) as BranchSocialAccountsMap;
  } catch {
    return;
  }

  const remote = await fetchBranchSocialAccounts();
  for (const [branchId, legacyAccounts] of Object.entries(legacy)) {
    const merged = [...(remote[branchId] || [])];
    let changed = false;

    for (const account of legacyAccounts) {
      const alreadyRegistered = merged.some(candidate =>
        candidate.platform === account.platform
        && candidate.handle.toLowerCase() === account.handle.toLowerCase()
      );
      if (!alreadyRegistered) {
        merged.push(account);
        changed = true;
      }
    }

    if (changed) await replaceBranchSocialAccounts(branchId, merged);
  }
}
