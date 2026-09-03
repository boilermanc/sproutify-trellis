import process from 'node:process';
import { createPromoCaptureRuntime } from './runtime.mjs';

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const runtime = createPromoCaptureRuntime();
const once = process.argv.includes('--once');

if (!runtime.config.claimsEnabled) {
  console.log('Promo capture claims are disabled. Configure the approved browser, fixtures, and private Storage before enabling them.');
  process.exit(0);
}

do {
  try {
    const result = await runtime.processOnce();
    if (result.claimed) console.log(JSON.stringify({ event: 'promo_capture_completed', ...result }));
    else if (!once) await sleep(Math.max(1000, Number(process.env.PROMO_CAPTURE_POLL_MS || 5000)));
  } catch (error) {
    console.error(JSON.stringify({ event: 'promo_capture_failed', error: error instanceof Error ? error.message : 'Unknown worker failure' }));
    if (!once) await sleep(Math.max(1000, Number(process.env.PROMO_CAPTURE_POLL_MS || 5000)));
  }
} while (!once);
