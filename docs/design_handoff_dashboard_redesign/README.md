# Handoff: Dashboard Redesign (`Dashboard.tsx`)

## Overview

Replace the current Trellis Overview page with a **tabbed dashboard**: three views — **Control Room** (default), **Morning Standup**, and **Branch Board** — sharing one header, one branch scope, and one time window.

The current page is being retired. It is a stats museum: four vanity counters, a hardcoded AI briefing, a duplicated branch-health panel, and the only genuinely actionable content (overdue posts) buried two-thirds down. It also surfaces roughly 4 of the app's 24 modules.

The redesign answers one question every morning: *what is the state of my five branches, and what should I do about it today?*

**Sage is removed from this page entirely.** No briefing panel, no "Strategic Action Required" banner, no "Strategic Dialogue" card. The floating `SageChat` widget from `Layout.tsx` stays as-is — it is not part of this page.

## About the design files

`Trellis Dashboard.dc.html` in this bundle is a **design reference created in HTML** — a prototype showing intended look and behavior. It is not production code to copy.

The task is to **recreate this design inside the existing Sproutify Trellis codebase**, in `pages/Dashboard.tsx`, using the project's established patterns:

- React 19 + TypeScript, functional components
- TailwindCSS utility classes (CDN build; theme extended in `index.html`)
- `lucide-react` for icons
- Existing services in `services/` and `lib/supabaseService.ts` for data
- Props threaded from `App.tsx`, exactly as `Dashboard.tsx` receives them today

The prototype uses inline styles and CSS-masked SVGs because of its own authoring constraints. **In the real codebase, use Tailwind classes and `lucide-react` components.** The icon names in the prototype map 1:1 to `lucide-react` imports (see Assets).

Open the file in a browser to click through the tabs.

## Fidelity

**High-fidelity.** Colors, typography, spacing, and layout are final. Recreate pixel-for-pixel using Tailwind classes and the theme tokens already defined in `index.html`. Copy is final too — use it verbatim; it was written to be honest about what the system knows.

The prototype renders at a 1440px-wide frame with a 256px sidebar, i.e. a 1184px content area. That is the design width. Responsive rules are in **Responsive behavior** below.

---

## Data honesty — read this before you build

Per `docs/APP_AUDIT_2026-08.md`, real and fabricated data currently sit side by side with identical styling. **This redesign only uses data the audit confirms is live.** Do not reintroduce mocked values.

**Live — safe to render:**

| Data | Source |
|---|---|
| Federated profile counts, orders, revenue per spoke | `branchStats` prop (`hooks/useBranchStats.ts`) |
| Published-post history | `getPublishedPosts()` in `lib/supabaseService.ts` (`marketing_events`, `event_type='social_publish'`) |
| Scheduled / overdue posts | `scheduledPosts` prop + `services/scheduledPostService.ts` |
| Facebook & Instagram follower counts, reach | `fetchBrandInsights()` in `services/metaInsightsService.ts` |
| Spoke connection status & `last_tested_at` | `spokeConnections` prop |
| Recent orders | `fetchAllSpokesOrders()` in `spokeConnector.ts` |
| Recent marketing events | `fetchRecentEvents()` in `lib/supabaseService.ts` |
| Post performance | `services/socialInsightsService.ts` |
| Ad performance | `services/adPerformanceService.ts` |
| Campaign email stats | `services/emailReportingService.ts` |
| Branch records, colors, slugs | `branches` prop |

**Mocked — must NOT appear:**

- `MOCK_BRIEFING` (`constants.ts:1430`) — the entire Sage Strategic Pulse
- `pendingApprovalsCount = 2` — the Strategic Action Required banner
- `MOCK_TICKETS` / Support Hub counts — no backend exists
- `churn_risk` (hardcoded `'minimal'`, `App.tsx:241`) and `engagement_score` (renders as `85%` for everyone, `Profiles.tsx:873`)
- "Ecosystem Harmony: Active" — a static string

**Rule:** if a panel cannot be backed by a live query, do not ship it. If you must ship a placeholder, mark it visibly as a stub. Every number on this page should be traceable to a source in the table above.

