# Opportunity Finder — Source Readiness Inventory

Date: 2026-09-22
Scope: Phase 0 local repository inspection; no provider accounts, production connections, credentials, or live workflows inspected in this pass.

Parent plan: [Multi-Brand Opportunity Finder](MULTI_BRAND_OPPORTUNITY_FINDER_PLAN.md).

## Immediate answer: do we need browser logins?

**No login is needed to continue the local inventory, shared brief design, fixture work, or tests.** Do not interrupt that work to troubleshoot n8n or create provider accounts.

The first useful access check is Google Search Console for existing brand websites. Google Ads and Amazon checks follow in parallel with implementation planning, if those accounts already exist. The owner should enter passwords/MFA directly in the browser; never paste passwords, API keys, tokens, or recovery codes into chat or repository files. Browser sign-in alone does not authorize or establish a backend API connection.

## Evidence and status rules

- **Implemented locally** means a code path was inspected, not that it is deployed, authenticated, scheduled, or receiving useful records.
- **Adjacent implementation** means a related capability exists outside this opportunity pipeline; it is not automatically reusable or authorized for trend collection.
- **Not found** means targeted searches of application/services/functions/scripts and relevant blueprints did not identify an adapter. It is not proof that an external integration does not exist.
- **Access unknown** applies to every brand/provider until an authorized, scoped account check records evidence. Never infer access from a filename, configuration field, old deployment note, or existing social connection.
- A provider can be available to one brand and absent for another. Missing access is not zero demand and must not exclude a brand from the product.

## Local source inventory

| Source | Local implementation evidence | Opportunity-pipeline readiness | Account/access status |
| --- | --- | --- | --- |
| Google Trends RSS | `fetchTrendsRss` and RSS parser in [shared helper](../supabase/functions/_shared/trend-radar.mjs); scan path in [Radar function](../supabase/functions/content-trend-radar/index.ts) | Country feed adapter exists. Exact normalized matching links feed evidence to a research candidate. It is not a targeted niche-history collector. | Public-feed path in code; current availability and useful coverage not tested in this pass |
| Google Trends Rising CSV | `importRisingCsv` in shared helper; import form in [Radar component](../components/ContentTrendRadar.tsx) | English Rising import exists with Explore URL and capture date. Geography/time/category provenance retained; not an arbitrary provider CSV importer. | Manual route implemented; no account or live import checked |
| Grounded Google Search | `gemini`, `researchKeyword`, and scan research in Radar function | Existing source-backed research path. Unmatched ideas remain `search_research`, with demand unverified. Gemini provider usage is separate from browser login. | Configuration/entitlement not checked; no paid call made |
| Google Ads | No keyword planning/historical metrics adapter found in searched app and function paths | Planned; neither automated collection nor Ads-report import established | Unknown for every brand |
| Google Search Console | No Search Analytics/property-query adapter found in searched app and function paths | Planned; no property binding or GSC report import established | Unknown for every domain/brand |
| Amazon Brand Analytics | No Selling Partner/analytics report adapter found | Planned; no report importer established | Unknown for every seller/vendor/brand/marketplace |
| Amazon Ads | No Amazon advertising adapter found | Planned separately from Brand Analytics | Unknown for every advertiser/marketplace |
| Reddit discussions | [D1 scanner blueprint](../n8n-blueprints/D1-reddit-scanner.json) searches posts/comments, drafts responses, and stages them for review | Adjacent engagement blueprint, not an integrated opportunity evidence source. Default topics and prompt are gardening-specific; live execution and permission unverified. Do not run it as a readiness test. | Unknown; blueprint existence establishes neither API approval nor current commercial collection rights |
| Reddit Ads | [Reddit Growth page](../pages/RedditGrowth.tsx) and [strategy service](../services/redditAdStrategyService.ts) contain ad planning/creative workflow | Adjacent campaign capability; not proof of discussion access or market trend metrics | Unknown; assess separately from Reddit discussion access |
| Etsy | No Etsy search-demand adapter found | Planned feasibility; no Etsy-specific report import established | Unknown |
| Pinterest | No Pinterest Trends adapter found | Planned feasibility | Unknown |
| YouTube | [video performance service](../services/videoPerformanceService.ts), [OAuth function](../supabase/functions/youtube-oauth/index.ts), [analytics blueprint](../n8n-blueprints/E9-youtube-analytics-sync.json) | Adjacent owned-video performance/authentication. No Studio Trends/search-demand source found in Radar. | Unknown for each channel; publishing/analytics code does not prove Trends access |
| Meta | [social insights service](../services/socialInsightsService.ts) reads Instagram/Facebook post snapshots; social OAuth/publishing paths exist | Adjacent owned-post measurement. No keyword-demand or Ad Library adapter found in Radar. | Unknown for each Page/account; existing OAuth code is not evidence of permissions |
| TikTok | Publishing path in [social service](../services/socialService.ts) | Adjacent publishing, not Creative Center trend ingestion | Unknown |
| Industry RSS / seasonal baselines | Radar has a Google Trends-specific feed parser; no general brand-reviewed seasonal evidence adapter identified in that pipeline | Planned; do not treat generic country Trends RSS as an industry feed or gardening calendar as universal | Brand owners must supply/approve sources and applicability |
| First-party questions | No first-party question-to-Radar evidence adapter identified | Planned; reuse authorized summaries rather than copy customer records | Source ownership, permitted scope, sanitization and retention unverified |

