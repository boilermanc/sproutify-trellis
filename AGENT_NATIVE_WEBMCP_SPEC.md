# Trellis Agent-Native / WebMCP Architecture Specification

**Status:** Architecture / requirements draft v0.1  
**Date:** 2026-08-28  
**Scope:** Sproutify Trellis  
**Implementation:** Not started by this document

---

## 1. Executive Summary

Trellis should become **agent-native**: important product capabilities should be available both through the human UI and through a stable, typed capability layer that an AI agent can discover and invoke safely.

The objective is not to let an agent click Trellis buttons more efficiently. The objective is to expose the **meaningful operations behind those buttons** as explicit tools.

Example:

```text
Human UI:
Promo Studio → project → template → script → voice → music → render

Agent capability:
create_promo({
  project_id,
  goal,
  duration_seconds,
  style,
  reference_asset_ids,
  voiceover,
  music
})
```

Trellis remains responsible for orchestration, provider selection, job execution, validation, persistence, permissions, and output assets. The agent is responsible for interpreting user intent and selecting appropriate Trellis capabilities.

This architecture should support WebMCP-style browser/session integration where available, while keeping the underlying capability layer transport-independent so the same tools can later be exposed through other agent protocols or first-party in-app agents.

---

## 2. Context and Design Thesis

Trellis is already an orchestration platform rather than a simple content UI. The current architecture coordinates federated spoke data, Supabase, AI generation, n8n automation, media production, publishing, and project state. The repository's existing architecture explicitly describes Trellis as an orchestration layer rather than a data warehouse.

The next architectural step is:

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

This is preferable to making browser automation the primary integration surface:

```text
Agent → inspect DOM → infer button meaning → click → wait → inspect UI → repeat
```

Browser/computer-use automation remains useful as a compatibility fallback, but it should not be the canonical API for Trellis operations.

---

## 3. Key Lesson from the WebMCP Conversion Model

A useful V1 does **not** require exposing the entire application.

The commercial WebMCP model shown in the reference material focuses on a small number of high-value actions such as:

- `get_services`
- `check_area`
- `book_consult`
- `request_quote`
- `submit_intake`

The important principle is:

> **One valuable action that works cleanly and reliably for agents is a legitimate V1.**

For Trellis, we should follow the same pattern. Do not begin by converting every UI control into a tool. Identify a small number of valuable end-to-end jobs, expose them with excellent schemas and safety controls, instrument them, evaluate them, and expand from evidence.

This also creates a future Sweetwater Technology competency: the patterns developed for Trellis can later be reused to make other Sweetwater applications agent-ready and, potentially, to provide agent-readiness/WebMCP conversion services to outside businesses.

That commercial possibility is **not** part of the Trellis implementation scope, but the architecture should avoid Trellis-specific assumptions that would prevent reuse.

---

## 4. Goals

### 4.1 Primary goals

1. Expose meaningful Trellis operations as typed, discoverable agent tools.
2. Reuse existing Trellis domain services rather than duplicate application logic.
3. Respect the user's existing identity, branch, permissions, and authenticated context.
4. Make destructive, costly, external, or publication actions explicitly controllable.
5. Record every agent invocation in an auditable execution history.
6. Provide deterministic schemas and structured results suitable for agent reasoning.
7. Support asynchronous jobs for expensive media generation.
8. Measure tool reliability with repeatable evaluations.
9. Keep the capability layer independent of any single LLM vendor or browser protocol.
10. Allow Trellis itself to remain the orchestrator of downstream AI/media providers.

### 4.2 Non-goals

V1 will not:

- expose every UI interaction as a tool;
- allow agents to bypass RLS, authorization, approval gates, or application policy;
- give an agent raw database access;
- expose service-role credentials, provider API keys, or secrets;
- replace the Trellis UI;
- make generic DOM automation the primary product architecture;
- automatically publish or spend money without the required authorization policy;
- redesign existing Clip Studio, Episodes, Social Hub, Campaign Builder, or other modules merely to support agents.

---

## 5. Architectural Principle: UI and Agent Tools Share Domain Services

Agent tools must not contain independent business logic.

Preferred pattern:

```text
                 ┌───────────────┐
Human UI ───────→│ Domain Service │──────→ persistence/providers/workers
                 └───────▲───────┘
                         │
Agent Tool ──────────────┘
```

Avoid:

```text
Human UI → UI-specific implementation
Agent Tool → separate implementation of same workflow
```

Every agent-capable feature should therefore be mapped as:

| UI action | Domain service | Agent tool | Permission | Confirmation | Result |
|---|---|---|---|---|---|
| Human-facing operation | canonical application function | typed capability | required scope | policy | structured output |

This map becomes the authoritative agent capability inventory.

---

## 6. Capability Categories

Every capability must be assigned one of four risk classes.

### Class A — Read-only

Examples:

- get project
- list project assets
- get generation status
- search brand library
- retrieve campaign metadata

Default behavior: no confirmation after normal authentication/authorization.

### Class B — Reversible write

Examples:

- create draft project
- generate script draft
- create storyboard
- save generated asset
- update draft metadata

Default behavior: may execute without an extra confirmation when authorized, but must be audited.

### Class C — Cost-bearing / consequential

Examples:

- launch paid GPU render
- generate multiple expensive video variants
- invoke premium provider
- bulk generation

Default behavior: capability policy must evaluate expected cost/budget. Confirmation may be required above configurable thresholds.

### Class D — External / destructive / irreversible

Examples:

- publish content
- send campaign
- delete project/assets
- overwrite approved material
- perform external account action

Default behavior: explicit confirmation required unless a separately configured automation policy grants that exact action.

