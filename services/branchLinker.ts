import { SpokeConnection, Branch, BrandIdentity, MergedBranch, SpokeStats } from '../types';
import { updateBranch } from '../lib/supabaseService';

/**
 * Merge spoke connections, branches, brand identities, and stats into unified MergedBranch records.
 * Handles three cases: linked (branch + connection), connection-only, branch-only.
 */
export function mergeBranchData(
  connections: SpokeConnection[],
  branches: Branch[],
  brands: BrandIdentity[],
  spokeStats: Record<string, SpokeStats>
): MergedBranch[] {
  const merged: MergedBranch[] = [];
  const matchedConnectionIds = new Set<string>();
  const matchedBranchIds = new Set<string>();

  const connectionById = new Map(connections.map(c => [c.id, c]));
  const brandByBranchId = new Map(
    brands.filter(b => b.status === 'active').map(b => [b.branch_id, b])
  );

  // Phase 1: Branches with a linked spoke connection
  for (const branch of branches) {
    if (branch.spoke_connection_id) {
      const conn = connectionById.get(branch.spoke_connection_id);
      if (conn) {
        matchedConnectionIds.add(conn.id);
        matchedBranchIds.add(branch.id);
        merged.push({
          branchId: branch.id,
          spokeConnectionId: conn.id,
          name: branch.name,
          slug: branch.slug,
          type: branch.type,
          logoUrl: branch.logo_url || null,
          primaryColor: branch.primary_color,
          secondaryColor: branch.secondary_color,
          accentColor: branch.accent_color,
          websiteUrl: branch.website_url || null,
          tagline: branch.tagline || null,
          tone: branch.tone || null,
          fontFamily: branch.font_family || null,
          connection: conn,
          branch,
          brandIdentity: brandByBranchId.get(branch.id) || null,
          stats: spokeStats[conn.id] || null,
          linkStatus: 'linked',
        });
      }
    }
  }

  // Phase 2: Unmatched connections (no branch record linked)
  for (const conn of connections) {
    if (!matchedConnectionIds.has(conn.id)) {
      merged.push({
        branchId: null,
        spokeConnectionId: conn.id,
        name: conn.name,
        slug: null,
        type: null,
        logoUrl: null,
        primaryColor: '#64748b',
        secondaryColor: '#1e293b',
        accentColor: '#f59e0b',
        websiteUrl: null,
        tagline: null,
        tone: null,
        fontFamily: null,
        connection: conn,
        branch: null,
        brandIdentity: null,
        stats: spokeStats[conn.id] || null,
        linkStatus: 'connection-only',
      });
    }
  }

  // Phase 3: Unmatched branches (no data connection)
  for (const branch of branches) {
    if (!matchedBranchIds.has(branch.id)) {
      merged.push({
        branchId: branch.id,
        spokeConnectionId: null,
        name: branch.name,
        slug: branch.slug,
        type: branch.type,
        logoUrl: branch.logo_url || null,
        primaryColor: branch.primary_color,
        secondaryColor: branch.secondary_color,
        accentColor: branch.accent_color,
        websiteUrl: branch.website_url || null,
        tagline: branch.tagline || null,
        tone: branch.tone || null,
        fontFamily: branch.font_family || null,
        connection: null,
        branch,
        brandIdentity: brandByBranchId.get(branch.id) || null,
        stats: null,
        linkStatus: 'branch-only',
      });
    }
  }

  return merged;
}

/**
 * Link a spoke connection to a branch record in Supabase.
 */
export async function linkConnectionToBranch(
  branchId: string,
  spokeConnectionId: string
): Promise<void> {
  await updateBranch(branchId, { spoke_connection_id: spokeConnectionId } as Partial<Branch>);
}

/**
 * Unlink a spoke connection from a branch record.
 */
export async function unlinkConnectionFromBranch(branchId: string): Promise<void> {
  await updateBranch(branchId, { spoke_connection_id: null } as Partial<Branch>);
}
