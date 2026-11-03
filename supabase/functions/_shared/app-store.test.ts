import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { aggregateRows, applePages, appleJson, parseTsv } from "./app-store.ts";

Deno.test("App Store TSV rows are aggregated without retaining dimensions", () => {
  const rows = parseTsv([
    "Date\tTerritory\tTotal Downloads\tConversion Rate",
    "2026-09-10\tUS\t12\t0.4",
    "2026-09-10\tCA\t3\t0.5",
    "2026-09-11\tUS\t5\t0.2",
  ].join("\n"));

  assertEquals(aggregateRows(rows, "2026-09-12"), new Map([
    ["2026-09-10", { "Total Downloads": 15 }],
    ["2026-09-11", { "Total Downloads": 5 }],
  ]));
});

Deno.test('Apple pagination collects every page and fails rather than importing a truncated result', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    globalThis.fetch = async () => {
      calls++;
      return Response.json({ data: [{ id: String(calls) }], links: { next: calls === 1 ? 'https://api.appstoreconnect.apple.com/v1/pages?cursor=2' : null } });
    };
    assertEquals(await applePages('/pages', 'test-token'), [{ id: '1' }, { id: '2' }]);
    calls = 0;
    await assertRejects(() => applePages('/pages', 'test-token', 1), Error, 'pagination exceeded');
  } finally { globalThis.fetch = originalFetch; }
});

Deno.test('Apple pagination cannot leak authorization to another origin', async () => {
  const originalFetch = globalThis.fetch;
  let fetched = false;
  try {
    globalThis.fetch = async () => { fetched = true; return Response.json({}); };
    await assertRejects(() => appleJson('https://example.org/v1/next', 'test-token'), Error, 'Invalid Apple API');
    assertEquals(fetched, false);
  } finally { globalThis.fetch = originalFetch; }
});
