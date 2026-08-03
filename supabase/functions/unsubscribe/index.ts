import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const page = (title: string, msg: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>` +
  `<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center}` +
  `.card{background:#fff;max-width:460px;margin:16px;padding:44px 40px;border-radius:24px;box-shadow:0 10px 40px rgba(0,0,0,.08);text-align:center}` +
  `.h{color:#059669;font-weight:800;font-size:22px;margin:0 0 14px;letter-spacing:-.3px}.p{color:#475569;font-size:15px;line-height:1.65;margin:0}</style>` +
  `</head><body><div class="card"><p class="h">${title}</p><p class="p">${msg}</p></div></body></html>`;

const html = (body: string, status: number) =>
  new Response(body, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  let email = url.searchParams.get("email") || "";
  // `scope` decides how far the unsubscribe reaches:
  //   'global'        -> removed from ALL Sproutify marketing (every branch)
  //   '<branch slug>' -> removed from that one brand only (per-branch unsubscribe)
  // Fall back to the legacy `source` param so links already in inboxes keep working.
  let scope = url.searchParams.get("scope") || url.searchParams.get("source") || "global";

  // RFC 8058 one-click unsubscribe (List-Unsubscribe-Post) arrives as POST
  if (req.method === "POST") {
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
    return html(page("Invalid link", "This unsubscribe link is missing a valid email address. Please contact support if you keep receiving mail."), 400);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  // Resolve a friendly brand name for the confirmation page (branch scopes only).
  let brandName = "Sproutify";
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
    return html(page("Something went wrong", "We couldn't process your request right now. Please try again in a moment."), 500);
  }

  const scopeMsg = scope === "global"
    ? `<b>${email}</b> has been removed from Sproutify marketing emails. You won't receive further campaigns from any of our brands.`
    : `<b>${email}</b> has been removed from <b>${brandName}</b> marketing emails. You'll still receive emails from other Sproutify brands you signed up for.`;

  return html(page("You're unsubscribed", `${scopeMsg} Changed your mind? Just reply to any past email and we'll help you re-subscribe.`), 200);
});
