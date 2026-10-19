<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1xhH6r_RnjW_UmSuqCUI_OQtrJoJ2XUGC

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Content intelligence workflow

### Edit existing footage in Clip Studio

Select a branch, open Clip Studio, and choose **Edit a video**. Import a local MP4,
M4V, MOV or WebM (up to 250 MB; the browser must support its codecs). Set a start
and end time, preview that range, optionally add a headline, and choose whether
to keep the original audio. Export MP4, review the resulting video, and download
it plus the separate post caption for manual upload.

This local editor preserves the source framing, limits edits to three minutes,
and exports in real time. Keep its tab visible during export. MP4 encoding must
be supported by the browser; unsupported browsers show an explanation rather
than downloading a mislabeled WebM. The source is unchanged. Files, edits and
exports are session-only and are not saved in the cloud clip library. Leaving
the editor or changing branch clears them. No publishing or scheduling occurs.

Validation: `node --test tests/local-video-edit.test.mjs`, `npx tsc --noEmit`,
and `npm run build`. With Vite running, the isolated editor is available at
`/tests/fixtures/clip-video-editor.html` for real-file import/export checks without
database or AI calls. Test trim boundaries, sound, cancel, unsupported codecs,
invalid ranges, and the exported MP4 itself before release.

### Social Hub idea chat

Select a brand and open Social Hub → Create a post. Use **Suggest what to post next** or message Sage with an idea. Sage uses that brand’s description, tone, keywords, default call to action, and up to 12 recent publishing records from Trellis. Expand **Posts Sage is using** to inspect the context. Native-platform posts not recorded in Trellis and engagement metrics are not included; failed or empty history is explicitly labeled.

Continue the conversation, choose **Prepare a post brief**, edit it, then **Add brief to my notes**. This appends to existing notes; creating drafts and publishing remain separate actions. Chat uses the AI provider configured in Settings. The conversation, unfinished message, editable brief, and notes automatically save per brand in this browser and restore after navigation, brand changes, or refresh. Storage errors are shown beside the affected editor. Saved content is sanitized and remains on this browser/device; clearing browser data removes it. Recent-post context reloads when you return. Leaving during an AI request preserves your unfinished message so you can send it again; a response from the old view is ignored.

To verify locally with Vite running, run `node tests/social-idea-chat-browser.mjs` (Playwright required; optionally set `PLAYWRIGHT_MODULE` and `STUDIO_TEST_URL`). External AI and database requests are intercepted by fixtures.

Start with the plain-language [Content Intelligence operator guide](docs/CONTENT_INTELLIGENCE_GUIDE.md) for what the system does, what each tab means, and the complete day-to-day workflow.

Repository-native schemas, project-partitioned records, task templates, and helper internals live in [`.trellis/README.md`](.trellis/README.md). Every configured branch shares the workflow while keeping topics, posts, performance, and learned strategy separate.
