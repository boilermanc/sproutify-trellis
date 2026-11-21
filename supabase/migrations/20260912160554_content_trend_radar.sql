-- Native content research orchestration. No customer profile data is stored here.
create table if not exists public.content_radar_settings (
  id uuid primary key default uuid_generate_v4(),
  project_id text not null unique check (project_id ~ '^[a-z0-9][a-z0-9_-]{1,62}$'),
  config jsonb not null check (jsonb_typeof(config) = 'object'),
  enabled boolean not null default false,
  next_run_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.content_radar_runs (
  id uuid primary key default uuid_generate_v4(),
  project_id text not null references public.content_radar_settings(project_id),
  status text not null default 'running' check (status in ('running','completed','empty','failed')),
  trigger_kind text not null check (trigger_kind in ('manual','scheduled','csv')),
  config_snapshot jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb check (jsonb_typeof(warnings) = 'array'),
  new_opportunities integer not null default 0 check (new_opportunities >= 0),
  error_message text,
  started_at timestamptz not null default now(),
  lease_expires_at timestamptz not null default (now() + interval '15 minutes'),
  completed_at timestamptz
);
create unique index if not exists content_radar_one_running on public.content_radar_runs(project_id) where status = 'running';
create index if not exists content_radar_runs_history on public.content_radar_runs(project_id, started_at desc);
create index if not exists content_radar_due on public.content_radar_settings(next_run_at) where enabled;
create index if not exists content_radar_config_gin on public.content_radar_settings using gin(config jsonb_path_ops);
create index if not exists content_radar_snapshot_gin on public.content_radar_runs using gin(config_snapshot jsonb_path_ops);
create index if not exists content_radar_warnings_gin on public.content_radar_runs using gin(warnings jsonb_path_ops);

create table if not exists public.content_radar_opportunities (
  id uuid primary key default uuid_generate_v4(),
  project_id text not null references public.content_radar_settings(project_id),
  run_id uuid not null references public.content_radar_runs(id),
  query text not null check (char_length(query) between 1 and 240),
  query_key text not null,
  country text not null,
  title text not null,
  rationale text not null default '',
  buyer_intent text not null default '',
  recommendation text not null check (recommendation in ('new_article','update_existing','needs_review')),
  existing_url text,
  evidence jsonb not null check (jsonb_typeof(evidence) = 'object'),
  validation_notes text not null default '',
  status text not null default 'new' check (status in ('new','drafted','dismissed')),
  draft_status text not null default 'idle' check (draft_status in ('idle','generating','ready','failed')),
  draft jsonb,
  draft_error text,
  draft_token uuid,
  draft_started_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,country,query_key)
);
create index if not exists content_radar_opportunities_run on public.content_radar_opportunities(run_id);
create index if not exists content_radar_opportunities_project on public.content_radar_opportunities(project_id,status,created_at desc);
create index if not exists content_radar_evidence_gin on public.content_radar_opportunities using gin(evidence jsonb_path_ops);
create index if not exists content_radar_draft_gin on public.content_radar_opportunities using gin(draft jsonb_path_ops);

alter table public.content_radar_settings enable row level security;
alter table public.content_radar_runs enable row level security;
alter table public.content_radar_opportunities enable row level security;
revoke all on public.content_radar_settings, public.content_radar_runs, public.content_radar_opportunities from anon, authenticated;
grant all on public.content_radar_settings, public.content_radar_runs, public.content_radar_opportunities to service_role;
drop policy if exists "Service manages radar settings" on public.content_radar_settings;
create policy "Service manages radar settings" on public.content_radar_settings for all to service_role using (true) with check (true);
drop policy if exists "Service manages radar runs" on public.content_radar_runs;
create policy "Service manages radar runs" on public.content_radar_runs for all to service_role using (true) with check (true);
drop policy if exists "Service manages radar opportunities" on public.content_radar_opportunities;
create policy "Service manages radar opportunities" on public.content_radar_opportunities for all to service_role using (true) with check (true);

