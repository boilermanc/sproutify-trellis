import { supabase } from '../lib/supabase';
import { ApiKeyConfig } from '../types';

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

export async function fetchSecrets(organizationId: string): Promise<ApiKeyConfig> {
  const { data, error } = await supabase
    .from('tenant_secrets')
    .select('*')
    .eq('organization_id', organizationId)
    .single();

  if (error) {
    console.warn('No secrets found, returning defaults');
    return DEFAULT_SECRETS;
  }

  return {
    active_llm: data.active_llm || 'gemini',
    gemini_api_key: data.gemini_api_key || '',
    openai_api_key: data.openai_api_key || '',
    anthropic_api_key: data.anthropic_api_key || '',
    n8n_webhooks: {
      chat: data.n8n_webhook_chat || '',
      workflow: data.n8n_webhook_workflow || '',
    },
    slack_webhook: data.slack_webhook || '',
    resend_token: data.resend_token || '',
    resend_from_address: data.resend_from_address || '',
    twilio_sid: data.twilio_sid || '',
    twilio_token: data.twilio_token || '',
    woo_consumer_key: data.woo_consumer_key || '',
    woo_consumer_secret: data.woo_consumer_secret || '',
  };
}

export async function saveSecrets(organizationId: string, secrets: ApiKeyConfig): Promise<boolean> {
  // Flatten n8n_webhooks for database storage
  const { n8n_webhooks, ...rest } = secrets;
  const { error } = await supabase
    .from('tenant_secrets')
    .upsert({
      organization_id: organizationId,
      ...rest,
      n8n_webhook_chat: n8n_webhooks.chat,
      n8n_webhook_workflow: n8n_webhooks.workflow,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'organization_id' });

  if (error) {
    console.error('Failed to save secrets');
    return false;
  }
  return true;
}
