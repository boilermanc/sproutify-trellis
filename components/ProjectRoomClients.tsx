import React, { useEffect, useRef, useState } from "react";
import {
  callRoom,
  type ProjectRoom,
  type RoomClient,
  type RoomMember,
  type RoomOperator,
} from "../services/projectRoomService";
const button =
  "min-h-11 rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold disabled:opacity-40";
const input =
  "mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm";

export function ClientDetails(
  { client, onSaved, onError }: {
    client: RoomClient;
    onSaved: () => Promise<void>;
    onError: (message: string) => void;
  },
) {
  const [dirty, setDirty] = useState(false);
  const [baseVersion, setBaseVersion] = useState(client.version);
  const editingClient = useRef(client.id);
  const [date, setDate] = useState(client.follow_up_date || "");
  const [note, setNote] = useState(client.follow_up_note || "");
  const [reason, setReason] = useState(client.archive_reason || "");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (editingClient.current !== client.id || !dirty) {
      editingClient.current = client.id;
      setDate(client.follow_up_date || "");
      setNote(client.follow_up_note || "");
      setReason(client.archive_reason || "");
      setBaseVersion(client.version);
      setDirty(false);
    }
  }, [client.id, client.version, dirty]);
  async function save(archived = !!client.archived_at, status = client.status) {
    const savingClient = client.id;
    setBusy(true);
    try {
      await callRoom("client_update", {
        client_id: client.id,
        client_version: baseVersion,
        archived,
        status,
        follow_up_date: date || null,
        follow_up_note: note,
        archive_reason: reason,
      });
      await onSaved();
      if (editingClient.current === savingClient) setDirty(false);
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-bold">Follow-up & archive</h2>
      <p className="mt-1 text-sm text-slate-600">
        {client.archived_at
          ? "Archived — notes and rooms are kept."
          : client.status === "customer"
          ? "Customer"
          : "Prospect — a company we may work with."}
      </p>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <label className="text-sm font-semibold">
          Follow up on<input
            type="date"
            className={input}
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setDirty(true);
            }}
          />
        </label>
        <label className="text-sm font-semibold">
          What should we follow up about?<input
            maxLength={2000}
            className={input}
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setDirty(true);
            }}
          />
        </label>
      </div>
      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-semibold">
          Archive note (optional)
        </summary>
        <label className="mt-2 block text-sm">
          Why are we setting this company aside?<input
            maxLength={2000}
            className={input}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setDirty(true);
            }}
          />
        </label>
      </details>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          disabled={busy}
          className={`${button} bg-blue-600 text-white`}
          onClick={() => save()}
        >
          Save follow-up
        </button>
        <button
          disabled={busy}
          className={button}
          onClick={() => save(!client.archived_at)}
        >
          {client.archived_at ? "Restore company" : "Archive company"}
        </button>
        {!client.archived_at && client.status === "prospect" && (
          <button
            disabled={busy}
            className={button}
            onClick={() => save(false, "customer")}
          >
            Mark as customer
          </button>
        )}
      </div>
    </section>
  );
}

export function RoomSharing(
  { room, onChanged, onError }: {
    room: ProjectRoom;
    onChanged: () => Promise<void>;
    onError: (message: string) => void;
  },
) {
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [operators, setOperators] = useState<RoomOperator[]>([]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setLoaded(false);
    setError("");
    callRoom<{ members: RoomMember[]; operators?: RoomOperator[] }>("members", {
      id: room.id,
    }).then((result) => {
      if (active) {
        setMembers(result.members);
        setOperators(result.operators || []);
        setLoaded(true);
      }
    }).catch((e) => {
      if (active) setError(e.message);
    });
    return () => {
      active = false;
    };
  }, [room.id, room.version]);
  async function change(action: string, user_id: string) {
    setBusy(true);
    try {
      await callRoom(action, { id: room.id, version: room.version, user_id });
      await onChanged();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="rounded-2xl border border-slate-200 bg-white p-5">
      <summary className="cursor-pointer font-bold">
        People in this room
      </summary>
      <p className="mt-2 text-sm text-slate-600">
        People added here can read and work in this same room. The owner manages
        access.
      </p>
      {room.busy && (
        <p className="mt-2 text-sm text-slate-600">
          You can change access when the current research step finishes.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-amber-800">{error}</p>
      )}
      {!loaded && !error && <p className="mt-2 text-sm">Loading people…</p>}
      <ul className="mt-3 space-y-2">
        {members.map((member) => (
          <li
            key={member.user_id}
            className="flex flex-wrap items-center justify-between gap-2 text-sm"
          >
            <span>
              {member.name || member.email ||
                operators.find((o) => o.user_id === member.user_id)?.name ||
                "Team member"} · {member.role}
            </span>
            {room.member_role === "owner" && member.role !== "owner" && (
              <button
                className={button}
                disabled={busy || room.busy}
                onClick={() => change("unshare", member.user_id)}
              >
                Remove access
              </button>
            )}
          </li>
        ))}
      </ul>
      {room.member_role === "owner" && (
        <div className="mt-4 space-y-2">
          {operators.filter((o) =>
            !members.some((m) => m.user_id === o.user_id)
          ).map((person) => (
            <button
              key={person.user_id}
              className={`${button} mr-2`}
              disabled={busy || room.busy}
              onClick={() => change("share", person.user_id)}
            >
              Add {person.name || person.email || "team member"}
            </button>
          ))}
        </div>
      )}
    </details>
  );
}

