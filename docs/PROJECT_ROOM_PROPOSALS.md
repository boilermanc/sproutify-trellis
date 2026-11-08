# Project Room proposals and sales pipeline

Status: outcome-led, one-time project update approved. Production backend version 13 enforces one-time proposal fees. The painting company draft is saved at room version 43, with its research hash unchanged. Projects finish with verification, customer ownership and handoff; no recurring services are offered.

## User workflow

Open a company room, then **Proposal & pricing**. **Generate proposal draft** uses the saved recommendation, discovery and improvement sections in an editable proposal template. It makes no additional AI/provider request. Scope, deliverables, timing, assumptions, exclusions, payment terms and next steps are editable. The outcome and completion checks appear before pricing. The Word proposal leads with “What success looks like,” then scope and handoff, with a project-price table and internal estimating notes at the end. **Save proposal** updates the pipeline; **Download proposal Word** uses the approved assessment design and labels the document as an internal planning draft. Existing assessment exports remain available.

Suggested defaults are explicit internal allowances, not validated market prices or approved rates: $150/hour, 8 discovery hours ($1,200), 18 optional implementation hours ($2,700), including verification and handoff. All values are editable. Blank fees remain unpriced; zero is a deliberate zero fee. Optional items are excluded from base totals. These are customer-fee estimates, not internal labor costs, provider token costs, invoices or collected cash.

**Sales pipeline** shows Prospect, Discovery, Proposal drafted, Proposal sent, Won and Lost. A company research room is one opportunity; several rooms for the same company count separately and must represent separate scopes. No company-name merging occurs. Open totals exclude Won, Lost, archived clients, and cancelled research rooms. The pipeline displays one-time project value only, with no assumed win probability. Legacy recurring amounts are excluded and flagged for review. Marking Won does not automatically convert the client to Customer. Stage changes do not send a proposal to anyone. The list is limited to 100 recently updated accessible rooms and discloses partial totals when capped.

## Persistence and access

`state.proposal` stores validated fields in the existing protected `project_rooms` row. No schema migration or new browser database grant is needed. `proposal_save` runs after the existing active-operator check, room membership check, version check and running-provider lock check. Only allowlisted proposal fields are accepted; text passes through the existing PII sanitizer, new saves accept one-time fees only, money uses integer cents, and dates, quantities, line counts and stage values are bounded. Research and decisions are preserved. The source summary is snapshotted server-side when the proposal is first saved; later research changes produce a review notice without overwriting the proposal. Unsaved edits retain their original version so concurrent changes cause a conflict instead of silently overwriting a teammate.

The list endpoint selects only the proposal JSON alongside room identifiers, then returns compact stage/value metadata. It does not include the proposal source snapshot in list responses. The room's regular membership rules protect full proposals. Provider handoffs are unchanged and do not include commercial pricing fields.

## Verification

- `npm run test:project-rooms`: includes proposal pricing, validation, text sanitization, research preservation, pipeline exclusions, Word structure and existing research tests.
- `node tests/project-room-proposal-browser.mjs`: local synthetic fixture, creation/save/download, pipeline values, Won transition, responsive width and console errors.
- `node tests/project-room-workspace-browser.mjs`: existing company archive/sharing/search/notes/Word/features regression.
- `npx tsc --noEmit`, `npm run build`, and `deno check --no-config supabase/functions/project-rooms/index.ts`.
- `tests/project-room-live-auth.mjs` now includes anonymous rejection for `proposal_save`; run after deployment.

Word content and native editable structure are verified. The usual document renderer is unavailable on this Windows host and the native Word preview could not be controlled, so the proposal's final page breaks have not been visually verified.

## Release and recovery

After explicit approval, resolve Switchboard for the Trellis repository and capture the current `project-rooms` function version and deployed frontend commit. Deploy the function with the new `_shared/project-room-proposal.mjs` included, preserving all current imports (including AEO) and its existing custom-auth configuration. Publish the matching frontend through the existing GitHub deployment workflow. Verify unauthenticated saves fail, member saves succeed, list totals match the saved proposal, and the live Word download works. Check shared member and outsider access as available; do not claim real-session coverage from synthetic fixture tests.

Seed the painting company's proposal only if explicitly approved, using the latest room summary and a version-checked update, preserving all other state and research. No customer message or proposal send is authorized by this release. Recovery is the previous frontend/function; retain proposal JSON so any saved work survives rollback.


## One-time project policy

New drafts contain discovery and optional implementation only, priced as one-time project packages. Internal hour assumptions remain editable. Scope must state the result, acceptance checks, handoff, customer account ownership and finish date. Additional work requires a separately approved project. Existing proposals are not silently rewritten; recurring items must be explicitly removed before saving or downloading. The painting company draft is updated separately with version and state-hash checks.
