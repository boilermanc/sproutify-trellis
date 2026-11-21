import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {chromium} = process.env.PLAYWRIGHT_MODULE ? await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href) : await import('playwright');
const base = process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3015';
const browser = await chromium.launch({headless:true});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e=>errors.push(e.message));
  await page.route('**/functions/v1/atl-acquisition', route=>route.fulfill({json:{ads:{123:{orders:3,buyers:2,unknown:0}},unmatched:4}}));
  await page.goto(base+'/tests/fixtures/atl-acquisition.html');
  await page.getByText('ATL Urban Farms · Meta acquisition report').click();
  const input = page.getByLabel('ATL campaign export');
  const upload = csv => input.setInputFiles({name:'ads.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
  await upload('Ad ID,Spend\n123,90');
  await page.getByRole('alert').waitFor();
  await upload('Campaign name,Ad name,Ad ID,Amount spent (USD),Reporting starts,Reporting ends\nSeedlings,Basil,123,90,2026-11-01,2026-11-10');
  await page.getByRole('cell',{name:'$45.00',exact:true}).waitFor();
  await page.getByText('Field guide · setup, interpretation and decisions').click();
  await page.getByText('4. Make a decision',{exact:true}).waitFor();
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth));
  assert.deepEqual(errors,[]);
} finally {await browser.close();}
