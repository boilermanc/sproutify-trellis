import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { chromium } = process.env.PLAYWRIGHT_MODULE ? await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href) : await import('playwright');
const base = process.env.STUDIO_TEST_URL || 'http://127.0.0.1:3000';
const browser = await chromium.launch({ headless: true });
const branches = [{ id: 'fixture', slug: 'fixture', name: 'Fixture Garden', is_active: true }, { id: 'other', slug: 'other', name: 'Other Branch', is_active: true }];
try {
 const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
 const errors = []; page.on('pageerror', error => errors.push(error.message));
 await page.route('**/*', async route => {
  const url = new URL(route.request().url());
  if (url.origin !== base) {
   if (url.pathname.endsWith('/functions/v1/media-generation')) {
    const action = route.request().postDataJSON()?.action;
    const responses = { list_projects: { projects: [{id:'project', branch_id:'fixture', name:'Fixture project'}, {id:'other-project', branch_id:'other', name:'Other project'}] }, list_models: {models:[{id:'longcat-video-base',display_name:'LongCat',task_types:['text_to_video','image_to_video']}]}, get_configuration:{configuration:{generation_enabled:true,role_allowed:true,cost_tracking_configured:true}}, list_jobs:{jobs:[]}, list_library:{items:[]} };
    assert.ok(action in responses, 'Unexpected media mutation: '+action);
    return route.fulfill({json:responses[action]});
   }
   if (url.pathname.endsWith('/functions/v1/promo-studio')) {
    const action = route.request().postDataJSON()?.action;
    assert.ok(['list_projects','list_branch_readiness'].includes(action), 'Unexpected promo mutation: '+action);
    return route.fulfill({json: action==='list_projects' ? {projects:[{id:'other',branch_id:'other',title:'Other promo'}]} : {branches:[],can_configure:false}});
   }
   if (url.pathname.includes('/rest/v1/')) return route.fulfill({json:[]});
   return route.abort();
  }
  if(url.pathname==='/__visual_fixture__') return route.fulfill({contentType:'text/html',body:`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root" style="padding:16px"></div><script type="module">
   import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
   await import('/@vite/client'); const r=await import('/node_modules/.vite/deps/react.js'); const React=r.default||r; const c=await import('/node_modules/.vite/deps/react-dom_client.js'); const {createRoot}=c.default||c;
   const {default:Panel}=await import('/pages/'+new URLSearchParams(location.search).get('page')+'.tsx'); await import('/index.css');
   window.draftChanges=0;window.addEventListener('studio-draft-change',()=>window.draftChanges++);
   const branches=${JSON.stringify(branches)};createRoot(document.getElementById('root')).render(React.createElement(Panel,{selectedBranchSlug:'fixture',branches,branchContext:{allBranches:branches,activeBranchSlugs:['fixture','other'],isAllSelected:true},apiKeys:{},profiles:[],spokeConnections:[],addToast:()=>{}}));
  </script></body></html>`});
  return route.continue();
 });
 async function open(name,heading){await page.goto(base+'/__visual_fixture__?page='+name);await page.getByRole('heading',{name:heading,exact:true}).waitFor();await page.waitForTimeout(250);assert.deepEqual(errors,[]);assert.equal(await page.locator('select option').filter({hasText:'Other Branch'}).count(),0);}
 async function mobile(name){await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),name+' mobile overflow');await page.setViewportSize({width:1280,height:900});}
 await open('VideoAdLab','What kind of ad?');assert.equal(await page.locator('summary').filter({hasText:'Browse saved creatives'}).isVisible(),true);await mobile('Creative Studio');console.log('PASS Creative Studio: format-first, one branch, collapsed library, mobile');
 await open('CardStudio','1. Describe your cards');assert.equal(await page.getByText('How many concepts',{exact:true}).isVisible(),false);assert.equal(await page.getByRole('heading',{name:/2. Review concepts/}).isVisible(),false);await page.locator('button[title]').first().click();assert.ok(await page.evaluate(()=>window.draftChanges)>0);assert.ok((await page.locator('textarea').inputValue()).length>0);await mobile('Card Studio');console.log('PASS Card Studio: brief-first, hidden empty gallery, preset draft protection, mobile');
 await open('MediaGeneration','1. Choose or create a project');assert.equal(await page.getByRole('heading',{name:'3. Describe the shot'}).count(),0);assert.equal(await page.locator('option').filter({hasText:'Other project'}).count(),0);await page.getByLabel('Project',{exact:true}).selectOption('project');await page.getByRole('heading',{name:'3. Describe the shot'}).waitFor();assert.equal(await page.getByRole('heading',{name:'Queue & results'}).count(),0);await mobile('Media Generation');console.log('PASS Media Generation: project gating, scoped projects, hidden empty queue, mobile');
 await open('PromoStudio','Start with intent');assert.equal(await page.getByText('Other promo',{exact:true}).count(),0);assert.equal(await page.getByRole('heading',{name:'Voice and music'}).count(),0);await mobile('Promo Studio');console.log('PASS Promo Studio: scoped project start, no premature controls, mobile');
 assert.deepEqual(errors,[]);console.log('PASS all four pages: no runtime exceptions or live writes');
} finally {await browser.close();}
