import {
  customerSections,
  validateCustomerContent,
} from "../supabase/functions/_shared/project-room-customer-document.mjs";
import { inlineTokens, markdownBlocks } from "./companyAssessment.mjs";
import { sweetwaterLogo } from "./customerDocumentBrand.mjs";
const C = {
  ink: "121C30",
  blue: "2F61F5",
  muted: "536780",
  pale: "F0F4F8",
  warm: "FFF2EA",
  line: "D7E0EB",
};
export function customerDocumentOptions(doc) {
  return {
    brand: "Sweetwater Technology",
    subtitle: doc.kind === "proposal"
      ? "Project proposal"
      : "Opportunity assessment",
    caption: doc.status === "approved"
      ? "Prepared for discussion with your team"
      : "DRAFT - For Clint and Sheree to review before sharing",
    sections: customerSections(doc),
  };
}
export function customerDocumentRoom(doc) {
  return {
    title: doc.content.title,
    state: {
      summary: customerSections(doc).map((s) => `## ${s.title}\n\n${s.text}`)
        .join("\n\n"),
      questions: [],
      decisions: [],
    },
  };
}
// Shared editorial model: intentional page starts, with natural overflow rather than clipping.
export function customerDocumentPages(doc) {
  const c = validateCustomerContent(doc.content),
    s = (title, text, style) => ({ title, text, style });
  const pages = [
    {
      cover: true,
      title: c.title,
      subtitle: "A practical path from evidence to action",
      sections: [
        s("The recommendation", c.recommendation),
        s("What success looks like", c.outcome, "callout"),
        s("Build on existing strengths", c.strengths),
      ],
    },
    {
      title: "Two kinds of work",
      subtitle:
        "Improve what exists first. Commission new work only when justified.",
      tracks: true,
      sections: [
        s("Priority work plan", c.improvements),
        s("New work requires a separate decision", c.optional_work, "warm"),
      ],
    },
    {
      title: "What the evidence tells us",
      subtitle:
        "Specific findings, their implications, and the response each warrants.",
      sections: [s("", c.findings)],
    },
    {
      title: "A clearer customer journey",
      subtitle:
        "Proposed experience and illustrative wording, subject to customer approval.",
      sections: [s("", c.journey)],
    },
    {
      title: "Discovery before a final plan",
      subtitle:
        "Resolve the questions that change scope, priorities or the next decision.",
      sections: [s("", c.discovery)],
    },
    {
      title: "A focused delivery approach",
      subtitle:
        "Bounded work, clear deliverables and explicit decision points.",
      sections: [
        s("", c.delivery),
        s("Schedule", c.schedule),
        s("Payment terms", c.terms),
        s("Not included", c.exclusions, "callout"),
      ],
    },
    {
      title: "Hand over a result you can run",
      subtitle:
        "Customer ownership, practical acceptance checks and a definite finish.",
      sections: [
        s("How we finish and hand over", c.handoff),
        s("How we check success", c.measurement),
        s("Recommended first decision", c.next_steps, "callout"),
      ],
    },
    {
      title: "Evidence and boundaries",
      subtitle: "What supports this assessment and what remains unverified.",
      sections: [
        s("Scope and limitations", c.limits),
        s("Sources and review dates", c.sources),
      ],
    },
  ];
  const price = customerSections(doc).find((s) =>
    s.title === "One-time project investment"
  );
  if (price) pages[5].sections.splice(1, 0, price);
  return pages.filter((p) => p.sections.some((s) => s.text)).map((p) => ({
    ...p,
    sections: p.sections.filter((s) => s.text),
  }));
}
const tokens = (text) =>
  inlineTokens(String(text || "")).map((t) => ({
    text: t.text,
    ...(t.type === "strong" ? { bold: true } : {}),
    ...(t.type === "link" ? { link: t.url, color: "#" + C.blue } : {}),
  }));
