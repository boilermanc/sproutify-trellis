ALTER TABLE studio_albums ADD COLUMN IF NOT EXISTS release_subtitle TEXT;
ALTER TABLE studio_albums ADD COLUMN IF NOT EXISTS series_name TEXT;
ALTER TABLE studio_albums ADD COLUMN IF NOT EXISTS subgenre TEXT;
ALTER TABLE studio_albums ADD COLUMN IF NOT EXISTS short_description TEXT;
ALTER TABLE studio_albums ADD COLUMN IF NOT EXISTS credits TEXT;
ALTER TABLE studio_albums ADD COLUMN IF NOT EXISTS ai_disclosure TEXT;
ALTER TABLE studio_albums ADD COLUMN IF NOT EXISTS copyright_note TEXT;
ALTER TABLE studio_albums ADD COLUMN IF NOT EXISTS catalog_number TEXT;
ALTER TABLE studio_albums ADD COLUMN IF NOT EXISTS release_identity_status TEXT NOT NULL DEFAULT 'not_started';

ALTER TABLE studio_albums DROP CONSTRAINT IF EXISTS studio_albums_release_identity_status_check;
ALTER TABLE studio_albums
  ADD CONSTRAINT studio_albums_release_identity_status_check
  CHECK (release_identity_status IN ('not_started', 'draft', 'approved'));
