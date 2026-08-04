# Sproutify Trellis - AI Coding Guidelines

> Primary reference document for AI agents working on this codebase.

---

## Project Context

Sproutify Trellis is a **unified marketing intelligence platform** that serves as a federated Identity Hub for the Sproutify agricultural business ecosystem. It orchestrates customer data, campaigns, and automation across multiple "spoke" websites without storing profile data locally.

**Business Model:** Federated marketing orchestration — data stays in the spokes, Trellis reads and coordinates.

**Ecosystem Spokes:**
- `atlurbanfarms.com` — Live plant seedlings e-commerce (ATL Urban Farms)
- `farm.sproutify.app` — Smart gardening community
- `school.sproutify.app` — Garden education platform
- `micro.sproutify.app` — Micro-gardening tools
- `letsrejoice.app` — Community wellness & events

**Current State:**
- 13 major UI modules (Dashboard, Profiles, Campaign Builder, Social Hub, Reports, etc.)
- Federated spoke connector live to ATL Urban Farms Supabase
- AI-powered content generation via Google Gemini
- n8n workflow orchestration for automation
- Hub Supabase: `horvjqqifgrzxesuxtfm.supabase.co`
- ATL Spoke Supabase: `povudgtvzggnxwgtjexa.supabase.co`

---

## Tech Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| Frontend | React 19 + TypeScript | Vite build, TailwindCSS |
| UI Icons | Lucide React | Consistent icon library |
| AI | Google Gemini (`@google/genai`) | Provider-agnostic architecture planned |
| Backend | Supabase | PostgreSQL, Auth, Storage |
| Automation | n8n | Workflow orchestration, webhooks |
| Email | Resend | Transactional email dispatch |
| Audience | Mailchimp | List management & sync |
| Social | Reddit, Instagram, X, LinkedIn | Multi-platform distribution |
| Hosting | IONOS VPS | Plesk admin, Cloudflare DNS |
| Development | Cursor AI | AI-assisted development |
| Version Control | GitHub | `boilermanc/sproutify-trellis` |

---

## Key People

| Person | Role | Domain |
|--------|------|--------|
| **Clint** | Technical Lead / Architect | Architecture, code, deployment, strategy |
| **Sheree** | Farm Ops & QA | Testing, `farm.sproutify.app` management |

---

## Operating Principles

### 1. Federated Data — Never Store Locally
Trellis **never** stores customer profile data in its own database. It reads from connected spoke databases via live queries (federated model). The Hub stores only orchestration data: marketing events, task queues, campaign metadata.

### 2. Correctness Over Cleverness
Write code that is obviously correct, not code that is cleverly correct. Prefer boring, proven patterns over novel approaches.

### 3. Smallest Change That Works
Minimize blast radius. Don't refactor adjacent code unless explicitly requested. A bug fix is just a bug fix.

### 4. Leverage Existing Patterns
Before creating something new, search for existing implementations in the codebase. Mirror established conventions.

### 5. Prove It Works
Every change must be verifiable. Show the test, show the query result, show the UI behavior.

### 6. Be Explicit About Uncertainty
If you're not sure, say so. "I believe this will work because X" is better than silent assumptions.

---

## Architecture — The Federated Model

### Core Principle
Trellis is an **orchestration layer**, not a data warehouse. Profile data lives in spoke databases. Trellis virtualizes that data by querying remote spokes live.

### Data Flow
```
Spoke DBs (ATL, Farm, School, etc.)
    ↓ Live queries via Supabase client
Trellis Hub (orchestration + events)
    ↓ n8n webhooks
Campaign Engine → Resend / Mailchimp / Social APIs
```

### Two Supabase Instances
| Instance | Role | URL |
|----------|------|-----|
| **Hub** | Orchestration, events, task queues | `horvjqqifgrzxesuxtfm.supabase.co` |
| **ATL Spoke** | Customer data, orders, products | `povudgtvzggnxwgtjexa.supabase.co` |

### Identity Resolution
- **Email** is the atomic merge key across all spokes
- **spoke_uuid** provides reverse lookup to the source system
- **source_sites** (JSONB array) tracks which spokes a profile appears on
- Upsert on `ON CONFLICT (email)` — never create duplicates

