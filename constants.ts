
import { MarketingEvent, MarketingTask, DailyBriefing, Ticket, Brand, Integration, FailedSync, BrandIdentity, GeneratedBrandAsset } from './types';
import PROMO_STUDIO_SQL_SCHEMA from './supabase/migrations/20260825162352_add_promo_studio_foundation.sql?raw';
import PROMO_BRANCH_SOURCES_SQL_SCHEMA from './supabase/migrations/20260825175823_add_promo_branch_sources.sql?raw';
import PROMO_CLAIM_APPROVAL_GATE_SQL_SCHEMA from './supabase/migrations/20260825191617_add_promo_claim_approval_gate.sql?raw';
import PROMO_VOICE_TAKE_RESERVATION_SQL_SCHEMA from './supabase/migrations/20260825201900_reserve_promo_voice_take_numbers.sql?raw';
import PROMO_MUSIC_TAKE_RESERVATION_SQL_SCHEMA from './supabase/migrations/20260825203500_reserve_promo_music_take_numbers.sql?raw';
import PROMO_RENDER_COMPLETION_SQL_SCHEMA from './supabase/migrations/20260825211425_complete_promo_render_job.sql?raw';
import PROMO_CAPTURE_COMPLETION_SQL_SCHEMA from './supabase/migrations/20260826180018_complete_promo_capture_job.sql?raw';
import PROMO_REVISION_ASSET_BINDINGS_SQL_SCHEMA from './supabase/migrations/20260826183711_add_promo_revision_asset_bindings.sql?raw';

export const DEFAULT_BRAND: Brand = {
  id: 'b_1',
  name: 'Sproutify',
  industry: 'Gardening & AgTech',
  tone: 'Professional yet earthy and encouraging',
  primaryColor: '#059669',
};

export const MOCK_INTEGRATIONS: Integration[] = [
  {
    id: 'int_1',
    name: 'Shopify Store',
    type: 'webhook',
    description: 'Main e-commerce store webhook',
    credentials: { webhook_url: 'https://store.example.com/webhooks/orders', secret: 'whsec_abc123' },
    status: 'active',
    created_at: '2023-11-01T00:00:00Z',
    last_used_at: '2023-12-14T10:00:00Z'
  },
  {
    id: 'int_2',
    name: 'Stripe Payments',
    type: 'api',
    description: 'Payment processing',
    credentials: { api_key: 'sk_live_xxxxx' },
    status: 'active',
    created_at: '2023-11-01T00:00:00Z',
    last_used_at: '2023-12-14T11:30:00Z'
  },
  {
    id: 'int_3',
    name: 'Mailchimp',
    type: 'api',
    description: 'Email list sync',
    credentials: { api_key: 'mc_api_xxxxx' },
    status: 'active',
    created_at: '2023-11-15T00:00:00Z',
    last_used_at: '2023-12-13T09:15:00Z'
  },
  {
    id: 'int_4',
    name: 'Custom CRM',
    type: 'custom',
    credentials: { api_key: 'crm_key_xxxxx', webhook_url: 'https://crm.internal/sync' },
    status: 'active',
    created_at: '2023-12-01T00:00:00Z'
  },
  {
    id: 'int_5',
    name: 'Legacy System',
    type: 'webhook',
    description: 'Old system - to be deprecated',
    credentials: { webhook_url: 'https://old.system.com/hook' },
    status: 'inactive',
    created_at: '2023-06-01T00:00:00Z'
  },
];

// Legacy alias
export const MOCK_SPOKE_CONFIGS = MOCK_INTEGRATIONS;

export const MOCK_BRAND_IDENTITIES: BrandIdentity[] = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    branch_id: 'atlurbanfarms.com',
    name: 'ATL Urban Farms',
    tagline: 'Growing Community, One Garden at a Time',
    mission: 'Empowering Atlanta neighborhoods with sustainable urban agriculture education and fresh local produce.',
    values: ['Sustainability', 'Community', 'Education', 'Local First'],
    target_audience: 'Urban gardeners, community organizers, and eco-conscious Atlanta residents aged 25-55',
    voice: 'Warm, knowledgeable, and community-focused with occasional gardening metaphors.',
    website_url: 'https://atlurbanfarms.com',
    screenshot_url: 'https://s0.wp.com/mshots/v1/https%3A%2F%2Fatlurbanfarms.com?w=1280&h=960',
    color_palette: {
      primary: '#2D5A27',
      secondary: '#8B4513',
      accent: '#F4A460',
      neutral: '#F5F5DC'
    },
    typography: {
      heading: 'Playfair Display',
      body: 'Open Sans'
    },
    image_prompt: 'Lush urban garden with raised beds, Atlanta skyline in background, warm golden hour lighting, community members tending plants',
    marketing_hooks: [
      'Transform your balcony into a thriving garden oasis',
      'Join 500+ Atlanta families growing their own food',
      'From seed to table in the heart of the city'
    ],
    site_preview_description: 'Earth-toned website with hero image of community garden, prominent CTA, testimonial carousel',
    extracted_images: [],
    status: 'active',
    created_at: '2024-01-15T10:00:00Z',
    updated_at: '2024-01-15T10:00:00Z'
  }
];

export const MOCK_BRAND_ASSETS: GeneratedBrandAsset[] = [];

export const MOCK_FAILED_SYNCS: FailedSync[] = [
  {
    id: 'fl_1',
    event_id: 'woo_order_9901',
    source_site: 'farm.sproutify.app',
    raw_payload: { order_id: 9901, status: 'completed', customer_email: 'glitch@test.com' },
    error_message: 'Timed out waiting for profile lookup.',
    retry_count: 2,
    created_at: new Date(Date.now() - 3600000).toISOString()
  },
  {
    id: 'fl_2',
    event_id: 'ig_comment_abc',
    source_site: 'instagram',
    raw_payload: { comment: 'Need help!', user: 'plant_fan' },
    error_message: 'API Key Revoked on Instagram n8n node.',
    retry_count: 0,
    created_at: new Date(Date.now() - 7200000).toISOString()
  }
];

export const MOCK_EVENTS: MarketingEvent[] = [
  {
    id: 'e_1',
    profile_id: 'p_uuid_1',
    event_type: 'purchase',
    source: 'woo',
    payload: { item: 'Organic Soil Mix', amount: 14.99 },
    created_at: new Date(Date.now() - 86400000).toISOString()
  }
];

export const MOCK_TASKS: MarketingTask[] = [
  {
    id: 't_1',
    title: 'Update Fall Soil Campaign',
    description: 'Refresh the copy for the upcoming organic soil promotion.',
    status: 'pending',
    priority: 'high',
    type: 'copywriting',
    due_date: new Date(Date.now() + 86400000 * 5).toISOString().split('T')[0],
    audit_log: []
  }
];

export const MOCK_TICKETS: Ticket[] = [
  {
    id: 'tic_1',
    profile_id: 'p_uuid_1',
    subject: 'Soil pH Sensor Sync Issue',
    description: 'My sensor is not appearing in the Sproutify app despite being plugged in.',
    status: 'open',
    priority: 'high',
    source: 'app',
    sentiment: 'frustrated',
    ai_draft: "I'm sorry to hear your soil pH sensor isn't syncing. Please ensure your Bluetooth is active.",
    ai_confidence: 94,
    needs_human_review: false,
    created_at: new Date(Date.now() - 3600000).toISOString()
  },
  {
    id: 'tic_low_conf',
    profile_id: 'p_uuid_1',
    subject: 'Complex Account Merging Request',
    description: 'I have two accounts under different emails and I want to merge my loyalty points while keeping my order history.',
    status: 'open',
    priority: 'medium',
    source: 'web',
    sentiment: 'neutral',
    ai_draft: "Merging accounts is a manual process. Please provide the secondary email address.",
    ai_confidence: 62, // Trigger human review
    needs_human_review: true,
    created_at: new Date(Date.now() - 1200000).toISOString()
  }
];

