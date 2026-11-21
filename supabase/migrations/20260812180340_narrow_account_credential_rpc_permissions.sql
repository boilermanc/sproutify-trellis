-- Browsers may save developer-app credentials, but only the service-role OAuth
-- callback may write access/refresh tokens.
REVOKE ALL ON FUNCTION public.upsert_social_account_credential(text,text,uuid,text,text,text,text,timestamptz,text,text,jsonb,jsonb,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_social_account_credential(text,text,uuid,text,text,text,text,timestamptz,text,text,jsonb,jsonb,text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.save_social_account_app_credentials(
  p_branch_id text,
  p_platform text,
  p_branch_social_account_id uuid,
  p_app_id text,
  p_app_secret text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_account public.branch_social_accounts%ROWTYPE;
  v_result public.social_credentials%ROWTYPE;
  v_enc_secret text;
BEGIN
  IF NOT private.can_manage_social_credentials() THEN
    RAISE EXCEPTION 'Not authorized to manage social credentials' USING ERRCODE = '42501';
  END IF;
  IF COALESCE(trim(p_app_id), '') = '' OR COALESCE(trim(p_app_secret), '') = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'OAuth Client ID and Client Secret are required');
  END IF;

  SELECT * INTO v_account
  FROM public.branch_social_accounts
  WHERE id = p_branch_social_account_id
    AND branch_id::text = p_branch_id
    AND platform = p_platform
    AND status <> 'revoked';

  IF v_account.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Social account does not belong to this branch/platform');
  END IF;
  IF p_platform <> 'youtube' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Account-scoped OAuth currently supports YouTube only');
  END IF;

  v_enc_secret := encode(pgp_sym_encrypt(trim(p_app_secret), public.get_encryption_key()), 'base64');

  INSERT INTO public.social_credentials (
    branch_id, platform, branch_social_account_id, app_id, app_secret_encrypted,
    status, is_valid, updated_at
  ) VALUES (
    p_branch_id, p_platform, p_branch_social_account_id, trim(p_app_id), v_enc_secret,
    'pending', true, now()
  )
  ON CONFLICT (branch_id, platform, branch_social_account_id) DO UPDATE SET
    app_id = EXCLUDED.app_id,
    app_secret_encrypted = EXCLUDED.app_secret_encrypted,
    status = 'pending',
    is_valid = true,
    updated_at = now()
  RETURNING * INTO v_result;

  UPDATE public.branch_social_accounts SET
    status = 'pending',
    metadata = metadata || jsonb_build_object('credential_id', v_result.id),
    updated_at = now()
  WHERE id = p_branch_social_account_id;

  RETURN jsonb_build_object(
    'success', true,
    'credential_id', v_result.id,
    'branch_social_account_id', p_branch_social_account_id,
    'platform', p_platform,
    'status', 'pending'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_social_account_app_credentials(text,text,uuid,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_social_account_app_credentials(text,text,uuid,text,text) TO authenticated, service_role;
