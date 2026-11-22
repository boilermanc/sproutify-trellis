-- Run after the disposable fixture and the actual RPC migration, never on production.
BEGIN;

DO $$ BEGIN
  IF has_function_privilege('anon','public.trellis_upsert_youtube_daily_metrics(jsonb)','EXECUTE')
     OR has_function_privilege('authenticated','public.trellis_upsert_youtube_daily_metrics(jsonb)','EXECUTE')
     OR NOT has_function_privilege('service_role','public.trellis_upsert_youtube_daily_metrics(jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'RPC execution grants are not service-role-only';
  END IF;
  IF (SELECT prosecdef FROM pg_proc WHERE oid='public.trellis_upsert_youtube_daily_metrics(jsonb)'::regprocedure) THEN
    RAISE EXCEPTION 'RPC must not acquire definer privileges';
  END IF;
END $$;

SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN
    PERFORM public.trellis_upsert_youtube_daily_metrics('[]'::jsonb);
    RAISE EXCEPTION 'Anonymous RPC execution unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.trellis_upsert_youtube_daily_metrics('[]'::jsonb);
    RAISE EXCEPTION 'Authenticated RPC execution unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

INSERT INTO public.trellis_youtube_daily_metrics
  (youtube_video_id,metric_date,episode_id,publication_id,studio_album_id,studio_publication_id,views)
VALUES
  ('existing-ep','2026-11-20','00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002',NULL,NULL,1),
  ('existing-st','2026-11-20',NULL,NULL,'00000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000004',2);

SET LOCAL ROLE service_role;
DO $$
DECLARE
  ep jsonb := '{"episode_id":"00000000-0000-4000-8000-000000000005","publication_id":"00000000-0000-4000-8000-000000000006","studio_album_id":null,"studio_publication_id":null}';
  studio jsonb := '{"episode_id":null,"publication_id":null,"studio_album_id":"00000000-0000-4000-8000-000000000007","studio_publication_id":"00000000-0000-4000-8000-000000000008"}';
  latest jsonb := '{"views":31,"engaged_views":5,"estimated_minutes_watched":7.5,"average_view_duration":3.25,"average_view_percentage":50,"likes":4,"comments":6,"shares":3,"subscribers_gained":9,"subscribers_lost":2,"traffic_sources":{"browse":2},"countries":{"US":3},"raw":{"revision":"latest"}}';
  payload jsonb;
  r public.trellis_youtube_daily_metrics%ROWTYPE;
  old_id uuid;
  old_created timestamptz;
  n integer;
  rejected boolean;
  invalid jsonb;
BEGIN
  IF public.trellis_upsert_youtube_daily_metrics('[]'::jsonb) IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'Empty batch must be a no-op';
  END IF;
  SELECT id,created_at INTO old_id,old_created FROM public.trellis_youtube_daily_metrics WHERE youtube_video_id='existing-ep';
  payload:=jsonb_build_array(
    studio||latest||'{"youtube_video_id":"existing-ep","metric_date":"2026-11-20","synced_at":"2026-11-21T10:00:00Z"}'::jsonb,
    ep||'{"youtube_video_id":"existing-st","metric_date":"2026-11-20","views":32}'::jsonb
  );
  PERFORM public.trellis_upsert_youtube_daily_metrics(payload);
  SELECT * INTO STRICT r FROM public.trellis_youtube_daily_metrics WHERE youtube_video_id='existing-ep';
  IF r.episode_id IS DISTINCT FROM '00000000-0000-4000-8000-000000000001'::uuid
     OR r.publication_id IS DISTINCT FROM '00000000-0000-4000-8000-000000000002'::uuid
     OR r.studio_album_id IS NOT NULL OR r.studio_publication_id IS NOT NULL
     OR NOT (to_jsonb(r) @> latest)
     OR r.synced_at IS DISTINCT FROM '2026-11-21T10:00:00Z'::timestamptz
     OR r.id IS DISTINCT FROM old_id OR r.created_at IS DISTINCT FROM old_created THEN
    RAISE EXCEPTION 'Episode ownership/identity changed or latest metrics were lost';
  END IF;
  SELECT * INTO STRICT r FROM public.trellis_youtube_daily_metrics WHERE youtube_video_id='existing-st';
  IF r.episode_id IS NOT NULL OR r.publication_id IS NOT NULL
     OR r.studio_album_id IS DISTINCT FROM '00000000-0000-4000-8000-000000000003'::uuid
     OR r.studio_publication_id IS DISTINCT FROM '00000000-0000-4000-8000-000000000004'::uuid OR r.views IS DISTINCT FROM 32 THEN
    RAISE EXCEPTION 'Studio ownership changed during an opposite-source update';
  END IF;

  -- New collisions retain the first inserted provenance while the last metrics win.
  payload:=jsonb_build_array(
    ep||'{"youtube_video_id":"new-episode","metric_date":"2026-11-20","views":1}'::jsonb,
    studio||'{"youtube_video_id":"new-episode","metric_date":"2026-11-20","views":99,"raw":{"last":true}}'::jsonb,
    studio||'{"youtube_video_id":"new-studio","metric_date":"2026-11-20","views":2}'::jsonb,
    ep||'{"youtube_video_id":"new-studio","metric_date":"2026-11-20","views":98}'::jsonb
  );
  PERFORM public.trellis_upsert_youtube_daily_metrics(payload);
  PERFORM public.trellis_upsert_youtube_daily_metrics(payload);
  IF (SELECT count(*) FROM public.trellis_youtube_daily_metrics WHERE youtube_video_id IN ('new-episode','new-studio'))<>2 THEN
    RAISE EXCEPTION 'Duplicate input/replay created duplicate metric rows';
  END IF;
  SELECT * INTO STRICT r FROM public.trellis_youtube_daily_metrics WHERE youtube_video_id='new-episode';
  IF r.episode_id IS DISTINCT FROM (ep->>'episode_id')::uuid OR r.publication_id IS DISTINCT FROM (ep->>'publication_id')::uuid
     OR r.studio_album_id IS NOT NULL OR r.studio_publication_id IS NOT NULL OR r.views IS DISTINCT FROM 99 OR r.raw IS DISTINCT FROM '{"last":true}'::jsonb THEN
    RAISE EXCEPTION 'New episode collision did not preserve first provenance/last metrics';
  END IF;
  SELECT * INTO STRICT r FROM public.trellis_youtube_daily_metrics WHERE youtube_video_id='new-studio';
  IF r.episode_id IS NOT NULL OR r.publication_id IS NOT NULL
     OR r.studio_album_id IS DISTINCT FROM (studio->>'studio_album_id')::uuid
     OR r.studio_publication_id IS DISTINCT FROM (studio->>'studio_publication_id')::uuid OR r.views IS DISTINCT FROM 98 THEN
    RAISE EXCEPTION 'New studio collision did not preserve first provenance/last metrics';
  END IF;

  PERFORM public.trellis_upsert_youtube_daily_metrics(jsonb_build_array(ep||'{"youtube_video_id":"new-episode","metric_date":"2026-11-19","views":50}'::jsonb));
  IF (SELECT count(*) FROM public.trellis_youtube_daily_metrics WHERE youtube_video_id='new-episode')<>2 THEN
    RAISE EXCEPTION 'Conflict key must include the date';
  END IF;

  SELECT jsonb_agg(ep||jsonb_build_object('youtube_video_id','B'||lpad(i::text,10,'0'),'metric_date','2026-11-20','views',i))
    INTO payload FROM generate_series(1,500) AS i;
  n:=public.trellis_upsert_youtube_daily_metrics(payload);
  IF n IS DISTINCT FROM 500 OR (SELECT count(*) FROM public.trellis_youtube_daily_metrics WHERE youtube_video_id LIKE 'B%')<>500 THEN
    RAISE EXCEPTION 'A complete 500-row batch was not applied';
  END IF;

  -- Every failure must leave both existing metrics and new rows unchanged.
  FOREACH invalid IN ARRAY ARRAY[
    NULL::jsonb,'null'::jsonb,'{}'::jsonb,'"invalid"'::jsonb,'1'::jsonb,
    payload||jsonb_build_array(ep||'{"youtube_video_id":"overflow","metric_date":"2026-11-20","views":1}'::jsonb),
    jsonb_build_array(ep||'{"youtube_video_id":"existing-ep","metric_date":"2026-11-20","views":999}'::jsonb,ep||'{"youtube_video_id":"bad-date","metric_date":"not-a-date"}'::jsonb),
    jsonb_build_array(ep||'{"youtube_video_id":"must-rollback","metric_date":"2026-11-20","views":1}'::jsonb,ep||'{"youtube_video_id":"bad-fk","metric_date":"2026-11-20","episode_id":"ffffffff-ffff-4fff-8fff-ffffffffffff"}'::jsonb),
    jsonb_build_array('{"youtube_video_id":"missing-date"}'::jsonb),
    jsonb_build_array('{"metric_date":"2026-11-20"}'::jsonb),
    jsonb_build_array(ep||'{"youtube_video_id":" ","metric_date":"2026-11-20"}'::jsonb),
    jsonb_build_array(ep||'{"youtube_video_id":"bad-number","metric_date":"2026-11-20","views":"not-a-number"}'::jsonb),
    jsonb_build_array(ep||'{"youtube_video_id":"partial-src","metric_date":"2026-11-20","publication_id":null}'::jsonb),
    jsonb_build_array(ep||studio||'{"youtube_video_id":"double-src","metric_date":"2026-11-20","episode_id":"00000000-0000-4000-8000-000000000005","publication_id":"00000000-0000-4000-8000-000000000006"}'::jsonb),
    jsonb_build_array('null'::jsonb)
  ] LOOP
    rejected:=false;
    BEGIN
      PERFORM public.trellis_upsert_youtube_daily_metrics(invalid);
    EXCEPTION WHEN OTHERS THEN rejected:=true;
    END;
    IF NOT rejected THEN RAISE EXCEPTION 'Invalid/oversized RPC input unexpectedly succeeded: %',invalid; END IF;
    IF (SELECT views FROM public.trellis_youtube_daily_metrics WHERE youtube_video_id='existing-ep') IS DISTINCT FROM 31
       OR EXISTS(SELECT 1 FROM public.trellis_youtube_daily_metrics WHERE youtube_video_id IN ('overflow','must-rollback','bad-date','bad-fk','missing-date')) THEN
      RAISE EXCEPTION 'Rejected RPC partially wrote metrics';
    END IF;
  END LOOP;
END $$;
RESET ROLE;
ROLLBACK;
