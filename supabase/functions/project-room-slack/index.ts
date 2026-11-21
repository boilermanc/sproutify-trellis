import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.90.1';
import { validAudience, sharedSlackRooms, proposalFingerprint, proposalNotification, easternDate, morningSummary, replyNotes, SLACK_TS } from '../_shared/project-room-slack.mjs';
import { alertBlockedRun } from '../project-rooms/observability.ts';

const url=Deno.env.get('SUPABASE_URL')!;
const channel='C0C0UUF8P2T';
const checked=(result:any)=>{if(result.error) throw new Error('Database operation failed');return result.data;};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
async function authorized(req:Request) {
  const key=req.headers.get('apikey')||'';
  if(key.length<32 || key.length>2048) return false;
  const headers:Record<string,string>={apikey:key,'Content-Type':'application/json'};
  if(key.startsWith('eyJ')) headers.Authorization=`Bearer ${key}`;
  try {
    const response=await fetch(`${url}/rest/v1/rpc/project_room_slack_service_check`,{method:'POST',headers,body:'{}',signal:AbortSignal.timeout(5000),redirect:'error'});
    return response.ok && await response.json()===true;
  } catch {return false;}
}
async function incident(room:string,code:string) {
  await alertBlockedRun('run_blocked',{room_id:room,run_id:crypto.randomUUID(),stage:'slack_integration',elapsed_ms:0,failures:[{provider:'n8n',code,http_status:undefined}]});
}
Deno.serve(async(req:Request)=>{
  if(req.method!=='POST') return json({error:'POST required'},405);
  if(!await authorized(req)) return json({error:'Not authorized'},401);
  const db=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  try {
    const raw=await req.text(); if(raw.length>250000) return json({error:'Request too large'},413);
    let body:any; try{body=JSON.parse(raw);}catch{return json({error:'Invalid JSON'},400);}
    const config=checked(await db.from('project_room_slack_config').select('*').eq('channel',channel).maybeSingle());
    if(!config?.enabled) return json({error:'Slack integration is disabled'},503);
    if(body.action==='complete') {
      if(typeof body.job_id!=='string' || !['post','poll'].includes(body.kind)) return json({error:'Invalid job'},400);
      const message=checked(await db.from('project_room_slack_messages').select('*').eq('id',body.job_id).eq('channel',channel).maybeSingle());
      if(!message) return json({error:'Unknown job'},404);
      const result=body.result;
      if(body.kind==='post') {
        if(message.status==='sent') return json({status:'duplicate'});
        if(message.status!=='sending') return json({error:'Job not claimed'},409);
        if(result?.ok!==true || result.channel!==channel || !SLACK_TS.test(result.ts||'')) {
          checked(await db.from('project_room_slack_messages').update({status:'held'}).eq('id',message.id).eq('status','sending'));
          await incident(message.room_id||message.id,'slack_delivery_unconfirmed');
          return json({status:'held'});
        }
        checked(await db.from('project_room_slack_messages').update({status:'sent',delivery_ts:result.ts}).eq('id',message.id).eq('status','sending'));
        console.info(JSON.stringify({event:'slack_delivered',id:message.id,room_id:message.room_id,channel,ts:result.ts}));
        return json({status:'sent'});
      }
      if(message.status!=='sent' || message.kind!=='proposal') return json({error:'Unknown thread'},400);
      if(!checked(await db.rpc('project_room_slack_room_allowed',{p_channel:channel,p_room:message.room_id}))) return json({status:'denied'});
      const sent=checked(await db.from('project_room_slack_messages').select('delivery_ts').eq('channel',channel).eq('thread_ts',message.delivery_ts).eq('status','sent'));
      const automationReplies=new Set(sent.map((m:any)=>m.delivery_ts));
      const notes=replyNotes(result,message.delivery_ts,config).filter((n:any)=>!automationReplies.has(n.ts));
      const statuses=[];
      for(const note of notes) statuses.push(checked(await db.rpc('save_project_room_slack_note',{
        p_channel:channel,p_thread:message.delivery_ts,p_ts:note.ts,p_user:note.user,p_text:note.text,
      })));
      // If the room is running, leave the cursor unchanged and safely retry later.
      if(statuses.includes('busy')) return json({status:'busy'});
      if(statuses.some(s=>!['saved','duplicate'].includes(s))) return json({status:'denied'});
      const next=result.response_metadata?.next_cursor||'';
      const timestamps=result.messages.map((m:any)=>m.ts).filter((ts:any)=>SLACK_TS.test(ts||''));
      const after=[message.reply_after||message.delivery_ts,...timestamps].sort().at(-1);
      const patch=next?{reply_cursor:next}:{reply_cursor:'',reply_after:after};
      checked(await db.from('project_room_slack_messages').update(patch).eq('id',message.id).eq('reply_cursor',message.reply_cursor));
      console.info(JSON.stringify({event:'slack_notes_processed',room_id:message.room_id,saved:statuses.filter(s=>s==='saved').length}));
      return json({status:'processed',saved:statuses.filter(s=>s==='saved').length});
    }
    if(!['sync','test'].includes(body.action)) return json({error:'Unsupported action'},400);
    if(!validAudience(body.membership,config)) {
      await incident(config.id,'slack_audience_check_failed');
      return json({error:'Channel membership check failed; nothing sent'},409);
    }
    const [roomResult,memberResult,userResult]=await Promise.all([
      db.from('project_rooms').select('id,client_id,title,kind,status,state,created_at,updated_at,client:project_room_clients(id,name,archived_at,follow_up_date,follow_up_note)').eq('kind','client'),
      db.from('project_room_members').select('room_id,user_id').in('user_id',Object.values(config.identities)),
      db.from('trellis_users').select('auth_user_id,status,role').in('auth_user_id',Object.values(config.identities)),
    ]);
    const rooms=sharedSlackRooms(checked(roomResult),checked(memberResult),checked(userResult),config);
    const snapshots=checked(await db.from('project_room_slack_snapshots').select('id,fingerprint'));
    async function enqueue(key:string,kind:string,text:string,roomId:string|null=null) {
      checked(await db.from('project_room_slack_messages').upsert({dedupe_key:key,channel,kind,text,room_id:roomId},{onConflict:'dedupe_key',ignoreDuplicates:true}));
    }
    for(const room of rooms) {
      if(!room.state?.proposal) continue;
      const fingerprint=await proposalFingerprint(room);
      const previous=snapshots.find((s:any)=>s.id===room.id);
      const changed=previous && previous.fingerprint!==fingerprint;
      const fresh=!previous && room.state.proposal.updated_at>=config.created_at;
      if(changed||fresh) await enqueue(`proposal:${room.id}:${fingerprint}`,'proposal',proposalNotification(room),room.id);
      checked(await db.from('project_room_slack_snapshots').upsert({id:room.id,fingerprint,updated_at:new Date().toISOString()}));
    }
    const {day,hour}=easternDate();
    if(body.action==='test') {
      const room=rooms.find((r:any)=>r.id===body.room_id && r.state?.proposal);
      if(!room) return json({error:'Test room is not shared with the audience'},400);
      await enqueue(`test:${day}:${room.id}`,'proposal',proposalNotification(room,true),room.id);
    }
    if(hour>=5 || body.action==='test') {
      const text=morningSummary(rooms,day);
      await enqueue(`digest:${day}`,'digest',text);
      // Rebuild a pending digest from current membership, never publish stale access.
      checked(await db.from('project_room_slack_messages').update({text}).eq('dedupe_key',`digest:${day}`).eq('status','pending'));
      checked(await db.from('project_room_slack_messages').update({status:'cancelled'}).eq('kind','digest').eq('status','pending').neq('dedupe_key',`digest:${day}`));
    }
    const stale=checked(await db.from('project_room_slack_messages').update({status:'held'}).eq('status','sending').lt('attempted_at',new Date(Date.now()-600000).toISOString()).select('id,room_id'));
    for(const item of stale) await incident(item.room_id||item.id,'slack_receipt_missing');
    const outgoing=checked(await db.rpc('claim_project_room_slack_messages',{p_channel:channel}));
    const allowed=new Set(rooms.map((r:any)=>r.id));
    const threads=checked(await db.from('project_room_slack_messages').select('*').eq('channel',channel).eq('kind','proposal').eq('status','sent').order('created_at',{ascending:true}));
    const jobs=outgoing.map((m:any)=>({job_id:m.id,kind:'post',method:'chat.postMessage',payload:{channel,text:m.text,...(m.thread_ts?{thread_ts:m.thread_ts}:{}),metadata:{event_type:'trellis_room_notification',event_payload:{message_id:m.id}},unfurl_links:false,unfurl_media:false,parse:'none'}}));
    for(const thread of threads.filter((m:any)=>allowed.has(m.room_id))) jobs.push({job_id:thread.id,kind:'poll',method:'conversations.replies',payload:{channel,ts:thread.delivery_ts,oldest:thread.reply_after||thread.delivery_ts,include_all_metadata:true,limit:100,...(thread.reply_cursor?{cursor:thread.reply_cursor}:{})}});
    return json({jobs});
  } catch {
    await incident('00000000-0000-0000-0000-000000000000','slack_integration_failed');
    return json({error:'Slack integration failed; technical alert sent'},500);
  }
});
