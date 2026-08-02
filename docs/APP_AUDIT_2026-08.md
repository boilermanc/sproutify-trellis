# Sproutify Trellis — Full Application Audit

**Date:** 2026-08-01 (overnight sweep)
**Method:** ~15 parallel agents reading every page, service, blueprint, and Edge Function, plus live probes against the running n8n instance and read-only queries against the Hub database.
**Status legend:** `[ ]` open · `[x]` fixed · `[~]` partially addressed

> **Confidence markers.** ✅ = I verified this personally (live query, live probe, or read the code myself). 🔍 = reported by an audit agent with a file:line citation but not independently re-verified — check before acting. I've tried hard not to blur the two.

---

## How to read this

The app is **more real than it looks from the inside**. The federated data path, the creative pipelines, scheduled publishing, email reporting, ad performance import, and Card Studio are all genuinely working software. The problem isn't that it's hollow — it's that **the real 80% and the fake 20% sit side by side with identical styling**, so you can't tell them apart, and neither can anyone you show it to.

That's the theme of this document. Ranked by what would hurt most:

1. **Security** — a handful of tables and functions are readable by anyone on the internet.
2. **Things that lie to you** — fake numbers and false success messages next to real ones.
3. **Dead ends** — buttons that do nothing.
4. **Broken plumbing** — six webhooks the app calls that nothing answers.
5. **AI gaps** — generation is blind to every piece of performance data you collect.
6. **Product opportunities** — what to build next.

---

## 0. Fixed tonight, before you woke up

- [x] ✅ **Master encryption key and social tokens were world-readable.** Four database functions — `get_encryption_key()`, `get_social_credential()`, `get_active_social_tokens()`, `get_resend_token()` — were executable by anyone holding the public anon key (the one that ships in every browser bundle by design). Chained, they gave a stranger the master decryption key, then every brand's live Instagram/Facebook OAuth token, then the Resend API token. All four are now `service_role`-only.
  - **Gotcha worth remembering:** the first revoke silently did nothing. Postgres grants `EXECUTE` to `PUBLIC` by default and `anon` inherits it, so `REVOKE ... FROM anon` alone changes nothing — you must revoke from `PUBLIC`. Any future lockdown needs the same treatment.
  - Verified afterwards that n8n publishing still works (it calls the same RPC as `service_role`). Nothing broke.
  - **You should still rotate the Instagram token you pasted into chat, and consider the Resend token exposed too.**

Everything below is still open.

---

## 1. Security — do these first

### 1.1 `tenant_secrets` is readable by anyone ✅ CRITICAL
RLS is **disabled** on the table holding `gemini_api_key`, `resend_token`, `twilio_sid`, `twilio_token`, `woo_consumer_*`, `meta_app_secret`, `openai_api_key`, `anthropic_api_key` — in plaintext, not encrypted. Policies exist on the table but Postgres skips them entirely when RLS is off.

Anyone can read every third-party key you own with a single HTTP request and the public anon key.

- [ ] Rotate every credential in that row — treat them all as leaked.
- [ ] Move `fetchSecrets()`/`saveSecrets()` (`services/secretsService.ts`) behind a service-role Edge Function.
- [ ] Then enable RLS.

> **Why I didn't just fix this tonight:** the browser legitimately reads this table today (`secretsService.ts` runs `select *` with the anon key on load). Enabling RLS without moving that call first would have broken the app while you slept — every AI feature would lose its API key. The code has to move first. This is the one place where the fix order genuinely matters.

### 1.2 `spoke_connections` is readable by anyone ✅ CRITICAL
Same bug — RLS disabled despite policies existing, plus an explicit `"Anon Full Access"` policy. Exposes every spoke's Supabase URL and key. Combined with 1.1 and the (now-closed) encryption-key hole, this was a direct path into all your customers' data across every spoke.

- [ ] Enable RLS, drop the anon policy, restrict to `service_role`.
- [ ] Finish the `spoke-query` proxy migration (phases 2–5) so the browser never needs this table. Good news: `get_spoke_connection_key` was **already** correctly locked down — that newer work is right, it just hasn't replaced the old path yet.

