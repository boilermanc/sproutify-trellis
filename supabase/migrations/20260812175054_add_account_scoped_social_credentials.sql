-- Bind credentials to a specific public account identity. Existing Facebook,
-- Instagram, X, LinkedIn, and TikTok credentials remain unscoped (NULL) and
-- keep their one-row-per-branch/platform behavior.
ALTER TABLE public.social_credentials
  ADD COLUMN IF NOT EXISTS branch_social_account_id UUID
  REFERENCES public.branch_social_accounts(id) ON DELETE CASCADE;

ALTER TABLE public.social_credentials
  DROP CONSTRAINT IF EXISTS unique_branch_platform;
ALTER TABLE public.social_credentials
  DROP CONSTRAINT IF EXISTS unique_branch_platform_account;
ALTER TABLE public.social_credentials
  ADD CONSTRAINT unique_branch_platform_account
  UNIQUE NULLS NOT DISTINCT (branch_id, platform, branch_social_account_id);

CREATE INDEX IF NOT EXISTS idx_social_credentials_branch_account
  ON public.social_credentials (branch_social_account_id)
  WHERE branch_social_account_id IS NOT NULL;

CREATE OR REPLACE FUNCTION private.can_manage_social_credentials()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT COALESCE((SELECT auth.jwt()->>'role') = 'service_role', false)
    OR EXISTS (
      SELECT 1
      FROM public.trellis_users
      WHERE auth_user_id = (SELECT auth.uid())
        AND role IN ('owner', 'admin', 'operator')
        AND status = 'active'
    );
$$;

REVOKE ALL ON FUNCTION private.can_manage_social_credentials() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_manage_social_credentials() TO authenticated, service_role;

