# Opportunity Finder: brand inventory and migration readiness

Date: 2026-09-22
Scope: Phase 0 local repository inspection for the [multi-brand plan](MULTI_BRAND_OPPORTUNITY_FINDER_PLAN.md).
Status: Local inventory complete; production registry reconciliation and owner approvals remain open.

### Follow-up: read-only Hub registry check

On September 22, Switchboard resolved this repository to the Hub (`horvjqqifgrzxesuxtfm`). A read-only join of active `branches` to `marketing_brands` confirmed 10 active branches: ATL Urban Farms, LaneWise, Once Upon A Drawing, Rejoice, Rekkrd, SpectIQ, Sproutify Farm, Sproutify Home, Still Jane's Daughter and Sweetwater Urban Farms.

Eight have a marketing profile. LaneWise (`lanewise`) and Still Jane's Daughter (`still-janes-daughter`) do not. Show a setup-required state for these branches; do not create profiles or infer approved facts automatically. The registry uses branch UUIDs, marketing-brand UUIDs and project slugs as separate identifiers. This check confirms registry activity/mapping only, not owner signoff, product claims or source access. The local-only observations below describe the earlier inventory pass.

## What this inventory establishes

Trellis already has multiple brand representations, not one canonical brief. We should reconcile them rather than introduce another competing source of truth. A brand's presence in source code is **not** proof that it is an active production brand, that its claims are verified, or that its provider accounts are connected.

No remote calls, account checks, paid generation, credential reads, or application changes were performed for this inventory. Current production activity and the complete active-brand list were not independently verified here. The dated ATL activity recorded in the parent plan is prior audit evidence, not a fresh check.

## 1. Identity and existing sources

| Representation | Local evidence | Meaning and migration concern |
| --- | --- | --- |
| Branch registry | `types.ts` (`Branch`); `App.tsx` (`refreshBranches`) | Branches have separate `id` and `slug`, website, description, tone, keywords and `is_active`. Runtime refresh filters active branches for the global picker. The runtime registry, not recipe keys, must establish the active inventory. |
| Content project | `services/contentIntelligenceRegistry.ts`; `pages/ContentIntelligence.tsx` | Repository project IDs are directory names. UI merges these with runtime branch slugs using `blankProject`, so missing repository partitions do not mean a brand is absent from the application. Radar requests use `project_id`. |
| Brand DNA | `types.ts` (`BrandIdentity`) | Separate identity ID and `branch_id`, mission, audience, voice, values, hooks, styling and status. An `active` identity does not supply per-fact provenance, reviewer or expiry. |
| Marketing brand | `types.ts` (`MarketingBrand`); `services/marketingBrandService.ts` | Separate marketing ID, branch link and optional identity link; overlapping description, audience, tone, value proposition, website, keywords and metadata. Service permits multiple brands per branch; do not assume a one-to-one mapping without reconciliation. |
| Card brief recipe | `constants.ts` (`BRIEF_RECIPES`); `services/aiService.ts` | Six explicit slug keys plus a default. Voice, scenarios, variation axes, banned words and footer guidance are creative inputs, not approved factual claims or demand evidence. |
| Visual execution | `services/brandCardStyles.ts`; `services/brandCreativeDirections.ts` | Explicit Rekkrd and Rejoice policies. Preserve these constraints; importing a brief must not silently reset approved creative choices. |
| Strategy and learning | `.trellis/spec/projects/`; `.trellis/knowledge/projects/` | Build-time, project-partitioned strategy and records. Reviewed learning is deliberately separate from positioning. All three local learning documents currently say no promoted learnings. |
| Radar settings | `services/contentTrendRadarService.ts` (`RadarConfig`); `components/ContentTrendRadar.tsx` | Free-text brief/strategy, website, country, language, category, existing pages and scheduling. No versioned facts/offerings/priorities contract. Preserve existing saved settings through migration. |
| Shared publishing channel | `services/substackChannelService.ts` | Sweetwater Technology channel lists Sweetwater Technology, Rekkrd and Rejoice sections. A shared publication is not evidence that these projects share facts or performance attribution. |

## 2. Local brand/identifier inventory

Labels below describe local material, not newly approved business positioning. Names inferred from slugs are only display labels until reconciled with the runtime registry.

