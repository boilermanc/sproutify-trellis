-- Resumable campaign drafts are owned by the authenticated Trellis user who
-- created them. Active Trellis users may read the shared campaign registry,
-- while only the owner or a marketing operator may change a row.

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid();

CREATE INDEX IF NOT EXISTS idx_campaigns_owner_updated
  ON public.campaigns (owner_id, updated_at DESC);

ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.campaigns FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;
GRANT ALL ON public.campaigns TO service_role;

DROP POLICY IF EXISTS "campaigns_app_access" ON public.campaigns;
DROP POLICY IF EXISTS "Active Trellis users read campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Active Trellis users create campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Campaign owners manage campaigns" ON public.campaigns;
DROP POLICY IF EXISTS "Campaign owners delete drafts" ON public.campaigns;

CREATE POLICY "Active Trellis users read campaigns"
  ON public.campaigns FOR SELECT TO authenticated
  USING ((SELECT private.is_active_trellis_user()));

CREATE POLICY "Active Trellis users create campaigns"
  ON public.campaigns FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT private.is_active_trellis_user())
    AND owner_id = (SELECT auth.uid())
  );

CREATE POLICY "Campaign owners manage campaigns"
  ON public.campaigns FOR UPDATE TO authenticated
  USING (
    owner_id = (SELECT auth.uid())
    OR (SELECT private.can_manage_marketing())
  )
  WITH CHECK (
    owner_id = (SELECT auth.uid())
    OR (SELECT private.can_manage_marketing())
  );

CREATE POLICY "Campaign owners delete drafts"
  ON public.campaigns FOR DELETE TO authenticated
  USING (
    status = 'draft'
    AND (
      owner_id = (SELECT auth.uid())
      OR (SELECT private.can_manage_marketing())
    )
  );
