import { alertBlockedRun, failureDetails } from "./observability.ts";
import { generate } from "./providers.ts";

Deno.test("Claude sends the larger cap and preserves reported model and token counts", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, init) => {
      if (JSON.parse(String(init?.body)).max_tokens !== 12_000) {
        throw new Error("Incorrect Claude output cap");
      }
      return Response.json({
        stop_reason: "end_turn",
        model: "claude-sonnet-5-5",
        usage: { input_tokens: 3210, output_tokens: 5100 },
        content: [{ type: "text", text: "Completed review" }],
      });
    };
    const result = await generate("anthropic", "test", { anthropic_api_key: "test" });
    if (result.model !== "claude-sonnet-5-5" ||
      result.usage?.input_tokens !== 3210 || result.usage?.output_tokens !== 5100) {
      throw new Error("Incorrect Claude usage metadata");
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("Claude stop reasons are classified without leaking provider text", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (
      const [reason, expected] of [
        ["max_tokens", "claude_max_tokens"],
        ["refusal", "claude_refusal"],
        ["private response", "claude_unknown"],
      ]
    ) {
      globalThis.fetch = async () =>
        Response.json({
          stop_reason: reason,
          content: [{ type: "text", text: "private response" }],
        });
      const error = await generate("anthropic", "private prompt", {
        anthropic_api_key: "test",
      }).then(() => null, (error: unknown) => error);
      if (
        failureDetails(error, "anthropic").code !== expected ||
        String(error).includes("private response")
      ) {
        throw new Error("Unexpected incomplete-response classification");
      }
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("webhook logs rejection without leaking its URL or response body", async () => {
  const name = "PROJECT_ROOM_ALERT_WEBHOOK_URL";
  const previous = Deno.env.get(name);
  const originalFetch = globalThis.fetch;
  const originalError = console.error;
  const logs: string[] = [];
  try {
    Deno.env.set(name, "https://example.test/private-hook");
    console.error = (line: string) => logs.push(line);
    let calls = 0;
    globalThis.fetch = async (_url, init) => {
      calls++;
      const body = JSON.parse(String(init?.body));
      if (
        body.run_id !== "run" || body.event !== "run_blocked" ||
        init?.redirect !== "error"
      ) throw new Error("Invalid alert");
      return new Response("private response", { status: 503 });
    };
    await alertBlockedRun("run_blocked", {
      room_id: "room",
      run_id: "run",
      elapsed_ms: 10,
      stage: "analysis",
      failures: [failureDetails(new Error("private prompt"), "anthropic")],
    });
    const output = logs.join("\n");
    if (
      calls !== 1 || !output.includes('"http_status":503') ||
      output.includes("private")
    ) {
      throw new Error("Unexpected alert delivery log");
    }
  } finally {
    globalThis.fetch = originalFetch;
    console.error = originalError;
    if (previous === undefined) Deno.env.delete(name);
    else Deno.env.set(name, previous);
  }
});
