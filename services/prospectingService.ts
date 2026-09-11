import { supabase } from '../lib/supabase';
import type {
  ProspectingActivity,
  ProspectingClaim,
  ProspectingContact,
  ProspectingExportOptions,
  ProspectingListFilters,
  ProspectingNote,
  ProspectingProspect,
  ProspectingProspectDetail,
  ProspectingSalesStage,
  ProspectingStats,
  ProspectingTask,
  ProspectingTaskStatus,
  ProspectingTerritory,
  ProspectingContactVerificationStatus,
  ProspectingEvidenceDecision,
  ProspectingClaimType,
  ProspectingEvidenceSourceType,
  ProspectingVerificationState,
} from '../types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_LIST_ROWS = 500;

export interface ProspectingAccessStatus {
  role_ok: boolean;
  authorized: boolean;
}

type MutableProspect = Omit<ProspectingProspect,
  'created_by' | 'updated_by' | 'created_at' | 'updated_at'
>;
export type SaveProspectInput =
  | (Partial<MutableProspect> & Pick<ProspectingProspect, 'company_name' | 'territory_id'> & { id?: never })
  | ({ id: string } & Partial<MutableProspect>);

export interface CreateProspectTaskInput {
  prospect_id: string;
  title: string;
  description?: string | null;
  due_at?: string | null;
  assigned_to?: string | null;
}

export interface CreateTerritoryInput {
  name: string;
  kind: ProspectingTerritory['kind'];
  city?: string | null;
  county?: string | null;
  state_code?: string | null;
  country_code?: string;
  status?: ProspectingTerritory['status'];
  target_count?: number;
  metadata?: Record<string, unknown>;
}
export type UpdateTerritoryInput = Partial<CreateTerritoryInput>;
export type CreateProspectInput = Pick<ProspectingProspect, 'company_name' | 'territory_id'>
  & Partial<Omit<MutableProspect, 'id' | 'company_name' | 'territory_id'>>;
export type UpdateProspectInput = Partial<Omit<MutableProspect, 'id'>>;

export interface CreateProspectContactInput {
  prospect_id: string;
  full_name?: string | null;
  title?: string | null;
  email?: string | null;
  phone?: string | null;
  is_primary?: boolean;
  email_status?: ProspectingContactVerificationStatus;
  source_url?: string | null;
  metadata?: Record<string, unknown>;
}
export type UpdateProspectContactInput = Omit<Partial<CreateProspectContactInput>, 'prospect_id'>;

export interface CreateProspectClaimInput {
  prospect_id: string;
  claim_type: ProspectingClaimType;
  display_value: string;
  normalized_value?: string;
  source_url: string;
  source_type: ProspectingEvidenceSourceType | 'founder_research';
  source_excerpt?: string | null;
  artifact_ref?: string | null;
  retrieved_at?: string;
  confidence: number;
  research_run_id?: string | null;
  prompt_version?: string | null;
  rubric_version?: string | null;
}
export type UpdateProspectClaimInput = Omit<Partial<CreateProspectClaimInput>, 'prospect_id' | 'research_run_id'>;
export interface ReviewProspectClaimInput {
  decision: Exclude<ProspectingEvidenceDecision, 'pending'>;
  founder_correction?: string | null;
}

export interface ExportProspectRow {
  prospect_id?: string;
  company_name?: string | null;
  territory_name?: string | null;
  website_state?: string | null;
  official_domain?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  website_url?: string | null;
  sales_state?: string | null;
  verification_state?: string | null;
  next_follow_up_at?: string | null;
  [key: string]: unknown;
}

function requireUuid(value: string, label: string): string {
  if (!UUID_PATTERN.test(value)) throw new Error(`${label} must be a valid ID.`);
  return value;
}

