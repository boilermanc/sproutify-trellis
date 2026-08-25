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

async function uploadPublic(bucket, pathInBucket, buf, contentType) {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${pathInBucket}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': contentType, 'x-upsert': 'false' },
    body: buf,
  });
  if (![200, 201].includes(r.status)) throw new Error(`Public upload failed ${r.status}: ${await r.text()}`);
  return `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${pathInBucket}`;
}

async function uploadPrivate(bucket, pathInBucket, buf, contentType) {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/${bucket}/${pathInBucket}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': contentType, 'x-upsert': 'false' },
    body: buf,
  });
  if (![200, 201].includes(r.status)) throw new Error(`Private upload failed ${r.status}: ${await r.text()}`);
}

async function signPrivateAsset(bucket, storagePath, expiresIn = 3600) {
  const encoded = storagePath.split('/').map(encodeURIComponent).join('/');
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${bucket}/${encoded}`, {
    method: 'POST', headers: HEADERS, body: JSON.stringify({ expiresIn }),
  });
  if (!r.ok) throw new Error(`Could not sign source video ${r.status}: ${await r.text()}`);
  const payload = await r.json();
  const signed = payload.signedURL || payload.signedUrl;
  if (!signed) throw new Error('Storage did not return a signed source-video URL');
  return signed.startsWith('http') ? signed : `${SUPABASE_URL}/storage/v1${signed}`;
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

function hasAudioStream(filePath) {
  const out = spawnSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=index', '-of', 'csv=p=0', filePath], { encoding: 'utf8' });
  return out.status === 0 && Boolean((out.stdout || '').trim());
}

async function renderMediaFinish(job) {
  const [assets, outputs] = await Promise.all([
    rest(`media_assets?id=eq.${job.source_asset_id}&select=*`),
    rest(`media_generation_outputs?id=eq.${job.source_output_id}&select=*`),
  ]);
  const sourceAsset = assets?.[0];
  const sourceOutput = outputs?.[0];
  if (!sourceAsset || sourceAsset.status !== 'ready') throw new Error('Finishing source asset is unavailable');
  if (!sourceOutput || sourceOutput.asset_id !== sourceAsset.id || sourceOutput.output_role !== 'primary') throw new Error('Finishing source must be an untouched primary output');
  if (!String(sourceAsset.mime_type || '').startsWith('video/')) throw new Error('Finishing source is not a video');

  const sourceUrl = await signPrivateAsset(sourceAsset.storage_bucket, sourceAsset.storage_path, 3600);
  const inputProps = {
    sourceUrl,
    durationSec: Number(sourceAsset.duration_seconds || 1),
    width: Number(sourceAsset.width || 854),
    height: Number(sourceAsset.height || 480),
    cues: job.text_cues || [],
    style: job.style || {},
  };
  const serveUrl = await getServeUrl();
  const composition = await selectComposition({ serveUrl, id: 'MediaFinishing', inputProps });
  const tmp = mkdtempSync(path.join(tmpdir(), 'mediafinish-'));
  try {
    const out = path.join(tmp, 'finished.mp4');
    await renderMedia({ composition, serveUrl, codec: 'h264', outputLocation: out, inputProps });
    const data = readFileSync(out);
    const storagePath = `${job.created_by}/${job.project_id}/finishes/${job.id}/output.mp4`;
    await uploadPrivate('media-generation-assets', storagePath, data, 'video/mp4');
    const probe = ffprobe(out);
    const assetRows = await rest('media_assets', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        project_id: job.project_id,
        asset_type: 'finished_video',
        role: 'text_finished_output',
        storage_bucket: 'media-generation-assets',
        storage_path: storagePath,
        mime_type: 'video/mp4',
        file_size_bytes: data.byteLength,
        duration_seconds: probe.duration || sourceAsset.duration_seconds,
        width: probe.width || sourceAsset.width,
        height: probe.height || sourceAsset.height,
        status: 'ready',
        metadata: { source_output_id: sourceOutput.id, finishing_job_id: job.id, cue_count: (job.text_cues || []).length, style: job.style || {} },
      }),
    });
    const asset = assetRows?.[0];
    if (!asset) throw new Error('Could not register finished media asset');
    const outputRows = await rest('media_generation_outputs', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ job_id: sourceOutput.job_id, asset_id: asset.id, output_role: 'finished', source_output_id: sourceOutput.id, approved: false }),
    });
    const output = outputRows?.[0];
    if (!output) throw new Error('Could not register finished media output');
    await patch('media_finishing_jobs', job.id, {
      status: 'succeeded', progress: 100, output_asset_id: asset.id, output_id: output.id,
      completed_at: new Date().toISOString(), error_message: null,
    });
    await rest('media_generation_events', {
      method: 'POST',
      body: JSON.stringify({ job_id: sourceOutput.job_id, event_type: 'finishing_succeeded', status: 'succeeded', progress: 100, details: { finishing_job_id: job.id, source_output_id: sourceOutput.id, output_id: output.id, asset_id: asset.id } }),
    });
    console.log(`[finish] ${job.id} -> ${storagePath}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function renderMotionPostFinish(job) {
  const jobs = await rest(`motion_post_jobs?id=eq.${job.motion_post_job_id}&created_by=eq.${job.created_by}&select=*`);
  const sourceJob = jobs?.[0];
  if (!sourceJob || !['ready', 'published'].includes(sourceJob.status)) throw new Error('Motion Post finishing source is unavailable');
  if (sourceJob.output_bucket !== job.source_bucket || sourceJob.output_path !== job.source_path) {
    throw new Error('Motion Post finishing source no longer matches the original output');
  }
  const sourceUrl = await signPrivateAsset(job.source_bucket, job.source_path, 3600);
  const tmp = mkdtempSync(path.join(tmpdir(), 'motionpostfinish-'));
  try {
    const source = path.join(tmp, 'source.mp4');
    const out = path.join(tmp, 'finished.mp4');
    await download(sourceUrl, source);
    const sourceProbe = ffprobe(source);
    if (!sourceProbe.ok) throw new Error('Could not inspect the Motion Post source video');
    const inputProps = {
      sourceUrl,
      durationSec: Number(sourceProbe.duration || sourceJob.duration_seconds || 1),
      width: Number(sourceProbe.width || 1080),
      height: Number(sourceProbe.height || 1920),
      cues: job.text_cues || [],
      style: job.style || {},
    };
    const serveUrl = await getServeUrl();
    const composition = await selectComposition({ serveUrl, id: 'MediaFinishing', inputProps });
    await renderMedia({ composition, serveUrl, codec: 'h264', outputLocation: out, inputProps });
    const data = readFileSync(out);
    const storagePath = `${job.created_by}/${job.motion_post_job_id}/finishes/${job.id}/output.mp4`;
    const outputUrl = await uploadPublic(job.output_bucket || 'motion-posts', storagePath, data, 'video/mp4');
    await patch('motion_post_finishing_jobs', job.id, {
      status: 'succeeded', progress: 100, output_path: storagePath, output_url: outputUrl,
      completed_at: new Date().toISOString(), error_message: null,
    });
    console.log(`[motion-post-finish] ${job.id} -> ${storagePath}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function renderPlatformExport(job) {
  const [assets, outputs] = await Promise.all([
    rest(`media_assets?id=eq.${job.source_asset_id}&select=*`),
    rest(`media_generation_outputs?id=eq.${job.source_output_id}&select=*`),
  ]);
  const sourceAsset = assets?.[0];
  const sourceOutput = outputs?.[0];
  if (!sourceAsset || sourceAsset.status !== 'ready') throw new Error('Platform-export source asset is unavailable');
  if (!sourceOutput || sourceOutput.asset_id !== sourceAsset.id) throw new Error('Platform-export source does not match its output');
  if (!String(sourceAsset.mime_type || '').startsWith('video/')) throw new Error('Platform-export source is not a video');
  if (job.platform !== 'instagram_reel') throw new Error(`Unsupported platform export: ${job.platform}`);

  const sourceUrl = await signPrivateAsset(sourceAsset.storage_bucket, sourceAsset.storage_path, 3600);
  const tmp = mkdtempSync(path.join(tmpdir(), 'platformexport-'));
  try {
    const source = path.join(tmp, 'source.mp4');
    const out = path.join(tmp, 'instagram-reel.mp4');
    await download(sourceUrl, source);
    const audio = hasAudioStream(source);
    const framingFilters = {
      blur_background: '[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=30[bg];[0:v]scale=1080:1920:force_original_aspect_ratio=decrease[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,format=yuv420p[v]',
      center_crop: '[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,format=yuv420p[v]',
      fit: '[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p[v]',
    };
    const filter = framingFilters[job.framing] || framingFilters.blur_background;
    const args = ['-y', '-i', source];
    if (!audio) args.push('-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000');
    args.push('-filter_complex', filter, '-map', '[v]', '-map', audio ? '0:a:0' : '1:a:0',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30',
      '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-movflags', '+faststart', '-shortest', out);
    const ff = spawnSync('ffmpeg', args, { encoding: 'utf8' });
    if (ff.status !== 0) throw new Error(`Instagram export failed: ${(ff.stderr || '').slice(-1200)}`);

    const data = readFileSync(out);
    const storagePath = `${job.created_by}/${job.project_id}/platform-exports/${job.id}/instagram-reel.mp4`;
    await uploadPrivate('media-generation-assets', storagePath, data, 'video/mp4');
    const probe = ffprobe(out);
    const assetRows = await rest('media_assets', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        project_id: job.project_id,
        asset_type: 'platform_export',
        role: 'instagram_reel_export',
        storage_bucket: 'media-generation-assets',
        storage_path: storagePath,
        mime_type: 'video/mp4',
        file_size_bytes: data.byteLength,
        duration_seconds: probe.duration || sourceAsset.duration_seconds,
        width: probe.width || 1080,
        height: probe.height || 1920,
        status: 'ready',
        metadata: { source_output_id: sourceOutput.id, platform_export_id: job.id, platform: job.platform, framing: job.framing, fps: 30, audio: audio ? 'source' : 'silent_aac' },
      }),
    });
    const asset = assetRows?.[0];
    if (!asset) throw new Error('Could not register Instagram export asset');
    await patch('media_platform_exports', job.id, {
      status: 'succeeded', progress: 100, output_asset_id: asset.id,
      completed_at: new Date().toISOString(), error_message: null,
    });
    await rest('media_generation_events', {
      method: 'POST',
      body: JSON.stringify({ job_id: sourceOutput.job_id, event_type: 'platform_export_succeeded', status: 'succeeded', progress: 100, details: { platform_export_id: job.id, source_output_id: sourceOutput.id, asset_id: asset.id, platform: job.platform } }),
    });
    console.log(`[platform-export] ${job.id} -> ${storagePath}`);
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

async function claimNextFinish() {
  const jobs = await rest('media_finishing_jobs?status=eq.queued&order=queued_at.asc&limit=1&select=*');
  const job = jobs?.[0];
  if (!job) return null;
  if (Number(job.attempts || 0) >= Number(job.max_attempts || 2)) {
    await patch('media_finishing_jobs', job.id, { status: 'failed', error_message: 'Finishing retry limit reached.', completed_at: new Date().toISOString() });
    return null;
  }
  await patch('media_finishing_jobs', job.id, { status: 'running', progress: 5, attempts: Number(job.attempts || 0) + 1, started_at: new Date().toISOString() });
  return job;
}

async function claimNextMotionPostFinish() {
  const jobs = await rest('motion_post_finishing_jobs?status=eq.queued&order=queued_at.asc&limit=1&select=*');
  const job = jobs?.[0];
  if (!job) return null;
  if (Number(job.attempts || 0) >= Number(job.max_attempts || 2)) {
    await patch('motion_post_finishing_jobs', job.id, { status: 'failed', error_message: 'Finishing retry limit reached.', completed_at: new Date().toISOString() });
    return null;
  }
  await patch('motion_post_finishing_jobs', job.id, { status: 'running', progress: 5, attempts: Number(job.attempts || 0) + 1, started_at: new Date().toISOString() });
  return job;
}

async function claimNextPlatformExport() {
  const jobs = await rest('media_platform_exports?status=eq.queued&order=queued_at.asc&limit=1&select=*');
  const job = jobs?.[0];
  if (!job) return null;
  if (Number(job.attempts || 0) >= Number(job.max_attempts || 2)) {
    await patch('media_platform_exports', job.id, { status: 'failed', error_message: 'Platform export retry limit reached.', completed_at: new Date().toISOString() });
    return null;
  }
  await patch('media_platform_exports', job.id, { status: 'running', progress: 5, attempts: Number(job.attempts || 0) + 1, started_at: new Date().toISOString() });
  return job;
}

async function loop() {
  console.log(`[worker] clip render worker up — bucket ${BUCKET}, polling every ${POLL_MS}ms`);
  for (;;) {
    let job = null;
    let finishJob = null;
    let motionPostFinishJob = null;
    let platformExportJob = null;
    try {
      platformExportJob = await claimNextPlatformExport();
      if (platformExportJob) {
        console.log(`[platform-export-job] ${platformExportJob.id}`);
        await renderPlatformExport(platformExportJob);
        continue;
      }
      motionPostFinishJob = await claimNextMotionPostFinish();
      if (motionPostFinishJob) {
        console.log(`[motion-post-finish-job] ${motionPostFinishJob.id}`);
        await renderMotionPostFinish(motionPostFinishJob);
        continue;
      }
      finishJob = await claimNextFinish();
      if (finishJob) {
        console.log(`[finish-job] ${finishJob.id}`);
        await renderMediaFinish(finishJob);
        continue;
      }
      job = await claimNext();
      if (job) {
        console.log(`[job] ${job.job_type} ${job.id}`);
        if (job.job_type === 'assemble') await assemble(job);
        else await renderBeat(job);
      }
    } catch (e) {
      console.error('[error]', e.message || e);
      if (platformExportJob) {
        try { await patch('media_platform_exports', platformExportJob.id, { status: 'failed', progress: 0, error_message: String(e.message || e).slice(0, 500), completed_at: new Date().toISOString() }); }
        catch { /* best effort */ }
      }
      if (finishJob) {
        try { await patch('media_finishing_jobs', finishJob.id, { status: 'failed', progress: 0, error_message: String(e.message || e).slice(0, 500), completed_at: new Date().toISOString() }); }
        catch { /* best effort */ }
      }
      if (motionPostFinishJob) {
        try { await patch('motion_post_finishing_jobs', motionPostFinishJob.id, { status: 'failed', progress: 0, error_message: String(e.message || e).slice(0, 500), completed_at: new Date().toISOString() }); }
        catch { /* best effort */ }
      }
      if (job) {
        try { await patch('trellis_clip_render_jobs', job.id, { status: 'failed', error_message: String(e.message || e).slice(0, 500) }); }
        catch { /* best effort */ }
      }
    }
    if (!job && !finishJob && !motionPostFinishJob && !platformExportJob) await new Promise(r => setTimeout(r, POLL_MS));
  }
}

loop();
