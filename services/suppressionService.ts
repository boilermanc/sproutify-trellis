import { supabase } from '../lib/supabase';

// The Hub suppression list (unsubscribes + hard bounces + complaints). Trellis
// reads consent live from spokes, but keeps its own do-not-email list on the Hub
// (populated by the `unsubscribe` and `resend-webhook` edge functions). Campaign
// audiences are filtered against this so suppressed addresses are never emailed.
//
// Suppressions are scoped: 'global' rows (bounces, complaints, all-brand unsubs)
// suppress everywhere; a '<branch slug>' row suppresses only that brand. Pass the
// branch scopes in play so the preview count matches what the sender will actually
// skip: 'global' is always included, plus any branch scopes given. Passing no
// scopes returns global-only (which mirrors a multi-branch campaign's send scope).
export async function fetchSuppressedEmails(branchScopes: string[] = []): Promise<Set<string>> {
  try {
    const scopes = Array.from(new Set(['global', ...branchScopes.map((s) => s.toLowerCase())]));
    const { data, error } = await supabase
      .from('email_suppressions')
      .select('email')
      .in('scope', scopes);
    if (error) throw error;
    return new Set((data || []).map((r: { email: string }) => String(r.email).toLowerCase()));
  } catch (e) {
    console.error('fetchSuppressedEmails failed:', e);
    return new Set(); // fail open on read — never block a send because the list didn't load
  }
}

// Reporting needs to distinguish a voluntary unsubscribe from other suppression
// reasons such as hard bounces or complaints. Unlike the send-time helper above,
// this throws on failure so the UI can show an unknown value instead of a false 0.
export async function fetchUnsubscribedEmails(branchScopes: string[] = []): Promise<Set<string>> {
  const scopes = Array.from(new Set(['global', ...branchScopes.map((scope) => scope.toLowerCase())]));
  const { data, error } = await supabase
    .from('email_suppressions')
    .select('email')
    .eq('reason', 'unsubscribe')
    .in('scope', scopes);
  if (error) throw error;
  return new Set((data || []).map((row: { email: string }) => String(row.email).trim().toLowerCase()).filter(Boolean));
}
