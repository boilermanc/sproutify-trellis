# Consulting client contacts and original files

Companies are the consulting CRM record. Their contacts are shared across all linked
project rooms; each room keeps its own notes, research, proposal/pricing and files.
Consulting contacts are separate from federated marketing profiles and are never
written to spoke databases or automatically enrolled in marketing.

## Contacts

Open a company project → Overview → Client contacts. Add a name, role/job title,
email, phone and notes. Choose one primary contact, then Save contacts. Multiple
contacts are supported (30 including archived contacts). Archive preserves the
contact and Restore returns it to the active list. Archiving clears its primary
designation. Company search also matches active contact names, emails and phones.

Unsaved changes are labeled. Save before navigating away. Failed saves preserve
the editor; a stale save cannot overwrite another teammate's changes. Discard edits
and reload contacts retrieves the saved company record. This discards unsaved edits.
Company follow-ups, prospect/customer status and the existing Sales pipeline remain
available alongside contacts. Editing contacts does not change pricing or send email.

## Original proposals and files

Open the relevant project → Files → Original project files. Select Proposal,
Contract or Other, then Upload original file. PDF, DOC/DOCX, TXT, Markdown,
PNG and JPEG are supported, up to 20 MB each. The original bytes and formatting
are retained. Reuploading a new version creates a separate record with its original
filename and upload date; existing files are never overwritten. Download retrieves
the original file. Older files can be loaded from the list.

An interrupted upload stays visible as Upload unfinished. Use Retry upload with
the same original file if transfer failed; use Finish saving if transfer succeeded
but completion was interrupted. Do not create another upload simply to retry.
Files are retained; this increment has no delete operation.

Original uploads do not run research, affect the internal estimate, approve a quote,
send a proposal or share a public link. Use Supporting documents separately when
you explicitly want extracted text included in a later research round.

## Storage and authorization

The existing active Trellis operator and room-membership checks run before file
operations. Contacts are saved through a service-only, version-checked company RPC
that checks membership in a linked room. Contacts are company-wide, so a teammate
with access to any of that company's rooms can read/edit company contacts. Files
are room-specific: access to another project for the company does not grant access
to that project's files. Contact data and original files are not automatically added
to AI handoffs, room exports, Slack messages, or daily reports.

`project-room-files` is private, with no browser storage policies. Metadata uses a
service-only RLS table. The proxy issues a non-overwriting signed upload path and
checks stored size/content type before marking it ready. Download links expire
after 60 seconds; upload capabilities expire after Supabase's two-hour window.
Already-issued links remain usable until expiration even if access is revoked.
File size/type checks do not constitute malware scanning; downloads are attachments.

## Local verification and release

- `npm run test:project-room-crm`: contact/file validation and mocked upload lifecycle.
- `node tests/project-room-crm-sql.mjs`: isolated PostgreSQL migration applied twice,
  shared contacts, stale saves, inactive/outsider denial, grants and RLS. Requires
  temporary `@electric-sql/pglite@0.3.14` under `node_modules/.crm-verification`.
- `npm run test:project-rooms`, `npx tsc --noEmit`, `npm run build`.
- `deno check --no-config --node-modules-dir=none supabase/functions/project-rooms/index.ts`.
- With Vite on port 3018, `node tests/project-room-crm-browser.mjs`. Set
  `PLAYWRIGHT_MODULE` and `CHROMIUM_EXECUTABLE` when using a bundled browser runtime.
  Synthetic fixture requests cover contact save failures, archive/restore/search,
  reload persistence, failed transfer/completion recovery, exact original download,
  desktop/mobile layouts and page errors. They do not prove hosted Storage behavior.

This checkout has unrelated untracked release copies under `tmp/` that the default
TypeScript configuration discovers. A local `output/tsconfig.crm.json` extending
the repository configuration can exclude `tmp/` and `output/` alongside its normal
exclusions to check the application without those copies. Do not ship generated
release copies or change them to silence type errors.

Deployment and remote database writes require explicit approval under AGENTS.md.
Resolve the root repository through Switchboard; intended hub is
`horvjqqifgrzxesuxtfm`. The release checkout is `.project-room-release`, which does
not itself have a Switchboard registration. Use the registered root routing with
the release checkout as the CLI workdir. Do not associate it with another project.
Capture current frontend/function versions and company/room counts and checksums before
applying `20261113140728_project_room_crm.sql`. Preserve existing records in place;
copying private client data into a local backup requires separate approval.
Deploy `project-rooms` and the matching
frontend together, preserving the function's existing gateway/internal auth setup.
The master Schema Engine includes the same migration as its authoritative source.

After approval and release, verify with real signed-in teammates: contacts across
two linked rooms, outsider/revoked access denial, a real PDF and Word upload/download
with matching bytes after sign-out/reload, unfinished-upload recovery and existing
research/proposal/follow-up behavior. No client proposal or contact was added by
the local tests. Recovery is restoring prior frontend/function versions while keeping
the additive contacts, file metadata and private bucket intact. Never drop saved
contacts or files as a rollback shortcut.

Design lesson: CRM contacts belong to the company; original documents belong to the
project. Preserve upload state independently of research leases and versioning, and
keep original-file storage separate from consented text extraction.

## Release on November 13, 2026

The CRM release is based on live frontend revision `ed97e55`, preserving its
November 11 profile/subscription/collection changes. Its only new functionality
is client contacts and original project files. Other unfinished edits in the
main working folder are excluded.

Migration `20261113140728_project_room_crm` was applied to the Switchboard-selected
Trellis hub. The local filename matches the recorded hosted migration version.
`project-rooms` backend version 38 includes the CRM handler and preserves internal
authentication plus `verify_jwt=false`. All pre-existing deployed backend files
matched the release baseline before the CRM additions.

All 7 existing company records retained their original field checksum
`ea404a942d356b1882b9df8fc455200e`; the 13 existing rooms retained research checksum
`d782d4f78af66048081a94cbcd38efa9`. New contacts start empty. The file bucket is
private, metadata RLS is enabled/forced, and browser roles cannot read the metadata
table or invoke the contact-saving RPC directly. Automatic approval review rejected
a proposed full local client-data backup; none was created. Recovery evidence uses
non-content counts/checksums and copies of the prior backend source/public frontend
entry page under local untracked `output/crm-release-backup/`.