export const SQL_SCHEMA = `
-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "pg_cron";

-- 2. CORE IDENTITY HUB (Master Profiles)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  spoke_uuid TEXT UNIQUE, 
  email TEXT UNIQUE NOT NULL,
  first_name TEXT,
  phone TEXT,
  branches JSONB DEFAULT '[]'::jsonb, 
  tags JSONB DEFAULT '[]'::jsonb,         
  segments JSONB DEFAULT '[]'::jsonb,     
  is_subscribed BOOLEAN DEFAULT true,
  marketing_pause BOOLEAN DEFAULT false,
  branch_consent JSONB DEFAULT '{}'::jsonb,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'banned', 'deleted')),
  churn_risk TEXT DEFAULT 'minimal' CHECK (churn_risk IN ('minimal', 'moderate', 'high', 'critical')),
  ltv DECIMAL(12, 2) DEFAULT 0.00,
  engagement_score INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  last_event_timestamp TIMESTAMPTZ DEFAULT now(),
  last_active TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. ACTIVE EVENTS (Hot Storage)
CREATE TABLE IF NOT EXISTS marketing_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id UUID REFERENCES profiles(id),
  event_type TEXT NOT NULL,
  source TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. COLD STORAGE: COMPRESSED ARCHIVE
-- Used for high-volume logs like 'Open' and 'Click' after 90 days.
CREATE TABLE IF NOT EXISTS compressed_archive_events (
  id UUID PRIMARY KEY,
  profile_id UUID,
  event_type TEXT,
  source TEXT,
  payload JSONB,
  created_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ DEFAULT now()
);

-- 5. DATA HYGIENE: TTL ENFORCEMENT (Postgres Cron)
-- Moves events older than 90 days to cold storage and purges high-volume noise.
CREATE OR REPLACE FUNCTION purge_and_archive_old_events()
RETURNS void AS $$
BEGIN
    -- 1. Archive core business events (purchases, signups)
    INSERT INTO compressed_archive_events (id, profile_id, event_type, source, payload, created_at)
    SELECT id, profile_id, event_type, source, payload, created_at
    FROM marketing_events
    WHERE created_at < NOW() - INTERVAL '90 days'
    AND event_type IN ('purchase', 'signup', 'ticket_resolved');

    -- 2. Delete high-volume noise (opens, clicks, heartbeat)
    -- We keep profiles forever, but log noise is strictly TTL 90.
    DELETE FROM marketing_events
    WHERE created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Schedule the job to run every night at 3 AM
-- SELECT cron.schedule('0 3 * * *', 'SELECT purge_and_archive_old_events()');

-- 6. RATE-LIMIT QUEUE (API Guard)
CREATE TABLE IF NOT EXISTS marketing_task_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_type TEXT NOT NULL CHECK (task_type IN ('email_dispatch', 'ai_generation', 'social_push')),
  payload JSONB NOT NULL,
  priority INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  attempt_count INTEGER DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_task_queue_status_priority ON marketing_task_queue (status, priority DESC);

-- 6b. CAMPAIGN REGISTRY (Query-Based Dispatch)
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'active', 'completed', 'paused')),
  template TEXT NOT NULL,
  subject TEXT,
  trigger_type TEXT DEFAULT 'immediate' CHECK (trigger_type IN ('immediate', 'scheduled', 'event_based')),
  scheduled_at TIMESTAMPTZ,
  segments JSONB DEFAULT '[]'::jsonb,
  tags JSONB DEFAULT '[]'::jsonb,
  branches JSONB DEFAULT '[]'::jsonb,
  audience_size INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_by TEXT,
  owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid(),
  launched_at TIMESTAMPTZ,
  campaign_type TEXT DEFAULT 'standard' CHECK (campaign_type IN ('standard', 'marketing_wizard')),
  dispatch JSONB,
  send_status TEXT CHECK (send_status IN ('queued', 'sending', 'sent', 'partial', 'failed')),
  send_error TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns (status);
CREATE INDEX IF NOT EXISTS idx_campaigns_launched ON campaigns (launched_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaigns_owner_updated ON campaigns (owner_id, updated_at DESC);
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid();
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON campaigns FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON campaigns TO authenticated;
GRANT ALL ON campaigns TO service_role;

-- 6b. EMAIL REPORTING & SUPPRESSION
-- Suppression list (do-not-email). Trellis reads consent live from spokes but keeps
-- its own unsubscribe/bounce/complaint list here (never writes back to spokes).
-- scope: unsubscribe/complaint/bounce lists are scoped per-branch except bounces
-- and complaints, which the resend-webhook always writes as scope='global'
-- (ISP/deliverability signals apply to the address everywhere, not one branch).
CREATE TABLE IF NOT EXISTS email_suppressions (
  email TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'global',
  reason TEXT NOT NULL DEFAULT 'unsubscribe' CHECK (reason IN ('unsubscribe','bounce','complaint','manual')),
  source TEXT,
  campaign_subject TEXT,
  detail JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (email, scope)
);
ALTER TABLE email_suppressions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "suppressions_service" ON email_suppressions;
CREATE POLICY "suppressions_service" ON email_suppressions FOR ALL TO service_role USING (true) WITH CHECK (true);
-- Read access is authenticated-only: this table holds raw customer email addresses
-- plus why they were suppressed (complaint/bounce/etc) — not safe for the anon role.
DROP POLICY IF EXISTS "suppressions_read" ON email_suppressions;
CREATE POLICY "suppressions_read" ON email_suppressions FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON email_suppressions FROM anon;
GRANT SELECT ON email_suppressions TO authenticated;
GRANT ALL ON email_suppressions TO service_role;

-- Delivery/engagement events ingested from Resend webhooks (resend-webhook edge fn).
-- link_url: populated only for event_type='clicked', from Resend's click.link field.
CREATE TABLE IF NOT EXISTS email_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('sent','delivered','delivery_delayed','opened','clicked','bounced','complained','failed')),
  resend_email_id TEXT,
  campaign_subject TEXT,
  campaign_id UUID,
  link_url TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_events_email ON email_events (email);
CREATE INDEX IF NOT EXISTS idx_email_events_subject ON email_events (campaign_subject);
CREATE INDEX IF NOT EXISTS idx_email_events_type ON email_events (event_type);
CREATE INDEX IF NOT EXISTS idx_email_events_occurred ON email_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_events_link_url ON email_events (link_url) WHERE link_url IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_events_dedup ON email_events (resend_email_id, event_type, occurred_at) WHERE resend_email_id IS NOT NULL;
ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "events_service" ON email_events;
CREATE POLICY "events_service" ON email_events FOR ALL TO service_role USING (true) WITH CHECK (true);
-- Read access is authenticated-only — raw recipient addresses, not safe for anon.
DROP POLICY IF EXISTS "events_read" ON email_events;
CREATE POLICY "events_read" ON email_events FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON email_events FROM anon;
GRANT SELECT ON email_events TO authenticated;
GRANT ALL ON email_events TO service_role;

-- Per-campaign rollup (matched by subject). security_invoker so it honors caller RLS.
-- Every column is COUNT(DISTINCT email) — unique recipients, not raw event rows —
-- so these numbers always match the per-recipient list (fetchCampaignRecipients).
-- Using COUNT(*) for sent/delivered/bounced/complained looked fine until a
-- campaign had webhook retries or a same-subject transactional resend, at which
-- point the row and the recipient list visibly disagreed (e.g. one subject
-- showed "Sent 26 / Delivered 51" against 15 actual people).
CREATE OR REPLACE VIEW campaign_email_stats
WITH (security_invoker = true) AS
SELECT
  campaign_subject,
  COUNT(DISTINCT email) FILTER (WHERE event_type = 'sent')       AS sent,
  COUNT(DISTINCT email) FILTER (WHERE event_type = 'delivered')  AS delivered,
  COUNT(DISTINCT email) FILTER (WHERE event_type = 'opened')     AS opened,
  COUNT(DISTINCT email) FILTER (
    WHERE event_type = 'clicked'
      AND COALESCE(link_url, metadata->'click'->>'link', '') NOT ILIKE '%unsubscribe%'
  ) AS clicked,
  COUNT(DISTINCT email) FILTER (WHERE event_type = 'bounced')    AS bounced,
  COUNT(DISTINCT email) FILTER (WHERE event_type = 'complained') AS complained,
  MIN(occurred_at) AS first_event_at,
  MAX(occurred_at) AS last_event_at
FROM email_events
WHERE campaign_subject IS NOT NULL
GROUP BY campaign_subject;
GRANT SELECT ON campaign_email_stats TO anon, authenticated, service_role;

-- Send-time attribution map: Resend /emails/batch returns message ids in request
-- order (no per-message tags/metadata support), so the campaign-sender worker
-- zips those ids with the recipients it just sent and upserts the mapping here.
-- resend-webhook/index.ts then joins incoming events on resend_email_id to
-- resolve campaign_id, instead of matching on subject text.
CREATE TABLE IF NOT EXISTS campaign_sends (
  resend_email_id TEXT PRIMARY KEY,
  campaign_id UUID,
  email TEXT NOT NULL,
  subject TEXT,
  sent_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_campaign_sends_campaign ON campaign_sends (campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaign_sends_email ON campaign_sends (email);
ALTER TABLE campaign_sends ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "campaign_sends_service" ON campaign_sends;
CREATE POLICY "campaign_sends_service" ON campaign_sends FOR ALL TO service_role USING (true) WITH CHECK (true);
-- Read access is authenticated-only — raw recipient addresses, not safe for anon.
DROP POLICY IF EXISTS "campaign_sends_read" ON campaign_sends;
CREATE POLICY "campaign_sends_read" ON campaign_sends FOR SELECT TO authenticated USING (true);
REVOKE SELECT ON campaign_sends FROM anon;
GRANT SELECT ON campaign_sends TO authenticated;
GRANT ALL ON campaign_sends TO service_role;

-- Per-campaign rollup keyed by campaign_id (exact — no subject-collision risk).
-- Sent is provider-accepted campaign_sends, so the count does not depend on a
-- later webhook. Engagement remains distinct recipients from Resend events.
CREATE OR REPLACE VIEW campaign_stats_by_id
WITH (security_invoker = true) AS
WITH send_stats AS (
  SELECT campaign_id, COUNT(DISTINCT lower(email)) AS sent
  FROM campaign_sends
  WHERE campaign_id IS NOT NULL
  GROUP BY campaign_id
), event_stats AS (
  SELECT
    campaign_id,
    COUNT(DISTINCT lower(email)) FILTER (WHERE event_type = 'delivered')  AS delivered,
    COUNT(DISTINCT lower(email)) FILTER (WHERE event_type = 'opened')     AS opened,
    COUNT(DISTINCT lower(email)) FILTER (
      WHERE event_type = 'clicked'
        AND COALESCE(link_url, metadata->'click'->>'link', '') NOT ILIKE '%unsubscribe%'
    ) AS clicked,
    COUNT(DISTINCT lower(email)) FILTER (WHERE event_type = 'bounced')    AS bounced,
    COUNT(DISTINCT lower(email)) FILTER (WHERE event_type = 'complained') AS complained,
    MIN(occurred_at) AS first_event_at,
    MAX(occurred_at) AS last_event_at
  FROM email_events
  WHERE campaign_id IS NOT NULL
  GROUP BY campaign_id
)
SELECT
  c.id AS campaign_id,
  COALESCE(s.sent, 0::bigint) AS sent,
  COALESCE(e.delivered, 0::bigint) AS delivered,
  COALESCE(e.opened, 0::bigint) AS opened,
  COALESCE(e.clicked, 0::bigint) AS clicked,
  COALESCE(e.bounced, 0::bigint) AS bounced,
  COALESCE(e.complained, 0::bigint) AS complained,
  e.first_event_at,
  e.last_event_at
FROM campaigns c
LEFT JOIN send_stats s ON s.campaign_id = c.id
LEFT JOIN event_stats e ON e.campaign_id = c.id
WHERE c.launched_at IS NOT NULL OR c.send_status IS NOT NULL;
GRANT SELECT ON campaign_stats_by_id TO anon, authenticated, service_role;

-- Exact-ID recipient status. Start with campaign_sends so provider-accepted
-- recipients remain visible before (or even without) a webhook callback.
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
    bool_or(event_type = 'delivered') AS delivered,
    bool_or(event_type = 'opened') AS opened,
    bool_or(event_type = 'clicked' AND COALESCE(link_url, metadata->'click'->>'link', '') NOT ILIKE '%unsubscribe%') AS clicked,
    bool_or(event_type = 'bounced') AS bounced,
    bool_or(event_type = 'complained') AS complained,
    array_remove(array_agg(DISTINCT COALESCE(link_url, metadata->'click'->>'link'))
      FILTER (WHERE event_type = 'clicked' AND COALESCE(link_url, metadata->'click'->>'link', '') NOT ILIKE '%unsubscribe%'), NULL) AS link_urls,
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

-- Per-recipient status within one campaign — one row per (campaign_subject, email)
-- instead of one row per raw event, so a campaign with thousands of delivery/open/
-- click events collapses to one row per actual person. Backs the "who opened,
-- clicked & complained" recipient list (CampaignRecipientsModal / fetchCampaignRecipients).
CREATE OR REPLACE VIEW campaign_recipient_status
WITH (security_invoker = true) AS
SELECT
  campaign_subject,
  email,
  bool_or(event_type = 'delivered')  AS delivered,
  bool_or(event_type = 'opened')     AS opened,
  bool_or(event_type = 'clicked'
          AND COALESCE(link_url, metadata->'click'->>'link', '') NOT ILIKE '%unsubscribe%') AS clicked,
  bool_or(event_type = 'bounced')    AS bounced,
  bool_or(event_type = 'complained') AS complained,
  array_remove(array_agg(DISTINCT COALESCE(link_url, metadata->'click'->>'link'))
    FILTER (WHERE event_type = 'clicked'
      AND COALESCE(link_url, metadata->'click'->>'link', '') NOT ILIKE '%unsubscribe%'), NULL) AS link_urls,
  max(occurred_at) AS last_event_at
FROM email_events
WHERE campaign_subject IS NOT NULL
GROUP BY campaign_subject, email;
-- Raw recipient addresses — authenticated-only, same as email_events itself.
GRANT SELECT ON campaign_recipient_status TO authenticated, service_role;

-- Per-link click rollup within one campaign — one row per (campaign_subject, link)
-- instead of one row per raw click event. Backs the link click summary
-- (LinkClickSummaryModal / fetchCampaignLinkClicks): "which link earned the
-- clicks", then drill into who clicked it.
--
-- COALESCE(link_url, metadata->'click'->>'link') matches the other stats views:
-- link_url wasn't captured before Aug 5, so the metadata fallback recovers the
-- link for older events. Unsubscribe links are excluded for the same reason
-- campaign_email_stats excludes them — otherwise the per-link rows would report
-- clicks the rest of the UI deliberately doesn't count.
--
-- clicks is COUNT(*) (raw click events, so repeat clicks show) while
-- unique_clickers is COUNT(DISTINCT email). Summing unique_clickers across links
-- does NOT equal campaign_email_stats.clicked — one person clicking three links
-- is one clicker there and three here. The UI labels these separately.
CREATE OR REPLACE VIEW campaign_link_clicks
WITH (security_invoker = true) AS
SELECT
  campaign_subject,
  COALESCE(link_url, metadata->'click'->>'link') AS link_url,
  COUNT(*)              AS clicks,
  COUNT(DISTINCT email) AS unique_clickers,
  MIN(occurred_at)      AS first_click_at,
  MAX(occurred_at)      AS last_click_at
FROM email_events
WHERE event_type = 'clicked'
  AND campaign_subject IS NOT NULL
  AND COALESCE(link_url, metadata->'click'->>'link', '') <> ''
  AND COALESCE(link_url, metadata->'click'->>'link', '') NOT ILIKE '%unsubscribe%'
GROUP BY campaign_subject, COALESCE(link_url, metadata->'click'->>'link');
-- Derived from email_events (authenticated-only), so same audience. Supabase's
-- default privileges hand anon SELECT on every new public object, so revoke it
-- explicitly — from PUBLIC as well as anon, since a REVOKE from anon alone is a
-- no-op against a privilege held by PUBLIC. security_invoker already blocks anon
-- (it can't read email_events underneath); this is the second lock.
REVOKE ALL ON campaign_link_clicks FROM PUBLIC;
REVOKE ALL ON campaign_link_clicks FROM anon;
GRANT SELECT ON campaign_link_clicks TO authenticated, service_role;

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


-- One row per email, all-time, instead of one row per open/click event —
-- bounded by audience size, not by years of engagement history. Backs
-- fetchEngagementByEmail/fetchEngagementIndex (churn risk, segment targeting).
CREATE OR REPLACE VIEW email_engagement_summary
WITH (security_invoker = true) AS
SELECT
  email,
  COUNT(*) FILTER (WHERE event_type = 'opened')  AS opened,
  COUNT(*) FILTER (WHERE event_type = 'clicked') AS clicked,
  MAX(occurred_at) FILTER (WHERE event_type = 'opened')  AS last_opened_at,
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
FROM email_events
GROUP BY email;
REVOKE ALL ON email_engagement_summary FROM PUBLIC;
REVOKE ALL ON email_engagement_summary FROM anon;
GRANT SELECT ON email_engagement_summary TO authenticated, service_role;

-- 7. PERFORMANCE INDEXING
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_spoke_uuid ON profiles (spoke_uuid);
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email_unique ON profiles (email);
CREATE INDEX IF NOT EXISTS idx_profiles_sites_gin ON profiles USING GIN (branches jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_profiles_tags_gin ON profiles USING GIN (tags jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_profiles_segments_gin ON profiles USING GIN (segments jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles (status);
CREATE INDEX IF NOT EXISTS idx_profiles_search_trgm ON profiles USING GIN (email gin_trgm_ops, first_name gin_trgm_ops);

-- 8. RESILIENCE: DEAD LETTER QUEUE & IDEMPOTENCY
CREATE TABLE IF NOT EXISTS processed_events (
  event_id TEXT PRIMARY KEY,
  processed_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS failed_syncs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id TEXT,
  source_site TEXT NOT NULL,
  raw_payload JSONB NOT NULL,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 9. SECURITY & RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE compressed_archive_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE processed_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE failed_syncs ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketing_task_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service Role Full Access" ON profiles FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Role Only" ON marketing_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Role Only" ON processed_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Role Only" ON failed_syncs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service Role Only" ON marketing_task_queue FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 10. TRELLIS OPERATORS (App users / staff who log into Trellis)
CREATE TABLE IF NOT EXISTS trellis_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT DEFAULT 'operator' CHECK (role IN ('owner', 'admin', 'operator', 'analyst', 'viewer')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'invited', 'suspended', 'deleted')),
  last_login_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trellis_users_role ON trellis_users (role);
CREATE INDEX IF NOT EXISTS idx_trellis_users_status ON trellis_users (status);

CREATE TABLE IF NOT EXISTS trellis_user_branches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trellis_user_id UUID NOT NULL REFERENCES trellis_users(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  branch_role TEXT DEFAULT 'member' CHECK (branch_role IN ('lead', 'member', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (trellis_user_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_tub_user ON trellis_user_branches (trellis_user_id);
CREATE INDEX IF NOT EXISTS idx_tub_branch ON trellis_user_branches (branch_id);

CREATE OR REPLACE VIEW trellis_users_view AS
SELECT
  u.id, u.auth_user_id, u.email, u.full_name, u.avatar_url,
  u.role, u.status, u.last_login_at, u.created_at,
  COALESCE(
    jsonb_agg(
      jsonb_build_object('branch_id', b.id, 'branch_name', b.name, 'branch_role', tub.branch_role)
      ORDER BY b.name
    ) FILTER (WHERE b.id IS NOT NULL),
    '[]'::jsonb
  ) AS branches
FROM trellis_users u
LEFT JOIN trellis_user_branches tub ON tub.trellis_user_id = u.id
LEFT JOIN branches b ON b.id = tub.branch_id
WHERE u.status != 'deleted'
GROUP BY u.id;

ALTER TABLE trellis_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE trellis_user_branches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service Role Full Access" ON trellis_users FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Users read self" ON trellis_users FOR SELECT TO authenticated USING (auth.uid() = auth_user_id);
CREATE POLICY "Service Role Full Access" ON trellis_user_branches FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Users read own assignments" ON trellis_user_branches FOR SELECT TO authenticated USING (trellis_user_id IN (SELECT id FROM trellis_users WHERE auth_user_id = auth.uid()));

-- ═══════════════════════════════════════════════════════════
-- 10. SOCIAL CREDENTIAL VAULT (Phase 3 — API Publish)
-- ═══════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS social_credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'x', 'linkedin', 'facebook', 'tiktok', 'youtube')),
  app_id TEXT NOT NULL DEFAULT '',
  app_secret_encrypted TEXT NOT NULL DEFAULT '',
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  token_expires_at TIMESTAMPTZ,
  platform_metadata JSONB DEFAULT '{}'::jsonb,
  granted_scopes JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'expired', 'revoked', 'error')),
  last_error TEXT,
  last_refreshed_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  platform_user_id TEXT,
  platform_username TEXT,
  scopes TEXT[],
  expires_at TIMESTAMPTZ,
  is_valid BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE social_credentials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service Role Only" ON social_credentials FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_social_creds_branch ON social_credentials (branch_id);
CREATE INDEX IF NOT EXISTS idx_social_creds_branch_platform ON social_credentials (branch_id, platform);

-- 10a. RPC: Check which platforms have live credentials (non-sensitive return)
-- Ownership guard: only returns credentials for branches the caller owns.
CREATE OR REPLACE FUNCTION check_social_connections(p_branch_id TEXT)
RETURNS TABLE(platform TEXT, is_connected BOOLEAN, platform_username TEXT, connected_at TIMESTAMPTZ)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT sc.platform, true AS is_connected, sc.platform_username, sc.created_at AS connected_at
  FROM social_credentials sc
  INNER JOIN branches b ON b.id = sc.branch_id::uuid
  WHERE sc.branch_id = p_branch_id
    AND sc.is_valid = true
    AND b.owner_id = auth.uid();
$$;

-- 10b. RPC: Disconnect a platform (delete credential row)
-- Ownership guard: only disconnects if caller owns the branch.
CREATE OR REPLACE FUNCTION disconnect_social_platform(p_branch_id TEXT, p_platform TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  DELETE FROM social_credentials
  WHERE branch_id = p_branch_id
    AND platform = p_platform
    AND EXISTS (
      SELECT 1 FROM branches b WHERE b.id = p_branch_id::uuid AND b.owner_id = auth.uid()
    );
  RETURN FOUND;
END;
$$;

-- 10c. RPC: Upsert credential (called by Edge Function / service role)
-- No JWT ownership check — called by Edge Function with service_role key.
CREATE OR REPLACE FUNCTION upsert_social_credential(
  p_branch_id TEXT, p_platform TEXT, p_access_token TEXT,
  p_refresh_token TEXT DEFAULT NULL, p_platform_user_id TEXT DEFAULT NULL,
  p_platform_username TEXT DEFAULT NULL, p_scopes TEXT[] DEFAULT '{}',
  p_expires_at TIMESTAMPTZ DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO social_credentials (
    branch_id, platform, access_token_encrypted, refresh_token_encrypted,
    platform_user_id, platform_username, scopes, expires_at, is_valid, updated_at
  ) VALUES (
    p_branch_id, p_platform,
    pgp_sym_encrypt(p_access_token, get_encryption_key()),
    CASE WHEN p_refresh_token IS NOT NULL
      THEN pgp_sym_encrypt(p_refresh_token, get_encryption_key())
      ELSE NULL END,
    p_platform_user_id, p_platform_username, p_scopes, p_expires_at, true, now()
  )
  ON CONFLICT (branch_id, platform) DO UPDATE SET
    access_token_encrypted = pgp_sym_encrypt(p_access_token, get_encryption_key()),
    refresh_token_encrypted = CASE WHEN p_refresh_token IS NOT NULL
      THEN pgp_sym_encrypt(p_refresh_token, get_encryption_key())
      ELSE social_credentials.refresh_token_encrypted END,
    platform_user_id = COALESCE(p_platform_user_id, social_credentials.platform_user_id),
    platform_username = COALESCE(p_platform_username, social_credentials.platform_username),
    scopes = p_scopes, expires_at = p_expires_at, is_valid = true, updated_at = now();
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 10a2. META INSIGHTS CREDENTIALS RPC
-- Returns decrypted Facebook + Instagram page token + platform IDs for a
-- branch in one call, for the meta-insights Edge Function. SECURITY DEFINER.
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_meta_insight_credentials(p_branch_id TEXT)
RETURNS JSON LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_object_agg(platform, json_build_object(
    'access_token', pgp_sym_decrypt(access_token_encrypted, get_encryption_key()),
    'platform_user_id', platform_user_id
  ))
  INTO result
  FROM social_credentials
  WHERE branch_id = p_branch_id
    AND platform IN ('facebook', 'instagram')
    AND is_valid = true;

  RETURN COALESCE(result, '{}'::json);
END;
$$;

-- This returns DECRYPTED access tokens. Only the meta-insights Edge Function calls
-- it, on service_role. Without these lines a fresh stamp leaves the default PUBLIC
-- EXECUTE in place, which puts live Meta tokens behind the browser's anon key.
REVOKE ALL ON FUNCTION get_meta_insight_credentials(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_meta_insight_credentials(TEXT) TO service_role;

-- ═══════════════════════════════════════════════════════════
-- 10b. NEWSLETTER AUDIENCE RPC (ATL Spoke — launch-phase shortcut)
-- TODO: Once all spokes sync subscribers to Hub profiles table,
-- replace with unified profiles query on Hub Supabase.
-- Deploy this to ATL Spoke (povudgtvzggnxwgtjexa.supabase.co), NOT Hub.
-- ═══════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION resolve_newsletter_audience(
  p_tags TEXT[] DEFAULT NULL
) RETURNS TABLE(email TEXT, first_name TEXT, last_name TEXT, tags TEXT[], customer_id UUID)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT ns.email, ns.first_name, ns.last_name, ns.tags, ns.customer_id
  FROM newsletter_subscribers ns
  WHERE ns.status = 'active'
    AND (p_tags IS NULL OR ns.tags && p_tags);
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 11. SOCIAL SIGNALS (Inbound Intent Queue — Phase 4)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS social_signals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'x', 'linkedin', 'facebook', 'tiktok', 'youtube')),
  username TEXT NOT NULL,
  content TEXT NOT NULL,
  intent_type TEXT NOT NULL CHECK (intent_type IN ('buying_intent', 'support_request', 'brand_mention', 'engagement', 'complaint', 'partnership', 'spam')),
  confidence INTEGER NOT NULL DEFAULT 50 CHECK (confidence BETWEEN 0 AND 100),
  branch_id TEXT,
  profile_id UUID REFERENCES profiles(id),
  source_post_id TEXT,
  source_post_url TEXT,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'actioned', 'dismissed')),
  actioned_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE social_signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service Role Only" ON social_signals
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_social_signals_status_created
  ON social_signals (status, created_at DESC);

CREATE INDEX idx_social_signals_profile
  ON social_signals (profile_id) WHERE profile_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════
-- 12. CAMPAIGN RUNS (Cross-Channel Deployment Tracking)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS campaign_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_name TEXT NOT NULL,
  branch_id TEXT,
  audience_size INTEGER DEFAULT 0,
  channels JSONB DEFAULT '[]'::jsonb,
  timing_rules JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'partial_failure', 'failed')),
  launched_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);
ALTER TABLE campaign_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service Role Only" ON campaign_runs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_campaign_runs_status ON campaign_runs (status, created_at DESC);

-- ═══════════════════════════════════════════════════════════
-- 13. CONTENT CALENDAR EVENTS (Unified Calendar View)
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS content_calendar_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_type TEXT NOT NULL CHECK (event_type IN ('social_post', 'campaign_channel', 'email_blast')),
  branch_id TEXT NOT NULL,
  channel TEXT NOT NULL,
  title TEXT NOT NULL,
  content_preview TEXT,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'pending_review', 'approved', 'rejected', 'scheduled', 'published', 'failed')),
  source TEXT NOT NULL CHECK (source IN ('social_hub', 'campaign_builder')),
  source_id TEXT,
  approval_note TEXT,
  compliance_score INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE content_calendar_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service Role Only" ON content_calendar_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE INDEX IF NOT EXISTS idx_calendar_scheduled ON content_calendar_events (scheduled_for, branch_id);
CREATE INDEX IF NOT EXISTS idx_calendar_status ON content_calendar_events (status, channel);

-- ═══════════════════════════════════════════════════════════
-- 13b. SCHEDULED SOCIAL POSTS (Upload & Auto-Publish)
-- Already live on the Hub (horvjqqifgrzxesuxtfm) — mirrored here for the
-- record. Rows are drained by the "Trellis: Scheduled Post Publisher" n8n
-- workflow (n8n-blueprints/S1-scheduled-post-publisher.json), which polls
-- every 10 minutes for status='scheduled' rows past their scheduled_for
-- time and hands them off to the existing Instagram/Facebook publish
-- webhooks. Before this workflow existed, "scheduled" posts only ever
-- lived in browser localStorage and were never actually sent.
-- ═══════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS scheduled_social_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id UUID NOT NULL,
  branch_slug TEXT,
  platform TEXT NOT NULL DEFAULT 'instagram' CHECK (platform IN ('instagram', 'facebook')),
  caption TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'video', 'carousel')),
  media_urls JSONB DEFAULT '[]'::jsonb,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'publishing', 'published', 'failed', 'cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  post_id TEXT,
  published_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'upload',
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE scheduled_social_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service Role Full Access" ON scheduled_social_posts FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Anon/Authenticated Full Access" ON scheduled_social_posts FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT ALL ON scheduled_social_posts TO anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_ssp_due ON scheduled_social_posts (scheduled_for) WHERE status = 'scheduled';
CREATE INDEX IF NOT EXISTS idx_ssp_branch_scheduled ON scheduled_social_posts (branch_slug, scheduled_for);

-- Generated-media publishing provenance. The referenced media tables are
-- created by the provider-agnostic media-generation foundation migration.
ALTER TABLE scheduled_social_posts
  ADD COLUMN IF NOT EXISTS source_media_asset_id UUID,
  ADD COLUMN IF NOT EXISTS source_generation_job_id UUID,
  ADD COLUMN IF NOT EXISTS source_generation_output_id UUID,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE INDEX IF NOT EXISTS idx_ssp_source_media_asset
  ON scheduled_social_posts (source_media_asset_id)
  WHERE source_media_asset_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ssp_source_generation_job
  ON scheduled_social_posts (source_generation_job_id, created_at DESC)
  WHERE source_generation_job_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ssp_source_generation_output
  ON scheduled_social_posts (source_generation_output_id)
  WHERE source_generation_output_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_ssp_created_by_idempotency
  ON scheduled_social_posts (created_by, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION set_ssp_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ssp_updated_at ON scheduled_social_posts;
CREATE TRIGGER trg_ssp_updated_at
  BEFORE UPDATE ON scheduled_social_posts
  FOR EACH ROW EXECUTE FUNCTION set_ssp_updated_at();

-- 10. MARKETING CAMPAIGN GENERATOR: BRAND PROFILES
CREATE TABLE IF NOT EXISTS marketing_brands (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  brand_identity_id UUID REFERENCES brand_identities(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  industry TEXT,
  description TEXT,
  target_audience TEXT,
  tone TEXT,
  value_proposition TEXT,
  primary_color TEXT DEFAULT '#059669',
  logo_url TEXT,
  website_url TEXT,
  legal_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  address_line_1 TEXT,
  address_line_2 TEXT,
  city TEXT,
  state_region TEXT,
  postal_code TEXT,
  country_code TEXT NOT NULL DEFAULT 'US',
  keywords JSONB DEFAULT '[]'::jsonb,
  competitors JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_brands_branch ON marketing_brands (branch_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_marketing_brands_branch_unique ON marketing_brands (branch_id);
CREATE INDEX IF NOT EXISTS idx_marketing_brands_brand_identity ON marketing_brands (brand_identity_id);
ALTER TABLE marketing_brands ENABLE ROW LEVEL SECURITY;

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.is_active_trellis_user()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trellis_users
    WHERE auth_user_id = (SELECT auth.uid()) AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION private.can_manage_marketing()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.trellis_users
    WHERE auth_user_id = (SELECT auth.uid())
      AND role IN ('owner', 'admin', 'operator')
      AND status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION private.is_active_trellis_user() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION private.can_manage_marketing() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_active_trellis_user() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_manage_marketing() TO authenticated, service_role;

-- 13c. CONTENT INTELLIGENCE REGISTRATIONS
-- Immutable runtime approvals for successful Scheduler publications. Versioned
-- project specs and research remain in .trellis; these tables are the Hub review log.
CREATE TABLE IF NOT EXISTS content_intelligence_topics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id TEXT NOT NULL CHECK (project_id ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  topic_id TEXT NOT NULL CHECK (topic_id ~ '^[a-z0-9][a-z0-9_-]{2,127}$'),
  title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 240),
  cluster TEXT NOT NULL DEFAULT '',
  intent TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT 'publication_review',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'retired')),
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, topic_id)
);

CREATE INDEX IF NOT EXISTS idx_content_intelligence_topics_project
  ON content_intelligence_topics (project_id, status);

CREATE TABLE IF NOT EXISTS content_intelligence_posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id TEXT NOT NULL CHECK (project_id ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  post_id TEXT NOT NULL CHECK (post_id ~ '^[a-z0-9][a-z0-9_-]{2,127}$'),
  topic_id TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'facebook')),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status = 'published'),
  canonical_url TEXT NOT NULL CHECK (canonical_url ~* '^https://[^[:space:]]+$'),
  published_at TIMESTAMPTZ NOT NULL,
  task_id TEXT,
  title TEXT,
  primary_query TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  source_record_id UUID NOT NULL REFERENCES scheduled_social_posts(id) ON DELETE RESTRICT,
  external_post_id TEXT,
  approved_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, post_id),
  UNIQUE (source_record_id),
  FOREIGN KEY (project_id, topic_id)
    REFERENCES content_intelligence_topics(project_id, topic_id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_content_intelligence_posts_project_published
  ON content_intelligence_posts (project_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_intelligence_posts_topic
  ON content_intelligence_posts (project_id, topic_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_content_intelligence_posts_external_identity
  ON content_intelligence_posts (project_id, platform, external_post_id)
  WHERE external_post_id IS NOT NULL AND btrim(external_post_id) <> '';

ALTER TABLE content_intelligence_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_intelligence_posts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON content_intelligence_topics FROM anon, authenticated;
REVOKE ALL ON content_intelligence_posts FROM anon, authenticated;
GRANT SELECT, INSERT ON content_intelligence_topics TO authenticated;
GRANT SELECT, INSERT ON content_intelligence_posts TO authenticated;
GRANT ALL ON content_intelligence_topics TO service_role;
GRANT ALL ON content_intelligence_posts TO service_role;

DROP POLICY IF EXISTS "Active Trellis users read content topics" ON content_intelligence_topics;
CREATE POLICY "Active Trellis users read content topics"
  ON content_intelligence_topics FOR SELECT TO authenticated
  USING ((SELECT private.is_active_trellis_user()));

DROP POLICY IF EXISTS "Marketing operators create content topics" ON content_intelligence_topics;
CREATE POLICY "Marketing operators create content topics"
  ON content_intelligence_topics FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.can_manage_marketing()) AND created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Active Trellis users read content registrations" ON content_intelligence_posts;
CREATE POLICY "Active Trellis users read content registrations"
  ON content_intelligence_posts FOR SELECT TO authenticated
  USING ((SELECT private.is_active_trellis_user()));

DROP POLICY IF EXISTS "Marketing operators approve content registrations" ON content_intelligence_posts;
CREATE POLICY "Marketing operators approve content registrations"
  ON content_intelligence_posts FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT private.can_manage_marketing())
    AND approved_by = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM scheduled_social_posts scheduled
      WHERE scheduled.id = source_record_id
        AND scheduled.status = 'published'
        AND scheduled.branch_slug = project_id
        AND scheduled.platform = platform
        AND scheduled.post_id IS NOT DISTINCT FROM external_post_id
    )
  );

CREATE OR REPLACE FUNCTION approve_content_registration(
  p_project_id TEXT,
  p_topic_id TEXT,
  p_topic_title TEXT,
  p_post_id TEXT,
  p_platform TEXT,
  p_canonical_url TEXT,
  p_published_at TIMESTAMPTZ,
  p_source_record_id UUID,
  p_external_post_id TEXT DEFAULT NULL,
  p_task_id TEXT DEFAULT NULL,
  p_title TEXT DEFAULT NULL
)
RETURNS content_intelligence_posts
LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  approved public.content_intelligence_posts;
BEGIN
  INSERT INTO public.content_intelligence_topics (project_id, topic_id, title, created_by)
  VALUES (p_project_id, p_topic_id, p_topic_title, (SELECT auth.uid()))
  ON CONFLICT (project_id, topic_id) DO NOTHING;

  INSERT INTO public.content_intelligence_posts (
    project_id, post_id, topic_id, platform, canonical_url, published_at,
    source_record_id, external_post_id, task_id, title, approved_by
  ) VALUES (
    p_project_id, p_post_id, p_topic_id, p_platform, p_canonical_url, p_published_at,
    p_source_record_id, NULLIF(p_external_post_id, ''), NULLIF(p_task_id, ''),
    NULLIF(p_title, ''), (SELECT auth.uid())
  ) RETURNING * INTO approved;
  RETURN approved;
END;
$$;

REVOKE ALL ON FUNCTION approve_content_registration(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID, TEXT, TEXT, TEXT
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION approve_content_registration(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, UUID, TEXT, TEXT, TEXT
) TO authenticated, service_role;

DROP POLICY IF EXISTS "campaigns_app_access" ON campaigns;
DROP POLICY IF EXISTS "Active Trellis users read campaigns" ON campaigns;
CREATE POLICY "Active Trellis users read campaigns" ON campaigns FOR SELECT TO authenticated USING ((SELECT private.is_active_trellis_user()));
DROP POLICY IF EXISTS "Active Trellis users create campaigns" ON campaigns;
CREATE POLICY "Active Trellis users create campaigns" ON campaigns FOR INSERT TO authenticated WITH CHECK ((SELECT private.is_active_trellis_user()) AND owner_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS "Campaign owners manage campaigns" ON campaigns;
CREATE POLICY "Campaign owners manage campaigns" ON campaigns FOR UPDATE TO authenticated USING (owner_id = (SELECT auth.uid()) OR (SELECT private.can_manage_marketing())) WITH CHECK (owner_id = (SELECT auth.uid()) OR (SELECT private.can_manage_marketing()));
DROP POLICY IF EXISTS "Campaign owners delete drafts" ON campaigns;
CREATE POLICY "Campaign owners delete drafts" ON campaigns FOR DELETE TO authenticated USING (status = 'draft' AND (owner_id = (SELECT auth.uid()) OR (SELECT private.can_manage_marketing())));

GRANT SELECT, INSERT, UPDATE, DELETE ON marketing_brands TO authenticated;

DROP POLICY IF EXISTS "Service Role Full Access" ON marketing_brands;
CREATE POLICY "Service Role Full Access" ON marketing_brands FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Active Trellis users read brand profiles" ON marketing_brands;
CREATE POLICY "Active Trellis users read brand profiles" ON marketing_brands FOR SELECT TO authenticated USING ((SELECT private.is_active_trellis_user()));
DROP POLICY IF EXISTS "Marketing operators create brand profiles" ON marketing_brands;
CREATE POLICY "Marketing operators create brand profiles" ON marketing_brands FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_manage_marketing()));
DROP POLICY IF EXISTS "Marketing operators update brand profiles" ON marketing_brands;
CREATE POLICY "Marketing operators update brand profiles" ON marketing_brands FOR UPDATE TO authenticated USING ((SELECT private.can_manage_marketing())) WITH CHECK ((SELECT private.can_manage_marketing()));
DROP POLICY IF EXISTS "Marketing operators delete brand profiles" ON marketing_brands;
CREATE POLICY "Marketing operators delete brand profiles" ON marketing_brands FOR DELETE TO authenticated USING ((SELECT private.can_manage_marketing()));

-- 10B. BRANCH SOCIAL ACCOUNT IDENTITY REGISTRY
-- Public account metadata only. OAuth tokens remain in social_credentials.
CREATE TABLE IF NOT EXISTS branch_social_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'x', 'linkedin', 'facebook', 'tiktok', 'youtube')),
  external_account_id TEXT,
  handle TEXT NOT NULL,
  display_name TEXT,
  profile_url TEXT,
  purpose TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'pending', 'active', 'error', 'revoked')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (branch_id, platform, external_account_id),
  UNIQUE (branch_id, platform, handle)
);

CREATE INDEX IF NOT EXISTS idx_branch_social_accounts_branch_platform ON branch_social_accounts (branch_id, platform);
CREATE INDEX IF NOT EXISTS idx_branch_social_accounts_metadata_gin ON branch_social_accounts USING GIN (metadata jsonb_path_ops);
CREATE UNIQUE INDEX IF NOT EXISTS idx_branch_social_accounts_one_primary ON branch_social_accounts (branch_id, platform) WHERE is_primary;
ALTER TABLE branch_social_accounts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON branch_social_accounts FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON branch_social_accounts TO authenticated;
GRANT ALL ON branch_social_accounts TO service_role;

DROP POLICY IF EXISTS "Service Role Full Access" ON branch_social_accounts;
CREATE POLICY "Service Role Full Access" ON branch_social_accounts FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Active Trellis users read branch social accounts" ON branch_social_accounts;
CREATE POLICY "Active Trellis users read branch social accounts" ON branch_social_accounts FOR SELECT TO authenticated USING ((SELECT private.is_active_trellis_user()));
DROP POLICY IF EXISTS "Marketing operators create branch social accounts" ON branch_social_accounts;
CREATE POLICY "Marketing operators create branch social accounts" ON branch_social_accounts FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_manage_marketing()));
DROP POLICY IF EXISTS "Marketing operators update branch social accounts" ON branch_social_accounts;
CREATE POLICY "Marketing operators update branch social accounts" ON branch_social_accounts FOR UPDATE TO authenticated USING ((SELECT private.can_manage_marketing())) WITH CHECK ((SELECT private.can_manage_marketing()));
DROP POLICY IF EXISTS "Marketing operators delete branch social accounts" ON branch_social_accounts;
CREATE POLICY "Marketing operators delete branch social accounts" ON branch_social_accounts FOR DELETE TO authenticated USING ((SELECT private.can_manage_marketing()));

INSERT INTO branch_social_accounts (
  branch_id, platform, external_account_id, handle, display_name,
  profile_url, purpose, is_primary, status, metadata
)
SELECT
  b.id, seed.platform, seed.external_account_id, seed.handle, seed.display_name,
  seed.profile_url, seed.purpose, seed.is_primary, 'registered',
  jsonb_build_object('ownership', 'brand_account', 'source', 'youtube')
FROM branches b
CROSS JOIN (VALUES
  ('youtube', 'UCwk6PPLPh_txSnDf-pzPCJA', '@RekkrdAfterDark', 'Rekkrd After Dark', 'https://www.youtube.com/@RekkrdAfterDark', 'after_dark', true),
  ('youtube', 'UC-O8IHGO4buM4NkOPmc59mw', '@RekkrdListeningRoom', 'Rekkrd Listening Room', 'https://www.youtube.com/@RekkrdListeningRoom', 'listening_room', false)
) AS seed(platform, external_account_id, handle, display_name, profile_url, purpose, is_primary)
WHERE b.slug = 'rekkrd'
ON CONFLICT (branch_id, platform, external_account_id) DO UPDATE SET
  handle = EXCLUDED.handle,
  display_name = EXCLUDED.display_name,
  profile_url = EXCLUDED.profile_url,
  purpose = EXCLUDED.purpose,
  is_primary = EXCLUDED.is_primary,
  metadata = EXCLUDED.metadata,
  updated_at = now();

-- 10C. ACCOUNT-SCOPED SOCIAL CREDENTIALS
-- Keep this master schema block aligned with the production migration.
-- Bind credentials to a specific public account identity. Existing Facebook,
-- Instagram, X, LinkedIn, and TikTok credentials remain unscoped (NULL) and
-- keep their one-row-per-branch/platform behavior.
ALTER TABLE public.social_credentials
  ADD COLUMN IF NOT EXISTS branch_social_account_id UUID
  REFERENCES public.branch_social_accounts(id) ON DELETE CASCADE;

ALTER TABLE public.social_credentials
  DROP CONSTRAINT IF EXISTS unique_branch_platform;
ALTER TABLE public.social_credentials
  DROP CONSTRAINT IF EXISTS unique_branch_platform_account;
ALTER TABLE public.social_credentials
  ADD CONSTRAINT unique_branch_platform_account
  UNIQUE NULLS NOT DISTINCT (branch_id, platform, branch_social_account_id);

CREATE INDEX IF NOT EXISTS idx_social_credentials_branch_account
  ON public.social_credentials (branch_social_account_id)
  WHERE branch_social_account_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.can_manage_social_credentials()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT COALESCE((SELECT auth.jwt()->>'role') = 'service_role', false)
    OR EXISTS (
      SELECT 1
      FROM public.trellis_users
      WHERE auth_user_id = (SELECT auth.uid())
        AND role IN ('owner', 'admin', 'operator')
        AND status = 'active'
    );
$$;

REVOKE ALL ON FUNCTION private.can_manage_social_credentials() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_manage_social_credentials() TO authenticated, service_role;

-- Preserve the deployed unscoped RPC contract while targeting the NULL account
-- slot in the new three-column uniqueness constraint.
CREATE OR REPLACE FUNCTION public.upsert_social_credential(
  p_branch_id text,
  p_platform text,
  p_access_token text,
  p_app_id text DEFAULT NULL,
  p_app_secret text DEFAULT NULL,
  p_refresh_token text DEFAULT NULL,
  p_token_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_platform_user_id text DEFAULT NULL,
  p_platform_username text DEFAULT NULL,
  p_platform_metadata jsonb DEFAULT NULL,
  p_granted_scopes jsonb DEFAULT NULL,
  p_status text DEFAULT 'active'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_result public.social_credentials%ROWTYPE;
  v_key text := public.get_encryption_key();
  v_enc_secret text;
  v_enc_access text;
  v_enc_refresh text;
BEGIN
  IF NOT private.can_manage_social_credentials() THEN
    RAISE EXCEPTION 'Not authorized to manage social credentials' USING ERRCODE = '42501';
  END IF;
  IF p_platform NOT IN ('instagram','facebook','x','linkedin','tiktok','youtube') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid platform: ' || p_platform);
  END IF;

  IF p_app_secret IS NOT NULL THEN
    v_enc_secret := encode(pgp_sym_encrypt(p_app_secret, v_key), 'base64');
  END IF;
  IF p_access_token IS NOT NULL THEN
    v_enc_access := encode(pgp_sym_encrypt(p_access_token, v_key), 'base64');
  END IF;
  IF p_refresh_token IS NOT NULL THEN
    v_enc_refresh := encode(pgp_sym_encrypt(p_refresh_token, v_key), 'base64');
  END IF;

  INSERT INTO public.social_credentials (
    branch_id, platform, branch_social_account_id, app_id, app_secret_encrypted,
    access_token_encrypted, refresh_token_encrypted, token_expires_at,
    platform_user_id, platform_username, platform_metadata, granted_scopes,
    status, is_valid, updated_at
  ) VALUES (
    p_branch_id, p_platform, NULL, COALESCE(p_app_id, ''), COALESCE(v_enc_secret, ''),
    v_enc_access, v_enc_refresh, p_token_expires_at,
    p_platform_user_id, p_platform_username,
    COALESCE(p_platform_metadata, '{}'::jsonb), COALESCE(p_granted_scopes, '[]'::jsonb),
    COALESCE(p_status, 'active'), true, now()
  )
  ON CONFLICT (branch_id, platform, branch_social_account_id) DO UPDATE SET
    app_id = COALESCE(NULLIF(p_app_id, ''), public.social_credentials.app_id),
    app_secret_encrypted = CASE WHEN v_enc_secret IS NOT NULL THEN v_enc_secret ELSE public.social_credentials.app_secret_encrypted END,
    access_token_encrypted = CASE WHEN v_enc_access IS NOT NULL THEN v_enc_access ELSE public.social_credentials.access_token_encrypted END,
    refresh_token_encrypted = CASE WHEN v_enc_refresh IS NOT NULL THEN v_enc_refresh ELSE public.social_credentials.refresh_token_encrypted END,
    token_expires_at = COALESCE(p_token_expires_at, public.social_credentials.token_expires_at),
    platform_user_id = COALESCE(p_platform_user_id, public.social_credentials.platform_user_id),
    platform_username = COALESCE(p_platform_username, public.social_credentials.platform_username),
    platform_metadata = CASE WHEN p_platform_metadata IS NOT NULL THEN public.social_credentials.platform_metadata || p_platform_metadata ELSE public.social_credentials.platform_metadata END,
    granted_scopes = COALESCE(p_granted_scopes, public.social_credentials.granted_scopes),
    status = COALESCE(p_status, public.social_credentials.status),
    is_valid = true,
    last_refreshed_at = CASE WHEN p_access_token IS NOT NULL THEN now() ELSE public.social_credentials.last_refreshed_at END,
    updated_at = now()
  RETURNING * INTO v_result;

  RETURN jsonb_build_object(
    'success', true,
    'credential_id', v_result.id,
    'branch_id', v_result.branch_id,
    'platform', v_result.platform,
    'status', v_result.status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_social_credential(text,text,text,text,text,text,timestamptz,text,text,jsonb,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_social_credential(text,text,text,text,text,text,timestamptz,text,text,jsonb,jsonb,text) TO authenticated, service_role;

-- Account-scoped write path used by YouTube OAuth. The immutable channel ID in
-- branch_social_accounts is the expected identity for callback verification.
CREATE OR REPLACE FUNCTION public.upsert_social_account_credential(
  p_branch_id text,
  p_platform text,
  p_branch_social_account_id uuid,
  p_access_token text DEFAULT NULL,
  p_app_id text DEFAULT NULL,
  p_app_secret text DEFAULT NULL,
  p_refresh_token text DEFAULT NULL,
  p_token_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_platform_user_id text DEFAULT NULL,
  p_platform_username text DEFAULT NULL,
  p_platform_metadata jsonb DEFAULT NULL,
  p_granted_scopes jsonb DEFAULT NULL,
  p_status text DEFAULT 'active'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_account public.branch_social_accounts%ROWTYPE;
  v_result public.social_credentials%ROWTYPE;
  v_key text := public.get_encryption_key();
  v_enc_secret text;
  v_enc_access text;
  v_enc_refresh text;
BEGIN
  IF NOT private.can_manage_social_credentials() THEN
    RAISE EXCEPTION 'Not authorized to manage social credentials' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_account
  FROM public.branch_social_accounts
  WHERE id = p_branch_social_account_id
    AND branch_id::text = p_branch_id
    AND platform = p_platform
    AND status <> 'revoked';

  IF v_account.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Social account does not belong to this branch/platform');
  END IF;

  IF p_platform <> 'youtube' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Account-scoped OAuth currently supports YouTube only');
  END IF;

  IF p_platform_user_id IS NOT NULL AND p_platform_user_id <> v_account.external_account_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Authorized YouTube channel does not match the selected account',
      'expected_channel_id', v_account.external_account_id,
      'actual_channel_id', p_platform_user_id
    );
  END IF;

  IF p_app_secret IS NOT NULL THEN
    v_enc_secret := encode(pgp_sym_encrypt(p_app_secret, v_key), 'base64');
  END IF;
  IF p_access_token IS NOT NULL THEN
    v_enc_access := encode(pgp_sym_encrypt(p_access_token, v_key), 'base64');
  END IF;
  IF p_refresh_token IS NOT NULL THEN
    v_enc_refresh := encode(pgp_sym_encrypt(p_refresh_token, v_key), 'base64');
  END IF;

  INSERT INTO public.social_credentials (
    branch_id, platform, branch_social_account_id, app_id, app_secret_encrypted,
    access_token_encrypted, refresh_token_encrypted, token_expires_at,
    platform_user_id, platform_username, platform_metadata, granted_scopes,
    status, is_valid, updated_at
  ) VALUES (
    p_branch_id, p_platform, p_branch_social_account_id,
    COALESCE(p_app_id, ''), COALESCE(v_enc_secret, ''),
    v_enc_access, v_enc_refresh, p_token_expires_at,
    p_platform_user_id, p_platform_username,
    COALESCE(p_platform_metadata, '{}'::jsonb), COALESCE(p_granted_scopes, '[]'::jsonb),
    COALESCE(p_status, 'active'), true, now()
  )
  ON CONFLICT (branch_id, platform, branch_social_account_id) DO UPDATE SET
    app_id = COALESCE(NULLIF(p_app_id, ''), public.social_credentials.app_id),
    app_secret_encrypted = CASE WHEN v_enc_secret IS NOT NULL THEN v_enc_secret ELSE public.social_credentials.app_secret_encrypted END,
    access_token_encrypted = CASE WHEN v_enc_access IS NOT NULL THEN v_enc_access ELSE public.social_credentials.access_token_encrypted END,
    refresh_token_encrypted = CASE WHEN v_enc_refresh IS NOT NULL THEN v_enc_refresh ELSE public.social_credentials.refresh_token_encrypted END,
    token_expires_at = COALESCE(p_token_expires_at, public.social_credentials.token_expires_at),
    platform_user_id = COALESCE(p_platform_user_id, public.social_credentials.platform_user_id),
    platform_username = COALESCE(p_platform_username, public.social_credentials.platform_username),
    platform_metadata = CASE WHEN p_platform_metadata IS NOT NULL THEN public.social_credentials.platform_metadata || p_platform_metadata ELSE public.social_credentials.platform_metadata END,
    granted_scopes = COALESCE(p_granted_scopes, public.social_credentials.granted_scopes),
    status = COALESCE(p_status, public.social_credentials.status),
    is_valid = true,
    last_refreshed_at = CASE WHEN p_access_token IS NOT NULL THEN now() ELSE public.social_credentials.last_refreshed_at END,
    updated_at = now()
  RETURNING * INTO v_result;

  UPDATE public.branch_social_accounts SET
    status = CASE
      WHEN v_result.status = 'active' THEN 'active'
      WHEN v_result.status = 'error' THEN 'error'
      ELSE 'pending'
    END,
    metadata = metadata || jsonb_build_object('credential_id', v_result.id),
    updated_at = now()
  WHERE id = p_branch_social_account_id;

  RETURN jsonb_build_object(
    'success', true,
    'credential_id', v_result.id,
    'branch_social_account_id', p_branch_social_account_id,
    'branch_id', v_result.branch_id,
    'platform', v_result.platform,
    'expected_external_account_id', v_account.external_account_id,
    'status', v_result.status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_social_account_credential(text,text,uuid,text,text,text,text,timestamptz,text,text,jsonb,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_social_account_credential(text,text,uuid,text,text,text,text,timestamptz,text,text,jsonb,jsonb,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_social_account_credential(
  p_branch_id text,
  p_platform text,
  p_branch_social_account_id uuid,
  p_encryption_key text DEFAULT public.get_encryption_key()
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_row public.social_credentials%ROWTYPE;
  v_account public.branch_social_accounts%ROWTYPE;
  v_decrypted_secret text;
  v_decrypted_access text;
  v_decrypted_refresh text;
BEGIN
  IF COALESCE((SELECT auth.jwt()->>'role'), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row
  FROM public.social_credentials
  WHERE branch_id = p_branch_id
    AND platform = p_platform
    AND branch_social_account_id = p_branch_social_account_id;

  SELECT * INTO v_account
  FROM public.branch_social_accounts
  WHERE id = p_branch_social_account_id
    AND branch_id::text = p_branch_id
    AND platform = p_platform;

  IF v_row.id IS NULL OR v_account.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No account-scoped credential found');
  END IF;

  IF v_row.app_secret_encrypted IS NOT NULL AND v_row.app_secret_encrypted <> '' THEN
    v_decrypted_secret := pgp_sym_decrypt(decode(v_row.app_secret_encrypted, 'base64'), p_encryption_key);
  END IF;
  IF v_row.access_token_encrypted IS NOT NULL AND v_row.access_token_encrypted <> '' THEN
    v_decrypted_access := pgp_sym_decrypt(decode(v_row.access_token_encrypted, 'base64'), p_encryption_key);
  END IF;
  IF v_row.refresh_token_encrypted IS NOT NULL AND v_row.refresh_token_encrypted <> '' THEN
    v_decrypted_refresh := pgp_sym_decrypt(decode(v_row.refresh_token_encrypted, 'base64'), p_encryption_key);
  END IF;

  UPDATE public.social_credentials SET last_used_at = now() WHERE id = v_row.id;

  RETURN jsonb_build_object(
    'success', true,
    'credential_id', v_row.id,
    'branch_social_account_id', v_row.branch_social_account_id,
    'branch_id', v_row.branch_id,
    'platform', v_row.platform,
    'expected_external_account_id', v_account.external_account_id,
    'expected_handle', v_account.handle,
    'app_id', v_row.app_id,
    'app_secret', v_decrypted_secret,
    'access_token', v_decrypted_access,
    'refresh_token', v_decrypted_refresh,
    'token_expires_at', v_row.token_expires_at,
    'platform_user_id', v_row.platform_user_id,
    'platform_username', v_row.platform_username,
    'platform_metadata', v_row.platform_metadata,
    'granted_scopes', v_row.granted_scopes,
    'status', v_row.status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_social_account_credential(text,text,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_social_account_credential(text,text,uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.revoke_social_account_credential(
  p_branch_id text,
  p_branch_social_account_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT private.can_manage_social_credentials() THEN
    RAISE EXCEPTION 'Not authorized to manage social credentials' USING ERRCODE = '42501';
  END IF;

  UPDATE public.social_credentials SET
    access_token_encrypted = NULL,
    refresh_token_encrypted = NULL,
    token_expires_at = NULL,
    status = 'revoked',
    platform_metadata = COALESCE(platform_metadata, '{}'::jsonb) || jsonb_build_object('revoked_at', now()::text),
    updated_at = now()
  WHERE branch_id = p_branch_id
    AND branch_social_account_id = p_branch_social_account_id
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No account-scoped credential found to revoke');
  END IF;

  UPDATE public.branch_social_accounts SET
    status = 'registered',
    updated_at = now()
  WHERE id = p_branch_social_account_id AND branch_id::text = p_branch_id;

  RETURN jsonb_build_object('success', true, 'credential_id', v_id, 'status', 'revoked');
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_social_account_credential(text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_social_account_credential(text,uuid) TO authenticated, service_role;

-- Non-secret status payload now carries account identity so the UI can
-- distinguish two YouTube rows under the same branch.
CREATE OR REPLACE FUNCTION public.list_social_connections(p_branch_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT private.can_manage_social_credentials() THEN
    RAISE EXCEPTION 'Not authorized to list social credentials' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', sc.id,
          'branch_social_account_id', sc.branch_social_account_id,
          'platform', sc.platform,
          'platform_user_id', sc.platform_user_id,
          'platform_username', sc.platform_username,
          'app_id', sc.app_id,
          'status', sc.status,
          'has_app_secret', (sc.app_secret_encrypted IS NOT NULL AND sc.app_secret_encrypted <> ''),
          'platform_metadata', sc.platform_metadata,
          'granted_scopes', sc.granted_scopes,
          'last_used_at', sc.last_used_at,
          'last_refreshed_at', sc.last_refreshed_at,
          'token_expires_at', sc.token_expires_at,
          'created_at', sc.created_at,
          'updated_at', sc.updated_at
        ) ORDER BY sc.platform, sc.created_at
      )
      FROM public.social_credentials sc
      WHERE sc.branch_id = p_branch_id
    ),
    '[]'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_social_connections(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_social_connections(text) TO authenticated, service_role;


-- 10D. NARROW ACCOUNT-CREDENTIAL WRITE SURFACE
-- Browsers may save developer-app credentials, but only the service-role OAuth
-- callback may write access/refresh tokens.
REVOKE ALL ON FUNCTION public.upsert_social_account_credential(text,text,uuid,text,text,text,text,timestamptz,text,text,jsonb,jsonb,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_social_account_credential(text,text,uuid,text,text,text,text,timestamptz,text,text,jsonb,jsonb,text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.save_social_account_app_credentials(
  p_branch_id text,
  p_platform text,
  p_branch_social_account_id uuid,
  p_app_id text,
  p_app_secret text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_account public.branch_social_accounts%ROWTYPE;
  v_result public.social_credentials%ROWTYPE;
  v_enc_secret text;
BEGIN
  IF NOT private.can_manage_social_credentials() THEN
    RAISE EXCEPTION 'Not authorized to manage social credentials' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(trim(p_app_id), '') = '' OR COALESCE(trim(p_app_secret), '') = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'OAuth Client ID and Client Secret are required');
  END IF;

  SELECT * INTO v_account
  FROM public.branch_social_accounts
  WHERE id = p_branch_social_account_id
    AND branch_id::text = p_branch_id
    AND platform = p_platform
    AND status <> 'revoked';

  IF v_account.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Social account does not belong to this branch/platform');
  END IF;
  IF p_platform <> 'youtube' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Account-scoped OAuth currently supports YouTube only');
  END IF;

  v_enc_secret := encode(pgp_sym_encrypt(trim(p_app_secret), public.get_encryption_key()), 'base64');

  INSERT INTO public.social_credentials (
    branch_id, platform, branch_social_account_id, app_id, app_secret_encrypted,
    status, is_valid, updated_at
  ) VALUES (
    p_branch_id, p_platform, p_branch_social_account_id, trim(p_app_id), v_enc_secret,
    'pending', true, now()
  )
  ON CONFLICT (branch_id, platform, branch_social_account_id) DO UPDATE SET
    app_id = EXCLUDED.app_id,
    app_secret_encrypted = EXCLUDED.app_secret_encrypted,
    status = 'pending',
    is_valid = true,
    updated_at = now()
  RETURNING * INTO v_result;

  UPDATE public.branch_social_accounts SET
    status = 'pending',
    metadata = metadata || jsonb_build_object('credential_id', v_result.id),
    updated_at = now()
  WHERE id = p_branch_social_account_id;

  RETURN jsonb_build_object(
    'success', true,
    'credential_id', v_result.id,
    'branch_social_account_id', p_branch_social_account_id,
    'platform', p_platform,
    'status', 'pending'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_social_account_app_credentials(text,text,uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_social_account_app_credentials(text,text,uuid,text,text) TO authenticated, service_role;


-- 11. MARKETING CAMPAIGN GENERATOR: AI GENERATION LOG
CREATE TABLE IF NOT EXISTS marketing_generations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  brand_id UUID REFERENCES marketing_brands(id) ON DELETE SET NULL,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL,
  generation_type TEXT NOT NULL CHECK (generation_type IN (
    'positioning', 'lead_magnet_outline', 'lead_magnet_content',
    'ad_copy', 'email_sequence', 'competitive_analysis'
  )),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_hash TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_estimate DECIMAL(10, 6),
  duration_ms INTEGER,
  status TEXT DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'cached')),
  output JSONB NOT NULL,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_gen_campaign ON marketing_generations (campaign_id);
CREATE INDEX IF NOT EXISTS idx_marketing_gen_type ON marketing_generations (generation_type);
CREATE INDEX IF NOT EXISTS idx_marketing_gen_created ON marketing_generations (created_at DESC);
ALTER TABLE marketing_generations ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT ON marketing_generations TO authenticated;
DROP POLICY IF EXISTS "Service Role Full Access" ON marketing_generations;
CREATE POLICY "Service Role Full Access" ON marketing_generations FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Active Trellis users read marketing generations" ON marketing_generations;
CREATE POLICY "Active Trellis users read marketing generations" ON marketing_generations FOR SELECT TO authenticated USING ((SELECT private.is_active_trellis_user()));
DROP POLICY IF EXISTS "Marketing operators create marketing generations" ON marketing_generations;
CREATE POLICY "Marketing operators create marketing generations" ON marketing_generations FOR INSERT TO authenticated WITH CHECK ((SELECT private.can_manage_marketing()));

-- 14. SPOKE CONNECTIONS (Federated Data Sources)
CREATE TABLE IF NOT EXISTS spoke_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  name TEXT NOT NULL,
  supabase_url TEXT NOT NULL,
  supabase_key TEXT NOT NULL,
  tables JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disconnected', 'error')),
  last_tested_at TIMESTAMPTZ,
  last_error TEXT,
  branch_skipped BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE spoke_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service Role Full Access" ON spoke_connections FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Anon Full Access" ON spoke_connections FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_spoke_connections_org ON spoke_connections (organization_id);

-- 14b. POSTHOG CONNECTIONS (Federated Product Analytics)
-- Raw clickstream/session data remains in PostHog. The Hub stores only secure
-- connection metadata, hourly aggregate snapshots, and allowlisted milestones.
CREATE TABLE IF NOT EXISTS posthog_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  host_url TEXT NOT NULL CHECK (host_url ~ '^https://[^/]+$'),
  project_id TEXT NOT NULL CHECK (project_id ~ '^[0-9]+$'),
  api_key_ciphertext TEXT NOT NULL,
  api_key_preview TEXT NOT NULL,
  webhook_secret_hash TEXT NOT NULL,
  allowed_events JSONB NOT NULL DEFAULT '["user_signed_up","account_created","onboarding_completed","activation_milestone_reached","core_feature_milestone","meaningful_return"]'::jsonb CHECK (jsonb_typeof(allowed_events) = 'array'),
  allowed_properties JSONB NOT NULL DEFAULT '["platform","feature","milestone","app_version","return_interval_bucket"]'::jsonb CHECK (jsonb_typeof(allowed_properties) = 'array'),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','error','disconnected')),
  last_successful_query_at TIMESTAMPTZ,
  last_event_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, branch_id)
);

CREATE TABLE IF NOT EXISTS posthog_metric_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  connection_id UUID NOT NULL REFERENCES posthog_connections(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  metric_key TEXT NOT NULL DEFAULT 'product_analytics_summary',
  window_days INTEGER NOT NULL CHECK (window_days IN (7, 30, 90)),
  result JSONB NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  source TEXT NOT NULL DEFAULT 'posthog' CHECK (source = 'posthog'),
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_posthog_connections_branch ON posthog_connections (branch_id);
CREATE INDEX IF NOT EXISTS idx_posthog_snapshots_lookup ON posthog_metric_snapshots (connection_id, metric_key, window_days, fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_posthog_snapshots_branch ON posthog_metric_snapshots (branch_id, fetched_at DESC);

ALTER TABLE posthog_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE posthog_metric_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON posthog_connections FROM PUBLIC, anon, authenticated;
REVOKE ALL ON posthog_metric_snapshots FROM PUBLIC, anon, authenticated;
GRANT ALL ON posthog_connections TO service_role;
GRANT ALL ON posthog_metric_snapshots TO service_role;
DROP POLICY IF EXISTS "Service Role Only" ON posthog_connections;
CREATE POLICY "Service Role Only" ON posthog_connections FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service Role Only" ON posthog_metric_snapshots;
CREATE POLICY "Service Role Only" ON posthog_metric_snapshots FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION ingest_posthog_event(
  p_event_id TEXT,
  p_connection_id UUID,
  p_event_type TEXT,
  p_source_site TEXT,
  p_branch_user_id TEXT,
  p_email TEXT,
  p_occurred_at TIMESTAMPTZ,
  p_properties JSONB
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_profile_id UUID;
  v_inserted INTEGER;
BEGIN
  INSERT INTO processed_events (event_id, processed_at) VALUES (p_event_id, now()) ON CONFLICT (event_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN RETURN jsonb_build_object('duplicate', true, 'profile_matched', false); END IF;

  IF NULLIF(lower(trim(p_email)), '') IS NOT NULL THEN
    SELECT id INTO v_profile_id FROM profiles WHERE lower(email) = lower(trim(p_email)) LIMIT 1;
  END IF;

  INSERT INTO marketing_events (profile_id, event_type, source, payload, created_at)
  VALUES (v_profile_id, p_event_type, 'posthog', jsonb_build_object(
    'external_event_id', p_event_id, 'connection_id', p_connection_id,
    'source_site', p_source_site, 'branch_user_id', p_branch_user_id,
    'email', NULLIF(lower(trim(p_email)), ''), 'properties', COALESCE(p_properties, '{}'::jsonb)
  ), COALESCE(p_occurred_at, now()));

  UPDATE posthog_connections SET last_event_at=now(), last_error=NULL, status='active', updated_at=now() WHERE id=p_connection_id;
  RETURN jsonb_build_object('duplicate', false, 'profile_matched', v_profile_id IS NOT NULL, 'profile_id', v_profile_id);
END;
$$;
REVOKE ALL ON FUNCTION ingest_posthog_event(TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION ingest_posthog_event(TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, JSONB) TO service_role;

CREATE OR REPLACE FUNCTION prune_posthog_metric_snapshots()
RETURNS INTEGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_deleted INTEGER;
BEGIN
  DELETE FROM posthog_metric_snapshots WHERE fetched_at < now() - INTERVAL '90 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;
REVOKE ALL ON FUNCTION prune_posthog_metric_snapshots() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION prune_posthog_metric_snapshots() TO service_role;

-- 15. EMAIL TEMPLATES (Brand Intelligence — Email Builder)
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  branch_id TEXT REFERENCES branches(id) ON DELETE CASCADE,
  brand_identity_id UUID REFERENCES brand_identities(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  thumbnail_url TEXT,
  html_body TEXT NOT NULL DEFAULT '',
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS on: the anon key ships in the browser bundle, and template bodies are the
-- content that goes out over the sending domain. Signed-in operators hit Postgres
-- as the authenticated role, so it keeps full access; service_role bypasses RLS.
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS trellis_operators_all ON email_templates;
CREATE POLICY trellis_operators_all ON email_templates
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
REVOKE ALL ON email_templates FROM anon;

CREATE INDEX IF NOT EXISTS idx_email_templates_branch ON email_templates (branch_id);
CREATE INDEX IF NOT EXISTS idx_email_templates_brand ON email_templates (brand_identity_id);

-- 16. MUSIC GENERATIONS (Trellis Studio — AI music generation via Lyria)
CREATE TABLE IF NOT EXISTS music_generations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID,
  branch TEXT NOT NULL,
  created_by UUID,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  final_prompt TEXT,
  genre TEXT,
  mood TEXT,
  vocal_style TEXT,
  duration_seconds INTEGER,
  provider TEXT NOT NULL DEFAULT 'google',
  model TEXT,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','generating','completed','failed','archived')),
  progress INTEGER DEFAULT 0,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  storage_bucket TEXT,
  storage_path TEXT,
  audio_url TEXT,
  audio_mime_type TEXT,
  file_size_bytes BIGINT,
  cost_estimate NUMERIC DEFAULT 0,
  generation_started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE music_generations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon Full Access" ON music_generations FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated Full Access" ON music_generations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Service Role Full Access" ON music_generations FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT ALL ON music_generations TO anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_music_generations_branch ON music_generations (branch);
CREATE INDEX IF NOT EXISTS idx_music_generations_status ON music_generations (status);
CREATE INDEX IF NOT EXISTS idx_music_generations_created_at ON music_generations (created_at DESC);

-- 17. TRELLIS SESSIONS (multi-track music sessions → stitched master)
CREATE TABLE IF NOT EXISTS trellis_music_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch TEXT,
  created_by UUID,
  title TEXT NOT NULL,
  target_duration_seconds INTEGER DEFAULT 3600,
  actual_duration_seconds INTEGER,
  genre TEXT,
  mood TEXT,
  track_count INTEGER DEFAULT 5,
  avg_track_length_seconds INTEGER DEFAULT 180,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','planning','planned','generating','review','stitching','ready','failed','archived')),
  final_audio_url TEXT,
  storage_bucket TEXT,
  storage_path TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trellis_music_tracks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES trellis_music_sessions(id) ON DELETE CASCADE,
  track_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  prompt TEXT NOT NULL,
  final_prompt TEXT,
  genre TEXT,
  mood TEXT,
  vocal_style TEXT,
  duration_seconds INTEGER,
  provider TEXT NOT NULL DEFAULT 'google',
  model TEXT,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned','queued','generating','completed','failed')),
  approved BOOLEAN DEFAULT false,
  storage_bucket TEXT,
  storage_path TEXT,
  audio_url TEXT,
  audio_mime_type TEXT,
  file_size_bytes BIGINT,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trellis_music_renders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id UUID NOT NULL REFERENCES trellis_music_sessions(id) ON DELETE CASCADE,
  render_type TEXT NOT NULL DEFAULT 'master' CHECK (render_type IN ('master','preview')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','ready','failed')),
  track_ids JSONB DEFAULT '[]'::jsonb,
  final_audio_url TEXT,
  storage_bucket TEXT,
  storage_path TEXT,
  duration_seconds INTEGER,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE trellis_music_renders ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

ALTER TABLE trellis_music_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE trellis_music_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE trellis_music_renders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon Full Access" ON trellis_music_sessions FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated Full Access" ON trellis_music_sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Service Role Full Access" ON trellis_music_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Anon Full Access" ON trellis_music_tracks FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated Full Access" ON trellis_music_tracks FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Service Role Full Access" ON trellis_music_tracks FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Anon Full Access" ON trellis_music_renders FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated Full Access" ON trellis_music_renders FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Service Role Full Access" ON trellis_music_renders FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT ALL ON trellis_music_sessions TO anon, authenticated, service_role;
GRANT ALL ON trellis_music_tracks TO anon, authenticated, service_role;
GRANT ALL ON trellis_music_renders TO anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_tms_branch ON trellis_music_sessions (branch);
CREATE INDEX IF NOT EXISTS idx_tms_status ON trellis_music_sessions (status);
CREATE INDEX IF NOT EXISTS idx_tmt_session ON trellis_music_tracks (session_id, track_number);
CREATE INDEX IF NOT EXISTS idx_tmr_session ON trellis_music_renders (session_id);

CREATE OR REPLACE FUNCTION claim_trellis_music_track(
  p_session_id UUID,
  p_track_id UUID DEFAULT NULL
) RETURNS SETOF trellis_music_tracks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH candidate AS (
    SELECT id
    FROM trellis_music_tracks
    WHERE (
      p_track_id IS NOT NULL
      AND id = p_track_id
      AND status = 'queued'
    ) OR (
      p_track_id IS NULL
      AND session_id = p_session_id
      AND status = 'queued'
    )
    ORDER BY track_number
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  UPDATE trellis_music_tracks t
  SET status = 'generating',
      error_message = NULL,
      updated_at = NOW()
  FROM candidate
  WHERE t.id = candidate.id
  RETURNING t.*;
END;
$$;

-- Claimed only by the generate-session-track Edge Function (service_role). Functions
-- grant EXECUTE to PUBLIC by default, so PUBLIC must be revoked explicitly — revoking
-- anon alone is a no-op while PUBLIC still holds it.
REVOKE ALL ON FUNCTION claim_trellis_music_track(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION claim_trellis_music_track(UUID, UUID) TO service_role;

-- 17b. STUDIO ALBUMS (isolated production pipeline; does not alter legacy sessions)
CREATE TABLE IF NOT EXISTS studio_feature_flags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), organization_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  key TEXT NOT NULL, enabled BOOLEAN NOT NULL DEFAULT false, enabled_for_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (organization_id, key)
);
INSERT INTO studio_feature_flags (organization_id, key, enabled) VALUES ('00000000-0000-0000-0000-000000000001', 'studio_music_enabled', false) ON CONFLICT (organization_id, key) DO NOTHING;
CREATE TABLE IF NOT EXISTS studio_albums (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), organization_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001', created_by UUID NOT NULL,
  title TEXT NOT NULL, artist_name TEXT NOT NULL, description TEXT, genre TEXT, mood TEXT, era TEXT, theme TEXT,
  style_preset_id TEXT, style_profile JSONB NOT NULL DEFAULT '{}'::jsonb, vocal_direction TEXT NOT NULL DEFAULT 'instrumental',
  target_duration_seconds INTEGER NOT NULL CHECK (target_duration_seconds > 0), actual_duration_seconds INTEGER,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','planning','generating','review','mastering','master_review','visuals','video','metadata','ready_to_publish','published','failed','archived','track_planning','track_generation','track_review','release_identity','artwork_review','animation_review','video_rendering','video_review','metadata_review','publishing')),
  music_generation_status TEXT NOT NULL DEFAULT 'not_started' CHECK (music_generation_status IN ('not_started','queued','processing','complete','failed')),
  master_status TEXT NOT NULL DEFAULT 'not_started' CHECK (master_status IN ('not_started','queued','processing','pending_review','approved','failed')),
  artwork_status TEXT NOT NULL DEFAULT 'not_started' CHECK (artwork_status IN ('not_started','queued','processing','approved','failed')),
  video_status TEXT NOT NULL DEFAULT 'not_started' CHECK (video_status IN ('not_started','queued','processing','pending_review','approved','failed')),
  metadata_status TEXT NOT NULL DEFAULT 'not_started' CHECK (metadata_status IN ('not_started','queued','processing','approved','failed')),
  publishing_status TEXT NOT NULL DEFAULT 'not_started' CHECK (publishing_status IN ('not_started','ready','submitted','published','failed')),
  release_subtitle TEXT, series_name TEXT, subgenre TEXT, short_description TEXT, credits TEXT, ai_disclosure TEXT, copyright_note TEXT, catalog_number TEXT,
  release_identity_status TEXT NOT NULL DEFAULT 'not_started' CHECK (release_identity_status IN ('not_started','draft','approved')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS studio_tracks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), album_id UUID NOT NULL REFERENCES studio_albums(id) ON DELETE CASCADE, track_number INTEGER NOT NULL CHECK (track_number > 0),
  title TEXT NOT NULL, narrative_purpose TEXT, energy SMALLINT CHECK (energy BETWEEN 1 AND 10), instrumentation TEXT, vocal_direction TEXT, prompt TEXT, lyrics TEXT,
  generation_provider TEXT, generation_model TEXT, provider_generation_id TEXT, duration_seconds INTEGER, source_audio_path TEXT,
  review_status TEXT NOT NULL DEFAULT 'planned' CHECK (review_status IN ('planned','generated','pending_review','approved','rejected','regenerating','locked','failed')),
  approved_at TIMESTAMPTZ, rejection_reason TEXT, included_in_master BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (album_id, track_number)
);
CREATE TABLE IF NOT EXISTS studio_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), album_id UUID NOT NULL REFERENCES studio_albums(id) ON DELETE CASCADE, track_id UUID REFERENCES studio_tracks(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('track_audio','master_mp3','master_wav','cover_art','thumbnail','scene_image','scene_loop','final_video','logo_overlay','cta_overlay','waveform')),
  storage_bucket TEXT NOT NULL DEFAULT 'studio-assets', storage_path TEXT NOT NULL, mime_type TEXT, file_size BIGINT, duration_seconds INTEGER, width INTEGER, height INTEGER,
  version INTEGER NOT NULL DEFAULT 1, status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('pending','processing','active','failed','archived')),
  error_message TEXT, metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS studio_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(), album_id UUID NOT NULL REFERENCES studio_albums(id) ON DELETE CASCADE, track_id UUID REFERENCES studio_tracks(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL CHECK (job_type IN ('track_plan','track_generation','master_audio','cover_art','scene_loop','video_render','metadata','publishing_handoff')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','completed','failed','cancelled')), progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100), provider TEXT, attempt_count INTEGER NOT NULL DEFAULT 0, error_message TEXT,
  input_json JSONB NOT NULL DEFAULT '{}'::jsonb, output_json JSONB NOT NULL DEFAULT '{}'::jsonb, started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE studio_albums ADD COLUMN IF NOT EXISTS style_preset_id TEXT;
ALTER TABLE studio_albums ADD COLUMN IF NOT EXISTS style_profile JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE studio_albums ADD COLUMN IF NOT EXISTS release_subtitle TEXT;
ALTER TABLE studio_albums ADD COLUMN IF NOT EXISTS series_name TEXT;
ALTER TABLE studio_albums ADD COLUMN IF NOT EXISTS subgenre TEXT;
ALTER TABLE studio_albums ADD COLUMN IF NOT EXISTS short_description TEXT;
ALTER TABLE studio_albums ADD COLUMN IF NOT EXISTS credits TEXT;
ALTER TABLE studio_albums ADD COLUMN IF NOT EXISTS ai_disclosure TEXT;
ALTER TABLE studio_albums ADD COLUMN IF NOT EXISTS copyright_note TEXT;
ALTER TABLE studio_albums ADD COLUMN IF NOT EXISTS catalog_number TEXT;
ALTER TABLE studio_albums ADD COLUMN IF NOT EXISTS release_identity_status TEXT NOT NULL DEFAULT 'not_started';
ALTER TABLE studio_albums DROP CONSTRAINT IF EXISTS studio_albums_status_check;
ALTER TABLE studio_albums ADD CONSTRAINT studio_albums_status_check CHECK (status IN ('draft','planning','generating','review','mastering','master_review','visuals','video','metadata','ready_to_publish','published','failed','archived','track_planning','track_generation','track_review','release_identity','artwork_review','animation_review','video_rendering','video_review','metadata_review','publishing'));
ALTER TABLE studio_albums DROP CONSTRAINT IF EXISTS studio_albums_master_status_check;
ALTER TABLE studio_albums ADD CONSTRAINT studio_albums_master_status_check CHECK (master_status IN ('not_started','queued','processing','pending_review','approved','failed'));
ALTER TABLE studio_albums DROP CONSTRAINT IF EXISTS studio_albums_video_status_check;
ALTER TABLE studio_albums ADD CONSTRAINT studio_albums_video_status_check CHECK (video_status IN ('not_started','queued','processing','pending_review','approved','failed'));
ALTER TABLE studio_albums DROP CONSTRAINT IF EXISTS studio_albums_release_identity_status_check;
ALTER TABLE studio_albums ADD CONSTRAINT studio_albums_release_identity_status_check CHECK (release_identity_status IN ('not_started','draft','approved'));
ALTER TABLE studio_assets ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE studio_assets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE studio_tracks ADD COLUMN IF NOT EXISTS included_in_master BOOLEAN NOT NULL DEFAULT TRUE;
CREATE INDEX IF NOT EXISTS idx_studio_albums_org_updated ON studio_albums (organization_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_studio_albums_style_preset ON studio_albums (style_preset_id);
CREATE INDEX IF NOT EXISTS idx_studio_tracks_album_order ON studio_tracks (album_id, track_number);
CREATE INDEX IF NOT EXISTS idx_studio_assets_album ON studio_assets (album_id, asset_type);
CREATE INDEX IF NOT EXISTS idx_studio_jobs_album_status ON studio_jobs (album_id, status, created_at);
DROP INDEX IF EXISTS idx_studio_one_active_job_per_type;
WITH duplicate_active_studio_track_jobs AS (SELECT id, ROW_NUMBER() OVER (PARTITION BY album_id, job_type, track_id ORDER BY created_at DESC, id DESC) AS position FROM studio_jobs WHERE status IN ('queued', 'processing') AND track_id IS NOT NULL)
UPDATE studio_jobs SET status = 'cancelled', error_message = COALESCE(error_message, 'Superseded while enforcing one active Studio job per track.'), completed_at = NOW(), updated_at = NOW() WHERE id IN (SELECT id FROM duplicate_active_studio_track_jobs WHERE position > 1);
WITH duplicate_active_studio_album_jobs AS (SELECT id, ROW_NUMBER() OVER (PARTITION BY album_id, job_type ORDER BY created_at DESC, id DESC) AS position FROM studio_jobs WHERE status IN ('queued', 'processing') AND track_id IS NULL)
UPDATE studio_jobs SET status = 'cancelled', error_message = COALESCE(error_message, 'Superseded while enforcing one active Studio album job per type.'), completed_at = NOW(), updated_at = NOW() WHERE id IN (SELECT id FROM duplicate_active_studio_album_jobs WHERE position > 1);
CREATE UNIQUE INDEX IF NOT EXISTS idx_studio_one_active_track_job ON studio_jobs (album_id, job_type, track_id) WHERE status IN ('queued', 'processing') AND track_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_studio_one_active_album_job ON studio_jobs (album_id, job_type) WHERE status IN ('queued', 'processing') AND track_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_studio_feature_flags_users ON studio_feature_flags USING GIN (enabled_for_user_ids jsonb_path_ops);
INSERT INTO storage.buckets (id, name, public) VALUES ('studio-assets', 'studio-assets', false) ON CONFLICT (id) DO NOTHING;
ALTER TABLE studio_feature_flags ENABLE ROW LEVEL SECURITY; ALTER TABLE studio_albums ENABLE ROW LEVEL SECURITY; ALTER TABLE studio_tracks ENABLE ROW LEVEL SECURITY; ALTER TABLE studio_assets ENABLE ROW LEVEL SECURITY; ALTER TABLE studio_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role manages studio feature flags" ON studio_feature_flags; DROP POLICY IF EXISTS "Service role manages studio albums" ON studio_albums; DROP POLICY IF EXISTS "Service role manages studio tracks" ON studio_tracks; DROP POLICY IF EXISTS "Service role manages studio assets" ON studio_assets; DROP POLICY IF EXISTS "Service role manages studio jobs" ON studio_jobs;
CREATE POLICY "Service role manages studio feature flags" ON studio_feature_flags FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role manages studio albums" ON studio_albums FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role manages studio tracks" ON studio_tracks FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role manages studio assets" ON studio_assets FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role manages studio jobs" ON studio_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);
ALTER TABLE studio_tracks ADD COLUMN IF NOT EXISTS legacy_generation_id UUID REFERENCES trellis_music_tracks(id) ON DELETE SET NULL;
ALTER TABLE studio_tracks ADD COLUMN IF NOT EXISTS studio_asset_id UUID REFERENCES studio_assets(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_studio_tracks_legacy_generation ON studio_tracks (legacy_generation_id);
DROP POLICY IF EXISTS "Studio album owner can read albums" ON studio_albums; DROP POLICY IF EXISTS "Studio album owner can read tracks" ON studio_tracks; DROP POLICY IF EXISTS "Studio album owner can read assets" ON studio_assets; DROP POLICY IF EXISTS "Studio album owner can read jobs" ON studio_jobs;
CREATE POLICY "Studio album owner can read albums" ON studio_albums FOR SELECT TO authenticated USING (created_by = (select auth.uid()));
CREATE POLICY "Studio album owner can read tracks" ON studio_tracks FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM studio_albums a WHERE a.id = studio_tracks.album_id AND a.created_by = (select auth.uid())));
CREATE POLICY "Studio album owner can read assets" ON studio_assets FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM studio_albums a WHERE a.id = studio_assets.album_id AND a.created_by = (select auth.uid())));
CREATE POLICY "Studio album owner can read jobs" ON studio_jobs FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM studio_albums a WHERE a.id = studio_jobs.album_id AND a.created_by = (select auth.uid())));
DROP POLICY IF EXISTS "Studio album owner can read asset objects" ON storage.objects;
CREATE POLICY "Studio album owner can read asset objects" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'studio-assets' AND EXISTS (SELECT 1 FROM studio_assets asset JOIN studio_albums album ON album.id = asset.album_id WHERE asset.storage_bucket = storage.objects.bucket_id AND asset.storage_path = storage.objects.name AND album.created_by = (select auth.uid())));
GRANT SELECT ON studio_albums, studio_tracks, studio_assets, studio_jobs TO authenticated;

-- 18. TRELLIS EPISODES (top-level AI content production pipeline)
ALTER TABLE trellis_music_sessions ADD COLUMN IF NOT EXISTS episode_id UUID;

CREATE TABLE IF NOT EXISTS trellis_episodes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch TEXT,
  created_by UUID,
  title TEXT NOT NULL,
  show_name TEXT,
  theme TEXT,
  session_id UUID REFERENCES trellis_music_sessions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','music','master','artwork','video','metadata','publishing','published','archived','failed')),
  publish_status TEXT DEFAULT 'unpublished',
  youtube_url TEXT,
  analytics JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trellis_episode_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  episode_id UUID NOT NULL REFERENCES trellis_episodes(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('master_mp3','master_wav','cover_art','thumbnail','vertical','video_mp4')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','ready','failed')),
  approved BOOLEAN DEFAULT false,
  version INTEGER DEFAULT 1,
  storage_bucket TEXT,
  storage_path TEXT,
  url TEXT,
  width INTEGER,
  height INTEGER,
  duration_seconds INTEGER,
  file_size_bytes BIGINT,
  metadata JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trellis_episode_metadata (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  episode_id UUID NOT NULL REFERENCES trellis_episodes(id) ON DELETE CASCADE UNIQUE,
  title TEXT,
  description TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  chapters JSONB DEFAULT '[]'::jsonb,
  hashtags JSONB DEFAULT '[]'::jsonb,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft','ready','approved')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trellis_episode_publications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  episode_id UUID NOT NULL REFERENCES trellis_episodes(id) ON DELETE CASCADE,
  youtube_account_id UUID REFERENCES branch_social_accounts(id) ON DELETE RESTRICT,
  platform TEXT NOT NULL CHECK (platform IN ('youtube','spotify','apple_podcasts','rekkrd','social')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','uploading','processing','live','failed')),
  external_id TEXT,
  external_url TEXT,
  response JSONB DEFAULT '{}'::jsonb,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trellis_youtube_daily_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  episode_id UUID REFERENCES trellis_episodes(id) ON DELETE CASCADE,
  publication_id UUID REFERENCES trellis_episode_publications(id) ON DELETE CASCADE,
  youtube_video_id TEXT NOT NULL,
  metric_date DATE NOT NULL,
  views INTEGER DEFAULT 0,
  engaged_views INTEGER DEFAULT 0,
  estimated_minutes_watched NUMERIC DEFAULT 0,
  average_view_duration NUMERIC DEFAULT 0,
  average_view_percentage NUMERIC DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  subscribers_gained INTEGER DEFAULT 0,
  subscribers_lost INTEGER DEFAULT 0,
  traffic_sources JSONB DEFAULT '{}'::jsonb,
  countries JSONB DEFAULT '{}'::jsonb,
  raw JSONB DEFAULT '{}'::jsonb,
  synced_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (youtube_video_id, metric_date)
);
ALTER TABLE trellis_youtube_daily_metrics ADD COLUMN IF NOT EXISTS studio_album_id UUID REFERENCES studio_albums(id) ON DELETE CASCADE;
ALTER TABLE trellis_youtube_daily_metrics ADD COLUMN IF NOT EXISTS studio_publication_id UUID REFERENCES studio_publications(id) ON DELETE CASCADE;

ALTER TABLE trellis_episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE trellis_episode_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE trellis_episode_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE trellis_episode_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE trellis_youtube_daily_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon Full Access" ON trellis_episodes FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated Full Access" ON trellis_episodes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Service Role Full Access" ON trellis_episodes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Anon Full Access" ON trellis_episode_assets FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated Full Access" ON trellis_episode_assets FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Service Role Full Access" ON trellis_episode_assets FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Anon Full Access" ON trellis_episode_metadata FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated Full Access" ON trellis_episode_metadata FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Service Role Full Access" ON trellis_episode_metadata FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Anon Full Access" ON trellis_episode_publications FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated Full Access" ON trellis_episode_publications FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Service Role Full Access" ON trellis_episode_publications FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Anon Full Access" ON trellis_youtube_daily_metrics FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated Full Access" ON trellis_youtube_daily_metrics FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Service Role Full Access" ON trellis_youtube_daily_metrics FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT ALL ON trellis_episodes TO anon, authenticated, service_role;
GRANT ALL ON trellis_episode_assets TO anon, authenticated, service_role;
GRANT ALL ON trellis_episode_metadata TO anon, authenticated, service_role;
GRANT ALL ON trellis_episode_publications TO anon, authenticated, service_role;
GRANT ALL ON trellis_youtube_daily_metrics TO anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_tep_branch ON trellis_episodes (branch);
CREATE INDEX IF NOT EXISTS idx_tep_status ON trellis_episodes (status);
CREATE INDEX IF NOT EXISTS idx_tea_episode ON trellis_episode_assets (episode_id, asset_type);
CREATE INDEX IF NOT EXISTS idx_tepub_episode ON trellis_episode_publications (episode_id);
CREATE INDEX IF NOT EXISTS idx_tytm_episode ON trellis_youtube_daily_metrics (episode_id);
CREATE INDEX IF NOT EXISTS idx_tytm_publication ON trellis_youtube_daily_metrics (publication_id);
CREATE INDEX IF NOT EXISTS idx_tytm_video_date ON trellis_youtube_daily_metrics (youtube_video_id, metric_date DESC);
CREATE INDEX IF NOT EXISTS idx_tytm_studio_album ON trellis_youtube_daily_metrics (studio_album_id);
CREATE INDEX IF NOT EXISTS idx_tytm_studio_publication ON trellis_youtube_daily_metrics (studio_publication_id);

-- 19. CLIP STUDIO (short-form video: script → B-roll → publish)
CREATE TABLE IF NOT EXISTS trellis_clip_projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch TEXT,
  created_by UUID,
  title TEXT NOT NULL DEFAULT 'Untitled Short',
  hook_line TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','scripting','approved','broll','production','publishing','published','archived','failed')),
  format JSONB DEFAULT '{"kinds":[]}'::jsonb,
  steering TEXT,
  target_seconds INTEGER NOT NULL DEFAULT 60,
  rating SMALLINT CHECK (rating BETWEEN 1 AND 5),
  current_generation_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trellis_clip_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES trellis_clip_projects(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('url','pasted_text','file')),
  label TEXT NOT NULL,
  url TEXT,
  filename TEXT,
  raw_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trellis_clip_generations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES trellis_clip_projects(id) ON DELETE CASCADE,
  version INTEGER NOT NULL DEFAULT 1,
  model TEXT,
  script JSONB DEFAULT '[]'::jsonb,
  fact_checks JSONB DEFAULT '[]'::jsonb,
  hooks JSONB DEFAULT '[]'::jsonb,
  receipts JSONB DEFAULT '[]'::jsonb,
  formula TEXT,
  feedback_prompt TEXT,
  word_count INTEGER DEFAULT 0,
  est_seconds INTEGER DEFAULT 0,
  tokens_used INTEGER,
  is_current BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE trellis_clip_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE trellis_clip_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE trellis_clip_generations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon Full Access" ON trellis_clip_projects FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated Full Access" ON trellis_clip_projects FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Service Role Full Access" ON trellis_clip_projects FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Anon Full Access" ON trellis_clip_sources FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated Full Access" ON trellis_clip_sources FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Service Role Full Access" ON trellis_clip_sources FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Anon Full Access" ON trellis_clip_generations FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated Full Access" ON trellis_clip_generations FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Service Role Full Access" ON trellis_clip_generations FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT ALL ON trellis_clip_projects TO anon, authenticated, service_role;
GRANT ALL ON trellis_clip_sources TO anon, authenticated, service_role;
GRANT ALL ON trellis_clip_generations TO anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_tcp_branch ON trellis_clip_projects (branch);
CREATE INDEX IF NOT EXISTS idx_tcp_status ON trellis_clip_projects (status);
CREATE INDEX IF NOT EXISTS idx_tcs_project ON trellis_clip_sources (project_id);
CREATE INDEX IF NOT EXISTS idx_tcg_project ON trellis_clip_generations (project_id, version);

-- 20. CLIP STUDIO: B-ROLL, RENDER QUEUE, PUBLICATIONS (Phases C2-C4)
ALTER TABLE trellis_clip_projects ADD COLUMN IF NOT EXISTS final_video_url TEXT;

CREATE TABLE IF NOT EXISTS trellis_clip_broll_beats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES trellis_clip_projects(id) ON DELETE CASCADE,
  generation_id UUID REFERENCES trellis_clip_generations(id) ON DELETE SET NULL,
  position INTEGER NOT NULL DEFAULT 0,
  time_start NUMERIC NOT NULL DEFAULT 0,
  time_end NUMERIC NOT NULL DEFAULT 6,
  beat_type TEXT NOT NULL DEFAULT 'motion_graphic'
    CHECK (beat_type IN ('motion_graphic','kinetic_quote_card','animation','ui_callout','timeline','source_receipt_card','text_highlight')),
  headline TEXT NOT NULL DEFAULT '',
  rationale TEXT,
  remotion_prompt TEXT,
  template_params JSONB DEFAULT '{}'::jsonb,
  footage_prompts JSONB DEFAULT '[]'::jsonb,
  triage TEXT NOT NULL DEFAULT 'undecided'
    CHECK (triage IN ('undecided','kept','rejected','winner','edited')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trellis_clip_render_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES trellis_clip_projects(id) ON DELETE CASCADE,
  beat_id UUID REFERENCES trellis_clip_broll_beats(id) ON DELETE CASCADE,
  job_type TEXT NOT NULL DEFAULT 'beat' CHECK (job_type IN ('beat','assemble')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed')),
  attempts INTEGER DEFAULT 0,
  payload JSONB DEFAULT '{}'::jsonb,
  qa JSONB DEFAULT '{}'::jsonb,
  output_url TEXT,
  storage_path TEXT,
  duration_seconds NUMERIC,
  width INTEGER,
  height INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS trellis_clip_publications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES trellis_clip_projects(id) ON DELETE CASCADE,
  youtube_account_id UUID REFERENCES branch_social_accounts(id) ON DELETE RESTRICT,
  platform TEXT NOT NULL CHECK (platform IN ('youtube','social')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','uploading','processing','live','failed')),
  external_id TEXT,
  external_url TEXT,
  response JSONB DEFAULT '{}'::jsonb,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE trellis_episode_publications ADD COLUMN IF NOT EXISTS youtube_account_id UUID REFERENCES branch_social_accounts(id) ON DELETE RESTRICT;
ALTER TABLE trellis_clip_publications ADD COLUMN IF NOT EXISTS youtube_account_id UUID REFERENCES branch_social_accounts(id) ON DELETE RESTRICT;
DO $$ BEGIN
  IF to_regclass('public.studio_publications') IS NOT NULL THEN
    ALTER TABLE studio_publications ADD COLUMN IF NOT EXISTS youtube_account_id UUID REFERENCES branch_social_accounts(id) ON DELETE RESTRICT;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_episode_publications_youtube_account ON trellis_episode_publications (youtube_account_id) WHERE youtube_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clip_publications_youtube_account ON trellis_clip_publications (youtube_account_id) WHERE youtube_account_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.validate_youtube_publication_account()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE v_branch_slug TEXT; v_valid BOOLEAN;
BEGIN
  IF NEW.platform <> 'youtube' THEN RETURN NEW; END IF;
  IF NEW.youtube_account_id IS NULL THEN RAISE EXCEPTION 'A YouTube account is required for YouTube publications' USING ERRCODE = '23514'; END IF;
  IF TG_TABLE_NAME = 'trellis_episode_publications' THEN
    SELECT episode.branch INTO v_branch_slug FROM trellis_episodes episode WHERE episode.id = NEW.episode_id;
  ELSIF TG_TABLE_NAME = 'trellis_clip_publications' THEN
    SELECT project.branch INTO v_branch_slug FROM trellis_clip_projects project WHERE project.id = NEW.project_id;
  ELSIF TG_TABLE_NAME = 'studio_publications' THEN
    v_branch_slug := 'rekkrd';
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM branch_social_accounts account JOIN branches branch ON branch.id = account.branch_id
    WHERE account.id = NEW.youtube_account_id AND account.platform = 'youtube' AND account.status = 'active' AND branch.slug = v_branch_slug
  ) INTO v_valid;
  IF NOT COALESCE(v_valid, false) THEN RAISE EXCEPTION 'The selected YouTube account is not active for branch %', COALESCE(v_branch_slug, '(unknown)') USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.validate_youtube_publication_account() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.validate_youtube_publication_account() TO service_role;
DROP TRIGGER IF EXISTS validate_episode_youtube_account ON trellis_episode_publications;
CREATE TRIGGER validate_episode_youtube_account BEFORE INSERT OR UPDATE OF youtube_account_id, platform ON trellis_episode_publications FOR EACH ROW EXECUTE FUNCTION private.validate_youtube_publication_account();
DROP TRIGGER IF EXISTS validate_clip_youtube_account ON trellis_clip_publications;
CREATE TRIGGER validate_clip_youtube_account BEFORE INSERT OR UPDATE OF youtube_account_id, platform ON trellis_clip_publications FOR EACH ROW EXECUTE FUNCTION private.validate_youtube_publication_account();
DO $$ BEGIN
  IF to_regclass('public.studio_publications') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS validate_studio_youtube_account ON studio_publications;
    CREATE TRIGGER validate_studio_youtube_account BEFORE INSERT OR UPDATE OF youtube_account_id, platform ON studio_publications FOR EACH ROW EXECUTE FUNCTION private.validate_youtube_publication_account();
    CREATE INDEX IF NOT EXISTS idx_studio_publications_youtube_account ON studio_publications (youtube_account_id) WHERE youtube_account_id IS NOT NULL;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION private.prevent_youtube_publication_retarget()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE v_can_retarget BOOLEAN := false;
BEGIN
  IF NEW.youtube_account_id IS NOT DISTINCT FROM OLD.youtube_account_id THEN RETURN NEW; END IF;
  IF COALESCE(NEW.platform, OLD.platform) <> 'youtube' THEN RETURN NEW; END IF;
  IF OLD.external_id IS NOT NULL OR OLD.published_at IS NOT NULL THEN
    RAISE EXCEPTION 'YouTube destination is locked after submission; create a new publication instead' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME IN ('trellis_episode_publications', 'trellis_clip_publications') THEN
    v_can_retarget := OLD.status = 'failed';
  ELSIF TG_TABLE_NAME = 'studio_publications' THEN
    v_can_retarget := OLD.status IN ('draft', 'ready', 'failed', 'cancelled');
  END IF;
  IF NOT v_can_retarget THEN
    RAISE EXCEPTION 'YouTube destination is locked after submission; mark the attempt failed before choosing another channel' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.prevent_youtube_publication_retarget() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.prevent_youtube_publication_retarget() TO service_role;
DROP TRIGGER IF EXISTS prevent_episode_youtube_retarget ON trellis_episode_publications;
CREATE TRIGGER prevent_episode_youtube_retarget BEFORE UPDATE OF youtube_account_id ON trellis_episode_publications FOR EACH ROW EXECUTE FUNCTION private.prevent_youtube_publication_retarget();
DROP TRIGGER IF EXISTS prevent_clip_youtube_retarget ON trellis_clip_publications;
CREATE TRIGGER prevent_clip_youtube_retarget BEFORE UPDATE OF youtube_account_id ON trellis_clip_publications FOR EACH ROW EXECUTE FUNCTION private.prevent_youtube_publication_retarget();
DO $$ BEGIN
  IF to_regclass('public.studio_publications') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS prevent_studio_youtube_retarget ON studio_publications;
    CREATE TRIGGER prevent_studio_youtube_retarget BEFORE UPDATE OF youtube_account_id ON studio_publications FOR EACH ROW EXECUTE FUNCTION private.prevent_youtube_publication_retarget();
  END IF;
END $$;

ALTER TABLE trellis_clip_broll_beats ENABLE ROW LEVEL SECURITY;
ALTER TABLE trellis_clip_render_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE trellis_clip_publications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anon Full Access" ON trellis_clip_broll_beats FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated Full Access" ON trellis_clip_broll_beats FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Service Role Full Access" ON trellis_clip_broll_beats FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Anon Full Access" ON trellis_clip_render_jobs FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated Full Access" ON trellis_clip_render_jobs FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Service Role Full Access" ON trellis_clip_render_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Anon Full Access" ON trellis_clip_publications FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated Full Access" ON trellis_clip_publications FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Service Role Full Access" ON trellis_clip_publications FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT ALL ON trellis_clip_broll_beats TO anon, authenticated, service_role;
GRANT ALL ON trellis_clip_render_jobs TO anon, authenticated, service_role;
GRANT ALL ON trellis_clip_publications TO anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_tcbb_project ON trellis_clip_broll_beats (project_id, position);
CREATE INDEX IF NOT EXISTS idx_tcrj_status ON trellis_clip_render_jobs (status, created_at);
CREATE INDEX IF NOT EXISTS idx_tcrj_project ON trellis_clip_render_jobs (project_id);
CREATE INDEX IF NOT EXISTS idx_tcpub_project ON trellis_clip_publications (project_id);

INSERT INTO storage.buckets (id, name, public) VALUES ('clip-assets','clip-assets', true)
ON CONFLICT (id) DO NOTHING;

-- 21. VIDEO AD LAB
CREATE TABLE IF NOT EXISTS video_ad_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  campaign_id UUID,
  branch TEXT NOT NULL,
  script TEXT,
  actor_prompt TEXT,
  voice_id TEXT,
  voice_style TEXT,
  target_segment TEXT,
  platform TEXT,
  pipeline TEXT,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'generating_script', 'generating_frame', 'awaiting_approval', 'rendering', 'generating_face', 'generating_audio', 'generating_video', 'completed', 'failed', 'cancelled', 'publishing', 'published')),
  progress INTEGER DEFAULT 0,
  face_image_url TEXT,
  audio_url TEXT,
  video_url TEXT,
  thumbnail_url TEXT,
  duration_seconds INTEGER,
  cost_estimate NUMERIC,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  frame_url TEXT,
  frame_prompt TEXT,
  frame_attempt INTEGER DEFAULT 0,
  frame_approved_at TIMESTAMPTZ,
  setting TEXT,
  actor_gender TEXT,
  actor_style TEXT,
  aspect_ratio TEXT DEFAULT '9:16',
  format TEXT DEFAULT 'video',
  media_urls JSONB DEFAULT '[]'::jsonb,
  caption TEXT,
  completed_at TIMESTAMPTZ,
  created_by UUID,
  publish_status TEXT,
  scheduled_for TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE video_ad_jobs ADD COLUMN IF NOT EXISTS frame_url TEXT;
ALTER TABLE video_ad_jobs ADD COLUMN IF NOT EXISTS frame_prompt TEXT;
ALTER TABLE video_ad_jobs ADD COLUMN IF NOT EXISTS frame_attempt INTEGER DEFAULT 0;
ALTER TABLE video_ad_jobs ADD COLUMN IF NOT EXISTS frame_approved_at TIMESTAMPTZ;
ALTER TABLE video_ad_jobs ADD COLUMN IF NOT EXISTS setting TEXT;
ALTER TABLE video_ad_jobs ADD COLUMN IF NOT EXISTS actor_gender TEXT;
ALTER TABLE video_ad_jobs ADD COLUMN IF NOT EXISTS actor_style TEXT;
ALTER TABLE video_ad_jobs ADD COLUMN IF NOT EXISTS aspect_ratio TEXT DEFAULT '9:16';
ALTER TABLE video_ad_jobs ADD COLUMN IF NOT EXISTS format TEXT DEFAULT 'video';
ALTER TABLE video_ad_jobs ADD COLUMN IF NOT EXISTS media_urls JSONB DEFAULT '[]'::jsonb;
ALTER TABLE video_ad_jobs ADD COLUMN IF NOT EXISTS caption TEXT;
-- The original webhook body, so a job can be regenerated without retyping it.
ALTER TABLE video_ad_jobs ADD COLUMN IF NOT EXISTS request_payload JSONB;
ALTER TABLE video_ad_jobs ADD COLUMN IF NOT EXISTS revision_of UUID;
ALTER TABLE video_ad_jobs ADD COLUMN IF NOT EXISTS revision_notes TEXT;

ALTER TABLE video_ad_jobs DROP CONSTRAINT IF EXISTS video_ad_jobs_status_check;
ALTER TABLE video_ad_jobs ADD CONSTRAINT video_ad_jobs_status_check
  CHECK (status IN ('queued', 'generating_script', 'generating_frame', 'awaiting_approval', 'rendering', 'generating_face', 'generating_audio', 'generating_video', 'completed', 'failed', 'cancelled', 'publishing', 'published'));

ALTER TABLE video_ad_jobs DROP CONSTRAINT IF EXISTS video_ad_jobs_format_check;
ALTER TABLE video_ad_jobs ADD CONSTRAINT video_ad_jobs_format_check
  CHECK (format IN ('video', 'static', 'carousel'));

CREATE INDEX IF NOT EXISTS video_ad_jobs_status_idx ON public.video_ad_jobs (status);
CREATE INDEX IF NOT EXISTS video_ad_jobs_media_urls_idx ON public.video_ad_jobs USING GIN (media_urls jsonb_path_ops);

-- 22. MOTION POSTS (still image → Grok motion → optional Rekkrd audio)
ALTER TABLE IF EXISTS public.tenant_secrets ADD COLUMN IF NOT EXISTS xai_api_key TEXT;

CREATE TABLE IF NOT EXISTS public.motion_post_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  created_by UUID NOT NULL,
  branch_id UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  branch_slug TEXT NOT NULL DEFAULT 'rekkrd',
  title TEXT NOT NULL DEFAULT 'Untitled motion post',
  prompt TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'xai' CHECK (provider IN ('xai')),
  model TEXT NOT NULL DEFAULT 'grok-imagine-video-1.5',
  duration_seconds INTEGER NOT NULL DEFAULT 7 CHECK (duration_seconds BETWEEN 3 AND 15),
  aspect_ratio TEXT NOT NULL DEFAULT '9:16' CHECK (aspect_ratio IN ('9:16')),
  resolution TEXT NOT NULL DEFAULT '720p' CHECK (resolution IN ('480p','720p','1080p')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','generating','mixing','ready','failed','publishing','published','cancelled')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  source_bucket TEXT NOT NULL DEFAULT 'motion-posts', source_path TEXT NOT NULL, source_url TEXT,
  provider_request_id TEXT, generated_video_url TEXT,
  audio_source_type TEXT CHECK (audio_source_type IN ('studio_track','studio_master','music_generation')),
  audio_source_id UUID, audio_title TEXT, audio_url TEXT,
  audio_start_seconds NUMERIC NOT NULL DEFAULT 0 CHECK (audio_start_seconds >= 0),
  caption TEXT,
  output_bucket TEXT NOT NULL DEFAULT 'motion-posts', output_path TEXT, output_url TEXT,
  cost_estimate NUMERIC NOT NULL DEFAULT 0, cost_actual NUMERIC, error_message TEXT,
  published_at TIMESTAMPTZ, completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_motion_post_jobs_owner_created ON public.motion_post_jobs (created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_motion_post_jobs_status ON public.motion_post_jobs (status, updated_at DESC);
ALTER TABLE public.motion_post_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role manages motion posts" ON public.motion_post_jobs;
CREATE POLICY "Service role manages motion posts" ON public.motion_post_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Motion post owner reads jobs" ON public.motion_post_jobs;
CREATE POLICY "Motion post owner reads jobs" ON public.motion_post_jobs FOR SELECT TO authenticated USING ((select auth.uid()) = created_by);
REVOKE ALL ON public.motion_post_jobs FROM anon, authenticated;
GRANT SELECT ON public.motion_post_jobs TO authenticated;
GRANT ALL ON public.motion_post_jobs TO service_role;

CREATE TABLE IF NOT EXISTS public.motion_post_finishing_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  motion_post_job_id UUID NOT NULL REFERENCES public.motion_post_jobs(id) ON DELETE RESTRICT,
  created_by UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','succeeded','failed','cancel_requested','cancelled')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  text_cues JSONB NOT NULL DEFAULT '[]'::jsonb,
  style JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_bucket TEXT NOT NULL DEFAULT 'motion-posts', source_path TEXT NOT NULL,
  output_bucket TEXT NOT NULL DEFAULT 'motion-posts', output_path TEXT, output_url TEXT,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  max_attempts INTEGER NOT NULL DEFAULT 2 CHECK (max_attempts BETWEEN 1 AND 5),
  idempotency_key TEXT NOT NULL, error_message TEXT,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (created_by, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_motion_post_finishing_owner_created ON public.motion_post_finishing_jobs (created_by, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_motion_post_finishing_queue ON public.motion_post_finishing_jobs (queued_at) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_motion_post_finishing_source ON public.motion_post_finishing_jobs (motion_post_job_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_motion_post_finishing_cues ON public.motion_post_finishing_jobs USING GIN (text_cues jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_motion_post_finishing_style ON public.motion_post_finishing_jobs USING GIN (style jsonb_path_ops);
ALTER TABLE public.motion_post_finishing_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role manages motion post finishing" ON public.motion_post_finishing_jobs;
CREATE POLICY "Service role manages motion post finishing" ON public.motion_post_finishing_jobs FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Motion post owner reads finishing" ON public.motion_post_finishing_jobs;
CREATE POLICY "Motion post owner reads finishing" ON public.motion_post_finishing_jobs FOR SELECT TO authenticated USING ((select auth.uid()) = created_by);
REVOKE ALL ON public.motion_post_finishing_jobs FROM anon, authenticated;
GRANT SELECT ON public.motion_post_finishing_jobs TO authenticated;
GRANT ALL ON public.motion_post_finishing_jobs TO service_role;

ALTER TABLE public.scheduled_social_posts
  ADD COLUMN IF NOT EXISTS source_motion_post_id UUID REFERENCES public.motion_post_jobs(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS source_motion_finish_id UUID REFERENCES public.motion_post_finishing_jobs(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_ssp_source_motion_post ON public.scheduled_social_posts (source_motion_post_id, created_at DESC) WHERE source_motion_post_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ssp_source_motion_finish ON public.scheduled_social_posts (source_motion_finish_id) WHERE source_motion_finish_id IS NOT NULL;

INSERT INTO storage.buckets (id, name, public) VALUES ('motion-posts','motion-posts',true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;
DROP POLICY IF EXISTS "Motion post owners upload assets" ON storage.objects;
CREATE POLICY "Motion post owners upload assets" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'motion-posts' AND (storage.foldername(name))[1] = (select auth.uid())::text);
DROP POLICY IF EXISTS "Motion post owners read assets" ON storage.objects;
CREATE POLICY "Motion post owners read assets" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'motion-posts' AND (storage.foldername(name))[1] = (select auth.uid())::text);
DROP POLICY IF EXISTS "Motion post owners delete assets" ON storage.objects;
CREATE POLICY "Motion post owners delete assets" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'motion-posts' AND (storage.foldername(name))[1] = (select auth.uid())::text);

-- PROMO STUDIO (PS-004)
-- Kept as an exact raw import from the executable migration so the Schema
-- Engine and deployment artifact cannot silently drift apart.
${PROMO_STUDIO_SQL_SCHEMA}
${PROMO_BRANCH_SOURCES_SQL_SCHEMA}
${PROMO_CLAIM_APPROVAL_GATE_SQL_SCHEMA}
${PROMO_VOICE_TAKE_RESERVATION_SQL_SCHEMA}
${PROMO_MUSIC_TAKE_RESERVATION_SQL_SCHEMA}
${PROMO_RENDER_COMPLETION_SQL_SCHEMA}
${PROMO_CAPTURE_COMPLETION_SQL_SCHEMA}
${PROMO_REVISION_ASSET_BINDINGS_SQL_SCHEMA}
`;

