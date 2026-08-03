import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";

export const HUB_URL = Deno.env.get("SUPABASE_URL")!;
export const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
export const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
export const ORG_ID = "00000000-0000-0000-0000-000000000001";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, apikey, x-client-info, x-supabase-api-version, x-trellis-refresh-secret",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

export function adminClient(): SupabaseClient {
  return createClient(HUB_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function secureEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export function isPosthogRefreshRequest(req: Request): boolean {
  const expected = Deno.env.get("POSTHOG_REFRESH_SECRET") || "";
  const supplied = req.headers.get("x-trellis-refresh-secret") || "";
  return expected.length >= 24 && secureEqual(supplied, expected);
}

export async function requireTrellisUser(
  req: Request,
  roles?: string[],
): Promise<{ userId: string; role: string } | Response> {
  const authHeader = req.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Not authenticated" }, 401);

  const authed = createClient(HUB_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await authed.auth.getUser();
  if (userError || !userData.user) return json({ error: "Not authenticated" }, 401);

  const db = adminClient();
  const { data: operator, error: operatorError } = await db
    .from("trellis_users")
    .select("role,status")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();

  if (operatorError || !operator || operator.status !== "active") {
    return json({ error: "Active Trellis operator access is required" }, 403);
  }
  if (roles && !roles.includes(operator.role)) {
    return json({ error: "Owner or admin access is required" }, 403);
  }
  return { userId: userData.user.id, role: operator.role };
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function credentialKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("POSTHOG_CREDENTIAL_ENCRYPTION_KEY") || Deno.env.get("ENCRYPTION_KEY");
  if (!secret || secret.length < 24) {
    throw new Error("POSTHOG_CREDENTIAL_ENCRYPTION_KEY must be configured with at least 24 characters");
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(plaintext: string): Promise<string> {
  const key = await credentialKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  ));
  const packed = new Uint8Array(iv.length + encrypted.length);
  packed.set(iv);
  packed.set(encrypted, iv.length);
  return bytesToBase64(packed);
}

export async function decryptSecret(ciphertext: string): Promise<string> {
  const packed = base64ToBytes(ciphertext);
  if (packed.length < 29) throw new Error("Invalid encrypted credential");
  const key = await credentialKey();
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: packed.slice(0, 12) },
    key,
    packed.slice(12),
  );
  return new TextDecoder().decode(decrypted);
}

export async function hashWebhookSecret(secret: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(secret),
  ));
  return bytesToBase64(digest);
}

export function newWebhookSecret(): string {
  return `tr_ph_${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
}

export function normalizeHost(value: unknown): string | null {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function normalizeNameList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const unique = new Set<string>();
  for (const item of value) {
    const name = String(item || "").trim();
    if (/^[A-Za-z0-9_$.-]{1,80}$/.test(name)) unique.add(name);
  }
  return unique.size ? [...unique].slice(0, 40) : fallback;
}

export async function runPosthogQuery(
  hostUrl: string,
  projectId: string,
  apiKey: string,
  query: string,
  name: string,
): Promise<{ columns: string[]; results: unknown[][] }> {
  const response = await fetch(`${hostUrl}/api/projects/${encodeURIComponent(projectId)}/query/`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query }, name }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload?.detail || payload?.error || `PostHog returned HTTP ${response.status}`;
    throw new Error(`${name}: ${String(message)}`.slice(0, 300));
  }
  return {
    columns: Array.isArray(payload?.columns) ? payload.columns.map(String) : [],
    results: Array.isArray(payload?.results) ? payload.results : [],
  };
}

export function rowObject(queryResult: { columns: string[]; results: unknown[][] }): Record<string, unknown> {
  const row = queryResult.results[0] || [];
  return Object.fromEntries(queryResult.columns.map((column, index) => [column, row[index]]));
}
