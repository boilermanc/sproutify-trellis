# Trellis Multi-Brand Opportunity Finder — Full Implementation Plan

Date: 2026-09-22
Status: Planning baseline; not an implementation or deployment authorization

Progress is tracked in [Opportunity Finder implementation status](OPPORTUNITY_IMPLEMENTATION_STATUS.md). Locally completed code is not a deployed capability or a completed owner-acceptance gate.

## 1. Product goal and scope

Find timely, useful topics; explain how they support each brand's business priorities; and turn selected opportunities into reviewable content.

**All brands is the product requirement. ATL is an example and validation case, not a special-case architecture.** Adding a brand must require configuration and approvals, not a new implementation. Existing brands and future brands use the same workflow with separate facts, audiences, priorities, sources, drafts, and results.

The product is a business-aware opportunity finder, not a generic keyword dashboard or an automated publisher.

```text
Approved brand brief + priorities
                 ↓
Targeted queries + permitted source collection
                 ↓
Dated evidence + comparable historical observations
                 ↓
Brand relevance judgments + deterministic selection policy
                 ↓
Weekly opportunities: evidence, why now, business fit, suggested angle
                 ↓
Human selection → grounded draft → reviewed publication handoff
                 ↓
Linked results → human-reviewed learning for that brand
```

This plan supersedes the product direction in [Keyword Research and Jev Decision Plan](KEYWORD_RESEARCH_AND_JEV_PLAN.md). Keep that document as implementation history; do not interpret its Keyword Explorer-first sequence as the current priority. Preserve existing features and saved work. Keyword Explorer remains an optional way to research a user-supplied idea within the shared pipeline.

### Included

- Shared, versioned brand briefs and approved facts.
- Brand-specific targeted research and source configuration.
- Multi-source evidence, history, freshness, and limitations.
- Jev advisory evaluation, measured against labeled examples.
- Explainable weekly shortlists, manual research, and draft generation.
- Persistent opportunity identity and publication/event attribution foundations.
- Explicit incomplete, failed, and healthy-empty states.
- Progressive Google Ads, Amazon, Reddit, Etsy, and other source support where access permits.

### Not included in the initial release

- Automatic publishing, email sends, outreach, ad buying, or campaign changes.
- A universal SEO difficulty score, guaranteed rankings, or invented demand.
- An unrestricted scraper for platforms without approved access.
- Customer-profile replication into the Hub or automatic writes to spokes.
- Automatic transfer of one brand's learnings or private evidence to another.
- Another explainer video before the real workflow is useful and verified.

## 2. Current foundation and audit baseline

These are observations from the September 22 audit, not promises about future deployment state. Recheck before implementation.

| Area | Observed state | Consequence |
| --- | --- | --- |
| Trend Radar | Research, saved opportunities, article/social drafting, dismissal/restoration, copy/Markdown export exist | Extend this foundation rather than build a disconnected system |
| Live records | Three completed ATL scans, 15 opportunities, three ready drafts; latest scan September 19 | A working research-to-draft path exists |
| Evidence | All 15 saved opportunities were `search_research`; none had attached Trends signals | The system has not demonstrated measured trend discovery |
| Sources | Country-wide Google Trends RSS, grounded Google Search, manual Rising CSV import | Category setting guides research; it is not an automated category-level Trends feed |
| Signal matching | Only exact normalized query matches inherit RSS evidence | Preserve source identity when deriving a different content angle; do not loosen matching into unsupported claims |
| Repeated queries | Existing project/country/query records are skipped | Add new observations without losing prior evidence or creating duplicate opportunities |
| Automatic draft selection | Creation-time selection, not evaluated business priority | Replace with explicit, tested selection policy before trusting automatic picks |
| Keyword Explorer | Repository implementation exists; Hub audit found no keyword table or deployed keyword actions | Resolve deployment parity deliberately; a push to main is not proof of a live feature |
| Google Ads / Amazon | No integration in this pipeline; account access unknown | Keep both in the plan with early access checks |
| Verification | 14 Radar tests and 19 Content Intelligence tests passed during audit | Useful baseline, not proof of source quality or full end-to-end behavior |

