import test from 'node:test';
import assert from 'node:assert/strict';
import {unzipSync,strFromU8} from 'fflate';
import {researchReportDocx,researchReportPdf,reportPdfDefinition,researchSections,researchReportRoom} from '../services/projectRoomReport.mjs';
const room={title:'Café Client',state:{}};
const markdown='# Café Client\n\nOriginal request.\n\n## Round 1\n\n### Claude review\n\nIndependent evidence retained.\n\n## Recommendation\n\n**Outcome** with [source](https://example.com).\n\n| Task | Hours |\n| --- | --- |\n| Review | 2 |\n\n## User direction\n\n- Preserve original proposal.\n\n## Document evidence\n\nFinal evidence marker.';
test('full record preserves chronology and evidence in editable Word',async()=>{
 assert.deepEqual(researchSections(markdown).map(s=>s.title),['Research brief','Round 1','Recommendation','User direction','Document evidence']);
 const blob=await researchReportDocx(room,markdown);
 const zip=unzipSync(new Uint8Array(await blob.arrayBuffer()));
 const xml=strFromU8(zip['word/document.xml']);
 for(const text of ['Original request','Independent evidence retained','Preserve original proposal','Final evidence marker','Café Client']) assert.ok(xml.includes(text));
 assert.ok(xml.indexOf('Round 1')<xml.indexOf('Recommendation'));
 assert.match(xml,/w:tblHeader/);assert.match(xml,/w:hyperlink/);
});
test('PDF has real PDF bytes and complete semantic content with safe links',async()=>{
 const model=reportPdfDefinition(researchReportRoom(room,markdown));
 assert.match(JSON.stringify(model.content),/Final evidence marker/);
 assert.match(JSON.stringify(model.content),/https:\/\/example.com/);
 assert.doesNotMatch(JSON.stringify(reportPdfDefinition(researchReportRoom(room,'[unsafe](javascript:alert)')).content),/"link":"javascript:/);
 const blob=await researchReportPdf(room,markdown);
 assert.equal(blob.type,'application/pdf');
 assert.equal(new TextDecoder().decode(new Uint8Array(await blob.arrayBuffer()).slice(0,5)),'%PDF-');
 assert.throws(()=>researchReportRoom(room,''));
});
