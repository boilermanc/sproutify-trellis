-- Atomically register provider-produced Promo Studio voice, alignment, and
-- music results. Workers upload immutable objects to deterministic private
-- paths and may only complete the exact active lease they claimed.

CREATE OR REPLACE FUNCTION public.complete_promo_voice_generation_job(
  p_job_id UUID,
  p_worker_id TEXT,
  p_lease_token UUID,
  p_take_id UUID,
  p_audio_asset_id UUID,
  p_checksum_sha256 TEXT,
  p_file_size_bytes BIGINT,
  p_duration_seconds NUMERIC,
  p_provider TEXT,
  p_model TEXT,
  p_voice_id TEXT,
  p_provider_job_id TEXT,
  p_settings JSONB,
  p_estimated_cost_usd NUMERIC,
  p_output_fingerprint TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  claimed public.promo_jobs%ROWTYPE;
  project_row public.promo_projects%ROWTYPE;
  storage_object RECORD;
  expected_path TEXT;
  take_number SMALLINT;
  take_direction TEXT;
BEGIN
  IF p_worker_id IS NULL OR char_length(trim(p_worker_id)) NOT BETWEEN 1 AND 160
    OR p_lease_token IS NULL OR p_take_id IS NULL OR p_audio_asset_id IS NULL
    OR p_checksum_sha256 IS NULL OR p_checksum_sha256 !~ '^[a-f0-9]{64}$'
    OR p_output_fingerprint IS NULL OR p_output_fingerprint !~ '^[a-f0-9]{64}$'
    OR p_file_size_bytes IS NULL OR p_file_size_bytes <= 0
    OR p_duration_seconds IS NULL OR p_duration_seconds <= 0 OR p_duration_seconds > 600
    OR p_provider IS NULL OR char_length(trim(p_provider)) NOT BETWEEN 1 AND 120
    OR p_model IS NULL OR char_length(trim(p_model)) NOT BETWEEN 1 AND 200
    OR p_voice_id IS NULL OR char_length(trim(p_voice_id)) NOT BETWEEN 1 AND 200
    OR p_provider_job_id IS NULL OR char_length(trim(p_provider_job_id)) NOT BETWEEN 1 AND 300
    OR p_settings IS NULL OR jsonb_typeof(p_settings) IS DISTINCT FROM 'object'
    OR p_estimated_cost_usd IS NULL OR p_estimated_cost_usd < 0
  THEN RETURN false; END IF;

  SELECT j.* INTO claimed
  FROM public.promo_jobs j
  WHERE j.id = p_job_id AND j.job_type = 'voice_generate' AND j.status = 'running'
    AND j.worker_id = trim(p_worker_id) AND j.lease_token = p_lease_token
    AND j.lease_expires_at >= now()
  FOR UPDATE;
  IF claimed.id IS NULL THEN RETURN false; END IF;

  IF claimed.input ->> 'schema_version' IS DISTINCT FROM '1.0.0'
    OR claimed.input ->> 'take_number' !~ '^[1-3]$'
    OR claimed.input ->> 'direction' NOT IN ('natural','warm_authority','launch_energy')
    OR claimed.input ->> 'voice_profile_id' IS NULL
  THEN RETURN false; END IF;
  take_number := (claimed.input ->> 'take_number')::SMALLINT;
  take_direction := claimed.input ->> 'direction';

  SELECT p.* INTO project_row FROM public.promo_projects p
  WHERE p.id = claimed.project_id AND p.current_revision_id = claimed.revision_id;
  IF project_row.id IS NULL THEN RETURN false; END IF;

  expected_path := claimed.project_id::TEXT || '/' || p_audio_asset_id::TEXT || '/voice.wav';
  SELECT o.id, o.version, o.metadata, o.user_metadata INTO storage_object
  FROM storage.objects o WHERE o.bucket_id = 'promo-assets' AND o.name = expected_path;
  IF storage_object.id IS NULL OR storage_object.version IS NULL
    OR jsonb_typeof(storage_object.metadata) IS DISTINCT FROM 'object'
    OR jsonb_typeof(storage_object.user_metadata) IS DISTINCT FROM 'object'
    OR storage_object.metadata ->> 'size' !~ '^[0-9]+$'
    OR (storage_object.metadata ->> 'size')::BIGINT <> p_file_size_bytes
    OR storage_object.metadata ->> 'mimetype' IS DISTINCT FROM 'audio/wav'
    OR storage_object.user_metadata ->> 'sha256' IS DISTINCT FROM p_checksum_sha256
    OR storage_object.user_metadata ->> 'job_id' IS DISTINCT FROM claimed.id::TEXT
    OR storage_object.user_metadata ->> 'input_fingerprint' IS DISTINCT FROM claimed.input_fingerprint
    OR storage_object.user_metadata ->> 'kind' IS DISTINCT FROM 'voice_master'
  THEN RETURN false; END IF;

  INSERT INTO public.promo_assets (
    id, project_id, revision_id, kind, role, status, storage_bucket, storage_path,
    mime_type, checksum_sha256, file_size_bytes, duration_seconds, generated, approved, provenance
  ) VALUES (
    p_audio_asset_id, claimed.project_id, claimed.revision_id, 'voice_master',
    'voice-take-' || take_number::TEXT, 'ready', 'promo-assets', expected_path,
    'audio/wav', p_checksum_sha256, p_file_size_bytes, p_duration_seconds, true, false,
    jsonb_build_object('source', 'promo-voice-worker', 'job_id', claimed.id,
      'take_id', p_take_id, 'provider', trim(p_provider), 'model', trim(p_model),
      'provider_job_id', trim(p_provider_job_id), 'input_fingerprint', claimed.input_fingerprint,
      'output_fingerprint', p_output_fingerprint, 'storage_object_id', storage_object.id,
      'storage_object_version', storage_object.version, 'storage_etag', storage_object.metadata ->> 'eTag')
  );

  INSERT INTO public.promo_voice_takes (
    id, project_id, revision_id, take_number, direction, provider, model, voice_id,
    settings, provider_job_id, audio_asset_id, duration_seconds, selected, status, estimated_cost_usd
  ) VALUES (
    p_take_id, claimed.project_id, claimed.revision_id, take_number, take_direction,
    trim(p_provider), trim(p_model), trim(p_voice_id), p_settings, trim(p_provider_job_id),
    p_audio_asset_id, p_duration_seconds, false, 'aligning', p_estimated_cost_usd
  );

  UPDATE public.promo_jobs SET status = 'succeeded', progress = 100,
    output_asset_ids = jsonb_build_array(p_audio_asset_id), output_fingerprint = p_output_fingerprint,
    completed_at = now(), heartbeat_at = now(), lease_expires_at = NULL, updated_at = now()
  WHERE id = claimed.id;
  UPDATE public.promo_job_attempts SET status = 'succeeded', heartbeat_at = now(), completed_at = now(),
    metrics = metrics || jsonb_build_object('take_id', p_take_id, 'audio_asset_id', p_audio_asset_id,
      'provider_job_id', trim(p_provider_job_id), 'estimated_cost_usd', p_estimated_cost_usd,
      'duration_seconds', p_duration_seconds, 'output_fingerprint', p_output_fingerprint)
  WHERE job_id = claimed.id AND lease_token = p_lease_token AND status = 'running';
  IF NOT FOUND THEN RAISE EXCEPTION 'Active Promo voice attempt was not found'; END IF;
  INSERT INTO public.promo_events (project_id, revision_id, job_id, event_type, stage, correlation_id, details)
  VALUES (claimed.project_id, claimed.revision_id, claimed.id, 'job.succeeded', 'voice_generate',
    gen_random_uuid()::TEXT, jsonb_build_object('worker_id', trim(p_worker_id), 'take_id', p_take_id,
      'audio_asset_id', p_audio_asset_id, 'provider_job_id', trim(p_provider_job_id),
      'output_fingerprint', p_output_fingerprint));
  RETURN true;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR unique_violation OR raise_exception THEN
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_promo_voice_alignment_job(
  p_job_id UUID,
  p_worker_id TEXT,
  p_lease_token UUID,
  p_alignment_asset_id UUID,
  p_checksum_sha256 TEXT,
  p_file_size_bytes BIGINT,
  p_alignment JSONB,
  p_output_fingerprint TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  claimed public.promo_jobs%ROWTYPE;
  project_row public.promo_projects%ROWTYPE;
  take_row public.promo_voice_takes%ROWTYPE;
  storage_object RECORD;
  expected_path TEXT;
  alignment_payload_fingerprint TEXT;
  timing JSONB;
  last_end NUMERIC := 0;
BEGIN
  IF p_worker_id IS NULL OR char_length(trim(p_worker_id)) NOT BETWEEN 1 AND 160
    OR p_lease_token IS NULL OR p_alignment_asset_id IS NULL
    OR p_checksum_sha256 IS NULL OR p_checksum_sha256 !~ '^[a-f0-9]{64}$'
    OR p_output_fingerprint IS NULL OR p_output_fingerprint !~ '^[a-f0-9]{64}$'
    OR p_file_size_bytes IS NULL OR p_file_size_bytes <= 0
    OR p_alignment IS NULL OR jsonb_typeof(p_alignment) IS DISTINCT FROM 'object'
  THEN RETURN false; END IF;

  SELECT j.* INTO claimed FROM public.promo_jobs j
  WHERE j.id = p_job_id AND j.job_type = 'voice_align' AND j.status = 'running'
    AND j.worker_id = trim(p_worker_id) AND j.lease_token = p_lease_token
    AND j.lease_expires_at >= now()
  FOR UPDATE;
  IF claimed.id IS NULL THEN RETURN false; END IF;
  IF claimed.input ->> 'schema_version' IS DISTINCT FROM '1.0.0'
    OR claimed.input ->> 'take_id' IS NULL OR claimed.input ->> 'audio_asset_id' IS NULL
    OR claimed.input ->> 'minimum_alignment_confidence' IS NULL
  THEN RETURN false; END IF;

  SELECT p.* INTO project_row FROM public.promo_projects p
  WHERE p.id = claimed.project_id AND p.current_revision_id = claimed.revision_id;
  IF project_row.id IS NULL THEN RETURN false; END IF;

  SELECT t.* INTO take_row FROM public.promo_voice_takes t
  WHERE t.id = (claimed.input ->> 'take_id')::UUID AND t.project_id = claimed.project_id
    AND t.audio_asset_id = (claimed.input ->> 'audio_asset_id')::UUID AND t.status = 'aligning'
  FOR UPDATE;
  IF take_row.id IS NULL OR take_row.duration_seconds IS NULL THEN RETURN false; END IF;

  IF p_alignment ->> 'schema_version' IS DISTINCT FROM '1.0.0'
    OR p_alignment ->> 'take_id' IS DISTINCT FROM take_row.id::TEXT
    OR p_alignment ->> 'audio_asset_id' IS DISTINCT FROM take_row.audio_asset_id::TEXT
    OR jsonb_typeof(p_alignment -> 'words') IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_alignment -> 'phrases') IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_alignment -> 'phrases') < 1
  THEN RETURN false; END IF;

  FOR timing IN SELECT value FROM jsonb_array_elements(p_alignment -> 'words')
  LOOP
    IF jsonb_typeof(timing) IS DISTINCT FROM 'object'
      OR timing ->> 'start_seconds' !~ '^(0|[1-9][0-9]*)(\.[0-9]+)?$'
      OR timing ->> 'end_seconds' !~ '^(0|[1-9][0-9]*)(\.[0-9]+)?$'
      OR timing ->> 'confidence' !~ '^(0(\.[0-9]+)?|1(\.0+)?)$'
      OR (timing ->> 'start_seconds')::NUMERIC < last_end
      OR (timing ->> 'end_seconds')::NUMERIC <= (timing ->> 'start_seconds')::NUMERIC
      OR (timing ->> 'end_seconds')::NUMERIC > take_row.duration_seconds
      OR (timing ->> 'confidence')::NUMERIC < (claimed.input ->> 'minimum_alignment_confidence')::NUMERIC
    THEN RETURN false; END IF;
    last_end := (timing ->> 'end_seconds')::NUMERIC;
  END LOOP;
  last_end := 0;
  FOR timing IN SELECT value FROM jsonb_array_elements(p_alignment -> 'phrases')
  LOOP
    IF jsonb_typeof(timing) IS DISTINCT FROM 'object'
      OR timing ->> 'phrase_id' IS NULL
      OR timing ->> 'start_seconds' !~ '^(0|[1-9][0-9]*)(\.[0-9]+)?$'
      OR timing ->> 'end_seconds' !~ '^(0|[1-9][0-9]*)(\.[0-9]+)?$'
      OR timing ->> 'confidence' !~ '^(0(\.[0-9]+)?|1(\.0+)?)$'
      OR (timing ->> 'start_seconds')::NUMERIC < last_end
      OR (timing ->> 'end_seconds')::NUMERIC <= (timing ->> 'start_seconds')::NUMERIC
      OR (timing ->> 'end_seconds')::NUMERIC > take_row.duration_seconds
      OR (timing ->> 'confidence')::NUMERIC < (claimed.input ->> 'minimum_alignment_confidence')::NUMERIC
    THEN RETURN false; END IF;
    last_end := (timing ->> 'end_seconds')::NUMERIC;
  END LOOP;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(claimed.input -> 'phrases') expected
    WHERE NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_alignment -> 'phrases') actual
      WHERE actual ->> 'phrase_id' IS NOT DISTINCT FROM expected ->> 'phrase_id'
    )
  ) OR jsonb_array_length(p_alignment -> 'phrases') <> jsonb_array_length(claimed.input -> 'phrases')
  THEN RETURN false; END IF;

  expected_path := claimed.project_id::TEXT || '/' || p_alignment_asset_id::TEXT || '/alignment.json';
  alignment_payload_fingerprint := encode(extensions.digest(convert_to(p_alignment::TEXT, 'UTF8'), 'sha256'), 'hex');
  IF p_checksum_sha256 IS DISTINCT FROM alignment_payload_fingerprint
    OR p_file_size_bytes <> octet_length(convert_to(p_alignment::TEXT, 'UTF8'))
  THEN RETURN false; END IF;
  SELECT o.id, o.version, o.metadata, o.user_metadata INTO storage_object
  FROM storage.objects o WHERE o.bucket_id = 'promo-assets' AND o.name = expected_path;
  IF storage_object.id IS NULL OR storage_object.version IS NULL
    OR storage_object.metadata ->> 'size' !~ '^[0-9]+$'
    OR (storage_object.metadata ->> 'size')::BIGINT <> p_file_size_bytes
    OR storage_object.metadata ->> 'mimetype' IS DISTINCT FROM 'application/json'
    OR storage_object.user_metadata ->> 'sha256' IS DISTINCT FROM p_checksum_sha256
    OR storage_object.user_metadata ->> 'payload_fingerprint_sha256' IS DISTINCT FROM alignment_payload_fingerprint
    OR storage_object.user_metadata ->> 'job_id' IS DISTINCT FROM claimed.id::TEXT
    OR storage_object.user_metadata ->> 'input_fingerprint' IS DISTINCT FROM claimed.input_fingerprint
    OR storage_object.user_metadata ->> 'kind' IS DISTINCT FROM 'voice_alignment'
  THEN RETURN false; END IF;

  INSERT INTO public.promo_assets (
    id, project_id, revision_id, kind, role, status, storage_bucket, storage_path,
    mime_type, checksum_sha256, file_size_bytes, generated, approved, provenance
  ) VALUES (
    p_alignment_asset_id, claimed.project_id, claimed.revision_id, 'voice_alignment',
    'voice-take-' || take_row.take_number::TEXT, 'ready', 'promo-assets', expected_path,
    'application/json', p_checksum_sha256, p_file_size_bytes, true, false,
    jsonb_build_object('source', 'promo-voice-worker', 'job_id', claimed.id, 'take_id', take_row.id,
      'input_fingerprint', claimed.input_fingerprint, 'output_fingerprint', p_output_fingerprint,
      'payload_fingerprint_sha256', alignment_payload_fingerprint, 'alignment', p_alignment,
      'storage_object_id', storage_object.id, 'storage_object_version', storage_object.version,
      'storage_etag', storage_object.metadata ->> 'eTag')
  );
  UPDATE public.promo_voice_takes SET alignment_asset_id = p_alignment_asset_id,
    status = 'ready', updated_at = now() WHERE id = take_row.id;
  UPDATE public.promo_jobs SET status = 'succeeded', progress = 100,
    output_asset_ids = jsonb_build_array(p_alignment_asset_id), output_fingerprint = p_output_fingerprint,
    completed_at = now(), heartbeat_at = now(), lease_expires_at = NULL, updated_at = now()
  WHERE id = claimed.id;
  UPDATE public.promo_job_attempts SET status = 'succeeded', heartbeat_at = now(), completed_at = now(),
    metrics = metrics || jsonb_build_object('take_id', take_row.id, 'alignment_asset_id', p_alignment_asset_id,
      'output_fingerprint', p_output_fingerprint)
  WHERE job_id = claimed.id AND lease_token = p_lease_token AND status = 'running';
  IF NOT FOUND THEN RAISE EXCEPTION 'Active Promo alignment attempt was not found'; END IF;
  INSERT INTO public.promo_events (project_id, revision_id, job_id, event_type, stage, correlation_id, details)
  VALUES (claimed.project_id, claimed.revision_id, claimed.id, 'job.succeeded', 'voice_align',
    gen_random_uuid()::TEXT, jsonb_build_object('worker_id', trim(p_worker_id), 'take_id', take_row.id,
      'alignment_asset_id', p_alignment_asset_id, 'output_fingerprint', p_output_fingerprint));
  RETURN true;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR unique_violation OR raise_exception THEN
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_promo_music_generation_job(
  p_job_id UUID,
  p_worker_id TEXT,
  p_lease_token UUID,
  p_take_id UUID,
  p_audio_asset_id UUID,
  p_checksum_sha256 TEXT,
  p_file_size_bytes BIGINT,
  p_duration_seconds NUMERIC,
  p_provider TEXT,
  p_model TEXT,
  p_provider_job_id TEXT,
  p_cue_markers JSONB,
  p_estimated_cost_usd NUMERIC,
  p_output_fingerprint TEXT
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  claimed public.promo_jobs%ROWTYPE;
  project_row public.promo_projects%ROWTYPE;
  storage_object RECORD;
  expected_path TEXT;
  take_number SMALLINT;
  take_direction TEXT;
  marker JSONB;
BEGIN
  IF p_worker_id IS NULL OR char_length(trim(p_worker_id)) NOT BETWEEN 1 AND 160
    OR p_lease_token IS NULL OR p_take_id IS NULL OR p_audio_asset_id IS NULL
    OR p_checksum_sha256 IS NULL OR p_checksum_sha256 !~ '^[a-f0-9]{64}$'
    OR p_output_fingerprint IS NULL OR p_output_fingerprint !~ '^[a-f0-9]{64}$'
    OR p_file_size_bytes IS NULL OR p_file_size_bytes <= 0
    OR p_duration_seconds IS NULL OR p_duration_seconds <= 0 OR p_duration_seconds > 600
    OR p_provider IS NULL OR char_length(trim(p_provider)) NOT BETWEEN 1 AND 120
    OR p_model IS NULL OR char_length(trim(p_model)) NOT BETWEEN 1 AND 200
    OR p_provider_job_id IS NULL OR char_length(trim(p_provider_job_id)) NOT BETWEEN 1 AND 300
    OR p_cue_markers IS NULL OR jsonb_typeof(p_cue_markers) IS DISTINCT FROM 'array'
    OR p_estimated_cost_usd IS NULL OR p_estimated_cost_usd < 0
  THEN RETURN false; END IF;

  SELECT j.* INTO claimed FROM public.promo_jobs j
  WHERE j.id = p_job_id AND j.job_type = 'music_generate' AND j.status = 'running'
    AND j.worker_id = trim(p_worker_id) AND j.lease_token = p_lease_token
    AND j.lease_expires_at >= now()
  FOR UPDATE;
  IF claimed.id IS NULL THEN RETURN false; END IF;
  IF claimed.input ->> 'schema_version' IS DISTINCT FROM '1.0.0'
    OR claimed.input ->> 'take_number' !~ '^[1-3]$'
    OR claimed.input ->> 'direction' NOT IN ('understated','balanced','energetic')
    OR claimed.input ->> 'instrumental' IS DISTINCT FROM 'true'
  THEN RETURN false; END IF;
  take_number := (claimed.input ->> 'take_number')::SMALLINT;
  take_direction := claimed.input ->> 'direction';
  IF p_duration_seconds < (claimed.input ->> 'target_seconds')::NUMERIC THEN RETURN false; END IF;
  FOR marker IN SELECT value FROM jsonb_array_elements(p_cue_markers)
  LOOP
    IF jsonb_typeof(marker) IS DISTINCT FROM 'object' OR marker ->> 'name' IS NULL
      OR marker ->> 'at_seconds' !~ '^(0|[1-9][0-9]*)(\.[0-9]+)?$'
      OR (marker ->> 'at_seconds')::NUMERIC > p_duration_seconds
      OR (marker ? 'confidence' AND marker -> 'confidence' <> 'null'::jsonb
        AND marker ->> 'confidence' !~ '^(0(\.[0-9]+)?|1(\.0+)?)$')
    THEN RETURN false; END IF;
  END LOOP;
  SELECT p.* INTO project_row FROM public.promo_projects p
  WHERE p.id = claimed.project_id AND p.current_revision_id = claimed.revision_id;
  IF project_row.id IS NULL THEN RETURN false; END IF;

  expected_path := claimed.project_id::TEXT || '/' || p_audio_asset_id::TEXT || '/music.wav';
  SELECT o.id, o.version, o.metadata, o.user_metadata INTO storage_object
  FROM storage.objects o WHERE o.bucket_id = 'promo-assets' AND o.name = expected_path;
  IF storage_object.id IS NULL OR storage_object.version IS NULL
    OR storage_object.metadata ->> 'size' !~ '^[0-9]+$'
    OR (storage_object.metadata ->> 'size')::BIGINT <> p_file_size_bytes
    OR storage_object.metadata ->> 'mimetype' IS DISTINCT FROM 'audio/wav'
    OR storage_object.user_metadata ->> 'sha256' IS DISTINCT FROM p_checksum_sha256
    OR storage_object.user_metadata ->> 'job_id' IS DISTINCT FROM claimed.id::TEXT
    OR storage_object.user_metadata ->> 'input_fingerprint' IS DISTINCT FROM claimed.input_fingerprint
    OR storage_object.user_metadata ->> 'kind' IS DISTINCT FROM 'music_master'
  THEN RETURN false; END IF;

  INSERT INTO public.promo_assets (
    id, project_id, revision_id, kind, role, status, storage_bucket, storage_path,
    mime_type, checksum_sha256, file_size_bytes, duration_seconds, generated, approved, provenance
  ) VALUES (
    p_audio_asset_id, claimed.project_id, claimed.revision_id, 'music_master',
    'music-take-' || take_number::TEXT, 'ready', 'promo-assets', expected_path,
    'audio/wav', p_checksum_sha256, p_file_size_bytes, p_duration_seconds, true, false,
    jsonb_build_object('source', 'promo-music-worker', 'job_id', claimed.id,
      'take_id', p_take_id, 'provider', trim(p_provider), 'model', trim(p_model),
      'provider_job_id', trim(p_provider_job_id), 'input_fingerprint', claimed.input_fingerprint,
      'output_fingerprint', p_output_fingerprint, 'storage_object_id', storage_object.id,
      'storage_object_version', storage_object.version, 'storage_etag', storage_object.metadata ->> 'eTag')
  );
  INSERT INTO public.promo_music_takes (
    id, project_id, revision_id, take_number, direction, provider, model, provider_job_id,
    brief, audio_asset_id, duration_seconds, cue_markers, selected, status, estimated_cost_usd
  ) VALUES (
    p_take_id, claimed.project_id, claimed.revision_id, take_number, take_direction,
    trim(p_provider), trim(p_model), trim(p_provider_job_id), claimed.input -> 'brief',
    p_audio_asset_id, p_duration_seconds, p_cue_markers, false, 'ready', p_estimated_cost_usd
  );
  UPDATE public.promo_jobs SET status = 'succeeded', progress = 100,
    output_asset_ids = jsonb_build_array(p_audio_asset_id), output_fingerprint = p_output_fingerprint,
    completed_at = now(), heartbeat_at = now(), lease_expires_at = NULL, updated_at = now()
  WHERE id = claimed.id;
  UPDATE public.promo_job_attempts SET status = 'succeeded', heartbeat_at = now(), completed_at = now(),
    metrics = metrics || jsonb_build_object('take_id', p_take_id, 'audio_asset_id', p_audio_asset_id,
      'provider_job_id', trim(p_provider_job_id), 'estimated_cost_usd', p_estimated_cost_usd,
      'duration_seconds', p_duration_seconds, 'output_fingerprint', p_output_fingerprint)
  WHERE job_id = claimed.id AND lease_token = p_lease_token AND status = 'running';
  IF NOT FOUND THEN RAISE EXCEPTION 'Active Promo music attempt was not found'; END IF;
  INSERT INTO public.promo_events (project_id, revision_id, job_id, event_type, stage, correlation_id, details)
  VALUES (claimed.project_id, claimed.revision_id, claimed.id, 'job.succeeded', 'music_generate',
    gen_random_uuid()::TEXT, jsonb_build_object('worker_id', trim(p_worker_id), 'take_id', p_take_id,
      'audio_asset_id', p_audio_asset_id, 'provider_job_id', trim(p_provider_job_id),
      'output_fingerprint', p_output_fingerprint));
  RETURN true;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR unique_violation OR raise_exception THEN
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_promo_voice_generation_job(
  UUID, TEXT, UUID, UUID, UUID, TEXT, BIGINT, NUMERIC, TEXT, TEXT, TEXT, TEXT, JSONB, NUMERIC, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_promo_voice_generation_job(
  UUID, TEXT, UUID, UUID, UUID, TEXT, BIGINT, NUMERIC, TEXT, TEXT, TEXT, TEXT, JSONB, NUMERIC, TEXT
) TO service_role;

REVOKE ALL ON FUNCTION public.complete_promo_voice_alignment_job(
  UUID, TEXT, UUID, UUID, TEXT, BIGINT, JSONB, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_promo_voice_alignment_job(
  UUID, TEXT, UUID, UUID, TEXT, BIGINT, JSONB, TEXT
) TO service_role;

REVOKE ALL ON FUNCTION public.complete_promo_music_generation_job(
  UUID, TEXT, UUID, UUID, UUID, TEXT, BIGINT, NUMERIC, TEXT, TEXT, TEXT, JSONB, NUMERIC, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_promo_music_generation_job(
  UUID, TEXT, UUID, UUID, UUID, TEXT, BIGINT, NUMERIC, TEXT, TEXT, TEXT, JSONB, NUMERIC, TEXT
) TO service_role;
