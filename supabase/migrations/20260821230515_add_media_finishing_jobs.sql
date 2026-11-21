-- Durable, private post-generation finishing jobs. The original AI output is
-- immutable; each successful finish creates a new media asset and output row.

ALTER TABLE public.media_generation_outputs
  DROP CONSTRAINT IF EXISTS media_generation_outputs_output_role_check;

ALTER TABLE public.media_generation_outputs
  ADD CONSTRAINT media_generation_outputs_output_role_check
  CHECK (output_role IN ('primary','preview','thumbnail','continuation_frame','metadata','finished'));

ALTER TABLE public.media_generation_outputs
  ADD COLUMN IF NOT EXISTS source_output_id UUID REFERENCES public.media_generation_outputs(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.media_finishing_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.media_generation_projects(id) ON DELETE CASCADE,
  source_output_id UUID NOT NULL REFERENCES public.media_generation_outputs(id) ON DELETE RESTRICT,
  source_asset_id UUID NOT NULL REFERENCES public.media_assets(id) ON DELETE RESTRICT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','cancel_requested','cancelled')),
  progress SMALLINT NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  text_cues JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(text_cues) = 'array'),
  style JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(style) = 'object'),
  output_asset_id UUID REFERENCES public.media_assets(id) ON DELETE SET NULL,
  output_id UUID REFERENCES public.media_generation_outputs(id) ON DELETE SET NULL,
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

CREATE INDEX IF NOT EXISTS idx_media_finishing_jobs_active
  ON public.media_finishing_jobs (status, queued_at)
  WHERE status IN ('queued','running','cancel_requested');

CREATE INDEX IF NOT EXISTS idx_media_finishing_jobs_source_output
  ON public.media_finishing_jobs (source_output_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_media_finishing_jobs_project
  ON public.media_finishing_jobs (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_media_generation_outputs_source
  ON public.media_generation_outputs (source_output_id, created_at DESC)
  WHERE source_output_id IS NOT NULL;

DROP TRIGGER IF EXISTS touch_media_finishing_jobs_updated_at ON public.media_finishing_jobs;
CREATE TRIGGER touch_media_finishing_jobs_updated_at
  BEFORE UPDATE ON public.media_finishing_jobs
  FOR EACH ROW EXECUTE FUNCTION public.touch_media_generation_updated_at();

ALTER TABLE public.media_finishing_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Media finishing jobs follow project access" ON public.media_finishing_jobs;
CREATE POLICY "Media finishing jobs follow project access"
  ON public.media_finishing_jobs FOR SELECT TO authenticated
  USING ((SELECT private.can_access_media_project(project_id)));

REVOKE ALL ON TABLE public.media_finishing_jobs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.media_finishing_jobs TO authenticated;
GRANT ALL ON TABLE public.media_finishing_jobs TO service_role;
