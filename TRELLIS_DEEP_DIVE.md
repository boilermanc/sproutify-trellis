# Sproutify Trellis — Platform Deep Dive

> Comprehensive audit of everything Trellis does, how it works, and what remains incomplete.

---

## Context

This report documents the full scope of Sproutify Trellis as a federated marketing intelligence platform — its architecture, every module, all integrations, data flows, and the gaps between current state and intended vision.

---

## 1. What Trellis Is

Trellis is a **federated marketing orchestration hub** for the Sproutify agricultural business ecosystem. It does NOT store customer data locally. Instead, it reads from external "spoke" databases (WooCommerce stores, community apps, education platforms) and coordinates campaigns, social content, automation, and analytics across all of them.

**Core Principle:** Data stays in the spokes. Trellis reads, enriches, and orchestrates.

**Ecosystem Spokes:**
| Spoke | Domain | Purpose |
|-------|--------|---------|
| ATL Urban Farms | `atlurbanfarms.com` | Live plant e-commerce (primary spoke, fully connected) |
| Sproutify Farm | `farm.sproutify.app` | Smart gardening community |
| Sproutify School | `school.sproutify.app` | Garden education platform |
| Sproutify Micro | `micro.sproutify.app` | Micro-gardening tools |
| Let's Rejoice | `letsrejoice.app` | Community wellness & events |

**Current Reality:** Only ATL Urban Farms is fully connected as a live spoke. The other four are defined but not yet wired with live Supabase connections.

---

## 2. Architecture Overview

### Federated Data Flow
```
Spoke DBs (ATL, Farm, School, etc.)
    ↓ Live Supabase queries via spokeConnector.ts
    ↓ Normalize → Enrich with orders → Predict demographics
Trellis Hub (orchestration + events + campaigns)
    ↓ n8n webhooks for async operations
    ↓ Campaign Engine → Resend / Mailchimp / Social APIs
    ↓ Social Listening → Gemini intent classification
    ↓ Sage AI → Strategic insights
```

### Two Supabase Instances
| Instance | URL | Role |
|----------|-----|------|
| **Hub** | `horvjqqifgrzxesuxtfm.supabase.co` | Orchestration, events, credentials, campaigns, branches |
| **ATL Spoke** | `povudgtvzggnxwgtjexa.supabase.co` | Customer data, orders, products (read-only from Trellis) |

### Identity Resolution
- **Email** is the atomic merge key across all spokes
- Composite keys: `(spoke_id, customer_id)` or `(spoke_id, email_lowercase)` prevent false merges
- `branches[]` (JSONB array) tracks which spokes a profile appears on
- Upsert on `ON CONFLICT (email)` — never creates duplicates

### State Management
- **App.tsx** (475 lines) is the root orchestrator — holds 15+ state variables, threads props to all 24 page views
- Heavy use of **localStorage sidecar pattern** for offline resilience (campaigns, social accounts, signals, tasks)
- Supabase for persistent data; localStorage for fast reads with eventual-consistency writes
- 30-second polling for social signals; manual refresh for profiles

---

## 3. Module-by-Module Breakdown

### 3.1 Dashboard (`Dashboard.tsx`, ~1000 lines) — COMPLETE
The ecosystem command center.

**What it does:**
- **Sage Daily Briefing** — AI-generated summary of ecosystem health (audience growth, campaign velocity, social sentiment, support load)
- **Branch Stats Cards** — per-spoke profile counts, LTV, subscription rates with connection freshness indicators
- **Campaign Velocity** — timeline chart of recent campaign launches (reads from localStorage `trellis_campaign_history`)
- **Connection Health** — spoke sync status with green/amber/red freshness badges
- **Recent Events Feed** — latest marketing events with timestamp filtering
- **Order Summary** — aggregate revenue metrics from all connected spokes

