-- Rekkrd has two independent native email preferences. Preserve the legacy
-- subscribed mapping and expose both fields so Trellis can use their union.
UPDATE spoke_connections sc
SET tables = (
  SELECT jsonb_agg(
    CASE WHEN item->>'table_type' = 'customers'
      THEN jsonb_set(
        item,
        '{field_mapping}',
        COALESCE(item->'field_mapping', '{}'::jsonb) || jsonb_build_object(
          'email_digest_optin', 'email_digest_optin',
          'email_updates_optin', 'email_updates_optin'
        )
      )
      ELSE item
    END
    ORDER BY ord
  )
  FROM jsonb_array_elements(sc.tables) WITH ORDINALITY AS mapped(item, ord)
)
WHERE sc.id = '6f84be21-c7e4-4ef2-9917-5bf32211a707';

CREATE OR REPLACE VIEW campaign_stats_by_id
WITH (security_invoker = true) AS
WITH send_stats AS (
  SELECT campaign_id, COUNT(DISTINCT lower(email)) AS sent
  FROM campaign_sends WHERE campaign_id IS NOT NULL GROUP BY campaign_id
), event_stats AS (
  SELECT campaign_id,
    COUNT(DISTINCT lower(email)) FILTER (WHERE event_type = 'delivered') AS delivered,
    COUNT(DISTINCT lower(email)) FILTER (WHERE event_type = 'opened') AS opened,
    COUNT(DISTINCT lower(email)) FILTER (WHERE event_type = 'clicked' AND COALESCE(link_url, metadata->'click'->>'link', '') NOT ILIKE '%unsubscribe%') AS clicked,
    COUNT(DISTINCT lower(email)) FILTER (WHERE event_type = 'bounced') AS bounced,
    COUNT(DISTINCT lower(email)) FILTER (WHERE event_type = 'complained') AS complained,
    MIN(occurred_at) AS first_event_at, MAX(occurred_at) AS last_event_at
  FROM email_events WHERE campaign_id IS NOT NULL GROUP BY campaign_id
)
SELECT c.id AS campaign_id,
  COALESCE(s.sent, 0::bigint) AS sent, COALESCE(e.delivered, 0::bigint) AS delivered,
  COALESCE(e.opened, 0::bigint) AS opened, COALESCE(e.clicked, 0::bigint) AS clicked,
  COALESCE(e.bounced, 0::bigint) AS bounced, COALESCE(e.complained, 0::bigint) AS complained,
  e.first_event_at, e.last_event_at
FROM campaigns c
LEFT JOIN send_stats s ON s.campaign_id = c.id
LEFT JOIN event_stats e ON e.campaign_id = c.id
WHERE c.launched_at IS NOT NULL OR c.send_status IS NOT NULL;
GRANT SELECT ON campaign_stats_by_id TO anon, authenticated, service_role;

CREATE OR REPLACE VIEW campaign_recipient_status_by_id
WITH (security_invoker = true) AS
WITH identities AS (
  SELECT campaign_id, lower(email) AS email FROM campaign_sends WHERE campaign_id IS NOT NULL
  UNION
  SELECT campaign_id, lower(email) AS email FROM email_events WHERE campaign_id IS NOT NULL
), send_times AS (
  SELECT campaign_id, lower(email) AS email, MAX(sent_at) AS sent_at
  FROM campaign_sends WHERE campaign_id IS NOT NULL GROUP BY campaign_id, lower(email)
), event_status AS (
  SELECT campaign_id, lower(email) AS email,
    bool_or(event_type = 'delivered') AS delivered, bool_or(event_type = 'opened') AS opened,
    bool_or(event_type = 'clicked' AND COALESCE(link_url, metadata->'click'->>'link', '') NOT ILIKE '%unsubscribe%') AS clicked,
    bool_or(event_type = 'bounced') AS bounced, bool_or(event_type = 'complained') AS complained,
    array_remove(array_agg(DISTINCT COALESCE(link_url, metadata->'click'->>'link')) FILTER (
      WHERE event_type = 'clicked' AND COALESCE(link_url, metadata->'click'->>'link', '') NOT ILIKE '%unsubscribe%'
    ), NULL) AS link_urls,
    MAX(occurred_at) AS last_event_at
  FROM email_events WHERE campaign_id IS NOT NULL GROUP BY campaign_id, lower(email)
)
SELECT i.campaign_id, i.email,
  COALESCE(e.delivered, false) AS delivered, COALESCE(e.opened, false) AS opened,
  COALESCE(e.clicked, false) AS clicked, COALESCE(e.bounced, false) AS bounced,
  COALESCE(e.complained, false) AS complained, COALESCE(e.link_urls, ARRAY[]::text[]) AS link_urls,
  COALESCE(e.last_event_at, s.sent_at) AS last_event_at
FROM identities i
LEFT JOIN send_times s USING (campaign_id, email)
LEFT JOIN event_status e USING (campaign_id, email);
REVOKE ALL ON campaign_recipient_status_by_id FROM PUBLIC;
REVOKE ALL ON campaign_recipient_status_by_id FROM anon;
GRANT SELECT ON campaign_recipient_status_by_id TO authenticated, service_role;

CREATE OR REPLACE VIEW campaign_link_clicks_by_id
WITH (security_invoker = true) AS
SELECT campaign_id, COALESCE(link_url, metadata->'click'->>'link') AS link_url,
  COUNT(*) AS clicks, COUNT(DISTINCT lower(email)) AS unique_clickers,
  MIN(occurred_at) AS first_click_at, MAX(occurred_at) AS last_click_at
FROM email_events
WHERE event_type = 'clicked' AND campaign_id IS NOT NULL
  AND COALESCE(link_url, metadata->'click'->>'link', '') <> ''
  AND COALESCE(link_url, metadata->'click'->>'link', '') NOT ILIKE '%unsubscribe%'
GROUP BY campaign_id, COALESCE(link_url, metadata->'click'->>'link');
REVOKE ALL ON campaign_link_clicks_by_id FROM PUBLIC;
REVOKE ALL ON campaign_link_clicks_by_id FROM anon;
GRANT SELECT ON campaign_link_clicks_by_id TO authenticated, service_role;
