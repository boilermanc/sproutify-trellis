import {
  Rocket, Users, Mail, Workflow, Share2, Terminal, Settings,
  Link, Database, Filter, BarChart3, Search as SearchIcon,
  Network, Layers, BarChart2,
  type LucideIcon,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface Article {
  id: string;
  cat: string;
  title: string;
  desc: string;
  time: string;
  content: string;
  publishedAt?: string;
}

export interface Category {
  id: string;
  title: string;
  icon: LucideIcon;
  color: string;
  bg: string;
  description: string;
}

export interface StartHereStep {
  step: number;
  title: string;
  description: string;
  articleId: string;
  icon: LucideIcon;
}

// ---------------------------------------------------------------------------
// Categories (7)
// ---------------------------------------------------------------------------

export const CATEGORIES: Category[] = [
  { id: 'getting-started', title: 'Getting Started', icon: Rocket, color: 'text-emerald-500', bg: 'bg-emerald-50', description: 'New to Trellis? Start here.' },
  { id: 'identity', title: 'Identity & Profiles', icon: Users, color: 'text-blue-500', bg: 'bg-blue-50', description: 'How customer records are built and merged.' },
  { id: 'campaigns', title: 'Campaigns', icon: Mail, color: 'text-indigo-500', bg: 'bg-indigo-50', description: 'Building, launching, and monitoring campaigns.' },
  { id: 'automations', title: 'Automations & n8n', icon: Workflow, color: 'text-amber-500', bg: 'bg-amber-50', description: 'n8n webhooks, logic gates, and workflow patterns.' },
  { id: 'social', title: 'Social & Content', icon: Share2, color: 'text-rose-500', bg: 'bg-rose-50', description: 'Instagram, X, LinkedIn distribution and Sage content tools.' },
  { id: 'technical', title: 'Technical Reference', icon: Terminal, color: 'text-slate-500', bg: 'bg-slate-100', description: 'APIs, database tables, schema, and developer internals.' },
  { id: 'admin', title: 'Settings & Admin', icon: Settings, color: 'text-purple-500', bg: 'bg-purple-50', description: 'Brand config, API keys, and user settings.' },
];

// ---------------------------------------------------------------------------
// Start-Here Steps (6)
// ---------------------------------------------------------------------------

export const START_HERE_STEPS: StartHereStep[] = [
  {
    step: 1,
    title: 'Connect Your Spokes',
    description: 'Link your spoke databases so Trellis can federate across them.',
    articleId: 'art_gs_connect_spokes',
    icon: Network,
  },
  {
    step: 2,
    title: 'Verify Your Schema',
    description: 'Stamp the Hub schema onto your Supabase instance via DevTools.',
    articleId: 'art_gs_verify_schema',
    icon: Database,
  },
  {
    step: 3,
    title: 'Import Your First Profiles',
    description: 'Run your first federated query and pull live customer records.',
    articleId: 'art_gs_import_profiles',
    icon: Users,
  },
  {
    step: 4,
    title: 'Build Your First Segment',
    description: 'Use branch and tag filters to define a targeted audience.',
    articleId: 'art_gs_build_segment',
    icon: Layers,
  },
  {
    step: 5,
    title: 'Launch a Campaign',
    description: 'Compose, proof, and deploy your first message via Campaign Builder.',
    articleId: 'art_gs_launch_campaign',
    icon: Rocket,
  },
  {
    step: 6,
    title: 'Monitor in Reports',
    description: 'Check delivery stats and ecosystem harmony in the Reports tab.',
    articleId: 'art_gs_monitor_reports',
    icon: BarChart2,
  },
];

// ---------------------------------------------------------------------------
// "New" badge helper — auto-expires after DAYS_TO_SHOW_NEW days
// ---------------------------------------------------------------------------

const DAYS_TO_SHOW_NEW = 30;

export const isRecentlyAdded = (publishedDate: string): boolean => {
  const published = new Date(publishedDate);
  const now = new Date();
  const diffMs = now.getTime() - published.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);
  return diffDays <= DAYS_TO_SHOW_NEW;
};

// ---------------------------------------------------------------------------
// Articles
// ---------------------------------------------------------------------------