export const WEBHOOK_SPECS = {
  ingest: "https://n8n.sproutify.app/webhook/trellis-ingest-gateway",
  posthog_ingest: "https://n8n.sproutify.app/webhook/posthog-event-ingest",
  social_intent: "https://n8n.sproutify.app/webhook/ig-intent-loop",
  compliance: "https://n8n.sproutify.app/webhook/resend-compliance",
  voice: "https://n8n.sproutify.app/webhook/twilio-whisper-sync",
  social_publish: "https://n8n.sproutify.app/webhook/trellis-social-publish",
  facebook_publish: "https://n8n.sproutify.app/webhook/trellis-facebook-publish",
  tiktok_publish: "https://n8n.sproutify.app/webhook/trellis-tiktok-publish",
  social_ingest: "https://n8n.sproutify.app/webhook/social-signal-ingest",
  sms_dispatch: "https://n8n.sproutify.app/webhook/twilio-sms-dispatch",
  reddit_review_stage: "https://n8n.sproutify.app/webhook/reddit-review-stage",
  reddit_post_comment: "https://n8n.sproutify.app/webhook/reddit-post-comment",
  music_generate: "https://n8n.sproutify.app/webhook/trellis-music-generate",
  session_track_generate: "https://n8n.sproutify.app/webhook/trellis-session-track-generate",
  session_generate: "https://n8n.sproutify.app/webhook/trellis-session-generate",
  music_stitch: "https://n8n.sproutify.app/webhook/trellis-music-stitch",
  episode_artwork: "https://n8n.sproutify.app/webhook/trellis-episode-artwork",
  episode_video: "https://n8n.sproutify.app/webhook/trellis-episode-video",
  episode_publish: "https://n8n.sproutify.app/webhook/trellis-episode-publish"
};

