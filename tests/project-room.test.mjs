import test from "node:test";
import assert from "node:assert/strict";
import {
  createRoom,
  nextRound,
  currentRound,
  importOutput,
  handoff,
  reserveCalls,
  applyChief,
  exportRoom,
  sanitizePII,
} from "../supabase/functions/_shared/project-room.mjs";
const room = (options = {}) =>
  createRoom({
    title: "Pera planning",
    kind: "product",
    brief: "Investigate the difficult requirements and preserve disagreements.",
    ...options,
  });
const chief = (options = {}) => ({
  summary: "# Living spec\nA sourced proposal.",
  questions: ["Which constraint matters most?"],
  proposals: ["Use local storage for the prototype."],
  next_handoff: "Verify offline requirements.",
  next_action: "ask_user",
  ...options,
});
test("oversized Manus handoffs use bounded UTF-8 excerpts from each review", () => {
  const project = room({ brief: "背景🌱".repeat(2000) });
  const round = nextRound(project);
  for (const role of ["research", "openai", "anthropic"]) {
    round.outputs[role] = { text: `${role} finding ${"農🌱".repeat(2500)}` };
  }
  const original = JSON.stringify(project);
  for (const role of ["research", "review"]) {
    const prompt = handoff(project, role);
    assert.ok(Buffer.byteLength(prompt, "utf8") <= 4800);
    assert.match(prompt, /Excerpt shortened for Manus/);
    assert.doesNotMatch(prompt, /\uFFFD/);
  }
  const review = handoff(project, "review");
  for (const role of ["research", "openai", "anthropic"]) {
    assert.ok(review.includes(`${role} finding`));
  }
  assert.ok(Buffer.byteLength(handoff(project, "chief"), "utf8") > 4800);
  assert.equal(JSON.stringify(project), original);
});
test("validates hard round/request limits and sanitizes inputs", () => {
  assert.throws(() => room({ max_rounds: 6 }));
  assert.throws(() => room({ call_budget: 0 }));
  assert.throws(() => room({ kind: "other" }));
  assert.equal(
    sanitizePII("123-45-6789 sk-abcdefghijklmnopqrstuvwxyz123456"),
    "[REDACTED_ID] [REDACTED_TOKEN]",
  );
});
test("several passes preserve evidence, proposed decisions, and human approval", () => {
  const r = room();
  nextRound(r);
  importOutput(
    r,
    "research",
    "# Sources\nhttps://example.com\nInference: uncertain.",
    "user",
  );
  assert.equal(currentRound(r).stage, "analysis");
  importOutput(r, "openai", "Choose A; disputed hardware limit.", "user");
  assert.equal(currentRound(r).stage, "analysis");
  importOutput(r, "anthropic", "Choose B; hardware limit unknown.", "user");
  assert.equal(currentRound(r).stage, "review");
  importOutput(
    r,
    "review",
    "Disagreement unresolved; verify hardware.",
    "user",
  );
  assert.equal(currentRound(r).stage, "chief");
  importOutput(
    r,
    "chief",
    JSON.stringify(chief({ next_action: "continue" })),
    "user",
  );
  assert.equal(r.state.rounds.length, 2);
  assert.equal(r.state.decisions[0].status, "proposed");
  r.state.decisions[0].status = "approved";
  applyChief(r, chief({ next_action: "continue" }));
  assert.equal(r.state.decisions[0].status, "approved");
  assert.equal(r.state.rounds.length, 3);
  applyChief(r, chief({ next_action: "continue" }));
  assert.equal(r.status, "awaiting_user");
  assert.throws(() => nextRound(r));
  assert.match(exportRoom(r), /Disagreement unresolved/);
  assert.match(exportRoom(r), /\[approved\]/);
});
test("independent reviewers see identical evidence and never each other", () => {
  const r = room();
  nextRound(r);
  importOutput(r, "research", "Sourced research.", "user");
  importOutput(r, "openai", "SECRET_OTHER_REVIEW", "user");
  assert.doesNotMatch(handoff(r, "anthropic"), /SECRET_OTHER_REVIEW/);
  assert.match(handoff(r, "review"), /SECRET_OTHER_REVIEW/);
  assert.match(handoff(r, "anthropic"), /Sourced research/);
});
test("budget reservations fail before exceeding paid request count", () => {
  const r = room({ call_budget: 2 });
  reserveCalls(r, 1);
  assert.throws(() => reserveCalls(r, 2));
  assert.equal(r.state.calls_used, 1);
  reserveCalls(r, 1);
  assert.throws(() => nextRound(r));
});
test("cannot import out of order, overwrite evidence or auto-approve proposals", () => {
  const r = room();
  nextRound(r);
  assert.throws(() =>
    importOutput(r, "chief", JSON.stringify(chief()), "user"),
  );
  importOutput(r, "research", "Actual result", "user");
  assert.throws(() => importOutput(r, "research", "Replacement", "user"));
  assert.equal(currentRound(r).outputs.research.source, "imported");
  assert.throws(() => applyChief(r, { summary: "No schema" }));
});
