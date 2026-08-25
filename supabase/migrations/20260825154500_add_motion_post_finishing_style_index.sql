-- Follow-up for projects where the base finishing migration was applied before
-- the style JSONB index was added to the master schema.
CREATE INDEX IF NOT EXISTS idx_motion_post_finishing_style
  ON public.motion_post_finishing_jobs USING GIN (style jsonb_path_ops);
