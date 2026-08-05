import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// The human-facing confirmation lives on the app domain, NOT here. Supabase's
// functions gateway forces `Content-Type: text/plain` + a `sandbox` CSP on every
// response from *.supabase.co/functions/v1, so a styled HTML page can never render
// from this endpoint (the browser shows raw source). So we record the suppression
// and 302 to the static /unsubscribed.html page, which the app server serves as
// real text/html. Only a brand DISPLAY name (or slug) is passed in the URL — never
// the email address (no PII in URLs).
const APP_URL = "https://trellis.sproutify.app";

const redirect = (query: string) =>
  new Response(null, {
    status: 302,
    headers: { Location: `${APP_URL}/unsubscribed.html${query}`, "cache-control": "no-store" },
  });

Deno.serve(async (req: Request) => {
  const isPost = req.method === "POST"; // RFC 8058 one-click (List-Unsubscribe-Post)
  const url = new URL(req.url);
  let email = url.searchParams.get("email") || "";
  // `scope`: 'global' = removed from ALL Sproutify marketing; '<branch slug>' = one
  // brand only. Legacy `source` param still honored for links already in inboxes.
  let scope = url.searchParams.get("scope") || url.searchParams.get("source") || "global";

  if (isPost) {
    try {
      const ct = req.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        const b = await req.json();
        email = b.email || email; scope = b.scope || b.source || scope;
      } else {
        const f = await req.formData();
        email = (f.get("email") as string) || email;
        scope = (f.get("scope") as string) || (f.get("source") as string) || scope;
      }
    } catch { /* ignore body parse errors */ }
  }

  email = email.trim().toLowerCase();
  scope = (scope || "global").trim().toLowerCase();

  if (!email || !email.includes("@")) {
    // Mail servers (one-click POST) get a status code; humans get the styled page.
    return isPost ? new Response("invalid email", { status: 400 }) : redirect("?status=invalid");
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Friendly brand name for the confirmation page (branch scopes only).
  let brandName = "";
  if (scope !== "global") {
    const { data: b } = await supabase.from("branches").select("name").eq("slug", scope).maybeSingle();
    if (b?.name) brandName = b.name;
  }

  const { error } = await supabase.from("email_suppressions").upsert(
    { email, scope, reason: "unsubscribe", source: scope === "global" ? "unsubscribe-global" : "unsubscribe-branch", created_at: new Date().toISOString() },
    { onConflict: "email,scope" },
  );

  if (error) {
    console.error("unsubscribe upsert failed:", error.message);
    return isPost ? new Response("error", { status: 500 }) : redirect("?status=error");
  }

  if (isPost) return new Response("ok", { status: 200 });
  // Global unsubscribe → no brand param (page shows the all-brands message).
  // Branch unsubscribe → brand name (falls back to the slug if the name lookup missed),
  // so the page never falsely claims "all brands" for a single-brand opt-out.
  if (scope === "global") return redirect("");
  return redirect(`?brand=${encodeURIComponent(brandName || scope)}`);
});
