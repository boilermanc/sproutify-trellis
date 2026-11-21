-- Private POC project rooms. Only active Trellis operators may create rooms;
-- every room is owner-only, including when accessed by a service-role proxy.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE SCHEMA IF NOT EXISTS private;
CREATE TABLE IF NOT EXISTS public.project_rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 140),
  kind TEXT NOT NULL CHECK (kind IN ('client','product')),
  brief TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','running','paused','blocked','awaiting_user','cancelled')),
  state JSONB NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  error TEXT,
  lock_token UUID,
  locked_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS project_rooms_owner ON public.project_rooms(created_by, updated_at DESC);
CREATE INDEX IF NOT EXISTS project_rooms_running ON public.project_rooms(updated_at) WHERE status='running';
CREATE INDEX IF NOT EXISTS project_rooms_state ON public.project_rooms USING GIN(state jsonb_path_ops);
ALTER TABLE public.project_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_rooms FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.project_rooms FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.project_rooms TO service_role;
-- All browser reads and writes go through the authenticated owner-checking API.

CREATE TABLE IF NOT EXISTS private.project_room_worker_secret (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id), token TEXT NOT NULL DEFAULT encode(gen_random_bytes(32),'hex')
);
REVOKE ALL ON private.project_room_worker_secret FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;
GRANT SELECT ON private.project_room_worker_secret TO service_role;
INSERT INTO private.project_room_worker_secret(id) VALUES(true) ON CONFLICT(id) DO NOTHING;

-- Atomic lease; an expired lease is never automatically retried after a
-- non-idempotent provider request. The durable reservation blocks the room.
CREATE OR REPLACE FUNCTION public.claim_project_room(p_id UUID, p_token UUID)
RETURNS SETOF public.project_rooms LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  UPDATE public.project_rooms SET lock_token=p_token, locked_until=now()+interval '150 seconds'
  WHERE id=p_id AND status='running' AND (locked_until IS NULL OR locked_until<now())
  RETURNING *;
$$;
REVOKE ALL ON FUNCTION public.claim_project_room(UUID,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_project_room(UUID,UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.check_project_room_worker(p_token TEXT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
  SELECT EXISTS(SELECT 1 FROM private.project_room_worker_secret WHERE token=p_token);
$$;
REVOKE ALL ON FUNCTION public.check_project_room_worker(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_project_room_worker(TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.run_project_rooms_tick()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE worker_token TEXT;
BEGIN
  IF EXISTS(SELECT 1 FROM public.project_rooms WHERE status='running') THEN
    SELECT token INTO worker_token FROM private.project_room_worker_secret WHERE id;
    PERFORM net.http_post(
      url := 'https://horvjqqifgrzxesuxtfm.supabase.co/functions/v1/project-rooms',
      headers := jsonb_build_object('Content-Type','application/json','x-project-room-worker',worker_token),
      body := '{"action":"tick"}'::jsonb, timeout_milliseconds := 10000
    );
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.run_project_rooms_tick() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_project_rooms_tick() TO service_role;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobname='project-rooms-minute') THEN
    PERFORM cron.schedule('project-rooms-minute','* * * * *','SELECT public.run_project_rooms_tick()');
  END IF;
END $$;
