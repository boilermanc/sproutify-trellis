import test from "node:test";
import assert from "node:assert/strict";
import { createRoom, exportRoom } from "../supabase/functions/_shared/project-room.mjs";
import { attachMeetingNote, normalizeMeetingNote, meetingClientCandidates } from "../supabase/functions/_shared/project-room-meetings.mjs";

const note = {
  source: "chatgpt_meetings",
  source_id: "private-note-1",
  title: "Client discovery",
  summary: "The client will confirm the launch date.",
  started_at: "2026-11-07T09:00:00-05:00",
  source_url: "https://chatgpt.com/meeting/example",
};

test("room export retains meeting notes and their source date", () => {
  const room = createRoom({kind:"client",title:"Example",brief:"Review the company and its delivery plans."});
  attachMeetingNote(room, note, "operator");
  const exported = exportRoom(room);
  assert.match(exported, /## Meeting notes/);
  assert.ok(exported.includes(note.summary));
  assert.ok(exported.includes("2026-11-07T14:00:00.000Z"));
});

test("meeting import is idempotent and retains original attribution when corrected", () => {
  const room = { state: {} };
  assert.equal(attachMeetingNote(room, note, "clint", "2026-11-07T15:00:00Z"), true);
  assert.equal(attachMeetingNote(room, note, "sheree"), false);
  assert.equal(room.state.meetings.length, 1);
  attachMeetingNote(room, { ...note, summary: "The client confirmed Monday." }, "sheree");
  assert.equal(room.state.meetings[0].added_by, "clint");
  assert.equal(room.state.meetings[0].updated_by, "sheree");
});

test("rejects invalid sources, ambiguous times, unsafe links, oversized content; scrubs notes", () => {
  for (const input of [
    { ...note, source: "unknown" },
    { ...note, started_at: "2026-11-07" },
    { ...note, source_url: "javascript:alert(1)" },
    { ...note, source_url: "https://user:password@example.com" },
    { ...note, summary: "x".repeat(24001) },
  ]) assert.throws(() => normalizeMeetingNote(input));
  assert.ok(!normalizeMeetingNote({ ...note, summary: "123-45-6789" }).summary.includes("123-45"));
});

test("matches only exact client contact emails and keeps ambiguous candidates", () => {
  assert.deepEqual(meetingClientCandidates([" Client@Example.com "], [
    { id: "one", contacts: [{ email: "client@example.com" }] },
    { id: "two", contacts: [{ email: "client@example.com" }] },
    { id: "three", contacts: [{ email: "other@example.com" }] },
  ]), ["one", "two"]);
});
