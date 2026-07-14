// Trellis: Spoke Query proxy
// Runs all federated reads against external "spoke" Supabase databases
// SERVER-SIDE so a spoke's key never has to live in the browser or be
// re-fetched to the client for ongoing reads.
//
// Two modes:
//   • SETUP ops (wizard, before a connection is saved) pass supabase_url +
//     supabase_key that the user just typed. Nothing is stored.
//   • RUNTIME ops (saved connection) pass only connection_id; the function
//     decrypts that connection's key via get_spoke_connection_key (service_role
//     only) and reads using the tables/field-maps stored ON the connection row
//     — never a table/columns chosen by the caller. This prevents a logged-in
//     user from proxying arbitrary-table reads with a privileged spoke key.
//
// Call: POST /spoke-query { op, ... }
//   { op: "test",     supabase_url, supabase_key, table_name }   // setup
//   { op: "test",     connection_id, table_name? }               // runtime
//   { op: "discover", supabase_url, supabase_key }               // setup
//   { op: "columns",  supabase_url, supabase_key, table_name }   // setup
//   { op: "fetch",    connection_id, table_type }                // runtime
//   { op: "snapshot", connection_id }                            // runtime
//   { op: "newsletter_audience", connection_id, tags? }           // runtime ATL RPC
//
// SECRETS (auto-set by Supabase): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Deploy: supabase functions deploy spoke-query   (verify_jwt = true)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const HUB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BATCH_SIZE = 1000;
const SNAPSHOT_NAME_SAMPLE = 500;
const SNAPSHOT_TOTAL_SAMPLE = 5000;
const SNAPSHOT_PRODUCT_SAMPLE = 2000;
const RPC_PAGE_SIZE = 1000;

// Tables the discovery step probes first. Full discovery below also reads the
// spoke's OpenAPI document, so a spoke is not required to use any of these
// conventional names.
const COMMON_TABLES = [
  "customers", "profiles", "user_profiles", "users",
  "orders", "order_items", "legacy_orders", "legacy_order_items",
  "subscriptions", "payments", "products",
  "newsletter_subscribers", "customer_tags", "customer_addresses",
];

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

// ── Column discovery ────────────────────────────────────────────────
// Prefer real rows; fall back to CSV header; finally the PostgREST OpenAPI
// spec, which lists columns even for empty or RLS-hidden tables.
async function columnsFromOpenApi(url: string, key: string, table: string): Promise<string[]> {
  try {
    const res = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return [];
    const spec = await res.json();
    const props = spec?.definitions?.[table]?.properties;
    return props ? Object.keys(props) : [];
  } catch {
    return [];
  }
}

// PostgREST publishes the exposed tables/views in its OpenAPI paths. This is
// the only schema listing available to a remote Supabase project through its
// Data API; information_schema is not exposed over PostgREST.
async function tablesFromOpenApi(url: string, key: string): Promise<string[]> {
  try {
    const res = await fetch(`${url}/rest/v1/`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!res.ok) return [];
    const spec = await res.json();
    const paths = spec?.paths;
    if (!paths || typeof paths !== "object") return [];

    return Object.keys(paths)
      .filter((path) => path.startsWith("/") && !path.startsWith("/rpc/"))
      .map((path) => decodeURIComponent(path.slice(1)))
      // Supabase table names are normally simple identifiers. Keeping this
      // guard means discovery cannot send arbitrary paths to PostgREST.
      .filter((name) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name));
  } catch {
    return [];
  }
}

async function getColumns(client: any, url: string, key: string, table: string): Promise<string[]> {
  // 1. Row-key inference
  const { data } = await client.from(table).select("*").limit(1);
  if (data && data.length > 0) return Object.keys(data[0]);

  // 2. CSV header (works when a row exists but was returned oddly)
  try {
    const { data: csv } = await client.from(table).select("*").limit(1).csv();
    const header = String(csv || "").trim().split("\n")[0];
    if (header) return header.split(",").map((c: string) => c.replace(/^"|"$/g, ""));
  } catch { /* ignore */ }

  // 3. OpenAPI — the only path that survives 0-row / RLS-hidden tables
  return await columnsFromOpenApi(url, key, table);
}

// Paginated full-table read.
async function fetchAllRows(client: any, table: string, select: string) {
  const all: Record<string, unknown>[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await client.from(table).select(select).range(offset, offset + BATCH_SIZE - 1);
    if (error) return { rows: all, error: error.message };
    if (!data || data.length === 0) break;
    all.push(...data);
    offset += data.length;
    if (data.length < BATCH_SIZE) break;
  }
  return { rows: all, error: null as string | null };
}