function pdfBlocks(text) {
  return markdownBlocks(text).map((b) => {
    if (b.type === "table") {
      const n = Math.max(...b.rows.map((r) => r.length));
      return {
        table: {
          headerRows: 1,
          dontBreakRows: true,
          widths: n === 3 ? [105, "*", 115] : Array(n).fill("*"),
          body: b.rows.map((r, i) =>
            Array.from(
              { length: n },
              (_, j) => ({
                text: tokens(r[j]),
                bold: !i,
                fontSize: 9.5,
                fillColor: !i ? "#" + C.pale : "#FFFFFF",
                margin: [5, 5, 5, 5],
              }),
            )
          ),
        },
        layout: "lightHorizontalLines",
        margin: [0, 4, 0, 14],
      };
    }
    if (b.type === "heading") {
      return { text: tokens(b.text), style: "subheading", headlineLevel: 2 };
    }
    return {
      ...(b.type === "item"
        ? { ul: [{ text: tokens(b.text) }] }
        : { text: tokens(b.text) }),
      margin: [0, 0, 0, 6],
    };
  });
}
const card = (nodes, fill = C.pale) => ({
  table: {
    widths: ["*"],
    body: [[{ stack: nodes, fillColor: "#" + fill, margin: [12, 10, 12, 8] }]],
  },
  layout: "noBorders",
  margin: [0, 5, 0, 13],
});
export function customerDocumentPdfDefinition(doc) {
  const o = customerDocumentOptions(doc),
    pages = customerDocumentPages(doc),
    content = [];
  pages.forEach((p, i) => {
    content.push({
      text: p.cover
        ? ""
        : `OPPORTUNITY ASSESSMENT / ${String(i).padStart(2, "0")}`,
      style: "label",
      pageBreak: i ? "before" : undefined,
    });
    if (p.cover) {
      content.push(
        { image: sweetwaterLogo, width: 147, margin: [0, 0, 0, 22] },
        { text: "INDEPENDENT CONSULTING ASSESSMENT", style: "label" },
      );
    }
    content.push({
      text: p.title,
      style: p.cover ? "title" : "heading",
      headlineLevel: 1,
    });
    if (p.cover) {
      content.push({
        text: o.subtitle,
        fontSize: 20,
        bold: true,
        margin: [0, 0, 0, 8],
      });
    }
    content.push({
      text: p.subtitle,
      style: "caption",
      margin: [0, 0, 0, p.cover ? 18 : 20],
    });
    if (p.cover) {
      content.push({
        canvas: [{
          type: "line",
          x1: 0,
          x2: 499,
          y1: 0,
          y2: 0,
          lineWidth: .7,
          lineColor: "#" + C.blue,
        }],
      }, {
        text: `Prepared by Sweetwater Technology\n${o.caption}`,
        fontSize: 8.5,
        margin: [0, 9, 0, 17],
      });
    }
    if (p.tracks) {
      content.push({
        columns: [
          card([{
            text: "Track 1 - Improve what exists",
            bold: true,
            margin: [0, 0, 0, 6],
          }, {
            text:
              "Validate and improve the current systems. Agree priorities before making changes.",
          }]),
          card([{
            text: "Track 2 - New work",
            bold: true,
            margin: [0, 0, 0, 6],
          }, {
            text:
              "Optional projects with their own scope, price and approval. No ongoing service is assumed.",
          }], C.warm),
        ],
        columnGap: 10,
      });
    }
    for (const s of p.sections) {
      if (s.title) {
        content.push({ text: s.title, style: "subheading", headlineLevel: 2 });
      }
      const b = pdfBlocks(s.text);
      content.push(
        ...(s.style ? [card(b, s.style === "warm" ? C.warm : C.pale)] : b),
      );
    }
    if (p.cover) {
      content.push({ text: "ABOUT THIS ASSESSMENT", style: "label" }, {
        text:
          "An outside-in assessment using the supplied enquiry and recorded public evidence. Proposed work requires your agreement; access limits and unverified matters are stated in the evidence section.",
        style: "caption",
      });
    }
    if (i === pages.length - 1) {
      content.push(
        card([{
          text: "Sweetwater Technology",
          bold: true,
          margin: [0, 0, 0, 5],
        }, {
          text:
            "Practical improvements, clearly scoped projects and a handoff that leaves your team in control.",
        }, { text: o.caption, fontSize: 9, margin: [0, 8, 0, 0] }]),
      );
    }
  });
  return {
    info: {
      title: `${doc.content.title} - ${o.subtitle}`,
      author: "Sweetwater Technology",
    },
    pageSize: "A4",
    pageMargins: [48, 44, 48, 54],
    defaultStyle: {
      font: "Roboto",
      fontSize: 10.25,
      color: "#" + C.ink,
      lineHeight: 1.05,
    },
    styles: {
      label: {
        fontSize: 7.5,
        bold: true,
        characterSpacing: 1.1,
        color: "#" + C.blue,
        margin: [0, 0, 0, 10],
      },
      title: { fontSize: 30, bold: true, margin: [0, 2, 0, 8] },
      heading: { fontSize: 26, bold: true, margin: [0, 0, 0, 7] },
      subheading: { fontSize: 11.5, bold: true, margin: [0, 7, 0, 5] },
      caption: { fontSize: 9, color: "#" + C.muted, lineHeight: 1.15 },
    },
    footer: (page, total) => ({
      id: "page-footer",
      margin: [48, 12, 48, 0],
      stack: [{
        canvas: [{
          type: "line",
          x1: 0,
          x2: 499,
          y1: 0,
          y2: 0,
          lineWidth: .5,
          lineColor: "#" + C.line,
        }],
      }, {
        columns: [{ text: "Sweetwater Technology", bold: true }, {
          text: `${
            doc.status === "approved"
              ? "Customer assessment"
              : "DRAFT FOR REVIEW"
          }   |   ${page} / ${total}`,
          alignment: "right",
        }],
        fontSize: 7,
        color: "#" + C.muted,
        margin: [0, 7, 0, 0],
      }],
    }),
    pageBreakBefore: (node, following) =>
      Boolean(node.headlineLevel) &&
      !following.some((n) => !n.headlineLevel && n.id !== "page-footer"),
    content,
  };
}
export async function customerDocumentPdf(doc) {
  const [{ default: p }, { default: f }] = await Promise.all([
    import("pdfmake/build/pdfmake.js"),
    import("pdfmake/build/vfs_fonts.js"),
  ]);
  p.addVirtualFileSystem(f);
  return new Promise((resolve, reject) => {
    try {
      p.createPdf(customerDocumentPdfDefinition(doc)).getBlob(resolve);
    } catch (e) {
      reject(e);
    }
  });
}
export async function customerDocumentDocx(doc) {
  const { renderCustomerWord } = await import("./customerDocumentWord.mjs");
  return renderCustomerWord(
    doc,
    customerDocumentPages(doc),
    customerDocumentOptions(doc),
  );
}