### Readiness issues: stop the unrelated detour

- `send_resend_email`: Hub had one five-text-argument signature; old four-argument overload absent. Delivery was not tested and is not required here.
- `failed_syncs`: table exists, zero rows and retained insert/delete counters; no controlled write performed. Database-level reset timestamp does not prove complete table history. This is unresolved, not a demonstrated opportunity-finder blocker.
- The inspected Atomic Identity Ingest workflow had no `Log to Failed Syncs` node. Do not assume an unidentified node exists or is broken.
- SJD form work and social publishing token scopes are outside this release unless a concrete dependency is demonstrated.
- New research jobs must expose durable failures, retries, and stale-job recovery. They may extend Radar run records rather than depend on `failed_syncs`.

## 3. Shared multi-brand brief

One canonical, server-readable brief contract should serve the Opportunity Finder and, progressively, Card Studio, Sage, The Pulse, and other generators. Inventory existing brand settings, recipes, strategy, and discovery work before deciding the storage location. Avoid parallel, contradictory sources of brand truth.

### Required fields

| Section | Contents |
| --- | --- |
| Identity | Existing stable brand/project ID, name, approved domains, language, timezone, markets |
| Offerings | Stable offering IDs, products/services, categories, approved destination URLs, authoritative catalog reference where available |
| Audiences | Stable audience IDs, needs, experience level, relevant locations, exclusions |
| Priorities | Brand-defined priority IDs, descriptions, offering/audience links, relative weight, active dates, desired outcomes |
| Voice | Tone, vocabulary, channel preferences, examples, accessibility requirements |
| Approved facts | Fact ID, statement, supporting source, source type, last-confirmed date, reviewer, review-due/expiry date, status |
| Boundaries | Prohibited claims, topics to avoid, restrictions, required caveats, unsupported offering associations |
| Existing content | Known URLs, topics, publication dates, status; references rather than a promise of exhaustive crawling |
| Seasonality | Reviewed events/windows with geography, source, lead time, validity period, and applicable priorities |
| Governance | Brief version, approval state, reviewer, change history and effective date |

Priority names are configuration. Seedlings, towers, swag, education, subscriptions, community participation, and customer retention are examples—not a fixed global enum.

### Approval and freshness

1. Import existing trusted configuration and propose missing fields from supplied sources.
2. Mark AI-discovered facts as proposals, never approved facts.
3. Clint and the appropriate brand owner review; include Sheree where she owns operational knowledge.
4. Show stale, conflicting, or unsourced facts explicitly.
5. Block or omit material stale claims in drafts; request re-confirmation where necessary.
6. Treat inventory, pricing, delivery promises, and availability as especially volatile. Never infer them from a general brand brief.
7. Pin the brief version used for research, evaluation, and drafting. A material brief change invalidates affected judgments and requires re-evaluation.

**Acceptance:** a new brand can be onboarded without code edits. At least three meaningfully different brands validate the contract, including a product business and a service/community business. Their real owners approve their briefs; example offerings are not presumed facts.

## 4. Source strategy and access checklist

Source coverage is brand-specific. Supporting all brands does not require every brand to possess every provider account. Unknown or unavailable access must remain visible; missing data is not zero demand.