**Empty states are required, not optional.** A new tenant has zero branches, zero posts, zero connections. Every list below needs a designed empty state (specified per component).

---

## Shared shell

All three tabs render inside the same shell. Only the content region swaps.

### Page header

Lives in `Layout.tsx` today; the dashboard adds a control cluster on the right.

- Background `#FFFFFF`, bottom border `1px solid #E5E7EB`, padding `14px 32px`
- Flex row, `justify-content: space-between`, `align-items: center`

**Left:**
- `<h2>` "Overview" — 19px / 600 / `#111827`
- Timestamp — `JetBrains Mono` 12px / 400 / `#9CA3AF`, format `SUN 02 AUG · 07:14`, uppercase. Render from `new Date()`; update on refresh.

**Right cluster** (flex, `gap: 10px`):
1. **Branch scope picker** — existing component from `Layout.tsx`. Restyle: background `#F3F4F6`, border `1px solid #E5E7EB`, radius `8px`, padding `7px 14px`, 13px / 600 / `#374151`. `GitBranch` 15px `#059669` leading, `ChevronDown` 14px `#9CA3AF` trailing. Label `All Branches (5)` or `3 of 5 Branches`.
2. **Time-window toggle** — two segments, `7d` / `30d`. Active: `#111827` bg, `#FFF` text. Inactive: `#FFF` bg, `1px solid #E5E7EB`, `#6B7280` text. Both `7px 12px`, radius `7px`, 12px / 600. **Default `7d`.** Drives all `· 7d` metrics and the "vs prior week" comparisons.
3. **System status pill** — only when something is degraded. Background `#FEF2F2`, border `1px solid #FECACA`, radius `8px`, padding `7px 12px`. 6px `#EF4444` dot + `2 systems degraded` at 12px / 700 / `#B91C1C`. Count = failing webhooks + errored spokes + stale spokes. When everything is healthy, render the green variant: `#ECFDF5` / `#A7F3D0` / `#047857`, `All systems healthy`. Clicking it switches to Control Room and scrolls to System health.

### Tab bar

Directly below the header. Background `#FFFFFF`, bottom border `1px solid #E5E7EB`, padding `0 32px`, flex, `gap: 28px`.

Each tab: padding `14px 2px`, 13px / 700, `cursor: pointer`, `border-bottom: 2px solid`.

| State | Text | Underline |
|---|---|---|
| Active | `#0B4A6B` | `#0B4A6B` |
| Inactive | `#6B7280` | `transparent` |
| Hover (inactive) | `#374151` | `#E5E7EB` |

**Order: Control Room · Morning Standup · Branch Board.**

Each tab carries a count badge — radius `999px`, padding `2px 7px`, 10px / 800:

| Tab | Badge | Colors |
|---|---|---|
| Control Room | today's event count | `#F1F5F9` bg / `#64748B` text |
| Morning Standup | open queue items | `#FEF3C7` bg / `#B45309` text — falls back to the neutral pair when zero |
| Branch Board | branch count | `#F1F5F9` bg / `#64748B` text |

Content region: padding `22px 28px`, background `#F6F7F9`.

### Sidebar

Unchanged — keep `Layout.tsx` exactly as it is. Included in the prototype only for context. Note that its default state is Audience + Campaigns expanded, everything else collapsed; the prototype reproduces this faithfully. Do not modify it.

---

## Tab 1 — Control Room (default)

**Purpose:** the day at a glance. What already happened, what is queued, what is broken.

**Layout:** CSS grid, `grid-template-columns: 1fr 330px`, `gap: 20px`.

### Left column (flex column, `gap: 18px`)

#### Branch strip

`grid-template-columns: repeat(5, 1fr)`, `gap: 12px`. One tile per branch, in descending revenue order.

Tile: `#FFF`, `1px solid #E5E7EB`, radius `10px`, padding `14px`, flex column, `gap: 9px`.
- **Row 1:** 8px branch-color square (radius `2px`, from `branch.primary_color`) · short name 12px / 700 / `#111827`, truncated · status dot 7px, `margin-left: auto`
- **Row 2:** revenue, `JetBrains Mono` 22px / 600 / `#111827`, `letter-spacing: -0.03em`, abbreviated (`$48.2k`)
- **Row 3:** `{n} profiles` 11px / `#6B7280` + delta 11px / 600 / `#059669` (or `#DC2626` when negative)