### 1.3 `profiles` allows anyone to make themselves an admin 🔍 CRITICAL
RLS is on, but the policies are `USING (true)` for everyone — full read and write. Two consequences: all customer PII is publicly readable, and since `invite-user` trusts `profiles.role` for authorization, **any authenticated user can `update profiles set role='admin'` on their own row** and then invite more admins.

- [ ] Scope policies to `id = auth.uid()`, and make `role` writable only through an admin-gated function. The correct pattern already exists in this codebase — copy `trellis_users` / `is_trellis_admin()`.

### 1.4 Anyone can publish to your social accounts 🔍 HIGH
`scheduled_social_posts` is fully writable by `anon`. The S1 cron worker publishes whatever is in that table to real brand accounts every 10 minutes. A stranger can insert a row and have arbitrary content posted to your Instagram. `video_ad_jobs` similarly allows anonymous `DELETE`.

- [ ] Require `authenticated` + branch membership on both.

### 1.5 RLS disabled on five more tables 🔍 HIGH
`brand_profiles`, `video_ad_templates`, `email_templates`, `branch_snapshots`, `integration_configs` — all world-writable. Lower sensitivity (no live credentials), but anyone can rewrite your email templates. `integration_configs` has an `api_key_encrypted` column and should be locked before it's ever populated.

### 1.6 Customer email data is publicly readable 🔍 HIGH
`email_events`, `email_suppressions`, `campaign_sends` all allow anon `SELECT` — customer addresses plus who opened what. Useful recon for someone phishing your customers.

### 1.7 n8n webhooks are unauthenticated 🔍 HIGH
The URLs are committed to a public GitHub repo and the workflows have no auth on their trigger nodes. Anyone who reads the repo can POST to `trellis-campaign-dispatch` (sends real email via Resend) or the publish webhooks.

- [ ] Add a Header Auth check as the first node of each publishing/sending workflow. Don't rely on URL secrecy — the URLs are already public.

### 1.8 Smaller items 🔍
- [ ] `social-oauth/index.ts:34` falls back to a hardcoded key `"trellis-vault-key-change-me"` if the env var is unset. Should throw instead.
- [ ] `resend-webhook` skips signature verification entirely when the secret is unset (fail-open). Someone could forge bounce events and mass-suppress your list. Make it fail closed.
- [ ] Reflected XSS in the OAuth callback's error page (unescaped query params).
- [ ] `meta-insights` and `test-social-connection` are unauthenticated; they leak follower counts and connection status for any branch id.

**Good news, verified:** no real secrets are committed anywhere in the repo or its git history, `.env.local` is properly ignored, the browser bundle ships only the anon key, and `dangerouslySetInnerHTML` is used nowhere.

---

## 2. Things that lie to you

Ranked by how likely you are to make a decision on a fabricated number.

### 2.1 The Dashboard's Sage briefing is entirely hardcoded 🔍 CRITICAL
`MOCK_BRIEFING` in `constants.ts:1430` renders unconditionally as "Your Morning Briefing" — including `avg_ctr: "8.4%"`, `avg_response_time: "14m"`, and `open_tickets: 4`. No AI call, no query, not a fallback. It sits directly beside genuinely live data (recent events, published posts, real orders), which makes it *more* convincing, not less.

Also on Dashboard: `pendingApprovalsCount = 2` is a hardcoded constant driving a permanent "Strategic Action Required" banner, and "Ecosystem Harmony: Active" is a static string that says "Active" even when every spoke connection is erroring.

- [ ] Compute the briefing from real sources (they all exist: `campaign_email_stats`, branch stats, the creative leaderboards), or remove it until it's real. **This is the single most-viewed fake thing in the app.**

