import process from 'node:process';
import { createPromoMusicRuntime } from './runtime.mjs';

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const runtime = createPromoMusicRuntime();
const once = process.argv.includes('--once');

if (!runtime.config.claimsEnabled) {
  console.log('Promo music claims are disabled. Configure approved Lyria profiles, FFmpeg, and private Storage before enabling them.');
  process.exit(0);
}

do {
  try {
    const result = await runtime.processOnce();
    if (result.claimed) console.log(JSON.stringify({ event: 'promo_music_completed', ...result }));
    else if (!once) await sleep(Math.max(1000, Number(process.env.PROMO_MUSIC_POLL_MS || 5000)));
  } catch (error) {
    console.error(JSON.stringify({ event: 'promo_music_failed', error: error instanceof Error ? error.message : 'Unknown worker failure' }));
    if (!once) await sleep(Math.max(1000, Number(process.env.PROMO_MUSIC_POLL_MS || 5000)));
  }
} while (!once);