Status dot colors — reuse the existing `getFreshness()` logic in `Dashboard.tsx`:

| Condition | Color | Label |
|---|---|---|
| Active, synced < 24h | `#10B981` | Healthy |
| Active, 24–48h | `#F59E0B` | Aging |
| Active, > 48h | `#F59E0B` | Stale |
| Error | `#EF4444` | Down |
| Disconnected | `#94A3B8` | Offline |

Click → sets branch scope to that branch alone.

**Empty state:** if `spokeConnections.length === 0`, replace the whole strip with a single full-width card: `Database` icon 28px `#CBD5E1`, "No branches connected yet" 14px / 700 / `#475569`, "Connect a spoke to see profiles, orders and revenue here." 12px / `#94A3B8`, and a `#0B4A6B` button "Connect your first spoke" → `onViewChange('branches')`.

#### Today timeline — the centerpiece

`flex: 1`, `#FFF`, `1px solid #E5E7EB`, radius `12px`, padding `22px`, flex column, `gap: 16px`.

**Header row:** "Today across the ecosystem" 15px / 700 / `#111827`; beside it `JetBrains Mono` 11px / `#9CA3AF` reading `9 EVENTS · 4 SCHEDULED · 2 FAILED`. Right: "Full activity log →" 12px / 600 / `#1E698F`.

**Rows** — one per event, chronological, spanning past and future in a single list:

Grid of four parts:
1. **Time gutter** — 52px, right-aligned, `JetBrains Mono` 11px / `#9CA3AF`, `HH:MM` 24-hour
2. **Rail** — 15px wide: 1px `#E5E7EB` vertical line, interrupted by a 9px status dot with a 2px `#FFF` ring. Line is continuous between rows; first row's line starts at the dot, last row's ends at it.
3. **Body** — flex row, `gap: 12px`, padding `9px 0`: 7px branch square · branch name 11px / 600 / `#6B7280`, fixed 100px, truncated · event text 13px / `#1F2937`, `flex: 1`, single line, ellipsis
4. **Chip + action** — state chip then action link 11px / 700 / `#1E698F`, fixed 78px, right-aligned

State chips — `JetBrains Mono` 10px / 600, `letter-spacing: 0.06em`, uppercase, padding `3px 8px`, radius `5px`:

| State | Dot | Background | Text | Action | Source |
|---|---|---|---|---|---|
| Posted | `#10B981` | `#ECFDF5` | `#047857` | — | published posts |
| Synced | `#10B981` | `#ECFDF5` | `#047857` | — | spoke sync / meta insights |
| Queued | `#0EA5E9` | `#F0F9FF` | `#0369A1` | Preview | scheduled posts, future |
| Waiting | `#F59E0B` | `#FFFBEB` | `#B45309` | Approve | render jobs awaiting approval |
| Error | `#EF4444` | `#FEF2F2` | `#B91C1C` | Fix | failed events |
| At risk | `#EF4444` | `#FEF2F2` | `#B91C1C` | Reroute | scheduled to a platform whose publisher is down |
| Empty | `#94A3B8` | `#F8FAFC` | `#64748B` | Draft | branch with nothing scheduled |

**"At risk" is the highest-value row on this page.** A post scheduled to a platform whose webhook returns 404 will silently fail and be marked sent (audit §2.5, §4.1). Cross-reference each scheduled post's platform against webhook health and flag it *before* it fires.

**Empty state:** `CalendarDays` 28px `#CBD5E1`, "Nothing scheduled or published today" 14px / 700 / `#475569`, "Quiet day. Draft something in Creative Studio or Post Scheduler." 12px / `#94A3B8`, plus a link to Post Scheduler.

### Right column (flex column, `gap: 14px`)

#### System health

Background `#FEF2F2`, border `1px solid #FECACA`, radius `12px`, padding `18px`, flex column, `gap: 12px`.

