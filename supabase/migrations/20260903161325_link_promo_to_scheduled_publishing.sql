-- Connect a human-approved Promo Studio final render to the existing durable
-- social scheduler without making the private render object public.

ALTER TABLE public.scheduled_social_posts
  ADD COLUMN IF NOT EXISTS source_promo_project_id UUID REFERENCES public.promo_projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_promo_job_id UUID REFERENCES public.promo_jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_promo_asset_id UUID REFERENCES public.promo_assets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ssp_source_promo_project
  ON public.scheduled_social_posts (source_promo_project_id, created_at DESC)
  WHERE source_promo_project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ssp_source_promo_job
  ON public.scheduled_social_posts (source_promo_job_id)
  WHERE source_promo_job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ssp_source_promo_asset
  ON public.scheduled_social_posts (source_promo_asset_id)
  WHERE source_promo_asset_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.approve_and_schedule_promo_post(
  p_project_id UUID,
  p_revision_id UUID,
  p_asset_id UUID,
  p_actor_id UUID,
  p_caption TEXT,
  p_scheduled_for TIMESTAMPTZ,
  p_idempotency_key TEXT
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  project_row public.promo_projects%ROWTYPE;
  asset_row public.promo_assets%ROWTYPE;
  branch_row public.branches%ROWTYPE;
  render_job public.promo_jobs%ROWTYPE;
  existing_id UUID;
  scheduled_id UUID;
BEGIN
  IF p_project_id IS NULL OR p_revision_id IS NULL OR p_asset_id IS NULL OR p_actor_id IS NULL
    OR p_caption IS NULL OR char_length(trim(p_caption)) NOT BETWEEN 1 AND 2200
    OR p_scheduled_for IS NULL OR p_scheduled_for < now() - interval '1 minute'
    OR p_scheduled_for > now() + interval '366 days'
    OR p_idempotency_key IS NULL OR char_length(trim(p_idempotency_key)) NOT BETWEEN 1 AND 200
  THEN RETURN NULL; END IF;

  SELECT p.* INTO project_row FROM public.promo_projects p
  WHERE p.id = p_project_id AND p.current_revision_id = p_revision_id
    AND p.status <> 'archived'
  FOR UPDATE;
  IF project_row.id IS NULL THEN RETURN NULL; END IF;

  SELECT s.id INTO existing_id FROM public.scheduled_social_posts s
  WHERE s.created_by = p_actor_id AND s.idempotency_key = trim(p_idempotency_key);
  IF existing_id IS NOT NULL THEN RETURN existing_id; END IF;

  SELECT a.* INTO asset_row FROM public.promo_assets a
  WHERE a.id = p_asset_id AND a.project_id = p_project_id AND a.revision_id = p_revision_id
    AND a.kind = 'render_master' AND a.status = 'ready' AND a.storage_bucket = 'promo-assets'
    AND a.mime_type = 'video/mp4' AND a.width = 1080 AND a.height = 1920
    AND a.checksum_sha256 ~ '^[a-f0-9]{64}$';
  IF asset_row.id IS NULL THEN RETURN NULL; END IF;

  SELECT j.* INTO render_job FROM public.promo_jobs j
  WHERE j.project_id = p_project_id AND j.revision_id = p_revision_id
    AND j.job_type = 'final_render' AND j.status = 'succeeded'
    AND j.output_asset_ids @> jsonb_build_array(p_asset_id)
  ORDER BY j.completed_at DESC NULLS LAST LIMIT 1;
  IF render_job.id IS NULL THEN RETURN NULL; END IF;

  SELECT b.* INTO branch_row FROM public.branches b
  WHERE b.id = project_row.branch_id AND b.is_active = true;
  IF branch_row.id IS NULL THEN RETURN NULL; END IF;

  INSERT INTO public.promo_approvals (
    project_id, revision_id, gate, subject_type, subject_id, decision, decided_by, reason
  ) VALUES (
    p_project_id, p_revision_id, 'final', 'asset', p_asset_id::TEXT,
    'approved', p_actor_id, 'Approved final render for scheduled Instagram publishing'
  );
  UPDATE public.promo_assets SET approved = true, updated_at = now() WHERE id = p_asset_id;
  UPDATE public.promo_projects SET final_approved_at = now(), status = 'ready', updated_at = now()
  WHERE id = p_project_id;

  INSERT INTO public.scheduled_social_posts (
    branch_id, branch_slug, platform, caption, media_type, media_urls,
    scheduled_for, status, source, created_by, idempotency_key,
    source_promo_project_id, source_promo_job_id, source_promo_asset_id
  ) VALUES (
    branch_row.id, branch_row.slug, 'instagram', trim(p_caption), 'video', '[]'::jsonb,
    p_scheduled_for, 'scheduled', 'promo_studio', p_actor_id, trim(p_idempotency_key),
    p_project_id, render_job.id, p_asset_id
  ) RETURNING id INTO scheduled_id;

  INSERT INTO public.promo_events (
    project_id, revision_id, job_id, event_type, stage, actor_id, correlation_id, details
  ) VALUES (
    p_project_id, p_revision_id, render_job.id, 'publish.scheduled', 'publish', p_actor_id,
    gen_random_uuid()::TEXT, jsonb_build_object('scheduled_post_id', scheduled_id,
      'platform', 'instagram', 'scheduled_for', p_scheduled_for, 'asset_id', p_asset_id)
  );
  RETURN scheduled_id;
EXCEPTION WHEN unique_violation OR foreign_key_violation OR check_violation THEN
  RETURN NULL;
END;
$$;

-- Preserve the scheduler's existing RPC name. It now resolves either the
-- provider-agnostic media layer or an approved Promo Studio final render.
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
    ON job.id = output.job_id AND job.created_by = scheduled.created_by
  JOIN public.media_assets asset ON asset.id = output.asset_id
  WHERE scheduled.id = p_scheduled_post_id AND scheduled.status = 'publishing'
    AND scheduled.source = 'media_generation' AND output.approved = true
    AND job.status = 'succeeded' AND asset.status = 'ready'
  UNION ALL
  SELECT asset.storage_bucket, asset.storage_path, asset.status
  FROM public.scheduled_social_posts scheduled
  JOIN public.promo_assets asset
    ON asset.id = scheduled.source_promo_asset_id
  JOIN public.promo_projects project
    ON project.id = scheduled.source_promo_project_id
   AND project.current_revision_id = asset.revision_id
  JOIN public.promo_jobs job
    ON job.id = scheduled.source_promo_job_id
   AND job.project_id = project.id AND job.revision_id = project.current_revision_id
   AND job.created_by = scheduled.created_by
  WHERE scheduled.id = p_scheduled_post_id AND scheduled.status = 'publishing'
    AND scheduled.source = 'promo_studio' AND job.job_type = 'final_render'
    AND job.status = 'succeeded' AND job.output_asset_ids @> jsonb_build_array(asset.id)
    AND asset.project_id = project.id
    AND asset.kind = 'render_master' AND asset.status = 'ready' AND asset.approved = true
    AND asset.storage_bucket = 'promo-assets' AND asset.mime_type = 'video/mp4'
    AND EXISTS (
      SELECT 1 FROM public.promo_approvals approval
      WHERE approval.project_id = project.id AND approval.revision_id = project.current_revision_id
        AND approval.gate = 'final' AND approval.subject_type = 'asset'
        AND approval.subject_id = asset.id::TEXT AND approval.decision = 'approved'
        AND NOT EXISTS (
          SELECT 1 FROM public.promo_approvals later
          WHERE later.project_id = approval.project_id AND later.revision_id = approval.revision_id
            AND later.gate = approval.gate AND later.subject_type = approval.subject_type
            AND later.subject_id = approval.subject_id AND later.created_at > approval.created_at
        )
    );
$$;

REVOKE ALL ON FUNCTION public.approve_and_schedule_promo_post(
  UUID, UUID, UUID, UUID, TEXT, TIMESTAMPTZ, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_and_schedule_promo_post(
  UUID, UUID, UUID, UUID, TEXT, TIMESTAMPTZ, TEXT
) TO service_role;
REVOKE ALL ON FUNCTION public.resolve_scheduled_generated_media(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_scheduled_generated_media(UUID) TO service_role;