export const MOCK_BRIEFING: DailyBriefing = {
  short_summary: "Your marketing database is crisp and organized. Sage has automatically archived old interaction logs to keep your dashboard lightning-fast.",
  detailed_analysis: {
    audience_growth: { total: 124, trend: "+12%", insight: "Search visibility is up! New gardeners are finding Sproutify through organic content." },
    campaign_velocity: { active: 3, avg_ctr: "8.4%", insight: "Campaigns are blooming across all sites with high engagement levels." },
    social_sentiment: { score: 88, mood: "Vibrant & Positive", intent_count: 5 },
    support_load: { open_tickets: 4, urgent_count: 1, avg_response_time: "14m" }
  },
  last_updated: new Date().toISOString()
};

export const N8N_BLUEPRINTS = {
  ingest_gateway: `{
  "name": "Trellis: Atomic Identity Ingest",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "trellis-ingest-gateway",
        "responseMode": "lastNode",
        "options": {}
      },
      "name": "Webhook Ingest",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 1,
      "position": [250, 300]
    },
    {
      "parameters": {
        "operation": "executeQuery",
        "query": "INSERT INTO profiles (email, first_name, branches) VALUES ($1, $2, $3) ON CONFLICT (email) DO UPDATE SET branches = profiles.branches || excluded.branches;"
      },
      "name": "Supabase Upsert",
      "type": "n8n-nodes-base.supabase",
      "position": [500, 300]
    }
  ]
}`,
  worker_node: `{
  "name": "Trellis: Throttled API Worker",
  "nodes": [
    {
      "parameters": {
        "rule": {
          "interval": [ { "field": "minutes", "interval": 1 } ]
        }
      },
      "name": "Cron Loop",
      "type": "n8n-nodes-base.cron",
      "position": [200, 400]
    },
    {
      "parameters": {
        "operation": "executeQuery",
        "query": "SELECT * FROM marketing_task_queue WHERE status = 'pending' LIMIT 50 FOR UPDATE SKIP LOCKED;"
      },
      "name": "Fetch Batch",
      "type": "n8n-nodes-base.supabase",
      "position": [450, 400]
    }
  ]
}`,
  music_generator: `{
  "name": "Trellis: Music Generator (Lyria)",
  "nodes": [
    {
      "parameters": { "httpMethod": "POST", "path": "trellis-music-generate", "responseMode": "onReceived", "options": {} },
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 1,
      "position": [220, 300]
    },
    {
      "parameters": { "operation": "executeQuery", "query": "INSERT INTO music_generations (id, branch, created_by, title, prompt, genre, mood, vocal_style, duration_seconds, status, generation_started_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'generating', now()) ON CONFLICT (id) DO UPDATE SET status='generating', generation_started_at=now();" },
      "name": "Mark Generating",
      "type": "n8n-nodes-base.httpRequest",
      "position": [440, 300]
    },
    {
      "parameters": { "method": "POST", "url": "https://generativelanguage.googleapis.com/v1beta/models/lyria-3-clip:generateMusic", "options": {} },
      "name": "Lyria Generate (verify endpoint)",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4,
      "position": [660, 300]
    },
    {
      "parameters": { "operation": "upload", "bucketName": "music-generations" },
      "name": "Upload Audio",
      "type": "n8n-nodes-base.httpRequest",
      "position": [880, 300]
    },
    {
      "parameters": { "operation": "executeQuery", "query": "UPDATE music_generations SET status='completed', audio_url=$2, storage_bucket='music-generations', storage_path=$3, audio_mime_type='audio/mpeg', completed_at=now(), updated_at=now() WHERE id=$1;" },
      "name": "Mark Completed",
      "type": "n8n-nodes-base.httpRequest",
      "position": [1100, 300]
    }
  ]
}`,
  social_intent: `{
  "name": "Trellis: AI Social Listening",
  "nodes": [
    {
      "parameters": {
        "resource": "comment",
        "operation": "getAll"
      },
      "name": "IG Watcher",
      "type": "n8n-nodes-base.instagram",
      "position": [100, 500]
    },
    {
      "parameters": {
        "model": "gemini-3-pro-preview",
        "prompt": "Evaluate sentiment and buying intent for this comment: {{ $node.IG_Watcher.json.text }}"
      },
      "name": "Gemini Auditor",
      "type": "n8n-nodes-base.googleGemini",
      "position": [350, 500]
    }
  ]
}`,
  social_publisher: `{
  "name": "Trellis: Social Publisher Gateway",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "trellis-social-publish",
        "responseMode": "lastNode",
        "options": {}
      },
      "name": "Publish Webhook",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 1,
      "position": [250, 300]
    },
    {
      "parameters": {
        "operation": "executeQuery",
        "query": "SELECT pgp_sym_decrypt(access_token_encrypted, get_encryption_key()) as access_token, platform_user_id, platform_username FROM social_credentials WHERE branch_id = '{{ $json.branch_id }}' AND platform = '{{ $json.platform }}' AND is_valid = true LIMIT 1"
      },
      "name": "Fetch Credential",
      "type": "n8n-nodes-base.supabase",
      "position": [500, 300]
    },
    {
      "parameters": {
        "conditions": {
          "string": [{ "value1": "={{ $json.access_token }}", "operation": "isNotEmpty" }]
        }
      },
      "name": "Has Token?",
      "type": "n8n-nodes-base.if",
      "position": [750, 300]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "={{ $node['Publish Webhook'].json.platform_api_url }}",
        "sendHeaders": true,
        "headerParameters": { "parameters": [{ "name": "Authorization", "value": "=Bearer {{ $json.access_token }}" }] },
        "sendBody": true,
        "bodyParameters": { "parameters": [{ "name": "content", "value": "={{ $node['Publish Webhook'].json.content }}" }] }
      },
      "name": "Platform API Call",
      "type": "n8n-nodes-base.httpRequest",
      "position": [1000, 200]
    },
    {
      "parameters": {
        "values": { "string": [{ "name": "error", "value": "No credential found for this branch/platform" }] }
      },
      "name": "No Credential Error",
      "type": "n8n-nodes-base.set",
      "position": [1000, 400]
    },
    {
      "parameters": {
        "respondWith": "json",
        "responseBody": "={{ JSON.stringify({ success: true, post_id: $json.id || $json.data?.id, platform: $node['Publish Webhook'].json.platform }) }}"
      },
      "name": "Respond Success",
      "type": "n8n-nodes-base.respondToWebhook",
      "position": [1250, 300]
    }
  ]
}`,
  instagram_listener: `{
  "name": "Trellis: Instagram Listener",
  "description": "Polls Instagram comments/mentions via Meta Graph API, classifies intent via Gemini, matches profiles, ingests to Trellis",
  "trigger": "Schedule (every 5 min)",
  "nodes": [
    { "name": "Schedule Trigger", "type": "n8n-nodes-base.scheduleTrigger", "parameters": { "rule": { "interval": [{ "field": "minutes", "minutesInterval": 5 }] } }, "position": [250, 300] },
    { "name": "Fetch Token", "type": "n8n-nodes-base.supabase", "parameters": { "operation": "executeQuery", "query": "SELECT branch_id, pgp_sym_decrypt(access_token_encrypted, get_encryption_key()) as access_token, platform_user_id FROM social_credentials WHERE platform = 'instagram' AND is_valid = true" }, "position": [450, 300] },
    { "name": "Get Recent Comments", "type": "n8n-nodes-base.httpRequest", "parameters": { "method": "GET", "url": "https://graph.instagram.com/v18.0/{{ $json.platform_user_id }}/media?fields=id,comments{text,username,timestamp}&access_token={{ $json.access_token }}&limit=10" }, "position": [650, 300] },
    { "name": "Classify Intent (Gemini)", "type": "n8n-nodes-base.httpRequest", "parameters": { "method": "POST", "url": "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent" }, "position": [850, 300] },
    { "name": "Match Profile", "type": "n8n-nodes-base.supabase", "parameters": { "operation": "executeQuery", "query": "SELECT id FROM profiles WHERE metadata->'social_handles'->>'instagram' = '{{ $json.username }}' LIMIT 1" }, "position": [1050, 300] },
    { "name": "Ingest Signal", "type": "n8n-nodes-base.httpRequest", "parameters": { "method": "POST", "url": "https://n8n.sproutify.app/webhook/social-signal-ingest" }, "position": [1250, 300] }
  ]
}`,
  x_listener: `{
  "name": "Trellis: X Listener",
  "description": "Monitors X mentions/replies via X API v2, classifies intent, ingests to Trellis",
  "trigger": "Schedule (every 5 min)",
  "nodes": [
    { "name": "Schedule Trigger", "type": "n8n-nodes-base.scheduleTrigger", "parameters": { "rule": { "interval": [{ "field": "minutes", "minutesInterval": 5 }] } }, "position": [250, 300] },
    { "name": "Fetch Token", "type": "n8n-nodes-base.supabase", "parameters": { "operation": "executeQuery", "query": "SELECT branch_id, pgp_sym_decrypt(access_token_encrypted, get_encryption_key()) as access_token, platform_user_id FROM social_credentials WHERE platform = 'x' AND is_valid = true" }, "position": [450, 300] },
    { "name": "Get Mentions", "type": "n8n-nodes-base.httpRequest", "parameters": { "method": "GET", "url": "https://api.twitter.com/2/users/{{ $json.platform_user_id }}/mentions" }, "position": [650, 300] },
    { "name": "Classify Intent (Gemini)", "type": "n8n-nodes-base.httpRequest", "parameters": { "method": "POST", "url": "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent" }, "position": [850, 300] },
    { "name": "Match Profile", "type": "n8n-nodes-base.supabase", "parameters": { "operation": "executeQuery", "query": "SELECT id FROM profiles WHERE metadata->'social_handles'->>'x' = '{{ $json.username }}' LIMIT 1" }, "position": [1050, 300] },
    { "name": "Ingest Signal", "type": "n8n-nodes-base.httpRequest", "parameters": { "method": "POST", "url": "https://n8n.sproutify.app/webhook/social-signal-ingest" }, "position": [1250, 300] }
  ]
}`,
  linkedin_listener: `{
  "name": "Trellis: LinkedIn Listener",
  "description": "Monitors LinkedIn post comments via Marketing API, classifies intent, ingests to Trellis",
  "trigger": "Schedule (every 15 min)",
  "nodes": [
    { "name": "Schedule Trigger", "type": "n8n-nodes-base.scheduleTrigger", "parameters": { "rule": { "interval": [{ "field": "minutes", "minutesInterval": 15 }] } }, "position": [250, 300] },
    { "name": "Fetch Token", "type": "n8n-nodes-base.supabase", "parameters": { "operation": "executeQuery", "query": "SELECT branch_id, pgp_sym_decrypt(access_token_encrypted, get_encryption_key()) as access_token, platform_user_id FROM social_credentials WHERE platform = 'linkedin' AND is_valid = true" }, "position": [450, 300] },
    { "name": "Get Post Comments", "type": "n8n-nodes-base.httpRequest", "parameters": { "method": "GET", "url": "https://api.linkedin.com/v2/socialActions/{{ $json.platform_user_id }}/comments" }, "position": [650, 300] },
    { "name": "Classify Intent (Gemini)", "type": "n8n-nodes-base.httpRequest", "parameters": { "method": "POST", "url": "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent" }, "position": [850, 300] },
    { "name": "Match Profile", "type": "n8n-nodes-base.supabase", "parameters": { "operation": "executeQuery", "query": "SELECT id FROM profiles WHERE metadata->'social_handles'->>'linkedin' = '{{ $json.username }}' LIMIT 1" }, "position": [1050, 300] },
    { "name": "Ingest Signal", "type": "n8n-nodes-base.httpRequest", "parameters": { "method": "POST", "url": "https://n8n.sproutify.app/webhook/social-signal-ingest" }, "position": [1250, 300] }
  ]
}`,
  reddit_scanner: `{
  "name": "Trellis: Reddit Growth Scanner",
  "description": "Monitors target subreddits on a 3-hour schedule, discovers engagement opportunities, filters bots/mods, generates AI draft replies via Gemini, and stages qualifying drafts for human review",
  "trigger": "Schedule (every 3 hours)",
  "file": "n8n-blueprints/D1-reddit-scanner.json",
  "webhook": "https://n8n.sproutify.app/webhook/reddit-review-stage",
  "nodes": [
    { "name": "Every 3 Hours", "type": "n8n-nodes-base.scheduleTrigger" },
    { "name": "Config: Targets", "type": "n8n-nodes-base.set" },
    { "name": "Reddit Auth", "type": "n8n-nodes-base.httpRequest" },
    { "name": "Search Reddit Posts", "type": "n8n-nodes-base.httpRequest" },
    { "name": "Split Posts", "type": "n8n-nodes-base.splitOut" },
    { "name": "Fetch Comments", "type": "n8n-nodes-base.httpRequest" },
    { "name": "Split Comments", "type": "n8n-nodes-base.splitOut" },
    { "name": "Filter Bots & Short Comments", "type": "n8n-nodes-base.if" },
    { "name": "AI Draft Response", "type": "n8n-nodes-base.httpRequest" },
    { "name": "Shape Output", "type": "n8n-nodes-base.set" },
    { "name": "Relevance Gate", "type": "n8n-nodes-base.if" },
    { "name": "Stage for Review", "type": "n8n-nodes-base.httpRequest" }
  ],
  "setup": ["Reddit OAuth app (script type) — client_id + secret + username + password", "Gemini API key in AI Draft Response node", "Configure target subreddits + keywords in Config: Targets node"]
}`,
  reddit_poster: `{
  "name": "Trellis: Reddit Comment Poster",
  "description": "Receives human-approved comment data via webhook from Trellis UI, authenticates with Reddit, posts the comment, and returns success/error",
  "trigger": "Webhook (POST from Trellis 'Post to Reddit' button)",
  "file": "n8n-blueprints/D2-reddit-poster.json",
  "webhook": "https://n8n.sproutify.app/webhook/reddit-post-comment",
  "nodes": [
    { "name": "Post Webhook", "type": "n8n-nodes-base.webhook" },
    { "name": "Reddit Auth", "type": "n8n-nodes-base.httpRequest" },
    { "name": "Post Comment to Reddit", "type": "n8n-nodes-base.httpRequest" },
    { "name": "Post Succeeded?", "type": "n8n-nodes-base.if" },
    { "name": "Respond Success", "type": "n8n-nodes-base.respondToWebhook" },
    { "name": "Respond Error", "type": "n8n-nodes-base.respondToWebhook" }
  ],
  "setup": ["Same Reddit OAuth credentials as D1 scanner", "Reddit app must have 'submit' scope"]
}`,
};