Keyword Explorer has local frontend/service/backend action paths ([component](../components/KeywordExplorer.tsx), [service](../services/keywordExplorerService.ts), Radar function). Its own UI explicitly says it is source-backed Search research, not Keyword Planner, and does not estimate monthly volume or keyword difficulty. Deployment parity remains a separate readiness check; this inspection makes no new live deployment claim.

## Minimal user-assisted access checklist

These are verification requests for existing accounts, not instructions to create accounts, buy subscriptions, approve new applications, change credentials, or grant broader access. Confirm current provider requirements against the official references in the parent plan before implementing any adapter.

| Priority | User action when requested | Read-only evidence to capture | What still remains afterward |
| --- | --- | --- | --- |
| 1 | Sign into existing Google Search Console account and choose each available brand property | Property/domain, mapped Trellis brand, visible account role, whether Performance query/date data is available | Authorized API route, scopes, property binding, test retrieval and adapter implementation |
| 2 | Sign into existing Google Ads account; open Keyword Planner if available | Brand/account mapping, market/currency, planner availability; existing API access status if visible to the owner | Current permissible use/access review, backend authorization and bounded integration test. Do not start campaigns or spend money. |
| 3 | Sign into existing Amazon Seller/Vendor account and inspect available Brand Analytics reports; separately inspect existing Amazon Ads account if applicable | Brand/store/marketplace, visible report names and reporting scope, owner confirmation of rights | Eligibility/roles/approved API access or permitted import route; report-specific adapter. Absence of an Amazon account is a recorded limitation, not a blocker for other sources. |
| Later | Sign into an existing Etsy shop only when its feasibility increment starts | Marketplace Insights availability and visible reporting scope | Verify permitted collection route; do not assume a public API exposes UI metrics |
| Later | Review existing Reddit developer access with its owner | Approved intended use and collection scope, not secret values | Current policy/terms confirmation and a bounded collection design; Ads access is a separate question |

No Supabase or n8n browser login is requested for this local inventory. Existing backend management access should be routed through Switchboard by the readiness owner if a concrete remote check is needed. Do not resume the unrelated `failed_syncs` investigation without demonstrating a dependency.

## Per-brand access record to complete

Create one record per brand/provider combination, not a single global “connected” flag:

```text
brand_project_id:
provider:
account_property_store_scope:
owner_reviewer:
access_status: unknown | awaiting_access | manual_only | connected | unavailable | disabled | error
collection_route: not_verified
available_metrics_and_periods:
geography_language_marketplace:
permission_terms_review_date:
evidence_checked_at:
last_successful_collection:
quota_cost_retention_limits:
next_action_and_owner:
```

`connected` requires a verified backend collection path for the selected brand/scope, not just a signed-in browser. `manual_only` requires a permitted, usable manual route, not merely the existence of a report download button. Store credential references securely outside this document; do not record secret values.

## Dependencies before enabling new source collection

1. Canonical brand ID and reviewed brief/query scope. Existing gardening examples must not become defaults for unrelated brands.
2. Explicit provider/account/property scope and authorized collection route for that brand.
3. Verified metric definitions, periods and limitations; no common invented demand score across unlike datasets.
4. Provenance-preserving observation contract and repeated-observation history. Radar currently deduplicates opportunities rather than providing the proposed complete observation history.
5. Per-brand permissions, budgets, durable source errors, retries and visible partial results.
6. Permitted retention, PII minimization and deletion rules before storing provider content.
7. Fixture tests first; live reads only within approved access, and paid calls/import writes only with the relevant authorization.

The present adapters can support continued local development. New provider access is an integration-specific gate, not a reason to postpone the shared multi-brand foundation.

## Verification performed and remaining

Performed: read repository guidance, README, package scripts and parent plan; inspected Radar adapter/action paths and UI; searched provider identifiers/endpoints across local source; inspected Reddit scanner node purposes and adjacent social/video measurement code. No environment files or credential stores read. No browser sign-in, provider API call, workflow execution, paid generation, database write, deployment or commit performed.

Remaining: active-brand-to-provider matrix completion, account permissions/terms verification, current deployment parity, real permitted observations and source quality. Existing dated deployment notes remain historical evidence, not this pass's verification result.

Lesson: distinguish provider-branded features from source capabilities. A social publishing connection, ad creative screen or scanner blueprint does not establish a reusable, permitted, multi-brand trend feed.
