-- App Store Connect remains the analytics system of record. Trellis stores
-- only app/request metadata and daily aggregate metrics; report rows and any
-- device-level dimensions are never persisted.

CREATE TABLE IF NOT EXISTS public.app_store_apps (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  apple_app_id TEXT NOT NULL CHECK (apple_app_id ~ '^[0-9]+$'),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  ongoing_request_id UUID NOT NULL,
  snapshot_request_id UUID,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending','error','disconnected')),
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, apple_app_id),
  UNIQUE (organization_id, branch_id)
);

CREATE TABLE IF NOT EXISTS public.app_store_metric_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  app_id UUID NOT NULL REFERENCES public.app_store_apps(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  metric_date DATE NOT NULL,
  report_name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('APP_USAGE','APP_STORE_ENGAGEMENT','COMMERCE','PERFORMANCE')),
  granularity TEXT NOT NULL DEFAULT 'DAILY' CHECK (granularity IN ('DAILY','WEEKLY','MONTHLY')),
  metrics JSONB NOT NULL CHECK (jsonb_typeof(metrics) = 'object'),
  source_processing_date DATE,
  source_instance_id TEXT,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (app_id, report_name, granularity, metric_date)
);

CREATE INDEX IF NOT EXISTS idx_app_store_apps_branch
  ON public.app_store_apps (branch_id);
CREATE INDEX IF NOT EXISTS idx_app_store_snapshots_branch_date
  ON public.app_store_metric_snapshots (branch_id, metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_app_store_snapshots_app_date
  ON public.app_store_metric_snapshots (app_id, metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_app_store_snapshots_metrics
  ON public.app_store_metric_snapshots USING GIN (metrics jsonb_path_ops);

ALTER TABLE public.app_store_apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_store_metric_snapshots ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.app_store_apps FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.app_store_metric_snapshots FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.app_store_apps TO service_role;
GRANT ALL ON public.app_store_metric_snapshots TO service_role;

DROP POLICY IF EXISTS "Service Role Only" ON public.app_store_apps;
CREATE POLICY "Service Role Only" ON public.app_store_apps
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service Role Only" ON public.app_store_metric_snapshots;
CREATE POLICY "Service Role Only" ON public.app_store_metric_snapshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO public.app_store_apps (
  branch_id, apple_app_id, name, ongoing_request_id, snapshot_request_id, status
)
SELECT b.id, seed.apple_app_id, seed.name, seed.ongoing_request_id::uuid,
       seed.snapshot_request_id::uuid, 'pending'
FROM (VALUES
  ('rejoice', '6754806358', 'Rejoice', '62e8596a-ab72-461d-a768-00994e4e23c2', '6197b69a-f193-465e-b169-47f12ce899e2'),
  ('once-upon-a-drawing', '6795355979', 'Once Upon a Drawing', 'd3c56db8-9740-4788-a12b-24e451402c82', 'fceffb43-252e-499b-8c86-025194d2c90f'),
  ('rekkrd', '6795955100', 'Rekkrd', 'd4141b50-d4bd-4266-a323-5c6eca74fa52', '6eab1e84-dfa0-4dfa-9436-31f21a2afe63'),
  ('sproutify-home', '6478242429', 'Sproutify Home', 'eb6bd95d-4fd4-49d0-a7e7-ee67dd2674c4', '06b5aa61-523e-4ccb-8c68-034848e70fb5')
) AS seed(branch_slug, apple_app_id, name, ongoing_request_id, snapshot_request_id)
JOIN public.branches b ON b.slug = seed.branch_slug
ON CONFLICT (organization_id, apple_app_id) DO UPDATE SET
  branch_id = EXCLUDED.branch_id,
  name = EXCLUDED.name,
  ongoing_request_id = EXCLUDED.ongoing_request_id,
  snapshot_request_id = EXCLUDED.snapshot_request_id,
  status = CASE WHEN app_store_apps.status = 'disconnected' THEN app_store_apps.status ELSE 'pending' END,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.prune_app_store_metric_snapshots()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM app_store_metric_snapshots WHERE metric_date < current_date - 730;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_app_store_metric_snapshots() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_app_store_metric_snapshots() TO service_role;
