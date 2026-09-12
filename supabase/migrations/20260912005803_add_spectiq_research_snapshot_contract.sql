-- Evidence-backed territory intelligence and durable advisory prospect snapshots.

CREATE TABLE IF NOT EXISTS public.spectiq_territory_market_factors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  research_run_id UUID NOT NULL REFERENCES public.spectiq_prospect_research_runs(id) ON DELETE CASCADE,
  territory_id UUID REFERENCES public.spectiq_prospecting_territories(id) ON DELETE SET NULL,
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 240),
  summary TEXT NOT NULL CHECK (char_length(btrim(summary)) BETWEEN 1 AND 2000),
  category TEXT NOT NULL CHECK (category IN (
    'competition', 'digital_maturity', 'market_demand', 'workflow', 'regulatory', 'other'
  )),
  source_url TEXT NOT NULL CHECK (source_url ~* '^https?://[^/@[:space:]]+([/:?#]|$)'),
  source_type TEXT NOT NULL CHECK (source_type IN (
    'official_website', 'government_registry', 'professional_directory',
    'search_result', 'document', 'other'
  )),
  source_excerpt TEXT CHECK (source_excerpt IS NULL OR char_length(source_excerpt) <= 4000),
  confidence NUMERIC(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  verification_decision TEXT NOT NULL DEFAULT 'pending' CHECK (verification_decision IN (
    'pending', 'approved', 'corrected', 'rejected'
  )),
  founder_correction TEXT CHECK (founder_correction IS NULL OR char_length(founder_correction) <= 4000),
  verified_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (research_run_id, title, source_url),
  CHECK (
    (verification_decision = 'pending' AND verified_by IS NULL AND verified_at IS NULL)
    OR (verification_decision <> 'pending' AND verified_by IS NOT NULL AND verified_at IS NOT NULL)
  ),
  CHECK (verification_decision <> 'corrected' OR founder_correction IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_spectiq_market_factors_territory
  ON public.spectiq_territory_market_factors (territory_id, verification_decision, created_at DESC)
  WHERE territory_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_spectiq_market_factors_run
  ON public.spectiq_territory_market_factors (research_run_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_spectiq_market_factors_review
  ON public.spectiq_territory_market_factors (verification_decision, created_at DESC)
  WHERE verification_decision = 'pending';
CREATE INDEX IF NOT EXISTS idx_spectiq_market_factors_verified_by
  ON public.spectiq_territory_market_factors (verified_by)
  WHERE verified_by IS NOT NULL;

ALTER TABLE public.spectiq_territory_market_factors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.spectiq_territory_market_factors FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS "SpectIQ founder access" ON public.spectiq_territory_market_factors;
CREATE POLICY "SpectIQ founder access" ON public.spectiq_territory_market_factors
  FOR SELECT TO authenticated
  USING ((SELECT private.is_spectiq_prospecting_founder()));
DROP POLICY IF EXISTS "SpectIQ founder review" ON public.spectiq_territory_market_factors;
CREATE POLICY "SpectIQ founder review" ON public.spectiq_territory_market_factors
  FOR UPDATE TO authenticated
  USING ((SELECT private.is_spectiq_prospecting_founder()))
  WITH CHECK ((SELECT private.is_spectiq_prospecting_founder()));
DROP POLICY IF EXISTS "SpectIQ service role access" ON public.spectiq_territory_market_factors;
CREATE POLICY "SpectIQ service role access" ON public.spectiq_territory_market_factors
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, UPDATE (
  verification_decision, founder_correction, verified_by, verified_at, territory_id, updated_at
) ON public.spectiq_territory_market_factors TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.spectiq_territory_market_factors TO service_role;

CREATE OR REPLACE FUNCTION public.review_spectiq_territory_market_factor(
  p_factor_id UUID,
  p_decision TEXT,
  p_correction TEXT DEFAULT NULL
)
RETURNS public.spectiq_territory_market_factors
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE reviewed public.spectiq_territory_market_factors;
BEGIN
  IF NOT (SELECT private.is_spectiq_prospecting_founder()) THEN
    RAISE EXCEPTION 'Active platform super administrator access is required' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('approved', 'corrected', 'rejected') THEN
    RAISE EXCEPTION 'Invalid market factor decision' USING ERRCODE = '22023';
  END IF;
  IF p_decision = 'corrected' AND NULLIF(btrim(p_correction), '') IS NULL THEN
    RAISE EXCEPTION 'A correction is required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.spectiq_territory_market_factors
  SET verification_decision = p_decision,
      founder_correction = CASE WHEN p_decision = 'corrected' THEN btrim(p_correction) ELSE NULL END,
      verified_by = (SELECT auth.uid()),
      verified_at = now(),
      updated_at = now()
  WHERE id = p_factor_id
  RETURNING * INTO reviewed;
  IF reviewed.id IS NULL THEN
    RAISE EXCEPTION 'Market factor not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN reviewed;
END;
$$;

REVOKE ALL ON FUNCTION public.review_spectiq_territory_market_factor(UUID, TEXT, TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.review_spectiq_territory_market_factor(UUID, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION private.sync_spectiq_research_snapshot()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  raw JSONB := COALESCE(NEW.raw_candidate, '{}'::jsonb);
  score INTEGER;
  snapshot JSONB;
BEGIN
  IF NEW.review_status NOT IN ('imported', 'merged') OR NEW.imported_prospect_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF COALESCE(raw->>'fit_score', '') ~ '^\d{1,3}$' THEN
    score := (raw->>'fit_score')::INTEGER;
    IF score < 0 OR score > 100 THEN score := NULL; END IF;
  END IF;

  snapshot := jsonb_build_object(
    'fit_score', score,
    'fit_category', CASE WHEN raw->>'fit_category' IN ('strong', 'possible', 'weak', 'insufficient_evidence') THEN raw->>'fit_category' ELSE 'insufficient_evidence' END,
    'website_presence_class', COALESCE(raw->>'website_presence_class', NEW.website_state),
    'phone_only_quote', CASE WHEN jsonb_typeof(raw->'phone_only_quote') = 'boolean' THEN raw->'phone_only_quote' ELSE 'null'::jsonb END,
    'manual_quote_process', CASE WHEN jsonb_typeof(raw->'manual_quote_process') = 'boolean' THEN raw->'manual_quote_process' ELSE 'null'::jsonb END,
    'current_stack', CASE WHEN jsonb_typeof(raw->'current_stack') = 'array' THEN raw->'current_stack' ELSE '[]'::jsonb END,
    'friction_point', raw->'friction_point',
    'opportunity_hypothesis', raw->'opportunity_hypothesis',
    'draft_pitch', raw->'draft_pitch',
    'fit_score_rubric_version', 'spectiq-fit-v1',
    'research_run_id', NEW.research_run_id,
    'candidate_id', NEW.id,
    'candidate_review_status', NEW.review_status,
    'assessment_requires_founder_review', true,
    'outreach_approved', false,
    'captured_at', now()
  );

  UPDATE public.spectiq_prospects
  SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{research_snapshot}', snapshot, true),
      updated_at = now()
  WHERE id = NEW.imported_prospect_id;

  UPDATE public.spectiq_territory_market_factors
  SET territory_id = COALESCE(territory_id, (SELECT territory_id FROM public.spectiq_prospects WHERE id = NEW.imported_prospect_id)),
      updated_at = now()
  WHERE research_run_id = NEW.research_run_id
    AND territory_id IS NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS spectiq_sync_research_snapshot ON public.spectiq_prospect_research_candidates;
CREATE TRIGGER spectiq_sync_research_snapshot
  AFTER UPDATE OF review_status, imported_prospect_id
  ON public.spectiq_prospect_research_candidates
  FOR EACH ROW
  WHEN (NEW.review_status IN ('imported', 'merged') AND NEW.imported_prospect_id IS NOT NULL)
  EXECUTE FUNCTION private.sync_spectiq_research_snapshot();
