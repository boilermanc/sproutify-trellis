export const COMPANY_SECTIONS = [
  "Recommendation",
  "Existing strengths",
  "Prioritized findings",
  "Improve what exists",
  "Optional new work",
  "Discovery",
  "Practical next steps and decision",
  "Sources and limits",
];
export function assessmentSections(markdown) {
  const sections = [];
  let current = { title: "Review", text: [] };
  for (const line of String(markdown || "").split("\n")) {
    if (/^##\s+/.test(line)) {
      if (current.text.some((l) => l.trim()))
        sections.push({ title: current.title, text: current.text.join("\n") });
      current = { title: line.replace(/^##\s+/, ""), text: [] };
    } else if (!/^#\s+/.test(line)) current.text.push(line);
  }
  if (current.text.some((l) => l.trim()))
    sections.push({ title: current.title, text: current.text.join("\n") });
  const recommendation = sections.findIndex((section) =>
    /^recommendation$/i.test(section.title),
  );
  if (recommendation > 0)
    sections.unshift(sections.splice(recommendation, 1)[0]);
  return sections;
}
export function inlineTokens(text) {
  const pattern = /\[([^\]]+)\]\(([^\s)]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g;
  let start = 0;
  const result = [];
  for (const match of String(text).matchAll(pattern)) {
    if (match.index > start)
      result.push({ type: "text", text: text.slice(start, match.index) });
    if (match[1]) {
      let safe = false;
      try {
        const url = new URL(match[2]);
        safe =
          ["https:", "http:"].includes(url.protocol) &&
          !url.username &&
          !url.password;
      } catch {}
      result.push({
        type: safe ? "link" : "text",
        text: match[1],
        url: safe ? match[2] : undefined,
      });
    } else
      result.push({
        type: match[3] ? "strong" : "code",
        text: match[3] || match[4],
      });
    start = match.index + match[0].length;
  }
  if (start < text.length)
    result.push({ type: "text", text: text.slice(start) });
  return result;
}
export function markdownBlocks(text) {
  const lines = String(text).split("\n");
  const blocks = [];
  let paragraph = [];
  const flush = () => {
    if (paragraph.length) {
      blocks.push({ type: "paragraph", text: paragraph.join(" ") });
      paragraph = [];
    }
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) {
      flush();
      continue;
    }
    if (line.includes("|") && /^\s*\|?\s*:?-{3}/.test(lines[i + 1] || "")) {
      flush();
      const cells = (l) =>
        l
          .trim()
          .replace(/^\||\|$/g, "")
          .split("|")
          .map((c) => c.trim());
      const rows = [cells(line)];
      i++;
      while ((lines[i + 1] || "").includes("|")) rows.push(cells(lines[++i]));
      blocks.push({ type: "table", rows });
      continue;
    }
    if (/^#{3,6}\s+/.test(line)) {
      flush();
      blocks.push({ type: "heading", text: line.replace(/^#+\s+/, "") });
    } else if (/^\s*(?:[-*]|\d+[.)])\s+/.test(line)) {
      flush();
      blocks.push({
        type: "item",
        text: line.replace(/^\s*(?:[-*]|\d+[.)])\s+/, ""),
      });
    } else paragraph.push(line);
  }
  flush();
  return blocks;
}
export const escapeHtml = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function inlineHtml(text) {
  return inlineTokens(text)
    .map((t) =>
      t.type === "link"
        ? `<a href="${escapeHtml(t.url)}">${escapeHtml(t.text)}</a>`
        : t.type === "strong"
          ? `<strong>${escapeHtml(t.text)}</strong>`
          : t.type === "code"
            ? `<code>${escapeHtml(t.text)}</code>`
            : escapeHtml(t.text),
    )
    .join("");
}
export function formattedAssessment(room) {
  const sections = assessmentSections(room.state.summary);
  const body = sections
    .map(
      (s, i) =>
        `<section class="${/recommendation/i.test(s.title) ? "recommendation" : ""}"><div class="eyebrow">OPPORTUNITY ASSESSMENT / ${String(i + 1).padStart(2, "0")}</div><h2>${escapeHtml(s.title)}</h2>${markdownBlocks(
          s.text,
        )
          .map((b) =>
            b.type === "table"
              ? `<div class="table-wrap"><table>${b.rows.map((r, j) => `<tr>${r.map((c) => `<${j ? "td" : "th"}>${inlineHtml(c)}</${j ? "td" : "th"}>`).join("")}</tr>`).join("")}</table></div>`
              : `<${b.type === "heading" ? "h3" : "p"} class="${b.type === "item" ? "item" : ""}">${b.type === "item" ? "• " : ""}${inlineHtml(b.text)}</${b.type === "heading" ? "h3" : "p"}>`,
          )
          .join("")}</section>`,
    )
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(room.title)} — opportunity assessment</title><style>body{font:15px/1.7 Arial,sans-serif;color:#263b52;background:#edf2f7;margin:0}main{max-width:900px;margin:32px auto;background:white;padding:54px}header{border-top:6px solid #e39447;border-bottom:1px solid #d7e3ef;padding:28px 0}h1{font-size:36px;line-height:1.2;color:#102b4e}h2{font-size:25px;line-height:1.3;color:#102b4e}h3{color:#1e4e7b;font-size:17px}.eyebrow{font-size:10px;font-weight:bold;letter-spacing:2px;color:#38658e}section{padding:30px 0;border-bottom:1px solid #d7e3ef;break-inside:avoid-page}.recommendation{background:#102b4e;color:#fff;padding:28px;margin-top:28px;border-left:4px solid #e39447}.recommendation h2,.recommendation a,.recommendation .eyebrow{color:#fff}a{color:#215e96;overflow-wrap:anywhere}p{margin:12px 0}.notice{background:#eef5fb;border-left:3px solid #6c93b4;padding:16px;font-size:12px}.table-wrap{overflow:auto}table{border-collapse:collapse;width:100%;font-size:12px}td,th{text-align:left;border-bottom:1px solid #d7e3ef;padding:10px;vertical-align:top}th{background:#eef5fb}footer{font-size:11px;color:#61758a;margin-top:30px}@media print{body{background:white}main{margin:0;padding:0;max-width:none}section{break-inside:auto}h2,h3{break-after:avoid}p{orphans:3;widows:3}header{padding-top:10px}@page{size:A4;margin:18mm}}@media(max-width:640px){main{margin:0;padding:24px}h1{font-size:28px}}</style></head><body><main><header><p class="eyebrow">PROJECT ROOM / COMPANY REVIEW</p><h1>${escapeHtml(room.title)}<br>Opportunity assessment</h1><p>A practical recommendation for discussion and validation</p></header><p class="notice">Working assessment, not a quotation or approved scope. Separate sourced facts, user-supplied information and inference. Proposed decisions require user approval. Document review covers extracted text only; page images and original files were not reviewed.</p>${body}<section><h2>Questions for the decision-maker</h2>${room.state.questions.map((q) => `<p>• ${escapeHtml(q)}</p>`).join("")}<h3>Decision log</h3>${room.state.decisions.map((d) => `<p>[${escapeHtml(d.status)}] ${escapeHtml(d.text)}</p>`).join("") || "<p>No decisions recorded.</p>"}</section><footer>Trellis project room · Evidence and limits are retained above. Exported ${new Date().toISOString().slice(0, 10)}. This assessment does not establish client participation or endorsement.</footer></main></body></html>`;
}
