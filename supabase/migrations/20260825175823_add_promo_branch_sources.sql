CREATE TABLE IF NOT EXISTS public.promo_branch_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  repository_provider TEXT NOT NULL DEFAULT 'github'
    CHECK (repository_provider IN ('github')),
  repository_full_name TEXT NOT NULL
    CHECK (repository_full_name ~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'),
  default_ref TEXT NOT NULL DEFAULT 'main' CHECK (char_length(trim(default_ref)) BETWEEN 1 AND 200),
  permitted_paths JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(permitted_paths) = 'array'),
  prohibited_paths JSONB NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(prohibited_paths) = 'array'),
  capture_base_url TEXT,
  capture_auth_profile_key TEXT,
  capture_fixture_key TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (branch_id)
);

CREATE INDEX IF NOT EXISTS idx_promo_branch_sources_organization
  ON public.promo_branch_sources (organization_id, is_active);
CREATE INDEX IF NOT EXISTS idx_promo_branch_sources_repository
  ON public.promo_branch_sources (repository_provider, repository_full_name);
CREATE INDEX IF NOT EXISTS idx_promo_branch_sources_permitted_paths
  ON public.promo_branch_sources USING GIN (permitted_paths jsonb_path_ops);

DROP TRIGGER IF EXISTS touch_promo_branch_sources_updated_at ON public.promo_branch_sources;
CREATE TRIGGER touch_promo_branch_sources_updated_at
  BEFORE UPDATE ON public.promo_branch_sources
  FOR EACH ROW EXECUTE FUNCTION public.touch_promo_updated_at();

CREATE OR REPLACE FUNCTION private.can_access_promo_branch_source(p_branch_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.trellis_users u
    WHERE u.auth_user_id = (SELECT auth.uid())
      AND u.status = 'active'
      AND (
        u.role IN ('owner', 'admin')
        OR EXISTS (
          SELECT 1 FROM public.trellis_user_branches ub
          WHERE ub.trellis_user_id = u.id AND ub.branch_id = p_branch_id
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION private.can_access_promo_branch_source(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_access_promo_branch_source(UUID) TO authenticated, service_role;

ALTER TABLE public.promo_branch_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_branch_sources FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.promo_branch_sources FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.promo_branch_sources TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.promo_branch_sources TO service_role;

DROP POLICY IF EXISTS "Promo branch sources are readable by collaborators" ON public.promo_branch_sources;
CREATE POLICY "Promo branch sources are readable by collaborators"
  ON public.promo_branch_sources FOR SELECT TO authenticated
  USING ((SELECT private.can_access_promo_branch_source(branch_id)));

-- Rekkrd is the only repository mapping verified during PS-002. Capture URL,
-- fixture and auth keys intentionally remain null until those environments are approved.
INSERT INTO public.promo_branch_sources (
  branch_id, repository_provider, repository_full_name, default_ref,
  permitted_paths, prohibited_paths, metadata
)
SELECT
  b.id, 'github', 'boilermanc/rekkrd', 'main',
  '["package.json","README.md","src","public"]'::jsonb,
  '[]'::jsonb,
  jsonb_build_object('source', 'ps-002-verified-local-repository')
FROM public.branches b
WHERE b.slug = 'rekkrd'
ON CONFLICT (branch_id) DO NOTHING;
