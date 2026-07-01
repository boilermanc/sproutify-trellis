// ═══════════════════════════════════════════════════════════════
// TRELLIS INVITE (trellis_users) EDGE FUNCTION
// supabase/functions/invite-trellis-user/index.ts
// ═══════════════════════════════════════════════════════════════
//
// Invites an operator into the trellis_users system (the owner/admin/
// operator/analyst/viewer roster surfaced in Settings → Team).
//
// Flow:
//   1. Verify the caller is a signed-in trellis owner/admin (RLS "read
//      self" lets them read their own trellis_users row).
//   2. Upsert the trellis_users row (status 'invited') BEFORE sending
//      the invite, so the on_auth_user_created trigger links
//      auth_user_id + flips status to 'active' the moment the auth user
//      is created.
//   3. inviteUserByEmail() — creates the auth user and sends the
//      Supabase "Invite user" email (uses the configured template).
//
// Distinct from invite-user (which is the profiles-based Team Members
// system and only accepts admin|marketer|developer|viewer).
//
// DEPLOY:
//   supabase functions deploy invite-trellis-user
//   (WITH jwt verification — callers must be signed in)
//
// SECRETS (auto-set by Supabase): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
// OPTIONAL: TRELLIS_APP_URL (invite redirect target)
// ═══════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const APP_URL = Deno.env.get("TRELLIS_APP_URL") || "https://trellis.sproutify.app";

const VALID_ROLES = ["owner", "admin", "operator", "analyst", "viewer"];
const MANAGER_ROLES = ["owner", "admin"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  // ─── 1. Verify the caller is a signed-in trellis owner/admin ──
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ error: "Missing authorization header" }, 401);
  }

  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: caller, error: callerErr } = await callerClient.auth.getUser();
  if (callerErr || !caller?.user) {
    return json({ error: "Invalid or expired session" }, 401);
  }

  // "Users read self" RLS policy lets the caller read their own row.
  const { data: me, error: meErr } = await callerClient
    .from("trellis_users")
    .select("role, status")
    .eq("auth_user_id", caller.user.id)
    .maybeSingle();

  if (meErr) return json({ error: meErr.message }, 500);
  if (!me || me.status !== "active" || !MANAGER_ROLES.includes(me.role)) {
    return json({ error: "Only active owners or admins can invite users" }, 403);
  }

  // ─── 2. Validate input ──────────────────────────────────────
  let body: { email?: string; full_name?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const email = (body.email || "").trim().toLowerCase();
  const full_name = (body.full_name || "").trim();
  const role = (body.role || "operator").trim();

  if (!email || !email.includes("@")) return json({ error: "Valid email is required" }, 400);
  if (!VALID_ROLES.includes(role)) return json({ error: "Invalid role" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // ─── 3. Guard: don't re-invite an already-linked account ────
  const { data: existing } = await admin
    .from("trellis_users")
    .select("id, status, auth_user_id")
    .eq("email", email)
    .maybeSingle();

  if (existing?.auth_user_id) {
    return json({ error: "That email already has an active account." }, 409);
  }

  // ─── 4. Upsert the trellis_users row BEFORE inviting ────────
  // (so the on_auth_user_created trigger can link it immediately)
  const { error: upsertErr } = await admin.from("trellis_users").upsert(
    {
      email,
      full_name: full_name || null,
      role,
      status: "invited",
    },
    { onConflict: "email" }
  );

  if (upsertErr) return json({ error: `Could not save user: ${upsertErr.message}` }, 500);

  // ─── 5. Send the invite (creates the auth user) ─────────────
  const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: APP_URL,
    data: { first_name: full_name || email.split("@")[0] },
  });

  if (inviteErr || !invited?.user) {
    return json({ error: inviteErr?.message || "Failed to send invite" }, 400);
  }

  return json({ success: true, user_id: invited.user.id, email, role });
});
