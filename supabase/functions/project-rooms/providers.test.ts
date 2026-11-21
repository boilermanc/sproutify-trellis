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
Deno.test('chief synthesis rules are above source evidence and do not restrict the final price audit', async () => {
 const original=globalThis.fetch; let role='chief';
 globalThis.fetch=async (_url,init)=>{
   const body=JSON.parse(String(init?.body));
   assert(body.generationConfig.thinkingConfig.thinkingLevel==='MEDIUM','review has reasoning headroom');
   assert(body.generationConfig.maxOutputTokens===10000,'review response cap');
   if(role==='chief') assert(body.systemInstruction.parts[0].text.includes('NEVER copy, select or recommend hours'),'trusted scope boundary');
   else {
     assert(!body.systemInstruction,'price audit may inspect numerical hours');
     assert(body.generationConfig.responseJsonSchema.required.includes('input_needed'),'missing input must be explicit');
     assert(['customer_roles','scope','duplicate_work','hours','outcome_handoff','evidence','google_business','google_reviews','local_social','supplied_links','related_businesses'].every(k=>body.generationConfig.responseJsonSchema.properties.checks.required.includes(k)),'core and local evidence checks required');
   }
   return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:'{}'}]}}]});
 };
 try {await generate(role,'source suggests 8-13 hours',secrets); role='proposal_review'; await generate(role,'check 9 hours',secrets);} finally {globalThis.fetch=original;}
});
Deno.test('oversized Manus evidence is attached intact as UTF-8, with a bounded text briefing', async () => {
  const original=globalThis.fetch;
  const evidence='Middle evidence: ten URLs; sitemap observed, later check blocked. 農🌱\n'.repeat(200);
  globalThis.fetch=async (_url,init)=>{
    const body=JSON.parse(String(init?.body));
    assert(body.clear_connectors===true && body.share_visibility==='private','private and no inherited connectors');
    const file=body.message.content[1];
    assert(file.type==='file' && file.filename==='trellis-evidence.md','document part');
    const decoded=new TextDecoder().decode(Uint8Array.from(atob(file.file_data.split(',')[1]),c=>c.charCodeAt(0)));
    assert(decoded===evidence,'all source bytes preserved');
    return Response.json({task_id:'test'});
  };
  try {
    await createManus('Read the complete evidence attachment.',secrets,'test',{filename:'trellis-evidence.md',text:evidence});
    let rejected=false;
    try {await createManus('x'.repeat(4801),secrets,'test');} catch {rejected=true;}
    assert(rejected,'oversized text cannot dispatch');
  } finally {globalThis.fetch=original;}
});

Deno.test('proposal budget reserves room for output and retains incomplete-output protection', async () => {
  const original=globalThis.fetch;
  let finishReason='STOP';
  globalThis.fetch=async (_url,init)=>{
    const config=JSON.parse(String(init?.body)).generationConfig;
    assert(config.maxOutputTokens===14000,'proposal output budget');
    assert(config.thinkingConfig.thinkingLevel==='LOW' && config.temperature===1,'bounded Gemini 3 thinking');
    return Response.json({candidates:[{finishReason,content:{parts:[{text:'{"tasks":[]}'}]}}],usageMetadata:{promptTokenCount:100,candidatesTokenCount:300,thoughtsTokenCount:200}});
  };
  try {
    assert((await generate('proposal','estimate',secrets)).usage?.output_tokens===500,'thinking included in usage');
    finishReason='MAX_TOKENS'; let rejected=false;
    try {await generate('proposal','estimate',secrets);} catch {rejected=true;}
    assert(rejected,'never accept incomplete estimate');
  } finally {globalThis.fetch=original;}
});
Deno.test("OpenAI review can finish beyond 65 seconds but stops at its bounded deadline without retry", async () => {
  const originalFetch = globalThis.fetch;
  const originalTimeout = AbortSignal.timeout;
  let elapsed = 70_000;
  let attempts = 0;
  AbortSignal.timeout = (deadline: number) => {
    const controller = new AbortController();
    if (elapsed >= deadline) controller.abort(new DOMException("Signal timed out.", "TimeoutError"));
    return controller.signal;
  };
  globalThis.fetch = async (_url, init) => {
    attempts++;
    init?.signal?.throwIfAborted();
    return Response.json({ status: "completed", output: [{ content: [{ type: "output_text", text: "Completed independent review" }] }] });
  };
  try {
    assert((await generate("openai", "original evidence", secrets)).text === "Completed independent review", "review survives the old deadline");
    elapsed = 110_000;
    let timedOut = false;
    try { await generate("openai", "original evidence", secrets); }
    catch (error) { timedOut = error instanceof DOMException && error.name === "TimeoutError"; }
    assert(timedOut && attempts === 2, "deadline remains below the lease and no retry occurs");
    elapsed = 55_000;
    let searchTimedOut = false;
    try { await searchAeo("buyer question", 0, { name: "ACA" }, "test"); }
    catch (error) { searchTimedOut = error instanceof DOMException && error.name === "TimeoutError"; }
    assert(searchTimedOut && attempts === 3, "search keeps its shorter deadline without retry");
  } finally {
    globalThis.fetch = originalFetch;
    AbortSignal.timeout = originalTimeout;
  }
});
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
Deno.test('customer assessment budget supports full editorial output and rejects truncation', async () => {
 const original=globalThis.fetch; let finishReason='STOP';
 globalThis.fetch=async (_url,init)=>{const c=JSON.parse(String(init?.body)).generationConfig;
 assert(c.maxOutputTokens===14000,'full document output budget');
 assert(c.thinkingConfig.thinkingLevel==='LOW','bounded prose thinking');
 assert(c.responseJsonSchema.required.includes('journey'),'full customer schema');
 return Response.json({candidates:[{finishReason,content:{parts:[{text:'{}'}]}}]});};
 try { await generate('customer_document','write assessment',secrets,{required:['journey']}); finishReason='MAX_TOKENS'; let rejected=false;try{await generate('customer_document','write assessment',secrets,{required:['journey']});}catch{rejected=true;}assert(rejected,'never save a partial customer document'); }finally{globalThis.fetch=original;}
});
