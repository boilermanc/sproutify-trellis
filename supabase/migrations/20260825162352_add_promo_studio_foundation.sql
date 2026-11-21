-- Trellis Promo Studio foundation.
-- Browser clients receive RLS-constrained read access only. All mutations,
-- signed asset operations, approvals, and worker transitions go through the
-- promo-studio Edge Function or service-role workers.

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS public.promo_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 160),
  request_prompt TEXT NOT NULL CHECK (char_length(request_prompt) BETWEEN 1 AND 12000),
  target_seconds NUMERIC NOT NULL DEFAULT 30 CHECK (target_seconds > 0 AND target_seconds <= 600),
  requested_formats JSONB NOT NULL DEFAULT '["9:16"]'::jsonb CHECK (jsonb_typeof(requested_formats) = 'array'),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft','intelligence','planning','script_review','audio_review','asset_review',
    'previewing','final_review','ready','publishing','published','failed','archived'
  )),
  current_revision_id UUID,
  selected_preview_render_id UUID,
  final_approved_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.promo_manifest_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.promo_projects(id) ON DELETE CASCADE,
  revision_number INTEGER NOT NULL CHECK (revision_number > 0),
  parent_revision_id UUID REFERENCES public.promo_manifest_revisions(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL DEFAULT 'Initial draft' CHECK (char_length(reason) BETWEEN 1 AND 1000),
  schema_version TEXT NOT NULL DEFAULT '1.0.0',
  manifest JSONB NOT NULL CHECK (jsonb_typeof(manifest) = 'object'),
  manifest_fingerprint TEXT NOT NULL CHECK (manifest_fingerprint ~ '^[a-f0-9]{64}$'),
  diff JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(diff) = 'array'),
  immutable_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, revision_number),
  UNIQUE (project_id, manifest_fingerprint)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'promo_projects_current_revision_fk'
  ) THEN
    ALTER TABLE public.promo_projects
      ADD CONSTRAINT promo_projects_current_revision_fk
      FOREIGN KEY (current_revision_id) REFERENCES public.promo_manifest_revisions(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.promo_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.promo_projects(id) ON DELETE CASCADE,
  revision_id UUID NOT NULL REFERENCES public.promo_manifest_revisions(id) ON DELETE CASCADE,
  claim_key TEXT NOT NULL,
  claim_text TEXT NOT NULL CHECK (char_length(claim_text) BETWEEN 1 AND 4000),
  claim_type TEXT NOT NULL CHECK (claim_type IN ('product_feature','product_positioning','brand','cta','user_attested')),
  evidence_status TEXT NOT NULL CHECK (evidence_status IN ('verified','user_attested','unsupported','stale')),
  evidence_refs JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(evidence_refs) = 'array'),
  approved BOOLEAN NOT NULL DEFAULT false,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (revision_id, claim_key)
);

CREATE TABLE IF NOT EXISTS public.promo_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.promo_projects(id) ON DELETE CASCADE,
  revision_id UUID REFERENCES public.promo_manifest_revisions(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN (
    'capture_still','capture_video','capture_trace','repository_asset','brand_logo',
    'voice_master','voice_preview','voice_alignment','music_master','music_preview',
    'sfx','render_preview','render_master','qa_report','contact_sheet','provider_response'
  )),
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'uploading' CHECK (status IN ('uploading','ready','processing','failed','stale','archived')),
  storage_bucket TEXT NOT NULL DEFAULT 'promo-assets',
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  checksum_sha256 TEXT CHECK (checksum_sha256 IS NULL OR checksum_sha256 ~ '^[a-f0-9]{64}$'),
  file_size_bytes BIGINT CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
  duration_seconds NUMERIC CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  width INTEGER CHECK (width IS NULL OR width > 0),
  height INTEGER CHECK (height IS NULL OR height > 0),
  generated BOOLEAN NOT NULL DEFAULT false,
  approved BOOLEAN NOT NULL DEFAULT false,
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(provenance) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (storage_bucket, storage_path)
);

