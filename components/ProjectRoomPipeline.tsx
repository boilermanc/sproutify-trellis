import React from "react";
import type { RoomClient } from "../services/projectRoomService";
import type { RoomSummary } from "./ProjectRoomWorkspace";
import {
  money,
  pipelineTotals,
  SALES_LABELS,
  SALES_STAGES,
} from "../supabase/functions/_shared/project-room-proposal.mjs";
export default function ProjectRoomPipeline(
  { rooms, clients, openRoom, limited }: {
    rooms: RoomSummary[];
    clients: RoomClient[];
    openRoom: (id: string) => void;
    limited: boolean;
  },
) {
  const totals = pipelineTotals(rooms, clients);
  return (
    <>
      <header className="pr-top">
        <div>
          <h1>Sales pipeline</h1>
          <p>
            See what may become paid work. One opportunity per company project;
            separate projects for the same company count separately.
          </p>
        </div>
      </header>
      {limited && (
        <p role="status" className="pr-archive-message">
          Showing the 100 most recently updated rooms you can access. These
          totals are partial.
        </p>
      )}
      <div className="pr-metrics">
        <div className="pr-metric pr-blue">
          <b>{money(totals.once)}</b>
          <span>Open one-time fees</span>
        </div>

        <div className="pr-metric">
          <b>{money(totals.won_once)}</b>
          <span>Won one-time fees</span>
        </div>
        <div className="pr-metric">
          <b>{totals.unpriced}</b>
          <span>Open projects need pricing</span>
        </div>
      </div>
      <p className="pr-muted">
        USD planning estimates, not booked revenue or cash received. No
        probability weighting. Optional fees, archived companies, stopped
        research rooms and lost opportunities are excluded from open totals.
        Only one-time project fees count. Each project ends with verification and handoff. Marking Won does not change
        the company’s prospect/customer status.
      </p>
      <div className="pr-pipeline-grid">
        {SALES_STAGES.map((stage) => {
          const rows = totals.active.filter((r) =>
            (r.proposal?.stage || "prospect") === stage
          );
          return (
            <section className="pr-panel" key={stage}>
              <h2>
                {SALES_LABELS[stage]}{" "}
                <span className="pr-tag">{rows.length}</span>
              </h2>
              {rows.length
                ? rows.map((r) => (
                  <article className="pr-pipeline-card" key={r.id}>
                    <h3>{r.title}</h3>
                    <p>
                      {r.proposal
                        ? `${money(r.proposal.totals.once)} one-time`
                        : "Not priced yet"}
                    </p>
                    {!!(r.proposal?.totals.monthly || r.proposal?.totals.optional_monthly) && <p>Older recurring fees need review; excluded from project value.</p>}
                    {!!r.proposal?.totals.unpriced && (
                      <p>Partial estimate — pricing needed</p>
                    )}
                    {r.proposal?.close_date && (
                      <p>Expected close: {r.proposal.close_date}</p>
                    )}
                    <button
                      className="pr-button"
                      onClick={() =>
                        openRoom(r.id)}
                    >
                      Open proposal for {r.title}
                    </button>
                  </article>
                ))
                : <p className="pr-empty">No projects here yet.</p>}
            </section>
          );
        })}
      </div>
    </>
  );
}
