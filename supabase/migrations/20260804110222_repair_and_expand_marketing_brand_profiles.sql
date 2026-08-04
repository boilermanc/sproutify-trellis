-- Make Brand Profiles usable by signed-in Trellis operators and expand them
-- with the company/contact details needed by campaign and compliance flows.

alter table public.marketing_brands
  add column if not exists brand_identity_id uuid references public.brand_identities(id) on delete set null,
  add column if not exists legal_name text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists address_line_1 text,
  add column if not exists address_line_2 text,
  add column if not exists city text,
  add column if not exists state_region text,
  add column if not exists postal_code text,
  add column if not exists country_code text not null default 'US';

alter table public.marketing_brands
  alter column branch_id set not null;

create unique index if not exists idx_marketing_brands_branch_unique
  on public.marketing_brands (branch_id);

create index if not exists idx_marketing_brands_brand_identity
  on public.marketing_brands (brand_identity_id);

create schema if not exists private;

create or replace function private.is_active_trellis_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.trellis_users
    where auth_user_id = (select auth.uid())
      and status = 'active'
  );
$$;

create or replace function private.can_manage_marketing()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.trellis_users
    where auth_user_id = (select auth.uid())
      and role in ('owner', 'admin', 'operator')
      and status = 'active'
  );
$$;

revoke all on function private.is_active_trellis_user() from public, anon;
revoke all on function private.can_manage_marketing() from public, anon;
grant execute on function private.is_active_trellis_user() to authenticated, service_role;
grant execute on function private.can_manage_marketing() to authenticated, service_role;

grant select, insert, update, delete on table public.marketing_brands to authenticated;
grant select, insert on table public.marketing_generations to authenticated;

drop policy if exists "Active Trellis users read brand profiles" on public.marketing_brands;
create policy "Active Trellis users read brand profiles"
  on public.marketing_brands for select to authenticated
  using ((select private.is_active_trellis_user()));

drop policy if exists "Marketing operators create brand profiles" on public.marketing_brands;
create policy "Marketing operators create brand profiles"
  on public.marketing_brands for insert to authenticated
  with check ((select private.can_manage_marketing()));

drop policy if exists "Marketing operators update brand profiles" on public.marketing_brands;
create policy "Marketing operators update brand profiles"
  on public.marketing_brands for update to authenticated
  using ((select private.can_manage_marketing()))
  with check ((select private.can_manage_marketing()));

drop policy if exists "Marketing operators delete brand profiles" on public.marketing_brands;
create policy "Marketing operators delete brand profiles"
  on public.marketing_brands for delete to authenticated
  using ((select private.can_manage_marketing()));

drop policy if exists "Active Trellis users read marketing generations" on public.marketing_generations;
create policy "Active Trellis users read marketing generations"
  on public.marketing_generations for select to authenticated
  using ((select private.is_active_trellis_user()));

drop policy if exists "Marketing operators create marketing generations" on public.marketing_generations;
create policy "Marketing operators create marketing generations"
  on public.marketing_generations for insert to authenticated
  with check ((select private.can_manage_marketing()));

-- Seed one campaign-facing profile per branch from the richer Brand DNA data.
-- Company/contact fields intentionally remain blank until verified.
insert into public.marketing_brands (
  branch_id,
  brand_identity_id,
  name,
  industry,
  description,
  target_audience,
  tone,
  value_proposition,
  primary_color,
  website_url,
  keywords,
  competitors,
  metadata
)
select
  b.id,
  bi.id,
  coalesce(bi.name, b.name),
  case b.slug
    when 'atlurbanfarms' then 'Urban Agriculture & E-commerce'
    when 'rejoice' then 'Faith & Wellness Technology'
    when 'rekkrd' then 'Music Technology & Vinyl Valuation'
    when 'sproutify-farm' then 'Agricultural Technology & Farm Management'
    when 'sweetwater-urban-farms' then 'Urban Agriculture'
    else null
  end,
  bi.mission,
  bi.target_audience,
  bi.voice,
  bi.tagline,
  coalesce(b.primary_color, '#059669'),
  coalesce(bi.website_url, b.website_url),
  '[]'::jsonb,
  '[]'::jsonb,
  case
    when bi.id is null then '{}'::jsonb
    else jsonb_build_object('seeded_from_brand_identity_id', bi.id)
  end
from public.branches b
left join public.brand_identities bi
  on bi.branch_id = b.slug
 and bi.status = 'active'
where not exists (
  select 1
  from public.marketing_brands mb
  where mb.branch_id = b.id
);
