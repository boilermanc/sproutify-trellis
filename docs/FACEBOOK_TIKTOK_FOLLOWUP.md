# Facebook & TikTok Publishing — Follow-Up Checklist

**Built:** 2026-08-01 · Commits `df6f991`, `d7b6341`, `2453eed`
**Status:** Facebook is ready to test. TikTok is code-complete but blocked on TikTok's developer portal.

---

## The short version

| Platform | Code | n8n | Can it post today? |
|---|---|---|---|
| Instagram | ✅ live | ✅ active | **Yes** — confirmed post `18129824812648287` |
| Facebook | ✅ live | ⚠️ needs re-import | **Yes, after the 5-minute task below** |
| TikTok | ✅ live | ⏳ not imported | **No** — private-only until TikTok audits the app |

Facebook had **never published a single post**. `publishToFacebook()`, the S1 cron worker,
`WEBHOOK_SPECS.facebook_publish`, the DB constraint, and two brands' active credentials all
pointed at `trellis-facebook-publish` — and no workflow was serving that webhook. TikTok was
entirely cosmetic: every reference in the codebase was an icon, a label, or a type union that
merely permitted the string.

---

## A. Facebook — do this first (~5 minutes)

You already imported `B4-facebook-publisher-v1.json`. **Re-import it** — I found a bug in my
own builder afterwards: the page-token node was missing the Graph API base and would have
requested a bare page id as a URL. Fixed in commit `2453eed`.

1. n8n → **Trellis: Facebook Page Publisher (Text, Photo & Multi-Photo)** → delete or overwrite.
2. Import the current `n8n-blueprints/B4-facebook-publisher-v1.json` from the repo.
3. **Re-attach credentials — this is the step that bit us twice tonight:**
   - `Fetch Facebook Credentials` → Header Auth credential (`apikey` = Hub service_role key).
     n8n links credentials *by name*, so every import arrives dangling. The symptom is n8n's
     own generic **`Credentials not found`**, thrown before any node logic runs — indistinguishable
     from a real missing credential.
   - `Log Marketing Event` → the `Sproutify Trellis` Supabase credential.
4. **Activate** the workflow.

### Then test it
Creative Studio → any approved Rejoice or ATL job → **Publish** → tick **Facebook** → Confirm.

Verify it actually landed:

```sql
select platform, status, post_id, published_at, last_error
from scheduled_social_posts
where created_at > now() - interval '1 hour'
order by created_at desc;
```

A Facebook `post_id` looks like `<page_id>_<post_id>`. The permalink is
`https://www.facebook.com/<post_id>` (`buildPostPermalink` in `lib/supabaseService.ts`
already handles this).

### Also import (optional, do it when convenient)
`S3-facebook-insights-sync.json` — the Facebook half of the performance loop. Runs every 6h.
Confirm the Supabase credential on its three HTTP nodes and activate. Without it, Facebook
posts publish fine but never collect stats.

