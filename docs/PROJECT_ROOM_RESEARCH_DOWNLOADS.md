# Research downloads

The Research and Files pages offer Word (.docx), PDF (.pdf), and Markdown (.md).
Word is the default. Export research downloads the full room research record,
including independent reviews, evidence, decisions, and saved direction in order.
The separate assessment Word download remains available.

The existing authenticated room export action supplies the content. Word and PDF
are generated in the browser; no external conversion service receives room data.
PDF code and fonts load on demand. Controls show preparation progress and errors.

Verification: `npm run test:project-rooms`, `npx tsc --noEmit`, `npm run build`.
Run `node scripts/verify-research-downloads.mjs` to generate synthetic Word/PDF
files in `output/research-downloads` for visual inspection. The UI fixture is
`tests/fixtures/project-room.html?scenario=report`.

Automated checks cover editable Word content, preserved research order, evidence,
tables, safe links, PDF bytes, and empty-input handling. PDF pages were visually
checked. Browser download-event verification was interrupted by unavailable
browser controls and must not be reported as a successful end-to-end test.
