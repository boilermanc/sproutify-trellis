ALTER TABLE trellis_music_renders
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
