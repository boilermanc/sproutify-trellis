-- Complete the Studio Albums state contract and retain all heavy processing
-- behind authenticated Edge Functions and trusted workers.
ALTER TABLE studio_albums ADD COLUMN IF NOT EXISTS style_preset_id TEXT;
ALTER TABLE studio_albums ADD COLUMN IF NOT EXISTS style_profile JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE studio_albums ADD COLUMN IF NOT EXISTS release_subtitle TEXT;
ALTER TABLE studio_albums ADD COLUMN IF NOT EXISTS series_name TEXT;
ALTER TABLE studio_albums ADD COLUMN IF NOT EXISTS subgenre TEXT;
ALTER TABLE studio_albums ADD COLUMN IF NOT EXISTS short_description TEXT;
ALTER TABLE studio_albums ADD COLUMN IF NOT EXISTS credits TEXT;
ALTER TABLE studio_albums ADD COLUMN IF NOT EXISTS ai_disclosure TEXT;
ALTER TABLE studio_albums ADD COLUMN IF NOT EXISTS copyright_note TEXT;
ALTER TABLE studio_albums ADD COLUMN IF NOT EXISTS catalog_number TEXT;
ALTER TABLE studio_albums ADD COLUMN IF NOT EXISTS release_identity_status TEXT NOT NULL DEFAULT 'not_started';

ALTER TABLE studio_albums DROP CONSTRAINT IF EXISTS studio_albums_status_check;
ALTER TABLE studio_albums ADD CONSTRAINT studio_albums_status_check CHECK (status IN (
  'draft','planning','generating','review','mastering','master_review','visuals','video','metadata','ready_to_publish','published','failed','archived',
  'track_planning','track_generation','track_review','release_identity','artwork_review','animation_review','video_rendering','video_review','metadata_review','publishing'
));
ALTER TABLE studio_albums DROP CONSTRAINT IF EXISTS studio_albums_master_status_check;
ALTER TABLE studio_albums ADD CONSTRAINT studio_albums_master_status_check CHECK (master_status IN ('not_started','queued','processing','pending_review','approved','failed'));
ALTER TABLE studio_albums DROP CONSTRAINT IF EXISTS studio_albums_video_status_check;
ALTER TABLE studio_albums ADD CONSTRAINT studio_albums_video_status_check CHECK (video_status IN ('not_started','queued','processing','pending_review','approved','failed'));
ALTER TABLE studio_albums DROP CONSTRAINT IF EXISTS studio_albums_release_identity_status_check;
ALTER TABLE studio_albums ADD CONSTRAINT studio_albums_release_identity_status_check CHECK (release_identity_status IN ('not_started','draft','approved'));

ALTER TABLE studio_assets ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE studio_assets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_studio_albums_style_preset ON studio_albums (style_preset_id);
WITH duplicate_active_jobs AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY album_id, job_type ORDER BY created_at DESC, id DESC) AS position
  FROM studio_jobs
  WHERE status IN ('queued', 'processing')
)
UPDATE studio_jobs
SET status = 'cancelled', error_message = COALESCE(error_message, 'Superseded while enforcing one active Studio job per type.'), completed_at = NOW(), updated_at = NOW()
WHERE id IN (SELECT id FROM duplicate_active_jobs WHERE position > 1);
CREATE UNIQUE INDEX IF NOT EXISTS idx_studio_one_active_job_per_type
  ON studio_jobs (album_id, job_type)
  WHERE status IN ('queued', 'processing');
