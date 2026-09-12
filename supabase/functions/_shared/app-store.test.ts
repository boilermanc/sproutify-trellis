import { assertEquals } from "jsr:@std/assert@1";
import { aggregateRows, parseTsv } from "./app-store.ts";

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
