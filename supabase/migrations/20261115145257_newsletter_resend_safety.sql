-- Prepared only. No production application is authorized.
-- The live outbox predates migrations and was absent from the master stamp.
CREATE TABLE IF NOT EXISTS public.campaign_recipients (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id uuid NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  email text NOT NULL, first_name text, unsubscribe_token text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  resend_email_id text, error text, created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign_status ON public.campaign_recipients(campaign_id,status);
GRANT ALL ON public.campaign_recipients TO service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.campaign_recipients TO authenticated;
-- Internal staff share the campaign registry and reports across brands. Keep
-- external/client accounts out without restricting reports to the row creator.
REVOKE ALL ON public.campaigns, public.campaign_recipients, public.campaign_sends,
  public.email_events, public.email_suppressions FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.campaigns, public.campaign_recipients,
  public.campaign_sends, public.email_events, public.email_suppressions FROM authenticated;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaign_recipients_app ON public.campaign_recipients;
CREATE POLICY campaign_recipients_app ON public.campaign_recipients FOR SELECT TO authenticated
  USING ((SELECT private.is_active_trellis_user()));
DROP POLICY IF EXISTS newsletter_recipient_write ON public.campaign_recipients;
CREATE POLICY newsletter_recipient_write ON public.campaign_recipients FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id=campaign_id
    AND (c.owner_id=(SELECT auth.uid()) OR (SELECT private.can_manage_marketing()))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id=campaign_id
    AND (c.owner_id=(SELECT auth.uid()) OR (SELECT private.can_manage_marketing()))));

-- Remove the earlier prepared owner-only restrictions if this stamp is rerun.
DROP POLICY IF EXISTS newsletter_campaign_owner_boundary ON public.campaigns;
DROP POLICY IF EXISTS newsletter_recipient_owner_boundary ON public.campaign_recipients;
DROP POLICY IF EXISTS newsletter_send_owner_boundary ON public.campaign_sends;
DROP POLICY IF EXISTS newsletter_event_owner_boundary ON public.email_events;
DROP POLICY IF EXISTS newsletter_suppression_owner_boundary ON public.email_suppressions;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['campaigns','campaign_recipients','campaign_sends','email_events','email_suppressions'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS newsletter_staff_boundary ON public.%I',t);
    EXECUTE format('CREATE POLICY newsletter_staff_boundary ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
      USING ((SELECT private.is_active_trellis_user())) WITH CHECK ((SELECT private.is_active_trellis_user()))',t);
  END LOOP;
END $$;

-- Views otherwise run with their creator's privileges and bypass the policies
-- above. Include transitive dependent views, not only the old subject view.
DO $$ DECLARE v record; BEGIN
  FOR v IN
    WITH RECURSIVE dependent(oid) AS (
      SELECT unnest(ARRAY['public.campaigns'::regclass::oid,'public.campaign_recipients'::regclass::oid,
        'public.campaign_sends'::regclass::oid,'public.email_events'::regclass::oid,'public.email_suppressions'::regclass::oid])
      UNION
      SELECT rw.ev_class FROM dependent d JOIN pg_depend dep ON dep.refobjid=d.oid
        JOIN pg_rewrite rw ON rw.oid=dep.objid JOIN pg_class cls ON cls.oid=rw.ev_class
        WHERE cls.relkind='v' AND dep.classid='pg_rewrite'::regclass
    ) SELECT n.nspname,c.relname FROM dependent d JOIN pg_class c ON c.oid=d.oid
      JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind='v' AND n.nspname='public'
  LOOP
    EXECUTE format('ALTER VIEW %I.%I SET (security_invoker=true)',v.nspname,v.relname);
    EXECUTE format('REVOKE ALL ON %I.%I FROM anon,authenticated',v.nspname,v.relname);
    EXECUTE format('GRANT SELECT ON %I.%I TO authenticated,service_role',v.nspname,v.relname);
  END LOOP;
END $$;

-- Reads are service-only; the endpoint binds the verified staff actor and business.
CREATE OR REPLACE FUNCTION public.newsletter_resend_source(p_campaign_id uuid, p_user_id uuid, p_branch text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE c public.campaigns; b jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.trellis_users WHERE auth_user_id=p_user_id AND status='active') THEN
    RAISE EXCEPTION 'Original campaign unavailable or access denied';
  END IF;
  SELECT * INTO c FROM public.campaigns WHERE id=p_campaign_id AND (owner_id=p_user_id OR EXISTS (
    SELECT 1 FROM public.trellis_users u WHERE u.auth_user_id=p_user_id AND u.status='active' AND u.role IN ('owner','admin','operator')))
    AND branches=jsonb_build_array(p_branch);
  IF NOT FOUND THEN RAISE EXCEPTION 'Original campaign unavailable or access denied'; END IF;
  SELECT jsonb_build_object(
    'campaign', to_jsonb(c), 'authorized_for', p_user_id,
    'recipients', coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM public.campaign_recipients r WHERE campaign_id=c.id AND status='sent'), '[]'::jsonb),
    'sends', coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.resend_email_id) FROM public.campaign_sends s WHERE campaign_id=c.id), '[]'::jsonb),
    'events', coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.resend_email_id,e.event_type,e.email,e.campaign_id) FROM (
      SELECT DISTINCT resend_email_id,event_type,lower(email) email,campaign_id FROM public.email_events
      WHERE campaign_id=c.id OR resend_email_id IN (SELECT resend_email_id FROM public.campaign_sends WHERE campaign_id=c.id)
    ) e), '[]'::jsonb),
    'suppressions', coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.email,s.scope) FROM (
      SELECT lower(email) email,reason,scope FROM public.email_suppressions WHERE scope IN ('global',p_branch)
      AND lower(email) IN (SELECT lower(email) FROM public.campaign_recipients WHERE campaign_id=c.id AND status='sent')
    ) s), '[]'::jsonb)
  ) INTO b;
  RETURN b || jsonb_build_object('source_version',md5(b::text));
