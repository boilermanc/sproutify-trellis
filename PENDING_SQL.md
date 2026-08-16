# Pending SQL

SQL that is written and reviewed but **not yet applied**. Run these by hand, then
move the section to the "Applied" list at the bottom with the date.

---

## 1. Sproutify Home — expose a consent-bearing customers view

**Target spoke:** `xzckfyipgrgpwnydddev` (project `tower_garden_community`) — the
home tower-gardener app. This is the branch `sproutify-home`, which today has **no
spoke connection at all**, which is why none of its 145 customers ever reached
Trellis.

**Why a view and not the raw table:** `public.profiles` on that spoke has no
newsletter opt-in column. Trellis's `mapFederatedConsent()` does
`profile.subscribed ?? true` — so mapping the raw table would import all 145
people as **assumed opted-in** (`consent_source: import_default`). The view turns
MailerLite list membership into an explicit boolean so consent is real.

**Opt-in rule (CONFIRM BEFORE RUNNING):** `mailerlite_group_id IS NOT NULL`
→ 78 of 145 opted in, 67 opted out. This is the only genuine mailing-list signal
on the table.

```sql
-- Run against tower_garden_community (xzckfyipgrgpwnydddev)
CREATE OR REPLACE VIEW public.trellis_home_customers AS
SELECT
  p.id,
  p.email,
  p.first_name,
  p.last_name,
  NULL::text                            AS phone,
  p.created_at,
  -- Explicit consent: on the MailerLite list = opted in. Anything else is a
  -- hard false, so Trellis records it as spoke_native rather than assuming.
  (p.mailerlite_group_id IS NOT NULL)   AS newsletter_subscribed,
  -- Classification tags Trellis can segment on later.
  ARRAY_REMOVE(ARRAY[
    CASE WHEN p.subscription_tier IS NOT NULL      THEN 'subscriber'    END,
    CASE WHEN p.trial_status = 'active'            THEN 'in-trial'      END,
    CASE WHEN p.onboarding_completed_at IS NOT NULL THEN 'onboarded'    END
  ], NULL)                              AS tags
FROM public.profiles p
WHERE p.email IS NOT NULL
  AND p.email <> '';

ALTER VIEW public.trellis_home_customers SET (security_invoker = true);
GRANT SELECT ON public.trellis_home_customers TO service_role;
```

**Then, in Trellis (no SQL — use the UI):**

1. Settings → Spokes → Add Connection. Name it `Sproutify Home`, URL
   `https://xzckfyipgrgpwnydddev.supabase.co`, service_role key from that
   project's API settings. **Clint enters the key — it must not be pasted into
   chat or committed.**
2. Configure the `customers` table as `trellis_home_customers` with this mapping:

   | Trellis field | Spoke column |
   |---|---|
   | `id` | `id` |
   | `email` | `email` |
   | `first_name` | `first_name` |
   | `last_name` | `last_name` |
   | `created_at` | `created_at` |
   | `subscribed` | `newsletter_subscribed` |
   | `tags` | `tags` |

3. Branch Command Center → Sproutify Home → set `spoke_connection_id` to the new
   connection. Without this the profiles arrive stamped with the connection
   *name* instead of the branch slug.

**Expected after connecting:** 145 profiles under `sproutify-home`, 78 targetable.

---

## 2. Sproutify Farm — stop importing suspended accounts as subscribers

**Target spoke:** `qffmtkmetkfysmqmughg` (project `sproutify_farm`), already
connected. Its `customers` table is mapped straight to `public.profiles` with
**no `subscribed` field**, so all 157 rows import as assumed-opted-in.

Two problems that mapping hides:

- **101 of 157 profiles are `profile_status = 'suspended'`** and another 28 are
  `is_active = false`. Only **28** are live users. All 157 are currently
  emailable from Campaign Builder.
- There is no marketing-consent column anywhere on that table.
  `notification_preferences` is populated for exactly **1** of 157 rows.

**Recommended (Option A — ship now):** exclude suspended/inactive accounts, and
treat an active app account as consent for product email. This is a
legitimate-interest call, not an explicit opt-in — **Clint's decision.**

```sql
-- Run against sproutify_farm (qffmtkmetkfysmqmughg)
CREATE OR REPLACE VIEW public.trellis_farm_customers AS
SELECT
  p.id,
  p.email,
  p.first_name,
  p.last_name,
  p.phone_number                        AS phone,
  p.created_at,
  -- No marketing-consent column exists on this table yet. Until one does, an
  -- active (non-suspended) account is the consent signal. Replace this
  -- expression with the real column the moment the Farm app ships one.
  TRUE                                  AS newsletter_subscribed,
  ARRAY_REMOVE(ARRAY[
    CASE WHEN p.ipm_subscription_plan IS NOT NULL THEN 'ipm-subscriber' END,
    CASE WHEN p.onboarding_completed  THEN 'onboarded' END
  ], NULL)                              AS tags
FROM public.profiles p
WHERE p.email IS NOT NULL
  AND p.email <> ''
  AND p.is_active = TRUE
  AND p.profile_status = 'active';

ALTER VIEW public.trellis_farm_customers SET (security_invoker = true);
GRANT SELECT ON public.trellis_farm_customers TO service_role;
```

**Option B (stricter, 1 recipient today):** swap the `TRUE` above for
`'email' = ANY(p.notification_preferences)`. Correct on consent grounds, but the
Farm app barely writes that column, so the audience is currently 1 person.
Pick B only alongside a plan to backfill `notification_preferences`.

**Then, in Trellis:** Settings → Spokes → Sproutify Farm → change the `customers`
table from `profiles` to `trellis_farm_customers`, and add the `subscribed` →
`newsletter_subscribed` and `tags` → `tags` mappings (neither exists today).

**Expected after repointing:** Sproutify Farm drops from 157 profiles to 28,
all with `consent_source: spoke_native` instead of `import_default`.

---

## 3. Longer term — a real opt-in column on both spokes

Both views above are adapters over a missing field. The durable fix is a
`marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE` column on each spoke's
`profiles` table, written by a checkbox at signup, with the views then reading it
directly. Not written here because it needs an app change on each spoke, not just
SQL.

---

## Applied

_(nothing yet)_
