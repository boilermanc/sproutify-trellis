# Trellis Studio Albums: Pipeline and Deployment

## Audit result

| Area | Classification | Evidence / decision |
| --- | --- | --- |
| Authentication | Reuse unchanged | Supabase Auth is already used by `AuthContext`; the Album Edge Function validates the caller. |
| Organizations and roles | Extend carefully | Existing organization scoping uses the Sproutify organization UUID. `studio_feature_flags` adds a temporary per-user allow list; role-based Studio access should replace it when organization membership is centralized. |
| Supabase and storage | Reuse, isolated prefix | New tables use `studio_*`; private files belong in the `studio-assets` bucket under `studio/{organization_id}/albums/{album_id}/`. |
| Music generation | Reuse through an adapter | Studio owns planning and review state, then calls the proven `generate-session-track` pipeline and copies accepted audio into private Studio storage. |
| Track review and master rendering | Reuse patterns, not tables | The existing review UI and FFmpeg stitching worker prove the patterns, but Album state must remain in `studio_tracks`, `studio_assets`, and `studio_jobs`. |
| Publishing and YouTube | Dedicated Studio handoff | Studio has its own publication record and n8n blueprint. Metadata must be saved and approved before an explicit YouTube submission. |
| n8n | Reuse for orchestration only | Keep durable album state in Supabase. Use n8n for alerts, reminders, and final publishing coordination. |

## Delivered pipeline

- `studio_feature_flags`, `studio_albums`, `studio_tracks`, `studio_assets`, and `studio_jobs` with constraints, indexes, RLS, resumable review states, and one-active-job guards.
- Private `studio-assets` storage bucket.
- Guided presets for groovy organ, jazz spy, Saturday morning lounge, and midnight jazz.
- Exact runtime planning for 15–165 second source tracks, with a 40-track / 110-minute maximum that matches the generator's real limits.
- Plan → generate → approve/reject → master → identity → cover → video review workflow. Rejected tracks return to an editable planned state; approved upstream revisions invalidate stale downstream assets.
- Video rendering reuses the existing n8n/FFmpeg worker route. Studio jobs use private storage, heartbeat progress, strict asset/job validation, and explicit final-video approval.
- Publishing uses `studio_publications` and the dedicated `trellis-studio-album-publish` webhook. Releases default to private, require a confirmation, and return to a retryable failed state when n8n or YouTube fails.
- Legacy **Trellis Sessions** and **Episodes** contracts remain supported.

## Approval gates

1. Approve every generated track before building the master.
2. Approve the measured master before defining release identity.
3. Approve release identity before generating cover concepts.
4. Select and approve one cover before rendering the final video.
5. Approve the rendered video before preparing YouTube metadata.
6. Save and approve the title, description, tags, chapters, and visibility.
7. Confirm the final submission to YouTube. Scheduling and custom-thumbnail upload remain disabled until separately verified.

## Deployment verification

1. Apply all Studio migrations, including `20260804110350_complete_studio_album_pipeline.sql`, `20260804111707_fix_studio_track_job_concurrency.sql`, and `20260804121548_add_studio_album_publications.sql`.
2. Deploy `studio-albums`, `studio-album-planner`, and `studio-track-planner`. Keep `generate-session-track` deployed because Studio calls it through the adapter.
3. Set the `studio-albums` Edge Function secret `STUDIO_VIDEO_RENDER_WEBHOOK` to the existing n8n video-forwarding webhook. The legacy `STUDIO_VIDEO_WEBHOOK` name remains supported during migration.
4. Deploy and restart `workers/video_worker.py`; it now accepts both the original Episode payload and `pipeline: "studio"`.
5. Import `n8n-blueprints/E10-studio-album-publish.json`, map its Hub Supabase and YouTube credentials, activate it, and set the Edge Function secret `STUDIO_PUBLISH_WEBHOOK=https://n8n.sproutify.app/webhook/trellis-studio-album-publish`.
6. Allow-list the intended user without enabling the module globally:

```sql
UPDATE studio_feature_flags
SET enabled_for_user_ids = jsonb_build_array('YOUR_AUTH_USER_UUID'), updated_at = NOW()
WHERE organization_id = '00000000-0000-0000-0000-000000000001'
  AND key = 'studio_music_enabled';
```

7. Create a 30-minute preset album and confirm the plan totals exactly 1,800 seconds. Generate and approve tracks, build the master, and compare the measured master duration shown in the UI.
8. Complete identity and cover approval, render a video, observe worker progress, play the signed private MP4, and approve it.
9. Prepare, edit, save, and approve a private YouTube publication. Submit it, verify n8n marks all three Studio records complete, and confirm the external URL appears in Trellis.
10. Confirm a forced YouTube failure marks `studio_publications`, `studio_albums`, and `studio_jobs` failed instead of leaving them submitting.
11. Confirm a second authenticated user cannot select Album/publication rows or download private assets. Confirm legacy Sessions and Episodes still work.

## Current rollout status (2026-08-04)

- Studio migrations are applied and the four Edge Functions are deployed: `studio-albums`, `studio-album-planner`, `studio-track-planner`, and `generate-session-track`.
- The production n8n Music Stitch and Episode Video forwarding workflows are active. Music forwards to `127.0.0.1:8099/stitch`; video forwards to `127.0.0.1:8100/video`.
- The forwarding blueprints preserve the complete request body, including Studio's asset, job, organization, private-storage, and motion fields.
- Music Stitch currently saves no execution history. Episode Video saves errors only; its two visible executions returned HTTP 400, including the empty-body health probe. There is not yet a saved successful Studio video execution.
- The updated Studio-aware `video_worker.py` still needs to be deployed and the `trellis-video` service restarted on the VPS, then verified with a real Studio render.
- The updated frontend still needs its normal production deployment.
- Studio publishing is built locally but not deployed: migration `20260804121548_add_studio_album_publications.sql`, the metadata review UI, Edge Function actions, and `E10-studio-album-publish.json` are ready for staged rollout. It deliberately does not reuse Episode tables.
- Scheduling and custom-thumbnail upload remain intentionally disabled; the UI says so instead of promising unsupported behavior.
