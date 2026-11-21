# TikTok read-only metrics

## Scope and release status

Release authorized on 2026-10-19. Metrics migration and Edge Function deployed to Trellis Hub; OAuth v34 adds video.list while preserving the existing basic-profile lookup fix. Frontend release follows this commit. Scheduled sync is not yet installed or activated. The TikTok publisher must remain locked/unpublished; token refresh stays separate. This feature uses only the fixed `/v2/video/query/` read endpoint. It does not insert into the publishing queue or call upload/publish endpoints.

In Post Performance, choose a branch and paste a full public TikTok video URL. The backend verifies the video belongs to that branch's connected account, then assigns it once. Home and Farm share credentials but not reporting attribution. A video ID is globally unique in the tracking table: it cannot silently count for both branches. No caption-based guessing or automatic assignment.

The first Home video is `https://www.tiktok.com/@sproutifytheapp/video/7698435240997489950`. Track it under Sproutify Home after reconnecting read access. Farm starts empty until a Farm post is explicitly tracked.

## Permission check (2026-10-19)

The live Home owner grant has `user.info.basic`, `video.publish`, `video.upload`, but **not `video.list`**. Farm aliases that grant. The TikTok sandbox currently has Login Kit and Content Posting API, with no Display API product. Add Display API / `video.list` in the sandbox and reconnect the Home owner account, explicitly approving the additional read access. Do not reconnect Farm independently or duplicate rotating tokens. Production availability remains subject to TikTok app review; sandbox permission is not production approval.

`user.info.basic` identifies the connected account; `video.list` is the additional required scope. `user.info.stats` is not required for video metrics. Existing publishing scopes are preserved by OAuth for compatibility but no publishing operation is enabled by this feature.

Sources checked: [Query Videos](https://developers.tiktok.com/docs/en/tiktok-api-v2-video-query), [List Videos](https://developers.tiktok.com/docs/en/tiktok-api-v2-video-list).

## Data and authorization

`tiktok_metric_posts` stores branch/account attribution and latest lifetime views, likes, comments and shares. `tiktok_metric_daily` stores the latest snapshot per UTC day, transactionally with the latest totals. Do not sum lifetime snapshots. Missing metrics are null, not zero. Missing/private/deleted videos retain the previous snapshot with an availability warning. A changed connected account fails closed.

Tables are service-role-only with RLS. The Edge Function verifies an active Trellis operator. Owners/admins may access all branches; others require `trellis_user_branches` assignment. Only operators/owners/admins may track new posts. Worker-wide sync requires the exact server service credential. Browser clients never receive tokens. The existing PostHog module supplies shared Trellis authorization helpers; no PostHog credentials or API are used.

No retention/watch-time/website-click metrics are exposed by this integration. Daily history is retained for future trend reporting; the current panel shows latest totals, last sync and errors (latest 200 posts per branch). No customer/spoke profile data is copied. Existing event TTL rules do not apply to these reporting snapshots.

## Release and recovery

After explicit release approval: apply only `20261019175229_tiktok_readonly_metrics.sql` to the Switchboard-bound Trellis Hub; deploy `tiktok-metrics` (it verifies authorization itself); deploy the OAuth scope addition and frontend; import `T2-tiktok-metrics-sync.json`, bind the existing Trellis server credential, and leave it inactive until a live permission and single-post metrics test succeeds. Then enable the six-hour read sync. The blueprint disables execution payload retention. The publisher remains inactive throughout.

Verify anonymous and unassigned requests are rejected; reconnect Home, verify granted `video.list`, track the known Home URL, compare returned totals to TikTok, and confirm Farm stays empty. Run a second sync to confirm no duplicate daily snapshot. Test missing permissions and missing videos without clearing prior metrics.

Recovery: deactivate only T2, roll back frontend/Edge Function if needed, and retain reporting tables. No destructive rollback or credential rotation is needed. Do not activate B5. Commits/pushes/deployments for this feature require explicit approval under the working agreements.

## Creative lesson

Next Home video should show actual app screenshots or a walkthrough before the CTA, connecting the growing footage to the product. Hold the closing URL for 5–6 seconds with continuous audio. Do not claim app actions without checking the real interface. The first published video is left unchanged.

## Local verification

Passed: `node --test tests/tiktok-metrics.test.mjs` (10 tests), `npx tsc --noEmit`, `deno check supabase/functions/tiktok-metrics/index.ts`, `npm run build`, and `git diff --check`. Browser fixture at `/tests/fixtures/tiktok-metrics.html` verified Home sample metrics, null versus zero, and Farm's missing-permission/empty state with no Home rows carried over. Fixture data is synthetic, not this video's actual performance. Existing build warnings about bundle size and Tailwind scanning remain.

Verified on the Hub: migration applied, rollback-only database assertions passed, and anonymous metrics requests return 401. Not yet verified: live authorized TikTok reads, scheduled n8n execution, and production UI. `tests/tiktok-metrics.sql` supplies rollback-only database assertions for after release approval. Release must isolate these changes from the other dirty work in this repository; do not deploy the current workspace bundle wholesale.
