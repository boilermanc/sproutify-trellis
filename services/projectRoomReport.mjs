import { inlineTokens, markdownBlocks } from './companyAssessment.mjs';

export const RESEARCH_REPORT_OPTIONS = {
  eyebrow: 'PROJECT ROOM RESEARCH', subtitle: 'Research report',
  caption: 'Brief, findings, independent reviews, decisions and supporting evidence',
  sectionLabel: 'RESEARCH RECORD', footerLabel: 'Research report', includeDiscussion: false,
  disclaimer: 'Internal working research. AI findings and proposed decisions require review. Source claims, uncertainty and extracted-document limitations are retained. This report is not an approved proposal or quotation.',
};
export function researchReportRoom(room, markdown) {
  if(typeof markdown!=='string' || !markdown.trim()) throw new Error('The research report is empty.');
  return {...room,state:{...room.state,summary:markdown}};
}
export function researchSections(markdown) {
  const sections=[]; let current={title:'Research brief',text:[]};
  for(const line of String(markdown).split('\n')) {
    if(/^##\s+/.test(line)) {
      if(current.text.length) sections.push({...current,text:current.text.join('\n')});
      current={title:line.replace(/^##\s+/,''),text:[]};
    } else current.text.push(line.replace(/^#\s+/,'### '));
  }
  if(current.text.length) sections.push({...current,text:current.text.join('\n')});
  return sections;
}
const textRuns=text=>inlineTokens(String(text??'')).map(t=>({text:t.text,...(t.type==='strong'?{bold:true}:{}),...(t.type==='code'?{background:'#F0F4F8'}:{}),...(t.type==='link'?{link:t.url,color:'#2F61F5',decoration:'underline'}:{})}));
function pdfBlock(block) {
  if(block.type==='table') {
    const columns=Math.max(...block.rows.map(r=>r.length));
    return {table:{headerRows:1,widths:Array(columns).fill('*'),body:block.rows.map((row,i)=>Array.from({length:columns},(_,col)=>({text:textRuns(row[col]||''),bold:i===0,color:i===0?'#FFFFFF':'#121C30',fillColor:i===0?'#121C30':i%2?'#FFFFFF':'#F0F4F8',fontSize:9,margin:[4,5,4,5]})))},layout:'lightHorizontalLines',margin:[0,5,0,12]};
  }
  if(block.type==='heading') return {text:textRuns(block.text),style:'subheading',headlineLevel:2};
  if(block.type==='item') return {ul:[{text:textRuns(block.text)}],margin:[6,0,0,7]};
  return {text:textRuns(block.text),margin:[0,0,0,9]};
}
export function reportPdfDefinition(room, options=RESEARCH_REPORT_OPTIONS) {
  const sections=researchSections(room.state.summary);
  const content=[{text:options.eyebrow,style:'label'},{text:room.title,style:'title'},
    {text:options.subtitle,style:'subtitle'},{text:options.caption,style:'caption',margin:[0,0,0,22]}];
  sections.forEach((s,i)=>content.push({text:`${options.sectionLabel} / ${String(i+1).padStart(2,'0')}`,style:'label',headlineLevel:1},
    {text:textRuns(s.title),style:'heading',headlineLevel:1},...markdownBlocks(s.text).map(pdfBlock)));
  content.push({text:'WORKING REPORT',style:'label'},{text:options.disclaimer,style:'caption'});
  return {info:{title:`${room.title} — ${options.subtitle}`,author:'Sproutify Trellis'},pageSize:'LETTER',pageMargins:[50,58,50,54],
    defaultStyle:{font:'Roboto',fontSize:10.5,color:'#121C30',lineHeight:1.2},
    header:()=>({id:'page-header',text:[{text:'TRELLIS',bold:true},{text:'  /  CLIENT INTELLIGENCE',color:'#2F61F5'}],fontSize:9,margin:[50,24,50,0]}),
    footer:(current,total)=>({id:'page-footer',text:`Trellis  •  ${options.footerLabel}    |    ${current} / ${total}`,fontSize:8,color:'#536780',alignment:'right',margin:[50,12,50,0]}),
    styles:{label:{fontSize:8,color:'#2F61F5',bold:true,characterSpacing:1.2,margin:[0,14,0,6]},title:{fontSize:29,bold:true,margin:[0,4,0,12]},subtitle:{fontSize:17,bold:true,margin:[0,0,0,10]},caption:{fontSize:9,color:'#536780'},heading:{fontSize:19,bold:true,margin:[0,0,0,12]},subheading:{fontSize:13,bold:true,margin:[0,10,0,7]}},
    pageBreakBefore:(node,following)=>!!node.headlineLevel && following.filter(n=>!['page-header','page-footer'].includes(n.id)).every(n=>n.headlineLevel),
    content};
}
export async function researchReportDocx(room, markdown) {
  const {assessmentDocx}=await import('./companyAssessmentDocx.mjs');
  return assessmentDocx(researchReportRoom(room,markdown),{...RESEARCH_REPORT_OPTIONS,sections:researchSections(markdown)});
}
export async function researchReportPdf(room, markdown) {
  const [{default:pdfMake},{default:fonts}]=await Promise.all([import('pdfmake/build/pdfmake.js'),import('pdfmake/build/vfs_fonts.js')]);
  pdfMake.addVirtualFileSystem(fonts);
  return new Promise((resolve,reject)=>{
    try{pdfMake.createPdf(reportPdfDefinition(researchReportRoom(room,markdown))).getBlob(resolve);}catch(e){reject(e);}
  });
}
