-- Bind immutable assets to every manifest revision that is allowed to consume
-- them. Asset origin stays on promo_assets.revision_id; child revisions gain a
-- binding rather than moving or duplicating the asset or Storage object.

CREATE TABLE IF NOT EXISTS public.promo_revision_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.promo_projects(id) ON DELETE CASCADE,
  revision_id UUID NOT NULL REFERENCES public.promo_manifest_revisions(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES public.promo_assets(id) ON DELETE CASCADE,
  binding_reason TEXT NOT NULL DEFAULT 'origin'
    CHECK (binding_reason IN ('origin','revision_carry_forward','capture_adoption','voice_adoption','music_adoption','manual_adoption')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (revision_id, asset_id)
);

CREATE INDEX IF NOT EXISTS idx_promo_revision_assets_project
  ON public.promo_revision_assets (project_id, revision_id);
CREATE INDEX IF NOT EXISTS idx_promo_revision_assets_asset
  ON public.promo_revision_assets (asset_id, revision_id);

ALTER TABLE public.promo_revision_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_revision_assets FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.promo_revision_assets FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.promo_revision_assets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.promo_revision_assets TO service_role;

DROP POLICY IF EXISTS "Promo revision assets follow project access" ON public.promo_revision_assets;
CREATE POLICY "Promo revision assets follow project access"
  ON public.promo_revision_assets FOR SELECT TO authenticated
  USING ((SELECT private.can_access_promo_project(project_id)));

CREATE OR REPLACE FUNCTION private.validate_promo_revision_asset_binding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  revision_project_id UUID;
  asset_project_id UUID;
BEGIN
  SELECT revision.project_id INTO revision_project_id
  FROM public.promo_manifest_revisions revision
  WHERE revision.id = NEW.revision_id;

  SELECT asset.project_id INTO asset_project_id
  FROM public.promo_assets asset
  WHERE asset.id = NEW.asset_id;

  IF revision_project_id IS NULL OR asset_project_id IS NULL
    OR NEW.project_id IS DISTINCT FROM revision_project_id
    OR NEW.project_id IS DISTINCT FROM asset_project_id THEN
    RAISE EXCEPTION 'Promo revision asset binding must stay within one project.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_promo_revision_asset_binding ON public.promo_revision_assets;
CREATE TRIGGER validate_promo_revision_asset_binding
  BEFORE INSERT OR UPDATE ON public.promo_revision_assets
  FOR EACH ROW EXECUTE FUNCTION private.validate_promo_revision_asset_binding();

CREATE OR REPLACE FUNCTION private.validate_promo_revision_asset_binding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  revision_project_id UUID;
  asset_project_id UUID;
BEGIN
  SELECT revision.project_id INTO revision_project_id
  FROM public.promo_manifest_revisions revision
  WHERE revision.id = NEW.revision_id;

  SELECT asset.project_id INTO asset_project_id
  FROM public.promo_assets asset
  WHERE asset.id = NEW.asset_id;

  IF revision_project_id IS NULL OR asset_project_id IS NULL
    OR NEW.project_id IS DISTINCT FROM revision_project_id
    OR NEW.project_id IS DISTINCT FROM asset_project_id THEN
    RAISE EXCEPTION 'Promo revision asset binding must stay within one project.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_promo_revision_asset_binding ON public.promo_revision_assets;
CREATE TRIGGER validate_promo_revision_asset_binding
  BEFORE INSERT OR UPDATE ON public.promo_revision_assets
  FOR EACH ROW EXECUTE FUNCTION private.validate_promo_revision_asset_binding();

CREATE OR REPLACE FUNCTION private.bind_promo_asset_origin_revision()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.revision_id IS NOT NULL THEN
    INSERT INTO public.promo_revision_assets (
      project_id, revision_id, asset_id, binding_reason
    ) VALUES (
      NEW.project_id, NEW.revision_id, NEW.id, 'origin'
    ) ON CONFLICT (revision_id, asset_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bind_promo_asset_origin_revision ON public.promo_assets;
CREATE TRIGGER bind_promo_asset_origin_revision
  AFTER INSERT ON public.promo_assets
  FOR EACH ROW EXECUTE FUNCTION private.bind_promo_asset_origin_revision();

INSERT INTO public.promo_revision_assets (
  project_id, revision_id, asset_id, binding_reason
)
SELECT asset.project_id, asset.revision_id, asset.id, 'origin'
FROM public.promo_assets asset
WHERE asset.revision_id IS NOT NULL
ON CONFLICT (revision_id, asset_id) DO NOTHING;

INSERT INTO public.promo_revision_assets (
  project_id, revision_id, asset_id, binding_reason
)
SELECT revision.project_id, revision.id, asset.id, 'revision_carry_forward'
FROM public.promo_manifest_revisions revision
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(revision.manifest -> 'assets') = 'array'
    THEN revision.manifest -> 'assets' ELSE '[]'::jsonb END
) manifest_asset
JOIN public.promo_assets asset
  ON asset.id::TEXT = manifest_asset ->> 'id'
 AND asset.project_id = revision.project_id
ON CONFLICT (revision_id, asset_id) DO NOTHING;

REVOKE ALL ON FUNCTION private.bind_promo_asset_origin_revision() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.bind_promo_asset_origin_revision() TO service_role;
REVOKE ALL ON FUNCTION private.validate_promo_revision_asset_binding() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.validate_promo_revision_asset_binding() TO service_role;
REVOKE ALL ON FUNCTION private.validate_promo_revision_asset_binding() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.validate_promo_revision_asset_binding() TO service_role;
