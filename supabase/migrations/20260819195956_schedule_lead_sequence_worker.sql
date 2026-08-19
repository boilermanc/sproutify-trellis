create or replace function public.run_lead_sequence_worker_tick()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Recover a claim if the Edge Function crashed before completing it.
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
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInJlZiI6ImhvcnZqcXFpZmdyenhlc3V4dGZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1MzQ2NDYsImV4cCI6MjA4MzExMDY0Nn0.OsAbcDYgyPirTpA76dKfeouDvh19njXOSgZxcRZx_1I',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInJlZiI6ImhvcnZqcXFpZmdyenhlc3V4dGZtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc1MzQ2NDYsImV4cCI6MjA4MzExMDY0Nn0.OsAbcDYgyPirTpA76dKfeouDvh19njXOSgZxcRZx_1I'
    ),
    body := '{}'::jsonb
  );
end;
$$;

revoke all on function public.run_lead_sequence_worker_tick() from public, anon, authenticated;
grant execute on function public.run_lead_sequence_worker_tick() to service_role;

do $$
declare existing_job bigint;
begin
  select jobid into existing_job from cron.job where jobname = 'lead-sequence-worker';
  if existing_job is not null then perform cron.unschedule(existing_job); end if;
  perform cron.schedule('lead-sequence-worker', '*/2 * * * *', 'select public.run_lead_sequence_worker_tick();');
end $$;
