CREATE OR REPLACE FUNCTION claim_trellis_music_track(
  p_session_id UUID,
  p_track_id UUID DEFAULT NULL
) RETURNS SETOF trellis_music_tracks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH candidate AS (
    SELECT id
    FROM trellis_music_tracks
    WHERE (
      p_track_id IS NOT NULL
      AND id = p_track_id
      AND status = 'queued'
    ) OR (
      p_track_id IS NULL
      AND session_id = p_session_id
      AND status = 'queued'
    )
    ORDER BY track_number
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  UPDATE trellis_music_tracks t
  SET
    status = 'generating',
    error_message = NULL,
    updated_at = NOW()
  FROM candidate
  WHERE t.id = candidate.id
  RETURNING t.*;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_trellis_music_track(UUID, UUID) TO anon, authenticated, service_role;
