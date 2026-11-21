-- Complete the founder-operated CRUD surface for SpectIQ prospecting Phase 1.
-- This migration intentionally adds no research, outbound-email, or conversion actions.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'spectiq_prospect_activity_activity_type_check'
      AND conrelid = 'public.spectiq_prospect_activity'::regclass
  ) THEN
    ALTER TABLE public.spectiq_prospect_activity
      DROP CONSTRAINT spectiq_prospect_activity_activity_type_check;
  END IF;

  ALTER TABLE public.spectiq_prospect_activity
    ADD CONSTRAINT spectiq_prospect_activity_activity_type_check CHECK (activity_type IN (
      'territory_created', 'territory_updated', 'territory_archived',
      'prospect_created', 'prospect_updated', 'prospect_archived',
      'contact_added', 'contact_updated', 'stage_changed', 'verification_changed',
      'claim_added', 'claim_updated', 'claim_reviewed',
      'note_added', 'note_updated',
      'task_created', 'task_completed', 'task_cancelled',
      'exported', 'commercial_commitment', 'conversion_milestone'
    ));
END $$;

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

  IF NEW.email_status = 'verified'
     AND (TG_OP = 'INSERT' OR OLD.email_status IS DISTINCT FROM 'verified' OR OLD.email IS DISTINCT FROM NEW.email) THEN
    NEW.email_verified_at := now();
  ELSIF NEW.email_status <> 'verified' THEN
    NEW.email_verified_at := NULL;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.keep_one_spectiq_primary_contact()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.is_primary THEN
    UPDATE public.spectiq_prospect_contacts
    SET is_primary = false
    WHERE prospect_id = NEW.prospect_id
      AND id IS DISTINCT FROM NEW.id
      AND is_primary = true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS spectiq_contact_one_primary ON public.spectiq_prospect_contacts;
CREATE TRIGGER spectiq_contact_one_primary
  BEFORE INSERT OR UPDATE OF is_primary, prospect_id
  ON public.spectiq_prospect_contacts
  FOR EACH ROW
  WHEN (NEW.is_primary = true)
  EXECUTE FUNCTION private.keep_one_spectiq_primary_contact();

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
     AND old_data->>'archived_at' IS NULL AND row_data->>'archived_at' IS NOT NULL THEN
    event_name := 'prospect_archived';
  ELSIF TG_TABLE_NAME = 'spectiq_prospects' AND TG_OP = 'UPDATE'
     AND old_data->>'sales_state' IS DISTINCT FROM row_data->>'sales_state' THEN
    event_name := 'stage_changed';
  ELSIF TG_TABLE_NAME = 'spectiq_prospects' AND TG_OP = 'UPDATE'
     AND old_data->>'verification_state' IS DISTINCT FROM row_data->>'verification_state' THEN
    event_name := 'verification_changed';
  ELSIF TG_TABLE_NAME = 'spectiq_prospects' AND TG_OP = 'UPDATE' THEN
    event_name := 'prospect_updated';
  ELSIF TG_TABLE_NAME = 'spectiq_prospecting_territories' AND TG_OP = 'UPDATE'
     AND old_data->>'archived_at' IS NULL AND row_data->>'archived_at' IS NOT NULL THEN
    event_name := 'territory_archived';
  ELSIF TG_TABLE_NAME = 'spectiq_prospecting_territories' AND TG_OP = 'UPDATE' THEN
    event_name := 'territory_updated';
  ELSIF TG_TABLE_NAME = 'spectiq_prospect_contacts' AND TG_OP = 'UPDATE' THEN
    event_name := 'contact_updated';
  ELSIF TG_TABLE_NAME = 'spectiq_prospect_claims' AND TG_OP = 'UPDATE'
     AND old_data->>'verification_decision' IS DISTINCT FROM row_data->>'verification_decision' THEN
    event_name := 'claim_reviewed';
  ELSIF TG_TABLE_NAME = 'spectiq_prospect_claims' AND TG_OP = 'UPDATE' THEN
    event_name := 'claim_updated';
  ELSIF TG_TABLE_NAME = 'spectiq_prospect_notes' AND TG_OP = 'UPDATE' THEN
    event_name := 'note_updated';
  ELSIF TG_TABLE_NAME = 'spectiq_prospect_tasks' AND TG_OP = 'UPDATE'
     AND row_data->>'status' = 'completed' AND old_data->>'status' IS DISTINCT FROM 'completed' THEN
    event_name := 'task_completed';
  ELSIF TG_TABLE_NAME = 'spectiq_prospect_tasks' AND TG_OP = 'UPDATE'
     AND row_data->>'status' = 'cancelled' AND old_data->>'status' IS DISTINCT FROM 'cancelled' THEN
    event_name := 'task_cancelled';
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
    'from_status', old_data->>'status',
    'to_status', row_data->>'status',
    'from_decision', old_data->>'verification_decision',
    'to_decision', row_data->>'verification_decision',
    'milestone', row_data->>'milestone'
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
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_spectiq_prospect(p_prospect_id UUID)
RETURNS public.spectiq_prospects
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE archived_prospect public.spectiq_prospects;
BEGIN
  IF NOT (SELECT private.is_spectiq_prospecting_founder()) THEN
    RAISE EXCEPTION 'Active platform super administrator access is required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.spectiq_prospects
  SET archived_at = COALESCE(archived_at, now()), updated_by = (SELECT auth.uid())
  WHERE id = p_prospect_id
  RETURNING * INTO archived_prospect;
  IF archived_prospect.id IS NULL THEN RAISE EXCEPTION 'Prospect not found' USING ERRCODE = 'P0002'; END IF;
  RETURN archived_prospect;
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_spectiq_territory(p_territory_id UUID)
RETURNS public.spectiq_prospecting_territories
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE archived_territory public.spectiq_prospecting_territories;
BEGIN
  IF NOT (SELECT private.is_spectiq_prospecting_founder()) THEN
    RAISE EXCEPTION 'Active platform super administrator access is required' USING ERRCODE = '42501';
  END IF;
  UPDATE public.spectiq_prospecting_territories
  SET status = 'archived', updated_by = (SELECT auth.uid())
  WHERE id = p_territory_id
  RETURNING * INTO archived_territory;
  IF archived_territory.id IS NULL THEN RAISE EXCEPTION 'Territory not found' USING ERRCODE = 'P0002'; END IF;
  RETURN archived_territory;