// ─── Video Ad Lab ───

export const VOICE_OPTIONS = [
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', style: 'Friendly female' },
  { id: '29vD33N1CtxCmqQRPOHJ', name: 'Drew', style: 'Casual male' },
  { id: '2EiwWnXFnvU5JabPnv8n', name: 'Clyde', style: 'Authoritative male' },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi', style: 'Energetic female' },
] as const;

export const TONE_PRESETS = [
  'Friendly',
  'Professional',
  'Bold',
  'Playful',
  'Educational',
] as const;

export const ACTOR_STYLES = [
  'Professional',
  'Casual',
  'Youthful',
  'Authoritative',
  'Influencer',
] as const;

export const ACTOR_GENDERS = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
] as const;

export const PIPELINE_OPTIONS = [
  { value: 'talking_head', label: 'Talking Head', description: 'AI face with lipsync', cost: 0.12 },
  { value: 'full_scene', label: 'Full Scene', description: 'Full AI-generated video', cost: 0.70 },
] as const;

export const ASPECT_RATIOS = [
  { value: '9:16', label: '9:16 Vertical (Reels/TikTok)' },
  { value: '16:9', label: '16:9 Horizontal (YouTube)' },
  { value: '1:1', label: '1:1 Square (Instagram)' },
] as const;

