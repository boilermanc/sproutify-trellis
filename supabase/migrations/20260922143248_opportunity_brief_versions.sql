-- Append-only orchestration metadata, never customer profiles.
CREATE TABLE IF NOT EXISTS public.opportunity_brief_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  brief_id UUID NOT NULL,
  brand_id UUID NOT NULL REFERENCES public.marketing_brands(id),
  branch_id UUID NOT NULL REFERENCES public.branches(id),
  project_id TEXT NOT NULL,
  version INTEGER NOT NULL CHECK (version > 0),
  status TEXT NOT NULL CHECK (status IN ('draft', 'approved')),
  supersedes_version_id UUID REFERENCES public.opportunity_brief_versions(id),
  author_id UUID NOT NULL,
  reviewer_id UUID,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  brief JSONB NOT NULL CHECK (jsonb_typeof(brief) = 'object'),
  UNIQUE (brand_id, version),
  CHECK ((status = 'approved' AND reviewer_id IS NOT NULL AND approved_at IS NOT NULL)
      OR (status = 'draft' AND reviewer_id IS NULL AND approved_at IS NULL))
);
CREATE INDEX IF NOT EXISTS opportunity_brief_scope_idx ON public.opportunity_brief_versions (project_id, brand_id, version DESC);
CREATE INDEX IF NOT EXISTS opportunity_brief_branch_idx ON public.opportunity_brief_versions (branch_id);
CREATE INDEX IF NOT EXISTS opportunity_brief_predecessor_idx ON public.opportunity_brief_versions (supersedes_version_id);
CREATE INDEX IF NOT EXISTS opportunity_brief_json_idx ON public.opportunity_brief_versions USING GIN (brief jsonb_path_ops);
ALTER TABLE public.opportunity_brief_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.opportunity_brief_versions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.opportunity_brief_versions TO service_role;
DROP POLICY IF EXISTS opportunity_brief_service_select ON public.opportunity_brief_versions;
CREATE POLICY opportunity_brief_service_select ON public.opportunity_brief_versions FOR SELECT TO service_role USING (true);
DROP POLICY IF EXISTS opportunity_brief_service_insert ON public.opportunity_brief_versions;
CREATE POLICY opportunity_brief_service_insert ON public.opportunity_brief_versions FOR INSERT TO service_role WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.append_opportunity_brief(p_brief JSONB, p_expected_version_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_brand UUID := (p_brief->>'brand_id')::UUID;
  v_branch UUID;
  v_project TEXT;
  v_previous public.opportunity_brief_versions;
  v_id UUID := (p_brief->>'version_id')::UUID;
BEGIN
  -- Parent row lock serializes even the first insert, when no version exists yet.
  SELECT b.branch_id, br.slug INTO v_branch, v_project
    FROM public.marketing_brands b JOIN public.branches br ON br.id = b.branch_id
    WHERE b.id = v_brand AND br.is_active = true FOR UPDATE OF b, br;
  IF NOT FOUND OR v_branch IS DISTINCT FROM (p_brief->>'branch_id')::UUID
     OR v_project IS DISTINCT FROM p_brief->>'project_id' THEN
    RAISE EXCEPTION 'Brief scope mismatch' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_previous FROM public.opportunity_brief_versions
    WHERE brand_id = v_brand ORDER BY version DESC LIMIT 1;
  IF v_previous.id IS DISTINCT FROM p_expected_version_id THEN
    RAISE EXCEPTION 'Brief changed; reload before saving' USING ERRCODE = '40001';
  END IF;
  IF (p_brief->>'version')::INTEGER IS DISTINCT FROM COALESCE(v_previous.version, 0) + 1
     OR NULLIF(p_brief->>'supersedes_version_id', '')::UUID IS DISTINCT FROM v_previous.id
     OR (v_previous.id IS NOT NULL AND (p_brief->>'id')::UUID IS DISTINCT FROM v_previous.brief_id)
     OR (p_brief->>'status' = 'approved' AND (v_previous.id IS NULL OR v_previous.status <> 'draft')) THEN
    RAISE EXCEPTION 'Invalid brief lineage' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.opportunity_brief_versions
    (id, brief_id, brand_id, branch_id, project_id, version, status, supersedes_version_id, author_id, reviewer_id, approved_at, created_at, brief)
  VALUES (v_id, (p_brief->>'id')::UUID, v_brand, v_branch, v_project, (p_brief->>'version')::INTEGER,
    p_brief->>'status', v_previous.id, (p_brief->>'author_id')::UUID, (p_brief->>'reviewer_id')::UUID,
    (p_brief->>'approved_at')::TIMESTAMPTZ, (p_brief->>'created_at')::TIMESTAMPTZ, p_brief);
  RETURN p_brief;
END;
$$;
REVOKE ALL ON FUNCTION public.append_opportunity_brief(JSONB, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_opportunity_brief(JSONB, UUID) TO service_role;

-- Brief snapshots are durable metadata. Existing event TTL functions must not purge them.