### Zombie Protection
A profile must NOT be marked `deleted` if it still appears in any active spoke. Check `jsonb_array_length(source_sites) > 0` before deletion. Set `marketing_pause = true` instead.

---

## Module Map

| Module | File | Purpose |
|--------|------|---------|
| Dashboard | `Dashboard.tsx` | Ecosystem overview, Sage daily briefing |
| Profiles | `Profiles.tsx` | Federated profile browser with branch badges |
| Campaign Builder | `CampaignBuilder.tsx` | Multi-step campaign creation with AI |
| Social Hub | `SocialHub.tsx` | Cross-platform social content & calendar |
| Reports | `Reports.tsx` | Analytics blueprints and data export |
| Automations | `Automations.tsx` | n8n flow builder and monitoring |
| Tasks | `Tasks.tsx` | Campaign task management |
| Email Previewer | `EmailPreviewer.tsx` | Modular email composition & preview |
| Support Hub | `SupportHub.tsx` | Ticket management with AI triage |
| Knowledge Base | `KnowledgeBase.tsx` | Multi-site RAG content library |
| Dev Resources | `DevTools.tsx` | Schema Engine, Data Hygiene, DLQ |
| Settings | `Settings.tsx` | API keys, spoke config, branch management |
| Help Center | `HelpCenter.tsx` | Contextual documentation |

---

## Workflow Orchestration

### Plan Mode Default
Start complex tasks in plan mode. Outline the approach before writing code.

### Incremental Delivery
Ship working increments. Don't batch large changes. Give steps one at a time.

### Cursor Prompt Strategy
Clint develops via Cursor IDE prompts. When delivering implementation guidance, format as copy-pasteable Cursor prompts rather than manual code changes.

### Verification Before Done
Never mark a task complete without demonstrating it works:
- Show the query result
- Show the UI screenshot
- Show the test passing

### Self-Improvement Loop
After each significant task, capture patterns and lessons learned for future reference.

---

## Communication Guidelines

