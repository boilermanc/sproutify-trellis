
import { MarketingEvent, MarketingTask, DailyBriefing, Ticket, Brand, Integration, FailedSync, BrandIdentity, GeneratedBrandAsset } from './types';

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
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'deployed', 'paused', 'completed')),
  query_definition JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- query_definition shape: { branches: string[], presets: string[], template: string, subject: string, trigger: string, branchContent: {} }
  audience_size_at_launch INTEGER DEFAULT 0,
  consent_confirmed BOOLEAN DEFAULT false,
  deployed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns (status);
CREATE INDEX IF NOT EXISTS idx_campaigns_deployed ON campaigns (deployed_at DESC);

-- 6b. EMAIL REPORTING & SUPPRESSION
-- Suppression list (do-not-email). Trellis reads consent live from spokes but keeps
-- its own unsubscribe/bounce/complaint list here (never writes back to spokes).
CREATE TABLE IF NOT EXISTS email_suppressions (
  email TEXT PRIMARY KEY,
  reason TEXT NOT NULL DEFAULT 'unsubscribe' CHECK (reason IN ('unsubscribe','bounce','complaint','manual')),
  source TEXT,
  campaign_subject TEXT,
  detail JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE email_suppressions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "suppressions_service" ON email_suppressions;
CREATE POLICY "suppressions_service" ON email_suppressions FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "suppressions_read" ON email_suppressions;
CREATE POLICY "suppressions_read" ON email_suppressions FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON email_suppressions TO anon, authenticated;
GRANT ALL ON email_suppressions TO service_role;

-- Delivery/engagement events ingested from Resend webhooks (resend-webhook edge fn).
CREATE TABLE IF NOT EXISTS email_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('sent','delivered','delivery_delayed','opened','clicked','bounced','complained','failed')),
  resend_email_id TEXT,
  campaign_subject TEXT,
  campaign_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_email_events_email ON email_events (email);
