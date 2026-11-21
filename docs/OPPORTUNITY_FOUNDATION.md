# Opportunity Finder foundation — Phase 1a

Follow-up: local storage/API and review UI are now implemented; see [current implementation status](OPPORTUNITY_IMPLEMENTATION_STATUS.md). The sections below record the narrower Phase 1a delivery boundary.

This increment adds provider-free runtime validation and draft lineage helpers. It does not enable a new UI, persist briefs, migrate existing settings or change live drafting. The existing Radar remains unchanged until an approved integration increment.

## Modules

- `services/opportunityBrief.mjs`: versioned brief schema, deterministic readiness and revision-lineage checks.
- `services/opportunityLineage.mjs`: new-draft metadata preserving the saved opportunity ID, separate draft ID, approved brief version and selected fact/evidence references.
- `tests/opportunity-brief.test.mjs` and `tests/opportunity-lineage.test.mjs`: behavioral coverage using fictional brands, not approved production facts.

Run `npm run test:opportunity-brief` locally. No provider accounts or paid calls are needed.

## Integration rules

Pass an explicit `expectedScope` containing `brand_id`, `branch_id` and `project_id`, resolved by the caller from authorized records. These helpers validate consistency; matching strings do not prove user authorization or that a reviewer actually approved a record. Persistence/API code must authenticate users, validate reviewer authority, and protect immutable approved versions.

Pass an explicit `now` instant for reproducible readiness checks. Research and drafting have different readiness requirements. Consume `eligible_facts`, not the original unfiltered input. A readiness result is time-sensitive; re-evaluate before generation rather than caching approval indefinitely.

`createOpportunityDraftLineage({ opportunity, draft_id, brief, fact_ids }, { expectedScope, now })` returns `{ ok, lineage, issues }`. Opportunity records require `id` and all three scope keys. The function derives evidence references from the selected eligible facts rather than trusting a caller-provided evidence list. A successful result is metadata, not a generated or published draft.

The brief/version pair qualifies fact IDs and evidence references. Retain the underlying immutable brief snapshot when persistence is implemented. Saved historical lineage must not be rewritten when a fact expires; flag affected content for review separately. Later publication/event associations must retain the same opportunity ID.

These validators neither sanitize text for model processing nor verify that source text proves a claim. Before AI use, apply the existing PII controls; owner review remains responsible for factual support. No customer profile or provider credential belongs in a brief.

## Remaining work

1. Reconcile runtime brand mappings and approved reviewers.
2. Implement authorized versioned persistence and immutable approval transitions.
3. Add a review/readiness panel to the existing workspace.
4. Connect approved snapshots and lineage to Radar generation behind a controlled rollout.
5. Verify live authorization and real multi-brand workflows before declaring Phase 1 complete.

Lesson: distinguish a structurally valid record, usable approved facts, and actual server authorization. None is a substitute for the others.

## Verification on September 22, 2026

- Behavioral foundation tests: 73/73 pass via `npm run test:opportunity-brief`.
- Existing Radar tests: 14/14; Content Intelligence tests: 19/19.
- Local `tsc --noEmit` passes.
- Production build passes after an approved rerun outside the sandbox; initial esbuild config resolution was denied by sandbox filesystem access.
- Existing build warnings remain: old Browserslist data, broad Tailwind worker glob, mixed dynamic/static imports and large chunks.

No database migrations, provider calls, browser/UI validation, commits, pushes or deployments were performed. The new pure modules are exercised directly by tests; they are not yet imported into the app workflow, so the app build alone does not validate their behavior.
