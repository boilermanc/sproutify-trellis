import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  Header,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import {
  assessmentSections,
  inlineTokens,
  markdownBlocks,
} from "./companyAssessment.mjs";

const palette = {
  ink: "121C30",
  blue: "2F61F5",
  muted: "536780",
  pale: "F0F4F8",
  line: "D7E0EB",
  warm: "FFF2EA",
};
const wordText = (text) =>
  String(text ?? "").replace(
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g,
    "",
  );
const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const borders = {
  top: noBorder,
  bottom: noBorder,
  left: noBorder,
  right: noBorder,
  insideHorizontal: noBorder,
  insideVertical: noBorder,
};

function runs(text, options = {}) {
  return inlineTokens(wordText(text)).map((token) =>
    token.type === "link" && token.url
      ? new ExternalHyperlink({
        link: token.url,
        children: [
          new TextRun({ text: token.text, style: "Hyperlink", ...options }),
        ],
      })
      : new TextRun({
        ...options,
        text: token.text,
        bold: options.bold || token.type === "strong",
        font: token.type === "code" ? "Consolas" : undefined,
      })
  );
}
function label(text) {
  return new Paragraph({
    keepNext: true,
    spacing: { before: 260, after: 100 },
    children: [
      new TextRun({
        text,
        color: palette.blue,
        bold: true,
        size: 18,
        characterSpacing: 26,
      }),
    ],
  });
}
function reportBlock(block, options = {}) {
  if (block.type === "table") {
    const columns = Math.max(...block.rows.map((row) => row.length));
    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders,
      margins: { top: 110, bottom: 110, left: 120, right: 120 },
      rows: block.rows.map((row, index) =>
        new TableRow({
          tableHeader: index === 0,
          children: Array.from({ length: columns }, (_, column) =>
            new TableCell({
              width: { size: 100 / columns, type: WidthType.PERCENTAGE },
              shading: {
                fill: index === 0
                  ? palette.ink
                  : index % 2
                  ? "FFFFFF"
                  : palette.pale,
              },
              borders: {
                bottom: {
                  style: BorderStyle.SINGLE,
                  size: 4,
                  color: palette.line,
                },
              },
              children: [
                new Paragraph({
                  spacing: { after: 30, line: 260 },
                  children: runs(row[column], {
                    bold: index === 0,
                    color: index === 0 ? "FFFFFF" : palette.ink,
                    size: 20,
                  }),
                }),
              ],
            })),
        })
      ),
    });
  }
  return new Paragraph({
    ...(block.type === "item" ? { bullet: { level: 0 } } : {}),
    ...(block.type === "heading"
      ? { heading: HeadingLevel.HEADING_2, keepNext: true }
      : {}),
    widowControl: true,
    ...options,
    children: runs(block.text),
  });
}
function sectionContent(
  section,
  index,
  sectionLabel = "OPPORTUNITY ASSESSMENT",
) {
  const blocks = markdownBlocks(section.text);
  const recommendation = /^recommendation$/i.test(section.title);
  const optional = /^optional new work$/i.test(section.title);
  return [
    label(`${sectionLabel} / ${String(index + 1).padStart(2, "0")}`),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      keepNext: true,
      children: runs(section.title),
    }),
    ...blocks.map((block, i) =>
      reportBlock(
        block,
        (recommendation && i === 0 || optional && i === 0) &&
          block.type === "paragraph"
          ? {
            shading: { fill: optional ? palette.warm : "EEF2FF" },
            border: {
              left: {
                style: BorderStyle.SINGLE,
                size: 22,
                color: optional ? "E77945" : palette.blue,
                space: 12,
              },
            },
            indent: { left: 180, right: 180 },
            spacing: { before: 140, after: 200, line: 300 },
          }
          : {},
      )
    ),
  ];
}
export function assessmentDocx(room, options = {}) {
  const title = wordText(room.title);
  const sections = assessmentSections(room.state.summary);
  const children = [
    label(options.eyebrow || "CONSULTING OPPORTUNITY ASSESSMENT"),
    new Paragraph({ text: title, heading: HeadingLevel.TITLE, keepNext: true }),
    new Paragraph({
      text: options.subtitle || "Opportunity assessment",
      style: "Subtitle",
      keepNext: true,
    }),
    new Paragraph({
      text: options.caption ||
        "Findings, priorities and decisions for the next conversation",
      style: "ReportCaption",
      spacing: { after: 260 },
    }),
    ...sections.flatMap((section, index) =>
      sectionContent(section, index, options.sectionLabel)
    ),
    ...(options.includeDiscussion === false ? [] : [
      label("DISCUSSION AND APPROVAL"),
      new Paragraph({
        text: "Questions for the decision maker",
        heading: HeadingLevel.HEADING_1,
        keepNext: true,
      }),
      ...(room.state.questions?.length
        ? room.state.questions.map((question) =>
          new Paragraph({
            children: runs(question),
            bullet: { level: 0 },
            widowControl: true,
          })
        )
        : [new Paragraph({ text: "No open questions recorded." })]),
      new Paragraph({
        text: "Decision log",
        heading: HeadingLevel.HEADING_2,
        keepNext: true,
      }),
      ...(room.state.decisions?.length
        ? room.state.decisions.map((decision) =>
          new Paragraph({
            children: [
              new TextRun({
                text: `${
                  wordText(decision.status).replaceAll("_", " ").toUpperCase()
                }  `,
                bold: true,
                color: palette.blue,
                size: 18,
              }),
              ...runs(decision.text),
            ],
          })
        )
        : [new Paragraph({ text: "No decisions recorded." })]),
    ]),
    label(
      options.includeDiscussion === false
        ? "DRAFT STATUS"
        : "ABOUT THIS ASSESSMENT",
    ),
    new Paragraph({
      text: options.disclaimer ||
        "Working assessment for discussion and validation. Proposed decisions require approval. Document evidence covers extracted text.",
      style: "ReportCaption",
    }),
  ];
  return Packer.toBlob(
    new Document({
      creator: "Sproutify Trellis",
      title: `${title} ${options.footerLabel || "opportunity assessment"}`,
      styles: {
        default: {
          document: {
            run: { font: "Calibri", size: 23, color: palette.ink },
            paragraph: {
              spacing: { after: 140, line: 288 },
              widowControl: true,
            },
          },
          title: {
            run: { color: palette.ink, size: 58, bold: true },
            paragraph: { spacing: { before: 80, after: 160 }, keepNext: true },
          },
          heading1: {
            run: { color: palette.ink, size: 36, bold: true },
            paragraph: { spacing: { before: 40, after: 180 }, keepNext: true },
          },
          heading2: {
            run: { color: palette.ink, size: 25, bold: true },
            paragraph: { spacing: { before: 220, after: 100 }, keepNext: true },
          },
        },
        paragraphStyles: [
          {
            id: "Subtitle",
            name: "Subtitle",
            basedOn: "Normal",
            run: { size: 30, color: palette.ink, bold: true },
            paragraph: { spacing: { after: 160 } },
          },
          {
            id: "ReportCaption",
            name: "Report caption",
            basedOn: "Normal",
            run: { size: 19, color: palette.muted },
            paragraph: { spacing: { after: 120, line: 252 } },
          },
        ],
      },
      sections: [{
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: {
              top: 1080,
              bottom: 1080,
              left: 1008,
              right: 1008,
              header: 430,
              footer: 430,
            },
          },
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: "TRELLIS",
                    bold: true,
                    color: palette.ink,
                    size: 20,
                  }),
                  new TextRun({
                    text: "  /  CLIENT INTELLIGENCE",
                    color: palette.blue,
                    size: 16,
                    characterSpacing: 18,
                  }),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                border: {
                  top: {
                    style: BorderStyle.SINGLE,
                    color: palette.line,
                    size: 4,
                    space: 8,
                  },
                },
                children: [
                  new TextRun({
                    text: `Trellis  •  ${
                      options.footerLabel || "Opportunity assessment"
                    }    |    `,
                    color: palette.muted,
                    size: 16,
                  }),
                  new TextRun({
                    children: [
                      PageNumber.CURRENT,
                      " / ",
                      PageNumber.TOTAL_PAGES,
                    ],
                    color: palette.muted,
                    size: 16,
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      }],
    }),
  );
}