END;
$$;
REVOKE ALL ON FUNCTION public.newsletter_resend_source(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.newsletter_resend_source(uuid,uuid,text) TO service_role;

-- One reminder per original, including old reminders. Do not silently clean up
-- duplicates if preflight discovers any; investigate before applying.
CREATE UNIQUE INDEX IF NOT EXISTS campaigns_one_nonopener_reminder
  ON public.campaigns ((metadata->>'resend_of')) WHERE metadata->>'resend_kind'='non_openers';

CREATE OR REPLACE FUNCTION public.enqueue_newsletter_reminder(
  p_campaign_id uuid,p_user_id uuid,p_branch text,p_subject text,p_source_version text,
  p_recipients jsonb,p_fingerprint text
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE c public.campaigns; reminder public.campaigns; b jsonb;
BEGIN
  -- Same original serializes duplicate requests; the unique index is durable.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_campaign_id::text,0));
  SELECT * INTO c FROM public.campaigns WHERE id=p_campaign_id FOR UPDATE;
  b := public.newsletter_resend_source(p_campaign_id,p_user_id,p_branch);
  IF b->>'source_version' IS DISTINCT FROM p_source_version THEN RAISE EXCEPTION 'Source changed; preview again'; END IF;
  IF c.send_status NOT IN ('sent','partial') OR c.metadata ? 'resend_of' OR nullif(trim(p_subject),'') IS NULL
    OR jsonb_typeof(p_recipients) IS DISTINCT FROM 'array' OR jsonb_array_length(p_recipients)=0
    OR nullif(p_fingerprint,'') IS NULL THEN RAISE EXCEPTION 'Invalid reminder'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_recipients) r WHERE NOT EXISTS (
    SELECT 1 FROM public.campaign_recipients original WHERE original.campaign_id=c.id AND original.status='sent'
    AND lower(original.email)=r->>'email')) THEN RAISE EXCEPTION 'Recipient does not belong to original'; END IF;
  IF (SELECT count(DISTINCT r->>'email') FROM jsonb_array_elements(p_recipients) r) <> jsonb_array_length(p_recipients) THEN
    RAISE EXCEPTION 'Duplicate or missing recipients';
  END IF;
  INSERT INTO public.campaigns(name,status,template,subject,trigger_type,segments,tags,branches,audience_size,
    metadata,created_by,owner_id,campaign_type,dispatch,send_status,launched_at)
  VALUES(c.name || ' — Reminder','active',c.template,trim(p_subject),'immediate',c.segments,c.tags,c.branches,
    jsonb_array_length(p_recipients),jsonb_build_object('resend_of',c.id,'resend_kind','non_openers',
    'resend_safety_version',1,'resend_fingerprint',p_fingerprint),'server',p_user_id,c.campaign_type,
    c.dispatch || jsonb_build_object('subject',trim(p_subject),'cc',null),'queued',now()) RETURNING * INTO reminder;
  INSERT INTO public.campaign_recipients(campaign_id,email,first_name,unsubscribe_token,status)
    SELECT reminder.id,r->>'email',r->>'first_name',r->>'unsubscribe_token','pending' FROM jsonb_array_elements(p_recipients) r;
  RETURN to_jsonb(reminder);
END;
$$;
REVOKE ALL ON FUNCTION public.enqueue_newsletter_reminder(uuid,uuid,text,text,text,jsonb,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_newsletter_reminder(uuid,uuid,text,text,text,jsonb,text) TO service_role;

-- Old clients must not be able to bypass the server preview by inserting a
-- reminder and its audience themselves, or rewriting a validated reminder.
CREATE OR REPLACE FUNCTION public.guard_newsletter_reminder() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF (NEW.metadata ? 'resend_of' OR (TG_OP='UPDATE' AND OLD.metadata ? 'resend_of'))
     AND current_user <> 'service_role' THEN
    RAISE EXCEPTION 'Use the server newsletter reminder preview';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_newsletter_reminder ON public.campaigns;
CREATE TRIGGER guard_newsletter_reminder BEFORE INSERT OR UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.guard_newsletter_reminder();
REVOKE ALL ON FUNCTION public.guard_newsletter_reminder() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.guard_newsletter_reminder_recipient() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE new_campaign uuid; old_campaign uuid;
BEGIN
  IF TG_OP<>'DELETE' THEN new_campaign:=NEW.campaign_id; END IF;
  IF TG_OP<>'INSERT' THEN old_campaign:=OLD.campaign_id; END IF;
  IF current_user <> 'service_role' AND EXISTS (SELECT 1 FROM public.campaigns WHERE id IN (new_campaign,old_campaign) AND metadata ? 'resend_of') THEN
    RAISE EXCEPTION 'Reminder audience is managed by the server';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS guard_newsletter_reminder_recipient ON public.campaign_recipients;
CREATE TRIGGER guard_newsletter_reminder_recipient BEFORE INSERT OR UPDATE OR DELETE ON public.campaign_recipients
  FOR EACH ROW EXECUTE FUNCTION public.guard_newsletter_reminder_recipient();
REVOKE ALL ON FUNCTION public.guard_newsletter_reminder_recipient() FROM PUBLIC,anon,authenticated;
