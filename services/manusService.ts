import { supabase } from '../lib/supabase';

// Client wrapper for the `manus` Edge Function. The Manus API key lives in
// tenant_secrets and never reaches the browser — every call is proxied
// server-side by the edge function. Phase 2 adds research(leadId) + status.

export interface ManusTestResult {
  ok: boolean;
  error?: string;
}

export interface LeadResearchAttachment {
  name: string;
  url: string;
  size: number | null;
}

export type LeadResearchStatus = 'queued' | 'running' | 'complete' | 'failed';

export interface LeadResearch {
  id: string;
  lead_id: string;
  profile_id: string;
  branch_id: string;
  manus_task_id: string;
  manus_task_url: string | null;
  status: LeadResearchStatus;
  model: string | null;
  result_md: string | null;
  attachments: LeadResearchAttachment[];
  error: string | null;
  credit_usage: number | null;
  created_at: string;
  completed_at: string | null;
}

export interface StartDeepDiveResult {
  ok: boolean;
  error?: string;
  research_id?: string;
}

/** Kick off a Manus deep-dive research task for a lead. Result arrives async. */
export async function startDeepDive(leadId: string): Promise<StartDeepDiveResult> {
  try {
    const { data, error } = await supabase.functions.invoke('manus', {
      body: { op: 'research', leadId },
    });
    if (error) return { ok: false, error: error.message };
    return { ok: data?.ok === true, error: data?.error, research_id: data?.research_id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed to start deep dive' };
  }
}

/** Fetch all deep-dive research rows for a lead, newest first. */
export async function fetchLeadResearch(leadId: string): Promise<LeadResearch[]> {
  const { data, error } = await supabase
    .from('lead_research')
    .select('*')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[manus] fetchLeadResearch failed:', error.message);
    return [];
  }
  return (data || []) as LeadResearch[];
}

/**
 * Validate a Manus API key against the Manus API. Pass a freshly-typed key to
 * verify it before saving; omit it to test the key already stored in the vault.
 */
export async function testManusConnection(apiKey?: string): Promise<ManusTestResult> {
  try {
    const { data, error } = await supabase.functions.invoke('manus', {
      body: { op: 'test', apiKey: apiKey?.trim() || undefined },
    });
    if (error) return { ok: false, error: error.message };
    return { ok: data?.ok === true, error: data?.error };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Test failed' };
  }
}
