-- Keep the legacy campaign-send RPC available to existing callers, but make
-- the authorization promised by the lead-sequence migration enforceable at
-- the actual privileged boundary. The newer lead flow uses lead-email-send.
create or replace function public.send_resend_email(
  p_to text,
  p_subject text,
  p_html text,
  p_from text default null::text,
  p_cc text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  token text;
  from_addr text;
  body jsonb;
  response extensions.http_response;
begin
  if not (select private.can_manage_marketing()) then
    raise exception 'You are not authorized to send marketing email';
  end if;

  if p_to is null or btrim(p_to) = '' then
    raise exception 'Recipient email is required';
  end if;
  if p_subject is null or btrim(p_subject) = '' then
    raise exception 'Email subject is required';
  end if;
  if p_html is null or btrim(p_html) = '' then
    raise exception 'Email HTML is required';
  end if;

  select secrets.resend_token, secrets.resend_from_address
  into token, from_addr
  from public.tenant_secrets secrets
  limit 1;

  if token is null or length(btrim(token)) = 0 then
    raise exception 'resend_token is not configured in tenant_secrets (Settings > Communication Services > Resend API Token)';
  end if;

  from_addr := coalesce(
    nullif(btrim(p_from), ''),
    nullif(btrim(from_addr), ''),
    'ATL Urban Farms <sheree@atlurbanfarms.com>'
  );

  body := jsonb_build_object(
    'from', from_addr,
    'to', jsonb_build_array(btrim(p_to)),
    'subject', p_subject,
    'html', p_html
  );

  if p_cc is not null and length(btrim(p_cc)) > 0 then
    body := body || jsonb_build_object(
      'cc', to_jsonb(regexp_split_to_array(btrim(p_cc), '\\s*,\\s*'))
    );
  end if;

  select * into response
  from extensions.http((
    'POST',
    'https://api.resend.com/emails',
    array[
      extensions.http_header('Authorization', 'Bearer ' || token),
      extensions.http_header('Content-Type', 'application/json')
    ],
    'application/json',
    body::text
  )::extensions.http_request);

  if response.status not between 200 and 299 then
    raise exception 'Resend error (%): %', response.status, response.content;
  end if;

  return response.content::jsonb;
end;
$function$;

revoke all on function public.send_resend_email(text, text, text, text, text)
  from public, anon;
grant execute on function public.send_resend_email(text, text, text, text, text)
  to authenticated;

-- This helper only reported the same authorization decision and was not an
-- enforcement point. Removing it avoids presenting it as a security control.
drop function if exists public.can_send_resend_email();
