import React from "react";
import { Download } from "lucide-react";
import type { ProjectRoom } from "../services/projectRoomService";
import {
  assessmentSections,
  inlineTokens,
  markdownBlocks,
  formattedAssessment,
} from "../services/companyAssessment.mjs";
function Inline({ text }: { text: string }) {
  return (
    <>
      {inlineTokens(text).map((token, i) =>
        token.type === "link" ? (
          <a
            key={i}
            href={token.url}
            target="_blank"
            rel="noreferrer"
            className="underline decoration-current underline-offset-4"
          >
            {token.text}
          </a>
        ) : token.type === "strong" ? (
          <strong key={i}>{token.text}</strong>
        ) : token.type === "code" ? (
          <code key={i} className="rounded bg-slate-100 px-1 text-slate-800">
            {token.text}
          </code>
        ) : (
          <React.Fragment key={i}>{token.text}</React.Fragment>
        ),
      )}
    </>
  );
}
export default function CompanyAssessment({ room }: { room: ProjectRoom }) {
  const sections = assessmentSections(room.state.summary);
  function download() {
    const url = URL.createObjectURL(
      new Blob([formattedAssessment(room)], {
        type: "text/html;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${room.title.replace(/[^a-z0-9]/gi, "-")}-assessment.html`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <article className="overflow-hidden rounded-2xl border border-blue-100 bg-white text-[#263b52]">
      <header className="border-t-4 border-orange-400 px-6 pb-6 pt-8 md:px-10">
        <p className="text-[10px] font-bold uppercase tracking-[.22em] text-blue-800">
          Project room / Company review
        </p>
        <h3 className="mt-4 text-3xl font-bold leading-tight text-[#102b4e]">
          {room.title}
          <br />
          Opportunity assessment
        </h3>
        <p className="mt-3 text-sm text-slate-500">
          A practical recommendation for discussion and validation
        </p>
        <button
          className="mt-5 inline-flex items-center gap-2 rounded-lg border border-blue-200 px-3 py-2 text-xs font-semibold text-blue-900"
          onClick={download}
        >
          <Download size={14} />
          Download formatted review
        </button>
        <p className="mt-2 text-xs text-slate-500">
          Opens as an HTML document. Use the browser’s Print → Save as PDF for a
          shareable copy.
        </p>
      </header>
      <div className="mx-6 mb-4 border-l-2 border-blue-300 bg-blue-50 p-4 text-xs leading-6 text-slate-600 md:mx-10">
        Working assessment, not a quotation or approved scope. Sources,
        inference and remaining validation must stay distinct. Extracted
        document text does not establish a full visual or OCR review.
      </div>
      {sections.map((section, index) => {
        const highlight = /^recommendation$/i.test(section.title);
        return (
          <section
            key={index}
            className={`border-b border-blue-100 px-6 py-7 md:px-10 ${highlight ? "border-l-4 border-l-orange-400 bg-[#102b4e] text-white" : ""}`}
          >
            <p
              className={`text-[10px] font-bold uppercase tracking-[.2em] ${highlight ? "text-blue-200" : "text-blue-700"}`}
            >
              Opportunity assessment / {String(index + 1).padStart(2, "0")}
            </p>
            <h4
              className={`mb-4 mt-2 text-xl font-bold ${highlight ? "text-white" : "text-[#102b4e]"}`}
            >
              {section.title}
            </h4>
            <div className="space-y-3 text-sm leading-7">
              {markdownBlocks(section.text).map((block, i) =>
                block.type === "table" ? (
                  <div key={i} className="overflow-x-auto">
                    <table className="w-full border-collapse text-left text-xs leading-6">
                      <thead>
                        <tr>
                          {block.rows[0].map((cell, j) => (
                            <th
                              key={j}
                              className="border-b border-blue-200 bg-blue-50 p-3 font-bold text-[#102b4e]"
                            >
                              <Inline text={cell} />
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {block.rows.slice(1).map((row, j) => (
                          <tr key={j}>
                            {row.map((cell, k) => (
                              <td
                                key={k}
                                className="border-b border-blue-100 p-3 align-top"
                              >
                                <Inline text={cell} />
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : block.type === "heading" ? (
                  <h5 key={i} className="pt-3 text-base font-bold">
                    <Inline text={block.text} />
                  </h5>
                ) : (
                  <p
                    key={i}
                    className={
                      block.type === "item"
                        ? "border-l-2 border-blue-200 pl-3"
                        : ""
                    }
                  >
                    <Inline text={block.text} />
                  </p>
                ),
              )}
            </div>
          </section>
        );
      })}
      <footer className="px-6 py-5 text-xs leading-6 text-slate-500 md:px-10">
        Trellis project room · Proposed decisions require your approval. This
        document does not establish client participation or endorsement.
      </footer>
    </article>
  );
}
