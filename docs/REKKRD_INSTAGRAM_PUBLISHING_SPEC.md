# Spec: Instagram publishing without a Facebook Page (Instagram Login API)

> Handoff doc for implementing "Option B." Self-contained — assumes no prior conversation.

## Goal

Let a branch publish to Instagram **without requiring a linked Facebook Page.** Today, Trellis's Instagram integration uses the **Facebook Login** path, which forces every Instagram account to be a Business/Creator account **linked to a Facebook Page**. The `rekkrd` branch (Instagram `@rekkrdapp`) has no usable Facebook Page, so it can't publish. Rather than keep fighting Meta's Page requirement, migrate Instagram publishing to Meta's **"Instagram API with Instagram Login"** (a.k.a. Business Login for Instagram), which publishes directly to a Business/Creator IG account with **no Facebook Page involved**.

Non-goal: removing the existing Facebook-Login path. Branches already working that way (ATL Urban Farms, Rejoice) must keep working. This adds an alternate path, ideally auto-detected or selectable per branch.

## Why the current flow needs a Page (root cause)

Meta's classic Instagram Graph API resolves the target account like this:

```
Facebook Login token → GET /me/accounts (Pages) → page.instagram_business_account.id → POST /{ig-id}/media
```

No Page → no `instagram_business_account.id` → nothing to publish to. For `rekkrd`, `/me/accounts` returns `{"data": []}` (the authorizing FB user manages no Page with a linked IG), so the OAuth callback stores `platform_metadata = { note: "No Instagram Business Account found on connected pages" }` and the publisher fails at "missing instagram_business_account_id."

## What's already been done (context, don't redo)

- **`supabase/functions/social-oauth/index.ts`** — the Instagram metadata fetch was fixed to scan **all** granted Pages for a linked IG account (previously only checked `data[0]`). Deployed. This did **not** fix rekkrd because rekkrd has zero Pages — confirming the issue is architectural (Page requirement), not the code bug.
- Confirmed `upsert_social_credential` **merges** `platform_metadata` with jsonb `||` (old keys preserved), so reconnecting is non-destructive.

## The two paths (for reference)

- **Option A (no code):** create a throwaway Facebook Page, convert `@rekkrdapp` to Business/Creator, link them, reconnect. Works today. Rejected by the user as too painful / Meta-maze.
- **Option B (this spec):** migrate to Instagram Login API so no Page is ever needed.

---

## Current architecture (what to change)

### 1. OAuth — `supabase/functions/social-oauth/index.ts`
- `PLATFORM_CONFIGS.instagram` currently points at Facebook Login: `authorizeUrl: https://www.facebook.com/v21.0/dialog/oauth`, `tokenUrl: https://graph.facebook.com/v21.0/oauth/access_token`, scopes `instagram_basic, instagram_content_publish, instagram_manage_comments, instagram_manage_insights, pages_show_list, pages_read_engagement`.
- `fetchPlatformMetadata("instagram", ...)` queries `/me/accounts?fields=name,access_token,instagram_business_account`, finds a Page with an IG account, and returns `{ instagram_business_account_id, ig_user_id, page_id, page_name, page_access_token, username, ... }`.
- Tokens are stored via the `upsert_social_credential` RPC (see below). App creds are read via `get_social_credential`. Deployed with `--no-verify-jwt`.
- Callback closes a popup via `postMessage({ type: 'TRELLIS_OAUTH_SUCCESS', platform, branch_id })`.

### 2. Credential storage — Hub Supabase (`horvjqqifgrzxesuxtfm`)
Table `social_credentials` (key columns): `branch_id text`, `platform text`, `app_id text`, `app_secret_encrypted text`, `access_token_encrypted text`, `refresh_token_encrypted text`, `token_expires_at timestamptz`, `platform_metadata jsonb`, `granted_scopes jsonb`, `status text`, `is_valid bool`. Unique on `(branch_id, platform)`.

