-- Keep Studio assets and records private to the creating user while the
-- temporary per-user feature gate is in use. Trusted Edge Functions/workers
-- use service_role and never expose that key to the browser.

ALTER TABLE studio_tracks
  ADD COLUMN IF NOT EXISTS legacy_generation_id UUID REFERENCES trellis_music_tracks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS studio_asset_id UUID REFERENCES studio_assets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_studio_tracks_legacy_generation ON studio_tracks (legacy_generation_id);

DROP POLICY IF EXISTS "Studio album owner can read albums" ON studio_albums;
DROP POLICY IF EXISTS "Studio album owner can read tracks" ON studio_tracks;
DROP POLICY IF EXISTS "Studio album owner can read assets" ON studio_assets;
DROP POLICY IF EXISTS "Studio album owner can read jobs" ON studio_jobs;

CREATE POLICY "Studio album owner can read albums" ON studio_albums
  FOR SELECT TO authenticated USING (created_by = (select auth.uid()));
CREATE POLICY "Studio album owner can read tracks" ON studio_tracks
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM studio_albums a WHERE a.id = studio_tracks.album_id AND a.created_by = (select auth.uid()))
  );
CREATE POLICY "Studio album owner can read assets" ON studio_assets
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM studio_albums a WHERE a.id = studio_assets.album_id AND a.created_by = (select auth.uid()))
  );
CREATE POLICY "Studio album owner can read jobs" ON studio_jobs
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM studio_albums a WHERE a.id = studio_jobs.album_id AND a.created_by = (select auth.uid()))
  );

DROP POLICY IF EXISTS "Studio album owner can read asset objects" ON storage.objects;
CREATE POLICY "Studio album owner can read asset objects" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'studio-assets' AND EXISTS (
      SELECT 1
      FROM studio_assets asset
      JOIN studio_albums album ON album.id = asset.album_id
      WHERE asset.storage_bucket = storage.objects.bucket_id
        AND asset.storage_path = storage.objects.name
        AND album.created_by = (select auth.uid())
    )
  );

GRANT SELECT ON studio_albums, studio_tracks, studio_assets, studio_jobs TO authenticated;
