# Social Credential Onboarding Runbook

How to connect a branch's Instagram/Facebook publishing credentials to Trellis,
**manually**, until the `social-oauth` Edge Function is fixed to do this automatically.

> **Why manual?** The OAuth "Connect" flow in BranchCommandCenter currently stores
> a *short-lived user token* with the account ID in the wrong place and (potentially)
> the wrong encryption key. Until that Edge Function is rewritten, every branch must be
> onboarded by hand using the steps below. This procedure is what was used to connect
> ATL Urban Farms on 2026-06-10 and is known to work end-to-end.

---

## What you need before starting

- Admin access to the branch's **Facebook Page** and the linked **Instagram Business account**
- The branch's Meta **App ID** and **App Secret** (App Dashboard → Settings → Basic)
- The branch's **UUID** from the `branches` table (NOT a domain slug like `atlurbanfarms.com`)
- The branch's **Facebook Page ID** and **Instagram Business Account ID**
- Access to the Trellis Hub Supabase SQL Editor (`horvjqqifgrzxesuxtfm`)
- PowerShell (Windows) for the token calls

> **Reference values for ATL Urban Farms** (example of a completed branch):
> - branch UUID: `11275551-e037-4c91-8eed-dd9662d55448`
> - App ID: `4336246873255158`
> - Facebook Page ID: `613693648665942`
> - Instagram Business Account ID: `17841409884536455`
> - Instagram username: `atlurbanfarms`

---

## Step 1 — Get a short-lived user token

1. Open the Graph API Explorer: `https://developers.facebook.com/tools/explorer/`
2. Set **Application** to the branch's app.
3. Make sure these permissions are granted before generating:
   - `instagram_basic`
   - `instagram_content_publish`
   - `pages_show_list`
   - `pages_read_engagement`
4. Click **Generate Access Token**, log in / authorize as the Page admin, and copy the token.

This token is short-lived (~1 hour). That's fine — it gets exchanged in Step 2.

---

## Step 2 — Exchange for a LONG-LIVED user token

> **This step is critical and is the one most easily skipped.** Skipping it produces a
> token that expires within a day. The whole point is to get a ~60-day user token so that
> the Page token derived from it (Step 3) never expires.

In PowerShell, fill in the short-lived token and the **App Secret** locally
(do NOT paste the App Secret into chat/email/anything shared):

```powershell
$shortToken = 'PASTE_SHORT_LIVED_TOKEN'
$appId      = 'BRANCH_APP_ID'
$appSecret  = 'PASTE_APP_SECRET_LOCALLY'

$resp = Invoke-RestMethod -Uri "https://graph.facebook.com/v21.0/oauth/access_token?grant_type=fb_exchange_token&client_id=$appId&client_secret=$appSecret&fb_exchange_token=$shortToken"
$resp | ConvertTo-Json
```

**Confirm `expires_in` is large** — roughly `5000000`+ seconds (~60 days),
NOT ~3600 (1 hour). If it's small, the exchange didn't work; stop and recheck.

---

## Step 3 — Pull the PAGE token from the long-lived user token

In the same PowerShell session (reuses `$resp`):

```powershell
$longToken = $resp.access_token
$pages = Invoke-RestMethod -Uri "https://graph.facebook.com/v21.0/me/accounts?fields=name,access_token&access_token=$longToken"
$pages.data | ConvertTo-Json
```

Find the entry whose `name` matches the branch's Page. Copy its `access_token` —
that's the **Page token**. Because it came from a long-lived user token, it does not expire.

---

## Step 4 — Verify the Page token (don't skip; confirm the date)

```powershell
$pageTok = 'PASTE_PAGE_TOKEN'
Invoke-RestMethod -Uri "https://graph.facebook.com/debug_token?input_token=$pageTok&access_token=$pageTok" | ConvertTo-Json -Depth 5
```

In the `data` object, confirm ALL of:
- `expires_at` = **`0`** (never expires). If it's a real timestamp, the token will die —
  go back to Step 2, you likely used a short-lived user token.
- `type` = **`PAGE`** (not `USER`). A USER token is the wrong type for publishing.
- `is_valid` = `true`
- `scopes` includes `instagram_content_publish`

> **Note on `data_access_expires_at`:** this is a *separate* ~90-day data-access review
> limit, NOT token expiry. It does not break publishing. Worth a calendar note to recheck,
> but it is not the same as `expires_at`.

