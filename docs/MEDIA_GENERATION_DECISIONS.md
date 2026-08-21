# Media Generation Decisions

This is the running decision and deferred-question list for Trellis GPU generation. The new layer is additive first. Existing working tools remain available until a replacement path has passed side-by-side validation.

## Keep now

- Clip Studio's source ingest, transcript/clip selection, composition, Remotion rendering, review, and publishing handoff.
- Episode and Studio Album deterministic video assembly, audio mastering, artwork review, metadata, and YouTube publishing.
- Existing commercial video providers as fallbacks while LongCat quality, latency, reliability, and true cost are measured.
- Existing reusable UI patterns for job polling, progress, review galleries, retry, cancellation, and private signed assets.

## Migrate into the new layer

- Video Ad Lab's AI motion/video generation should submit `media_generation_jobs` instead of generating a browser-side job ID and firing an unauthenticated n8n webhook.
- Talking-head/avatar creation should become the first LongCat Avatar 1.5 consumer. Character images and driving audio become reusable private `media_assets`.
- Clip Studio may later request generated B-roll through this layer, but its editing/render pipeline remains the consumer of those outputs.
- Studio Albums and Episodes may later request scene loops or generated inserts through the layer; their final assembly and publishing remain unchanged.
- Provider-specific status, retry, cost, and identifiers move into `media_generation_attempts`; Trellis-facing jobs keep one normalized lifecycle.

## Replace after validation

- Browser writes to orchestration tables and public media buckets.
- Fire-and-forget webhooks that cannot reliably report acceptance or dispatch failure.
- Duplicated pollers and provider-specific status names in each video feature.
- Provider credentials or direct provider calls in browser code.
- Non-atomic queue claims and jobs that have no attempt/event history.

## Do not replace

- Clip Studio itself. GPU generation is a source option, not an editor replacement.
- Remotion/FFmpeg assembly where deterministic rendering is the right tool.
- Human review, approval, publishing, campaign analytics, or the content-planning workflows around the generated asset.

## Decisions made for the foundation

1. RunPod Serverless is the first provider adapter; `provider` remains data, not a hard-coded product assumption.
2. LongCat base and LongCat Avatar 1.5 are separate catalog entries and may use separate RunPod endpoints/images.
3. All model/provider credentials stay in Supabase Edge Function secrets.
4. Inputs and outputs live in a private bucket and travel to workers through short-lived signed URLs/tokens.
5. Authenticated clients can read allowed project data; mutations go through the Edge Function. Project owners submit/cancel/retry in the first release.
6. Every provider submission creates an immutable attempt and events; a retry does not erase previous failures.
7. Avatar 1.5 enforces distillation's eight inference steps. The initial runtime assumption is two GPUs with context parallelism 2 and INT8 enabled.
8. Existing tools are migrated individually only after side-by-side results meet acceptance criteria.
9. Completed outputs appear in one **Created media** library with private previews, provenance, measured cost, approval state, and publishing history.
10. Human approval is required before a generated output can enter the publishing queue.
11. Generated video reuses `scheduled_social_posts` and the existing n8n publisher instead of creating a second publishing engine.
12. Instagram Reels and TikTok video are the first publishing destinations. Facebook video remains disabled until its current publisher accepts video.
13. Private generated media is resolved through a service-role-only database function and signed for one hour only after the scheduler has atomically claimed the post.
14. Generation dispatch and publishing handoff remain separate circuit breakers. Enabling publishing does not enable RunPod generation.

## Deferred, not blocking foundation work

- Exact RunPod GPU type and whether base LongCat is best on one 80 GB GPU or two lower-VRAM GPUs.
- Network-volume mount layout and cold-start target after measuring weight load times.
- Whether Avatar's two-GPU requirement is operationally reliable enough on RunPod Serverless or needs a dedicated pod/provider.
- Per-branch quotas, approval thresholds, and chargeback rules.
- Default quality presets (480p fast, 720p refined, duration/segment limits).
- Which commercial provider remains the production fallback.
- Retention period for source assets, failed outputs, logs, and provider response snapshots.
- Facebook video support in the existing publisher.
- Production merge/deployment of the Trellis frontend workspace.

## Access status for the deployment/benchmark phase

- RunPod, Supabase, GitHub repository-build, and n8n deployment access are available.
- The base RunPod endpoint remains scale-to-zero with a one-worker maximum and no active GPU workers.
- Still needed only when testing Avatar or gated weights: a Hugging Face token if the selected repository requires it.
- Still needed for the benchmark: a small approved reference pack with consented character images, short audio clips, image-to-video source frames, and continuation clips.
