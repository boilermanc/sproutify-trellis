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

### Social Hub idea chat

Select a brand and open Social Hub → Create a post. Use **Suggest what to post next** or message Sage with an idea. Sage uses that brand’s description, tone, keywords, default call to action, and up to 12 recent publishing records from Trellis. Expand **Posts Sage is using** to inspect the context. Native-platform posts not recorded in Trellis and engagement metrics are not included; failed or empty history is explicitly labeled.

Continue the conversation, choose **Prepare a post brief**, edit it, then **Add brief to my notes**. This appends to existing notes; creating drafts and publishing remain separate actions. Chat uses the AI provider configured in Settings. Conversations remain in memory and reset when leaving the creation view or changing brands; notes stay separate per brand while Social Hub remains open.

To verify locally with Vite running, run `node tests/social-idea-chat-browser.mjs` (Playwright required; optionally set `PLAYWRIGHT_MODULE` and `STUDIO_TEST_URL`). External AI and database requests are intercepted by fixtures.

Start with the plain-language [Content Intelligence operator guide](docs/CONTENT_INTELLIGENCE_GUIDE.md) for what the system does, what each tab means, and the complete day-to-day workflow.

Repository-native schemas, project-partitioned records, task templates, and helper internals live in [`.trellis/README.md`](.trellis/README.md). Every configured branch shares the workflow while keeping topics, posts, performance, and learned strategy separate.
