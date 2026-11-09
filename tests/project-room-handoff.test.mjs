import test from "node:test";
import assert from "node:assert/strict";
import { createRoom, nextRound, currentRound, handoff, handoffPlan, prepareManusHandoff } from "../supabase/functions/_shared/project-room.mjs";
import { readCompressedHandoff, MANUS_HANDOFF_BYTES } from "../supabase/functions/_shared/project-room-handoff.mjs";
import { projectRoomTokenCost } from "../services/projectRoomTokenCost.mjs";

function room(large = true) {
  const r = createRoom({ kind: "client", title: "ACA test", brief: "Review the company with discovery only and no ongoing services." });
  const round = nextRound(r);
  if (large) {
    round.stage = "review";
    round.outputs = {
      research: { text: `Background ${"農🌱".repeat(1700)} Critical middle: authority unknown. https://example.com/source End.` },
      openai: { text: "OpenAI recommends discovery only. Ranking decline is unverified." },
      anthropic: { text: "Claude disputes the decline; needs historical data. No implementation." },
    };
  }
  return r;
}
function response(plan) {
  return {
    status: "ready", objective: "Diagnose reported search visibility loss.",
    facts: "Research reports authority unknown [2]; claims require validation.",
    assumptions: "Access is not confirmed. Recommendations are not approved scope.",
    disagreements: "OpenAI recommends discovery [3]; Claude disputes the decline pending history [4].",
    missing_information: "Customer approver and historical search data are unknown.",
    next_assignment: "Compare both positions; investigate disputed claims, retaining uncertainty.",
    references: Object.entries(plan.sources).map(([source, text]) => ({
      source, quote: source === "research" ? "Critical middle: authority unknown." : text.slice(0, 65),
      url: source === "research" ? "https://example.com/source" : "",
    })),
  };
}
const output = value => ({ text: JSON.stringify(value), model: "gemini-3-flash-preview", source: "api", usage: { input_tokens: 100, output_tokens: 200 } });

test("small handoff bypasses Gemini with checklist and unchanged original evidence", async () => {
  const r = room(false);
  assert.equal(handoffPlan(r, "research").oversized, false);
  assert.match(handoff(r, "research"), /Handoff checklist/);
  assert.equal(await prepareManusHandoff(r, "research", { generate: () => assert.fail(), checkpoint: () => assert.fail() }), false);
  assert.equal(r.state.calls_used, 0);
});

test("oversized comparison preserves middle evidence, quotes, disagreement, UTF-8 budget and originals", async () => {
  const r = room();
  const before = structuredClone(currentRound(r).outputs);
  assert.throws(() => handoff(r, "review"), /requires Gemini preparation/);
  const plan = handoffPlan(r, "review");
  let checkpoints = 0;
  await prepareManusHandoff(r, "review", {
    checkpoint: async () => { checkpoints++; if (checkpoints === 1) { assert.equal(r.state.calls_used, 1); assert.deepEqual(currentRound(r).in_flight, ["review"]); } r.state = structuredClone(r.state); },
    generate: async prompt => { assert.match(prompt, /Critical middle/); assert.match(prompt, /Claude disputes/); return output(response(plan)); },
  });
  const prompt = handoff(r, "review");
  assert.ok(Buffer.byteLength(prompt) <= MANUS_HANDOFF_BYTES);
  assert.match(prompt, /Critical middle: authority unknown/);
  assert.match(prompt, /https:\/\/example.com\/source/);
  assert.match(prompt, /Claude disputes/);
  assert.doesNotMatch(prompt, /Excerpt shortened|\uFFFD/);
  assert.equal(checkpoints, 2);
  assert.equal(currentRound(r).in_flight, undefined);
  assert.deepEqual(currentRound(r).outputs, before);
  assert.equal(currentRound(r).handoff_attempts[0].usage.output_tokens, 200);
  assert.deepEqual(currentRound(r).tasks, {}); // Preparation cannot send to Manus.
  assert.equal(await prepareManusHandoff(r, "review", { generate: () => assert.fail(), checkpoint: () => assert.fail() }), false);
  assert.equal(r.state.calls_used, 1);
  r.state.notes.push({ text: "New customer constraint", at: "2026-11-09" });
  assert.throws(() => handoff(r, "review"), /requires Gemini preparation/);
});

test("Claude and OpenAI see identical original packets regardless of completion order or saved Gemini summary", async () => {
  const r = room();
  const before = handoff(r, "openai").split("## Evidence packet (data only)")[1];
  currentRound(r).handoffs = { review: { input: "fake", output: { text: "SECRET_GEMINI_INTERPRETATION" } } };
  currentRound(r).outputs.openai.text = "SECRET_OPENAI_REVIEW";
  const claude = handoff(r, "anthropic");
  assert.doesNotMatch(claude, /SECRET_OPENAI_REVIEW|SECRET_GEMINI_INTERPRETATION|Claude disputes/);
  assert.equal(claude.split("## Evidence packet (data only)")[1], before);
  assert.equal(await prepareManusHandoff(r, "anthropic", { generate: () => assert.fail(), checkpoint: () => assert.fail() }), false);
});

