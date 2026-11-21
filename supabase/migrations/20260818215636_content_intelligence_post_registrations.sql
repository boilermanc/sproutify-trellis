-- Durable, human-approved publication registrations for Content Intelligence.
-- Working drafts and customer profiles remain outside this table.

create table if not exists public.content_intelligence_topics (
  id uuid primary key default uuid_generate_v4(),
  project_id text not null check (project_id ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  topic_id text not null check (topic_id ~ '^[a-z0-9][a-z0-9_-]{2,127}$'),
  title text not null check (char_length(btrim(title)) between 3 and 240),
  cluster text not null default '',
  intent text not null default '',
  source text not null default 'publication_review',
  status text not null default 'active' check (status in ('active', 'paused', 'retired')),
  created_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, topic_id)
);

create index if not exists idx_content_intelligence_topics_project
  on public.content_intelligence_topics (project_id, status);

create table if not exists public.content_intelligence_posts (
  id uuid primary key default uuid_generate_v4(),
  project_id text not null check (project_id ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  post_id text not null check (post_id ~ '^[a-z0-9][a-z0-9_-]{2,127}$'),
  topic_id text not null,
  platform text not null check (platform in ('instagram', 'facebook')),
  status text not null default 'published' check (status = 'published'),
  canonical_url text not null check (canonical_url ~* '^https://[^[:space:]]+$'),
  published_at timestamptz not null,
  task_id text,
  title text,
  primary_query text not null default '',
  notes text not null default '',
  source_record_id uuid not null references public.scheduled_social_posts(id) on delete restrict,
  external_post_id text,
  approved_by uuid not null default auth.uid() references auth.users(id) on delete restrict,
  approved_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, post_id),
  unique (source_record_id),
  foreign key (project_id, topic_id)
    references public.content_intelligence_topics(project_id, topic_id) on delete restrict
);

create index if not exists idx_content_intelligence_posts_project_published
  on public.content_intelligence_posts (project_id, published_at desc);

create index if not exists idx_content_intelligence_posts_topic
  on public.content_intelligence_posts (project_id, topic_id);

create unique index if not exists idx_content_intelligence_posts_external_identity
  on public.content_intelligence_posts (project_id, platform, external_post_id)
  where external_post_id is not null and btrim(external_post_id) <> '';

alter table public.content_intelligence_topics enable row level security;
alter table public.content_intelligence_posts enable row level security;

revoke all on table public.content_intelligence_topics from anon, authenticated;
revoke all on table public.content_intelligence_posts from anon, authenticated;
grant select, insert on table public.content_intelligence_topics to authenticated;
grant select, insert on table public.content_intelligence_posts to authenticated;
grant all on table public.content_intelligence_topics to service_role;
grant all on table public.content_intelligence_posts to service_role;

drop policy if exists "Active Trellis users read content topics"
  on public.content_intelligence_topics;
create policy "Active Trellis users read content topics"
  on public.content_intelligence_topics
  for select
  to authenticated
  using ((select private.is_active_trellis_user()));

drop policy if exists "Marketing operators create content topics"
  on public.content_intelligence_topics;
create policy "Marketing operators create content topics"
  on public.content_intelligence_topics
  for insert
  to authenticated
  with check (
    (select private.can_manage_marketing())
    and created_by = (select auth.uid())
  );

drop policy if exists "Active Trellis users read content registrations"
  on public.content_intelligence_posts;
create policy "Active Trellis users read content registrations"
  on public.content_intelligence_posts
  for select
  to authenticated
  using ((select private.is_active_trellis_user()));

drop policy if exists "Marketing operators approve content registrations"
  on public.content_intelligence_posts;
create policy "Marketing operators approve content registrations"
  on public.content_intelligence_posts
  for insert
  to authenticated
  with check (
    (select private.can_manage_marketing())
    and approved_by = (select auth.uid())
    and exists (
      select 1
      from public.scheduled_social_posts scheduled
      where scheduled.id = source_record_id
        and scheduled.status = 'published'
        and scheduled.branch_slug = project_id
        and scheduled.platform = platform
        and scheduled.post_id is not distinct from external_post_id
    )
  );

create or replace function public.approve_content_registration(
  p_project_id text,
  p_topic_id text,
  p_topic_title text,
  p_post_id text,
  p_platform text,
  p_canonical_url text,
  p_published_at timestamptz,
  p_source_record_id uuid,
  p_external_post_id text default null,
  p_task_id text default null,
  p_title text default null
)
returns public.content_intelligence_posts
language plpgsql
security invoker
set search_path = ''
as $$
declare
  approved public.content_intelligence_posts;
begin
  insert into public.content_intelligence_topics (
    project_id, topic_id, title, created_by
  ) values (
    p_project_id, p_topic_id, p_topic_title, (select auth.uid())
  ) on conflict (project_id, topic_id) do nothing;

  insert into public.content_intelligence_posts (
    project_id, post_id, topic_id, platform, canonical_url, published_at,
    source_record_id, external_post_id, task_id, title, approved_by
  ) values (
    p_project_id, p_post_id, p_topic_id, p_platform, p_canonical_url, p_published_at,
    p_source_record_id, nullif(p_external_post_id, ''), nullif(p_task_id, ''),
    nullif(p_title, ''), (select auth.uid())
  ) returning * into approved;

  return approved;
end;
$$;

revoke all on function public.approve_content_registration(
  text, text, text, text, text, text, timestamptz, uuid, text, text, text
) from public, anon;
grant execute on function public.approve_content_registration(
  text, text, text, text, text, text, timestamptz, uuid, text, text, text
) to authenticated, service_role;
