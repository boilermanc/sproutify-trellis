-- SpectIQ founder prospecting: Phase 1 data foundation.
-- Prospecting data is deliberately isolated from Trellis profiles and Farm leads.

CREATE SCHEMA IF NOT EXISTS private;

ALTER TABLE public.trellis_users
  ADD COLUMN IF NOT EXISTS platform_role TEXT NOT NULL DEFAULT 'standard';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'trellis_users_platform_role_check'
      AND conrelid = 'public.trellis_users'::regclass
  ) THEN
    ALTER TABLE public.trellis_users
      ADD CONSTRAINT trellis_users_platform_role_check
      CHECK (platform_role IN ('standard', 'platform_super_admin'));
  END IF;
END $$;

UPDATE public.trellis_users
SET platform_role = 'platform_super_admin', updated_at = now()
WHERE lower(email) = 'clint@sproutify.app'
  AND platform_role IS DISTINCT FROM 'platform_super_admin';

CREATE OR REPLACE FUNCTION private.is_spectiq_prospecting_founder()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT EXISTS (
      SELECT 1
      FROM public.trellis_users u
      WHERE u.auth_user_id = (SELECT auth.uid())
        AND u.status = 'active'
        AND u.role = 'owner'
        AND u.platform_role = 'platform_super_admin'
    );
$$;

REVOKE ALL ON FUNCTION private.is_spectiq_prospecting_founder() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION private.is_spectiq_prospecting_founder() TO authenticated;

CREATE OR REPLACE FUNCTION public.spectiq_prospecting_access_status()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH access_check AS (
    SELECT
      EXISTS (
        SELECT 1
        FROM public.trellis_users u
        WHERE u.auth_user_id = (SELECT auth.uid())
          AND u.status = 'active'
          AND u.role = 'owner'
          AND u.platform_role = 'platform_super_admin'
      ) AS role_ok
  )
  SELECT jsonb_build_object(
    'role_ok', role_ok,
    'authorized', role_ok
  )
  FROM access_check;
$$;

REVOKE ALL ON FUNCTION public.spectiq_prospecting_access_status() FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.spectiq_prospecting_access_status() TO authenticated;

