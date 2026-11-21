# Trellis Agent-Native / WebMCP Architecture Specification

**Status:** Architecture draft v0.1  
**Date:** 2026-08-28  
**Implementation:** Not started by this document

## 1. Objective

Make Trellis **agent-native**. Important product capabilities should be available both through the human UI and through stable, typed tools that an AI agent can discover and invoke safely.

The goal is not better button-clicking. It is exposing the meaningful operation behind the UI:

```text
User intent → Agent → Trellis capability → Domain service
                                  ↓
              Supabase / n8n / AI / workers / publishers
                                  ↓
                       Auditable result or job
```

Trellis remains the orchestrator. The agent interprets intent. The capability layer must be transport-independent so WebMCP/browser integration, MCP, an in-app agent, or future transports can expose the same canonical tools.

## 2. Repository Context

Trellis is already an orchestration platform: React/TypeScript UI, Supabase, federated spoke data, Gemini/provider abstraction, n8n automation, media workflows, and publishing. Existing repository guidance explicitly defines Trellis as an orchestration layer rather than a data warehouse.

Clip Studio is an important precedent. Its source → script → approval → B-roll → render → publish workflow already contains structured jobs, assets and human approval gates. Agent support should reuse these patterns rather than create a parallel application.

## 3. Lesson from the Reference WebMCP Slide

The conversion-agency model starts with a few valuable typed actions:

```text
get_services
check_area
book_consult
request_quote
submit_intake
```

The key product rule is:

> **One valuable action that works cleanly for agents is a valid V1.**

The slide also pairs setup with **monitoring + evaluations**. Trellis should do the same: expose a narrow high-value workflow, instrument it, prove reliability, then expand.

The pattern may later be reusable across Sweetwater Technology applications or as an agent-readiness/WebMCP service. That business is outside this implementation scope, but the architecture should not prevent reuse.

## 4. Requirements

Trellis must:

- expose business operations, not UI gestures;
- reuse existing domain services rather than duplicate logic;
- respect authenticated user, branch, RLS and permissions;
- gate costly, destructive, external and publishing operations;
- produce structured machine-readable results;
- support asynchronous media jobs;
- audit every invocation;
- provide idempotency for retry-sensitive writes;
- measure tool reliability with repeatable evals;
- remain independent of any single model/provider/browser protocol.

V1 will **not** expose every UI control, raw database access, service-role keys, or unrestricted publishing. Browser DOM automation remains a fallback, not the canonical architecture.

## 5. Shared Domain-Service Rule

```text
                 ┌────────────────┐
Human UI ───────→│ Domain Service │────→ DB/providers/workers
                 └───────▲────────┘
                         │
Agent Tool ──────────────┘
```

Do not implement the same business workflow separately for the UI and agent.

Maintain a capability inventory:

| UI action | Domain service | Agent tool | Permission | Confirmation | Result |
|---|---|---|---|---|---|
| Human operation | Canonical function | Typed tool | Required scope | Policy | Structured output |

## 6. Risk Classes

**A — Read-only:** get project, list assets, get status, read brand guidance. Normally no extra confirmation after authorization.

**B — Reversible write:** create draft, generate script, create storyboard, save generated asset. Audited; normally no extra confirmation.

**C — Cost-bearing/consequential:** paid GPU render, premium provider, bulk variants. Enforce budgets/thresholds; confirmation may be required.

**D — External/destructive/irreversible:** publish, send campaign, delete, overwrite approved work. Explicit confirmation required unless a separately configured policy authorizes that exact action.

## 7. Canonical Tool Contract

```ts
interface TrellisAgentToolDefinition {
  name: string;
  version: string;
  title: string;
  description: string;
  riskClass: 'A' | 'B' | 'C' | 'D';
  requiredPermissions: string[];
  inputSchema: object;
  outputSchema: object;
  idempotency: 'required' | 'supported' | 'not_applicable';
  confirmationPolicy: string;
  costPolicy?: string;
  timeoutClass: 'interactive' | 'async_job';
}
```

