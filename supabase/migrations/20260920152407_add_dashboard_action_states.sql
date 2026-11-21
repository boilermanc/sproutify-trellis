-- Per-user state for the small, derived weekly action list. This table stores
-- orchestration state only; source customer/profile data remains in its spoke.
CREATE TABLE IF NOT EXISTS public.dashboard_action_states (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'dismissed', 'deferred')),
  owner_id UUID NULL REFERENCES public.trellis_users(id) ON DELETE SET NULL,
  deferred_until TIMESTAMPTZ NULL,
  source_updated_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, action_key)
);

CREATE INDEX IF NOT EXISTS idx_dashboard_action_states_due
  ON public.dashboard_action_states (user_id, status, deferred_until);

ALTER TABLE public.dashboard_action_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read their dashboard action states" ON public.dashboard_action_states;
CREATE POLICY "Users read their dashboard action states"
  ON public.dashboard_action_states FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users insert their dashboard action states" ON public.dashboard_action_states;
CREATE POLICY "Users insert their dashboard action states"
  ON public.dashboard_action_states FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users update their dashboard action states" ON public.dashboard_action_states;
CREATE POLICY "Users update their dashboard action states"
  ON public.dashboard_action_states FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON TABLE public.dashboard_action_states TO authenticated;
