import { supabase } from '../lib/supabase';
import { LeadEmailMessage, LeadEmailSequenceEnrollment, LeadEmailSequenceStep, LeadSequenceMode } from '../types';

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
