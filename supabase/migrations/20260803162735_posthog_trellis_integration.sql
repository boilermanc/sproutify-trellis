-- PostHog remains the raw analytics system of record. Trellis stores only
-- connection metadata, encrypted credentials, hourly aggregate snapshots, and
-- an allowlisted subset of marketing-relevant milestone events.

CREATE TABLE IF NOT EXISTS public.posthog_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  host_url TEXT NOT NULL CHECK (host_url ~ '^https://[^/]+$'),
  project_id TEXT NOT NULL CHECK (project_id ~ '^[0-9]+$'),
  api_key_ciphertext TEXT NOT NULL,
  api_key_preview TEXT NOT NULL,
  webhook_secret_hash TEXT NOT NULL,
  allowed_events JSONB NOT NULL DEFAULT '["user_signed_up","account_created","onboarding_completed","activation_milestone_reached","core_feature_milestone","meaningful_return"]'::jsonb
    CHECK (jsonb_typeof(allowed_events) = 'array'),
  allowed_properties JSONB NOT NULL DEFAULT '["platform","feature","milestone","app_version","return_interval_bucket"]'::jsonb
    CHECK (jsonb_typeof(allowed_properties) = 'array'),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','error','disconnected')),
  last_successful_query_at TIMESTAMPTZ,
  last_event_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, branch_id)
);

CREATE TABLE IF NOT EXISTS public.posthog_metric_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  connection_id UUID NOT NULL REFERENCES public.posthog_connections(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  metric_key TEXT NOT NULL DEFAULT 'product_analytics_summary',
  window_days INTEGER NOT NULL CHECK (window_days IN (7, 30, 90)),
  result JSONB NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  source TEXT NOT NULL DEFAULT 'posthog' CHECK (source = 'posthog'),
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_posthog_connections_branch
  ON public.posthog_connections (branch_id);
CREATE INDEX IF NOT EXISTS idx_posthog_snapshots_lookup
  ON public.posthog_metric_snapshots (connection_id, metric_key, window_days, fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_posthog_snapshots_branch
  ON public.posthog_metric_snapshots (branch_id, fetched_at DESC);

ALTER TABLE public.posthog_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posthog_metric_snapshots ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.posthog_connections FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.posthog_metric_snapshots FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.posthog_connections TO service_role;
GRANT ALL ON public.posthog_metric_snapshots TO service_role;

DROP POLICY IF EXISTS "Service Role Only" ON public.posthog_connections;
CREATE POLICY "Service Role Only" ON public.posthog_connections
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service Role Only" ON public.posthog_metric_snapshots;
CREATE POLICY "Service Role Only" ON public.posthog_metric_snapshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- The historical generic integration table must never expose encrypted API
-- material. Keep this guard idempotent because that table is not present in
-- every environment stamped from the master schema.
DO $$
BEGIN
  IF to_regclass('public.integration_configs') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.integration_configs ENABLE ROW LEVEL SECURITY';
    EXECUTE 'REVOKE ALL ON public.integration_configs FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT ALL ON public.integration_configs TO service_role';
  END IF;
END $$;

-- Existing branch snapshots contain aggregate data, not raw profiles. Trellis
-- staff may read them, but only owners/admins may create or change them.
DO $$
DECLARE
  v_policy RECORD;
BEGIN
  IF to_regclass('public.branch_snapshots') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.branch_snapshots ENABLE ROW LEVEL SECURITY';
    EXECUTE 'REVOKE ALL ON public.branch_snapshots FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT SELECT ON public.branch_snapshots TO authenticated';
    EXECUTE 'GRANT INSERT, UPDATE, DELETE ON public.branch_snapshots TO authenticated';
    EXECUTE 'GRANT ALL ON public.branch_snapshots TO service_role';

    FOR v_policy IN
      SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='branch_snapshots'
    LOOP
      EXECUTE format('DROP POLICY %I ON public.branch_snapshots', v_policy.policyname);
    END LOOP;

    EXECUTE $policy$
        CREATE POLICY "Trellis staff read snapshots" ON public.branch_snapshots
        FOR SELECT TO authenticated
        USING (EXISTS (
          SELECT 1 FROM public.trellis_users u
          WHERE u.auth_user_id = (SELECT auth.uid()) AND u.status = 'active'
        ))
      $policy$;

    EXECUTE $policy$
        CREATE POLICY "Trellis admins manage snapshots" ON public.branch_snapshots
        FOR ALL TO authenticated
        USING (EXISTS (
          SELECT 1 FROM public.trellis_users u
          WHERE u.auth_user_id = (SELECT auth.uid()) AND u.status = 'active' AND u.role IN ('owner','admin')
        ))
        WITH CHECK (EXISTS (
          SELECT 1 FROM public.trellis_users u
          WHERE u.auth_user_id = (SELECT auth.uid()) AND u.status = 'active' AND u.role IN ('owner','admin')
        ))
      $policy$;
  END IF;
END $$;

-- Atomic event ingest. The function is callable only by service_role and never
-- accepts a raw PostHog payload; its properties argument has already been
-- rebuilt from the per-connection allowlist by the Edge Function.
CREATE OR REPLACE FUNCTION public.ingest_posthog_event(
  p_event_id TEXT,
  p_connection_id UUID,
  p_event_type TEXT,
  p_source_site TEXT,
  p_branch_user_id TEXT,
  p_email TEXT,
  p_occurred_at TIMESTAMPTZ,
  p_properties JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id UUID;
  v_inserted INTEGER;
BEGIN
  INSERT INTO processed_events (event_id, processed_at)
  VALUES (p_event_id, now())
  ON CONFLICT (event_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 0 THEN
    RETURN jsonb_build_object('duplicate', true, 'profile_matched', false);
  END IF;

  IF NULLIF(lower(trim(p_email)), '') IS NOT NULL THEN
    SELECT id INTO v_profile_id
    FROM profiles
    WHERE lower(email) = lower(trim(p_email))
    LIMIT 1;
  END IF;

  INSERT INTO marketing_events (profile_id, event_type, source, payload, created_at)
  VALUES (
    v_profile_id,
    p_event_type,
    'posthog',
    jsonb_build_object(
      'external_event_id', p_event_id,
      'connection_id', p_connection_id,
      'source_site', p_source_site,
      'branch_user_id', p_branch_user_id,
      'email', NULLIF(lower(trim(p_email)), ''),
      'properties', COALESCE(p_properties, '{}'::jsonb)
    ),
    COALESCE(p_occurred_at, now())
  );

  UPDATE posthog_connections
  SET last_event_at = now(), last_error = NULL, status = 'active', updated_at = now()
  WHERE id = p_connection_id;

  RETURN jsonb_build_object(
    'duplicate', false,
    'profile_matched', v_profile_id IS NOT NULL,
    'profile_id', v_profile_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.ingest_posthog_event(TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ingest_posthog_event(TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, JSONB) TO service_role;

CREATE OR REPLACE FUNCTION public.prune_posthog_metric_snapshots()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM posthog_metric_snapshots WHERE fetched_at < now() - INTERVAL '90 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_posthog_metric_snapshots() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_posthog_metric_snapshots() TO service_role;
