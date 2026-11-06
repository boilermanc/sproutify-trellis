import React, { useCallback, useEffect, useRef, useState } from "react";
import ProjectRoomIntake from "../components/ProjectRoomIntake";
import CompanyAssessment from "../components/CompanyAssessment";
import RoomDocumentReview from "../components/RoomDocumentReview";
import {
  ArrowRight,
  Check,
  CirclePause,
  Download,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  ShieldCheck,
  Square,
  Users,
  X,
} from "lucide-react";
import {
  callRoom,
  type ProjectRoom,
  type RoomRole,
} from "../services/projectRoomService";
const roles: { id: RoomRole; name: string; detail: string }[] = [
  { id: "research", name: "Manus", detail: "Research & sources" },
  { id: "openai", name: "OpenAI", detail: "Independent analysis" },
  { id: "anthropic", name: "Claude", detail: "Independent analysis" },
  { id: "review", name: "Manus reviewer", detail: "Compare & investigate" },
  { id: "chief", name: "Chief of staff", detail: "Living brief & next pass" },
];
const button =
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed";
const input =
  "w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500";
const badge = (status: string) =>
  ["running", "approved"].includes(status)
    ? "bg-emerald-100 text-emerald-800"
    : ["blocked", "rejected"].includes(status)
      ? "bg-amber-100 text-amber-900"
      : "bg-slate-100 text-slate-600";
