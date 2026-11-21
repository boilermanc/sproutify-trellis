-- Keep the account registry readable/manageable without granting authenticated
-- users USAGE on the entire private schema. These narrowly-scoped public
-- predicates expose only booleans and retain the existing Trellis role checks.
CREATE OR REPLACE FUNCTION public.can_read_branch_social_accounts()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.trellis_users
    WHERE auth_user_id = (SELECT auth.uid())
      AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_branch_social_accounts()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.trellis_users
    WHERE auth_user_id = (SELECT auth.uid())
      AND role IN ('owner', 'admin', 'operator')
      AND status = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.can_read_branch_social_accounts() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_branch_social_accounts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_branch_social_accounts() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_branch_social_accounts() TO authenticated, service_role;

DROP POLICY IF EXISTS "Active Trellis users read branch social accounts" ON public.branch_social_accounts;
CREATE POLICY "Active Trellis users read branch social accounts"
  ON public.branch_social_accounts FOR SELECT TO authenticated
  USING ((SELECT public.can_read_branch_social_accounts()));

DROP POLICY IF EXISTS "Marketing operators create branch social accounts" ON public.branch_social_accounts;
CREATE POLICY "Marketing operators create branch social accounts"
  ON public.branch_social_accounts FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.can_manage_branch_social_accounts()));

DROP POLICY IF EXISTS "Marketing operators update branch social accounts" ON public.branch_social_accounts;
CREATE POLICY "Marketing operators update branch social accounts"
  ON public.branch_social_accounts FOR UPDATE TO authenticated
  USING ((SELECT public.can_manage_branch_social_accounts()))
  WITH CHECK ((SELECT public.can_manage_branch_social_accounts()));

DROP POLICY IF EXISTS "Marketing operators delete branch social accounts" ON public.branch_social_accounts;
CREATE POLICY "Marketing operators delete branch social accounts"
  ON public.branch_social_accounts FOR DELETE TO authenticated
  USING ((SELECT public.can_manage_branch_social_accounts()));
