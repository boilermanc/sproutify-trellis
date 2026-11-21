-- Integration regression: all test writes roll back, including room notes.
BEGIN;
DO $$
DECLARE r public.project_rooms; before_proposal JSONB; before_notes INTEGER; result TEXT; n INTEGER;
BEGIN
 SELECT * INTO r FROM public.project_rooms WHERE id='a96d8291-a318-4b35-a375-83c444e264a8' FOR UPDATE;
 IF r.id IS NULL THEN RAISE EXCEPTION 'Shared StyleBAR fixture missing'; END IF;
 before_proposal=r.state->'proposal'; before_notes=jsonb_array_length(r.state->'notes');
 INSERT INTO public.project_room_slack_messages(dedupe_key,channel,room_id,kind,text,status,delivery_ts)
 VALUES('regression:rolled-back','C0C0UUF8P2T',r.id,'proposal','Rolled-back regression','sent','1000000000.000001');
 result=public.save_project_room_slack_note('C0C0UUF8P2T','1000000000.000001','1000000001.000001','UFNPKCQH3','Regression: Clint');
 IF result<>'saved' THEN RAISE EXCEPTION 'Clint routing failed: %',result; END IF;
 result=public.save_project_room_slack_note('C0C0UUF8P2T','1000000000.000001','1000000001.000001','UFNPKCQH3','Duplicate should not save');
 IF result<>'duplicate' THEN RAISE EXCEPTION 'Duplicate protection failed'; END IF;
 result=public.save_project_room_slack_note('C0C0UUF8P2T','1000000000.000001','1000000002.000001','UG70G44NQ','Regression: Sheree');
 IF result<>'saved' THEN RAISE EXCEPTION 'Sheree routing failed: %',result; END IF;
 IF (SELECT state->'proposal' FROM public.project_rooms WHERE id=r.id) IS DISTINCT FROM before_proposal THEN RAISE EXCEPTION 'Proposal was changed'; END IF;
 SELECT count(*) INTO n FROM public.project_room_slack_receipts WHERE message_ts IN ('1000000001.000001','1000000002.000001');
 IF n<>2 THEN RAISE EXCEPTION 'Wrong receipt count'; END IF;
 result=public.save_project_room_slack_note('C0C0UUF8P2T','1000000000.000001','1000000003.000001','UNKNOWN','Must not save');
 IF result<>'denied' THEN RAISE EXCEPTION 'Unknown identity accepted'; END IF;
 UPDATE public.project_rooms SET locked_until=now()+interval '1 minute' WHERE id=r.id;
 result=public.save_project_room_slack_note('C0C0UUF8P2T','1000000000.000001','1000000004.000001','UG70G44NQ','Busy retry');
 IF result<>'busy' THEN RAISE EXCEPTION 'Busy-room protection failed'; END IF;
 UPDATE public.project_rooms SET locked_until=NULL WHERE id=r.id;
 DELETE FROM public.project_room_members WHERE room_id=r.id AND user_id='49e7cdaa-7251-4756-a0f4-fcaf1ae08333';
 result=public.save_project_room_slack_note('C0C0UUF8P2T','1000000000.000001','1000000005.000001','UFNPKCQH3','Revoked audience must not save');
 IF result<>'denied' THEN RAISE EXCEPTION 'Revoked audience accepted'; END IF;
 IF has_function_privilege('anon','public.project_room_slack_service_check()','EXECUTE') OR has_function_privilege('authenticated','public.save_project_room_slack_note(text,text,text,text,text)','EXECUTE') THEN RAISE EXCEPTION 'Public RPC access exposed'; END IF;
END $$;
ROLLBACK;
SELECT 'Clint/Sheree routing, deduplication, busy-room retry, revoked membership, proposal preservation, and RPC access passed; all test writes rolled back' AS result;
