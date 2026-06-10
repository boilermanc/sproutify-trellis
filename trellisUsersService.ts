import { supabase } from './lib/supabase';
import { TrellisUser, TrellisUserBranch } from './types';

// ═══════════════════════════════════════════════════════════════
// TRELLIS OPERATOR (TEAM) MANAGEMENT SERVICE
// ───────────────────────────────────────────────────────────────
// Reads/writes the trellis_users + trellis_user_branches tables and
// the read-only trellis_users_view (each user joined to its branches[]).
// All functions return a clean { data, error } shape.
// ═══════════════════════════════════════════════════════════════

export interface ServiceResult<T> {
  data: T | null;
  error: string | null;
}

export type TrellisRole = TrellisUser['role'];
export type TrellisStatus = TrellisUser['status'];
export type BranchRole = TrellisUserBranch['branch_role'];

export interface BranchOption {
  id: string;
  name: string;
}

function toMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'Unexpected error';
}

// ─── 1. listTrellisUsers ────────────────────────────────────────
// Reads the joined view; each row carries a branches[] JSONB array.
export async function listTrellisUsers(): Promise<ServiceResult<TrellisUser[]>> {
  try {
    const { data, error } = await supabase
      .from('trellis_users_view')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) return { data: null, error: error.message };
    return { data: (data ?? []) as TrellisUser[], error: null };
  } catch (err) {
    return { data: null, error: toMessage(err) };
  }
}

// ─── 2. createTrellisUser ───────────────────────────────────────
// Inserts a new operator. status defaults to 'invited' here so the
// roster reflects a pending invite until the user activates.
export async function createTrellisUser(params: {
  email: string;
  full_name?: string | null;
  role?: TrellisRole;
}): Promise<ServiceResult<TrellisUser>> {
  const email = params.email?.trim().toLowerCase();
  if (!email) return { data: null, error: 'Email is required' };

  try {
    const { data, error } = await supabase
      .from('trellis_users')
      .insert({
        email,
        full_name: params.full_name?.trim() || null,
        role: params.role || 'operator',
        status: 'invited',
      })
      .select('*')
      .single();

    if (error) return { data: null, error: error.message };
    return { data: data as TrellisUser, error: null };
  } catch (err) {
    return { data: null, error: toMessage(err) };
  }
}

// ─── 3. updateTrellisUserRole ───────────────────────────────────
export async function updateTrellisUserRole(
  id: string,
  role: TrellisRole
): Promise<ServiceResult<TrellisUser>> {
  if (!id) return { data: null, error: 'User id is required' };

  try {
    const { data, error } = await supabase
      .from('trellis_users')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();

    if (error) return { data: null, error: error.message };
    return { data: data as TrellisUser, error: null };
  } catch (err) {
    return { data: null, error: toMessage(err) };
  }
}

// ─── 4. setTrellisUserStatus ────────────────────────────────────
// Used for suspend ('suspended') and remove ('deleted' soft-delete).
export async function setTrellisUserStatus(
  id: string,
  status: TrellisStatus
): Promise<ServiceResult<TrellisUser>> {
  if (!id) return { data: null, error: 'User id is required' };

  try {
    const { data, error } = await supabase
      .from('trellis_users')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();

    if (error) return { data: null, error: error.message };
    return { data: data as TrellisUser, error: null };
  } catch (err) {
    return { data: null, error: toMessage(err) };
  }
}

// ─── 5. assignBranch ────────────────────────────────────────────
// Upsert on the UNIQUE(trellis_user_id, branch_id) constraint so
// re-assigning simply updates the branch_role.
export async function assignBranch(
  trellis_user_id: string,
  branch_id: string,
  branch_role: BranchRole = 'member'
): Promise<ServiceResult<TrellisUserBranch>> {
  if (!trellis_user_id || !branch_id) {
    return { data: null, error: 'User and branch are required' };
  }

  try {
    const { data, error } = await supabase
      .from('trellis_user_branches')
      .upsert(
        { trellis_user_id, branch_id, branch_role },
        { onConflict: 'trellis_user_id,branch_id' }
      )
      .select('*')
      .single();

    if (error) return { data: null, error: error.message };
    return { data: data as TrellisUserBranch, error: null };
  } catch (err) {
    return { data: null, error: toMessage(err) };
  }
}

// ─── 6. unassignBranch ──────────────────────────────────────────
export async function unassignBranch(
  trellis_user_id: string,
  branch_id: string
): Promise<ServiceResult<true>> {
  if (!trellis_user_id || !branch_id) {
    return { data: null, error: 'User and branch are required' };
  }

  try {
    const { error } = await supabase
      .from('trellis_user_branches')
      .delete()
      .eq('trellis_user_id', trellis_user_id)
      .eq('branch_id', branch_id);

    if (error) return { data: null, error: error.message };
    return { data: true, error: null };
  } catch (err) {
    return { data: null, error: toMessage(err) };
  }
}

// ─── 7. listBranches ────────────────────────────────────────────
// Minimal {id, name} list for the assignment dropdown.
export async function listBranches(): Promise<ServiceResult<BranchOption[]>> {
  try {
    const { data, error } = await supabase
      .from('branches')
      .select('id, name')
      .order('name', { ascending: true });

    if (error) return { data: null, error: error.message };
    return { data: (data ?? []) as BranchOption[], error: null };
  } catch (err) {
    return { data: null, error: toMessage(err) };
  }
}

// ─── 8. getCurrentTrellisUser ───────────────────────────────────
// Resolves the logged-in operator's row (for role gating) by matching
// the auth session uid against trellis_users_view.auth_user_id.
export async function getCurrentTrellisUser(): Promise<ServiceResult<TrellisUser>> {
  try {
    const { data: authData } = await supabase.auth.getUser();
    const authUserId = authData?.user?.id;
    if (!authUserId) return { data: null, error: 'No authenticated user' };

    const { data, error } = await supabase
      .from('trellis_users_view')
      .select('*')
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    if (error) return { data: null, error: error.message };
    return { data: (data as TrellisUser) ?? null, error: null };
  } catch (err) {
    return { data: null, error: toMessage(err) };
  }
}