| Source | Intended value | Initial route / gating |
| --- | --- | --- |
| Google Trends | Current interest, seasonal patterns, rising queries | Keep RSS and validated manual Rising imports; verify eligibility for official Trends API before promising automated niche history |
| Google Ads Keyword Planner | Related keyword ideas, approximate monthly demand and historical variation; ad competition/bid context | Verify account authorization and current API access/permissible use; evaluate permitted report imports if automation is unavailable |
| Google Search Console | Queries and changes affecting a brand's own verified websites | Verify property access and authorized API setup; label as site visibility, not total market demand |
| Amazon Brand Analytics | Shopping queries, frequency rankings, eligible query-volume and funnel reports | Verify Seller/Vendor eligibility, Brand Registry/roles, marketplace and report scope; separate ASIN-scoped and store-wide reports |
| Amazon Ads | Keyword suggestions and the advertiser's own search-term performance | Separate connection/access review; campaign performance is not marketplace-wide demand |
| Reddit | Questions, frustrations, emerging discussions in relevant communities | Commercial automated collection requires approved access; do not substitute unapproved scraping or assume an Ads API connection grants content access |
| Etsy | Buyer searches, related terms, listing counts and marketplace interests | Verify Shop Manager access; Marketplace Insights is a UI capability, not a confirmed public metrics API; start with approved manual evidence if permitted |
| Pinterest | Seasonal planning, growing search/save/shopping interests | Assess Trends UI and approved programmatic access separately |
| YouTube | Audience searches, content gaps, relevant video momentum | Studio Trends availability and API exposure must be verified independently; video views are not query volume |
| TikTok | Creative trends, hashtags and formats | Creative Center research where permitted; API access and commercial rights are separate gates |
| Meta | Audience interests and ad messaging | Not a keyword-volume planner; check Ad Library coverage and API constraints before integration |
| Selected publications / RSS | Timely industry developments and authoritative context | Brand-approved source lists, permitted ingestion and attribution; a new article alone is not a demand trend |
| Seasonal calendars | Predictable, useful timing | Human-reviewed, sourced, geography-specific; applicable to each business, not only gardening |
| First-party questions | Recurring support or audience needs | Authorized, minimized and sanitized summaries; no customer-profile warehouse or sensitive raw-data ingestion |

For each brand/provider, record: owner, account/property/store scope, relevant topics, access status, approved collection route, permission/terms review date, available metrics, update lag, retention/deletion rules, cost/quota, and last successful collection.

Connection states: `unknown`, `awaiting_access`, `manual_only`, `connected`, `unavailable`, `disabled`, `error`. Show manual versus automatic coverage explicitly.

Google Ads and Amazon access discovery starts early, alongside the brand brief. They are planned workstreams, not discarded ideas. An inaccessible provider does not block delivery from other approved sources, but its integration is not marked complete.

## 5. Targeted research and evidence processing

### Research planning

- Generate bounded query sets from the approved brief, priorities, audiences, offerings, geography and upcoming seasonal windows.
- Include direct commercial topics and useful adjacent educational questions; do not require every idea to sell a product.
- Allow an operator to add a topic or question manually through the same pipeline.
- Preview/edit query themes and source choices; retain the plan version and brief version.
- Apply per-brand run budgets, source quotas, timeouts and backoff. Avoid query explosion across every offering/source combination.

### Evidence contract

Each observation should carry a stable ID, brand scope, provider, original query/topic, external record ID or URL, observed/captured time, source publication time when known, reporting period, geography/language, metric name/value/unit, account or dataset scope, methodology/estimate label, limitations and expiry policy.

Keep raw provider values separate from normalized values and computed changes. Retain allowed extracts or report references only where permitted; do not indiscriminately archive full third-party content.

### Evidence classes

- **Measured rising interest:** a provider growth measure or comparable observations show growth within an explicit period.
- **Current trend-feed signal:** a source identifies a currently trending item; preserve its actual metric definition rather than invent growth.
- **Seasonally relevant:** an approved calendar or supported recurring pattern explains timing.
- **Steady demand:** sufficient historical evidence suggests sustained interest.
- **Emerging discussion:** discussion activity suggests an angle, with community scope and limited representativeness stated.
- **Research hypothesis:** useful source-backed content idea with demand/momentum unverified.

A topic can have several evidence classes. Do not collapse them into a fabricated universal trend score.

### Processing rules