END;
$$;

CREATE OR REPLACE FUNCTION public.review_spectiq_prospect_claim(
  p_claim_id UUID,
  p_decision TEXT,
  p_founder_correction TEXT DEFAULT NULL
)
RETURNS public.spectiq_prospect_claims
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE reviewed_claim public.spectiq_prospect_claims;
BEGIN
  IF NOT (SELECT private.is_spectiq_prospecting_founder()) THEN
    RAISE EXCEPTION 'Active platform super administrator access is required' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('approved', 'corrected', 'rejected') THEN
    RAISE EXCEPTION 'Review decision must be approved, corrected, or rejected' USING ERRCODE = '22023';
  END IF;
  IF p_decision = 'corrected' AND NULLIF(btrim(p_founder_correction), '') IS NULL THEN
    RAISE EXCEPTION 'A founder correction is required for corrected evidence' USING ERRCODE = '22023';
  END IF;
  UPDATE public.spectiq_prospect_claims
  SET verification_decision = p_decision,
      founder_correction = CASE WHEN p_decision = 'corrected' THEN btrim(p_founder_correction) ELSE NULL END
  WHERE id = p_claim_id
  RETURNING * INTO reviewed_claim;
  IF reviewed_claim.id IS NULL THEN RAISE EXCEPTION 'Evidence claim not found' USING ERRCODE = 'P0002'; END IF;
  RETURN reviewed_claim;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_spectiq_prospect_verification(
  p_prospect_id UUID,
  p_verification_state TEXT
)
RETURNS public.spectiq_prospects
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE updated_prospect public.spectiq_prospects;
BEGIN
  IF NOT (SELECT private.is_spectiq_prospecting_founder()) THEN
    RAISE EXCEPTION 'Active platform super administrator access is required' USING ERRCODE = '42501';
  END IF;
  IF p_verification_state NOT IN (
    'unreviewed', 'evidence_reviewed', 'identity_verified', 'contact_verified', 'outreach_approved'
  ) THEN
    RAISE EXCEPTION 'Invalid prospect verification state' USING ERRCODE = '22023';
  END IF;
  IF p_verification_state IN ('evidence_reviewed', 'identity_verified', 'contact_verified', 'outreach_approved')
     AND NOT EXISTS (
       SELECT 1 FROM public.spectiq_prospect_claims c
       WHERE c.prospect_id = p_prospect_id AND c.verification_decision IN ('approved', 'corrected')
     ) THEN
    RAISE EXCEPTION 'Reviewed evidence is required for this verification state' USING ERRCODE = '23514';
  END IF;
  IF p_verification_state IN ('identity_verified', 'contact_verified', 'outreach_approved')
     AND NOT EXISTS (
       SELECT 1 FROM public.spectiq_prospect_claims c
       WHERE c.prospect_id = p_prospect_id
         AND c.claim_type IN ('company_identity', 'official_website')
         AND c.verification_decision IN ('approved', 'corrected')
     ) THEN
    RAISE EXCEPTION 'Approved identity evidence is required' USING ERRCODE = '23514';
  END IF;
  IF p_verification_state IN ('contact_verified', 'outreach_approved')
     AND NOT EXISTS (
       SELECT 1 FROM public.spectiq_prospect_contacts c
       WHERE c.prospect_id = p_prospect_id
         AND c.email_status = 'verified' AND c.email_verified_at IS NOT NULL AND c.suppressed_at IS NULL
     ) THEN
    RAISE EXCEPTION 'A verified, unsuppressed contact is required' USING ERRCODE = '23514';
  END IF;
  IF p_verification_state = 'outreach_approved'
     AND NOT EXISTS (
       SELECT 1 FROM public.spectiq_prospect_claims c
       WHERE c.prospect_id = p_prospect_id
         AND c.claim_type = 'outreach_angle'
         AND c.verification_decision IN ('approved', 'corrected')
     ) THEN
    RAISE EXCEPTION 'A reviewed outreach claim is required' USING ERRCODE = '23514';
  END IF;

  UPDATE public.spectiq_prospects
  SET verification_state = p_verification_state, updated_by = (SELECT auth.uid())
  WHERE id = p_prospect_id AND archived_at IS NULL
  RETURNING * INTO updated_prospect;
  IF updated_prospect.id IS NULL THEN RAISE EXCEPTION 'Active prospect not found' USING ERRCODE = 'P0002'; END IF;
  RETURN updated_prospect;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_spectiq_prospect_task_status(
  p_task_id UUID,
  p_status TEXT
)
RETURNS public.spectiq_prospect_tasks
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE updated_task public.spectiq_prospect_tasks;
BEGIN
  IF NOT (SELECT private.is_spectiq_prospecting_founder()) THEN
    RAISE EXCEPTION 'Active platform super administrator access is required' USING ERRCODE = '42501';
  END IF;
  IF p_status NOT IN ('open', 'in_progress', 'completed', 'cancelled') THEN
    RAISE EXCEPTION 'Invalid prospect task status' USING ERRCODE = '22023';
  END IF;
  UPDATE public.spectiq_prospect_tasks
  SET status = p_status, updated_by = (SELECT auth.uid())
  WHERE id = p_task_id
  RETURNING * INTO updated_task;
  IF updated_task.id IS NULL THEN RAISE EXCEPTION 'Prospect task not found' USING ERRCODE = 'P0002'; END IF;
  RETURN updated_task;
END;
$$;

DO $$
DECLARE signature TEXT;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'public.archive_spectiq_prospect(UUID)',
    'public.archive_spectiq_territory(UUID)',
    'public.review_spectiq_prospect_claim(UUID, TEXT, TEXT)',
    'public.update_spectiq_prospect_verification(UUID, TEXT)',
    'public.update_spectiq_prospect_task_status(UUID, TEXT)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, service_role', signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', signature);
  END LOOP;
END $$;

-- Reassert the exposed-table boundary. RLS policies from the foundation
-- migration remain the row-authorization layer; these grants expose only the
-- operations required by the founder UI.
REVOKE ALL ON TABLE public.spectiq_prospect_activity FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.spectiq_prospect_activity TO authenticated;
REVOKE DELETE ON TABLE
  public.spectiq_prospecting_territories,
  public.spectiq_prospects,
  public.spectiq_prospect_contacts,
  public.spectiq_prospect_claims,
  public.spectiq_prospect_notes,
  public.spectiq_prospect_tasks
FROM authenticated;
