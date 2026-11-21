-- Consulting CRM records are intentionally separate from federated marketing profiles.
ALTER TABLE public.project_room_clients ADD COLUMN IF NOT EXISTS contacts JSONB NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(contacts)='array' AND jsonb_array_length(contacts)<=30);
CREATE INDEX IF NOT EXISTS project_room_clients_contacts ON public.project_room_clients USING gin(contacts jsonb_path_ops);

CREATE OR REPLACE FUNCTION public.save_project_room_contacts(p_actor UUID,p_client UUID,p_version INTEGER,p_contacts JSONB)
RETURNS SETOF public.project_room_clients LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.trellis_users WHERE auth_user_id=p_actor AND status='active' AND role IN ('owner','admin','operator')) THEN RAISE EXCEPTION 'Not authorized'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.project_rooms r JOIN public.project_room_members m ON m.room_id=r.id WHERE r.client_id=p_client AND m.user_id=p_actor) THEN RAISE EXCEPTION 'Client not found'; END IF;
 IF jsonb_typeof(p_contacts) IS DISTINCT FROM 'array' OR jsonb_array_length(p_contacts)>30 THEN RAISE EXCEPTION 'Invalid contacts'; END IF;
 RETURN QUERY UPDATE public.project_room_clients SET contacts=p_contacts,version=version+1,updated_at=now()
 WHERE id=p_client AND version=p_version RETURNING *;
 IF NOT FOUND THEN RAISE EXCEPTION 'Company changed. Refresh and try again.'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.save_project_room_contacts(UUID,UUID,INTEGER,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_project_room_contacts(UUID,UUID,INTEGER,JSONB) TO service_role;

CREATE TABLE IF NOT EXISTS public.project_room_files (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 room_id UUID NOT NULL REFERENCES public.project_rooms(id),
 created_by UUID NOT NULL REFERENCES auth.users(id),
 path TEXT NOT NULL UNIQUE,
 name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 180),
 size BIGINT NOT NULL CHECK(size BETWEEN 1 AND 20971520),
 mime_type TEXT NOT NULL,
 category TEXT NOT NULL CHECK(category IN ('proposal','contract','other')),
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','ready')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), uploaded_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS project_room_files_room ON public.project_room_files(room_id,created_at DESC);
ALTER TABLE public.project_room_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_room_files FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_room_files FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.project_room_files TO service_role;
-- No browser storage policies: only the verified service proxy issues signed capabilities.
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
VALUES('project-room-files','project-room-files',false,20971520,ARRAY[
 'application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
 'application/msword','text/plain','text/markdown','image/png','image/jpeg'
]) ON CONFLICT(id) DO UPDATE SET public=false,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;