1. Validate source identity, schema, timestamps, provenance and collection permissions.
2. Normalize exact duplicates while retaining distinct observations over time.
3. Compare only compatible periods, geographies, metrics and datasets. Mark incomplete periods, zero baselines and missing values explicitly.
4. Keep opportunity deduplication separate from observation history. A renewed signal may update an existing opportunity without losing a dismissal or draft.
5. Preserve original signal IDs when deriving a content angle. A measured topic and its related content angle are not necessarily the same keyword; never copy metrics onto a different phrase as if measured directly.
6. Identify syndicated/repeated sources so multiple copies are not counted as independent corroboration.
7. Evaluate source support and brand relevance separately. Source links alone do not verify every claim.
8. Treat source content as untrusted data; sanitize PII and resist instructions embedded in pages or imports.

## 6. Gemini, Jev and deterministic code

| Component | Responsibility | Must not do |
| --- | --- | --- |
| Gemini | Propose targeted queries, synthesize retrieved evidence, suggest angles, generate grounded drafts | Invent measurements, approved facts, sources or publication status |
| Jev / TypeSafe | Focused judgments about audience/offering/priority fit, usefulness, overlap and evidence support | Fetch missing evidence, manufacture demand, grant permission, or execute actions |
| Code | Validate, calculate changes, enforce access and budgets, apply selection policy, schedule work and preserve lineage | Treat model confidence as a measured business outcome |
| Human reviewer | Approve brand facts, resolve ambiguity, select angles, approve publication and conclusions | Be silently bypassed by an advisory score |

### Jev question design

Use named state fields containing the brief version, candidate, source evidence, proposed angle and relevant existing content. Ask independent, narrow questions together where appropriate:

- Does this candidate meaningfully fit each applicable priority? Use separate judgments so multiple priorities can apply.
- How useful is the angle to a named audience, using concrete ordered criteria?
- Is the proposed connection to an actual offering supported rather than forced?
- Is an existing page a better target than a new article?
- Does the supplied evidence support the specific claim being proposed?

Choose Noul, Score or Choice according to the question's meaning, with explicit no-match/uncertain handling. Preserve raw probabilities/distributions, model and rubric versions, input evidence IDs, timestamp, latency and usage. Do not present Jev as a prose explanation generator; build explanations from recorded judgments and source-backed synthesis.

Deterministic eligibility gates precede ranking. Invalid sources, forbidden claims, wrong-brand references and expired critical facts cannot be compensated for by a high relevance score. Selection weights are inspectable and configurable; uncertainty routes candidates to review instead of silently approving them.

### Evaluation before enabling model-driven defaults

- Build a starter set of approximately 60–100 labeled cases across at least three distinct brands; expand if coverage is inadequate.
- Include strong fit, adjacent education, no fit, multiple priorities, stale facts, hype without measurements, source disagreement and duplicate-content cases.
- Keep a held-out subset separate from rubric tuning. Record disagreements between reviewers rather than invent consensus.
- Compare with the existing Gemini-only/manual baseline. Measure false accepts, missed useful items, reviewer agreement, review burden, latency and cost per accepted opportunity.
- Determine thresholds from observed errors and their consequences; do not ship arbitrary values such as a universal 0.8 cutoff.
- Start in shadow mode. Keep reviewable deterministic behavior on provider failure; never silently label a fallback as a successful Jev evaluation.

The installed TypeSafe skill informed this design. Live index, reranking and confidence documentation fetches failed during plan authoring. Re-read current API/SDK, primitives, confidence guidance and the relevant cookbook before implementation; exact API signatures and thresholds are deliberately not specified here.

## 7. User experience

### Main workflow

1. Select a brand, or inspect an authorized all-brand summary.
2. See brief readiness, connected/manual sources, coverage and last successful run.
3. Run targeted research or inspect the weekly shortlist.
4. Open a card: original signal, why now, business priorities, audience, evidence, uncertainty, proposed angle and recommended format.
5. Choose `Create draft`, `Update existing content`, `Investigate`, `Dismiss`, or defer to a later date.
6. Select format/channel and adjust the angle before generation.
7. Review draft, claims, source citations and relevant approved offering links.
8. Copy/export or explicitly hand off to an existing publishing workflow; generation is not publication approval.

