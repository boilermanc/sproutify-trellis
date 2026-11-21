ALTER TABLE studio_tracks
  ADD COLUMN IF NOT EXISTS included_in_master BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN studio_tracks.included_in_master IS
  'Whether this track participates in the next Studio master build. Exclusion is reversible before mastering and does not imply audio approval.';
