import React, { useState } from "react";
import {
  AEO_LIMITS, AEO_OUTCOMES, AEO_SEARCH_LIMITS, AEO_SEARCH_MESSAGES, AEO_SEARCH_OUTCOMES,
  AEO_SEARCH_PROVIDER, AEO_SURFACES, aeoQuestions,
} from "../supabase/functions/_shared/project-room-aeo.mjs";
import type { AeoOutcome, AeoSearchRun, AeoSurface, ProjectRoom } from "../services/projectRoomService";

const control = "mt-1 block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-600";
const button = "min-h-10 rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold text-blue-900 focus-visible:outline-blue-600 disabled:opacity-50";
const surfaces = Object.entries(AEO_SURFACES) as [AeoSurface, string][];
const today = () => {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

function AutomaticSearch({ run, running }: { run?: AeoSearchRun; running: boolean }) {
  const measured = run?.results.filter(row => row.outcome !== "unmeasured") || [];
  return (
    <section className="mt-4 rounded-xl border border-blue-100 bg-white p-4" aria-label={AEO_SEARCH_PROVIDER}>
      <h5 className="text-sm font-bold">{AEO_SEARCH_PROVIDER}</h5>
      <p className="mt-1 text-xs text-slate-600">{AEO_SEARCH_LIMITS}</p>
      {!run && <p className="mt-2 text-sm">The five questions run automatically at the start of research when the room has five requests available for search.</p>}
      {run?.status === "running" && <p role="status" className="mt-2 text-sm">
        {running ? "Running the five buyer questions…" : "Search paused or awaiting recovery."}
      </p>}
      {run?.reason && <p role="status" className="mt-2 text-sm">{AEO_SEARCH_MESSAGES[run.reason]}</p>}
      {run?.status === "finished" && (
        <>
          <p className="mt-2 text-sm font-semibold">
            Round {run.round} · {measured.length} of {run.questions.length} usable answers · Brand named in {measured.filter(row => row.outcome === "mentioned").length}
          </p>
          <ol className="mt-3 space-y-3">
            {run.results.map(row => (
              <li key={row.question} className="border-t border-blue-100 pt-2 text-sm">
                <p className="break-words font-semibold">{run.questions[row.question]}</p>
                <p className="mt-1 text-slate-600">{AEO_SEARCH_OUTCOMES[row.outcome]} · {row.observed_at.slice(0, 10)}</p>
                {!!row.mentions.length && <p className="mt-1 break-words">Brand matches: {row.mentions.join(", ")}</p>}
                {!!row.competitors.length && <p className="mt-1 break-words">Other options: {row.competitors.join(", ")}</p>}
                {!!row.citations.length && <p className="mt-1 break-words">
                  Sources: {row.citations.map(({ url, title }, i) => (
                    <React.Fragment key={url}>
                      {i > 0 && " · "}
                      <a href={url} target="_blank" rel="noreferrer" className="text-blue-800 underline">{title}</a>
                    </React.Fragment>
                  ))}
                </p>}
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

export default function ProjectRoomAeo({ room, busy, save }: {
  room: ProjectRoom;
  busy: boolean;
  save: (change: Record<string, unknown>) => Promise<boolean>;
}) {
  const baseline = room.state.aeo;
  const editable = ["draft", "awaiting_user"].includes(room.status);
  const [category, setCategory] = useState(baseline?.category || "");
  const [surface, setSurface] = useState<AeoSurface>("chatgpt");
  const [editing, setEditing] = useState<{
    version: number; question: number; outcome: AeoOutcome | ""; observed_on: string;
    competitors: string; citations: string; context: string;
  } | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const categoryLocked = !!baseline?.observations.length;
  const searchRun = baseline && [...room.state.rounds].reverse()
    .find(round => round.aeo?.category === baseline.category && round.aeo_search)?.aeo_search;
  const includedIn = baseline && [...room.state.rounds].reverse().find(round =>
    round.aeo?.category === baseline.category &&
    round.aeo.observations.length === baseline.observations.length &&
    round.aeo.observations.every(o => baseline.observations.some(b =>
      b.question === o.question && b.surface === o.surface && b.recorded_at === o.recorded_at)));

  return (
    <section aria-labelledby="room-aeo-title" className="my-6 rounded-2xl border border-blue-100 bg-blue-50/50 p-4 text-slate-800 md:p-6">
      <h4 id="room-aeo-title" className="text-lg font-bold text-[#102b4e]">AI search (AEO) baseline</h4>
      <p className="mt-2 text-sm">See whether AI answers name {room.title} when buyers compare options. Save a public buyer category to include automatic web searches in the next research round.</p>
      {!editable && <p className="mt-2 text-sm">You can edit the baseline after the current round finishes.</p>}
      {editable && !categoryLocked && (
        <form className="mt-4 space-y-2" onSubmit={async e => {
          e.preventDefault();
          if (await save({ category })) setCategory(category.trim());
        }}>
          <label className="block text-sm font-semibold">Public buyer category
            <input className={control} value={category} maxLength={120} required minLength={3}
              placeholder="e.g. interior painting services in Atlanta"
              onChange={e => setCategory(e.target.value)} />
          </label>
          <p className="text-xs text-slate-600">Use a category and optional location. Leave out the brand name so the questions test unaided visibility.</p>
          {!baseline && category.trim().length >= 3 && (
            <ol className="list-decimal space-y-1 pl-5 text-sm">
              {aeoQuestions(category.trim()).map(question => <li key={question}>{question}</li>)}
            </ol>
          )}
          <button className={button} disabled={busy || category.trim().length < 3} type="submit">
            {baseline ? "Update buyer questions" : "Save five buyer questions"}
          </button>
        </form>
      )}
      {baseline && (
        <>
          <AutomaticSearch run={searchRun} running={room.status === "running"} />
          <h5 className="mt-5 text-sm font-bold">Manual checks</h5>
          <p className="mt-1 text-xs text-slate-600">{AEO_LIMITS}</p>
          <p className="mt-4 text-sm font-semibold">
            {includedIn ? `Included in round ${includedIn.number}'s evidence.` : "Saved checks will be included in the next research round."}
          </p>
          <ul aria-label="AI search coverage" className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
            {surfaces.map(([id, name]) => {
              const checked = baseline.observations.filter(o => o.surface === id);
              const answered = checked.filter(o => o.outcome !== "no_answer");
              return <li key={id} className="rounded-lg bg-white p-3">
                <strong className="block">{name}</strong>
                {checked.length} of {baseline.questions.length} checked · {answered.length
                  ? `${answered.filter(o => o.outcome === "mentioned").length}/${answered.length} answers mentioned the brand`
                  : "No answers measured"}
              </li>;
            })}
          </ul>
          <label className="mt-4 block max-w-xs text-sm font-semibold">AI surface
            <select className={control} value={surface} onChange={e => {
              setSurface(e.target.value as AeoSurface);
              setEditing(null);
            }}>
              {surfaces.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          </label>
          <p role="status" className="mt-2 text-xs text-slate-600">{copyStatus}</p>
          <ol className="mt-3 space-y-3">
            {baseline.questions.map((question, i) => {
              const row = baseline.observations.find(o => o.surface === surface && o.question === i);
              return <li key={question} className="min-w-0 rounded-xl border border-blue-100 bg-white p-3 text-sm">
                <p className="break-words font-semibold">{i + 1}. {question}</p>
                <p className="mt-1 text-slate-600">{row ? `${AEO_OUTCOMES[row.outcome]} · ${row.observed_on}` : "Not checked"}</p>
                {row?.competitors && <p className="mt-1 break-words">Other names: {row.competitors}</p>}
                {row?.context && <p className="mt-1 break-words">Context: {row.context}</p>}
                {!!row?.citations.length && <ul className="mt-1 space-y-1">
                  {row.citations.map((url, j) => <li key={url}><a className="break-all text-blue-800 underline" href={url} target="_blank" rel="noreferrer">Citation {j + 1}: {new URL(url).hostname}</a></li>)}
                </ul>}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" className={button} aria-label={`Copy question ${i + 1}`} onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(question);
                      setCopyStatus(`Question ${i + 1} copied.`);
                    } catch {
                      setCopyStatus("Copy unavailable. Select the question text to copy it.");
                    }
                  }}>Copy question</button>
                  {editable && <button type="button" className={button} disabled={busy}
                    aria-label={`${row ? "Edit" : "Record"} check for question ${i + 1}`}
                    onClick={() => setEditing({
                      version: room.version, question: i, outcome: row?.outcome || "",
                      observed_on: row?.observed_on || today(), competitors: row?.competitors || "",
                      citations: row?.citations.join("\n") || "", context: row?.context || "",
                    })}>{row ? "Edit check" : "Record check"}</button>}
                </div>
                {editable && editing?.question === i && (
                  <form className="mt-3 space-y-3 border-t border-blue-100 pt-3" onSubmit={async e => {
                    e.preventDefault();
                    const { version, citations, ...observation } = editing;
                    if (await save({ version, observation: {
                      ...observation, surface, citations: citations.split(/\r?\n/).map(s => s.trim()).filter(Boolean),
                    } })) setEditing(null);
                  }}>
                    <label className="block font-semibold">Observed result
                      <select className={control} required value={editing.outcome}
                        onChange={e => setEditing({ ...editing, outcome: e.target.value as AeoOutcome })}>
                        <option value="">Choose a result</option>
                        {Object.entries(AEO_OUTCOMES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                    <label className="block font-semibold">Date checked
                      <input className={control} type="date" required max={today()} value={editing.observed_on}
                        onChange={e => setEditing({ ...editing, observed_on: e.target.value })} />
                    </label>
                    {editing.outcome && editing.outcome !== "no_answer" && <>
                      <label className="block font-semibold">Other brands or competitors named
                        <input className={control} maxLength={300} value={editing.competitors}
                          onChange={e => setEditing({ ...editing, competitors: e.target.value })} />
                      </label>
                      <label className="block font-semibold">Public citation URLs (up to three, one per line)
                        <textarea className={control} rows={2} maxLength={1802} value={editing.citations}
                          onChange={e => setEditing({ ...editing, citations: e.target.value })} />
                      </label>
                    </>}
                    <label className="block font-semibold">Context (optional)
                      <input className={control} maxLength={160} placeholder="e.g. Atlanta, signed out, web search on"
                        value={editing.context} onChange={e => setEditing({ ...editing, context: e.target.value })} />
                    </label>
                    {editing.version !== room.version && <p role="alert">The room changed while you were editing. Reopen this check to use the latest version.</p>}
                    <div className="flex flex-wrap gap-2">
                      <button className={button} disabled={busy || editing.version !== room.version} type="submit">Save check</button>
                      <button className={button} type="button" onClick={() => setEditing(null)}>Cancel</button>
                    </div>
                  </form>
                )}
              </li>;
            })}
          </ol>
        </>
      )}
    </section>
  );
}