Brand readiness must show missing setup without hiding a brand or requiring a developer-created local partition. Preserve the existing stable brand/project mapping; do not identify brands by display name or ad hoc slug conversion.

### Empty and degraded states

- **Healthy empty:** “Nothing strong this week,” with collected-source coverage and rejection reasons.
- **Partial:** Some sources failed or were unavailable; show what was evaluated and what was not.
- **Failed:** Collection/evaluation failed; no claim that demand is absent.
- **Not ready:** Brief or required permissions need attention.
- **Stale:** Existing suggestions remain visible with clear dates and a refresh action.

The shortlist should target a small configurable number of useful items, not fill a quota. Explain major omissions and allow reviewer feedback. All-brand views may summarize authorized brands but must not blend their priorities or learning.

## 8. Drafting and approved claims

Reuse the existing grounded research and draft validation flow. Initially support the existing blog/article and social-text formats, with format-only drafting so a social request need not generate a full article. Later add briefs for other studios without silently launching paid media generation.

Each draft pins its opportunity ID, brand, selected angle, audience, priority associations, evidence set and brief/fact versions. Use only confirmed offerings and appropriate links. Flag unsupported or stale claims instead of inventing replacements. Preserve draft versions and reviewer edits.

Validate factual citation references, required caveats, channel constraints and brand scope. Human review remains required: valid citation syntax is not proof that the cited page supports a statement.

Existing automatic-draft settings must be shown during migration. Do not silently enable new automation or change existing behavior; obtain an explicit policy choice. Automatic publishing stays out of scope.

## 9. Persistent identity and results

Create `opportunity_id` when a candidate is persisted, before drafting. Keep the same ID across revisions and connect separate draft/publication IDs for one-to-many outputs. Preserve existing Radar opportunity IDs where practical; migration must not break saved references.

Lineage: brand → opportunity → draft version → publication → observations → reviewed learning.

- Store the clean canonical published URL separately from campaign tracking URLs.
- Define a documented campaign convention, for example an opaque opportunity token in `utm_id`, with channel-specific source/medium and a publication/variant identifier. Avoid collisions with existing campaign conventions.
- Put tracking parameters on distributed inbound links, not every internal navigation link; internal UTMs can corrupt acquisition attribution.
- Capture the token at supported landing pages and propagate it into consent-appropriate events. UTMs alone do not guarantee order attribution.
- Extend supported `marketing_events` payloads with opportunity/publication IDs; validate brand ownership server-side and deduplicate provider event IDs.
- Define attribution window, first/last-touch policy, unknown cases and redirect/cross-domain behavior before reporting.
- Audit event TTL rules: preserve permitted aggregate outcome history before short-lived click records disappear, and reconcile archived business events without double counting.
- Reuse Content Intelligence assets, experiments, performance and learnings rather than create a competing reporting system.

Show impressions, clicks, engagement, signups, enquiries or orders only where actual data supports them. Search Console query trends are not user-level purchase attribution. Report observed association separately from causal lift; no fabricated “14% more effective” claims.

## 10. Technical implementation map

### Existing integration points

- `pages/ContentIntelligence.tsx`: navigation, brand selection, readiness and opportunity workspace.
- `components/ContentTrendRadar.tsx`: shortlist, source evidence, run status and draft controls.
- `components/KeywordExplorer.tsx`: manual topic entry into the common pipeline.
- `services/contentTrendRadarService.ts` and `services/contentIntelligenceRegistry.ts`: contracts and existing content lineage.
- `supabase/functions/content-trend-radar/index.ts`: orchestrated research/drafting; split provider adapters/helpers as needed without broad refactors.
- `supabase/functions/_shared/trend-radar.mjs`: evidence validation, normalization and deterministic policies.
- `n8n-blueprints/C5-content-trend-radar.json`: scheduling entry point, not the source of truth for completed job status.
- `constants.ts` (`SQL_SCHEMA`) and generated migrations: synchronized schema evolution.

