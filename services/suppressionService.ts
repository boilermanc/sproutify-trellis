import { supabase } from '../lib/supabase';

// The Hub suppression list (unsubscribes + hard bounces + complaints). Trellis
// reads consent live from spokes, but keeps its own do-not-email list on the Hub
// (populated by the `unsubscribe` and `resend-webhook` edge functions). Campaign
// audiences are filtered against this so suppressed addresses are never emailed.
export async function fetchSuppressedEmails(): Promise<Set<string>> {
  try {
    const { data, error } = await supabase.from('email_suppressions').select('email');
    if (error) throw error;
    return new Set((data || []).map((r: { email: string }) => String(r.email).toLowerCase()));
  } catch (e) {
    console.error('fetchSuppressedEmails failed:', e);
    return new Set(); // fail open on read — never block a send because the list didn't load
  }
}