---

## Step 5 — Store the token via `upsert_social_credential`

Run in the Trellis Hub Supabase SQL Editor. This single function handles encryption
(base64 + `get_encryption_key()`), sets `status='active'`, and writes the IG account ID
to `platform_user_id` — all the things that have to be correct.

**Instagram row:**

```sql
SELECT upsert_social_credential(
  p_branch_id := 'BRANCH_UUID',
  p_platform := 'instagram',
  p_access_token := 'PASTE_PAGE_TOKEN',
  p_app_id := 'BRANCH_APP_ID',
  p_platform_user_id := 'INSTAGRAM_BUSINESS_ACCOUNT_ID',
  p_platform_username := 'BRANCH_IG_USERNAME',
  p_platform_metadata := '{"instagram_business_account_id":"INSTAGRAM_BUSINESS_ACCOUNT_ID"}'::jsonb,
  p_status := 'active'
);
```

**Facebook row** (same Page token; needed for insights, and for FB publishing later):

```sql
SELECT upsert_social_credential(
  p_branch_id := 'BRANCH_UUID',
  p_platform := 'facebook',
  p_access_token := 'PASTE_PAGE_TOKEN',
  p_app_id := 'BRANCH_APP_ID',
  p_platform_user_id := 'FACEBOOK_PAGE_ID',
  p_platform_username := 'BRANCH_PAGE_NAME',
  p_status := 'active'
);
```

---

## Step 6 — Verify it reads back correctly

```sql
-- token should come back starting with the right prefix, status active, ID present
SELECT
  get_social_credential('BRANCH_UUID','instagram')->>'access_token' AS token,
  get_social_credential('BRANCH_UUID','instagram')->>'status' AS status,
  get_social_credential('BRANCH_UUID','instagram')->'platform_metadata'->>'instagram_business_account_id' AS ig_id;
```

You want: the real `EAA...` token, `active`, and the correct IG account ID.

Optional — confirm the active-tokens reader sees it:

```sql
SELECT branch_id, left(access_token,8) AS token_start, platform_user_id
FROM get_active_social_tokens('instagram');
```

---

## Step 7 — End-to-end publish test

Trigger a test publish (replace the branch_id; use a throwaway caption and a public image URL):

```powershell
$body = @{
  branch_id = "BRANCH_UUID"
  caption   = "Onboarding test — please ignore"
  image_url = "https://www.gstatic.com/webp/gallery/1.jpg"
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "https://n8n.sproutify.app/webhook/trellis-social-publish" -ContentType "application/json" -Body $body
```

Success returns `{ success: true, post_id: ... }`. Delete the test post from the feed afterward.
If it fails, open the n8n execution log for `trellis-social-publish` and read the failing node.

---

## Common failure modes (all seen during ATL setup)

| Symptom | Cause | Fix |
|---|---|---|
| `access_token` reads back `null` | Encrypted with wrong key, or raw (not base64) | Re-store via `upsert_social_credential` (handles both correctly) |
| Meta `code 190` "session expired" | Token is short-lived / not exchanged | Redo Step 2 (long-lived exchange) |
| Meta `type=USER` in debug_token | Stored the user token, not the Page token | Redo Step 3 (`me/accounts`) |
| Meta `(#200) Provide valid app ID` | n8n node sent GET instead of POST | Set the Meta nodes' HTTP method to POST |
| Meta `9004` "media could not be fetched" | Image URL not publicly fetchable / redirects | Use a direct public image URL |
| Workflow finds no credential | branch_id mismatch (slug vs UUID) | Use the branch **UUID** everywhere |
| `instagram_business_account_id missing` | `platform_metadata` empty / wrong key | Populate via Step 5 |

---

## Important reminders

- **Branch ID is always the UUID**, never a domain slug. The workflow and RPCs key on the UUID.
- **Instagram has no text-only posts** — every feed post needs an image. The UI enforces this; so should any direct webhook call.
- **The App Secret is the most sensitive value here** — it mints tokens. Only ever paste it into your own local terminal, never into shared tools.
- This whole procedure becomes unnecessary once the `social-oauth` Edge Function is rewritten
  to: do the long-lived exchange, store the Page token, write the account ID to
  `platform_user_id`, and use `get_encryption_key()` + base64. Until then, use this runbook.
