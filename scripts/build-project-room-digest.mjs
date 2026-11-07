import { readFile, writeFile } from 'node:fs/promises';

// Generate the n8n Code node from the tested formatter, never a second copy.
const source = await readFile(new URL('../supabase/functions/_shared/project-room-daily-report.mjs', import.meta.url), 'utf8');
if (/^import /m.test(source)) throw new Error('The digest formatter must be self-contained.');
const formatter = source.replace(/^export /gm, '');
const node = (name, type, version, position, parameters) => ({name, type:`n8n-nodes-base.${type}`, typeVersion:version, position, parameters});
const workflow = {
  name: 'Trellis: Daily Shared Client Brief', active:false,
  settings: { timezone:'America/New_York', executionOrder:'v1', saveDataSuccessExecution:'none', saveDataErrorExecution:'none', saveManualExecutions:false },
  nodes: [
    node('Daily at 5 AM Eastern', 'scheduleTrigger', 1.2, [0,0], {rule:{interval:[{field:'cronExpression',expression:'0 5 * * *'}]}}),
    node('Read shared room context', 'httpRequest', 4.2, [240,0], {
      method:'POST',url:'https://horvjqqifgrzxesuxtfm.supabase.co/functions/v1/project-room-bridge',
      authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',
      sendBody:true,specifyBody:'json',jsonBody:'={"action":"context"}',options:{timeout:30000},
    }),
    node('Prepare daily report', 'code', 2, [480,0], {jsCode: `${formatter}\nconst context = $input.first().json;\nif (!Array.isArray(context.rooms)) throw new Error('Trellis returned no valid room context');\nconst date = $now.setZone('America/New_York').toFormat('yyyy-MM-dd');\nconst sent = $getWorkflowStaticData('global');\nif (sent.lastSentDate === date) return [];\nconst text = buildDailyRoomReport(context, date);\nreturn [{json:{date,text}}];`}),
    node('Send to chief-channel', 'httpRequest', 4.2, [720,0], {
      method:'POST',url:'https://slack.com/api/chat.postMessage',
      authentication:'predefinedCredentialType',nodeCredentialType:'slackOAuth2Api',
      sendBody:true,specifyBody:'json',jsonBody:'={{ JSON.stringify({channel:"C0C0UUF8P2T",text:$json.text,parse:"none",link_names:false,unfurl_links:false,unfurl_media:false}) }}',options:{timeout:30000},
    }),
    node('Confirm delivery', 'code', 2, [960,0], {jsCode:"const result = $input.first().json;\nif (result.ok !== true || !result.ts || result.channel !== 'C0C0UUF8P2T') throw new Error('Daily brief delivery was not confirmed. Inspect Slack before retrying.');\nconst sent = $getWorkflowStaticData('global');\nsent.lastSentDate = $('Prepare daily report').first().json.date;\nsent.messageTimestamp = result.ts;\nreturn [{json:{delivered:true,date:sent.lastSentDate,channel:result.channel,messageTimestamp:result.ts}}];"}),
    node('Setup before publishing', 'stickyNote', 1, [0,-320], {width:960,height:260,content:'## Prepared, not active\nSelect dedicated Header Auth (x-project-room-key) for context, and the existing Slack OAuth connection for delivery. No secrets belong in this workflow JSON. Deploy shared rooms and the scoped read-only bridge first. Configure only rooms explicitly approved for this channel and both recipients. Verify a manual test appears in #chief-channel, then publish with release approval.\n\nDaily at 5 AM Eastern. ChatGPT Meetings and automatic calendar matching are disconnected. This reports saved room evidence. Execution payload saving is disabled. Automatic retries are off: after uncertain Slack delivery, inspect the channel before replay. Static date guard prevents later successful scheduled duplicates, not concurrent executions or manual tests. Configure an n8n error workflow for operational failures.'}),
  ],
  connections:{},
};
const names = workflow.nodes.slice(0,5).map(n=>n.name);
for (let i=0;i<names.length-1;i++) workflow.connections[names[i]]={main:[[{node:names[i+1],type:'main',index:0}]]};
await writeFile(new URL('../n8n-blueprints/PR1-daily-client-brief.json',import.meta.url),JSON.stringify(workflow,null,2)+'\n');
