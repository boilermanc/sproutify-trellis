-- Provider-agnostic foundation for asynchronous GPU-backed media generation.
-- All mutations go through the media-generation Edge Function. Authenticated
-- clients receive read-only access, constrained by project ownership/branch.

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE public.media_generation_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 160),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.media_model_catalog (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  family TEXT NOT NULL,
  provider_hint TEXT,
  task_types JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(task_types) = 'array'),
  capabilities JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(capabilities) = 'object'),
  runtime JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(runtime) = 'object'),
  default_parameters JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(default_parameters) = 'object'),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.media_characters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.media_generation_projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
  description TEXT,
  voice_notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.media_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.media_generation_projects(id) ON DELETE CASCADE,
  character_id UUID REFERENCES public.media_characters(id) ON DELETE SET NULL,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('reference_image','reference_video','reference_audio','source_image','source_video','source_audio','generated_video','generated_image','generated_audio','thumbnail','other')),
  role TEXT,
  storage_bucket TEXT NOT NULL DEFAULT 'media-generation-assets',
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  file_size_bytes BIGINT CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
  duration_seconds NUMERIC CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  width INTEGER CHECK (width IS NULL OR width > 0),
  height INTEGER CHECK (height IS NULL OR height > 0),
  sha256 TEXT,
  status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('uploading','ready','processing','failed','archived')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (storage_bucket, storage_path)
);

CREATE TABLE public.media_scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.media_generation_projects(id) ON DELETE CASCADE,
  scene_number INTEGER NOT NULL CHECK (scene_number > 0),
  title TEXT,
  prompt TEXT NOT NULL CHECK (char_length(prompt) BETWEEN 1 AND 12000),
  negative_prompt TEXT,
  duration_seconds NUMERIC CHECK (duration_seconds IS NULL OR duration_seconds > 0),
  aspect_ratio TEXT CHECK (aspect_ratio IS NULL OR aspect_ratio IN ('16:9','9:16','1:1','4:3','3:4')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready','generating','review','approved','failed','archived')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, scene_number)
);

CREATE TABLE public.media_generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.media_generation_projects(id) ON DELETE CASCADE,
  scene_id UUID REFERENCES public.media_scenes(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL REFERENCES public.media_model_catalog(id),
  provider TEXT NOT NULL DEFAULT 'runpod',
  task_type TEXT NOT NULL CHECK (task_type IN ('text_to_video','image_to_video','audio_driven_avatar','video_continuation')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('validating','queued','submitted','running','succeeded','failed','cancel_requested','cancelled')),
  progress SMALLINT NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  provider_job_id TEXT,
  prompt TEXT NOT NULL CHECK (char_length(prompt) BETWEEN 1 AND 12000),
  negative_prompt TEXT,
  parameters JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(parameters) = 'object'),
  priority SMALLINT NOT NULL DEFAULT 0 CHECK (priority BETWEEN -10 AND 10),
  max_attempts SMALLINT NOT NULL DEFAULT 2 CHECK (max_attempts BETWEEN 1 AND 5),
  attempt_count SMALLINT NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  retry_of UUID REFERENCES public.media_generation_jobs(id) ON DELETE SET NULL,
  idempotency_key TEXT,
  error_code TEXT,
  error_message TEXT,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_heartbeat_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (created_by, idempotency_key)
);

CREATE TABLE public.media_generation_job_inputs (
  job_id UUID NOT NULL REFERENCES public.media_generation_jobs(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES public.media_assets(id) ON DELETE RESTRICT,
  input_role TEXT NOT NULL CHECK (input_role IN ('reference_image','reference_video','driving_audio','source_image','source_video','first_frame','last_frame')),
  position SMALLINT NOT NULL DEFAULT 0 CHECK (position >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  PRIMARY KEY (job_id, input_role, position)
);

CREATE TABLE public.media_generation_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.media_generation_jobs(id) ON DELETE CASCADE,
  attempt_number SMALLINT NOT NULL CHECK (attempt_number > 0),
  provider TEXT NOT NULL,
  provider_job_id TEXT,
  status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created','submitted','running','succeeded','failed','cancelled')),
  request_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(request_snapshot) = 'object'),
  response_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(response_snapshot) = 'object'),
  gpu_type TEXT,
  gpu_count SMALLINT CHECK (gpu_count IS NULL OR gpu_count > 0),
  execution_seconds NUMERIC CHECK (execution_seconds IS NULL OR execution_seconds >= 0),
  billed_seconds NUMERIC CHECK (billed_seconds IS NULL OR billed_seconds >= 0),
  estimated_cost_usd NUMERIC(12,6) CHECK (estimated_cost_usd IS NULL OR estimated_cost_usd >= 0),
  actual_cost_usd NUMERIC(12,6) CHECK (actual_cost_usd IS NULL OR actual_cost_usd >= 0),
  error_code TEXT,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, attempt_number)
);

