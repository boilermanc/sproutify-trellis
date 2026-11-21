import React, { useRef, useState } from "react";
import { FileText, Loader2, Upload, X } from "lucide-react";
import {
  extractRoomDocument,
  type RoomDocument,
} from "../services/projectRoomDocuments";
import { DOCUMENT_LIMITS } from "../supabase/functions/_shared/project-room-intake.mjs";
export default function ProjectRoomDocuments({
  documents,
  onChange,
  disabled = false,
  onBusyChange,
}: {
  documents: RoomDocument[];
  onChange: (docs: RoomDocument[]) => void;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selection = useRef<HTMLInputElement>(null);
  async function add(files: FileList | null) {
    if (!files?.length) return;
    setError("");
    setBusy(true);
    onBusyChange?.(true);
    try {
      if (documents.length + files.length > DOCUMENT_LIMITS.files)
        throw new Error("Add at most five documents.");
      const next = [...documents];
      for (const file of Array.from(files)) {
        const doc = await extractRoomDocument(file);
        if (next.some((d) => d.sha256 === doc.sha256))
          throw new Error(`${file.name} has already been added.`);
        next.push(doc);
      }
      if (
        next.reduce((n, d) => n + d.text.length, 0) > DOCUMENT_LIMITS.totalText
      )
        throw new Error(
          "Combined extracted text is limited to 48,000 characters. Add shorter documents.",
        );
      onChange(next);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      onBusyChange?.(false);
      if (selection.current) selection.current.value = "";
    }
  }
  return (
    <section className="space-y-4" aria-label="Project documents">
      <div className="rounded-2xl border border-dashed border-blue-300 bg-blue-50/50 p-5">
        <div className="flex items-center gap-2 font-semibold text-[#102b4e]">
          <Upload size={19} />
          Documents for review
        </div>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Add text PDFs, Markdown or text files. Up to five files, 5 MB each, 40
          PDF pages. We extract up to 18,000 characters per file; previews show
          any truncation.
        </p>
        <p className="mt-2 text-xs leading-5 text-slate-500">
          This review import saves only extracted text. To keep the original,
          use Original project files in the saved room’s Files tab. Text is saved in
          your private room and shared with the room providers after consent.
          Images, layout, scanned pages and attached links are not reviewed. No
          OCR or Word file support.
        </p>
        <input
          ref={selection}
          type="file"
          accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown"
          multiple
          className="mt-4 block max-w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[#102b4e] file:px-4 file:py-2 file:text-white"
          aria-label="Add documents for review"
          disabled={disabled || busy}
          onChange={(e) => add(e.target.files)}
        />
        {busy && (
          <p
            role="status"
            className="mt-3 flex items-center gap-2 text-sm text-blue-800"
          >
            <Loader2 size={15} className="animate-spin" />
            Extracting document text locally…
          </p>
        )}
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-orange-50 p-3 text-sm text-orange-900"
        >
          {error}
        </p>
      )}
      {documents.map((doc, i) => (
        <article
          key={doc.sha256}
          className="rounded-2xl border border-slate-200 bg-white p-4"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 font-semibold text-[#102b4e]">
                <FileText size={17} />
                {doc.name}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {(doc.size / 1024).toFixed(0)} KB ·{" "}
                {doc.pages ? `${doc.pages} pages · ` : ""}
                {doc.text.length.toLocaleString()} extracted characters ·{" "}
                {doc.truncated ? "Partial excerpt" : "Text extracted"}
              </p>
            </div>
            <button
              type="button"
              aria-label={`Remove ${doc.name}`}
              disabled={disabled || busy}
              className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-40"
              onClick={() =>
                onChange(documents.filter((_, index) => index !== i))
              }
            >
              <X size={16} />
            </button>
          </div>
          <details className="mt-3">
            <summary className="cursor-pointer text-sm text-blue-800">
              Preview the text agents will receive
            </summary>
            <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-3 text-xs leading-5">
              {doc.text}
            </pre>
          </details>
          {doc.truncated && (
            <p className="mt-3 text-xs font-semibold text-orange-800">
              Only this excerpt will be included. Review the preview before
              continuing.
            </p>
          )}
          <label className="mt-4 flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={doc.share_consent}
              disabled={disabled || busy}
              onChange={(e) =>
                onChange(
                  documents.map((d, index) =>
                    index === i ? { ...d, share_consent: e.target.checked } : d,
                  ),
                )
              }
            />
            I may share this extracted text with the room providers for this
            project.
          </label>
        </article>
      ))}
    </section>
  );
}
