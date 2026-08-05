import { ViewState } from '../../types';

// "What is this page for?" copy shown via PageInfoTooltip next to the page
// title in Layout.tsx. Every nav destination gets an entry except the ones
// that are either self-explanatory (Settings, Help Center, User Profile,
// Team) or already explain themselves (Dashboard, Intelligence).
export const PAGE_INFO: Partial<Record<ViewState, string>> = {
  profiles:
    "A federated, cross-spoke customer directory. Every profile here is read live from the connected spoke databases (ATL Urban Farms, Farm, School, etc.) and merged into one Golden Record by email — nothing is copied or stored locally. Use it to see a customer's full history across every site they've touched, check their consent per brand, and open their order and engagement history.",

  leads:
    "Tracks prospects who haven't converted into paying customers yet — inquiries and sign-ups that live only in Trellis, not federated from a spoke. Use it to run a pipeline: log where a lead came from, move them through stages, and follow their timeline before they graduate into a Profile.",

  segments:
    "A rule-based audience builder over the federated profile data (order value, LTV, location, engagement, and more), with ready-made presets plus your own saved segments. Use it to define an audience once, then send it straight to Campaign Builder instead of rebuilding the same filter every time you launch.",

  branches:
    "Where each ecosystem spoke site (ATL Urban Farms, Farm, School, Rekkrd, etc.) is registered — its connection, API keys, brand colors, and linked social accounts. Use it to add a new spoke, confirm a connection is live, or update a brand's identity so the rest of Trellis references it correctly.",

  'campaign-builder':
    "The step-by-step wizard (Scope → Identify → Compose → Schedule → Deploy) for building and sending a campaign to a federated audience. Use it whenever you need to reach a specific slice of customers — pick the audience, write or select a template, then send now or schedule for later; sends run through a durable, retryable queue.",

  campaigns:
    "The send history and status board for everything launched from Campaign Builder — real delivery, open, and click stats per campaign, plus exactly who received it. Use it to confirm a campaign actually went out, review engagement, or retry just the recipients that failed.",

  'email-preview':
    "A device-preview sandbox for onboarding and welcome emails — see how a template renders on mobile versus desktop for a real profile before anything gets sent. Use it to sanity-check layout and copy changes without waiting on a live send.",

  'marketing-wizard':
    "A guided AI wizard (Setup → Research → Content → Email → Review) that drafts an entire mini-campaign for one brand in one pass — positioning research, a lead magnet, ad copy, and an email nurture sequence. Use it when you want AI to rough out a full campaign concept instead of building each piece separately.",

  tasks:
    "A lightweight checklist tied to your campaigns — due dates, priority, and status. Use it to keep the human side of a launch (approvals, asset requests, follow-ups) organized alongside the campaign itself.",

  'social-hub':
    "An AI content lab for Facebook, Instagram, X, and LinkedIn: generate on-brand post copy, plan it on a content calendar, and export it — text plus images — ready to paste into Meta Business Suite. It's intentionally content-only and doesn't auto-publish, so use it to plan and write your social calendar, then post manually on the day (or send finished creative to Post Scheduler for platforms that do publish automatically).",

  'reddit-growth':
    "A dedicated workspace for Reddit ad campaigns — AI-drafted strategy (objective, target communities, budget), creative generation and review, and performance tracking, all in one place. Use it to plan and manage Reddit-specific paid campaigns separately from organic Social Hub content.",

  'video-ad-lab':
    "A format-aware AI creative generator for video, static image, and carousel ads — write a brief and get AI-generated frames and copy back for review, approve or regenerate, then publish to Instagram or export straight to Meta Ads Manager. Use it any time you need ad creative fast, with a human approval gate before anything ships.",

  'post-scheduler':
    "Bulk upload-and-schedule for creative you already have (not AI-generated) — drag in images or video, write captions, and set publish times; a background worker actually publishes them to Instagram and Facebook on schedule. Use it when the creative is ready and you just need it queued and delivered on time.",

  'card-studio':
    "An AI creative director paired with a canvas renderer for designed, typographic social posts — verse cards, bold statement cards, and stat or quote grids — the layouts that photo-generation models can't render correctly. Use it for scripture, quote, and other text-forward posts; approve a concept and it drops straight into the publishing queue.",

  'ad-performance':
    "Import your Meta Ads Manager results and see them matched back to the exact creative that ran — a leaderboard of which templates, headlines, and angles actually perform, per brand. Use it to close the loop on paid spend: decide what to kill, scale, or remake based on real numbers.",

  'post-performance':
    "The organic counterpart to Ad Performance — joins your published, non-paid Instagram posts back to the Card Studio template and rationale that produced them, so you can see which layouts and angles actually earn saves and shares. Use it to learn what your organic content is doing right before you spend money amplifying it.",

  'clip-studio':
    "Turns source material — a URL, pasted text, or files — into a scripted, AI-storyboarded YouTube Short: script generation with fact-checking, a B-roll beat planner, automated rendering, and publish. Use it to produce short-form video without manually writing a script or hand-assembling footage.",

  'trellis-studio':
    "The AI music production workspace — plan a multi-track session, generate each track, review and approve them individually, then stitch the approved tracks into one finished master. Use it to produce original background or theme music for episodes, ads, or anything else that needs a soundtrack.",

  'studio-albums':
    "A full album production pipeline built on Trellis Sessions — plan an entire release (tracks, cover art, release video, and metadata like catalog number and credits), review each piece, and prepare it for publishing. Use it when you're producing a complete music release rather than a single background track.",

  'trellis-episodes':
    "The top-level AI content production pipeline — an Episode carries a piece of content through music, mastering, artwork, video, metadata, and publishing, with a review gate at every phase. Use it to turn a finished session or other source asset into a fully produced, publishable episode.",

  'brand-intelligence':
    "Where each brand's voice and tone live, and where the custom email templates your campaigns send are created (Campaign Builder only reads them). Use it to define how a brand should sound before generating content, or to build and edit the templates behind your sends.",

  'marketing-brands':
    "The brand identity record for each spoke — industry, target audience, tone, value proposition, contact details, and brand color. Use it to keep one canonical definition of a brand that AI tools (Marketing AI, Reddit Ads, Creative Studio) pull from, so every AI-written piece of content stays on-brand automatically.",

  'platform-wizard':
    "Connect each brand's social accounts — Instagram, Facebook, X, LinkedIn — via OAuth, and see a live dashboard of which platforms are connected, pending, or missing for every brand. Use it the first time you set up a brand's social presence, or to test and reconnect a connection that's gone stale.",

  automations:
    "A monitor and builder for the n8n workflows that power Trellis's backend automation — the webhooks that ingest spoke events, dispatch campaigns, and more. Use it to see what automation is wired up and whether a given flow is active; most actual editing happens in n8n itself.",

  'dev-tools':
    "Developer-facing utilities: the full database Schema Engine for standing up a new Supabase instance, Data Hygiene controls for the hot/cold event archive and purge job, and the Dead Letter Queue for webhook events that failed to process. Use it to troubleshoot sync failures or confirm data retention is working.",

  'knowledge-base':
    "A multi-site content library that feeds Sage, the AI assistant, with reference material it can cite when answering questions. Use it to give the AI accurate, current context about your business instead of letting it guess.",

  reports:
    "The analytics home for the whole ecosystem — audience growth, real campaign email performance, YouTube, product, and content-pipeline metrics, in one tabbed view. Use it as your regular check-in to see what's actually working across every channel, not just one.",

  'support-hub':
    "A ticket queue with AI-assisted triage — it drafts suggested replies with a confidence score and flags a customer's subscription and consent state so you don't accidentally follow up with someone who's opted out. Use it to manage inbound customer support without leaving Trellis.",
};
