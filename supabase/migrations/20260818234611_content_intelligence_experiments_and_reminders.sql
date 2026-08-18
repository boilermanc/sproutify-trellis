-- Hub-native experiments are required for unattended review reminders.
-- The Hub stores orchestration state and conclusions, never customer profiles.

create table if not exists public.content_intelligence_experiments (
  id uuid primary key default uuid_generate_v4(),
  project_id text not null check (project_id ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  experiment_id text not null check (experiment_id ~ '^[a-z0-9][a-z0-9_-]{2,127}$'),
  topic_id text not null,
  post_id text not null,
  hypothesis text not null check (char_length(btrim(hypothesis)) between 10 and 1200),
  success_metrics jsonb not null default '[]'::jsonb
    check (jsonb_typeof(success_metrics) = 'array' and jsonb_array_length(success_metrics) > 0),
  evaluation_window_days integer not null check (evaluation_window_days between 1 and 365),
  review_due_at timestamptz not null,
  status text not null default 'running' check (status in ('planned', 'running', 'reviewed')),
  result_classification text check (result_classification in ('supported', 'mixed', 'unsupported', 'inconclusive')),
  result_summary text,
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, experiment_id),
  foreign key (project_id, topic_id)
    references public.content_intelligence_topics(project_id, topic_id) on delete restrict,
  foreign key (project_id, post_id)
    references public.content_intelligence_posts(project_id, post_id) on delete restrict,
  check (
    (status <> 'reviewed' and result_classification is null and reviewed_by is null and reviewed_at is null)
    or
    (status = 'reviewed' and result_classification is not null and reviewed_by is not null
      and reviewed_at is not null and char_length(btrim(result_summary)) between 10 and 2000)
  )
);

create index if not exists idx_content_intelligence_experiments_due
  on public.content_intelligence_experiments (status, review_due_at)
  where status = 'running';

create index if not exists idx_content_intelligence_experiments_project
  on public.content_intelligence_experiments (project_id, created_at desc);

create index if not exists idx_content_intelligence_experiments_metrics
  on public.content_intelligence_experiments using gin (success_metrics jsonb_path_ops);

alter table public.content_intelligence_experiments enable row level security;
revoke all on table public.content_intelligence_experiments from anon, authenticated;
grant select, insert on table public.content_intelligence_experiments to authenticated;
grant update (status, result_classification, result_summary, reviewed_by, reviewed_at, updated_at)
  on table public.content_intelligence_experiments to authenticated;
grant all on table public.content_intelligence_experiments to service_role;

drop policy if exists "Active Trellis users read content experiments"
  on public.content_intelligence_experiments;
create policy "Active Trellis users read content experiments"
  on public.content_intelligence_experiments
  for select
  to authenticated
  using ((select private.is_active_trellis_user()));

drop policy if exists "Marketing operators create content experiments"
  on public.content_intelligence_experiments;
create policy "Marketing operators create content experiments"
  on public.content_intelligence_experiments
  for insert
  to authenticated
  with check (
    (select private.can_manage_marketing())
    and created_by = (select auth.uid())
    and exists (
      select 1
      from public.content_intelligence_posts post
      where post.project_id = content_intelligence_experiments.project_id
        and post.post_id = content_intelligence_experiments.post_id
        and post.topic_id = content_intelligence_experiments.topic_id
        and post.status = 'published'
    )
  );

drop policy if exists "Marketing operators review content experiments"
  on public.content_intelligence_experiments;
create policy "Marketing operators review content experiments"
  on public.content_intelligence_experiments
  for update
  to authenticated
  using ((select private.can_manage_marketing()))
  with check (
    (select private.can_manage_marketing())
    and (status <> 'reviewed' or reviewed_by = (select auth.uid()))
  );

create or replace function public.register_content_experiment(
  p_project_id text,
  p_experiment_id text,
  p_topic_id text,
  p_post_id text,
  p_hypothesis text,
  p_success_metrics jsonb,
  p_evaluation_window_days integer
)
returns public.content_intelligence_experiments
language plpgsql
security invoker
set search_path = ''
as $$
declare
  published_at_value timestamptz;
  registered public.content_intelligence_experiments;
begin
  if p_success_metrics is null
    or jsonb_typeof(p_success_metrics) <> 'array'
    or jsonb_array_length(p_success_metrics) = 0 then
    raise exception 'At least one success metric is required';
  end if;

  select post.published_at into published_at_value
  from public.content_intelligence_posts post
  where post.project_id = p_project_id
    and post.post_id = p_post_id
    and post.topic_id = p_topic_id
    and post.status = 'published';

  if published_at_value is null then
    raise exception 'The experiment requires an approved published asset in the same project';
  end if;

  insert into public.content_intelligence_experiments (
    project_id, experiment_id, topic_id, post_id, hypothesis, success_metrics,
    evaluation_window_days, review_due_at, status, created_by
  ) values (
    p_project_id, p_experiment_id, p_topic_id, p_post_id, btrim(p_hypothesis), p_success_metrics,
    p_evaluation_window_days, published_at_value + make_interval(days => p_evaluation_window_days),
    'running', (select auth.uid())
  ) returning * into registered;

  return registered;
end;
$$;

create or replace function public.review_content_experiment(
  p_project_id text,
  p_experiment_id text,
  p_result_classification text,
  p_result_summary text
)
returns public.content_intelligence_experiments
language plpgsql
security invoker
set search_path = ''
as $$
declare
  reviewed public.content_intelligence_experiments;
