import { supabase } from '../lib/supabase';

export interface NewsletterAudienceRecipient {
  email: string;
  first_name: string;
  last_name?: string;
  customer_id?: string;
}

export async function fetchNewsletterAudience(connectionId: string): Promise<NewsletterAudienceRecipient[]> {
  const { data, error } = await supabase.functions.invoke('spoke-query', {
    body: { op: 'newsletter_audience', connection_id: connectionId },
  });
  if (error) throw new Error(error.message || 'newsletter audience request failed');
  if (data?.error) throw new Error(data.error);
  if (data?.errors?.length) throw new Error(data.errors[0]);

  return ((data?.rows || []) as any[])
    .map(row => ({
      email: String(row.email || '').toLowerCase().trim(),
      first_name: row.first_name || '',
      last_name: row.last_name || undefined,
      customer_id: row.customer_id || undefined,
    }))
    .filter(row => row.email);
}
