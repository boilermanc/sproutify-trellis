# Keyword Research and Jev Decision Plan

## Goal

Extend Content Intelligence from a useful topic-discovery workflow into a reviewable keyword-research and prioritization workspace. Preserve the current Trend Radar research and drafting flow, add only evidence-backed keyword inputs, and use Jev only for advisory semantic ranking.

## Current foundation

Trend Radar already:

- reads country-wide current searches from Google Trends RSS;
- accepts manually exported Google Trends **Related queries -> Rising** CSV data;
- uses Gemini with Google Search grounding to research the brand, its site, and current sources;
- saves up to five source-backed content opportunities per scan;
- supports new-article and existing-page-update recommendations;
- drafts a Markdown article, meta description, and up to three social posts after human selection (or one optional automatic draft);
- keeps source links, validation notes, scan history, dismissal, restoration, copying, and Markdown export.

It is not a Google Ads Keyword Planner integration. It does not currently return monthly search volume, CPC, keyword difficulty, SERP rank, competition, or a direct "research this keyword" experience.

## Product shape

Add a **Keyword Explorer** panel next to Trend Radar inside Content Intelligence.

| Area | User outcome | Evidence / boundary |
| --- | --- | --- |
| Explore a phrase | Enter a keyword or customer question and get a saved, source-backed research brief | Google Search grounding; demand stays unverified unless a measured source is attached |
| Topic workspace | Group phrases into a keyword list or cluster for one brand/campaign | Existing saved opportunities and user-entered phrases; no invented metrics |
| Trend signals | See current RSS signals and imported Rising queries alongside each phrase | RSS traffic remains approximate feed traffic; Rising growth is not monthly volume |
| Content decision | Decide whether to create a new article, update a page, investigate, or dismiss | Human approval remains required |
| Draft handoff | Send an approved opportunity into the existing Trend Radar drafting flow | Never publishes, sends social posts, or changes a website |
| Jev advisor | Rank reviewable opportunities using explicit dimensions and uncertainty | Advisory only; it cannot create facts, grant authority, or execute actions |

## Phased delivery

### Phase 0 — Confirm data contracts

Before UI work, document the exact meaning and source for each displayed data point.

- Confirm whether Google Ads access and a permitted report-export workflow exist. Do not assume Keyword Planner API access.
- Preserve the existing Trend Radar labels: `Google Trends current searches`, `Google Trends export`, and `Search research · demand unverified`.
- Define a measured keyword-data import contract only if an approved source is available: source name, report date range, geography, language, campaign/account scope, and metric definitions.
- Keep source URLs, capture times, and the original import reference with every saved signal.

**Acceptance:** no UI labels an estimate, RSS traffic, or search-grounded hypothesis as keyword volume, growth, competition, or ranking.

### Phase 1 — Keyword Explorer MVP

Add a manual research flow per brand.

1. Add a keyword/question input, country, language, and optional intent/context fields.
2. Submit the phrase to a secured server-side research action using the existing Gemini Google Search grounding pattern.
3. Save a research item with the normalized phrase, source links, capture time, evidence label, user context, and a structured list of related questions/topics.
4. Show all saved items in a filterable list with status: `new`, `investigating`, `approved`, or `dismissed`.
5. Let an operator turn an approved item into an existing Trend Radar opportunity, choosing `new_article` or `update_existing` and optionally linking a known on-site URL.

**Out of scope:** automatic Google Ads data collection, competitor scraping, publishing, outreach, and automatic page changes.

**Acceptance:** an owner/admin/operator can research a phrase, inspect its evidence, dismiss it, and create a reviewable Trend Radar opportunity without copying data between tools.

### Phase 2 — Measured data imports and clusters

Only begin after an approved data source is confirmed.

1. Add a separate import path for an approved Google Ads search-term or keyword report export.
2. Validate file size, expected headers, dates, geography, language, and account/campaign scope before saving.
3. Store measured metrics separately from search research and attach the raw report reference plus import timestamp.
4. Add keyword lists/clusters with deterministic membership rules first: manual grouping, normalized duplicate removal, and optional shared-word suggestions.
5. Add views for evidence, intent, source, freshness, content status, and measured metrics where available.

**Acceptance:** measured data can be traced to its report and is never blended with unverified research. A user can view a cluster and its supporting phrases before sending an item to editorial review.