| Candidate ID or reference | Material located | What remains to confirm |
| --- | --- | --- |
| `atlurbanfarms` — ATL Urban Farms | Explicit card recipe; comments identify this as the live branch slug; parent plan records prior ATL Radar audit. No local Content Intelligence partition. | Actual branch UUID/slug mapping, approved offering catalog and destinations, owner, source connections and current schedule. |
| `sproutify-farm` — Sproutify Farm | Explicit commercial-grower card recipe; lead sequence reference. No local partition. | Relationship to `farm.sproutify.app`; current offerings, audiences and owner approvals. Older repository guidance calls Farm a gardening community, while recipe language addresses commercial buyers: do not auto-resolve the conflict. |
| `still-janes-daughter` — Still Jane's Daughter | Explicit reflective/storytelling recipe; comment says to refine with Sheree as brand voice owner; Hub-native branch test references. No local partition. | Sheree's review of voice and actual business goals/offerings; current branch ID/domain; approval of facts. A TODO is not approval. |
| `rejoice` — Rejoice | Local strategy and knowledge partition, card recipe, styles and creative directions. Strategy names `letsrejoice.app`. | Runtime identity mapping; reviewed product claims, licensed verse-content constraints, owner and source properties. |
| `rekkrd` — Rekkrd | Local strategy and knowledge partition, card recipe, styles and creative directions. Strategy names `rekkrd.com` and `@rekkrdapp`. | Runtime mapping; confirmation of current capabilities such as Discogs sync; owner and source properties; separation of app marketing and After Dark series. |
| `spectiq` — SpectIQ | Local strategy and knowledge partition, explicit recipe, mock Brand DNA and six topic records. Strategy addresses inspection-company operations. | Production activity, approved current versus planned capabilities, owner, source access and reviewed claims. |
| `sproutify-home` | Named in `tests/hub-native-branches.test.mjs`. No local partition or explicit recipe located. | Whether active, actual domain/name, purpose, identity links, owner and brief. |
| `sweetwater-urban-farms` | Named in Hub-native branch tests and `services/businessOverviewService.ts`. No local partition or explicit recipe located. | Whether active and its distinct identity; do not merge with Sweetwater Technology because of a shared word. |
| `once-upon-a-drawing` | Named in `services/businessOverviewService.ts`. No local partition or explicit recipe located. | Whether active, actual domain/name, offerings, owner and brief. |
| `school.sproutify.app`, `micro.sproutify.app` | Historical ecosystem descriptions in `AGENTS.md`; no matching local content partition. | Actual branch slugs/IDs and current activity. Domains are not automatically project IDs. |
| Sweetwater Technology / `sweetwater-technology-substack` | Shared Substack channel configuration. The identifier is a channel ID. | Whether this maps to a branch, a publication-only entity, or both; explicit section-to-brand mapping. |

This is the union of the local representations inspected, **not a certified complete production brand list**. Reconcile against all active runtime branches before declaring the Phase 0 all-brand acceptance gate met. Include unconfigured brands visibly instead of omitting them.

### Local content partition counts

Counts are nonempty JSONL records read from `.trellis/knowledge/projects/` during this inventory. They do not count live Hub records, publications or traffic.

| Project | Topics | Posts | Experiments | Performance events | Promoted local learnings |
| --- | ---: | ---: | ---: | ---: | ---: |
| `rejoice` | 0 | 0 | 0 | 0 | 0 |
| `rekkrd` | 0 | 0 | 0 | 0 | 0 |
| `spectiq` | 6 | 0 | 0 | 0 | 0 |

SpectIQ topic sources are product positioning, product boundary, editorial rule and audience objection. These are useful seeds, not observed trend signals or measured outcomes.

## 3. Migration conflicts and safeguards

