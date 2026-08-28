# Trellis Agent-Native / WebMCP Architecture Specification

**Status:** Architecture / requirements draft v0.1  
**Date:** 2026-08-28  
**Scope:** Sproutify Trellis  
**Implementation:** Not started by this document

---

## 1. Executive Summary

Trellis should become **agent-native**: important product capabilities should be available both through the human UI and through a stable, typed capability layer that an AI agent can discover and invoke safely.

The objective is not to let an agent click Trellis buttons more efficiently. The objective is to expose the **meaningful operations behind those buttons** as explicit tools.

```text
User intent
   ↓
Agent
   ↓
Typed Trellis Capability Layer
   ↓
Trellis domain services / orchestration
   ↓
Supabase · n8n · AI providers · render workers · publishing providers
   ↓
Auditable result / artifact / job
```

Trellis remains responsible for orchestration, provider selection, validation, persistence, permissions and outputs. The agent interprets user intent and selects appropriate capabilities.

The capability layer must be transport-independent. A WebMCP-style browser/session adapter can expose it now or when the target browser API is available, while the same canonical tools can later support MCP, first-party in-app agents, or other transports.

---

## 2. Repository Context

Trellis is already designed as an orchestration layer rather than a data warehouse. The current repository uses React 19 + TypeScript, Supabase, Gemini with provider-agnostic plans, n8n automation, and federated spoke data. Existing modules include Campaign Builder, Social Hub, Automations, Brand Intelligence, Clip Studio and other production workflows.

Clip Studio is especially relevant: its source → script → approval → B-roll → render → publish pipeline already demonstrates structured jobs, approval gates, assets and asynchronous work. Agent support should reuse those application patterns rather than create a parallel product.

---

## 3. Lesson from the WebMCP Conversion Slide

The reference conversion model does not begin by exposing an entire website. It starts with a handful of high-value typed actions such as:

```text
get_services
check_area
book_consult
request_quote
submit_intake
```

Its strongest product lesson is:

> **One valuable action that works cleanly for agents is a valid V1.**

The slide also pairs initial setup with ongoing **monitoring + evaluations**. Trellis should adopt both ideas: start with a small, valuable vertical slice, instrument it heavily, prove reliability, then expand.

The pattern may later be reusable across other Sweetwater Technology products or as an agent-readiness/WebMCP conversion offering. That commercial service is outside this implementation scope, but the Trellis architecture should avoid unnecessary Trellis-only coupling.

---

## 4. Goals

1. Expose meaningful Trellis operations as typed, discoverable agent tools.
2. Reuse existing domain services; never duplicate business logic just for agents.
3. Respect authenticated user, branch, permissions, RLS and application policy.
4. Gate destructive, costly, external and publication actions appropriately.
5. Record every invocation in an auditable execution history.
6. Return structured results rather than UI prose.
7. Support asynchronous jobs for expensive media operations.
8. Measure reliability with repeatable evaluations.
9. Remain independent of any single LLM vendor or browser protocol.
10. Keep Trellis responsible for downstream provider orchestration.

### Non-goals for V1

- Exposing every UI interaction.
- Raw database access for agents.
- Exposing service-role keys or provider credentials.
- Replacing the Trellis UI.
- Using DOM clicking as the canonical integration model.
- Bypassing existing approval gates.
- Automatic publishing/spending without required authorization.
- Refactoring unrelated modules solely for agent support.

---

## 5. Core Architecture Rule

UI and agent tools must share canonical domain services.

```text
                 ┌────────────────┐
Human UI ───────→│ Domain Service │────→ DB/providers/workers
                 └───────▲────────┘
                         │
Agent Tool ──────────────┘
```

Do not implement the same workflow independently in UI code and agent code.

Every candidate capability should be inventoried as:

| UI action | Domain service | Agent tool | Permission | Confirmation | Result |
|---|---|---|---|---|---|
| Human operation | Canonical function | Typed capability | Required scope | Policy | Structured output |

This inventory becomes the authoritative conversion map.

---

## 6. Risk Classes

### A — Read-only
Examples: get project, list assets, get generation status, read brand guidance. Normally no extra confirmation after authentication/authorization.

### B — Reversible write
Examples: create draft project, generate script draft, create storyboard, save generated asset. Audited; normally no extra confirmation when authorized.

### C — Cost-bearing / consequential
Examples: paid GPU render, premium model, bulk video variants. Enforce budget/cost policy; confirmation may be required above configurable thresholds.

### D — External / destructive / irreversible
Examples: publish, send campaign, delete assets, overwrite approved material. Explicit confirmation required unless an independently configured automation policy authorizes that exact operation.

