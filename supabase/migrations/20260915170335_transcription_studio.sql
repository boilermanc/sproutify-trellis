-- Trellis Transcription Studio: private operational audio and sanitized transcripts.
CREATE TABLE IF NOT EXISTS public.transcription_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 180),
  original_filename TEXT NOT NULL,
  storage_bucket TEXT NOT NULL DEFAULT 'transcription-audio',
  storage_path TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL CHECK (file_size_bytes > 0 AND file_size_bytes <= 104857600),
  mode TEXT NOT NULL DEFAULT 'standard' CHECK (mode IN ('standard', 'diarized')),
  provider TEXT NOT NULL DEFAULT 'openai' CHECK (provider IN ('openai', 'elevenlabs', 'gemini')),
  model TEXT NOT NULL,
  language TEXT,
  status TEXT NOT NULL DEFAULT 'uploaded' CHECK (status IN ('uploaded', 'processing', 'completed', 'failed', 'cancelled')),
  transcript_text TEXT,
  segments JSONB NOT NULL DEFAULT '[]'::jsonb,
  duration_seconds NUMERIC CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transcription_jobs_owner_updated
  ON public.transcription_jobs (created_by, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_transcription_jobs_status
  ON public.transcription_jobs (status, created_at);
CREATE INDEX IF NOT EXISTS idx_transcription_jobs_segments
  ON public.transcription_jobs USING GIN (segments jsonb_path_ops);

ALTER TABLE public.transcription_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Transcription owners read jobs" ON public.transcription_jobs;
CREATE POLICY "Transcription owners read jobs" ON public.transcription_jobs
  FOR SELECT TO authenticated USING ((select auth.uid()) = created_by);
DROP POLICY IF EXISTS "Transcription owners create jobs" ON public.transcription_jobs;
CREATE POLICY "Transcription owners create jobs" ON public.transcription_jobs
  FOR INSERT TO authenticated WITH CHECK ((select auth.uid()) = created_by);
DROP POLICY IF EXISTS "Transcription owners update jobs" ON public.transcription_jobs;
CREATE POLICY "Transcription owners update jobs" ON public.transcription_jobs
  FOR UPDATE TO authenticated USING ((select auth.uid()) = created_by)
  WITH CHECK ((select auth.uid()) = created_by);
DROP POLICY IF EXISTS "Transcription owners delete jobs" ON public.transcription_jobs;
CREATE POLICY "Transcription owners delete jobs" ON public.transcription_jobs
  FOR DELETE TO authenticated USING ((select auth.uid()) = created_by);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transcription_jobs TO authenticated;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'transcription-audio', 'transcription-audio', false, 104857600,
  ARRAY['audio/mpeg','audio/mp4','audio/wav','audio/x-wav','audio/webm','audio/ogg','audio/flac','video/mp4','video/webm','video/quicktime']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Transcription owners upload audio" ON storage.objects;
CREATE POLICY "Transcription owners upload audio" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'transcription-audio' AND (storage.foldername(name))[1] = (select auth.uid())::text);
DROP POLICY IF EXISTS "Transcription owners read audio" ON storage.objects;
CREATE POLICY "Transcription owners read audio" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'transcription-audio' AND (storage.foldername(name))[1] = (select auth.uid())::text);
DROP POLICY IF EXISTS "Transcription owners delete audio" ON storage.objects;
CREATE POLICY "Transcription owners delete audio" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'transcription-audio' AND (storage.foldername(name))[1] = (select auth.uid())::text);
