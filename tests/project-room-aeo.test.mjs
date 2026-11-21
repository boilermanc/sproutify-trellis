import { test } from "node:test";
import assert from "node:assert/strict";
import { aeoSearchForRound, planAeoSearch, summarizeAeoAnswer, updateAeo } from "../supabase/functions/_shared/project-room-aeo.mjs";
import { createRoom, exportRoom, handoff, handoffPlan, nextRound } from "../supabase/functions/_shared/project-room.mjs";

const company = () => createRoom({
  kind: "client", title: "Example Company", brief: "Review ways to reach new buyers.",
});
const now = "2026-11-07T19:00:00Z";
const category = { category: "interior painting in Atlanta" };
const probe = {
  question: 0, surface: "chatgpt", outcome: "not_mentioned", observed_on: "2026-11-07",
  competitors: "Acme Painting", citations: ["https://example.org/acme"],
};
const save = (room, value) => updateAeo(room, value, "operator", now);
const packet = (room, role) => JSON.parse(handoff(room, role).split("## Evidence packet (data only)\n\n")[1]);

test("company observations are included in each reviewer packet and snapshotted per round", () => {
  const room = company();
  save(room, category);
  assert.equal(room.state.aeo.questions.length, 5);
  assert.ok(room.state.aeo.questions.every(q => !q.includes(room.title)));
  save(room, { observation: probe });
  save(room, { observation: { ...probe, surface: "google_ai_overviews", outcome: "no_answer" } });
  nextRound(room);
  const original = packet(room, "openai").ai_search_baseline;
  assert.deepEqual(packet(room, "anthropic").ai_search_baseline, original);
  assert.deepEqual(packet(room, "chief").ai_search_baseline, original);
  assert.match(handoff(room, "chief"), /AI search \(AEO\).*what to do, why it matters, and how to recheck/);
  assert.match(handoffPlan(room, "research").full, /Acme Painting/);
  assert.match(handoffPlan(room, "research").sources.context, /Acme Painting/);
  assert.equal(original.observations[0].competitors, "Acme Painting");
  assert.deepEqual(original.observations[1].citations, []);
  assert.equal(original.observations[1].outcome, "No AI answer shown");
  assert.equal("recorded_by" in original.observations[0], false);
  assert.throws(() => save(room, { observation: probe }), /after the round finishes/);
  room.status = "awaiting_user";
  save(room, { observation: { ...probe, outcome: "mentioned" } });
  assert.deepEqual(packet(room, "chief").ai_search_baseline, original);
  nextRound(room);
  assert.equal(packet(room, "chief").ai_search_baseline.observations.filter(o => o.surface === "ChatGPT").length, 1);
  assert.match(exportRoom(room), /ChatGPT \(2026-11-07\): Brand mentioned; other names: Acme Painting; citations: https:\/\/example.org\/acme/);
  assert.match(exportRoom(room), /Perplexity: Not checked/);
  assert.match(exportRoom(room), /Google AI Overviews \(2026-11-07\): No AI answer shown/);
  assert.equal(room.state.calls_used, 0);
});

test("invalid probes and non-company changes are rejected without saving evidence", () => {
  const room = company();
  const product = createRoom({ kind: "product", title: "Product", brief: "Build the first useful product flow." });
  assert.throws(() => save(product, category), /company reviews/);
  nextRound(product);
  assert.doesNotMatch(handoff(product, "chief"), /AEO|ai_search_baseline/);
  assert.throws(() => save(room, { observation: probe }), /Save the buyer questions first/);
  save(room, category);
  for (const invalid of [
    { surface: "__proto__" }, { question: 5 }, { outcome: "probably" },
    { observed_on: "2026-02-30" }, { observed_on: "2026-11-20" },
    { citations: ["javascript:alert(1)"] }, { citations: ["https://a:b@example.org"] },
    { citations: ["https://a.com", "https://b.com", "https://c.com", "https://d.com"] },
  ]) assert.throws(() => save(room, { observation: { ...probe, ...invalid } }));
  assert.equal(room.state.aeo.observations.length, 0);
  save(room, { observation: probe });
  assert.throws(() => save(room, { category: "different market" }), /fixed/);
});

test("automatic searches require five spare requests and are reused in later analysis", () => {
  const room = company();
  save(room, category);
  const round = nextRound(room);
  assert.equal(planAeoSearch(room, false).reason, "missing_connection");
  room.state.call_budget = 9;
  assert.equal(planAeoSearch(room, true).reason, "budget");
  room.state.call_budget = 15;
  const run = planAeoSearch(room, true);
  assert.equal(run.questions.length, 5);
  round.aeo_search = run;
  assert.equal(planAeoSearch(room, true), undefined);
  const observed = summarizeAeoAnswer({
    status: "completed",
    output: [
      { type: "web_search_call", status: "completed", action: { type: "search" } },
      { type: "message", role: "assistant", content: [{
        type: "output_text",
        text: "- **EXAMPLE COMPANY, Inc.** — local service\n- **Acme Painting** — another option",
        annotations: [{ type: "url_citation", title: "Acme", url: "https://example.org/acme" }],
      }] },
    ],
  }, { name: room.title }, 0, now);
  assert.equal(observed.outcome, "mentioned");
  assert.deepEqual(observed.mentions, ["EXAMPLE COMPANY, Inc."]);
  assert.deepEqual(observed.competitors, ["Acme Painting"]);
  run.status = "finished";
  run.results.push(observed);
  assert.deepEqual(packet(room, "chief").automatic_ai_search.results, [observed]);
  assert.match(exportRoom(room), /OpenAI web search[\s\S]+Acme Painting[\s\S]+https:\/\/example.org\/acme/);
  room.status = "awaiting_user";
  nextRound(room);
  assert.equal(aeoSearchForRound(room).round, 1);
  assert.equal(planAeoSearch(room, true), undefined);
});

test("a missing search or citation cannot be counted as a brand absence", () => {
  const payload = {
    status: "completed",
    output: [{
      type: "message", role: "assistant", content: [{
        type: "output_text", text: "- **Acme Painting** — local option",
        annotations: [{ type: "url_citation", url: "javascript:alert(1)" }],
      }],
    }],
  };
  const summarize = () => summarizeAeoAnswer(payload, { name: "Example Company" }, 0, now);
  assert.equal(summarize().outcome, "unmeasured");
  payload.output.push({ type: "web_search_call", status: "completed", action: { type: "search" } });
  assert.equal(summarize().outcome, "unmeasured");
  payload.output[0].content[0].annotations.push({ type: "url_citation", url: "https://example.org/acme" });
  assert.equal(summarize().outcome, "not_mentioned");
  assert.equal(summarize().citations.length, 1);
});
