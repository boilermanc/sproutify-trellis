# Branch Command Center — Data Audit & Research

## Overview

Almost everything needed for a Branch Command Center already exists somewhere in the app. The main issue is duplication — at least 4 pages independently call `fetchEnrichedProfiles()` and re-derive the same aggregates inline. There's no shared hook or service that pre-computes "branch-level stats."

---

## What Already Exists (and Where)

### Profile Counts Per Branch/Spoke

| Source | File | How | Reusable? |
|--------|------|-----|-----------|
| `fetchBranchDistribution()` | `lib/supabaseService.ts:576-606` | Counts from local `profiles.branches` array | Yes, but **currently unused** |
| `fetchSpokeCounts()` | `pages/Dashboard.tsx:55-93` | Groups federated profiles by `_spoke_id` | No — inline in Dashboard |
| `audienceData` memo | `pages/Reports.tsx:73-81` | Groups by `_spoke_name`, top 5 | No — inline useMemo |
| `filterStats` memo | `pages/Profiles.tsx:191-206` | Counts per branch from `profile.branches` | **Computed but never rendered** |
| `fetchAllProfileCounts()` | `Branches.tsx:19-52` | Groups enriched profiles by spoke_name | No — inline in Branches |

**Duplication alert:** 5 different places compute essentially the same "profiles per spoke" metric.

---

### Revenue / Orders / LTV Per Branch

| Metric | File | How | Reusable? |
|--------|------|-----|-----------|
| Per-customer LTV, order_count, AOV | `spokeConnector.ts:636-767` | `enrichProfilesWithOrders()` — the canonical source | **Yes** |
| Per-spoke revenue aggregation | `pages/Reports.tsx:164-177` | Groups profiles by `_spoke_name`, sums LTV | No — inline useMemo |
| Total revenue across all spokes | `pages/Dashboard.tsx:130-136` | `federatedOrders.reduce(sum + total)` | No — inline |
| Aggregate KPIs (totalLTV, totalOrders, AOV, VIP count) | `pages/Profiles.tsx:68-86` | useMemo over federated profiles | No — inline |
| Same KPIs, different shape | `CustomerIntelligence.tsx:71-100` | Nearly identical computation | No — inline |

**Key insight:** `enrichProfilesWithOrders()` already puts `order_stats` on every profile (LTV, order_count, AOV, products_purchased). The per-spoke revenue rollup in Reports.tsx just does a `.forEach()` grouping by `_spoke_name` — that's the only place per-spoke revenue is computed, and it's inline.

---

### Brand Identity Data

Two-tier system already exists:

| Tier | Table | Fields | CRUD In | UI In |
|------|-------|--------|---------|-------|
| Basic | Supabase `branches` | name, slug, logo_url, primary_color, secondary_color, accent_color, font_family, tone, tagline, brand_keywords | `lib/supabaseService.ts:449-548` | `src/pages/Branches.tsx` (orphaned Registry) |
| Advanced | Supabase `brand_identities` | mission, values, target_audience, voice, color_palette (JSONB), typography (JSONB), marketing_hooks, image_prompt | `brandRepository.ts` | `BrandIntelligence.tsx` |
| Assets | Supabase `brand_assets` | logos, social mockups, banners per brand | `brandRepository.ts:236-292` | `BrandIntelligence.tsx` |

**Currently consuming brand colors:**
- `pages/Profiles.tsx` — `BranchBadge` component uses `branch.primary_color` for badge styling
- `components/UnifiedSproutifyUpdate.tsx` — hardcodes `#059669`, doesn't pull from branch

**Not yet consuming brand identity:** Campaign Builder, Social Hub, Reports — all could but don't.

---

### Demographics Per Spoke

| Feature | File | Reusable? |
|---------|------|-----------|
| Gender prediction (name-based + DB lookup) | `demographicsService.ts:144-177` | **Yes** — exported functions |
| Age prediction (behavior-based heuristic) | `demographicsService.ts:239-300` | **Yes** — exported functions |
| Gender/age distribution aggregation | `demographicsService.ts:344-419` | **Yes** — `getGenderDistribution()`, `getAgeDistribution()` |
| Auto-enrichment on fetch | `spokeConnector.ts:925-933` | Yes — happens inside `fetchEnrichedProfiles()` |

Demographics are already attached to every enriched profile as `_predicted_demographics`. No per-spoke demographic rollup exists yet, but it's trivial since each profile has `_spoke_name` + `_predicted_demographics`.

---

### Sync / Health / Freshness

| Indicator | Where | Stored |
|-----------|-------|--------|
| Connection status (active/error/disconnected) | `Branches.tsx:193-195` | localStorage via `SpokeConnection.status` |
| Last tested timestamp | `Branches.tsx:285-286` | `SpokeConnection.last_tested_at` |
| Last error message | `Branches.tsx:290-294` | `SpokeConnection.last_error` |
| Test/reconnect handlers | `Branches.tsx:69-141` | Updates localStorage |

**No continuous monitoring** — freshness is manual "test connection" only. No background heartbeat or auto-refresh.

---

## The Duplication Problem

At least 4 pages independently call `fetchEnrichedProfiles()` and then re-derive the same aggregates inline:

| Metric | Dashboard | Reports | Profiles | CustomerIntel | Branches |
|--------|-----------|---------|----------|---------------|----------|
| Profiles per spoke | Yes | Yes | — | — | Yes |
| Total revenue | Yes | Yes | Yes | Yes | — |
| LTV tiers | — | Yes | — | Yes | — |
| Order counts | Yes | Yes | Yes | Yes | — |
| Repeat vs one-time | — | Yes | — | Yes | — |
| AOV | — | — | Yes | Yes | — |
| Gender distribution | — | Yes | — | Yes | — |

Every page calls `fetchEnrichedProfiles()` independently, then does its own `useMemo` grouping. There's no shared hook or service that pre-computes "branch-level stats."

---

## What's Actually Missing (Would Need to Be Built)

1. **A shared `useBranchStats()` hook or service** — to compute per-branch aggregates once and share them. Right now every page reinvents this wheel.

2. **Per-spoke demographic rollup** — gender/age distribution broken down by branch. The data is there on each profile, nobody groups it by spoke yet.

3. **Brand identity <-> spoke connection mapping** — the `branches` table and `SpokeConnection` objects aren't linked. A branch in the Registry has a `slug`; a spoke connection has a `name` and `supabase_url`. There's no foreign key or explicit mapping between them.

4. **Data freshness beyond "last tested"** — no "last synced" timestamp for when data was actually pulled, no staleness warnings, no background health checks.

5. **Cross-branch trend data** — everything is point-in-time snapshots. No historical tracking of "Branch X had 5k profiles last month, 10k this month."

---

## Recommended Approach

The Branch Command Center wouldn't need to invent much new data — it would mostly need to **consolidate** what's already being computed in 5 different places. The real architectural win would be extracting a shared `useBranchStats()` hook that calls `fetchEnrichedProfiles()` once and derives all per-branch aggregates (profiles, revenue, orders, demographics, health) in one pass. Then the Branch Command Center, Dashboard, Reports, and Profiles pages could all consume from the same source instead of each doing their own version.

The one genuine gap is linking spoke connections to branch identities in the Registry — those are two separate concepts right now with no explicit relationship.
