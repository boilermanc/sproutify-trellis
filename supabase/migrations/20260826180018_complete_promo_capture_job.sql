-- Atomically register a completed Promo Studio browser capture. The external
-- worker resolves the approved scenario and secrets server-side, uploads to
-- deterministic private paths, then calls this service-role-only RPC.

CREATE OR REPLACE FUNCTION public.complete_promo_capture_job(
  p_job_id UUID,
  p_worker_id TEXT,
  p_lease_token UUID,
  p_capture_run_id UUID,
  p_video_asset_id UUID,
  p_video_checksum_sha256 TEXT,
  p_video_file_size_bytes BIGINT,
  p_duration_seconds NUMERIC,
  p_stills JSONB,
  p_trace_asset_id UUID,
  p_trace_checksum_sha256 TEXT,
  p_trace_file_size_bytes BIGINT,
  p_output_fingerprint TEXT,
  p_evidence JSONB
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  claimed public.promo_jobs%ROWTYPE;
  project_row public.promo_projects%ROWTYPE;
  source_row public.promo_branch_sources%ROWTYPE;
  scenario_row public.promo_capture_scenarios%ROWTYPE;
  artifact JSONB;
  asset_id UUID;
  asset_checksum TEXT;
  asset_size BIGINT;
  asset_width INTEGER;
  asset_height INTEGER;
  asset_path TEXT;
  still_ids JSONB := '[]'::jsonb;
  output_ids JSONB := '[]'::jsonb;
  video_path TEXT;
  trace_path TEXT;
  expected_width INTEGER;
  expected_height INTEGER;
  trace_payload_fingerprint TEXT;
  storage_object RECORD;
BEGIN
  IF p_worker_id IS NULL OR char_length(trim(p_worker_id)) NOT BETWEEN 1 AND 160
    OR p_lease_token IS NULL OR p_capture_run_id IS NULL
    OR p_video_asset_id IS NULL OR p_trace_asset_id IS NULL
    OR p_video_asset_id = p_trace_asset_id
    OR p_video_checksum_sha256 IS NULL OR p_video_checksum_sha256 !~ '^[a-f0-9]{64}$'
    OR p_trace_checksum_sha256 IS NULL OR p_trace_checksum_sha256 !~ '^[a-f0-9]{64}$'
    OR p_output_fingerprint IS NULL OR p_output_fingerprint !~ '^[a-f0-9]{64}$'
    OR p_video_file_size_bytes IS NULL OR p_video_file_size_bytes <= 0
    OR p_trace_file_size_bytes IS NULL OR p_trace_file_size_bytes <= 0
    OR p_duration_seconds IS NULL OR p_duration_seconds <= 0 OR p_duration_seconds > 600
    OR p_stills IS NULL OR jsonb_typeof(p_stills) IS DISTINCT FROM 'array'
    OR jsonb_array_length(p_stills) NOT BETWEEN 1 AND 12
    OR p_evidence IS NULL OR jsonb_typeof(p_evidence) IS DISTINCT FROM 'object'
  THEN
    RETURN false;
  END IF;

  SELECT j.* INTO claimed
  FROM public.promo_jobs j
  WHERE j.id = p_job_id
    AND j.job_type = 'capture'
    AND j.status = 'running'
    AND j.worker_id = trim(p_worker_id)
    AND j.lease_token = p_lease_token
    AND j.lease_expires_at >= now()
  FOR UPDATE;

  IF claimed.id IS NULL THEN RETURN false; END IF;

  IF claimed.input ->> 'schema_version' IS DISTINCT FROM '1.0.0'
    OR claimed.input ->> 'scenario_id' IS NULL
    OR claimed.input ->> 'scenario_key' IS NULL
    OR claimed.input ->> 'scenario_version' !~ '^[1-9][0-9]*$'
    OR claimed.input ->> 'branch_source_id' IS NULL
    OR claimed.input ->> 'expected_commit_sha' !~ '^[a-f0-9]{40}$'
  THEN
    RETURN false;
  END IF;

  SELECT p.* INTO project_row
  FROM public.promo_projects p
  WHERE p.id = claimed.project_id AND p.current_revision_id = claimed.revision_id;
  IF project_row.id IS NULL THEN RETURN false; END IF;

  SELECT s.* INTO source_row
  FROM public.promo_branch_sources s
  WHERE s.id = (claimed.input ->> 'branch_source_id')::UUID
    AND s.branch_id = project_row.branch_id
    AND s.is_active = true;
  IF source_row.id IS NULL OR source_row.capture_base_url IS NULL
    OR source_row.capture_fixture_key IS NULL
  THEN
    RETURN false;
  END IF;

  SELECT s.* INTO scenario_row
  FROM public.promo_capture_scenarios s
  WHERE s.revision_id = claimed.revision_id
    AND s.scenario_key = claimed.input ->> 'scenario_key'
    AND s.scenario_version = (claimed.input ->> 'scenario_version')::INTEGER
    AND s.project_id = claimed.project_id
  FOR UPDATE;
  IF scenario_row.id IS NULL THEN RETURN false; END IF;

  IF scenario_row.definition ->> 'id' IS DISTINCT FROM claimed.input ->> 'scenario_id'
    OR scenario_row.repository_ref IS DISTINCT FROM source_row.default_ref
    OR scenario_row.commit_sha IS DISTINCT FROM claimed.input ->> 'expected_commit_sha'
    OR scenario_row.definition ->> 'commit_sha' IS DISTINCT FROM scenario_row.commit_sha
    OR trim(trailing '/' FROM scenario_row.environment) IS DISTINCT FROM trim(trailing '/' FROM source_row.capture_base_url)
    OR scenario_row.definition ->> 'fixture' IS DISTINCT FROM source_row.capture_fixture_key
    OR scenario_row.auth_profile_key IS DISTINCT FROM source_row.capture_auth_profile_key
    OR scenario_row.definition ->> 'contains_pii' IS DISTINCT FROM 'false'
    OR jsonb_typeof(scenario_row.definition -> 'assertions') IS DISTINCT FROM 'array'
    OR jsonb_array_length(scenario_row.definition -> 'assertions') < 1
    OR jsonb_typeof(scenario_row.definition -> 'masks') IS DISTINCT FROM 'array'
    OR scenario_row.definition #>> '{viewport,width}' !~ '^[1-9][0-9]*$'
    OR scenario_row.definition #>> '{viewport,height}' !~ '^[1-9][0-9]*$'
  THEN
    RETURN false;
  END IF;
  expected_width := (scenario_row.definition #>> '{viewport,width}')::INTEGER;
  expected_height := (scenario_row.definition #>> '{viewport,height}')::INTEGER;
  IF expected_width > 4096 OR expected_height > 4096 THEN RETURN false; END IF;

  IF p_evidence ->> 'schema_version' IS DISTINCT FROM '1.0.0'
    OR p_evidence ->> 'scenario_id' IS DISTINCT FROM claimed.input ->> 'scenario_id'
    OR p_evidence ->> 'scenario_key' IS DISTINCT FROM scenario_row.scenario_key
    OR p_evidence ->> 'scenario_version' IS DISTINCT FROM scenario_row.scenario_version::TEXT
    OR p_evidence ->> 'commit_sha' IS DISTINCT FROM scenario_row.commit_sha
    OR p_evidence ->> 'route' IS DISTINCT FROM scenario_row.route
    OR p_evidence ->> 'contains_pii' IS DISTINCT FROM 'false'
    OR p_evidence -> 'masks_applied' IS DISTINCT FROM scenario_row.definition -> 'masks'
    OR jsonb_typeof(p_evidence -> 'assertions') IS DISTINCT FROM 'array'
    OR EXISTS (
      SELECT 1
      FROM jsonb_array_elements(scenario_row.definition -> 'assertions') expected
      WHERE NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_evidence -> 'assertions') actual
        WHERE actual ->> 'kind' IS NOT DISTINCT FROM expected ->> 'kind'
          AND actual -> 'value' IS NOT DISTINCT FROM expected -> 'value'
          AND actual ->> 'passed' = 'true'
      )
    )
  THEN
    RETURN false;
  END IF;

  video_path := claimed.project_id::TEXT || '/' || p_video_asset_id::TEXT || '/capture.mp4';
  trace_path := claimed.project_id::TEXT || '/' || p_trace_asset_id::TEXT || '/trace.json';
  trace_payload_fingerprint := encode(extensions.digest(convert_to(p_evidence::TEXT, 'UTF8'), 'sha256'), 'hex');
  IF p_trace_checksum_sha256 IS DISTINCT FROM trace_payload_fingerprint
    OR p_trace_file_size_bytes <> octet_length(convert_to(p_evidence::TEXT, 'UTF8'))
  THEN
    RETURN false;
  END IF;

  SELECT o.id, o.version, o.metadata, o.user_metadata INTO storage_object
  FROM storage.objects o WHERE o.bucket_id = 'promo-assets' AND o.name = video_path;
  IF storage_object.id IS NULL OR storage_object.version IS NULL
    OR jsonb_typeof(storage_object.metadata) IS DISTINCT FROM 'object'
    OR jsonb_typeof(storage_object.user_metadata) IS DISTINCT FROM 'object'
    OR storage_object.metadata ->> 'size' !~ '^[0-9]+$'
    OR (storage_object.metadata ->> 'size')::BIGINT <> p_video_file_size_bytes
    OR storage_object.metadata ->> 'mimetype' IS DISTINCT FROM 'video/mp4'
    OR storage_object.user_metadata ->> 'sha256' IS DISTINCT FROM p_video_checksum_sha256
    OR storage_object.user_metadata ->> 'job_id' IS DISTINCT FROM claimed.id::TEXT
    OR storage_object.user_metadata ->> 'input_fingerprint' IS DISTINCT FROM claimed.input_fingerprint
    OR storage_object.user_metadata ->> 'kind' IS DISTINCT FROM 'capture_video'
  THEN RETURN false; END IF;

  INSERT INTO public.promo_assets (
    id, project_id, revision_id, kind, role, status, storage_bucket, storage_path,
    mime_type, checksum_sha256, file_size_bytes, duration_seconds, width, height,
    generated, approved, provenance
  ) VALUES (
    p_video_asset_id, claimed.project_id, claimed.revision_id, 'capture_video', scenario_row.scenario_key,
    'ready', 'promo-assets', video_path, 'video/mp4', p_video_checksum_sha256,
    p_video_file_size_bytes, p_duration_seconds, expected_width, expected_height, false, false,
    jsonb_build_object('source', 'promo-capture-worker', 'job_id', claimed.id,
      'capture_run_id', p_capture_run_id, 'scenario_id', scenario_row.id,
      'input_fingerprint', claimed.input_fingerprint, 'output_fingerprint', p_output_fingerprint,
      'storage_object_id', storage_object.id, 'storage_object_version', storage_object.version,
      'storage_etag', storage_object.metadata ->> 'eTag')
  );
  output_ids := jsonb_build_array(p_video_asset_id);

  FOR artifact IN SELECT value FROM jsonb_array_elements(p_stills)
  LOOP
    IF jsonb_typeof(artifact) IS DISTINCT FROM 'object'
      OR artifact ->> 'asset_id' IS NULL
      OR artifact ->> 'checksum_sha256' !~ '^[a-f0-9]{64}$'
      OR artifact ->> 'file_size_bytes' !~ '^[1-9][0-9]*$'
      OR artifact ->> 'width' !~ '^[1-9][0-9]*$'
      OR artifact ->> 'height' !~ '^[1-9][0-9]*$'
    THEN RAISE EXCEPTION 'Capture still descriptor failed validation'; END IF;
    BEGIN
      asset_id := (artifact ->> 'asset_id')::UUID;
      asset_size := (artifact ->> 'file_size_bytes')::BIGINT;
      asset_width := (artifact ->> 'width')::INTEGER;
      asset_height := (artifact ->> 'height')::INTEGER;
    EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
      RAISE EXCEPTION 'Capture still descriptor types failed validation';
    END;
    asset_checksum := artifact ->> 'checksum_sha256';
    IF asset_id IN (p_video_asset_id, p_trace_asset_id)
      OR still_ids @> jsonb_build_array(asset_id)
      OR asset_width <> expected_width OR asset_height <> expected_height
    THEN RAISE EXCEPTION 'Capture still identity or viewport failed validation'; END IF;
    asset_path := claimed.project_id::TEXT || '/' || asset_id::TEXT || '/capture.png';
    SELECT o.id, o.version, o.metadata, o.user_metadata INTO storage_object
    FROM storage.objects o WHERE o.bucket_id = 'promo-assets' AND o.name = asset_path;
    IF storage_object.id IS NULL OR storage_object.version IS NULL
      OR jsonb_typeof(storage_object.metadata) IS DISTINCT FROM 'object'
      OR jsonb_typeof(storage_object.user_metadata) IS DISTINCT FROM 'object'
      OR storage_object.metadata ->> 'size' !~ '^[0-9]+$'
      OR (storage_object.metadata ->> 'size')::BIGINT <> asset_size
      OR storage_object.metadata ->> 'mimetype' IS DISTINCT FROM 'image/png'
      OR storage_object.user_metadata ->> 'sha256' IS DISTINCT FROM asset_checksum
      OR storage_object.user_metadata ->> 'job_id' IS DISTINCT FROM claimed.id::TEXT
      OR storage_object.user_metadata ->> 'input_fingerprint' IS DISTINCT FROM claimed.input_fingerprint
      OR storage_object.user_metadata ->> 'kind' IS DISTINCT FROM 'capture_still'
    THEN RAISE EXCEPTION 'Capture still Storage object failed validation'; END IF;
    INSERT INTO public.promo_assets (
      id, project_id, revision_id, kind, role, status, storage_bucket, storage_path,
      mime_type, checksum_sha256, file_size_bytes, width, height, generated, approved, provenance
    ) VALUES (
      asset_id, claimed.project_id, claimed.revision_id, 'capture_still', scenario_row.scenario_key,
      'ready', 'promo-assets', asset_path, 'image/png', asset_checksum, asset_size,
      asset_width, asset_height, false, false,
      jsonb_build_object('source', 'promo-capture-worker', 'job_id', claimed.id,
        'capture_run_id', p_capture_run_id, 'scenario_id', scenario_row.id,
        'input_fingerprint', claimed.input_fingerprint, 'output_fingerprint', p_output_fingerprint,
        'storage_object_id', storage_object.id, 'storage_object_version', storage_object.version,
        'storage_etag', storage_object.metadata ->> 'eTag')
    );
    still_ids := still_ids || jsonb_build_array(asset_id);
    output_ids := output_ids || jsonb_build_array(asset_id);
  END LOOP;

  SELECT o.id, o.version, o.metadata, o.user_metadata INTO storage_object
  FROM storage.objects o WHERE o.bucket_id = 'promo-assets' AND o.name = trace_path;
  IF storage_object.id IS NULL OR storage_object.version IS NULL
    OR jsonb_typeof(storage_object.metadata) IS DISTINCT FROM 'object'
    OR jsonb_typeof(storage_object.user_metadata) IS DISTINCT FROM 'object'
    OR storage_object.metadata ->> 'size' !~ '^[0-9]+$'
    OR (storage_object.metadata ->> 'size')::BIGINT <> p_trace_file_size_bytes
    OR storage_object.metadata ->> 'mimetype' IS DISTINCT FROM 'application/json'
    OR storage_object.user_metadata ->> 'sha256' IS DISTINCT FROM p_trace_checksum_sha256
    OR storage_object.user_metadata ->> 'job_id' IS DISTINCT FROM claimed.id::TEXT
    OR storage_object.user_metadata ->> 'input_fingerprint' IS DISTINCT FROM claimed.input_fingerprint
    OR storage_object.user_metadata ->> 'kind' IS DISTINCT FROM 'capture_trace'
    OR storage_object.user_metadata ->> 'payload_fingerprint_sha256' IS DISTINCT FROM trace_payload_fingerprint
  THEN RAISE EXCEPTION 'Capture trace Storage object failed validation'; END IF;

  INSERT INTO public.promo_assets (
    id, project_id, revision_id, kind, role, status, storage_bucket, storage_path,
    mime_type, checksum_sha256, file_size_bytes, generated, approved, provenance
  ) VALUES (
    p_trace_asset_id, claimed.project_id, claimed.revision_id, 'capture_trace', scenario_row.scenario_key,
    'ready', 'promo-assets', trace_path, 'application/json', p_trace_checksum_sha256,
    p_trace_file_size_bytes, false, false,
    jsonb_build_object('source', 'promo-capture-worker', 'job_id', claimed.id,
      'capture_run_id', p_capture_run_id, 'scenario_id', scenario_row.id,
      'input_fingerprint', claimed.input_fingerprint, 'output_fingerprint', p_output_fingerprint,
      'payload_fingerprint_sha256', trace_payload_fingerprint,
      'storage_object_id', storage_object.id, 'storage_object_version', storage_object.version,
      'storage_etag', storage_object.metadata ->> 'eTag', 'evidence', p_evidence)
  );
  output_ids := output_ids || jsonb_build_array(p_trace_asset_id);

  INSERT INTO public.promo_capture_runs (
    id, project_id, revision_id, scenario_id, status, attempt_count, heartbeat_at,
    video_asset_id, still_asset_ids, trace_asset_id, evidence
  ) VALUES (
    p_capture_run_id, claimed.project_id, claimed.revision_id, scenario_row.id, 'succeeded',
    claimed.attempt_count, now(), p_video_asset_id, still_ids, p_trace_asset_id, p_evidence
  );

  UPDATE public.promo_capture_scenarios SET status = 'verified', updated_at = now()
  WHERE id = scenario_row.id;
  UPDATE public.promo_jobs
  SET status = 'succeeded', progress = 100, output_asset_ids = output_ids,
      output_fingerprint = p_output_fingerprint, completed_at = now(), heartbeat_at = now(),
      lease_expires_at = NULL, updated_at = now()
  WHERE id = claimed.id;
  UPDATE public.promo_job_attempts
  SET status = 'succeeded', heartbeat_at = now(), completed_at = now(),
      metrics = metrics || jsonb_build_object('capture_run_id', p_capture_run_id,
        'video_asset_id', p_video_asset_id, 'still_asset_ids', still_ids,
        'trace_asset_id', p_trace_asset_id, 'output_fingerprint', p_output_fingerprint,
        'duration_seconds', p_duration_seconds)
  WHERE job_id = claimed.id AND lease_token = p_lease_token AND status = 'running';
  IF NOT FOUND THEN RAISE EXCEPTION 'Active Promo capture attempt was not found'; END IF;

  INSERT INTO public.promo_events (
    project_id, revision_id, job_id, event_type, stage, correlation_id, details
  ) VALUES (
    claimed.project_id, claimed.revision_id, claimed.id, 'job.succeeded', 'capture',
    gen_random_uuid()::TEXT,
    jsonb_build_object('worker_id', trim(p_worker_id), 'capture_run_id', p_capture_run_id,
      'scenario_id', scenario_row.id, 'video_asset_id', p_video_asset_id,
      'still_asset_ids', still_ids, 'trace_asset_id', p_trace_asset_id,
      'output_fingerprint', p_output_fingerprint)
  );
  RETURN true;
-- Every rejection after the first asset insert raises into this handler. The
-- PL/pgSQL exception block rolls back all statements in the function before
-- returning false to the worker, preserving atomic registration.
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range OR raise_exception THEN
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_promo_capture_job(
  UUID, TEXT, UUID, UUID, UUID, TEXT, BIGINT, NUMERIC, JSONB, UUID, TEXT, BIGINT, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_promo_capture_job(
  UUID, TEXT, UUID, UUID, UUID, TEXT, BIGINT, NUMERIC, JSONB, UUID, TEXT, BIGINT, TEXT, JSONB
) TO service_role;