Header: `ShieldAlert` 16px `#DC2626` · "System health" 13px / 700 / `#991B1B` · right `JetBrains Mono` 10px / `#B91C1C` `2 DOWN · 1 STALE`.

Rows (bottom border `1px solid rgba(220,38,38,0.12)`, `padding-bottom: 10px`):
- Line 1: 6px status dot · service name `JetBrains Mono` 11px / `#1F2937`, truncated · status code `JetBrains Mono` 10px / 600, colored by the dot
- Line 2: detail 11px / `#6B7280`, `padding-left: 14px`, `line-height: 1.45`

Monitor at minimum:
- The six webhooks the app calls that return 404 (audit §4.1): `trellis-tiktok-publish`, `trellis-video-ad-render`, `trellis-clip-publish`, `trellis-music-generate`, `reddit-post-comment`, `reddit-review-stage`
- Each spoke connection's status and freshness
- Resend dispatch health from `campaign_email_stats`

Codes: `OK` `#10B981` · `STALE` `#F59E0B` · `404` / `ERROR` `#EF4444`.

**Healthy state:** swap the card to `#F0FDF4` / `#A7F3D0`, `CheckCircle2` `#059669`, "All systems healthy" `#065F46`, and list each service with an `OK`.

#### Queue · needs a person

`#FFF`, `1px solid #E5E7EB`, radius `12px`, padding `18px`, `gap: 13px`. Top 4 items; header right shows `See all {n}` 11px / 700 / `#1E698F` → switches to Morning Standup.

Row: 4px full-height severity bar (radius `99px`) · title 12px / 700 / `#1F2937`, `line-height: 1.35` · meta `{branch} · {age}` 11px / `#9CA3AF` · action 11px / 700 / `#1E698F`.

#### 7-day totals

`#FFF`, `1px solid #E5E7EB`, radius `12px`, padding `18px`, `gap: 12px`. Header "7-day totals" 13px / 700 / `#111827` — label follows the time-window toggle (`30-day totals` when set to 30d).

Rows, baseline-aligned: value `JetBrains Mono` 17px / 600 / `#111827`, fixed 74px · label 11px / `#6B7280`, `flex: 1` · delta 11px / 600, `#059669` up / `#DC2626` down.

Four metrics: **Revenue · 7d**, **Posts published**, **New profiles**, **Email opens** (with bounce count).

---

## Tab 2 — Morning Standup

**Purpose:** work the list. Everything needing a human, ranked by the cost of ignoring it.

**Layout:** grid, `grid-template-columns: 1fr 340px`, `gap: 20px`, `align-content: start`.

### Left column

#### Section header

"Needs you today" 12px / 900, `letter-spacing: 0.16em`, uppercase, `#334155`. Right: "Ranked by cost of ignoring" 11px / 600 / `#94A3B8`.

#### Queue rows

`#FFF`, `1px solid #E5E9EE`, radius `12px`, padding `16px 18px`, flex row, `align-items: center`, `gap: 16px`.

1. **Severity bar** — 4px wide, full height, radius `99px`
2. **Severity block** — 74px: label `JetBrains Mono` 10px / 600, `letter-spacing: 0.08em`, uppercase, in the severity color; below, age 10px / 600 / `#94A3B8`
3. **Body** — `flex: 1`, `gap: 4px`: branch line (8px branch square + name 11px / 700 / `#64748B`) · title 14px / 700 / `#0F172A`, `letter-spacing: -0.01em` · detail 12px / `#64748B`, `line-height: 1.45`
4. **Actions** — primary button (`#0F172A` bg, `#FFF` text, 11px / 800, `letter-spacing: 0.06em`, uppercase, padding `9px 15px`, radius `8px`; hover `#1E698F`) + "Snooze" (`1px solid #E2E8F0`, `#94A3B8`, padding `9px 12px`)

Severity ladder — sort order and colors:

| Rank | Severity | Color | Meaning |
|---|---|---|---|
| 1 | Blocking | `#DC2626` | Data is wrong or content is silently failing |
| 2 | Overdue | `#EA580C` | Past its scheduled date |
| 3 | Stale | `#D97706` | Data may be out of date |
| 4 | Waiting | `#1E698F` | Finished work awaiting approval |
| 5 | Idle | `#64748B` | A gap worth filling |

