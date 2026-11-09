import { draftProposal } from "./project-room-proposal-draft.mjs";
import { estimateRequest, applyWorkEstimate } from "./project-room-estimate.mjs";
import { saveProposal } from "./project-room-proposal.mjs";
import { currentRound, event } from "./project-room.mjs";
import { proposalReviewRequest, readProposalReview } from "./project-room-proposal-review.mjs";
import { sanitizePII } from "./project-room-sanitize.mjs";

export function needsAutomaticProposal(room) {
  return room.kind === "client" && room.status === "awaiting_user" &&
    currentRound(room)?.stage === "done" && !!room.state.summary?.trim() &&
    !room.state.proposal && !room.state.proposal_generation;
}

// Persist the attempt before spending tokens. Interrupted/failed attempts require
// manual review, never an automatic retry or replacement of an existing draft.
export async function createAutomaticProposal(room, { checkpoint, generate, review, failed }) {
  if (!needsAutomaticProposal(room)) return false;
  room.state.proposal_generation = { status: "running", at: new Date().toISOString() };
  event(room, "Research is ready. Preparing a proposal and work estimate for internal review.");
  await checkpoint();
  try {
    const draft = draftProposal(room);
    // A separate comparison may carry a read-only baseline. Use it only for
    // reconciliation; never mutate it or expose its prices as the new draft.
    const baseline = room.state.comparison?.baseline_proposal;
    const estimateDraft = baseline?.items?.length
      ? { ...draft, items: structuredClone(baseline.items) } : draft;
    const request = estimateRequest(room, estimateDraft, { discoveryOnly: true });
    const output = await generate(request.body.contents);
    room.state.proposal_generation.model = output.model;
    room.state.proposal_generation.usage = output.usage;
    room.state.proposal_generation.estimate_output = sanitizePII(output.text, 80000);
    const estimated = applyWorkEstimate(estimateDraft, output.text, 15000, request.evidence);
    const reviewOutput = await review(proposalReviewRequest(room, estimated).contents);
    room.state.proposal_generation.review_model = reviewOutput.model;
    room.state.proposal_generation.review_usage = reviewOutput.usage;
    room.state.proposal_generation.review_output = sanitizePII(reviewOutput.text, 80000);
    const quality = readProposalReview(reviewOutput.text);
    room.state.proposal_generation.review = quality;
    if (quality.status !== "passed") {
      // Retain an editable, unpriced draft and the reasons. Never publish suspect
      // prices as ready, retry endlessly, or replace them with invented defaults.
      room.state.proposal_generation.held_proposal = structuredClone(estimated);
      saveProposal(room, { ...estimated, stage: "proposal_drafted", items: estimated.items.map(item => ({ ...item, unit_cents: null })) }, null);
      room.state.proposal_generation.status = "needs_review";
      event(room, "Needs rework — Chief of staff found issues. Review the correction note and requested input in Proposal & pricing. Pricing is held back.");
      await failed(new Error("Chief of staff final review requires correction."));
      return true;
    }
    saveProposal(room, { ...estimated, stage: "proposal_drafted" }, null);
    room.state.proposal_generation = {
      ...room.state.proposal_generation,
      status: "ready", at: new Date().toISOString(), model: output.model,
      usage: output.usage, rate_cents: 15000,
    };
    event(room, "Discovery proposal and client-specific pricing saved as a draft. Implementation ideas remain unpriced until scope review. Review the suggested rate, hours and handoff before quoting.");
  } catch (error) {
    room.state.proposal_generation = { ...room.state.proposal_generation, status: "failed", at: new Date().toISOString(), failure_reason: sanitizePII(error?.message || "Proposal generation failed.", 2000) };
    event(room, "Research is complete, but the automatic proposal needs attention. Open Proposal & pricing to create or estimate the draft manually.");
    await failed(error);
  }
  return true;
}
