-- Private Slack orchestration. No browser access and no spoke/profile writes.
CREATE TABLE IF NOT EXISTS public.project_room_slack_config (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 channel TEXT NOT NULL UNIQUE,
 enabled BOOLEAN NOT NULL DEFAULT false,
 identities JSONB NOT NULL,
 allowed_bots JSONB NOT NULL DEFAULT '[]',
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_room_slack_identities ON public.project_room_slack_config USING gin(identities jsonb_path_ops);
CREATE INDEX IF NOT EXISTS project_room_slack_bots ON public.project_room_slack_config USING gin(allowed_bots jsonb_path_ops);
CREATE TABLE IF NOT EXISTS public.project_room_slack_snapshots (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4() REFERENCES public.project_rooms(id) ON DELETE CASCADE,
 fingerprint TEXT NOT NULL,
 updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.project_room_slack_messages (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 dedupe_key TEXT NOT NULL UNIQUE,
 channel TEXT NOT NULL REFERENCES public.project_room_slack_config(channel),
 room_id UUID REFERENCES public.project_rooms(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN ('proposal','digest','note')),
 text TEXT NOT NULL CHECK(length(text) BETWEEN 1 AND 12000),
 thread_ts TEXT,
 delivery_ts TEXT,
 reply_after TEXT,
 reply_cursor TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','sent','held','cancelled')),
 attempted_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS project_room_slack_delivery ON public.project_room_slack_messages(channel,delivery_ts) WHERE delivery_ts IS NOT NULL;
CREATE INDEX IF NOT EXISTS project_room_slack_pending ON public.project_room_slack_messages(status,created_at);
CREATE TABLE IF NOT EXISTS public.project_room_slack_receipts (
 id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
 channel TEXT NOT NULL,
 message_ts TEXT NOT NULL,
 room_id UUID NOT NULL REFERENCES public.project_rooms(id) ON DELETE CASCADE,
 actor UUID NOT NULL REFERENCES auth.users(id),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(channel,message_ts)
);
ALTER TABLE public.project_room_slack_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_room_slack_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_room_slack_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_room_slack_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_room_slack_config,public.project_room_slack_snapshots,public.project_room_slack_messages,public.project_room_slack_receipts FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.project_room_slack_config,public.project_room_slack_snapshots,public.project_room_slack_messages,public.project_room_slack_receipts TO service_role;

-- Existing n8n Supabase credential may be a modern secret key or a legacy key.
-- Only service_role may call this probe; no browser JWT is accepted by the bridge.
CREATE OR REPLACE FUNCTION public.project_room_slack_service_check()
RETURNS BOOLEAN LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT true $$;
REVOKE ALL ON FUNCTION public.project_room_slack_service_check() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.project_room_slack_service_check() TO service_role;

CREATE OR REPLACE FUNCTION public.project_room_slack_room_allowed(p_channel TEXT,p_room UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.project_room_slack_config c
 JOIN public.project_rooms r ON r.id=p_room
 JOIN public.project_room_clients client ON client.id=r.client_id
 WHERE c.channel=p_channel AND c.enabled AND r.kind='client' AND r.status<>'cancelled' AND client.archived_at IS NULL
 AND r.title !~* '^TEST' AND jsonb_typeof(c.identities)='object' AND c.identities<>'{}'::jsonb
 AND NOT EXISTS(SELECT 1 FROM jsonb_each_text(c.identities) a
 WHERE NOT EXISTS(SELECT 1 FROM public.project_room_members m JOIN public.trellis_users u ON u.auth_user_id=m.user_id
 WHERE m.room_id=r.id AND m.user_id=a.value::uuid AND u.status='active' AND u.role IN ('owner','admin','operator'))));
$$;
REVOKE ALL ON FUNCTION public.project_room_slack_room_allowed(TEXT,UUID) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.project_room_slack_room_allowed(TEXT,UUID) TO service_role;

-- Claim once. Ambiguous network failures are held for reconciliation, never
-- blindly resent. Polling thread replies is repeatable and does not use a lease.
CREATE OR REPLACE FUNCTION public.claim_project_room_slack_messages(p_channel TEXT)
RETURNS SETOF public.project_room_slack_messages LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 UPDATE public.project_room_slack_messages m SET status='sending',attempted_at=now()
 WHERE m.id IN (SELECT q.id FROM public.project_room_slack_messages q
 WHERE q.channel=p_channel AND q.status='pending'
 AND EXISTS(SELECT 1 FROM public.project_room_slack_config c WHERE c.channel=p_channel AND c.enabled)
 AND (q.room_id IS NULL OR public.project_room_slack_room_allowed(p_channel,q.room_id))
 ORDER BY q.created_at LIMIT 10 FOR UPDATE SKIP LOCKED) RETURNING m.*;
$$;
REVOKE ALL ON FUNCTION public.claim_project_room_slack_messages(TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_project_room_slack_messages(TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.save_project_room_slack_note(p_channel TEXT,p_thread TEXT,p_ts TEXT,p_user TEXT,p_text TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE rid UUID; actor_id UUID; r public.project_rooms; note JSONB; kept JSONB;
BEGIN
 IF p_ts !~ '^[0-9]{10,}\.[0-9]{6}$' OR p_ts=p_thread OR length(trim(p_text)) NOT BETWEEN 1 AND 6000 THEN RETURN 'invalid'; END IF;
 SELECT room_id INTO rid FROM public.project_room_slack_messages
 WHERE channel=p_channel AND delivery_ts=p_thread AND kind='proposal' AND status='sent';
 IF rid IS NULL THEN RETURN 'unmapped'; END IF;
 SELECT (identities->>p_user)::uuid INTO actor_id FROM public.project_room_slack_config WHERE channel=p_channel AND enabled;
 IF actor_id IS NULL OR NOT public.project_room_slack_room_allowed(p_channel,rid) THEN RETURN 'denied'; END IF;
 SELECT * INTO r FROM public.project_rooms WHERE id=rid FOR UPDATE;
 IF NOT public.project_room_slack_room_allowed(p_channel,rid) THEN RETURN 'denied'; END IF;
 IF r.locked_until>now() THEN RETURN 'busy'; END IF;
 INSERT INTO public.project_room_slack_receipts(channel,message_ts,room_id,actor)
 VALUES(p_channel,p_ts,rid,actor_id) ON CONFLICT(channel,message_ts) DO NOTHING;
 IF NOT FOUND THEN RETURN 'duplicate'; END IF;
 note=jsonb_build_object('text',p_text,'at',now(),'actor',actor_id,'source','slack','slack_channel',p_channel,'slack_ts',p_ts,'slack_user',p_user);
 SELECT coalesce(jsonb_agg(x.value ORDER BY x.ord),'[]') INTO kept
 FROM jsonb_array_elements(coalesce(r.state->'notes','[]')) WITH ORDINALITY x(value,ord)
 WHERE x.ord>greatest(jsonb_array_length(coalesce(r.state->'notes','[]'))-49,0);
 UPDATE public.project_rooms SET state=jsonb_set(r.state,'{notes}',kept||jsonb_build_array(note)),version=version+1,updated_at=now() WHERE id=rid;
 INSERT INTO public.project_room_slack_messages(dedupe_key,channel,room_id,kind,text,thread_ts)
 VALUES('note:'||p_channel||':'||p_ts,p_channel,rid,'note','Saved your reply as a note in this Trellis room. The proposal remains unchanged.',p_thread)
 ON CONFLICT(dedupe_key) DO NOTHING;
 RETURN 'saved';
END $$;
REVOKE ALL ON FUNCTION public.save_project_room_slack_note(TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_project_room_slack_note(TEXT,TEXT,TEXT,TEXT,TEXT) TO service_role;
