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

Start with the plain-language [Content Intelligence operator guide](docs/CONTENT_INTELLIGENCE_GUIDE.md) for what the system does, what each tab means, and the complete day-to-day workflow.

Repository-native schemas, project-partitioned records, task templates, and helper internals live in [`.trellis/README.md`](.trellis/README.md). Every configured branch shares the workflow while keeping topics, posts, performance, and learned strategy separate.
