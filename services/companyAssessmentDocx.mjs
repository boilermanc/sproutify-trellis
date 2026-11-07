import {
  Document,
  ExternalHyperlink,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { assessmentSections, inlineTokens, markdownBlocks } from "./companyAssessment.mjs";

const wordText = (text) => String(text ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, "");

function runs(text, bold = false) {
  return inlineTokens(wordText(text)).map((token) => token.type === "link" && token.url
    ? new ExternalHyperlink({
      link: token.url,
      children: [new TextRun({ text: token.text, style: "Hyperlink", bold })],
    })
    : new TextRun({
      text: token.text,
      bold: bold || token.type === "strong",
      font: token.type === "code" ? "Consolas" : undefined,
    }));
}

function reportBlock(block) {
  if (block.type === "table") {
    const columns = Math.max(...block.rows.map((row) => row.length));
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      margins: { top: 70, bottom: 70, left: 100, right: 100 },
      rows: block.rows.map((row, index) => new TableRow({
        tableHeader: index === 0,
        children: Array.from({ length: columns }, (_, column) => new TableCell({
          ...(index === 0 ? { shading: { fill: "EAF1F8" } } : {}),
          children: [new Paragraph({ children: runs(row[column], index === 0) })],
        })),
      })),
    });
  }
  return new Paragraph({
    ...(block.type === "item" ? { bullet: { level: 0 } } : {}),
    ...(block.type === "heading" ? { heading: HeadingLevel.HEADING_2 } : {}),
    children: runs(block.text),
  });
}

export function assessmentDocx(room) {
  const children = [
    new Paragraph({ text: wordText(room.title), heading: HeadingLevel.TITLE }),
    new Paragraph({ text: "Opportunity assessment" }),
    new Paragraph({
      text: "Working assessment for discussion and validation. Proposed decisions require approval. Document evidence covers extracted text.",
    }),
    ...assessmentSections(room.state.summary).flatMap((section) => [
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: runs(section.title) }),
      ...markdownBlocks(section.text).map(reportBlock),
    ]),
    new Paragraph({ text: "Questions for the decision maker", heading: HeadingLevel.HEADING_1 }),
    ...room.state.questions.map((question) => new Paragraph({
      text: wordText(question),
      bullet: { level: 0 },
    })),
    new Paragraph({ text: "Decision log", heading: HeadingLevel.HEADING_2 }),
    ...(room.state.decisions.length
      ? room.state.decisions.map((decision) => new Paragraph({
        text: wordText(`[${decision.status}] ${decision.text}`),
      }))
      : [new Paragraph({ text: "No decisions recorded." })]),
  ];

  return Packer.toBlob(new Document({
    creator: "Sproutify Trellis",
    title: wordText(`${room.title} opportunity assessment`),
    styles: {
      default: {
        document: {
          run: { font: "Calibri", size: 22, color: "263B52" },
          paragraph: { spacing: { after: 120, line: 276 } },
        },
        title: { run: { color: "000000", size: 48, bold: true } },
        heading1: { run: { color: "102B4E", size: 30, bold: true } },
        heading2: { run: { color: "1E4E7B", size: 25, bold: true } },
      },
    },
    sections: [{ children }],
  }));
}