// Text only: imported Markdown never becomes executable HTML.
function DocumentText({ text }: { text: string }) {
  return (
    <div className="space-y-2 text-sm leading-7 text-slate-700">
      {text.split("\n").map((line, i) =>
        /^#{1,4} /.test(line) ? (
          <h3 key={i} className="pt-3 text-base font-bold text-slate-900">
            {line.replace(/^#+ /, "")}
          </h3>
        ) : (
          <p className="min-h-2 whitespace-pre-wrap break-words" key={i}>
            {line}
          </p>
        ),
      )}
    </div>
  );
}
export default function ProjectRooms({
  addToast,
}: {
  addToast: (text: string, type?: "success" | "error" | "info") => void;
}) {
  const [rooms, setRooms] = useState<
    Pick<ProjectRoom, "id" | "title" | "kind" | "status">[]
  >([]);
  const [connections, setConnections] = useState<Record<string, boolean>>({});
  const [room, setRoom] = useState<ProjectRoom | null>(null);
  const selectedId = useRef("");
  const [creating, setCreating] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [importRole, setImportRole] = useState<RoomRole>("research");
  const [importText, setImportText] = useState("");
  const [handoff, setHandoff] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [tab, setTab] = useState<"brief" | "conversation" | "decisions">(
    "brief",
  );
  const refreshList = useCallback(async () => {
    const result = await callRoom<{
      rooms: typeof rooms;
      connections: Record<string, boolean>;
    }>("list");
    setRooms(result.rooms);
    setConnections(result.connections);
  }, []);
  const selectRoom = useCallback(async (id: string) => {
    selectedId.current = id;
    setError("");
    setImportText("");
    setHandoff("");
    const result = await callRoom("get", { id });
    if (selectedId.current === id) {
      setRoom(result.room);
      setCreating(false);
    }
  }, []);
  useEffect(() => {
    refreshList().catch((e) => setError(e.message));
  }, [refreshList]);
  useEffect(() => {
    if (!room || room.status !== "running") return;
    const timer = window.setInterval(() => {
      const id = selectedId.current;
      callRoom("get", { id })
        .then((result) => {
          if (selectedId.current === id) setRoom(result.room);
        })
        .catch((e) => setError(e.message));
    }, 8000);
    return () => window.clearInterval(timer);
  }, [room?.id, room?.status]);
  async function perform(action: string, args: Record<string, unknown> = {}) {
    setBusy(true);
    setError("");
    try {
      const result = await callRoom(action, {
        id: room?.id,
        version: room?.version,
        ...args,
      });
      selectedId.current = result.room.id;
      setRoom(result.room);
      setCreating(false);
      await refreshList();
      addToast(
        action === "create"
          ? "Private project room created."
          : "Project room updated.",
        "success",
      );
      return true;
    } catch (e) {
      setError((e as Error).message);
      addToast((e as Error).message, "error");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function download() {
    try {
      const result = await callRoom<{ markdown: string }>("export", {
        id: room?.id,
      });
      const url = URL.createObjectURL(
        new Blob([result.markdown], { type: "text/markdown" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `${room?.title.replace(/[^a-z0-9]/gi, "-") || "project-room"}.md`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const round = room?.state.rounds.at(-1);
  const disabled = busy || !!room?.busy;
  const missing = ["research", "openai", "anthropic", "chief"].filter(
    (role) => !connections[role],
  );
  return (
    <div className="mx-auto max-w-[1500px] space-y-6 p-4 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.18em] text-emerald-700">
            Trellis / Proof of concept
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-900">
            Project rooms
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-600">
            A research team, a shared brief, and a chief of staff to keep the
            difficult questions moving.
          </p>
        </div>
        <button
          className={button}
          onClick={() => {
            setCreating(true);
            setError("");
          }}
        >
          <Plus size={16} />
          New room
        </button>
      </header>
      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          {error}
          <button
            className="ml-3 underline"
            onClick={() => refreshList().catch((e) => setError(e.message))}
          >
            Retry connection
          </button>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-3">
            <h2 className="px-2 py-2 text-xs font-bold uppercase tracking-wider text-slate-500">
              Your private rooms
            </h2>
            {!rooms.length && (
              <p className="p-2 text-sm text-slate-500">
                Create a room for a client or a product question.
              </p>
            )}
            {rooms.map((r) => (
              <button
                key={r.id}
                className={`my-1 w-full rounded-xl p-3 text-left ${room?.id === r.id && !creating ? "bg-emerald-50" : "hover:bg-slate-50"}`}
                onClick={() =>
                  selectRoom(r.id).catch((e) => setError(e.message))
                }
              >
                <span className="block text-sm font-bold text-slate-900">
                  {r.title}
                </span>
                <span className="mt-1 block text-xs capitalize text-slate-500">
                  {r.kind} · {r.status.replaceAll("_", " ")}
                </span>
              </button>
            ))}
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center gap-2 text-sm font-bold">
              <Users size={16} />
              The team
            </div>
            <div className="mt-3 space-y-3">
              {roles.map((role) => (
                <div
                  key={role.id}
                  className="flex items-center justify-between gap-2 text-xs"
                >
                  <div>
                    <p className="font-semibold text-slate-800">{role.name}</p>
                    <p className="text-slate-500">{role.detail}</p>
                  </div>
                  <span
                    className={`rounded-full px-2 py-1 ${connections[role.id === "review" ? "research" : role.id] ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}
                  >
                    {connections[role.id === "review" ? "research" : role.id]
                      ? "Connected"
                      : "Import"}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <p className="flex gap-2 px-2 text-xs leading-5 text-slate-500">
            <ShieldCheck size={30} />
            Rooms are private to their creator. Providers receive the room
            packet. Only include information you may share with them.
          </p>
        </aside>
        <main className="min-w-0 space-y-5">
          {creating || !room ? (
            <ProjectRoomIntake
              busy={busy}
              missingConnections={missing.map(
                (id) => roles.find((role) => role.id === id)?.name || id,
              )}
              onCreate={(value) => perform("create", value)}
            />
          ) : (
            <>
              <section className="rounded-3xl border border-slate-200 bg-white p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${badge(room.status)}`}
                    >
                      {room.status.replaceAll("_", " ")}
                    </span>
                    <h2 className="mt-3 text-2xl font-bold text-slate-900">
                      {room.title}
                    </h2>
                    <p className="mt-2 text-xs text-slate-500">
                      Round {round?.number || 0} / {room.state.max_rounds} ·
                      Requests {room.state.calls_used} /{" "}
                      {room.state.call_budget} ·{" "}
                      {round?.stage || "Ready to begin"}
                      {room.busy ? " · Provider step running" : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      aria-label="Refresh room"
                      className={button}
                      onClick={() =>
                        selectRoom(room.id).catch((e) => setError(e.message))
                      }
                    >
                      <RefreshCw size={16} />
                    </button>
                    <button className={button} onClick={download}>
                      <Download size={16} />
                      Export
                    </button>
                  </div>
                </div>
                <div className="mt-5 flex flex-wrap gap-2">
                  {room.status === "draft" && (
                    <button
                      disabled={disabled}
                      className={`${button} !bg-emerald-700 !text-white`}
                      onClick={() => perform("start")}
                    >
                      Start research
                      <ArrowRight size={16} />
                    </button>
                  )}
                  {["paused", "blocked"].includes(room.status) && (
                    <button
                      disabled={disabled || !!round?.in_flight}
                      className={`${button} !bg-emerald-700 !text-white`}
                      onClick={() => perform("resume")}
                    >
                      Resume team
                      <ArrowRight size={16} />
                    </button>
                  )}
                  {room.status === "awaiting_user" &&
                    room.state.rounds.length < room.state.max_rounds &&
                    room.state.calls_used < room.state.call_budget && (
                      <button
                        disabled={disabled}
                        className={button}
                        onClick={() => perform("next_round")}
                      >
                        Start another pass
                        <ArrowRight size={16} />
                      </button>
                    )}
                  {room.status === "running" && (
                    <button
                      disabled={busy}
                      className={button}
                      onClick={() => perform("pause")}
                    >
                      <CirclePause size={16} />
                      Pause
                    </button>
                  )}
                  {!["draft", "cancelled"].includes(room.status) && (
                    <button
                      disabled={busy}
                      className={button}
                      onClick={() => perform("cancel")}
                    >
                      <Square size={14} />
                      Cancel room
                    </button>
                  )}
                </div>
                {room.status === "running" && (
                  <p className="mt-4 flex items-center gap-2 text-xs text-emerald-700">
                    <Loader2 size={14} className="animate-spin" />
                    The team advances in the background, usually once a minute.
                    You can close this tab.
                  </p>
                )}
                {room.error && (
                  <p
                    role="status"
                    className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900"
                  >
                    {room.error}
                  </p>
                )}
                {["paused", "cancelled"].includes(room.status) && (
                  <p className="mt-3 text-xs text-slate-500">
                    Further Trellis steps are stopped. Dispatched provider tasks
                    may still run and incur charges; stop those in Manus if
                    needed.
                  </p>
                )}
              </section>
              <nav className="flex flex-wrap gap-2" aria-label="Room sections">
                {(["brief", "conversation", "decisions"] as const).map((t) => (
                  <button
                    key={t}
                    className={`${button} capitalize ${tab === t ? "!border-emerald-700 !text-emerald-800" : ""}`}
                    onClick={() => setTab(t)}
                  >
                    {t === "brief" ? "Living brief" : t}
                    {t === "decisions"
                      ? ` (${room.state.decisions.length})`
                      : ""}
                  </button>
                ))}
              </nav>
              {tab === "brief" && (
                <section className="rounded-3xl border border-slate-200 bg-white p-6">
                  <h3 className="mb-4 text-lg font-bold">Living brief</h3>
                  {room.state.summary ? (
                    room.kind === "client" ? (
                      <CompanyAssessment room={room} />
                    ) : (
                      <DocumentText text={room.state.summary} />
                    )
                  ) : (
                    <p className="text-sm text-slate-500">
                      The chief of staff will assemble this after research and
                      independent reviews.
                    </p>
                  )}
                  <details className="mt-5 border-t pt-4">
                    <summary className="cursor-pointer text-sm font-semibold">
                      Original project brief
                    </summary>
                    <div className="mt-3">
                      <DocumentText text={room.brief} />
                    </div>
                  </details>
                  {room.state.questions.length > 0 && (
                    <div className="mt-6 rounded-2xl bg-amber-50 p-4">
                      <h4 className="font-bold text-amber-900">
                        Your input is needed
                      </h4>
                      <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-amber-900">
                        {room.state.questions.map((q, i) => (
                          <li key={i}>{q}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>
              )}
              {tab === "conversation" && (
                <section className="space-y-4">
                  {room.state.rounds.map((r) => (
                    <div
                      key={r.number}
                      className="rounded-3xl border border-slate-200 bg-white p-6"
                    >
                      <h3 className="font-bold">
                        Round {r.number} · {r.stage}
                      </h3>
                      <p className="mt-2 text-sm text-slate-500">{r.focus}</p>
                      <div className="mt-4 space-y-3">
                        {roles.map((role) => (
                          <details
                            key={role.id}
                            className="rounded-xl border border-slate-200 p-4"
                          >
                            <summary className="cursor-pointer text-sm font-bold">
                              {role.name}
                              <span className="ml-2 font-normal text-slate-500">
                                {r.outputs[role.id]
                                  ? `${r.outputs[role.id].source === "imported" ? "Imported by you" : r.outputs[role.id].model || "API"} · complete`
                                  : r.tasks[role.id]
                                    ? "Working in Manus"
                                    : "Waiting"}
                              </span>
                            </summary>
                            {r.outputs[role.id] && (
                              <div className="mt-4">
                                <DocumentText text={r.outputs[role.id].text} />
                              </div>
                            )}
                            {r.tasks[role.id] && (
                              <a
                                className="mt-3 block text-sm text-emerald-700 underline"
                                href={`https://manus.im/app/${encodeURIComponent(r.tasks[role.id].id)}`}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Open private Manus task
                              </a>
                            )}
                          </details>
                        ))}
                      </div>
                    </div>
                  ))}
                  {!round && (
                    <p className="text-sm text-slate-500">
                      Start the room to open the first handoff.
                    </p>
                  )}
                </section>
              )}
              {tab === "decisions" && (
                <section className="rounded-3xl border border-slate-200 bg-white p-6">
                  <h3 className="font-bold">You own the decisions</h3>
                  <p className="mt-2 text-sm text-slate-500">
                    Agent suggestions remain proposed until you approve them
                    here.
                  </p>
                  {!room.state.decisions.length && (
                    <p className="mt-6 text-sm text-slate-500">
                      No proposals yet.
                    </p>
                  )}
                  {room.state.decisions.map((d) => (
                    <div key={d.id} className="mt-4 rounded-xl border p-4">
                      <span
                        className={`rounded-full px-2 py-1 text-xs ${badge(d.status)}`}
                      >
                        {d.status}
                      </span>
                      <p className="my-3 text-sm">{d.text}</p>
                      <div className="flex gap-2">
                        <button
                          disabled={disabled || d.status === "approved"}
                          className={button}
                          onClick={() =>
                            perform("decision", {
                              decision_id: d.id,
                              status: "approved",
                            })
                          }
                        >
                          <Check size={15} />
                          Approve
                        </button>
                        <button
                          disabled={disabled || d.status === "rejected"}
                          className={button}
                          onClick={() =>
                            perform("decision", {
                              decision_id: d.id,
                              status: "rejected",
                            })
                          }
                        >
                          <X size={15} />
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </section>
              )}
              <React.Fragment key={`${room.id}-${room.version}`}>
                <RoomDocumentReview
                  room={room}
                  busy={disabled}
                  onSave={(documents) => perform("documents", { documents })}
                />
              </React.Fragment>
              {room.status !== "cancelled" && (
                <section className="rounded-3xl border border-slate-200 bg-white p-6">
                  <h3 className="flex items-center gap-2 font-bold">
                    <MessageSquare size={17} />
                    Join the conversation
                  </h3>
                  <p className="my-3 text-xs text-slate-500">
                    Add context, answer questions, or redirect the next handoff.
                    Pause a running step before changing direction.
                  </p>
                  <textarea
                    aria-label="Direction for the team"
                    className={`${input} min-h-24`}
                    maxLength={6000}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="We have already decided… Please investigate…"
                  />
                  <button
                    disabled={disabled || !note.trim()}
                    className={`${button} mt-3`}
                    onClick={async () => {
                      if (await perform("note", { text: note })) setNote("");
                    }}
                  >
                    Add direction
                  </button>
                  {room.state.notes.map((n, i) => (
                    <p
                      key={i}
                      className="mt-3 border-l-2 border-emerald-400 pl-3 text-sm text-slate-600"
                    >
                      {n.text}
                    </p>
                  ))}
                </section>
              )}
              {round &&
                round.stage !== "done" &&
                room.status !== "cancelled" && (
                  <details className="rounded-3xl border border-slate-200 bg-white p-6">
                    <summary className="cursor-pointer font-bold">
                      Handoffs & manual recovery
                    </summary>
                    <p className="my-3 text-xs leading-5 text-slate-500">
                      If a connection is missing or a provider stopped, show its
                      role instructions and import the actual response.
                      Importing pauses the room until you resume it.
                    </p>
                    <select
                      aria-label="Handoff role"
                      className={input}
                      value={importRole}
                      onChange={(e) => {
                        setImportRole(e.target.value as RoomRole);
                        setHandoff("");
                      }}
                    >
                      {roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                    <button
                      className={`${button} my-3`}
                      onClick={async () => {
                        try {
                          const result = await callRoom<{ markdown: string }>(
                            "handoff",
                            { id: room.id, role: importRole },
                          );
                          setHandoff(result.markdown);
                        } catch (e) {
                          setError((e as Error).message);
                        }
                      }}
                    >
                      Show handoff instructions
                    </button>
                    {handoff && (
                      <textarea
                        aria-label="Handoff instructions"
                        readOnly
                        className={`${input} mb-3 min-h-48 font-mono text-xs`}
                        value={handoff}
                      />
                    )}
                    <textarea
                      aria-label="Imported agent response"
                      className={`${input} min-h-40`}
                      value={importText}
                      maxLength={24000}
                      onChange={(e) => setImportText(e.target.value)}
                      placeholder={
                        importRole === "chief"
                          ? "Paste chief JSON: summary, questions, proposals, next_handoff, next_action"
                          : "Paste the complete Markdown response"
                      }
                    />
                    <label className="my-3 flex items-start gap-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={confirmed}
                        onChange={(e) => setConfirmed(e.target.checked)}
                      />
                      I reviewed this response and any external task has
                      finished. This is imported output, not an API-verified
                      result.
                    </label>
                    <button
                      className={button}
                      disabled={disabled || !confirmed || !importText.trim()}
                      onClick={async () => {
                        if (
                          await perform("import", {
                            role: importRole,
                            text: importText,
                            confirm_external_finished: confirmed,
                          })
                        ) {
                          setImportText("");
                          setConfirmed(false);
                        }
                      }}
                    >
                      Import response
                    </button>
                  </details>
                )}
              <details className="rounded-2xl border border-slate-200 bg-white p-5">
                <summary className="cursor-pointer text-sm font-bold">
                  Activity & limits
                </summary>
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  Chief synthesis uses Gemini. Manus researches and compares.
                  Text models receive no tools. No task actions are
                  automatically confirmed. Limits bound requests, not dollar
                  spend. Pause and cancel cannot recall a dispatched request.
                </p>
                <ol className="mt-4 space-y-3">
                  {[...room.state.events].reverse().map((e, i) => (
                    <li key={i} className="text-xs text-slate-600">
                      <time className="mr-2 text-slate-400">
                        {new Date(e.at).toLocaleString()}
                      </time>
                      {e.text}
                    </li>
                  ))}
                </ol>
              </details>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