### Concise High-Signal
- Lead with the answer
- Code over explanation when possible
- Steps delivered one at a time (per Clint's preference)

### SSH Commands Always Included
When the answer involves server operations, always include the SSH commands.

### Ask Only When Blocked
Don't ask for clarification if you can make a reasonable assumption. State the assumption instead.

### State Assumptions
"Assuming you want X because Y" — then proceed. Correct if wrong.

### Show Verification Story
Don't just say "done." Show: what changed, how to verify, what could break.

---

## Project-Specific Conventions

### Database

| Convention | Rule |
|------------|------|
| Schema approach | Single Master Schema in `SQL_SCHEMA` constant (`constants.ts`) |
| Table names | `snake_case`, descriptive (`marketing_events`, `failed_syncs`) |
| Primary keys | Always `UUID DEFAULT uuid_generate_v4()`, column named `id` |
| Row Level Security | **Always enabled**, service_role only |
| Timestamps | Always `TIMESTAMPTZ`, never bare `TIMESTAMP` |
| Status fields | `CHECK` constraints, never Postgres `ENUM` types |
| JSONB arrays | Used for `source_sites`, `tags`, `segments` (not junction tables) |
| Indexing | GIN with `jsonb_path_ops` for JSONB arrays, trigram for search |
| Idempotency | All DDL uses `IF NOT EXISTS` / `IF EXISTS` |
| Upserts | `ON CONFLICT (email) DO UPDATE` with `WHERE NOT ... @>` guard |

### Frontend

| Convention | Rule |
|------------|------|
| Framework | React 19 functional components with hooks |
| Styling | TailwindCSS utility classes, rounded corners (`rounded-[2rem]+`) |
| Icons | Lucide React exclusively |
| State | `useState` + `useEffect` + `useMemo`, localStorage persistence |
| Type safety | Strict TypeScript, interfaces in `types.ts` |
| Error handling | Toast notifications via global `addToast()` |
| Design language | Slate/emerald palette, `font-black uppercase tracking-tight` headers |
| Responsive | Mobile-first, `lg:grid-cols-*` breakpoints |

### AI Integration

| Convention | Rule |
|------------|------|
| Provider | Google Gemini (`@google/genai`) as primary |
| Architecture | Provider-agnostic — `LlmProvider` type supports `gemini`, `openai`, `anthropic` |
| PII Protection | Always run `sanitizePII()` before storing AI input/output |
| Initialization | Create `new GoogleGenAI()` inside each function call, not as a module-level singleton |
| Response access | Use `response.text` (property), not `response.text()` (method) |
| Error handling | Always wrap AI calls in try/catch with user-facing fallback |

### n8n Webhooks

| Endpoint | Purpose |
|----------|---------|
| `trellis-ingest-gateway` | Profile/event ingestion from spokes |
| `ig-intent-loop` | Instagram social listening |
| `resend-compliance` | Email bounce/complaint handling |
| `twilio-whisper-sync` | Voice/SMS event sync |

---

## File Structure

```
sproutify-trellis/
├── index.html              # Entry point
├── index.tsx               # React root mount
├── index.css               # Global styles (Tailwind)
├── App.tsx                 # Root component, state management, routing
├── types.ts                # All TypeScript interfaces
├── constants.ts            # SQL_SCHEMA, SITES_LIST, mock data, webhook specs
├── aiService.ts            # Sage AI, PII sanitizer
├── geminiService.ts        # Gemini email copy generation
├── components/
│   ├── Layout.tsx          # Sidebar navigation shell
│   ├── SageChat.tsx        # Floating AI chat panel
│   ├── UnifiedOnboarding.tsx
│   ├── ContextAwareHelp.tsx
│   └── CustomerSitesTag.tsx
├── pages/
│   ├── Dashboard.tsx
│   ├── Profiles.tsx
│   ├── CampaignBuilder.tsx
│   ├── SocialHub.tsx
│   ├── Reports.tsx
│   ├── Automations.tsx
│   ├── Tasks.tsx
│   ├── EmailPreviewer.tsx
│   ├── SupportHub.tsx
│   ├── KnowledgeBase.tsx
│   ├── DevTools.tsx
│   ├── Settings.tsx
│   └── HelpCenter.tsx
├── SKILL.md                # PostgreSQL best practices skill
├── package.json
├── tsconfig.json
├── vite_config.ts
└── .env.local              # API keys (gitignored)
```

---

## Key Integrations

| Service | Endpoint/Key Reference |
|---------|----------------------|
| Hub Supabase | `horvjqqifgrzxesuxtfm.supabase.co` |
| ATL Spoke Supabase | `povudgtvzggnxwgtjexa.supabase.co` |
| n8n Webhooks | `https://n8n.sproutify.io/webhook/{endpoint}` |
| Gemini AI | `process.env.API_KEY` / `process.env.GEMINI_API_KEY` |
| Resend Email | Token stored in Hub Supabase `tenant_secrets` |

---

## Data Hygiene Rules

### Hot/Cold Storage (TTL 90 Days)
- **Hot** (`marketing_events`): Active events for dashboards, campaigns
- **Cold** (`compressed_archive_events`): Archived business events
- **pg_cron** runs nightly at 3 AM UTC

### What Gets Archived vs. Purged
- **Archive to cold:** `purchase`, `signup`, `ticket_resolved`
- **Purge (no archive):** `email_open`, `link_click`, `heartbeat`
- **Never TTL'd:** `profiles` — they persist indefinitely

### Dead Letter Queue
Failed webhook events land in `failed_syncs` for manual reconciliation via DevTools. Auto-retry up to 3 times with exponential backoff.

---

## Error Handling

### Stop-the-Line Rule
When something fails unexpectedly, stop and understand why before proceeding.

### Triage Checklist
1. **Reproduce** — Can you make it happen consistently?
2. **Localize** — What component/function is failing?
3. **Reduce** — What's the minimal reproduction?
4. **Fix** — Apply the smallest correct fix
5. **Guard** — Add validation to prevent recurrence
6. **Verify** — Prove the fix works

### Safe Fallbacks
AI generation failures must show graceful fallback UI, not crash. Toast errors for user feedback.

---

## Schema Evolution Checklist

When modifying the database schema:

- [ ] Update the `SQL_SCHEMA` constant in `constants.ts`
- [ ] Ensure all new statements use `IF NOT EXISTS` / `IF EXISTS`
- [ ] Add GIN indices for any new JSONB columns
- [ ] Enable RLS on any new tables with service_role policy
- [ ] Add CHECK constraints (not ENUMs) for any new status fields
- [ ] Use `TIMESTAMPTZ` for all new timestamp columns
- [ ] Use `UUID PRIMARY KEY DEFAULT uuid_generate_v4()` for new tables
- [ ] Update the Dev Resources → Schema Engine tab if applicable
- [ ] Test the full SQL block as an idempotent stamp on a fresh instance
- [ ] Verify `purge_and_archive_old_events()` accounts for any new event types

---

## Common Gotchas

### Federated Data Is Read-Only
Trellis reads from spoke databases — it does NOT write back to them. Campaign sends go through n8n → Resend/Mailchimp, never direct spoke DB writes.

### `source_sites` Is JSONB, Not Text[]
Use containment operators (`@>`) for lookups, not `= ANY()`. The GIN index requires `jsonb_path_ops`.

```sql
-- ✅ CORRECT
WHERE source_sites @> '"farm.sproutify.app"'::jsonb

-- ❌ WRONG
WHERE 'farm.sproutify.app' = ANY(source_sites)
```

### Gemini Response Is a Property, Not a Method
```typescript
// ✅ CORRECT
const text = response.text;

// ❌ WRONG
const text = response.text();
```

### PII Sanitization Is Non-Negotiable
Always run `sanitizePII()` on any user-submitted text before AI processing or storage. The scrubber catches credit card numbers, SSNs, and long API tokens.

### Don't Enable Supabase Realtime on Hot Tables
`marketing_events` and `marketing_task_queue` are high-volume. Use polling or n8n webhook callbacks, never Supabase Realtime subscriptions.

### Branch Consent vs. Global Flags
`is_subscribed` and `marketing_pause` are global flags. Branch-level consent uses `branch_consent` (JSONB object keyed by branch slug). Always check branch-level consent for targeted campaigns.

### The Mock Data Trap
`constants.ts` contains `MOCK_PROFILES`, `MOCK_EVENTS`, etc. These are development fallbacks. Real data comes from the federated spoke connector. When adding features, ensure they work with both mock and live data paths.

---

## Deployment

### IONOS VPS Access
```bash
ssh your-server
cd /path/to/sproutify-trellis
```

### Build & Deploy
```bash
npm run build    # Vite production build → dist/
npm run dev      # Local dev server on port 3000
npm run preview  # Preview production build
```

### Environment Variables
```bash
# .env.local (gitignored)
GEMINI_API_KEY=your_key_here
VITE_SUPABASE_URL=https://horvjqqifgrzxesuxtfm.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

---

## Roadmap Reference

| Phase | Focus | Status |
|-------|-------|--------|
| Phase 1 | Profile branch badges, branch filtering | ✅ Complete |
| Phase 2 | Dashboard real counts, activity feed | ✅ Complete |
| Phase 3 | Campaign Builder real profiles, save to Supabase | ✅ Complete |
| Phase 4 | n8n inbound webhooks, live sync | 🔜 Next |
| Phase 5 | Outbound actions (Resend, Mailchimp sync, Slack) | 🔜 Planned |
| Backlog | Brand Auto-Discovery via n8n + Gemini | 📋 Backlog |

---

## Definition of Done

A task is complete when:

- [ ] Code compiles with no TypeScript errors
- [ ] Functionality works as specified
- [ ] Edge cases handled (empty states, error states, loading states)
- [ ] No console errors in browser
- [ ] Federated data path tested (not just mock data)
- [ ] PII sanitization applied where applicable
- [ ] RLS policies allow required access (if DB change)
- [ ] Verification steps documented
- [ ] Toast notifications for user-facing success/error states

---

## Templates

### Cursor Prompt Template

```markdown
## Task: [Feature/Fix Name]

### Goal
[One sentence describing the outcome]

### Context
[What exists now, which files are affected]

### Implementation
[Step-by-step changes with code blocks]

### Files Affected
- `path/to/file1.ts`
- `path/to/file2.tsx`

### Verification
- [ ] [How to verify change 1]
- [ ] [How to verify change 2]
```

### Bugfix Template

```markdown
## Bug: [Brief Description]

### Symptom
[What the user sees]

### Root Cause
[Why it happens]

### Fix
[What changed]

### Verification
[How to confirm it's fixed]

### Prevention
[Guard against recurrence]
```

---

*Last updated: 2026-02-16*