CREATE TABLE public.media_generation_outputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.media_generation_jobs(id) ON DELETE CASCADE,
  attempt_id UUID REFERENCES public.media_generation_attempts(id) ON DELETE SET NULL,
  asset_id UUID NOT NULL REFERENCES public.media_assets(id) ON DELETE RESTRICT,
  output_role TEXT NOT NULL DEFAULT 'primary' CHECK (output_role IN ('primary','preview','thumbnail','continuation_frame','metadata')),
  approved BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, asset_id, output_role)
);

CREATE TABLE public.media_generation_events (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.media_generation_jobs(id) ON DELETE CASCADE,
  attempt_id UUID REFERENCES public.media_generation_attempts(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  status TEXT,
  progress SMALLINT CHECK (progress IS NULL OR progress BETWEEN 0 AND 100),
  message TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.media_usage_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.media_generation_jobs(id) ON DELETE CASCADE,
  attempt_id UUID REFERENCES public.media_generation_attempts(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  metric TEXT NOT NULL CHECK (metric IN ('gpu_seconds','billed_seconds','storage_bytes','egress_bytes','estimated_cost_usd','actual_cost_usd')),
  quantity NUMERIC NOT NULL CHECK (quantity >= 0),
  unit TEXT NOT NULL,
  cost_usd NUMERIC(12,6) CHECK (cost_usd IS NULL OR cost_usd >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_media_projects_owner_updated ON public.media_generation_projects (created_by, updated_at DESC);
CREATE INDEX idx_media_projects_branch_updated ON public.media_generation_projects (branch_id, updated_at DESC) WHERE branch_id IS NOT NULL;
CREATE INDEX idx_media_assets_project_type ON public.media_assets (project_id, asset_type, created_at DESC);
CREATE INDEX idx_media_jobs_project_created ON public.media_generation_jobs (project_id, created_at DESC);
CREATE INDEX idx_media_jobs_active ON public.media_generation_jobs (status, priority DESC, queued_at) WHERE status IN ('queued','submitted','running','cancel_requested');
CREATE UNIQUE INDEX IF NOT EXISTS idx_media_jobs_one_active_per_user
  ON public.media_generation_jobs (created_by)
  WHERE status IN ('validating','submitted','running','cancel_requested');
CREATE INDEX idx_media_jobs_provider_id ON public.media_generation_jobs (provider, provider_job_id) WHERE provider_job_id IS NOT NULL;
CREATE INDEX idx_media_attempts_job ON public.media_generation_attempts (job_id, attempt_number DESC);
CREATE INDEX idx_media_events_job ON public.media_generation_events (job_id, created_at DESC);
CREATE INDEX idx_media_usage_job ON public.media_usage_ledger (job_id, recorded_at DESC);

CREATE OR REPLACE FUNCTION private.can_access_media_project(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.media_generation_projects p
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

REVOKE ALL ON FUNCTION private.can_access_media_project(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_access_media_project(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.touch_media_generation_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER touch_media_projects_updated_at BEFORE UPDATE ON public.media_generation_projects FOR EACH ROW EXECUTE FUNCTION public.touch_media_generation_updated_at();
CREATE TRIGGER touch_media_models_updated_at BEFORE UPDATE ON public.media_model_catalog FOR EACH ROW EXECUTE FUNCTION public.touch_media_generation_updated_at();
CREATE TRIGGER touch_media_characters_updated_at BEFORE UPDATE ON public.media_characters FOR EACH ROW EXECUTE FUNCTION public.touch_media_generation_updated_at();
CREATE TRIGGER touch_media_scenes_updated_at BEFORE UPDATE ON public.media_scenes FOR EACH ROW EXECUTE FUNCTION public.touch_media_generation_updated_at();
CREATE TRIGGER touch_media_jobs_updated_at BEFORE UPDATE ON public.media_generation_jobs FOR EACH ROW EXECUTE FUNCTION public.touch_media_generation_updated_at();

INSERT INTO public.media_model_catalog (id, display_name, family, provider_hint, task_types, capabilities, runtime, default_parameters)
VALUES
  (
    'longcat-video-base', 'LongCat Video', 'longcat-video', 'runpod',
    '["text_to_video","image_to_video","video_continuation"]'::jsonb,
    '{"text_to_video":true,"image_to_video":true,"continuation":true,"audio":false}'::jsonb,
    '{"weights_gb":83.3,"recommended_gpu_count":1,"recommended_vram_gb":80,"container":"trellis-longcat-video"}'::jsonb,
    '{"resolution":"480p","frames":93,"fps":15,"seed":-1}'::jsonb
  ),
  (
    'longcat-video-avatar-1.5', 'LongCat Avatar 1.5', 'longcat-video-avatar', 'runpod',
    '["audio_driven_avatar"]'::jsonb,
    '{"audio_driven_avatar":true,"image_to_video":false,"continuation":false,"audio":true,"multiple_reference_images":true}'::jsonb,
    '{"weights_gb":74.9,"base_weights_required_gb":83.3,"total_weight_disk_gb":158.2,"recommended_gpu_count":2,"recommended_vram_gb_per_gpu":48,"context_parallel":2,"use_int8":true,"use_distill":true,"required_steps":8,"container":"trellis-longcat-avatar"}'::jsonb,
    '{"resolution":"480p","steps":8,"seed":42}'::jsonb
  )
ON CONFLICT (id) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  task_types = EXCLUDED.task_types,
  capabilities = EXCLUDED.capabilities,
  runtime = EXCLUDED.runtime,
  default_parameters = EXCLUDED.default_parameters,
  updated_at = now();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'media-generation-assets',
  'media-generation-assets',
  false,
  10737418240,
  ARRAY['image/jpeg','image/png','image/webp','video/mp4','video/webm','audio/mpeg','audio/wav','audio/x-wav','audio/mp4','audio/ogg']
)
ON CONFLICT (id) DO UPDATE SET public = false;

ALTER TABLE public.media_generation_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_model_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_scenes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_generation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_generation_job_inputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_generation_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_generation_outputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_generation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_usage_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Media model catalog is readable" ON public.media_model_catalog FOR SELECT TO authenticated USING (active = true);
CREATE POLICY "Media projects are readable by collaborators" ON public.media_generation_projects FOR SELECT TO authenticated USING ((SELECT private.can_access_media_project(id)));
CREATE POLICY "Media characters follow project access" ON public.media_characters FOR SELECT TO authenticated USING ((SELECT private.can_access_media_project(project_id)));
CREATE POLICY "Media assets follow project access" ON public.media_assets FOR SELECT TO authenticated USING ((SELECT private.can_access_media_project(project_id)));
CREATE POLICY "Media scenes follow project access" ON public.media_scenes FOR SELECT TO authenticated USING ((SELECT private.can_access_media_project(project_id)));
CREATE POLICY "Media jobs follow project access" ON public.media_generation_jobs FOR SELECT TO authenticated USING ((SELECT private.can_access_media_project(project_id)));
CREATE POLICY "Media job inputs follow project access" ON public.media_generation_job_inputs FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.media_generation_jobs j WHERE j.id = job_id AND (SELECT private.can_access_media_project(j.project_id))));
CREATE POLICY "Media attempts follow project access" ON public.media_generation_attempts FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.media_generation_jobs j WHERE j.id = job_id AND (SELECT private.can_access_media_project(j.project_id))));
CREATE POLICY "Media outputs follow project access" ON public.media_generation_outputs FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.media_generation_jobs j WHERE j.id = job_id AND (SELECT private.can_access_media_project(j.project_id))));
CREATE POLICY "Media events follow project access" ON public.media_generation_events FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.media_generation_jobs j WHERE j.id = job_id AND (SELECT private.can_access_media_project(j.project_id))));
CREATE POLICY "Media usage follows project access" ON public.media_usage_ledger FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.media_generation_jobs j WHERE j.id = job_id AND (SELECT private.can_access_media_project(j.project_id))));
CREATE POLICY "Media asset objects follow project access" ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'media-generation-assets'
  AND EXISTS (
    SELECT 1 FROM public.media_assets a
    WHERE a.storage_bucket = storage.objects.bucket_id
      AND a.storage_path = storage.objects.name
      AND (SELECT private.can_access_media_project(a.project_id))
  )
);

DO $$
DECLARE table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'media_generation_projects','media_model_catalog','media_characters','media_assets','media_scenes',
    'media_generation_jobs','media_generation_job_inputs','media_generation_attempts','media_generation_outputs',
    'media_generation_events','media_usage_ledger'
  ] LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', table_name);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', table_name);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', table_name);
  END LOOP;
END $$;

REVOKE ALL ON SEQUENCE public.media_generation_events_id_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.media_generation_events_id_seq TO service_role;