### 2.2 Every customer looks identical and healthy 🔍 CRITICAL
- `churn_risk` is hardcoded to `'minimal'` for every profile (`App.tsx:241`). The "Churn Risk" campaign preset filters for moderate/high/critical — so it **matches zero profiles, always, forever**. You'd conclude nobody is at risk.
- `engagement_score` is never set on the federated path, and `Profiles.tsx:873` renders `{score || 85}%` — so every customer shows **85% engagement**. Because `0` is falsy, a genuinely disengaged customer also shows 85%.
- A real `computeEngagementScore()` already exists in `services/emailReportingService.ts` and is **called nowhere**.

- [ ] Wire the existing function in. Best value-per-line-changed in the whole codebase — it makes Segments, Dashboard, and Sage simultaneously honest.

### 2.3 Campaigns report success when the send failed 🔍 CRITICAL
`CampaignBuilder.tsx:862-971`: if the dispatch webhook fails, the code fires an error toast **and then runs the success animation anyway**, marks every channel green, and records the campaign to history as deployed. Worse, for `scheduled` and `staggered` campaigns the webhook never fires at all (no scheduler exists for them) — yet they still animate to "100% Synchronized."

- [ ] Gate the success state on the actual result. Until a real scheduler exists, don't offer scheduled/staggered.

### 2.4 Per-branch campaign content is silently dropped 🔍 CRITICAL
`CampaignBuilder.tsx:1801`: the UI invites you to write branch-exclusive content and says it "will only be shown to [Branch] recipients." `buildDispatchHtml()` never reads it. It's saved to metadata and never sent to anyone.

### 2.5 Reddit posts are marked "Posted" even when posting fails 🔍 CRITICAL
`RedditGrowth.tsx:414-455` wraps the webhook in `try/catch`, swallows failures, never checks `response.ok`, then unconditionally marks the draft posted and shows a green success toast. The webhook it calls **is not registered** (verified 404 — see §4), so this currently fails 100% of the time and reports success 100% of the time.

### 2.6 Knowledge Base is a facade 🔍 CRITICAL
No backing table exists. "Sync to RAG Engine" is a 3-second timer followed by an `alert()` claiming the index was rebuilt. The "Commit & Index Knowledge" modal has entirely uncontrolled inputs — everything you type is discarded on submit. Edit/delete buttons on every document have no handlers.

### 2.7 Support Hub 🔍 CRITICAL
No backend at all — zero Supabase calls in the file. Every fresh browser loads 2 fake tickets from `MOCK_TICKETS` with fabricated "94% AI confidence" resolutions. `generateTicketDraft()` exists in `aiService.ts` and is **never called**, so no real ticket will ever have an AI draft. "Approve & Global Dispatch" fakes a 1.2s delay and flips local state — nothing is sent to any customer.

### 2.8 Others 🔍
- **Settings → Integrations** is 100% `MOCK_INTEGRATIONS`, including a fake `sk_live_xxxxx` Stripe key. Adding one appears to work and vanishes on refresh.
- **DevTools → Data Hygiene**: "Manual Purge" is a 2-second timer that decrements hardcoded numbers. No RPC call. An admin would believe they purged production data.
- **DevTools → DLQ**: permanently 2 fake incidents; the retry button has no `onClick` at all. The real `getFailedSyncs()` exists and is imported nowhere.
- **Automations**: "AI Strategy Build" makes a real (paid) Gemini call, discards the response, and shows the same 4 hardcoded nodes every time. The "Sage Strategic Auditor" panel asserts *"I predict an 18% increase in cross-site conversion"* — a hardcoded string.
- **Brand Intelligence** falls back to a fabricated ATL Urban Farms brand identity on any fetch error or empty result — so a new tenant or a network blip shows invented brand strategy as active.
- **Tasks** persist to localStorage only, despite `marketing_task_queue` existing. Tasks are device-local; Sheree cannot see yours.

---

## 3. Dead UI inventory

Buttons and controls that do nothing. All 🔍 with file:line in the agent reports.

