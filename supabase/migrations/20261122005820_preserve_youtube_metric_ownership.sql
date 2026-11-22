-- Bounded metric refreshes preserve the provenance of the first inserted row.
-- Execute as the caller; only the existing server-side service role may call.
CREATE OR REPLACE FUNCTION public.trellis_upsert_youtube_daily_metrics(p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
  v_row jsonb;
  v_metric public.trellis_youtube_daily_metrics%ROWTYPE;
  v_count integer := 0;
BEGIN
  IF p_rows IS NULL OR pg_catalog.jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'p_rows must be a JSON array' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.jsonb_array_length(p_rows) > 500 THEN
    RAISE EXCEPTION 'At most 500 metric rows are allowed per call' USING ERRCODE = '22023';
  END IF;

  -- Separate upserts within this transaction handle duplicate keys in order:
  -- first insertion chooses provenance, later values refresh metrics only.
  -- ON CONFLICT locks the real unique key, including competing transactions.
  FOR v_row IN SELECT value FROM pg_catalog.jsonb_array_elements(p_rows)
  LOOP
    IF pg_catalog.jsonb_typeof(v_row) <> 'object' THEN
      RAISE EXCEPTION 'Each metric row must be a JSON object' USING ERRCODE = '22023';
    END IF;
    v_metric := pg_catalog.jsonb_populate_record(NULL::public.trellis_youtube_daily_metrics, v_row);
    IF v_metric.youtube_video_id IS NULL OR pg_catalog.btrim(v_metric.youtube_video_id) = ''
      OR v_metric.metric_date IS NULL THEN
      RAISE EXCEPTION 'Each metric row requires youtube_video_id and metric_date' USING ERRCODE = '22023';
    END IF;
    IF (v_metric.episode_id IS NULL) <> (v_metric.publication_id IS NULL)
      OR (v_metric.studio_album_id IS NULL) <> (v_metric.studio_publication_id IS NULL)
      OR (v_metric.episode_id IS NULL) = (v_metric.studio_album_id IS NULL) THEN
      RAISE EXCEPTION 'Each metric row requires one complete episode or studio publication association' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.trellis_youtube_daily_metrics (
      episode_id, publication_id, studio_album_id, studio_publication_id,
      youtube_video_id, metric_date, views, engaged_views,
      estimated_minutes_watched, average_view_duration, average_view_percentage,
      likes, comments, shares, subscribers_gained, subscribers_lost,
      traffic_sources, countries, raw, synced_at
    ) VALUES (
      v_metric.episode_id, v_metric.publication_id,
      v_metric.studio_album_id, v_metric.studio_publication_id,
      v_metric.youtube_video_id, v_metric.metric_date,
      COALESCE(v_metric.views, 0), COALESCE(v_metric.engaged_views, 0),
      COALESCE(v_metric.estimated_minutes_watched, 0), COALESCE(v_metric.average_view_duration, 0),
      COALESCE(v_metric.average_view_percentage, 0), COALESCE(v_metric.likes, 0),
      COALESCE(v_metric.comments, 0), COALESCE(v_metric.shares, 0),
      COALESCE(v_metric.subscribers_gained, 0), COALESCE(v_metric.subscribers_lost, 0),
      COALESCE(v_metric.traffic_sources, '{}'::jsonb), COALESCE(v_metric.countries, '{}'::jsonb),
      COALESCE(v_metric.raw, '{}'::jsonb), COALESCE(v_metric.synced_at, pg_catalog.clock_timestamp())
    )
    ON CONFLICT (youtube_video_id, metric_date) DO UPDATE SET
      views = EXCLUDED.views,
      engaged_views = EXCLUDED.engaged_views,
      estimated_minutes_watched = EXCLUDED.estimated_minutes_watched,
      average_view_duration = EXCLUDED.average_view_duration,
      average_view_percentage = EXCLUDED.average_view_percentage,
      likes = EXCLUDED.likes,
      comments = EXCLUDED.comments,
      shares = EXCLUDED.shares,
      subscribers_gained = EXCLUDED.subscribers_gained,
      subscribers_lost = EXCLUDED.subscribers_lost,
      traffic_sources = EXCLUDED.traffic_sources,
      countries = EXCLUDED.countries,
      raw = EXCLUDED.raw,
      synced_at = EXCLUDED.synced_at;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$;

REVOKE ALL ON FUNCTION public.trellis_upsert_youtube_daily_metrics(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.trellis_upsert_youtube_daily_metrics(jsonb) TO service_role;
