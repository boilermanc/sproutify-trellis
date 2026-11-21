# Creative Studio video workflow

The video flow saves the user's edited script, creates a still frame, and stops at `awaiting_approval`. **Approve & Render** records approval of that exact frame and script before calling the separate video render webhook. The render uses Kling 2.6 Pro image-to-video with native speech and ambient audio enabled. Talking Head requests synchronized dialogue; Full Scene requests offscreen narration. Generated speech still needs human review for pronunciation and fidelity.

## Source files

- `n8n-blueprints/Trellis-Video-Ad-Frame-v1.json`: Frame v2, `POST /webhook/trellis-video-ad-generate`.
- `n8n-blueprints/Trellis-Video-Ad-Render-v1.json`: Render v2, `POST /webhook/trellis-video-ad-render`.
- `services/videoAdService.ts`: script validation and conditional frame approval.
- `pages/VideoAdLab.tsx`: 5/10-second duration selection, editable spoken script, frame approval UI.

Kling accepts 5- or 10-second clips. Scripts are limited to 8 or 19 words respectively to leave room for natural speech; scripts are rejected rather than silently truncated. PII sanitization remains in the submission path. Old incoming duration values normalize to 10 seconds in the frame workflow.

The render request must match the saved `frame_url` and `frame_approved_at`. Rendering also requires status `rendering`, progress 50, a script, and no completed video or archive timestamp. A conditional database claim advances progress to 55 before submitting to Fal. Duplicate or stale requests cannot start another render through this path.

## Published n8n workflows (2026-10-10)

- Frame v2 replaces generator `tNMhFw4YviAlufIm` and is published.
- Render v2 is published as `3mSfZKKegEUC0QvoaBnxj`.
- Existing Supabase, Gemini, and Fal credential references were reused. Credential values are absent from the blueprints.
- Original generator export is backed up locally in `C:/Users/clint/Downloads/Trellis Video Ad Generator v5 (1).json`.

Both workflows were published after explicit user authorization. Local verification did not execute paid generation; a live verification follows deployment of the matching app.

## Release and recovery

Publish Render v2, deploy the matching app update to `https://trellis.sproutify.app`, then publish Frame v2 at the existing generate endpoint. Coordinate this as one release: the old app does not send the new frame-approval payload. The supported app deployment is `.github/workflows/deploy.yml`, triggered by a push to `main` or manual dispatch of an already pushed revision. Commits, pushes, deployment, and workflow publication require authorization.

Existing Hub fields and the public `episode-assets` bucket were checked read-only. No database migration is required for this video fix. The separate archive feature needs its own unapplied migration.

After release, create one video, confirm the frame waits for approval, inspect the saved script, approve the frame, and listen to the downloaded finished clip. Provider audio quality and real credential execution have not yet been verified. If release fails, restore the old app build and republish the prior generator version using n8n history or the local backup; deactivate Render v2. Retain existing job records and assets.

## Verification

Passed locally: `npx tsc --noEmit`, `npm run build`, `node --test tests/creative-video-workflow.test.mjs`, and `node tests/creative-studio-ideas-browser.mjs`. The browser fixture covers saving edited words, duration, no rendering before approval, and sending the exact approved frame/timestamp. Remote requests are intercepted; it does not assert that a real model produced audible speech.

Operational lesson: inspect the published n8n graph before changing the app contract. Importing into a nonempty n8n canvas appends nodes; replace the draft canvas deliberately and verify node names and connections before saving.
