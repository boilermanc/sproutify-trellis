-- Exercise only synthetic data in a transaction. Re-run in Trellis during authorized activation.
begin;
do $$
declare
  owner uuid := gen_random_uuid();
  other uuid := gen_random_uuid();
  affected integer;
  invalid_owner jsonb;
begin
  if not (select relrowsecurity from pg_class where oid = 'public.sw_trace_clients'::regclass) then
    raise exception 'Trace RLS is disabled';
  end if;
  if has_table_privilege('anon', 'public.sw_trace_clients', 'SELECT,INSERT,UPDATE,DELETE')
     or has_table_privilege('authenticated', 'public.sw_trace_clients', 'SELECT,INSERT,UPDATE,DELETE')
     or has_any_column_privilege('anon', 'public.sw_trace_clients', 'SELECT,INSERT,UPDATE')
     or has_any_column_privilege('authenticated', 'public.sw_trace_clients', 'SELECT,INSERT,UPDATE') then
    raise exception 'Browser roles have access to Trace data';
  end if;
  if has_table_privilege('service_role', 'public.sw_trace_clients', 'DELETE')
     or has_column_privilege('service_role', 'public.sw_trace_clients', 'id', 'UPDATE') then
    raise exception 'Runtime can remove or reassign a client row';
  end if;
  set local role service_role;
  insert into public.sw_trace_clients (id, payload) values
    (owner, jsonb_build_object('client', jsonb_build_object('id', owner), 'studies', jsonb_build_array(jsonb_build_object('clientId', owner))));

  update public.sw_trace_clients set revision = 2 where id = owner and revision = 1;
  get diagnostics affected = row_count;
  if affected <> 1 then raise exception 'First write failed'; end if;
  update public.sw_trace_clients set revision = 2 where id = owner and revision = 1;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Stale write succeeded'; end if;
  begin
    update public.sw_trace_clients
      set payload = jsonb_build_object('client', jsonb_build_object('id', owner), 'studies',
        jsonb_build_array(jsonb_build_object('clientId', owner, 'evidence', jsonb_build_array(jsonb_build_object('clientId', other)))))
      where id = owner;
    raise exception 'Cross-client nested evidence was accepted';
  exception when check_violation then null;
  end;
  foreach invalid_owner in array array['42'::jsonb, 'null'::jsonb, '{}'::jsonb, jsonb_build_array(owner)] loop
    begin
      update public.sw_trace_clients
        set payload = jsonb_build_object('client', jsonb_build_object('id', owner), 'studies',
          jsonb_build_array(jsonb_build_object('clientId', invalid_owner)))
        where id = owner;
      raise exception 'A non-string nested clientId was accepted';
    exception when check_violation then null;
    end;
  end loop;
  begin
    update public.sw_trace_clients set payload = '{"client": {}, "studies": []}' where id = owner;
    raise exception 'A client without an ID was accepted';
  exception when check_violation then null;
  end;
  reset role;
end $$;
rollback;
