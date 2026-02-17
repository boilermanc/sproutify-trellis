
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
  matched_profile_id UUID REFERENCES profiles(id),
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

CREATE INDEX idx_social_signals_matched_profile
  ON social_signals (matched_profile_id) WHERE matched_profile_id IS NOT NULL;

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
`;

export const CAMPAIGN_WEBHOOK = "https://n8n.sproutify.app/webhook/trellis-campaign-dispatch";

export const WEBHOOK_SPECS = {
  ingest: "https://n8n.sproutify.app/webhook/trellis-ingest-gateway",
  campaign_dispatch: "https://n8n.sproutify.app/webhook/trellis-campaign-dispatch",
  social_intent: "https://n8n.sproutify.app/webhook/ig-intent-loop",
  compliance: "https://n8n.sproutify.app/webhook/resend-compliance",
  voice: "https://n8n.sproutify.app/webhook/twilio-whisper-sync",
  social_publish: "https://n8n.sproutify.app/webhook/trellis-social-publish",
  social_ingest: "https://n8n.sproutify.app/webhook/social-signal-ingest",
  sms_dispatch: "https://n8n.sproutify.app/webhook/twilio-sms-dispatch",
  reddit_review_stage: "https://n8n.sproutify.app/webhook/reddit-review-stage",
  reddit_post_comment: "https://n8n.sproutify.app/webhook/reddit-post-comment"
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
  campaign_dispatch: `{
  "name": "Trellis: Campaign Dispatch Gateway",
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
        "operation": "executeQuery",
        "query": "SELECT p.email, p.first_name, p.branches, p.is_subscribed, p.marketing_pause FROM profiles p WHERE p.branches && $1::text[] AND p.is_subscribed = true AND p.marketing_pause = false",
        "additionalFields": {}
      },
      "name": "Resolve Audience",
      "type": "n8n-nodes-base.supabase",
      "position": [500, 300]
    },
    {
      "parameters": {
        "batchSize": 50,
        "options": { "reset": false }
      },
      "name": "Batch Splitter",
      "type": "n8n-nodes-base.splitInBatches",
      "position": [750, 300]
    },
    {
      "parameters": {
        "fromEmail": "campaigns@sproutify.me",
        "toEmail": "={{ $json.email }}",
        "subject": "={{ $node['Campaign Webhook'].json.subject }}",
        "html": "={{ $node['Campaign Webhook'].json.html_body }}"
      },
      "name": "Resend Dispatch",
      "type": "n8n-nodes-base.resend",
      "position": [1000, 300]
    },
    {
      "parameters": {
        "operation": "update",
        "table": "campaigns",
        "id": "={{ $node['Campaign Webhook'].json.campaign_id }}",
        "columns": { "status": "completed", "updated_at": "={{ $now }}" }
      },
      "name": "Mark Complete",
      "type": "n8n-nodes-base.supabase",
      "position": [1250, 300]
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
