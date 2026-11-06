import { DOCUMENT_LIMITS } from "../supabase/functions/_shared/project-room-intake.mjs";
export interface RoomDocument {
  id?: string;
  name: string;
  size: number;
  sha256: string;
  text: string;
  pages: number | null;
  extraction: "pdfjs-text" | "utf8-text";
  truncated: boolean;
  share_consent: boolean;
}
export async function extractRoomDocument(file: File): Promise<RoomDocument> {
  if (!file.size || file.size > DOCUMENT_LIMITS.bytes)
    throw new Error("Choose a document no larger than 5 MB.");
  const ext = file.name.split(".").at(-1)?.toLowerCase();
  if (!["pdf", "txt", "md"].includes(ext || ""))
    throw new Error("Choose a text PDF, Markdown (.md), or text (.txt) file.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  let text = "";
  let pages: number | null = null;
  let truncated = false;
  if (ext === "pdf") {
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-")
      throw new Error("This file does not contain a PDF.");
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = (
      await import("pdfjs-dist/build/pdf.worker.min.mjs?url")
    ).default;
    const task = pdfjs.getDocument({
      data: bytes,
      enableXfa: false,
      useWasm: false,
      disableFontFace: true,
      useSystemFonts: false,
      stopAtErrors: true,
    });
    let timer: ReturnType<typeof setTimeout>;
    try {
      text = await Promise.race([
        (async () => {
          const pdf = await task.promise;
          pages = pdf.numPages;
          if (pdf.numPages > DOCUMENT_LIMITS.pages)
            throw new Error("Choose a PDF with 40 pages or fewer.");
          let output = "";
          for (let page = 1; page <= pdf.numPages; page++) {
            const content = await (await pdf.getPage(page)).getTextContent();
            output +=
              `\n[Page ${page}]\n` +
              content.items
                .map((item) =>
                  "str" in item
                    ? item.str + ("hasEOL" in item && item.hasEOL ? "\n" : " ")
                    : "",
                )
                .join("");
            if (output.length > DOCUMENT_LIMITS.text) {
              truncated = true;
              return output.slice(0, DOCUMENT_LIMITS.text);
            }
          }
          return output;
        })(),
        new Promise<string>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  "PDF extraction timed out. Use a shorter text document.",
                ),
              ),
            20000,
          );
        }),
      ]);
    } catch (e) {
      throw new Error(
        (e as Error).message ||
          "This PDF could not be read. Use an unlocked text PDF or paste a text excerpt.",
      );
    } finally {
      clearTimeout(timer!);
      await task.destroy();
    }
  } else {
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new Error("Text documents must use UTF-8 encoding.");
    }
    if (text.includes("\u0000"))
      throw new Error("Binary files are not supported.");
    truncated = text.length > DOCUMENT_LIMITS.text;
    text = text.slice(0, DOCUMENT_LIMITS.text);
  }
  // Page markers alone must not make a scanned PDF appear reviewable.
  if (text.replace(/\[Page \d+\]/g, "").trim().length < 20)
    throw new Error(
      "No usable text was found. Scanned or image-only PDFs need OCR outside this app or a text version.",
    );
  return {
    name: file.name,
    size: file.size,
    sha256,
    text: text.trim(),
    pages,
    extraction: ext === "pdf" ? "pdfjs-text" : "utf8-text",
    truncated,
    share_consent: false,
  };
}
