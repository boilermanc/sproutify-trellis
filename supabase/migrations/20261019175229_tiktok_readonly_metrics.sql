-- Read-only with respect to TikTok. Reporting tables are never publishing jobs.
CREATE TABLE IF NOT EXISTS public.tiktok_metric_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id UUID NOT NULL REFERENCES public.branches(id),
  credential_id UUID NOT NULL REFERENCES public.social_credentials(id),
  account_id TEXT NOT NULL,
  video_id TEXT NOT NULL UNIQUE CHECK (video_id ~ '^[0-9]{15,25}$'),
  share_url TEXT,
  caption TEXT NOT NULL DEFAULT '',
  published_at TIMESTAMPTZ,
  views BIGINT CHECK (views >= 0),
  likes BIGINT CHECK (likes >= 0),
  comments BIGINT CHECK (comments >= 0),
  shares BIGINT CHECK (shares >= 0),
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tiktok_metrics_branch ON public.tiktok_metric_posts(branch_id, published_at DESC);
CREATE TABLE IF NOT EXISTS public.tiktok_metric_daily (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES public.tiktok_metric_posts(id),
  captured_on DATE NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  views BIGINT CHECK (views >= 0),
  likes BIGINT CHECK (likes >= 0),
  comments BIGINT CHECK (comments >= 0),
  shares BIGINT CHECK (shares >= 0),
  UNIQUE(post_id, captured_on)
);
ALTER TABLE public.tiktok_metric_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tiktok_metric_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tiktok_metric_posts, public.tiktok_metric_daily FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.tiktok_metric_posts, public.tiktok_metric_daily TO service_role;
DROP POLICY IF EXISTS tiktok_metrics_service ON public.tiktok_metric_posts;
CREATE POLICY tiktok_metrics_service ON public.tiktok_metric_posts FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS tiktok_daily_service ON public.tiktok_metric_daily;
CREATE POLICY tiktok_daily_service ON public.tiktok_metric_daily FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Atomically update latest totals and today's snapshot; repeats do not double-count.
CREATE OR REPLACE FUNCTION public.record_tiktok_metrics(
  p_post_id UUID, p_caption TEXT, p_published_at TIMESTAMPTZ, p_share_url TEXT,
  p_views BIGINT, p_likes BIGINT, p_comments BIGINT, p_shares BIGINT
) RETURNS VOID LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  UPDATE public.tiktok_metric_posts SET caption = p_caption, published_at = p_published_at, share_url = p_share_url,
    views = p_views, likes = p_likes, comments = p_comments, shares = p_shares,
    last_synced_at = now(), last_error = NULL WHERE id = p_post_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tracked post not found'; END IF;
  INSERT INTO public.tiktok_metric_daily(post_id,captured_on,fetched_at,views,likes,comments,shares)
    VALUES (p_post_id,(now() AT TIME ZONE 'UTC')::date,now(),p_views,p_likes,p_comments,p_shares)
    ON CONFLICT (post_id,captured_on) DO UPDATE SET fetched_at=EXCLUDED.fetched_at,
      views=EXCLUDED.views,likes=EXCLUDED.likes,comments=EXCLUDED.comments,shares=EXCLUDED.shares;
END;
$$;
REVOKE ALL ON FUNCTION public.record_tiktok_metrics(UUID,TEXT,TIMESTAMPTZ,TEXT,BIGINT,BIGINT,BIGINT,BIGINT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_tiktok_metrics(UUID,TEXT,TIMESTAMPTZ,TEXT,BIGINT,BIGINT,BIGINT,BIGINT) TO service_role;
