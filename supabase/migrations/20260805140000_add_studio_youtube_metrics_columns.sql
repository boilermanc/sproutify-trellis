-- Lets the YouTube analytics sync (E9) attach rows to a Studio Album release,
-- not just a Trellis Episode release. Both FK pairs stay nullable; a metrics
-- row belongs to exactly one pipeline.
ALTER TABLE trellis_youtube_daily_metrics ADD COLUMN IF NOT EXISTS studio_album_id UUID REFERENCES studio_albums(id) ON DELETE CASCADE;
ALTER TABLE trellis_youtube_daily_metrics ADD COLUMN IF NOT EXISTS studio_publication_id UUID REFERENCES studio_publications(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_tytm_studio_album ON trellis_youtube_daily_metrics (studio_album_id);
CREATE INDEX IF NOT EXISTS idx_tytm_studio_publication ON trellis_youtube_daily_metrics (studio_publication_id);
