# Project rooms proof of concept

Entry: `https://trellis.sproutify.app/?view=project-rooms`, or **Project Rooms** in the pinned navigation.

## Working scope

Setup begins with an explicit **Company review** or **Product specification** choice; neither is preselected. Company intake asks for company name, public URL, the decision being informed, market, reader, pertinent information, scope and questions. Spec intake asks for the product, problem, users/journeys, requirements, constraints, integrations, already-made user decisions, acceptance criteria and open tradeoffs. A review step shows the assembled packet and budgets before creating a draft shared only with selected teammates. Creation never starts provider work automatically.

Company synthesis follows the StyleBAR assessment's general structure with a recommendation first, strengths, prioritized findings, improvements, optional work, discovery, next steps, and sources. The company report view uses navy and blue styling with restrained orange accents. Download Word document exports an editable DOCX with headings, tables, source links, questions, and the decision log. The content adapts to the project, including older summaries with fewer sections.

### Supporting document text

Users may add up to five PDF, TXT or MD files (5 MB each; PDFs up to 40 pages). PDF.js 6.5.438 extracts the PDF text layer locally in a worker; TXT/MD must be UTF-8. Extraction has a 20-second timeout and an 18,000-character per-file / 48,000-character combined limit. Partial excerpts are marked and previewed. Empty/image-only, protected or unreadable PDFs fail clearly. OCR, DOCX, images, page layout analysis and embedded attachments are not supported.

**Only extracted text is uploaded and persisted**, inside the existing member-shared room state after explicit per-document sharing consent. Original binary files stay in the browser and cannot be downloaded later from Trellis. The server validates filenames, type metadata, quotas, consent and fingerprints, and scrubs high-risk identifiers before persistence. Client extraction is user-supplied evidence, not independently attested file authenticity. Existing authentication and database access controls are unchanged; no public bucket or signed document URLs were added.

Documents can change only in a draft or after a round finishes. Each round retains an immutable snapshot of the document text so independent reviewers receive the same version. All role handoffs contain the extracted text, provenance, truncation and explicit limits; document contents cannot grant tools, access or approvals. The UI says **Included in round N handoff packet**, not that every page was read or every claim verified. Actual provider comprehension is not guaranteed. Live document-provider verification must distinguish real calls from the synthetic local fixture.

Benchmark inspection: Library `libfile_1fd8cc6efcb08191a98ead31abec878b` resolved the eight-page StyleBAR PDF and returned readable page text for all eight pages. The supported local materialization helper failed on Windows Python because `os.setxattr` is unavailable; no final local PDF was installed or falsely reported readable. Page-image pointers were returned by Library, but local PDF render/visual verification remains blocked. The report's design follows the user's stated palette and the readable reference structure. No benchmark PDF or private benchmark content is committed.

An active Trellis owner/admin/operator can create an member-shared client-research or product-specification room. A room stores the original brief, user direction, every round's research/reviews, source text, the living brief, open questions, proposed decisions, human decisions, request counters and activity history. Export downloads the complete Markdown record. Data survives tabs closing and deployments.

The chief-of-staff workflow is deliberately bounded: Manus research → OpenAI and Claude independently in parallel → Manus comparison and targeted verification → Gemini chief synthesis. The chief can request a focused next pass, ask for user judgment, or leave a deliverable for review. Its JSON cannot approve decisions. Approval/rejection is a separate authenticated user action and survives later rounds. All generated handoffs are readable Markdown; state has a versioned JSON schema.

The room advances once per minute using `pg_cron` and `pg_net`. The Edge Function checks a private worker token; browsers use Supabase Auth and active-operator checks. Every room operation additionally filters by explicit membership, including exports and handoffs. Tables have forced RLS, no browser grants, and service-role-only writes. Provider credentials are read only on the server and are never included in room responses.

## AI search (AEO) in company reviews

Open **Living brief → AI search (AEO) baseline**. Enter the public category and optional location a buyer would ask about. Leave out the company name. Save the five questions, then start research. The worker sends each question independently to OpenAI web search using the existing server connection. It saves the names that match the company or its website domain, other options named, and clickable citations supplied by the API. Results are labeled OpenAI web search. The operator can separately record manual checks from ChatGPT, Perplexity, or Google AI Overviews.

Automatic searches use five requests from the room budget and leave room for the five standard requests for that round. An unavailable connection or insufficient budget is shown in the baseline. Unusable or failed answers are excluded from the mention count. Completed attempts are reused in later rounds for the same category, and interrupted requests are not repeated automatically. The review handoffs, living brief, and Markdown export carry the search evidence. The Word report includes the chief's AEO findings when present in the synthesis. The default search model is `gpt-5.4-mini`, with an optional server-side `PROJECT_ROOM_AEO_MODEL` override. Results are stored in the existing room state.

