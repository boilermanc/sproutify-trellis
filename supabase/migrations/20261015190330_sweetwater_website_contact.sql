-- Preserve original website contact submissions in the shared inquiry inbox.
ALTER TABLE public.sweetwater_inquiries DROP CONSTRAINT IF EXISTS sweetwater_inquiries_intent_check;
ALTER TABLE public.sweetwater_inquiries ADD CONSTRAINT sweetwater_inquiries_intent_check CHECK (intent IN ('ai-help','app-idea','greenhouse-interest','legacy-card','website-contact'));
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
  IF purpose NOT IN ('ai-help','app-idea','greenhouse-interest','legacy-card','website-contact') OR purpose IS NULL THEN RAISE EXCEPTION 'Invalid intent'; END IF;
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
    entry := CASE purpose WHEN 'legacy-card' THEN '/card' WHEN 'website-contact' THEN '/' ELSE '/'||purpose END;
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
