-- Trellis Studio Albums is intentionally isolated from the existing
-- trellis_music_* session pipeline until its vertical slice is proven.

CREATE TABLE IF NOT EXISTS studio_feature_flags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  enabled_for_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, key)
);

INSERT INTO studio_feature_flags (organization_id, key, enabled)
VALUES ('00000000-0000-0000-0000-000000000001', 'studio_music_enabled', false)
ON CONFLICT (organization_id, key) DO NOTHING;

CREATE TABLE IF NOT EXISTS studio_albums (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  created_by UUID NOT NULL,
  title TEXT NOT NULL,
  artist_name TEXT NOT NULL,
  description TEXT,
  genre TEXT,
  mood TEXT,
  era TEXT,
  theme TEXT,
  vocal_direction TEXT NOT NULL DEFAULT 'instrumental',
  target_duration_seconds INTEGER NOT NULL CHECK (target_duration_seconds > 0),
  actual_duration_seconds INTEGER,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','planning','generating','review','mastering','master_review','visuals','video','metadata','ready_to_publish','published','failed','archived')),
  music_generation_status TEXT NOT NULL DEFAULT 'not_started' CHECK (music_generation_status IN ('not_started','queued','processing','complete','failed')),
  master_status TEXT NOT NULL DEFAULT 'not_started' CHECK (master_status IN ('not_started','queued','processing','approved','failed')),
  artwork_status TEXT NOT NULL DEFAULT 'not_started' CHECK (artwork_status IN ('not_started','queued','processing','approved','failed')),
  video_status TEXT NOT NULL DEFAULT 'not_started' CHECK (video_status IN ('not_started','queued','processing','approved','failed')),
  metadata_status TEXT NOT NULL DEFAULT 'not_started' CHECK (metadata_status IN ('not_started','queued','processing','approved','failed')),
  publishing_status TEXT NOT NULL DEFAULT 'not_started' CHECK (publishing_status IN ('not_started','ready','submitted','published','failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS studio_tracks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  album_id UUID NOT NULL REFERENCES studio_albums(id) ON DELETE CASCADE,
  track_number INTEGER NOT NULL CHECK (track_number > 0),
  title TEXT NOT NULL,
  narrative_purpose TEXT,
  energy SMALLINT CHECK (energy BETWEEN 1 AND 10),
  instrumentation TEXT,
  vocal_direction TEXT,
  prompt TEXT,
  lyrics TEXT,
  generation_provider TEXT,
  generation_model TEXT,
  provider_generation_id TEXT,
  duration_seconds INTEGER,
  source_audio_path TEXT,
  review_status TEXT NOT NULL DEFAULT 'planned' CHECK (review_status IN ('planned','generated','pending_review','approved','rejected','regenerating','locked','failed')),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (album_id, track_number)
);

CREATE TABLE IF NOT EXISTS studio_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  album_id UUID NOT NULL REFERENCES studio_albums(id) ON DELETE CASCADE,
  track_id UUID REFERENCES studio_tracks(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('track_audio','master_mp3','master_wav','cover_art','thumbnail','scene_image','scene_loop','final_video','logo_overlay','cta_overlay','waveform')),
  storage_bucket TEXT NOT NULL DEFAULT 'studio-assets',
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  file_size BIGINT,
  duration_seconds INTEGER,
  width INTEGER,
  height INTEGER,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending','processing','active','failed','archived')),
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS studio_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  album_id UUID NOT NULL REFERENCES studio_albums(id) ON DELETE CASCADE,
  track_id UUID REFERENCES studio_tracks(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL CHECK (job_type IN ('track_plan','track_generation','master_audio','cover_art','scene_loop','video_render','metadata','publishing_handoff')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','completed','failed','cancelled')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  provider TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  input_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_studio_albums_org_updated ON studio_albums (organization_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_studio_tracks_album_order ON studio_tracks (album_id, track_number);
CREATE INDEX IF NOT EXISTS idx_studio_assets_album ON studio_assets (album_id, asset_type);
CREATE INDEX IF NOT EXISTS idx_studio_jobs_album_status ON studio_jobs (album_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_studio_feature_flags_users ON studio_feature_flags USING GIN (enabled_for_user_ids jsonb_path_ops);

INSERT INTO storage.buckets (id, name, public)
VALUES ('studio-assets', 'studio-assets', false)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE studio_feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio_albums ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages studio feature flags" ON studio_feature_flags;
DROP POLICY IF EXISTS "Service role manages studio albums" ON studio_albums;
DROP POLICY IF EXISTS "Service role manages studio tracks" ON studio_tracks;
DROP POLICY IF EXISTS "Service role manages studio assets" ON studio_assets;
DROP POLICY IF EXISTS "Service role manages studio jobs" ON studio_jobs;
CREATE POLICY "Service role manages studio feature flags" ON studio_feature_flags FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role manages studio albums" ON studio_albums FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role manages studio tracks" ON studio_tracks FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role manages studio assets" ON studio_assets FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role manages studio jobs" ON studio_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);
