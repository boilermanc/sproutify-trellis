import {mkdirSync,writeFileSync} from 'node:fs';
import {assessmentFixture} from '../tests/fixtures/company-assessment.mjs';
import {exportRoom} from '../supabase/functions/_shared/project-room.mjs';
import {researchReportDocx,researchReportPdf} from '../services/projectRoomReport.mjs';
const room=assessmentFixture();
room.state.rounds=[{number:1,focus:'Fixture verification',outputs:{},documents:[]}];
room.state.rounds[0].outputs.openai={source:'test fixture',text:'## Independent analysis\n\n'+('A longer evidence paragraph tests readable line wrapping and page boundaries. '.repeat(12)+'\n\n').repeat(6)+'Final independent evidence marker.'};
const markdown=exportRoom(room);
mkdirSync('output/research-downloads',{recursive:true});
for(const [extension,generate] of [['docx',researchReportDocx],['pdf',researchReportPdf]]) {
 const blob=await generate(room,markdown);
 writeFileSync(`output/research-downloads/research-verification.${extension}`,Buffer.from(await blob.arrayBuffer()));
 console.log(`${extension}: ${blob.size} bytes`);
}
