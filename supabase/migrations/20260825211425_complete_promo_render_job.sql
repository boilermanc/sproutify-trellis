-- Atomically register a completed Promo Studio render and its QA report.
-- The external worker uploads to deterministic private paths before calling
-- this RPC; no browser client can execute it.

CREATE OR REPLACE FUNCTION public.complete_promo_render_job(
  p_job_id UUID,
  p_worker_id TEXT,
  p_lease_token UUID,
  p_render_asset_id UUID,
  p_qa_asset_id UUID,
  p_render_checksum_sha256 TEXT,
  p_qa_checksum_sha256 TEXT,
  p_render_file_size_bytes BIGINT,
  p_qa_file_size_bytes BIGINT,
  p_duration_seconds NUMERIC,
  p_output_fingerprint TEXT,
  p_qa JSONB
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  claimed public.promo_jobs%ROWTYPE;
  render_kind TEXT;
  render_filename TEXT;
  render_path TEXT;
  qa_path TEXT;
  target_seconds NUMERIC;
  qa_duration NUMERIC;
  qa_lufs NUMERIC;
  qa_true_peak NUMERIC;
  qa_payload_fingerprint TEXT;
  render_object RECORD;
  qa_object RECORD;
BEGIN
  IF p_worker_id IS NULL OR char_length(trim(p_worker_id)) NOT BETWEEN 1 AND 160
    OR p_lease_token IS NULL OR p_render_asset_id IS NULL OR p_qa_asset_id IS NULL
    OR p_render_asset_id = p_qa_asset_id
    OR p_render_checksum_sha256 IS NULL OR p_render_checksum_sha256 !~ '^[a-f0-9]{64}$'
    OR p_qa_checksum_sha256 IS NULL OR p_qa_checksum_sha256 !~ '^[a-f0-9]{64}$'
    OR p_output_fingerprint IS NULL OR p_output_fingerprint !~ '^[a-f0-9]{64}$'
    OR p_render_file_size_bytes IS NULL OR p_render_file_size_bytes <= 0
    OR p_qa_file_size_bytes IS NULL OR p_qa_file_size_bytes <= 0
    OR p_duration_seconds IS NULL OR p_duration_seconds <= 0
    OR p_qa IS NULL OR jsonb_typeof(p_qa) IS DISTINCT FROM 'object'
  THEN
    RETURN false;
  END IF;

  SELECT j.* INTO claimed
  FROM public.promo_jobs j
  WHERE j.id = p_job_id
    AND j.job_type IN ('preview_render', 'final_render')
    AND j.status = 'running'
    AND j.worker_id = trim(p_worker_id)
    AND j.lease_token = p_lease_token
    AND j.lease_expires_at >= now()
  FOR UPDATE;

  IF claimed.id IS NULL THEN RETURN false; END IF;

  render_kind := CASE claimed.job_type
    WHEN 'preview_render' THEN 'render_preview'
    ELSE 'render_master'
  END;
  render_filename := CASE claimed.job_type
    WHEN 'preview_render' THEN 'preview.mp4'
    ELSE 'final.mp4'
  END;
  render_path := claimed.project_id::TEXT || '/' || p_render_asset_id::TEXT || '/' || render_filename;
  qa_path := claimed.project_id::TEXT || '/' || p_qa_asset_id::TEXT || '/qa.json';

  IF (claimed.input ->> 'mode') IS DISTINCT FROM (CASE claimed.job_type WHEN 'preview_render' THEN 'preview' ELSE 'final' END)
    OR claimed.input #>> '{format,width}' IS DISTINCT FROM '1080'
    OR claimed.input #>> '{format,height}' IS DISTINCT FROM '1920'
    OR claimed.input #>> '{timeline,fps}' IS DISTINCT FROM '30'
    OR claimed.input #>> '{render_profile,video_codec}' IS DISTINCT FROM 'h264'
    OR claimed.input #>> '{render_profile,pixel_format}' IS DISTINCT FROM 'yuv420p'
    OR claimed.input #>> '{render_profile,audio_codec}' IS DISTINCT FROM 'aac'
    OR claimed.input #>> '{render_profile,audio_sample_rate}' IS DISTINCT FROM '48000'
    OR claimed.input #>> '{render_profile,expected_ffmpeg_fingerprint}' IS NULL
    OR claimed.input #>> '{render_profile,expected_ffmpeg_fingerprint}' !~ '^[a-f0-9]{64}$'
    OR claimed.input #>> '{timeline,target_seconds}' IS NULL
    OR claimed.input #>> '{timeline,target_seconds}' !~ '^[0-9]+([.][0-9]+)?$'
  THEN
    RETURN false;
  END IF;
  target_seconds := (claimed.input #>> '{timeline,target_seconds}')::NUMERIC;

  IF p_qa ->> 'duration_seconds' IS NULL OR p_qa ->> 'duration_seconds' !~ '^(0|[1-9][0-9]*)([.][0-9]*[1-9])?$'
    OR p_qa ->> 'integrated_lufs' IS NULL OR p_qa ->> 'integrated_lufs' !~ '^-?(0|[1-9][0-9]*)([.][0-9]*[1-9])?$'
    OR p_qa ->> 'true_peak_dbfs' IS NULL OR p_qa ->> 'true_peak_dbfs' !~ '^-?(0|[1-9][0-9]*)([.][0-9]*[1-9])?$'
  THEN
    RETURN false;
  END IF;
  qa_duration := (p_qa ->> 'duration_seconds')::NUMERIC;
  qa_lufs := (p_qa ->> 'integrated_lufs')::NUMERIC;
  qa_true_peak := (p_qa ->> 'true_peak_dbfs')::NUMERIC;
  -- The uploaded qa.json must use these exact UTF-8 bytes: PostgreSQL JSONB
  -- text (duplicate keys removed, keys in JSONB order, normalized numbers,
  -- and one space after each comma and colon).
  qa_payload_fingerprint := encode(extensions.digest(convert_to(p_qa::TEXT, 'UTF8'), 'sha256'), 'hex');

  IF p_qa ->> 'schema_version' IS DISTINCT FROM '1.0.0'
    OR p_qa ->> 'passed' IS DISTINCT FROM 'true'
    OR p_qa ->> 'input_fingerprint' IS DISTINCT FROM claimed.input_fingerprint
    OR p_qa ->> 'output_checksum_sha256' IS DISTINCT FROM p_render_checksum_sha256
    OR (p_qa ->> 'ffmpeg_fingerprint') IS DISTINCT FROM (claimed.input #>> '{render_profile,expected_ffmpeg_fingerprint}')
    OR p_qa ->> 'width' IS DISTINCT FROM '1080'
    OR p_qa ->> 'height' IS DISTINCT FROM '1920'
    OR p_qa ->> 'fps' IS DISTINCT FROM '30'
    OR p_qa ->> 'video_codec' IS DISTINCT FROM 'h264'
    OR p_qa ->> 'pixel_format' IS DISTINCT FROM 'yuv420p'
    OR p_qa ->> 'audio_codec' IS DISTINCT FROM 'aac'
    OR p_qa ->> 'audio_sample_rate' IS DISTINCT FROM '48000'
    OR p_qa ->> 'faststart' IS DISTINCT FROM 'true'
    OR p_qa ->> 'color_range' IS DISTINCT FROM 'tv'
    OR p_qa_checksum_sha256 IS DISTINCT FROM qa_payload_fingerprint
    OR p_qa_file_size_bytes <> octet_length(convert_to(p_qa::TEXT, 'UTF8'))
    OR abs(qa_duration - p_duration_seconds) > 0.001
    OR abs(p_duration_seconds - target_seconds) > 0.05
    OR qa_lufs NOT BETWEEN -14.5 AND -13.5
    OR qa_true_peak > -1.5
  THEN
    RETURN false;
  END IF;

  SELECT o.id, o.version, o.metadata, o.user_metadata INTO render_object
  FROM storage.objects o
  WHERE o.bucket_id = 'promo-assets' AND o.name = render_path;
  SELECT o.id, o.version, o.metadata, o.user_metadata INTO qa_object
  FROM storage.objects o
  WHERE o.bucket_id = 'promo-assets' AND o.name = qa_path;

  IF render_object.id IS NULL OR qa_object.id IS NULL
    OR render_object.version IS NULL OR qa_object.version IS NULL
    OR jsonb_typeof(render_object.metadata) IS DISTINCT FROM 'object'
    OR jsonb_typeof(qa_object.metadata) IS DISTINCT FROM 'object'
    OR jsonb_typeof(render_object.user_metadata) IS DISTINCT FROM 'object'
    OR jsonb_typeof(qa_object.user_metadata) IS DISTINCT FROM 'object'
    OR render_object.metadata ->> 'size' IS NULL
    OR render_object.metadata ->> 'size' !~ '^[0-9]+$'
    OR (render_object.metadata ->> 'size')::BIGINT <> p_render_file_size_bytes
    OR qa_object.metadata ->> 'size' IS NULL
    OR qa_object.metadata ->> 'size' !~ '^[0-9]+$'
    OR (qa_object.metadata ->> 'size')::BIGINT <> p_qa_file_size_bytes
    OR render_object.metadata ->> 'mimetype' IS DISTINCT FROM 'video/mp4'
    OR qa_object.metadata ->> 'mimetype' IS DISTINCT FROM 'application/json'
    OR render_object.user_metadata ->> 'sha256' IS DISTINCT FROM p_render_checksum_sha256
    OR qa_object.user_metadata ->> 'sha256' IS DISTINCT FROM p_qa_checksum_sha256
    OR render_object.user_metadata ->> 'job_id' IS DISTINCT FROM claimed.id::TEXT
    OR qa_object.user_metadata ->> 'job_id' IS DISTINCT FROM claimed.id::TEXT
    OR render_object.user_metadata ->> 'input_fingerprint' IS DISTINCT FROM claimed.input_fingerprint
    OR qa_object.user_metadata ->> 'input_fingerprint' IS DISTINCT FROM claimed.input_fingerprint
    OR render_object.user_metadata ->> 'kind' IS DISTINCT FROM render_kind
    OR qa_object.user_metadata ->> 'kind' IS DISTINCT FROM 'qa_report'
    OR qa_object.user_metadata ->> 'payload_fingerprint_sha256' IS DISTINCT FROM qa_payload_fingerprint
  THEN
    RETURN false;
  END IF;

  INSERT INTO public.promo_assets (
    id, project_id, revision_id, kind, role, status, storage_bucket, storage_path,
    mime_type, checksum_sha256, file_size_bytes, duration_seconds, width, height,
    generated, approved, provenance
  ) VALUES (
    p_render_asset_id, claimed.project_id, claimed.revision_id, render_kind, claimed.job_type,
    'ready', 'promo-assets', render_path, 'video/mp4', p_render_checksum_sha256,
    p_render_file_size_bytes, p_duration_seconds, 1080, 1920, true, false,
    jsonb_build_object(
      'source', 'promo-render-worker',
      'job_id', claimed.id,
      'input_fingerprint', claimed.input_fingerprint,
      'output_fingerprint', p_output_fingerprint,
      'qa_asset_id', p_qa_asset_id,
      'ffmpeg_fingerprint', p_qa ->> 'ffmpeg_fingerprint',
      'storage_object_id', render_object.id,
      'storage_object_version', render_object.version,
      'storage_etag', render_object.metadata ->> 'eTag'
    )
  );

  INSERT INTO public.promo_assets (
    id, project_id, revision_id, kind, role, status, storage_bucket, storage_path,
    mime_type, checksum_sha256, file_size_bytes, generated, approved, provenance
  ) VALUES (
    p_qa_asset_id, claimed.project_id, claimed.revision_id, 'qa_report', claimed.job_type || '_qa',
    'ready', 'promo-assets', qa_path, 'application/json', p_qa_checksum_sha256,
    p_qa_file_size_bytes, true, false,
    jsonb_build_object(
      'source', 'promo-render-worker',
      'job_id', claimed.id,
      'input_fingerprint', claimed.input_fingerprint,
      'output_fingerprint', p_output_fingerprint,
      'render_asset_id', p_render_asset_id,
      'payload_fingerprint_sha256', qa_payload_fingerprint,
      'storage_object_id', qa_object.id,
      'storage_object_version', qa_object.version,
      'storage_etag', qa_object.metadata ->> 'eTag',
      'report', p_qa
    )
  );

  UPDATE public.promo_jobs
  SET status = 'succeeded', progress = 100,
      output_asset_ids = jsonb_build_array(p_render_asset_id, p_qa_asset_id),
      output_fingerprint = p_output_fingerprint, completed_at = now(),
      heartbeat_at = now(), lease_expires_at = NULL, updated_at = now()
  WHERE id = claimed.id;

  UPDATE public.promo_job_attempts
  SET status = 'succeeded', heartbeat_at = now(), completed_at = now(),
      metrics = metrics || jsonb_build_object(
        'render_asset_id', p_render_asset_id,
        'qa_asset_id', p_qa_asset_id,
        'output_fingerprint', p_output_fingerprint,
        'duration_seconds', p_duration_seconds,
        'integrated_lufs', qa_lufs,
        'true_peak_dbfs', qa_true_peak
      )
  WHERE job_id = claimed.id AND lease_token = p_lease_token AND status = 'running';

  IF NOT FOUND THEN RAISE EXCEPTION 'Active Promo render attempt was not found'; END IF;

  INSERT INTO public.promo_events (
    project_id, revision_id, job_id, event_type, stage, correlation_id, details
  ) VALUES (
    claimed.project_id, claimed.revision_id, claimed.id, 'job.succeeded', claimed.job_type,
    gen_random_uuid()::TEXT,
    jsonb_build_object(
      'worker_id', trim(p_worker_id),
      'render_asset_id', p_render_asset_id,
      'qa_asset_id', p_qa_asset_id,
      'output_fingerprint', p_output_fingerprint
    )
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_promo_render_job(
  UUID, TEXT, UUID, UUID, UUID, TEXT, TEXT, BIGINT, BIGINT, NUMERIC, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_promo_render_job(
  UUID, TEXT, UUID, UUID, UUID, TEXT, TEXT, BIGINT, BIGINT, NUMERIC, TEXT, JSONB
) TO service_role;
