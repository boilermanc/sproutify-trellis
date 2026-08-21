# Media Generation deployment and benchmark gate

Do not route existing production video features into this layer until this gate passes. The local implementation compiles and its contracts are tested; the migration, function, image, weights, and GPU runtime have not been deployed from this branch.

## Required access

1. Supabase access that can apply migrations, deploy Edge Functions, create/update Storage buckets, and set function secrets.
2. RunPod access that can create a network volume, build or pull a private container image, create Serverless endpoints, and read per-job execution/cost data.
3. GitHub authorization for RunPod's repository build integration (RunPod stores the resulting image in its managed registry).
4. Hugging Face access for downloading the LongCat base and Avatar 1.5 weights onto the network volume. Do not put a Hugging Face token in the image.
5. A consented benchmark pack: still images, speech audio, source images, and short source videos that may be sent to the selected GPU infrastructure.

## Supabase deployment

Apply `20260821170735_add_media_generation_foundation.sql`, then deploy the `media-generation` Edge Function. Configure these Edge Function secrets:

- `RUNPOD_API_KEY`
- `RUNPOD_LONGCAT_VIDEO_ENDPOINT_ID`
- `RUNPOD_LONGCAT_AVATAR_ENDPOINT_ID`
- `RUNPOD_COST_PER_SECOND` only after the endpoint's actual blended rate is known
- `MEDIA_GENERATION_ENABLED=false` until the benchmark operator deliberately opens the circuit breaker
- `MEDIA_GENERATION_ALLOWED_ROLES=owner,admin`
- `MEDIA_GENERATION_MAX_ACTIVE_PER_USER=1`
- `MEDIA_GENERATION_MAX_DAILY_DISPATCHES_PER_USER=3`
- `RUNPOD_EXECUTION_TIMEOUT_MS=3600000`
- `RUNPOD_JOB_TTL_MS=7200000`

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are supplied by the hosted Edge Function environment. The service-role value must never be exposed to the browser or worker.

After migration, verify that authenticated users have read-only table grants, all media tables have RLS enabled, the new bucket is private, and a user cannot read another user's personal project or object.

## RunPod endpoints

Build `workers/longcat-serverless/Dockerfile` and publish it to the registry. Mount one network volume at `/runpod-volume` containing both sibling weight directories documented in the worker README.

Create separate endpoints:

- Base endpoint: start with one 80 GB-class GPU, Flex workers, minimum workers 0, execution timeout long enough for a cold weight load plus generation.
- Avatar endpoint: start with two visible GPUs, context parallelism 2, Flex workers, minimum workers 0. Confirm RunPod schedules both GPUs into the same worker before running Avatar.

Keep active workers at zero during the proof of concept. Do not set a permanent warm worker until cold-start measurements justify the idle cost.

## Cost circuit breakers

The Edge Function is fail-closed: provider dispatch is disabled unless `MEDIA_GENERATION_ENABLED` is explicitly true. The proof-of-concept defaults also restrict dispatch to owners/admins, one active job per user, three dispatch attempts per UTC day, two attempts per job, and a one-hour provider execution timeout. A partial unique index prevents two active jobs for the same user even if requests race.

RunPod must remain at zero active workers, one maximum worker, one GPU per base worker, and Auto-Pay disabled during the proof of concept. The endpoint-level worker maximum is the infrastructure backstop if application requests race or a caller bypasses the Trellis UI. Do not increase any limit until usage-ledger and RunPod billing records agree for the benchmark set.

## Acceptance tests

Run at least three jobs for each supported mode:

- Text to video
- Image to video
- Video continuation
- Avatar 1.5 image plus speech audio

For every run, capture queue delay, cold-start/load time, inference time, total billed seconds, GPU type/count, peak VRAM, output duration/resolution, output file size, and estimated/actual cost. Also verify cancellation during queue and inference, a provider failure, one retry, signed URL expiry, duplicate idempotency handling, and cross-user access denial.

The proof of concept passes only when outputs reliably upload to the expected private path, terminal status reaches Trellis without manual database edits, failures remain diagnosable, and cost is predictable enough to show before submission.

## Migration gate for existing tools

After the benchmark passes, integrate one low-risk consumer first—recommended: an optional Talking Character path inside Creative Studio. Keep the current provider alongside it. Compare at least quality, latency, cost, and failure rate before making LongCat the default. Clip Studio, Episode assembly, Studio Album rendering, approvals, and publishing stay unchanged.
