-- Internal consulting clients are separate from federated marketing profiles.
CREATE TABLE IF NOT EXISTS public.project_room_clients (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 created_by UUID NOT NULL REFERENCES auth.users(id),
 name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 140),
 website TEXT,
 status TEXT NOT NULL DEFAULT 'prospect' CHECK(status IN ('prospect','customer')),
 archived_at TIMESTAMPTZ, archive_reason TEXT,
 follow_up_date DATE, follow_up_note TEXT,
 version INTEGER NOT NULL DEFAULT 1,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.project_rooms ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES public.project_room_clients(id);
CREATE INDEX IF NOT EXISTS project_rooms_client ON public.project_rooms(client_id);
CREATE INDEX IF NOT EXISTS project_room_clients_followup ON public.project_room_clients(follow_up_date) WHERE follow_up_date IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.project_room_members (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 room_id UUID NOT NULL REFERENCES public.project_rooms(id) ON DELETE CASCADE,
 user_id UUID NOT NULL REFERENCES auth.users(id),
 role TEXT NOT NULL CHECK(role IN ('owner','member')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(room_id,user_id)
);
CREATE INDEX IF NOT EXISTS project_room_members_user ON public.project_room_members(user_id,room_id);
ALTER TABLE public.project_room_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_room_clients FORCE ROW LEVEL SECURITY;
ALTER TABLE public.project_room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_room_members FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_room_clients, public.project_room_members FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.project_room_clients, public.project_room_members TO service_role;
INSERT INTO public.project_room_members(room_id,user_id,role)
 SELECT id,created_by,'owner' FROM public.project_rooms ON CONFLICT(room_id,user_id) DO NOTHING;
-- Preserve each existing client room independently. Never merge similar names.
DO $$ DECLARE r record; cid uuid; BEGIN
 FOR r IN SELECT id,title,created_by,state FROM public.project_rooms WHERE kind='client' AND client_id IS NULL FOR UPDATE LOOP
  INSERT INTO public.project_room_clients(name,created_by,website) VALUES(r.title,r.created_by,r.state->'intake'->>'website') RETURNING id INTO cid;
  UPDATE public.project_rooms SET client_id=cid WHERE id=r.id;
 END LOOP;
END $$;

-- These RPCs are callable only by the authenticated service proxy, with a verified actor.
CREATE OR REPLACE FUNCTION public.create_shared_project_room(p_actor UUID,p_room JSONB,p_client UUID DEFAULT NULL)
RETURNS SETOF public.project_rooms LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE cid uuid; rid uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.trellis_users WHERE auth_user_id=p_actor AND status='active' AND role IN ('owner','admin','operator')) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF p_room->>'kind'='client' THEN
  IF p_client IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM public.project_rooms r JOIN public.project_room_members m ON m.room_id=r.id WHERE r.client_id=p_client AND m.user_id=p_actor) THEN RAISE EXCEPTION 'Client not found'; END IF;
   IF EXISTS(SELECT 1 FROM public.project_room_clients WHERE id=p_client AND archived_at IS NOT NULL) THEN RAISE EXCEPTION 'Restore this prospect before adding a briefing'; END IF;
   cid:=p_client;
  ELSE
   INSERT INTO public.project_room_clients(created_by,name,website) VALUES(p_actor,p_room->>'title',p_room->'state'->'intake'->>'website') RETURNING id INTO cid;
  END IF;
 ELSIF p_client IS NOT NULL THEN RAISE EXCEPTION 'Only company briefings can link to a prospect';
 END IF;
 INSERT INTO public.project_rooms(created_by,client_id,title,kind,brief,status,state)
 VALUES(p_actor,cid,p_room->>'title',p_room->>'kind',p_room->>'brief','draft',p_room->'state') RETURNING id INTO rid;
 INSERT INTO public.project_room_members(room_id,user_id,role) VALUES(rid,p_actor,'owner');
 RETURN QUERY SELECT * FROM public.project_rooms WHERE id=rid;
