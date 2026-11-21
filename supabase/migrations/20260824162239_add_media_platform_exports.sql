-- Durable platform-ready derivatives rendered on the existing CPU worker.
-- The source generation stays immutable; exports are private assets referenced
-- by their queue row and selected automatically by the publishing handoff.

ALTER TABLE public.media_assets
  DROP CONSTRAINT IF EXISTS media_assets_asset_type_check;

ALTER TABLE public.media_assets
  ADD CONSTRAINT media_assets_asset_type_check
  CHECK (asset_type IN (
    'reference_image','reference_video','reference_audio',
    'source_image','source_video','source_audio',
    'generated_video','generated_image','generated_audio',
    'finished_video','platform_export','thumbnail','other'
  ));

CREATE TABLE IF NOT EXISTS public.media_platform_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.media_generation_projects(id) ON DELETE CASCADE,
  source_output_id UUID NOT NULL REFERENCES public.media_generation_outputs(id) ON DELETE RESTRICT,
  source_asset_id UUID NOT NULL REFERENCES public.media_assets(id) ON DELETE RESTRICT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('instagram_reel')),
  framing TEXT NOT NULL DEFAULT 'blur_background' CHECK (framing IN ('blur_background','center_crop','fit')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','cancel_requested','cancelled')),
  progress SMALLINT NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  output_asset_id UUID REFERENCES public.media_assets(id) ON DELETE SET NULL,
  attempts SMALLINT NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  max_attempts SMALLINT NOT NULL DEFAULT 2 CHECK (max_attempts BETWEEN 1 AND 5),
  idempotency_key TEXT NOT NULL,
  error_message TEXT,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (created_by, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_media_platform_exports_active
  ON public.media_platform_exports (status, queued_at)
  WHERE status IN ('queued','running','cancel_requested');

CREATE INDEX IF NOT EXISTS idx_media_platform_exports_source
  ON public.media_platform_exports (source_output_id, platform, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_media_platform_exports_project
  ON public.media_platform_exports (project_id, created_at DESC);

DROP TRIGGER IF EXISTS touch_media_platform_exports_updated_at ON public.media_platform_exports;
CREATE TRIGGER touch_media_platform_exports_updated_at
  BEFORE UPDATE ON public.media_platform_exports
  FOR EACH ROW EXECUTE FUNCTION public.touch_media_generation_updated_at();

ALTER TABLE public.media_platform_exports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Media platform exports follow project access" ON public.media_platform_exports;
CREATE POLICY "Media platform exports follow project access"
  ON public.media_platform_exports FOR SELECT TO authenticated
  USING ((SELECT private.can_access_media_project(project_id)));

REVOKE ALL ON TABLE public.media_platform_exports FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.media_platform_exports TO authenticated;
GRANT ALL ON TABLE public.media_platform_exports TO service_role;
