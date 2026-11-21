-- Isolated test database ONLY. Never apply this fixture to the Hub.
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role BYPASSRLS; END IF;
END $$;
CREATE TABLE IF NOT EXISTS public.branches (id uuid PRIMARY KEY, slug text UNIQUE NOT NULL, is_active boolean NOT NULL DEFAULT true);
CREATE TABLE IF NOT EXISTS public.marketing_brands (id uuid PRIMARY KEY, branch_id uuid NOT NULL REFERENCES public.branches(id));
INSERT INTO public.branches(id,slug) VALUES
  ('10000000-0000-4000-8000-000000000001','fixture-nursery'),
  ('10000000-0000-4000-8000-000000000002','fixture-music') ON CONFLICT DO NOTHING;
INSERT INTO public.marketing_brands(id,branch_id) VALUES
  ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002') ON CONFLICT DO NOTHING;
GRANT USAGE ON SCHEMA public TO service_role, authenticated, anon;
-- Row locks require UPDATE privilege on the parent rows (no row values are changed).
GRANT SELECT, UPDATE ON public.branches TO service_role;
GRANT SELECT, UPDATE ON public.marketing_brands TO service_role;
