-- ───────────────────────────────────────────────────────────────────────────
-- Social Hub image uploads: storage RLS policy
-- ───────────────────────────────────────────────────────────────────────────
-- SYMPTOM: uploadSocialImage() (lib/supabaseService.ts) writes to the public
--   `avatars` bucket under the `social/` prefix and fails with
--   "StorageApiError: new row violates row-level security policy" (400).
--
-- CAUSE: the avatars bucket's existing INSERT policy is path-restricted and does
--   not cover the `social/` prefix. uploadAvatar() works because it writes under
--   a path the existing policy already allows.
--
-- FIX: add INSERT + UPDATE policies on storage.objects scoped to
--   bucket_id = 'avatars' AND first folder = 'social', for the authenticated and
--   anon roles. (The Supabase JS client uses the `authenticated` role when a user
--   is signed in, NOT `anon` — but we grant both to be safe.)
--
-- Run this in the Supabase SQL editor for the Hub project
--   (horvjqqifgrzxesuxtfm). Idempotent — safe to re-run.
-- ───────────────────────────────────────────────────────────────────────────

-- INSERT: allow new social images
drop policy if exists "social images insert" on storage.objects;
create policy "social images insert"
on storage.objects for insert
to authenticated, anon
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = 'social'
);

-- UPDATE: required because uploadSocialImage uses { upsert: true }
drop policy if exists "social images update" on storage.objects;
create policy "social images update"
on storage.objects for update
to authenticated, anon
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = 'social'
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = 'social'
);

-- NOTE: SELECT (public read) is already served because the avatars bucket is
-- marked public; getPublicUrl() does not require a SELECT policy.
