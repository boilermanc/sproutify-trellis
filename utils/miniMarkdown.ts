// Minimal, dependency-free Markdown -> HTML renderer for displaying Manus
// deep-dive briefs. HTML is escaped BEFORE any markdown transforms, so the
// output is safe to inject with dangerouslySetInnerHTML even though the source
// text is machine-generated. Supports: #/##/### headings, - / * / 1. lists,
// > quotes, ``` code fences, `inline code`, **bold**, *italic*, [links](url),
// and --- rules. Anything fancier degrades to plain text.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inline(text: string): string {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code style="background:#f1f5f9;padding:1px 5px;border-radius:4px;font-size:.9em">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" style="color:#0891b2" target="_blank" rel="noopener noreferrer">$1</a>');
}

export function renderMarkdown(md: string): string {
  if (!md) return "";
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let inCode = false;
  const codeBuf: string[] = [];
  let paraBuf: string[] = [];

  const closeList = () => { if (listType) { out.push(`</${listType}>`); listType = null; } };
  const flushPara = () => {
    if (paraBuf.length) {
      out.push(`<p style="margin:0 0 10px;line-height:1.6">${inline(paraBuf.join(" "))}</p>`);
      paraBuf = [];
    }
  };

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");

    if (line.trim().startsWith("```")) {
      if (inCode) {
        out.push(`<pre style="background:#0f172a;color:#e2e8f0;padding:12px;border-radius:8px;overflow-x:auto;font-size:12px"><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`);
        codeBuf.length = 0; inCode = false;
      } else { flushPara(); closeList(); inCode = true; }
      continue;
    }
    if (inCode) { codeBuf.push(raw); continue; }

    if (!line.trim()) { flushPara(); closeList(); continue; }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushPara(); closeList();
      const level = Math.min(h[1].length, 3);
      const size = level === 1 ? "1.25rem" : level === 2 ? "1.05rem" : ".95rem";
      out.push(`<h${level} style="font-weight:800;font-size:${size};margin:16px 0 8px;color:#0f172a">${inline(h[2])}</h${level}>`);
      continue;
    }

    if (/^(---+|\*\*\*+)$/.test(line.trim())) {
      flushPara(); closeList();
      out.push('<hr style="border:0;border-top:1px solid #e2e8f0;margin:14px 0" />');
      continue;
    }

    if (/^>\s?/.test(line)) {
      flushPara(); closeList();
      out.push(`<blockquote style="margin:0 0 10px;padding:6px 12px;border-left:3px solid #cbd5e1;color:#475569">${inline(line.replace(/^>\s?/, ""))}</blockquote>`);
      continue;
    }

    const ul = line.match(/^\s*[-*+]\s+(.*)$/);
    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ul || ol) {
      flushPara();
      const want = ul ? "ul" : "ol";
      if (listType !== want) { closeList(); out.push(`<${want} style="margin:0 0 10px 20px;line-height:1.6">`); listType = want; }
      out.push(`<li>${inline((ul ? ul[1] : ol![1]))}</li>`);
      continue;
    }

    closeList();
    paraBuf.push(line.trim());
  }

  if (inCode && codeBuf.length) out.push(`<pre><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`);
  flushPara();
  closeList();
  return out.join("\n");
}