**No handler at all:**
- `Automations.tsx:144` "Deploy Flow" — the Flow Builder's primary CTA. Nothing you build there can ever leave the tab.
- `Automations.tsx:369` "Verify Ecosystem Sync"
- `SupportHub.tsx:230` "Manual Edit" — the *only* offered path for low-confidence tickets that are locked from auto-dispatch
- `ProfileDetailDrawer.tsx:318-327` "Send Email" / "Add to Segment" / "View Orders" — the drawer's main action row
- `Tasks.tsx:251` calendar prev/next month (and no month state exists to navigate)
- `Tasks.tsx:403` "Initiate AI Flow" — with copy explicitly claiming automated drafting "is available"
- `KnowledgeBase.tsx:165` edit / delete / detail on every document
- `SageChat.tsx:283` "Ecosystem Report" card, and `:246` the profile external-link icon
- `Automations.tsx:320` "Release Window" select (no onChange)

**Wired but goes nowhere:**
- `Dashboard.tsx:1144` "Start Strategic Discussion" → `window.scrollTo(0,1000)`. Sage's chat owns its own `isOpen` state with no external control, so nothing can open it programmatically.
- `MarketingWizard.tsx` — three "Create Brand Profile" CTAs that only toast "go find it in the sidebar." The component has no navigation prop at all, though `MarketingBrands.tsx` exists.
- `MarketingWizard.tsx:52` Review step is subtitled "Export & Deploy" but offers no deploy action — a full 5-step wizard with no way to launch what it produced.

**Silently empty:**
- `Profiles.tsx:62` — the `profiles` state is never populated, so the entire "Local" data-source toggle always shows nothing. Worse, a **fully working per-branch consent editor that writes to Supabase** (`:839-987`) can only be opened from that dead list, making correct code unreachable.
- `Profiles.tsx:494` "Filter by Branch" has no effect in the default federated view.

**Local-state-only where you'd expect persistence:**
- `SocialHub.tsx:995-1008` — `handleEditFromPipeline` and `handleArchivePost` don't touch the DB. **Archiving a scheduled post does not stop it from publishing.** The S1 worker will still post it. Same for the whole approve/reject/compliance workflow — those fields aren't even columns on `scheduled_social_posts`.
- `BranchCommandCenter.tsx:275` — social handles save to localStorage while the OAuth Connect button right next to them writes to the database.

**Confirmed genuinely working** (worth knowing what you *can* trust): Creative Studio end-to-end, Card Studio, Post Scheduler, Platform Setup Wizard, Ad Performance, Post Performance, Campaigns, Studio Albums, Clip Studio, Team Members, User Profile, Reports, Layout navigation, Email Previewer, and — verified specifically — SocialHub's `scheduleDrafts` fix from tonight.

---

## 4. Broken plumbing

### 4.1 Six webhooks the app calls that nothing answers ✅ (probed live)
This is the exact bug class we found in Facebook — the app fires, nothing listens, no error surfaces.

| Webhook | Called from | Blueprint exists? | Live |
|---|---|---|---|
| `trellis-tiktok-publish` | `socialService.ts` | ✅ B5 | **404** — import it |
| `trellis-video-ad-render` | `videoAdService.ts` | ✅ | **404** — "Approve & Render" is dead |
| `trellis-clip-publish` | `clipService.ts` | ✅ E8 | **404** |
| `trellis-music-generate` | `musicService.ts` | ✅ E1 | **404** |
| `reddit-post-comment` | `RedditGrowth.tsx` | ✅ D2 | **404** |
| `reddit-review-stage` | D1 scanner | ❌ never built | **404** |
| `social-signal-ingest` | C1/C2/C3 listeners | ❌ never built | **404** |

The last two have no blueprint at all — the three social listeners all dead-end at their final node, and the Reddit scanner posts drafts into the void (`RedditGrowth.tsx` reads localStorage, so nothing would receive them anyway).

Four more (`ig-intent-loop`, `resend-compliance`, `twilio-whisper-sync`, `twilio-sms-dispatch`) are declared in constants and **described as working in the in-app Help content**, but no blueprint has ever existed for any of them.

- [ ] Import + activate the five that have blueprints. Delete or build the rest, and fix the Help copy that claims they work.

