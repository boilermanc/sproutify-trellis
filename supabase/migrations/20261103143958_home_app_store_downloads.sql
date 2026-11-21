-- Apply only after approval, before deploying the Home downloads extension.
-- A complete date is one JSON value. Replace it atomically, and never let a
-- slower import overwrite a correction from a newer Apple processing date.
CREATE OR REPLACE FUNCTION public.store_app_store_download_snapshots(records JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  saved INTEGER;
BEGIN
  IF jsonb_typeof(records) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Download snapshots must be an array';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(records) AS r(app_id UUID, branch_id UUID, report_name TEXT, source_processing_date DATE, metrics JSONB)
    LEFT JOIN app_store_apps a ON a.id = r.app_id AND a.branch_id = r.branch_id
    WHERE (a.apple_app_id IS NULL OR a.apple_app_id NOT IN ('6795955100','6478242429'))
      OR a.organization_id IS DISTINCT FROM '00000000-0000-0000-0000-000000000001'::UUID
      OR r.report_name IS DISTINCT FROM 'App Downloads Standard'
      OR r.source_processing_date IS NULL OR jsonb_typeof(r.metrics) IS DISTINCT FROM 'object'
  ) THEN
    RAISE EXCEPTION 'Invalid supported app download snapshot';
  END IF;
  INSERT INTO app_store_metric_snapshots AS stored
    (app_id, branch_id, metric_date, report_name, category, granularity, metrics,
     source_processing_date, source_instance_id, fetched_at)
  SELECT r.app_id, r.branch_id, r.metric_date, r.report_name, 'COMMERCE', 'DAILY', r.metrics,
         r.source_processing_date, r.source_instance_id, now()
  FROM jsonb_to_recordset(records) AS r(
    app_id UUID, branch_id UUID, metric_date DATE, report_name TEXT, metrics JSONB,
    source_processing_date DATE, source_instance_id TEXT)
  ON CONFLICT (app_id, report_name, granularity, metric_date) DO UPDATE SET
    branch_id = EXCLUDED.branch_id,
    metrics = EXCLUDED.metrics,
    source_processing_date = EXCLUDED.source_processing_date,
    source_instance_id = EXCLUDED.source_instance_id,
    fetched_at = EXCLUDED.fetched_at
  WHERE stored.source_processing_date IS NULL
     OR EXCLUDED.source_processing_date >= stored.source_processing_date;
  GET DIAGNOSTICS saved = ROW_COUNT;
  RETURN saved;
END;
$$;

REVOKE ALL ON FUNCTION public.store_app_store_download_snapshots(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_app_store_download_snapshots(JSONB) TO service_role;
