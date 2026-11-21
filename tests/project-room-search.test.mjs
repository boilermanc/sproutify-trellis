import test from "node:test";
import assert from "node:assert/strict";
import { searchRoomEvidence } from "../supabase/functions/_shared/project-room-search.mjs";
const room = { id: "allowed", title: "Acme", brief: "Discuss the irrigation schedule", state: {
  notes: [{ text: "Budget approved for irrigation" }],
  meetings: [{ title: "Planning", summary: "Irrigation must ship by Friday" }],
} };
test("search cites matching sources and requires all query words", () => {
  const result = searchRoomEvidence([room], "IRRIGATION Friday");
  assert.equal(result.matches.length, 1);
  assert.equal(result.matches[0].source, "Meeting: Planning");
  assert.equal(result.matches[0].room_id, "allowed");
  assert.match(result.matches[0].text, /Friday/);
});
test("no results invent no answer and regex syntax is not executed", () => {
  assert.deepEqual(searchRoomEvidence([room], "unknown"), {matches: [], limited:false});
  assert.throws(() => searchRoomEvidence([room], ".*"));
  assert.throws(() => searchRoomEvidence([room], "x"));
  assert.throws(() => searchRoomEvidence([room], "x".repeat(201)));
});
test("limits result count, snippets and redacts sensitive evidence", () => {
  const result = searchRoomEvidence(Array.from({length:51}, (_, i) => ({ id:String(i), title:"Account", brief: "Find 123-45-6789 " + "z".repeat(1000) })), "Find");
  assert.equal(result.matches.length,20);
  assert.equal(result.limited,true);
  assert.ok(result.matches.every(m => m.text.length <= 602 && !m.text.includes("123-45-6789")));
});