CREATE INDEX IF NOT EXISTS idx_email_events_subject ON email_events (campaign_subject);
CREATE INDEX IF NOT EXISTS idx_email_events_type ON email_events (event_type);
CREATE INDEX IF NOT EXISTS idx_email_events_occurred ON email_events (occurred_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_events_dedup ON email_events (resend_email_id, event_type, occurred_at) WHERE resend_email_id IS NOT NULL;
ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "events_service" ON email_events;
CREATE POLICY "events_service" ON email_events FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "events_read" ON email_events;
CREATE POLICY "events_read" ON email_events FOR SELECT TO anon, authenticated USING (true);
GRANT SELECT ON email_events TO anon, authenticated;
GRANT ALL ON email_events TO service_role;

-- Per-campaign rollup (matched by subject). security_invoker so it honors caller RLS.
CREATE OR REPLACE VIEW campaign_email_stats
WITH (security_invoker = true) AS
SELECT
  campaign_subject,
  COUNT(*) FILTER (WHERE event_type = 'sent')                 AS sent,
  COUNT(*) FILTER (WHERE event_type = 'delivered')            AS delivered,
  COUNT(DISTINCT email) FILTER (WHERE event_type = 'opened')  AS opened,
  COUNT(DISTINCT email) FILTER (WHERE event_type = 'clicked') AS clicked,
  COUNT(*) FILTER (WHERE event_type = 'bounced')              AS bounced,
  COUNT(*) FILTER (WHERE event_type = 'complained')           AS complained,
  MIN(occurred_at) AS first_event_at,
  MAX(occurred_at) AS last_event_at
FROM email_events
WHERE campaign_subject IS NOT NULL
GROUP BY campaign_subject;
GRANT SELECT ON campaign_email_stats TO anon, authenticated, service_role;

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
  access_token_encrypted BYTEA NOT NULL,
  refresh_token_encrypted BYTEA,
  platform_user_id TEXT,
  platform_username TEXT,
  scopes TEXT[],
  expires_at TIMESTAMPTZ,
  last_refreshed_at TIMESTAMPTZ,
  is_valid BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(branch_id, platform)
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

-- 10. MARKETING CAMPAIGN GENERATOR: BRAND PROFILES
CREATE TABLE IF NOT EXISTS marketing_brands (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id UUID REFERENCES branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  industry TEXT,
  description TEXT,
  target_audience TEXT,
  tone TEXT,
  value_proposition TEXT,
  primary_color TEXT DEFAULT '#059669',
  logo_url TEXT,
  website_url TEXT,
  keywords JSONB DEFAULT '[]'::jsonb,
  competitors JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketing_brands_branch ON marketing_brands (branch_id);
ALTER TABLE marketing_brands ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service Role Full Access" ON marketing_brands FOR ALL TO service_role USING (true) WITH CHECK (true);

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
CREATE POLICY "Service Role Full Access" ON marketing_generations FOR ALL TO service_role USING (true) WITH CHECK (true);

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

ALTER TABLE email_templates DISABLE ROW LEVEL SECURITY;

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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

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
  platform TEXT NOT NULL CHECK (platform IN ('youtube','spotify','apple_podcasts','rekkrd','social')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','uploading','processing','live','failed')),
  external_id TEXT,
  external_url TEXT,
  response JSONB DEFAULT '{}'::jsonb,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE trellis_episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE trellis_episode_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE trellis_episode_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE trellis_episode_publications ENABLE ROW LEVEL SECURITY;
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
GRANT ALL ON trellis_episodes TO anon, authenticated, service_role;
GRANT ALL ON trellis_episode_assets TO anon, authenticated, service_role;
GRANT ALL ON trellis_episode_metadata TO anon, authenticated, service_role;
GRANT ALL ON trellis_episode_publications TO anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_tep_branch ON trellis_episodes (branch);
CREATE INDEX IF NOT EXISTS idx_tep_status ON trellis_episodes (status);
CREATE INDEX IF NOT EXISTS idx_tea_episode ON trellis_episode_assets (episode_id, asset_type);
CREATE INDEX IF NOT EXISTS idx_tepub_episode ON trellis_episode_publications (episode_id);
`;

export const CAMPAIGN_WEBHOOK = "https://n8n.sproutify.app/webhook/trellis-campaign-dispatch";

export const WEBHOOK_SPECS = {
  ingest: "https://n8n.sproutify.app/webhook/trellis-ingest-gateway",
  campaign_dispatch: "https://n8n.sproutify.app/webhook/trellis-campaign-dispatch",
  social_intent: "https://n8n.sproutify.app/webhook/ig-intent-loop",
  compliance: "https://n8n.sproutify.app/webhook/resend-compliance",
  voice: "https://n8n.sproutify.app/webhook/twilio-whisper-sync",
  social_publish: "https://n8n.sproutify.app/webhook/trellis-social-publish",
  facebook_publish: "https://n8n.sproutify.app/webhook/trellis-facebook-publish",
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
  // Trellis posts the EXACT segment audience (deduped + consent-filtered) plus a
  // personalizable html_template. This workflow personalizes per recipient and sends
  // via Resend's /emails/batch endpoint (<=100 messages per call). Canonical importable
  // file: n8n-blueprints/B2-campaign-dispatch.json.
  campaign_dispatch: `{
  "name": "Trellis: Campaign Dispatch Gateway (Resend Batch)",
  "nodes": [
    {
      "parameters": {
        "httpMethod": "POST",
        "path": "trellis-campaign-dispatch",
        "responseMode": "lastNode",
        "options": {}
      },
      "name": "Campaign Webhook",
      "type": "n8n-nodes-base.webhook",
      "typeVersion": 1,
      "position": [250, 300]
    },
    {
      "parameters": {
        "mode": "runOnceForAllItems",
        "jsCode": "const body=($input.first().json.body)||$input.first().json; const recipients=(body.recipients||[]).filter(r=>r&&r.email); const subject=body.subject||''; const template=body.html_template||body.html_body||''; const from=body.from||'ATL Urban Farms <sheree@atlurbanfarms.com>'; const CHUNK=100; const fill=r=>template.split('{{first_name}}').join(r.first_name||'Friend').split('{{unsubscribe_url}}').join('https://horvjqqifgrzxesuxtfm.supabase.co/functions/v1/unsubscribe?email='+encodeURIComponent(r.email)+'&source=global'); const out=[]; for(let i=0;i<recipients.length;i+=CHUNK){const chunk=recipients.slice(i,i+CHUNK); out.push({json:{batch:chunk.map(r=>({from,to:[r.email],subject,html:fill(r)})),campaign_id:body.campaign_id}});} return out;"
      },
      "name": "Build Resend Batches",
      "type": "n8n-nodes-base.code",
      "typeVersion": 2,
      "position": [500, 300]
    },
    {
      "parameters": {
        "method": "POST",
        "url": "https://api.resend.com/emails/batch",
        "sendHeaders": true,
        "headerParameters": { "parameters": [ { "name": "Authorization", "value": "Bearer YOUR_RESEND_API_KEY" }, { "name": "Content-Type", "value": "application/json" } ] },
        "sendBody": true,
        "specifyBody": "json",
        "jsonBody": "={{ JSON.stringify($json.batch) }}"
      },
      "name": "Resend Batch Dispatch",
      "type": "n8n-nodes-base.httpRequest",
      "typeVersion": 4,
      "position": [780, 300]
    },
    {
      "parameters": {
        "operation": "update",
        "table": "campaigns",
        "id": "={{ $json.campaign_id }}",
        "columns": { "status": "completed", "updated_at": "={{ $now }}" }
      },
      "name": "Mark Complete",
      "type": "n8n-nodes-base.supabase",
      "position": [1040, 300]
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

export const VIDEO_AD_STAGES = [
  { key: 'queued', label: 'Queued' },
  { key: 'generating_face', label: 'Face Gen' },
  { key: 'generating_audio', label: 'Audio' },
  { key: 'generating_video', label: 'Lipsync' },
  { key: 'completed', label: 'Complete' },
] as const;

// ─── Trellis Studio (AI music generation via Lyria) ─────────────────
export const MUSIC_GEN_WEBHOOK = 'https://n8n.sproutify.app/webhook/trellis-music-generate';

export const MUSIC_GENRES = ['Jazz', 'Blues', 'Soul', 'Lo-fi', 'Rock', 'Country', 'Pop', 'Electronic', 'Cinematic'] as const;
export const MUSIC_MOODS = ['Dark', 'Smooth', 'Fun', 'Romantic', 'Mysterious', 'Upbeat', 'Cinematic', 'Warm'] as const;
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

// Selectable art styles for episode artwork. `prompt` is the full style descriptor sent
// to the image model; `setting` steers the Gemini scene writer so a jungle style doesn't
// get a Riviera scene. Add new looks here — the generator + picker pick them up automatically.
export interface EpisodeArtStyle { id: string; name: string; desc: string; prompt: string; setting: string; }
const NO_TEXT = ' No text, no words, no lettering, no logos, no watermark, no signature.';
export const EPISODE_ART_STYLES: EpisodeArtStyle[] = [
  {
    id: 'mid_century_blend', name: 'Mid-Century Blend', desc: 'Gouache + cinematic — the McGinnis/Bond illustrated look',
    setting: 'the glamorous 1960s Mediterranean / Riviera world',
    prompt: '1960s mid-century illustrated cover art, hand-painted gouache figures with cinematic contrast, expressive visible brushwork, glamorous Riviera scene, elegant figures in vintage haute couture, classic European sports car, warm sun-drenched palette with bold teal and crimson accents, romantic and sophisticated, in the style of vintage Robert McGinnis paperback covers and 1960s film posters.' + NO_TEXT,
  },
  {
    id: 'watercolor_pulp', name: 'Watercolor Pulp', desc: 'Soft hand-painted vintage romance paperback',
    setting: 'the glamorous 1960s Mediterranean / Riviera world',
    prompt: '1960s paperback cover illustration, soft gouache and watercolor, delicate painterly brushwork, glamorous Mediterranean resort scene, elegant figures, classic sports car, sun-drenched palette with teal and ochre, in the style of Robert McGinnis vintage romance covers, nostalgic and cinematic.' + NO_TEXT,
  },
  {
    id: 'bold_cinematic', name: 'Bold Cinematic', desc: 'High-contrast digital painting, poster punch',
    setting: 'the glamorous 1960s Mediterranean / Riviera world',
    prompt: '1960s mid-century cinematic illustrated poster, bold digital painting, expressive palette-knife background strokes, high-contrast dramatic lighting, glamorous figures in vintage couture with sunglasses, classic sports car, rich saturated teal, yellow and crimson, striking editorial composition.' + NO_TEXT,
  },
  {
    id: 'photoreal_60s', name: 'Photoreal Film Still', desc: 'Kodachrome cinematic photo — the Como/Riva look',
    setting: 'the glamorous 1960s Italian lakes and Riviera (Lake Como, classic Riva speedboats, lakeside villas, grand hotels)',
    prompt: '1960s color film still, Kodachrome photography, cinematic and glamorous, natural golden light, shallow depth of field, subtle film grain, shot on a vintage lens, editorial fashion photography, richly saturated, timeless and elegant. No text, no watermark, no logo.',
  },
  {
    id: 'exotica_poster', name: 'Exotica Poster', desc: 'Retro screen-print tiki album cover',
    setting: 'a lush 1960s tropical tiki exotica world of jungles, waterfalls, palms, carved idols and cocktail lounges',
    prompt: 'vintage 1960s exotica album cover, retro screen-print poster illustration, flat limited warm palette of burnt orange, terracotta and cream, bold graphic shapes, tropical jungle and tiki motifs, palm trees and waterfalls, wood-block texture, mid-century modern travel poster style, nostalgic and warm.' + NO_TEXT,
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
  { id: 'rekkrd', label: 'Rekkrd Site', available: true },
  { id: 'social', label: 'Social Clips', available: true },
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
