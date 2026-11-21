import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildDailyRoomReport} from '../supabase/functions/_shared/project-room-daily-report.mjs';
const workflow=JSON.parse(readFileSync(new URL('../n8n-blueprints/PR1-daily-client-brief.json',import.meta.url),'utf8'));
const code=name=>workflow.nodes.find(n=>n.name===name).parameters.jsCode;
test('daily workflow uses tested formatter, escapes evidence and skips a confirmed scheduled date',()=>{
  const context={rooms:[{id:'room',title:'<@channel>',status:'blocked',questions:['Next steps?']}]};
  const prepare=new Function('$input','$now','$getWorkflowStaticData',code('Prepare daily report'));
  const state={};
  const args=[{first:()=>({json:context})},{setZone:()=>({toFormat:()=> '2026-11-07'})},()=>state];
  const result=prepare(...args);
  assert.equal(result[0].json.text,buildDailyRoomReport(context,'2026-11-07'));
  assert.ok(!result[0].json.text.includes('<@channel>'));
  state.lastSentDate='2026-11-07';
  assert.deepEqual(prepare(...args),[]);
});
test('Slack application errors and wrong destination never mark delivery',()=>{
  const confirm=new Function('$input','$getWorkflowStaticData','$',code('Confirm delivery'));
  const state={};
  const readDate=()=>({first:()=>({json:{date:'2026-11-07'}})});
  assert.throws(()=>confirm({first:()=>({json:{ok:false,error:'not_in_channel'}})},()=>state,readDate));
  assert.deepEqual(state,{});
  assert.throws(()=>confirm({first:()=>({json:{ok:true,ts:'123',channel:'wrong'}})},()=>state,readDate));
  confirm({first:()=>({json:{ok:true,ts:'123',channel:'C0C0UUF8P2T'}})},()=>state,readDate);
  assert.equal(state.lastSentDate,'2026-11-07');
  assert.equal(state.messageTimestamp,'123');
});
test('blueprint is inactive, uses saved credentials, timezone and bounded requests',()=>{
  assert.equal(workflow.active,false);
  assert.equal(workflow.settings.timezone,'America/New_York');
  assert.equal(workflow.settings.saveDataSuccessExecution,'none');
  const requests=workflow.nodes.filter(n=>n.type==='n8n-nodes-base.httpRequest');
  assert.equal(requests.length,2);
  assert.ok(requests.every(n=>n.parameters.authentication && n.parameters.options.timeout===30000 && !n.retryOnFail));
});
