import { supabase } from '../lib/supabase';
import { ApiKeyConfig } from '../types';

// Secrets are read and written through the `tenant-secrets` Edge Function,
// NOT by querying tenant_secrets directly. That table holds every third-party
// credential the org owns in plaintext; querying it from the browser meant
// anyone who copied the public anon key out of the bundle could read all of
// them. The function runs server-side with the service_role key and requires a
// signed-in user, which is also what makes it safe to enable RLS on the table.
//
// The organizationId parameter is kept for call-site compatibility but is
// ignored — the function pins the org server-side so a caller cannot ask for
// another org's secrets.

const DEFAULT_SECRETS: ApiKeyConfig = {
  active_llm: 'gemini',
  gemini_api_key: '',
  openai_api_key: '',
  anthropic_api_key: '',
  n8n_webhooks: { chat: '', workflow: '' },
  slack_webhook: '',
  resend_token: '',
  resend_from_address: '',
  twilio_sid: '',
  twilio_token: '',
  woo_consumer_key: '',
  woo_consumer_secret: '',
};

export async function fetchSecrets(_organizationId?: string): Promise<ApiKeyConfig> {
  try {
    const { data, error } = await supabase.functions.invoke('tenant-secrets', {
      body: { op: 'get' },
    });

    if (error) {
      console.warn('[secrets] fetch failed, using defaults:', error.message);
      return DEFAULT_SECRETS;
    }
    if (!data?.secrets) {
      console.warn('[secrets] no secrets returned, using defaults');
      return DEFAULT_SECRETS;
    }

    // Merge over defaults so a column added later can't leave a field undefined.
    return { ...DEFAULT_SECRETS, ...data.secrets };
  } catch (err) {
    console.warn('[secrets] fetch threw, using defaults:', err);
    return DEFAULT_SECRETS;
  }
}

export async function saveSecrets(
  _organizationId: string,
  secrets: ApiKeyConfig,
): Promise<boolean> {
  try {
    const { data, error } = await supabase.functions.invoke('tenant-secrets', {
      body: { op: 'save', secrets },
    });

    if (error) {
      console.error('[secrets] save failed:', error.message);
      return false;
    }
    // The function reports a rejected write in the payload, not as a transport
    // error — checking only `error` would report success on a failed save.
    if (data?.success !== true) {
      console.error('[secrets] save rejected:', data?.error || 'unknown reason');
      return false;
    }
    return true;
  } catch (err) {
    console.error('[secrets] save threw:', err);
    return false;
  }
}
