-- Supabase's rotated signing keys reject the retired legacy anon JWT. Scheduled
-- Edge Function calls use the project's active publishable key instead.
create or replace function public.run_lead_sequence_worker_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.lead_email_messages message
    set status = 'failed', last_error = 'Worker claim timed out', updated_at = now()
    where message.status = 'processing'
      and message.updated_at < now() - interval '15 minutes';

  update public.lead_email_sequence_enrollments enrollment
    set status = 'active', next_run_at = now(), updated_at = now()
    where enrollment.status = 'active'
      and exists (
        select 1 from public.lead_email_messages message
        where message.enrollment_id = enrollment.id
          and message.status = 'failed'
          and message.attempt_count < 3
      );

  perform net.http_post(
    url := 'https://horvjqqifgrzxesuxtfm.supabase.co/functions/v1/lead-sequence-worker',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_zWyQx_0VprPkYX1BCqJc1g_Mwhl-iuY',
      'Authorization', 'Bearer sb_publishable_zWyQx_0VprPkYX1BCqJc1g_Mwhl-iuY'
    ),
    body := '{}'::jsonb
  );
end;
$$;
