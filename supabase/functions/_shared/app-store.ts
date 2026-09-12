import { adminClient, cors, isPosthogRefreshRequest, json, requireTrellisUser } from "./posthog.ts";

export { adminClient, cors, json, requireTrellisUser };

export const isRefreshRequest = isPosthogRefreshRequest;

const API = "https://api.appstoreconnect.apple.com/v1";
const encoder = new TextEncoder();

export const REPORT_ALLOWLIST = new Set([
  "App Downloads Standard",
  "App Store Installation and Deletion Standard",
  "App Sessions Standard",
  "App Store Discovery and Engagement Standard",
  "App Crashes",
  "App Store Subscription Event Standard",
  "App Store Subscription State Standard",
]);

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function pemBytes(pem: string): ArrayBuffer {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  const binary = atob(body);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0)).buffer as ArrayBuffer;
}

export async function appleToken(): Promise<string> {
  const issuer = Deno.env.get("ASC_ISSUER_ID") || "";
  const keyId = Deno.env.get("ASC_KEY_ID") || "";
  const privateKey = Deno.env.get("ASC_PRIVATE_KEY") || "";
  if (!issuer || !keyId || !privateKey) throw new Error("App Store Connect credentials are incomplete");
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(encoder.encode(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" })));
  const payload = base64Url(encoder.encode(JSON.stringify({ iss: issuer, iat: now, exp: now + 15 * 60, aud: "appstoreconnect-v1" })));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemBytes(privateKey),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, encoder.encode(`${header}.${payload}`)));
  return `${header}.${payload}.${base64Url(signature)}`;
}

export async function appleJson(pathOrUrl: string, token: string): Promise<any> {
  const url = pathOrUrl.startsWith("https://") ? pathOrUrl : `${API}${pathOrUrl}`;
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload?.errors?.[0]?.detail || payload?.errors?.[0]?.title || `HTTP ${response.status}`;
    throw new Error(`App Store Connect: ${String(detail)}`.slice(0, 300));
  }
  return payload;
}

export async function applePages(path: string, token: string, maxPages = 20): Promise<any[]> {
  const rows: any[] = [];
  let next: string | null = path;
  for (let page = 0; next && page < maxPages; page++) {
    const payload = await appleJson(next, token);
    if (Array.isArray(payload.data)) rows.push(...payload.data);
    next = payload?.links?.next || null;
  }
  return rows;
}

export function parseTsv(text: string): Record<string, string>[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split("\t");
  return lines.slice(1).map((line) => Object.fromEntries(line.split("\t").map((value, index) => [headers[index], value])));
}

export function aggregateRows(rows: Record<string, string>[], fallbackDate: string): Map<string, Record<string, number>> {
  const result = new Map<string, Record<string, number>>();
  for (const row of rows) {
    const dateEntry = Object.entries(row).find(([key, value]) => /date/i.test(key) && /^\d{4}-\d{2}-\d{2}/.test(value));
    const date = (dateEntry?.[1] || fallbackDate).slice(0, 10);
    const metrics = result.get(date) || {};
    for (const [key, raw] of Object.entries(row)) {
      if (dateEntry?.[0] === key || /(^|\s)(rate|average|percentage|percent|ratio)(\s|$)/i.test(key)) continue;
      const normalized = raw.replaceAll(",", "").replace(/^\$/, "").trim();
      if (!/^-?\d+(\.\d+)?$/.test(normalized)) continue;
      const value = Number(normalized);
      if (Number.isFinite(value)) metrics[key] = (metrics[key] || 0) + value;
    }
    result.set(date, metrics);
  }
  return result;
}
