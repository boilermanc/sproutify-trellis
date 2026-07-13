# Trellis Studio Albums: Audit and Delivery Plan

## Audit result

| Area | Classification | Evidence / decision |
| --- | --- | --- |
| Authentication | Reuse unchanged | Supabase Auth is already used by `AuthContext`; the Album Edge Function validates the caller. |
| Organizations and roles | Extend carefully | Existing organization scoping uses the Sproutify organization UUID. `studio_feature_flags` adds a temporary per-user allow list; role-based Studio access should replace it when organization membership is centralized. |
| Supabase and storage | Reuse, isolated prefix | New tables use `studio_*`; private files belong in the `studio-assets` bucket under `studio/{organization_id}/albums/{album_id}/`. |
| Music generation | Do not reuse directly | `generate-session-track` operates on `trellis_music_*` tables. It remains the protected legacy pipeline until an Album-specific worker is implemented. |
| Track review and master rendering | Reuse patterns, not tables | The existing review UI and FFmpeg stitching worker prove the patterns, but Album state must remain in `studio_tracks`, `studio_assets`, and `studio_jobs`. |
| Publishing and YouTube | Extend later | Existing episode/publishing systems are the eventual handoff target. No automatic publishing is introduced. |
| n8n | Reuse for orchestration only | Keep durable album state in Supabase. Use n8n for alerts, reminders, and final publishing coordination. |

## Delivered foundation

- `studio_feature_flags`, `studio_albums`, `studio_tracks`, `studio_assets`, and `studio_jobs` with idempotent migration, constraints, indexes, and RLS. The browser has owner-scoped read access; writes and processing remain behind authenticated Edge Functions and trusted workers.
- Private `studio-assets` storage bucket.
- `studio-albums` Edge Function for authenticated, feature-gated album creation and listing.
- A separate **Studio Albums** navigation item and album-brief screen. Legacy **Trellis Sessions** remains unchanged.

## Delivery sequence

1. **Foundation — complete locally:** deploy the migration and Edge Function; allow-list the first account.
2. **Single-track vertical slice — complete locally:** the Album Edge Function creates a Studio track, bridges to the existing Lyria worker, copies the completed audio into private Studio storage, and supports approve/reject. Staging verification remains required.
3. **Album planner:** add the AI Music Director as a plan-review gate before credits are spent.
4. **Batch generation and master:** queue one job per approved plan item, then adapt the FFmpeg worker to consume only approved Album assets.
5. **Visuals, video, publishing:** add the scene loop/video renderer and emit a standardized publish package to the existing YouTube publisher only after explicit approval.

## Deployment verification

1. Apply both Studio migrations through the normal Supabase migration workflow: `202607131200_add_studio_albums_foundation.sql` and `20260713224049_studio_album_access_and_legacy_adapter.sql`.
2. Deploy `supabase/functions/studio-albums`. The existing `generate-session-track` function must remain deployed because Studio calls it through the adapter.
3. Allow-list the intended user without enabling the module globally:

```sql
UPDATE studio_feature_flags
SET enabled_for_user_ids = jsonb_build_array('YOUR_AUTH_USER_UUID'), updated_at = NOW()
WHERE organization_id = '00000000-0000-0000-0000-000000000001'
  AND key = 'studio_music_enabled';
```

4. Sign in as that user, open **Studio Albums**, create an album brief, then generate a 15–165 second track. Confirm a `studio_tracks` row links to a legacy generation record, and that completed audio is copied into `studio-assets` under `studio/{organization_id}/albums/{album_id}/`.
5. Confirm a second authenticated user cannot select the Album rows or download the private audio object. The legacy **Trellis Sessions** screen must continue to list its existing sessions.