> Note: `S2-instagram-insights-sync.json` changed too (it had no platform filter and was
> sweeping Facebook rows into Instagram's endpoint). Re-import it when you do S3.

### One loose end I couldn't close
Probing `trellis-facebook-publish` with a **nonexistent** brand id returns an empty
`HTTP 200` instead of the error JSON the workflow is wired to produce. It should not affect
real publishes — every node has an error output routed to the responder — but it's the same
silent-reply class we fixed in the Instagram publisher tonight. After you re-import, if it
still does this, open n8n → Executions → that run and send me which node went red.

---

## B. TikTok — portal work, then import

The pipeline is built and deployed. It cannot post publicly until **you** clear two things
with TikTok that no amount of code can work around. Both are surfaced in the Platform Setup
wizard so nobody discovers them mid-campaign.

### Blocker 1 — App audit (forces every post private)

Until the app passes TikTok's **Content Posting API audit**:
- Every post is forced to `SELF_ONLY` (private).
- The posting TikTok account itself must be set to private at the time of posting.
- Only 5 users may post per 24 hours.
- A public attempt returns `403 unaudited_client_can_only_post_to_private_accounts`.

General app review runs "several days to two weeks." TikTok publishes **no timeline** for the
posting audit specifically — start it early.

The audit also requires UX we don't have yet: an export screen showing the creator's nickname,
a privacy dropdown with **no** preselected default, comment/duet/stitch toggles that respect
the creator's own settings, and the Music Usage Confirmation disclosure. A fully headless
auto-poster will not pass. Budget a Trellis-side approval screen before submitting.

### Blocker 2 — URL ownership verification (blocks photo posts entirely)

TikTok only fetches media from a domain **verified in its developer portal**. Our media lives
on `horvjqqifgrzxesuxtfm.supabase.co` — verification needs a DNS TXT record on `supabase.co`,
which we don't control. That path is permanently closed.

**Fix:** serve media from a domain we own. A `media.sproutify.app` Cloudflare Worker (or CNAME)
in front of Supabase Storage, verified by DNS TXT. Critical detail: it must **return the bytes
with HTTP 200**, not a 302 redirect — TikTok explicitly rejects redirects.

- Photos are `PULL_FROM_URL` **only**, so this is mandatory for image/carousel posts.
- Video could instead use `FILE_UPLOAD`, which needs no domain verification but must chunk the
  bytes (5–64 MB per chunk). Not built — say the word and I'll add it.

### Portal checklist
- [ ] Create the app at [developers.tiktok.com](https://developers.tiktok.com/)
- [ ] Add products: **Login Kit** + **Content Posting API**
- [ ] Request scopes: `user.info.basic`, `video.publish`, `video.upload`
- [ ] Register redirect URI: `https://horvjqqifgrzxesuxtfm.supabase.co/functions/v1/social-oauth/callback`
- [ ] Submit for app review
- [ ] Request the Content Posting audit
- [ ] Stand up `media.sproutify.app` and verify it by DNS TXT

### Then in Trellis / n8n
- [ ] Settings → Platform Setup → TikTok → paste **Client Key** / **Client Secret**
      (TikTok calls it `client_key`, *not* `client_id` — the most common integration bug)
- [ ] Connect via OAuth
- [ ] Import `B5-tiktok-publisher-v1.json`, re-attach both credentials, activate
- [ ] Import `T1-tiktok-token-refresh.json`, confirm its Supabase credential, activate

### ⚠️ T1 is not optional
TikTok access tokens expire every **24 hours**, and refresh tokens **rotate** — the refresh
response can carry a *new* refresh token and the old one stops working. Without T1 running,
TikTok publishing dies every day and the only cure is reconnecting by hand. Nothing else in
Trellis needs this; Meta tokens are long-lived.

### Also re-import S1
`S1-scheduled-post-publisher.json` changed: its platform routing was a two-way IF meaning
*"Instagram vs everything-else → Facebook"*, so a TikTok row would have silently posted to
Facebook. It's now an explicit three-way Switch, and it honours a publisher's explicit
`needs_review` reply (TikTok returns that when it stops polling while a post is still
processing — retrying could double-post).

---

## C. What else changed that you should know about

**SocialHub's scheduling was theater.** `scheduleDrafts` only ever set React state — every
draft you approved there was silently never published, on any platform. It now writes to
`scheduled_social_posts`. Anything you "scheduled" there historically never went out.

**A silent write bug.** `upsert_social_credential` rejected unknown platforms by *returning*
`{success:false}` without raising, and `saveCredential`/`saveAppCredentials` only checked for
a thrown error — so they reported success while writing nothing. Both fixed.

**Deleted `B3-social-publisher.json` (v1).** It registered the *same* webhook path as v2, so
importing it would have hijacked working Instagram publishing. It's in git history.

**`social_post_insights` gained a `platform` column.** Facebook has no `saves` metric, and its
reach is `post_impressions_unique`; the Post Scheduler history now renders per-platform metrics
instead of showing empty Instagram slots on Facebook rows.

---

## D. Quick reference — is it actually working?

```sql
-- Everything published in the last day, by platform
select platform, status, count(*), max(published_at) as latest
from scheduled_social_posts
where created_at > now() - interval '1 day'
group by platform, status
order by platform;

-- Which brands are connected to what
select b.slug, sc.platform, sc.status, sc.token_expires_at
from social_credentials sc
join branches b on b.id::text = sc.branch_id
order by b.slug, sc.platform;

-- Are insights accruing?
select platform, count(*), max(fetched_at)
from social_post_insights
group by platform;
```

Probe a publish webhook without posting anything (a nonexistent brand id fails at the
credential lookup, so nothing reaches the network):

```bash
curl -s -X POST https://n8n.sproutify.app/webhook/trellis-facebook-publish -H "Content-Type: application/json" -d '{"branch_id":"00000000-0000-0000-0000-000000000099","caption":"probe"}'
```
