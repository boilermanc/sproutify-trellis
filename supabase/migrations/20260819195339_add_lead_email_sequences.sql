-- Durable, attributable one-to-one lead follow-up sequences.
-- Customer identity remains in profiles; these tables store orchestration state
-- and communication metadata only.

create table if not exists public.lead_email_sequences (
  id uuid primary key default uuid_generate_v4(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{2,62}$'),
  name text not null check (char_length(btrim(name)) between 3 and 120),
  branch_slug text not null,
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lead_email_sequence_steps (
  id uuid primary key default uuid_generate_v4(),
  sequence_id uuid not null references public.lead_email_sequences(id) on delete cascade,
  step_number integer not null check (step_number between 1 and 20),
  delay_days integer not null default 0 check (delay_days between 0 and 365),
  name text not null check (char_length(btrim(name)) between 3 and 120),
  subject_template text not null check (char_length(btrim(subject_template)) between 3 and 300),
  template_key text not null check (template_key ~ '^[a-z0-9][a-z0-9-]{2,80}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sequence_id, step_number)
);

create index if not exists idx_lead_email_sequence_steps_sequence
  on public.lead_email_sequence_steps (sequence_id, step_number);

create table if not exists public.lead_email_sequence_enrollments (
  id uuid primary key default uuid_generate_v4(),
  sequence_id uuid not null references public.lead_email_sequences(id) on delete restrict,
  lead_id uuid not null references public.leads(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  mode text not null default 'approval' check (mode in ('approval', 'automatic')),
  status text not null default 'awaiting_approval'
    check (status in ('active', 'awaiting_approval', 'paused', 'completed', 'exited')),
  next_step_number integer not null default 1 check (next_step_number between 1 and 21),
  next_run_at timestamptz,
  exit_reason text,
  reply_token uuid not null default uuid_generate_v4() unique,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  check (
    (status in ('completed', 'exited') and completed_at is not null)
    or (status not in ('completed', 'exited'))
  )
);

create unique index if not exists idx_lead_email_enrollments_one_live
  on public.lead_email_sequence_enrollments (lead_id, sequence_id)
  where status in ('active', 'awaiting_approval', 'paused');

create index if not exists idx_lead_email_enrollments_due
  on public.lead_email_sequence_enrollments (next_run_at, started_at)
  where status = 'active';

create index if not exists idx_lead_email_enrollments_lead
  on public.lead_email_sequence_enrollments (lead_id, started_at desc);

create table if not exists public.lead_email_messages (
  id uuid primary key default uuid_generate_v4(),
  enrollment_id uuid references public.lead_email_sequence_enrollments(id) on delete set null,
  step_id uuid references public.lead_email_sequence_steps(id) on delete set null,
  lead_id uuid not null references public.leads(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  direction text not null default 'outbound' check (direction in ('outbound', 'inbound')),
  status text not null default 'processing'
    check (status in ('processing', 'sent', 'delivered', 'delivery_delayed', 'opened', 'clicked', 'bounced', 'complained', 'failed', 'suppressed', 'received')),
  recipient_email text not null check (recipient_email = lower(btrim(recipient_email))),
  sender_email text,
  subject text not null,
  body_preview text,
  resend_email_id text,
  provider_event_at timestamptz,
  attempt_count integer not null default 1 check (attempt_count between 0 and 10),
  last_error text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_lead_email_messages_resend_id
  on public.lead_email_messages (resend_email_id)
  where resend_email_id is not null;

create unique index if not exists idx_lead_email_messages_sequence_step
  on public.lead_email_messages (enrollment_id, step_id, direction)
  where enrollment_id is not null and step_id is not null and direction = 'outbound';

create index if not exists idx_lead_email_messages_lead
  on public.lead_email_messages (lead_id, created_at desc);

create index if not exists idx_lead_email_messages_profile
  on public.lead_email_messages (profile_id, created_at desc);

alter table public.lead_email_sequences enable row level security;
alter table public.lead_email_sequence_steps enable row level security;
alter table public.lead_email_sequence_enrollments enable row level security;
alter table public.lead_email_messages enable row level security;

revoke all on table public.lead_email_sequences from anon, authenticated;
revoke all on table public.lead_email_sequence_steps from anon, authenticated;
revoke all on table public.lead_email_sequence_enrollments from anon, authenticated;
revoke all on table public.lead_email_messages from anon, authenticated;
grant select on table public.lead_email_sequences, public.lead_email_sequence_steps,
  public.lead_email_sequence_enrollments, public.lead_email_messages to authenticated;
grant all on table public.lead_email_sequences, public.lead_email_sequence_steps,
  public.lead_email_sequence_enrollments, public.lead_email_messages to service_role;

do $$
declare table_name text;
begin
  foreach table_name in array array[
    'lead_email_sequences', 'lead_email_sequence_steps',
    'lead_email_sequence_enrollments', 'lead_email_messages'
  ] loop
    execute format('drop policy if exists "Active Trellis users read %s" on public.%I', table_name, table_name);
    execute format(
      'create policy "Active Trellis users read %s" on public.%I for select to authenticated using ((select private.is_active_trellis_user()))',
      table_name, table_name
    );
  end loop;
end $$;

insert into public.lead_email_sequences (slug, name, branch_slug, status)
values ('sproutify-farm-new-tower', 'New Tower Farm Welcome', 'sproutify-farm', 'active')
on conflict (slug) do update set
  name = excluded.name,
  branch_slug = excluded.branch_slug,
  status = excluded.status,
  updated_at = now();

insert into public.lead_email_sequence_steps (
  sequence_id, step_number, delay_days, name, subject_template, template_key
)
select sequence.id, values_table.step_number, values_table.delay_days,
  values_table.name, values_table.subject_template, values_table.template_key
from public.lead_email_sequences sequence
cross join (values
  (1, 0, 'Initial introduction', 'Congrats on your new Tower Farm — meet Sproutify Farm! 🎉', 'farm-introduction'),
  (2, 3, 'Quick follow-up', 'Quick follow-up on your Sproutify Farm access', 'farm-follow-up'),
  (3, 5, 'First-harvest value', 'A smoother first harvest starts with the schedule', 'farm-value-add'),
  (4, 7, 'Soft close', 'Should I keep your Sproutify Farm access open?', 'farm-soft-close')
) as values_table(step_number, delay_days, name, subject_template, template_key)
where sequence.slug = 'sproutify-farm-new-tower'
on conflict (sequence_id, step_number) do update set
  delay_days = excluded.delay_days,
  name = excluded.name,
  subject_template = excluded.subject_template,
  template_key = excluded.template_key,
  updated_at = now();

create or replace function public.start_lead_email_sequence(
  p_lead_id uuid,
  p_sequence_slug text default 'sproutify-farm-new-tower',
  p_mode text default 'approval'
)
returns public.lead_email_sequence_enrollments
language plpgsql
security definer
set search_path = ''
as $$
declare
  lead_row public.leads;
  sequence_row public.lead_email_sequences;
  enrollment public.lead_email_sequence_enrollments;
begin
  if not (select private.can_manage_marketing()) then
    raise exception 'You are not authorized to manage lead sequences';
  end if;
  if p_mode not in ('approval', 'automatic') then
    raise exception 'Invalid sequence mode';
  end if;

  select * into lead_row from public.leads where id = p_lead_id;
  if lead_row is null or lead_row.status <> 'open' or lead_row.stage in ('qualified', 'proposal', 'won', 'lost') then
    raise exception 'Only open, unqualified leads can enter a sequence';
  end if;
  if exists (
    select 1 from public.profiles profile
    where profile.id = lead_row.profile_id
      and (profile.marketing_pause = true or profile.is_subscribed = false)
  ) or exists (
    select 1 from public.email_suppressions suppression
    join public.profiles profile on lower(profile.email) = lower(suppression.email)
    where profile.id = lead_row.profile_id
      and suppression.reason in ('unsubscribe', 'bounce', 'complaint')
  ) then
    raise exception 'This lead is suppressed or unsubscribed';
  end if;

  select * into sequence_row
  from public.lead_email_sequences
  where slug = p_sequence_slug and status = 'active';
  if sequence_row is null then raise exception 'Active lead sequence not found'; end if;

  insert into public.lead_email_sequence_enrollments (
    sequence_id, lead_id, profile_id, mode, status, next_run_at, created_by
  ) values (
    sequence_row.id, lead_row.id, lead_row.profile_id, p_mode,
    case when p_mode = 'automatic' then 'active' else 'awaiting_approval' end,
    case when p_mode = 'automatic' then now() else null end,
    (select auth.uid())
  ) returning * into enrollment;

  return enrollment;
end;
$$;

create or replace function public.control_lead_email_sequence(
  p_enrollment_id uuid,
  p_action text
)
returns public.lead_email_sequence_enrollments
language plpgsql
security definer
set search_path = ''
as $$
declare enrollment public.lead_email_sequence_enrollments;
begin
  if not (select private.can_manage_marketing()) then
    raise exception 'You are not authorized to manage lead sequences';
  end if;

  if p_action = 'approve_next' then
    update public.lead_email_sequence_enrollments
      set status = 'active', next_run_at = now(), updated_at = now()
      where id = p_enrollment_id and status = 'awaiting_approval'
      returning * into enrollment;
  elsif p_action = 'pause' then
    update public.lead_email_sequence_enrollments
      set status = 'paused', next_run_at = null, updated_at = now()
      where id = p_enrollment_id and status in ('active', 'awaiting_approval')
      returning * into enrollment;
  elsif p_action = 'resume' then
    update public.lead_email_sequence_enrollments
      set status = case when mode = 'automatic' then 'active' else 'awaiting_approval' end,
          next_run_at = case when mode = 'automatic' then now() else null end,
          updated_at = now()
      where id = p_enrollment_id and status = 'paused'
      returning * into enrollment;
  elsif p_action = 'stop' then
    update public.lead_email_sequence_enrollments
      set status = 'exited', exit_reason = 'manual_stop', next_run_at = null,
          completed_at = now(), updated_at = now()
      where id = p_enrollment_id and status in ('active', 'awaiting_approval', 'paused')
      returning * into enrollment;
  else
    raise exception 'Invalid sequence action';
  end if;

  if enrollment is null then raise exception 'Sequence could not be changed from its current state'; end if;
  return enrollment;
end;
$$;

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
    on conflict (enrollment_id, step_id, direction) where enrollment_id is not null and step_id is not null and direction = 'outbound'
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

create or replace function public.complete_lead_email_message(
  p_message_id uuid,
  p_resend_email_id text,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare message_row public.lead_email_messages;
declare enrollment_row public.lead_email_sequence_enrollments;
declare next_delay integer;
declare next_exists boolean;
begin
  select * into message_row from public.lead_email_messages where id = p_message_id for update;
  if message_row is null then raise exception 'Lead email message not found'; end if;

  if p_error is not null then
    update public.lead_email_messages set status = 'failed', last_error = left(p_error, 1000), updated_at = now()
      where id = p_message_id;
    update public.lead_email_sequence_enrollments
      set status = case when attempt_count >= 3 then 'paused' else 'active' end,
          next_run_at = case when attempt_count >= 3 then null else now() + interval '15 minutes' end,
          updated_at = now()
      from public.lead_email_messages
      where public.lead_email_sequence_enrollments.id = message_row.enrollment_id
        and public.lead_email_messages.id = p_message_id;
    return;
  end if;

  update public.lead_email_messages
    set status = 'sent', resend_email_id = p_resend_email_id, sent_at = now(),
        provider_event_at = now(), updated_at = now()
    where id = p_message_id;

  select * into enrollment_row from public.lead_email_sequence_enrollments
    where id = message_row.enrollment_id for update;
  select exists (
    select 1 from public.lead_email_sequence_steps step
    where step.sequence_id = enrollment_row.sequence_id
      and step.step_number = enrollment_row.next_step_number + 1
  ) into next_exists;

  if not next_exists then
    update public.lead_email_sequence_enrollments
      set status = 'completed', next_step_number = next_step_number + 1,
          next_run_at = null, completed_at = now(), updated_at = now()
      where id = enrollment_row.id;
  else
    select delay_days into next_delay
    from public.lead_email_sequence_steps
    where sequence_id = enrollment_row.sequence_id
      and step_number = enrollment_row.next_step_number + 1;
    update public.lead_email_sequence_enrollments
      set next_step_number = next_step_number + 1,
          status = case when mode = 'automatic' then 'active' else 'awaiting_approval' end,
          next_run_at = case when mode = 'automatic' then now() + make_interval(days => next_delay) else null end,
          updated_at = now()
      where id = enrollment_row.id;
  end if;
end;
$$;

create or replace function public.exit_lead_email_sequences_for_lead()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> 'open' or new.stage in ('qualified', 'proposal', 'won', 'lost') then
    update public.lead_email_sequence_enrollments
      set status = 'exited', exit_reason = 'lead_' || coalesce(new.stage, new.status),
          next_run_at = null, completed_at = now(), updated_at = now()
      where lead_id = new.id and status in ('active', 'awaiting_approval', 'paused');
  end if;
  return new;
end;
$$;

drop trigger if exists exit_lead_email_sequences_on_lead_change on public.leads;
create trigger exit_lead_email_sequences_on_lead_change
after update of stage, status on public.leads
for each row execute function public.exit_lead_email_sequences_for_lead();

revoke all on function public.start_lead_email_sequence(uuid, text, text) from public, anon;
grant execute on function public.start_lead_email_sequence(uuid, text, text) to authenticated, service_role;
revoke all on function public.control_lead_email_sequence(uuid, text) from public, anon;
grant execute on function public.control_lead_email_sequence(uuid, text) to authenticated, service_role;
revoke all on function public.claim_due_lead_email_messages(integer) from public, anon, authenticated;
grant execute on function public.claim_due_lead_email_messages(integer) to service_role;
revoke all on function public.complete_lead_email_message(uuid, text, text) from public, anon, authenticated;
grant execute on function public.complete_lead_email_message(uuid, text, text) to service_role;
revoke all on function public.exit_lead_email_sequences_for_lead() from public, anon, authenticated;

-- Existing direct-send RPC is retained for compatibility, but only marketing
-- operators may use it. New lead sends use the authenticated Edge Function.
create or replace function public.can_send_resend_email()
returns boolean language sql stable security definer set search_path = ''
as $$ select private.can_manage_marketing(); $$;
revoke all on function public.can_send_resend_email() from public, anon;
grant execute on function public.can_send_resend_email() to authenticated, service_role;