### 4.2 Other automation issues 🔍
- [ ] `E5-session-generate-*` — two blueprints register the same webhook path; importing one silently overwrites the other. Both are superseded by an Edge Function and should be deleted.
- [ ] `B2-campaign-dispatch` returns HTTP 500 when a campaign resolves to zero recipients, instead of a clean "no recipients" response.
- [ ] `F1-video-ad-generator` calls the retired `gemini-2.0-flash` model.

**Clean:** no hardcoded secrets in any blueprint (the deferred concern turned out to be already resolved), every IF node is on typeVersion 2, no stale `.io` domains, and every table/RPC referenced by a blueprint exists.

### 4.3 Schema drift 🔍 HIGH
`SQL_SCHEMA` in `constants.ts` has drifted far enough that **stamping a fresh instance from it would not reproduce the app**. Twenty live tables aren't in it at all; several documented tables (`campaigns`, `content_calendar_events`, `social_signals`) have completely different columns live; 15 of 22 live RPCs are undocumented and two are documented under names that no longer exist.

- [ ] Regenerate from `pg_dump --schema-only` rather than hand-patching.

### 4.4 Runtime mismatches 🔍
- [ ] `social-oauth` passes `p_encryption_key` to `upsert_social_credential`, which the deployed function doesn't accept — this may break OAuth token persistence at the final step. **Worth testing a fresh Connect before trusting it.**
- [ ] `trellisUsersService` queries `trellis_users_view`, which doesn't exist live — the Team roster silently fails to load.
- [ ] `content_calendar_events` is written by Creative Studio and read by nothing.

---

## 5. AI surfaces

### 5.1 The loop is open everywhere except two screens 🔍
You now collect real performance data in `ad_performance`, `social_post_insights`, `campaign_email_stats`, and `trellis_youtube_daily_metrics`. **No generator reads any of it.**

| Surface | Loop | Data that already exists |
|---|---|---|
| Reports advisor | ✅ CLOSED | `campaign_email_stats` |
| Ad / Post Performance advisors | ✅ CLOSED | `ad_performance`, `social_post_insights` |
| Card Studio director | ❌ open | `social_post_insights` |
| Creative Studio copy (all 3 blueprints) | ❌ open | `ad_performance` |
| Meta ad copy export | ❌ open | `ad_performance` |
| Email copy | ❌ open | `campaign_email_stats` |
| Episode metadata | ❌ open | `trellis_youtube_daily_metrics` |
| Sage chat | ❌ open | everything above |

`Reports.tsx` is the pattern to copy — it builds a real stats object and pairs it with an explicit no-fabrication rule. Every other generator writes blind.

### 5.2 Sage is fed fake data on every single message 🔍 CRITICAL
`SageChat.tsx:101` passes `MOCK_TICKETS` — the same 2 fixtures — as live support context, forever. It never receives real tickets (which exist in `App.tsx` state) and never passes `profilesCount` (the real `profiles` array is right there as a prop). Sage will always say "2 open tickets."

### 5.3 Fabrication risks not yet guarded 🔍
- **`BrandIntelligence.tsx:716`** — CRITICAL. Asks Gemini to "analyze the website at [URL]" with **no search tool and no scraper**. The model cannot fetch URLs, so it invents the mission, values, audience, and voice wholesale — and the UI says "AI will scan this URL." Pure fabrication presented as extraction, then saved as the brand's identity.
- **`marketingPrompts.ts:31`** — CRITICAL. When you haven't listed competitors, the prompt explicitly instructs the model to *"infer 3 likely competitors"* and invent their strengths and weaknesses. This renders in a "Competitive Analysis" card with no disclaimer. Inventing claims about named real companies is a genuine liability.
- The three Creative Studio blueprints and the Meta ad-copy generator have **no anti-fabrication rule** — nothing stops invented prices, stats, or guarantees in copy headed for real ads. The `NO_FABRICATION_RULE` constant already exists; it just hasn't been applied to the generation side.
- Episode metadata has no guard against invented awards/press.

