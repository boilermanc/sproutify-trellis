# Studio Albums Follow-ups

## 2026-08-25 — Artwork, motion, and YouTube subscribe UX

Status: recorded for later; do not change the current release today.

### 1. Approving an image unexpectedly creates a new image

Observed behavior:
- The user selected a good image and chose the image approval action.
- Trellis then produced a different image instead of approving and preserving the selected asset.
- The replacement happened to be good this time, but generation during approval is not the intended behavior.

Expected behavior:
- Approving an image must only mark that exact selected asset as approved.
- It must not call image generation, enhancement, extension, or video-source creation.
- If a separate 16:9 video image is required, Trellis must explain that as a new, separately initiated step and preserve the approved square cover.

Verification for the future fix:
- Capture the selected asset ID before approval.
- Approve it.
- Confirm the approved asset ID is unchanged and no new `cover_art` or `video_source` asset was created by the approval action.

### 2. Ken Burns / slow-motion option appears ineffective

Observed behavior:
- The video render UI offers a slow Ken Burns-style motion option.
- The completed video appears static or the movement is too subtle to notice.

Investigation points:
- Verify `visualMotion` reaches `prepareStudioVisualProduction`, the Edge Function webhook payload, and `workers/video_worker.py` as `ken_burns`.
- Confirm the deployed video worker contains the expected `zoompan` filter and is not an older worker build.
- Compare frames at the beginning, 30 seconds, midpoint, and end of a test render.
- Revisit the current zoom rate and maximum zoom; make the effect visibly gentle rather than imperceptible.

Definition of done:
- A rendered proof shows measurable frame-to-frame movement while keeping the image sharp and avoiding distracting motion.

### 3. Subscribe prompt around 15 minutes

Recommended approach:
- Use YouTube's channel video watermark with a custom start time of `15:00` for the real YouTube-managed channel link.
- This is a channel-level setting and can be configured in YouTube Studio under **Customization → Profile → Video watermark**.
- Trellis can later automate it with the YouTube Data API `watermarks.set` method using the connected channel OAuth authorization, a square watermark image, `offsetFromStart`, and a 900,000 ms offset.

Important limitations:
- The watermark applies at the channel level, not uniquely to one uploaded video.
- YouTube reports that the watermark is not clickable on mobile.
- A YouTube Subscribe end-screen element is only available during the final 5–20 seconds.
- Trellis can additionally burn a tasteful “Enjoying the session? Subscribe to Rekkrd” animation into the video around 15 minutes, but that visual overlay would not itself be clickable.

Possible future Trellis controls:
- Enable channel watermark.
- Upload/select the square watermark artwork.
- Start time, defaulting to 15:00 for long-form listening videos.
- Optional on-video CTA animation with start time and duration.
- Optional end-screen-safe final 20 seconds reserved in the render.
