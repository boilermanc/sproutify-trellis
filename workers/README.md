# Trellis Workers (IONOS VPS)

Two Flask workers back the heavy media steps of the AI content pipeline:

| Worker | Port | Endpoint | Job |
|--------|------|----------|-----|
| `stitch_worker.py` | 8099 | `POST /stitch` | crossfade approved session tracks → master mp3 (bucket `music-sessions`) |
| `video_worker.py`  | 8100 | `POST /video`  | ffmpeg: master audio + cover image → mp4 (bucket `episode-assets`) |

Both: `pip install -r requirements.txt` (needs **ffmpeg**), set `SUPABASE_URL` +
`SUPABASE_SERVICE_ROLE_KEY`, run. Both are CORS-enabled and respond 202
(background thread). `video_worker.py` uses `ASSET_BUCKET=episode-assets`; wire
its `/video` to `EPISODE_VIDEO_WEBHOOK` (directly or via n8n forward). Give it
its own systemd unit (`trellis-video`) mirroring the one below.

---

# Trellis Sessions — Audio Stitch Worker

Stitches approved AI-generated tracks into a single master (crossfades, fades,
loudness normalize), uploads it to Supabase Storage, and flips the render +
session rows to `ready`. Runs on the **IONOS VPS** (audio work is too heavy for
Edge Functions).

## Pipeline

```
Trellis UI (stitchSession)
  → POST MUSIC_STITCH_WEBHOOK  { render_id, session_id, branch, tracks[] }
  → stitch_worker.py downloads tracks → pydub crossfade → export mp3
  → upload to  music-sessions/{session_id}/renders/final-master.mp3
  → PATCH trellis_music_renders  → status=ready, final_audio_url
  → PATCH trellis_music_sessions → status=ready, final_audio_url
  → Trellis "Final Master" player picks it up on the next poll
```

## Setup (Debian/Ubuntu on IONOS)

```bash
sudo apt-get update && sudo apt-get install -y ffmpeg python3-venv
cd /opt && git clone <this repo> trellis && cd trellis/workers
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

export SUPABASE_URL=https://horvjqqifgrzxesuxtfm.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=<HUB service_role key>   # keep secret
export STITCH_BUCKET=music-sessions
python stitch_worker.py        # serves on :8099  (GET /health, POST /stitch)
```

### systemd (keep it running)

`/etc/systemd/system/trellis-stitch.service`:

```ini
[Unit]
Description=Trellis Sessions stitch worker
After=network.target

[Service]
WorkingDirectory=/opt/trellis/workers
Environment=SUPABASE_URL=https://horvjqqifgrzxesuxtfm.supabase.co
Environment=SUPABASE_SERVICE_ROLE_KEY=REPLACE_ME
Environment=STITCH_BUCKET=music-sessions
ExecStart=/opt/trellis/workers/.venv/bin/python stitch_worker.py
Restart=always

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now trellis-stitch
```

## Wiring the webhook

`MUSIC_STITCH_WEBHOOK` in `constants.ts` is currently
`https://n8n.sproutify.app/webhook/trellis-music-stitch`. Two options:

1. **Direct** — change that constant to the worker URL (e.g. behind Cloudflare/
   Plesk: `https://stitch.sproutify.app/stitch`) and expose the worker publicly.
   The browser fires it fire-and-forget, so response CORS doesn't matter.
2. **Via n8n** — keep the constant, add a tiny n8n workflow on
   `trellis-music-stitch` that forwards the JSON body to the worker's `/stitch`.
   Preferred if the VPS shouldn't take public traffic directly.

## Notes

- Tuning constants at the top of `stitch_worker.py`: `CROSSFADE_MS`,
  `FADE_IN_MS`, `FADE_OUT_MS`, bitrate, and the `-14 dBFS` normalize target.
- Upload uses `x-upsert: true`, so re-stitching a session overwrites its master.
- The `music-sessions` bucket is public → the stored `final_audio_url` is
  directly playable in the Trellis review panel.