export const ARTICLES: Article[] = [
  {
    id: 'art_ttl_hygiene',
    cat: 'technical',
    title: 'TTL Policy & Data Hygiene',
    desc: 'Maintaining a lean Hub by purging noise and tiering event storage.',
    time: '4m',
    content: `
      ## The Data Bloat Challenge
      In a multi-spoke ecosystem, high-volume events like "Email Open" and "Link Click" can generate millions of rows monthly. Storing these indefinitely in the "Hot" production table slows down identity lookups and increases Postgres costs.

      ## Trellis Solution: 90-Day TTL (Time To Live)
      Trellis implements a multi-tier storage policy enforced via **pg_cron**.

      ### 1. The 90-Day Gate
      Events in the \`marketing_events\` table are checked daily. Any record older than 90 days is processed based on its value.

      ### 2. Tiered Archival (Business Logic)
      - **High-Value Events**: Signups, Purchases, and Support Resolutions are moved to the \`compressed_archive_events\` table. This allows for long-term LTV analysis without impacting production performance.
      - **Noise Purge**: Purely behavioral logs (Opens, Clicks, heartbeats) are deleted entirely after 90 days.

      ### 3. Master Profiles are Forever
      The TTL policy **never** affects the \`profiles\` table. A customer's identity, total spend (LTV), and cross-site segments are preserved indefinitely.

      ### Configuration Tip
      You can manually trigger a purge cycle in the **DevTools > Data Hygiene** tab to see the current storage distribution.
    `
  },
  {
    id: 'art_delete_lifecycle',
    cat: 'identity',
    title: 'Hardened Delete Lifecycle',
    desc: 'Preventing "Zombie" marketing via cross-site check logic.',
    time: '6m',
    content: `
      ## The Zombie Profile Problem
      In a multi-site ecosystem, a user might delete their account on one site (e.g., micro.sproutify.app) but remain active on another (e.g., farm.sproutify.app). A naïve delete webhook would either erase their entire master history or leave them subscribed to global marketing they no longer want.

      ## Trellis Solution: Global Check Logic
      Trellis implements a **Harden Delete Lifecycle** that preserves identity while respecting privacy.

      ### 1. Spoke-Specific Cleanup
      When a DELETE webhook arrives, the Hub removes only that specific site from the user's \`branches\` array.

      ### 2. The Global Check
      The orchestration engine immediately performs a check: "Does this user still exist on any other Sproutify sites?"

      ### 3. Zombie Prevention
      - **IF** \`branches.length > 0\`: The Hub keeps the profile active but marks that specific spoke as inactive.
      - **IF** \`branches.length == 0\`: The Hub automatically sets \`is_subscribed = false\` and \`status = 'deleted'\`.

      This ensures that once a user has completely left the Sproutify ecosystem, no further marketing dispatches (Resend) or AI social intents (Gemini) are processed for that identity.
    `
  },
  {
    id: 'art_queuing',
    cat: 'automations',
    title: 'Throttling & Worker Architecture',
    desc: 'Protecting downstream APIs from high-volume surges.',
    time: '8m',
    content: `
      ## The Rate Limit Problem
      Downstream APIs like **Gemini** (LLM) and **Resend** (Email) have hard rate limits (e.g., 10 RPM or 100 requests/sec). If a Sproutify spoke sends 1,000 signups in one second, a direct ingest workflow will trigger 429 errors and drop data.

      ## Trellis Solution: Producer-Consumer Pattern
      Trellis implements a **Rate-Limit Queue** using Supabase and a separate Worker workflow.

      ### 1. The Producer (Webhook Ingest)
      Instead of executing marketing logic, the ingestion webhook merely writes the payload to the \`marketing_task_queue\` table. This operation is sub-10ms and extremely resilient.

      ### 2. The Consumer (The Worker)
      A separate n8n workflow is configured with a **Cron Trigger** (e.g., every 1 minute) or a **Recursive Loop**.
      - It pulls a fixed batch (e.g., 50 records) from the queue.
      - It processes them sequentially or with a delay (e.g., 100ms pause between items).
      - It marks the record as \`completed\` or \`failed\`.
    `
  },
  {
    id: 'art_versioning',
    cat: 'technical',
    title: 'Version-Based Sync Protocol',
    desc: 'Preventing stale data from overwriting fresh Hub records.',
    time: '5m',
    content: `
      ## The Stale Data Problem
      In a multi-site ecosystem, webhooks don't always arrive in chronological order. A "Signup" event from school.sproutify.app might be delayed by network latency, arriving *after* a more recent "Purchase" event from farm.sproutify.app.

      ## Trellis Solution: Event Timestamps
      To maintain absolute identity integrity, Trellis implements **Version-Based Upserts**.

      ### How it Works
      1. **Source Timestamp**: Every webhook sent by n8n *must* include the \`event_timestamp\` from the source database.
      2. **Conditional Update**: When the Hub processes the payload, it compares the incoming timestamp with the existing \`last_event_timestamp\` in the master Hub.
      3. **The Logic Gate**:
         - **IF** \`incoming_timestamp > current_hub_timestamp\`: The Hub updates the profile and advances the version.
         - **IF** \`incoming_timestamp <= current_hub_timestamp\`: The Hub rejects the update as "stale" and logs a Warning in the internal audit trail.
    `
  },

  // -- New placeholder articles --------------------------------------------------

  {
    id: 'art_db_tables',
    cat: 'technical',
    title: 'Database Tables Reference',
    desc: 'Every table in the Trellis Hub schema with column definitions.',
    time: '6m',
    content: `## Hub Database Tables
Trellis uses a single Supabase (Postgres) instance as the Identity Hub. All tables are defined in constants.ts as the SQL_SCHEMA export and can be stamped onto any Postgres instance idempotently. The hub never stores spoke profile data locally — it only stores resolved identity records and event logs.

## Core Tables

### profiles
The master identity record. One row per unique customer across the entire Sproutify ecosystem.

- id — UUID, primary key, auto-generated
- spoke_uuid — TEXT, unique, the external ID from the originating spoke
- email — TEXT, unique, the atomic identity key used for matching
- first_name — TEXT
- phone — TEXT
- source_sites — JSONB array, list of all spokes this customer exists on (e.g. ["farm.sproutify.app", "school.sproutify.app"])
- tags — JSONB array, freeform labels (e.g. ["organic", "beginner"])
- segments — JSONB array, computed audience buckets (e.g. ["woo_customer", "high_ltv"])
- is_subscribed — BOOLEAN, global marketing subscription flag
- marketing_pause — BOOLEAN, temporary hold flag (overrides is_subscribed without deleting)
- status — TEXT, enum: active | archived | banned | deleted
- churn_risk — TEXT, enum: minimal | moderate | high | critical
- ltv — DECIMAL(12,2), lifetime value in dollars, updated on each purchase event
- engagement_score — INTEGER, computed from event frequency and recency
- metadata — JSONB, flexible store for spoke-specific extra fields
- last_event_timestamp — TIMESTAMPTZ, used for version-based upsert conflict resolution
- last_active — TIMESTAMPTZ
- created_at / updated_at — TIMESTAMPTZ

Row Level Security: enabled. Only service_role can read or write. RLS policy: "Service Role Full Access".

### marketing_events (Hot Storage)
The live event log. Every inbound webhook from a spoke lands here first.

- id — UUID, primary key
- profile_id — UUID, foreign key → profiles.id
- event_type — TEXT (e.g. purchase, signup, check-in, social_intent, support_ticket)
- source — TEXT (e.g. woo, app, instagram, x, linkedin, twilio, email)
- payload — JSONB, the full raw event payload from the spoke
- created_at — TIMESTAMPTZ

TTL Policy: events older than 90 days are processed nightly by pg_cron. High-value event types (purchase, signup, ticket_resolved) are moved to compressed_archive_events. Noise events (opens, clicks) are deleted.

### compressed_archive_events (Cold Storage)
Long-term archive of business-critical events only. Not queried in real-time.

- id — UUID (same as original marketing_events.id)
- profile_id — UUID
- event_type / source / payload / created_at — mirrors marketing_events
- archived_at — TIMESTAMPTZ, timestamp of when the archival job ran

### marketing_task_queue
Rate-limit buffer. Incoming high-volume operations are written here first, then consumed by a worker n8n workflow in controlled batches.

- id — UUID
- task_type — TEXT, enum: email_dispatch | ai_generation | social_push
- payload — JSONB
- priority — INTEGER (higher = processed first)
- status — TEXT, enum: pending | processing | completed | failed
- attempt_count — INTEGER
- last_error — TEXT, populated on failure
- created_at / processed_at — TIMESTAMPTZ

Index: idx_task_queue_status_priority on (status, priority DESC) — ensures the worker always picks the highest-priority pending item.

### processed_events
Idempotency log. Before processing any inbound webhook, the hub checks this table for the event_id. If found, the event is skipped. Prevents duplicate processing from n8n retries.

- event_id — TEXT, primary key (e.g. woo_order_9901)
- processed_at — TIMESTAMPTZ

### failed_syncs (Dead Letter Queue)
Any event that fails after all retry attempts lands here for manual reconciliation. Viewable in DevTools > Dead Letter Queue.

- id — UUID
- event_id — TEXT
- source_site — TEXT
- raw_payload — JSONB
- error_message — TEXT
- retry_count — INTEGER
- created_at — TIMESTAMPTZ

## Performance Indexes
All JSONB arrays (source_sites, tags, segments) use GIN indexes with jsonb_path_ops for fast multi-site lookups. Email and first_name use pg_trgm GIN indexes for fuzzy search. Spoke UUID has a unique index for O(1) identity resolution.`,
  },
  {
    id: 'art_n8n_webhooks',
    cat: 'technical',
    title: 'n8n Webhook Endpoints',
    desc: 'All active webhook URLs, payload shapes, and expected responses.',
    time: '5m',
    content: `## n8n Webhook Endpoints
All Trellis orchestration runs through n8n hosted at n8n.sproutify.app. Webhooks are the primary entry point for data flowing into the hub. Each webhook URL is registered in constants.ts under WEBHOOK_SPECS and referenced in Settings > API Keys.

## Active Webhook Endpoints

### Ingest Gateway
URL: https://n8n.sproutify.app/webhook/trellis-ingest-gateway
Purpose: Primary entry point for all spoke events — signups, purchases, profile updates, deletions.
Trigger: POST from any spoke via WooCommerce hook, app event, or manual n8n trigger.

Expected payload shape:
- event_id — string, unique ID from the source (used for idempotency check)
- event_type — string: signup | purchase | update | delete | check-in
- event_timestamp — ISO 8601 string, must come from the source database (used for version-based upsert)
- source_site — string: farm.sproutify.app | school.sproutify.app | micro.sproutify.app | letsrejoice.app | atlurbanfarms.com
- customer — object containing email (required), first_name, phone, woo_customer_id, tags[]

Processing logic: checks processed_events for duplicate → resolves email against profiles → upserts profile (version-gated) → writes to marketing_events → writes task to marketing_task_queue if downstream action needed.

### Video Ad Generator
URL: https://n8n.sproutify.app/webhook/trellis-video-ad-generate
Purpose: Triggers the Video Ad Lab pipeline — script generation via Gemini, face image via Flux, TTS via ElevenLabs, lip-sync via SadTalker or Kling.
Trigger: POST from Campaign Builder > Video Ad Lab tab.

Expected payload:
- brand_name, product_name, target_audience, tone — strings
- script_style — string: educational | testimonial | promo
- voice_id — ElevenLabs voice ID string

Response: fire-and-forget. The webhook returns 200 immediately. Final video URL is returned async via a second webhook or stored to Supabase.

### Instagram Intent Loop
URL: https://n8n.sproutify.app/webhook/ig-intent-loop
Purpose: Processes inbound Instagram comments and DMs. Scores intent, attempts profile match by username, routes to support queue or social engagement flow.
Trigger: Scheduled n8n poll or Instagram webhook push.

Expected payload:
- platform — string: instagram | x | linkedin
- username — string
- content — string
- comment_id or dm_id — string

### Resend Webhook (delivery events + suppression)
URL: https://horvjqqifgrzxesuxtfm.supabase.co/functions/v1/resend-webhook
Purpose: Receives Resend delivery events and records them for reporting. This is a Supabase Edge Function on the Hub — NOT an n8n webhook, and it does NOT write to spoke profiles (Trellis is federated and reads consent from spokes live).
Trigger: Resend webhook callback, configured in the Resend dashboard. Verifies the Svix signature when RESEND_WEBHOOK_SECRET is set.

Expected payload: standard Resend event object (type, data.to, data.email_id, created_at).
On every event: inserts a row into email_events (sent | delivered | opened | clicked | bounced | complained | failed) for the Reports tab, attributed to a campaign via the campaign_sends map.
On hard bounce or complaint: also upserts a GLOBAL row into email_suppressions (scope = 'global') so the address is skipped on every future send across all brands.

Unsubscribe clicks are handled by a SEPARATE function — see the "unsubscribe" Edge Function and the Unsubscribe & Suppression runbook (docs/UNSUBSCRIBE_AND_SUPPRESSION.md).

### Twilio Voice Sync
URL: https://n8n.sproutify.app/webhook/twilio-whisper-sync
Purpose: Receives transcribed call data from Twilio, creates a support ticket in the hub, and links it to the matched profile.
Trigger: Twilio callback after Whisper transcription completes.

## Webhook Security
All production webhooks validate a shared secret passed in the Authorization header or as a query param. Spoke API keys are stored in Settings > Connections. If a webhook fires without a valid key, n8n returns 401 and logs a failed_sync.

## Testing Webhooks
Use the DevTools > Schema Engine tab to view current connection status. For live testing, use a tool like hoppscotch.io or the n8n manual trigger. Always include a unique event_id when testing to avoid idempotency conflicts with real data.`,
  },
  {
    id: 'art_external_apis',
    cat: 'technical',
    title: 'External API Directory',
    desc: 'Every third-party API Trellis uses — auth method, env var, and purpose.',
    time: '4m',
    content: `## External API Directory
Trellis integrates with multiple third-party services. All API keys are stored in Settings > API Keys and persisted to localStorage under the trellis_v1_store key. For commercial deployments, customers bring their own keys — Trellis never uses a shared API credential.

## AI & Language Models

### Google Gemini
Purpose: Powers Sage (AI chat assistant), daily briefings, campaign copy generation, social content variants, and Video Ad script writing.
Auth: API key passed in the GoogleGenAI SDK constructor.
Settings field: gemini_api_key
Active LLM switcher: set active_llm to gemini in Settings.
Models used: gemini-2.5-pro (primary), gemini-2.0-flash (fast tasks).
Rate limit note: Gemini free tier is 10 RPM. High-volume generation jobs should route through marketing_task_queue to avoid 429 errors.

### OpenAI
Purpose: Optional LLM provider. Activated when active_llm is set to openai.
Auth: Bearer token in Authorization header.
Settings field: openai_api_key

### Anthropic (Claude)
Purpose: Optional LLM provider. Activated when active_llm is set to anthropic.
Auth: x-api-key header.
Settings field: anthropic_api_key

## Email Delivery

### Resend
Purpose: All transactional and marketing email dispatch. Replaces MailerLite as the primary email channel.
Auth: Bearer token.
Settings field: resend_token
Key behaviors: Trellis listens for Resend delivery events via the resend-webhook Edge Function, which records them in email_events (for Reports) and adds hard bounces + complaints to the Hub email_suppressions list (scope = 'global'). Unsubscribe clicks are handled by the separate unsubscribe Edge Function, which adds a per-branch (or global) row to email_suppressions. Every send filters against email_suppressions. See docs/UNSUBSCRIBE_AND_SUPPRESSION.md.
Docs: resend.com/docs

## Video Ad Pipeline

### Fal.ai (Flux, Kling)
Purpose: Flux generates spokesperson face images for Video Ads. Kling generates the final lip-synced video.
Auth: fal-key header.
Note: Fal.ai key is configured inside the n8n Video Ad workflow node, not in Trellis Settings.

### ElevenLabs
Purpose: Text-to-speech audio generation for Video Ad voiceovers.
Auth: xi-api-key header.
Note: Configured in the n8n Video Ad workflow. Voice ID is passed from the Campaign Builder payload.

### Replicate (SadTalker)
Purpose: Alternative to Kling for lip-sync video generation.
Auth: Token in Authorization header.
Note: Used as fallback if Kling is unavailable.

## Voice & Telephony

### Twilio
Purpose: Inbound voice call transcription via Whisper. Transcripts become support tickets.
Auth: Account SID + Auth Token.
Settings fields: twilio_sid, twilio_token

## Commerce

### WooCommerce REST API
Purpose: Federated queries to ATL Urban Farms product and order data. Also the primary event source for purchase webhooks.
Auth: Consumer Key + Consumer Secret (OAuth 1.0a).
Settings fields: woo_consumer_key, woo_consumer_secret
Note: WooCommerce migration to Supabase is complete — legacy_orders and customers tables are queryable via the spoke connector at povudgtvzggnxwgtjexa.supabase.co.

## Notifications

### Slack (Optional)
Purpose: Internal team alerts — failed syncs, DLQ alerts, campaign launches.
Auth: Incoming webhook URL.
Settings field: slack_webhook

## Supabase (Hub Database)
Purpose: Primary persistence layer for the Identity Hub. Not a traditional "external" API — it is the hub itself.
Auth: Publishable key for client queries. Service role key for server-side operations.
Two instances: Hub instance (Trellis) + Spoke instance (ATL Urban Farms: povudgtvzggnxwgtjexa.supabase.co).
Spoke key: sb_publishable_1B2_i-jRJI9pEpI1dz7XOA_LJbVrNkr (read-only, federated queries).`,
  },
  {
    id: 'art_federated_model',
    cat: 'technical',
    title: 'The Federated Data Model',
    desc: 'Why Trellis never stores profile data locally and how spoke queries work.',
    time: '5m',
    content: `## What Is the Federated Data Model?
Trellis is an orchestration layer, not a data warehouse. The fundamental rule is: profile data lives at the spoke, resolved identity lives at the hub.

This means Trellis never duplicates a customer's full profile from a spoke into the hub database. Instead, when you view a profile in Trellis, the hub resolves the identity (by email or UUID) and then queries the spoke database live to retrieve current field values. The hub stores only what it uniquely owns: the Golden Record, the event log, and the task queue.

## Why This Matters
Without this model, you would need to sync every field change from every spoke into a central database — a fragile, expensive, and always-stale operation. With the federated model, spoke data is always current because it is read directly from the source. The hub adds the cross-site intelligence layer on top without owning the underlying data.

This is also the foundation for multi-tenant commercialization: each customer brings their own spoke databases and their own API keys. Trellis never touches their data — it only orchestrates over it.

## How It Works in Practice

### Step 1 — Identity Resolution
When an event arrives at the Ingest Gateway, the hub performs an email lookup against the profiles table. If the email matches an existing profile, the spoke is appended to source_sites. If not, a new profile is created with just the resolved identity fields (email, spoke_uuid, first_name, phone). No product data, order history, or custom fields are copied.

### Step 2 — Federated Query (Profile View)
When you open a profile in the Profiles view, Trellis performs two queries simultaneously:
1. Hub query — reads the master record from the profiles table (identity, tags, segments, LTV, status).
2. Spoke query — reads live data from the connected spoke database (e.g., the customers table at ATL Urban Farms Supabase, or a WooCommerce REST endpoint).
The two results are merged at the application layer in the spoke connector service. You see one unified profile, but the data came from two separate sources.

### Step 3 — Write Operations
Writes always go back to the correct source. If you update a profile's subscription status, the hub updates is_subscribed in the profiles table AND dispatches a webhook to the appropriate spoke to sync the change there. The hub is never the system of record for spoke-owned fields.

## The ATL Urban Farms Spoke
The first live spoke connection is ATL Urban Farms, using the Supabase instance at povudgtvzggnxwgtjexa.supabase.co. The connector reads from these tables:
- customers (25 rows) — identity fields, preferences, growing interests
- legacy_orders (260 rows) — historical WooCommerce order data post-migration
- orders (5 rows) — new order records
- newsletter_subscribers — email opt-in records
- customer_tags / customer_addresses — supplementary data

The spoke connector merges customers + legacy_orders at the application layer to produce a unified profile view with full order history attached.

## What the Hub Owns vs What the Spoke Owns

Hub owns: profiles table, marketing_events, marketing_task_queue, failed_syncs, processed_events, compressed_archive_events. These are Trellis-native tables that no spoke touches.

Spokes own: customer records, order history, product data, subscription state, custom fields. Trellis reads these but never writes them directly except through explicitly defined webhook sync operations.

## The No-Local-Storage Rule
If you are building a new feature or integration for Trellis, apply this test: "Am I storing spoke data locally?" If yes, rethink the approach. Use a federated query instead. The one exception is snapshot caching for dashboard analytics — aggregate counts (not individual records) may be cached with a timestamp to avoid repeated expensive queries.`,
  },
  {
    id: 'art_coming_soon',
    cat: 'getting-started',
    title: 'Coming Soon',
    desc: 'This guide is being written.',
    time: '1m',
    content: 'This guide is coming soon.',
  },

  // -- Getting Started step articles ----------------------------------------------

  {
    id: 'art_gs_connect_spokes',
    cat: 'getting-started',
    title: 'Step 1: Connect Your Spokes',
    desc: 'Link your spoke databases to the Trellis Hub so federated queries can run.',
    time: '5m',
    publishedAt: '2026-02-28',
    content: `
## What Is a Spoke?
A spoke is any external site or database that holds customer data you want Trellis to orchestrate over. Trellis ships with support for five Sproutify spokes: farm.sproutify.app, school.sproutify.app, micro.sproutify.app, letsrejoice.app, and atlurbanfarms.com. In a commercial deployment, each spoke is a customer's own database.

## How to Connect a Spoke

### 1. Open Settings > Connections
Navigate to Settings in the left sidebar, then select the Connections tab. You will see a list of all configured spokes with their current status (active or revoked).

### 2. Add a New Spoke
Click "Add Spoke Connection." You will need:
- Site name — the domain of the spoke (e.g. farm.sproutify.app)
- API key — the spoke's Trellis ingest key (format: tr_live_XXXX_NNNN)
- Webhook secret — optional, used to validate inbound payloads from this spoke

### 3. ATL Urban Farms (Pre-Configured)
The ATL Urban Farms spoke is the first live connection. Its Supabase instance is already configured:
- URL: povudgtvzggnxwgtjexa.supabase.co
- Publishable key: sb_publishable_1B2_i-jRJI9pEpI1dz7XOA_LJbVrNkr
- Tables available: customers, legacy_orders, orders, newsletter_subscribers, customer_tags, customer_addresses

This spoke is read-only from Trellis. Identity resolution queries run live against this instance.

### 4. Test the Connection
After saving, the spoke row will show a "Test" button. This fires a lightweight ping to verify the API key is valid and the database is reachable. A green Active badge confirms success.

## What Happens After Connection
Once a spoke is connected, the Profiles view will begin resolving federated records from it. The spoke's site name will appear as a filter option under the Branch filter in the Profiles tab. The Dashboard will count this spoke in the Ecosystem Harmony score.

## Troubleshooting
If a spoke shows as Revoked, the API key has been rotated or deleted at the source. Generate a new key at the spoke and update it in Settings. Any events that arrived while revoked will appear in DevTools > Dead Letter Queue for manual retry.
    `
  },
  {
    id: 'art_gs_verify_schema',
    cat: 'getting-started',
    title: 'Step 2: Verify Your Schema',
    desc: 'Stamp the Hub schema onto your Supabase instance and confirm all tables are live.',
    time: '4m',
    publishedAt: '2026-02-28',
    content: `
## Why Schema Verification Matters
Trellis uses a Single Master Schema approach — there are no migration files. The entire Hub table structure is defined in one idempotent SQL block (SQL_SCHEMA in constants.ts) that can be stamped onto any Supabase or Postgres instance. Before any data flows, you need to confirm this schema exists on your Hub database.

## How to Verify

### 1. Open DevTools > Schema Engine
Navigate to Dev Tools in the left sidebar, then select the Schema Engine tab. This shows a read-only terminal view of the current production schema — all CREATE TABLE statements, indexes, RLS policies, and the pg_cron TTL job.

### 2. Check the Table Status Panel
The Schema Engine tab includes a table health panel that shows whether each expected table exists in your connected Hub database. All six tables should show green:
- profiles
- marketing_events
- compressed_archive_events
- marketing_task_queue
- processed_events
- failed_syncs

### 3. If Any Tables Are Missing
Copy the full SQL_SCHEMA block from the Schema Engine tab. Open your Supabase dashboard at supabase.com, navigate to the SQL Editor for your Hub project, paste the schema, and run it. All statements use CREATE TABLE IF NOT EXISTS and CREATE INDEX IF NOT EXISTS — they are safe to run on an existing database without data loss.

### 4. Activate the TTL Cron Job
The pg_cron schedule line is commented out by default in the schema:
-- SELECT cron.schedule('0 3 * * *', 'SELECT purge_and_archive_old_events()');
To activate nightly data hygiene, remove the comment and run it in the Supabase SQL Editor. This schedules the archival job to run at 3 AM daily. Confirm pg_cron extension is enabled in your Supabase project under Database > Extensions.

## Extensions Required
Trellis requires three Postgres extensions. Confirm these are enabled in your Supabase project under Database > Extensions:
- uuid-ossp — UUID generation for primary keys
- pg_trgm — fuzzy text search on email and first_name
- pg_cron — scheduled data hygiene jobs

Once all tables are green and extensions are enabled, your Hub is ready to receive data.
    `
  },
  {
    id: 'art_gs_import_profiles',
    cat: 'getting-started',
    title: 'Step 3: Import Your First Profiles',
    desc: 'Run a federated query to pull live customer records into the Profiles view.',
    time: '5m',
    publishedAt: '2026-02-28',
    content: `
## How Profiles Enter Trellis
Profiles are created in two ways: automatically via inbound n8n webhooks when a customer event fires from a spoke, or manually via the Profiles > Import flow for bulk historical data. For your first import, the manual route gets data visible immediately without waiting for live webhook traffic.

## Option A — Federated Live Query (Recommended for ATL Urban Farms)
The ATL Urban Farms spoke is already connected and has 25 customers and 260 historical orders ready to query.

### 1. Open the Profiles Tab
Navigate to Profiles in the left sidebar. If no profiles appear, the Hub has no resolved identities yet — this is expected before your first import.

### 2. Use the Importer
Click the Import button in the top-right of the Profiles view. Select ATL Urban Farms as the source spoke. The importer will run a federated query against the customers table at the spoke Supabase instance and display a preview of records before committing.

### 3. Review and Confirm
The preview shows email, first_name, and spoke_uuid for each customer. Trellis checks each email against the existing profiles table. New emails create new profile records. Existing emails trigger an upsert — the spoke is appended to their source_sites array.

### 4. Post-Import
After the import completes, the Profiles view will show your customer list with Branch badges indicating which spoke each profile came from. The Dashboard Ecosystem Harmony card will update to reflect the new profile count.

## Option B — Webhook-Driven (Ongoing)
For live data flowing forward, configure your spoke to POST events to the Ingest Gateway webhook:
https://n8n.sproutify.app/webhook/trellis-ingest-gateway

Each new signup or purchase event on the spoke will automatically create or update the corresponding Hub profile. See the n8n Webhook Endpoints guide in Technical Reference for the full payload shape.

## What Gets Stored
Remember the federated model rule: Trellis stores only the resolved identity fields in the Hub. Customer email, first_name, phone, spoke_uuid, and the source_sites array are written to the profiles table. Product preferences, order history, and custom fields remain in the spoke and are queried live when you open a profile detail view.
    `
  },
  {
    id: 'art_gs_build_segment',
    cat: 'getting-started',
    title: 'Step 4: Build Your First Segment',
    desc: 'Use branch, tag, and status filters in Profiles to define a targeted audience.',
    time: '4m',
    publishedAt: '2026-02-28',
    content: `
## What Is a Segment?
A segment is a filtered subset of your profile list. In Trellis, segments are defined dynamically using the filter controls in the Profiles view — they are not saved as static lists. Every time you apply filters, you are building a live segment that reflects the current state of your Hub data.

## The Filter Controls

### Branch Filter
Filters profiles by which spoke they came from. Each spoke (farm.sproutify.app, school.sproutify.app, etc.) is a branch. Select one or more branches to narrow to customers from specific sites. A customer who exists on multiple spokes will appear when any of their branches are selected.

### Tag Filter
Tags are freeform labels attached to profiles (e.g. organic, beginner, wholesale). Filter by one or more tags to target a behaviorally or demographically similar group. Tags are added manually in the profile detail view or automatically via webhook payload.

### Segment Filter
Segments are computed audience buckets written to the segments JSONB field on the profile. Current values include woo_customer (has a WooCommerce order history) and high_ltv (lifetime value above a defined threshold). These are assigned during the import or webhook ingest process.

### Status and Subscription Filters
Filter by profile status (active, archived, banned, deleted) and subscription state (subscribed, paused, unsubscribed). For campaign sends, always filter to is_subscribed = true and marketing_pause = false to stay compliant.

## Building a Useful Segment — Example
To target engaged farm customers for a soil promotion:
1. Set Branch to farm.sproutify.app
2. Set Tag to organic
3. Set Status to active
4. Set Subscribed to true

The resulting list is your campaign audience. The profile count shown above the list is the segment size.

## Saving a Segment for a Campaign
In the Campaign Builder, the audience step lets you apply the same filter controls and lock the audience to the campaign. The filters are saved with the campaign record in Supabase. When you re-open the campaign, the audience is re-evaluated live against the current profile data — so late-arriving profiles that match the filters are automatically included.

## Churn Risk Targeting
The churn_risk field (minimal, moderate, high, critical) enables win-back campaigns. Filter to churn_risk = high combined with is_subscribed = true to build a re-engagement audience. Sage can generate copy variations optimized for each risk tier via the Campaign Builder AI assist feature.
    `
  },
  {
    id: 'art_gs_launch_campaign',
    cat: 'getting-started',
    title: 'Step 5: Launch a Campaign',
    desc: 'Compose, proof, and deploy your first message using the Campaign Builder.',
    time: '6m',
    publishedAt: '2026-02-28',
    content: `
## Overview
The Campaign Builder is the primary composition interface in Trellis. It walks you through four stages: Audience → Content → Preview → Deploy. Campaigns are saved to Supabase and can be drafted, paused, and resumed at any time.

## Stage 1 — Audience
Select the branch, tags, and segment filters that define who receives this campaign. The live profile count updates as you apply filters. You need at least one profile matching your filters before you can proceed.

Set the channel: Email (via Resend), Social Post (via the Social Hub dispatch), or both.

## Stage 2 — Content
### Using Sage AI Assist
Click the AI Assist button to have Sage generate a first draft based on your brand tone, audience segment, and campaign goal. Sage uses the brand profile configured in Settings (name, industry, tone, primary color) to inform the copy.

### Manual Compose
Write directly in the content editor. Use token injection to personalize:
- {{first_name}} — inserts the recipient's first name
- {{brand_name}} — inserts the brand name from Settings
- {{site_name}} — inserts the spoke the customer came from

### Email Module Builder
For email campaigns, the Email Previewer tab shows a live rendered preview of your message as you compose it. Select from modular content blocks: Hero, Intro, Events, Products, App Promo, Social Proof, Footer. Each block is editable and the footer can be configured to include an unsubscribe link (required for compliance).

## Stage 3 — Preview and Proof
The staging proof sends a test email to your own address before any live dispatch. Use this to confirm rendering, token substitution, and link behavior. Check the preview on mobile — most email opens happen on mobile.

## Stage 4 — Deploy
### Immediate Send
Dispatches the campaign to all matching profiles immediately via the Resend API. Each email is sent individually (not as a bulk blast) to enable per-recipient tracking.

### Logic Gate Delay
Use the automation Logic Gate to delay sending based on a condition — for example: "Wait 24 hours after a purchase on farm.sproutify.app before sending this campaign." Set this in the Automations tab and link it to this campaign ID.

### Post-Send
After dispatch, the campaign status updates to Sent. Delivery events from Resend (delivered, opened, clicked, bounced, complained) flow back through the resend-webhook Edge Function into the email_events table and surface in the Reports tab. Hard bounces and complaints are added to the Hub email_suppressions list automatically so they're skipped next time. Unsubscribe clicks (via {{unsubscribe_url}}) are handled by the unsubscribe Edge Function and add a per-branch suppression row — see docs/UNSUBSCRIBE_AND_SUPPRESSION.md.
    `
  },
  {
    id: 'art_gs_monitor_reports',
    cat: 'getting-started',
    title: 'Step 6: Monitor in Reports',
    desc: 'Track delivery stats, ecosystem harmony, and campaign performance in the Reports tab.',
    time: '3m',
    publishedAt: '2026-02-28',
    content: `
## The Reports Tab
Reports is the post-launch monitoring layer. It shows campaign delivery outcomes, ecosystem health across your spokes, and the Sage daily briefing. No configuration is needed — data flows in automatically as Resend delivery events and spoke activity trigger the relevant n8n webhooks.

## Ecosystem Harmony Score
The Dashboard and Reports tab both surface an Ecosystem Harmony card. This is a composite health score built from four signals:
- Audience Growth — new profiles added across all spokes in the last 30 days
- Campaign Velocity — active campaigns and average click-through rate
- Social Sentiment — intent score from the Instagram Intent Loop across monitored accounts
- Support Load — open tickets, urgent ticket count, and average first response time

A score above 80 is healthy. Below 60 indicates something needs attention — typically high support load or a spike in unsubscribes.

## Campaign Metrics
For each sent campaign, Reports shows:
- Delivered count and rate
- Opens and open rate
- Clicks and click rate
- Bounces (hard bounces add a global row to email_suppressions)
- Unsubscribes (add a per-branch — or global — row to email_suppressions)
- Complaints (add a global row to email_suppressions and flag for review)

These metrics update in near real-time as Resend fires delivery event webhooks back to the resend-webhook Edge Function, which writes email_events (source of these numbers) and updates the email_suppressions do-not-email list.

## The Sage Daily Briefing
At the top of the Dashboard, the Sage briefing runs once daily (or on demand via the refresh button). It uses Gemini to correlate cross-spoke patterns and surface insights — for example: "School students who purchased a course in the last 30 days are 3x more likely to buy organic soil on the Farm spoke." Use these insights to inform your next campaign segment.

## Dead Letter Queue
Any failed webhook ingest or failed email dispatch lands in DevTools > Dead Letter Queue. Check this weekly. Common causes are expired API keys on a spoke, Resend API rate limits, or malformed payloads. Each failed record shows the raw payload and error message so you can manually retry or correct the source data.
    `
  },

  // ── IDENTITY ──────────────────────────────────────────────
  {
    id: 'art_identity_golden_record',
    cat: 'identity',
    title: 'The Golden Record',
    desc: 'How Trellis merges multi-site customers into a single master identity.',
    time: '5m',
    content: `
## What Is a Golden Record?
A Golden Record is the single authoritative identity for a customer across the entire Sproutify ecosystem. No matter how many spokes a customer uses — the farm store, the school, the micro-gardening app — they map to exactly one row in the profiles table, identified by their email address.

## Why Email Is the Atomic Key
Email is the only field that is reliable, unique, and present on every spoke. Phone numbers change. Usernames differ per platform. But a customer uses the same email to buy soil on the farm store and register for a school workshop. Trellis uses this as the merge key.

When an inbound webhook arrives, the Ingest Gateway performs a lookup: does this email already exist in the profiles table? If yes, the new spoke is appended to their source_sites array. If no, a new profile is created. This happens atomically — no duplicates are created even if two webhooks for the same email arrive simultaneously, because the email column has a UNIQUE constraint.

## What the Golden Record Stores
The hub stores only identity-layer fields — the things Trellis uniquely computes across spokes:
- source_sites — which spokes this customer exists on
- tags and segments — cross-site behavioral labels
- ltv — lifetime value summed across all spoke purchases
- churn_risk — computed risk tier based on recency and engagement
- is_subscribed and marketing_pause — global consent state
- last_event_timestamp — used to prevent stale webhook overwrites

Spoke-specific fields (product preferences, order notes, custom attributes) remain in the spoke database and are queried live when needed.

## Viewing a Merged Profile
In the Profiles view, open any profile that shows multiple entries in its Branch badges. The detail panel will show the hub-level fields alongside a live federated query result from each connected spoke. The merge happens at the application layer — you see one unified view, sourced from two or more separate databases.

## Manually Merging Duplicates
If two profiles exist for the same customer (typically from a data quality issue at the source), the DevTools > Identity Tools panel provides a manual merge utility. Select both profiles, confirm the canonical email, and Trellis will consolidate the records — combining source_sites, summing LTV, and archiving the secondary profile with status = archived.
    `
  },
  {
    id: 'art_identity_subscription_states',
    cat: 'identity',
    title: 'Subscription & Consent States',
    desc: 'Understanding is_subscribed, marketing_pause, and status — and when each applies.',
    time: '4m',
    content: `
## Why Three Separate Fields?
Trellis uses three independent fields to manage whether a customer receives marketing. They serve different purposes and should not be conflated.

## is_subscribed
The consent flag Trellis reads when BUILDING an audience. It comes from the spoke (federated) or the profile's mapped consent. When false, the profile is excluded from the campaign audience up front.

Important: is_subscribed is the audience-build signal, NOT the final send-time gate. The authoritative do-not-email enforcement is the Hub email_suppressions list — every send filters against it regardless of is_subscribed. That is what actually stops a suppressed address from being emailed.

An address lands in email_suppressions (and is therefore skipped) when:
- The customer clicks the unsubscribe link — the unsubscribe Edge Function adds a row scoped to that brand (single-branch campaign) or 'global' (multi-branch)
- Resend fires a complaint (spam) event — the resend-webhook adds a 'global' row
- Resend fires a hard bounce — the resend-webhook adds a 'global' row

Zombie Protection still applies to profiles: a DELETE webhook that empties source_sites should set marketing_pause = true (not delete) while the identity persists.

Full detail on scopes, the ATL spoke exception, and adding a spoke unsubscribe for another brand: docs/UNSUBSCRIBE_AND_SUPPRESSION.md.

## marketing_pause
A temporary hold flag. When true, marketing is suppressed even if is_subscribed is true. Unlike is_subscribed, this is designed for temporary states — post-purchase cooldown, seasonal suppression, or manual holds during a support escalation.

The campaign send logic checks both: a profile must have is_subscribed = true AND marketing_pause = false to receive a campaign dispatch.

Set via the profile detail view toggle or via webhook payload (include marketing_pause: true in the customer object).

## status
The lifecycle state of the profile itself. Valid values:

- active — normal, all operations permitted
- archived — soft-deleted, profile retained for LTV history but excluded from all marketing. Applied automatically on Resend hard bounce.
- banned — manually set for accounts flagged for abuse. Excluded from all operations.
- deleted — set when source_sites becomes empty and the customer has no remaining ecosystem presence. Profile is retained for audit purposes but treated as non-existent for marketing.

## Compliance Checklist for Campaign Sends
Before dispatching any campaign, confirm your audience filter includes:
- status = active
- is_subscribed = true
- marketing_pause = false

The Campaign Builder applies these filters automatically when you use the standard audience controls. If you are dispatching programmatically via webhook, you must enforce these checks in your n8n workflow logic.
    `
  },

  // ── CAMPAIGNS ─────────────────────────────────────────────
  {
    id: 'art_campaigns_email_modules',
    cat: 'campaigns',
    title: 'Email Module Builder',
    desc: 'How to compose modular emails using the block system in the Email Previewer.',
    time: '5m',
    content: `
## How the Module Builder Works
Trellis emails are built from composable blocks rather than a single freeform editor. Each block serves a specific structural role in the email. You select, configure, and reorder blocks in the Campaign Builder content step, and the Email Previewer tab renders a live preview as you work.

## Available Modules

### Hero
The full-width header block. Includes a headline, subheadline, and a primary CTA button. The button links to a URL you specify — a product page, a course landing page, or a custom destination. The hero background color defaults to your brand primary color from Settings.

### Intro
A short text block for personalized opening copy. Token injection is available here — use {{first_name}} to open with the customer's name. Keep this block to two or three sentences. Long intros reduce click-through rates.

### Events
A structured list of upcoming events or workshops. Each entry includes a title, date, location, and optional registration link. Useful for school.sproutify.app workshop promotions.

### Products
A product card grid. Each card shows a product name, image URL, short description, and price. Pull product data from the WooCommerce API or enter manually. Limit to three products per email — more than that reduces conversion.

### App Promo
A dedicated block for promoting the Sproutify app or a specific feature. Includes a headline, feature bullets, and an app store link or deep link URL.

### Social Proof
A testimonial or review block. Enter a customer quote, their first name, and their location. Use real testimonials sourced from your spoke customer data for highest impact.

### Footer
Required for compliance. Must include the brand name, a physical mailing address (CAN-SPAM), and an unsubscribe link. Put the {{unsubscribe_url}} token in the link's href — at send time campaign-sender replaces it with the real unsubscribe URL for that recipient and brand. Clicking it adds a per-branch (or global) row to the Hub email_suppressions list, and that address is skipped on all future matching sends. Do NOT hardcode an unsubscribe URL or use {{unsubscribe_token}} — only {{unsubscribe_url}} is filled in. See docs/UNSUBSCRIBE_AND_SUPPRESSION.md.

## Token Injection Reference
Available tokens across all blocks:
- {{first_name}} — recipient's first name from the profiles table
- {{brand_name}} — brand name from Settings
- {{site_name}} — the spoke the customer came from (e.g. farm.sproutify.app)

Tokens that do not resolve (e.g. a profile with no first_name) fall back to a blank string. Write copy that reads naturally without the token in case of fallback — for example "Hi {{first_name}}," becomes "Hi ," for profiles with no name. Use "Hi there," instead as fallback-safe copy.
    `
  },
  {
    id: 'art_campaigns_sage_assist',
    cat: 'campaigns',
    title: 'Sage AI Campaign Assist',
    desc: 'Using Sage to generate copy, audit your audience, and suggest optimizations.',
    time: '5m',
    content: `
## What Sage Does in Campaign Builder
Sage is the AI layer inside the Campaign Builder. It does three things: generates first-draft copy based on your brand and audience, audits your segment before you send, and generates social content variants from your email content.

## Copy Generation
In the Campaign Builder content step, click AI Assist. Sage will prompt you for:
- Campaign goal — what action you want the recipient to take
- Tone override — if you want to deviate from your default brand tone for this campaign
- Audience context — Sage reads your current segment filters to inform the copy (e.g. if you are targeting woo_customer + high churn risk, Sage will write re-engagement copy rather than acquisition copy)

Sage generates a complete email draft including subject line, hero copy, intro text, and CTA. You can accept the draft, regenerate, or edit inline.

The underlying model is configured in Settings > API Keys (active_llm). Gemini is the default. Switching to OpenAI or Anthropic changes which model handles generation — useful if you hit rate limits or want to compare output quality.

## Segment Audit (Sage Audit)
Before deploying, run a Sage Audit from the Deploy step. Sage reviews your audience segment and surfaces risks:
- Compliance gaps — profiles in your segment that have is_subscribed = false or marketing_pause = true (these would be filtered at send time but indicate a segment definition issue)
- Churn risk distribution — what percentage of your audience is high or critical churn risk, and whether your copy is calibrated for re-engagement vs retention
- Segment size warnings — if your segment is very small (under 10 profiles), Sage flags this as statistically insufficient for meaningful analytics

## Social Variant Generation
After generating email copy, click Generate Social Variants. Sage produces three variants of your core message tailored for:
- Instagram — visual-first caption with emoji and a CTA to the link in bio
- X (Twitter) — condensed to under 280 characters, punchy and direct
- LinkedIn — professional framing with a focus on the community or educational angle

Each variant is pre-loaded into the Social Hub draft queue for your review before scheduling.

## Rate Limits and the Task Queue
Sage generation requests are routed through the marketing_task_queue when the active LLM is at or near its rate limit. The task queue processes generation jobs in controlled batches. If a generation appears to hang, check DevTools > Task Queue for the pending job status.
    `
  },

  // ── AUTOMATIONS ───────────────────────────────────────────
  {
    id: 'art_automations_logic_gates',
    cat: 'automations',
    title: 'Logic Gates & Trigger Conditions',
    desc: 'Building conditional automation rules that respond to cross-site customer behavior.',
    time: '6m',
    content: `
## What Is a Logic Gate?
A Logic Gate is a conditional rule that controls when an automation fires. Instead of sending a campaign immediately, you define a condition that must be true first — for example, "a customer on farm.sproutify.app made a purchase in the last 7 days." When the condition is met, the downstream action (send email, post to social, update a tag) executes automatically.

Logic Gates are configured in the Automations tab and linked to campaigns or standalone actions.

## Condition Types

### Event-Based Trigger
Fires when a specific event type arrives from a spoke. Configure:
- event_type — purchase | signup | check-in | social_intent | support_ticket
- source_site — filter to a specific spoke or leave blank for any spoke
- payload condition — optional JSONB path match (e.g. only trigger if payload.amount > 50)

Example: "When a purchase event arrives from farm.sproutify.app with amount > 100, tag the profile as high_value."

### Time-Based Delay
Fires a set time after a preceding event. Used to create nurture sequences.

Example: "Wait 24 hours after a signup event from school.sproutify.app, then send the onboarding email campaign."

Delays are stored as pending tasks in marketing_task_queue with a scheduled processed_at timestamp. The worker workflow checks this timestamp before executing.

### Cross-Site Condition
The most powerful gate type — fires based on activity across multiple spokes. Requires a profile to have events on more than one source_site.

Example: "If a profile has a signup on school.sproutify.app AND a purchase on farm.sproutify.app within the same 30-day window, apply the cross_buyer segment tag."

### Churn Risk Threshold
Fires when a profile's churn_risk field crosses a threshold. Used to trigger win-back sequences automatically without manual segment building.

Example: "When churn_risk changes to high, enroll the profile in the 3-email re-engagement sequence."

## Webhook Loop Prevention
When an automation fires and writes back to a spoke (e.g. updates a tag via webhook), that spoke may send a new event back to the Ingest Gateway. This creates a potential loop. Prevent this by:
1. Checking the processed_events table — every event has a unique event_id. If the ID already exists, the ingest gateway skips processing.
2. Using distinct event_type values for automation-triggered events (prefix with auto_ e.g. auto_tag_update) so your Logic Gate conditions can exclude them.
3. Setting a maximum retry count of 0 on automation-triggered webhook tasks in the task queue.
    `
  },
  {
    id: 'art_automations_dlq',
    cat: 'automations',
    title: 'Dead Letter Queue & Failed Syncs',
    desc: 'What the DLQ is, what lands in it, and how to reconcile failed records.',
    time: '4m',
    content: `
## What Is the Dead Letter Queue?
The Dead Letter Queue (DLQ) is the failed_syncs table in the Hub database. Any inbound event that cannot be processed after all retry attempts is written here instead of being silently dropped. It is your safety net for data that arrived but could not be ingested.

View the DLQ in DevTools > Dead Letter Queue.

## What Lands in the DLQ
Failed syncs occur when the Ingest Gateway receives a valid webhook payload but cannot complete processing. Common causes:

- Profile lookup timeout — the Hub could not resolve the email against the profiles table within the timeout window (usually indicates a database connection issue)
- Malformed payload — the incoming webhook is missing required fields (email, event_type, source_site, event_id). The gateway rejects the payload and writes it to the DLQ with the validation error.
- Downstream API failure — the event was ingested successfully but the subsequent task (email dispatch, AI generation) failed. The task record in marketing_task_queue will show status = failed and the failed_syncs entry will contain the downstream error.
- Revoked spoke key — the webhook arrived with an API key that has been revoked in Settings > Connections. The gateway rejects the event before processing.

## DLQ Record Structure
Each DLQ entry shows:
- event_id — the unique ID from the source (use this to find the original event in the spoke)
- source_site — which spoke sent the event
- raw_payload — the full original JSON payload, exactly as received
- error_message — what went wrong
- retry_count — how many times the gateway attempted to process it
- created_at — when the failure occurred

## Reconciling Failed Records
For each DLQ entry, you have three options available in the DevTools panel:

Retry — re-queues the raw_payload for reprocessing. Use this after fixing the root cause (e.g. after rotating a revoked API key or after a database connection issue resolves). The event will be re-checked against processed_events to prevent duplicate processing.

Edit and Retry — opens the raw payload in an editor so you can fix a malformed field before reprocessing. Use this for spoke data quality issues where the original payload was missing a required field.

Dismiss — marks the record as acknowledged without reprocessing. Use for events that are genuinely invalid (test payloads, bot activity, corrupted data) that should not enter the Hub.

## Preventing DLQ Buildup
Check the DLQ weekly. A growing DLQ indicates a systemic issue — usually an upstream spoke that changed its webhook payload format or an API key rotation that was not updated in Settings. Set up a Slack webhook alert (configurable in Settings) to notify your team when the DLQ count exceeds a threshold.
    `
  },

  // ── SOCIAL ────────────────────────────────────────────────
  {
    id: 'art_social_intent_loop',
    cat: 'social',
    title: 'The Social Intent Loop',
    desc: 'How Trellis monitors Instagram, X, and LinkedIn and scores inbound social signals.',
    time: '5m',
    content: `
## What Is the Social Intent Loop?
The Social Intent Loop is the automated pipeline that monitors your brand's social presence, identifies comments and mentions that signal purchase intent or support need, and routes them to the appropriate workflow — either a response queue, a support ticket, or a marketing automation trigger.

It runs continuously via the ig-intent-loop n8n webhook and the Social Hub view in Trellis.

## How Monitoring Works
The n8n workflow polls your connected social accounts on a configured schedule (default: every 15 minutes for Instagram, every 30 minutes for X and LinkedIn). When new comments, mentions, or DMs arrive, each one is passed through the intent scoring pipeline:

1. Content extraction — the comment or message text is extracted along with the platform username, post ID, and timestamp.
2. Identity match attempt — Trellis looks up the username against the profiles table. If a profile exists with a matching social handle in the metadata field, the intent is linked to that Golden Record. Unmatched intents are logged as unlinked activity in the Social Hub.
3. Intent scoring — Sage (via Gemini) analyzes the content and assigns an intent type: purchase_interest, support_request, general_engagement, or spam.
4. Routing — based on the intent type and score confidence, the item is routed to the correct queue.

## Intent Routing Rules
- purchase_interest (confidence > 70%) — added to the Social Hub response queue for a personalized reply. If the profile is identified and is_subscribed = true, Sage generates a response draft linking to the relevant product.
- support_request — creates a ticket in the Support Hub linked to the profile (if matched). Triggers the support triage workflow.
- general_engagement (likes, positive comments) — logged as a social_intent marketing event on the profile. Increases engagement_score.
- spam (confidence > 80%) — logged and dismissed. Not shown in the response queue.

## Responding via the Social Hub
The Social Hub view shows all pending intent items with their Sage-generated response drafts. Review each draft, edit if needed, and approve for dispatch. Approved responses are queued in marketing_task_queue with task_type = social_push and dispatched via the appropriate platform API.

All responses go through a compliance check before dispatch: the profile must have is_subscribed = true and status = active. If not, the response is held and flagged for manual review.

## Connecting Social Accounts
Social account credentials (Instagram access token, X bearer token, LinkedIn OAuth token) are stored encrypted in the Settings > Social Connections panel. Each token has an expiry — the Social Hub will surface a warning when a token is within 7 days of expiring. Rotate tokens before expiry to prevent monitoring gaps.
    `
  },
  {
    id: 'art_content_intelligence_guide',
    cat: 'social',
    title: 'Content Intelligence: Complete Operating Guide',
    desc: 'How to plan, register, measure, review, and retain project-specific content knowledge without mixing branches.',
    time: '9m',
    publishedAt: '2026-08-18',
    content: `
## What Content Intelligence Does
Content Intelligence is Trellis's durable workflow and memory for content experiments. It connects the question you chose, the asset that actually published, the result observed later, and the lesson worth carrying forward.

It does not replace Instagram, YouTube, Google Search Console, or another publisher/analytics provider. Those systems remain authoritative for publishing and raw metrics. Trellis preserves the reasoning and reviewed memory around them.

## The Most Important Rule
Shared workflow does not mean shared strategy. Every content record belongs to one project. Rejoice and Rekkrd use the same mechanics, but they do not share topic banks, hypotheses, baselines, or learnings. New branches receive their own partitions as well.

## Where Information Lives
### Task-Local Working Files
Each active task lives in .trellis/tasks/<task-id>. Its PRD, research, drafts, results, and retrospective can evolve on a working branch. These files are evidence of the work, not durable truth.

### Canonical Project Knowledge
Stable records live in .trellis/knowledge/projects/<project-id>. Topics, posts, experiments, and performance events are isolated by project. Strategy and promoted lessons live in .trellis/spec/projects/<project-id>.

## The Seven-Step Workflow
### 1. Choose the Project
Select the branch whose audience and strategy own the content. If the branch has no partition, use the setup command displayed on the Overview tab and complete its strategy before producing content.

### 2. Register or Reuse a Topic
A topic is a durable audience question, not merely a headline. Reuse a topic ID when the question is genuinely the same inside the same project. Similar questions in different projects get different IDs.

### 3. Create the Task
Open New Task. Define the target audience, topic/question, platform, measurable hypothesis, and success metrics. Copy and run the generated command from the repository. Trellis creates task.json, prd.md, research.md, drafts, results.md, and retrospective.md.

### 4. Research and Draft
Capture query evidence, customer questions, comments, or other signals in research.md. Follow the selected project's strategy and SEO/social rules. Keep draft variants task-local until an asset has a stable identity.

### 5. Publish and Register
Publish through the external channel. Then register the real asset with its post ID, topic ID, platform, status, canonical URL, publication time, source branch, and task ID. Never invent a URL or mark an unverified asset as published.

### 6. Append Performance and Review
Append metric snapshots at the declared evaluation windows. Do not replace an older snapshot with a later cumulative value. In results.md, compare the observations with the original hypothesis and classify the result as supported, mixed, unsupported, or inconclusive.

### 7. Promote Durable Learnings
Use retrospective.md to propose a finding. Promote it into only that project's content-learnings.md when the evidence justifies a reusable recommendation. Include evidence IDs, confidence, conditions, and how to use or retest the lesson.

## Understanding the Tabs
- Overview — project totals, topic landscape, open questions, and missing branch partitions.
- How It Works — the operating workflow, knowledge boundary, and merge checklist.
- Topics — canonical audience questions and their clusters, intent, source, and status.
- Assets — registered content plus successful Post Scheduler publications awaiting canonical review.
- Experiments — hypotheses, success metrics, evaluation windows, and review status.
- Performance — append-only snapshots associated with posts and experiments.
- Learnings — promoted guidance alongside the current project strategy and channel rules.
- New Task — builds a validated, project-scoped task command.

## Commands You Will Use
Create a project partition:
npm run content -- create-project --project branch-slug --name 'Branch Name'

Create a task:
npm run content -- create-task --project branch-slug --task content_branch_topic_001 --audience 'Specific audience' --topic 'Audience question' --platform instagram --hypothesis 'Measurable expectation' --success-metrics impressions,saves,clicks

Validate all canonical knowledge:
npm run content -- validate

Run focused tests:
npm run test:content

## Before Merging
- Confirm every record uses the correct project ID.
- Confirm published posts have real canonical URLs and publication times.
- Preserve every distinct performance event.
- Resolve JSONL conflicts by stable ID rather than accepting one whole side.
- Include evidence IDs for promoted learnings.
- Run the canonical validator and content tests.

## What Is Still Manual
The Assets tab automatically detects successful Post Scheduler publications and prepares a registration command. A person still confirms the canonical topic and real public URL before writing the record. Scheduled analytics imports, direct in-app approval writes, and an approval workflow for learning promotion are the remaining integration phase.
    `
  },
  {
    id: 'art_social_content_variants',
    cat: 'social',
    title: 'Multi-Platform Content Variants',
    desc: 'Generating and scheduling platform-specific content from a single brand message.',
    time: '4m',
    content: `
## The One-to-Many Content Problem
Every platform has a different optimal format. What works as an Instagram caption (visual-first, emoji-friendly, hashtag-heavy) fails on LinkedIn (professional, context-heavy, no hashtags). Writing three separate posts for every campaign is time-consuming and inconsistent.

Trellis solves this with the Sage Social Variant engine — write one core brand message, generate three platform-optimized versions automatically.

## Generating Variants

### From Campaign Builder
After generating email copy with Sage, click Generate Social Variants in the content step. Sage reads your email subject and hero copy and produces three variants: one for Instagram, one for X, one for LinkedIn. Each variant is pre-loaded into the Social Hub draft queue.

### From Social Hub Directly
In the Social Hub, click New Post. Enter your core message in the base content field. Click Generate Variants. Same process — three outputs, all editable before scheduling.

## Variant Structure by Platform

### Instagram
Format: 150-220 characters of caption copy, 3-5 relevant hashtags on a new line, a CTA directing to the link in bio. Sage uses a conversational, warm tone aligned to your brand voice. Emoji usage is moderate by default — adjust in the tone settings.

### X (Twitter)
Format: under 280 characters, single punchy statement, one link if applicable. No hashtags by default (they reduce engagement on X for most brand categories). Sage prioritizes the most quotable sentence from your core message.

### LinkedIn
Format: 3-4 sentence professional framing of the core message, followed by a brief elaboration paragraph, ending with a question to prompt comment engagement. No emoji. Hashtags are included (2-3, professional and topical).

## Scheduling
Each variant can be scheduled independently. Click the calendar icon on any draft to set a publish date and time. Scheduled posts are stored in the drafts table with status = scheduled and dispatched by the n8n social posting workflow at the configured time.

For coordinated campaign launches, set all three variants to publish within the same 2-hour window to maximize cross-platform reach without appearing to spam.

## Brand Compliance Audit
Before scheduling, Sage runs a brand compliance check on each variant. It flags:
- Off-tone language — words or phrases that conflict with your configured brand tone
- Unverified claims — superlatives or statistics not present in your base content
- Missing CTA — variants with no clear next step for the reader

Flagged items appear with an amber warning badge in the draft. You can override the flag and schedule anyway, but the audit result is logged for your records.
    `
  },

  // ── ADMIN ─────────────────────────────────────────────────
  {
    id: 'art_admin_brand_config',
    cat: 'admin',
    title: 'Brand Configuration',
    desc: 'Setting up your brand profile so Sage generates on-tone content automatically.',
    time: '3m',
    content: `
## Why Brand Config Matters
Every Sage-generated output — campaign copy, social variants, support reply drafts, daily briefings — is informed by your brand profile. A well-configured brand means Sage produces usable first drafts. A missing or generic brand config means Sage produces generic output that requires heavy editing.

## Configuring Your Brand
Navigate to Settings > Brand. The following fields affect AI output:

### Brand Name
Used in token injection ({{brand_name}}) and as context for Sage generation. Ensure this matches how your brand refers to itself in customer-facing copy — not your legal entity name.

### Industry
Gives Sage domain context. "Gardening & AgTech" tells Sage to use agricultural vocabulary, seasonal framing, and earthy tone. A generic "Retail" setting produces generic output.

### Brand Tone
A free-text field describing how your brand communicates. Be specific. "Professional yet earthy and encouraging" is more useful than "friendly." Examples of useful tone descriptors: conversational, authoritative, aspirational, educational, playful, community-focused.

Sage reads this field verbatim as part of its system prompt for every generation request. The more specific and accurate your tone description, the less editing you will do on generated drafts.

### Primary Color
Used in the Email Module Builder to set the hero block background color and button color. Enter as a hex value (e.g. #059669). This does not affect Sage text generation but does affect visual rendering in the Email Previewer.

### Logo URL
Optional. If provided, the logo is included in the email footer block and in the Email Previewer header. Host the logo at a publicly accessible HTTPS URL.

## Multi-Brand Setup
Trellis supports multiple brand profiles. Each brand has its own tone, color, and API key configuration. Switch the active brand from the brand selector in the top header. The active brand is passed to Sage for all generation requests in that session.

For commercial deployments, each tenant configures their own brand profile. Trellis never shares brand configuration between tenants.
    `
  },
  {
    id: 'art_admin_api_keys',
    cat: 'admin',
    title: 'API Keys & Credentials',
    desc: 'Where each API key lives, how it is used, and what breaks if it expires.',
    time: '4m',
    content: `
## Where Keys Are Stored
All API keys are entered in Settings > API Keys and persisted to the browser's localStorage under the trellis_v1_store key. In a production deployment, keys should be stored in environment variables and injected at build time — not entered via the UI. The Settings UI approach is designed for single-user or development deployments.

For commercial multi-tenant deployments, each tenant provides their own keys. Trellis never uses a shared credential.

## Key Reference

### active_llm
Not a key — the LLM provider selector. Set to gemini, openai, or anthropic. Determines which key and which model endpoint Sage uses for all AI generation. Switching providers mid-session takes effect immediately on the next generation request.

### gemini_api_key
Required if active_llm = gemini. Obtain from Google AI Studio (aistudio.google.com). Free tier supports 10 RPM — sufficient for development, insufficient for production campaigns. Upgrade to the paid tier for campaign-scale generation.

### openai_api_key
Required if active_llm = openai. Obtain from platform.openai.com. Used for GPT-4o generation via the Chat Completions endpoint.

### anthropic_api_key
Required if active_llm = anthropic. Obtain from console.anthropic.com. Used for Claude generation via the Messages endpoint.

### resend_token
Required for all email dispatch. Obtain from resend.com. Create a dedicated API key scoped to Sending access only — do not use the root key. If this key expires, all campaign email dispatch will fail silently until updated. The Resend dashboard will show failed sends.

### n8n_webhook
The base URL for your n8n instance. All webhook endpoints are constructed from this base. If your n8n instance URL changes, update this field and update all individual webhook URLs in the WEBHOOK_SPECS configuration in constants.ts.

### woo_consumer_key / woo_consumer_secret
WooCommerce REST API credentials for the ATL Urban Farms spoke. Used for federated product and order queries. Generate from the WooCommerce admin dashboard under Settings > Advanced > REST API. Scope: Read Only.

### twilio_sid / twilio_token
Required for voice call transcription via Twilio Whisper. Obtain from console.twilio.com. If these expire, inbound call transcription stops and no new support tickets are created from voice calls. Existing tickets are unaffected.

### slack_webhook
Optional. An incoming webhook URL from your Slack workspace for internal alerts (DLQ spikes, campaign launches, failed syncs). Create via Slack's Incoming Webhooks app. If not configured, Slack alerts are silently skipped.

## What to Do When a Key Expires
1. Generate a new key at the provider dashboard.
2. Enter it in Settings > API Keys.
3. If any events failed during the outage, check DevTools > Dead Letter Queue and retry affected records.
4. If the Resend key expired, check the Resend dashboard for failed send events and re-dispatch affected campaigns.
    `
  },
];
