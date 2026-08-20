import { supabase } from '../lib/supabase';
import { LeadEmailMessage, LeadEmailSequenceEnrollment, LeadEmailSequenceStep, LeadSequenceMode } from '../types';

export interface LeadEmailOutboxMessage {
  id: string;
  lead_id: string;
  recipient_email: string;
  subject: string;
  status: string;
  resend_email_id: string | null;
  body_preview: string | null;
  created_at: string;
  sent_at: string | null;
  provider_event_at: string | null;
  last_error: string | null;
  step: { step_number: number; name: string } | null;
  enrollment: { exit_reason: string | null } | null;
  events: string[];
  clicked_links: Array<{ url: string; clicked_at: string; count: number }>;
}

const OUTBOX_BATCH_SIZE = 200;
const OUTBOX_PAGE_SIZE = 1000;
const OUTBOX_MAX_PAGES = 100;

export async function fetchLeadEmailOutbox(leadIds: string[]): Promise<LeadEmailOutboxMessage[]> {
  if (leadIds.length === 0) return [];

  const messages: LeadEmailOutboxMessage[] = [];
  for (let offset = 0; offset < leadIds.length; offset += OUTBOX_BATCH_SIZE) {
    const batch = leadIds.slice(offset, offset + OUTBOX_BATCH_SIZE);
    for (let page = 0; page < OUTBOX_MAX_PAGES; page++) {
      const from = page * OUTBOX_PAGE_SIZE;
      const { data, error } = await supabase
        .from('lead_email_messages')
        .select('id,lead_id,recipient_email,subject,status,resend_email_id,body_preview,created_at,sent_at,provider_event_at,last_error,step:lead_email_sequence_steps(step_number,name),enrollment:lead_email_sequence_enrollments(exit_reason)')
        .in('lead_id', batch)
        .eq('direction', 'outbound')
        .order('created_at', { ascending: false })
        .range(from, from + OUTBOX_PAGE_SIZE - 1);
      if (error) throw error;
      messages.push(...(data || []).map((row: any) => ({
        ...row,
        step: Array.isArray(row.step) ? row.step[0] || null : row.step || null,
        enrollment: Array.isArray(row.enrollment) ? row.enrollment[0] || null : row.enrollment || null,
        events: [],
        clicked_links: [],
      })));
      if ((data || []).length < OUTBOX_PAGE_SIZE) break;
    }
  }

  const eventsByMessage = new Map<string, Set<string>>();
  const clickedLinksByMessage = new Map<string, Map<string, { url: string; clicked_at: string; count: number }>>();
  const recipientByResendId = new Map(
    messages
      .filter(message => message.resend_email_id)
      .map(message => [message.resend_email_id as string, message.recipient_email.trim().toLowerCase()]),
  );
  const resendIds = [...new Set(messages.map(message => message.resend_email_id).filter((id): id is string => !!id))];
  for (let offset = 0; offset < resendIds.length; offset += OUTBOX_BATCH_SIZE) {
    const batch = resendIds.slice(offset, offset + OUTBOX_BATCH_SIZE);
    for (let page = 0; page < OUTBOX_MAX_PAGES; page++) {
      const from = page * OUTBOX_PAGE_SIZE;
      const { data, error } = await supabase
        .from('email_events')
        .select('resend_email_id,event_type,email,link_url,occurred_at')
        .in('resend_email_id', batch)
        .order('occurred_at', { ascending: true })
        .range(from, from + OUTBOX_PAGE_SIZE - 1);
      if (error) throw error;
      for (const event of data || []) {
        if (!event.resend_email_id) continue;
        const leadRecipient = recipientByResendId.get(event.resend_email_id);
        if (!leadRecipient || String(event.email || '').trim().toLowerCase() !== leadRecipient) continue;
        const statuses = eventsByMessage.get(event.resend_email_id) || new Set<string>();
        statuses.add(event.event_type);
        eventsByMessage.set(event.resend_email_id, statuses);
        const clickedUrl = event.event_type === 'clicked' ? String(event.link_url || '').trim() : '';
        if (clickedUrl) {
          const links = clickedLinksByMessage.get(event.resend_email_id) || new Map();
          const existing = links.get(clickedUrl);
          links.set(clickedUrl, {
            url: clickedUrl,
            clicked_at: String(event.occurred_at || existing?.clicked_at || ''),
            count: (existing?.count || 0) + 1,
          });
          clickedLinksByMessage.set(event.resend_email_id, links);
        }
      }
      if ((data || []).length < OUTBOX_PAGE_SIZE) break;
    }
  }

  return messages
    .map(message => {
      const recipientEvents = Array.from(message.resend_email_id ? eventsByMessage.get(message.resend_email_id) || [] : []);
      const fallbackStatus = !message.resend_email_id || recipientEvents.length === 0 ? [message.status] : [];
      const inferredOpen = recipientEvents.includes('clicked') && !recipientEvents.includes('opened');
      return {
        ...message,
        clicked_links: Array.from(message.resend_email_id ? clickedLinksByMessage.get(message.resend_email_id)?.values() || [] : [])
          .sort((a, b) => b.clicked_at.localeCompare(a.clicked_at)),
        events: [
          ...(message.sent_at ? ['sent'] : []),
          ...recipientEvents,
          ...fallbackStatus,
          ...(inferredOpen ? ['opened_inferred'] : []),
          ...(message.enrollment?.exit_reason === 'replied' ? ['replied'] : []),
        ].filter((status, index, statuses) => statuses.indexOf(status) === index),
      };
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function fetchLeadSequence(leadId: string): Promise<LeadEmailSequenceEnrollment | null> {
  const { data: enrollment, error } = await supabase
    .from('lead_email_sequence_enrollments')
    .select('id,sequence_id,lead_id,profile_id,mode,status,next_step_number,next_run_at,exit_reason,started_at,completed_at,sequence:lead_email_sequences(id,name,slug)')
    .eq('lead_id', leadId)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!enrollment) return null;

  const [stepResult, messageResult] = await Promise.all([
    supabase.from('lead_email_sequence_steps').select('id,step_number,delay_days,name,subject_template,template_key')
      .eq('sequence_id', enrollment.sequence_id).order('step_number'),
    supabase.from('lead_email_messages').select('id,enrollment_id,step_id,direction,status,subject,resend_email_id,body_preview,created_at,sent_at,provider_event_at,last_error')
      .eq('enrollment_id', enrollment.id).order('created_at', { ascending: false }),
  ]);
  if (stepResult.error) throw stepResult.error;
  if (messageResult.error) throw messageResult.error;

  return {
    ...(enrollment as any),
    sequence: Array.isArray((enrollment as any).sequence) ? (enrollment as any).sequence[0] : (enrollment as any).sequence,
    steps: (stepResult.data || []) as LeadEmailSequenceStep[],
    messages: (messageResult.data || []) as LeadEmailMessage[],
  } as LeadEmailSequenceEnrollment;
}
async function runWorker(): Promise<void> {
  const { error } = await supabase.functions.invoke('lead-sequence-worker', { body: {} });
  if (error) throw error;
}

export async function startLeadSequence(leadId: string, mode: LeadSequenceMode): Promise<void> {
  const { error } = await supabase.rpc('start_lead_email_sequence', {
    p_lead_id: leadId,
    p_sequence_slug: 'sproutify-farm-new-tower',
    p_mode: mode,
  });
  if (error) throw error;
  if (mode === 'automatic') await runWorker();
}

export async function controlLeadSequence(
  enrollmentId: string,
  action: 'approve_next' | 'pause' | 'resume' | 'stop',
): Promise<void> {
  const { error } = await supabase.rpc('control_lead_email_sequence', {
    p_enrollment_id: enrollmentId,
    p_action: action,
  });
  if (error) throw error;
  if (action === 'approve_next' || action === 'resume') await runWorker();
}