export const VIDEO_SETTINGS = ['Studio', 'Outdoor', 'Kitchen', 'Garden', 'Office', 'Gym', 'Cafe', 'Market', 'Rooftop'] as const;
export const VIDEO_LIGHTING = ['Natural', 'Studio', 'Golden hour', 'Dramatic', 'Soft & warm'] as const;
export const VIDEO_MOODS = ['Energetic', 'Calm', 'Luxurious', 'Fun', 'Inspirational', 'Cozy'] as const;

export const DURATION_OPTIONS: (15 | 30 | 60)[] = [15, 30, 60];

export const VIDEO_AD_COST_PER_VARIANT = 0.12;

export const VIDEO_AD_WEBHOOK = 'https://n8n.sproutify.app/webhook/trellis-video-ad-generate';

export const STATIC_AD_WEBHOOK = 'https://n8n.sproutify.app/webhook/trellis-static-ad-generate';
export const CAROUSEL_AD_WEBHOOK = 'https://n8n.sproutify.app/webhook/trellis-carousel-generate';
export const VIDEO_AD_RENDER_WEBHOOK = 'https://n8n.sproutify.app/webhook/trellis-video-ad-render';

export const VIDEO_AD_STAGES = [
  { key: 'queued', label: 'Queued' },
  { key: 'generating_script', label: 'Script' },
  { key: 'generating_frame', label: 'Frame' },
  { key: 'awaiting_approval', label: 'Review' },
  { key: 'rendering', label: 'Rendering' },
  { key: 'completed', label: 'Complete' },
] as const;

