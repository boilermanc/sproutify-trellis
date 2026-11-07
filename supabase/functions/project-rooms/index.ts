import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.90.1";
import {
  advanceStage,
  applyChief,
  createRoom,
  currentRound,
  event,
  exportRoom,
  handoff,
  importOutput,
  nextRound,
  reserveCalls,
  sanitizePII,
} from "../_shared/project-room.mjs";
import { createManus, generate, pollManus } from "./providers.ts";
import { alertBlockedRun, failureDetails, runLog } from "./observability.ts";
import { validateDocuments } from "../_shared/project-room-intake.mjs";
import { searchRoomEvidence } from "../_shared/project-room-search.mjs";
import { attachMeetingNote } from "../_shared/project-room-meetings.mjs";
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
  if (error) {
    throw new Error("Could not load server-side provider connections.");
  }
  return {
    ...data,
    openai_api_key: data?.openai_api_key || Deno.env.get("OPENAI_API_KEY"),
    anthropic_api_key: data?.anthropic_api_key ||
      Deno.env.get("ANTHROPIC_API_KEY"),
  };
}
class RoomChanged extends Error {}

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
  if (error) throw new Error("Could not save room progress.");
  if (!data) {
    throw new RoomChanged(
      "Room changed in another session. Refresh before continuing.",
    );
  }
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
  const context = { room_id: id, run_id: crypto.randomUUID() };
  let stage = currentRound(room)?.stage;
  const started = Date.now();
  const providerFailures: ReturnType<typeof failureDetails>[] = [];
  let provider: string | undefined;
  runLog("info", "run_started", { ...context, stage });
  try {
    // Disabling an operator also stops their background provider work.
    const { data: operator } = await db
      .from("trellis_users")
      .select("id")
      .eq("auth_user_id", room.created_by)
      .eq("status", "active")
      .in("role", ["owner", "admin", "operator"])
      .maybeSingle();
    if (!operator) {
      throw new Error(
        "The room owner is no longer an active Trellis operator.",
      );
    }
    const r = currentRound(room);
    if (!r) throw new Error("No active round.");
    if (r.in_flight) {
      throw new Error(
        "A previous provider request has an uncertain outcome. Review the provider before importing the result. It was not retried.",
      );
    }
    advanceStage(room);
    stage = r.stage;
    const roles = r.stage === "analysis"
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
    if (missing.length) {
      throw new Error(
        `Missing connection: ${
          missing.join(", ")
        }. Add the saved connection in Settings, or import these handoff responses here.`,
      );
    }
    if (r.stage === "research" || r.stage === "review") {
      const role = r.stage;
      provider = "manus";
      runLog("info", "provider_started", { ...context, stage, provider });
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
        if (output?.waiting) {
          throw new Error(
            "Manus needs your input or confirmation. Review the private task in Manus, then resume this room. No action was automatically approved.",
          );
        }
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
          ? `Dispatching independent reviews: ${
            roles.join(", ")
          }. Both roles receive the same evidence packet.`
          : "Chief of staff is updating the living brief.",
      );
      await save(db, room, false);
      const results = await Promise.allSettled(
        roles.map(async (role, i) => {
          runLog("info", "provider_started", {
            ...context,
            stage,
            provider: role,
          });
          try {
            const output = await generate(role, prompts[i], secrets);
            runLog("info", "provider_completed", {
              ...context,
              stage,
              provider: role,
            });
            return output;
          } catch (error) {
            const failure = failureDetails(error, role);
            providerFailures.push(failure);
            runLog("warn", "provider_failed", {
              ...context,
              stage,
              ...failure,
            });
            throw error;
          }
        }),
      );
      const active = currentRound(room);
      const failures: string[] = [];
      results.forEach((result, i) => {
        if (result.status === "fulfilled") {
          active.outputs[roles[i]] = result.value;
        } else {
          failures.push(
            `${roles[i]}: ${result.reason?.message || "Request failed."}`,
          );
        }
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
    runLog("info", "run_step_saved", {
      ...context,
      stage,
      elapsed_ms: Date.now() - started,
    });
  } catch (err) {
    if (err instanceof RoomChanged) {
      runLog("info", "run_superseded", { ...context, stage });
      return;
    }
    const incident = {
      ...context,
      stage,
      elapsed_ms: Date.now() - started,
      failures: providerFailures.length
        ? providerFailures
        : [failureDetails(err, provider)],
    };
    // Cancel/pause increments version, so an in-flight completion cannot overwrite it.
    room.status = "blocked";
    room.error = sanitizePII((err as Error).message, 2000);
    event(room, room.error);
    try {
      await save(db, room);
    } catch (saveError) {
      if (saveError instanceof RoomChanged) {
        runLog("info", "run_superseded", { ...context, stage });
      } else {
        await alertBlockedRun("run_state_save_failed", incident);
      }
      return;
    }
    await alertBlockedRun("run_blocked", incident);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (Number(req.headers.get("content-length") || 0) > 100000) {
    return json({ error: "Request too large" }, 413);
  }
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
      if (error || valid !== true) {
        return json({ error: "Not authorized" }, 401);
      }
      const { data: rooms, error: listError } = await db
        .from("project_rooms")
        .select("id")
        .eq("status", "running")
        .order("updated_at")
        .limit(2);
      if (listError) {
        runLog("error", "worker_room_query_failed", {});
        return json({ error: "Could not load queued rooms." }, 500);
      }
      let secrets;
      try {
        secrets = await secretsFor(db);
      } catch {
        runLog("error", "worker_connections_failed", {});
        return json({ error: "Could not load provider connections." }, 500);
      }
      // Runtime survives the short pg_net HTTP timeout.
      EdgeRuntime.waitUntil(
        (async () => {
          for (const room of rooms || []) {
            try {
              await processRoom(db, room.id, secrets);
            } catch {
              runLog("error", "worker_room_failed", { room_id: room.id });
            }
          }
        })(),
      );
      return json({ accepted: true });
    }
    const authorization = req.headers.get("authorization") || "";
    if (!authorization.startsWith("Bearer ")) {
      return json({ error: "Sign in to Trellis." }, 401);
    }
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
    if (!operator) {
      return json(
        { error: "Project rooms require an active Trellis operator account." },
        403,
      );
    }
    const membershipQuery = (columns = "*"): any =>
      db.from("project_rooms")
        .select(`${columns},project_room_members!inner(user_id,role)`)
        .eq("project_room_members.user_id", user.id);
    const safeRoom = (room: any) => {
      const { project_room_members, ...rest } = room;
      return {
        ...publicRoom(rest),
        member_role: project_room_members?.[0]?.role,
      };
    };
    if (body.action === "list" || body.action === "search_client_data") {
      let query = membershipQuery(
        body.action === "list"
          ? "id,title,kind,status,client_id,version,created_at,updated_at"
          : "*",
      ).order("updated_at", { ascending: false });
      if (body.action === "search_client_data") {
        query = query.eq("kind", "client");
      }
      if (body.client_id) query = query.eq("client_id", body.client_id);
      const { data, error } = await query.limit(
        body.action === "list" ? 100 : 51,
      );
      if (error) throw new Error("Project room storage is not available.");
      if (body.action === "search_client_data") {
        const found = searchRoomEvidence((data || []).slice(0, 50), body.query);
        return json({
          results: found.matches.map((m: any) => ({
            room_id: m.room_id,
            room_title: m.title,
            source: m.source,
            snippet: m.text,
          })),
          limited: found.limited || data.length > 50,
        });
      }
      const clientIds = [
        ...new Set((data || []).map((r: any) => r.client_id).filter(Boolean)),
      ];
      const clients = clientIds.length
        ? await db.from("project_room_clients").select("*").in("id", clientIds)
        : { data: [], error: null };
      if (clients.error) throw new Error("Could not load prospects.");
      const s = await secretsFor(db);
      return json({
        rooms: data.map(safeRoom),
        clients: clients.data,
        connections: {
          research: !!s.manus_api_key,
          openai: !!s.openai_api_key,
          anthropic: !!s.anthropic_api_key,
          chief: !!s.gemini_api_key,
        },
      });
    }
    if (body.action === "client_update") {
      if (!Number.isInteger(body.client_version)) {
        throw new Error("Refresh the prospect before saving.");
      }
      const patch: Record<string, unknown> = {};
      if (body.status !== undefined) {
        if (!["prospect", "customer"].includes(body.status)) {
          throw new Error("Choose prospect or customer.");
        }
        patch.status = body.status;
      }
      if (body.archived !== undefined) {
        if (typeof body.archived !== "boolean") {
          throw new Error("Choose archive or restore.");
        }
        patch.archived = body.archived;
      }
      for (const key of ["follow_up_note", "archive_reason"]) {
        if (body[key] !== undefined) {
          patch[key] = sanitizePII(body[key], 2000).trim() || null;
        }
      }
      if (body.follow_up_date !== undefined) {
        const date = body.follow_up_date;
        if (
          date &&
          (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
            new Date(date + "T00:00:00Z").toISOString().slice(0, 10) !== date)
        ) throw new Error("Choose a valid follow-up date.");
        patch.follow_up_date = date || null;
      }
      const { data, error } = await db.rpc("update_project_room_client", {
        p_actor: user.id,
        p_client: body.client_id,
        p_version: body.client_version,
        p_patch: patch,
      });
      if (error) {
        throw new Error(
          "Could not save prospect. Refresh and check your access before trying again.",
        );
      }
      return json({ client: data?.[0] });
    }
    if (body.action === "create") {
      const room = createRoom(body);
      const { data, error } = await db.rpc("create_shared_project_room", {
        p_actor: user.id,
        p_room: room,
        p_client: body.client_id || null,
      });
      if (error || !data?.[0]) {
        throw new Error(
          "Could not save the briefing. Check that the selected prospect is active and shared with you.",
        );
      }
      return json({ room: { ...publicRoom(data[0]), member_role: "owner" } });
    }
    if (!/^[0-9a-f-]{36}$/i.test(body.id || "")) {
      return json({ error: "Choose a project room." }, 400);
    }
    const { data: room, error: readError } = await membershipQuery().eq(
      "id",
      body.id,
    ).maybeSingle();
    if (readError || !room) {
      return json({ error: "Project room not found." }, 404);
    }
    const memberRole = room.project_room_members?.[0]?.role;
    delete room.project_room_members;
    if (body.action === "members") {
      const { data: members, error } = await db.from("project_room_members")
        .select("user_id,role").eq("room_id", room.id);
      if (error) throw new Error("Could not load teammates.");
      const { data: operators, error: operatorsError } = await db.from(
        "trellis_users",
      ).select("auth_user_id,full_name,email")
        .eq("status", "active").in("role", ["owner", "admin", "operator"]);
      if (operatorsError) throw new Error("Could not load teammates.");
      const people = (operators || []).filter((p: any) => p.auth_user_id).map((
        p: any,
      ) => ({ user_id: p.auth_user_id, name: p.full_name, email: p.email }));
      return json({
        members: members.map((m: any) => ({
          ...people.find((p: any) => p.user_id === m.user_id),
          ...m,
        })),
        operators: memberRole === "owner" ? people : [],
      });
    }
    if (body.action === "share" || body.action === "unshare") {
      if (memberRole !== "owner") {
        return json({ error: "Only the room owner can change sharing." }, 403);
      }
      if (room.locked_until && Date.parse(room.locked_until) > Date.now()) {
        return json({
          error: "Wait for the current research step before changing sharing.",
        }, 409);
      }
      const { data, error } = await db.rpc("change_project_room_member", {
        p_actor: user.id,
        p_room: room.id,
        p_version: body.version,
        p_user: body.user_id,
        p_remove: body.action === "unshare",
      });
      if (error || !data?.[0]) {
        throw new Error(
          "Could not change sharing. Refresh and choose an active teammate other than the owner.",
        );
      }
      return json({
        room: { ...publicRoom(data[0]), member_role: memberRole },
      });
    }
    if (body.action === "get") {
      return json({ room: { ...publicRoom(room), member_role: memberRole } });
    }
    if (body.action === "export") return json({ markdown: exportRoom(room) });
    if (body.action === "handoff") {
      return json({ markdown: handoff(room, body.role) });
    }
    if (body.version !== room.version) {
      return json({ error: "Room changed. Refresh and try again." }, 409);
    }
    const busy = room.locked_until &&
      Date.parse(room.locked_until) > Date.now();
    if (busy && !["pause", "cancel"].includes(body.action)) {
      return json(
        {
          error:
            "A provider step is running. Pause it before changing direction.",
        },
        409,
      );
    }
    if (body.action === "start") {
      if (room.status !== "draft") {
        throw new Error("This room has already started.");
      }
      nextRound(room);
    } else if (body.action === "next_round") {
      if (room.status !== "awaiting_user") {
        throw new Error("Finish the current round first.");
      }
      nextRound(room);
    } else if (body.action === "resume") {
      if (!["paused", "blocked"].includes(room.status)) {
        throw new Error("This room is not paused or blocked.");
      }
      if (currentRound(room)?.in_flight) {
        throw new Error(
          "A request may have completed externally. Import the result after checking the provider; it will not be automatically retried.",
        );
      }
      room.status = "running";
      room.error = null;
      event(room, "User resumed the room.");
    } else if (body.action === "pause" || body.action === "cancel") {
      if (room.status === "cancelled") {
        throw new Error("This room is cancelled.");
      }
      room.status = body.action === "pause" ? "paused" : "cancelled";
      event(
        room,
        `User ${room.status} the room. Already dispatched provider work may still finish externally.`,
      );

    } else if (body.action === "documents") {
      if (!["draft", "awaiting_user"].includes(room.status)) {
        throw new Error(
          "Documents can be changed before research starts or after a round finishes.",
        );
      }
      room.state.documents = validateDocuments(body.documents);
      event(
        room,
        "User saved extracted document text for the next round. Originals and page images are not included.",
      );
    } else if (body.action === "import_meeting") {
      attachMeetingNote(room, body.meeting, user.id);
    } else if (body.action === "note") {
      const text = sanitizePII(body.text, 6000).trim();
      if (!text) throw new Error("Write your direction first.");
      if (room.state.notes.length >= 50) {
        throw new Error(
          "Note limit reached. Export this room and start a new one.",
        );
      }
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
      if (!decision || !["approved", "rejected"].includes(body.status)) {
        throw new Error("Choose a proposed decision and approve or reject it.");
      }
      decision.status = body.status;
      decision.actor = user.id;
      decision.at = new Date().toISOString();
      event(room, `User ${body.status}: ${decision.text}`);
    } else if (body.action === "import") {
      if (!["blocked", "paused", "running"].includes(room.status)) {
        throw new Error("Start a round before importing results.");
      }
      const r = currentRound(room);
      // Explicit human recovery of an uncertain request, without resubmission.
      if (r.in_flight?.includes(body.role)) {
        r.in_flight = r.in_flight.filter((role: string) => role !== body.role);
      }
      if (r.in_flight?.length === 0) delete r.in_flight;
      if (r.tasks[body.role]) {
        if (!body.confirm_external_finished) {
          throw new Error(
            "Confirm you reviewed the external task before importing its final answer.",
          );
        }
        r.tasks[`${body.role}_imported_task`] = r.tasks[body.role];
        delete r.tasks[body.role];
      }
      importOutput(room, body.role, body.text, user.id);
      if (room.status !== "awaiting_user") room.status = "paused";
      room.error = null;
    } else return json({ error: "Unknown action" }, 400);
    await save(db, room);
    return json({ room: { ...publicRoom(room), member_role: memberRole } });
  } catch (err) {
    return json({ error: sanitizePII((err as Error).message, 2000) }, 400);
  }
});
