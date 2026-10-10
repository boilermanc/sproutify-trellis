-- Reversible library cleanup. Retains assets, generation/publication state,
-- and performance links; existing table access policies remain unchanged.
ALTER TABLE public.video_ad_jobs ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS video_ad_jobs_archived_branch_idx
  ON public.video_ad_jobs (branch, archived_at DESC) WHERE archived_at IS NOT NULL;