// ─── Trellis Studio (AI music generation via Lyria) ─────────────────
export const MUSIC_GEN_WEBHOOK = 'https://n8n.sproutify.app/webhook/trellis-music-generate';

export const MUSIC_GENRES = ['Jazz', 'Spy Jazz', 'Blues', 'Soul', 'Lo-fi', 'Rock', 'Country', 'Pop', 'Electronic', 'Cinematic'] as const;
export const MUSIC_MOODS = ['Dark', 'Smooth', 'Fun', 'Romantic', 'Mysterious', 'Suspenseful', 'Upbeat', 'Cinematic', 'Warm'] as const;
export const MUSIC_VOCALS = ['Instrumental only', 'Female vocals', 'Male vocals', 'Duet'] as const;
export const MUSIC_DURATIONS = [
  { label: '30 sec clip', value: 30 },
  { label: '60 sec', value: 60 },
  { label: 'Full (up to 3 min)', value: 180 },
] as const;

// Quick-start presets — prefill the create form
export const MUSIC_PRESETS = [
  {
    id: 'rekkrd_after_dark',
    name: 'Rekkrd After Dark Intro',
    title: 'Rekkrd After Dark Intro',
    genre: 'Jazz', mood: 'Mysterious', vocal_style: 'Female vocals', duration_seconds: 30,
    prompt: 'Smoky late-night jazz intro for a vinyl-themed show called Rekkrd After Dark. Female vocals, upright bass, brushed drums, Rhodes piano, soft saxophone. Feels like a mysterious underground record lounge after midnight. Include the phrase "Rekkrd After Dark" naturally in the hook. Cinematic, classy, memorable.',
  },
  {
    id: 'podcast_intro',
    name: 'Podcast Intro',
    title: 'Podcast Intro',
    genre: 'Electronic', mood: 'Upbeat', vocal_style: 'Instrumental only', duration_seconds: 30,
    prompt: 'Modern podcast intro, confident and polished, short memorable hook, clean brand feel.',
  },
  {
    id: 'business_jingle',
    name: 'Business Jingle',
    title: 'Business Jingle',
    genre: 'Pop', mood: 'Fun', vocal_style: 'Female vocals', duration_seconds: 30,
    prompt: 'Catchy upbeat commercial jingle with friendly vocals and a memorable tagline.',
  },
  {
    id: 'social_reel',
    name: 'Social Reel Music',
    title: 'Social Reel Music',
    genre: 'Electronic', mood: 'Upbeat', vocal_style: 'Instrumental only', duration_seconds: 30,
    prompt: 'Short energetic background track for Instagram or TikTok content, loop-friendly.',
  },
] as const;

