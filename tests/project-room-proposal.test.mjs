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
import { estimateRequest, applyWorkEstimate } from "../services/projectRoomEstimate.mjs";

test("estimation uses each client's evidence and calculates task hours at the entered rate", () => {
  for (const [scope, hours] of [["Repair the extension application route", 3], ["Reconcile historical lead sources", 7]]) {
    const room=assessmentFixture(); room.state.summary=scope;
    const draft=draftProposal(room), request=estimateRequest(room,draft);
    const response={tasks:[
      {description:scope,hours,phase:"discovery",optional:false,basis:"One bounded investigation with owner access.",evidence:scope},
      {description:"Test agreed result",hours:2,phase:"testing",optional:true,basis:"Phone and desktop acceptance checks.",evidence:"Demonstrate the agreed checks"},
      {description:"Train the owner",hours:1,phase:"handoff",optional:true,basis:"One walkthrough and operating notes.",evidence:"operate independently"},
    ]};
    const result=applyWorkEstimate(draft,JSON.stringify(response),17500,request.evidence);
    assert.equal(proposalTotals(result).once,hours*17500);
    assert.equal(proposalTotals(result).optional_once,52500);
    assert.equal(validateProposal(result).items[0].basis,response.tasks[0].basis);
    assert.match(request.body.contents,new RegExp(scope));
    response.tasks[0].evidence="A source quote that does not exist";
    assert.throws(()=>applyWorkEstimate(draft,JSON.stringify(response),17500,request.evidence),/matching source quote/);
  }
});
test("incomplete or unbounded estimates never fall back to package prices", () => {
  const draft=draftProposal(assessmentFixture());
  assert.throws(()=>applyWorkEstimate(draft,"{",15000,""),/incomplete/);
  assert.throws(()=>applyWorkEstimate(draft,'{"error":"need scope"}',15000,""),/scope detail/);
  assert.throws(()=>applyWorkEstimate(draft,'{}',0,""),/hourly planning rate/);
  assert.equal(draft.items[0].unit_cents,null);
});
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
  assert.match(draft.pricing_basis, /Not estimated yet/);
  assert.deepEqual(proposalTotals(draft), {
    once: 0,
    monthly: 0,
    unpriced: 1,
    optional_once: 0,
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
  assert.equal(totals.once, 0);
  assert.equal(totals.monthly, 0);
  assert.equal(totals.won_once, 0);
  assert.equal(totals.unpriced, 2);
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
      "To be priced",
      "Internal work and hours breakdown",
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
  assert.equal(proposalTotals(draft).once, 0);
  assert.equal(proposalTotals(draft).monthly, 60000);
});

// Estimates must come from the current room, never a package-price fallback.
test("unestimated proposals have no automatic dollar allowance", () => {
 const p=draftProposal(assessmentFixture());
 assert.ok(p.items.every(i=>i.unit_cents===null));
 assert.equal(proposalTotals(p).unpriced,1);
});

test("Word exports the reviewable task math, assumptions and evidence", async () => {
 const room=assessmentFixture(), p=draftProposal(room);
 p.items=[{description:"Verify three booking routes",quantity:3,unit_cents:17500,frequency:"once",optional:false,estimate_unit:"hours",phase:"testing",basis:"Three routes on phone and desktop.",evidence:"Saved research requires booking route validation."}];
 const saved=saveProposal(room,p,"owner");
 const zip=unzipSync(new Uint8Array(await (await proposalDocx(room,saved)).arrayBuffer()));
 const xml=strFromU8(zip["word/document.xml"]);
 for(const text of ["3 hours","$175.00","$525.00","Three routes on phone and desktop.","Saved research requires booking route validation."]) assert.ok(xml.includes(text),text);
});