**Verified safe:** scripture. The BSB pipeline is airtight — the schema exposes only a verse *reference*, validated against a closed book list, with real text fetched server-side. The model has no field in which to write Bible text. That design is the template for everything else.

### 5.4 PII 🔍
`sanitizePII()` runs inside `generateText()`, so anything routed through `aiService` is protected. But ~10 call sites construct `GoogleGenAI` directly and bypass it. The worst is **`RedditGrowth.tsx:329`**, which sends *third-party Reddit comment text* — not your own data — to Gemini unsanitized. Also unprotected: `adExportService`, `VideoAdLab` script gen, `SocialHub`, `KnowledgeBase`, `Automations`, `episodeService`, `sessionService`, `brandService`.

Separately: `sanitizePII`'s 32+ character token regex will redact UUIDs and long URLs out of the Reports stats blob, corrupting the very data Sage is meant to reason over.

### 5.5 Reliability 🔍
Only `SocialHub` has timeout + model fallback. `aiService`'s core fetch calls have **no timeout at all**, so a hung provider spins the UI forever — this underlies Sage, compliance audit, and both Reports advisors. `clipService`, `episodeService`, and `sessionService` use the same thinking model that caused the Card Studio degeneration runaway, with no JSON mode, no token cap, no timeout, and no salvage parser. The fix was never propagated beyond `creativeDirectorService`.

---

## 6. Where to take the product

### Finish these — most of the work is already done
1. **Wire `computeEngagementScore()`** (S) — exists, unused. Instantly fixes churn/engagement everywhere and activates the Segments engine's dormant categories.
2. **Wire `slackService.ts`** (S) — `sendDLQAlert`, `sendTicketAlert`, `sendCampaignNotification` are fully written with **zero callers**, and the webhook field already exists in Settings. For a two-person team this converts three "remember to check the app" habits into push notifications.
3. **`npm install` in `workers/clip-render-worker` + import E8** (S) — Clip Studio is fully built and produces nothing only because dependencies were never installed.
4. **Import the five missing workflows** (S) — §4.1.
5. **Make the Dashboard briefing real** (M) — every input already exists.

### The biggest strategic gap: attribution
Nothing links an order to a campaign, so no one can answer "did this make money." Every spoke profile already carries `order_stats` and `ltv` via `spokeConnector`; joining that to `campaign_sends.email` would let the advisor make the same grounded kill/scale call for email that it already makes for paid ads — without touching your manual-first ads constraint.

### Missing capabilities worth considering
No lifecycle/drip automation (nothing runs unless you click Deploy — `MarketingWizard` generates nurture sequences that can only be read). No A/B testing anywhere. No preference center — unsubscribe is a single global opt-out, with no per-brand choice for someone who wants ATL emails but not Rejoice. No publish path for X or LinkedIn (listeners only). Reports has no export despite being described as "analytics and data export."

### One consolidation call
Brand data lives in four places — `branches`, `brand_identities`, `marketing_brands`, and n8n-only `brand_profiles` — and no generator reads more than one. Meanwhile `CampaignBuilder.tsx:670` hardcodes *"a gardening/agriculture brand called Sproutify"* into every social post for every brand, including Rejoice. Picking one brand brain would fix voice consistency across the whole app.

---

## 7. Suggested order of work

**Tonight/tomorrow (security):** 1.1 rotate + move secrets → 1.2 spoke connections → 1.3 profiles RLS → 1.4 lock the publish queue.

**This week (stop the lying):** 2.1 Dashboard briefing · 2.2 engagement/churn · 2.3 campaign false success · 2.5 Reddit false success · 2.6/2.7 label Knowledge Base and Support Hub as demo until built.

**Next (make it whole):** §4.1 import the missing workflows · wire Slack · finish Clip Studio · the dead-button sweep in §3.

**Then (make it an agent):** attribution → feed performance into generation → one lifecycle trigger.

---

*Every finding here has a file:line or a live query behind it. Where an agent reported something I couldn't personally re-verify, it's marked 🔍 — check before you act on it, particularly anything involving RLS, where the fix order matters more than the fix.*
