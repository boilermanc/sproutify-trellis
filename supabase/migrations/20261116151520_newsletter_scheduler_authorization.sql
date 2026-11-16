-- Campaign-only scheduler authorization. This migration never invokes a worker,
-- changes campaign data, provisions a secret, or enables a cron job.
CREATE SCHEMA IF NOT EXISTS private;
CREATE OR REPLACE FUNCTION private.post_newsletter_worker()
RETURNS bigint LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE gateway_key text; scheduler_key text;
BEGIN
  SELECT decrypted_secret INTO STRICT gateway_key FROM vault.decrypted_secrets
    WHERE name='trellis_scheduler_service_role_key';
  SELECT decrypted_secret INTO STRICT scheduler_key FROM vault.decrypted_secrets
    WHERE name='newsletter_worker_token';
  IF nullif(btrim(gateway_key),'') IS NULL OR scheduler_key !~ '^[A-Za-z0-9_-]{43,128}$'
     OR scheduler_key IS NULL OR left(scheduler_key,3)='sb_' THEN
    RAISE EXCEPTION 'Newsletter scheduler authorization is not configured safely';
  END IF;
  RETURN net.http_post(
    url := 'https://horvjqqifgrzxesuxtfm.supabase.co/functions/v1/campaign-sender',
    headers := jsonb_build_object('Content-Type','application/json','apikey',gateway_key,
      'Authorization','Bearer ' || gateway_key,'x-newsletter-worker-token',scheduler_key),
    body := '{}'::jsonb, timeout_milliseconds := 10000);
END;
$$;
REVOKE ALL ON FUNCTION private.post_newsletter_worker() FROM PUBLIC,anon,authenticated,service_role;

-- Preserve the existing tick/reaper body and change only its campaign HTTP call.
-- Do not export function definitions: they may contain deployment credentials.
DO $migration$
DECLARE tick_body text; original_call text := 'private.post_scheduler_worker(''campaign-sender'')';
BEGIN
  SELECT prosrc INTO STRICT tick_body FROM pg_proc
    WHERE oid='public.run_campaign_sender_tick()'::regprocedure
      AND prosecdef AND prorettype='void'::regtype
      AND prolang=(SELECT oid FROM pg_language WHERE lanname='plpgsql')
      AND proconfig @> ARRAY['search_path=""'];
  IF position(original_call IN tick_body)>0 THEN
    tick_body := replace(tick_body,original_call,'private.post_newsletter_worker()');
    EXECUTE format('CREATE OR REPLACE FUNCTION public.run_campaign_sender_tick() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='''' AS %L',tick_body);
  ELSIF position('private.post_newsletter_worker()' IN tick_body)=0 THEN
    RAISE EXCEPTION 'Unexpected campaign scheduler definition; no changes applied';
  END IF;
END;
$migration$;
REVOKE ALL ON FUNCTION public.run_campaign_sender_tick() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.run_campaign_sender_tick() TO service_role;
