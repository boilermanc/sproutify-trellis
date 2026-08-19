create or replace function public.exit_lead_email_sequences_on_suppression()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.reason in ('unsubscribe', 'bounce', 'complaint') then
    update public.lead_email_sequence_enrollments enrollment
      set status = 'exited', exit_reason = 'email_' || new.reason,
          next_run_at = null, completed_at = now(), updated_at = now()
      from public.profiles profile
      where profile.id = enrollment.profile_id
        and lower(profile.email) = lower(new.email)
        and enrollment.status in ('active', 'awaiting_approval', 'paused');
  end if;
  return new;
end;
$$;

drop trigger if exists exit_lead_email_sequences_on_suppression on public.email_suppressions;
create trigger exit_lead_email_sequences_on_suppression
after insert or update of reason on public.email_suppressions
for each row execute function public.exit_lead_email_sequences_on_suppression();

revoke all on function public.exit_lead_email_sequences_on_suppression()
  from public, anon, authenticated;