## Connections and honest fallbacks

The initial installation has Manus and Gemini configured; OpenAI and Anthropic credentials are absent. The room stops at a missing connection. It does not silently impersonate those providers with Gemini. Users can show/copy the role handoff and import actual Markdown responses. Imported output is labeled **Imported by you** and pauses the room. The chief import requires JSON with `summary`, `questions`, `proposals`, `next_handoff`, and `next_action` (`continue`, `ask_user`, `complete`). Resume after importing to run the next available automatic step.

Saved connections in Settings are reused on the server. Optional Edge Function model overrides: `PROJECT_ROOM_OPENAI_MODEL`, `PROJECT_ROOM_CLAUDE_MODEL`, `PROJECT_ROOM_CHIEF_MODEL`. Defaults at implementation: `gpt-6.1-sol`, `claude-sonnet-5-5`, `gemini-3-flash-preview`. Provider availability is reported as credential presence, not proof that a model request will succeed. OpenAI/Claude live calls remain unverified until valid credentials are configured. The adapters have mocked transport tests, including incomplete-output and safe-error handling.

## Limits and recovery

- Defaults: three rounds, fifteen generation requests. Hard limits: five rounds, twenty-five generation requests. A full automatic round uses five standard requests, plus one Gemini request for each oversized Manus handoff (up to two per round). Automatic AI-search probes use their own five slots when enabled. Polls do not consume generation-request slots. These are request limits, **not dollar or Manus credit caps**.
- Requests are durably reserved before dispatch. The room uses an atomic 150-second lease plus version and lease-token fencing. Duplicate ticks cannot dispatch the same step. An expired in-flight request blocks for human recovery instead of automatically repeating paid work. Partial successful reviewer output is retained.
- Pause/cancel stops subsequent Trellis steps and prevents stale completions overwriting the user's action. It cannot recall a sent request or stop an already running Manus task. Open that private task to stop it in Manus. A timed-out/uncertain task may still incur provider charges.
- Manus tasks explicitly set `clear_connectors: true`, private visibility, no project/task references, and research-only instructions. The integration never auto-confirms actions or grants new access. Waiting tasks stop the room for a person to inspect in Manus. Account-level skills and general Manus tooling are still controlled by Manus; the prompt is not a complete sandbox for that third-party service.
- Only explicit stopped/completed Manus states with no running background jobs are accepted. Unknown states keep polling. After three hours Trellis stops waiting and asks for review. No arbitrary attachment URLs are downloaded; attachment-only results must be imported manually. Inline assistant text is the supported POC format; message pagination beyond the newest 100 events is not implemented.
- Prompts, imported text and generated text pass through the room PII/token scrubber before persistence/provider use. This is a basic pattern scrubber, not a guarantee that arbitrary sensitive project material is safe to share.
- The UI displays Markdown as safe text/headings. Full Markdown records and source URLs are preserved in export. No HTML from agents is executed.
- Rooms are available to their creator and explicitly added teammates. Original-file storage/RAG, arbitrary role planning, direct per-agent chat, full token billing, streaming and automatic external publishing remain outside this increment.
- Existing Trellis `tenant-secrets` and browser AI adapters still expose saved keys to signed-in users elsewhere in the app. This feature neither uses that response nor expands it; replacing the legacy secret-loading flow remains separate security work. Do not describe the entire app as secret-isolated.

Manus task prompts are capped at 4,800 UTF-8 bytes. All handoffs carry a checklist: objective, facts/sources, assumptions, disagreements, missing information, and the next assignment. OpenAI and Claude receive the same original evidence independently; neither receives the other review or a Gemini handoff summary.

Oversized Manus research/comparison packets now require Gemini preparation instead of beginning/end truncation. Gemini reads the full packet and returns a structured summary with exact source excerpts and URLs. Code validates required fields, coverage of every supplied source section (including both reviewers for comparison), quoted text, URLs, and the final UTF-8 byte limit. Saved decisions and intake constraints are copied verbatim outside the summary. These are structural/provenance checks, not proof of semantic completeness; the downstream comparison and final chief review still check the substance.

Preparation is a separate durable worker step. It reserves one request before calling Gemini and requires budget remaining for Manus. The next worker invocation dispatches Manus only after the validated handoff is saved. Unchanged packets reuse the saved preparation; changed notes/evidence invalidate it. Missing connections, invalid summaries, insufficient budget or excessive protected context stop the room with a Needs rework message and use the existing blocked-run alert path. There is no truncation fallback or automatic provider retry. No schema migration is needed.

Original evidence remains in round outputs. `handoffs[role]` retains the exact input snapshot and prepared result; `handoff_attempts` retains returned output, model and token usage, including rejected summaries. The existing cost estimate counts attempts only when its rate table supports the returned model; stored usage is not a claim of complete billing coverage. An interrupted preparation keeps the normal in-flight protection. Local tests use synthetic provider responses; real Gemini quality and Manus delivery require a separately authorized live release test.

