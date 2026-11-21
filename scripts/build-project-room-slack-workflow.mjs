import { writeFileSync } from 'node:fs';
const bridge='https://horvjqqifgrzxesuxtfm.supabase.co/functions/v1/project-room-slack';
const slackCredential={slackOAuth2Api:{id:'KFLz5xO2rHw2YBFb',name:'Slack account'}};
const serviceCredential={httpHeaderAuth:{id:'Z5ipO5Gv5XRbxei1',name:'Trellis Supabase Secret Key'}};
const http=(id,name,position,parameters,credentials)=>({id,name,position,type:'n8n-nodes-base.httpRequest',typeVersion:4.2,parameters,credentials});
const slack={authentication:'predefinedCredentialType',nodeCredentialType:'slackOAuth2Api'};
const service={method:'POST',url:bridge,authentication:'genericCredentialType',genericAuthType:'httpHeaderAuth',sendBody:true,specifyBody:'json',options:{timeout:30000}};
const nodes=[
 {id:'schedule',name:'Every five minutes',type:'n8n-nodes-base.scheduleTrigger',typeVersion:1.2,position:[0,0],parameters:{rule:{interval:[{field:'cronExpression',expression:'*/5 * * * *'}]}}},
 {id:'manual',name:'Test shared room',type:'n8n-nodes-base.manualTrigger',typeVersion:1,position:[0,200],parameters:{}},
 http('members','Check chief-channel audience',[250,0],{...slack,url:'https://slack.com/api/conversations.members',sendQuery:true,queryParameters:{parameters:[{name:'channel',value:'C0C0UUF8P2T'},{name:'limit',value:'200'}]},options:{timeout:15000}},slackCredential),
 http('sync','Prepare authorized jobs',[500,0],{...service,jsonBody:'={{ JSON.stringify({action: ["manual","test"].includes($execution.mode) ? "test" : "sync", room_id:"a96d8291-a318-4b35-a375-83c444e264a8", membership:$json}) }}'},serviceCredential),
 {id:'split',name:'Split jobs',type:'n8n-nodes-base.splitOut',typeVersion:1,position:[750,0],parameters:{fieldToSplitOut:'jobs',options:{}}},
 http('slack','Deliver or read thread',[1000,0],{...slack,method:'={{ $json.kind === "poll" ? "GET" : "POST" }}',url:'={{ "https://slack.com/api/" + $json.method }}',sendQuery:'={{ $json.kind === "poll" }}',specifyQuery:'json',jsonQuery:'={{ JSON.stringify($json.payload) }}',sendBody:'={{ $json.kind === "post" }}',specifyBody:'json',jsonBody:'={{ JSON.stringify($json.payload) }}',options:{timeout:15000,batching:{batch:{batchSize:1,batchInterval:1200}}}},slackCredential),
 http('complete','Save receipt or room notes',[1250,0],{...service,jsonBody:'={{ JSON.stringify({action:"complete",job_id:$("Split jobs").item.json.job_id,kind:$("Split jobs").item.json.kind,result:$json}) }}'},serviceCredential),
];
const connections={};
for(const [a,b] of [['Every five minutes','Check chief-channel audience'],['Test shared room','Check chief-channel audience'],['Check chief-channel audience','Prepare authorized jobs'],['Prepare authorized jobs','Split jobs'],['Split jobs','Deliver or read thread'],['Deliver or read thread','Save receipt or room notes']]) connections[a]={main:[[{node:b,type:'main',index:0}]]};
const workflow={name:'Trellis: Chief-channel rooms and morning summary',nodes,connections,active:false,settings:{errorWorkflow:'qGfWOu2f3TBfg-vqL7y38',executionOrder:'v1',binaryMode:'separate',availableInMCP:false,timeSavedMode:'fixed',callerPolicy:'workflowsFromSameOwner',saveDataSuccessExecution:'none',saveDataErrorExecution:'none',saveManualExecutions:false}};
writeFileSync(new URL('../n8n-blueprints/PR2-chief-channel-rooms.json',import.meta.url),JSON.stringify(workflow,null,2)+'\n');
const errorWorkflow={name:'Trellis: Chief-channel technical error handler',active:false,nodes:[
 {id:'error',name:'Workflow failed',type:'n8n-nodes-base.errorTrigger',typeVersion:1,position:[0,0],parameters:{}},
 {id:'test',name:'Test technical alert',type:'n8n-nodes-base.manualTrigger',typeVersion:1,position:[0,200],parameters:{}},
 http('notify','Notify sweetwater_tech',[300,0],{...slack,method:'POST',url:'https://slack.com/api/chat.postMessage',sendBody:true,specifyBody:'json',jsonBody:'={{ JSON.stringify({channel:"C0CDFTGV8F7",text:($json.workflow ? "Trellis chief-channel automation failed. Review its n8n workflow and Trellis integration logs." : "TEST — Trellis chief-channel technical alerts stay in sweetwater_tech. Proposal and morning updates go to chief-channel."),unfurl_links:false,unfurl_media:false}) }}',options:{timeout:15000}},slackCredential),
],connections:{'Workflow failed':{main:[[{node:'Notify sweetwater_tech',type:'main',index:0}]]},'Test technical alert':{main:[[{node:'Notify sweetwater_tech',type:'main',index:0}]]}},settings:{...workflow.settings,errorWorkflow:undefined,executionTimeout:-1}};
writeFileSync(new URL('../n8n-blueprints/PR3-chief-channel-errors.json',import.meta.url),JSON.stringify(errorWorkflow,null,2)+'\n');
