import React, { useEffect, useRef, useState } from "react";
import { Download, RefreshCw, Upload } from "lucide-react";
import { supabase } from "../lib/supabase";
import { callRoom, type ProjectFile } from "../services/projectRoomService";
import {
  FILE_BUCKET,
  validateOriginalFile,
} from "../supabase/functions/_shared/project-room-crm.mjs";

type Prepared = { file: ProjectFile; upload: { path: string; token: string } };
export default function ProjectRoomFiles({ roomId, onError, onSuccess }: {
  roomId: string;
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}) {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("proposal");
  const [retry, setRetry] = useState<ProjectFile | null>(null);
  const selection = useRef<HTMLInputElement>(null);
  const mounted = useRef(true);
  async function refresh(offset = 0) {
    const result = await callRoom<{ files: ProjectFile[]; has_more: boolean }>(
      "files_list",
      { id: roomId, offset },
    );
    if (mounted.current) {
      setFiles((items) =>
        offset
          ? [
            ...items,
            ...result.files.filter((f) =>
              !items.some((item) => item.id === f.id)
            ),
          ]
          : result.files
      );
      setHasMore(result.has_more);
    }
  }
  useEffect(() => {
    mounted.current = true;
    refresh().catch((e) => {
      if (mounted.current) setError(e.message);
    }).finally(() => {
      if (mounted.current) setLoading(false);
    });
    return () => {
      mounted.current = false;
    };
  }, [roomId]);
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      const message = (e as Error).message;
      if (mounted.current) setError(message);
      onError(message);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    await run(async () => {
      validateOriginalFile({
        name: file.name,
        size: file.size,
        category: retry?.category || category,
      });
      if (
        retry && (file.name !== retry.name || file.size !== Number(retry.size))
      ) throw new Error("Select the same original file to retry this upload.");
      const prepared = await callRoom<Prepared>(
        retry ? "file_retry" : "file_prepare",
        retry
          ? { id: roomId, file_id: retry.id }
          : { id: roomId, name: file.name, size: file.size, category },
      );
      // Show the durable pending record even if the network fails during upload.
      if (mounted.current) {
        setFiles((items) => [
          prepared.file,
          ...items.filter((f) => f.id !== prepared.file.id),
        ]);
      }
      const original = new File([file], file.name, {
        type: prepared.file.mime_type,
      });
      const result = await supabase.storage.from(FILE_BUCKET).uploadToSignedUrl(
        prepared.upload.path,
        prepared.upload.token,
        original,
        { contentType: prepared.file.mime_type },
      );
      if (result.error) {
        throw new Error(
          "Upload did not finish. Retry upload with the same original file.",
        );
      }
      await callRoom("file_complete", {
        id: roomId,
        file_id: prepared.file.id,
      });
      await refresh();
      setRetry(null);
      onSuccess("Original project file saved.");
    });
    if (selection.current) selection.current.value = "";
  }
  return (
    <section className="pr-panel" aria-label="Original project files">
      <h2>Original project files</h2>
      <p className="pr-muted">
        Save proposals, contracts and other client files here. Originals keep
        their formatting and can be downloaded later. Files are private to the
        project team.
      </p>
      <p className="pr-muted pr-small">
        PDF, Word, text, Markdown, PNG or JPEG · up to 20 MB each. Uploading
        does not send a proposal or add it to AI research.
      </p>
      <div className="pr-actions">
        <label className="pr-field">
          File category<select
            className="rounded-lg border p-3"
            value={category}
            disabled={busy}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="proposal">Proposal</option>
            <option value="contract">Contract</option>
            <option value="other">Other</option>
          </select>
        </label>
        <button
          className="pr-button pr-primary"
          disabled={busy}
          onClick={() => {
            setRetry(null);
            selection.current?.click();
          }}
        >
          <Upload size={16} />
          {busy ? "Working…" : "Upload original file"}
        </button>
        <button
          className="pr-button"
          disabled={busy}
          onClick={() => run(() => refresh())}
        >
          <RefreshCw size={16} />Refresh files
        </button>
        <input
          ref={selection}
          aria-label="Choose original project file"
          type="file"
          accept=".pdf,.doc,.docx,.txt,.md,.png,.jpg,.jpeg"
          className="sr-only"
          disabled={busy}
          onChange={(e) => upload(e.target.files?.[0])}
        />
      </div>
      {loading && <p role="status">Loading project files…</p>}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {!loading && !error && !files.length && (
        <p className="pr-muted">No original files saved yet.</p>
      )}
      <ul className="pr-stack">
        {files.map((file) => (
          <li
            className="rounded-xl border border-slate-200 p-4 min-w-0"
            key={file.id}
          >
            <h3 className="font-bold break-all">{file.name}</h3>
            <p className="pr-muted text-sm">
              {file.category} · {Number(file.size) < 1024
                ? `${file.size} B`
                : `${(Number(file.size) / 1024).toFixed(1)} KB`} ·
              {" "}
              {new Date(file.created_at).toLocaleString()} ·{" "}
              {file.status === "ready" ? "Saved" : "Upload unfinished"}
            </p>
            <div className="pr-actions">
              {file.status === "ready"
                ? (
                  <button
                    className="pr-button"
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        const { url } = await callRoom<{ url: string }>(
                          "file_download",
                          { id: roomId, file_id: file.id },
                        );
                        const anchor = document.createElement("a");
                        anchor.href = url;
                        anchor.rel = "noopener";
                        anchor.download = file.name;
                        anchor.click();
                      })}
                  >
                    <Download size={16} />Download {file.name}
                  </button>
                )
                : (
                  <>
                    <button
                      className="pr-button"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          await callRoom("file_complete", {
                            id: roomId,
                            file_id: file.id,
                          });
                          await refresh();
                          onSuccess("Original project file saved.");
                        })}
                    >
                      Finish saving {file.name}
                    </button>
                    <button
                      className="pr-button"
                      disabled={busy}
                      onClick={() => {
                        setRetry(file);
                        selection.current?.click();
                      }}
                    >
                      Retry upload {file.name}
                    </button>
                  </>
                )}
            </div>
          </li>
        ))}
      </ul>
      {hasMore && (
        <button
          className="pr-button"
          disabled={busy}
          onClick={() => run(() => refresh(files.length))}
        >
          Load older files
        </button>
      )}
    </section>
  );
}
