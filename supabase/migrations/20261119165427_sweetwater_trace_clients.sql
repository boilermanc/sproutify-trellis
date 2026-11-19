-- Stage 1 stores a fictional discovery workspace per client. Only the Trace backend uses this table.
create table if not exists public.sw_trace_clients (
  id uuid primary key default uuid_generate_v4(),
  revision integer not null default 1 check (revision > 0),
  payload jsonb not null,
  constraint sw_trace_client_payload check (
    jsonb_typeof(payload -> 'client') is not distinct from 'object'
    and (payload #>> '{client,id}') is not distinct from id::text
    and jsonb_typeof(payload -> 'studies') is not distinct from 'array'
    and not jsonb_path_exists(
      payload, '$.studies.** ? (exists(@.clientId) && @.clientId != $owner)',
      jsonb_build_object('owner', id::text)
    )
  )
);

create index if not exists sw_trace_clients_payload_idx
  on public.sw_trace_clients using gin (payload jsonb_path_ops);

alter table public.sw_trace_clients enable row level security;
revoke all privileges on table public.sw_trace_clients from public, anon, authenticated, service_role;
grant select, insert, update (payload, revision) on table public.sw_trace_clients to service_role;
-- service_role bypasses RLS. Leave browser roles without policies or grants.
