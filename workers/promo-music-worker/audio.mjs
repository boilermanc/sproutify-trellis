import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const run = (command, args, collect = false) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { stdio: ['ignore', collect ? 'pipe' : 'ignore', 'pipe'], windowsHide: true });
  let stdout = ''; let stderr = '';
  child.stdout?.on('data', chunk => { stdout += chunk.toString(); });
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  child.once('error', reject);
  child.once('close', code => code === 0 ? resolve(stdout) : reject(new Error(`${command} exited ${code}: ${stderr.slice(-1000)}`)));
});

export async function normalizeMusicToWav({ bytes, targetSeconds, ffmpegPath = 'ffmpeg', ffprobePath = 'ffprobe' }) {
  const work = await mkdtemp(join(tmpdir(), 'trellis-promo-music-'));
  const input = join(work, 'provider-audio');
  const output = join(work, 'music.wav');
  try {
    await writeFile(input, bytes);
    await run(ffmpegPath, ['-y', '-i', input, '-af', `apad=whole_dur=${targetSeconds}`, '-t', String(targetSeconds),
      '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', output]);
    const probe = await run(ffprobePath, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', output], true);
    const duration_seconds = Number(JSON.parse(probe).format?.duration);
    if (!Number.isFinite(duration_seconds) || duration_seconds < targetSeconds) throw new Error('Normalized music is shorter than the requested promo.');
    return { bytes: await readFile(output), duration_seconds };
  } finally { await rm(work, { recursive: true, force: true }).catch(() => {}); }
}
