import { supabase } from '../lib/supabase';
import { SpokeConnection } from '../types';

const LS_KEY = 'trellis_spoke_connections';

// ─── Fetch ──────────────────────────────────────────────────────────
// Load spoke connections from Hub Supabase. Falls back to localStorage
// cache if the query fails (e.g. offline, table not yet created).
export async function fetchSpokeConnections(
  organizationId: string,
): Promise<SpokeConnection[]> {
  // NB: we intentionally do NOT select supabase_key / supabase_key_encrypted.
  // The spoke key never leaves the server — it's decrypted inside the
  // spoke-query Edge Function and used there. The client works off connection.id.
  const { data, error } = await supabase
    .from('spoke_connections')
    .select('id, name, supabase_url, key_preview, tables, status, last_tested_at, last_error, branch_skipped, created_at')
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
    supabase_key: '', // never exposed to the client
    key_preview: row.key_preview || undefined,
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
  // Only include the plaintext key when one is actually supplied (i.e. a brand-new
  // connection captured in the wizard). A BEFORE trigger encrypts it into
  // supabase_key_encrypted. For updates coming from the client the key is '' —
  // we omit it so the stored (encrypted) key is preserved untouched.
  const row: Record<string, unknown> = {
    id: connection.id,
    organization_id: organizationId,
    name: connection.name,
    supabase_url: connection.supabase_url,
    tables: connection.tables,
    status: connection.status,
    last_tested_at: connection.last_tested_at || null,
    last_error: connection.last_error || null,
    branch_skipped: connection.branch_skipped || false,
    created_at: connection.created_at,
    updated_at: new Date().toISOString(),
  };
  if (connection.supabase_key) {
    row.supabase_key = connection.supabase_key;
  }

  const { error } = await supabase
    .from('spoke_connections')
    .upsert(row, { onConflict: 'id' });

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
  // Never cache the spoke key in localStorage — strip it defensively.
  const safe = connections.map(({ supabase_key, ...rest }) => ({ ...rest, supabase_key: '' }));
  localStorage.setItem(LS_KEY, JSON.stringify(safe));
}
