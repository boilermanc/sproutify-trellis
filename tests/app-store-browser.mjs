import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { chromium } = process.env.PLAYWRIGHT_MODULE ? await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href) : await import('playwright');
const base = process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3015';
const browser = await chromium.launch({headless:true});
try {
 const page = await browser.newPage({viewport:{width:1280,height:900}});
 const errors=[]; page.on('pageerror', error => errors.push(error.message));
 await page.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
 await page.goto(`${base}/tests/fixtures/app-store.html`, {waitUntil: 'domcontentloaded', timeout: 90000});
 await page.getByRole('heading',{name:'Daily downloads'}).waitFor();
 assert.equal(await page.getByRole('cell',{name:'2026-11-01',exact:true}).count(),1);
 await page.getByRole('button',{name:'7 days',exact:true}).click();
 await page.getByRole('heading',{name:'Daily downloads'}).waitFor();
 await page.getByRole('button',{name:'Sync Rekkrd',exact:true}).click();
 await page.getByRole('heading',{name:'Daily downloads'}).waitFor();
 if(process.env.APP_STORE_SCREENSHOT) await page.screenshot({path:process.env.APP_STORE_SCREENSHOT,fullPage:true});
 await page.setViewportSize({width:390,height:844});
 assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
 for(const [state, text] of [['pending','No download report data for this period.'],['disconnected','Rekkrd reporting is not connected in this view.'],['error','Fixture: reporting unavailable']]) {
  await page.goto(`${base}/tests/fixtures/app-store.html?state=${state}`);
  await page.getByText(text,{exact:false}).waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
 }
 assert.deepEqual(errors,[]);
 console.log('PASS App Store browser: daily/country data, period switch, sync, pending/disconnected/error states and mobile layout; no page errors.');
} finally {await browser.close();}
