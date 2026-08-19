-- Count engagement by distinct campaign as well as raw webhook events.
-- Existing columns remain in their original order so CREATE OR REPLACE VIEW
-- can update the view without requiring dependent objects to be dropped.
CREATE OR REPLACE VIEW public.email_engagement_summary
WITH (security_invoker = true) AS
SELECT
  email,
  COUNT(*) FILTER (WHERE event_type = 'opened') AS opened,
  COUNT(*) FILTER (WHERE event_type = 'clicked') AS clicked,
  MAX(occurred_at) FILTER (WHERE event_type = 'opened') AS last_opened_at,
  MAX(occurred_at) FILTER (WHERE event_type = 'clicked') AS last_clicked_at,
  COUNT(DISTINCT campaign_id) FILTER (
    WHERE event_type = 'delivered' AND campaign_id IS NOT NULL
  ) AS campaigns_delivered,
  COUNT(DISTINCT campaign_id) FILTER (
    WHERE event_type = 'opened' AND campaign_id IS NOT NULL
  ) AS campaigns_opened,
  COUNT(DISTINCT campaign_id) FILTER (
    WHERE event_type = 'clicked'
      AND campaign_id IS NOT NULL
      AND COALESCE(link_url, metadata->'click'->>'link', '') NOT ILIKE '%unsubscribe%'
  ) AS campaigns_clicked
FROM public.email_events
GROUP BY email;

REVOKE ALL ON public.email_engagement_summary FROM PUBLIC;
REVOKE ALL ON public.email_engagement_summary FROM anon;
GRANT SELECT ON public.email_engagement_summary TO authenticated, service_role;
