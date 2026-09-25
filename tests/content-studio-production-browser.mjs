// Fixture-only: all external requests are mocked or blocked; no writes or generation.
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { chromium } = process.env.PLAYWRIGHT_MODULE ? await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href) : await import('playwright');
const base = process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3000';
const browser = await chromium.launch({headless:true,args:['--disable-features=LocalNetworkAccessChecks']});
const errors=[]; const reads=[];
try {
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});page.on('console',message=>{if(message.type()==='error')console.error(message.text())});
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.origin!==base){
   if(url.pathname.includes('/rest/v1/') && route.request().method()==='GET') { reads.push(url); return route.fulfill({json:[]}); }
   if(url.pathname.endsWith('/functions/v1/studio-albums') || url.pathname.endsWith('/functions/v1/transcriptions')) {
    const body=route.request().postDataJSON(); assert.ok(['list','list_publications'].includes(body.action),'No writes allowed');
    return route.fulfill({json:{albums:[],releases:[],jobs:[]}});
   }
   return route.abort();
  }
  if(url.pathname==='/__production_fixture__') return route.fulfill({contentType:'text/html',body:`<!doctype html><html><body><div id="root"></div><script type="module">
   import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
   await import('/@vite/client');const r=await import('/node_modules/.vite/deps/react.js');const React=r.default||r;const c=await import('/node_modules/.vite/deps/react-dom_client.js');const {createRoot}=c.default||c;
   await import('/index.css');const name=new URL(location.href).searchParams.get('page');const {default:Panel}=await import('/pages/'+name+'.tsx');
   window.draftChanges=0;window.addEventListener('studio-draft-change',()=>window.draftChanges++);
   createRoot(document.getElementById('root')).render(React.createElement('main',{style:{padding:24}},React.createElement(Panel,{selectedBranchSlug:'fixture-branch',branches:[{id:'fixture-id',slug:'fixture-branch',name:'Fixture branch'}],branchSocialAccounts:{},addToast:()=>{},userId:'fixture-user',geminiApiKey:''})));
  </script></body></html>`});
  return route.continue();
 });
 async function open(name,ready){await page.goto(base+'/__production_fixture__?page='+name);await page.getByRole('button',{name:ready,exact:true}).waitFor({timeout:60000}).catch(async e=>{console.error(await page.locator('body').innerText());console.error('READS',reads.map(String));throw e});assert.equal(await page.locator('select:visible').count(),0,name+' no initial competing dropdown');}
 async function compact(name){assert.equal(await page.locator('input:visible,textarea:visible').count(),0,name+' hides editors initially');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,name+' fits width');}
 await open('ClipStudio','Create a Short');await compact('Clips');await page.getByRole('button',{name:'Create a Short',exact:true}).click();assert.equal(await page.locator('textarea:visible').count(),1);assert.equal(await page.getByRole('button',{name:'Generate Script'}).count(),0);await page.getByRole('button',{name:'Paste text',exact:true}).click();await page.getByPlaceholder('Paste article text, notes, transcript, or source excerpts').fill('Fictional source to review');await page.getByRole('button',{name:'Generate Script'}).waitFor();await page.getByRole('button',{name:'Web link',exact:true}).click();assert.ok((await page.getByText('Sources added:',{exact:false}).textContent()).includes('pasted text'));
 await open('TrellisStudio','New session');await compact('Sessions');await page.getByRole('button',{name:'New session',exact:true}).click();assert.equal(await page.locator('select:visible').count(),0);await page.locator('summary').filter({hasText:'Customize sound and length'}).click();assert.ok(await page.locator('select:visible').count()>0);await page.locator('button').filter({hasText:'Rekkrd'}).first().click();assert.ok(await page.evaluate(()=>window.draftChanges)>0);
 await open('TrellisEpisodes','New episode');await compact('Episodes');assert.equal(await page.getByText('YouTube Analytics',{exact:true}).count(),0);await page.getByRole('button',{name:'New episode',exact:true}).click();await page.getByPlaceholder('Late Night Jazz for Vinyl Lovers').waitFor();assert.equal(await page.locator('select:visible').count(),0);
 await open('StudioAlbums','New album');await compact('Albums');await page.getByRole('button',{name:'New album',exact:true}).click();await page.getByRole('heading',{name:'Start an album brief'}).waitFor();await page.getByRole('button',{name:/French Riviera/}).click();assert.ok(await page.evaluate(()=>window.draftChanges)>0);await page.getByRole('button',{name:'Back to albums',exact:true}).click();await compact('Albums closed');
 await page.goto(base+'/__production_fixture__?page=Transcriptions');await page.getByRole('button',{name:'Upload recording.',exact:false}).waitFor();assert.equal(await page.locator('input:not([type=file]):visible,textarea:visible,select:visible').count(),0);assert.equal(await page.getByRole('button',{name:'Transcribe',exact:true}).count(),0);await page.locator('input[type=file]').setInputFiles({name:'fixture.mp3',mimeType:'audio/mpeg',buffer:Buffer.from('fixture')});await page.getByRole('button',{name:'Transcribe',exact:true}).waitFor();assert.equal(await page.locator('select:visible').count(),1);
 for(const name of ['ClipStudio','TrellisStudio','TrellisEpisodes','StudioAlbums','Transcriptions']){await page.setViewportSize({width:390,height:844});await page.goto(base+'/__production_fixture__?page='+name);await page.locator('h1,h2').first().waitFor();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,name+' mobile fits width');}
 assert.ok(reads.some(url=>url.searchParams.get('branch')==='eq.fixture-branch'),'Branch passed to service queries');assert.deepEqual(errors,[]);console.log('PASS: five production pages desktop/mobile, initial disclosures, single scope, progressive controls, source retention and programmatic draft changes. All external traffic mocked/blocked.');
} finally {await browser.close();}
