-- Reusable link-interest audience source.
--
-- This is a live aggregate over the existing Resend click history, so deploying
-- it automatically includes historical clickers; no profile copy or backfill is
-- required. Daily buckets preserve accurate lookback windows while collapsing
-- repeat clicks into a bounded audience/link/campaign/day result.
CREATE INDEX IF NOT EXISTS idx_email_events_link_interest
  ON email_events (email, occurred_at DESC)
  INCLUDE (link_url, campaign_id, campaign_subject)
  WHERE event_type = 'clicked';

CREATE OR REPLACE VIEW link_interest_clicks
WITH (security_invoker = true) AS
SELECT
  lower(email) AS email,
  COALESCE(link_url, metadata->'click'->>'link') AS link_url,
  campaign_id,
  campaign_subject,
  (occurred_at AT TIME ZONE 'UTC')::date AS click_date,
  COUNT(*) AS clicks,
  MIN(occurred_at) AS first_click_at,
  MAX(occurred_at) AS last_click_at
FROM email_events
WHERE event_type = 'clicked'
  AND COALESCE(link_url, metadata->'click'->>'link', '') <> ''
  AND COALESCE(link_url, metadata->'click'->>'link', '') NOT ILIKE '%unsubscribe%'
GROUP BY
  lower(email),
  COALESCE(link_url, metadata->'click'->>'link'),
  campaign_id,
  campaign_subject,
  (occurred_at AT TIME ZONE 'UTC')::date;

REVOKE ALL ON link_interest_clicks FROM PUBLIC;
REVOKE ALL ON link_interest_clicks FROM anon;
GRANT SELECT ON link_interest_clicks TO authenticated, service_role;
