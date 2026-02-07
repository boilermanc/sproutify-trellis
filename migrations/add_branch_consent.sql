-- ============================================
-- PER-BRANCH CONSENT MIGRATION
-- Adds a JSONB field to track subscription
-- status per branch independently.
-- Run in Supabase SQL Editor.
-- ============================================

-- 1. Add the column
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS branch_consent JSONB DEFAULT '{}';

-- 2. GIN index for fast JSONB lookups
CREATE INDEX IF NOT EXISTS idx_profiles_branch_consent
ON profiles USING GIN (branch_consent);

-- 3. Backfill: for each profile, set consent per branch
--    based on current global is_subscribed / marketing_pause.
--    Note: branches is JSONB (not TEXT[]), so we use jsonb_array_elements_text.
UPDATE profiles
SET branch_consent = (
  SELECT jsonb_object_agg(
    branch,
    jsonb_build_object(
      'subscribed', is_subscribed,
      'paused', marketing_pause,
      'updated_at', now()
    )
  )
  FROM jsonb_array_elements_text(branches) AS branch
)
WHERE jsonb_array_length(branches) > 0;

-- 4. Profiles with empty/null branches keep branch_consent = '{}'.
--    App code (consentUtils.ts) falls back to global is_subscribed /
--    marketing_pause when branch_consent has no matching key, so no
--    sentinel entry is needed here.

COMMENT ON COLUMN profiles.branch_consent IS
'Per-branch subscription consent. Shape: { "branch-slug": { "subscribed": bool, "paused": bool, "updated_at": timestamp } }';
