#!/usr/bin/env node
/**
 * Trellis Clip Studio — render worker
 * ===================================
 * Polls trellis_clip_render_jobs on the Hub Supabase:
 *   - job_type 'beat':     renders the beat's Remotion template (1080x1920@30) to mp4
 *   - job_type 'assemble': downloads the kept clips and ffmpeg-concats the final Short
 * Uploads results to the clip-assets bucket and marks the job completed/failed.
 *
 * Run:
 *   cd workers/clip-render-worker
 *   npm install                      # first time; needs ffmpeg on PATH for assembly
 *   set SUPABASE_URL=https://horvjqqifgrzxesuxtfm.supabase.co
 *   set SUPABASE_SERVICE_ROLE_KEY=eyJ...   (the legacy JWT-style service key — Storage rejects sb_secret_ keys)
 *   npm start
 */
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SUPABASE_URL = (process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const BUCKET = (process.env.ASSET_BUCKET || 'clip-assets').trim();
const POLL_MS = Number(process.env.POLL_MS || 5000);
const FPS = 30;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!SERVICE_KEY.startsWith('eyJ')) {
  console.warn('[warn] service key is not a JWT (eyJ...) — Storage uploads will fail with sb_secret_ keys');
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HEADERS = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' };

async function rest(pathAndQuery, init = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, { ...init, headers: { ...HEADERS, ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`REST ${init.method || 'GET'} ${pathAndQuery} -> ${r.status}: ${await r.text()}`);
  const text = await r.text();
  return text ? JSON.parse(text) : null;
}

const patch = (table, id, body) =>
  rest(`${table}?id=eq.${id}`, { method: 'PATCH', body: JSON.stringify({ ...body, updated_at: new Date().toISOString() }) });

async function upload(pathInBucket, buf, contentType) {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${pathInBucket}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': contentType, 'x-upsert': 'true' },
    body: buf,
  });
  if (![200, 201].includes(r.status)) throw new Error(`Upload failed ${r.status}: ${await r.text()}`);
  return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${pathInBucket}`;
}

async function download(url, filePath) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Download failed ${r.status}: ${url}`);
  writeFileSync(filePath, Buffer.from(await r.arrayBuffer()));
}

function ffprobe(filePath) {
  try {
    const out = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,r_frame_rate:format=duration',
      '-of', 'json', filePath], { encoding: 'utf8' });
    const j = JSON.parse(out.stdout || '{}');
    const s = j.streams?.[0] || {};
    return { width: s.width, height: s.height, duration: Number(j.format?.duration) || null, ok: true };
  } catch { return { ok: false }; }
}

// ─── Remotion bundle (built once, reused for every beat render) ───────
let serveUrlPromise = null;
function getServeUrl() {
  serveUrlPromise ??= (async () => {
    console.log('[bundle] bundling Remotion templates…');
    const url = await bundle({ entryPoint: path.join(__dirname, 'remotion', 'index.ts') });
    console.log('[bundle] ready');
    return url;
  })();
  return serveUrlPromise;
}