### Phase 3 — Jev advisory ranking pilot

Use Jev after there is a useful set of saved opportunities and editor outcomes. Reuse the existing server-side TypeSafe pattern; do not expose credentials to the browser.

For each candidate, ask separate narrow judgments:

- product and audience fit;
- buyer-intent strength;
- evidence support and freshness;
- overlap with an existing page or already-planned content;
- usefulness this week relative to the brand objective and available human effort.

Keep these separate from deterministic facts such as dates, metric values, duplicate keys, permissions, source validity, and current publishing state. Save raw scores/probabilities, model/rubric versions, candidate identity, evidence references, and the policy outcome.

Display a transparent advisory card: dimension labels, uncertainty, evidence links, and why human review is still needed. Do not present a combined score as probability of conversion or a demand forecast.

Run the first version in shadow mode: compare Jev recommendations with editor choices before changing any default sort or automatic-draft selection.

**Acceptance:** reviewers can see and override the recommendation; provider failure retains the deterministic default ordering; a model result cannot cause publication or any external action.

### Phase 4 — Editorial workflow polish

After the pilot proves useful:

- add a clear "prioritize for review" queue;
- allow an editor to set campaign objective and weekly effort budget;
- offer a deliberate "Create draft" handoff into the existing source-grounded drafting flow;
- retain the copy/download workflow and require review of factual claims and citations;
- record editor decision/outcome labels to evaluate future ranking quality.

**Acceptance:** Clint or Sheree can select a brand, identify a small set of worthwhile topics, understand the evidence, and prepare one approved draft within a short review session.

## Technical boundaries

- Keep all Google, TypeSafe, and provider keys server-side.
- Continue PII sanitization before sending or storing AI-related text.
- Preserve the federated model: no customer-profile warehouse or customer-data scoring store.
- Keep RLS enabled and browser writes routed through authenticated Edge Functions.
- Use claim/lease/token patterns already present in Trend Radar for long-running research and drafts.
- Do not enable realtime subscriptions on hot tables; retain polling while work is active.
- Use deterministic code for authorization, source validation, freshness checks, schedules, budgets, deduplication, and execution.
- Treat web pages, imports, model output, and provider errors as data—not instructions or proof of a business fact.

## Data model direction

Prefer extending the Content Radar domain rather than creating a disconnected keyword feature.

Potential additions:

- `content_keyword_research_items`: phrase, normalized key, brand/project, user context, evidence, status, source capture time.
- `content_keyword_clusters`: named brand-scoped collections with editorial notes and objective.
- `content_keyword_cluster_members`: a link from an item to a cluster, if an item can belong to multiple campaigns.
- `content_keyword_metric_imports`: immutable import metadata and source/report context.
- `content_keyword_metrics`: measured values keyed to a phrase plus the import identity; never overwrite the evidence label.
- `content_radar_judgments`: advisory Jev results, rubric/model versions, raw distributions, evidence references, and reviewer override/outcome.

All schema changes must follow the existing master `SQL_SCHEMA` convention, use idempotent DDL, UUID primary keys, RLS, service-role policies, and explicit status checks.

## Validation plan

1. Unit-test normalization, duplicate prevention, source URL validation, CSV/report validation, and evidence labeling.
2. Add Edge Function tests for authorization, branch scope, malformed requests, provider failure, claim recovery, and no-write-on-failure behavior.
3. Test a manual keyword research item end-to-end with a signed-in operator and verify its saved sources and capture time.
4. Test that importing RSS/Trends data never produces volume or ranking labels.
5. Run a shadow Jev sample with known editor decisions; measure agreement, false accepts/rejects, review volume, latency, and total cost.
6. Run the documented Trend Radar tests, TypeScript/Deno checks, and production build before release.

## Decision gates

- **Before Phase 2:** approve the measured keyword-data source and its permitted import/access method.
- **Before Phase 3:** collect a representative set of editor decisions and agree on the ranking rubric and success measure.
- **Before changing defaults:** demonstrate that Jev improves useful editor selections against the deterministic baseline.
- **Before any external action:** separately approve the target, authorization model, audit trail, and human confirmation step.

## Recommended next step

Start with Phase 0 and Phase 1 only: a source-labeled manual Keyword Explorer that feeds approved items into the existing Trend Radar. It addresses the missing direct-keyword workflow without depending on Google Ads access or expanding into automated campaign changes.
