import { supabase } from '../lib/supabase';
import { SpokeConnection } from '../types';

const LS_KEY = 'trellis_spoke_connections';

// ─── Fetch ──────────────────────────────────────────────────────────
// Load spoke connections from Hub Supabase. Falls back to localStorage
// cache if the query fails (e.g. offline, table not yet created).
export async function fetchSpokeConnections(
  organizationId: string,
): Promise<SpokeConnection[]> {
  const { data, error } = await supabase
    .from('spoke_connections')
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true });

  if (error) {
    console.warn('[spokeConnections] Supabase fetch failed, using localStorage:', error.message);
    return loadFromLocalStorage();
  }

  const connections: SpokeConnection[] = (data || []).map(row => ({
    id: row.id,
    name: row.name,
    supabase_url: row.supabase_url,
    supabase_key: row.supabase_key,
    tables: row.tables || [],
    status: row.status,
    last_tested_at: row.last_tested_at || undefined,
    last_error: row.last_error || undefined,
    branch_skipped: row.branch_skipped || false,
    created_at: row.created_at,
  }));

  // Update localStorage cache so the next page load hydrates instantly
  saveToLocalStorage(connections);

  return connections;
}

// ─── Upsert ─────────────────────────────────────────────────────────
// Insert or update a single spoke connection in Hub Supabase.
export async function upsertSpokeConnection(
  organizationId: string,
  connection: SpokeConnection,
): Promise<boolean> {
  const { error } = await supabase
    .from('spoke_connections')
    .upsert(
      {
        id: connection.id,
        organization_id: organizationId,
        name: connection.name,
        supabase_url: connection.supabase_url,
        supabase_key: connection.supabase_key,
        tables: connection.tables,
        status: connection.status,
        last_tested_at: connection.last_tested_at || null,
        last_error: connection.last_error || null,
        branch_skipped: connection.branch_skipped || false,
        created_at: connection.created_at,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );

  if (error) {
    console.error('[spokeConnections] Upsert failed:', error.message);
    return false;
  }
  return true;
}

// ─── Delete ─────────────────────────────────────────────────────────
export async function deleteSpokeConnection(
  connectionId: string,
): Promise<boolean> {
  const { error } = await supabase
    .from('spoke_connections')
    .delete()
    .eq('id', connectionId);

  if (error) {
    console.error('[spokeConnections] Delete failed:', error.message);
    return false;
  }
  return true;
}

// ─── Migration ──────────────────────────────────────────────────────
// One-time seed: if Supabase table is empty but localStorage has data,
// insert the localStorage connections into Supabase.
export async function migrateLocalStorageToSupabase(
  organizationId: string,
): Promise<void> {
  const local = loadFromLocalStorage();
  if (local.length === 0) return;

  const { count, error } = await supabase
    .from('spoke_connections')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId);

  if (error || (count && count > 0)) return;

  console.log('[spokeConnections] Migrating', local.length, 'connections from localStorage to Supabase');
  for (const conn of local) {
    await upsertSpokeConnection(organizationId, conn);
  }
}

// ─── localStorage helpers ───────────────────────────────────────────

function loadFromLocalStorage(): SpokeConnection[] {
  try {
    const saved = localStorage.getItem(LS_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function saveToLocalStorage(connections: SpokeConnection[]): void {
  localStorage.setItem(LS_KEY, JSON.stringify(connections));
}
