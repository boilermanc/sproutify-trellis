# Trellis CRM Build Report

Branch: `codex/crm-buildout`

Scope completed August 3–4, 2026. All database access remains in `leadService.ts`; no SQL, migrations, n8n workflows, production writes, or email sends were performed.

## Task status

1. **Done — Lead activity service layer** (`9ec915f`)
   - Added typed lead activity/timeline contracts and service functions in `leadService.ts` and `types.ts`.
   - Timeline reads use the canonical lead ID payload filter; stage-change payloads include `branch_id` and `pipeline_id`.
   - `lead_converted` is emitted only for a non-won → won transition.

2. **Done — Timeline UI** (`4544e34`)
   - Added `components/leads/LeadTimeline.tsx` and wired loading, empty, summary, relative-time, and expandable detail states into `pages/Leads.tsx`.

3. **Done — Log Call / Note / Meeting** (`8abb40c`)
   - Added the shared accessible modal shell and `components/leads/LeadActivityModal.tsx`.
   - Activity save refreshes the timeline and optional follow-up dates update `next_action_at`.

4. **Done — Send Email** (`3a9b538`)
   - Added `components/leads/LeadEmailModal.tsx` and reused the existing `send_resend_email` RPC path through `leadService.ts`.
   - Successful sends log `lead_email`; failures log nothing.

5. **Done — Log Quote** (`0648f8a`)
   - Added `components/leads/LeadQuoteModal.tsx`, estimated-value updates, prominent quote timeline summaries, and accepted-quote mark-won confirmation.

6. **Done — Follow-ups** (`7325246`)
   - Added overdue/upcoming classification and sorting in `components/leads/leadViewUtils.ts`, the Follow-ups tab/count, overdue header chip, row treatment, and a dedicated empty state.

7. **Done — Pipeline board** (`232f99c`)
   - Added `components/leads/LeadBoard.tsx` with stage columns, collapsed terminal stages, farm/org extraction, days-in-stage, drag/drop, and a keyboard-friendly stage select on every card.

8. **Done — Pipeline metrics** (`cf46cfc`)
   - Added `components/leads/LeadMetrics.tsx` using the canonical branch/pipeline dataset.
   - Search/status/stage filters affect displayed counts and value; win rate is labeled `all-time` and always uses all won/lost leads in the selected pipeline.

9. **Done — CSV export** (`1464c28`)
   - Added `components/leads/leadCsv.ts`; exports the current filtered set with profile phone, correct quoting, UTF-8 BOM, and CRLF line endings.

10. **Done — Bulk actions** (`b7f8c1d`)
    - Added `components/leads/LeadBulkBar.tsx` and `components/leads/leadBulk.ts` with sequential stage/lost/recycle updates, progress, and per-row failure continuation.

11. **Done — Dashboard touchpoint** (`8b79182`)
    - Added one batched read-only open-lead count query and rendered nonzero counts on Dashboard branch cards.
    - Existing `marketing_events` activity rendering now labels `lead_created` / `lead_converted` and links them to Leads.

12. **Done — Polish pass** (`crm: polish pass`)
    - Add/Import now use the shared accessible modal; Escape/backdrop close and pending locks are consistent.
    - Added the Follow-ups empty state, completed focused tests, production build, typecheck, and read-only browser smoke.

## Email suppression and consent audit

The one-to-one lead compose check keys off exactly these existing fields:

- `email_suppressions.reason`: exact normalized `bounce` or `complaint` is a hard block. `unsubscribe` contributes to the marketing-unsubscribed warning.
- `profiles.is_subscribed`: `false` shows the amber inquiry-only warning but does not block one-to-one correspondence.
- `profiles.marketing_pause`: `true` shows the same warning but does not block one-to-one correspondence.

Hard-block message: the compose modal explains that the address has a bounce/complaint suppression. Marketing warning: “This contact has unsubscribed from marketing emails; keep this strictly about their inquiry.”

## Verification

- `npx tsc --noEmit`: pass.
- `npm run test:leads`: 23/23 focused tests pass.
- `npm run build`: pass; only the pre-existing bundle-size/dynamic-import warnings remain.
- Live read-only UI smoke against the Hub:
  - Leads and activity timeline loaded.
  - Call, Note, Meeting, Email, Quote, Add, and Import modals opened; required-field submit states were disabled.
  - Escape close passed on the shared modal.
  - Synthetic spreadsheet paste reached preview and was closed before import.
  - Follow-ups empty state, board cards/stage controls, metrics, bulk bar, and CSV export feedback rendered.
  - Dashboard showed `24 open leads` for Sproutify Farm and rendered `Lead created` activity entries.
  - No write-capable action was submitted and no email was sent.

## Deferred / partial

None. No schema change was required, so `PENDING_SQL.md` was not created.

## Foundation

The Leads foundation is represented by `2897346` (service/types/UI/import dependency) and the surgical routing commit `afa694e`. Unrelated workspace files were not staged by the CRM task commits.
