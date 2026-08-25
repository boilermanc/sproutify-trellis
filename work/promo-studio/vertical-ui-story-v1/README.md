# vertical-ui-story v1 proof

This folder verifies the branch-neutral Promo Studio Remotion composition with
the existing PS-002 Rekkrd assets as fixture data. Rekkrd copy, colors, logo,
capture, voice, and music are passed as props and do not exist in the component.

Run from `workers/clip-render-worker`:

```bash
npm run render:promo-sample
```

The script renders UI and end-card stills, creates the full 1080x1920 video,
runs two-pass FFmpeg loudness normalization plus measured peak-safe correction,
and fails unless ffprobe and loudness checks meet the production completion
contract. Generated artifacts remain ignored under `output/`.

Verified fixture result on 2026-08-25:

- 1080x1920, 30 fps, exactly 10.00 seconds;
- H.264/yuv420p video and AAC/48 kHz audio;
- -14.11 integrated LUFS and -1.84 dBTP;
- real Rekkrd UI capture and approved Rekkrd icon from PS-002.

The composition remains `worker_enabled: false`; this proof does not authorize
the deployed worker to claim Promo render jobs.