1. **UUID, slug and domain are not interchangeable.** `Branch.id` and `Branch.slug` are separate. Radar/content use project slugs. Mock ATL DNA uses `atlurbanfarms.com`, the recipe uses `atlurbanfarms`, and a Campaign Builder fallback uses `atl-urban-farms` (`pages/CampaignBuilder.tsx`). Build and review an explicit identity crosswalk; do not create three brands or silently alias unrelated records.
2. **Overlapping brand stores lack precedence.** Branch tone, Brand DNA voice, MarketingBrand tone, recipe voice and strategy prose can disagree. Preserve source values and surface conflicts for review. Define which approved version downstream features read; retain module-specific visual/channel policies.
3. **Mock and generated claims cannot be promoted automatically.** `MOCK_BRAND_IDENTITIES` includes an ATL numeric community-size hook without fact-level supporting evidence. Reject that as an approved-fact source. Mock `status: active` is not production approval.
4. **Positioning is not feature verification.** Local Rekkrd and SpectIQ strategy describes product capabilities; review against authoritative product evidence and attach confirmation dates before using them as approved draft facts.
5. **Creative scenarios are hypothetical.** Recipe stories about harvests, savings, buyers or outcomes must not become claims that these events happened. Farm axes requesting stats must not license invented numbers.
6. **Rekkrd has more than one content purpose.** The card recipe is heavily listening/nightlife-oriented; the main strategy centers collection management and separately names After Dark. Model series/channel context underneath one approved brand scope rather than overwrite one voice with the other.
7. **Partition existence is not onboarding readiness.** The browser can render a runtime branch with a blank local project. New brief setup must be server-readable and must not require a directory/code edit for each new brand. Existing repository strategy should be imported with provenance or retained as a linked reference, not lost.
8. **UI filtering is not an authorization policy.** The picker merges repository project names and runtime branches. New read/write isolation must be verified at the server boundary; do not claim the local registry proves cross-brand access control.
9. **Shared publication must keep distinct attribution.** Sweetwater Technology sections may carry multiple brands. Record explicit project ownership for every opportunity/publication and do not transfer results automatically between sections.
10. **Existing automatic drafting needs an explicit choice.** Radar initializes `auto_draft: true`; migration must preserve or deliberately review saved settings rather than silently turn a new approval workflow into automatic drafting.

## 4. Proposed shared-brief import boundary

Use the canonical brief shape in the parent plan. This inventory does not finalize storage or create a second competing schema.

- Identity crosswalk: existing branch UUID, canonical project slug, identity IDs, marketing-brand IDs, reviewed domains and documented legacy aliases.
- Imported candidates: source path/record and field, original value, capture time and proposed destination field. All unreviewed factual imports remain proposals.
- Governed brief: version, status, approving reviewer, effective date, offerings/audiences/priorities, voice and boundaries, approved facts with source and last-confirmed/review-due dates.
- Separate linked execution policies: visual rules, series/channel guidance, source connections and publication destinations. They should not be flattened into one prose prompt.
- Existing Radar free text remains available as migration input; never overwrite it with default recipes or discard existing opportunities/drafts.

Before any write migration, produce a dry-run crosswalk showing unmatched and multiply-matched records. Require explicit decisions for ambiguity. Preserve original IDs, approval provenance and rollback information.

## 5. Candidate validation brands and review responsibilities

Proposed primary set: **ATL Urban Farms, Rejoice and SpectIQ**. This exercises physical products, scripture/community engagement, and B2B software with distinct claims and audiences. Selection is for structural coverage; it does not assert current access, readiness or approved facts. If a candidate is inactive, select another active brand with comparable diversity after registry reconciliation.

Additional cases:

- Still Jane's Daughter: editorial/storytelling without forcing a direct product sale; obtain Sheree's voice input where appropriate.
- Sproutify Farm: distinguish commercial audiences from ATL and reconcile community versus commercial positioning.
- Rekkrd: one brand with distinct app and listening-series priorities, plus existing locked visual rules.

`AGENTS.md` identifies Clint as technical lead and Sheree as Farm Ops/QA; the SJD recipe explicitly requests her voice refinement. These references do not establish approval ownership for every brand. Record each actual reviewer and approval scope rather than assigning owners by assumption.

## 6. Phase 0 remaining checks / smallest next increment

- [ ] Read-only reconciliation of the active runtime branch list with this inventory, recording IDs/slugs/names/status and unmatched identity records without exposing credentials or customer data.
- [ ] Brand owner confirms the review contact and approval authority for each active brand.
- [ ] Review the identity crosswalk and conflicting positioning; keep unknowns explicit.
- [ ] Select at least three active, diverse validation brands.
- [ ] Import proposed briefs for that set and test missing/contradictory/stale facts without treating imports as approvals.
- [ ] Approve the smallest Phase 1 contract, persistence and migration plan under the parent plan's security and deployment rules.

No login is required to use these local findings or start contract work. A login may be needed later to inspect actual brand settings or confirm source-property access; that should be requested for a specific read-only check, not an open-ended n8n detour.

## Verification performed

- Inspected repository guidance, README, package scripts and current Git state.
- Read the project registry builder, UI branch/project merge, recipe and styling maps, strategy/learning documents and relevant type definitions.
- Counted local JSONL records and confirmed only three local knowledge partitions.
- Wrote only this planning/readiness document. No application tests or build are needed for this documentation-only inventory; no runtime behavior is claimed as verified.

Lesson: inventory identities and provenance before importing content. Code-level defaults, positioning, and creative prompts are valuable inputs, but none is a substitute for an approved, dated fact.
