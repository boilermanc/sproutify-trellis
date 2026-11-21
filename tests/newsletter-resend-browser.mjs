import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
const {chromium}=await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href);
const base=process.env.STUDIO_TEST_URL||'http://localhost:3017';
const browser=await chromium.launch({headless:true});
try {
  for(const width of [1280,390]) {
    const page=await browser.newPage({viewport:{width,height:900}});const errors=[];let previews=0,sends=0;
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('**/*',async route=>{
      const request=route.request();const url=new URL(request.url());
      if(url.pathname.endsWith('/functions/v1/newsletter-resend')) {
        const body=request.postDataJSON();assert.equal(body.campaign_id,'579edbfb-33eb-439a-bee8-a8be1006137e');assert.equal(body.branch,'atlurbanfarms');assert.equal(body.recipients,undefined);
        const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*'};
        if(request.method()==='OPTIONS')return route.fulfill({headers,status:200,body:''});
        if(body.action==='preview') {
          previews++;
          if(body.subject.includes('[DATE]'))return route.fulfill({headers,status:409,json:{error:'Unresolved placeholder [DATE]. Correct the subject and preview again.'}});
          return route.fulfill({headers,json:{preview:{token:'signed-fixture-token',name:'Newsletter fixture',campaign_id:body.campaign_id,total:12,exclusions:{opened:6,suppressed_or_unsubscribed:2,no_current_consent:1},final_count:3,sample:['Eligible recipient 1 (address hidden)']}}});
        }
        sends++;return route.fulfill({headers,status:409,json:{error:'Consent changed. Review a new preview.'}});
      }
      if(url.origin===base)return route.continue();
      return route.fulfill({status:200,json:[]}); // no real external calls
    });
    await page.goto(`${base}/tests/fixtures/newsletter-resend.html`);
    const send=page.getByRole('button',{name:'Send reminder',exact:true});await assert.equal(await send.isDisabled(),true);
    assert.match(await page.locator('body').innerText(),/imperfect signals/);
    await page.getByRole('button',{name:'Preview audience',exact:true}).click();
    await page.getByText('Final audience: 3').waitFor();assert.equal(await send.isEnabled(),true);
    assert.match(await page.locator('body').innerText(),/Original sent recipients: 12/);
    await page.getByLabel('Reminder subject').fill('Reminder [DATE]');assert.equal(await send.isDisabled(),true);
    await page.getByRole('button',{name:'Preview audience',exact:true}).click();await page.getByRole('alert').filter({hasText:'placeholder'}).waitFor();
    await page.getByLabel('Reminder subject').fill('Valid reminder');await page.getByRole('button',{name:'Preview audience',exact:true}).click();await page.getByText('Final audience: 3').waitFor();
    await page.screenshot({path:`tests/fixtures/newsletter-resend-${width}.png`});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    await send.click();await page.getByRole('alert').filter({hasText:'Consent changed'}).waitFor();assert.equal(await send.isDisabled(),true);
    assert.equal(sends,1);assert.equal(previews,3);assert.deepEqual(errors,[]);await page.close();
  }
  console.log('PASS: desktop/mobile preview, UUID/business payload, no recipient payload, invalidation, placeholder error, consent-change error, no overflow or browser errors. All external requests mocked.');
} finally {await browser.close();}
