create or replace function public.approve_lead_email_sequence_step(
  p_enrollment_id uuid,
  p_step_number integer
)
returns public.lead_email_sequence_enrollments
language plpgsql
security definer
set search_path = ''
as $$
declare
  enrollment public.lead_email_sequence_enrollments;
  selected_step public.lead_email_sequence_steps;
begin
  if not (select private.can_manage_marketing()) then
    raise exception 'You are not authorized to manage lead sequences';
  end if;

  select * into enrollment
  from public.lead_email_sequence_enrollments
  where id = p_enrollment_id
  for update;

  if enrollment is null or enrollment.status <> 'awaiting_approval' then
    raise exception 'This sequence is not waiting for approval';
  end if;

  select * into selected_step
  from public.lead_email_sequence_steps
  where sequence_id = enrollment.sequence_id
    and step_number = p_step_number;

  if selected_step is null then
    raise exception 'That email is not part of this sequence';
  end if;

  if exists (
    select 1
    from public.lead_email_messages message
    where message.enrollment_id = enrollment.id
      and message.step_id = selected_step.id
      and message.direction = 'outbound'
      and message.status <> 'failed'
  ) then
    raise exception 'That email has already been sent or is currently sending';
  end if;

  update public.lead_email_sequence_enrollments
  set next_step_number = selected_step.step_number,
      status = 'active',
      next_run_at = now(),
      updated_at = now()
  where id = enrollment.id
  returning * into enrollment;

  return enrollment;
end;
$$;

revoke execute on function public.approve_lead_email_sequence_step(uuid, integer) from public, anon;
grant execute on function public.approve_lead_email_sequence_step(uuid, integer) to authenticated;
