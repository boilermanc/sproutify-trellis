-- Integration tests. Every synthetic record is rolled back; no mail is sent.
BEGIN;
DO $$
DECLARE
  payload jsonb;
  acknowledgement jsonb;
  request uuid := gen_random_uuid();
  row_data public.sweetwater_inquiries;
  customer uuid;
BEGIN
  INSERT INTO public.profiles (email,first_name,phone,branches,is_subscribed,marketing_pause,branch_consent)
  VALUES ('sweetwater-regression@example.invalid','Existing name','2025550198','["farm-existing"]',false,true,'{"farm-existing":false}') RETURNING id INTO customer;
  payload := jsonb_build_object('requestId',request,'event','intro_contact_request','intent','ai-help','source','release-test','contactMethod','email','contact',jsonb_build_object('name','Sweetwater TEST','email','sweetwater-regression@example.invalid'),'context',jsonb_build_object('business','TEST repair shop','task','TEST quotes','result','Less repeated typing'),'consent',jsonb_build_object('marketing',false),'testMode',true);
  acknowledgement := public.capture_sweetwater_inquiry(payload);
  IF acknowledgement->>'accepted'<>'true' OR acknowledgement->>'requestId'<>request::text THEN RAISE EXCEPTION 'Wrong acknowledgement'; END IF;
  PERFORM public.capture_sweetwater_inquiry(payload);
  IF (SELECT count(*) FROM public.sweetwater_inquiries WHERE request_id=request)<>1 THEN RAISE EXCEPTION 'Duplicate capture'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=customer AND first_name='Existing name' AND phone='2025550198' AND branches @> '["farm-existing","sweetwater-technology"]' AND NOT is_subscribed AND marketing_pause AND branch_consent='{"farm-existing":false}') THEN RAISE EXCEPTION 'Existing customer changed'; END IF;
  BEGIN
    PERFORM public.capture_sweetwater_inquiry(payload || '{"source":"changed"}');
    RAISE EXCEPTION 'Expected idempotency conflict' USING ERRCODE='ZX001';
  EXCEPTION WHEN raise_exception THEN NULL; END;
  payload := jsonb_build_object('requestId',gen_random_uuid(),'event','interest_registration','intent','greenhouse-interest','source','release-test','contact',jsonb_build_object('name','Phone-only TEST','phone','2025550199'),'business','TEST business','consent',jsonb_build_object('eventFollowUp',true,'marketing',false),'testMode',true);
  PERFORM public.capture_sweetwater_inquiry(payload);
  SELECT * INTO row_data FROM public.sweetwater_inquiries WHERE request_id=(payload->>'requestId')::uuid;
  IF row_data.profile_id IS NOT NULL OR row_data.email IS NOT NULL OR row_data.entry_page<>'/ai-after-hours' THEN RAISE EXCEPTION 'Phone-only capture fabricated identity'; END IF;
  payload := jsonb_build_object('requestId',gen_random_uuid(),'event','intro_contact_request','intent','app-idea','source','release-test','contactMethod','callback','contact',jsonb_build_object('name','App TEST','phone','2025550199'),'context',jsonb_build_object('idea','A list','audience','Makers','problem','Sharing','firstVersion','Shared list'),'messages',jsonb_build_array(jsonb_build_object('role','user','content','TEST idea')),'consent',jsonb_build_object('marketing',false),'testMode',true);
  PERFORM public.capture_sweetwater_inquiry(payload);
  IF NOT EXISTS (SELECT 1 FROM public.sweetwater_inquiries WHERE request_id=(payload->>'requestId')::uuid AND entry_page='/app-idea' AND notification_status='pending' AND messages->0->>'content'='TEST idea') THEN RAISE EXCEPTION 'App context missing'; END IF;
  BEGIN
    PERFORM public.capture_sweetwater_inquiry((payload || jsonb_build_object('requestId',gen_random_uuid())) - 'context');
    RAISE EXCEPTION 'Expected context rejection' USING ERRCODE='ZX001';
  EXCEPTION WHEN raise_exception THEN NULL; END;
  SELECT * INTO row_data FROM public.claim_sweetwater_notification();
  IF row_data.notification_status<>'sending' OR row_data.notification_attempts<>1 THEN RAISE EXCEPTION 'Claim failed'; END IF;
  PERFORM public.finish_sweetwater_notification(row_data.id,NULL,'TEST transient failure');
  IF NOT EXISTS (SELECT 1 FROM public.sweetwater_inquiries WHERE id=row_data.id AND notification_status='pending' AND notification_error='TEST transient failure') THEN RAISE EXCEPTION 'Retry was not retained'; END IF;
  UPDATE public.sweetwater_inquiries SET notification_next_at=now() WHERE id=row_data.id;
  SELECT * INTO row_data FROM public.claim_sweetwater_notification();
  PERFORM public.finish_sweetwater_notification(row_data.id,'TEST-provider-id',NULL);
  IF NOT EXISTS (SELECT 1 FROM public.sweetwater_inquiries WHERE id=row_data.id AND notification_status='sent' AND notified_at IS NOT NULL) THEN RAISE EXCEPTION 'Completion failed'; END IF;
  IF has_function_privilege('anon','public.capture_sweetwater_inquiry(jsonb)','EXECUTE') OR has_function_privilege('authenticated','public.claim_sweetwater_notification()','EXECUTE') THEN RAISE EXCEPTION 'Public service access'; END IF;
  IF has_table_privilege('anon','public.sweetwater_inquiries','SELECT') OR has_column_privilege('authenticated','public.sweetwater_inquiries','notification_status','UPDATE') THEN RAISE EXCEPTION 'Overbroad table access'; END IF;
END;
$$;
ROLLBACK;