export const MUSIC_GEN_STAGES = [
  { key: 'queued', label: 'Queued' },
  { key: 'generating', label: 'Composing' },
  { key: 'completed', label: 'Complete' },
] as const;

// ─── Trellis Sessions (multi-track → stitched master) ───────────────
export const MUSIC_SESSION_TRACK_WEBHOOK = 'https://n8n.sproutify.app/webhook/trellis-session-track-generate'; // single track (regenerate)
export const MUSIC_SESSION_GENERATE_WEBHOOK = 'https://n8n.sproutify.app/webhook/trellis-session-generate';     // whole session, paced one-at-a-time in n8n
export const MUSIC_STITCH_WEBHOOK = 'https://n8n.sproutify.app/webhook/trellis-music-stitch';

export const SESSION_PRESETS = [
  { id: 'rekkrd_midnight_jazz', name: 'Rekkrd After Dark — Midnight Jazz', genre: 'Jazz', mood: 'Mysterious', vocal_style: 'Instrumental only', target_duration_seconds: 3600, avg_track_length_seconds: 180 },
  { id: 'velvet_spy_files', name: 'Velvet Spy Files', genre: 'Spy Jazz', mood: 'Suspenseful', vocal_style: 'Instrumental only', target_duration_seconds: 3600, avg_track_length_seconds: 180 },
  { id: 'lofi_study', name: 'Lo-fi Study Hour', genre: 'Lo-fi', mood: 'Smooth', vocal_style: 'Instrumental only', target_duration_seconds: 3600, avg_track_length_seconds: 150 },
  { id: 'soul_lounge', name: 'Soul Lounge Evening', genre: 'Soul', mood: 'Warm', vocal_style: 'Female vocals', target_duration_seconds: 1800, avg_track_length_seconds: 200 },
] as const;

export const SESSION_STATUS_META: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'bg-slate-100 text-slate-500' },
  planning: { label: 'Planning', cls: 'bg-amber-100 text-amber-700' },
  planned: { label: 'Planned', cls: 'bg-blue-100 text-blue-700' },
  generating: { label: 'Generating', cls: 'bg-amber-100 text-amber-700' },
  review: { label: 'Review', cls: 'bg-violet-100 text-violet-700' },
  stitching: { label: 'Stitching', cls: 'bg-amber-100 text-amber-700' },
  ready: { label: 'Ready', cls: 'bg-emerald-100 text-emerald-700' },
  failed: { label: 'Failed', cls: 'bg-rose-100 text-rose-700' },
  archived: { label: 'Archived', cls: 'bg-slate-100 text-slate-400' },
};

// ─── Trellis Episodes (AI content production pipeline) ──────────────
export const EPISODE_ARTWORK_WEBHOOK = 'https://n8n.sproutify.app/webhook/trellis-episode-artwork';
export const EPISODE_VIDEO_WEBHOOK = 'https://n8n.sproutify.app/webhook/trellis-episode-video';
export const EPISODE_PUBLISH_WEBHOOK = 'https://n8n.sproutify.app/webhook/trellis-episode-publish';
export const CLIP_PUBLISH_WEBHOOK = 'https://n8n.sproutify.app/webhook/trellis-clip-publish';

// Selectable art styles for episode artwork. `prompt` is the full style descriptor sent
// to the image model; `setting` steers the Gemini scene writer so a jungle style doesn't
// get a Riviera scene. Add new looks here — the generator + picker pick them up automatically.
export interface EpisodeArtStyle { id: string; name: string; desc: string; prompt: string; setting: string; }
const NO_TEXT = ' No text, no words, no lettering, no logos, no watermark, no signature.';
const BRAND_SAFE_ART =
  ' No smoking, no cigarettes, no cigars, no tobacco, no smoke, no vapor, no ashtrays, no drug references.';
export const EPISODE_ART_STYLES: EpisodeArtStyle[] = [
  {
    id: 'mid_century_blend', name: 'Mid-Century Blend', desc: 'Gouache + cinematic — the McGinnis/Bond illustrated look',
    setting: 'the glamorous 1960s Mediterranean / Riviera world',
    prompt: '1960s mid-century illustrated cover art, hand-painted gouache figures with cinematic contrast, expressive visible brushwork, glamorous Riviera scene, elegant figures in vintage haute couture, classic European sports car, warm sun-drenched palette with bold teal and crimson accents, stylish and sophisticated, in the style of vintage Robert McGinnis paperback covers and 1960s film posters.' + NO_TEXT + BRAND_SAFE_ART,
  },
  {
    id: 'watercolor_pulp', name: 'Watercolor Pulp', desc: 'Soft hand-painted vintage romance paperback',
    setting: 'the glamorous 1960s Mediterranean / Riviera world',
    prompt: '1960s paperback cover illustration, soft gouache and watercolor, delicate painterly brushwork, glamorous Mediterranean resort scene, elegant figures, classic sports car, sun-drenched palette with teal and ochre, in the style of Robert McGinnis vintage covers, nostalgic and cinematic.' + NO_TEXT + BRAND_SAFE_ART,
  },
  {
    id: 'bold_cinematic', name: 'Bold Cinematic', desc: 'High-contrast digital painting, poster punch',
    setting: 'the glamorous 1960s Mediterranean / Riviera world',
    prompt: '1960s mid-century cinematic illustrated poster, bold digital painting, expressive palette-knife background strokes, high-contrast dramatic lighting, glamorous figures in vintage couture with sunglasses, classic sports car, rich saturated teal, yellow and crimson, striking editorial composition.' + NO_TEXT + BRAND_SAFE_ART,
  },
  {
    id: 'photoreal_60s', name: 'Riviera Editorial Photo', desc: 'Sun-faded Kodachrome fashion photograph on the Côte d’Azur',
    setting: 'a real 1960s–1970s French Riviera terrace above Nice or Cannes, with deep blue Mediterranean water, yachts, palms, a curved coastline, and Belle Époque hotels',
    prompt: 'Photorealistic 1960s–1970s French Riviera luxury travel editorial, authentic Kodachrome color film photograph, one elegant summer traveler in period resort fashion, natural Mediterranean sunlight, vintage lens, subtle film grain, sun-faded postcard character, real Côte d’Azur architecture and coastline. Not an illustration, not a cartoon, not a screen-print, not a tropical fantasy.' + NO_TEXT + BRAND_SAFE_ART,
  },
  {
    id: 'cinematic_architectural_minimalism', name: 'Cinematic Architectural Minimalism', desc: 'Monumental spaces, sculptural materials, warm shadows and quiet luxury.',
    setting: 'a monumental minimalist interior of sculptural brutalist concrete, warm natural stone, dark wood, glass, and still water, with expansive negative space and one organic sculptural focal point',
    prompt: 'Photorealistic cinematic architectural editorial photography of a monumental minimalist interior, sculptural brutalist concrete, warm natural stone, dark wood, enormous geometric walls, glass and still water, expansive negative space, minimal furniture, and one organic sculptural focal point. Warm directional sunlight from a concealed opening creates long deep shadows, soft atmospheric haze, and subtle volumetric light. Restrained charcoal, sand, warm gray, muted brown, and black palette; wide cinematic framing, precise geometry, soft filmic contrast, and subtle grain. Quiet, psychologically calming, sophisticated, mysterious, contemplative, and extremely high-end. No people by default; if scale is essential, use only one tiny distant figure. No bright colors, busy decor, ordinary living room, commercial office, excessive furniture, glossy CGI appearance, fantasy architecture, cyberpunk lighting, oversaturation, harsh HDR, or visual clutter.' + NO_TEXT + BRAND_SAFE_ART,
  },
  {
    id: 'cinematic_vintage_noir', name: 'Cinematic Vintage Noir', desc: 'Shadowy interiors, elegant figures, rain, haze and late-night atmosphere.',
    setting: 'an elegant 1940s–1960s-inspired late-night luxury lounge with a solitary formal figure beside a rain-streaked window, warm practical lamps, reflective surfaces, and carefully composed negative space',
    prompt: 'Photorealistic cinematic vintage-noir editorial photograph in an elegant late-night interior, with one sophisticated solitary adult figure near a rain-streaked window in timeless formal clothing. Dramatic low-key lighting, deep directional shadows, pools of warm table-lamp light, atmospheric haze, reflective surfaces, and carefully composed negative space. Intimate, romantic, melancholic, and mysterious, like a beautifully restored frame from a 1950s film. Desaturated charcoal, tobacco brown, muted amber, and deep black palette; authentic analog film grain, gentle halation, soft highlights, shallow depth of field, and widescreen cinematic composition. No modern nightclub, neon or cyberpunk colors, theatrical costumes, exaggerated gangster imagery, visible weapons, bright daylight, smiling commercial models, glossy digital rendering, or clutter.' + NO_TEXT + BRAND_SAFE_ART,
  },
  {
    id: 'sunlit_lifestyle_editorial', name: 'Sunlit Lifestyle Editorial', desc: 'Warm morning light, relaxed luxury and clean modern living.',
    setting: 'a beautiful contemporary home on a quiet sunny morning, with enormous windows, pale walls, cream textiles, light oak, subtle greenery, and one naturally relaxed stylish adult',
    prompt: 'Photorealistic cinematic lifestyle-editorial photograph in a beautiful contemporary home during a quiet sunny morning. One relaxed, stylish adult occupies the space naturally in understated modern clothing, appearing calm, confident, and unhurried. Enormous windows, warm natural sunlight, soft shadows, pale walls, cream textiles, light oak, subtle greenery, and a restrained neutral palette. Include only one or two purposeful lifestyle details such as coffee, headphones, a book, or a laptop. Fresh, optimistic, aspirational, believable, and effortlessly luxurious, with generous negative space for later typography or product overlays. Natural skin texture, gentle atmospheric softness, warm filmic color, subtle grain, and clean cinematic framing. No staged stock-photo smiles, exaggerated luxury, cluttered rooms, harsh white lighting, oversaturated colors, influencer posing, sterile showrooms, corporate offices, excessive decor, or glossy CGI appearance.' + NO_TEXT + BRAND_SAFE_ART,
  },
  {
    id: 'exotica_poster', name: 'Exotica Poster', desc: 'Retro screen-print tiki album cover',
    setting: 'a lush 1960s tropical exotica world of jungles, waterfalls, palms, carved idols and moonlit resort lounges',
    prompt: 'vintage 1960s exotica album cover, retro screen-print poster illustration, flat limited warm palette of burnt orange, terracotta and cream, bold graphic shapes, tropical jungle motifs, palm trees and waterfalls, wood-block texture, mid-century modern travel poster style, nostalgic and warm.' + NO_TEXT + BRAND_SAFE_ART,
  },
];

// Ordered pipeline phases (top-level production stepper)
export const EPISODE_PHASES = [
  { key: 'music', label: 'Music' },
  { key: 'master', label: 'Master' },
  { key: 'artwork', label: 'Artwork' },
  { key: 'video', label: 'Video' },
  { key: 'metadata', label: 'Metadata' },
  { key: 'publishing', label: 'Publish' },
  { key: 'published', label: 'Live' },
] as const;

export const EPISODE_STATUS_META: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'bg-slate-100 text-slate-500' },
  music: { label: 'Music', cls: 'bg-amber-100 text-amber-700' },
  master: { label: 'Master', cls: 'bg-blue-100 text-blue-700' },
  artwork: { label: 'Artwork', cls: 'bg-violet-100 text-violet-700' },
  video: { label: 'Video', cls: 'bg-indigo-100 text-indigo-700' },
  metadata: { label: 'Metadata', cls: 'bg-cyan-100 text-cyan-700' },
  publishing: { label: 'Publishing', cls: 'bg-amber-100 text-amber-700' },
  published: { label: 'Live', cls: 'bg-emerald-100 text-emerald-700' },
  archived: { label: 'Archived', cls: 'bg-slate-100 text-slate-400' },
  failed: { label: 'Failed', cls: 'bg-rose-100 text-rose-700' },
};

export const PUBLISH_PLATFORMS = [
  { id: 'youtube', label: 'YouTube', available: true },
  { id: 'rekkrd', label: 'Rekkrd Site', available: false },
  { id: 'social', label: 'Social Clips', available: false },
  { id: 'spotify', label: 'Spotify', available: false },
  { id: 'apple_podcasts', label: 'Apple Podcasts', available: false },
] as const;

// ─── Built-in email templates (universal, editable starter layouts) ──
// Every brand can use these out of the box. Tokens substituted at send
// time: {{headline}} {{body_copy}} {{cta_text}} {{cta_url}} {{first_name}}
// {{unsubscribe_url}}. Custom templates (Brand DNA) are the branded option.
const EMAIL_FOOTER = `<tr><td style="padding:24px 40px 32px;border-top:1px solid #e2e8f0;text-align:center;"><p style="margin:0;color:#94a3b8;font-size:11px;line-height:1.6;">You're receiving this because you subscribed to our updates.</p><p style="margin:6px 0 0;"><a href="{{unsubscribe_url}}" style="color:#94a3b8;font-size:11px;text-decoration:underline;">Unsubscribe</a></p></td></tr>`;

export const BUILTIN_EMAIL_TEMPLATES: Record<string, string> = {
  UnifiedSproutifyUpdate: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e2e8f0;">
<tr><td style="background:#059669;padding:28px 40px;"><p style="margin:0;color:#d1fae5;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Newsletter</p></td></tr>
<tr><td style="padding:40px;"><p style="margin:0 0 18px;color:#475569;font-size:15px;">Hi {{first_name}},</p>
<h1 style="margin:0 0 16px;color:#0f172a;font-size:26px;font-weight:800;line-height:1.25;">{{headline}}</h1>
<div style="margin:0 0 28px;color:#334155;font-size:15px;line-height:1.7;">{{body_copy}}</div>
<table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:10px;background:#059669;"><a href="{{cta_url}}" style="display:inline-block;padding:14px 30px;color:#fff;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px;">{{cta_text}}</a></td></tr></table>
</td></tr>${EMAIL_FOOTER}</table></td></tr></table></body></html>`,

  SimpleNewsletter: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#ffffff;font-family:Georgia,'Times New Roman',serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
<tr><td style="padding:8px 8px 24px;"><p style="margin:0 0 20px;color:#475569;font-size:16px;">Hi {{first_name}},</p>
<h1 style="margin:0 0 18px;color:#111827;font-size:24px;font-weight:700;line-height:1.3;">{{headline}}</h1>
<div style="margin:0 0 24px;color:#374151;font-size:16px;line-height:1.75;">{{body_copy}}</div>
<p style="margin:0;"><a href="{{cta_url}}" style="color:#059669;font-size:16px;font-weight:700;text-decoration:underline;">{{cta_text}} &rarr;</a></p>
</td></tr>${EMAIL_FOOTER}</table></td></tr></table></body></html>`,

  FlashSale: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#111827;border-radius:16px;overflow:hidden;border:1px solid #1f2937;">
<tr><td style="padding:48px 40px 32px;text-align:center;">
<h1 style="margin:0 0 18px;color:#ffffff;font-size:32px;font-weight:900;line-height:1.15;letter-spacing:-0.5px;">{{headline}}</h1>
<div style="margin:0 0 32px;color:#cbd5e1;font-size:16px;line-height:1.7;">{{body_copy}}</div>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;"><tr><td style="border-radius:12px;background:#10b981;"><a href="{{cta_url}}" style="display:inline-block;padding:18px 44px;color:#04231a;font-size:17px;font-weight:900;text-decoration:none;border-radius:12px;text-transform:uppercase;letter-spacing:0.5px;">{{cta_text}}</a></td></tr></table>
<p style="margin:22px 0 0;color:#64748b;font-size:12px;">Hi {{first_name}} — don't miss out.</p>
</td></tr>
<tr><td style="padding:20px 40px 28px;border-top:1px solid #1f2937;text-align:center;"><a href="{{unsubscribe_url}}" style="color:#64748b;font-size:11px;text-decoration:underline;">Unsubscribe</a></td></tr>
</table></td></tr></table></body></html>`,
};
