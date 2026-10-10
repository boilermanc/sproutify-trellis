# Content Studio workflow audit

## Shared behavior

- Every branch-dependent section opens with no branch selected and one short next-action card.
- The header is the only branch selector. Its selection scopes creation, saved work, reports, and publishing.
- Leaving and returning to a section starts a new selection; it does not inherit the global all-branches scope.
- Changing branches remounts the workspace. Input/select edits and explicit programmatic draft edits trigger a conservative leave confirmation.
- Branch-independent tools hide the header filter: Transcriptions are owner-private; Albums are organization-wide.
- Never introduce a default first branch or a second page-level branch selector. Add future Studio destinations to services/contentStudioViews.ts.

## Sections reviewed

| Section | Starting flow and disclosures |
| --- | --- |
| Social Hub | Describe post, choose platforms, create drafts. Media import expands on demand; review/calendar/inbox are separate. |
| Content Intelligence | Brief action for an empty project; long cluster/question references collapsed. Developer footer only in guide. |
| Reddit Ads | Offer/evidence first, generated strategy review next. No empty metrics or saved-strategy sidebar. |
| Creative Studio | See the three most recent creatives and three suggested ideas for the selected brand. Use an idea to choose its format and fill the brief, or choose your own format. Video briefs also start with active Brand DNA: introduction, audience, voice, and website CTA when available. Missing DNA permits manual entry. Scoped review queue; saved library collapsed. |
| Media Generation | Choose/create project first. Model, prompt, cost review appear afterward; optional text/help/spend information collapsed. |
| Motion Posts | Image, post details, review/animate are separate steps. Library separate from creation. |
| Promo Studio | Title/intent first, scoped project list, existing guided next action. Production checklist collapsed, empty audio review hidden. |
| Post Scheduler | Upload first; dates/captions follow media. Queue follows header branch and is hidden when empty. |
| Card Studio | Brief/preset first, optional style settings collapsed, concepts appear after generation. |
| Ad Performance | Branch-matched CSV import first; leaderboard/advisor appear with results. Excluded unmatched/foreign rows reported. |
| Post Performance | Useful selected-branch empty state; advisor only with measured posts. |
| Clip Studio | New short, one source method at a time, then production options. Empty library statistics hidden. |
| Transcriptions | Upload first, settings after file, editor only with selected transcript. |
| Trellis Sessions | New session, preset/title, optional sound/length settings, review plan before audio. |
| Studio Albums | Library, new album, and selected workspace separated; current production step highlighted. |
| Trellis Episodes | New episode, music first, later production panels revealed as assets become available. Analytics only after publication. |

## Verification

- npx tsc --noEmit: passed.
- npm run build: passed (existing chunk-size, dependency import, Tailwind scan, and Browserslist warnings).
- Fixture browser suites exercise actual App/Layout entry/selection/reset/navigation and all changed production/social/visual pages; desktop and mobile checks passed. All remote calls are intercepted. No paid generation, publishing, or live database changes were performed.
- Full Node regression run: 676 tests, three initial failures. The dashboard review-link contract was updated for explicit header selection and passes. The remaining two assertions are pre-existing in unchanged SageChat/mobile and CampaignBuilder/cohort code.

### Browser reproduction

Start npm run dev on port 3000. With Playwright installed locally, run npm run test:content-studio-browser. Otherwise set PLAYWRIGHT_MODULE to the absolute path to its index.mjs. STUDIO_TEST_URL overrides the local URL.

The fixtures use synthetic branches and records. They verify UI control flow and scope, not external provider availability or completed media production.

Run `node tests/creative-studio-brand-browser.mjs` with the same browser setup to check saved Brand DNA defaults, delayed loading without overwriting edits, missing/error fallbacks, wizard progression, and mobile layout. Defaults use null overrides so intentionally cleared fields stay empty; branch changes use the shared workspace remount to discard the previous branch's brief.

### Creative Studio ideas

- All brands use the same workflow, including newly configured branches. Suggestions use the selected branch's active Brand DNA and up to six recent Creative Studio jobs. The history strip shows the latest three; Card Studio backgrounds are excluded. Created dates and saved publication states are displayed separately: completed generation is still a draft until publication is recorded.
- Gemini writes three directions (video, static image, carousel), each with a hook, brief, and rationale. Ideas are experiments; this first version does not incorporate performance results, trend research, or Content Intelligence opportunities. Historical copy is treated as inspiration, not verified brand facts.
- Suggestions load once when brand/history reads finish. Navigating the wizard and polling jobs reuse them. Refresh ideas explicitly takes a fresh context snapshot; branch changes cancel stale requests. Missing AI configuration, malformed output, and provider errors fall back to three clearly labeled starter ideas.
- Use this idea fills the relevant format's brief and keeps it editable. It marks the draft as changed and confirms before replacing existing edits. It never starts media generation, schedules, or publishes. No new database tables or writes are needed.
- Verification: `npm run test:creative-ideas` covers scope, sanitization, history states, and response validation. `npm run test:creative-ideas-browser` uses the browser setup above to exercise the actual page, Brand DNA reader, Gemini adapter, all format handoffs, branch switching, failures, and mobile layout with intercepted external requests. These checks, the original Brand DNA browser regression, TypeScript, and the production build passed locally. Live Gemini output quality and production data access remain unverified.

### Archive saved creatives

- Each library row has an Archive button beside its details. Failed, cancelled, review-ready, completed, and published creatives can be archived. Jobs still generating or scheduled/publishing are blocked. Archiving preserves assets, cost, publication state, and performance links; it does not remove a published social post.
- Archived creatives are hidden from the regular library, review queue, recent history, and future idea context. Select Archived, then Restore to bring one back with its original status. The existing library fetch window is the latest 100 jobs for the selected branch, including archived jobs.
- Mutations match the branch, original generation/publication states, and previous archive timestamp. Permission errors or stale records leave the row visible and report an error. Missing schema produces an explicit migration-required message; ordinary reads still work before migration.
- **Release prerequisite:** apply `supabase/migrations/20261010140812_creative_studio_archive.sql` to the Switchboard-selected Trellis hub (`horvjqqifgrzxesuxtfm`) with explicit authorization before using Archive in production. This adds nullable `archived_at` and a partial index; existing rows remain unarchived. The master schema in `constants.ts` includes the same change. No migration was applied during implementation.
- Recovery: restore archived rows through the UI. The migration does not delete rows or media; an application rollback can leave the additive column/index in place. Existing table access policies are preserved.
- Run `npm run test:creative-archive-browser` with the browser setup above. Its database fixture verifies archive, reload, restore, status preservation, branch scope, scheduled/active guards, failed writes, and mobile/keyboard access without changing live data. Live migration execution and permissions must be verified during the authorized release.

### Preserve the selected creative format

Creative Studio shows Creating: Video, Image, or Carousel throughout the draft steps (Reviewing on the review step). The format picker appears before starting ideas, and Change format explicitly returns to it. All three AI suggestions and starter fallbacks match the chosen format; response validation rejects mismatched formats. Use this idea fills only that format’s brief and never changes the format. Suggestions remain available on the message step, are refreshed when the format changes, and ignore late responses from the previous format. Recent history continues to include all formats for the selected brand.

Verification: `npm run test:creative-ideas` and `npm run test:creative-ideas-browser` cover each format, malformed/wrong-format AI output, navigation without duplicate generation, and stale responses after brand/format changes. This UI fix requires no database migration.
