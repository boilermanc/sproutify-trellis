import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const workflow=JSON.parse(readFileSync(new URL('../n8n-blueprints/E9-youtube-analytics-sync.json',import.meta.url)));
const node=name=>workflow.nodes.find(n=>n.name===name);
const job=(source='episode')=>({source_type:source,youtube_account_id:`account-${source}`,channel_id:`channel-${source}`,youtube_video_id:`video-${source}`,episode_id:source==='episode'?'episode':null,publication_id:source==='episode'?'publication':null,studio_album_id:source==='studio'?'album':null,studio_publication_id:source==='studio'?'studio-publication':null,start_date:'2026-11-20',end_date:'2026-11-20'});
const response=(source='episode',views=12)=>({status:'ok',job:job(source),statistics:{viewCount:'500'},analytics:{columnHeaders:['day','subscribersLost','views','estimatedMinutesWatched','averageViewDuration','averageViewPercentage','subscribersGained','likes','comments','shares'].map(name=>({name})),rows:[['2026-11-20',2,views,13.5,67,50.1,4,6,3,1]]}});
const warnings=[];
const build=responses=>new Function('$input','console',node('Build Metric Rows').parameters.jsCode)({all:()=>responses.map(json=>({json}))},{warn:message=>warnings.push(message)});
test('mixed channels and partial failures never shift provenance or metrics between items',()=>{
  const rows=build([{status:'skipped',reason:'missing_youtube_account'},response('studio',55),{status:'unavailable',reason:'reconnect_required'},response('episode',99)]).map(n=>n.json);
  assert.equal(rows.length,2);
  assert.equal(rows[0].studio_publication_id,'studio-publication');
  assert.equal(rows[0].publication_id,null);
  assert.equal(rows[0].views,55);
  assert.equal(rows[1].publication_id,'publication');
  assert.equal(rows[1].studio_publication_id,null);
  assert.equal(rows[1].views,99);
  assert.equal(rows[0].raw.channel_id,'channel-studio');
  assert.equal(rows[1].raw.channel_id,'channel-episode');
  assert.equal(rows[0].subscribers_lost,2);
  assert.equal(rows[0].estimated_minutes_watched,13.5);
  assert.match(warnings.at(-1),/"skipped":1,"unavailable":1/);
});
test('delayed empty reports and unavailable connections create no fabricated zero metrics',()=>{
  const empty=response(); empty.analytics.rows=[];
  assert.deepEqual(build([empty,{status:'unavailable',reason:'provider_error'}]),[]);
});
test('unverified, malformed or out-of-window reports cannot reach upsert',()=>{
  const badIdentity=response(); delete badIdentity.job.channel_id;
  const badDate=response(); badDate.analytics.rows[0][0]='2026-11-19';
  const badNumber=response(); badNumber.analytics.rows[0][2]='nope';
  const badHeaders=response(); badHeaders.analytics.columnHeaders=[];
  const partial=response(); partial.analytics.columnHeaders.pop(); partial.analytics.rows[0].pop();
  for(const input of [badIdentity,badDate,badNumber,badHeaders,partial,{status:'unexpected'}]) assert.throws(()=>build([input]));
  for(const value of [null,undefined,'',false,'12']) { const invalid=response(); invalid.analytics.rows[0][2]=value; assert.throws(()=>build([invalid])); }
});
test('workflow uses service-only analytics proxy and sends publication identity, never a Google token',()=>{
  const fetch=node('Fetch Account Analytics');
  assert.equal(fetch.parameters.nodeCredentialType,'supabaseApi');
  assert.equal(fetch.parameters.method,'POST');
  assert.equal(fetch.parameters.url,'https://horvjqqifgrzxesuxtfm.supabase.co/functions/v1/youtube-analytics');
  const studio={source_type:'studio',studio_publication_id:'publication-studio',start_date:'2026-11-20',end_date:'2026-11-20'};
  const body=new Function('$json',`return (${fetch.parameters.jsonBody.slice(3,-2)});`)(studio);
  assert.deepEqual(body,{source_type:'studio',publication_id:'publication-studio',start_date:'2026-11-20',end_date:'2026-11-20'});
  assert.equal(workflow.nodes.some(n=>/OAuth2Api/.test(n.parameters.nodeCredentialType||'')),false);
  assert.equal(JSON.stringify(workflow).includes('access_token'),false);
  for(const [from,to] of [['Build Video Jobs','Fetch Account Analytics'],['Fetch Account Analytics','Build Metric Rows'],['Build Metric Rows','Batch Metric Rows']]) assert.equal(workflow.connections[from].main[0][0].node,to);
});
