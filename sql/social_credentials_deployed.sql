-- ============================================================
-- social_credentials — DEPLOYED PRODUCTION SNAPSHOT (2026-06-10)
-- Source of truth for the social credential layer.
-- Captured from production via pg_get_functiondef / information_schema.
-- ============================================================
--
-- PROVENANCE / READ ME FIRST
-- --------------------------------------------------------------
-- This file documents what is DEPLOYED in production Supabase (Hub:
-- horvjqqifgrzxesuxtfm.supabase.co). It is a documentation snapshot —
-- DO NOT execute it as a migration. These definitions are the live
-- contract; they do NOT necessarily match older SQL in constants.ts or
-- the supabase/functions/* edge code (which still reference the older
-- BYTEA + direct pgp_sym_encrypt form).
--
-- Provenance of each section below:
--   * TABLE SCHEMA ........... captured verbatim from information_schema.
--   * upsert_social_credential VERBATIM (consolidated version deployed
--                              2026-06-10, via pg_get_functiondef). The two
--                              older duplicate overloads were DROPPED that day.
--   * get_active_social_tokens VERBATIM (corrected base64 version deployed
--                              2026-06-10, via pg_get_functiondef).
--   * get_social_credential ... VERBATIM (via pg_get_functiondef 2026-06-10).
--   * get_meta_insight_credentials VERBATIM (via pg_get_functiondef 2026-06-10).
--   * list_social_connections  VERBATIM (via pg_get_functiondef 2026-06-10).
--   * revoke_social_credential VERBATIM (via pg_get_functiondef 2026-06-10).
--   * get_encryption_key ..... BODY REDACTED — intentionally omitted. The
--                              real body returns key material and must NEVER
--                              enter source control. Placeholder kept on
--                              purpose; do NOT fill it.
--
-- CANONICAL CONTRACT (do not deviate):
--   * encryption key = get_encryption_key()           -- returns hex
--   * encoding       = base64( pgp_sym_encrypt(...) )  -- stored in TEXT cols
--     decoding       = pgp_sym_decrypt( decode(col,'base64'), get_encryption_key() )
--   * account ID location = platform_user_id column    -- NOT platform_metadata
-- ============================================================


-- ============================================================
-- TABLE SCHEMA: social_credentials
-- Columns (name / type / nullable / default)
-- ============================================================
--   id                      / uuid        / NO  / uuid_generate_v4()
--   branch_id               / text        / NO
--   platform                / text        / NO
--   app_id                  / text        / NO
--   app_secret_encrypted    / text        / NO
--   access_token_encrypted  / text        / YES
--   refresh_token_encrypted / text        / YES
--   token_expires_at        / timestamptz / YES
--   platform_metadata       / jsonb       / YES / '{}'::jsonb
--   granted_scopes          / jsonb       / YES / '[]'::jsonb
--   status                  / text        / YES / 'pending'::text
--   last_error              / text        / YES
--   last_refreshed_at       / timestamptz / YES
--   last_used_at            / timestamptz / YES
--   created_at              / timestamptz / YES / now()
--   updated_at              / timestamptz / YES / now()
--   platform_user_id        / text        / YES
--   platform_username       / text        / YES
--   scopes                  / text[]      / YES / '{}'::text[]
--   expires_at              / timestamptz / YES
--   is_valid                / boolean     / YES / true
--
-- COLUMN STATUS:
--   CANONICAL (use these):
--     status                  -- lifecycle: 'pending' | (connected) | ...
--     platform_metadata       -- jsonb bag of extra platform fields
--     platform_user_id        -- the account ID (canonical location)
--     token_expires_at        -- canonical token expiry
--     granted_scopes          -- jsonb array of granted OAuth scopes
--     access_token_encrypted  -- base64-encoded pgp ( base64(pgp_sym_encrypt(...)) )
--
--   VESTIGIAL (kept for now, DO NOT use — superseded by canonical cols):
--     is_valid   -- superseded by status
--     expires_at -- superseded by token_expires_at
--     scopes     -- superseded by granted_scopes (jsonb)
-- ============================================================


-- ============================================================
-- FUNCTION: get_encryption_key()
-- Returns the symmetric encryption key (hex) used by pgp_sym_encrypt/decrypt.
-- Replaces the old current_setting('app.encryption_key') approach (Supabase
-- blocks ALTER DATABASE/ROLE for custom params).
--
-- !! BODY REDACTED — INTENTIONALLY OMITTED FROM SOURCE CONTROL.
-- !! This function returns the symmetric encryption key. Its body must
-- !! NEVER be committed. Do NOT fill this in. To inspect the live body,
-- !! run pg_get_functiondef against production directly.
-- ============================================================
-- vvvv get_encryption_key BODY REDACTED — DO NOT FILL vvvv
--
--   (production body intentionally omitted — returns key material)
--
-- ^^^^ get_encryption_key BODY REDACTED — DO NOT FILL ^^^^


-- ============================================================
-- FUNCTION: get_social_credential(p_branch_id TEXT, p_platform TEXT, p_encryption_key TEXT)
-- RETURNS JSON  -- { success, app_id, app_secret, ... }
-- Used by the social-oauth Edge Function to read app-level creds
-- (app_id + decrypted app_secret) for the OAuth token exchange.
-- Signature confirmed from supabase/functions/social-oauth/index.ts
-- (p_branch_id, p_platform, p_encryption_key).
--
-- Canonical contract reminder: app_secret_encrypted is TEXT holding
-- base64(pgp_sym_encrypt(secret, key)); decode with
-- pgp_sym_decrypt(decode(app_secret_encrypted,'base64'), p_encryption_key).
--
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_social_credential(p_branch_id text, p_platform text, p_encryption_key text DEFAULT get_encryption_key())
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_row social_credentials%ROWTYPE;
  v_decrypted_secret TEXT;
  v_decrypted_access TEXT;
  v_decrypted_refresh TEXT;
BEGIN
  SELECT * INTO v_row
  FROM social_credentials
  WHERE branch_id = p_branch_id AND platform = p_platform;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No credential found for ' || p_platform || ' on branch ' || p_branch_id);
  END IF;

  BEGIN
    IF v_row.app_secret_encrypted IS NOT NULL AND v_row.app_secret_encrypted != '' THEN
      BEGIN
        v_decrypted_secret := pgp_sym_decrypt(decode(v_row.app_secret_encrypted, 'base64'), p_encryption_key);
      EXCEPTION WHEN OTHERS THEN
        v_decrypted_secret := pgp_sym_decrypt(v_row.app_secret_encrypted::bytea, p_encryption_key);
      END;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_decrypted_secret := NULL;
  END;

  BEGIN
    IF v_row.access_token_encrypted IS NOT NULL THEN
      BEGIN
        v_decrypted_access := pgp_sym_decrypt(decode(v_row.access_token_encrypted, 'base64'), p_encryption_key);
      EXCEPTION WHEN OTHERS THEN
        v_decrypted_access := pgp_sym_decrypt(v_row.access_token_encrypted::bytea, p_encryption_key);
      END;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_decrypted_access := NULL;
  END;

  BEGIN
    IF v_row.refresh_token_encrypted IS NOT NULL THEN
      BEGIN
        v_decrypted_refresh := pgp_sym_decrypt(decode(v_row.refresh_token_encrypted, 'base64'), p_encryption_key);
      EXCEPTION WHEN OTHERS THEN
        v_decrypted_refresh := pgp_sym_decrypt(v_row.refresh_token_encrypted::bytea, p_encryption_key);
      END;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_decrypted_refresh := NULL;
  END;

  UPDATE social_credentials SET last_used_at = now() WHERE id = v_row.id;

  RETURN jsonb_build_object(
    'success', true,
    'credential_id', v_row.id,
    'branch_id', v_row.branch_id,
    'platform', v_row.platform,
    'app_id', v_row.app_id,
    'app_secret', v_decrypted_secret,
    'access_token', v_decrypted_access,
    'refresh_token', v_decrypted_refresh,
    'token_expires_at', v_row.token_expires_at,
    'platform_metadata', v_row.platform_metadata,
    'granted_scopes', v_row.granted_scopes,
    'status', v_row.status
  );
END;
$function$;


-- ============================================================
-- FUNCTION: upsert_social_credential  (CONSOLIDATED — deployed 2026-06-10)
-- Single source of truth for writing credentials. Uses get_encryption_key()
-- and base64(pgp_sym_encrypt(...)) into the TEXT *_encrypted columns; writes
-- the account ID to platform_user_id.
--
-- NOTE: the two older duplicate upsert_social_credential overloads were
-- DROPPED on 2026-06-10 and replaced by this single consolidated version.
-- ============================================================
CREATE OR REPLACE FUNCTION public.upsert_social_credential(p_branch_id text, p_platform text, p_access_token text, p_app_id text DEFAULT NULL::text, p_app_secret text DEFAULT NULL::text, p_refresh_token text DEFAULT NULL::text, p_token_expires_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_platform_user_id text DEFAULT NULL::text, p_platform_username text DEFAULT NULL::text, p_platform_metadata jsonb DEFAULT NULL::jsonb, p_granted_scopes jsonb DEFAULT NULL::jsonb, p_status text DEFAULT 'active'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_result social_credentials%ROWTYPE;
  v_key text := get_encryption_key();
  v_enc_secret text;
  v_enc_access text;
  v_enc_refresh text;
BEGIN
  IF p_platform NOT IN ('instagram','facebook','x','linkedin') THEN
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

  INSERT INTO social_credentials (
    branch_id, platform, app_id, app_secret_encrypted,
    access_token_encrypted, refresh_token_encrypted, token_expires_at,
    platform_user_id, platform_username, platform_metadata, granted_scopes,
    status, is_valid, updated_at
  ) VALUES (
    p_branch_id, p_platform, COALESCE(p_app_id, ''), COALESCE(v_enc_secret, ''),
    v_enc_access, v_enc_refresh, p_token_expires_at,
    p_platform_user_id, p_platform_username,
    COALESCE(p_platform_metadata, '{}'::jsonb), COALESCE(p_granted_scopes, '[]'::jsonb),
    COALESCE(p_status, 'active'), true, now()
  )
  ON CONFLICT (branch_id, platform) DO UPDATE SET
    app_id = COALESCE(NULLIF(p_app_id, ''), social_credentials.app_id),
    app_secret_encrypted = CASE WHEN v_enc_secret IS NOT NULL THEN v_enc_secret ELSE social_credentials.app_secret_encrypted END,
    access_token_encrypted = CASE WHEN v_enc_access IS NOT NULL THEN v_enc_access ELSE social_credentials.access_token_encrypted END,
    refresh_token_encrypted = CASE WHEN v_enc_refresh IS NOT NULL THEN v_enc_refresh ELSE social_credentials.refresh_token_encrypted END,
    token_expires_at = COALESCE(p_token_expires_at, social_credentials.token_expires_at),
    platform_user_id = COALESCE(p_platform_user_id, social_credentials.platform_user_id),
    platform_username = COALESCE(p_platform_username, social_credentials.platform_username),
    platform_metadata = CASE WHEN p_platform_metadata IS NOT NULL THEN social_credentials.platform_metadata || p_platform_metadata ELSE social_credentials.platform_metadata END,
    granted_scopes = COALESCE(p_granted_scopes, social_credentials.granted_scopes),
    status = COALESCE(p_status, social_credentials.status),
    is_valid = true,
    last_refreshed_at = CASE WHEN p_access_token IS NOT NULL THEN now() ELSE social_credentials.last_refreshed_at END,
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
$function$;


-- ============================================================
-- FUNCTION: get_active_social_tokens(p_platform TEXT)  (FIXED base64 — deployed 2026-06-10)
-- Returns all active, decrypted access tokens for a platform (used by the
-- n8n social listeners). Decodes base64 before pgp_sym_decrypt, gates on
-- status = 'active', and reads the account ID from platform_user_id.
-- Returns 3 columns: branch_id, access_token, platform_user_id.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_active_social_tokens(p_platform text)
 RETURNS TABLE(branch_id text, access_token text, platform_user_id text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY
  SELECT sc.branch_id::text,
    pgp_sym_decrypt(decode(sc.access_token_encrypted, 'base64'), get_encryption_key()),
    sc.platform_user_id
  FROM social_credentials sc
  WHERE sc.platform = p_platform AND sc.status = 'active';
END;
$function$;


-- ============================================================
-- FUNCTION: get_meta_insight_credentials(p_branch_id TEXT)
-- RETURNS JSON  -- { facebook: {access_token, platform_user_id}, instagram: {...} }
-- Used by the meta-insights Edge Function to read decrypted Page/IG tokens
-- + platform IDs in one call. Tokens never reach the browser.
--
-- !! NOTE: the constants.ts copy uses the OLD BYTEA form
-- !! (pgp_sym_decrypt(access_token_encrypted, ...)). The DEPLOYED column is
-- !! TEXT/base64 — the live body below base64-decodes first.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_meta_insight_credentials(p_branch_id text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE result JSON;
BEGIN
  SELECT json_object_agg(platform, json_build_object(
    'access_token', pgp_sym_decrypt(decode(access_token_encrypted,'base64'), get_encryption_key()),
    'platform_user_id', platform_user_id
  )) INTO result
  FROM social_credentials
  WHERE branch_id = p_branch_id AND platform IN ('facebook','instagram');
  RETURN COALESCE(result,'{}'::json);
END; $function$;


-- ============================================================
-- FUNCTION: list_social_connections(p_branch_id text)
-- RETURNS jsonb -- array of per-platform connection rows for a branch
-- (id, platform, app_id, status, platform_metadata, granted_scopes,
--  timestamps — never tokens).
-- ============================================================
CREATE OR REPLACE FUNCTION public.list_social_connections(p_branch_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', sc.id,
          'platform', sc.platform,
          'app_id', sc.app_id,
          'status', sc.status,
          'platform_metadata', sc.platform_metadata,
          'granted_scopes', sc.granted_scopes,
          'last_used_at', sc.last_used_at,
          'last_refreshed_at', sc.last_refreshed_at,
          'token_expires_at', sc.token_expires_at,
          'created_at', sc.created_at,
          'updated_at', sc.updated_at
        )
      )
      FROM social_credentials sc
      WHERE sc.branch_id = p_branch_id
    ),
    '[]'::jsonb
  );
END;
$function$;


-- ============================================================
-- FUNCTION: revoke_social_credential(p_branch_id text, p_platform text)
-- RETURNS jsonb. Nulls the tokens + expiry, sets status = 'revoked', and
-- stamps revoked_at into platform_metadata. Does NOT delete the row.
-- ============================================================
CREATE OR REPLACE FUNCTION public.revoke_social_credential(p_branch_id text, p_platform text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_id UUID;
BEGIN
  UPDATE social_credentials SET
    access_token_encrypted = NULL,
    refresh_token_encrypted = NULL,
    token_expires_at = NULL,
    status = 'revoked',
    platform_metadata = platform_metadata || jsonb_build_object('revoked_at', now()::text)
  WHERE branch_id = p_branch_id AND platform = p_platform
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No credential found to revoke');
  END IF;

  RETURN jsonb_build_object('success', true, 'credential_id', v_id, 'status', 'revoked');
END;
$function$;