Within a severity, sort oldest first.

**Generate items from live signals:**

| Trigger | Severity | Title | Action → |
|---|---|---|---|
| Spoke `status === 'error'` | Blocking | `{Branch} spoke connection is erroring` | Re-test → `branches` |
| Webhook 404 with posts routed to it | Blocking | `{Platform} publishing has failed {n} times` | Open flows → `automations` |
| Scheduled posts before today, unpublished | Overdue | `{n} posts are past their scheduled date` | Review → `social-hub` |
| `last_tested_at` > 48h | Stale | `{Branch} spoke last synced {age}` | Sync (inline `branchStats.refresh()`) |
| Render jobs complete, unapproved | Waiting | `{n} clips finished rendering` | Approve → `clip-studio` |
| Branch with no posts in ≥ 7 days | Idle | `{Branch} has not posted in {n} days` | Draft → `post-scheduler` |

**Snooze** hides an item for 24h. Persist per user — a `dashboard_snoozes` table on the Hub keyed by `(user_id, item_key, snoozed_until)`. `item_key` must be stable and derived from the item's identity (e.g. `spoke-error:{connection_id}`), not its index. Do not use localStorage; the audit already flags device-local state as a recurring problem (Tasks, §2.8).

**Empty state — this one matters, it will be the goal.** Centered, `padding: 48px 0`: `CheckCircle2` 40px `#10B981`, "Nothing needs you right now" 16px / 700 / `#0F172A`, "All spokes healthy, nothing overdue, nothing waiting on approval." 13px / `#64748B`. Then the "What worked" card below it, unchanged.

#### What worked · last 7 days

`#FFF`, `1px solid #E5E9EE`, radius `12px`, padding `20px`, `margin-top: 6px`. Header "What worked · last 7 days" 13px / 800 / `#0B4A6B`; right "Post Performance →" 11px / 700 / `#1E698F`.

Two cards, `grid-template-columns: 1fr 1fr`, `gap: 14px`:

| | Top performer | Underperformed |
|---|---|---|
| Border | `#D1FAE5` | `#FDE68A` |
| Background | `#F0FDF4` | `#FFFBEB` |
| Eyebrow | `#059669` | `#B45309` |

Each: 52px square thumbnail (radius `8px`) + eyebrow 10px / 900, `letter-spacing: 0.12em`, uppercase · post title 13px / 700 / `#0F172A` · meta `{Branch} · {Platform} · {eng}% eng · {reach} reach` 11px / `#475569`.

Thumbnail = the post's real image from `image_urls`. When absent, use a striped placeholder: `repeating-linear-gradient(135deg, {tint}, {tint} 5px, {light} 5px, {light} 10px)`.

Best and worst by engagement rate over the window, from `services/socialInsightsService.ts`. **Requires ≥ 3 posts in the window** — below that, hide the card entirely rather than declaring a winner from a sample of one.

### Right column (flex column, `gap: 14px`)

Three cards, all `#FFF` / `1px solid #E5E9EE` / radius `12px` / padding `18px`, headers 13px / 800 / `#0B4A6B`:

1. **This week** — same four metrics as Control Room's totals; header right "vs prior week" 11px / 700 / `#94A3B8`. Values `JetBrains Mono` 18px / 600 / `#0B4A6B`, fixed 76px.
2. **Branches at a glance** — per branch: 24px rounded-square avatar (radius `7px`, `branch.primary_color`, white initial 11px / 800) · name 12px / 700 / `#111827` with its next-action note 11px in the note's tone below · 7px status dot right.
3. **Pipelines running** — per job: 7px dot · name 12px / 600 / `#334155` · state `JetBrains Mono` 11px / 600 in the dot color (`OK`, `2 RUNNING`, `404`).

---

## Tab 3 — Branch Board

**Purpose:** compare branches side by side and pick one to work on.

**Layout:** single column, `gap: 18px`.

### Alert bar