CREATE TABLE IF NOT EXISTS public.promo_scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.promo_projects(id) ON DELETE CASCADE,
  revision_id UUID NOT NULL REFERENCES public.promo_manifest_revisions(id) ON DELETE CASCADE,
  scene_key TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  name TEXT NOT NULL,
  purpose TEXT NOT NULL,
  phrase_anchor JSONB NOT NULL CHECK (jsonb_typeof(phrase_anchor) = 'object'),
  duration_policy JSONB NOT NULL CHECK (jsonb_typeof(duration_policy) = 'object'),
  visual_kind TEXT NOT NULL CHECK (visual_kind IN ('real_ui_capture','repository_asset','generated_visual','stock_or_user_asset','text_graphic')),
  primary_asset_id UUID REFERENCES public.promo_assets(id) ON DELETE SET NULL,
  layout JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(layout) = 'object'),
  provenance JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(provenance) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (revision_id, scene_key),
  UNIQUE (revision_id, position)
);

CREATE TABLE IF NOT EXISTS public.promo_voice_takes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.promo_projects(id) ON DELETE CASCADE,
  revision_id UUID NOT NULL REFERENCES public.promo_manifest_revisions(id) ON DELETE CASCADE,
  take_number SMALLINT NOT NULL CHECK (take_number BETWEEN 1 AND 3),
  direction TEXT NOT NULL CHECK (direction IN ('natural','warm_authority','launch_energy')),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  voice_id TEXT NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(settings) = 'object'),
  provider_job_id TEXT,
  audio_asset_id UUID REFERENCES public.promo_assets(id) ON DELETE SET NULL,
  alignment_asset_id UUID REFERENCES public.promo_assets(id) ON DELETE SET NULL,
  duration_seconds NUMERIC CHECK (duration_seconds IS NULL OR duration_seconds > 0),
  selected BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','generating','aligning','ready','failed')),
  error_code TEXT,
  error_message TEXT,
  estimated_cost_usd NUMERIC(12,6) CHECK (estimated_cost_usd IS NULL OR estimated_cost_usd >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (revision_id, take_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_voice_one_selected
  ON public.promo_voice_takes (revision_id) WHERE selected = true;

CREATE TABLE IF NOT EXISTS public.promo_music_takes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.promo_projects(id) ON DELETE CASCADE,
  revision_id UUID NOT NULL REFERENCES public.promo_manifest_revisions(id) ON DELETE CASCADE,
  take_number SMALLINT NOT NULL CHECK (take_number BETWEEN 1 AND 3),
  direction TEXT NOT NULL CHECK (direction IN ('understated','balanced','energetic')),
  music_generation_id UUID REFERENCES public.music_generations(id) ON DELETE SET NULL,
  provider TEXT NOT NULL DEFAULT 'google-lyria',
  model TEXT NOT NULL,
  provider_job_id TEXT,
  brief JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(brief) = 'object'),
  audio_asset_id UUID REFERENCES public.promo_assets(id) ON DELETE SET NULL,
  duration_seconds NUMERIC CHECK (duration_seconds IS NULL OR duration_seconds > 0),
  cue_markers JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(cue_markers) = 'array'),
  selected BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','generating','ready','failed')),
  error_code TEXT,
  error_message TEXT,
  estimated_cost_usd NUMERIC(12,6) CHECK (estimated_cost_usd IS NULL OR estimated_cost_usd >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (revision_id, take_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_promo_music_one_selected
  ON public.promo_music_takes (revision_id) WHERE selected = true;

CREATE TABLE IF NOT EXISTS public.promo_capture_scenarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.promo_projects(id) ON DELETE CASCADE,
  revision_id UUID NOT NULL REFERENCES public.promo_manifest_revisions(id) ON DELETE CASCADE,
  scenario_key TEXT NOT NULL,
  scenario_version INTEGER NOT NULL DEFAULT 1 CHECK (scenario_version > 0),
  repository_ref TEXT NOT NULL,
  commit_sha TEXT NOT NULL CHECK (commit_sha ~ '^[a-f0-9]{40}$'),
  environment TEXT NOT NULL,
  route TEXT NOT NULL,
  auth_profile_key TEXT,
  definition JSONB NOT NULL CHECK (jsonb_typeof(definition) = 'object'),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','verified','failed','stale')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (revision_id, scenario_key, scenario_version)
);

CREATE TABLE IF NOT EXISTS public.promo_capture_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.promo_projects(id) ON DELETE CASCADE,
  revision_id UUID NOT NULL REFERENCES public.promo_manifest_revisions(id) ON DELETE CASCADE,
  scenario_id UUID NOT NULL REFERENCES public.promo_capture_scenarios(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','cancelled','stale')),
  attempt_count SMALLINT NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  heartbeat_at TIMESTAMPTZ,
  video_asset_id UUID REFERENCES public.promo_assets(id) ON DELETE SET NULL,
  still_asset_ids JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(still_asset_ids) = 'array'),
  trace_asset_id UUID REFERENCES public.promo_assets(id) ON DELETE SET NULL,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(evidence) = 'object'),
  error_code TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.promo_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.promo_projects(id) ON DELETE CASCADE,
  revision_id UUID NOT NULL REFERENCES public.promo_manifest_revisions(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL CHECK (job_type IN (
    'noop','intelligence_scan','creative_plan','voice_generate','voice_align','capture',
    'music_generate','gpu_media_generate','scene_render','preview_render','final_render','format_export','publish'
  )),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','cancel_requested','cancelled')),
  priority SMALLINT NOT NULL DEFAULT 0 CHECK (priority BETWEEN -10 AND 10),
  idempotency_key TEXT NOT NULL CHECK (char_length(idempotency_key) BETWEEN 1 AND 200),
  dependency_job_ids JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(dependency_job_ids) = 'array'),
  input_fingerprint TEXT NOT NULL CHECK (input_fingerprint ~ '^[a-f0-9]{64}$'),
  input JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(input) = 'object'),
  output_asset_ids JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(output_asset_ids) = 'array'),
  output_fingerprint TEXT CHECK (output_fingerprint IS NULL OR output_fingerprint ~ '^[a-f0-9]{64}$'),
  progress SMALLINT NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  max_attempts SMALLINT NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 8),
  attempt_count SMALLINT NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  worker_id TEXT,
  lease_token UUID,
  lease_expires_at TIMESTAMPTZ,
  heartbeat_at TIMESTAMPTZ,
  error_code TEXT,
  error_message TEXT,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS public.promo_job_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.promo_jobs(id) ON DELETE CASCADE,
  attempt_number SMALLINT NOT NULL CHECK (attempt_number > 0),
  worker_id TEXT NOT NULL,
  lease_token UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','succeeded','failed','cancelled','lease_expired')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  error_code TEXT,
  error_message TEXT,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metrics) = 'object'),
  UNIQUE (job_id, attempt_number)
);

