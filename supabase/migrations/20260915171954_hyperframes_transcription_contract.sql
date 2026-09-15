ALTER TABLE public.transcription_jobs
  ADD COLUMN IF NOT EXISTS words JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.transcription_jobs
  DROP CONSTRAINT IF EXISTS transcription_jobs_file_size_bytes_check;
ALTER TABLE public.transcription_jobs
  ADD CONSTRAINT transcription_jobs_file_size_bytes_check
  CHECK (file_size_bytes > 0 AND file_size_bytes <= 26214400);

CREATE INDEX IF NOT EXISTS idx_transcription_jobs_words
  ON public.transcription_jobs USING GIN (words jsonb_path_ops);

UPDATE storage.buckets
SET file_size_limit = 26214400
WHERE id = 'transcription-audio';