// Resolve a saved connection + its decrypted key (RUNTIME ops).
async function resolveConnection(hub: any, connectionId: string) {
  const { data: conn, error: connErr } = await hub
    .from("spoke_connections")
    .select("id, name, supabase_url, tables, status")
    .eq("id", connectionId)
    .single();
  if (connErr || !conn) return { error: "Connection not found" as string };

  const { data: key, error: keyErr } = await hub
    .rpc("get_spoke_connection_key", { p_connection_id: connectionId });
  if (keyErr || !key) return { error: "Could not resolve connection key" as string };

  return { conn, key };
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

  const op = body?.op;
  if (!op) return json({ error: "op is required" }, 400);

  try {
    // ── test: SETUP (url+key) OR RUNTIME (connection_id, decrypt) ─────
    if (op === "test") {
      let url = body.supabase_url;
      let key = body.supabase_key;
      let table = body.table_name;

      if (body.connection_id) {
        const hub = createClient(HUB_URL, SERVICE_KEY);
        const resolved = await resolveConnection(hub, body.connection_id);
        if ("error" in resolved) return json({ success: false, error: resolved.error });
        url = resolved.conn.supabase_url;
        key = resolved.key;
        if (!table) {
          const cust = (resolved.conn.tables || []).find((t: any) => t.table_type === "customers");
          table = cust?.table_name || "profiles";
        }
      }

      if (!url || !key) return json({ success: false, error: "supabase_url and supabase_key (or connection_id) are required" });
      table = table || "profiles";
      const spoke = createClient(url, key);
      const { data, error, count } = await spoke
        .from(table).select("*", { count: "exact", head: false }).limit(1);
      if (error) return json({ success: false, error: error.message });
      let columns = data && data.length > 0 ? Object.keys(data[0]) : [];
      if (columns.length === 0) columns = await getColumns(spoke, url, key, table);
      return json({ success: true, rowCount: count ?? data?.length ?? 0, columns });
    }

    // ── discover / columns: SETUP only (caller-supplied creds) ───────
    if (op === "discover" || op === "columns") {
      const url = body.supabase_url;
      const key = body.supabase_key;
      if (!url || !key) return json({ error: "supabase_url and supabase_key are required" }, 400);
      const spoke = createClient(url, key);

      if (op === "discover") {
        const candidates = new Set([
          ...COMMON_TABLES,
          ...await tablesFromOpenApi(url, key),
        ]);
        const found: string[] = [];
        for (const t of candidates) {
          const { error } = await spoke.from(t).select("*").limit(1);
          if (!error) found.push(t);
        }
        return json({ tables: found.sort((a, b) => a.localeCompare(b)) });
      }

      // columns
      if (!body.table_name) return json({ error: "table_name is required" }, 400);
      const columns = await getColumns(spoke, url, key, body.table_name);
      return json({ columns });
    }

    // ── fetch: RUNTIME bulk read (raw rows + field_mapping per table) ──
    if (op === "fetch") {
      const tableType = body.table_type;
      const validTypes = ["customers", "orders", "order_items", "subscriptions"];
      if (!body.connection_id || !validTypes.includes(tableType)) {
        return json({ error: "connection_id and a valid table_type are required" }, 400);
      }

      const hub = createClient(HUB_URL, SERVICE_KEY);
      const resolved = await resolveConnection(hub, body.connection_id);
      if ("error" in resolved) return json({ error: resolved.error }, 404);

      const spoke = createClient(resolved.conn.supabase_url, resolved.key);
      const configs = (resolved.conn.tables || []).filter(
        (t: any) => t.table_type === tableType && t.enabled,
      );

      const tables: Array<{ table_name: string; field_mapping: Record<string, string>; rows: unknown[] }> = [];
      const errors: string[] = [];
      for (const cfg of configs) {
        const fields = Object.values(cfg.field_mapping || {}).filter(Boolean) as string[];
        if (fields.length === 0) continue;
        const { rows, error } = await fetchAllRows(spoke, cfg.table_name, fields.join(","));
        if (error) { errors.push(`${resolved.conn.name}/${cfg.table_name}: ${error}`); continue; }
        tables.push({ table_name: cfg.table_name, field_mapping: cfg.field_mapping, rows });
      }
      return json({ connection_id: body.connection_id, name: resolved.conn.name, tables, errors });
    }

    // ── newsletter_audience: RUNTIME ATL active newsletter audience ───
    // ATL's newsletter_subscribers table is the subscription source of truth,
    // but table reads can be RLS-hidden. The spoke owns a SECURITY DEFINER RPC
    // that exposes only mailable status='active' subscribers.
    if (op === "newsletter_audience") {
      if (!body.connection_id) return json({ error: "connection_id is required" }, 400);

      const hub = createClient(HUB_URL, SERVICE_KEY);
      const resolved = await resolveConnection(hub, body.connection_id);
      if ("error" in resolved) return json({ error: resolved.error }, 404);

      const spoke = createClient(resolved.conn.supabase_url, resolved.key);
      const tags = Array.isArray(body.tags) && body.tags.length > 0 ? body.tags : null;
      const rows: unknown[] = [];
      const errors: string[] = [];
      let page = 0;

      while (true) {
        const from = page * RPC_PAGE_SIZE;
        const to = from + RPC_PAGE_SIZE - 1;
        const { data, error } = await spoke
          .rpc("resolve_newsletter_audience", { p_tags: tags })
          .range(from, to);

        if (error) {
          errors.push(error.message);
          break;
        }
        if (!data || data.length === 0) break;
        rows.push(...data);
        if (data.length < RPC_PAGE_SIZE) break;
        page++;
        if (page > 50) {
          errors.push("newsletter_audience pagination guard tripped");
          break;
        }
      }

      return json({ connection_id: body.connection_id, name: resolved.conn.name, rows, errors });
    }

    // ── snapshot: RUNTIME aggregate bundle (client builds the snapshot) ─
    if (op === "snapshot") {
      if (!body.connection_id) return json({ error: "connection_id is required" }, 400);

      const hub = createClient(HUB_URL, SERVICE_KEY);
      const resolved = await resolveConnection(hub, body.connection_id);
      if ("error" in resolved) return json({ error: resolved.error }, 404);

      const spoke = createClient(resolved.conn.supabase_url, resolved.key);
      const allTables = resolved.conn.tables || [];

      let total_profiles = 0;
      let active_subscribers = 0;
      const first_names: string[] = [];

      const custCfg = allTables.find((t: any) => t.table_type === "customers" && t.enabled);
      if (custCfg) {
        const fm = custCfg.field_mapping || {};
        const { count } = await spoke.from(custCfg.table_name).select("*", { count: "exact", head: true });
        total_profiles = count ?? 0;

        if (fm.first_name) {
          const { data } = await spoke.from(custCfg.table_name).select(fm.first_name).limit(SNAPSHOT_NAME_SAMPLE);
          for (const r of data || []) {
            const v = (r as any)[fm.first_name];
            if (v) first_names.push(String(v));
          }
        }
        if (fm.subscribed) {
          const { count: subCount } = await spoke
            .from(custCfg.table_name).select("*", { count: "exact", head: true }).eq(fm.subscribed, true);
          active_subscribers = subCount ?? 0;
        }
      }

      let total_orders = 0;
      const order_totals: number[] = [];
      for (const cfg of allTables.filter((t: any) => t.table_type === "orders" && t.enabled)) {
        const fm = cfg.field_mapping || {};
        const { count } = await spoke.from(cfg.table_name).select("*", { count: "exact", head: true });
        total_orders += count ?? 0;
        if (fm.total && order_totals.length < SNAPSHOT_TOTAL_SAMPLE) {
          const { data } = await spoke.from(cfg.table_name).select(fm.total).limit(SNAPSHOT_TOTAL_SAMPLE - order_totals.length);
          for (const r of data || []) {
            const v = parseFloat((r as any)[fm.total]);
            if (!isNaN(v)) order_totals.push(v);
          }
        }
      }

      const product_names: string[] = [];
      for (const cfg of allTables.filter((t: any) => t.table_type === "order_items" && t.enabled)) {
        const fm = cfg.field_mapping || {};
        if (fm.product_name && product_names.length < SNAPSHOT_PRODUCT_SAMPLE) {
          const { data } = await spoke.from(cfg.table_name).select(fm.product_name).limit(SNAPSHOT_PRODUCT_SAMPLE - product_names.length);
          for (const r of data || []) {
            const v = (r as any)[fm.product_name];
            if (v) product_names.push(String(v));
          }
        }
      }

      return json({
        connection_id: body.connection_id,
        name: resolved.conn.name,
        supabase_url: resolved.conn.supabase_url,
        total_profiles,
        active_subscribers,
        first_names,
        total_orders,
        order_totals,
        product_names,
      });
    }

    // ── Video Ad Lab templates (video_ad_templates lives on the spoke) ──
    // Fixed table name (not caller-chosen) → no arbitrary-table exposure.
    if (op === "template_list" || op === "template_save" || op === "template_delete") {
      if (!body.connection_id) return json({ error: "connection_id is required" }, 400);
      const hub = createClient(HUB_URL, SERVICE_KEY);
      const resolved = await resolveConnection(hub, body.connection_id);
      if ("error" in resolved) return json({ error: resolved.error }, 404);
      const spoke = createClient(resolved.conn.supabase_url, resolved.key);

      if (op === "template_list") {
        const { data, error } = await spoke
          .from("video_ad_templates")
          .select("*")
          .eq("branch", body.branch)
          .order("created_at", { ascending: false });
        if (error) return json({ error: error.message }, 400);
        return json({ templates: data || [] });
      }

      if (op === "template_save") {
        if (!body.branch || !body.template_name) {
          return json({ error: "branch and template_name are required" }, 400);
        }
        const { error } = await spoke
          .from("video_ad_templates")
          .insert({ branch: body.branch, template_name: body.template_name, settings: body.settings || {} });
        if (error) return json({ error: error.message }, 400);
        return json({ success: true });
      }

      // template_delete
      if (!body.id) return json({ error: "id is required" }, 400);
      const { error } = await spoke.from("video_ad_templates").delete().eq("id", body.id);
      if (error) return json({ error: error.message }, 400);
      return json({ success: true });
    }

    return json({ error: `Unknown op: ${op}` }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ error: message }, 500);
  }
});
