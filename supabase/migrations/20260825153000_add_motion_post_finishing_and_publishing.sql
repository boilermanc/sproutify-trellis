-- Motion Post derivatives and durable Post Publisher lineage.
-- The generated original remains immutable; each timed-text render is a
-- separately tracked derivative that can be selected for publishing.

CREATE TABLE IF NOT EXISTS public.motion_post_finishing_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  motion_post_job_id UUID NOT NULL REFERENCES public.motion_post_jobs(id) ON DELETE RESTRICT,
  created_by UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','running','succeeded','failed','cancel_requested','cancelled')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  text_cues JSONB NOT NULL DEFAULT '[]'::jsonb,
  style JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_bucket TEXT NOT NULL DEFAULT 'motion-posts',
  source_path TEXT NOT NULL,
  output_bucket TEXT NOT NULL DEFAULT 'motion-posts',
  output_path TEXT,
  output_url TEXT,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 2 CHECK (max_attempts BETWEEN 1 AND 5),
  idempotency_key TEXT NOT NULL,
  error_message TEXT,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (created_by, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_motion_post_finishing_owner_created
  ON public.motion_post_finishing_jobs (created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_motion_post_finishing_queue
  ON public.motion_post_finishing_jobs (queued_at)
  WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_motion_post_finishing_source
  ON public.motion_post_finishing_jobs (motion_post_job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_motion_post_finishing_cues
  ON public.motion_post_finishing_jobs USING GIN (text_cues jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_motion_post_finishing_style
  ON public.motion_post_finishing_jobs USING GIN (style jsonb_path_ops);

ALTER TABLE public.motion_post_finishing_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role manages motion post finishing" ON public.motion_post_finishing_jobs;
CREATE POLICY "Service role manages motion post finishing" ON public.motion_post_finishing_jobs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Motion post owner reads finishing" ON public.motion_post_finishing_jobs;
CREATE POLICY "Motion post owner reads finishing" ON public.motion_post_finishing_jobs
  FOR SELECT TO authenticated USING ((select auth.uid()) = created_by);
REVOKE ALL ON public.motion_post_finishing_jobs FROM anon, authenticated;
GRANT SELECT ON public.motion_post_finishing_jobs TO authenticated;
GRANT ALL ON public.motion_post_finishing_jobs TO service_role;

ALTER TABLE public.scheduled_social_posts
  ADD COLUMN IF NOT EXISTS source_motion_post_id UUID REFERENCES public.motion_post_jobs(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS source_motion_finish_id UUID REFERENCES public.motion_post_finishing_jobs(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_ssp_source_motion_post
  ON public.scheduled_social_posts (source_motion_post_id, created_at DESC)
  WHERE source_motion_post_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ssp_source_motion_finish
  ON public.scheduled_social_posts (source_motion_finish_id)
  WHERE source_motion_finish_id IS NOT NULL;