RPCs (all use `get_encryption_key()` internally — never pass an encryption key param; pgcrypto lives in the `extensions` schema):
- `upsert_social_credential(...)` — encrypts tokens with `pgp_sym_encrypt` + base64, **merges** `platform_metadata` via `||`.
- `get_social_credential(p_branch_id, p_platform)` — returns app_id + decrypted app_secret + `platform_metadata` + decrypted `access_token`.
- `get_social_credential_for_publish(p_branch_id, p_platform)` — decrypts the token for publishing.
- `get_active_social_tokens(p_platform)` — all active decrypted tokens (used by listeners/insights).

### 3. Publisher — `n8n-blueprints/B3-social-publisher-v2.json` ("Trellis: Instagram Publisher")
Webhook `trellis-social-publish`. Flow:
1. **Fetch Instagram Credentials** → calls `get_social_credential` RPC (returns `access_token` + `platform_metadata`).
2. **Extract & Normalize Request** → reads `platform_metadata.instagram_business_account_id` and `access_token`; **throws** `instagram_business_account_id missing from platform_metadata` if absent. Normalizes `media_type` (image | video | carousel) and `media_urls`.
3. Builds media container(s) on `graph.facebook.com/v21.0/{ig_account_id}/media` (image/REELS/CAROUSEL), then **Publish to Instagram** → `POST /{ig_account_id}/media_publish` with `creation_id`.
4. **Success Response** (respondWith:text, returns `{ success, post_id }`) → **Log Marketing Event** (`event_type='social_publish'`). Error path → **Error Response** → **Log Failure Event** (`event_type='social_publish_failed'`).
- The **caller** is `n8n-blueprints/S1-scheduled-post-publisher.json`, which POSTs to `trellis-social-publish` and reads the reply as **text** then `JSON.parse`s it, deciding `published | failed | needs_review`.
- App also calls it via `services/socialService.ts` `publishToSocial()`.

### 4. Other consumers of the IG account id (ripple effects — must not break)
- `n8n-blueprints/S2-instagram-insights-sync.json` and any `meta-insights` function read `instagram_business_account_id` and query `graph.facebook.com` insights.
- `test-social-connection` edge function validates the connection.
- Platform Setup UI: `pages/PlatformSetupWizard.tsx`, `pages/BranchCommandCenter.tsx` (opens the OAuth popup), `services/socialService.ts`.

---

## Option B — target design

