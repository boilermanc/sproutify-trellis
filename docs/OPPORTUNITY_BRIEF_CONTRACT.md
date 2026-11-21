# Opportunity Finder — proposed shared brief contract

Date: 2026-09-22
Status: Phase 0 design with [Phase 1a pure validation and lineage helpers](OPPORTUNITY_FOUNDATION.md) implemented locally. Persistence, UI and live integration remain unimplemented; this is not an approved business brief.

## Purpose

Give every brand the same research/drafting interface without treating existing free-text descriptions as approved facts. This is the smallest Phase 1 foundation; provider integrations and semantic scoring can follow independently.

## Existing contracts to preserve

- `types.ts`: `MarketingBrand` contains a brand UUID, branch association, audience, tone, positioning, keywords and unstructured metadata. These are useful proposed inputs, not evidence of approval or freshness.
- `services/contentTrendRadarService.ts`: `RadarConfig` has free-text brief/strategy and page URLs. `RadarOpportunity.id` already supplies identity; preserve it when extending lineage.
- `services/contentIntelligenceRegistry.ts`: content records use `project_id`, topic/post/experiment IDs and canonical URLs. Do not replace these with display-name-derived IDs.

The branch, marketing-brand and content-project namespaces are not interchangeable. Resolve their mapping explicitly before persisting a brief. Multiple marketing brands under one branch must not silently share facts, permissions or defaults.

## Proposed contract fields

| Group | Required content |
| --- | --- |
| Identity | Stable brief ID, version ID, explicit brand/branch/project association, schema version |
| Lifecycle | Draft/review/approved/retired state; author, reviewer and timestamps; superseded version reference |
| Offerings | Stable offering ID, name, type, source/catalog URL, availability status and relevant markets; no hardcoded gardening categories |
| Audiences | Stable audience ID, description, needs, applicable offerings and exclusions |
| Priorities | Stable priority ID, desired business outcome, owner-selected relative importance and active dates; missing weights stay unset |
| Voice | Tone, examples, preferred terms, avoided terms and channel rules |
| Facts | Stable fact ID, exact claim, evidence references, last-confirmed date, review-due date, approval identity/status and offering scope |
| Restrictions | Prohibited claims, required caveats, disallowed topics and compliance review conditions |
| Research context | Markets, languages, topic seeds, competitors as research context, source preferences and reviewed seasonal context |
| Content context | Known canonical pages, allowed channels, intended calls to action and destination links |

Evidence references need source location, title, captured/confirmed date and relevant excerpt or record reference where permitted. A URL alone does not establish support. Do not copy customer profiles or credentials into this contract.

## Deterministic lifecycle rules

1. Existing text becomes a proposal with its origin recorded; migration never manufactures approval.
2. Approval requires a real reviewer and explicit version. Editing an approved version creates a new draft; historical versions remain attributable.
3. Facts may be approved independently, but a brief cannot claim readiness while required context is missing. Define requirements per workflow rather than requiring every optional field.
4. Missing/invalid confirmation dates and expired review dates are visible readiness failures for using that fact. Age is calculated in code, not inferred by AI.
5. Generation pins the approved brief version and specific fact/evidence IDs. A later change does not rewrite past drafts.
6. A retired, stale or revoked fact remains in history but cannot silently support a new draft. Existing affected drafts receive a review warning.
7. Every lookup validates brand ownership. An all-brand summary is not permission to mix facts between brands.
8. No automatic sends, publication, account connection or new paid research follows from brief approval.

## Migration and review

Present current marketing descriptions, Radar brief/strategy and Content Intelligence strategy side by side. Record conflicts for an owner; do not concatenate competing descriptions and call them canonical. Keep existing Radar settings and automatic-draft preferences unchanged until an explicit migration decision.

Proposed validation must cover at least three materially different brand types. Use real, owner-reviewed facts for acceptance. Synthetic examples are useful for automated tests but must never appear as approved production facts.

## Smallest Phase 1 increment

1. Resolve stable mappings and identify authoritative existing inputs.
2. Add a pure, runtime-validated brief contract and readiness functions with fixtures: missing facts, stale dates, wrong-brand references, conflicting versions and new-brand onboarding.
3. Add versioned persistence and authorization using the existing backend patterns; prepare migrations separately from deployment.
4. Add a review/readiness panel to the existing brand/content workspace, not a competing brand directory.
5. Add explicit approved-version consumption to research/drafting behind a rollout guard; preserve legacy behavior until migration is approved.

Acceptance: one new configured brand can use the same contract without source-code changes; unapproved/stale claims cannot enter the approved fact set; version lineage and brand isolation are tested. Contract-only tests do not prove production authorization or live database readiness.

## Jev boundary

The TypeSafe skill informed the separation between deterministic readiness and semantic relevance. Jev does not approve facts, invent metrics, resolve access or write content. The first increment needs no paid Jev calls.

Live documentation rechecked September 22: the index could not be fetched, but the normal [confidence page](https://docs.typesafe.ai/confidence), [reranking cookbook](https://docs.typesafe.ai/cookbooks/rerank_typesafe) and [API reference](https://docs.typesafe.ai/api) were reachable. Preserve raw judgments and validate thresholds with brand-specific labeled cases. Provider credentials and permitted budget remain unverified. The earlier plan's documentation-access note describes the earlier authoring attempt, not a continuing total documentation outage.
