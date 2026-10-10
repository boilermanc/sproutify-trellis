import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
const load = async name => JSON.parse(await fs.readFile(new URL('../n8n-blueprints/'+name,import.meta.url),'utf8'));
const frame=await load('Trellis-Video-Ad-Frame-v1.json'), render=await load('Trellis-Video-Ad-Render-v1.json');
const node=(j,name)=>j.nodes.find(n=>n.name===name);
const run=(j,name,items,json={})=>new Function('$','$json',node(j,name).parameters.jsCode)(name=>({item:{json:items[name]},all:()=>items[name]?[{json:items[name]}]:[]}),json);
const body={job_id:'00000000-0000-4000-8000-000000000001',branch:'arbitrary-brand',script:'Meet our brand. Explore something new today.',video_duration:10};
test('video entry point creates a frame and has no route to a video provider',()=>{
 assert.equal(node(frame,'Webhook').parameters.path,'trellis-video-ad-generate');
 assert.ok(!frame.nodes.some(n=>/kling|Generate Script/i.test(n.name)));
 assert.equal(frame.connections['Update: Generating Frame'].main[0][0].node,'Generate Frame (Nano Banana)');
 const stop=node(frame,'Update: Awaiting Approval').parameters.fieldsUi.fieldValues;
 assert.equal(stop.find(f=>f.fieldId==='status').fieldValue,'awaiting_approval');
 assert.equal(frame.connections['Update: Awaiting Approval'],undefined);
});
test('edited script is preserved, requires meaningful content, and is never silently shortened',()=>{
 const preserved=run(frame,'Validate Video Request',{'Webhook':{body}})[0].json;
 assert.equal(preserved.script,body.script);assert.equal(preserved.duration,10);
 assert.throws(()=>run(frame,'Validate Video Request',{'Webhook':{body:{...body,script:' '}}}));
 assert.throws(()=>run(frame,'Validate Video Request',{'Webhook':{body:{...body,script:'word '.repeat(30)}}}));
 assert.equal(run(frame,'Validate Video Request',{'Webhook':{body:{...body,video_duration:30}}})[0].json.duration,10);
 const field=node(frame,'Upsert Job Record').parameters.fieldsUi.fieldValues.find(f=>f.fieldId==='script');
 assert.match(field.fieldValue,/Validate Video Request.*script/);
});
const job={id:body.job_id,frame_url:'https://example.test/frame.png',script:body.script,status:'rendering',progress:50,frame_approved_at:'2026-10-10T12:00:00Z',duration_seconds:10};
const input=j=>({'Read Job':j,'Webhook':{body:{job_id:j.id,frame_url:job.frame_url,frame_approved_at:job.frame_approved_at}}});
test('render gate rejects missing approval, stale frame, archived, completed, and duplicate jobs',()=>{
 for(const edit of [{status:'awaiting_approval'},{frame_approved_at:null},{frame_url:'https://example.test/changed.png'},{archived_at:'2026-10-10'},{video_url:'https://example.test/video.mp4'},{progress:55},{script:''}]) assert.throws(()=>run(render,'Build Motion Prompt',input({...job,...edit})));
 assert.equal(node(render,'Build Motion Prompt').onError,'stopWorkflow');
 assert.match(node(render,'Update: Rendering').parameters.filterString,/status=eq.rendering&progress=eq.50/);
});
test('both pipeline prompts contain the exact edited words and Fal receives the approved frame with audio',()=>{
 for(const pipeline of ['talking_head','full_scene']){
  const result=run(render,'Build Motion Prompt',input({...job,pipeline}))[0].json;
  assert.ok(result.prompt.includes(body.script));assert.equal(result.image_url,job.frame_url);
  if(pipeline==='full_scene')assert.match(result.prompt,/offscreen narrator/);
  const expression=node(render,'Submit Kling (Fal.ai)').parameters.jsonBody.slice(3,-2).trim();
  const payload=JSON.parse(new Function('$','return '+expression)(()=>({item:{json:result}})));
  assert.equal(payload.generate_audio,true);assert.equal(payload.start_image_url,job.frame_url);assert.equal(payload.duration,'10');assert.equal(payload.image_url,undefined);
 }
});
