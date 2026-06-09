// ═══════════════════════════════════════════════════════════════
// TRELLIS INVITE USER EDGE FUNCTION
// supabase/functions/invite-user/index.ts
// ═══════════════════════════════════════════════════════════════
//
// Invites a new team member: creates a Supabase auth user (sends an
// invite email where they set their password) and upserts a matching
// profile row with the assigned role.
//
// Runs with service_role so it bypasses the profiles RLS policy.
// The CALLER must be an authenticated admin — we verify their JWT
// and check their profile.role === 'admin' before doing anything.
//
// POST body: { email: string, first_name: string, role: Role }
//   Role = 'admin' | 'marketer' | 'developer' | 'viewer'
//
// DEPLOY:
//   supabase functions deploy invite-user
//   (NOTE: deploy WITH jwt verification — callers must be signed in)
//
// SECRETS (auto-set by Supabase):
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   SUPABASE_ANON_KEY
// OPTIONAL:
//   TRELLIS_APP_URL  (invite redirect target, e.g. https://trellis.sproutify.app)
// ═══════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const APP_URL = Deno.env.get("TRELLIS_APP_URL") || "https://trellis.sproutify.app";

const VALID_ROLES = ["admin", "marketer", "developer", "viewer"];

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

  // ─── 1. Verify the caller is a signed-in admin ──────────────
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

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  const { data: callerProfile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", caller.user.id)
    .maybeSingle();

  if (callerProfile?.role !== "admin") {
    return json({ error: "Only admins can invite users" }, 403);
  }

  // ─── 2. Validate input ──────────────────────────────────────
  let body: { email?: string; first_name?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const email = (body.email || "").trim().toLowerCase();
  const first_name = (body.first_name || "").trim();
  const role = body.role || "";

  if (!email || !email.includes("@")) return json({ error: "Valid email is required" }, 400);
  if (!first_name) return json({ error: "First name is required" }, 400);
  if (!VALID_ROLES.includes(role)) return json({ error: "Invalid role" }, 400);

  // ─── 3. Send the invite (creates the auth user) ─────────────
  const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: APP_URL,
    data: { first_name, role },
  });

  if (inviteErr || !invited?.user) {
    // Most common: user already exists in auth
    return json({ error: inviteErr?.message || "Failed to send invite" }, 400);
  }

  // ─── 4. Upsert the profile row (id matches auth user) ───────
  const { error: profileErr } = await admin.from("profiles").upsert(
    {
      id: invited.user.id,
      email,
      first_name,
      role,
      status: "active",
      is_subscribed: false,
      marketing_pause: true,
      metadata: { invite_status: "pending", invited_by: caller.user.email },
    },
    { onConflict: "email" }
  );

  if (profileErr) {
    return json({ error: `Invite sent but profile failed: ${profileErr.message}` }, 500);
  }

  return json({ success: true, user_id: invited.user.id, email });
});
