-- Motion Posts: animate a still with a provider, optionally mix owned Rekkrd
-- audio, and hand the public MP4 to the existing social publisher.

ALTER TABLE public.tenant_secrets
  ADD COLUMN IF NOT EXISTS xai_api_key TEXT;

CREATE TABLE IF NOT EXISTS public.motion_post_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  created_by UUID NOT NULL,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  branch_slug TEXT NOT NULL DEFAULT 'rekkrd',
  title TEXT NOT NULL DEFAULT 'Untitled motion post',
  prompt TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'xai' CHECK (provider IN ('xai')),
  model TEXT NOT NULL DEFAULT 'grok-imagine-video-1.5',
  duration_seconds INTEGER NOT NULL DEFAULT 7 CHECK (duration_seconds BETWEEN 3 AND 15),
  aspect_ratio TEXT NOT NULL DEFAULT '9:16' CHECK (aspect_ratio IN ('9:16')),
  resolution TEXT NOT NULL DEFAULT '720p' CHECK (resolution IN ('480p','720p','1080p')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','generating','mixing','ready','failed','publishing','published','cancelled')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  source_bucket TEXT NOT NULL DEFAULT 'motion-posts',
  source_path TEXT NOT NULL,
  source_url TEXT,
  provider_request_id TEXT,
  generated_video_url TEXT,
  audio_source_type TEXT CHECK (audio_source_type IN ('studio_track','studio_master','music_generation')),
  audio_source_id UUID,
  audio_title TEXT,
  audio_url TEXT,
  audio_start_seconds NUMERIC NOT NULL DEFAULT 0 CHECK (audio_start_seconds >= 0),
  caption TEXT,
  output_bucket TEXT NOT NULL DEFAULT 'motion-posts',
  output_path TEXT,
  output_url TEXT,
  cost_estimate NUMERIC NOT NULL DEFAULT 0,
  cost_actual NUMERIC,
  error_message TEXT,
  published_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_motion_post_jobs_owner_created
  ON public.motion_post_jobs (created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_motion_post_jobs_status
  ON public.motion_post_jobs (status, updated_at DESC);

ALTER TABLE public.motion_post_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role manages motion posts" ON public.motion_post_jobs;
CREATE POLICY "Service role manages motion posts" ON public.motion_post_jobs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Motion post owner reads jobs" ON public.motion_post_jobs;
CREATE POLICY "Motion post owner reads jobs" ON public.motion_post_jobs
  FOR SELECT TO authenticated USING ((select auth.uid()) = created_by);
REVOKE ALL ON public.motion_post_jobs FROM anon, authenticated;
GRANT SELECT ON public.motion_post_jobs TO authenticated;
GRANT ALL ON public.motion_post_jobs TO service_role;

INSERT INTO storage.buckets (id, name, public)
VALUES ('motion-posts', 'motion-posts', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "Motion post owners upload assets" ON storage.objects;
CREATE POLICY "Motion post owners upload assets" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'motion-posts'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );
DROP POLICY IF EXISTS "Motion post owners read assets" ON storage.objects;
CREATE POLICY "Motion post owners read assets" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'motion-posts'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );
DROP POLICY IF EXISTS "Motion post owners delete assets" ON storage.objects;
CREATE POLICY "Motion post owners delete assets" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'motion-posts'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );
