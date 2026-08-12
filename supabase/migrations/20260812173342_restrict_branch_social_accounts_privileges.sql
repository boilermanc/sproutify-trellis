-- RLS does not protect TRUNCATE. Supabase project defaults may grant more than
-- this authenticated client needs, so reduce it to the explicit CRUD surface.
REVOKE ALL ON public.branch_social_accounts FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.branch_social_accounts TO authenticated;
GRANT ALL ON public.branch_social_accounts TO service_role;
