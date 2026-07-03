// Trellis: Scrape Site
// Server-side fetch of a public web page (no browser CORS limits) to pull the
// REAL content a brand extractor needs: title/description, on-page colors,
// fonts, and visible text. The browser can't fetch arbitrary sites; this can.
//
// Call: POST /scrape-site { "url": "https://example.com" }
// Returns: { url, title, description, themeColor, ogImage, colors[], fonts[], text }
//
// Deploy: supabase functions deploy scrape-site   (verify_jwt = true)

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, apikey, x-client-info, x-supabase-api-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const UA =
  "Mozilla/5.0 (compatible; TrellisBrandBot/1.0; +https://trellis.sproutify.app)";
const HTML_CAP = 600_000; // chars
const CSS_CAP = 200_000;
const MAX_STYLESHEETS = 4;
const FETCH_TIMEOUT_MS = 8000;

// Basic SSRF guard — only public http(s), no loopback/private ranges.
function isBlockedHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const a = +m[1], b = +m[2];
    if (a === 0 || a === 127 || a === 10) return true;
    if (a === 169 && b === 254) return true;      // link-local
    if (a === 192 && b === 168) return true;      // private
    if (a === 172 && b >= 16 && b <= 31) return true; // private
  }
  return false;
}

async function timedFetch(url: string): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,text/css,*/*" },
      redirect: "follow",
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(t);
  }
}

function normalizeHex(hex: string): string {
  let h = hex.toLowerCase();
  if (h.length === 4) h = "#" + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
  return h;
}

function firstMatch(re: RegExp, s: string): string {
  return (s.match(re)?.[1] || "").trim();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const raw = String(body?.url || "").trim();
  if (!raw) return json({ error: "url is required" }, 400);

  let target: URL;
  try {
    target = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return json({ error: "Invalid URL" }, 400);
  }
  if (!["http:", "https:"].includes(target.protocol) || isBlockedHost(target.hostname)) {
    return json({ error: "URL not allowed" }, 400);
  }

  try {
    const res = await timedFetch(target.toString());
    if (!res.ok) return json({ error: `Site returned ${res.status}`, url: target.toString() }, 200);
    const html = (await res.text()).slice(0, HTML_CAP);

    // ── Meta ──────────────────────────────────────────────────────────
    const title = firstMatch(/<title[^>]*>([^<]*)<\/title>/i, html);
    const description = firstMatch(
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i, html);
    const themeColor = firstMatch(
      /<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']*)["']/i, html);
    const ogImageRaw = firstMatch(
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)["']/i, html);
    let ogImage = "";
    if (ogImageRaw) { try { ogImage = new URL(ogImageRaw, target).toString(); } catch { /* ignore */ } }

    // ── CSS text: inline <style>, style="" attrs, and linked stylesheets ─
    let cssText = "";
    for (const m of html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) cssText += "\n" + m[1];
    for (const m of html.matchAll(/style=["']([^"']*)["']/gi)) cssText += ";" + m[1];

    const hrefs: string[] = [];
    for (const m of html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi)) {
      const href = m[0].match(/href=["']([^"']+)["']/i)?.[1];
      if (href) hrefs.push(href);
    }
    for (const href of hrefs.slice(0, MAX_STYLESHEETS)) {
      try {
        const cssUrl = new URL(href, target).toString();
        const cres = await timedFetch(cssUrl);
        if (cres.ok) cssText += "\n" + (await cres.text()).slice(0, CSS_CAP);
      } catch { /* skip */ }
    }

    // ── Colors (hex) ranked by frequency ────────────────────────────────
    const colorCounts = new Map<string, number>();
    const haystack = cssText + " " + html;
    for (const m of haystack.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)) {
      const c = normalizeHex(m[0]);
      colorCounts.set(c, (colorCounts.get(c) || 0) + 1);
    }
    if (themeColor && /^#[0-9a-fA-F]{3,6}$/.test(themeColor)) {
      const c = normalizeHex(themeColor);
      colorCounts.set(c, (colorCounts.get(c) || 0) + 1000); // strong signal
    }
    const colors = [...colorCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 14)
      .map(([c]) => c);

    // ── Fonts ───────────────────────────────────────────────────────────
    const fontSet = new Set<string>();
    for (const m of cssText.matchAll(/font-family\s*:\s*([^;}{"']+)/gi)) {
      const fam = m[1].split(",")[0].trim().replace(/["']/g, "");
      if (fam && !fam.startsWith("var(") && !fam.startsWith("-") && fam.length < 40) {
        fontSet.add(fam);
      }
    }
    const fonts = [...fontSet].slice(0, 8);

    // ── Visible text ────────────────────────────────────────────────────
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 5000);

    return json({
      url: target.toString(),
      title,
      description,
      themeColor,
      ogImage,
      colors,
      fonts,
      text,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ error: `Fetch failed: ${message}`, url: target.toString() }, 200);
  }
});
