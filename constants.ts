
import { Profile, MarketingEvent, MarketingTask, DailyBriefing, Ticket, Brand, SpokeConfig, FailedSync } from './types';

export const DEFAULT_BRAND: Brand = {
  id: 'b_1',
  name: 'Sproutify',
  industry: 'Gardening & AgTech',
  tone: 'Professional yet earthy and encouraging',
  primaryColor: '#059669',
};

export const SITES_LIST = [
  'farm.sproutify.app',
  'school.sproutify.app',
  'micro.sproutify.app',
  'letsrejoice.app',
  'atlurbanfarms.com'
];

export const MOCK_SPOKE_CONFIGS: SpokeConfig[] = [
  { id: 'sc_1', site_name: 'farm.sproutify.app', api_key: 'tr_live_f4rm_9921', status: 'active', last_used_at: '2023-12-14T10:00:00Z' },
  { id: 'sc_2', site_name: 'school.sproutify.app', api_key: 'tr_live_sch00l_3382', status: 'active', last_used_at: '2023-12-14T11:30:00Z' },
  { id: 'sc_3', site_name: 'letsrejoice.app', api_key: 'tr_live_rej0ice_7712', status: 'active', last_used_at: '2023-12-13T09:15:00Z' },
  { id: 'sc_4', site_name: 'micro.sproutify.app', api_key: 'tr_live_micr0_1102', status: 'active' },
  { id: 'sc_5', site_name: 'atlurbanfarms.com', api_key: 'tr_live_atl_5561', status: 'revoked' },
];

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

export const MOCK_PROFILES: Profile[] = [
  {
    id: 'p_uuid_1',
    spoke_uuid: 'ext_user_4491',
    email: 'sarah.green@example.com',
    first_name: 'Sarah',
    phone: '+15550101',
    is_subscribed: true,
    marketing_pause: true,
    tags: ['gardening', 'organic'],
    segments: ['woo_customer'],
    source_sites: ['farm.sproutify.app', 'micro.sproutify.app'],
    status: 'active',
    ltv: 1240.00,
    churn_risk: 'minimal',
    last_active: '2023-10-24T10:00:00Z',
    last_event_timestamp: '2023-10-24T09:00:00Z'
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
    description: 'I have two accounts under different emails and I want to merge my loyalty points while keeping my history from 4242 4242 4242 4242.',
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
  source_sites JSONB DEFAULT '[]'::jsonb, 
  tags JSONB DEFAULT '[]'::jsonb,         
  segments JSONB DEFAULT '[]'::jsonb,     
  is_subscribed BOOLEAN DEFAULT true,
  marketing_pause BOOLEAN DEFAULT false,
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

-- 7. PERFORMANCE INDEXING
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_spoke_uuid ON profiles (spoke_uuid);
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email_unique ON profiles (email);
CREATE INDEX IF NOT EXISTS idx_profiles_sites_gin ON profiles USING GIN (source_sites jsonb_path_ops);
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
`;

export const WEBHOOK_SPECS = {
  ingest: "https://n8n.sproutify.io/webhook/trellis-ingest-gateway",
  social_intent: "https://n8n.sproutify.io/webhook/ig-intent-loop",
  compliance: "https://n8n.sproutify.io/webhook/resend-compliance",
  voice: "https://n8n.sproutify.io/webhook/twilio-whisper-sync"
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
        "query": "INSERT INTO profiles (email, first_name, source_sites) VALUES (:email, :name, :site) ON CONFLICT (email) DO UPDATE SET source_sites = profiles.source_sites || excluded.source_sites;"
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
}`
};
