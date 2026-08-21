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

## The 7 templates

`motion_graphic`, `kinetic_quote_card`, `animation`, `ui_callout`, `timeline`,
`source_receipt_card`, `text_highlight` — all in `remotion/Templates.tsx`, driven by
the `template_params` bag the B-roll planner (Gemini) fills. Text comes only from the
script; colors default to dark editorial backgrounds with one accent per beat.
