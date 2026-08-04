import { supabase } from './lib/supabase';
import { getProfileByEmail } from './lib/supabaseService';
import { Lead, LeadPipeline, NewLeadInput, Profile } from './types';

const LEAD_TAG = 'tower-farm-lead';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type LeadExistenceStatus = 'open_lead' | 'known_profile' | 'new';

export interface DuplicateLeadResult {
  duplicate: true;
  email: string;
}

export type CreateLeadResult = Lead | DuplicateLeadResult;

export interface LeadParseResult {
  leads: NewLeadInput[];
  skipped: { line: string; reason: string }[];
}

/** Fetch the pipelines configured for a branch. */
export async function fetchPipelines(branchId: string): Promise<LeadPipeline[]> {
  const { data, error } = await supabase
    .from('lead_pipelines')
    .select('*')
    .eq('branch_id', branchId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching lead pipelines:', error);
    throw error;
  }

  return (data || []).map((row: any) => ({
    ...row,
    stages: Array.isArray(row.stages) ? row.stages : [],
  }));
}

/** Fetch branch leads with their resolved Hub identity fields. */
export async function fetchLeads(
  branchId: string,
  opts?: { status?: string; stage?: string }
): Promise<Lead[]> {
  let query = supabase
    .from('leads')
    .select(`
      *,
      profile:profiles (
        first_name,
        last_name,
        email
      )
    `)
    .eq('branch_id', branchId)
    .order('created_at', { ascending: false });

  if (opts?.status) query = query.eq('status', opts.status);
  if (opts?.stage) query = query.eq('stage', opts.stage);

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching leads:', error);
    throw error;
  }

  return (data || []) as Lead[];
}

async function createLeadProfile(input: NewLeadInput, email: string): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .insert({
      email,
      first_name: input.first_name.trim(),
      last_name: input.last_name.trim(),
      phone: input.phone?.trim() || null,
      branches: [],
      tags: [],
      segments: [],
      status: 'active',
      ltv: 0,
      churn_risk: 'minimal',
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating profile for lead:', error);
    throw error;
  }

  return data;
}

async function ensureLeadTag(profile: Profile): Promise<void> {
  const { data: taggedProfile, error: checkError } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', profile.id)
    .contains('tags', JSON.stringify([LEAD_TAG]))
    .maybeSingle();

  if (checkError) {
    console.error('Error checking lead profile tag:', checkError);
    throw checkError;
  }

  if (taggedProfile) return;

  const tags = [...new Set([...(Array.isArray(profile.tags) ? profile.tags : []), LEAD_TAG])];
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ tags, updated_at: new Date().toISOString() })
    .eq('id', profile.id);

  if (updateError) {
    console.error('Error appending lead profile tag:', updateError);
    throw updateError;
  }
}

/** Resolve the Hub identity, tag it, create the lead, and record the event. */
export async function createLead(input: NewLeadInput): Promise<CreateLeadResult> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    throw new Error('A valid email is required to create a lead');
  }

  let profile = await getProfileByEmail(email);
  if (!profile) profile = await createLeadProfile(input, email);

  // A lead inquiry is not marketing consent. Only the dedicated lead tag is changed.
  await ensureLeadTag(profile);

  const { data: lead, error: leadError } = await supabase
    .from('leads')
    .insert({
      profile_id: profile.id,
      branch_id: input.branch_id,
      pipeline_id: input.pipeline_id,
      stage: 'new',
      source: input.source,
      inquiry_text: input.inquiry_text?.trim() || null,
      estimated_value: input.estimated_value ?? null,
      status: 'open',
      notes: input.notes?.trim() || null,
    })
    .select()
    .single();

  if (leadError) {
    if (leadError.code === '23505') {
      return { duplicate: true, email };
    }
    console.error('Error creating lead:', leadError);
    throw leadError;
  }

  const { error: eventError } = await supabase.from('marketing_events').insert({
    event_type: 'lead_created',
    source: 'manual',
    profile_id: profile.id,
    payload: {
      lead_id: lead.id,
      branch_id: input.branch_id,
      pipeline_id: input.pipeline_id,
      source: input.source,
    },
  });

  if (eventError) {
    console.error('Error logging lead creation event:', eventError);
    throw eventError;
  }

  return lead as Lead;
}

