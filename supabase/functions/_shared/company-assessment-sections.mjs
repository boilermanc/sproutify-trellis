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