---

## 7. Tool Contract Standard

Each capability must define:

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

Use verb-first `snake_case` business names:

```text
create_promo
generate_image
generate_voiceover
list_project_assets
get_generation_status
```

Avoid UI or provider implementation names such as `click_generate_button`, `open_modal`, or `call_gemini`.

---

## 8. Standard Result Envelope

```ts
interface AgentToolResult<T> {
  ok: boolean;
  tool: string;
  version: string;
  invocation_id: string;
  status: 'completed' | 'queued' | 'running' | 'needs_confirmation' | 'failed';
  data?: T;
  job_id?: string;
  warnings?: string[];
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}
```

An agent should never need to parse UI copy to decide whether an operation succeeded.

---

## 9. Authentication and Execution Context

Where supported, a browser/WebMCP adapter should use the user's authenticated Trellis session. Session authentication does **not** imply unrestricted tool access.

```ts
interface AgentExecutionContext {
  user_id: string;
  branch_id?: string;
  session_id: string;
  permissions: string[];
  source: 'webmcp' | 'in_app_agent' | 'mcp' | 'api';
  agent?: string;
}
```

Requirements:

- Enforce authorization server-side.
- Never trust user/branch IDs simply because the agent supplied them.
- Existing RLS and application access rules remain authoritative.
- Never expose service-role credentials to browser/agent clients.
- Require authorization for cross-branch operations.
- Minimize data returned to the agent.

---

## 10. Confirmation Model

Intent recognition is not authorization. If an agent infers that a user wants to publish, that alone cannot authorize a Class D action.

A capability may return `needs_confirmation` with a short summary. Final execution should use a short-lived confirmation token bound to the user, tool, material parameters, destination and expiration. A confirmation for one operation cannot authorize a materially different operation.

Existing human review gates remain policy boundaries. For example, Clip Studio's Approve → B-roll gate should not silently disappear when an agent invokes the workflow.

---

## 11. Async Job Model

Long media operations return immediately with a job ID:

```text
Agent → generate_video(...)
      ← queued + job_id

Agent → get_job_status(job_id)
      ← running

Agent → get_job_status(job_id)
      ← completed + asset_id
```

Polling is the baseline. Future transports may add events/subscriptions. This aligns with existing Trellis render-job patterns.

---

## 12. Candidate Capability Inventory

### Projects / assets

```text
get_project
list_projects
create_project
update_project
list_project_assets
get_asset
search_asset_library
```

### Brand Intelligence

```text
get_brand_profile
get_brand_guidelines
get_brand_assets
get_brand_voice
```

### Creative generation

```text
generate_image
generate_voiceover
generate_music
generate_video
create_storyboard
create_promo
```

### Clip Studio

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

### Campaign / Social

```text
get_campaign
create_campaign_draft
generate_social_content
schedule_social_post
publish_social_post
```

### Automation

```text
list_automations
get_automation_status
run_automation
```

Creation/modification of powerful automations should wait until authorization and confirmation semantics are proven.

---

## 13. Recommended V1 Vertical Slice

Start with four tools:

```text
get_project
list_project_assets
create_promo
get_job_status
```

`create_promo` should be the flagship action because it demonstrates Trellis as an orchestrator rather than a thin model wrapper.

Illustrative input:

```ts
create_promo({
  project_id: string,
  goal: string,
  duration_seconds: number,
  aspect_ratio?: '9:16' | '16:9' | '1:1',
  style?: string,
  reference_asset_ids?: string[],
  voiceover?: {
    enabled: boolean,
    voice_id?: string,
    script?: string
  },
  music?: {
    enabled: boolean,
    direction?: string
  },
  variants?: number
})
```

Example intent:

> Create a 30-second Rekkrd launch promo using the approved brand identity, existing project assets, voiceover, and a cinematic music bed.

The agent should not need to know how Trellis implements script generation, image/video generation, Lyra/music, voice, render workers or asset storage. Trellis owns that production plan.

---

## 14. Adapter Boundary

Do not couple domain tools directly to one WebMCP/browser API.

Conceptual organization:

```text
agent/
  registry/
    toolRegistry.ts
    schemas.ts
    policies.ts
  runtime/
    executeTool.ts
    executionContext.ts
    confirmations.ts
    audit.ts
  adapters/
    webmcp.ts
    inApp.ts
    mcp.ts
  tools/
    projects/
    assets/
    creative/
    clips/
```

Exact paths must be reconciled with repository conventions during implementation.

The registry is canonical. Adapters translate registered capabilities into the target protocol without rewriting business logic.

