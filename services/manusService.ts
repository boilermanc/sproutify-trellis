import { supabase } from '../lib/supabase';

// Client wrapper for the `manus` Edge Function. The Manus API key lives in
// tenant_secrets and never reaches the browser — every call is proxied
// server-side by the edge function. Phase 2 adds research(leadId) + status.

export interface ManusTestResult {
  ok: boolean;
  error?: string;
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
