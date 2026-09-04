-- Shared, reusable audience definitions. Customer profile data remains in the
-- spokes; this table stores only orchestration rules and campaign identifiers.
CREATE TABLE IF NOT EXISTS public.audience_segments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL CHECK (length(trim(name)) > 0),
  description TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('rules', 'link_interest', 'campaign_engagement')),
  rule_groups JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(rule_groups) = 'array'),
  link_interest JSONB,
  campaign_engagement JSONB,
  recommended_branches JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(recommended_branches) = 'array'),
  icon TEXT,
  color TEXT,
  created_by UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (link_interest IS NULL OR jsonb_typeof(link_interest) = 'object'),
  CHECK (campaign_engagement IS NULL OR jsonb_typeof(campaign_engagement) = 'object'),
  CHECK (
    (kind = 'rules' AND link_interest IS NULL AND campaign_engagement IS NULL)
    OR (kind = 'link_interest' AND link_interest IS NOT NULL AND campaign_engagement IS NULL)
    OR (kind = 'campaign_engagement' AND campaign_engagement IS NOT NULL AND link_interest IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_audience_segments_created_by_updated
  ON public.audience_segments (created_by, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_audience_segments_rule_groups
  ON public.audience_segments USING GIN (rule_groups jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_audience_segments_link_interest
  ON public.audience_segments USING GIN (link_interest jsonb_path_ops)
  WHERE link_interest IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audience_segments_campaign_engagement
  ON public.audience_segments USING GIN (campaign_engagement jsonb_path_ops)
  WHERE campaign_engagement IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audience_segments_recommended_branches
  ON public.audience_segments USING GIN (recommended_branches jsonb_path_ops);

ALTER TABLE public.audience_segments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.audience_segments FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audience_segments TO authenticated;
GRANT ALL ON public.audience_segments TO service_role;

DROP POLICY IF EXISTS "Active Trellis users read audience segments" ON public.audience_segments;
CREATE POLICY "Active Trellis users read audience segments"
  ON public.audience_segments FOR SELECT TO authenticated
  USING ((SELECT private.is_active_trellis_user()));

DROP POLICY IF EXISTS "Marketing operators create audience segments" ON public.audience_segments;
CREATE POLICY "Marketing operators create audience segments"
  ON public.audience_segments FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT private.can_manage_marketing())
    AND created_by = (SELECT auth.uid())
  );

DROP POLICY IF EXISTS "Marketing operators update audience segments" ON public.audience_segments;
CREATE POLICY "Marketing operators update audience segments"
  ON public.audience_segments FOR UPDATE TO authenticated
  USING ((SELECT private.can_manage_marketing()))
  WITH CHECK ((SELECT private.can_manage_marketing()));

DROP POLICY IF EXISTS "Marketing operators delete audience segments" ON public.audience_segments;
CREATE POLICY "Marketing operators delete audience segments"
  ON public.audience_segments FOR DELETE TO authenticated
  USING ((SELECT private.can_manage_marketing()));