### Proposed data domains, not finalized DDL

| Domain | Purpose |
| --- | --- |
| Brand brief versions and facts | Approved business context with provenance and expiry |
| Source connections | Per-brand configuration, capability/access status and secret references, never raw credentials |
| Research plans and runs | Query themes, budgets, state, partial failures and lineage |
| Evidence observations | Immutable or versioned provider observations subject to retention rules |
| Opportunities | Stable brand-scoped candidates, associated evidence, decisions and angles |
| Judgments | Raw semantic assessments, rubric/model versions and deterministic policy outcomes |
| Drafts/publication links | Reuse existing draft and Content Intelligence records where possible |
| Outcome observations | Source-backed measurements and human-reviewed lessons |

Use stable IDs and schema-validated contracts. Every join and API operation enforces brand scope, not just the frontend selector. Preserve project conventions: UUID IDs, TIMESTAMPTZ, CHECK statuses, RLS, appropriate indices, idempotent migrations and master-schema parity. Resolve Supabase through Switchboard before remote work. No customer profile copying; spoke access remains read-only.

### Reliability and cost

- Claim/lease/token patterns for long jobs, bounded retries and idempotent completion.
- Explicit states such as queued, running, completed, partial, failed and timed out.
- Durable per-source errors and run summaries; avoid storing secrets or sensitive raw payloads in logs.
- Fair scheduling across brands, timezone-aware weekly delivery and no overlapping duplicate runs.
- Independent per-brand/provider budgets and a global limit; expose partial results when exhausted.
- Cache permitted observations according to freshness/retention constraints. Invalidate judgments when inputs change.
- Server-side credentials, current authorization checks, PII sanitization, revocation handling and deletion obligations.

## 11. Phased delivery and acceptance gates

### Phase 0 — Scope, access and dependency inventory

- Inventory all active brands, existing briefs and exact project mappings.
- Check Gemini/Jev configuration and relevant Hub read/write/job capabilities safely; paid calls or test writes require approval.
- Record source access for every brand, beginning Google Ads, Amazon and Search Console discovery immediately.
- Verify only blockers touching this workflow. Leave unrelated email/forms/social issues separately tracked.
- Produce a source-access matrix, proposed validation brands, cost assumptions and migration/deployment checklist.

**Gate:** no assumed account access or undocumented platform dependency; all brands can be represented. Dates/effort estimates follow this inventory, not precede it.

### Phase 1 — Shared brand brief and identity foundations

- Implement brief/fact versioning, proposal/review flow, expiry visibility and brand onboarding.
- Establish opportunity identity and draft/publication/event contract before generating new content.
- Adapt existing configuration without overwriting user work; retain legacy records.
- Validate with at least three distinct, owner-reviewed brands. ATL may be one; the architecture cannot depend on ATL fields.

**Gate:** new brand onboarding needs no code changes; stale facts are visible; wrong-brand access/joins fail; identity survives draft revisions.

### Phase 2 — Source adapters and evidence history

- Implement common adapter and observation contracts with fixture tests.
- Preserve current RSS, grounded research and Rising import paths.
- Add reviewed seasonal baselines appropriate to each brand and Search Console where authorized.
- Add Google Ads and Amazon adapters or permitted import paths once their access gates pass. Track blocked integrations explicitly rather than replacing them silently with AI research.
- Run focused feasibility increments for Reddit, Etsy, Pinterest, YouTube, TikTok and Meta; integrate only verified useful/allowed capabilities.
- Separate recurring opportunity identity from new evidence observations.

**Gate:** every metric is traceable, comparable and source-labeled; repeated observations retain history; absent access never becomes zero demand; at least one real permitted input is verified for each validation brand.

