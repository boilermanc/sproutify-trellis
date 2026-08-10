// One-off backfill: reconcile the Trellis Hub's email history into ATL's
// newsletter_subscribers so ATL reflects engagement + opt-outs for mail that was
// sent through Trellis/Resend.
//
// Two passes, both IDEMPOTENT (absolute values / neq guards), so re-running is safe:
//   Pass A — engagement: per-subscriber open/click counts + last_* timestamps,
//            from Hub email_events (ATL campaigns only).
//   Pass B — status: anyone on the Hub suppression list (unsubscribe/complaint/
//            bounce, scoped atlurbanfarms or global) is marked unsubscribed in ATL,
//            but only if still active (won't clobber an existing unsubscribed_at).
//
// This mirrors what the live resend-webhook now does going forward; it only fills
// in the history that predates the live sync.
//
// Requires Node 18+ (global fetch). Pass keys via env — never hardcode them:
//   HUB_URL=https://horvjqqifgrzxesuxtfm.supabase.co
//   HUB_KEY=<Hub service_role or sb_secret_...>
//   ATL_URL=https://povudgtvzggnxwgtjexa.supabase.co
//   ATL_KEY=<ATL sb_secret_...>
//   DRY_RUN=1   (optional — report what WOULD change without writing)
//
//   node scripts/backfill-atl-engagement.mjs

const { HUB_URL, HUB_KEY, ATL_URL, ATL_KEY, DRY_RUN } = process.env;
for (const [k, v] of Object.entries({ HUB_URL, HUB_KEY, ATL_URL, ATL_KEY })) {
  if (!v) { console.error(`Missing env var: ${k}`); process.exit(1); }
}
const dry = DRY_RUN === "1" || DRY_RUN === "true";
const hubHeaders = { apikey: HUB_KEY, Authorization: `Bearer ${HUB_KEY}` };
const atlHeaders = { apikey: ATL_KEY, Authorization: `Bearer ${ATL_KEY}`, "Content-Type": "application/json" };

const maxTs = (x, y) => (!x || (y && y > x) ? y : x);
const minTs = (x, y) => (!x || (y && y < x) ? y : x);

async function hubGet(path) {
  const res = await fetch(`${HUB_URL}/rest/v1/${path}`, { headers: hubHeaders });
  if (!res.ok) throw new Error(`Hub GET ${path} -> ${res.status} ${await res.text()}`);
  return res.json();
}
async function atlPatch(query, body) {
  if (dry) return { dry: true, rows: 1 };
  const res = await fetch(`${ATL_URL}/rest/v1/newsletter_subscribers?${query}`, {
    method: "PATCH",
    headers: { ...atlHeaders, Prefer: "return=representation" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`ATL PATCH ${query} -> ${res.status} ${await res.text()}`);
  return { rows: (await res.json()).length };
}

// ── Pass A: engagement aggregates from Hub email_events ──────────────────────
const atlCampaigns = await hubGet(`campaigns?select=id&branches=cs.${encodeURIComponent('["atlurbanfarms"]')}`);
const ids = atlCampaigns.map((c) => c.id);
if (!ids.length) { console.error("No ATL campaigns found on the Hub."); process.exit(1); }
const idFilter = `campaign_id=in.(${ids.join(",")})`;

const agg = new Map();
const PAGE = 1000;
for (let offset = 0; ; offset += PAGE) {
  const rows = await hubGet(`email_events?select=email,event_type,occurred_at&${idFilter}&order=occurred_at.asc&limit=${PAGE}&offset=${offset}`);
  for (const r of rows) {
    const email = (r.email || "").toLowerCase();
    if (!email) continue;
    const a = agg.get(email) || { opens: 0, lastOpen: null, clicks: 0, lastClick: null, lastEmailed: null, bouncedAt: null, complainedAt: null, lastEvent: null };
    const t = r.occurred_at;
    if (r.event_type === "opened") { a.opens++; a.lastOpen = maxTs(a.lastOpen, t); }
    else if (r.event_type === "clicked") { a.clicks++; a.lastClick = maxTs(a.lastClick, t); }
    else if (r.event_type === "sent" || r.event_type === "delivered") a.lastEmailed = maxTs(a.lastEmailed, t);
    else if (r.event_type === "bounced") a.bouncedAt = minTs(a.bouncedAt, t);
    else if (r.event_type === "complained") a.complainedAt = minTs(a.complainedAt, t);
    a.lastEvent = maxTs(a.lastEvent, t);
    agg.set(email, a);
  }
  if (rows.length < PAGE) break;
}

const engaged = [...agg.entries()].filter(([, a]) => a.opens || a.clicks || a.bouncedAt || a.complainedAt);
console.log(`Pass A: aggregated ${agg.size} emails; ${engaged.length} with engagement.${dry ? " [DRY RUN]" : ""}`);

let aUpdated = 0, aMissing = 0;
for (const [email, a] of engaged) {
  const body = {
    open_count: a.opens,
    last_opened_at: a.lastOpen,
    click_count: a.clicks,
    last_clicked_at: a.lastClick,
    last_engagement_at: a.lastEvent,
  };
  if (a.lastEmailed) body.last_emailed_at = a.lastEmailed;
  if (a.bouncedAt) body.bounced_at = a.bouncedAt;
  if (a.complainedAt) body.complained_at = a.complainedAt;
  const { rows } = await atlPatch(`email=eq.${encodeURIComponent(email)}`, body);
  if (rows) aUpdated++; else aMissing++;
  if ((aUpdated + aMissing) % 250 === 0) console.log(`  ...${aUpdated + aMissing}/${engaged.length}`);
}
console.log(`Pass A done: updated ${aUpdated}, not-in-ATL ${aMissing}.`);

// ── Pass B: status from Hub suppression list ─────────────────────────────────
const supp = await hubGet(`email_suppressions?select=email,reason,created_at&reason=in.(unsubscribe,complaint,bounce)&scope=in.(atlurbanfarms,global)`);
console.log(`Pass B: ${supp.length} suppressed addresses to reconcile.`);
let bUpdated = 0, bSkipped = 0;
for (const s of supp) {
  const email = (s.email || "").toLowerCase();
  if (!email) continue;
  // Only flip rows still active — never overwrite an existing unsubscribed_at.
  const { rows } = await atlPatch(
    `email=eq.${encodeURIComponent(email)}&status=neq.unsubscribed`,
    { status: "unsubscribed", unsubscribed_at: s.created_at },
  );
  if (rows) bUpdated++; else bSkipped++;
}
console.log(`Pass B done: newly unsubscribed ${bUpdated}, already-out/not-in-ATL ${bSkipped}.`);
console.log(dry ? "DRY RUN complete — no writes made." : "Backfill complete.");