/** Create a small pasted set sequentially, reporting rows that could not be created. */
export async function createLeadsBulk(
  inputs: NewLeadInput[]
): Promise<{ created: number; skipped: { email: string; reason: string }[] }> {
  let created = 0;
  const skipped: { email: string; reason: string }[] = [];

  for (const input of inputs) {
    const email = input.email?.trim().toLowerCase() || '';
    if (!EMAIL_PATTERN.test(email)) {
      skipped.push({ email, reason: 'Invalid or missing email' });
      continue;
    }

    try {
      const result = await createLead({ ...input, email });
      if ('duplicate' in result) {
        skipped.push({ email, reason: 'already has an open lead' });
        continue;
      }
      created += 1;
    } catch (error) {
      if (
        typeof error === 'object'
        && error !== null
        && 'code' in error
        && error.code === '23505'
      ) {
        skipped.push({ email, reason: 'already has an open lead' });
        continue;
      }
      skipped.push({
        email,
        reason: error instanceof Error ? error.message : 'Failed to create lead',
      });
    }
  }

  return { created, skipped };
}

/** Classify emails for a branch without creating or changing any records. */
export async function checkExistingLeads(
  emails: string[],
  branchId: string
): Promise<Record<string, LeadExistenceStatus>> {
  const normalizedEmails = [...new Set(
    emails.map(email => email.trim().toLowerCase()).filter(email => EMAIL_PATTERN.test(email))
  )];
  const statuses: Record<string, LeadExistenceStatus> = Object.fromEntries(
    normalizedEmails.map(email => [email, 'new' as const])
  );

  if (normalizedEmails.length === 0) return statuses;

  const profiles: { id: string; email: string }[] = [];
  const batchSize = 200;
  for (let offset = 0; offset < normalizedEmails.length; offset += batchSize) {
    const batch = normalizedEmails.slice(offset, offset + batchSize);
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email')
      .in('email', batch);

    if (error) {
      console.error('Error checking existing lead profiles:', error);
      throw error;
    }

    profiles.push(...((data || []) as { id: string; email: string }[]));
  }

  for (const profile of profiles) statuses[profile.email.toLowerCase()] = 'known_profile';
  if (profiles.length === 0) return statuses;

  const openProfileIds = new Set<string>();
  const profileIds = profiles.map(profile => profile.id);
  for (let offset = 0; offset < profileIds.length; offset += batchSize) {
    const batch = profileIds.slice(offset, offset + batchSize);
    const { data, error } = await supabase
      .from('leads')
      .select('profile_id')
      .eq('branch_id', branchId)
      .eq('status', 'open')
      .in('profile_id', batch);

    if (error) {
      console.error('Error checking open leads:', error);
      throw error;
    }

    for (const lead of data || []) openProfileIds.add(lead.profile_id);
  }

  for (const profile of profiles) {
    if (openProfileIds.has(profile.id)) statuses[profile.email.toLowerCase()] = 'open_lead';
  }

  return statuses;
}

/** Move a lead to another stage and record the transition. */
export async function updateLeadStage(leadId: string, stage: string): Promise<Lead> {
  const { data: existing, error: fetchError } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single();

  if (fetchError) {
    console.error('Error fetching lead before stage update:', fetchError);
    throw fetchError;
  }

  const updates: Record<string, string> = {
    stage,
    updated_at: new Date().toISOString(),
  };
  if (stage === 'won') updates.status = 'won';
  if (stage === 'lost') updates.status = 'lost';

  const { data: lead, error: updateError } = await supabase
    .from('leads')
    .update(updates)
    .eq('id', leadId)
    .select()
    .single();

  if (updateError) {
    console.error('Error updating lead stage:', updateError);
    throw updateError;
  }

  const { error: eventError } = await supabase.from('marketing_events').insert({
    event_type: 'lead_stage_change',
    source: 'manual',
    profile_id: existing.profile_id,
    payload: { lead_id: leadId, from: existing.stage, to: stage },
  });

  if (eventError) {
    console.error('Error logging lead stage change:', eventError);
    throw eventError;
  }

  return lead as Lead;
}

/** Update editable lead fields. */
export async function updateLead(leadId: string, patch: Partial<Lead>): Promise<Lead> {
  const {
    id: _id,
    profile: _profile,
    created_at: _createdAt,
    updated_at: _updatedAt,
    ...updates
  } = patch;

  const { data, error } = await supabase
    .from('leads')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', leadId)
    .select()
    .single();

  if (error) {
    console.error('Error updating lead:', error);
    throw error;
  }

  return data as Lead;
}

function splitDelimitedLine(line: string, delimiter: '\t' | ','): string[] {
  if (delimiter === '\t') return line.split('\t').map(value => value.trim());

  const values: string[] = [];
  let value = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      values.push(value.trim());
      value = '';
    } else {
      value += character;
    }
  }

  values.push(value.trim());
  return values;
}

function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim().toLowerCase());
}

function isPhoneLike(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= 7
    && /^[\d\s()+-]+$/.test(trimmed)
    && (trimmed.match(/\d/g) || []).length >= 7;
}

function isMostlyNumeric(rows: string[][], columnIndex: number): boolean {
  const values = rows.map(row => row[columnIndex] || '').filter(Boolean);
  if (values.length === 0) return true;
  const numericValues = values.filter(value => /^[\d\s()+\-.,$%]+$/.test(value));
  return numericValues.length / values.length >= 0.5;
}

