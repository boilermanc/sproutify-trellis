// Actual App/Layout fixture: no external requests reach live services.
// Requires Vite on :3000 and PLAYWRIGHT_MODULE if Playwright is not installed locally.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const pw = process.env.PLAYWRIGHT_MODULE ? await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE)) : await import('playwright');
const base = process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3000';
const browser = await pw.chromium.launch({headless:true});
const branches = ['Alpha','Beta'].map((name,i)=>({id:'00000000-0000-0000-0000-00000000000'+(i+1),slug:name.toLowerCase(),name:'Fixture '+name,is_active:true,type:'hub',color:'#059669'}));
try {
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*', async route=>{
    const url=new URL(route.request().url());
    if(url.origin!==base) {
      if(url.pathname.endsWith('/rest/v1/branches')) return route.fulfill({json:branches});
      if(url.pathname.includes('/functions/')) return route.fulfill({json:{jobs:[],albums:[],releases:[],tracks:[]}});
      return route.fulfill({json:[]});
    }
    if(url.pathname==='/contexts/AuthContext.tsx') return route.fulfill({contentType:'application/javascript',body:"export const AuthProvider=({children})=>children; export const useAuth=()=>({user:{id:'fixture-user',email:'fixture@example.test'},loading:false,isPasswordRecovery:false,signOut:()=>{}});"});
    if(url.pathname==='/pages/Dashboard.tsx') return route.fulfill({contentType:'application/javascript',body:'export default function Dashboard(){return null;}'});
    if(url.pathname==='/__studio_fixture__') return route.fulfill({contentType:'text/html',body:[
      '<!doctype html><html><body><div id="root"></div><script type="module">',
      "import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window);",
      "window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>(type)=>type; window.__vite_plugin_react_preamble_installed__=true;",
      "await import('/@vite/client');",
      "const r=await import('/node_modules/.vite/deps/react.js'); const React=r.default||r;",
      "const c=await import('/node_modules/.vite/deps/react-dom_client.js'); const {createRoot}=c.default||c;",
      "const {default:App}=await import('/App.tsx'); await import('/index.css');",
      "createRoot(document.getElementById('root')).render(React.createElement(App));",
      '</script></body></html>'
    ].join('\n')});
    return route.continue();
  });
  await page.goto(base+'/__studio_fixture__');
  await page.getByRole('button',{name:'Content Studio',exact:true}).click();
  const titles=['Social Hub','Content Intelligence','Reddit Ads','Creative Studio','Media Generation','Motion Posts','Promo Studio','Post Scheduler','Card Studio','Ad Performance','Post Performance','Clip Studio','Trellis Sessions','Trellis Episodes'];
  for(const title of titles){
    await page.getByRole('button',{name:title,exact:true}).click();
    await page.getByRole('heading',{name:'Choose a branch to begin'}).waitFor();
    assert.equal(await page.locator('#studio-branch-picker').innerText(),'Select branch',title);
    assert.equal(await page.locator('main input:visible,main textarea:visible,main select:visible').count(),0,title+' starts without forms');
    assert.equal(await page.locator('main').evaluate(el=>el.scrollHeight<=el.clientHeight+4),true,title+' entry fits viewport');
  }
  await page.getByRole('button',{name:'Motion Posts',exact:true}).click();
  await page.locator('main section').getByRole('button',{name:'Choose branch',exact:true}).click();
  await page.getByRole('button',{name:/Fixture Alpha/}).click();
  await page.getByRole('button',{name:'Next: post details'}).waitFor();
  assert.equal(await page.locator('#studio-branch-picker').innerText(),'Fixture Alpha');
  assert.equal(await page.locator('main textarea:visible, main select:visible').count(),0);
  assert.equal(await page.getByRole('button',{name:'Next: post details'}).isDisabled(),true);
  await page.locator('input[type=file]').setInputFiles({name:'test.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWZkAAAAASUVORK5CYII=','base64')});
  await page.getByRole('button',{name:'Next: post details'}).click();
  await page.getByLabel('Describe the motion').fill('Slow camera movement through the scene.');
  await page.getByLabel('Instagram caption').fill('A fixture caption.');
  await page.getByRole('button',{name:'Next: review settings'}).click();
  await page.getByRole('heading',{name:'Review settings and cost'}).waitFor();
  assert.equal(await page.locator('main textarea:visible').count(),0);
  assert.equal(await page.getByRole('button',{name:'Animate post',exact:true}).isEnabled(),true);
  page.once('dialog',d=>d.dismiss());
  await page.getByRole('button',{name:'Card Studio',exact:true}).click();
  await page.getByRole('heading',{name:'Review settings and cost'}).waitFor();
  // No generation occurs. Test cancel and accept branch changes against real App state.
  page.once('dialog',d=>d.dismiss());
  await page.locator('#studio-branch-picker').click();
  await page.getByRole('button',{name:/Fixture Beta/}).click();
  assert.equal(await page.locator('#studio-branch-picker').innerText(),'Fixture Alpha');
  page.once('dialog',d=>d.accept());
  await page.locator('#studio-branch-picker').click();
  await page.getByRole('button',{name:/Fixture Beta/}).click();
  await page.getByRole('button',{name:'Next: post details'}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Next: post details'}).isDisabled(),true,'branch switch clears source');
  await page.evaluate(()=>window.dispatchEvent(new Event('studio-draft-change')));
  page.once('dialog',d=>d.dismiss());
  await page.getByRole('button',{name:'Card Studio',exact:true}).click();
  assert.equal(await page.locator('#studio-branch-picker').innerText(),'Fixture Beta');
  page.once('dialog',d=>d.accept());
  await page.getByRole('button',{name:'Card Studio',exact:true}).click();
  await page.getByRole('heading',{name:'Choose a branch to begin'}).waitFor();
  for (const name of ['Transcriptions','Studio Albums']) {
    await page.getByRole('button',{name,exact:true}).click();
    assert.equal(await page.locator('#studio-branch-picker').count(),0,name+' has no misleading scope');
  }
  await page.getByRole('button',{name:'Motion Posts',exact:true}).click();
  assert.equal(await page.locator('#studio-branch-picker').innerText(),'Select branch');
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile entry has no horizontal overflow');
  await page.screenshot({path:process.env.STUDIO_SCREENSHOT || (await import('node:path')).join((await import('node:os')).tmpdir(),'content-studio-start.png'),fullPage:true,animations:'disabled'});
  assert.deepEqual(errors,[]);
  console.log('PASS: all 14 branch gates; real header selection; Motion Posts wizard; cancelled/accepted branch reset; draft navigation protection; branch-independent tools; clean re-entry; mobile layout; no browser exceptions.');
} finally {await browser.close();}