Only when the queue is non-empty. `#FFF7ED`, `1px solid #FED7AA`, radius `10px`, padding `14px 18px`, flex row, `gap: 14px`.

8px `#EA580C` dot · `{n} items need a person today` 14px / 700 / `#7C2D12` · summary 13px / `#9A3412` (top three reasons, ` · ` separated) · right, "Work the list" button, `#EA580C` bg, `#FFF`, radius `7px`, padding `8px 14px`, 12px / 700 → switches to Morning Standup.

### Branch grid

`grid-template-columns: repeat(3, 1fr)`, `gap: 16px`. One card per branch, then a summary card in the final cell.

**Branch card** — `#FFF`, `1px solid #E5E7EB`, radius `10px`, `overflow: hidden`:

- **Accent bar** — 3px, full width, `branch.primary_color`
- **Body** — padding `18px`, flex column, `gap: 14px`:
  - **Identity row:** 34px rounded-square avatar (radius `8px`, branch color, white initial 14px / 700 — or `logo_url` when present) · name 15px / 700 / `#111827`, `letter-spacing: -0.01em` · host `JetBrains Mono` 11px / `#9CA3AF` · right: 7px status dot + status label 11px / 600 in the dot color
  - **Metric grid:** `repeat(2, 1fr)`, `gap: 12px 10px`. Value 19px / 700 / `#111827`, `letter-spacing: -0.02em`; label 11px / `#6B7280` with inline delta 11px / 600 / `#059669`. Four metrics: **profiles** (+delta), **revenue · 7d**, **followers** (+delta), **posts · 7d**
  - **Sparkline:** 12 bars, `height: 34px`, `gap: 3px`, `align-items: flex-end`, each `flex: 1`, radius `2px 2px 0 0`, `branch.primary_color` at `opacity: 0.35`. Daily revenue over the window, normalized per card. Fewer than 12 days of history → render the days you have, left-aligned.
  - **Next action:** top border `1px solid #F3F4F6`, `padding-top: 12px`. Eyebrow "NEXT ACTION" 10px / 700, `letter-spacing: 0.1em`, uppercase, `#9CA3AF`; below, the note 12px / 600 in its tone (`#B91C1C` blocking, `#B45309` warning, `#047857` positive). Right: a one-word button — `#111827` bg, `#FFF`, radius `7px`, padding `7px 12px`, 11px / 700 (`Re-test`, `Fix`, `Review`, `Draft`, `Schedule`)

Card click (outside the button) sets branch scope to that branch.

**Summary card** — same shell, padding `18px`, `gap: 14px`. "All branches" 15px / 700 / `#111827`. A 2×2 metric grid (same four totals), then a top-bordered pipeline list identical to Morning Standup's third card, pushed down with `margin-top: auto`.

**Empty state:** same connect-a-spoke card as Control Room, spanning the grid.

---

## Interactions & behavior

**Tabs** — instant swap, no transition. Persist the selection in the URL (`?tab=control|standup|board`) so a reload or a shared link lands on the same view. Fall back to `control`.

**Cross-tab links** — "See all {n}", "Work the list", and the system-status pill all switch tabs. Each is a real control: `<button>`, keyboard-focusable, with a visible focus ring (`2px solid #1E698F`, `offset 2px`).

**Branch scope** — clicking a branch tile or card calls `branchContext.setActiveBranchSlugs([branch.slug])`. Every metric on every tab respects the active scope. When scope is not "all", show a small "Viewing 1 of 5 branches · Clear" affordance next to the page title.

**Time window** — `7d` / `30d` drives all windowed metrics and comparisons. Persist per user alongside the tab.

**Inline actions** — `Mark posted`, `Approve`, `Sync`, `Snooze` act in place with optimistic UI and a rollback toast on failure. Everything else navigates via `onViewChange`.

**Refresh** — one refresh control in the header, not per panel. Spins while any fetch is in flight. Each card shows its own skeleton; a slow spoke must not block the whole page.

**Hover** — cards lift border to `#CBD5E1`; rows tint to `#F9FAFB`; buttons darken one step. Transition `150ms ease`.

