import { supabase } from '../lib/supabase';

export interface EventAudienceEvent {
  id: string;
  title: string;
  event_type?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  location?: string | null;
  is_active?: boolean | null;
  registration_enabled?: boolean | null;
  pre_register_enabled?: boolean | null;
}

export interface EventRegistrationRecord {
  id: string;
  event_id: string;
  name: string;
  email: string;
  status: string;
  amount_paid: number | null;
  quantity: number;
  created_at: string;
  updated_at: string;
  event: EventAudienceEvent | null;
}

const INELIGIBLE_EVENT_NOTICE_STATUSES = new Set(['cancelled', 'canceled', 'refunded']);

export const isEventNoticeEligibleStatus = (status?: string | null): boolean => {
  const normalized = String(status || '').trim().toLowerCase();
  return !!normalized && !INELIGIBLE_EVENT_NOTICE_STATUSES.has(normalized);
};

export async function fetchEventAudience(connectionId: string): Promise<EventRegistrationRecord[]> {
  const { data, error } = await supabase.functions.invoke('spoke-query', {
    body: { op: 'event_audience', connection_id: connectionId },
  });
  if (error) throw new Error(error.message || 'event audience request failed');
  if (data?.error) throw new Error(data.error);
  if (data?.errors?.length) throw new Error(data.errors[0]);

  return ((data?.rows || []) as any[])
    .map((row) => ({
      id: String(row.id || ''),
      event_id: String(row.event_id || ''),
      name: String(row.name || '').trim(),
      email: String(row.email || '').toLowerCase().trim(),
      status: String(row.status || '').toLowerCase().trim(),
      amount_paid: row.amount_paid == null ? null : Number(row.amount_paid),
      quantity: Math.max(1, Number(row.quantity) || 1),
      created_at: String(row.created_at || ''),
      updated_at: String(row.updated_at || row.created_at || ''),
      event: row.event ? {
        ...row.event,
        id: String(row.event.id || row.event_id || ''),
        title: String(row.event.title || 'Untitled event'),
      } : null,
    }))
    .filter((row) => row.id && row.email && row.event_id);
}
