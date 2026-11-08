import ProjectRoomPipeline from "./ProjectRoomPipeline";
import React from "react";
import { ArrowRight, Plus, Users } from "lucide-react";
import type { ProjectRoom, RoomClient } from "../services/projectRoomService";
import { ClientSearch } from "./ProjectRoomClients";
export type WorkspacePage =
  | "today"
  | "companies"
  | "pipeline"
  | "ideas"
  | "room"
  | "add"
  | "add-idea"
  | "call";
export type RoomView = "overview" | "notes" | "files" | "research" | "proposal";
export type RoomSummary = Pick<
  ProjectRoom,
  "id" | "title" | "kind" | "status" | "client_id" | "proposal"
>;
export const roomStatusText = (
  s: string,
) => ({
  draft: "Ready to start",
  running: "Research running",
  awaiting_user: "Ready to review",
  blocked: "Needs attention",
  paused: "Research paused",
  cancelled: "Research stopped",
}[s] || s.replaceAll("_", " "));
export const roomNextStep = (s: string) => ({
  draft: "Start the research when you are ready.",
  running: "Research is underway. Check back for the findings.",
  awaiting_user: "Review the findings and decide what to do next.",
  blocked: "Review the stopped research step before continuing.",
  paused: "Review the room and resume research when ready.",
  cancelled: "Research is stopped. Your saved notes and findings are kept.",
}[s] || "Review the latest room notes.");
interface Props {
  page: WorkspacePage;
  setPage: (p: WorkspacePage) => void;
  roomView: RoomView;
  setRoomView: (p: RoomView) => void;
  room: ProjectRoom | null;
  rooms: RoomSummary[];
  clients: RoomClient[];
  loading: boolean;
  limited: boolean;
  error: string;
  retry: () => void;
  openRoom: (id: string, view?: RoomView) => void;
  addCompany: () => void;
  children: React.ReactNode;
}
export default function ProjectRoomWorkspace(p: Props) {
  const [filter, setFilter] = React.useState<
    "prospect" | "customer" | "archived"
  >("prospect");
  const [search, setSearch] = React.useState("");
  const now = new Date();
  const today = `${now.getFullYear()}-${
    String(now.getMonth() + 1).padStart(2, "0")
  }-${String(now.getDate()).padStart(2, "0")}`;
  const due = p.clients.filter((c) =>
    c.follow_up_date && c.follow_up_date <= today
  ).sort((a, b) => a.follow_up_date!.localeCompare(b.follow_up_date!));
  const activeRooms = p.rooms.filter((r) =>
    !r.client_id || !p.clients.find((c) => c.id === r.client_id)?.archived_at
  );
  const review = activeRooms.filter((r) => r.status === "awaiting_user"),
    blocked = activeRooms.filter((r) => r.status === "blocked");
  const shown = p.clients.filter((c) =>
    (filter === "archived"
      ? !!c.archived_at
      : !c.archived_at && c.status === filter) &&
    c.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())
  );
  const client = p.clients.find((c) => c.id === p.room?.client_id);
  const siblings = p.rooms.filter((r) =>
    r.client_id === p.room?.client_id && r.kind === "client"
  );
  const openCompany = (c: RoomClient) => {
    const room = p.rooms.find((r) => r.client_id === c.id);
    if (room) p.openRoom(room.id);
  };
  const list = (rooms: RoomSummary[], empty: string) =>
    rooms.length
      ? rooms.map((r) => (
        <button
          key={r.id}
          className="pr-work-row"
          onClick={() => p.openRoom(r.id, "research")}
        >
          <span>
            <strong>{r.title}</strong>
            <small>
              {r.kind === "client" ? "Company research" : "Product room"}
            </small>
          </span>
          <span
            className={`pr-tag ${r.status === "blocked" ? "pr-tag-amber" : ""}`}
          >
            {roomStatusText(r.status)}
          </span>
          <ArrowRight size={16} />
        </button>
      ))
      : <p className="pr-empty">{empty}</p>;
  const add = (
    <button className="pr-button pr-primary" onClick={p.addCompany}>
      <Plus size={17} />Add a company
    </button>
  );
  return (
    <div className="pr-workspace">
      <aside className="pr-sidebar">
        <div className="pr-brand">
          <span>
            <Users size={21} />
          </span>Project rooms
        </div>
        <nav className="pr-navigation" aria-label="Project workspace">
          <button
            className={p.page === "today" ? "is-active" : ""}
            onClick={() => p.setPage("today")}
          >
            Today
          </button>
          <button
            className={(["companies", "add"].includes(p.page) ||
                p.page === "room" && p.room?.kind === "client")
              ? "is-active"
              : ""}
            onClick={() => p.setPage("companies")}
          >
            Companies
          </button>
          <button
            className={p.page === "pipeline" ? "is-active" : ""}
            onClick={() => p.setPage("pipeline")}
          >
            Sales pipeline
          </button>
          <button
            className={p.page === "ideas" || p.page === "add-idea" ||
                p.page === "room" && p.room?.kind === "product"
              ? "is-active"
              : ""}
            onClick={() => p.setPage("ideas")}
          >
            Feature ideas
          </button>
          <button
            className={p.page === "call" ||
                p.page === "room" && p.roomView === "notes"
              ? "is-active"
              : ""}
            onClick={() => {
              if (p.room) {
                p.setPage("room");
                p.setRoomView("notes");
              } else p.setPage("call");
            }}
          >
            Log a call
          </button>
        </nav>
        <div className="pr-sidebar-note">
          <strong>Your shared workspace</strong>
          <p>Company research, feature ideas, and next steps in one place.</p>
          <p>Only people added to a room can open it.</p>
        </div>
      </aside>
      <main className="pr-main">
        {p.error && (
          <div role="alert" className="pr-error">
            {p.error}
            <button onClick={p.retry}>Retry connection</button>
          </div>
        )}
        {p.page === "today" && (
          <>
            <header className="pr-top">
              <div>
                <h1>What needs you today?</h1>
                <p>Your shared companies and research, at a glance.</p>
              </div>
              <div className="pr-actions">
                <button className="pr-button" onClick={() => p.setPage("call")}>
                  Log a call
                </button>
                {add}
              </div>
            </header>
            {p.loading
              ? (
                <section className="pr-panel" role="status">
                  Loading your workspace…
                </section>
              )
              : (
                <>
                  <div className="pr-metrics">
                    <button
                      className="pr-metric pr-blue"
                      onClick={() =>
                        document.getElementById("pr-review")?.scrollIntoView({
                          behavior: "smooth",
                        })}
                    >
                      <b>{review.length}</b>
                      <strong>Ready to review</strong>
                      <small>Research waiting for you</small>
                    </button>
                    <button
                      className="pr-metric pr-purple"
                      onClick={() => p.setPage("companies")}
                    >
                      <b>{p.clients.filter((c) => !c.archived_at).length}</b>
                      <strong>Active companies</strong>
                      <small>Prospects and customers</small>
                    </button>
                    <button
                      className="pr-metric pr-orange"
                      onClick={() =>
                        document.getElementById("pr-attention")?.scrollIntoView(
                          { behavior: "smooth" },
                        )}
                    >
                      <b>{blocked.length}</b>
                      <strong>Needs attention</strong>
                      <small>Research needs your help</small>
                    </button>
                    <button
                      className="pr-metric pr-green"
                      onClick={() =>
                        document.getElementById("pr-followups")?.scrollIntoView(
                          { behavior: "smooth" },
                        )}
                    >
                      <b>{due.length}</b>
                      <strong>Follow up</strong>
                      <small>Due today or earlier</small>
                    </button>
                  </div>
                  <div className="pr-columns">
                    <div className="pr-stack">
                      <section className="pr-panel" id="pr-review">
                        <h2>Ready for your review</h2>
                        <p className="pr-muted">
                          Open a room to review the findings and next steps.
                        </p>
                        {list(review, "No research is waiting for review.")}
                      </section>
                      <ClientSearch onOpen={(id) => p.openRoom(id)} expanded />
                    </div>
                    <div className="pr-stack">
                      <section className="pr-panel" id="pr-attention">
                        <h2>Needs attention</h2>
                        {list(blocked, "No blocked research right now.")}
                      </section>
                      <section className="pr-panel" id="pr-followups">
                        <h2>Follow up</h2>
                        {due.length
                          ? due.map((c) => (
                            <article className="pr-followup" key={c.id}>
                              <strong>{c.name}</strong>
                              <p>
                                {c.archived_at ? "Archived company · " : ""}Due
                                {" "}
                                {c.follow_up_date}
                              </p>
                              {c.follow_up_note && <p>{c.follow_up_note}</p>}
                              <button
                                className="pr-button pr-primary"
                                onClick={() =>
                                  openCompany(c)}
                              >
                                Open company
                              </button>
                            </article>
                          ))
                          : (
                            <p className="pr-empty">
                              No follow-ups due. Add a date inside a company
                              room.
                            </p>
                          )}
                      </section>
                    </div>
                  </div>
                </>
              )}
          </>
        )}
        {p.page === "companies" && (
          <>
            <header className="pr-top">
              <div>
                <h1>Companies</h1>
                <p>Everyone we’re talking to or working with.</p>
              </div>
              {add}
            </header>
            <div className="pr-filterbar">
              <div className="pr-segments" aria-label="Company status">
                {([["prospect", "Prospects"], ["customer", "Customers"], [
                  "archived",
                  "Archived",
                ]] as const).map(([id, name]) => (
                  <button
                    key={id}
                    className={filter === id ? "is-active" : ""}
                    onClick={() => setFilter(id)}
                  >
                    {name}{" "}
                    <span>
                      {p.clients.filter((c) =>
                        id === "archived"
                          ? !!c.archived_at
                          : !c.archived_at && c.status === id
                      ).length}
                    </span>
                  </button>
                ))}
              </div>
              <input
                aria-label="Find a company"
                placeholder="Find a company"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <p className="pr-muted">
              {filter === "archived"
                ? "Archived companies keep their rooms, notes, research, and follow-up dates."
                : "Open a company to see its notes, files, research, and next steps."}
            </p>
            {p.loading
              ? (
                <section className="pr-panel" role="status">
                  Loading companies…
                </section>
              )
              : shown.length
              ? shown.map((c) => (
                <article className="pr-company" key={c.id}>
                  <div className="pr-avatar" aria-hidden="true">
                    {c.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="pr-company-name">
                    <h2>{c.name}</h2>
                    <p>
                      {c.website ||
                        `${
                          p.rooms.filter((r) => r.client_id === c.id).length
                        } shared room(s)`}
                    </p>
                  </div>
                  <div className="pr-company-next">
                    <span>Follow-up</span>
                    <p>{c.follow_up_date || "No date set"}</p>
                  </div>
                  <span
                    className={`pr-tag ${
                      c.archived_at ? "pr-tag-amber" : "pr-tag-green"
                    }`}
                  >
                    {c.archived_at
                      ? "Archived"
                      : c.status === "customer"
                      ? "Customer"
                      : "Prospect"}
                  </span>
                  <button className="pr-button" onClick={() => openCompany(c)}>
                    Open<span className="sr-only">{c.name}</span>
                  </button>
                </article>
              ))
              : (
                <section className="pr-panel pr-empty">
                  {search
                    ? "No companies match that name."
                    : filter === "archived"
                    ? "No archived companies."
                    : "Save a company briefing to add your first prospect."}
                </section>
              )}
          </>
        )}
        {p.page === "pipeline" && (p.loading
          ? (
            <section className="pr-panel" role="status">
              Loading pipeline…
            </section>
          )
          : (
            <ProjectRoomPipeline
              rooms={p.rooms}
              clients={p.clients}
              limited={p.limited}
              openRoom={(id) => p.openRoom(id, "proposal")}
            />
          ))}
        {p.page === "ideas" && (
          <>
            <header className="pr-top">
              <div>
                <h1>Feature ideas</h1>
                <p>
                  Turn an idea into a clear plan. Research, compare options, and
                  refine the requirements with your AI team.
                </p>
              </div>
              <button
                className="pr-button pr-primary"
                onClick={() => p.setPage("add-idea")}
              >
                <Plus size={17} />Start a feature idea
              </button>
            </header>
            <section className="pr-panel">
              <h2>Your ideas</h2>
              {p.loading ? <p role="status">Loading your ideas…</p> : list(
                p.rooms.filter((r) => r.kind === "product"),
                "No feature ideas yet. Start one to work through it with the team.",
              )}
            </section>
          </>
        )}
        {p.page === "call" && (
          <>
            <header className="pr-top">
              <div>
                <h1>Log a call</h1>
                <p>Choose a room to save meeting notes with that company.</p>
              </div>
            </header>
            <section className="pr-panel">
              <h2>Which company was the call with?</h2>
              {activeRooms.filter((r) => r.kind === "client").length
                ? activeRooms.filter((r) => r.kind === "client").map((r) => (
                  <button
                    className="pr-work-row"
                    key={r.id}
                    onClick={() => p.openRoom(r.id, "notes")}
                  >
                    <strong>{r.title}</strong>
                    <ArrowRight size={17} />
                  </button>
                ))
                : (
                  <div className="pr-empty">
                    <p>Add a company briefing before saving its call notes.</p>
                    {add}
                  </div>
                )}
            </section>
          </>
        )}
        {(p.page === "add" || p.page === "add-idea") && (
          <>
            <button
              className="pr-back"
              onClick={() =>
                p.setPage(
                  p.page === "add-idea" ? "ideas" : "companies",
                )}
            >
              {p.page === "add-idea"
                ? "← All feature ideas"
                : "← All companies"}
            </button>
            <header className="pr-top">
              <div>
                <h1>
                  {p.page === "add-idea"
                    ? "Start a feature idea"
                    : "Add a company"}
                </h1>
                <p>
                  {p.page === "add-idea"
                    ? "Describe your idea, who it helps, and what it needs to do."
                    : "Save a company briefing to create a prospect and open its room."}
                </p>
              </div>
            </header>
            {p.children}
          </>
        )}
        {p.page === "room" && !p.room && (
          <section className="pr-panel" role="status">Loading room…</section>
        )}
        {p.page === "room" && p.room && (
          <>
            <button
              className="pr-back"
              onClick={() =>
                p.setPage(p.room.kind === "product" ? "ideas" : "companies")}
            >
              {p.room.kind === "product"
                ? "← All feature ideas"
                : "← All companies"}
            </button>
            <header className="pr-top">
              <div>
                <h1>{client?.name || p.room.title}</h1>
                <span
                  className={`pr-tag ${
                    client?.archived_at ? "pr-tag-amber" : "pr-tag-green"
                  }`}
                >
                  {client
                    ? client.archived_at
                      ? "Archived"
                      : client.status === "customer"
                      ? "Customer"
                      : "Prospect"
                    : "Product room"}
                </span>
              </div>
              <div className="pr-actions">
                <button
                  className="pr-button"
                  onClick={() => {
                    p.setRoomView("overview");
                    window.setTimeout(() => {
                      const details = document.querySelector<
                        HTMLDetailsElement
                      >(".pr-sharing details");
                      if (details) {
                        details.open = true;
                        details.scrollIntoView({
                          behavior: "smooth",
                          block: "center",
                        });
                      }
                    }, 0);
                  }}
                >
                  <Users size={17} />Share room
                </button>
                <button
                  className="pr-button pr-primary"
                  onClick={() => p.setRoomView("notes")}
                >
                  Log a call
                </button>
              </div>
            </header>
            {client?.archived_at && (
              <div className="pr-archive-message">
                This company is archived. Its notes and research are kept. You
                can restore it from Overview.
              </div>
            )}
            {siblings.length > 1 && (
              <label className="pr-room-picker">
                Research room<select
                  value={p.room.id}
                  onChange={(e) => p.openRoom(e.target.value)}
                >
                  {siblings.map((r) => (
                    <option key={r.id} value={r.id}>{r.title}</option>
                  ))}
                </select>
              </label>
            )}
            <nav className="pr-room-tabs" aria-label="Company room pages">
              {([
                ["overview", "Overview"],
                ["notes", "Notes & calls"],
                [
                  "files",
                  "Files",
                ],
                ["research", "Research"],
                ["proposal", "Proposal & pricing"],
              ] as const).filter(([id]) =>
                id !== "proposal" || p.room?.kind === "client"
              ).map(([id, name]) => (
                <button
                  key={id}
                  aria-current={p.roomView === id ? "page" : undefined}
                  className={p.roomView === id ? "is-active" : ""}
                  onClick={() => p.setRoomView(id)}
                >
                  {name}
                </button>
              ))}
            </nav>
            {p.children}
          </>
        )}
      </main>
    </div>
  );
}