### Phase 3 — Jev evaluation and deterministic selection

- Build labeled, multi-brand cases and explicit question/rubric versions.
- Run shadow evaluation against current/manual selections under an approved test budget.
- Implement hard gates, configurable priority weights, uncertainty routing and provider-failure fallback.
- Record results and tune thresholds using held-out cases before changing defaults.

**Gate:** reviewers approve the error tradeoffs and measured usefulness; no score can create evidence, cross brand boundaries or grant publication authority.

### Phase 4 — Weekly opportunity workspace and drafting

- Deliver explainable cards, review actions, format selection, healthy-empty/partial/error states and per-brand scheduling.
- Reuse drafting with approved facts and evidence; support new content and known-page updates.
- Preserve existing automatic-draft preferences pending explicit migration decisions.
- Validate real end-to-end runs and drafts across the selected different brands, plus a no-signal case.

**Gate:** a reviewer can understand and act on an opportunity without reconstructing research manually; zero strong opportunities is a successful, explained outcome; failures remain distinct and retryable.

### Phase 5 — Publication linkage and measured feedback

- Register real external or existing-publisher publications after review; preserve clean URLs and campaign links separately.
- Implement scoped event propagation and reporting against the Phase 1 identity contract.
- Define review windows and approved evidence-backed learnings; support inconclusive outcomes.
- Validate attribution end-to-end in a controlled, approved test, including missing tokens and event retries.

**Gate:** selected publications connect to real measurements without duplicate counts or cross-brand leakage; unsupported causal claims are impossible in standard summaries.

### Phase 6 — Expansion and shared evidence standards

- Expand source coverage per brand based on access and demonstrated utility.
- Introduce additional content formats through existing studios under separate cost/approval controls.
- Migrate Card Studio, Sage and The Pulse to the shared brief/evidence contract in separate increments.
- Evaluate whether rankings improve after reviewed outcomes; never automatically promote correlation to durable strategy.

**Gate:** each expansion has a verified source, measurable user benefit, owner, budget and rollback path. The core multi-brand release does not wait for every platform integration.

## 12. Verification and release criteria

### Automated coverage

- Brand scope: wrong-brand reads/writes, manipulated IDs, mixed-source joins and unauthorized all-brand views.
- Briefs: unapproved facts, stale facts, conflicting sources, version changes and catalog links.
- Sources: malformed reports, missing periods, rate limits, unavailable access, partial runs and metric definitions.
- Trends: compatible comparisons, zero denominators, seasonality versus growth, duplicate observations and renewed signals.
- Judgments: no match, multiple priorities, unclear evidence, provider timeout, stale evaluation and policy-version changes.
- Jobs: duplicate ticks, contention, lease recovery, late completion and per-brand fairness/budgets.
- Drafts: source references, unsupported offerings, format constraints and preserved edits.
- Outcomes: token propagation, canonical URLs, brand validation, retries, aggregation, retention and unknown attribution.

### Existing verification commands

```powershell
npm run test:trend-radar
npm run test:content
npx tsc --noEmit
deno check supabase/functions/content-trend-radar/index.ts
npm run build
```

Add focused tests/scripts for new modules. Record unavailable runtimes rather than claiming checks passed. Database verification uses the Switchboard-bound Hub with approved test scope; UI checks cover empty/loading/error states and actual source paths, not only fixtures.

### Product evaluation

Track reviewer acceptance/rejection reasons, research time saved, editing effort, evidence quality, cost per accepted opportunity, source contribution, and later linked outcomes. Agree targets after establishing a baseline. Do not equate draft count with product success.

Release requires multi-brand owner signoff, verified deployment parity, migration recovery plan, visible job failures and source limitations. A commit or frontend build does not establish that backend migrations, functions, credentials or schedules are live. Deployments and pushes need explicit authorization.

## 13. Ownership, open decisions and next action

