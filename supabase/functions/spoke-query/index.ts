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
//   { op: "test",     supabase_url, supabase_key, table_name }
//   { op: "discover", supabase_url, supabase_key }
//   { op: "columns",  supabase_url, supabase_key, table_name }
//   { op: "fetch",    connection_id, table_type }   // customers|orders|order_items|subscriptions
//
// SECRETS (auto-set by Supabase): SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Deploy: supabase functions deploy spoke-query   (verify_jwt = true)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const HUB_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BATCH_SIZE = 1000;

// Tables the discovery step probes for (mirrors the old client behavior).
const COMMON_TABLES = [
  "customers", "profiles", "users",
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
    // ── SETUP ops: use caller-supplied creds, store nothing ──────────
    if (op === "test" || op === "discover" || op === "columns") {
      const url = body.supabase_url;
      const key = body.supabase_key;
      if (!url || !key) return json({ error: "supabase_url and supabase_key are required" }, 400);
      const spoke = createClient(url, key);

      if (op === "test") {
        const table = body.table_name || "profiles";
        const { data, error, count } = await spoke
          .from(table).select("*", { count: "exact", head: false }).limit(1);
        if (error) return json({ success: false, error: error.message });
        let columns = data && data.length > 0 ? Object.keys(data[0]) : [];
        if (columns.length === 0) columns = await getColumns(spoke, url, key, table);
        return json({ success: true, rowCount: count ?? data?.length ?? 0, columns });
      }

      if (op === "discover") {
        const found: string[] = [];
        for (const t of COMMON_TABLES) {
          const { error } = await spoke.from(t).select("*").limit(1);
          if (!error) found.push(t);
        }
        return json({ tables: found });
      }

      if (op === "columns") {
        if (!body.table_name) return json({ error: "table_name is required" }, 400);
        const columns = await getColumns(spoke, url, key, body.table_name);
        return json({ columns });
      }
    }

    // ── RUNTIME op: saved connection, key decrypted server-side ───────
    if (op === "fetch") {
      const connectionId = body.connection_id;
      const tableType = body.table_type;
      const validTypes = ["customers", "orders", "order_items", "subscriptions"];
      if (!connectionId || !validTypes.includes(tableType)) {
        return json({ error: "connection_id and a valid table_type are required" }, 400);
      }

      const hub = createClient(HUB_URL, SERVICE_KEY);

      // Load the connection (tables/field-maps come from HERE, not the caller).
      const { data: conn, error: connErr } = await hub
        .from("spoke_connections")
        .select("id, name, supabase_url, tables, status")
        .eq("id", connectionId)
        .single();
      if (connErr || !conn) return json({ error: "Connection not found" }, 404);

      // Decrypt this connection's key (service_role-only RPC).
      const { data: spokeKey, error: keyErr } = await hub
        .rpc("get_spoke_connection_key", { p_connection_id: connectionId });
      if (keyErr || !spokeKey) {
        return json({ error: "Could not resolve connection key" }, 400);
      }

      const spoke = createClient(conn.supabase_url, spokeKey);
      const configs = (conn.tables || []).filter(
        (t: any) => t.table_type === tableType && t.enabled,
      );

      const tables: Array<{ table_name: string; field_mapping: Record<string, string>; rows: unknown[] }> = [];
      const errors: string[] = [];

      for (const cfg of configs) {
        const fields = Object.values(cfg.field_mapping || {}).filter(Boolean) as string[];
        if (fields.length === 0) continue;
        const { rows, error } = await fetchAllRows(spoke, cfg.table_name, fields.join(","));
        if (error) {
          errors.push(`${conn.name}/${cfg.table_name}: ${error}`);
          continue;
        }
        tables.push({ table_name: cfg.table_name, field_mapping: cfg.field_mapping, rows });
      }

      return json({ connection_id: connectionId, name: conn.name, tables, errors });
    }

    return json({ error: `Unknown op: ${op}` }, 400);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ error: message }, 500);
  }
});
