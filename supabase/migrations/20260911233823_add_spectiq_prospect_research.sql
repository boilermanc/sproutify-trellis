-- SpectIQ founder prospecting: durable geographic research and review queue.
-- Manus credentials and orchestration remain server-side in Edge Functions.
-- Isolated tables: "spectiq_prospect_research_runs",
-- "spectiq_prospect_research_candidates", and "spectiq_manus_webhook_events".

CREATE TABLE IF NOT EXISTS public.spectiq_prospect_research_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  territory_id UUID REFERENCES public.spectiq_prospecting_territories(id) ON DELETE SET NULL,
  location_kind TEXT NOT NULL CHECK (location_kind IN ('city', 'county', 'state', 'zip')),
  location_value TEXT NOT NULL CHECK (char_length(btrim(location_value)) BETWEEN 2 AND 160),
  normalized_location TEXT NOT NULL CHECK (char_length(btrim(normalized_location)) BETWEEN 2 AND 160),
  target_count INTEGER NOT NULL CHECK (target_count BETWEEN 1 AND 100),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'running', 'waiting', 'completed', 'partial', 'failed', 'cancelled'
  )),
  manus_task_id TEXT UNIQUE,
  manus_task_url TEXT CHECK (manus_task_url IS NULL OR manus_task_url ~ '^https://([^/]+\.)?manus\.(ai|im)/'),
  prompt TEXT NOT NULL CHECK (char_length(prompt) BETWEEN 1 AND 30000),
  prompt_version TEXT NOT NULL DEFAULT 'spectiq-geography-v1',
  schema_version TEXT NOT NULL DEFAULT 'spectiq-candidates-v1',
  raw_result JSONB CHECK (raw_result IS NULL OR jsonb_typeof(raw_result) = 'object'),
  error_message TEXT CHECK (error_message IS NULL OR char_length(error_message) <= 4000),
  attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count BETWEEN 1 AND 10),
  poll_count INTEGER NOT NULL DEFAULT 0 CHECK (poll_count BETWEEN 0 AND 1000),
  last_polled_at TIMESTAMPTZ,
  next_poll_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status NOT IN ('completed', 'partial') OR completed_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_spectiq_research_runs_founder_status
  ON public.spectiq_prospect_research_runs (created_by, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_spectiq_research_runs_poll
  ON public.spectiq_prospect_research_runs (next_poll_at, created_at)
  WHERE status IN ('queued', 'running', 'waiting');
CREATE INDEX IF NOT EXISTS idx_spectiq_research_runs_territory
  ON public.spectiq_prospect_research_runs (territory_id, created_at DESC)
  WHERE territory_id IS NOT NULL;
-- Prevent two simultaneous clicks from creating two billable Manus tasks for
-- the same still-active search. The Edge Function inserts before task.create.
CREATE UNIQUE INDEX IF NOT EXISTS idx_spectiq_research_runs_one_active_query
  ON public.spectiq_prospect_research_runs (created_by, location_kind, normalized_location, target_count)
  WHERE status IN ('queued', 'running', 'waiting');

CREATE TABLE IF NOT EXISTS public.spectiq_prospect_research_candidates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  research_run_id UUID NOT NULL REFERENCES public.spectiq_prospect_research_runs(id) ON DELETE CASCADE,
  identity_key TEXT NOT NULL CHECK (char_length(identity_key) BETWEEN 8 AND 500),
  company_name TEXT NOT NULL CHECK (char_length(btrim(company_name)) BETWEEN 1 AND 240),
  normalized_company_name TEXT NOT NULL CHECK (char_length(btrim(normalized_company_name)) BETWEEN 1 AND 240),
  website_state TEXT NOT NULL DEFAULT 'needs_human_verification' CHECK (website_state IN (
    'official_website_confirmed', 'official_website_not_identified', 'website_unreachable_at_scan_time',
    'social_or_directory_only_observed', 'needs_human_verification'
  )),
  official_domain TEXT,
  website_url TEXT,
  phone TEXT,
  address_line_1 TEXT,
  city TEXT,
  state_code TEXT CHECK (state_code IS NULL OR state_code ~ '^[A-Z]{2}$'),
  postal_code TEXT CHECK (postal_code IS NULL OR postal_code ~ '^\d{5}(-\d{4})?$'),
  summary TEXT CHECK (summary IS NULL OR char_length(summary) <= 4000),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(sources) = 'array'),
  raw_candidate JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(raw_candidate) = 'object'),
  review_status TEXT NOT NULL DEFAULT 'pending' CHECK (review_status IN (
    'pending', 'approved', 'corrected', 'rejected', 'imported', 'merged'
  )),
  founder_corrections JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(founder_corrections) = 'object'),
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  reviewed_at TIMESTAMPTZ,
  imported_prospect_id UUID REFERENCES public.spectiq_prospects(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (research_run_id, identity_key),
  CHECK (
    (review_status = 'pending' AND reviewed_by IS NULL AND reviewed_at IS NULL)
    OR (review_status <> 'pending' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)
  ),
  CHECK (review_status NOT IN ('imported', 'merged') OR imported_prospect_id IS NOT NULL)
);