begin
  if p_result_classification not in ('supported', 'mixed', 'unsupported', 'inconclusive') then
    raise exception 'Invalid result classification';
  end if;
  if char_length(btrim(p_result_summary)) < 10 then
    raise exception 'A result summary of at least 10 characters is required';
  end if;

  update public.content_intelligence_experiments
  set status = 'reviewed',
      result_classification = p_result_classification,
      result_summary = btrim(p_result_summary),
      reviewed_by = (select auth.uid()),
      reviewed_at = now(),
      updated_at = now()
  where project_id = p_project_id
    and experiment_id = p_experiment_id
    and status in ('planned', 'running')
  returning * into reviewed;

  if reviewed is null then
    raise exception 'A reviewable experiment was not found';
  end if;
  return reviewed;
end;
$$;

revoke all on function public.register_content_experiment(text, text, text, text, text, jsonb, integer)
  from public, anon;
grant execute on function public.register_content_experiment(text, text, text, text, text, jsonb, integer)
  to authenticated, service_role;

revoke all on function public.review_content_experiment(text, text, text, text)
  from public, anon;
grant execute on function public.review_content_experiment(text, text, text, text)
  to authenticated, service_role;

create table if not exists public.content_experiment_review_reminders (
  id uuid primary key default uuid_generate_v4(),
  project_id text not null,
  experiment_id text not null,
  channel text not null default 'slack' check (channel in ('slack')),
  status text not null default 'pending' check (status in ('pending', 'processing', 'delivered', 'failed')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 3),
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, experiment_id, channel),
  foreign key (project_id, experiment_id)
    references public.content_intelligence_experiments(project_id, experiment_id) on delete restrict
);

create index if not exists idx_content_experiment_review_reminders_claim
  on public.content_experiment_review_reminders (status, next_attempt_at, created_at)
  where status in ('pending', 'failed');

alter table public.content_experiment_review_reminders enable row level security;
revoke all on table public.content_experiment_review_reminders from anon, authenticated;
grant select on table public.content_experiment_review_reminders to authenticated;
grant all on table public.content_experiment_review_reminders to service_role;

drop policy if exists "Active Trellis users read experiment reminders"
  on public.content_experiment_review_reminders;
create policy "Active Trellis users read experiment reminders"
  on public.content_experiment_review_reminders
  for select
  to authenticated
  using ((select private.is_active_trellis_user()));

create or replace function public.enqueue_due_content_experiment_reminders(
  p_as_of timestamptz default now()
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  inserted_count integer;
begin
  insert into public.content_experiment_review_reminders (project_id, experiment_id)
  select experiment.project_id, experiment.experiment_id
  from public.content_intelligence_experiments experiment
  where experiment.status = 'running'
    and experiment.review_due_at <= p_as_of
  on conflict (project_id, experiment_id, channel) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function public.claim_content_experiment_review_reminders(
  p_limit integer default 25
)
returns table (
  reminder_id uuid,
  project_id text,
  experiment_id text,
  post_id text,
  hypothesis text,
  review_due_at timestamptz,
  attempt_count integer
)
language sql
security invoker
set search_path = ''
as $$
  with candidates as (
    select reminder.id
    from public.content_experiment_review_reminders reminder
    where reminder.status in ('pending', 'failed')
      and reminder.next_attempt_at <= now()
      and reminder.attempt_count < 3
    order by reminder.next_attempt_at, reminder.created_at
    for update skip locked
    limit greatest(1, least(p_limit, 100))
  ), claimed as (
    update public.content_experiment_review_reminders reminder
    set status = 'processing',
        attempt_count = reminder.attempt_count + 1,
        locked_at = now(),
        updated_at = now(),
        last_error = null
    from candidates
    where reminder.id = candidates.id
    returning reminder.*
  )
  select claimed.id, claimed.project_id, claimed.experiment_id, experiment.post_id,
    experiment.hypothesis, experiment.review_due_at, claimed.attempt_count
  from claimed
  join public.content_intelligence_experiments experiment
    on experiment.project_id = claimed.project_id
   and experiment.experiment_id = claimed.experiment_id;
$$;

create or replace function public.complete_content_experiment_review_reminder(
  p_reminder_id uuid,
  p_success boolean,
  p_error text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.content_experiment_review_reminders reminder
  set status = case when p_success then 'delivered' else 'failed' end,
      delivered_at = case when p_success then now() else null end,
      last_error = case when p_success then null else left(coalesce(p_error, 'Unknown delivery failure'), 1000) end,
      next_attempt_at = case
        when p_success then reminder.next_attempt_at
        else now() + interval '5 minutes' * power(2::double precision, greatest(reminder.attempt_count - 1, 0))
      end,
      locked_at = null,
      updated_at = now()
  where reminder.id = p_reminder_id
    and reminder.status = 'processing';

  if not found then
    raise exception 'A processing reminder was not found';
  end if;
end;
$$;

revoke all on function public.enqueue_due_content_experiment_reminders(timestamptz)
  from public, anon, authenticated;
grant execute on function public.enqueue_due_content_experiment_reminders(timestamptz)
  to service_role;

revoke all on function public.claim_content_experiment_review_reminders(integer)
  from public, anon, authenticated;
grant execute on function public.claim_content_experiment_review_reminders(integer)
  to service_role;

revoke all on function public.complete_content_experiment_review_reminder(uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.complete_content_experiment_review_reminder(uuid, boolean, text)
  to service_role;
