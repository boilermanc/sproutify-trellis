import { sanitizePII } from "./project-room-sanitize.mjs";

export const FILE_BUCKET = "project-room-files";
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const FILE_TYPES = {
  pdf: "application/pdf",
  docx:
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  doc: "application/msword",
  txt: "text/plain",
  md: "text/markdown",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
};
export function validateContacts(value) {
  if (!Array.isArray(value) || value.length > 30) {
    throw new Error("Keep at most 30 client contacts.");
  }
  const ids = new Set(), emails = new Set();
  let primary = 0;
  return value.map((c) => {
    if (
      !c || typeof c !== "object" ||
      !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(c.id || "")
    ) throw new Error("Invalid contact. Refresh and try again.");
    if (ids.has(c.id)) throw new Error("A contact appears twice.");
    ids.add(c.id);
    const contact = { id: c.id };
    for (
      const [key, max] of Object.entries({
        name: 140,
        role: 140,
        email: 254,
        phone: 60,
        notes: 2000,
      })
    ) {
      if (typeof c[key] !== "string" || c[key].length > max) {
        throw new Error(`Check contact ${key} (maximum ${max} characters).`);
      }
      contact[key] = sanitizePII(c[key], max).trim();
    }
    if (!contact.name) throw new Error("Enter a contact name.");
    if (contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) {
      throw new Error("Enter a valid email address.");
    }
    if (typeof c.is_primary !== "boolean" || typeof c.archived !== "boolean") {
      throw new Error("Invalid contact status.");
    }
    contact.is_primary = c.is_primary && !c.archived;
    contact.archived = c.archived;
    if (contact.is_primary && ++primary > 1) {
      throw new Error("Choose one primary contact.");
    }
    if (!contact.archived && contact.email) {
      const key = contact.email.toLowerCase();
      if (emails.has(key)) {
        throw new Error("This email already belongs to an active contact.");
      }
      emails.add(key);
    }
    return contact;
  });
}
export function validateOriginalFile(input) {
  if (
    typeof input.name !== "string" || !input.name.trim() ||
    input.name.length > 180 || /[\x00-\x1f/\\]/.test(input.name)
  ) throw new Error("Choose a file with a valid name (up to 180 characters).");
  const ext = input.name.split(".").at(-1)?.toLowerCase();
  if (!Object.hasOwn(FILE_TYPES, ext)) {
    throw new Error("Choose a PDF, Word, text, Markdown, PNG or JPEG file.");
  }
  if (
    !Number.isSafeInteger(input.size) || input.size < 1 ||
    input.size > MAX_FILE_BYTES
  ) throw new Error("Choose a non-empty file no larger than 20 MB.");
  if (!["proposal", "contract", "other"].includes(input.category)) {
    throw new Error("Choose a file category.");
  }
  return {
    name: sanitizePII(input.name, 180),
    size: input.size,
    mime_type: FILE_TYPES[ext],
    category: input.category,
    extension: ext,
  };
}
const columns =
  "id,room_id,name,size,mime_type,category,status,created_at,uploaded_at";
// The caller must verify active operator + room membership before dispatching here.
// Paths and download names are always read from the stored record, never the request.
export async function handleRoomFiles(db, room, actor, body) {
  const store = db.storage.from(FILE_BUCKET);
  if (body.action === "files_list") {
    const offset = body.offset ?? 0;
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new Error("Invalid file page.");
    }
    const { data, error } = await db.from("project_room_files").select(columns)
      .eq("room_id", room.id).order("created_at", { ascending: false }).order(
        "id",
      ).range(offset, offset + 49);
    if (error) throw new Error("Could not load project files.");
    return { files: data, has_more: data.length === 50 };
  }
  if (body.action === "file_prepare") {
    const file = validateOriginalFile(body);
    const id = crypto.randomUUID(), path = `${room.id}/${id}.${file.extension}`;
    const { data, error } = await db.from("project_room_files").insert({
      id,
      room_id: room.id,
      created_by: actor,
      path,
      name: file.name,
      size: file.size,
      mime_type: file.mime_type,
      category: file.category,
    }).select(columns).single();
    if (error) throw new Error("Could not prepare the project file.");
    const upload = await store.createSignedUploadUrl(path, { upsert: false });
    if (upload.error) {
      throw new Error(
        "Could not start upload. Refresh the file list and retry.",
      );
    }
    return { file: data, upload: { path, token: upload.data.token } };
  }
  const { data: file, error } = await db.from("project_room_files").select("*")
    .eq("room_id", room.id).eq("id", body.file_id).maybeSingle();
  if (error || !file) throw new Error("Project file not found.");
  if (body.action === "file_retry") {
    if (file.status !== "pending") {
      throw new Error("This file has already been saved.");
    }
    const upload = await store.createSignedUploadUrl(file.path, {
      upsert: false,
    });
    if (upload.error) throw new Error("Could not retry upload.");
    return { file, upload: { path: file.path, token: upload.data.token } };
  }
  if (body.action === "file_complete") {
    if (file.status === "ready") return { file };
    const info = await store.info(file.path);
    if (
      info.error || Number(info.data?.size) !== file.size ||
      info.data?.contentType !== file.mime_type
    ) {
      throw new Error(
        "Upload is incomplete or does not match this file. Retry the upload before saving.",
      );
    }
    const { data, error: updateError } = await db.from("project_room_files")
      .update({ status: "ready", uploaded_at: new Date().toISOString() }).eq(
        "id",
        file.id,
      ).eq("room_id", room.id).select(columns).single();
    if (updateError) {
      throw new Error(
        "The upload finished but saving did not. Use Finish saving to retry.",
      );
    }
    return { file: data };
  }
  if (body.action === "file_download") {
    if (file.status !== "ready") {
      throw new Error("Finish uploading this file first.");
    }
    const result = await store.createSignedUrl(file.path, 60, {
      download: file.name,
    });
    if (result.error) throw new Error("Could not download the project file.");
    return { url: result.data.signedUrl };
  }
  throw new Error("Unknown file action.");
}
