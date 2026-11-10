import {
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  HeadingLevel,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { inlineTokens, markdownBlocks } from "./companyAssessment.mjs";
import { sweetwaterLogo } from "./customerDocumentBrand.mjs";
const ink = "121C30",
  blue = "2F61F5",
  muted = "536780",
  pale = "F0F4F8",
  warm = "FFF2EA";
const border = { style: BorderStyle.SINGLE, color: "D7E0EB", size: 4 },
  none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = {
  top: none,
  bottom: none,
  left: none,
  right: none,
  insideHorizontal: none,
  insideVertical: none,
};
const runs = (s, o = {}) =>
  inlineTokens(String(s || "")).map((t) =>
    t.type === "link"
      ? new ExternalHyperlink({
        link: t.url,
        children: [new TextRun({ text: t.text, color: blue, ...o })],
      })
      : new TextRun({
        text: t.text,
        ...o,
        ...(t.type === "strong" ? { bold: true } : {}),
      })
  );
const para = (text, o = {}) => new Paragraph({ children: runs(text), ...o });
const heading = (text) =>
  para(text, { heading: HeadingLevel.HEADING_2, keepNext: true });
function blocks(text) {
  return markdownBlocks(text).map((b) => {
    if (b.type === "table") {
      const n = Math.max(...b.rows.map((r) => r.length)),
        widths = n === 3 ? [2200, 5400, 2380] : Array(n).fill(9980 / n);
      return new Table({
        width: { size: 9980, type: WidthType.DXA },
        columnWidths: widths,
        borders: noBorders,
        margins: { top: 100, bottom: 100, left: 110, right: 110 },
        rows: b.rows.map((r, i) =>
          new TableRow({
            tableHeader: !i,
            cantSplit: true,
            children: widths.map((w, j) =>
              new TableCell({
                width: { size: w, type: WidthType.DXA },
                borders: { bottom: border },
                shading: { fill: !i ? pale : "FFFFFF" },
                children: [
                  new Paragraph({
                    spacing: { after: 0, line: 250 },
                    children: runs(r[j], { size: 19, bold: !i }),
                  }),
                ],
              })
            ),
          })
        ),
      });
    }
    if (b.type === "heading") return heading(b.text);
    return para(b.text, {
      ...(b.type === "item" ? { bullet: { level: 0 } } : {}),
      widowControl: true,
    });
  });
}
function card(children, fill = pale) {
  return new Table({
    width: { size: 9980, type: WidthType.DXA },
    columnWidths: [9980],
    borders: noBorders,
    margins: { top: 160, bottom: 100, left: 180, right: 180 },
    rows: [
      new TableRow({
        children: [new TableCell({ shading: { fill }, children })],
      }),
    ],
  });
}
export async function renderCustomerWord(doc, pages, o) {
  const children = [];
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i];
    children.push(
      new Paragraph({
        pageBreakBefore: i > 0,
        keepNext: true,
        spacing: { after: p.cover ? 0 : 160 },
        children: p.cover ? [] : [
          new TextRun({
            text: `OPPORTUNITY ASSESSMENT / ${String(i).padStart(2, "0")}`,
            color: blue,
            size: 16,
            bold: true,
            characterSpacing: 20,
          }),
        ],
      }),
    );
    if (p.cover) {
      children.push(
        new Paragraph({
          spacing: { after: 320 },
          children: [
            new ImageRun({
              type: "png",
              data: sweetwaterLogo,
              transformation: { width: 196, height: 53 },
              altText: {
                title: "Sweetwater Technology",
                description: "Sweetwater Technology logo",
                name: "Sweetwater Technology",
              },
            }),
          ],
        }),
        new Paragraph({
          keepNext: true,
          children: [
            new TextRun({
              text: "INDEPENDENT CONSULTING ASSESSMENT",
              color: blue,
              bold: true,
              size: 16,
              characterSpacing: 20,
            }),
          ],
        }),
      );
    }
    children.push(
      para(p.title, {
        heading: p.cover ? HeadingLevel.TITLE : HeadingLevel.HEADING_1,
        keepNext: true,
      }),
    );
    if (p.cover) {
      children.push(
        new Paragraph({
          keepNext: true,
          children: runs(o.subtitle, { bold: true, size: 36 }),
        }),
      );
    }
    children.push(
      new Paragraph({
        spacing: { after: 240 },
        children: runs(p.subtitle, { color: muted, size: 20 }),
      }),
    );
    if (p.cover) {
      children.push(
        new Paragraph({
          border: { top: { ...border, color: blue } },
          spacing: { before: 60, after: 240 },
          children: runs(`Prepared by Sweetwater Technology\n${o.caption}`, {
            size: 17,
          }),
        }),
      );
    }
    if (p.tracks) {
      children.push(
        new Table({
          width: { size: 9980, type: WidthType.DXA },
          columnWidths: [4890, 200, 4890],
          borders: noBorders,
          margins: { top: 150, bottom: 100, left: 170, right: 170 },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  shading: { fill: pale },
                  children: [
                    heading("Track 1 - Improve what exists"),
                    para(
                      "Validate and improve the current systems. Agree priorities before making changes.",
                    ),
                  ],
                }),
                new TableCell({ children: [para("")] }),
                new TableCell({
                  shading: { fill: warm },
                  children: [
                    heading("Track 2 - New work"),
                    para(
                      "Optional projects with their own scope, price and approval. No ongoing service is assumed.",
                    ),
                  ],
                }),
              ],
            }),
          ],
        }),
      );
    }
    for (const s of p.sections) {
      if (s.title) children.push(heading(s.title));
      children.push(
        ...(s.style
          ? [
            card(blocks(s.text), s.style === "warm" ? warm : pale),
            para("", { spacing: { after: 0 }, children: [] }),
          ]
          : blocks(s.text)),
      );
    }
    if (p.cover) {
      children.push(
        heading("About this assessment"),
        new Paragraph({
          children: runs(
            "An outside-in assessment using the supplied enquiry and recorded public evidence. Proposed work requires your agreement; access limits and unverified matters are stated in the evidence section.",
            { size: 18, color: muted },
          ),
        }),
      );
    }
    if (i === pages.length - 1) {
      children.push(
        card([
          heading("Sweetwater Technology"),
          para(
            "Practical improvements, clearly scoped projects and a handoff that leaves your team in control.",
          ),
          para(o.caption),
        ]),
      );
    }
  }
  return Packer.toBlob(
    new Document({
      creator: "Sweetwater Technology",
      title: `${doc.content.title} - ${o.subtitle}`,
      styles: {
        default: {
          document: {
            run: { font: "Calibri", size: 21, color: ink },
            paragraph: {
              spacing: { after: 100, line: 250 },
              widowControl: true,
            },
          },
          title: {
            run: { bold: true, size: 62, color: ink },
            paragraph: { spacing: { after: 120 }, keepNext: true },
          },
          heading1: {
            run: { bold: true, size: 50, color: ink },
            paragraph: { spacing: { after: 100 }, keepNext: true },
          },
          heading2: {
            run: { bold: true, size: 24, color: ink },
            paragraph: { spacing: { before: 160, after: 100 }, keepNext: true },
          },
        },
      },
      sections: [{
        properties: {
          page: {
            size: { width: 11906, height: 16838 },
            margin: {
              top: 880,
              bottom: 1080,
              left: 960,
              right: 960,
              footer: 500,
            },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                border: { top: border },
                children: [
                  new TextRun({
                    text: `Sweetwater Technology    |    ${
                      doc.status === "approved"
                        ? "Customer assessment"
                        : "DRAFT FOR REVIEW"
                    }    `,
                    size: 16,
                    color: muted,
                  }),
                  new TextRun({
                    children: [
                      PageNumber.CURRENT,
                      " / ",
                      PageNumber.TOTAL_PAGES,
                    ],
                    size: 16,
                    color: muted,
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