**Loading** — skeletons matching each card's real dimensions, `#E5E7EB` at 60% opacity, `animate-pulse`. Never a full-page spinner.

**Errors** — a failed fetch degrades one card, not the page: inline `AlertTriangle` 16px `#B45309`, "Couldn't load {thing}" 12px / 600 / `#78716C`, and a Retry link. Log to console. Never render a zero where a fetch failed — zero and unknown are different, and conflating them is exactly the failure mode the audit describes.

**Responsive** — below 1280px, Control Room and Morning Standup collapse to one column with the right rail moving beneath; the branch strip goes `repeat(3, 1fr)` then wraps. Below 1024px, Branch Board goes to 2 columns, then 1 below 768px. The tab bar scrolls horizontally rather than wrapping.

---

## State management

Local to `Dashboard.tsx`:

```ts
type Tab = 'control' | 'standup' | 'board';
type Window = '7d' | '30d';

const [tab, setTab] = useState<Tab>(initialTabFromUrl());
const [window, setWindow] = useState<Window>('7d');
const [snoozed, setSnoozed] = useState<Record<string, string>>({});   // item_key → ISO expiry
const [isRefreshing, setIsRefreshing] = useState(false);
```

Derive with `useMemo`, do not store:

- `queue` — from `spokeConnections`, `scheduledPosts`, webhook health, and render jobs; filtered by `snoozed`, sorted by the severity ladder
- `timeline` — merge published posts, scheduled posts, sync events and job events; sorted by time; "at risk" computed by joining scheduled posts against webhook health
- `branchCards` — join `branches` × `branchStats.spokeStats` × `metaInsights` × per-branch post counts
- `weekTotals` — aggregate over the active window, with prior-window deltas
- `systems` — webhook probes + spoke freshness + Resend stats

Data fetching: keep the existing prop-drilled model (`branchStats`, `spokeConnections`, `branches`, `scheduledPosts` all arrive from `App.tsx`). Add two fetches this page needs:

1. **Webhook health** — a small probe, cached ~5 minutes. Do not probe on every render.
2. **Post performance top/bottom** — from `socialInsightsService`, scoped to the active window and branch scope.

Snoozes read/write `dashboard_snoozes` on the Hub. Enable RLS on that table from the start and scope it to `user_id = auth.uid()` — several existing tables shipped without it (audit §1).

---

## Design tokens

Existing theme (`index.html`, do not change):

```js
'yale-blue':        '#0B4A6B'   // primary, sidebar, headings
'blue-slate-2':     '#3A5B6D'
'blue-slate':       '#38647A'
'cornflower-ocean': '#1E698F'   // links, accents
'cerulean':         '#4B7B94'
```

Neutrals (Tailwind defaults, as used):

```
#FFFFFF  card surface
#F6F7F9  page background
#F3F4F6  control background
#F1F5F9  badge background
#E5E7EB  border
#E5E9EE  border, Morning Standup cards
#9CA3AF  muted text
#6B7280  secondary text
#374151  body text
#1F2937  strong body text
#111827  headings
```

Status:

```
#10B981 / #ECFDF5 / #047857 / #A7F3D0   healthy
#F59E0B / #FFFBEB / #B45309 / #FDE68A   warning
#EF4444 / #FEF2F2 / #B91C1C / #FECACA   error
#0EA5E9 / #F0F9FF / #0369A1             queued
#94A3B8 / #F8FAFC / #64748B             idle
#EA580C / #FFF7ED / #7C2D12 / #FED7AA   overdue
#DC2626                                  blocking
```

Branch colors come from `branch.primary_color`. Fallback `#64748B`.

Typography — Inter throughout; JetBrains Mono for numbers, timestamps, service names, and status codes.

```
26px / 800 / -0.02em    page greeting
19px / 600              page title
15px / 700 / -0.01em    card titles, branch names
14px / 700 / -0.01em    queue titles
13px / 700              section headers, tabs
13px / 400              body
12px / 700              meta, labels
11px / 600              secondary meta
10px / 900 / 0.12em     uppercase eyebrows
```

Mono: 22px/600 (branch revenue) · 19px/600 · 17px/600 (totals) · 11–12px/400–600 (timestamps, codes).

