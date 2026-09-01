-- An unsubscribe means an open sales lead is no longer actionable. Keep won,
-- already-lost, and recycled leads unchanged so marketing consent does not
-- rewrite completed sales outcomes.
create or replace function public.mark_unsubscribed_open_leads_lost()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.reason = 'unsubscribe' then
    insert into public.marketing_events (event_type, source, profile_id, payload)
    select
      'lead_stage_change',
      'unsubscribe',
      lead.profile_id,
      jsonb_build_object(
        'lead_id', lead.id,
        'branch_id', lead.branch_id,
        'pipeline_id', lead.pipeline_id,
        'from', lead.stage,
        'to', 'lost',
        'reason', 'unsubscribe'
      )
    from public.leads as lead
    join public.profiles as profile on profile.id = lead.profile_id
    join public.branches as branch on branch.id = lead.branch_id
    where lower(profile.email) = lower(new.email)
      and (new.scope = 'global' or lower(branch.slug) = lower(new.scope))
      and lead.status = 'open';

    update public.leads as lead
      set status = 'lost',
          stage = 'lost',
          next_action_at = null,
          updated_at = now()
    from public.profiles as profile, public.branches as branch
    where profile.id = lead.profile_id
      and branch.id = lead.branch_id
      and lower(profile.email) = lower(new.email)
      and (new.scope = 'global' or lower(branch.slug) = lower(new.scope))
      and lead.status = 'open';
  end if;

  return new;
end;
$$;

drop trigger if exists mark_unsubscribed_open_leads_lost on public.email_suppressions;
create trigger mark_unsubscribed_open_leads_lost
after insert or update of reason, scope on public.email_suppressions
for each row execute function public.mark_unsubscribed_open_leads_lost();

revoke all on function public.mark_unsubscribed_open_leads_lost()
  from public, anon, authenticated;

-- Bring existing voluntary unsubscribes into the same state. The EXISTS keeps
-- this idempotent when an address has both branch and global suppression rows.
insert into public.marketing_events (event_type, source, profile_id, payload)
select
  'lead_stage_change',
  'unsubscribe_backfill',
  lead.profile_id,
  jsonb_build_object(
    'lead_id', lead.id,
    'branch_id', lead.branch_id,
    'pipeline_id', lead.pipeline_id,
    'from', lead.stage,
    'to', 'lost',
    'reason', 'unsubscribe'
  )
from public.leads as lead
join public.profiles as profile on profile.id = lead.profile_id
join public.branches as branch on branch.id = lead.branch_id
where lead.status = 'open'
  and exists (
    select 1
    from public.email_suppressions as suppression
    where suppression.reason = 'unsubscribe'
      and lower(suppression.email) = lower(profile.email)
      and (suppression.scope = 'global' or lower(suppression.scope) = lower(branch.slug))
  );

update public.leads as lead
  set status = 'lost',
      stage = 'lost',
      next_action_at = null,
      updated_at = now()
from public.profiles as profile, public.branches as branch
where profile.id = lead.profile_id
  and branch.id = lead.branch_id
  and lead.status = 'open'
  and exists (
    select 1
    from public.email_suppressions as suppression
    where suppression.reason = 'unsubscribe'
      and lower(suppression.email) = lower(profile.email)
      and (suppression.scope = 'global' or lower(suppression.scope) = lower(branch.slug))
  );
