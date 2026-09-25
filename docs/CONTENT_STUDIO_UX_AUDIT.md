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
| Creative Studio | Existing format-to-generation wizard retained. Scoped review queue; saved library collapsed. |
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