export function ClientSearch(
  { clientId, onOpen, expanded = false }: {
    clientId?: string;
    onOpen: (id: string) => void;
    expanded?: boolean;
  },
) {
  const request = useRef(0);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [limited, setLimited] = useState(false);
  const [results, setResults] = useState<
    | { room_id: string; room_title: string; source: string; snippet: string }[]
    | null
  >(null);
  useEffect(() => {
    request.current++;
    setResults(null);
    setError("");
    setBusy(false);
  }, [clientId]);
  async function search(e: React.FormEvent) {
    e.preventDefault();
    const current = ++request.current;
    setBusy(true);
    setError("");
    try {
      const response = await callRoom<
        { results: NonNullable<typeof results>; limited?: boolean }
      >("search_client_data", {
        query,
        ...(clientId ? { client_id: clientId } : {}),
      });
      if (request.current === current) {
        setResults(response.results);
        setLimited(!!response.limited);
      }
    } catch (e) {
      if (request.current === current) setError((e as Error).message);
    } finally {
      if (request.current === current) setBusy(false);
    }
  }
  return (
    <details
      open={expanded || undefined}
      className="rounded-2xl border border-slate-200 bg-white p-5"
    >
      <summary className="cursor-pointer font-bold">
        Search client notes with Sage
      </summary>
      <p className="mt-2 text-sm text-slate-600">
        Find saved notes, research, and meeting details in rooms you can access.
        {" "}
        {clientId ? "Searching this company." : "Searching all your companies."}
      </p>
      <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={search}>
        <label className="min-w-0 flex-1 text-sm">
          Search words<input
            className={input}
            value={query}
            maxLength={200}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="For example: website or next steps"
          />
        </label>
        <button disabled={busy || query.trim().length < 2} className={button}>
          {busy ? "Searching…" : "Search notes"}
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-3 text-sm text-amber-800">{error}</p>
      )}
      {limited && results && (
        <p className="mt-3 text-sm text-amber-800">
          Showing a limited set of matches. Try more specific words or choose a
          company to narrow the search.
        </p>
      )}
      {results?.length === 0 && (
        <p className="mt-3 text-sm text-slate-600">
          No matching notes yet. Try another word.
        </p>
      )}
      <ul className="mt-3 space-y-3">
        {results?.map((result, i) => (
          <li
            key={`${result.room_id}-${i}`}
            className="rounded-xl bg-slate-50 p-3"
          >
            <button
              className="text-left text-sm font-bold text-blue-700 underline"
              onClick={() => onOpen(result.room_id)}
            >
              {result.room_title} · {result.source}
            </button>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">
              {result.snippet}
            </p>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function ManualMeetingNotes(
  { room, onSaved, expanded = false }: {
    room: ProjectRoom;
    onSaved: (meeting: Record<string, unknown>) => Promise<boolean>;
    expanded?: boolean;
  },
) {
  const currentRoom = useRef(room.id);
  currentRoom.current = room.id;
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [sourceId, setSourceId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    setTitle("");
    setDate("");
    setNotes("");
    setSourceId(crypto.randomUUID());
    setError("");
  }, [room.id]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const savingRoom = room.id;
    const started = new Date(date);
    if (!title.trim() || !notes.trim() || !Number.isFinite(started.getTime())) {
      setError("Add a meeting title, date, time, and notes.");
      return;
    }
    setBusy(true);
    try {
      if (
        await onSaved({
          source: "manual",
          source_id: sourceId,
          title: title.trim(),
          summary: notes.trim(),
          started_at: started.toISOString(),
        }) && currentRoom.current === savingRoom
      ) {
        setTitle("");
        setDate("");
        setNotes("");
        setSourceId(crypto.randomUUID());
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <details
      open={expanded || undefined}
      className="rounded-2xl border border-slate-200 bg-white p-5"
    >
      <summary className="cursor-pointer font-bold">Meeting notes</summary>
      <p className="mt-2 text-sm text-slate-600">
        ChatGPT Meetings is not connected yet. Paste your notes here to keep
        them with this company.
      </p>
      <form className="mt-4 space-y-3" onSubmit={save}>
        <label className="block text-sm font-semibold">
          Meeting title<input
            required
            maxLength={200}
            className={input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="block text-sm font-semibold">
          Meeting date and time<input
            required
            type="datetime-local"
            className={input}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <span className="mt-1 block text-xs font-normal text-slate-500">
            Your local time ({Intl.DateTimeFormat().resolvedOptions().timeZone})
          </span>
        </label>
        <label className="block text-sm font-semibold">
          Notes and next steps<textarea
            required
            maxLength={12000}
            rows={5}
            className={input}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        {error && <p role="alert" className="text-sm text-amber-800">{error}
        </p>}
        <button disabled={busy || room.busy} className={button}>
          {busy ? "Saving…" : "Save meeting notes"}
        </button>
      </form>
      <div className="mt-5 border-t border-slate-200 pt-4">
        <h3 className="font-bold">Saved meeting notes</h3>
        {!room.state.meetings?.length && (
          <p className="mt-2 text-sm text-slate-500">
            No meeting notes saved yet.
          </p>
        )}
        <ul className="mt-3 space-y-3">
          {[...(room.state.meetings || [])].reverse().map((meeting) => (
            <li
              key={meeting.source + meeting.source_id}
              className="rounded-xl bg-slate-50 p-4"
            >
              <h4 className="font-semibold">{meeting.title}</h4>
              <p className="mt-1 text-xs text-slate-500">
                {new Date(meeting.started_at).toLocaleString()} ·{" "}
                {meeting.source === "manual"
                  ? "Added by your team"
                  : "ChatGPT Meetings"}
              </p>
              <p className="mt-3 whitespace-pre-wrap break-words text-sm text-slate-700">
                {meeting.summary}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