-- Preserve the deployed unscoped RPC contract while targeting the NULL account
-- slot in the new three-column uniqueness constraint.
CREATE OR REPLACE FUNCTION public.upsert_social_credential(
  p_branch_id text,
  p_platform text,
  p_access_token text,
  p_app_id text DEFAULT NULL,
  p_app_secret text DEFAULT NULL,
  p_refresh_token text DEFAULT NULL,
  p_token_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_platform_user_id text DEFAULT NULL,
  p_platform_username text DEFAULT NULL,
  p_platform_metadata jsonb DEFAULT NULL,
  p_granted_scopes jsonb DEFAULT NULL,
  p_status text DEFAULT 'active'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_result public.social_credentials%ROWTYPE;
  v_key text := public.get_encryption_key();
  v_enc_secret text;
  v_enc_access text;
  v_enc_refresh text;
BEGIN
  IF NOT private.can_manage_social_credentials() THEN
    RAISE EXCEPTION 'Not authorized to manage social credentials' USING ERRCODE = '42501';
  END IF;
  IF p_platform NOT IN ('instagram','facebook','x','linkedin','tiktok','youtube') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid platform: ' || p_platform);
  END IF;

  IF p_app_secret IS NOT NULL THEN
    v_enc_secret := encode(pgp_sym_encrypt(p_app_secret, v_key), 'base64');
  END IF;
  IF p_access_token IS NOT NULL THEN
    v_enc_access := encode(pgp_sym_encrypt(p_access_token, v_key), 'base64');
  END IF;
  IF p_refresh_token IS NOT NULL THEN
    v_enc_refresh := encode(pgp_sym_encrypt(p_refresh_token, v_key), 'base64');
  END IF;

  INSERT INTO public.social_credentials (
    branch_id, platform, branch_social_account_id, app_id, app_secret_encrypted,
    access_token_encrypted, refresh_token_encrypted, token_expires_at,
    platform_user_id, platform_username, platform_metadata, granted_scopes,
    status, is_valid, updated_at
  ) VALUES (
    p_branch_id, p_platform, NULL, COALESCE(p_app_id, ''), COALESCE(v_enc_secret, ''),
    v_enc_access, v_enc_refresh, p_token_expires_at,
    p_platform_user_id, p_platform_username,
    COALESCE(p_platform_metadata, '{}'::jsonb), COALESCE(p_granted_scopes, '[]'::jsonb),
    COALESCE(p_status, 'active'), true, now()
  )
  ON CONFLICT (branch_id, platform, branch_social_account_id) DO UPDATE SET
    app_id = COALESCE(NULLIF(p_app_id, ''), public.social_credentials.app_id),
    app_secret_encrypted = CASE WHEN v_enc_secret IS NOT NULL THEN v_enc_secret ELSE public.social_credentials.app_secret_encrypted END,
    access_token_encrypted = CASE WHEN v_enc_access IS NOT NULL THEN v_enc_access ELSE public.social_credentials.access_token_encrypted END,
    refresh_token_encrypted = CASE WHEN v_enc_refresh IS NOT NULL THEN v_enc_refresh ELSE public.social_credentials.refresh_token_encrypted END,
    token_expires_at = COALESCE(p_token_expires_at, public.social_credentials.token_expires_at),
    platform_user_id = COALESCE(p_platform_user_id, public.social_credentials.platform_user_id),
    platform_username = COALESCE(p_platform_username, public.social_credentials.platform_username),
    platform_metadata = CASE WHEN p_platform_metadata IS NOT NULL THEN public.social_credentials.platform_metadata || p_platform_metadata ELSE public.social_credentials.platform_metadata END,
    granted_scopes = COALESCE(p_granted_scopes, public.social_credentials.granted_scopes),
    status = COALESCE(p_status, public.social_credentials.status),
    is_valid = true,
    last_refreshed_at = CASE WHEN p_access_token IS NOT NULL THEN now() ELSE public.social_credentials.last_refreshed_at END,
    updated_at = now()
  RETURNING * INTO v_result;

  RETURN jsonb_build_object(
    'success', true,
    'credential_id', v_result.id,
    'branch_id', v_result.branch_id,
    'platform', v_result.platform,
    'status', v_result.status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_social_credential(text,text,text,text,text,text,timestamptz,text,text,jsonb,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_social_credential(text,text,text,text,text,text,timestamptz,text,text,jsonb,jsonb,text) TO authenticated, service_role;

-- Account-scoped write path used by YouTube OAuth. The immutable channel ID in
-- branch_social_accounts is the expected identity for callback verification.
CREATE OR REPLACE FUNCTION public.upsert_social_account_credential(
  p_branch_id text,
  p_platform text,
  p_branch_social_account_id uuid,
  p_access_token text DEFAULT NULL,
  p_app_id text DEFAULT NULL,
  p_app_secret text DEFAULT NULL,
  p_refresh_token text DEFAULT NULL,
  p_token_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_platform_user_id text DEFAULT NULL,
  p_platform_username text DEFAULT NULL,
  p_platform_metadata jsonb DEFAULT NULL,
  p_granted_scopes jsonb DEFAULT NULL,
  p_status text DEFAULT 'active'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_account public.branch_social_accounts%ROWTYPE;
  v_result public.social_credentials%ROWTYPE;
  v_key text := public.get_encryption_key();
  v_enc_secret text;
  v_enc_access text;
  v_enc_refresh text;
BEGIN
  IF NOT private.can_manage_social_credentials() THEN
    RAISE EXCEPTION 'Not authorized to manage social credentials' USING ERRCODE = '42501';
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

  IF p_platform_user_id IS NOT NULL AND p_platform_user_id <> v_account.external_account_id THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Authorized YouTube channel does not match the selected account',
      'expected_channel_id', v_account.external_account_id,
      'actual_channel_id', p_platform_user_id
    );
  END IF;

  IF p_app_secret IS NOT NULL THEN
    v_enc_secret := encode(pgp_sym_encrypt(p_app_secret, v_key), 'base64');
  END IF;
  IF p_access_token IS NOT NULL THEN
    v_enc_access := encode(pgp_sym_encrypt(p_access_token, v_key), 'base64');
  END IF;
  IF p_refresh_token IS NOT NULL THEN
    v_enc_refresh := encode(pgp_sym_encrypt(p_refresh_token, v_key), 'base64');
  END IF;

  INSERT INTO public.social_credentials (
    branch_id, platform, branch_social_account_id, app_id, app_secret_encrypted,
    access_token_encrypted, refresh_token_encrypted, token_expires_at,
    platform_user_id, platform_username, platform_metadata, granted_scopes,
    status, is_valid, updated_at
  ) VALUES (
    p_branch_id, p_platform, p_branch_social_account_id,
    COALESCE(p_app_id, ''), COALESCE(v_enc_secret, ''),
    v_enc_access, v_enc_refresh, p_token_expires_at,
    p_platform_user_id, p_platform_username,
    COALESCE(p_platform_metadata, '{}'::jsonb), COALESCE(p_granted_scopes, '[]'::jsonb),
    COALESCE(p_status, 'active'), true, now()
  )
  ON CONFLICT (branch_id, platform, branch_social_account_id) DO UPDATE SET
    app_id = COALESCE(NULLIF(p_app_id, ''), public.social_credentials.app_id),
    app_secret_encrypted = CASE WHEN v_enc_secret IS NOT NULL THEN v_enc_secret ELSE public.social_credentials.app_secret_encrypted END,
    access_token_encrypted = CASE WHEN v_enc_access IS NOT NULL THEN v_enc_access ELSE public.social_credentials.access_token_encrypted END,
    refresh_token_encrypted = CASE WHEN v_enc_refresh IS NOT NULL THEN v_enc_refresh ELSE public.social_credentials.refresh_token_encrypted END,
    token_expires_at = COALESCE(p_token_expires_at, public.social_credentials.token_expires_at),
    platform_user_id = COALESCE(p_platform_user_id, public.social_credentials.platform_user_id),
    platform_username = COALESCE(p_platform_username, public.social_credentials.platform_username),
    platform_metadata = CASE WHEN p_platform_metadata IS NOT NULL THEN public.social_credentials.platform_metadata || p_platform_metadata ELSE public.social_credentials.platform_metadata END,
    granted_scopes = COALESCE(p_granted_scopes, public.social_credentials.granted_scopes),
    status = COALESCE(p_status, public.social_credentials.status),
    is_valid = true,
    last_refreshed_at = CASE WHEN p_access_token IS NOT NULL THEN now() ELSE public.social_credentials.last_refreshed_at END,
    updated_at = now()
  RETURNING * INTO v_result;

  UPDATE public.branch_social_accounts SET
    status = CASE
      WHEN v_result.status = 'active' THEN 'active'
      WHEN v_result.status = 'error' THEN 'error'
      ELSE 'pending'
    END,
    metadata = metadata || jsonb_build_object('credential_id', v_result.id),
    updated_at = now()
  WHERE id = p_branch_social_account_id;

  RETURN jsonb_build_object(
    'success', true,
    'credential_id', v_result.id,
    'branch_social_account_id', p_branch_social_account_id,
    'branch_id', v_result.branch_id,
    'platform', v_result.platform,
    'expected_external_account_id', v_account.external_account_id,
    'status', v_result.status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_social_account_credential(text,text,uuid,text,text,text,text,timestamptz,text,text,jsonb,jsonb,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_social_account_credential(text,text,uuid,text,text,text,text,timestamptz,text,text,jsonb,jsonb,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_social_account_credential(
  p_branch_id text,
  p_platform text,
  p_branch_social_account_id uuid,
  p_encryption_key text DEFAULT public.get_encryption_key()
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_row public.social_credentials%ROWTYPE;
  v_account public.branch_social_accounts%ROWTYPE;
  v_decrypted_secret text;
  v_decrypted_access text;
  v_decrypted_refresh text;
BEGIN
  IF COALESCE((SELECT auth.jwt()->>'role'), '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row
  FROM public.social_credentials
  WHERE branch_id = p_branch_id
    AND platform = p_platform
    AND branch_social_account_id = p_branch_social_account_id;

  SELECT * INTO v_account
  FROM public.branch_social_accounts
  WHERE id = p_branch_social_account_id
    AND branch_id::text = p_branch_id
    AND platform = p_platform;

  IF v_row.id IS NULL OR v_account.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No account-scoped credential found');
  END IF;

  IF v_row.app_secret_encrypted IS NOT NULL AND v_row.app_secret_encrypted <> '' THEN
    v_decrypted_secret := pgp_sym_decrypt(decode(v_row.app_secret_encrypted, 'base64'), p_encryption_key);
  END IF;
  IF v_row.access_token_encrypted IS NOT NULL AND v_row.access_token_encrypted <> '' THEN
    v_decrypted_access := pgp_sym_decrypt(decode(v_row.access_token_encrypted, 'base64'), p_encryption_key);
  END IF;
  IF v_row.refresh_token_encrypted IS NOT NULL AND v_row.refresh_token_encrypted <> '' THEN
    v_decrypted_refresh := pgp_sym_decrypt(decode(v_row.refresh_token_encrypted, 'base64'), p_encryption_key);
  END IF;

  UPDATE public.social_credentials SET last_used_at = now() WHERE id = v_row.id;

  RETURN jsonb_build_object(
    'success', true,
    'credential_id', v_row.id,
    'branch_social_account_id', v_row.branch_social_account_id,
    'branch_id', v_row.branch_id,
    'platform', v_row.platform,
    'expected_external_account_id', v_account.external_account_id,
    'expected_handle', v_account.handle,
    'app_id', v_row.app_id,
    'app_secret', v_decrypted_secret,
    'access_token', v_decrypted_access,
    'refresh_token', v_decrypted_refresh,
    'token_expires_at', v_row.token_expires_at,
    'platform_user_id', v_row.platform_user_id,
    'platform_username', v_row.platform_username,
    'platform_metadata', v_row.platform_metadata,
    'granted_scopes', v_row.granted_scopes,
    'status', v_row.status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_social_account_credential(text,text,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_social_account_credential(text,text,uuid,text) TO service_role;

CREATE OR REPLACE FUNCTION public.revoke_social_account_credential(
  p_branch_id text,
  p_branch_social_account_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF NOT private.can_manage_social_credentials() THEN
    RAISE EXCEPTION 'Not authorized to manage social credentials' USING ERRCODE = '42501';
  END IF;

  UPDATE public.social_credentials SET
    access_token_encrypted = NULL,
    refresh_token_encrypted = NULL,
    token_expires_at = NULL,
    status = 'revoked',
    platform_metadata = COALESCE(platform_metadata, '{}'::jsonb) || jsonb_build_object('revoked_at', now()::text),
    updated_at = now()
  WHERE branch_id = p_branch_id
    AND branch_social_account_id = p_branch_social_account_id
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No account-scoped credential found to revoke');
  END IF;

  UPDATE public.branch_social_accounts SET
    status = 'registered',
    updated_at = now()
  WHERE id = p_branch_social_account_id AND branch_id::text = p_branch_id;

  RETURN jsonb_build_object('success', true, 'credential_id', v_id, 'status', 'revoked');
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_social_account_credential(text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_social_account_credential(text,uuid) TO authenticated, service_role;

-- Non-secret status payload now carries account identity so the UI can
-- distinguish two YouTube rows under the same branch.
CREATE OR REPLACE FUNCTION public.list_social_connections(p_branch_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT private.can_manage_social_credentials() THEN
    RAISE EXCEPTION 'Not authorized to list social credentials' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', sc.id,
          'branch_social_account_id', sc.branch_social_account_id,
          'platform', sc.platform,
          'platform_user_id', sc.platform_user_id,
          'platform_username', sc.platform_username,
          'app_id', sc.app_id,
          'status', sc.status,
          'has_app_secret', (sc.app_secret_encrypted IS NOT NULL AND sc.app_secret_encrypted <> ''),
          'platform_metadata', sc.platform_metadata,
          'granted_scopes', sc.granted_scopes,
          'last_used_at', sc.last_used_at,
          'last_refreshed_at', sc.last_refreshed_at,
          'token_expires_at', sc.token_expires_at,
          'created_at', sc.created_at,
          'updated_at', sc.updated_at
        ) ORDER BY sc.platform, sc.created_at
      )
      FROM public.social_credentials sc
      WHERE sc.branch_id = p_branch_id
    ),
    '[]'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_social_connections(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_social_connections(text) TO authenticated, service_role;
