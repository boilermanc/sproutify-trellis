// Read-only production smoke check. Public build key only; no user/provider keys.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.startsWith("VITE_SUPABASE_"))
    .map((l) => {
      const i = l.indexOf("=");
      return [
        l.slice(0, i),
        l
          .slice(i + 1)
          .trim()
          .replace(/^['"]|['"]$/g, ""),
      ];
    }),
);
const url = env.VITE_SUPABASE_URL;
const headers = {
  apikey: env.VITE_SUPABASE_ANON_KEY,
  "Content-Type": "application/json",
};
for (const action of ["list", "create", "get", "tick", "client_update", "search_client_data", "members", "share", "unshare", "import_meeting", "proposal_save"]) {
  const response = await fetch(`${url}/functions/v1/project-rooms`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      action,
      id: "00000000-0000-0000-0000-000000000001",
    }),
  });
  assert.equal(
    response.status,
    401,
    `${action} must reject an unauthenticated caller`,
  );
}
const invalid = await fetch(`${url}/functions/v1/project-rooms`, {
  method: "POST",
  headers: { ...headers, Authorization: "Bearer invalid" },
  body: JSON.stringify({ action: "list" }),
});
assert.equal(invalid.status, 401);
const table = await fetch(`${url}/rest/v1/project_rooms?select=id`, {
  headers,
});
assert.ok(
  [401, 403].includes(table.status),
  "anonymous table access must be denied",
);
console.log(
  "PASS: production list/create/get/worker reject anonymous access; invalid JWT rejected; direct table read denied.",
);
