-- Clip Studio audio bed (Phase A: music). A clip can carry one generated audio
-- track that the render worker muxes onto the stitched vertical video. The
-- track is produced through the existing music_generations (Lyria) path, so we
-- keep a link to that job plus the resolved public URL and the direction the
-- user gave. All nullable — a clip with no audio stitches silently as before.
ALTER TABLE trellis_clip_projects ADD COLUMN IF NOT EXISTS music_job_id UUID;
ALTER TABLE trellis_clip_projects ADD COLUMN IF NOT EXISTS audio_url TEXT;
-- { kind: 'music', prompt, genre, mood, vocal_style } — the direction, kept so
-- the panel can rehydrate and regenerate.
ALTER TABLE trellis_clip_projects ADD COLUMN IF NOT EXISTS audio_config JSONB;
