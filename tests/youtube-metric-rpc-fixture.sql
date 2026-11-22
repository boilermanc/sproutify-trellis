-- Disposable PostgreSQL fixture only. Never run this file on a hosted project.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
END $$;

CREATE TABLE public.trellis_metric_rpc_fixture_scope (scope text PRIMARY KEY,released boolean NOT NULL DEFAULT false);
INSERT INTO public.trellis_metric_rpc_fixture_scope(scope) VALUES ('OFFLINE_FIXTURE_ONLY');

CREATE TABLE public.trellis_episodes (id uuid PRIMARY KEY);
CREATE TABLE public.trellis_episode_publications (id uuid PRIMARY KEY);
CREATE TABLE public.studio_albums (id uuid PRIMARY KEY);
CREATE TABLE public.studio_publications (id uuid PRIMARY KEY);
INSERT INTO public.trellis_episodes VALUES ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000005');
INSERT INTO public.trellis_episode_publications VALUES ('00000000-0000-4000-8000-000000000002'),('00000000-0000-4000-8000-000000000006');
INSERT INTO public.studio_albums VALUES ('00000000-0000-4000-8000-000000000003'),('00000000-0000-4000-8000-000000000007');
INSERT INTO public.studio_publications VALUES ('00000000-0000-4000-8000-000000000004'),('00000000-0000-4000-8000-000000000008');

-- Column types/defaults follow SQL_SCHEMA plus the Studio metrics migration.
CREATE TABLE public.trellis_youtube_daily_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  episode_id uuid REFERENCES public.trellis_episodes(id) ON DELETE CASCADE,
  publication_id uuid REFERENCES public.trellis_episode_publications(id) ON DELETE CASCADE,
  youtube_video_id text NOT NULL,
  metric_date date NOT NULL,
  views integer DEFAULT 0,
  engaged_views integer DEFAULT 0,
  estimated_minutes_watched numeric DEFAULT 0,
  average_view_duration numeric DEFAULT 0,
  average_view_percentage numeric DEFAULT 0,
  likes integer DEFAULT 0,
  comments integer DEFAULT 0,
  shares integer DEFAULT 0,
  subscribers_gained integer DEFAULT 0,
  subscribers_lost integer DEFAULT 0,
  traffic_sources jsonb DEFAULT '{}'::jsonb,
  countries jsonb DEFAULT '{}'::jsonb,
  raw jsonb DEFAULT '{}'::jsonb,
  synced_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  studio_album_id uuid REFERENCES public.studio_albums(id) ON DELETE CASCADE,
  studio_publication_id uuid REFERENCES public.studio_publications(id) ON DELETE CASCADE,
  UNIQUE (youtube_video_id,metric_date)
);
ALTER TABLE public.trellis_youtube_daily_metrics ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.trellis_youtube_daily_metrics TO service_role;
REVOKE ALL ON public.trellis_youtube_daily_metrics FROM anon,authenticated;