---

## 7. Tool Contract Standard

Each tool definition must include:

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

### Naming

Use verb-first `snake_case` names that describe business intent, not UI implementation:

Good:

- `create_promo`
- `generate_image`
- `generate_voiceover`
- `list_project_assets`
- `get_generation_status`

Avoid:

- `click_generate_button`
- `open_modal`
- `select_tab`
- `call_gemini`

Provider details should normally remain implementation details unless provider selection is intentionally exposed as a user choice.

---

## 8. Structured Result Envelope

All tools should return a predictable envelope.

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

Agents should not have to parse UI prose to determine whether an operation succeeded.

---

## 9. Authentication and Session Context

Web/session-based invocation should reuse authenticated Trellis identity where the integration mechanism permits it.

An authenticated browser session does **not** imply unrestricted capability access.

Every invocation must resolve an execution context similar to:

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

- Authorization is enforced server-side.
- Supplied `user_id` or `branch_id` values are never trusted merely because an agent sent them.
- Existing RLS and application-level access rules remain authoritative.
- Service-role credentials are never exposed to browser/agent clients.
- Cross-branch operations require explicit authorization.
- The agent receives only the minimum context needed to complete the requested job.

---

## 10. Confirmation Model

The tool layer must distinguish **intent recognition** from **authorization to execute**.

An agent deciding that the user wants to publish is not, by itself, sufficient authorization for a Class D action.

A tool may return:

```json
{
  "status": "needs_confirmation",
  "confirmation": {
    "action": "publish_clip",
    "summary": "Publish Rekkrd launch clip to YouTube",
    "expires_at": "..."
  }
}
```

The final execution must use a short-lived confirmation token bound to:

- user;
- tool;
- material parameters;
- target resource/account;
- expiration.

A confirmation for one action cannot authorize a materially different action.

---

## 11. Async Job Model

Media operations can take longer than an interactive tool invocation. Tools must not hold an agent/browser request open for an entire render.

Pattern:

```text
Agent → generate_video(...)
      ← queued + job_id

Agent → get_job_status(job_id)
      ← running

Agent → get_job_status(job_id)
      ← completed + asset_id
```

Where useful, future transports may support events/subscriptions, but polling must remain a reliable baseline.

This aligns with the existing Trellis render/job architecture planned in Clip Studio.

---

## 12. Initial Trellis Capability Inventory

The following is the candidate inventory, not a commitment to expose all tools in V1.

### Projects and assets

```text
get_project
list_projects
create_project
update_project
list_project_assets
get_asset
search_asset_library
```

### Brand intelligence

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

Existing Clip Studio is an especially strong candidate because it already has a structured workflow: source → script → approval → B-roll → render → publish.

Candidate tools:

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

The existing human approval gate before B-roll should remain a first-class policy boundary rather than being bypassed for agent use.

### Campaign / social

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

High-risk automation creation/modification should be deferred until authorization and confirmation semantics are proven.

---

## 13. Recommended V1

The reference conversion model argues for one valuable action working extremely well rather than many shallow actions.

For Trellis, the recommended V1 is a **small creative-production vertical slice**:

```text
get_project
list_project_assets
create_promo
get_job_status
```

### Why `create_promo` is the flagship action

It demonstrates Trellis's core value as an orchestrator rather than exposing a thin wrapper around a single model.

A user/agent can express a business goal:

```text
Create a 30-second Rekkrd launch promo using the approved brand identity,
existing project assets, voiceover, and a cinematic music bed.
```

The agent invokes one Trellis capability. Trellis then owns the internal production plan.

Illustrative schema:

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

Return:

```text
queued
job_id
production_plan summary
estimated/known cost information when available
```

This creates a meaningful end-to-end proof that an external agent can operate Trellis without understanding its UI.

---

## 14. WebMCP Adapter Boundary

Do not couple domain tools directly to a specific WebMCP/browser API.

Use an adapter structure conceptually similar to:

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
    mcp.ts        # future
  tools/
    projects/
    assets/
    creative/
    clips/
```

Exact paths should be adjusted to existing repository conventions during implementation.

The registry defines canonical Trellis capabilities. A WebMCP adapter translates those definitions into whatever browser-facing registration mechanism is supported. Future adapters can expose the same capabilities without rewriting business logic.

---

## 15. Capability Registry

The registry is the source of truth for:

- tool name/version;
- description;
- input/output schema;
- handler;
- risk class;
- permission requirements;
- confirmation policy;
- cost policy;
- availability/feature flag.

The application should be able to produce an internal capability manifest from this registry for debugging and evaluation.

Example:

```ts
registerTool({
  name: 'list_project_assets',
  version: '1.0',
  riskClass: 'A',
  requiredPermissions: ['projects.read'],
  inputSchema: ListProjectAssetsInput,
  outputSchema: ListProjectAssetsOutput,
  handler: listProjectAssets
});
```

---

## 16. Audit and Observability

The conversion-agency slide explicitly pairs setup with ongoing **monitoring + evaluations**. This is important technically even if Trellis never commercializes the service.

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

Do **not** blindly persist sensitive prompts, secrets, credentials, or PII. Existing `sanitizePII()` requirements apply before persisted AI/agent payloads.

Metrics should include:

- invocation count by tool/version;
- completion rate;
- schema validation failure rate;
- authorization denial rate;
- confirmation abandonment rate;
- median/P95 latency;
- job failure/retry rate;
- cost by tool;
- agent retry loops;
- human correction rate where measurable.

---

## 17. Evaluation Framework

Agent-ready does not mean "the tool registered successfully." It means an agent can reliably achieve the intended business outcome