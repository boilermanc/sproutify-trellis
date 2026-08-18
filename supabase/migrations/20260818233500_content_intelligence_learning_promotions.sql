-- Durable, human-approved Content Intelligence learnings.
-- These records are project-scoped conclusions, not profile data or AI drafts.

create table if not exists public.content_intelligence_learnings (
  id uuid primary key default uuid_generate_v4(),
  project_id text not null check (project_id ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  learning_id text not null check (learning_id ~ '^[a-z0-9][a-z0-9_-]{2,127}$'),
  experiment_id text not null check (experiment_id ~ '^[a-z0-9][a-z0-9_-]{2,127}$'),
  post_id text not null,
  evidence_event_ids jsonb not null default '[]'::jsonb
    check (jsonb_typeof(evidence_event_ids) = 'array' and jsonb_array_length(evidence_event_ids) > 0),
  finding text not null check (char_length(btrim(finding)) between 10 and 1200),
  confidence text not null check (confidence in ('low', 'medium', 'high')),
  conditions text not null check (char_length(btrim(conditions)) between 3 and 1200),
  application text not null check (char_length(btrim(application)) between 3 and 1200),
  approved_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (project_id, learning_id),
  foreign key (project_id, post_id)
    references public.content_intelligence_posts(project_id, post_id) on delete restrict
);

create index if not exists idx_content_intelligence_learnings_project
  on public.content_intelligence_learnings (project_id, approved_at desc);

create index if not exists idx_content_intelligence_learnings_evidence
  on public.content_intelligence_learnings using gin (evidence_event_ids jsonb_path_ops);

alter table public.content_intelligence_learnings enable row level security;

revoke all on table public.content_intelligence_learnings from anon, authenticated;
grant select, insert on table public.content_intelligence_learnings to authenticated;
grant all on table public.content_intelligence_learnings to service_role;

drop policy if exists "Active Trellis users read content learnings"
  on public.content_intelligence_learnings;
create policy "Active Trellis users read content learnings"
  on public.content_intelligence_learnings
  for select
  to authenticated
  using ((select private.is_active_trellis_user()));

drop policy if exists "Marketing operators approve content learnings"
  on public.content_intelligence_learnings;
create policy "Marketing operators approve content learnings"
  on public.content_intelligence_learnings
  for insert
  to authenticated
  with check (
    (select private.can_manage_marketing())
    and approved_by = (select auth.uid())
    and exists (
      select 1
      from public.content_intelligence_posts post
      where post.project_id = content_intelligence_learnings.project_id
        and post.post_id = content_intelligence_learnings.post_id
        and post.status = 'published'
    )
  );

create or replace function public.approve_content_learning(
  p_project_id text,
  p_learning_id text,
  p_experiment_id text,
  p_post_id text,
  p_evidence_event_ids jsonb,
  p_finding text,
  p_confidence text,
  p_conditions text,
  p_application text
)
returns public.content_intelligence_learnings
language plpgsql
security invoker
set search_path = ''
as $$
declare
  approved public.content_intelligence_learnings;
begin
  if p_evidence_event_ids is null
    or jsonb_typeof(p_evidence_event_ids) <> 'array'
    or jsonb_array_length(p_evidence_event_ids) = 0 then
    raise exception 'At least one performance event is required';
  end if;

  insert into public.content_intelligence_learnings (
    project_id,
    learning_id,
    experiment_id,
    post_id,
    evidence_event_ids,
    finding,
    confidence,
    conditions,
    application,
    approved_by
  ) values (
    p_project_id,
    p_learning_id,
    p_experiment_id,
    p_post_id,
    p_evidence_event_ids,
    btrim(p_finding),
    p_confidence,
    btrim(p_conditions),
    btrim(p_application),
    (select auth.uid())
  ) returning * into approved;

  return approved;
end;
$$;

revoke all on function public.approve_content_learning(
  text, text, text, text, jsonb, text, text, text, text
) from public, anon;
grant execute on function public.approve_content_learning(
  text, text, text, text, jsonb, text, text, text, text
) to authenticated, service_role;
