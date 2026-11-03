BEGIN;
SET LOCAL ROLE service_role;
DO $$
DECLARE
  app public.app_store_apps%ROWTYPE;
  payload jsonb;
  saved integer;
BEGIN
  SELECT * INTO STRICT app FROM public.app_store_apps WHERE apple_app_id='6754806358' AND organization_id='00000000-0000-0000-0000-000000000001';
  payload := jsonb_build_array(jsonb_build_object('app_id',app.id,'branch_id',app.branch_id,'metric_date','2000-01-01','report_name','App Downloads Standard','metrics',jsonb_build_object('First-Time Downloads',4),'source_processing_date','2000-01-03','source_instance_id','rollback-only-check'));
  saved := public.store_app_store_download_snapshots(payload);
  IF saved <> 1 THEN RAISE EXCEPTION 'Expected newer snapshot to save'; END IF;
  payload := jsonb_set(payload,'{0,source_processing_date}','"2000-01-02"');
  payload := jsonb_set(payload,'{0,metrics}','{"First-Time Downloads":99}');
  saved := public.store_app_store_download_snapshots(payload);
  IF saved <> 0 THEN RAISE EXCEPTION 'Stale processing date overwrote newer snapshot'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.app_store_metric_snapshots WHERE app_id=app.id AND metric_date='2000-01-01' AND report_name='App Downloads Standard' AND metrics->>'First-Time Downloads'='4') THEN RAISE EXCEPTION 'Latest metrics were not preserved'; END IF;
END $$;
ROLLBACK;
