# Project rooms proof of concept

Entry: `https://trellis.sproutify.app/?view=project-rooms`, or **Project Rooms** in the pinned navigation.

## Working scope

An active Trellis owner/admin/operator can create an owner-private client-research or product-specification room. A room stores the original brief, user direction, every round's research/reviews, source text, the living brief, open questions, proposed decisions, human decisions, request counters and activity history. Export downloads the complete Markdown record. Data survives tabs closing and deployments.

The chief-of-staff workflow is deliberately bounded: Manus research → OpenAI and Claude independently in parallel → Manus comparison and targeted verification → Gemini chief synthesis. The chief can request a focused next pass, ask for user judgment, or leave a deliverable for review. Its JSON cannot approve decisions. Approval/rejection is a separate authenticated user action and survives later rounds. All generated handoffs are readable Markdown; state has a versioned JSON schema.

The room advances once per minute using `pg_cron` and `pg_net`. The Edge Function checks a private worker token; browsers use Supabase Auth and active-operator checks. Every room operation additionally filters by the authenticated creator, including exports and handoffs. Tables have forced RLS, no browser grants, and service-role-only writes. Provider credentials are read only on the server and are never included in room responses.

## Connections and honest fallbacks

The initial installation has Manus and Gemini configured; OpenAI and Anthropic credentials are absent. The room stops at a missing connection. It does not silently impersonate those providers with Gemini. Users can show/copy the role handoff and import actual Markdown responses. Imported output is labeled **Imported by you** and pauses the room. The chief import requires JSON with `summary`, `questions`, `proposals`, `next_handoff`, and `next_action` (`continue`, `ask_user`, `complete`). Resume after importing to run the next available automatic step.

Saved connections in Settings are reused on the server. Optional Edge Function model overrides: `PROJECT_ROOM_OPENAI_MODEL`, `PROJECT_ROOM_CLAUDE_MODEL`, `PROJECT_ROOM_CHIEF_MODEL`. Defaults at implementation: `gpt-6.1-sol`, `claude-sonnet-5-5`, `gemini-3-flash-preview`. Provider availability is reported as credential presence, not proof that a model request will succeed. OpenAI/Claude live calls remain unverified until valid credentials are configured. The adapters have mocked transport tests, including incomplete-output and safe-error handling.

## Limits and recovery

- Defaults: three rounds, fifteen generation requests. Hard limits: five rounds, twenty-five generation requests. A full automatic round uses five requests. Polls do not consume generation-request slots. These are request limits, **not dollar or Manus credit caps**.
- Requests are durably reserved before dispatch. The room uses an atomic 150-second lease plus version and lease-token fencing. Duplicate ticks cannot dispatch the same step. An expired in-flight request blocks for human recovery instead of automatically repeating paid work. Partial successful reviewer output is retained.
- Pause/cancel stops subsequent Trellis steps and prevents stale completions overwriting the user's action. It cannot recall a sent request or stop an already running Manus task. Open that private task to stop it in Manus. A timed-out/uncertain task may still incur provider charges.
- Manus tasks explicitly set `clear_connectors: true`, private visibility, no project/task references, and research-only instructions. The integration never auto-confirms actions or grants new access. Waiting tasks stop the room for a person to inspect in Manus. Account-level skills and general Manus tooling are still controlled by Manus; the prompt is not a complete sandbox for that third-party service.
- Only explicit stopped/completed Manus states with no running background jobs are accepted. Unknown states keep polling. After three hours Trellis stops waiting and asks for review. No arbitrary attachment URLs are downloaded; attachment-only results must be imported manually. Inline assistant text is the supported POC format; message pagination beyond the newest 100 events is not implemented.
- Prompts, imported text and generated text pass through the room PII/token scrubber before persistence/provider use. This is a basic pattern scrubber, not a guarantee that arbitrary sensitive project material is safe to share.
- The UI displays Markdown as safe text/headings. Full Markdown records and source URLs are preserved in export. No HTML from agents is executed.
- Rooms are private to their creator. Multi-user membership, attachments/RAG, arbitrary role planning, direct per-agent chat, token billing, streaming, notifications and automatic external publishing are outside this POC.
- Existing Trellis `tenant-secrets` and browser AI adapters still expose saved keys to signed-in users elsewhere in the app. This feature neither uses that response nor expands it; replacing the legacy secret-loading flow remains separate security work. Do not describe the entire app as secret-isolated.

## Verification

`node --test tests/project-room.test.mjs` exercises multi-pass progression, decision preservation, reviewer isolation, import ordering, input scrubbing and budget enforcement.

`deno test --allow-env supabase/functions/project-rooms/providers.test.ts` tests mocked provider transports, connector clearing, private task creation, waiting/background states, assistant-only results and safe errors.

`deno check supabase/functions/project-rooms/index.ts`, `npx tsc --noEmit`, and `npm run build` check the backend and frontend. `node tests/project-room-live-auth.mjs` uses only the local public Supabase build settings for read-only production auth checks.

`tests/fixtures/project-room.html` is a synthetic browser fixture. It blocks non-local requests and labels itself clearly. It exercises the real component and shared policy without claiming that provider calls are real.

Deployment: apply `supabase/migrations/20261106032348_project_rooms.sql` to the bound Trellis hub; deploy `project-rooms` with gateway verification disabled because the function explicitly authenticates both browser and cron paths. Do not remove those checks. The migration is included in the Schema Engine's master SQL stamp. Frontend deployment uses the existing GitHub `deploy.yml` workflow and verifies the exact live `build-info.txt` commit.

## Lessons

Manus v2 inherits default connectors unless explicitly cleared. A provider task being stopped does not mean its background jobs finished. Paid requests require durable reservation before dispatch and conservative recovery after an uncertain outcome. Model consensus is not factual verification, and model proposals are not user decisions.
