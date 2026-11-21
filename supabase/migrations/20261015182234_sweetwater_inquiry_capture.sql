-- Sweetwater inquiries are separate from farm profiles and marketing campaigns.
-- Email remains the profile identity key; phone-only inquiries have no profile.
CREATE TABLE IF NOT EXISTS public.sweetwater_inquiries (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id uuid NOT NULL UNIQUE,
  profile_id uuid REFERENCES public.profiles(id),
  category text NOT NULL DEFAULT 'sweetwater-technology' CHECK (category = 'sweetwater-technology'),
  intent text NOT NULL CHECK (intent IN ('ai-help','app-idea','greenhouse-interest','legacy-card')),
  source text NOT NULL,
  entry_page text NOT NULL,
  name text NOT NULL,
  email text,
  phone text,
  contact_method text NOT NULL CHECK (contact_method IN ('email','callback')),
  context jsonb NOT NULL DEFAULT '{}',
  messages jsonb NOT NULL DEFAULT '[]',
  consent jsonb NOT NULL DEFAULT '{}',
  request_payload jsonb NOT NULL,
  is_test boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','closed')),
  notes text NOT NULL DEFAULT '',
  notification_status text NOT NULL DEFAULT 'pending' CHECK (notification_status IN ('pending','sending','sent','failed')),
  notification_attempts integer NOT NULL DEFAULT 0,
  notification_next_at timestamptz NOT NULL DEFAULT now(),
  notification_message_id text,
  notification_error text,
  notified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (email IS NOT NULL OR phone IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS sweetwater_inquiries_created_idx ON public.sweetwater_inquiries (created_at DESC);
CREATE INDEX IF NOT EXISTS sweetwater_inquiries_notifications_idx ON public.sweetwater_inquiries (notification_next_at) WHERE notification_status IN ('pending','sending');
CREATE INDEX IF NOT EXISTS sweetwater_inquiries_profile_idx ON public.sweetwater_inquiries (profile_id);
ALTER TABLE public.sweetwater_inquiries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sweetwater_inquiries FROM anon, authenticated;
GRANT SELECT ON public.sweetwater_inquiries TO authenticated;
GRANT UPDATE (status,notes,updated_at) ON public.sweetwater_inquiries TO authenticated;
GRANT ALL ON public.sweetwater_inquiries TO service_role;
DROP POLICY IF EXISTS sweetwater_admin_read ON public.sweetwater_inquiries;
CREATE POLICY sweetwater_admin_read ON public.sweetwater_inquiries FOR SELECT TO authenticated USING ((SELECT public.is_trellis_admin()));
DROP POLICY IF EXISTS sweetwater_admin_update ON public.sweetwater_inquiries;
CREATE POLICY sweetwater_admin_update ON public.sweetwater_inquiries FOR UPDATE TO authenticated USING ((SELECT public.is_trellis_admin())) WITH CHECK ((SELECT public.is_trellis_admin()));
DROP POLICY IF EXISTS sweetwater_service_access ON public.sweetwater_inquiries;
CREATE POLICY sweetwater_service_access ON public.sweetwater_inquiries FOR ALL TO service_role USING (true) WITH CHECK (true);

INSERT INTO public.branches (name,slug,website_url,contact_email,description)
VALUES ('Sweetwater Technology','sweetwater-technology','https://sweetwater.technology','clint@sweetwater.technology','Software, practical AI and greenhouse business-event inquiries. Separate from farm customers.')
ON CONFLICT (slug) DO NOTHING;

CREATE OR REPLACE FUNCTION public.capture_sweetwater_inquiry(p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  rid uuid;
  existing public.sweetwater_inquiries;
  inquiry public.sweetwater_inquiries;
  mail text := nullif(lower(btrim(p_payload #>> '{contact,email}')), '');
  tel text := nullif(btrim(p_payload #>> '{contact,phone}'), '');
  person text := btrim(p_payload #>> '{contact,name}');
  purpose text := p_payload->>'intent';
  method text := p_payload->>'contactMethod';
  ctx jsonb := coalesce(p_payload->'context','{}');
  transcript jsonb := coalesce(p_payload->'messages','[]');
  consent_value jsonb := coalesce(p_payload->'consent','{}');
  profile uuid;
  identity_count integer;
  context_key text;
  entry text;
  turn jsonb;
BEGIN
  IF jsonb_typeof(p_payload) <> 'object' OR octet_length(p_payload::text) > 100000 THEN RAISE EXCEPTION 'Invalid inquiry'; END IF;
  rid := (p_payload->>'requestId')::uuid;
  IF rid IS NULL THEN RAISE EXCEPTION 'Request ID required'; END IF;
  -- Serialize retries, including concurrent first submissions.
  PERFORM pg_advisory_xact_lock(hashtextextended(rid::text,0));
  SELECT * INTO existing FROM public.sweetwater_inquiries WHERE request_id=rid;
  IF FOUND THEN
    IF existing.request_payload <> p_payload THEN RAISE EXCEPTION 'Request ID already used for different details'; END IF;
    RETURN jsonb_build_object('accepted',true,'requestId',rid);
  END IF;
  IF purpose NOT IN ('ai-help','app-idea','greenhouse-interest','legacy-card') OR purpose IS NULL THEN RAISE EXCEPTION 'Invalid intent'; END IF;
  IF person IS NULL OR length(person) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Name required'; END IF;
  IF mail IS NOT NULL AND (length(mail)>254 OR mail !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') THEN RAISE EXCEPTION 'Invalid email'; END IF;
  IF tel IS NOT NULL AND (length(tel)>30 OR tel !~ '^\+?[0-9 ().-]+$' OR length(regexp_replace(tel,'[^0-9]','','g')) NOT BETWEEN 7 AND 15) THEN RAISE EXCEPTION 'Invalid phone'; END IF;
  IF mail IS NULL AND tel IS NULL THEN RAISE EXCEPTION 'Contact method required'; END IF;
  IF purpose='greenhouse-interest' THEN
    method := 'callback';
    ctx := jsonb_build_object('business',p_payload->>'business','task',p_payload->>'task');
    IF p_payload->>'event' IS DISTINCT FROM 'interest_registration' OR tel IS NULL OR length(btrim(coalesce(p_payload->>'business',''))) NOT BETWEEN 1 AND 180 OR consent_value->>'eventFollowUp' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Invalid event interest'; END IF;
    IF consent_value->>'marketing' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Event interest is not marketing consent'; END IF;
    entry := '/ai-after-hours';
  ELSE
    IF p_payload->>'event' IS DISTINCT FROM 'intro_contact_request' THEN RAISE EXCEPTION 'Invalid event'; END IF;
    IF method IS NULL OR method NOT IN ('email','callback') OR (method='email' AND mail IS NULL) OR (method='callback' AND tel IS NULL) THEN RAISE EXCEPTION 'Invalid preferred contact method'; END IF;
    entry := CASE purpose WHEN 'legacy-card' THEN '/card' ELSE '/'||purpose END;
    FOREACH context_key IN ARRAY CASE purpose WHEN 'ai-help' THEN ARRAY['business','task','result'] WHEN 'app-idea' THEN ARRAY['idea','audience','problem','firstVersion'] ELSE ARRAY['summary'] END LOOP
      IF jsonb_typeof(ctx->context_key) IS DISTINCT FROM 'string' OR length(btrim(ctx->>context_key)) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Missing or invalid context'; END IF;
    END LOOP;
  END IF;
  IF jsonb_typeof(ctx) <> 'object' OR jsonb_typeof(transcript) <> 'array' OR jsonb_array_length(transcript)>60 OR jsonb_typeof(consent_value) <> 'object' OR jsonb_typeof(consent_value->'marketing') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid inquiry details'; END IF;
  FOR turn IN SELECT value FROM jsonb_array_elements(transcript) LOOP
    IF turn->>'role' IS NULL OR turn->>'role' NOT IN ('user','assistant') OR jsonb_typeof(turn->'content') IS DISTINCT FROM 'string' OR length(turn->>'content') NOT BETWEEN 1 AND 4000 THEN RAISE EXCEPTION 'Invalid conversation'; END IF;
  END LOOP;
  IF length(coalesce(p_payload->>'source','direct'))>120 THEN RAISE EXCEPTION 'Invalid source'; END IF;
  -- Bound abuse without depending on a spoofable visitor-supplied IP address.
  PERFORM pg_advisory_xact_lock(hashtextextended(coalesce(mail,tel),1));
  IF (SELECT count(*) FROM public.sweetwater_inquiries WHERE created_at>now()-interval '1 hour' AND (email=mail OR phone=tel))>=5 THEN RAISE EXCEPTION 'Too many inquiries; please try later'; END IF;
  IF mail IS NOT NULL THEN
    SELECT count(*), (array_agg(id))[1] INTO identity_count,profile FROM public.profiles WHERE lower(email)=mail;
    IF identity_count>1 THEN RAISE EXCEPTION 'Contact identity requires review'; END IF;
    IF profile IS NULL THEN
      INSERT INTO public.profiles (email,first_name,phone,branches,is_subscribed,branch_consent)
      VALUES (mail,person,tel,'["sweetwater-technology"]',(consent_value->>'marketing')::boolean,jsonb_build_object('sweetwater-technology',(consent_value->>'marketing')::boolean))
      ON CONFLICT (email) DO NOTHING RETURNING id INTO profile;
      IF profile IS NULL THEN SELECT id INTO profile FROM public.profiles WHERE email=mail; END IF;
    END IF;
    -- Preserve existing names, phone numbers, branches and all global consent flags.
    UPDATE public.profiles SET branches=CASE WHEN coalesce(branches,'[]') @> '["sweetwater-technology"]' THEN branches ELSE coalesce(branches,'[]') || '["sweetwater-technology"]' END WHERE id=profile;
  END IF;
  INSERT INTO public.sweetwater_inquiries (request_id,profile_id,intent,source,entry_page,name,email,phone,contact_method,context,messages,consent,request_payload,is_test)
  VALUES (rid,profile,purpose,coalesce(nullif(p_payload->>'source',''),'direct'),entry,person,mail,tel,method,ctx,transcript,consent_value,p_payload,coalesce((p_payload->>'testMode')::boolean,false)) RETURNING * INTO inquiry;
  RETURN jsonb_build_object('accepted',true,'requestId',inquiry.request_id);
END;
$$;
REVOKE ALL ON FUNCTION public.capture_sweetwater_inquiry(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.capture_sweetwater_inquiry(jsonb) TO service_role;

-- The queue is in the inquiry row, committed atomically with the saved lead.
CREATE OR REPLACE FUNCTION public.claim_sweetwater_notification()
RETURNS SETOF public.sweetwater_inquiries LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE selected_id uuid;
BEGIN
  UPDATE public.sweetwater_inquiries SET notification_status='failed',notification_error='Retry window expired; review manually' WHERE notification_status IN ('pending','sending') AND created_at<now()-interval '23 hours';
  SELECT id INTO selected_id FROM public.sweetwater_inquiries WHERE notification_status IN ('pending','sending') AND notification_next_at<=now() AND notification_attempts<8 ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1;
  IF selected_id IS NULL THEN RETURN; END IF;
  RETURN QUERY UPDATE public.sweetwater_inquiries SET notification_status='sending',notification_attempts=notification_attempts+1,notification_next_at=now()+interval '2 minutes' WHERE id=selected_id RETURNING *;
END;
$$;
CREATE OR REPLACE FUNCTION public.finish_sweetwater_notification(p_id uuid,p_message_id text DEFAULT NULL,p_error text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  UPDATE public.sweetwater_inquiries SET
    notification_status=CASE WHEN nullif(p_message_id,'') IS NOT NULL THEN 'sent' WHEN notification_attempts>=8 THEN 'failed' ELSE 'pending' END,
    notification_message_id=nullif(p_message_id,''),
    notification_error=left(p_error,500),
    notification_next_at=now()+interval '5 minutes',
    notified_at=CASE WHEN nullif(p_message_id,'') IS NOT NULL THEN now() ELSE NULL END
  WHERE id=p_id AND notification_status='sending';
END;
$$;
REVOKE ALL ON FUNCTION public.claim_sweetwater_notification() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.finish_sweetwater_notification(uuid,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_sweetwater_notification() TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_sweetwater_notification(uuid,text,text) TO service_role;