Use verb-first `snake_case` business names: `create_promo`, `generate_image`, `list_project_assets`, `get_job_status`. Avoid UI/provider names such as `click_button`, `open_modal`, or `call_gemini`.

Standard result:

```ts
interface AgentToolResult<T> {
  ok: boolean;
  tool: string;
  version: string;
  invocation_id: string;
  status: 'completed'|'queued'|'running'|'needs_confirmation'|'failed';
  data?: T;
  job_id?: string;
  warnings?: string[];
  error?: { code: string; message: string; retryable: boolean };
}
```

Agents must not parse UI prose to determine success.

## 8. Authentication / Authorization

Where supported, a WebMCP/browser adapter should use the authenticated Trellis session. Authentication does not imply unrestricted tool access.

Execution context should include server-resolved user, branch, session, permissions and calling source. Never trust a user/branch ID merely because an agent supplied it. Existing RLS remains authoritative. Never expose service-role/provider credentials. Cross-branch operations require authorization.

## 9. Confirmation Policy

Intent recognition is not authorization. An agent inferring "publish this" cannot by itself authorize a Class D operation.

A tool may return `needs_confirmation`. Final execution should use a short-lived confirmation token bound to user, tool, material parameters, destination and expiration. Confirmation for one action cannot authorize a materially different action.

Existing gates remain policy boundaries. Clip Studio's Approve → B-roll gate must not silently disappear for agent callers.

## 10. Async Jobs

Long media work returns a job immediately:

```text
generate_video(...) → queued + job_id
get_job_status(job_id) → running
get_job_status(job_id) → completed + asset_id
```

Polling is the baseline; future transports may add events. Duplicate requests must not create duplicate paid work when an idempotency key matches an existing invocation.

## 11. Candidate Capability Inventory

**Projects/assets**

```text
get_project
list_projects
create_project
update_project
list_project_assets
get_asset
search_asset_library
```

**Brand Intelligence**

```text
get_brand_profile
get_brand_guidelines
get_brand_assets
get_brand_voice
```

**Creative**

```text
generate_image
generate_voiceover
generate_music
generate_video
create_storyboard
create_promo
```

**Clip Studio**

```text
create_clip_project
add_clip_source
generate_clip_script
revise_clip_script
approve_clip_script
generate_clip_broll
get_clip_status
publish_clip
```

**Campaign/social/automation**

```text
get_campaign
create_campaign_draft
generate_social_content
schedule_social_post
publish_social_post
list_automations
get_automation_status
run_automation
```

Powerful automation creation/modification should be deferred until authorization semantics are proven.

## 12. Recommended V1

Start with only:

```text
get_project
list_project_assets
create_promo
get_job_status
```

`create_promo` is the flagship because it proves Trellis is an orchestrator, not a thin wrapper around one model.

```ts
create_promo({
  project_id: string,
  goal: string,
  duration_seconds: number,
  aspect_ratio?: '9:16'|'16:9'|'1:1',
  style?: string,
  reference_asset_ids?: string[],
  voiceover?: { enabled: boolean; voice_id?: string; script?: string },
  music?: { enabled: boolean; direction?: string },
  variants?: number
})
```

Example intent: "Create a 30-second Rekkrd launch promo using the approved brand identity, existing project assets, voiceover, and a cinematic music bed."

The agent should not need to understand Trellis's internal image/video/music/voice providers, render workers or storage. Trellis owns the production plan.

## 13. Adapter Boundary

Conceptual structure:

```text
agent/
  registry/     toolRegistry.ts, schemas.ts, policies.ts
  runtime/      executeTool.ts, executionContext.ts, confirmations.ts, audit.ts
  adapters/     webmcp.ts, inApp.ts, mcp.ts
  tools/        projects/, assets/, creative/, clips/
```