function rawRowLine(row: string[]): string {
  return row.join('\t');
}

/** Parse an already-decoded spreadsheet grid without touching the database. */
export function parseLeadRows(rows: string[][]): LeadParseResult {
  const preparedRows = rows
    .map(row => row.map(cell => String(cell ?? '').trim()))
    .filter(row => row.filter(Boolean).length >= 2);

  if (preparedRows.length === 0) return { leads: [], skipped: [] };

  const columnCount = Math.max(...preparedRows.map(row => row.length));
  const emailMatches = Array.from({ length: columnCount }, (_, columnIndex) => (
    preparedRows.reduce((count, row) => count + (isValidEmail(row[columnIndex] || '') ? 1 : 0), 0)
  ));
  const mostEmailMatches = Math.max(...emailMatches);
  if (mostEmailMatches === 0) {
    return {
      leads: [],
      skipped: preparedRows.map(row => ({
        line: rawRowLine(row),
        reason: 'no email column detected',
      })),
    };
  }

  const emailColumn = emailMatches.indexOf(mostEmailMatches);
  const hasHeader = !isValidEmail(preparedRows[0][emailColumn] || '');
  const headers = hasHeader ? preparedRows[0] : null;
  const dataRows = hasHeader ? preparedRows.slice(1) : preparedRows;

  const normalizedHeaders = headers?.map(header => header.toLowerCase().replace(/[_-]+/g, ' ').trim());
  let nameColumn = normalizedHeaders?.findIndex((header, index) => (
    index !== emailColumn && header.includes('contact name')
  )) ?? -1;
  if (nameColumn < 0 && normalizedHeaders) {
    nameColumn = normalizedHeaders.findIndex((header, index) => (
      index !== emailColumn && /(^|\s)name($|\s)/.test(header)
    ));
  }
  if (nameColumn < 0) {
    for (let index = emailColumn - 1; index >= 0; index -= 1) {
      if (!isMostlyNumeric(dataRows, index)) {
        nameColumn = index;
        break;
      }
    }
  }

  let phoneColumn = -1;
  let bestPhoneRatio = 0;
  for (let columnIndex = 0; columnIndex < columnCount; columnIndex += 1) {
    if (columnIndex === emailColumn || columnIndex === nameColumn) continue;
    const values = dataRows.map(row => row[columnIndex] || '').filter(Boolean);
    if (values.length === 0) continue;
    const ratio = values.filter(isPhoneLike).length / values.length;
    if (ratio >= 0.5 && ratio > bestPhoneRatio) {
      bestPhoneRatio = ratio;
      phoneColumn = columnIndex;
    }
  }

  const leads: NewLeadInput[] = [];
  const skipped: { line: string; reason: string }[] = [];
  const seenEmails = new Set<string>();

  for (const row of dataRows) {
    const email = (row[emailColumn] || '').trim().toLowerCase();
    if (!isValidEmail(email)) {
      skipped.push({ line: rawRowLine(row), reason: 'missing or invalid email' });
      continue;
    }
    if (seenEmails.has(email)) {
      skipped.push({ line: rawRowLine(row), reason: 'duplicate in file' });
      continue;
    }
    seenEmails.add(email);

    const fullName = nameColumn >= 0 ? (row[nameColumn] || '').trim() : '';
    const firstSpace = fullName.search(/\s/);
    const firstName = fullName
      ? (firstSpace < 0 ? fullName : fullName.slice(0, firstSpace))
      : email.split('@')[0];
    const lastName = firstSpace < 0 ? '' : fullName.slice(firstSpace).trim();
    const notes = row
      .map((value, columnIndex) => ({ value, columnIndex }))
      .filter(({ value, columnIndex }) => (
        Boolean(value)
        && columnIndex !== emailColumn
        && columnIndex !== nameColumn
        && columnIndex !== phoneColumn
      ))
      .map(({ value, columnIndex }) => `${headers?.[columnIndex] || `Col ${columnIndex + 1}`}: ${value}`)
      .join(' | ');

    leads.push({
      first_name: firstName,
      last_name: lastName,
      email,
      phone: phoneColumn >= 0 && row[phoneColumn] ? row[phoneColumn] : undefined,
      source: 'manual',
      notes: notes || undefined,
      branch_id: '',
      pipeline_id: '',
    });
  }

  return { leads, skipped };
}

/** Split pasted spreadsheet text, then delegate all mapping to parseLeadRows. */
export function parseLeadPaste(raw: string): LeadParseResult {
  const lines = raw.split(/\r?\n/);

  const delimiter: '\t' | ',' = lines.some(line => line.includes('\t')) ? '\t' : ',';
  return parseLeadRows(lines.map(line => splitDelimitedLine(line, delimiter)));
}