---

## 15. Capability Registry Requirements

The registry is the source of truth for:

- name/version;
- description;
- input/output schema;
- handler;
- risk class;
- permission requirements;
- confirmation policy;
- cost policy;
- feature flag/availability.

Trellis should be able to render an internal capability manifest from the registry for debugging, documentation and evaluation.

---

## 16. Audit and Observability

Create an `agent_tool_invocations` audit record for every invocation.

Recommended fields:

```text
id UUID
invocation_id TEXT UNIQUE
user_id UUID
branch_id UUID nullable
session_id TEXT
tool_name TEXT
tool_version TEXT
source TEXT
risk_class TEXT
input_redacted JSONB
status TEXT
confirmation_required BOOLEAN
confirmation_id UUID nullable
job_id UUID nullable
latency_ms INT
cost_usd NUMERIC nullable
error_code TEXT nullable
created_at TIMESTAMPTZ
completed_at TIMESTAMPTZ nullable
```

Do not blindly persist prompts, secrets, credentials or PII. Existing `sanitizePII()` rules apply before persisted AI/agent payloads.

Track at minimum:

- invocation count by tool/version;
- completion rate;
- schema-validation failures;
- authorization denials;
- confirmation abandonment;
- median/P95 latency;
- job failure/retry rate;
- cost by tool;
- repeated agent retry loops;
- human correction rate where measurable.

---

## 17. Evaluation Framework

"Agent-ready" means an agent can reliably achieve the intended business outcome, not merely that a tool registered successfully.

Each production tool requires an evaluation suite with:

1. happy-path requests;
2. ambiguous requests;
3. invalid/missing parameters;
4. unauthorized branch/resource access;
5. duplicate/retried invocation;
6. provider/job failure;
7. confirmation-required cases;
8. cost-threshold cases where applicable;
9. adversarial parameter attempts;
10. output-schema validation.

V1 release target:

- 100% schema-valid outputs in controlled evals;
- zero authorization bypasses;
- zero unconfirmed Class D executions;
- idempotent behavior for retry-sensitive writes;
- ≥95% successful completion of the supported happy-path V1 tasks, excluding documented provider outages.

Maintain a small set of natural-language agent scenarios, not only unit tests. Example:

```text
"Use the Rekkrd project and make a 30-second vertical launch promo from its approved assets."
```

The eval should verify correct tool selection, parameter resolution, permission behavior, job creation and final asset retrieval.

---

## 18. Idempotency and Retries

Agents retry. Networks retry. Tool calls must assume duplicate delivery is possible.

Cost-bearing or write operations should accept/generate an idempotency key. Replaying the same invocation must return the existing job/result rather than silently creating duplicate paid generations.

Provider failures must return typed retryability information. Do not encourage an agent to retry permanent validation or permission failures.

---

## 19. Cost Controls

Generation tools should support:

- estimated cost where reasonably knowable;
- actual cost capture after completion;
- per-operation limits;
- per-user/branch budgets where appropriate;
- variant-count limits;
- explicit policy for premium/on-demand GPU providers.

The agent should not receive provider secrets. Provider routing remains inside Trellis.

---

## 20. Security Requirements

1. Server-side authorization on every tool.
2. Validate all inputs against schemas before execution.
3. Treat agent-generated strings as untrusted input.
4. Never expose service-role/provider secrets.
5. Preserve Supabase RLS boundaries.
6. Redact sensitive audit payloads.
7. Bind confirmations to exact material actions.
8. Apply rate limits and abuse controls.
9. Prevent arbitrary URL/file access through loosely validated tool parameters.
10. Log security-relevant denials without leaking sensitive details to the caller.

Prompt injection found in project content, URLs, transcripts or brand material must not be allowed to redefine tool permissions or system policy.

---

## 21. Human UI Requirements

Agent-native does not mean invisible automation. Trellis should eventually provide an Agent Activity surface showing:

- recent invocations;
- calling source/agent;
- tool and status;
- associated project/job;
- cost where relevant;
- pending confirmations;
- failures;
- timestamps.

The existing application should remain the place where a user can inspect and control the work an agent caused Trellis to perform.

---

## 22. Phased Implementation

### Phase A0 — Inventory / service boundary

- Build the UI → service → capability map.
- Identify which current UI flows already have reusable domain services.
- Identify business logic trapped inside React components and document only the minimum extraction needed.
- Lock V1 schemas before implementing transport adapters.

**Exit:** approved capability inventory and V1 contracts.

### Phase A1 — Runtime foundation

- Tool registry.
- Schema