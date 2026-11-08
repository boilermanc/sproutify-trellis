import { draftProposal } from "./project-room-proposal-draft.mjs";
import { estimateRequest, applyWorkEstimate } from "./project-room-estimate.mjs";
import { saveProposal } from "./project-room-proposal.mjs";
import { currentRound, event } from "./project-room.mjs";

export function needsAutomaticProposal(room) {
  return room.kind === "client" && room.status === "awaiting_user" &&
    currentRound(room)?.stage === "done" && !!room.state.summary?.trim() &&
    !room.state.proposal && !room.state.proposal_generation;
}

// Persist the attempt before spending tokens. Interrupted/failed attempts require
// manual review, never an automatic retry or replacement of an existing draft.
export async function createAutomaticProposal(room, { checkpoint, generate, failed }) {
  if (!needsAutomaticProposal(room)) return false;
  room.state.proposal_generation = { status: "running", at: new Date().toISOString() };
  event(room, "Research is ready. Preparing a proposal and work estimate for internal review.");
  await checkpoint();
  try {
    const draft = draftProposal(room);
    const request = estimateRequest(room, draft);
    const output = await generate(request.body.contents);
    const estimated = applyWorkEstimate(draft, output.text, 15000, request.evidence);
    saveProposal(room, { ...estimated, stage: "proposal_drafted" }, null);
    room.state.proposal_generation = {
      status: "ready", at: new Date().toISOString(), model: output.model,
      usage: output.usage, rate_cents: 15000,
    };
    event(room, "Proposal and client-specific pricing saved as a draft. Review the suggested rate, hours, scope and handoff before quoting.");
  } catch (error) {
    room.state.proposal_generation = { status: "failed", at: new Date().toISOString() };
    event(room, "Research is complete, but the automatic proposal needs attention. Open Proposal & pricing to create or estimate the draft manually.");
    await failed(error);
  }
  return true;
}