Add an **Instagram Login** publishing path. IG account must be **Business or Creator** (Personal can't publish via any API), but **no Facebook Page**.

### Meta app setup (document for the operator; verify against current Meta docs)
- In the Meta app dashboard, add the **Instagram** product → **"Instagram API setup with Instagram login"** (Business Login). This exposes an **Instagram App ID** and **Instagram App Secret** that are **distinct** from the Facebook App ID/Secret.
- Configure the OAuth redirect URI to the same callback: `${SUPABASE_URL}/functions/v1/social-oauth/callback`.

### New OAuth flow (verify exact hosts/scopes/versions against Meta docs — these shift)
- **Authorize:** `https://www.instagram.com/oauth/authorize?client_id={IG_APP_ID}&redirect_uri={CALLBACK}&response_type=code&scope=instagram_business_basic,instagram_business_content_publish,instagram_business_manage_comments`
- **Token (short-lived):** `POST https://api.instagram.com/oauth/access_token` with `client_id, client_secret, grant_type=authorization_code, redirect_uri, code` → `{ access_token, user_id, permissions }`.
- **Exchange for long-lived (~60 days):** `GET https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret={IG_APP_SECRET}&access_token={short}` → `{ access_token, expires_in }`.
- **Refresh:** `GET https://graph.instagram.com/refresh_access_token?grant_type=ig_refresh_token&access_token={long}` (do before the 60-day expiry).
- **Identity:** `GET https://graph.instagram.com/me?fields=user_id,username&access_token={token}` → `user_id` is the IG-scoped id used for publishing.

### Publishing (Instagram Login variant)
- Host changes from `graph.facebook.com` to **`graph.instagram.com`**; account id is the **IG user id**, token is the **IG user token** (no page token).
- Image: `POST https://graph.instagram.com/v21.0/{ig-user-id}/media` (`image_url`, `caption`) → `{id}`; then `POST /{ig-user-id}/media_publish` (`creation_id`).
- Reels: `media_type=REELS`, `video_url`, poll container `status_code=FINISHED` before publish (same pattern as B3 today).
- Carousels: children with `is_carousel_item=true`, then a `CAROUSEL` container with `children`, then publish. Same shapes as current B3 — only host + id + token differ.

### Data model
Store, per Instagram-Login credential (via `upsert_social_credential` merge):
- `platform_metadata.ig_user_id` = the Instagram Login user id (the publish target).
- `platform_metadata.auth_variant = "instagram_login"` (so the publisher and OAuth can branch on it vs the existing `"facebook_login"`).
- `username`, `connected_at`.
- The long-lived IG token in `access_token_encrypted`; `token_expires_at` set to ~60 days.

**Decide how `app_id`/`app_secret` are stored:** the Instagram App ID/Secret differ from the Facebook App ID/Secret. Simplest: store the IG app creds on the same `social_credentials` row for `platform='instagram'` when a branch uses the Instagram-Login variant. The Platform Setup wizard needs a way to enter them (or reuse existing fields with a variant flag).

### Publisher changes (B3)
Make B3 handle both variants based on `platform_metadata.auth_variant`:
- If `instagram_login`: use `graph.instagram.com`, `ig_user_id`, IG user token.
- Else (default, `facebook_login`): current behavior (`graph.facebook.com`, `instagram_business_account_id`, page/user token).
- `Extract & Normalize` should accept **either** `ig_user_id` (instagram_login) **or** `instagram_business_account_id` (facebook_login) and only throw if **both** are missing.
- Keep the text-mode responders and the `social_publish` / `social_publish_failed` logging as-is.

### Token refresh
Instagram-Login long-lived tokens expire in ~60 days. Add a refresh path (a small pg_cron + edge function, or an n8n schedule) calling `refresh_access_token` for `auth_variant='instagram_login'` rows before expiry, updating `access_token_encrypted` + `token_expires_at`. (Facebook page tokens don't need this.)

### Insights ripple (scope decision needed)
Instagram-Login insights come from `graph.instagram.com/{ig-user-id}/insights`, not the Facebook Graph path S2 uses. Either (a) extend S2 to branch on `auth_variant`, or (b) explicitly defer insights for instagram_login branches in v1 and note it. Publishing is the priority; call this out rather than silently break insights.

## Acceptance criteria
- A branch with a Business/Creator IG account and **no Facebook Page** can connect Instagram in Trellis and publish an image, a Reel, and a carousel — verified end-to-end for `rekkrd`/`@rekkrdapp`.
- Existing Facebook-Login branches (ATL, Rejoice) still publish unchanged.
- `scheduled_social_posts` rows land `published` with a real `post_id` (not `needs_review`).
- A `social_publish` marketing_event is logged with the post id.
- Token refresh keeps an instagram_login connection alive past 60 days.

## Constraints / conventions (from the codebase)
- Edge functions are Deno; deploy `social-oauth` with `supabase functions deploy social-oauth --no-verify-jwt`.
- Never pass an encryption key to the RPCs — they use `get_encryption_key()`. pgcrypto is in the `extensions` schema.
- n8n Supabase access is via HTTP Request nodes with the service_role key in `apikey` + `Authorization` headers (the native node lacks raw SQL). Re-attach credentials after importing a workflow (they arrive dangling by name).
- Keep RLS enabled; `social_credentials` is service_role-only.
- **Verify all Meta endpoints, scope names, and API versions against current Meta developer docs before implementing — Meta changes these frequently.**

## Key IDs / infra
- Hub Supabase project ref: `horvjqqifgrzxesuxtfm`
- rekkrd branch_id: `f609040b-3098-4bb1-93b1-aabf5e910fd7`; IG handle `@rekkrdapp`
- OAuth callback: `${SUPABASE_URL}/functions/v1/social-oauth/callback`
- Publish webhook: `https://n8n.sproutify.app/webhook/trellis-social-publish`