CREATE TABLE IF NOT EXISTS public.promo_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.promo_projects(id) ON DELETE CASCADE,
  revision_id UUID NOT NULL REFERENCES public.promo_manifest_revisions(id) ON DELETE CASCADE,
  gate TEXT NOT NULL CHECK (gate IN ('script','storyboard','voice','music','assets','preview','final','publish')),
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approved','changes_requested','rejected','revoked')),
  decided_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.promo_events (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES public.promo_projects(id) ON DELETE CASCADE,
  revision_id UUID REFERENCES public.promo_manifest_revisions(id) ON DELETE SET NULL,
  job_id UUID REFERENCES public.promo_jobs(id) ON DELETE SET NULL,
  attempt_id UUID REFERENCES public.promo_job_attempts(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  stage TEXT,
  correlation_id TEXT,
  actor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_promo_projects_owner_updated ON public.promo_projects (created_by, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_promo_projects_branch_updated ON public.promo_projects (branch_id, updated_at DESC) WHERE branch_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_promo_projects_current_revision ON public.promo_projects (current_revision_id) WHERE current_revision_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_promo_revisions_project_created ON public.promo_manifest_revisions (project_id, revision_number DESC);
CREATE INDEX IF NOT EXISTS idx_promo_revisions_parent ON public.promo_manifest_revisions (parent_revision_id) WHERE parent_revision_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_promo_claims_revision_status ON public.promo_claims (revision_id, evidence_status, approved);
CREATE INDEX IF NOT EXISTS idx_promo_claims_project ON public.promo_claims (project_id);
CREATE INDEX IF NOT EXISTS idx_promo_assets_project_kind ON public.promo_assets (project_id, kind, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_promo_assets_revision ON public.promo_assets (revision_id) WHERE revision_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_promo_scenes_revision_position ON public.promo_scenes (revision_id, position);
CREATE INDEX IF NOT EXISTS idx_promo_scenes_project ON public.promo_scenes (project_id);
CREATE INDEX IF NOT EXISTS idx_promo_scenes_asset ON public.promo_scenes (primary_asset_id) WHERE primary_asset_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_promo_voice_project ON public.promo_voice_takes (project_id);
CREATE INDEX IF NOT EXISTS idx_promo_voice_audio_asset ON public.promo_voice_takes (audio_asset_id) WHERE audio_asset_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_promo_voice_alignment_asset ON public.promo_voice_takes (alignment_asset_id) WHERE alignment_asset_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_promo_music_project ON public.promo_music_takes (project_id);
CREATE INDEX IF NOT EXISTS idx_promo_music_generation ON public.promo_music_takes (music_generation_id) WHERE music_generation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_promo_music_audio_asset ON public.promo_music_takes (audio_asset_id) WHERE audio_asset_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_promo_capture_scenarios_project ON public.promo_capture_scenarios (project_id);
CREATE INDEX IF NOT EXISTS idx_promo_capture_runs_scenario_created ON public.promo_capture_runs (scenario_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_promo_capture_runs_project ON public.promo_capture_runs (project_id);
CREATE INDEX IF NOT EXISTS idx_promo_capture_runs_revision ON public.promo_capture_runs (revision_id);
CREATE INDEX IF NOT EXISTS idx_promo_jobs_project_created ON public.promo_jobs (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_promo_jobs_revision ON public.promo_jobs (revision_id);
CREATE INDEX IF NOT EXISTS idx_promo_jobs_creator ON public.promo_jobs (created_by);
CREATE INDEX IF NOT EXISTS idx_promo_jobs_claimable ON public.promo_jobs (priority DESC, queued_at, id)
  WHERE status IN ('queued','running');
CREATE INDEX IF NOT EXISTS idx_promo_job_attempts_job ON public.promo_job_attempts (job_id, attempt_number DESC);
CREATE INDEX IF NOT EXISTS idx_promo_approvals_project ON public.promo_approvals (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_promo_approvals_revision ON public.promo_approvals (revision_id);
CREATE INDEX IF NOT EXISTS idx_promo_events_project_created ON public.promo_events (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_promo_events_revision ON public.promo_events (revision_id) WHERE revision_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_promo_events_job ON public.promo_events (job_id) WHERE job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_promo_events_attempt ON public.promo_events (attempt_id) WHERE attempt_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_promo_projects_formats_gin ON public.promo_projects USING GIN (requested_formats jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_promo_revisions_manifest_gin ON public.promo_manifest_revisions USING GIN (manifest jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_promo_revisions_diff_gin ON public.promo_manifest_revisions USING GIN (diff jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_promo_claims_evidence_gin ON public.promo_claims USING GIN (evidence_refs jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_promo_assets_provenance_gin ON public.promo_assets USING GIN (provenance jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_promo_scenes_anchor_gin ON public.promo_scenes USING GIN (phrase_anchor jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_promo_scenes_duration_gin ON public.promo_scenes USING GIN (duration_policy jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_promo_scenes_layout_gin ON public.promo_scenes USING GIN (layout jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_promo_voice_settings_gin ON public.promo_voice_takes USING GIN (settings jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_promo_music_brief_gin ON public.promo_music_takes USING GIN (brief jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_promo_music_cues_gin ON public.promo_music_takes USING GIN (cue_markers jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_promo_capture_definition_gin ON public.promo_capture_scenarios USING GIN (definition jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_promo_capture_stills_gin ON public.promo_capture_runs USING GIN (still_asset_ids jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_promo_capture_evidence_gin ON public.promo_capture_runs USING GIN (evidence jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_promo_jobs_dependencies_gin ON public.promo_jobs USING GIN (dependency_job_ids jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_promo_jobs_input_gin ON public.promo_jobs USING GIN (input jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_promo_jobs_outputs_gin ON public.promo_jobs USING GIN (output_asset_ids jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_promo_attempts_metrics_gin ON public.promo_job_attempts USING GIN (metrics jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_promo_events_details_gin ON public.promo_events USING GIN (details jsonb_path_ops);

CREATE OR REPLACE FUNCTION public.touch_promo_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'promo_projects','promo_assets','promo_voice_takes','promo_music_takes',
    'promo_capture_scenarios','promo_capture_runs','promo_jobs'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS touch_%I_updated_at ON public.%I', table_name, table_name);
    EXECUTE format('CREATE TRIGGER touch_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.touch_promo_updated_at()', table_name, table_name);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION private.can_access_promo_project(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.promo_projects p
    WHERE p.id = p_project_id
      AND (
        p.created_by = (SELECT auth.uid())
        OR (
          p.branch_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM public.trellis_user_branches ub
            JOIN public.trellis_users u ON u.id = ub.trellis_user_id
            WHERE u.auth_user_id = (SELECT auth.uid())
              AND u.status = 'active'
              AND ub.branch_id = p.branch_id
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION private.can_access_promo_project(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_access_promo_project(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.claim_promo_job(
  p_worker_id TEXT, p_lease_seconds INTEGER DEFAULT 120, p_job_types JSONB DEFAULT NULL
)
RETURNS SETOF public.promo_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE claimed public.promo_jobs%ROWTYPE;
BEGIN
  IF p_worker_id IS NULL OR char_length(trim(p_worker_id)) NOT BETWEEN 1 AND 160 THEN
    RAISE EXCEPTION 'A valid worker id is required';
  END IF;
  IF p_lease_seconds NOT BETWEEN 30 AND 900 THEN
    RAISE EXCEPTION 'Lease seconds must be between 30 and 900';
  END IF;
  IF p_job_types IS NOT NULL AND jsonb_typeof(p_job_types) <> 'array' THEN
    RAISE EXCEPTION 'Job types must be a JSON array';
  END IF;

  WITH candidate AS (
    SELECT j.id
    FROM public.promo_jobs j
    WHERE j.attempt_count < j.max_attempts
      AND (p_job_types IS NULL OR p_job_types ? j.job_type)
      AND (
        j.status = 'queued'
        OR (j.status = 'running' AND j.lease_expires_at < now())
      )
      AND NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(j.dependency_job_ids) dependency(id)
        LEFT JOIN public.promo_jobs upstream ON upstream.id = dependency.id::UUID
        WHERE upstream.id IS NULL OR upstream.status <> 'succeeded'
      )
    ORDER BY j.priority DESC, j.queued_at, j.id
    LIMIT 1
    FOR UPDATE OF j SKIP LOCKED
  )
  UPDATE public.promo_jobs j
  SET status = 'running',
      worker_id = trim(p_worker_id),
      lease_token = gen_random_uuid(),
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      heartbeat_at = now(),
      started_at = COALESCE(j.started_at, now()),
      attempt_count = j.attempt_count + 1,
      progress = GREATEST(j.progress, 1),
      error_code = NULL,
      error_message = NULL,
      updated_at = now()
  FROM candidate
  WHERE j.id = candidate.id
  RETURNING j.* INTO claimed;

  IF claimed.id IS NULL THEN RETURN; END IF;

  UPDATE public.promo_job_attempts
  SET status = 'lease_expired', completed_at = now(), error_code = 'PROMO_JOB_LEASE_EXPIRED',
      error_message = 'Worker lease expired before completion.'
  WHERE job_id = claimed.id AND status = 'running';

  INSERT INTO public.promo_job_attempts (job_id, attempt_number, worker_id, lease_token)
  VALUES (claimed.id, claimed.attempt_count, claimed.worker_id, claimed.lease_token);

  RETURN NEXT claimed;
END;
$$;

CREATE OR REPLACE FUNCTION public.heartbeat_promo_job(
  p_job_id UUID, p_worker_id TEXT, p_lease_token UUID, p_progress SMALLINT, p_lease_seconds INTEGER DEFAULT 120
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE touched INTEGER;
BEGIN
  IF p_progress NOT BETWEEN 0 AND 99 OR p_lease_seconds NOT BETWEEN 30 AND 900 THEN RETURN false; END IF;
  UPDATE public.promo_jobs
  SET progress = GREATEST(progress, p_progress), heartbeat_at = now(),
      lease_expires_at = now() + make_interval(secs => p_lease_seconds), updated_at = now()
  WHERE id = p_job_id AND status = 'running' AND worker_id = p_worker_id
    AND lease_token = p_lease_token AND lease_expires_at >= now();
  GET DIAGNOSTICS touched = ROW_COUNT;
  IF touched = 1 THEN
    UPDATE public.promo_job_attempts SET heartbeat_at = now()
    WHERE job_id = p_job_id AND lease_token = p_lease_token AND status = 'running';
  END IF;
  RETURN touched = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_promo_job(
  p_job_id UUID, p_worker_id TEXT, p_lease_token UUID,
  p_output_asset_ids JSONB DEFAULT '[]'::jsonb, p_output_fingerprint TEXT DEFAULT NULL
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE touched INTEGER;
BEGIN
  IF jsonb_typeof(p_output_asset_ids) <> 'array' THEN RETURN false; END IF;
  IF p_output_fingerprint IS NOT NULL AND p_output_fingerprint !~ '^[a-f0-9]{64}$' THEN RETURN false; END IF;
  UPDATE public.promo_jobs
  SET status = 'succeeded', progress = 100, output_asset_ids = p_output_asset_ids,
      output_fingerprint = p_output_fingerprint, completed_at = now(),
      heartbeat_at = now(), lease_expires_at = NULL, updated_at = now()
  WHERE id = p_job_id AND status = 'running' AND worker_id = p_worker_id
    AND lease_token = p_lease_token AND lease_expires_at >= now();
  GET DIAGNOSTICS touched = ROW_COUNT;
  IF touched = 1 THEN
    UPDATE public.promo_job_attempts SET status = 'succeeded', heartbeat_at = now(), completed_at = now()
    WHERE job_id = p_job_id AND lease_token = p_lease_token AND status = 'running';
  END IF;
  RETURN touched = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_promo_job(
  p_job_id UUID, p_worker_id TEXT, p_lease_token UUID,
  p_error_code TEXT, p_error_message TEXT, p_retryable BOOLEAN DEFAULT false
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE touched INTEGER;
BEGIN
  UPDATE public.promo_jobs
  SET status = CASE WHEN p_retryable AND attempt_count < max_attempts THEN 'queued' ELSE 'failed' END,
      error_code = left(COALESCE(p_error_code, 'PROMO_JOB_FAILED'), 120),
      error_message = left(COALESCE(p_error_message, 'Promo job failed.'), 1000),
      completed_at = CASE WHEN p_retryable AND attempt_count < max_attempts THEN NULL ELSE now() END,
      queued_at = CASE WHEN p_retryable AND attempt_count < max_attempts THEN now() ELSE queued_at END,
      worker_id = NULL, lease_token = NULL, lease_expires_at = NULL, heartbeat_at = now(), updated_at = now()
  WHERE id = p_job_id AND status = 'running' AND worker_id = p_worker_id
    AND lease_token = p_lease_token AND lease_expires_at >= now();
  GET DIAGNOSTICS touched = ROW_COUNT;
  IF touched = 1 THEN
    UPDATE public.promo_job_attempts
    SET status = 'failed', heartbeat_at = now(), completed_at = now(),
        error_code = left(COALESCE(p_error_code, 'PROMO_JOB_FAILED'), 120),
        error_message = left(COALESCE(p_error_message, 'Promo job failed.'), 1000)
    WHERE job_id = p_job_id AND lease_token = p_lease_token AND status = 'running';
  END IF;
  RETURN touched = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_promo_job(TEXT, INTEGER, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.heartbeat_promo_job(UUID, TEXT, UUID, SMALLINT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_promo_job(UUID, TEXT, UUID, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_promo_job(UUID, TEXT, UUID, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_promo_job(TEXT, INTEGER, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.heartbeat_promo_job(UUID, TEXT, UUID, SMALLINT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_promo_job(UUID, TEXT, UUID, JSONB, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_promo_job(UUID, TEXT, UUID, TEXT, TEXT, BOOLEAN) TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'promo-assets', 'promo-assets', false, 1073741824,
  ARRAY['image/jpeg','image/png','image/webp','video/mp4','video/webm','audio/mpeg','audio/wav','audio/x-wav','audio/mp4','audio/ogg','application/json']
)
ON CONFLICT (id) DO UPDATE SET public = false;

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'promo_projects','promo_manifest_revisions','promo_claims','promo_assets','promo_scenes',
    'promo_voice_takes','promo_music_takes','promo_capture_scenarios','promo_capture_runs',
    'promo_jobs','promo_job_attempts','promo_approvals','promo_events'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', table_name);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', table_name);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Promo projects are readable by collaborators" ON public.promo_projects;
CREATE POLICY "Promo projects are readable by collaborators" ON public.promo_projects
  FOR SELECT TO authenticated USING ((SELECT private.can_access_promo_project(id)));

DROP POLICY IF EXISTS "Promo revisions follow project access" ON public.promo_manifest_revisions;
CREATE POLICY "Promo revisions follow project access" ON public.promo_manifest_revisions
  FOR SELECT TO authenticated USING ((SELECT private.can_access_promo_project(project_id)));
DROP POLICY IF EXISTS "Promo claims follow project access" ON public.promo_claims;
CREATE POLICY "Promo claims follow project access" ON public.promo_claims
  FOR SELECT TO authenticated USING ((SELECT private.can_access_promo_project(project_id)));
DROP POLICY IF EXISTS "Promo assets follow project access" ON public.promo_assets;
CREATE POLICY "Promo assets follow project access" ON public.promo_assets
  FOR SELECT TO authenticated USING ((SELECT private.can_access_promo_project(project_id)));
DROP POLICY IF EXISTS "Promo scenes follow project access" ON public.promo_scenes;
CREATE POLICY "Promo scenes follow project access" ON public.promo_scenes
  FOR SELECT TO authenticated USING ((SELECT private.can_access_promo_project(project_id)));
DROP POLICY IF EXISTS "Promo voice takes follow project access" ON public.promo_voice_takes;
CREATE POLICY "Promo voice takes follow project access" ON public.promo_voice_takes
  FOR SELECT TO authenticated USING ((SELECT private.can_access_promo_project(project_id)));
DROP POLICY IF EXISTS "Promo music takes follow project access" ON public.promo_music_takes;
CREATE POLICY "Promo music takes follow project access" ON public.promo_music_takes
  FOR SELECT TO authenticated USING ((SELECT private.can_access_promo_project(project_id)));
DROP POLICY IF EXISTS "Promo capture scenarios follow project access" ON public.promo_capture_scenarios;
CREATE POLICY "Promo capture scenarios follow project access" ON public.promo_capture_scenarios
  FOR SELECT TO authenticated USING ((SELECT private.can_access_promo_project(project_id)));
DROP POLICY IF EXISTS "Promo capture runs follow project access" ON public.promo_capture_runs;
CREATE POLICY "Promo capture runs follow project access" ON public.promo_capture_runs
  FOR SELECT TO authenticated USING ((SELECT private.can_access_promo_project(project_id)));
DROP POLICY IF EXISTS "Promo jobs follow project access" ON public.promo_jobs;
CREATE POLICY "Promo jobs follow project access" ON public.promo_jobs
  FOR SELECT TO authenticated USING ((SELECT private.can_access_promo_project(project_id)));
DROP POLICY IF EXISTS "Promo attempts follow project access" ON public.promo_job_attempts;
CREATE POLICY "Promo attempts follow project access" ON public.promo_job_attempts
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.promo_jobs j WHERE j.id = job_id AND (SELECT private.can_access_promo_project(j.project_id))
  ));
DROP POLICY IF EXISTS "Promo approvals follow project access" ON public.promo_approvals;
CREATE POLICY "Promo approvals follow project access" ON public.promo_approvals
  FOR SELECT TO authenticated USING ((SELECT private.can_access_promo_project(project_id)));
DROP POLICY IF EXISTS "Promo events follow project access" ON public.promo_events;
CREATE POLICY "Promo events follow project access" ON public.promo_events
  FOR SELECT TO authenticated USING ((SELECT private.can_access_promo_project(project_id)));

DROP POLICY IF EXISTS "Promo asset objects follow project access" ON storage.objects;
CREATE POLICY "Promo asset objects follow project access" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'promo-assets'
    AND EXISTS (
      SELECT 1 FROM public.promo_assets asset
      WHERE asset.storage_bucket = storage.objects.bucket_id
        AND asset.storage_path = storage.objects.name
        AND asset.status = 'ready'
        AND (SELECT private.can_access_promo_project(asset.project_id))
    )
  );

REVOKE ALL ON SEQUENCE public.promo_events_id_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.promo_events_id_seq TO service_role;
