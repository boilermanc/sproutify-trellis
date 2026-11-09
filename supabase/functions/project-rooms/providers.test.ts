import { createManus, generate, pollManus, searchAeo } from "./providers.ts";
const assert = (condition: unknown, message: string) => {
  if (!condition) throw new Error(message);
};
const secrets = {
  manus_api_key: "test",
  openai_api_key: "test",
  anthropic_api_key: "test",
  gemini_api_key: "test",
};
Deno.test("handoff preparation uses Gemini JSON, retains usage and rejects incomplete output", async () => {
  const original = globalThis.fetch;
  let finishReason = "STOP";
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(String(init?.body));
    assert(String(url).startsWith("https://generativelanguage.googleapis.com/"), "Gemini only");
    assert(body.contents[0].parts[0].text === "Full packet including middle disagreement", "full uncut input");
    assert(body.generationConfig.responseMimeType === "application/json", "structured response");
    assert(body.generationConfig.temperature === 1, "Gemini 3 recommended temperature");
    assert(body.generationConfig.thinkingConfig.thinkingLevel === "LOW", "compression reserves output for the packet");
    assert(!body.tools, "preparation has no external tools");
    return Response.json({ candidates: [{ finishReason, content: { parts: [{ text: '{"status":"needs_rework"}' }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20, thoughtsTokenCount: 30 } });
  };
  try {
    const result = await generate("handoff", "Full packet including middle disagreement", secrets);
    assert(result.usage?.input_tokens === 100 && result.usage?.output_tokens === 50, "usage includes thinking");
    finishReason = "MAX_TOKENS";
    let rejected = false;
    try { await generate("handoff", "Full packet including middle disagreement", secrets); }
    catch (error) { rejected = error instanceof Error && error.message.includes("MAX_TOKENS") && error.message.includes("nothing was sent to Manus"); }
    assert(rejected, "incomplete output never reaches handoff validation/dispatch");
  } finally { globalThis.fetch = original; }
});
Deno.test("AEO sends only the buyer question, requires web search and keeps provider citations", async () => {
  const original = globalThis.fetch;
  const question = "What are the best options for Atlanta interior painting?";
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(String(init?.body));
    assert(String(url) === "https://api.openai.com/v1/responses", "fixed endpoint");
    assert(body.input === question && !JSON.stringify(body).includes("Private Target"), "company matching stays local");
    assert(body.tool_choice === "required" && body.tools[0].type === "web_search", "web search required");
    assert(body.store === false && body.max_tool_calls === 1, "bound provider storage and tool calls");
    return Response.json({
      status: "completed",
      output: [
        { type: "web_search_call", status: "completed", action: { type: "search" } },
        { type: "message", role: "assistant", content: [{
          type: "output_text", text: "- **Other Painter** — an option",
          annotations: [{ type: "url_citation", url: "https://example.org/painting", title: "Painting" }],
        }] },
      ],
    });
  };
  try {
    const result = await searchAeo(question, 2, { name: "Private Target" }, secrets.openai_api_key);
    assert(result.question === 2 && result.outcome === "not_mentioned", "records the measured outcome");
    assert(result.competitors[0] === "Other Painter", "records other named options");
    assert(result.citations[0]?.url === "https://example.org/painting", "records provider citation");
  } finally {
    globalThis.fetch = original;
  }
});
Deno.test(
  "Manus creation clears inherited connectors and stays private",
  async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert(body.clear_connectors === true, "connectors must be cleared");
      assert(body.share_visibility === "private", "task must be private");
      assert(
        !body.project_id && !body.message.task_references,
        "no inherited project or task access",
      );
      return Response.json({ ok: true, task_id: "task1" });
    };
    try {
      assert(
        (await createManus("Research public info only", secrets, "Test")).id ===
          "task1",
        "task persisted",
      );
    } finally {
      globalThis.fetch = original;
    }
  },
);
Deno.test(
  "polling refuses waiting and unfinished background work, then selects assistant output only",
  async () => {
    const original = globalThis.fetch;
    let state = "waiting";
    let background = false;
    globalThis.fetch = async (url) =>
      String(url).includes("task.detail")
        ? Response.json({
            task: { status: state, has_running_background_jobs: background },
          })
        : Response.json({
            messages: [
              { type: "user_message", content: "UNTRUSTED_USER" },
              {
                type: "assistant_message",
                assistant_message: { content: "Actual final research" },
              },
            ],
          });
    try {
      const task = { id: "task1", started_at: new Date().toISOString() };
      assert(
        (await pollManus(task, secrets))?.waiting,
        "waiting must require user",
      );
      state = "stopped";
      background = true;
      assert(
        (await pollManus(task, secrets)) === null,
        "background jobs must finish",
      );
      background = false;
      assert(
        (await pollManus(task, secrets))?.text === "Actual final research",
        "only assistant result",
      );
    } finally {
      globalThis.fetch = original;
    }
  },
);
Deno.test(
  "provider transport sends no tools; preserves independent outputs; never returns raw HTTP error",
  async () => {
    const original = globalThis.fetch;
    const calls: string[] = [];
    globalThis.fetch = async (url, init) => {
      const body = JSON.parse(String(init?.body));
      assert(!body.tools, "no external tools");
      calls.push(String(url));
      if (String(url).includes("openai"))
        return Response.json({
          status: "completed",
          output: [{ content: [{ type: "output_text", text: "A" }] }],
        });
      return Response.json({
        stop_reason: "end_turn",
        content: [{ type: "text", text: "B" }],
      });
    };
    try {
      const results = await Promise.all([
        generate("openai", "SAME_PACKET", secrets),
        generate("anthropic", "SAME_PACKET", secrets),
      ]);
      assert(
        results[0].text === "A" &&
          results[1].text === "B" &&
          calls.length === 2,
        "parallel independent results",
      );
      globalThis.fetch = async () =>
        new Response("sk-sensitive_provider_debug_text", { status: 403 });
      let message = "";
      try {
        await generate("openai", "packet", secrets);
      } catch (e) {
        message = (e as Error).message;
      }
      assert(
        message.includes("HTTP 403") && !message.includes("sensitive_provider"),
        "raw provider responses stay private",
      );
    } finally {
      globalThis.fetch = original;
    }
  },
);