## Run logs and alerts

Filter the `project-rooms` function logs by `room_id` and `run_id` to trace a worker step. Logs cover provider dispatch, observed failures, blocked rooms, and alert delivery. Claude stop reasons such as `max_tokens` and `refusal` are also shown in the room's review message.

Set the server-only `PROJECT_ROOM_ALERT_WEBHOOK_URL` secret to a private HTTPS JSON webhook, such as an n8n production webhook that forwards alerts to the team's chosen channel. The worker makes one bounded delivery attempt per persisted block or failure to save a blocked state. Payloads carry room and run IDs, stage, duration, and failure codes. Research content and raw errors stay out of the alert. Check for `alert_accepted` and verify the downstream message with a test incident. An accepted webhook response only confirms receipt by the webhook.

Missing webhook configuration or failed delivery is logged. Worker query and lease errors are logged separately. The webhook covers failures observed by the worker. Monitoring a worker that never starts or is terminated outright requires external monitoring of cron and function logs.

## Verification

`npm run test:project-rooms` exercises multi-pass progression, decision preservation, reviewer isolation, import ordering, input scrubbing, budgets, path-specific intake, document limits/consent, immutable document packets, and safe editorial report exports.

`deno test --allow-env supabase/functions/project-rooms/{providers,observability}.test.ts` tests mocked provider transports, safe stop-reason classification and alert delivery handling. In PowerShell pass both test paths explicitly.

`deno check supabase/functions/project-rooms/index.ts`, `npx tsc --noEmit`, and `npm run build` check the backend and frontend. `node tests/project-room-live-auth.mjs` uses only the local public Supabase build settings for read-only production auth checks.

`tests/fixtures/project-room.html` is a synthetic browser fixture. It blocks non-local requests and labels itself clearly. It exercises the real component and shared policy without claiming that provider calls are real.

With Vite serving that fixture, run `node tests/project-room-aeo-browser.mjs` to exercise the AEO save flow and mobile layout. Set `PROJECT_ROOM_TEST_URL` to the local Vite origin and `PLAYWRIGHT_MODULE` if using a bundled runtime.

Deployment: apply `supabase/migrations/20261106032348_project_rooms.sql` to the bound Trellis hub; deploy `project-rooms` with gateway verification disabled because the function explicitly authenticates both browser and cron paths. Do not remove those checks. The migration is included in the Schema Engine's master SQL stamp. Frontend deployment uses the existing GitHub `deploy.yml` workflow and verifies the exact live `build-info.txt` commit.

## Lessons

Manus v2 inherits default connectors unless explicitly cleared. A provider task being stopped does not mean its background jobs finished. Paid requests require durable reservation before dispatch and conservative recovery after an uncertain outcome. Model consensus is not factual verification, and model proposals are not user decisions.


## Shared prospects increment (local implementation; migration required)

Saving a company briefing creates its prospect and owner membership in the same transaction. Selecting an existing accessible, active prospect links the new room to it; company names are never used for automatic merging. Product rooms remain separate. Existing client rooms are backfilled one prospect per room, and existing creators retain owner access. Other teammates gain access only when the owner shares the room.

Owners can share with active Trellis owners, admins, and operators. Members can collaborate on notes, research and decisions; existing version checks reject stale edits. Sharing changes increment the room version, invalidating in-flight stale saves. Clients may be archived without deleting rooms, history or follow-up dates. Archiving does not cancel already running research. Restore before saving another briefing for an archived prospect.

The service API returns accessible clients alongside room lists. Actions: client_update (client_id, client_version, archived, follow_up_date, follow_up_note, archive_reason); members; share/unshare (id, version, user_id); search_client_data (query, optional client_id); import_meeting (id, version, meeting). Search returns cited excerpts from at most 50 accessible client rooms and explicitly reports limits; it does not invent answers. Meeting imports retain source provenance and require explicit room association.

Tables remain inaccessible directly to browsers; RLS read policies additionally constrain future browser grants by membership. Service-only RPCs atomically create/link prospects and manage membership; each checks its verified active actor. External meeting collection and scheduled delivery require the separately configured bridge; local helper availability alone does not mean collection is running.

### Styled Word reports

Both company assessment download actions use `services/companyAssessmentDocx.mjs`. Downloads are generated from the latest saved room summary, questions, and decisions, so existing reports receive the current design without rerunning research or modifying the saved plan. The editable export uses numbered section labels, recommendation callouts, shaded tables with repeating header rows, and page numbers. Run `node --test tests/company-assessment-docx.test.mjs` to check content, links, and editable structure.
