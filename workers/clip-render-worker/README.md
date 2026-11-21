# Trellis Clip Render Worker

Renders Clip Studio B-roll beats, stitches final Shorts, and creates text-finished
copies of generated media. Polls `media_finishing_jobs` and
`trellis_clip_render_jobs` on the Hub Supabase —
no inbound port needed, so it can run on the VPS or any laptop.

## How it works

1. The Clip Studio UI queues rows in `trellis_clip_render_jobs` (status `queued`).
   Media Generation queues private post-generation text jobs in `media_finishing_jobs`.
2. This worker claims the oldest queued job (status → `running`):
   - **`beat`** — loads the beat's `beat_type` + `template_params`, renders the matching
     Remotion template at 1080x1920@30 for the beat's duration, uploads to
     `clip-assets/{project_id}/beats/{beat_id}.mp4`.
   - **`assemble`** — downloads `payload.clip_urls` in order, ffmpeg-concats them, uploads
     `clip-assets/{project_id}/final.mp4`, and sets the project's `final_video_url`.
3. Job row gets `completed` (+ output_url, dims, QA chips) or `failed` (+ error).
   The UI polls every 5s while jobs are in flight.

For `media_finishing_jobs`, the worker signs the private original immediately before
rendering, burns the editable timing and font plan into a new private MP4, registers
it as a `finished` media output, and leaves the original unchanged.

## Setup

```bash
cd workers/clip-render-worker
npm install            # downloads Remotion + a headless Chrome for rendering
```

ffmpeg + ffprobe must be on PATH (already true on the VPS for the episode workers).

## Run

```bash
# Windows (PowerShell)
$env:SUPABASE_URL = "https://horvjqqifgrzxesuxtfm.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "eyJ..."   # legacy JWT-style key — Storage rejects sb_secret_ keys
npm start

# VPS (bash)
export SUPABASE_URL=https://horvjqqifgrzxesuxtfm.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=eyJ...
npm start
```

Optional env: `ASSET_BUCKET` (default `clip-assets`), `POLL_MS` (default 5000).

## Preview templates while designing

```bash
npm run studio    # opens Remotion Studio on the ClipBeat composition
```

## Promo Studio composition

The same bundle contains the branch-neutral `vertical-ui-story` composition at
1080x1920 and 30 fps. It consumes worker-resolved media sources, normalized
scenes and captions, approved brand presentation, safe areas, and review
metadata. It contains no branch-specific copy, routes, claims, or styling.

```bash
npm run render:promo-sample
```

That command uses Rekkrd only as fixture data and writes ignored visual and
delivery-QA artifacts under `work/promo-studio/vertical-ui-story-v1/output`.
The deployed Edge worker still claims only `noop` jobs. The separate Node 22
Promo worker claims only `preview_render` and `final_render` jobs, and remains
disabled unless `PROMO_RENDER_CLAIMS_ENABLED=true` is set on its host.

Install the external worker without enabling claims first:

```bash
ssh your-server
cd /path/to/sproutify-trellis/workers/clip-render-worker
npm ci
node promo-worker.mjs
```

The disabled process exits without initializing a Supabase client. For a
persistent host, copy `promo-render.service.example`, replace only
`__TRELLIS_REPO_ROOT__`, `__NODE_BIN__`, `__SERVICE_USER__`, and
`__SERVICE_GROUP__`, and install it as
`/etc/systemd/system/trellis-promo-render.service`. Copy
`promo-render.env.example` to `/etc/trellis/promo-render.env`, replace the Hub
service-role placeholder, restrict the file to the non-root service account,
and ensure that account can write the worker directory and its Remotion browser
cache. Leave claims false for the first start. Verify Node 22.12+, FFmpeg,
ffprobe, and Chrome, then change only `PROMO_RENDER_CLAIMS_ENABLED=true` and
restart the unit.

```bash
node --version
ffmpeg -version
ffprobe -version
npx remotion browser ensure
sudo systemctl daemon-reload
sudo systemctl enable --now trellis-promo-render
sudo systemctl status trellis-promo-render --no-pager
journalctl -u trellis-promo-render -n 100 --no-pager
```

The environment file is the only required credential surface. Do not expose the
Hub service-role key through Vite, the browser, logs, or a checked-in file.

## The 7 templates

`motion_graphic`, `kinetic_quote_card`, `animation`, `ui_callout`, `timeline`,
`source_receipt_card`, `text_highlight` — all in `remotion/Templates.tsx`, driven by
the `template_params` bag the B-roll planner (Gemini) fills. Text comes only from the
script; colors default to dark editorial backgrounds with one accent per beat.
