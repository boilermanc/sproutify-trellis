import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import {
  createRoom,
  currentRound,
  nextRound,
  reserveCalls,
  handoff,
  importOutput,
  applyChief,
  advanceStage,
  event,
  sanitizePII,
  exportRoom,
} from "../_shared/project-room.mjs";
import { generate, createManus, pollManus } from "./providers.ts";
import { validateDocuments } from "../_shared/project-room-intake.mjs";
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, x-client-info, content-type, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
const URL = Deno.env.get("SUPABASE_URL")!;
const ORG = "00000000-0000-0000-0000-000000000001";
function dbClient() {
  return createClient(URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}
function publicRoom(room: any) {
  const { lock_token, locked_until, ...safe } = room;
  return {
    ...safe,
    busy: !!locked_until && Date.parse(locked_until) > Date.now(),
  };
}
async function secretsFor(db: any) {
  const { data, error } = await db
    .from("tenant_secrets")
    .select(
      "openai_api_key,anthropic_api_key,gemini_api_key,manus_api_key,manus_model",
    )
    .eq("organization_id", ORG)
    .maybeSingle();
  if (error)
    throw new Error("Could not load server-side provider connections.");
  return {
    ...data,
    openai_api_key: data?.openai_api_key || Deno.env.get("OPENAI_API_KEY"),
    anthropic_api_key:
      data?.anthropic_api_key || Deno.env.get("ANTHROPIC_API_KEY"),
  };
}
async function save(db: any, room: any, release = true) {
  let query = db
    .from("project_rooms")
    .update({
      status: room.status,
      state: room.state,
      error: room.error,
      updated_at: new Date().toISOString(),
      version: room.version + 1,
      ...(release ? { lock_token: null, locked_until: null } : {}),
    })
    .eq("id", room.id)
    .eq("version", room.version);
  if (room.lock_token) query = query.eq("lock_token", room.lock_token);
  const { data, error } = await query.select().maybeSingle();
  if (error || !data)
    throw new Error(
      "Room changed in another session. Refresh before continuing.",
    );
  Object.assign(room, data);
}
async function processRoom(db: any, id: string, secrets: any) {
  const token = crypto.randomUUID();
  const { data, error } = await db.rpc("claim_project_room", {
    p_id: id,
    p_token: token,
  });
  if (error) throw new Error("Could not acquire the room lease.");
  const room = data?.[0];
  if (!room) return;
  try {
    // Disabling an operator also stops their background provider work.
    const { data: operator } = await db
      .from("trellis_users")
      .select("id")
      .eq("auth_user_id", room.created_by)
      .eq("status", "active")
      .in("role", ["owner", "admin", "operator"])
      .maybeSingle();
    if (!operator)
      throw new Error(
        "The room owner is no longer an active Trellis operator.",
      );
    const r = currentRound(room);
    if (!r) throw new Error("No active round.");
    if (r.in_flight)
      throw new Error(
        "A previous provider request has an uncertain outcome. Review the provider before importing the result. It was not retried.",
      );
    advanceStage(room);
    const roles =
      r.stage === "analysis"
        ? ["openai", "anthropic"].filter((role) => !r.outputs[role])
        : [r.stage];
    const missing = roles.filter(
      (role) =>
        !secrets[
          role === "research" || role === "review"
            ? "manus_api_key"
            : role === "chief"
              ? "gemini_api_key"
              : `${role}_api_key`
        ],
    );
    if (missing.length)
      throw new Error(
        `Missing connection: ${missing.join(", ")}. Add the saved connection in Settings, or import these handoff responses here.`,
      );
    if (r.stage === "research" || r.stage === "review") {
      const role = r.stage;
      if (!r.tasks[role]) {
        reserveCalls(room, 1);
        r.in_flight = [role];
        event(
          room,
          `Starting Manus ${role}. Connectors cleared; task private.`,
        );
        await save(db, room, false); // reserve BEFORE non-idempotent external call
        const task = await createManus(
          handoff(room, role),
          secrets,
          `Trellis: ${room.title} / ${role} / round ${r.number}`,
        );
        // r was replaced by save; always mutate the durable current object.
        currentRound(room).tasks[role] = task;
        delete currentRound(room).in_flight;
      } else {
        const output = await pollManus(r.tasks[role], secrets);
        if (output?.waiting)
          throw new Error(
            "Manus needs your input or confirmation. Review the private task in Manus, then resume this room. No action was automatically approved.",
          );
        if (output) {
          r.outputs[role] = output;
          advanceStage(room);
          event(room, `Manus ${role} completed.`);
        }
      }
    } else if (r.stage === "analysis" || r.stage === "chief") {
      reserveCalls(room, roles.length);
      r.in_flight = roles;
      const prompts = roles.map((role) => handoff(room, role));
      event(
        room,
        r.stage === "analysis"
          ? `Dispatching independent reviews: ${roles.join(", ")}. Both roles receive the same evidence packet.`
          : "Chief of staff is updating the living brief.",
      );
      await save(db, room, false);
      const results = await Promise.allSettled(
        roles.map((role, i) => generate(role, prompts[i], secrets)),
      );
      const active = currentRound(room);
      const failures: string[] = [];
      results.forEach((result, i) => {
        if (result.status === "fulfilled")
          active.outputs[roles[i]] = result.value;
        else
          failures.push(
            `${roles[i]}: ${result.reason?.message || "Request failed."}`,
          );
      });
      delete active.in_flight;
      if (failures.length) throw new Error(failures.join(" "));
      if (r.stage === "chief") {
        try {
          applyChief(
            room,
            JSON.parse(
              active.outputs.chief.text.replace(
                /^```(?:json)?\s*|\s*```$/g,
                "",
              ),
            ),
          );
        } catch (e) {
          active.invalid_chief_output = active.outputs.chief;
          delete active.outputs.chief;
          throw e;
        }
      } else advanceStage(room);
    }
    await save(db, room);
  } catch (err) {
    // Cancel/pause increments version, so an in-flight completion cannot overwrite it.
    room.status = "blocked";
    room.error = sanitizePII((err as Error).message, 2000);
    event(room, room.error);
    try {
      await save(db, room);
    } catch {
      /* A user mutation or competing lease won; discard this stale result. */
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (Number(req.headers.get("content-length") || 0) > 100000)
    return json({ error: "Request too large" }, 413);
  try {
    const raw = await req.text();
    if (raw.length > 100000) return json({ error: "Request too large" }, 413);
    const body = JSON.parse(raw);
    const db = dbClient();
    // Gateway JWT check is disabled ONLY because cron uses this independent,
    // high-entropy worker credential; every other path verifies Supabase Auth.
    if (body.action === "tick") {
      const credential = req.headers.get("x-project-room-worker") || "";
      const { data: valid, error } = await db.rpc("check_project_room_worker", {
        p_token: credential,
      });
      if (error || valid !== true)
        return json({ error: "Not authorized" }, 401);
      const { data: rooms } = await db
        .from("project_rooms")
        .select("id")
        .eq("status", "running")
        .order("updated_at")
        .limit(2);
      const secrets = await secretsFor(db);
      // Runtime survives the short pg_net HTTP timeout.
      EdgeRuntime.waitUntil(
        (async () => {
          for (const room of rooms || [])
            await processRoom(db, room.id, secrets);
        })(),
      );
      return json({ accepted: true });
    }
    const authorization = req.headers.get("authorization") || "";
    if (!authorization.startsWith("Bearer "))
      return json({ error: "Sign in to Trellis." }, 401);
    const auth = createClient(URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false },
    });
    const {
      data: { user },
      error: authError,
    } = await auth.auth.getUser();
    if (authError || !user) return json({ error: "Sign in to Trellis." }, 401);
    const { data: operator } = await db
      .from("trellis_users")
      .select("id")
      .eq("auth_user_id", user.id)
      .eq("status", "active")
      .in("role", ["owner", "admin", "operator"])
      .maybeSingle();
    if (!operator)
      return json(
        { error: "Project rooms require an active Trellis operator account." },
        403,
      );
    if (body.action === "list") {
      const { data, error } = await db
        .from("project_rooms")
        .select("id,title,kind,status,created_at,updated_at")
        .eq("created_by", user.id)
        .order("updated_at", { ascending: false })
        .limit(100);
      if (error) throw new Error("Project room storage is not available.");
      const s = await secretsFor(db);
      return json({
        rooms: data,
        connections: {
          research: !!s.manus_api_key,
          openai: !!s.openai_api_key,
          anthropic: !!s.anthropic_api_key,
          chief: !!s.gemini_api_key,
        },
      });
    }
    if (body.action === "create") {
      const room = createRoom(body);
      const { data, error } = await db
        .from("project_rooms")
        .insert({ ...room, created_by: user.id })
        .select()
        .single();
      if (error) throw new Error("Could not create the private room.");
      return json({ room: publicRoom(data) });
    }
    if (!/^[0-9a-f-]{36}$/i.test(body.id || ""))
      return json({ error: "Choose a project room." }, 400);
    const { data: room, error: readError } = await db
      .from("project_rooms")
      .select("*")
      .eq("id", body.id)
      .eq("created_by", user.id)
      .maybeSingle();
    if (readError || !room)
      return json({ error: "Project room not found." }, 404);
    if (body.action === "get") return json({ room: publicRoom(room) });
    if (body.action === "export") return json({ markdown: exportRoom(room) });
    if (body.action === "handoff")
      return json({ markdown: handoff(room, body.role) });
    if (body.version !== room.version)
      return json({ error: "Room changed. Refresh and try again." }, 409);
    const busy =
      room.locked_until && Date.parse(room.locked_until) > Date.now();
    if (busy && !["pause", "cancel"].includes(body.action))
      return json(
        {
          error:
            "A provider step is running. Pause it before changing direction.",
        },
        409,
      );
    if (body.action === "start") {
      if (room.status !== "draft")
        throw new Error("This room has already started.");
      nextRound(room);
    } else if (body.action === "next_round") {
      if (room.status !== "awaiting_user")
        throw new Error("Finish the current round first.");
      nextRound(room);
    } else if (body.action === "resume") {
      if (!["paused", "blocked"].includes(room.status))
        throw new Error("This room is not paused or blocked.");
      if (currentRound(room)?.in_flight)
        throw new Error(
          "A request may have completed externally. Import the result after checking the provider; it will not be automatically retried.",
        );
      room.status = "running";
      room.error = null;
      event(room, "User resumed the room.");
    } else if (body.action === "pause" || body.action === "cancel") {
      if (room.status === "cancelled")
        throw new Error("This room is cancelled.");
      room.status = body.action === "pause" ? "paused" : "cancelled";
      event(
        room,
        `User ${room.status} the room. Already dispatched provider work may still finish externally.`,
      );
    } else if (body.action === "documents") {
      if (!["draft", "awaiting_user"].includes(room.status))
        throw new Error(
          "Documents can be changed before research starts or after a round finishes.",
        );
      room.state.documents = validateDocuments(body.documents);
      event(
        room,
        "User saved extracted document text for the next round. Originals and page images are not included.",
      );
    } else if (body.action === "note") {
      const text = sanitizePII(body.text, 6000).trim();
      if (!text) throw new Error("Write your direction first.");
      if (room.state.notes.length >= 50)
        throw new Error(
          "Note limit reached. Export this room and start a new one.",
        );
      room.state.notes.push({
        text,
        at: new Date().toISOString(),
        actor: user.id,
      });
      event(
        room,
        "User added project direction; included in subsequent handoffs.",
      );
    } else if (body.action === "decision") {
      const decision = room.state.decisions.find(
        (d: any) => d.id === body.decision_id,
      );
      if (!decision || !["approved", "rejected"].includes(body.status))
        throw new Error("Choose a proposed decision and approve or reject it.");
      decision.status = body.status;
      decision.actor = user.id;
      decision.at = new Date().toISOString();
      event(room, `User ${body.status}: ${decision.text}`);
    } else if (body.action === "import") {
      if (!["blocked", "paused", "running"].includes(room.status))
        throw new Error("Start a round before importing results.");
      const r = currentRound(room);
      // Explicit human recovery of an uncertain request, without resubmission.
      if (r.in_flight?.includes(body.role))
        r.in_flight = r.in_flight.filter((role: string) => role !== body.role);
      if (r.in_flight?.length === 0) delete r.in_flight;
      if (r.tasks[body.role]) {
        if (!body.confirm_external_finished)
          throw new Error(
            "Confirm you reviewed the external task before importing its final answer.",
          );
        r.tasks[`${body.role}_imported_task`] = r.tasks[body.role];
        delete r.tasks[body.role];
      }
      importOutput(room, body.role, body.text, user.id);
      if (room.status !== "awaiting_user") room.status = "paused";
      room.error = null;
    } else return json({ error: "Unknown action" }, 400);
    await save(db, room);
    return json({ room: publicRoom(room) });
  } catch (err) {
    return json({ error: sanitizePII((err as Error).message, 2000) }, 400);
  }
});