Exact paths should follow repository conventions during implementation. The registry is canonical; adapters translate it to the target protocol.

## 14. Audit / Observability

Every call creates an `agent_tool_invocations` record. Recommended fields:

```text
id, invocation_id, user_id, branch_id, session_id,
tool_name, tool_version, source, risk_class,
input_redacted, status, confirmation_required,
confirmation_id, job_id, latency_ms, cost_usd,
error_code, created_at, completed_at
```

Do not blindly persist prompts, secrets, credentials or PII. Existing `sanitizePII()` rules apply.

Track invocation count, completion rate, schema failures, authorization denials, confirmation abandonment, P50/P95 latency, job failures/retries, cost, repeated agent retries and human correction rate where measurable.

## 15. Evaluations

Every production tool requires evals covering happy path, ambiguity, missing/invalid parameters, unauthorized resources, duplicate invocation, provider failure, confirmation cases, cost thresholds, adversarial parameters and output-schema validation.

V1 targets:

- 100% schema-valid controlled outputs;
- zero authorization bypasses;
- zero unconfirmed Class D executions;
- idempotent retry-sensitive writes;
- ≥95% completion of supported happy-path scenarios excluding documented provider outages.

Include natural-language end-to-end scenarios, e.g. "Use the Rekkrd project and make a 30-second vertical launch promo from its approved assets." Verify tool selection, parameter resolution, permissions, job creation and final asset retrieval.

## 16. Cost / Security Controls

Cost-bearing tools should capture estimated cost when knowable, actual cost, per-operation limits, branch/user budgets, variant limits and premium/GPU policy.

Security requirements:

1. Server-side authorization for every tool.
2. Schema validation before execution.
3. Treat agent-generated strings as untrusted input.
4. Never expose service/provider secrets.
5. Preserve RLS boundaries.
6. Redact sensitive audit payloads.
7. Bind confirmations to exact actions.
8. Rate-limit and abuse-protect tools.
9. Prevent arbitrary URL/file access through loose parameters.
10. Treat instructions found inside project content, URLs or transcripts as data; they cannot redefine tool permissions or policy.

## 17. Human Visibility

Eventually add an **Agent Activity** surface showing recent invocations, caller/source, tool, status, project/job, cost, pending confirmations, failures and timestamps. The Trellis UI remains the user's control surface for work agents initiate.

## 18. Delivery Plan

**A0 — Inventory:** map UI → domain service → tool; identify logic trapped in components; lock V1 schemas.

**A1 — Runtime:** implement registry, schema validation, execution context, risk/permission policy, result envelope, idempotency and audit records.

**A2 — V1 tools:** implement `get_project`, `list_project_assets`, `create_promo`, `get_job_status` against canonical services. Add eval suite and feature flags.

**A3 — WebMCP adapter:** expose registry tools through the supported browser/session mechanism. Keep protocol-specific code in the adapter. Verify authenticated-session behavior and confirmations.

**A4 — Expansion:** add image/voice/music/video primitives and Clip Studio tools based on measured V1 demand/reliability.

**A5 — Productization:** Agent Activity UI, budgets, policy administration, capability documentation and broader Sweetwater reuse.

## 19. Definition of Done for V1

V1 is complete when an authorized user can ask a compatible agent to create a promo from an existing Trellis project without the agent navigating the Trellis UI, and:

- the agent discovers/uses typed tools;
- project/asset access is permission-checked;
- `create_promo` returns a durable job ID;
- duplicate invocation is safe;
- job status is structured;
- generated assets attach to the correct project;
- cost is captured where available;
- every invocation is audited;
- required confirmations cannot be bypassed;
- the end-to-end eval target passes.

## 20. Implementation Decision

**Proceed with the capability registry and V1 vertical slice before attempting broad WebMCP conversion.**

The architectural asset is the typed Trellis capability layer. WebMCP is an adapter to that layer, not the layer itself. This keeps the work valuable even as browser/agent integration mechanisms evolve.