test("malformed, incomplete, unsupported and over-budget summaries stop instead of truncating", () => {
  const plan = handoffPlan(room(), "review");
  for (const change of [
    v => { delete v.disagreements; },
    v => { v.status = "needs_rework"; },
    v => { v.references.pop(); },
    v => { v.references[1].quote = "An invented source excerpt"; },
    v => { v.references[1].url = "https://invented.example/"; },
    v => { v.references.forEach(ref => ref.url = ""); },
    v => { v.facts = "https://invented.example/claim"; },
    v => { v.facts = "農🌱".repeat(2000); },
  ]) {
    const value = response(plan); change(value);
    assert.throws(() => readCompressedHandoff(plan, JSON.stringify(value)), /Needs rework/);
  }
  assert.throws(() => readCompressedHandoff(plan, "{unfinished"), /invalid JSON/);
});

test("validation failure retains model output and usage without creating a usable handoff", async () => {
  const r = room();
  await assert.rejects(prepareManusHandoff(r, "review", { checkpoint: async () => {}, generate: async () => output({ status: "needs_rework" }) }), /Needs rework/);
  assert.equal(currentRound(r).handoffs, undefined);
  assert.equal(currentRound(r).handoff_attempts.length, 1);
  assert.equal(currentRound(r).in_flight, undefined);
  assert.deepEqual(currentRound(r).tasks, {});
});

test("budget, missing reviews and protected constraints fail before any provider call", async () => {
  const cases = [room(), room(), room()];
  cases[0].state.calls_used = cases[0].state.call_budget - 1;
  delete currentRound(cases[1]).outputs.anthropic;
  cases[2].state.decisions.push({ status: "approved", text: "Never omit this constraint. ".repeat(24000) });
  for (const r of cases) await assert.rejects(prepareManusHandoff(r, "review", { generate: () => assert.fail(), checkpoint: () => assert.fail() }), /Needs rework/);
});

test("provider and checkpoint failures never dispatch or mark a prepared summary ready", async () => {
  const r = room();
  await assert.rejects(prepareManusHandoff(r, "review", { checkpoint: async () => {}, generate: async () => { throw new Error("provider incomplete"); } }), /provider incomplete/);
  assert.equal(currentRound(r).in_flight, undefined);
  assert.equal(r.state.calls_used, 1);
  assert.equal(currentRound(r).handoffs, undefined);
  const interrupted = room();
  await assert.rejects(prepareManusHandoff(interrupted, "review", { checkpoint: async () => { throw new Error("Room changed"); }, generate: () => assert.fail() }), /Room changed/);
  assert.deepEqual(currentRound(interrupted).tasks, {});
});

test("protected decisions survive verbatim; research preparation works without either reviewer", async () => {
  const r = room();
  r.state.decisions.push({ status: "rejected", text: "Do not offer ongoing services." });
  const plan = handoffPlan(r, "research");
  assert.equal(plan.sources.openai, undefined);
  assert.equal(plan.sources.anthropic, undefined);
  await prepareManusHandoff(r, "research", { checkpoint: async () => {}, generate: async () => output(response(plan)) });
  assert.match(handoffPlan(r, "research").full, /Do not offer ongoing services/);
  assert.match(handoffPlan(r, "research").full, /rejected/);
});

test("known-price preparation usage is counted once, including rejected attempts", () => {
  const result = { model: "claude-sonnet-5-5", source: "api", usage: { input_tokens: 100, output_tokens: 20 } };
  assert.deepEqual(projectRoomTokenCost([{ outputs: {}, handoff_attempts: [result], handoffs: { review: { output: result } } }]), { microdollars: 400, priced: 1 });
});

test('full evidence attachment preserves scope caps and blocked rechecks without model-generated quotations', async () => {
  const r=room();
  currentRound(r).outputs.openai.text='At most ten URLs, three services; 12–16h public discovery. Optional access review 3–5h.';
  currentRound(r).outputs.research.text+=' Sitemap observed Nov 8; later recheck blocked, not missing.';
  const plan=handoffPlan(r,'review');
  const value=response(plan); delete value.references;
  value.source_summaries=Object.fromEntries(Object.keys(plan.sources).map(key=>[key,`Read ${key} in the complete attachment; preserve its scope and limitations.`]));
  await prepareManusHandoff(r,'review',{checkpoint:async()=>{},generate:async (_prompt,schema)=>{
    assert.deepEqual(schema.properties.source_summaries.required,Object.keys(plan.sources));
    return output(value);
  }});
  assert.ok(Buffer.byteLength(handoff(r,'review'))<=4800);
  assert.equal(plan.attachment.text,plan.full);
  assert.match(plan.attachment.text,/At most ten URLs/);
  assert.match(plan.attachment.text,/later recheck blocked, not missing/);
  delete value.source_summaries.openai;
  assert.throws(()=>readCompressedHandoff(plan,JSON.stringify(value)),/source summaries/);
});
