-- Track generation is album-owned but independently queued per track. Keep one
-- active job per track while retaining one active album-level job per job type.
DROP INDEX IF EXISTS idx_studio_one_active_job_per_type;

WITH duplicate_active_track_jobs AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY album_id, job_type, track_id ORDER BY created_at DESC, id DESC
  ) AS position
  FROM studio_jobs
  WHERE status IN ('queued', 'processing') AND track_id IS NOT NULL
)
UPDATE studio_jobs
SET status = 'cancelled',
    error_message = COALESCE(error_message, 'Superseded while enforcing one active Studio job per track.'),
    completed_at = NOW(),
    updated_at = NOW()
WHERE id IN (SELECT id FROM duplicate_active_track_jobs WHERE position > 1);

WITH duplicate_active_album_jobs AS (
  SELECT id, ROW_NUMBER() OVER (
    PARTITION BY album_id, job_type ORDER BY created_at DESC, id DESC
  ) AS position
  FROM studio_jobs
  WHERE status IN ('queued', 'processing') AND track_id IS NULL
)
UPDATE studio_jobs
SET status = 'cancelled',
    error_message = COALESCE(error_message, 'Superseded while enforcing one active Studio album job per type.'),
    completed_at = NOW(),
    updated_at = NOW()
WHERE id IN (SELECT id FROM duplicate_active_album_jobs WHERE position > 1);

CREATE UNIQUE INDEX IF NOT EXISTS idx_studio_one_active_track_job
  ON studio_jobs (album_id, job_type, track_id)
  WHERE status IN ('queued', 'processing') AND track_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_studio_one_active_album_job
  ON studio_jobs (album_id, job_type)
  WHERE status IN ('queued', 'processing') AND track_id IS NULL;