CREATE TABLE IF NOT EXISTS public.spectiq_prospecting_territories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
  kind TEXT NOT NULL CHECK (kind IN ('city', 'county', 'state', 'multi_market')),
  city TEXT,
  county TEXT,
  state_code TEXT CHECK (state_code IS NULL OR state_code ~ '^[A-Z]{2}$'),
  country_code TEXT NOT NULL DEFAULT 'US' CHECK (country_code ~ '^[A-Z]{2}$'),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived')),
  target_count INTEGER NOT NULL DEFAULT 25 CHECK (target_count BETWEEN 1 AND 500),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ,
  CHECK ((status = 'archived') = (archived_at IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_spectiq_territories_identity
  ON public.spectiq_prospecting_territories (
    lower(name), kind, COALESCE(city, ''), COALESCE(county, ''), COALESCE(state_code, ''), country_code
  );
CREATE INDEX IF NOT EXISTS idx_spectiq_territories_status
  ON public.spectiq_prospecting_territories (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.spectiq_prospects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  territory_id UUID NOT NULL REFERENCES public.spectiq_prospecting_territories(id) ON DELETE RESTRICT,
  company_name TEXT NOT NULL CHECK (char_length(btrim(company_name)) BETWEEN 1 AND 240),
  normalized_company_name TEXT NOT NULL,
  official_domain TEXT,
  website_url TEXT CHECK (
    website_url IS NULL OR website_url ~* '^https?://[^/@[:space:]]+([/:?#]|$)'
  ),
  website_state TEXT NOT NULL DEFAULT 'needs_human_verification' CHECK (website_state IN (
    'official_website_confirmed',
    'official_website_not_identified',
    'website_unreachable_at_scan_time',
    'social_or_directory_only_observed',
    'needs_human_verification'
  )),
  sales_state TEXT NOT NULL DEFAULT 'new' CHECK (sales_state IN (
    'new', 'audited', 'review_pending', 'pitch_ready', 'contacted', 'engaged',
    'demo_booked', 'won', 'nurture', 'not_a_fit'
  )),
  verification_state TEXT NOT NULL DEFAULT 'unreviewed' CHECK (verification_state IN (
    'unreviewed', 'evidence_reviewed', 'identity_verified', 'contact_verified', 'outreach_approved'
  )),
  identity_verified_at TIMESTAMPTZ,
  evidence_reviewed_at TIMESTAMPTZ,
  outreach_approved_at TIMESTAMPTZ,
  pitch_ready_approved_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  pitch_ready_approved_at TIMESTAMPTZ,
  opportunity_category TEXT,
  summary TEXT CHECK (summary IS NULL OR char_length(summary) <= 5000),
  address_line_1 TEXT,
  city TEXT,
  state_code TEXT CHECK (state_code IS NULL OR state_code ~ '^[A-Z]{2}$'),
  postal_code TEXT,
  phone TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'csv_import', 'research_candidate')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived_at TIMESTAMPTZ,
  next_follow_up_at TIMESTAMPTZ,
  last_contacted_at TIMESTAMPTZ,
  CHECK (official_domain IS NULL OR official_domain ~ '^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$'),
  CHECK (
    (verification_state NOT IN ('identity_verified', 'contact_verified', 'outreach_approved'))
    OR identity_verified_at IS NOT NULL
  ),
  CHECK (
    (verification_state NOT IN ('evidence_reviewed', 'identity_verified', 'contact_verified', 'outreach_approved'))
    OR evidence_reviewed_at IS NOT NULL
  ),
  CHECK (verification_state <> 'outreach_approved' OR outreach_approved_at IS NOT NULL),
  CHECK (
    (pitch_ready_approved_by IS NULL AND pitch_ready_approved_at IS NULL)
    OR (pitch_ready_approved_by IS NOT NULL AND pitch_ready_approved_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_spectiq_prospects_official_domain
  ON public.spectiq_prospects (official_domain)
  WHERE official_domain IS NOT NULL AND archived_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_spectiq_prospects_name_geography
  ON public.spectiq_prospects (
    normalized_company_name, COALESCE(city, ''), COALESCE(state_code, '')
  ) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_spectiq_prospects_pipeline
  ON public.spectiq_prospects (territory_id, sales_state, updated_at DESC)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_spectiq_prospects_verification
  ON public.spectiq_prospects (verification_state, updated_at DESC)
  WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_spectiq_prospects_follow_up
  ON public.spectiq_prospects (next_follow_up_at)
  WHERE next_follow_up_at IS NOT NULL AND archived_at IS NULL;

CREATE TABLE IF NOT EXISTS public.spectiq_prospect_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prospect_id UUID NOT NULL REFERENCES public.spectiq_prospects(id) ON DELETE CASCADE,
  full_name TEXT CHECK (full_name IS NULL OR char_length(btrim(full_name)) BETWEEN 1 AND 200),
  title TEXT,
  email TEXT CHECK (email IS NULL OR email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  email_normalized TEXT,
  phone TEXT,
  phone_normalized TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  email_status TEXT NOT NULL DEFAULT 'unverified' CHECK (email_status IN (
    'unknown', 'unverified', 'verified', 'invalid', 'bounced', 'complained', 'unsubscribed'
  )),
  email_verified_at TIMESTAMPTZ,
  suppressed_at TIMESTAMPTZ,
  suppression_reason TEXT CHECK (suppression_reason IS NULL OR suppression_reason IN (
    'unsubscribe', 'bounce', 'complaint', 'manual', 'invalid'
  )),
  source_url TEXT CHECK (
    source_url IS NULL OR source_url ~* '^https?://[^/@[:space:]]+([/:?#]|$)'
  ),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (email IS NOT NULL OR phone IS NOT NULL),
  CHECK (email_status <> 'verified' OR (email IS NOT NULL AND email_verified_at IS NOT NULL)),
  CHECK ((suppressed_at IS NULL) = (suppression_reason IS NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_spectiq_contacts_verified_email
  ON public.spectiq_prospect_contacts (email_normalized)
  WHERE email_status = 'verified' AND email_normalized IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_spectiq_contacts_verified_phone
  ON public.spectiq_prospect_contacts (phone_normalized)
  WHERE phone_normalized IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_spectiq_contacts_one_primary
  ON public.spectiq_prospect_contacts (prospect_id)
  WHERE is_primary = true;
CREATE INDEX IF NOT EXISTS idx_spectiq_contacts_prospect
  ON public.spectiq_prospect_contacts (prospect_id, is_primary DESC, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.spectiq_prospect_claims (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prospect_id UUID NOT NULL REFERENCES public.spectiq_prospects(id) ON DELETE CASCADE,
  claim_type TEXT NOT NULL CHECK (claim_type IN (
    'company_identity', 'official_website', 'contact_identity', 'contact_email',
    'services', 'service_area', 'opportunity', 'outreach_angle', 'other'
  )),
  normalized_value TEXT NOT NULL CHECK (char_length(btrim(normalized_value)) BETWEEN 1 AND 4000),
  display_value TEXT NOT NULL CHECK (char_length(btrim(display_value)) BETWEEN 1 AND 4000),
  source_url TEXT NOT NULL CHECK (source_url ~* '^https?://[^/@[:space:]]+([/:?#]|$)'),
  source_type TEXT NOT NULL CHECK (source_type IN (
    'official_website', 'government_registry', 'professional_directory', 'social_profile',
    'search_result', 'founder_observation', 'document', 'other'
  )),
  source_excerpt TEXT CHECK (source_excerpt IS NULL OR char_length(source_excerpt) <= 4000),
  artifact_ref TEXT,
  retrieved_at TIMESTAMPTZ NOT NULL,
  confidence NUMERIC(4,3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  research_run_id UUID,
  prompt_version TEXT,
  rubric_version TEXT,
  verification_decision TEXT NOT NULL DEFAULT 'pending' CHECK (verification_decision IN (
    'pending', 'approved', 'corrected', 'rejected'
  )),
  founder_correction TEXT,
  verified_by UUID REFERENCES auth.users(id) ON DELETE RESTRICT,
  verified_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (verification_decision = 'pending' AND verified_by IS NULL AND verified_at IS NULL)
    OR (verification_decision <> 'pending' AND verified_by IS NOT NULL AND verified_at IS NOT NULL)
  ),
  CHECK (verification_decision <> 'corrected' OR founder_correction IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_spectiq_claims_dedupe
  ON public.spectiq_prospect_claims (prospect_id, claim_type, normalized_value, source_url);
CREATE INDEX IF NOT EXISTS idx_spectiq_claims_review
  ON public.spectiq_prospect_claims (verification_decision, created_at)
  WHERE verification_decision = 'pending';
CREATE INDEX IF NOT EXISTS idx_spectiq_claims_prospect_type
  ON public.spectiq_prospect_claims (prospect_id, claim_type, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.spectiq_prospect_notes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prospect_id UUID NOT NULL REFERENCES public.spectiq_prospects(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(btrim(body)) BETWEEN 1 AND 12000),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_spectiq_notes_prospect
  ON public.spectiq_prospect_notes (prospect_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.spectiq_prospect_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prospect_id UUID NOT NULL REFERENCES public.spectiq_prospects(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 300),
  description TEXT CHECK (description IS NULL OR char_length(description) <= 5000),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  assigned_to UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((status = 'completed') = (completed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_spectiq_tasks_open_due
  ON public.spectiq_prospect_tasks (due_at, created_at)
  WHERE status IN ('open', 'in_progress');
CREATE INDEX IF NOT EXISTS idx_spectiq_tasks_prospect
  ON public.spectiq_prospect_tasks (prospect_id, status, due_at);

CREATE TABLE IF NOT EXISTS public.spectiq_prospect_activity (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  prospect_id UUID REFERENCES public.spectiq_prospects(id) ON DELETE RESTRICT,
  territory_id UUID REFERENCES public.spectiq_prospecting_territories(id) ON DELETE RESTRICT,
  activity_type TEXT NOT NULL CHECK (activity_type IN (
    'territory_created', 'territory_updated', 'prospect_created', 'prospect_updated',
    'contact_added', 'contact_updated', 'stage_changed', 'verification_changed',
    'claim_added', 'claim_reviewed', 'note_added', 'note_updated', 'task_created', 'task_completed', 'exported',
    'commercial_commitment', 'conversion_milestone'
  )),
  actor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (prospect_id IS NOT NULL OR territory_id IS NOT NULL OR activity_type = 'exported')
);
CREATE INDEX IF NOT EXISTS idx_spectiq_activity_prospect
  ON public.spectiq_prospect_activity (prospect_id, created_at DESC)
  WHERE prospect_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_spectiq_activity_territory
  ON public.spectiq_prospect_activity (territory_id, created_at DESC)
  WHERE territory_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.spectiq_prospect_conversion_milestones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  prospect_id UUID NOT NULL REFERENCES public.spectiq_prospects(id) ON DELETE RESTRICT,
  milestone TEXT NOT NULL CHECK (milestone IN (
    'commercial_commitment', 'organization_created', 'owner_invited', 'activated', 'onboarding_failed'
  )),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'succeeded', 'failed')),
  external_organization_id UUID,
  error_code TEXT,
  error_message TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  occurred_at TIMESTAMPTZ,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (status <> 'succeeded' OR occurred_at IS NOT NULL),
  CHECK (status <> 'failed' OR error_code IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_spectiq_conversion_milestone
  ON public.spectiq_prospect_conversion_milestones (prospect_id, milestone);
CREATE INDEX IF NOT EXISTS idx_spectiq_conversion_status
  ON public.spectiq_prospect_conversion_milestones (status, updated_at DESC);

-- Cover auth-user foreign keys so account cleanup and founder audit lookups do
-- not require full-table scans as the pipeline grows.
CREATE INDEX IF NOT EXISTS idx_spectiq_territories_created_by ON public.spectiq_prospecting_territories (created_by);
CREATE INDEX IF NOT EXISTS idx_spectiq_territories_updated_by ON public.spectiq_prospecting_territories (updated_by);
CREATE INDEX IF NOT EXISTS idx_spectiq_prospects_created_by ON public.spectiq_prospects (created_by);
CREATE INDEX IF NOT EXISTS idx_spectiq_prospects_updated_by ON public.spectiq_prospects (updated_by);
CREATE INDEX IF NOT EXISTS idx_spectiq_prospects_pitch_approver ON public.spectiq_prospects (pitch_ready_approved_by) WHERE pitch_ready_approved_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_spectiq_contacts_created_by ON public.spectiq_prospect_contacts (created_by);
CREATE INDEX IF NOT EXISTS idx_spectiq_contacts_updated_by ON public.spectiq_prospect_contacts (updated_by);
CREATE INDEX IF NOT EXISTS idx_spectiq_claims_created_by ON public.spectiq_prospect_claims (created_by);
CREATE INDEX IF NOT EXISTS idx_spectiq_claims_verified_by ON public.spectiq_prospect_claims (verified_by) WHERE verified_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_spectiq_notes_created_by ON public.spectiq_prospect_notes (created_by);
CREATE INDEX IF NOT EXISTS idx_spectiq_tasks_assigned_to ON public.spectiq_prospect_tasks (assigned_to);
CREATE INDEX IF NOT EXISTS idx_spectiq_tasks_created_by ON public.spectiq_prospect_tasks (created_by);
CREATE INDEX IF NOT EXISTS idx_spectiq_tasks_updated_by ON public.spectiq_prospect_tasks (updated_by);
CREATE INDEX IF NOT EXISTS idx_spectiq_activity_actor ON public.spectiq_prospect_activity (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_spectiq_conversion_created_by ON public.spectiq_prospect_conversion_milestones (created_by);

CREATE OR REPLACE FUNCTION private.normalize_spectiq_prospect()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN
      NEW.created_by := (SELECT auth.uid());
    ELSE
      NEW.created_by := OLD.created_by;
    END IF;
    NEW.updated_by := (SELECT auth.uid());
  END IF;
  NEW.company_name := btrim(NEW.company_name);
  NEW.normalized_company_name := lower(regexp_replace(NEW.company_name, '[^a-zA-Z0-9]+', ' ', 'g'));
  NEW.normalized_company_name := btrim(regexp_replace(NEW.normalized_company_name, '[[:space:]]+', ' ', 'g'));
  IF NEW.official_domain IS NOT NULL THEN
    NEW.official_domain := lower(btrim(NEW.official_domain));
    NEW.official_domain := regexp_replace(NEW.official_domain, '^www\.', '');
  END IF;
  IF NEW.verification_state IN ('evidence_reviewed', 'identity_verified', 'contact_verified', 'outreach_approved')
     AND NEW.evidence_reviewed_at IS NULL THEN
    NEW.evidence_reviewed_at := now();
  END IF;
  IF NEW.verification_state IN ('identity_verified', 'contact_verified', 'outreach_approved')
     AND NEW.identity_verified_at IS NULL THEN
    NEW.identity_verified_at := now();
  END IF;
  IF NEW.verification_state = 'outreach_approved' AND NEW.outreach_approved_at IS NULL THEN
    NEW.outreach_approved_at := now();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.normalize_spectiq_contact()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.uid()) IS NOT NULL THEN
    IF TG_OP = 'INSERT' THEN
      NEW.created_by := (SELECT auth.uid());
    ELSE
      NEW.created_by := OLD.created_by;
    END IF;
    NEW.updated_by := (SELECT auth.uid());
  END IF;
  NEW.email := NULLIF(lower(btrim(NEW.email)), '');
  NEW.email_normalized := NEW.email;
  NEW.phone := NULLIF(btrim(NEW.phone), '');
  NEW.phone_normalized := NULLIF(regexp_replace(COALESCE(NEW.phone, ''), '[^0-9]+', '', 'g'), '');
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.prepare_spectiq_founder_record()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  payload JSONB := to_jsonb(NEW);
  current_actor UUID := (SELECT auth.uid());
BEGIN
  IF current_actor IS NOT NULL THEN
    IF payload ? 'created_by' THEN
      payload := jsonb_set(
        payload,
        '{created_by}',
        to_jsonb(CASE WHEN TG_OP = 'INSERT' THEN current_actor ELSE (to_jsonb(OLD)->>'created_by')::UUID END)
      );
    END IF;
    IF payload ? 'updated_by' THEN
      payload := jsonb_set(payload, '{updated_by}', to_jsonb(current_actor));
    END IF;
    IF payload ? 'assigned_to' AND NULLIF(payload->>'assigned_to', '') IS NULL THEN
      payload := jsonb_set(payload, '{assigned_to}', to_jsonb(current_actor));
    END IF;
    IF TG_TABLE_NAME = 'spectiq_prospect_activity' THEN
      payload := jsonb_set(payload, '{actor_id}', to_jsonb(current_actor));
    END IF;
  END IF;

  IF payload ? 'updated_at' THEN
    payload := jsonb_set(payload, '{updated_at}', to_jsonb(now()));
  END IF;

  IF TG_TABLE_NAME = 'spectiq_prospecting_territories' THEN
    IF payload->>'status' = 'archived' AND NULLIF(payload->>'archived_at', '') IS NULL THEN
      payload := jsonb_set(payload, '{archived_at}', to_jsonb(now()));
    ELSIF payload->>'status' <> 'archived' THEN
      payload := jsonb_set(payload, '{archived_at}', 'null'::jsonb);
    END IF;
  ELSIF TG_TABLE_NAME = 'spectiq_prospect_tasks' THEN
    IF payload->>'status' = 'completed' AND NULLIF(payload->>'completed_at', '') IS NULL THEN
      payload := jsonb_set(payload, '{completed_at}', to_jsonb(now()));
    ELSIF payload->>'status' <> 'completed' THEN
      payload := jsonb_set(payload, '{completed_at}', 'null'::jsonb);
    END IF;
  ELSIF TG_TABLE_NAME = 'spectiq_prospect_claims' THEN
    IF payload->>'verification_decision' = 'pending' THEN
      payload := jsonb_set(payload, '{verified_by}', 'null'::jsonb);
      payload := jsonb_set(payload, '{verified_at}', 'null'::jsonb);
    ELSIF current_actor IS NOT NULL THEN
      payload := jsonb_set(payload, '{verified_by}', to_jsonb(current_actor));
      payload := jsonb_set(payload, '{verified_at}', to_jsonb(now()));
    END IF;
  END IF;

  NEW := jsonb_populate_record(NEW, payload);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.audit_spectiq_record_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  row_data JSONB := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  old_data JSONB := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE '{}'::jsonb END;
  prospect_uuid UUID;
  territory_uuid UUID;
  event_name TEXT := TG_ARGV[0];
  audit_details JSONB;
BEGIN
  prospect_uuid := CASE
    WHEN TG_TABLE_NAME = 'spectiq_prospects' THEN (row_data->>'id')::UUID
    ELSE NULLIF(row_data->>'prospect_id', '')::UUID
  END;
  territory_uuid := CASE
    WHEN TG_TABLE_NAME = 'spectiq_prospecting_territories' THEN (row_data->>'id')::UUID
    WHEN TG_TABLE_NAME = 'spectiq_prospects' THEN NULLIF(row_data->>'territory_id', '')::UUID
    ELSE NULL
  END;

  IF TG_TABLE_NAME = 'spectiq_prospects' AND TG_OP = 'UPDATE'
     AND old_data->>'sales_state' IS DISTINCT FROM row_data->>'sales_state' THEN
    event_name := 'stage_changed';
  ELSIF TG_TABLE_NAME = 'spectiq_prospects' AND TG_OP = 'UPDATE'
     AND old_data->>'verification_state' IS DISTINCT FROM row_data->>'verification_state' THEN
    event_name := 'verification_changed';
  ELSIF TG_TABLE_NAME = 'spectiq_prospects' AND TG_OP = 'UPDATE' THEN
    event_name := 'prospect_updated';
  ELSIF TG_TABLE_NAME = 'spectiq_prospecting_territories' AND TG_OP = 'UPDATE' THEN
    event_name := 'territory_updated';
  ELSIF TG_TABLE_NAME = 'spectiq_prospect_contacts' AND TG_OP = 'UPDATE' THEN
    event_name := 'contact_updated';
  ELSIF TG_TABLE_NAME = 'spectiq_prospect_claims' AND TG_OP = 'UPDATE'
     AND old_data->>'verification_decision' IS DISTINCT FROM row_data->>'verification_decision' THEN
    event_name := 'claim_reviewed';
  ELSIF TG_TABLE_NAME = 'spectiq_prospect_notes' AND TG_OP = 'UPDATE' THEN
    event_name := 'note_updated';
  ELSIF TG_TABLE_NAME = 'spectiq_prospect_tasks' AND row_data->>'status' = 'completed'
     AND old_data->>'status' IS DISTINCT FROM 'completed' THEN
    event_name := 'task_completed';
  ELSIF TG_TABLE_NAME = 'spectiq_prospect_conversion_milestones' THEN
    event_name := CASE
      WHEN row_data->>'milestone' = 'commercial_commitment' THEN 'commercial_commitment'
      ELSE 'conversion_milestone'
    END;
  END IF;

  audit_details := jsonb_strip_nulls(jsonb_build_object(
    'table', TG_TABLE_NAME,
    'operation', lower(TG_OP),
    'record_id', row_data->>'id',
    'from_sales_state', old_data->>'sales_state',
    'to_sales_state', row_data->>'sales_state',
    'from_verification_state', old_data->>'verification_state',
    'to_verification_state', row_data->>'verification_state',
    'milestone', row_data->>'milestone',
    'status', row_data->>'status'
  ));

  INSERT INTO public.spectiq_prospect_activity (
    prospect_id, territory_id, activity_type, actor_id, details
  ) VALUES (
    prospect_uuid,
    territory_uuid,
    event_name,
    COALESCE((SELECT auth.uid()), NULLIF(row_data->>'updated_by', '')::UUID, NULLIF(row_data->>'created_by', '')::UUID),
    audit_details
  );
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.enforce_spectiq_pitch_ready()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.sales_state = 'pitch_ready' THEN
    IF NEW.verification_state <> 'outreach_approved'
       OR NEW.identity_verified_at IS NULL
       OR NEW.evidence_reviewed_at IS NULL
       OR NEW.outreach_approved_at IS NULL
       OR NEW.pitch_ready_approved_by IS DISTINCT FROM (SELECT auth.uid())
       OR NEW.pitch_ready_approved_at IS NULL THEN
      RAISE EXCEPTION 'pitch_ready requires reviewed evidence, verified identity, outreach approval, and explicit founder approval'
        USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.spectiq_prospect_claims c
      WHERE c.prospect_id = NEW.id
        AND c.claim_type = 'outreach_angle'
        AND c.verification_decision IN ('approved', 'corrected')
        AND c.verified_by = (SELECT auth.uid())
    ) THEN
      RAISE EXCEPTION 'pitch_ready requires a founder-reviewed outreach claim'
        USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.spectiq_prospect_contacts c
      WHERE c.prospect_id = NEW.id
        AND c.email_status = 'verified'
        AND c.email_verified_at IS NOT NULL
        AND c.suppressed_at IS NULL
    ) THEN
      RAISE EXCEPTION 'pitch_ready requires a verified, unsuppressed email address'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.reject_spectiq_activity_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'SpectIQ prospect activity is immutable' USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS spectiq_prospect_normalize ON public.spectiq_prospects;
CREATE TRIGGER spectiq_prospect_normalize
  BEFORE INSERT OR UPDATE ON public.spectiq_prospects
  FOR EACH ROW EXECUTE FUNCTION private.normalize_spectiq_prospect();

DROP TRIGGER IF EXISTS spectiq_contact_normalize ON public.spectiq_prospect_contacts;
CREATE TRIGGER spectiq_contact_normalize
  BEFORE INSERT OR UPDATE ON public.spectiq_prospect_contacts
  FOR EACH ROW EXECUTE FUNCTION private.normalize_spectiq_contact();

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'spectiq_prospecting_territories', 'spectiq_prospect_claims', 'spectiq_prospect_notes',
    'spectiq_prospect_tasks', 'spectiq_prospect_activity', 'spectiq_prospect_conversion_milestones'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS spectiq_prepare_record ON public.%I', table_name);
    EXECUTE format(
      'CREATE TRIGGER spectiq_prepare_record BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION private.prepare_spectiq_founder_record()',
      table_name
    );
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS spectiq_pitch_ready_guard ON public.spectiq_prospects;
CREATE TRIGGER spectiq_pitch_ready_guard
  BEFORE INSERT OR UPDATE OF sales_state, verification_state, identity_verified_at,
    evidence_reviewed_at, outreach_approved_at, pitch_ready_approved_by, pitch_ready_approved_at
  ON public.spectiq_prospects
  FOR EACH ROW EXECUTE FUNCTION private.enforce_spectiq_pitch_ready();

DROP TRIGGER IF EXISTS spectiq_activity_immutable ON public.spectiq_prospect_activity;
CREATE TRIGGER spectiq_activity_immutable
  BEFORE UPDATE OR DELETE ON public.spectiq_prospect_activity
  FOR EACH ROW EXECUTE FUNCTION private.reject_spectiq_activity_mutation();

DROP TRIGGER IF EXISTS spectiq_audit_prospect ON public.spectiq_prospects;
CREATE TRIGGER spectiq_audit_prospect
  AFTER INSERT OR UPDATE ON public.spectiq_prospects
  FOR EACH ROW EXECUTE FUNCTION private.audit_spectiq_record_change('prospect_created');
DROP TRIGGER IF EXISTS spectiq_audit_territory ON public.spectiq_prospecting_territories;
CREATE TRIGGER spectiq_audit_territory
  AFTER INSERT OR UPDATE ON public.spectiq_prospecting_territories
  FOR EACH ROW EXECUTE FUNCTION private.audit_spectiq_record_change('territory_created');
DROP TRIGGER IF EXISTS spectiq_audit_contact ON public.spectiq_prospect_contacts;
CREATE TRIGGER spectiq_audit_contact
  AFTER INSERT OR UPDATE ON public.spectiq_prospect_contacts
  FOR EACH ROW EXECUTE FUNCTION private.audit_spectiq_record_change('contact_added');
DROP TRIGGER IF EXISTS spectiq_audit_claim ON public.spectiq_prospect_claims;
CREATE TRIGGER spectiq_audit_claim
  AFTER INSERT OR UPDATE ON public.spectiq_prospect_claims
  FOR EACH ROW EXECUTE FUNCTION private.audit_spectiq_record_change('claim_added');
DROP TRIGGER IF EXISTS spectiq_audit_note ON public.spectiq_prospect_notes;
CREATE TRIGGER spectiq_audit_note
  AFTER INSERT OR UPDATE ON public.spectiq_prospect_notes
  FOR EACH ROW EXECUTE FUNCTION private.audit_spectiq_record_change('note_added');
DROP TRIGGER IF EXISTS spectiq_audit_task ON public.spectiq_prospect_tasks;
CREATE TRIGGER spectiq_audit_task
  AFTER INSERT OR UPDATE ON public.spectiq_prospect_tasks
  FOR EACH ROW EXECUTE FUNCTION private.audit_spectiq_record_change('task_created');
DROP TRIGGER IF EXISTS spectiq_audit_conversion ON public.spectiq_prospect_conversion_milestones;
CREATE TRIGGER spectiq_audit_conversion
  AFTER INSERT OR UPDATE ON public.spectiq_prospect_conversion_milestones
  FOR EACH ROW EXECUTE FUNCTION private.audit_spectiq_record_change('conversion_milestone');

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'spectiq_prospecting_territories', 'spectiq_prospects', 'spectiq_prospect_contacts',
    'spectiq_prospect_claims', 'spectiq_prospect_notes', 'spectiq_prospect_tasks',
    'spectiq_prospect_activity', 'spectiq_prospect_conversion_milestones'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', table_name);
    EXECUTE format('DROP POLICY IF EXISTS "SpectIQ founder access" ON public.%I', table_name);
    EXECUTE format(
      'CREATE POLICY "SpectIQ founder access" ON public.%I FOR ALL TO authenticated USING ((SELECT private.is_spectiq_prospecting_founder())) WITH CHECK ((SELECT private.is_spectiq_prospecting_founder()))',
      table_name
    );
    EXECUTE format('DROP POLICY IF EXISTS "SpectIQ service role access" ON public.%I', table_name);
    EXECUTE format(
      'CREATE POLICY "SpectIQ service role access" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
      table_name
    );
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE ON TABLE
  public.spectiq_prospecting_territories,
  public.spectiq_prospects
TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE
  public.spectiq_prospect_contacts,
  public.spectiq_prospect_claims,
  public.spectiq_prospect_notes,
  public.spectiq_prospect_tasks
TO authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.spectiq_prospect_conversion_milestones TO authenticated;
GRANT SELECT, INSERT ON TABLE public.spectiq_prospect_activity TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.spectiq_prospecting_territories,
  public.spectiq_prospects,
  public.spectiq_prospect_contacts,
  public.spectiq_prospect_claims,
  public.spectiq_prospect_notes,
  public.spectiq_prospect_tasks,
  public.spectiq_prospect_conversion_milestones
TO service_role;
GRANT SELECT, INSERT ON TABLE public.spectiq_prospect_activity TO service_role;

REVOKE ALL ON SEQUENCE public.spectiq_prospect_activity_id_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.spectiq_prospect_activity_id_seq TO authenticated, service_role;

GRANT USAGE ON SCHEMA private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.approve_spectiq_prospect_pitch_ready(p_prospect_id UUID)
RETURNS public.spectiq_prospects
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  approved_prospect public.spectiq_prospects;
BEGIN
  IF NOT (SELECT private.is_spectiq_prospecting_founder()) THEN
    RAISE EXCEPTION 'Active platform super administrator access is required to approve pitch readiness'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.spectiq_prospects
  SET
    sales_state = 'pitch_ready',
    pitch_ready_approved_by = (SELECT auth.uid()),
    pitch_ready_approved_at = now(),
    updated_by = (SELECT auth.uid())
  WHERE id = p_prospect_id
  RETURNING * INTO approved_prospect;

  IF approved_prospect.id IS NULL THEN
    RAISE EXCEPTION 'Prospect not found' USING ERRCODE = 'P0002';
  END IF;
  RETURN approved_prospect;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_spectiq_prospect_pitch_ready(UUID) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.approve_spectiq_prospect_pitch_ready(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.export_spectiq_prospects(
  p_prospect_ids UUID[] DEFAULT NULL,
  p_territory_id UUID DEFAULT NULL,
  p_redacted BOOLEAN DEFAULT true
)
RETURNS TABLE (
  prospect_id UUID,
  company_name TEXT,
  territory_name TEXT,
  sales_state TEXT,
  verification_state TEXT,
  website_state TEXT,
  official_domain TEXT,
  website_url TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  next_follow_up_at TIMESTAMPTZ
)
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NOT (SELECT private.is_spectiq_prospecting_founder()) THEN
    RAISE EXCEPTION 'Active platform super administrator access is required for prospect export'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.spectiq_prospect_activity (activity_type, actor_id, details)
  VALUES (
    'exported',
    (SELECT auth.uid()),
    jsonb_build_object(
      'redacted', p_redacted,
      'territory_id', p_territory_id,
      'prospect_ids', COALESCE(to_jsonb(p_prospect_ids), 'null'::jsonb)
    )
  );

  RETURN QUERY
  SELECT
    p.id,
    CASE WHEN p.company_name ~ '^[=+\-@]' THEN '''' || p.company_name ELSE p.company_name END,
    CASE WHEN t.name ~ '^[=+\-@]' THEN '''' || t.name ELSE t.name END,
    p.sales_state,
    p.verification_state,
    p.website_state,
    p.official_domain,
    p.website_url,
    CASE
      WHEN p_redacted THEN NULL
      WHEN c.full_name ~ '^[=+\-@]' THEN '''' || c.full_name
      ELSE c.full_name
    END,
    CASE WHEN p_redacted THEN NULL ELSE c.email END,
    CASE WHEN p_redacted THEN NULL ELSE c.phone END,
    p.next_follow_up_at
  FROM public.spectiq_prospects p
  JOIN public.spectiq_prospecting_territories t ON t.id = p.territory_id
  LEFT JOIN LATERAL (
    SELECT pc.full_name, pc.email, pc.phone
    FROM public.spectiq_prospect_contacts pc
    WHERE pc.prospect_id = p.id
    ORDER BY pc.is_primary DESC, pc.created_at
    LIMIT 1
  ) c ON true
  WHERE p.archived_at IS NULL
    AND (p_prospect_ids IS NULL OR p.id = ANY(p_prospect_ids))
    AND (p_territory_id IS NULL OR p.territory_id = p_territory_id)
  ORDER BY p.company_name;
END;
$$;

REVOKE ALL ON FUNCTION public.export_spectiq_prospects(UUID[], UUID, BOOLEAN) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.export_spectiq_prospects(UUID[], UUID, BOOLEAN) TO authenticated;