**Incomplete:**
- Sage briefing sometimes falls back to mock data if Gemini API unavailable
- Campaign metrics are localStorage-only — no live Supabase campaign table reads
- No drill-down from summary cards to detailed views

---

### 3.2 Profiles (`Profiles.tsx`, ~1400 lines) — COMPLETE
Federated profile browser with consent tracking.

**What it does:**
- **Searchable profile table** — filter by name/email, branch, consent status
- **Consent tracking** — per-profile badges showing opted-in/opted-out/unverified with source labels (spoke_native, import_explicit, import_default, mock)
- **Branch badges** — color-coded pills showing all associated branches per profile
- **KPI bar** — total opted-in / opted-out / unverified counts
- **LTV & order stats** — displayed in table columns from enriched spoke data
- **ProfileDetailDrawer** — side panel with full profile, order history, social handles, segment membership, signal counts

**Incomplete:**
- Consent updates via UI store to localStorage only — not persisted to Supabase
- Bulk export to CSV not implemented
- Advanced filtering (by LTV tier, purchase history) is UI-only, not queryable

---

### 3.3 Campaign Builder (`CampaignBuilder.tsx`, ~2500 lines) — COMPLETE
5-step campaign creation wizard.

**Steps:**
1. **Scope** — select target branches, apply preset filters (High LTV, At-Risk, New Users, etc.)
2. **Identify** — resolve actual audience by branch, preview count with subscription status breakdown
3. **Compose** — template selection + Unlayer WYSIWYG email editor with theme color customization
4. **Schedule** — timezone-aware picker, send window (ASAP, 24h delay, 7-day drip)
5. **Deploy** — review audience, confirmation, triggers n8n `campaign_dispatch` webhook

**7 Campaign Presets:** High LTV, At-Risk, New Users, Repeat Buyers, VIP, Dormant, All Subscribers

**Incomplete:**
- A/B test variants not supported
- No save-as-draft without deploying (workflow is linear)
- Template library uses mock data — no CMS integration
- No edit/reschedule of existing campaigns
- Deliverability metrics (bounce, open rate) not shown in preview

---

### 3.4 Social Hub (`SocialHub.tsx`, ~2500 lines) — COMPLETE
Cross-platform social content creation, publishing, and intent listening.

**What it does:**
- **AI Composer** — Gemini generates social copy from prompt with tone/audience/CTA controls
- **Pipeline View** — 4-column Kanban: Drafting → Scheduled → Published → Archived
- **Approval Workflow** — "Approve Draft" → "Publish Now" with per-platform success/failure results
- **Intent Listening Queue** — real-time social signals with platform badges, sentiment, intent type (buying_intent, support_request, brand_mention, etc.)
- **Signal Actions** — Respond, Route to Support, Link to Profile, Dismiss
- **Intent Watcher Sidebar** — new signal pulse dots, confidence scores, branch names
- **Platform Management** — OAuth connect/disconnect for Instagram, X, LinkedIn, TikTok, Facebook, YouTube

**Incomplete:**
- Platform-specific preview formatting not implemented (IG carousel, X thread)
- Bulk scheduling calendar partial — UI exists but backend sync incomplete
- Community management (moderation, response templates) are stubs
- Social analytics (impressions, engagement rate) show placeholder values only
- OAuth popup may not auto-close on all browsers

---

### 3.5 Email Previewer (`EmailPreviewer.tsx`, ~160 lines) — PARTIAL
Email template preview with viewport simulation.

**What it does:**
- Profile selector dropdown for personalized preview
- Theme color presets (Sproutify Green, Earth, Modern Tech)
- Desktop/mobile viewport toggle