Spacing — 4px base: `3 4 7 9 10 12 14 16 18 20 22 28 32`.

Radii — `2px` swatches · `5px` chips · `7px` small buttons · `8px` controls, avatars · `10px` tiles · `12px` cards · `99px` pills.

Shadows — none on cards; borders only. Sidebar keeps its existing treatment.

**Note on the existing style.** The current page uses `rounded-[2.5rem]` (40px) and `font-black uppercase tracking-widest` on nearly every label. The redesign deliberately pulls both back — 12px radii and normal-weight labels — so density reads as calm rather than shouty. This is intentional; please carry it through.

---

## Assets

**Icons** — `lucide-react`, already a dependency. The prototype uses CSS-masked SVGs vendored from `lucide-icons/lucide`; in the codebase use the React components.

Sidebar (existing, unchanged): `LayoutDashboard`, `BarChart3`, `Users`, `Layers`, `GitBranch`, `Rocket`, `Send`, `Mail`, `Wand2`, `CheckSquare`, `Share2`, `MessageCircle`, `Sparkles`, `CalendarClock`, `LayoutTemplate`, `TrendingUp`, `Award`, `Film`, `Music`, `Clapperboard`, `Dna`, `Palette`, `Plug`, `Workflow`, `Code2`, `UserCog`, `BookOpen`, `Sprout`.

Dashboard: `GitBranch`, `ChevronDown`, `ShieldAlert`, `AlertTriangle`, `CheckCircle2`, `CalendarDays`, `Clock`, `RefreshCw`, `Loader2`, `Database`, `ArrowRight`, `TrendingUp`, `Users`, `Send`.

Icon sizes: 14–16px inline, 20px nav, 28px empty states, 40px the "all clear" state.

Platform icons come from `PLATFORM_ICONS` in `utils.ts` — do not substitute.

**Images** — post thumbnails from each post's `image_urls`. No decorative imagery anywhere on this page.

**Fonts** — Inter and JetBrains Mono, already loaded in `index.html`.

---

## Files

**In this bundle:**
- `Trellis Dashboard.dc.html` — the interactive prototype. Open in a browser; the tabs work.
- `screenshots/01-control-room.png`, `02-morning-standup.png`, `03-branch-board.png` — each tab at 2× (1440px design width).
- `icons/` — the lucide SVGs the prototype references. Not needed in the app; `lucide-react` covers it.

Note: each tab's frame in the prototype is sized to its own content, so the three screenshots differ in height. In the real app all three fill the same viewport.

**To change in the codebase:**
- `pages/Dashboard.tsx` — full rewrite
- `components/Layout.tsx` — header control cluster only; leave the sidebar alone
- `App.tsx` — thread through any new props the queue needs

**To read first:**
- `docs/APP_AUDIT_2026-08.md` — §2 (fabricated data), §3 (dead UI), §4 (broken webhooks). This redesign is largely a response to it.
- `hooks/useBranchStats.ts` — the aggregate metric source
- `lib/supabaseService.ts` — `getPublishedPosts`, `fetchRecentEvents`
- `services/metaInsightsService.ts`, `services/socialInsightsService.ts`, `services/emailReportingService.ts`
- `spokeConnector.ts` — federated order/revenue fetch
- `utils.ts` — `timeAgo`, `SOCIAL_PLATFORM_META`, `PLATFORM_ICONS`

---

## Suggested build order

1. Shell — tab bar, URL persistence, header controls, time-window state. Ship with three empty panels.
2. Control Room branch strip — the simplest real data path, straight from `branchStats`.
3. System health — a webhook probe plus spoke freshness. Highest value per line; it makes silent failures visible for the first time.
4. Today timeline — merge published, scheduled, and job events. Add "at risk" last, once webhook health exists.
5. Queue generation — one derived function feeding both Morning Standup and the Control Room preview. Snooze after.
6. Branch Board — mostly a re-presentation of data you now have.
7. What worked — needs the ≥3-post guard and the per-window comparison.

Steps 1–4 alone replace the current page with something strictly more honest and more useful.
