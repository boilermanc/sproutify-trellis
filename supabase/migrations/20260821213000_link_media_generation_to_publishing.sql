-- Connect approved generated media to Trellis's existing scheduled publishing queue.
-- The scheduled worker resolves the private asset to a short-lived URL immediately
-- before publishing; permanent public URLs are intentionally not stored.

ALTER TABLE public.media_generation_outputs
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.scheduled_social_posts
  ADD COLUMN IF NOT EXISTS source_media_asset_id UUID REFERENCES public.media_assets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_generation_job_id UUID REFERENCES public.media_generation_jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_generation_output_id UUID REFERENCES public.media_generation_outputs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE INDEX IF NOT EXISTS idx_media_generation_outputs_approved_by
  ON public.media_generation_outputs (approved_by)
  WHERE approved_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ssp_source_media_asset
  ON public.scheduled_social_posts (source_media_asset_id)
  WHERE source_media_asset_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ssp_source_generation_job
  ON public.scheduled_social_posts (source_generation_job_id, created_at DESC)
  WHERE source_generation_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ssp_source_generation_output
  ON public.scheduled_social_posts (source_generation_output_id)
  WHERE source_generation_output_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ssp_created_by_idempotency
  ON public.scheduled_social_posts (created_by, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.resolve_scheduled_generated_media(p_scheduled_post_id UUID)
RETURNS TABLE(storage_bucket TEXT, storage_path TEXT, status TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT asset.storage_bucket, asset.storage_path, asset.status
  FROM public.scheduled_social_posts scheduled
  JOIN public.media_generation_outputs output
    ON output.id = scheduled.source_generation_output_id
   AND output.asset_id = scheduled.source_media_asset_id
   AND output.job_id = scheduled.source_generation_job_id
  JOIN public.media_generation_jobs job
    ON job.id = output.job_id
   AND job.created_by = scheduled.created_by
  JOIN public.media_assets asset
    ON asset.id = output.asset_id
  WHERE scheduled.id = p_scheduled_post_id
    AND scheduled.status = 'publishing'
    AND scheduled.source = 'media_generation'
    AND output.approved = true
    AND job.status = 'succeeded'
    AND asset.status = 'ready';
$$;

REVOKE ALL ON FUNCTION public.resolve_scheduled_generated_media(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_scheduled_generated_media(UUID) TO service_role;
