import test from "node:test";
import assert from "node:assert/strict";
import {
  handleRoomFiles,
  MAX_FILE_BYTES,
  validateContacts,
  validateOriginalFile,
} from "../supabase/functions/_shared/project-room-crm.mjs";
const contact = (patch = {}) => ({
  id: crypto.randomUUID(),
  name: "Alex Painter",
  role: "Owner",
  email: "alex@example.org",
  phone: "+1 555 123 4567",
  notes: "",
  is_primary: true,
  archived: false,
  ...patch,
});
test("contacts validate identifiers, duplicates, primary status, limits and sensitive notes", () => {
  const input = contact({ notes: "ID 123-45-6789" });
  assert.equal(validateContacts([input])[0].notes, "ID [REDACTED_ID]");
  assert.equal(input.notes, "ID 123-45-6789");
  assert.throws(() => validateContacts([contact({ name: "" })]), /name/);
  assert.throws(() => validateContacts([contact({ email: "bad" })]), /email/);
  assert.throws(
    () =>
      validateContacts([contact(), contact({ email: "other@example.org" })]),
    /primary/,
  );
  assert.throws(
    () =>
      validateContacts([
        contact(),
        contact({ is_primary: false, email: "ALEX@example.org" }),
      ]),
    /email already/,
  );
  assert.throws(() => validateContacts([input, input]), /twice/);
  assert.throws(
    () => validateContacts([contact({ id: "../wrong" })]),
    /Invalid contact/,
  );
  assert.throws(
    () => validateContacts(Array.from({ length: 31 }, () => contact())),
    /30/,
  );
  assert.throws(
    () => validateContacts([contact({ notes: "x".repeat(2001) })]),
    /2000/,
  );
  assert.equal(
    validateContacts([contact({ archived: true })])[0].is_primary,
    false,
  );
  assert.deepEqual(validateContacts([]), []);
});
test("original uploads use allowed extensions, server MIME types and a bounded file size", () => {
  assert.equal(
    validateOriginalFile({
      name: "Discovery.DOCX",
      size: 400,
      category: "proposal",
      mime_type: "text/html",
    }).mime_type,
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  );
  for (
    const input of [
      { name: "../secret.pdf" },
      { name: "script.html" },
      { size: 0 },
      { size: MAX_FILE_BYTES + 1 },
      { category: "unknown" },
    ]
  ) {
    assert.throws(() =>
      validateOriginalFile({
        name: "discovery.pdf",
        size: 10,
        category: "proposal",
        ...input,
      })
    );
  }
});
function fixture() {
  const rows = [], calls = [];
  let info = null, uploadError = false;
  const db = {
    from() {
      let filters = [], operation = "read", patch;
      const q = {
        select() {
          return q;
        },
        eq(key, value) {
          filters.push([key, value]);
          return q;
        },
        order() {
          return q;
        },
        range() {
          return q;
        },
        insert(row) {
          rows.push({ ...row, status: "pending" });
          operation = "insert";
          patch = row;
          return q;
        },
        update(value) {
          operation = "update";
          patch = value;
          return q;
        },
        single() {
          return q.then((result) => ({
            ...result,
            data: Array.isArray(result.data) ? result.data[0] : result.data,
          }));
        },
        maybeSingle() {
          return q.single();
        },
        then(resolve) {
          const found = operation === "insert"
            ? rows.filter((r) => r.id === patch.id)
            : rows.filter((r) => filters.every(([k, v]) => r[k] === v));
          if (operation === "update") {
            found.forEach((r) => Object.assign(r, patch));
          }
          return Promise.resolve({ data: found, error: null }).then(resolve);
        },
      };
      return q;
    },
    storage: {
      from(bucket) {
        assert.equal(bucket, "project-room-files");
        return {
          async createSignedUploadUrl(path, options) {
            calls.push(["upload", path, options]);
            return { data: { token: "fixture-only" }, error: uploadError };
          },
          async info(path) {
            calls.push(["info", path]);
            return { data: info, error: !info };
          },
          async createSignedUrl(path, expires, options) {
            calls.push(["download", path, expires, options]);
            return {
              data: { signedUrl: "https://example.org/private-download" },
            };
          },
        };
      },
    },
  };
  return {
    db,
    rows,
    calls,
    setInfo(value) {
      info = value;
    },
    failUpload(value) {
      uploadError = value;
    },
  };
}
test("upload lifecycle survives interrupted completion, scopes file IDs and signs only stored paths", async () => {
  const f = fixture(), room = { id: crypto.randomUUID() };
  const run = (body) => handleRoomFiles(f.db, room, "operator", body);
  const prepared = await run({
    action: "file_prepare",
    name: "discovery.pdf",
    size: 8,
    category: "proposal",
  });
  const id = prepared.file.id;
  assert.equal(prepared.file.status, "pending");
  assert.deepEqual(f.calls[0][2], { upsert: false });
  await assert.rejects(
    () => run({ action: "file_download", file_id: id }),
    /Finish uploading/,
  );
  await assert.rejects(
    () =>
      handleRoomFiles(f.db, { id: "another-room" }, "operator", {
        action: "file_complete",
        file_id: id,
      }),
    /not found/,
  );
  await assert.rejects(
    () => run({ action: "file_complete", file_id: id }),
    /incomplete/,
  );
  f.setInfo({ size: 9, contentType: "application/pdf" });
  await assert.rejects(
    () => run({ action: "file_complete", file_id: id }),
    /incomplete/,
  );
  f.setInfo({ size: 8, contentType: "text/html" });
  await assert.rejects(
    () => run({ action: "file_complete", file_id: id }),
    /incomplete/,
  );
  f.setInfo({ size: 8, contentType: "application/pdf" });
  await run({ action: "file_complete", file_id: id });
  await run({ action: "file_complete", file_id: id });
  assert.equal(f.rows.length, 1, "completion retries do not duplicate records");
  await run({
    action: "file_download",
    file_id: id,
    path: "another-room/secret",
    name: "injected.html",
  });
  assert.deepEqual(f.calls.at(-1), ["download", prepared.upload.path, 60, {
    download: "discovery.pdf",
  }]);
  assert.equal((await run({ action: "files_list" })).files.length, 1);
  await assert.rejects(() => run({ action: "files_list", offset: -1 }), /page/);
  await assert.rejects(
    () => run({ action: "file_retry", file_id: id }),
    /already been saved/,
  );
});
test("failed signed upload preserves a recoverable pending record", async () => {
  const f = fixture(), room = { id: crypto.randomUUID() };
  f.failUpload(true);
  await assert.rejects(
    () =>
      handleRoomFiles(f.db, room, "operator", {
        action: "file_prepare",
        name: "original.docx",
        size: 15,
        category: "proposal",
      }),
    /retry/,
  );
  assert.equal(f.rows[0].status, "pending");
  f.failUpload(false);
  const retry = await handleRoomFiles(f.db, room, "operator", {
    action: "file_retry",
    file_id: f.rows[0].id,
  });
  assert.equal(retry.upload.path, f.rows[0].path);
});
