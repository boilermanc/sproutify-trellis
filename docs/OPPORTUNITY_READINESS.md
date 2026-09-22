# Opportunity Finder — Phase 0 readiness

Date: 2026-09-22
Scope: local repository inventory and verification. No live account access, database writes, paid generation, pushes or deployments were performed.

## Deliverables

- [Brand inventory](OPPORTUNITY_BRAND_INVENTORY.md): existing mappings, context sources and migration conflicts.
- [Source readiness](OPPORTUNITY_SOURCE_READINESS.md): implementation evidence, unknown provider access and login checklist.
- [Proposed shared brief contract](OPPORTUNITY_BRIEF_CONTRACT.md): versioning, approvals, freshness and the first implementation slice.
- [Full implementation plan](MULTI_BRAND_OPPORTUNITY_FINDER_PLAN.md): product scope and release gates.

## Verification baseline

| Check | Result |
| --- | --- |
| `npm run test:trend-radar` | 14/14 passed |
| `npm run test:content` | 19/19 passed |
| Local TypeScript compiler, `tsc --noEmit` | Passed |
| `npm run build` | Passed |
| Offline Deno function check | Not verified: required JSR manifest unavailable without remote resolution |

Build warnings: outdated Browserslist data, a Tailwind worker glob that may scan dependencies, mixed static/dynamic imports, and a bundle chunk above the warning threshold. These did not fail the build; no unrelated dependency/configuration changes were made.

The existing tests cover helpers and source contracts, not live authorization, provider permissions, database writes or deployed job behavior. Passing them is a baseline, not completion of the new feature.

## Main findings

1. There are reusable brand descriptions and content strategy inputs, but not a shared approved/freshness-tracked fact contract. Migrate them as proposals, never pre-approved facts.
2. Repository content partitions are not the active brand inventory: runtime branches can appear without checked-in content files. A read-only live inventory and owner review remain necessary before declaring complete production coverage.
3. Existing Radar IDs can anchor opportunity lineage. Draft version, brief/fact references and publication/event associations still need explicit contracts.
4. Existing `services/jevActionService.ts` calls a server-side ranking function. This is a reuse candidate, not proof that opportunity evaluation or live provider access is ready.
5. Google Ads/Amazon/Search Console account availability remains unknown. A connector's source code, an open browser session and actual API authorization are three different checks.
6. Current run states and automatic-draft selection need later expansion for partial/not-ready/stale states and evaluated ranking. Preserve current settings during migration.
7. Brand-scoped request predicates alone do not establish per-brand user authorization. Confirm the intended access model before adding a new brief API or broadening exposure.

## Login and owner input

No browser login is needed for local contract work. When provider verification starts, first inspect existing Search Console properties, then existing Google Ads and Amazon account entitlements. Do not create accounts, buy access, expose keys, or grant new scopes as part of this inventory. No n8n login or forced failure is a prerequisite for the brief foundation.

Still needed for release: active brand/owner confirmation, approved facts for diverse validation brands, allowed provider budget, actual source access, live backend capability verification and explicit deployment approval. These do not block implementing and testing a provider-free brief contract locally.

## Next increment

Update: the provider-free contract/readiness and draft lineage increment is now implemented locally; see [Phase 1a foundation](OPPORTUNITY_FOUNDATION.md). The account, owner and production readiness gaps above remain open.

Implement the shared brief runtime contract and deterministic readiness checks with multi-brand fixtures, before adding persistence or enabling new automation. Include stale/missing approvals, conflicting identities, unsupported facts and version-lineage tests. Then add persistence and a review panel as separately verified increments.

Phase 0 local work is complete when the linked inventories are reviewed. The production readiness gate remains open: unverified accounts and owners are intentionally not marked ready.