**Incomplete:**
- Read-only preview — no editing capability
- Unlayer editor not integrated here (it's in CampaignBuilder)
- No export/download as HTML
- No "send test email" button

---

### 3.6 Reports (`Reports.tsx`, ~770 lines) — PARTIAL
Analytics dashboard with AI-powered audit.

**What it does:**
- **4 Analytics Cards:** Audience Composition, LTV & Revenue Distribution, Subscription Health, Product Intelligence
- **Sage Audit** — AI analyzes data and returns strategic insights
- **Quick Prompts** — pre-built questions ("Who are my highest value customers?", "Which segments are at risk?")
- **System Blueprints** — 4 pre-built report templates (Audience Growth, Revenue & LTV, Campaign Performance, Cross-Channel)

**Incomplete:**
- Export to PDF not implemented
- Scheduled report delivery (email daily/weekly) not implemented
- Custom report builder (drag-and-drop) is future roadmap
- Cohort analysis (compare segments over time) is a stub
- No real-time refresh — data is static from initial load

---

### 3.7 Automations (`Automations.tsx`, ~470 lines) — PARTIAL
Visual n8n workflow builder and blueprint library.

**What it does:**
- **Flow Builder** — drag-and-drop canvas with node types: trigger, action, condition, delay
- **Node Library** — New Signup, New Order, Send Email, Slack Alert, Condition, Delay
- **n8n Blueprints Tab** — 3 blueprint cards with JSON copy-to-clipboard
- **Webhook Reference** — lists all pre-configured webhook URLs

**Incomplete:**
- AI strategy build uses mock nodes, not real Gemini parsing
- Node config is minimal — no full conditional logic builder
- Blueprint import requires manual copy-paste to n8n dashboard
- No preview/test execution of workflows
- No versioning/rollback of deployed flows
- Flows are always linear — no branching/parallel paths

---

### 3.8 Tasks (`Tasks.tsx`, ~527 lines) — PARTIAL
Campaign task management with multiple views.

**What it does:**
- **Grid / List / Calendar views** with search and priority filtering
- **Task types:** copywriting, design, audience, technical, analysis, social
- **Priority levels:** high (rose), medium (amber), low (blue)
- **Audit history** — timeline tracking creation, status changes, archival

**Incomplete:**
- **No Supabase persistence** — localStorage only
- No assignment to team members
- No subtasks or checklists
- Calendar view shows task dots but no drag-to-reschedule
- No automation triggers (e.g., "when task completed → Slack notification")

---

### 3.9 Support Hub (`SupportHub.tsx`) — PARTIAL
Ticket management with AI triage.

**What it does:**
- Ticket search/filter by priority (urgent, high, medium, low)
- AI confidence scoring — flags low-confidence tickets for human review
- PII sanitization on ticket descriptions
- Priority color routing

**Incomplete:**
- AI response generation is mocked/stubbed
- Knowledge base lookup for suggested responses not implemented
- Ticket history/thread viewing not built
- Reassignment to agents not visible
- SLA tracking missing
- Channel integration (which platform ticket came from) partial

---

### 3.10 Knowledge Base (`KnowledgeBase.tsx`) — STUB
Multi-spoke documentation library.

**What it does:**
- Docs vs FAQs tabs with search
- Global sync button (simulated RAG rebuild)
- Sage audit for knowledge gaps

**Incomplete:**
- **No actual RAG integration** — mock search only
- No automatic indexing of external docs (Confluence, Notion)
- No editor for creating new articles
- No version history

---

### 3.11 Dev Tools (`DevTools.tsx`) — PARTIAL
Developer sandbox for testing and debugging.

**Tabs:**
1. **Ingest Gateway Simulator** — test webhook payloads and idempotency
2. **Worker Queue** — task queue processing simulation
3. **Data Hygiene** — hot→cold archival trigger
4. **DLQ** — failed sync browser
5. **SQL Schema** — view live DDL
6. **n8n Webhooks** — endpoint reference

**Incomplete:**
- All simulators use mock timing — no real webhook testing
- DLQ recovery is read-only — no actual retry trigger
- SQL viewer is display-only — no execute capability

---

### 3.12 Settings (`Settings.tsx`) — COMPLETE
Configuration hub.

**Tabs:**
1. **Integrations** — third-party service connections
2. **Connections** — federated Supabase spoke management
3. **Secrets** — API keys (Gemini, OpenAI, Anthropic, Resend, Twilio, WooCommerce)
4. **Social** — platform OAuth configuration
5. **LLM Provider Selector** — switch between Gemini/OpenAI/Anthropic

**Incomplete:**
- Meta (Facebook) OAuth wizard partially implemented
- Settings change audit log missing

---

### 3.13 Branch Command Center (`BranchCommandCenter.tsx`) — COMPLETE
Branch lifecycle and branding management.

**What it does:**
- Branch CRUD (create, update, soft-delete)
- Spoke connection linking/unlinking
- Social account OAuth connect/disconnect per branch
- Branding config: primary/secondary/accent colors, font family, tone, tagline
- Profile/revenue snapshot generation

**Incomplete:**
- Brand auto-discovery (future roadmap)
- Branch template cloning not implemented

---

### 3.14 Brand Intelligence (`BrandIntelligence.tsx`) — COMPLETE
AI-powered brand DNA analysis.

**What it does:**
- Brand identity extraction (mission, values, voice, color palette)
- Competitive intelligence
- Marketing hook generation
- Asset generation prompts

---

### 3.15 Marketing Wizard (`MarketingWizard.tsx`) — COMPLETE
4-step AI-guided marketing generation pipeline.

**Steps:**
1. **Positioning** — competitive analysis + positioning statement
2. **Lead Magnet** — content outline generation
3. **Ad Copy** — platform-specific ad variations
4. **Email Sequence** — nurture sequence generation

All outputs logged to `marketing_generations` table for audit trail.

---

### 3.16 Reddit Growth (`RedditGrowth.tsx`) — COMPLETE
Reddit community growth tool.

**What it does:**
- Subreddit opportunity scanning via n8n
- AI-drafted comments with relevance scoring
- Human approval gate before posting
- Review staging pipeline

---

### 3.17 Video Ad Lab (`VideoAdLab.tsx`) — COMPLETE
AI video ad creation and orchestration.

**What it does:**
- 3-step wizard: Message → Look & Feel → Review
- Voice selection (ElevenLabs), tone presets, actor styles
- Pipeline options: Talking Head ($0.12) vs Full Scene ($0.70)
- Job status polling with progress tracking
- Template management per branch

**Incomplete:**
- Video preview/playback not shown in UI
- Cost estimation display missing
- Batch job submission not supported

---

### 3.18 Sage Chat (`SageChat.tsx`) — PARTIAL
Floating AI assistant.

**What it does:**
- Contextual quick-prompts based on message keywords
- Chat history with typing indicator
- Dynamic question suggestions

**Incomplete:**
- **No conversation persistence** — lost on page reload
- Context injection is heuristic keyword matching only
- No file upload or rich media

---

### 3.19 Supporting Pages
| Page | Status | Purpose |
|------|--------|---------|
| Login | Complete | Supabase Auth UI |
| ResetPassword | Complete | Password reset flow |
| UserProfile | Complete | Current user settings |
| TeamMembers | Complete | User management and roles |
| PlatformSetupWizard | Complete | Social platform OAuth guided setup |
| HelpCenter | Partial | In-app documentation (basic markdown parsing, no embeds) |

---

## 4. Services & Integrations

### 4.1 AI Service (`aiService.ts`)
**Multi-provider LLM routing** — Gemini (primary), OpenAI, Anthropic.

| Function | Purpose |
|----------|---------|
| `generateText()` | Core provider-agnostic text generation |
| `chatWithSage()` | Strategic intelligence chat with dynamic context |
| `generateTicketDraft()` | AI support responses |
| `generateCampaignCopy()` | Marketing copy |
| `generateSocialPost()` | Platform-aware social content (enforces char limits) |
| `generateEmailCopy()` | Personalized email intros |
| `runBrandComplianceAudit()` | 5-category brand audit |
| `sanitizePII()` | Mandatory PII redaction (CC, SSN, tokens) |

### 4.2 Email Service (`resendService.ts`)
Routes through Supabase RPC `send_resend_email` to avoid CORS.

| Function | Purpose |
|----------|---------|
| `sendEmail()` | Single email via RPC |
| `sendBatchEmails()` | Batch dispatch via Resend `/emails/batch` |
| `renderCampaignHtml()` | Responsive branded HTML template |

### 4.3 Social Service (`socialService.ts`)
Full social lifecycle management.

| Function | Purpose |
|----------|---------|
| `saveCredential()` | Store encrypted OAuth tokens |
| `checkConnections()` | Verify platform connection status |
| `disconnectPlatform()` | Revoke platform access |
| `publishToSocial()` | Post to platforms via n8n |
| `ingestSocialSignal()` | Record listening data |
| `fetchSocialSignals()` | Retrieve signals with filters |
| `updateSignalStatus()` | Action/dismiss signals |
| `linkProfileToSocial()` | Map social handle to profile |

### 4.4 n8n Service (`n8nService.ts`)
Generic webhook trigger for all async operations.

### 4.5 Other Services
| Service | Purpose |
|---------|---------|
| `secretsService.ts` | Encrypted credential management via `tenant_secrets` |
| `slackService.ts` | Notification webhooks (DLQ alerts, ticket alerts, campaign notifications) |
| `twilioService.ts` | SMS dispatch and voice outreach |
| `videoAdService.ts` | Fire-and-forget video job submission + polling |
| `marketingGenerationService.ts` | 4-step AI marketing pipeline with audit logging |
| `branchSnapshotService.ts` | Branch metadata snapshot for audit trail |
| `demographicsService.ts` | Gender/age prediction from first name + purchase patterns |
| `spokeConnectionsService.ts` | Spoke CRUD with localStorage↔Supabase sync |

---

## 5. Spoke Connector — The Federated Engine

`spokeConnector.ts` (988 lines) is the heart of the federated architecture.

**Pipeline:**
```
1. getSpokeClient(url, key)          → cached Supabase client per spoke
2. fetchSpokeProfiles(connection)    → normalize customer table → NormalizedSpokeProfile[]
3. fetchSpokeOrders(connection)      → supports multiple order tables (orders + legacy_orders)
4. fetchSpokeOrderItems(connection)  → product-level line items
5. enrichProfilesWithOrders()        → join profiles ↔ orders via composite keys
6. extractOrderIdentities()          → create synthetic profiles from order-only data
7. predictDemographicsSync()         → infer gender/age from name + purchase patterns
8. fetchEnrichedProfiles()           → master orchestration: parallel fetch → dedupe → enrich → predict
```

**Key capabilities:**
- Auto-discovers common tables (customers, orders, order_items, subscriptions)
- Intelligent field mapping with pattern matching
- Paginated fetching (batch size 1000)
- Parallel spoke queries with partial failure tolerance
- Order-only profile synthesis for guest checkouts

---

## 6. Database Schema

### Hub Tables (16 total)
| Table | Purpose |
|-------|---------|
| `profiles` | Master identity hub (email unique, branches JSONB, consent, LTV) |
| `marketing_events` | Hot event storage (90-day TTL) |
| `compressed_archive_events` | Cold storage for archived business events |
| `marketing_task_queue` | Rate-limited task processing |
| `campaigns` | Campaign registry with query definitions |
| `campaign_runs` | Deployment tracking per run |
| `social_credentials` | Encrypted OAuth tokens (pgp_sym_encrypt) |
| `social_signals` | Inbound intent queue from listening |
| `content_calendar_events` | Unified content calendar |
| `marketing_brands` | Brand profiles per branch |
| `marketing_generations` | AI generation audit log |
| `spoke_connections` | Federated data source configs |
| `email_templates` | Email template storage |
| `processed_events` | Idempotency tracking |
| `failed_syncs` | Dead letter queue |
| `tenant_secrets` | Org-scoped encrypted credentials |

### Key RPCs
| RPC | Purpose |
|-----|---------|
| `send_resend_email` | Server-side email dispatch (avoids CORS) |
| `upsert_social_credential` | Encrypted token storage |
| `check_social_connections` | Non-sensitive connection status |
| `disconnect_social_platform` | Credential deletion |
| `get_encryption_key()` | Symmetric key for pgp_sym_encrypt |
| `resolve_newsletter_audience` | ATL spoke audience query (to be replaced) |
| `purge_and_archive_old_events` | Daily ETL: hot→cold migration |

---

## 7. n8n Automation Blueprints

### Webhook Endpoints (10)
| Endpoint | Purpose |
|----------|---------|
| `trellis-ingest-gateway` | Profile/event ingestion from spokes |
| `trellis-campaign-dispatch` | Email campaign batch dispatch |
| `trellis-social-publish` | Social media posting |
| `social-signal-ingest` | Social listening signal intake |
| `ig-intent-loop` | Instagram intent classification |
| `resend-compliance` | Email bounce/complaint handling |
| `twilio-whisper-sync` | Voice/SMS event sync |
| `twilio-sms-dispatch` | SMS outbound dispatch |
| `reddit-review-stage` | Reddit comment staging |
| `reddit-post-comment` | Reddit approved post submission |

### Blueprint Files (8 importable JSONs in `n8n-blueprints/`)
| File | Trigger | Purpose |
|------|---------|---------|
| `B1-ingest-gateway.json` | Webhook | Profile ingestion from spokes |
| `B2-campaign-dispatch.json` | Webhook | Audience resolve → batch Resend |
| `B3-social-publisher.json` | Webhook | Credential fetch → platform API post |
| `C1-instagram-listener.json` | Schedule 5m | Graph API → Gemini classify → signal ingest |
| `C2-x-listener.json` | Schedule 5m | X API v2 → Gemini classify → signal ingest |
| `C3-linkedin-listener.json` | Schedule 15m | LinkedIn API → Gemini classify → signal ingest |
| `D1-reddit-scanner.json` | Schedule 3h | Subreddit scan → AI draft → review stage |
| `D2-reddit-poster.json` | Webhook | Human-approved Reddit posting |

---

## 8. Supabase Edge Functions

### `social-oauth/index.ts` (~750 lines)
Full OAuth 2.0 dance for 4 platforms:

| Platform | Auth Flow | Token Storage |
|----------|-----------|---------------|
| Instagram | Meta Graph OAuth | pgp_sym_encrypt → social_credentials |
| Facebook | Shared Meta app | Same |
| X | OAuth 2.0 + PKCE (Plain) | Same |
| LinkedIn | OAuth 2.0 | Same |

Deploy: `supabase functions deploy social-oauth --no-verify-jwt`

---

## 9. What's NOT Yet Complete

### Critical Gaps

| Gap | Impact | Current Workaround |
|-----|--------|-------------------|
| **Only 1 of 5 spokes connected** | ATL Urban Farms only; Farm, School, Micro, Rejoice not wired | Mock data fallbacks for other spokes |
| **Tasks are localStorage-only** | No persistence across devices/browsers | Data lost on clear |
| **Campaign history is localStorage-only** | Dashboard metrics not durable | Loses history on clear |
| **No CSV/PDF export anywhere** | Can't share reports externally | Manual copy-paste |
| **Sage chat has no memory** | Conversation lost on page reload | Re-ask each session |
| **Knowledge Base is mock data** | No real RAG indexing | Static placeholder articles |
| **Automation builder flows are linear only** | No branching, conditions are fake | Copy JSON to n8n manually |
| **SupportHub AI responses are stubbed** | No real AI triage in production | Manual ticket handling |
| **No real-time updates** | Heavy polling (30s signals), no WebSockets | Manual refresh for profiles |

### Roadmap Items (from code/CLAUDE.md)

| Phase | Focus | Status |
|-------|-------|--------|
| Phase 1 | Profile branch badges, branch filtering | ✅ Complete |
| Phase 2 | Dashboard real counts, activity feed | ✅ Complete |
| Phase 3 | Campaign Builder real profiles, save to Supabase | ✅ Complete |
| Phase 4 | n8n inbound webhooks, live sync | 🔜 Next |
| Phase 5 | Outbound actions (Resend, Mailchimp sync, Slack) | 🔜 Planned |
| Backlog | Brand Auto-Discovery via n8n + Gemini | 📋 Backlog |

### Specific TODOs Found in Code
1. **`constants.ts`** — Switch campaign audience from ATL spoke `resolve_newsletter_audience()` to unified Hub profiles table
2. **`constants.ts`** — Deploy `resolve_newsletter_audience()` RPC to correct instance
3. **`socialService.ts`** — `social_signals` table must be created on Hub before enabling listening
4. **`vite.config.ts`** — Reminder: Do NOT inject secrets via Vite define
5. **Settings.tsx** — Meta (Facebook) OAuth wizard partially implemented
6. **Reports.tsx** — Custom report builder, cohort analysis, scheduled delivery all future
7. **Profiles.tsx** — Consent save-back to Supabase not implemented
8. **Tasks.tsx** — Full Supabase persistence needed
9. **SageChat.tsx** — Conversation persistence and real context injection needed

---

## 10. Tech Stack Summary

| Layer | Technology | Version |
|-------|------------|---------|
| Frontend | React + TypeScript | React 19.2.3 |
| Build | Vite | Latest |
| Styling | TailwindCSS | Utility-first |
| Icons | Lucide React | 0.562.0 |
| AI (Primary) | Google Gemini | `@google/genai` 1.34.0 |
| AI (Alt) | OpenAI `gpt-4o-mini`, Anthropic `claude-3-5-haiku` | Provider-agnostic |
| Database | Supabase (PostgreSQL) | `@supabase/supabase-js` 2.90.1 |
| Email Editor | Unlayer | `react-email-editor` 1.7.11 |
| Email Dispatch | Resend | Via Supabase RPC |
| SMS/Voice | Twilio | REST API |
| Notifications | Slack | Webhook |
| Automation | n8n | Self-hosted at `n8n.sproutify.app` |
| Hosting | IONOS VPS | Plesk admin, Cloudflare DNS |

---

## 11. File Structure (Key Files)

```
sproutify-trellis/
├── App.tsx                          # Root component (475 lines) — all state + routing
├── types.ts                         # All TypeScript interfaces (913 lines)
├── constants.ts                     # SQL_SCHEMA, mocks, webhooks, blueprints (963 lines)
├── utils.ts                         # Branch display, time formatting, platform helpers
├── spokeConnector.ts                # Federated data engine (988 lines)
├── lib/
│   ├── supabase.ts                  # Hub Supabase client init
│   └── supabaseService.ts          # 90+ Hub DB helper functions (480 lines)
├── hooks/
│   ├── useBranchStats.ts           # Federated analytics aggregation (176 lines)
│   └── useVideoAdPoller.ts         # Video job status polling
├── utils/
│   └── profileMapper.ts            # Consent normalization pipeline (109 lines)
├── services/
│   ├── aiService.ts                # Multi-LLM routing + PII sanitization (282 lines)
│   ├── resendService.ts            # Email dispatch via Supabase RPC (154 lines)
│   ├── socialService.ts            # Social CRUD + signals (290 lines)
│   ├── n8nService.ts               # Webhook triggers (88 lines)
│   ├── secretsService.ts           # Credential management (69 lines)
│   ├── slackService.ts             # Slack notifications (119 lines)
│   ├── twilioService.ts            # SMS + voice (147 lines)
│   ├── videoAdService.ts           # Video ad job management (121 lines)
│   ├── marketingGenerationService.ts # AI marketing pipeline (349 lines)
│   ├── spokeConnectionsService.ts  # Spoke CRUD + migration (155 lines)
│   ├── branchSnapshotService.ts    # Branch audit snapshots (358 lines)
│   ├── demographicsService.ts      # Name-based demographics prediction (399 lines)
│   └── marketingBrandService.ts    # Brand profile CRUD (86 lines)
├── pages/                           # 24 page components
│   ├── Dashboard.tsx               # ~1000 lines
│   ├── Profiles.tsx                # ~1400 lines
│   ├── CampaignBuilder.tsx         # ~2500 lines
│   ├── SocialHub.tsx               # ~2500 lines
│   ├── BranchCommandCenter.tsx     # Branch lifecycle management
│   ├── BrandIntelligence.tsx       # AI brand analysis
│   ├── MarketingWizard.tsx         # 4-step AI marketing pipeline
│   ├── RedditGrowth.tsx            # Reddit community growth
│   ├── VideoAdLab.tsx              # AI video ad creation
│   ├── Reports.tsx                 # Analytics + Sage audit
│   ├── Automations.tsx             # n8n flow builder + blueprints
│   ├── Tasks.tsx                   # Task management (3 views)
│   ├── EmailPreviewer.tsx          # Email preview
│   ├── SupportHub.tsx              # Ticket management + AI triage
│   ├── KnowledgeBase.tsx           # Documentation library (stub)
│   ├── DevTools.tsx                # Developer sandbox
│   ├── Settings.tsx                # Configuration hub
│   ├── HelpCenter.tsx              # In-app docs
│   └── [Login, ResetPassword, UserProfile, TeamMembers, PlatformSetupWizard]
├── components/
│   ├── Layout.tsx                  # Sidebar navigation shell
│   ├── SageChat.tsx                # Floating AI chat
│   ├── ContextAwareHelp.tsx        # Context-sensitive help
│   ├── CustomerSitesTag.tsx        # Branch badges
│   └── UnifiedOnboarding.tsx       # First-time user flow
├── contexts/
│   └── AuthContext.tsx             # Supabase auth state
├── supabase/functions/
│   └── social-oauth/index.ts      # OAuth 2.0 Edge Function (~750 lines)
├── n8n-blueprints/                  # 8 importable workflow JSONs
└── CLAUDE.md                        # AI coding guidelines
```

---

## 12. Security Model

| Layer | Mechanism |
|-------|-----------|
| Row Level Security | All Hub tables have RLS enabled; service_role blanket access |
| OAuth tokens | `pgp_sym_encrypt()` with `get_encryption_key()` RPC |
| API keys | Stored in `tenant_secrets` table, org-scoped |
| PII | `sanitizePII()` mandatory before AI calls — catches CC, SSN, tokens |
| XSS | `escapeHtml()` on all user-interpolated email content |
| CSS injection | `safeColor()` validates hex before inline styles |
| CORS | Email dispatch routes through Supabase RPC (server-side) |
| Zombie protection | Profiles not deleted if `jsonb_array_length(source_sites) > 0` |

---

## 13. Data Lifecycle

```
INGEST:   Spoke webhooks → n8n ingest_gateway → profiles table (upsert on email)
ENRICH:   spokeConnector → orders + demographics → EnrichedProfile
CAMPAIGN: CampaignBuilder → n8n dispatch → Resend batch → compliance webhook
LISTEN:   n8n listeners (5m) → Gemini classify → social_signals table
ARCHIVE:  pg_cron nightly → hot events (90d) → cold storage or purge
AUDIT:    marketing_generations logs all AI calls with prompt hash + cost
```

---

*Generated 2026-03-03 — Comprehensive audit of the Sproutify Trellis codebase.*