- **Clint:** scope, architecture, provider access/budgets, release approval and business-priority decisions.
- **Brand owners, including Sheree where applicable:** approve offerings/facts, seasonal relevance and labeled examples; review usefulness.
- **Implementation work:** source contracts, code, tests, migration plans and verification evidence; no invented business facts or implicit external actions.

Open decisions:

1. Current active brand inventory and designated reviewers.
2. Which three distinct brands participate in first acceptance testing.
3. Google Ads, Search Console, Amazon and other account/access availability.
4. Approved provider costs, run limits and review cadence per brand.
5. Fact expiry rules and authoritative product/catalog sources.
6. Priority weights, evaluation error tolerance and format preferences.
7. Campaign/UTM convention, event coverage, attribution window and retention policy.

**Next action:** complete Phase 0 and produce shared brief drafts for the validation brands. Do not restart the `failed_syncs` investigation unless a real dependency is found. Do not begin a new video.

### First implementation handoff template

```markdown
## Task: Opportunity Finder Phase 0 — multi-brand readiness

### Goal
Establish a verified brand/source/dependency inventory for the shared opportunity workflow.

### Context
Use docs/MULTI_BRAND_OPPORTUNITY_FINDER_PLAN.md as the planning baseline.
Preserve existing Radar and Keyword Explorer work and all unrelated changes.

### Implementation
1. Inventory existing brand IDs, briefs, strategy, recipes and content partitions.
2. Propose one shared brief contract and identify migration conflicts.
3. Record source access as confirmed, unknown, manual-only or unavailable.
4. Identify only concrete research/drafting/attribution dependencies.
5. Propose validation brands, owners and the smallest Phase 1 increment.

### Files Affected
- Planning/readiness documents only; application changes require the next scoped task.

### Verification
- No invented access, approved facts or deployment claims.
- No paid generation, credential changes, remote writes, commits or deployments.
- Every active brand is represented; no ATL-specific architecture.
```

## 14. References and lessons

Repository references: [Radar implementation/status](CONTENT_TREND_RADAR.md), [Content Intelligence guide](CONTENT_INTELLIGENCE_GUIDE.md), [earlier keyword plan](KEYWORD_RESEARCH_AND_JEV_PLAN.md).

Provider references checked during the preceding research; revalidate access and terms before implementation:

- [Google Trends API access](https://developers.google.com/search/apis/trends)
- [Google Ads historical metrics](https://developers.google.com/google-ads/api/docs/keyword-planning/generate-historical-metrics)
- [Google Ads access and permissible use](https://developers.google.com/google-ads/api/docs/api-policy/access-levels)
- [Search Console query API](https://developers.google.com/webmaster-tools/v1/searchanalytics/query)
- [Amazon analytics report scopes and eligibility](https://developer-docs.amazon/sp-api/docs/report-type-values-analytics)
- [Reddit developer/commercial access](https://support.reddithelp.com/hc/en-us/articles/14945211791892-Developer-Platform-Accessing-Reddit-Data)
- [Etsy Marketplace Insights](https://help.etsy.com/hc/en-us/articles/35122361353239-How-Do-I-Use-Etsy-s-Marketplace-Insights-Tool)
- [Pinterest Trends](https://help.pinterest.com/en/business/article/pinterest-trends)
- [YouTube Trends](https://support.google.com/youtubecreatorstudio/answer/11962757)
- [TikTok Creative Center](https://ads.tiktok.com/resources/help/article/creative-center)
- [Meta Ad Library API](https://www.facebook.com/ads/library/api)
- [TypeSafe documentation index](https://docs.typesafe.ai/llms.txt), [reranking cookbook](https://docs.typesafe.ai/cookbooks/rerank_typesafe.md), [confidence guidance](https://docs.typesafe.ai/confidence.md) — fetch unavailable during this authoring session; implementation verification required.

Lessons carried forward: validate source access before promising integrations; demonstrate real outputs before making a video; separate useful research from measured momentum; preserve evidence and identity from the beginning; and validate across different brands before calling the system reusable.
