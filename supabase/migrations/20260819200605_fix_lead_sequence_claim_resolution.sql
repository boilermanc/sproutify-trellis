create or replace function public.claim_due_lead_email_messages(p_limit integer default 20)
returns table (
  message_id uuid, enrollment_id uuid, lead_id uuid, profile_id uuid,
  step_id uuid, step_number integer, template_key text, subject text,
  recipient_email text, first_name text, reply_token uuid, branch_slug text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare due_record record;
declare new_message public.lead_email_messages;
begin
  for due_record in
    select enrollment.*, step.id as resolved_step_id, step.step_number as resolved_step_number,
      step.template_key as resolved_template_key, step.subject_template,
      sequence.branch_slug, profile.email, profile.first_name
    from public.lead_email_sequence_enrollments enrollment
    join public.lead_email_sequences sequence on sequence.id = enrollment.sequence_id
    join public.lead_email_sequence_steps step
      on step.sequence_id = enrollment.sequence_id and step.step_number = enrollment.next_step_number
    join public.leads lead on lead.id = enrollment.lead_id
    join public.profiles profile on profile.id = enrollment.profile_id
    where enrollment.status = 'active'
      and enrollment.next_run_at <= now()
      and lead.status = 'open'
      and lead.stage not in ('qualified', 'proposal', 'won', 'lost')
      and profile.marketing_pause = false
      and profile.is_subscribed is distinct from false
      and not exists (
        select 1 from public.email_suppressions suppression
        where lower(suppression.email) = lower(profile.email)
          and suppression.reason in ('unsubscribe', 'bounce', 'complaint')
      )
    order by enrollment.next_run_at, enrollment.started_at
    for update of enrollment skip locked
    limit greatest(1, least(coalesce(p_limit, 20), 100))
  loop
    insert into public.lead_email_messages (
      enrollment_id, step_id, lead_id, profile_id, direction, status,
      recipient_email, subject, body_preview, metadata
    ) values (
      due_record.id, due_record.resolved_step_id, due_record.lead_id, due_record.profile_id,
      'outbound', 'processing', lower(btrim(due_record.email)),
      replace(due_record.subject_template, '{{first_name}}', coalesce(nullif(btrim(due_record.first_name), ''), 'there')),
      due_record.resolved_template_key,
      jsonb_build_object('step_number', due_record.resolved_step_number, 'template_key', due_record.resolved_template_key)
    )
    on conflict (enrollment_id, step_id, direction)
      where enrollment_id is not null and step_id is not null and direction = 'outbound'
    do update set
      status = 'processing', attempt_count = public.lead_email_messages.attempt_count + 1,
      last_error = null, updated_at = now()
    where public.lead_email_messages.status = 'failed'
    returning * into new_message;

    if new_message.id is not null then
      return query select new_message.id, due_record.id, due_record.lead_id,
        due_record.profile_id, due_record.resolved_step_id, due_record.resolved_step_number,
        due_record.resolved_template_key, new_message.subject, lower(btrim(due_record.email)),
        coalesce(nullif(btrim(due_record.first_name), ''), 'there'), due_record.reply_token,
        due_record.branch_slug;
    end if;
    new_message := null;
  end loop;
end;
$$;

revoke all on function public.claim_due_lead_email_messages(integer) from public, anon, authenticated;
grant execute on function public.claim_due_lead_email_messages(integer) to service_role;