function requireText(value: string, label: string, maximum = 500): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label} is required.`);
  if (normalized.length > maximum) throw new Error(`${label} must be ${maximum} characters or fewer.`);
  return normalized;
}

function throwQueryError(context: string, error: { message: string } | null): void {
  if (error) throw new Error(`${context}: ${error.message}`);
}

export async function getProspectingAccessStatus(): Promise<ProspectingAccessStatus> {
  const { data, error } = await supabase.rpc('spectiq_prospecting_access_status');
  throwQueryError('Could not verify founder prospecting access', error);
  const value = (Array.isArray(data) ? data[0] : data) as Partial<ProspectingAccessStatus> | null;
  return {
    role_ok: value?.role_ok === true,
    authorized: value?.authorized === true,
  };
}

export async function listTerritories(): Promise<ProspectingTerritory[]> {
  const { data, error } = await supabase
    .from('spectiq_prospecting_territories')
    .select('*')
    .is('archived_at', null)
    .order('name', { ascending: true });
  throwQueryError('Could not load prospecting territories', error);
  return (data || []) as ProspectingTerritory[];
}

export async function createTerritory(input: CreateTerritoryInput): Promise<ProspectingTerritory> {
  const values = {
    ...input,
    name: requireText(input.name, 'Territory name', 160),
    state_code: input.state_code?.trim().toUpperCase() || null,
    country_code: input.country_code?.trim().toUpperCase() || 'US',
  };
  const { data, error } = await supabase.from('spectiq_prospecting_territories').insert(values).select('*').single();
  throwQueryError('Could not create territory', error);
  return data as ProspectingTerritory;
}

export async function updateTerritory(territoryId: string, input: UpdateTerritoryInput): Promise<ProspectingTerritory> {
  const values: Record<string, unknown> = { ...input };
  if (input.name !== undefined) values.name = requireText(input.name, 'Territory name', 160);
  if (input.state_code !== undefined) values.state_code = input.state_code?.trim().toUpperCase() || null;
  if (input.country_code !== undefined) values.country_code = input.country_code.trim().toUpperCase();
  if (input.status === 'archived') throw new Error('Use archiveTerritory to archive a territory.');
  const { data, error } = await supabase.from('spectiq_prospecting_territories')
    .update(values).eq('id', requireUuid(territoryId, 'Territory')).is('archived_at', null).select('*').single();
  throwQueryError('Could not update territory', error);
  return data as ProspectingTerritory;
}

export async function archiveTerritory(territoryId: string): Promise<ProspectingTerritory> {
  const { data, error } = await supabase.rpc('archive_spectiq_territory', {
    p_territory_id: requireUuid(territoryId, 'Territory'),
  });
  throwQueryError('Could not archive territory', error);
  return (Array.isArray(data) ? data[0] : data) as ProspectingTerritory;
}

export async function listProspects(filters: ProspectingListFilters = {}): Promise<ProspectingProspect[]> {
  let query = supabase
    .from('spectiq_prospects')
    .select('*')
    .is('archived_at', null)
    .order('updated_at', { ascending: false })
    .limit(Math.min(Math.max(filters.limit || 100, 1), MAX_LIST_ROWS));

  if (filters.territoryId) query = query.eq('territory_id', requireUuid(filters.territoryId, 'Territory'));
  if (filters.stage) query = query.eq('sales_state', filters.stage);
  if (filters.verificationState) query = query.eq('verification_state', filters.verificationState);
  if (filters.search?.trim()) {
    const term = filters.search.trim().replace(/[\\%_]/g, character => `\\${character}`).slice(0, 120);
    query = query.ilike('company_name', `%${term}%`);
  }

  const { data, error } = await query;
  throwQueryError('Could not load SpectIQ prospects', error);
  return (data || []) as ProspectingProspect[];
}

export async function getProspectDetail(prospectId: string): Promise<ProspectingProspectDetail | null> {
  const id = requireUuid(prospectId, 'Prospect');
  const prospectResult = await supabase.from('spectiq_prospects').select('*').eq('id', id).is('archived_at', null).maybeSingle();
  throwQueryError('Could not load prospect', prospectResult.error);
  if (!prospectResult.data) return null;
  const prospect = prospectResult.data as ProspectingProspect;

  const [territoryResult, contactsResult, claimsResult, notesResult, tasksResult, activityResult] = await Promise.all([
    prospect.territory_id
      ? supabase.from('spectiq_prospecting_territories').select('*').eq('id', prospect.territory_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase.from('spectiq_prospect_contacts').select('*').eq('prospect_id', id).order('is_primary', { ascending: false }),
    supabase.from('spectiq_prospect_claims').select('*').eq('prospect_id', id).order('retrieved_at', { ascending: false }),
    supabase.from('spectiq_prospect_notes').select('*').eq('prospect_id', id).order('created_at', { ascending: false }),
    supabase.from('spectiq_prospect_tasks').select('*').eq('prospect_id', id).order('due_at', { ascending: true, nullsFirst: false }),
    supabase.from('spectiq_prospect_activity').select('*').eq('prospect_id', id).order('created_at', { ascending: false }),
  ]);

  throwQueryError('Could not load prospect territory', territoryResult.error);
  throwQueryError('Could not load prospect contacts', contactsResult.error);
  throwQueryError('Could not load prospect evidence', claimsResult.error);
  throwQueryError('Could not load prospect notes', notesResult.error);
  throwQueryError('Could not load prospect tasks', tasksResult.error);
  throwQueryError('Could not load prospect activity', activityResult.error);

  return {
    ...prospect,
    territory: territoryResult.data as ProspectingTerritory | null,
    contacts: (contactsResult.data || []) as ProspectingContact[],
    claims: (claimsResult.data || []) as ProspectingClaim[],
    notes: (notesResult.data || []) as ProspectingNote[],
    tasks: (tasksResult.data || []) as ProspectingTask[],
    activity: (activityResult.data || []) as ProspectingActivity[],
  };
}

export async function getProspectingStats(territoryId?: string): Promise<ProspectingStats> {
  let query = supabase
    .from('spectiq_prospects')
    .select('sales_state,verification_state,next_follow_up_at')
    .is('archived_at', null);
  if (territoryId) query = query.eq('territory_id', requireUuid(territoryId, 'Territory'));
  const { data, error } = await query;
  throwQueryError('Could not load prospecting statistics', error);

  const rows = (data || []) as Pick<ProspectingProspect, 'sales_state' | 'verification_state' | 'next_follow_up_at'>[];
  const byStage: ProspectingStats['by_stage'] = {};
  const byVerification: ProspectingStats['by_verification'] = {};
  for (const row of rows) {
    byStage[row.sales_state] = (byStage[row.sales_state] || 0) + 1;
    byVerification[row.verification_state] = (byVerification[row.verification_state] || 0) + 1;
  }
  const now = Date.now();
  return {
    total: rows.length,
    due_follow_up: rows.filter(row => row.next_follow_up_at && Date.parse(row.next_follow_up_at) <= now).length,
    pitch_ready: byStage.pitch_ready || 0,
    contacted: byStage.contacted || 0,
    engaged: byStage.engaged || 0,
    demo_booked: byStage.demo_booked || 0,
    won: byStage.won || 0,
    needs_verification: rows.filter(row => row.verification_state !== 'outreach_approved').length,
    by_stage: byStage,
    by_verification: byVerification,
  };
}

const PROSPECT_MUTABLE_FIELDS = [
  'territory_id', 'company_name', 'normalized_company_name', 'official_domain', 'website_url',
  'website_state', 'opportunity_category', 'summary',
  'address_line_1', 'city', 'state_code', 'postal_code', 'phone', 'source', 'metadata',
  'next_follow_up_at', 'last_contacted_at',
] as const;

export async function createOrUpdateProspect(input: SaveProspectInput): Promise<ProspectingProspect> {
  const values: Record<string, unknown> = {};
  for (const field of PROSPECT_MUTABLE_FIELDS) {
    if (input[field] !== undefined) values[field] = input[field];
  }
  if (values.company_name !== undefined) values.company_name = requireText(String(values.company_name), 'Company name', 200);
  if (values.territory_id) requireUuid(String(values.territory_id), 'Territory');

  const result = input.id
    ? await supabase.from('spectiq_prospects').update(values).eq('id', requireUuid(input.id, 'Prospect')).select('*').single()
    : await supabase.from('spectiq_prospects').insert(values).select('*').single();
  throwQueryError(input.id ? 'Could not update prospect' : 'Could not create prospect', result.error);
  return result.data as ProspectingProspect;
}

export async function createProspect(input: CreateProspectInput): Promise<ProspectingProspect> {
  return createOrUpdateProspect(input);
}

export async function updateProspect(prospectId: string, input: UpdateProspectInput): Promise<ProspectingProspect> {
  return createOrUpdateProspect({ ...input, id: requireUuid(prospectId, 'Prospect') });
}

export async function archiveProspect(prospectId: string): Promise<ProspectingProspect> {
  const { data, error } = await supabase.rpc('archive_spectiq_prospect', {
    p_prospect_id: requireUuid(prospectId, 'Prospect'),
  });
  throwQueryError('Could not archive prospect', error);
  return (Array.isArray(data) ? data[0] : data) as ProspectingProspect;
}

export async function createProspectContact(input: CreateProspectContactInput): Promise<ProspectingContact> {
  const { data, error } = await supabase.from('spectiq_prospect_contacts').insert({
    ...input,
    prospect_id: requireUuid(input.prospect_id, 'Prospect'),
    full_name: input.full_name?.trim() || null,
    email: input.email?.trim() || null,
    phone: input.phone?.trim() || null,
  }).select('*').single();
  throwQueryError('Could not create prospect contact', error);
  return data as ProspectingContact;
}

export async function updateProspectContact(contactId: string, input: UpdateProspectContactInput): Promise<ProspectingContact> {
  const { data, error } = await supabase.from('spectiq_prospect_contacts').update(input)
    .eq('id', requireUuid(contactId, 'Contact')).select('*').single();
  throwQueryError('Could not update prospect contact', error);
  return data as ProspectingContact;
}

export async function createProspectClaim(input: CreateProspectClaimInput): Promise<ProspectingClaim> {
  const displayValue = requireText(input.display_value, 'Evidence value', 4000);
  const { data, error } = await supabase.from('spectiq_prospect_claims').insert({
    ...input,
    prospect_id: requireUuid(input.prospect_id, 'Prospect'),
    display_value: displayValue,
    normalized_value: requireText(input.normalized_value || displayValue.toLowerCase(), 'Normalized evidence value', 4000),
    source_url: requireText(input.source_url, 'Evidence source URL', 2000),
    source_type: input.source_type === 'founder_research' ? 'founder_observation' : input.source_type,
    retrieved_at: input.retrieved_at || new Date().toISOString(),
    verification_decision: 'pending',
  }).select('*').single();
  throwQueryError('Could not create evidence claim', error);
  return data as ProspectingClaim;
}

export async function updateProspectClaim(claimId: string, input: UpdateProspectClaimInput): Promise<ProspectingClaim> {
  const values: Record<string, unknown> = { ...input, verification_decision: 'pending', founder_correction: null };
  if (input.display_value !== undefined) values.display_value = requireText(input.display_value, 'Evidence value', 4000);
  const { data, error } = await supabase.from('spectiq_prospect_claims').update(values)
    .eq('id', requireUuid(claimId, 'Evidence claim')).select('*').single();
  throwQueryError('Could not update evidence claim', error);
  return data as ProspectingClaim;
}

export async function reviewProspectClaim(claimId: string, input: ReviewProspectClaimInput): Promise<ProspectingClaim> {
  const correction = input.decision === 'corrected'
    ? requireText(input.founder_correction || '', 'Founder correction', 4000)
    : null;
  const { data, error } = await supabase.rpc('review_spectiq_prospect_claim', {
    p_claim_id: requireUuid(claimId, 'Evidence claim'),
    p_decision: input.decision,
    p_founder_correction: correction,
  });
  throwQueryError('Could not review evidence claim', error);
  return (Array.isArray(data) ? data[0] : data) as ProspectingClaim;
}

export async function updateProspectStage(prospectId: string, salesState: ProspectingSalesStage): Promise<ProspectingProspect> {
  const id = requireUuid(prospectId, 'Prospect');
  if (salesState === 'pitch_ready') return approveProspectPitchReady(id);
  const { data, error } = await supabase
    .from('spectiq_prospects')
    .update({ sales_state: salesState })
    .eq('id', id)
    .select('*')
    .single();
  throwQueryError('Could not update prospect sales stage', error);
  return data as ProspectingProspect;
}

export async function approveProspectPitchReady(prospectId: string): Promise<ProspectingProspect> {
  const { data, error } = await supabase.rpc('approve_spectiq_prospect_pitch_ready', {
    p_prospect_id: requireUuid(prospectId, 'Prospect'),
  });
  throwQueryError('Could not approve prospect as pitch ready', error);
  const row = (Array.isArray(data) ? data[0] : data) as ProspectingProspect | null;
  if (!row) throw new Error('Pitch-ready approval completed without returning the prospect.');
  return row;
}

export async function updateProspectVerification(
  prospectId: string,
  verificationState: ProspectingVerificationState,
): Promise<ProspectingProspect> {
  const { data, error } = await supabase.rpc('update_spectiq_prospect_verification', {
    p_prospect_id: requireUuid(prospectId, 'Prospect'),
    p_verification_state: verificationState,
  });
  throwQueryError('Could not update prospect verification', error);
  return (Array.isArray(data) ? data[0] : data) as ProspectingProspect;
}

export async function addProspectNote(prospectId: string, body: string): Promise<ProspectingNote> {
  const { data, error } = await supabase
    .from('spectiq_prospect_notes')
    .insert({ prospect_id: requireUuid(prospectId, 'Prospect'), body: requireText(body, 'Note', 10_000) })
    .select('*')
    .single();
  throwQueryError('Could not add prospect note', error);
  return data as ProspectingNote;
}

export async function createProspectTask(input: CreateProspectTaskInput): Promise<ProspectingTask> {
  const { data, error } = await supabase
    .from('spectiq_prospect_tasks')
    .insert({
      prospect_id: requireUuid(input.prospect_id, 'Prospect'),
      title: requireText(input.title, 'Task title', 300),
      description: input.description?.trim() || null,
      due_at: input.due_at || null,
      assigned_to: input.assigned_to ? requireUuid(input.assigned_to, 'Assignee') : null,
    })
    .select('*')
    .single();
  throwQueryError('Could not create prospect task', error);
  return data as ProspectingTask;
}

export async function updateProspectTaskStatus(taskId: string, status: ProspectingTaskStatus): Promise<ProspectingTask> {
  const { data, error } = await supabase.rpc('update_spectiq_prospect_task_status', {
    p_task_id: requireUuid(taskId, 'Task'),
    p_status: status,
  });
  throwQueryError('Could not update prospect task', error);
  return (Array.isArray(data) ? data[0] : data) as ProspectingTask;
}

export async function completeProspectTask(taskId: string): Promise<ProspectingTask> {
  return updateProspectTaskStatus(taskId, 'completed');
}

export async function cancelProspectTask(taskId: string): Promise<ProspectingTask> {
  return updateProspectTaskStatus(taskId, 'cancelled');
}

export function neutralizeCsvFormula(value: unknown): string {
  const cell = value == null ? '' : String(value);
  return /^[=+\-@]/.test(cell) ? `'${cell}` : cell;
}

