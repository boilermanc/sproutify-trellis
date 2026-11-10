import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validAudience,sharedSlackRooms,proposalFingerprint,proposalNotification,easternDate,latestClientRooms,morningSummary,replyNotes } from '../supabase/functions/_shared/project-room-slack.mjs';
const config={identities:{U1:'clint',U2:'sheree'},allowed_bots:['B1']};
test('Slack workflow exports preserve routing, receipt processing and execution privacy',()=>{
 const read=name=>JSON.parse(readFileSync(new URL(`../n8n-blueprints/${name}.json`,import.meta.url),'utf8'));
 const main=read('PR2-chief-channel-rooms'), errors=read('PR3-chief-channel-errors');
 for(const flow of [main,errors]) {
  assert.equal(flow.active,false,'imports must not start a duplicate sender');
  assert.equal(flow.settings.saveDataSuccessExecution,'none');
  assert.equal(flow.settings.saveDataErrorExecution,'none');
  assert.equal(flow.settings.saveManualExecutions,false);
 }
 assert.equal(main.settings.errorWorkflow,'qGfWOu2f3TBfg-vqL7y38');
 assert.equal(main.nodes.find(n=>n.name==='Every five minutes').parameters.rule.interval[0].expression,'*/5 * * * *');
 assert.equal(main.connections['Deliver or read thread'].main[0][0].node,'Save receipt or room notes');
 assert.match(errors.nodes.find(n=>n.name==='Notify sweetwater_tech').parameters.jsonBody,/C0CDFTGV8F7/);
 assert.match(main.nodes.find(n=>n.name==='Save receipt or room notes').parameters.jsonBody,/action:"complete"/);
});
const room={id:'r1',client_id:'c1',kind:'client',title:'Client',status:'awaiting_user',created_at:'2026-11-09',client:{name:'Client'},state:{proposal:{title:'Proposal',objective:'Useful outcome',items:[{quantity:10,unit_cents:15000,optional:false,frequency:'once'}]},proposal_generation:{review:{status:'passed'}}}};
test('channel audience fails closed on missing people, unknown members, incomplete pages and Slack errors',()=>{
 assert.equal(validAudience({ok:true,members:['U1','U2','B1']},config),true);
 for(const membership of [{ok:false,members:['U1','U2']},{ok:true,members:['U1']},{ok:true,members:['U1','U2','stranger']},{ok:true,members:['U1','U2'],response_metadata:{next_cursor:'more'}}]) assert.equal(validAudience(membership,config),false);
});
test('only active company rooms shared with both active operators are eligible',()=>{
 const members=[{room_id:'r1',user_id:'clint'},{room_id:'r1',user_id:'sheree'}],users=['clint','sheree'].map(auth_user_id=>({auth_user_id,role:'operator',status:'active'}));
 assert.equal(sharedSlackRooms([room],members,users,config).length,1);
 assert.equal(sharedSlackRooms([room],members.slice(1),users,config).length,0);
 assert.equal(sharedSlackRooms([room],members,users.slice(1),config).length,0);
 for(const change of [{kind:'product'},{status:'cancelled'},{title:'TEST ONLY'},{client:{archived_at:'now'}}]) assert.equal(sharedSlackRooms([{...room,...change}],members,users,config).length,0);
});
test('notes do not retrigger proposals; pricing and chief findings do',async()=>{
 const first=await proposalFingerprint(room);
 assert.equal(await proposalFingerprint({...room,state:{...room.state,notes:[{text:'hello'}]}}),first);
 assert.notEqual(await proposalFingerprint({...room,state:{...room.state,proposal:{...room.state.proposal,objective:'Changed outcome'}}}),first);
 assert.notEqual(await proposalFingerprint({...room,state:{...room.state,proposal_generation:{review:{status:'needs_review'}}}}),first);
});
test('proposal notifications explain draft status, outcome and thread-only notes and escape mentions',()=>{
 const text=proposalNotification({...room,title:'<!channel> <@U1>'});
 assert.match(text,/\$1,500/); assert.match(text,/Useful outcome/);assert.match(text,/do not approve pricing/);assert.doesNotMatch(text,/<!channel>|<@U1>/);
 assert.match(proposalNotification({...room,state:{...room.state,proposal_generation:{review:{status:'needs_review'}}}}),/Needs rework/);
});
test('daily report uses Eastern time across daylight saving changes and newest room per client',()=>{
 assert.deepEqual(easternDate(new Date('2026-11-09T09:59:00Z')),{day:'2026-11-09',hour:4});
 assert.deepEqual(easternDate(new Date('2026-07-09T09:00:00Z')),{day:'2026-07-09',hour:5});
 assert.equal(latestClientRooms([room,{...room,id:'new',created_at:'2026-11-10'}])[0].id,'new');
});
test('morning summary includes each client, review actions and due follow-ups without claiming meetings access',()=>{
 const rooms=['StyleBAR','Painting company','ACA'].map((name,i)=>({...room,id:`r${i}`,client_id:`c${i}`,client:{name,follow_up_date:'2026-11-08',follow_up_note:'Call owner'},state:{...room.state,notes:[{text:'Confirm <!channel> scope'}]}}));
 const summary=morningSummary(rooms,'2026-11-09');
 for(const name of ['StyleBAR','Painting company','ACA']) assert.ok(summary.includes(name));
 assert.match(summary,/Follow up: 2026-11-08/);
 assert.match(summary,/Draft ready to review/);
 assert.match(summary,/Calendar and ChatGPT Meetings are not connected/);
 assert.doesNotMatch(summary,/<!channel>/);
});
test('replies from Clint and Sheree are accepted only on the mapped thread; bot/edit/stranger replies are ignored',()=>{
 const thread='1794220000.000001';
 const msg={type:'message',user:'U1',ts:'1794220001.000001',thread_ts:thread,text:'Please check the outcome.'};
 const notes=replyNotes({ok:true,messages:[msg,{...msg,user:'U2',ts:'1794220002.000001'}, {...msg,user:'other'},{...msg,bot_id:'bot'}, {...msg,subtype:'message_changed'}, {...msg,edited:{}},{...msg,thread_ts:'wrong'},{...msg,ts:thread}]},thread,config);
 assert.deepEqual(notes.map(n=>n.user),['U1','U2']);
 assert.throws(()=>replyNotes({ok:false},thread,config));
 assert.throws(()=>replyNotes({ok:true,messages:[],has_more:true},thread,config));
});
