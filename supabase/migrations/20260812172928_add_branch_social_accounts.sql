-- Durable, non-secret social account identity registry.
-- OAuth tokens remain isolated in social_credentials; this table only records
-- which public account belongs to which Trellis branch.
CREATE TABLE IF NOT EXISTS public.branch_social_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  branch_id UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('instagram', 'x', 'linkedin', 'facebook', 'tiktok', 'youtube')),
  external_account_id TEXT,
  handle TEXT NOT NULL,
  display_name TEXT,
  profile_url TEXT,
  purpose TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'registered'
    CHECK (status IN ('registered', 'pending', 'active', 'error', 'revoked')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (branch_id, platform, external_account_id),
  UNIQUE (branch_id, platform, handle)
);

CREATE INDEX IF NOT EXISTS idx_branch_social_accounts_branch_platform
  ON public.branch_social_accounts (branch_id, platform);
CREATE INDEX IF NOT EXISTS idx_branch_social_accounts_metadata_gin
  ON public.branch_social_accounts USING GIN (metadata jsonb_path_ops);
CREATE UNIQUE INDEX IF NOT EXISTS idx_branch_social_accounts_one_primary
  ON public.branch_social_accounts (branch_id, platform)
  WHERE is_primary;

ALTER TABLE public.branch_social_accounts ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.branch_social_accounts TO authenticated;
GRANT ALL ON public.branch_social_accounts TO service_role;

DROP POLICY IF EXISTS "Service Role Full Access" ON public.branch_social_accounts;
CREATE POLICY "Service Role Full Access"
  ON public.branch_social_accounts FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Active Trellis users read branch social accounts" ON public.branch_social_accounts;
CREATE POLICY "Active Trellis users read branch social accounts"
  ON public.branch_social_accounts FOR SELECT TO authenticated
  USING ((SELECT private.is_active_trellis_user()));

DROP POLICY IF EXISTS "Marketing operators create branch social accounts" ON public.branch_social_accounts;
CREATE POLICY "Marketing operators create branch social accounts"
  ON public.branch_social_accounts FOR INSERT TO authenticated
  WITH CHECK ((SELECT private.can_manage_marketing()));

DROP POLICY IF EXISTS "Marketing operators update branch social accounts" ON public.branch_social_accounts;
CREATE POLICY "Marketing operators update branch social accounts"
  ON public.branch_social_accounts FOR UPDATE TO authenticated
  USING ((SELECT private.can_manage_marketing()))
  WITH CHECK ((SELECT private.can_manage_marketing()));

DROP POLICY IF EXISTS "Marketing operators delete branch social accounts" ON public.branch_social_accounts;
CREATE POLICY "Marketing operators delete branch social accounts"
  ON public.branch_social_accounts FOR DELETE TO authenticated
  USING ((SELECT private.can_manage_marketing()));

-- Rekkrd owns two distinct YouTube Brand Account channels. The immutable
-- channel IDs are the identity keys; handles remain editable display data.
INSERT INTO public.branch_social_accounts (
  branch_id, platform, external_account_id, handle, display_name,
  profile_url, purpose, is_primary, status, metadata
)
SELECT
  b.id,
  seed.platform,
  seed.external_account_id,
  seed.handle,
  seed.display_name,
  seed.profile_url,
  seed.purpose,
  seed.is_primary,
  'registered',
  jsonb_build_object('ownership', 'brand_account', 'source', 'youtube')
FROM public.branches b
CROSS JOIN (VALUES
  ('youtube', 'UCwk6PPLPh_txSnDf-pzPCJA', '@RekkrdAfterDark', 'Rekkrd After Dark', 'https://www.youtube.com/@RekkrdAfterDark', 'after_dark', true),
  ('youtube', 'UC-O8IHGO4buM4NkOPmc59mw', '@RekkrdListeningRoom', 'Rekkrd Listening Room', 'https://www.youtube.com/@RekkrdListeningRoom', 'listening_room', false)
) AS seed(platform, external_account_id, handle, display_name, profile_url, purpose, is_primary)
WHERE b.slug = 'rekkrd'
ON CONFLICT (branch_id, platform, external_account_id) DO UPDATE SET
  handle = EXCLUDED.handle,
  display_name = EXCLUDED.display_name,
  profile_url = EXCLUDED.profile_url,
  purpose = EXCLUDED.purpose,
  is_primary = EXCLUDED.is_primary,
  metadata = EXCLUDED.metadata,
  updated_at = now();
