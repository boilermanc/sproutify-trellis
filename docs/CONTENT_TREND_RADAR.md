# Native Content Trend Radar

Content Intelligence → Trend Radar researches brand-relevant topics and produces reviewable article and social drafts without a Distribb subscription. Gemini generation and Google Search grounding still use the existing account's paid usage.

## Setup

1. Choose a brand in Content Intelligence, then open Trend Radar. Brands without a local content partition are also available.
2. Save its HTTPS website, audience/product brief, country, category, and optional existing page URLs. Existing content strategy is included when available.
3. Run **Save & scan now**. A scan returns up to five new opportunities, or an honest empty/error result. Progress refreshes automatically.
4. Choose daily or weekly frequency and enable **Run automatically**. The shared n8n workflow checks one due brand every 15 minutes. New brands are paused by default.
5. Optional automatic drafting creates one draft per successful scan. Review the article, sources and social posts, then copy or download Markdown.

This increment does not publish to websites, send social posts or perform outreach. It does not claim ranking guarantees, keyword difficulty, monthly volume, or measured growth without evidence.

## Sources

- Country-wide current searches: public Google Trends RSS. Feed traffic is labeled approximate feed traffic, never keyword volume or growth.
- Brand-specific ideas: Gemini Google Search grounding, labeled **Search research · demand unverified** unless the exact query matches a measured source. Sources and capture times are retained.
- Category-level Rising queries: import the English Google Trends CSV with its exact Explore URL and capture date. Geography, category, date range, search property and seed remain attached. Top scores are rejected; Breakout has no invented numeric growth.

Google Trends Explore is not a supported unattended data source here. The official Trends API requires access; the public RSS feed does not reproduce category-level Rising queries. A category setting guides research, not an undocumented Trends API request.

References: [Google Trends API](https://developers.google.com/search/apis/trends), [Related searches](https://support.google.com/trends/answer/4355000?hl=en), [Gemini Google Search grounding](https://ai.google.dev/gemini-api/docs/google-search).

## Backend and scheduler

- Hub: `horvjqqifgrzxesuxtfm`; customer/spoke data is not copied or modified.
- Migration: `20260912160554_content_trend_radar.sql`, also included in the master `SQL_SCHEMA`.
- Function: `content-trend-radar`, JWT verification enabled, active Trellis users can read; owner/admin/operator roles can manage. Scheduler `tick` requires the Hub service credential.
- Tables and RPCs are service-role only with RLS enabled. The browser accesses them through the authenticated function.
- n8n blueprint: `n8n-blueprints/C5-content-trend-radar.json`, using the existing **Sproutify Trellis** Supabase credential. No secrets are included in the blueprint.
- Workflow: [Trellis: Native Content Trend Radar](https://n8n.sproutify.app/workflow/0UzRdSkYCmvMnOCQEhmQF).
- Function configuration: existing `GEMINI_API_KEY` environment secret or Hub `tenant_secrets.gemini_api_key`; optional `CONTENT_RADAR_MODEL` override.

Scans and drafts save a claim before returning a queued response and continue with `EdgeRuntime.waitUntil`. Research and structured writing use separate requests; automatic drafting starts a separate function invocation to stay within worker limits. Results and errors are durable in Trellis; n8n success means the scan was accepted, not that the later AI work succeeded. See [Supabase background tasks](https://supabase.com/docs/guides/functions/background-tasks) and [runtime limits](https://supabase.com/docs/guides/functions/limits).

Only one scan per brand can run at once. Manual scans have a five-minute cooldown. Stale scan leases recover after 15 minutes; stale draft leases after 10 minutes. Draft tokens reject stale completions. Scheduled failures back off six hours. Duplicate project/country/query keys are skipped. Existing draft content and dismissed ideas survive repeated research.

## Verification

```powershell
npm run test:trend-radar
npm run test:content
deno check supabase/functions/content-trend-radar/index.ts
npm run build
```

`tests/content-trend-radar-db.sql` exercises pause behavior, claim exclusion, cooldown, successful completion, duplicate protection, draft token recovery, and dismissal in a rolled-back transaction. It also reports table permissions and RLS. Run against the Hub after applying the migration.

Deployment verification on September 12, 2026: new Hub tables installed; 14 source/validation tests passed; 19 existing Content Intelligence tests passed; production build and TypeScript checks passed. The real RSS adapter returned 10 items. n8n authenticated successfully (HTTP 200), correctly skipped when nothing was due, and queued a real ATL Urban Farms scan that saved five opportunities.

## Implementation lessons

Keep measured Trends evidence separate from search-based hypotheses. Asking a search-enabled model to write JSON can produce content without a search; obtain a grounded research brief first, then generate structured writing from it. Claim work before replying, and use separate invocations for research and automatic drafting. An AI/provider error must remain visible and retryable instead of becoming fabricated evidence or a false success.

## Live status — September 12, 2026

The Hub function is deployed at version 6 with JWT verification enabled. **Trellis: Native Content Trend Radar** is published in n8n; its schedule trigger checks due brands every 15 minutes. ATL Urban Farms has weekly research and one automatic draft per scan enabled. Other brands remain unconfigured until their settings are saved.

Two real scans saved ten opportunities. Two complete article/social draft bundles are ready. The first verified export contained eight research sources and two social posts, with no unresolved numeric citations. The subsequent scheduled scan successfully queued its draft; provider output errors during that test were recorded and the draft was recovered through the UI after hardening response handling.

The final pipeline separates grounded research from structured writing, parses structured JSON before sanitizing its fields, and permits one formatting-only repair request for malformed JSON. If fresh search sources are absent but an opportunity has saved search research, an evergreen draft can reuse that evidence and is explicitly marked for editorial review. Imported Trends CSV alone is not treated as factual article research. Unknown source indexes are rejected; source links are assembled from provider metadata after text sanitization. Drafts with unresolved inline references receive a review notice instead of fabricated citations.

Verified in the signed-in local UI: loading/error feedback, five then ten real opportunities, draft creation/retry, dismissed filtering, restoration, empty search results, saved weekly settings, and Copy draft bundle. A screenshot inspection confirmed the layout. The in-app browser did not expose a completed Markdown download for either tested download mechanism; Copy draft bundle works and the download button provides that fallback guidance. Existing unrelated Hub profile-fetch console errors remain outside this change.

The frontend becomes available at the hosted Trellis URL after the normal repository build and deployment workflow completes. The backend scheduler already runs independently of the frontend deployment.

Final validation: 14 Trend Radar tests passed, the existing 19 Content Intelligence tests passed during implementation, TypeScript and Deno checks passed, database rollback checks passed, and the production build passed. The original test draft is retained in the opportunity evidence as `superseded_draft` for reference.
