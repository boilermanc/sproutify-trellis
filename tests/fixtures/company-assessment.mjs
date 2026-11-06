import { createRoom } from "../../supabase/functions/_shared/project-room.mjs";
export function assessmentFixture() {
  const room = {
    ...createRoom({
      kind: "client",
      intake: {
        name: "Fictional Painting Co",
        website: "https://example.com",
        objective: "Review existing customer routes before proposing new work.",
      },
    }),
    id: "00000000-0000-4000-8000-000000000001",
    version: 1,
  };
  room.status = "awaiting_user";
  room.state.summary = `## Recommendation
**Clarify the existing enquiry journey first.** Treat any new automation as a separate decision after discovery.

This is a synthetic layout fixture. No real business was researched, audited or interviewed.
## Existing strengths
- User-supplied context describes a clear local service offer and an existing website. These claims require validation.
## Prioritized findings
| Priority | Finding | Evidence and next check |
| --- | --- | --- |
| Validate first | Confirm the enquiry route works | Synthetic example; test the actual journey before asserting a defect. |
| Foundation | Establish one approved service source | Discovery question, not a verified inconsistency. |
## Improve what exists
Make the current service descriptions and contact route clear, then test the route on phone and desktop. Confirm the scope with the owner.
## Optional new work
A guided quote form or bounded assistant may be worth scoping separately if simpler improvements leave an evidenced need. No new build is approved.
## Discovery
Interview the designated decision-maker, inspect the existing enquiry workflow, and review authorized evidence before finalizing priorities.
## Practical next steps and decision
Agree the discovery questions and validate the current route. Then choose which improvements to pursue, defer or drop.
## Sources and limits
[Example reference](https://example.com). Synthetic demonstration only: no analytics, customer tests, commercial estimates or completed audit. Uploaded text is not a visual document review.`;
  room.state.questions = ["Which enquiry path matters most to the business?"];
  return room;
}