create or replace function public.claim_content_radar_run(p_project_id text, p_trigger text)
returns public.content_radar_runs language plpgsql security invoker set search_path = '' as $$
declare settings public.content_radar_settings; claimed public.content_radar_runs;
begin
  if p_trigger not in ('manual','scheduled','csv') then raise exception 'Invalid trigger'; end if;
  select * into settings from public.content_radar_settings where project_id=p_project_id for update;
  if not found then raise exception 'Save the brand research settings first'; end if;
  if p_trigger='scheduled' and (not settings.enabled or settings.next_run_at > now()) then return null; end if;
  update public.content_radar_runs set status='failed', completed_at=now(), error_message='The previous scan timed out.'
    where project_id=p_project_id and status='running' and lease_expires_at <= now();
  if exists(select 1 from public.content_radar_runs where project_id=p_project_id and status='running') then return null; end if;
  if p_trigger <> 'csv' and exists(select 1 from public.content_radar_runs where project_id=p_project_id and started_at > now()-interval '5 minutes') then return null; end if;
  insert into public.content_radar_runs(project_id,trigger_kind,config_snapshot)
    values(p_project_id,p_trigger,settings.config) returning * into claimed;
  if p_trigger <> 'csv' then
    update public.content_radar_settings set next_run_at=claimed.lease_expires_at where project_id=p_project_id;
  end if;
  return claimed;
end; $$;

create or replace function public.complete_content_radar_run(p_run_id uuid, p_opportunities jsonb, p_warnings jsonb, p_error text default null)
returns public.content_radar_runs language plpgsql security invoker set search_path = '' as $$
declare claimed public.content_radar_runs; item jsonb; inserted integer; total integer := 0;
begin
  select * into claimed from public.content_radar_runs where id=p_run_id for update;
  if not found or claimed.status <> 'running' then raise exception 'Scan is no longer running'; end if;
  if claimed.lease_expires_at <= now() then raise exception 'Scan lease expired'; end if;
  if jsonb_typeof(p_opportunities) <> 'array' or jsonb_array_length(p_opportunities)>50 then raise exception 'Invalid opportunities'; end if;
  if p_error is null then
    for item in select value from jsonb_array_elements(p_opportunities) loop
      insert into public.content_radar_opportunities(project_id,run_id,query,query_key,country,title,rationale,buyer_intent,recommendation,existing_url,evidence,validation_notes)
        values(claimed.project_id,claimed.id,item->>'query',item->>'query_key',item->>'country',item->>'title',coalesce(item->>'rationale',''),coalesce(item->>'buyer_intent',''),item->>'recommendation',item->>'existing_url',item->'evidence',coalesce(item->>'validation_notes',''))
        on conflict(project_id,country,query_key) do nothing;
      get diagnostics inserted = row_count; total := total + inserted;
    end loop;
  end if;
  update public.content_radar_runs set status=case when p_error is not null then 'failed' when total=0 then 'empty' else 'completed' end,
    warnings=p_warnings,new_opportunities=total,error_message=p_error,completed_at=now() where id=claimed.id returning * into claimed;
  if claimed.trigger_kind <> 'csv' then
    update public.content_radar_settings set next_run_at=now()+
      case when p_error is not null then interval '6 hours'
      when config->>'interval_days'='1' then interval '1 day' else interval '7 days' end
      where project_id=claimed.project_id;
  end if;
  return claimed;
end; $$;

create or replace function public.claim_content_radar_draft(p_project_id text, p_id uuid)
returns public.content_radar_opportunities language plpgsql security invoker set search_path = '' as $$
declare claimed public.content_radar_opportunities;
begin
  update public.content_radar_opportunities set draft_status='generating',draft_token=pg_catalog.gen_random_uuid(),draft_started_at=now(),draft_error=null,updated_at=now()
  where id=p_id and project_id=p_project_id and status <> 'dismissed' and draft is null
    and (draft_status in ('idle','failed') or (draft_status='generating' and draft_started_at < now()-interval '10 minutes'))
  returning * into claimed;
  return claimed;
end; $$;

revoke all on function public.claim_content_radar_run(text,text), public.complete_content_radar_run(uuid,jsonb,jsonb,text), public.claim_content_radar_draft(text,uuid) from public,anon,authenticated;
grant execute on function public.claim_content_radar_run(text,text), public.complete_content_radar_run(uuid,jsonb,jsonb,text), public.claim_content_radar_draft(text,uuid) to service_role;