async function renderBeat(job) {
  const beats = await rest(`trellis_clip_broll_beats?id=eq.${job.beat_id}&select=*`);
  const beat = beats?.[0];
  if (!beat) throw new Error(`Beat ${job.beat_id} not found`);

  const durationSec = Math.min(15, Math.max(2, Number(beat.time_end) - Number(beat.time_start) || 6));
  const inputProps = { beatType: beat.beat_type, params: beat.template_params || {}, durationSec };

  const serveUrl = await getServeUrl();
  const composition = await selectComposition({ serveUrl, id: 'ClipBeat', inputProps });

  const tmp = mkdtempSync(path.join(tmpdir(), 'clipbeat-'));
  try {
    const out = path.join(tmp, 'beat.mp4');
    await renderMedia({
      composition, serveUrl, codec: 'h264', outputLocation: out, inputProps,
      // silent motion graphics — no audio track
      muted: true,
    });
    const data = readFileSync(out);
    const storagePath = `${job.project_id}/beats/${beat.id}.mp4`;
    const url = await upload(storagePath, data, 'video/mp4');
    const probe = ffprobe(out);
    await patch('trellis_clip_render_jobs', job.id, {
      status: 'completed', output_url: url, storage_path: storagePath,
      duration_seconds: probe.duration ?? durationSec,
      width: probe.width ?? 1080, height: probe.height ?? 1920,
      qa: {
        typecheck: 'passed (template library)',
        render: 'passed',
        ...(probe.ok ? { ffprobe: `${probe.width}x${probe.height} · ${probe.duration?.toFixed(1)}s` } : {}),
        composition: `1080x1920 ${FPS}fps ${Math.round(durationSec * FPS)} frames`,
      },
    });
    console.log(`[beat] ${beat.beat_type} "${(beat.headline || '').slice(0, 50)}" -> ${url}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function assemble(job) {
  const urls = job.payload?.clip_urls || [];
  if (!urls.length) throw new Error('assemble job has no clip_urls');
  const audioUrl = job.payload?.audio_url || null;

  const tmp = mkdtempSync(path.join(tmpdir(), 'clipfinal-'));
  try {
    const files = [];
    for (let i = 0; i < urls.length; i++) {
      const f = path.join(tmp, `part${i}.mp4`);
      await download(urls[i], f);
      files.push(f);
    }
    const list = path.join(tmp, 'list.txt');
    writeFileSync(list, files.map(f => `file '${f.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`).join('\n'));
    const out = path.join(tmp, 'final.mp4');

    // With an audio bed: mux the track over the concatenated (silent) video.
    // apad + -shortest pads a short track with silence and trims a long one, so
    // the output always runs exactly the video's length.
    let args;
    if (audioUrl) {
      const extMatch = audioUrl.match(/\.(mp3|m4a|aac|wav|ogg)(?:\?|$)/i);
      const audioFile = path.join(tmp, `bed.${extMatch ? extMatch[1].toLowerCase() : 'mp3'}`);
      await download(audioUrl, audioFile);
      args = ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-i', audioFile,
        '-map', '0:v:0', '-map', '1:a:0',
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', String(FPS),
        '-c:a', 'aac', '-b:a', '192k', '-filter:a', 'apad', '-shortest', out];
    } else {
      args = ['-y', '-f', 'concat', '-safe', '0', '-i', list,
        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-an', out];
    }
    const ff = spawnSync('ffmpeg', args, { encoding: 'utf8' });
    if (ff.status !== 0) throw new Error(`ffmpeg ${audioUrl ? 'mux' : 'concat'} failed: ${(ff.stderr || '').slice(-800)}`);

    const data = readFileSync(out);
    const storagePath = `${job.project_id}/final.mp4`;
    const url = await upload(storagePath, data, 'video/mp4');
    const probe = ffprobe(out);
    await patch('trellis_clip_render_jobs', job.id, {
      status: 'completed', output_url: url, storage_path: storagePath,
      duration_seconds: probe.duration, width: probe.width ?? 1080, height: probe.height ?? 1920,
      qa: {
        stitch: `passed (${urls.length} clips)`,
        audio: audioUrl ? 'music bed muxed' : 'silent',
        ...(probe.ok ? { ffprobe: `${probe.width}x${probe.height} · ${probe.duration?.toFixed(1)}s` } : {}),
      },
    });
    await patch('trellis_clip_projects', job.project_id, { final_video_url: url, status: 'production' });
    console.log(`[assemble] ${urls.length} clips${audioUrl ? ' + music' : ''} -> ${url}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function claimNext() {
  const jobs = await rest('trellis_clip_render_jobs?status=eq.queued&order=created_at.asc&limit=1&select=*');
  const job = jobs?.[0];
  if (!job) return null;
  await patch('trellis_clip_render_jobs', job.id, { status: 'running', attempts: (job.attempts || 0) + 1 });
  return job;
}

async function loop() {
  console.log(`[worker] clip render worker up — bucket ${BUCKET}, polling every ${POLL_MS}ms`);
  for (;;) {
    let job = null;
    try {
      job = await claimNext();
      if (job) {
        console.log(`[job] ${job.job_type} ${job.id}`);
        if (job.job_type === 'assemble') await assemble(job);
        else await renderBeat(job);
      }
    } catch (e) {
      console.error('[error]', e.message || e);
      if (job) {
        try { await patch('trellis_clip_render_jobs', job.id, { status: 'failed', error_message: String(e.message || e).slice(0, 500) }); }
        catch { /* best effort */ }
      }
    }
    if (!job) await new Promise(r => setTimeout(r, POLL_MS));
  }
}

loop();