END $$;
REVOKE ALL ON FUNCTION public.create_shared_project_room(UUID,JSONB,UUID) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.create_shared_project_room(UUID,JSONB,UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.change_project_room_member(p_actor UUID,p_room UUID,p_version INTEGER,p_user UUID,p_remove BOOLEAN)
RETURNS SETOF public.project_rooms LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r public.project_rooms;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.trellis_users WHERE auth_user_id=p_actor AND status='active' AND role IN ('owner','admin','operator')) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 SELECT * INTO r FROM public.project_rooms WHERE id=p_room FOR UPDATE;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM public.project_room_members WHERE room_id=p_room AND user_id=p_actor AND role='owner') THEN RAISE EXCEPTION 'Only the room owner can change sharing'; END IF;
 IF r.version<>p_version THEN RAISE EXCEPTION 'Room changed. Refresh and try again.'; END IF;
 IF r.locked_until>now() THEN RAISE EXCEPTION 'Wait for the current research step before changing sharing'; END IF;
 IF p_user=r.created_by OR p_user=p_actor THEN RAISE EXCEPTION 'The room owner must keep access'; END IF;
 IF p_remove THEN
  DELETE FROM public.project_room_members WHERE room_id=p_room AND user_id=p_user AND role='member';
 ELSE
  IF NOT EXISTS(SELECT 1 FROM public.trellis_users WHERE auth_user_id=p_user AND status='active' AND role IN ('owner','admin','operator')) THEN RAISE EXCEPTION 'Choose an active teammate'; END IF;
  INSERT INTO public.project_room_members(room_id,user_id,role) VALUES(p_room,p_user,'member') ON CONFLICT(room_id,user_id) DO NOTHING;
 END IF;
 UPDATE public.project_rooms SET version=version+1,updated_at=now() WHERE id=p_room;
 RETURN QUERY SELECT * FROM public.project_rooms WHERE id=p_room;
END $$;
REVOKE ALL ON FUNCTION public.change_project_room_member(UUID,UUID,INTEGER,UUID,BOOLEAN) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.change_project_room_member(UUID,UUID,INTEGER,UUID,BOOLEAN) TO service_role;

CREATE OR REPLACE FUNCTION public.update_project_room_client(p_actor UUID,p_client UUID,p_version INTEGER,p_patch JSONB)
RETURNS SETOF public.project_room_clients LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.trellis_users WHERE auth_user_id=p_actor AND status='active' AND role IN ('owner','admin','operator')) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.project_rooms r JOIN public.project_room_members m ON m.room_id=r.id WHERE r.client_id=p_client AND m.user_id=p_actor) THEN RAISE EXCEPTION 'Client not found'; END IF;
 RETURN QUERY UPDATE public.project_room_clients SET
  status=CASE WHEN p_patch ? 'status' THEN p_patch->>'status' ELSE status END,
  archived_at=CASE WHEN p_patch ? 'archived' THEN CASE WHEN (p_patch->>'archived')::boolean THEN coalesce(archived_at,now()) ELSE NULL END ELSE archived_at END,
  archive_reason=CASE WHEN p_patch ? 'archive_reason' THEN p_patch->>'archive_reason' ELSE archive_reason END,
  follow_up_date=CASE WHEN p_patch ? 'follow_up_date' THEN (p_patch->>'follow_up_date')::date ELSE follow_up_date END,
  follow_up_note=CASE WHEN p_patch ? 'follow_up_note' THEN p_patch->>'follow_up_note' ELSE follow_up_note END,
  version=version+1,updated_at=now()
 WHERE id=p_client AND version=p_version RETURNING *;
 IF NOT FOUND THEN RAISE EXCEPTION 'Prospect changed. Refresh and try again.'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.update_project_room_client(UUID,UUID,INTEGER,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.update_project_room_client(UUID,UUID,INTEGER,JSONB) TO service_role;

-- Defense in depth if browser SELECT grants are introduced later. Writes remain proxy-only.
DROP POLICY IF EXISTS project_room_member_self ON public.project_room_members;
CREATE POLICY project_room_member_self ON public.project_room_members FOR SELECT TO authenticated USING(user_id=(SELECT auth.uid()));
DROP POLICY IF EXISTS project_room_shared_read ON public.project_rooms;
CREATE POLICY project_room_shared_read ON public.project_rooms FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.project_room_members m WHERE m.room_id=project_rooms.id AND m.user_id=(SELECT auth.uid())));
DROP POLICY IF EXISTS project_room_client_shared_read ON public.project_room_clients;
CREATE POLICY project_room_client_shared_read ON public.project_room_clients FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM public.project_rooms r JOIN public.project_room_members m ON m.room_id=r.id WHERE r.client_id=project_room_clients.id AND m.user_id=(SELECT auth.uid())));
