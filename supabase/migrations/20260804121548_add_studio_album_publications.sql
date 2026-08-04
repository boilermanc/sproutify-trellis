-- Studio publishing is deliberately separate from the Episode tables. n8n may
-- perform the external upload, but Supabase remains the durable source of truth.
CREATE TABLE IF NOT EXISTS studio_publications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  album_id UUID NOT NULL REFERENCES studio_albums(id) ON DELETE CASCADE,
  created_by UUID NOT NULL,
  platform TEXT NOT NULL DEFAULT 'youtube' CHECK (platform IN ('youtube')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready','submitting','live','failed','cancelled')),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  chapters JSONB NOT NULL DEFAULT '[]'::jsonb,
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','unlisted','public')),
  made_for_kids BOOLEAN NOT NULL DEFAULT false,
  scheduled_for TIMESTAMPTZ,
  video_asset_id UUID REFERENCES studio_assets(id) ON DELETE SET NULL,
  thumbnail_asset_id UUID REFERENCES studio_assets(id) ON DELETE SET NULL,
  external_id TEXT,
  external_url TEXT,
  error_message TEXT,
  response_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  submitted_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (album_id, platform)
);

CREATE INDEX IF NOT EXISTS idx_studio_publications_album_status
  ON studio_publications (album_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_studio_publications_creator
  ON studio_publications (created_by, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_studio_publications_tags
  ON studio_publications USING GIN (tags jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_studio_publications_chapters
  ON studio_publications USING GIN (chapters jsonb_path_ops);

ALTER TABLE studio_albums DROP CONSTRAINT IF EXISTS studio_albums_metadata_status_check;
ALTER TABLE studio_albums ADD CONSTRAINT studio_albums_metadata_status_check
  CHECK (metadata_status IN ('not_started','queued','processing','pending_review','approved','failed'));
ALTER TABLE studio_albums DROP CONSTRAINT IF EXISTS studio_albums_publishing_status_check;
ALTER TABLE studio_albums ADD CONSTRAINT studio_albums_publishing_status_check
  CHECK (publishing_status IN ('not_started','ready','submitted','published','failed'));

ALTER TABLE studio_publications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages studio publications" ON studio_publications;
CREATE POLICY "Service role manages studio publications" ON studio_publications
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Studio album owner can read publications" ON studio_publications;
CREATE POLICY "Studio album owner can read publications" ON studio_publications
  FOR SELECT TO authenticated USING (
    created_by = (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM studio_albums album
      WHERE album.id = studio_publications.album_id
        AND album.created_by = (select auth.uid())
    )
  );

GRANT SELECT ON studio_publications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON studio_publications TO service_role;
