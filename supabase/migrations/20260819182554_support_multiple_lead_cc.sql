-- Resend accepts CC as an array of addresses. Preserve the existing text RPC
-- parameter for compatibility, but split comma-delimited recipients into that
-- array so lead emails can copy both partner contacts.
CREATE OR REPLACE FUNCTION public.send_resend_email(
  p_to text,
  p_subject text,
  p_html text,
  p_from text DEFAULT NULL::text,
  p_cc text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  token TEXT;
  from_addr TEXT;
  body JSONB;
  response extensions.http_response;
BEGIN
  SELECT resend_token, resend_from_address
  INTO token, from_addr
  FROM tenant_secrets LIMIT 1;

  IF token IS NULL OR length(trim(token)) = 0 THEN
    RAISE EXCEPTION 'resend_token is not configured in tenant_secrets (Settings > Communication Services > Resend API Token)';
  END IF;

  from_addr := COALESCE(NULLIF(trim(p_from), ''), NULLIF(trim(from_addr), ''), 'ATL Urban Farms <sheree@atlurbanfarms.com>');

  body := jsonb_build_object(
    'from', from_addr,
    'to', jsonb_build_array(p_to),
    'subject', p_subject,
    'html', p_html
  );

  IF p_cc IS NOT NULL AND length(trim(p_cc)) > 0 THEN
    body := body || jsonb_build_object(
      'cc', to_jsonb(regexp_split_to_array(trim(p_cc), '\\s*,\\s*'))
    );
  END IF;

  SELECT * INTO response FROM extensions.http((
    'POST',
    'https://api.resend.com/emails',
    ARRAY[
      extensions.http_header('Authorization', 'Bearer ' || token),
      extensions.http_header('Content-Type', 'application/json')
    ],
    'application/json',
    body::text
  )::extensions.http_request);

  IF response.status NOT BETWEEN 200 AND 299 THEN
    RAISE EXCEPTION 'Resend error (%): %', response.status, response.content;
  END IF;

  RETURN response.content::jsonb;
END;
$function$;
