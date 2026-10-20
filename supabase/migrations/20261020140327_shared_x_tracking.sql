-- Shared marketing account; never stores spoke customer profiles.
CREATE TABLE IF NOT EXISTS public.x_shared_account (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  handle TEXT NOT NULL UNIQUE DEFAULT 'boilermanc' CHECK (handle = 'boilermanc'),
  platform_user_id TEXT,
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  connected_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,
  posts_cursor JSONB NOT NULL DEFAULT '{}',
  mentions_cursor JSONB NOT NULL DEFAULT '{}',
  lock_id UUID,
  locked_until TIMESTAMPTZ
);
INSERT INTO public.x_shared_account(handle) VALUES ('boilermanc') ON CONFLICT (handle) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.x_oauth_states (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  state_hash TEXT NOT NULL UNIQUE,
  verifier_encrypted TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_x_oauth_expiry ON public.x_oauth_states(expires_at);

CREATE TABLE IF NOT EXISTS public.x_tracked_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id TEXT NOT NULL UNIQUE CHECK (post_id ~ '^[0-9]{1,25}$'),
  account_id TEXT NOT NULL,
  is_own BOOLEAN NOT NULL DEFAULT false,
  is_mention BOOLEAN NOT NULL DEFAULT false,
  text TEXT NOT NULL DEFAULT '',
  published_at TIMESTAMPTZ NOT NULL,
  project_tags JSONB NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(project_tags) = 'array'),
  mention_status TEXT NOT NULL DEFAULT 'new' CHECK (mention_status IN ('new','done')),
  metrics JSONB NOT NULL DEFAULT '{}',
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_x_posts_published ON public.x_tracked_posts(published_at DESC, id);
CREATE INDEX IF NOT EXISTS idx_x_posts_tags ON public.x_tracked_posts USING GIN(project_tags jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_x_posts_refresh ON public.x_tracked_posts(last_checked_at) WHERE is_own;
CREATE TABLE IF NOT EXISTS public.x_post_daily (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES public.x_tracked_posts(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metrics JSONB NOT NULL DEFAULT '{}',
  UNIQUE(post_id, snapshot_date)
);

ALTER TABLE public.x_shared_account ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.x_oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.x_tracked_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.x_post_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.x_shared_account, public.x_oauth_states, public.x_tracked_posts, public.x_post_daily FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.x_shared_account, public.x_oauth_states, public.x_tracked_posts, public.x_post_daily TO service_role;
-- All browser access is mediated by x-tracking and requires an active owner/admin.
DROP POLICY IF EXISTS x_account_service ON public.x_shared_account;
CREATE POLICY x_account_service ON public.x_shared_account TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS x_oauth_service ON public.x_oauth_states;
CREATE POLICY x_oauth_service ON public.x_oauth_states TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS x_posts_service ON public.x_tracked_posts;
CREATE POLICY x_posts_service ON public.x_tracked_posts TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS x_daily_service ON public.x_post_daily;
CREATE POLICY x_daily_service ON public.x_post_daily TO service_role USING (true) WITH CHECK (true);

-- Tags and inbox state are deliberately untouched by collection.
CREATE OR REPLACE FUNCTION public.record_x_post(p_post JSONB, p_mention BOOLEAN DEFAULT false)
RETURNS VOID LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO public.x_tracked_posts(post_id, account_id, is_own, is_mention, text, published_at, metrics)
  VALUES (p_post->>'post_id', p_post->>'account_id', (p_post->>'is_own')::boolean, p_mention,
    p_post->>'text', (p_post->>'published_at')::timestamptz, p_post->'metrics')
  ON CONFLICT (post_id) DO UPDATE SET
    is_mention = x_tracked_posts.is_mention OR excluded.is_mention,
    text = excluded.text, metrics = excluded.metrics, last_synced_at = now(), last_checked_at = now(), last_error = NULL
  RETURNING id INTO v_id;
  INSERT INTO public.x_post_daily(post_id, snapshot_date, metrics)
  VALUES (v_id, (now() AT TIME ZONE 'UTC')::date, p_post->'metrics')
  ON CONFLICT (post_id, snapshot_date) DO UPDATE SET metrics = excluded.metrics, captured_at = now();
END $$;
REVOKE ALL ON FUNCTION public.record_x_post(JSONB, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_x_post(JSONB, BOOLEAN) TO service_role;