COMMENT ON TABLE public.spectiq_prospect_research_runs IS 'Durable founder-triggered SpectIQ research runs';
COMMENT ON TABLE public.spectiq_prospect_research_candidates IS 'Founder review queue for untrusted research candidates';

CREATE INDEX IF NOT EXISTS idx_spectiq_research_candidates_review
  ON public.spectiq_prospect_research_candidates (review_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_spectiq_research_candidates_run
  ON public.spectiq_prospect_research_candidates (research_run_id, review_status, company_name);
CREATE INDEX IF NOT EXISTS idx_spectiq_research_candidates_domain
  ON public.spectiq_prospect_research_candidates (official_domain)
  WHERE official_domain IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_spectiq_research_candidates_prospect
  ON public.spectiq_prospect_research_candidates (imported_prospect_id)
  WHERE imported_prospect_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_spectiq_research_candidates_reviewed_by
  ON public.spectiq_prospect_research_candidates (reviewed_by)
  WHERE reviewed_by IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.spectiq_manus_webhook_events (
  event_id TEXT PRIMARY KEY CHECK (char_length(event_id) BETWEEN 1 AND 500),
  event_type TEXT NOT NULL CHECK (event_type IN ('task_created', 'task_stopped')),
  manus_task_id TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL CHECK (payload_sha256 ~ '^[0-9a-f]{64}$'),
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'processed', 'ignored', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 1 CHECK (attempt_count BETWEEN 1 AND 100),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  error_message TEXT CHECK (error_message IS NULL OR char_length(error_message) <= 4000),
  payload JSONB NOT NULL CHECK (jsonb_typeof(payload) = 'object')
);
COMMENT ON TABLE public.spectiq_manus_webhook_events IS 'Idempotent signed Manus webhook receipt log';

CREATE INDEX IF NOT EXISTS idx_spectiq_webhook_task
  ON public.spectiq_manus_webhook_events (manus_task_id, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_spectiq_webhook_status
  ON public.spectiq_manus_webhook_events (status, received_at)
  WHERE status IN ('processing', 'failed');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'spectiq_claims_research_run_fk'
      AND conrelid = 'public.spectiq_prospect_claims'::regclass
  ) THEN
    ALTER TABLE public.spectiq_prospect_claims
      ADD CONSTRAINT spectiq_claims_research_run_fk
      FOREIGN KEY (research_run_id)
      REFERENCES public.spectiq_prospect_research_runs(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_spectiq_claims_research_run
  ON public.spectiq_prospect_claims (research_run_id)
  WHERE research_run_id IS NOT NULL;

ALTER TABLE public.spectiq_prospect_research_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spectiq_prospect_research_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spectiq_manus_webhook_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.spectiq_prospect_research_runs,
  public.spectiq_prospect_research_candidates,
  public.spectiq_manus_webhook_events
FROM PUBLIC, anon, authenticated;

-- private.is_spectiq_prospecting_founder verifies an active trellis_users owner
-- whose platform_role is platform_super_admin; normal login is sufficient.
DROP POLICY IF EXISTS "SpectIQ founder access" ON public.spectiq_prospect_research_runs;
CREATE POLICY "SpectIQ founder access" ON public.spectiq_prospect_research_runs
  FOR SELECT TO authenticated
  USING ((SELECT private.is_spectiq_prospecting_founder()));
DROP POLICY IF EXISTS "SpectIQ founder access" ON public.spectiq_prospect_research_candidates;
CREATE POLICY "SpectIQ founder access" ON public.spectiq_prospect_research_candidates
  FOR SELECT TO authenticated
  USING ((SELECT private.is_spectiq_prospecting_founder()));
DROP POLICY IF EXISTS "SpectIQ founder review" ON public.spectiq_prospect_research_candidates;
CREATE POLICY "SpectIQ founder review" ON public.spectiq_prospect_research_candidates
  FOR UPDATE TO authenticated
  USING ((SELECT private.is_spectiq_prospecting_founder()))
  WITH CHECK ((SELECT private.is_spectiq_prospecting_founder()));
DROP POLICY IF EXISTS "SpectIQ founder access" ON public.spectiq_manus_webhook_events;
CREATE POLICY "SpectIQ founder access" ON public.spectiq_manus_webhook_events
  FOR SELECT TO authenticated
  USING ((SELECT private.is_spectiq_prospecting_founder()));

DROP POLICY IF EXISTS "SpectIQ service role access" ON public.spectiq_prospect_research_runs;
CREATE POLICY "SpectIQ service role access" ON public.spectiq_prospect_research_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "SpectIQ service role access" ON public.spectiq_prospect_research_candidates;
CREATE POLICY "SpectIQ service role access" ON public.spectiq_prospect_research_candidates
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "SpectIQ service role access" ON public.spectiq_manus_webhook_events;
CREATE POLICY "SpectIQ service role access" ON public.spectiq_manus_webhook_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT ON TABLE
  public.spectiq_prospect_research_runs,
  public.spectiq_prospect_research_candidates
TO authenticated;
-- Candidate rows can only be mutated by the sole founder role and the database
-- constraints below keep imported/merged states tied to a real prospect. RPCs
-- remain SECURITY INVOKER so they do not bypass RLS.
GRANT UPDATE (
  review_status, founder_corrections, reviewed_by, reviewed_at,
  imported_prospect_id, updated_at
) ON TABLE public.spectiq_prospect_research_candidates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.spectiq_prospect_research_runs,
  public.spectiq_prospect_research_candidates,
  public.spectiq_manus_webhook_events
TO service_role;

CREATE OR REPLACE FUNCTION public.review_spectiq_research_candidate(
  p_candidate_id UUID,
  p_decision TEXT,
  p_corrections JSONB DEFAULT '{}'::jsonb
)
RETURNS public.spectiq_prospect_research_candidates
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  reviewed public.spectiq_prospect_research_candidates;
BEGIN
  IF NOT (SELECT private.is_spectiq_prospecting_founder()) THEN
    RAISE EXCEPTION 'Active platform super administrator access is required' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('approved', 'corrected', 'rejected') THEN
    RAISE EXCEPTION 'Invalid candidate decision' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(COALESCE(p_corrections, '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'Candidate corrections must be an object' USING ERRCODE = '22023';
  END IF;
  IF p_decision = 'corrected' AND COALESCE(p_corrections, '{}'::jsonb) = '{}'::jsonb THEN
    RAISE EXCEPTION 'Corrections are required for corrected candidates' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(COALESCE(p_corrections, '{}'::jsonb)) AS key
    WHERE key NOT IN ('company_name', 'website_url', 'phone', 'address_line_1', 'city', 'state_code', 'postal_code', 'summary')
  ) THEN
    RAISE EXCEPTION 'Candidate corrections contain an unsupported field' USING ERRCODE = '22023';
  END IF;

  UPDATE public.spectiq_prospect_research_candidates
  SET review_status = p_decision,
      founder_corrections = CASE WHEN p_decision = 'corrected' THEN p_corrections ELSE '{}'::jsonb END,
      reviewed_by = (SELECT auth.uid()),
      reviewed_at = now(),
      updated_at = now()
  WHERE id = p_candidate_id
    AND review_status NOT IN ('imported', 'merged')
  RETURNING * INTO reviewed;
  IF reviewed.id IS NULL THEN
    RAISE EXCEPTION 'Reviewable candidate not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN reviewed;
END;
$$;

REVOKE ALL ON FUNCTION public.review_spectiq_research_candidate(UUID, TEXT, JSONB) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.review_spectiq_research_candidate(UUID, TEXT, JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.import_spectiq_research_candidate(
  p_candidate_id UUID,
  p_territory_id UUID,
  p_mode TEXT DEFAULT 'create',
  p_prospect_id UUID DEFAULT NULL
)
RETURNS TABLE (candidate public.spectiq_prospect_research_candidates, prospect public.spectiq_prospects)
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  source_candidate public.spectiq_prospect_research_candidates;
  imported public.spectiq_prospects;
  corrected JSONB;
BEGIN
  IF NOT (SELECT private.is_spectiq_prospecting_founder()) THEN
    RAISE EXCEPTION 'Active platform super administrator access is required' USING ERRCODE = '42501';
  END IF;
  IF p_mode NOT IN ('create', 'merge') THEN
    RAISE EXCEPTION 'Import mode must be create or merge' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO source_candidate
  FROM public.spectiq_prospect_research_candidates
  WHERE id = p_candidate_id
    AND review_status IN ('approved', 'corrected')
  FOR UPDATE;
  IF source_candidate.id IS NULL THEN
    RAISE EXCEPTION 'Candidate must be approved or corrected before import' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.spectiq_prospecting_territories
    WHERE id = p_territory_id AND archived_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Active territory not found' USING ERRCODE = 'P0002';
  END IF;
  corrected := source_candidate.founder_corrections;

  IF p_mode = 'create' THEN
    IF p_prospect_id IS NOT NULL THEN
      RAISE EXCEPTION 'prospectId is not allowed for create imports' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.spectiq_prospects p
      WHERE p.archived_at IS NULL
        AND (
          (source_candidate.official_domain IS NOT NULL AND p.official_domain = source_candidate.official_domain)
          OR (
            p.normalized_company_name = source_candidate.normalized_company_name
            AND COALESCE(p.state_code, '') = COALESCE(source_candidate.state_code, '')
            AND (COALESCE(p.postal_code, '') = COALESCE(source_candidate.postal_code, '') OR COALESCE(p.city, '') = COALESCE(source_candidate.city, ''))
          )
        )
    ) THEN
      RAISE EXCEPTION 'A possible duplicate prospect already exists; use merge mode' USING ERRCODE = '23505';
    END IF;
    INSERT INTO public.spectiq_prospects (
      territory_id, company_name, normalized_company_name, official_domain, website_url,
      website_state, phone, address_line_1, city, state_code, postal_code, summary, source, metadata,
      created_by, updated_by
    ) VALUES (
      p_territory_id,
      COALESCE(NULLIF(btrim(corrected->>'company_name'), ''), source_candidate.company_name),
      lower(regexp_replace(COALESCE(NULLIF(btrim(corrected->>'company_name'), ''), source_candidate.company_name), '[^a-z0-9]+', '', 'g')),
      source_candidate.official_domain,
      COALESCE(NULLIF(btrim(corrected->>'website_url'), ''), source_candidate.website_url),
      source_candidate.website_state,
      COALESCE(NULLIF(btrim(corrected->>'phone'), ''), source_candidate.phone),
      COALESCE(NULLIF(btrim(corrected->>'address_line_1'), ''), source_candidate.address_line_1),
      COALESCE(NULLIF(btrim(corrected->>'city'), ''), source_candidate.city),
      upper(COALESCE(NULLIF(btrim(corrected->>'state_code'), ''), source_candidate.state_code)),
      COALESCE(NULLIF(btrim(corrected->>'postal_code'), ''), source_candidate.postal_code),
      COALESCE(NULLIF(btrim(corrected->>'summary'), ''), source_candidate.summary),
      'research_candidate',
      jsonb_build_object('research_run_id', source_candidate.research_run_id, 'candidate_id', source_candidate.id),
      (SELECT auth.uid()), (SELECT auth.uid())
    ) RETURNING * INTO imported;
  ELSE
    IF p_prospect_id IS NULL THEN
      RAISE EXCEPTION 'prospectId is required for merge imports' USING ERRCODE = '22023';
    END IF;
    UPDATE public.spectiq_prospects
    SET territory_id = p_territory_id,
        website_url = COALESCE(NULLIF(btrim(corrected->>'website_url'), ''), website_url, source_candidate.website_url),
        official_domain = COALESCE(official_domain, source_candidate.official_domain),
        phone = COALESCE(NULLIF(btrim(corrected->>'phone'), ''), phone, source_candidate.phone),
        address_line_1 = COALESCE(NULLIF(btrim(corrected->>'address_line_1'), ''), address_line_1, source_candidate.address_line_1),
        city = COALESCE(NULLIF(btrim(corrected->>'city'), ''), city, source_candidate.city),
        state_code = COALESCE(upper(NULLIF(btrim(corrected->>'state_code'), '')), state_code, source_candidate.state_code),
        postal_code = COALESCE(NULLIF(btrim(corrected->>'postal_code'), ''), postal_code, source_candidate.postal_code),
        summary = COALESCE(NULLIF(btrim(corrected->>'summary'), ''), summary, source_candidate.summary),
        metadata = metadata || jsonb_build_object('last_research_run_id', source_candidate.research_run_id, 'last_candidate_id', source_candidate.id),
        updated_by = (SELECT auth.uid()), updated_at = now()
    WHERE id = p_prospect_id AND archived_at IS NULL
    RETURNING * INTO imported;
    IF imported.id IS NULL THEN
      RAISE EXCEPTION 'Active prospect not found for merge' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  -- Preserve the public-source evidence collected by Manus. Claims remain
  -- pending and therefore cannot satisfy the outreach approval gates until the
  -- founder explicitly reviews them in the normal Phase 1 workflow.
  INSERT INTO public.spectiq_prospect_claims (
    prospect_id, research_run_id, claim_type, normalized_value, display_value,
    source_url, source_type, source_excerpt, retrieved_at, confidence,
    prompt_version, rubric_version, verification_decision, created_by
  )
  SELECT imported.id,
         source_candidate.research_run_id,
         claim.item->>'claim_type',
         COALESCE(NULLIF(claim.item->>'normalized_value', ''), lower(regexp_replace(claim.item->>'display_value', '\s+', ' ', 'g'))),
         claim.item->>'display_value',
         claim.item->>'source_url',
         claim.item->>'source_type',
         NULLIF(claim.item->>'source_excerpt', ''),
         now(),
         (claim.item->>'confidence')::NUMERIC,
         'spectiq-geography-v1',
         'spectiq-candidates-v1',
         'pending',
         (SELECT auth.uid())
  FROM jsonb_array_elements(COALESCE(source_candidate.raw_candidate->'claims', '[]'::jsonb)) AS claim(item)
  WHERE claim.item->>'source_url' IS NOT NULL
    AND claim.item->>'display_value' IS NOT NULL
  ON CONFLICT (prospect_id, claim_type, normalized_value, source_url) DO NOTHING;

  UPDATE public.spectiq_prospect_research_candidates
  SET review_status = CASE WHEN p_mode = 'create' THEN 'imported' ELSE 'merged' END,
      imported_prospect_id = imported.id,
      updated_at = now()
  WHERE id = source_candidate.id
  RETURNING * INTO source_candidate;

  RETURN QUERY SELECT source_candidate, imported;
END;
$$;

REVOKE ALL ON FUNCTION public.import_spectiq_research_candidate(UUID, UUID, TEXT, UUID) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.import_spectiq_research_candidate(UUID, UUID, TEXT, UUID) TO authenticated;
