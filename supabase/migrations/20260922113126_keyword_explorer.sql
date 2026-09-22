-- Manual, source-labelled keyword research. This is not a keyword-volume store.
create table if not exists public.content_keyword_research_items (
  id uuid primary key default uuid_generate_v4(),
  project_id text not null check (project_id ~ '^[a-z0-9][a-z0-9_-]{1,62}$'),
  phrase text not null check (char_length(phrase) between 1 and 240),
  phrase_key text not null check (char_length(phrase_key) between 1 and 240),
  country text not null check (country ~ '^[A-Z]{2}$'),
  language text not null default 'English' check (char_length(language) between 1 and 80),
  context text not null default '' check (char_length(context) <= 2000),
  research_summary text not null default '' check (char_length(research_summary) <= 12000),
  evidence jsonb not null check (jsonb_typeof(evidence) = 'object'),
  status text not null default 'new' check (status in ('new','investigating','approved','dismissed')),
  approved_opportunity_id uuid references public.content_radar_opportunities(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, country, phrase_key)
);
create index if not exists content_keyword_research_project on public.content_keyword_research_items(project_id, status, created_at desc);
create index if not exists content_keyword_research_evidence_gin on public.content_keyword_research_items using gin(evidence jsonb_path_ops);

alter table public.content_keyword_research_items enable row level security;
revoke all on public.content_keyword_research_items from anon, authenticated;
grant all on public.content_keyword_research_items to service_role;
drop policy if exists "Service manages keyword research" on public.content_keyword_research_items;
create policy "Service manages keyword research" on public.content_keyword_research_items for all to service_role using (true) with check (true);
