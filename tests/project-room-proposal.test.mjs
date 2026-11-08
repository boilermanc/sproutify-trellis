import { test } from "node:test";
import assert from "node:assert/strict";
import {
  draftProposal,
  proposalDocx,
} from "../services/projectRoomProposal.mjs";
import {
  pipelineTotals,
  proposalSummary,
  proposalTotals,
  saveProposal,
  validateProposal,
} from "../supabase/functions/_shared/project-room-proposal.mjs";
import { assessmentFixture } from "./fixtures/company-assessment.mjs";
import { strFromU8, unzipSync } from "fflate";
test("new company proposals retain their own outcome and include one-time pricing and independent handoff", () => {
  const room = assessmentFixture();
  room.title = "Another Company";
  room.state.summary = "## What success looks like\n\nStaff can complete the daily order process without outside help.\n\n## Recommendation\n\nInspect the order integration before choosing fixes.";
  const draft = draftProposal(room);
  assert.match(draft.objective, /Staff can complete the daily order process/);
  assert.doesNotMatch(draft.objective, /Inspect the order integration/);
  assert.ok(draft.items.every((item) => item.frequency === "once"));
  assert.match(draft.deliverables, /operating instructions/);
  assert.match(draft.deliverables, /customer account ownership and access/);
  assert.match(draft.deliverables, /owner's acceptance and close the project/);
  assert.match(draft.scope, /Additional work needs a separately approved project/);
  validateProposal(draft);
});
test("proposal draft uses research, explicit assumptions, and optional fees outside the base", () => {
  const room = assessmentFixture(), draft = draftProposal(room);
  assert.match(draft.objective, /independently/);
  assert.match(draft.scope, /Research to validate/);
  assert.match(draft.pricing_basis, /Suggested internal estimate/);
  assert.deepEqual(proposalTotals(draft), {
    once: 120000,
    monthly: 0,
    unpriced: 0,
    optional_once: 270000,
    optional_monthly: 0,
  });
});
test("proposal validation rejects bad money, quantities, stage and dates; sanitizes text", () => {
  const draft = draftProposal(assessmentFixture());
  for (const value of [-1, 1.2, NaN, Infinity, 100000001]) {
    assert.throws(() =>
      validateProposal({
        ...draft,
        items: [{ ...draft.items[0], unit_cents: value }],
      })
    );
  }
  for (const value of [0, -1, 1.5, 10001]) {
    assert.throws(() =>
      validateProposal({
        ...draft,
        items: [{ ...draft.items[0], quantity: value }],
      })
    );
  }
  assert.throws(() => validateProposal({ ...draft, stage: "paid" }));
  assert.throws(() => validateProposal({ ...draft, close_date: "2027-02-30" }));
  assert.throws(() => validateProposal({ ...draft, items: [] }));
  assert.match(
    validateProposal({ ...draft, scope: "Contact 123-45-6789" }).scope,
    /REDACTED_ID/,
  );
  assert.equal(
    proposalTotals({
      ...draft,
      items: [{ ...draft.items[0], unit_cents: null }],
    }).unpriced,
    1,
  );
});
test("saved proposal preserves research and source snapshot, accepts only company rooms", () => {
  const room = assessmentFixture(), original = room.state.summary;
  saveProposal(
    room,
    { ...draftProposal(room), source_summary: "forged" },
    "owner",
    "2026-11-07T12:00:00Z",
  );
  assert.equal(room.state.summary, original);
  assert.equal(room.state.proposal.source_summary, original);
  room.state.summary = "New findings";
  saveProposal(room, { ...room.state.proposal, stage: "won" }, "member");
  assert.equal(room.state.proposal.source_summary, original);
  assert.equal(room.state.proposal.stage, "won");
  assert.throws(() =>
    saveProposal({ ...room, kind: "product" }, draftProposal(room), "owner")
  );
});
test("pipeline excludes archived, cancelled, lost, won and optional fees from open totals", () => {
  const p = proposalSummary(draftProposal(assessmentFixture()));
  const rooms = [
    { id: "1", kind: "client", status: "awaiting_user", proposal: p },
    { id: "2", kind: "client", status: "draft" },
    {
      id: "3",
      kind: "client",
      status: "draft",
      proposal: { ...p, stage: "won" },
    },
    {
      id: "4",
      kind: "client",
      status: "draft",
      proposal: { ...p, stage: "lost" },
    },
    {
      id: "5",
      kind: "client",
      status: "draft",
      client_id: "archived",
      proposal: p,
    },
    { id: "6", kind: "product", status: "draft", proposal: p },
    { id: "7", kind: "client", status: "cancelled", proposal: p },
  ];
  const totals = pipelineTotals(rooms, [{
    id: "archived",
    archived_at: "2026-11-07",
  }]);
  assert.equal(totals.once, 120000);
  assert.equal(totals.monthly, 0);
  assert.equal(totals.won_once, 120000);
  assert.equal(totals.unpriced, 1);
  assert.equal(totals.open.length, 2);
});
test("proposal Word contains scope, fees, assumptions and draft status without assessment decision log", async () => {
  const room = assessmentFixture();
  const zip = unzipSync(
    new Uint8Array(
      await (await proposalDocx(room, draftProposal(room))).arrayBuffer(),
    ),
  );
  const xml = strFromU8(zip["word/document.xml"]);
  for (
    const text of [
      "CONSULTING PROPOSAL",
      "What success looks like",
      "Completion checks and handoff",
      "$1,200.00",
      "$2,700.00",
      "not an approved rate card",
      "Payment schedule",
      "Internal planning draft",
    ]
  ) assert.ok(xml.includes(text), text);
  assert.ok(!xml.includes("Decision log"));
  assert.ok(!xml.includes("per month"));
  assert.ok(xml.indexOf("What success looks like") < xml.indexOf("One-time project investment"));
  assert.match(xml, /w:tblHeader/);
});

test("recurring fees cannot be saved or exported, and are not converted to project fees", async () => {
  const room = assessmentFixture(), draft = draftProposal(room);
  draft.items.push({description: "Legacy support", quantity: 1, unit_cents: 60000, frequency: "monthly", optional: false});
  assert.throws(() => validateProposal(draft), /one-time fees/);
  await assert.rejects(() => proposalDocx(room, draft), /one-time fees/);
  assert.equal(proposalTotals(draft).once, 120000);
  assert.equal(proposalTotals(draft).monthly, 60000);
});
