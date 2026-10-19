-- Run against the Trellis Hub after the feature migration; always rolls back.
BEGIN;
DO $$
DECLARE owner_row RECORD; post UUID; total INTEGER; observed BIGINT;
BEGIN
  IF has_table_privilege('anon','public.tiktok_metric_posts','SELECT')
    OR has_table_privilege('authenticated','public.tiktok_metric_daily','SELECT')
    OR has_function_privilege('authenticated','public.record_tiktok_metrics(uuid,text,timestamptz,text,bigint,bigint,bigint,bigint)','EXECUTE') THEN
    RAISE EXCEPTION 'Metrics data or writer exposed outside the authorized function';
  END IF;
  SELECT c.id,c.branch_id,c.platform_metadata->>'open_id' AS account_id INTO owner_row
    FROM public.social_credentials c JOIN public.branches b ON b.id::text=c.branch_id
    WHERE c.platform='tiktok' AND c.shared_credential_id IS NULL AND b.slug='sproutify-home';
  IF owner_row.id IS NULL THEN RAISE EXCEPTION 'Expected Home owner connection is missing'; END IF;
  INSERT INTO public.tiktok_metric_posts(branch_id,credential_id,account_id,video_id)
    VALUES(owner_row.branch_id::uuid,owner_row.id,coalesce(owner_row.account_id,'test-account'),'9999999999999999999') RETURNING id INTO post;
  PERFORM public.record_tiktok_metrics(post,'test',now(),NULL,0,NULL,2,3);
  PERFORM public.record_tiktok_metrics(post,'test',now(),NULL,5,1,2,4);
  SELECT count(*) INTO total FROM public.tiktok_metric_daily WHERE post_id=post;
  IF total <> 1 THEN RAISE EXCEPTION 'Daily snapshot duplicated'; END IF;
  SELECT views INTO observed FROM public.tiktok_metric_posts WHERE id=post;
  IF observed <> 5 THEN RAISE EXCEPTION 'Latest snapshot did not update'; END IF;
  BEGIN
    INSERT INTO public.tiktok_metric_posts(branch_id,credential_id,account_id,video_id)
      VALUES(owner_row.branch_id::uuid,owner_row.id,'test-account','9999999999999999999');
    RAISE EXCEPTION 'Duplicate video was accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END;
$$;
ROLLBACK;