function quoteCsvCell(value: unknown): string {
  return `"${neutralizeCsvFormula(value).replace(/"/g, '""')}"`;
}

const EXPORT_COLUMNS: ReadonlyArray<[keyof ExportProspectRow, string]> = [
  ['company_name', 'Company'],
  ['territory_name', 'Territory'],
  ['sales_state', 'Sales stage'],
  ['verification_state', 'Verification'],
  ['website_state', 'Website state'],
  ['official_domain', 'Official domain'],
  ['website_url', 'Website'],
  ['contact_name', 'Primary contact'],
  ['contact_email', 'Email'],
  ['contact_phone', 'Phone'],
  ['next_follow_up_at', 'Next follow-up'],
];

export function buildProspectingCsv(rows: ExportProspectRow[]): string {
  const header = EXPORT_COLUMNS.map(([, label]) => quoteCsvCell(label)).join(',');
  const body = rows.map(row => EXPORT_COLUMNS.map(([key]) => quoteCsvCell(row[key])).join(','));
  return `\uFEFF${[header, ...body].join('\r\n')}\r\n`;
}

/** RLS plus this RPC's owner/platform-super-admin checks are the export authorization boundary. */
export async function exportProspectsCsv(options: ProspectingExportOptions = {}): Promise<string> {
  const prospectIds = options.prospectIds?.map(id => requireUuid(id, 'Prospect')) || null;
  if (prospectIds && prospectIds.length > 500) throw new Error('Export at most 500 prospects at a time.');
  const territoryId = options.territoryId ? requireUuid(options.territoryId, 'Territory') : null;
  const { data, error } = await supabase.rpc('export_spectiq_prospects', {
    p_prospect_ids: prospectIds,
    p_territory_id: territoryId,
    p_redacted: options.redacted !== false,
  });
  throwQueryError('Could not export prospects', error);
  return buildProspectingCsv((data || []) as ExportProspectRow[]);
}
