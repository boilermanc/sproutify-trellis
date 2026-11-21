import test from "node:test";
import assert from "node:assert/strict";
import {
  addCustomerDocument,
  CUSTOMER_FIELDS,
  customerDocumentRequest,
  customerSections,
  customerSourceKey,
  updateCustomerDocument,
  validateCustomerAssessment,
} from "../supabase/functions/_shared/project-room-customer-document.mjs";
import {
  acaCustomerContent,
  acaCustomerDraft,
} from "./fixtures/aca-customer-document.mjs";
import {
  customerDocumentDocx,
  customerDocumentPages,
  customerDocumentPdfDefinition,
} from "../services/customerDocument.mjs";
const content = () => ({ ...acaCustomerContent, title: "Example Company" });
const fixture = () => ({
  kind: "client",
  title: "Example Company",
  status: "awaiting_user",
  state: {
    summary: "Saved reviewed assessment. ".repeat(8),
    notes: [],
    decisions: [],
    proposal: {
      title: "Internal draft",
      secret: "Internal estimating material",
    },
    proposal_generation: {
      status: "needs_review",
      review: { status: "needs_review", issues: ["Unverified Instagram"] },
    },
  },
});
const input = {
  kind: "assessment",
  analysis_approved: true,
  analysis: "Approved analysis with qualified public observations. ".repeat(5),
  approval_note:
    "Present Instagram as unverified. Discovery will resolve account-dependent questions.",
};
test("creation requires a deliberate analysis approval and unresolved-issue direction", async () => {
  await assert.rejects(
    customerDocumentRequest(fixture(), { ...input, analysis_approved: false }),
    /Confirm/,
  );
  await assert.rejects(
    customerDocumentRequest(fixture(), { ...input, approval_note: "" }),
    /Explain/,
  );
  await assert.rejects(
    customerDocumentRequest({ ...fixture(), kind: "product" }, input),
    /company/,
  );
});
test("separate draft, approval, edit reset and stale source gate preserve internal proposal", async () => {
  const room = fixture(), before = structuredClone(room.state.proposal);
  const request = await customerDocumentRequest(room, input);
  const doc = addCustomerDocument(room, request, "assessment", {
    text: JSON.stringify(content()),
    model: "fixture",
  }, "clint");
  assert.equal(doc.status, "draft");
  assert.equal(doc.pricing, null);
  assert.equal(doc.analysis_approval.by, "clint");
  assert.equal(await customerSourceKey(room), request.source_key);
  await assert.rejects(
    updateCustomerDocument(room, {
      action: "customer_document_approve",
      document_id: doc.id,
    }, "sheree"),
    /Confirm/,
  );
  await updateCustomerDocument(room, {
    action: "customer_document_approve",
    document_id: doc.id,
    confirmed: true,
  }, "sheree");
  assert.equal(doc.approved_by, "sheree");
  await updateCustomerDocument(room, {
    action: "customer_document_save",
    document_id: doc.id,
    content: { ...content(), recommendation: "Changed recommendation." },
  }, "clint");
  assert.equal(doc.status, "draft");
  assert.equal(doc.approved_by, null);
  room.state.summary += " New evidence.";
  await assert.rejects(
    updateCustomerDocument(room, {
      action: "customer_document_approve",
      document_id: doc.id,
      confirmed: true,
    }, "sheree"),
    /changed/,
  );
  assert.deepEqual(room.state.proposal, before);
});
test("downloads use only customer content and carry draft status", async () => {
  const room = fixture(), request = await customerDocumentRequest(room, input);
  const doc = addCustomerDocument(room, request, "assessment", {
    text: JSON.stringify({ ...content(), internal_notes: "DO NOT EXPORT" }),
  }, "clint");
  const pdf = customerDocumentPdfDefinition(doc);
  assert.match(JSON.stringify(pdf), /DRAFT/);
  assert.doesNotMatch(
    JSON.stringify(pdf),
    /DO NOT EXPORT|Internal estimating material|analysis_approval/,
  );
  assert.ok((await customerDocumentDocx(doc)).size > 1000);
});
test("proposal price comes only from saved fees; hours and rates never enter export sections", async () => {
  const room = fixture();
  room.state.proposal = {
    title: "Offer",
    stage: "proposal_drafted",
    scope: "Bounded diagnostic",
    deliverables: "Report and handoff",
    items: [{
      description: "Discovery project",
      quantity: 9,
      unit_cents: 15000,
      frequency: "once",
      estimate_unit: "hours",
      basis: "SECRET BASIS",
    }],
  };
  room.state.proposal_generation = {
    status: "ready",
    review: { status: "passed" },
  };
  const request = await customerDocumentRequest(room, {
    ...input,
    kind: "proposal",
  });
  const doc = addCustomerDocument(room, request, "proposal", {
    text: JSON.stringify(content()),
  }, "clint");
  const sections = JSON.stringify(customerSections(doc));
  assert.equal(doc.pricing.total_cents, 135000);
  assert.match(sections, /1,350/);
  assert.doesNotMatch(sections, /SECRET BASIS|150\.00|9 hours/);
  room.state.proposal_generation.status = "needs_review";
  await assert.rejects(
    customerDocumentRequest(room, { ...input, kind: "proposal" }),
    /Resolve/,
  );
});
test("incomplete model responses cannot replace existing drafts", async () => {
  const room = fixture(), request = await customerDocumentRequest(room, input);
  assert.throws(() =>
    addCustomerDocument(room, request, "assessment", {
      text: '{"title":"Example"}',
    }, "clint")
  );
  assert.equal(room.state.customer_documents, undefined);
});
test("short summary output cannot pass the full assessment contract", () => {
  assert.throws(
    () => validateCustomerAssessment({ ...content(), journey: "" }),
    /incomplete/,
  );
  assert.throws(
    () =>
      validateCustomerAssessment({
        ...content(),
        findings: "A brief summary.",
      }),
    /Each finding/,
  );
  assert.throws(
    () =>
      validateCustomerAssessment({
        ...content(),
        findings: "### Finding\n**Evidence:** supported",
      }),
    /Completion check/,
  );
  assert.doesNotThrow(() => validateCustomerAssessment(content()));
});
test("both downloads share all eight editorial sections and preserve evidence limits", () => {
  const pages = customerDocumentPages(acaCustomerDraft);
  assert.equal(pages.length, 8);
  const text = pages.flatMap((p) => p.sections.map((s) => s.text)).join("\n");
  for (const field of Object.keys(CUSTOMER_FIELDS)) {
    if (acaCustomerContent[field]) {
      assert.ok(text.includes(acaCustomerContent[field]), field);
    }
  }
  assert.match(text, /three reviews per listing/);
  assert.match(text, /field number/);
  assert.match(text, /functioning sitemap/);
  assert.match(text, /ownership of @acalandscapingllc remains unresolved/);
});

test("large verification packets fail explicitly instead of truncating evidence", async () => {
  const room = fixture();
  room.state.local_verification_task = { report: "x".repeat(100001) };
  await assert.rejects(
    customerDocumentRequest(room, input),
    /no evidence was truncated/,
  );
});
