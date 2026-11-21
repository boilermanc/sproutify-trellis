-- Disposable local database only; run after bootstrap and the migration.
BEGIN;
CREATE FUNCTION pg_temp.brief_test_payload(n integer, state text DEFAULT 'draft') RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object(
  'id','30000000-0000-4000-8000-000000000001',
  'version_id',format('40000000-0000-4000-8000-%s',lpad(n::text,12,'0')),
  'brand_id','20000000-0000-4000-8000-000000000001',
  'branch_id','10000000-0000-4000-8000-000000000001','project_id','fixture-nursery',
  'version',n,'status',state,
  'supersedes_version_id',CASE WHEN n=1 THEN NULL ELSE format('40000000-0000-4000-8000-%s',lpad((n-1)::text,12,'0')) END,
  'author_id','50000000-0000-4000-8000-000000000001',
  'reviewer_id',CASE WHEN state='approved' THEN '50000000-0000-4000-8000-000000000001' ELSE NULL END,
  'created_at','2026-09-22T12:00:00Z',
  'approved_at',CASE WHEN state='approved' THEN '2026-09-22T12:00:00Z' ELSE NULL END
 );
$$;
SET LOCAL ROLE service_role;
DO $$ DECLARE saved jsonb; BEGIN
  saved := public.append_opportunity_brief(pg_temp.brief_test_payload(1),NULL);
  IF saved->>'version' <> '1' THEN RAISE EXCEPTION 'Initial append failed'; END IF;
  BEGIN
    PERFORM public.append_opportunity_brief(pg_temp.brief_test_payload(2),NULL);
    RAISE EXCEPTION 'Stale predecessor accepted';
  EXCEPTION WHEN serialization_failure THEN NULL; END;
  BEGIN
    PERFORM public.append_opportunity_brief(pg_temp.brief_test_payload(2)||'{"project_id":"fixture-music"}', '40000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'Wrong project accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.append_opportunity_brief(pg_temp.brief_test_payload(2)||'{"id":"30000000-0000-4000-8000-000000000002"}', '40000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'Wrong family accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  saved := public.append_opportunity_brief(pg_temp.brief_test_payload(2,'approved'),'40000000-0000-4000-8000-000000000001');
  IF saved->>'status' <> 'approved' THEN RAISE EXCEPTION 'Approval append failed'; END IF;
  BEGIN
    PERFORM public.append_opportunity_brief(pg_temp.brief_test_payload(3)||'{"reviewer_id":"50000000-0000-4000-8000-000000000001"}', '40000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'Partial approval metadata was allowed on a draft';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    PERFORM public.append_opportunity_brief(pg_temp.brief_test_payload(3,'approved'),'40000000-0000-4000-8000-000000000002');
    RAISE EXCEPTION 'Repeated approval accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    UPDATE public.opportunity_brief_versions SET status='draft';
    RAISE EXCEPTION 'Service role could mutate snapshots';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    DELETE FROM public.opportunity_brief_versions;
    RAISE EXCEPTION 'Service role could delete snapshots';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF (SELECT count(*) FROM public.opportunity_brief_versions) <> 2 THEN RAISE EXCEPTION 'Unexpected snapshot count'; END IF;
END $$;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM * FROM public.opportunity_brief_versions;
    RAISE EXCEPTION 'Authenticated direct read was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.append_opportunity_brief('{}',NULL);
    RAISE EXCEPTION 'Authenticated append RPC was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN
    PERFORM * FROM public.opportunity_brief_versions;
    RAISE EXCEPTION 'Anonymous direct read was allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.opportunity_brief_versions'::regclass) THEN RAISE EXCEPTION 'RLS is not enabled'; END IF;
END $$;
ROLLBACK;
SELECT 'PASS: append, approval history, conflicts, scope, family, immutable privileges, RPC privileges and RLS' AS result;
