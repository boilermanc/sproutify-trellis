-- A publication may be retargeted only before the external upload starts.
-- Episode and clip rows are created at dispatch time, so only failed attempts
-- may be corrected. Studio rows exist earlier and remain editable until submit.
CREATE OR REPLACE FUNCTION private.prevent_youtube_publication_retarget()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_can_retarget BOOLEAN := false;
BEGIN
  IF NEW.youtube_account_id IS NOT DISTINCT FROM OLD.youtube_account_id THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.platform, OLD.platform) <> 'youtube' THEN
    RETURN NEW;
  END IF;

  IF OLD.external_id IS NOT NULL OR OLD.published_at IS NOT NULL THEN
    RAISE EXCEPTION 'YouTube destination is locked after submission; create a new publication instead'
      USING ERRCODE = '23514';
  END IF;

  IF TG_TABLE_NAME IN ('trellis_episode_publications', 'trellis_clip_publications') THEN
    v_can_retarget := OLD.status = 'failed';
  ELSIF TG_TABLE_NAME = 'studio_publications' THEN
    v_can_retarget := OLD.status IN ('draft', 'ready', 'failed', 'cancelled');
  END IF;

  IF NOT v_can_retarget THEN
    RAISE EXCEPTION 'YouTube destination is locked after submission; mark the attempt failed before choosing another channel'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.prevent_youtube_publication_retarget() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.prevent_youtube_publication_retarget() TO service_role;

DROP TRIGGER IF EXISTS prevent_episode_youtube_retarget ON public.trellis_episode_publications;
CREATE TRIGGER prevent_episode_youtube_retarget
  BEFORE UPDATE OF youtube_account_id
  ON public.trellis_episode_publications
  FOR EACH ROW EXECUTE FUNCTION private.prevent_youtube_publication_retarget();

DROP TRIGGER IF EXISTS prevent_clip_youtube_retarget ON public.trellis_clip_publications;
CREATE TRIGGER prevent_clip_youtube_retarget
  BEFORE UPDATE OF youtube_account_id
  ON public.trellis_clip_publications
  FOR EACH ROW EXECUTE FUNCTION private.prevent_youtube_publication_retarget();

DROP TRIGGER IF EXISTS prevent_studio_youtube_retarget ON public.studio_publications;
CREATE TRIGGER prevent_studio_youtube_retarget
  BEFORE UPDATE OF youtube_account_id
  ON public.studio_publications
  FOR EACH ROW EXECUTE FUNCTION private.prevent_youtube_publication_retarget();
