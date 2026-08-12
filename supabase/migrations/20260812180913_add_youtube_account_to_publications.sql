-- Every new YouTube publication must retain the immutable account registry id
-- selected by the operator. Trigger validation preserves legacy rows while
-- still allowing their status fields to be updated by existing workflows.
ALTER TABLE public.trellis_episode_publications
  ADD COLUMN IF NOT EXISTS youtube_account_id UUID
  REFERENCES public.branch_social_accounts(id) ON DELETE RESTRICT;

ALTER TABLE public.trellis_clip_publications
  ADD COLUMN IF NOT EXISTS youtube_account_id UUID
  REFERENCES public.branch_social_accounts(id) ON DELETE RESTRICT;

ALTER TABLE public.studio_publications
  ADD COLUMN IF NOT EXISTS youtube_account_id UUID
  REFERENCES public.branch_social_accounts(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_episode_publications_youtube_account
  ON public.trellis_episode_publications (youtube_account_id)
  WHERE youtube_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clip_publications_youtube_account
  ON public.trellis_clip_publications (youtube_account_id)
  WHERE youtube_account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_studio_publications_youtube_account
  ON public.studio_publications (youtube_account_id)
  WHERE youtube_account_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.validate_youtube_publication_account()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_branch_slug TEXT;
  v_valid BOOLEAN;
BEGIN
  IF NEW.platform <> 'youtube' THEN
    RETURN NEW;
  END IF;
  IF NEW.youtube_account_id IS NULL THEN
    RAISE EXCEPTION 'A YouTube account is required for YouTube publications' USING ERRCODE = '23514';
  END IF;

  IF TG_TABLE_NAME = 'trellis_episode_publications' THEN
    SELECT episode.branch INTO v_branch_slug
    FROM public.trellis_episodes episode
    WHERE episode.id = NEW.episode_id;
  ELSIF TG_TABLE_NAME = 'trellis_clip_publications' THEN
    SELECT project.branch INTO v_branch_slug
    FROM public.trellis_clip_projects project
    WHERE project.id = NEW.project_id;
  ELSIF TG_TABLE_NAME = 'studio_publications' THEN
    v_branch_slug := 'rekkrd';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.branch_social_accounts account
    JOIN public.branches branch ON branch.id = account.branch_id
    WHERE account.id = NEW.youtube_account_id
      AND account.platform = 'youtube'
      AND account.status = 'active'
      AND branch.slug = v_branch_slug
  ) INTO v_valid;

  IF NOT COALESCE(v_valid, false) THEN
    RAISE EXCEPTION 'The selected YouTube account is not active for branch %', COALESCE(v_branch_slug, '(unknown)') USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.validate_youtube_publication_account() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.validate_youtube_publication_account() TO service_role;

DROP TRIGGER IF EXISTS validate_episode_youtube_account ON public.trellis_episode_publications;
CREATE TRIGGER validate_episode_youtube_account
  BEFORE INSERT OR UPDATE OF youtube_account_id, platform
  ON public.trellis_episode_publications
  FOR EACH ROW EXECUTE FUNCTION private.validate_youtube_publication_account();

DROP TRIGGER IF EXISTS validate_clip_youtube_account ON public.trellis_clip_publications;
CREATE TRIGGER validate_clip_youtube_account
  BEFORE INSERT OR UPDATE OF youtube_account_id, platform
  ON public.trellis_clip_publications
  FOR EACH ROW EXECUTE FUNCTION private.validate_youtube_publication_account();

DROP TRIGGER IF EXISTS validate_studio_youtube_account ON public.studio_publications;
CREATE TRIGGER validate_studio_youtube_account
  BEFORE INSERT OR UPDATE OF youtube_account_id, platform
  ON public.studio_publications
  FOR EACH ROW EXECUTE FUNCTION private.validate_youtube_publication_account();
