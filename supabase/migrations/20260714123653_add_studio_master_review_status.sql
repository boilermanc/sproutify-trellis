ALTER TABLE studio_albums DROP CONSTRAINT IF EXISTS studio_albums_master_status_check;
ALTER TABLE studio_albums
  ADD CONSTRAINT studio_albums_master_status_check
  CHECK (master_status IN ('not_started', 'queued', 'processing', 'pending_review', 'approved', 'failed'));

ALTER TABLE studio_albums DROP CONSTRAINT IF EXISTS studio_albums_status_check;
ALTER TABLE studio_albums
  ADD CONSTRAINT studio_albums_status_check
  CHECK (status IN ('draft', 'planning', 'generating', 'review', 'mastering', 'master_review', 'visuals', 'video', 'metadata', 'ready_to_publish', 'published', 'failed', 'archived', 'track_planning', 'track_generation', 'track_review', 'release_identity', 'artwork_review', 'animation_review', 'video_rendering', 'video_review', 'metadata_review', 'publishing'));

UPDATE studio_albums
SET master_status = 'pending_review', updated_at = NOW()
WHERE id = 'cfd3ff73-eb00-4f20-990d-8049ebb5f451'
  AND master_status = 'approved'
  AND status = 'master_review';
