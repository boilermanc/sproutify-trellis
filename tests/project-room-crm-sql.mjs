import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "../node_modules/.crm-verification/node_modules/@electric-sql/pglite/dist/index.js";
const db = new PGlite();
const owner = "00000000-0000-4000-8000-000000000001",
  member = "00000000-0000-4000-8000-000000000002",
  outsider = "00000000-0000-4000-8000-000000000003";
await db.exec(
  `CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.user',true),'')::uuid $$;
CREATE FUNCTION public.uuid_generate_v4() RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;
CREATE TABLE trellis_users(id uuid DEFAULT gen_random_uuid(),auth_user_id uuid,status text,role text);
CREATE TABLE project_rooms(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),created_by uuid REFERENCES auth.users(id),title text,kind text,brief text,status text,state jsonb NOT NULL,version integer DEFAULT 1,error text,lock_token uuid,locked_until timestamptz,created_at timestamptz DEFAULT now(),updated_at timestamptz DEFAULT now());
ALTER TABLE project_rooms ENABLE ROW LEVEL SECURITY;
CREATE SCHEMA storage; CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
INSERT INTO auth.users VALUES('${owner}'),('${member}'),('${outsider}');
INSERT INTO trellis_users(auth_user_id,status,role) VALUES('${owner}','active','owner'),('${member}','active','operator'),('${outsider}','active','operator');`,
);
await db.exec(
  await readFile(
    new URL(
      "../supabase/migrations/20261107222523_project_room_shared_prospects.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
const migration = await readFile(
  new URL(
    "../supabase/migrations/20261113140728_project_room_crm.sql",
    import.meta.url,
  ),
  "utf8",
);
await db.exec(migration);
await db.exec(migration);
const room = (await db.query(
  "SELECT * FROM create_shared_project_room($1,$2::jsonb,null)",
  [
    owner,
    JSON.stringify({
      title: "Consulting client",
      kind: "client",
      brief: "Discovery project",
      state: {},
    }),
  ],
)).rows[0];
await db.query("SELECT * FROM change_project_room_member($1,$2,1,$3,false)", [
  owner,
  room.id,
  member,
]);
const contacts = [{
  id: crypto.randomUUID(),
  name: "Alex",
  email: "alex@example.org",
  phone: "",
  role: "Owner",
  notes: "",
  is_primary: true,
  archived: false,
}];
const save = (actor, version, value = contacts) =>
  db.query("SELECT * FROM save_project_room_contacts($1,$2,$3,$4::jsonb)", [
    actor,
    room.client_id,
    version,
    JSON.stringify(value),
  ]);
assert.equal((await save(owner, 1)).rows[0].contacts[0].name, "Alex");
await assert.rejects(() => save(owner, 1), /changed/);
await assert.rejects(() => save(outsider, 2), /not found/);
assert.equal((await save(member, 2)).rows[0].version, 3);
// A second project links to the same company contacts, never a copied contact list.
const linked =
  (await db.query("SELECT * FROM create_shared_project_room($1,$2::jsonb,$3)", [
    member,
    JSON.stringify({
      title: "Second project",
      kind: "client",
      brief: "Second discovery",
      state: {},
    }),
    room.client_id,
  ])).rows[0];
assert.equal(linked.client_id, room.client_id);
await db.exec(
  `UPDATE trellis_users SET status='inactive' WHERE auth_user_id='${member}';`,
);
await assert.rejects(() => save(member, 3), /Not authorized/);
await assert.rejects(() => save(owner, 3, {}), /Invalid contacts/);
await assert.rejects(
  () => save(owner, 3, Array(31).fill(contacts[0])),
  /Invalid contacts/,
);
assert.equal(
  (await db.query("SELECT version FROM project_room_clients WHERE id=$1", [
    room.client_id,
  ])).rows[0].version,
  3,
);
const bucket = (await db.query(
  "SELECT * FROM storage.buckets WHERE id='project-room-files'",
)).rows[0];
assert.equal(bucket.public, false);
assert.equal(Number(bucket.file_size_limit), 20971520);
await db.query(
  "INSERT INTO project_room_files(room_id,created_by,path,name,size,mime_type,category) VALUES($1,$2,'private/original.pdf','Original.pdf',10,'application/pdf','proposal')",
  [room.id, owner],
);
await assert.rejects(
  () => db.query("UPDATE project_room_files SET status='sent'"),
  /check constraint/,
);
await db.exec("SET ROLE authenticated");
await assert.rejects(
  () => db.query("SELECT * FROM project_room_files"),
  /permission denied/,
);
await assert.rejects(() => save(owner, 3), /permission denied/);
await db.exec(
  "RESET ROLE; GRANT SELECT ON project_room_files TO authenticated; SET ROLE authenticated;",
);
assert.equal(
  (await db.query("SELECT * FROM project_room_files")).rows.length,
  0,
  "RLS denies browser reads even with accidental grant",
);
await db.exec("RESET ROLE");
assert.equal(
  (await db.query(
    "SELECT relrowsecurity AND relforcerowsecurity AS secure FROM pg_class WHERE relname='project_room_files'",
  )).rows[0].secure,
  true,
);
await db.close();
console.log(
  "CRM SQL passed: idempotent migration, shared company contacts, stale-save rejection, inactive/outsider denial, private bucket and proxy-only file access.",
);
