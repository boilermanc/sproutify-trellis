import { sanitizePII } from "./project-room-sanitize.mjs";

export const AEO_SURFACES = {
  chatgpt: "ChatGPT",
  perplexity: "Perplexity",
  google_ai_overviews: "Google AI Overviews",
};
export const AEO_OUTCOMES = {
  mentioned: "Brand mentioned",
  not_mentioned: "Answer did not mention brand",
  no_answer: "No AI answer shown",
};

export function aeoQuestions(category) {
  return [
    `What are the best options for ${category}?`,
    `Which providers should I shortlist for ${category}?`,
    `How do the leading options for ${category} compare?`,
    `Which options for ${category} offer the best value?`,
    `Which options for ${category} are best for a first-time buyer?`,
  ];
}

const cleanLine = (value, max) =>
  typeof value === "string" ? sanitizePII(value, max).replace(/\s+/g, " ").trim() : "";

function citation(value) {
  try {
    if (typeof value !== "string" || value.length > 600) throw new Error();
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password ||
      !url.hostname.includes(".") || sanitizePII(url.href, 1000) !== url.href) throw new Error();
    return url.href;
  } catch {
    throw new Error("Enter a public HTTP or HTTPS citation URL without credentials.");
  }
}

export function updateAeo(room, change, actor, now = new Date().toISOString()) {
  if (room.kind !== "client") throw new Error("AI search is available for company reviews.");
  if (!["draft", "awaiting_user"].includes(room.status)) {
    throw new Error("Save AI search observations before starting research or after the round finishes.");
  }
  const existing = room.state.aeo;
  if (Object.hasOwn(change, "category")) {
    const category = cleanLine(change.category, 120);
    if (category.length < 3) throw new Error("Enter a public buyer category of at least 3 characters.");
    if (existing?.observations.length && existing.category !== category) {
      throw new Error("The category is fixed once observations have been saved.");
    }
    room.state.aeo = { category, questions: aeoQuestions(category), observations: existing?.observations || [] };
    return;
  }
  if (!existing) throw new Error("Save the buyer questions first.");
  const input = change.observation;
  if (!input || !Object.hasOwn(AEO_SURFACES, input.surface) ||
    !Object.hasOwn(AEO_OUTCOMES, input.outcome) || !Number.isInteger(input.question) ||
    input.question < 0 || input.question >= existing.questions.length) {
    throw new Error("Choose a question, AI surface and observed result.");
  }
  const date = input.observed_on;
  const timestamp = typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? Date.parse(date) : NaN;
  // Allow the following UTC calendar date for operators east of UTC.
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date ||
    timestamp > Date.parse(now) + 86_400_000) {
    throw new Error("Enter the date you ran the check.");
  }
  const answerShown = input.outcome !== "no_answer";
  const links = answerShown ? input.citations ?? [] : [];
  if (!Array.isArray(links) || links.length > 3) throw new Error("Add up to three citation URLs.");
  const observation = {
    surface: input.surface, question: input.question, outcome: input.outcome, observed_on: date,
    competitors: answerShown ? cleanLine(input.competitors, 300) : "",
    citations: [...new Set(links.map(citation))],
    context: cleanLine(input.context, 160),
    recorded_by: actor, recorded_at: now,
  };
  room.state.aeo = {
    ...existing,
    observations: [...existing.observations.filter(o =>
      o.surface !== observation.surface || o.question !== observation.question), observation],
  };
}

export const AEO_LIMITS = "Operator-recorded spot checks. Unchecked questions and checks with no AI answer do not count as brand absences. Results can vary by date, location and session.";

export const AEO_SEARCH_PROVIDER = "OpenAI web search";
export const AEO_SEARCH_LIMITS = "These are OpenAI API spot checks. Brand matching uses the saved company name and website domain among named options. An unmeasured question is excluded from the mention count.";
export const AEO_SEARCH_OUTCOMES = {
  mentioned: "Brand mentioned among named options",
  not_mentioned: "Brand not found among named options",
  unmeasured: "No usable cited answer",
};
export const AEO_SEARCH_MESSAGES = {
  missing_connection: "OpenAI web search needs the room’s OpenAI connection.",
  budget: "The room budget did not have five requests available after reserving enough for a standard round.",
  interrupted: "The search run was interrupted. Its requests were not sent again.",
};

export function aeoSearchForRound(room, round = room.state.rounds.at(-1)) {
  if (!round?.aeo) return undefined;
  return room.state.rounds.slice(0, round.number).reverse()
    .find(candidate => candidate.aeo?.category === round.aeo.category && candidate.aeo_search)
    ?.aeo_search;
}

export function planAeoSearch(room, hasConnection) {
  const round = room.state.rounds.at(-1);
  if (room.kind !== "client" || !round?.aeo || round.stage !== "research" || round.tasks.research ||
    round.outputs.research || round.aeo_search) return undefined;
  const previous = aeoSearchForRound(room, round);
  if (previous && previous.status !== "skipped") return undefined;
  const questions = round.aeo.questions;
  if (questions.length !== 5) return undefined;
  const base = { round: round.number, questions, results: [] };
  if (!hasConnection) return { ...base, status: "skipped", reason: "missing_connection" };
  // Leave all five standard role requests available for this round.
  if (room.state.call_budget - room.state.calls_used < questions.length + 5) {
    return { ...base, status: "skipped", reason: "budget" };
  }
  return { ...base, status: "running" };
}

function normalizedName(name) {
  return (String(name || "").normalize("NFKC").toLocaleLowerCase("en-US").match(/[\p{L}\p{N}]+/gu) || []).join(" ");
}

function withoutLegalSuffix(name) {
  return name.replace(/ (?:inc|incorporated|corp|corporation|llc|l l c|llp|l l p|ltd|limited)$/, "");
}

export function summarizeAeoAnswer(payload, company, question, observedAt) {
  const result = { question, outcome: "unmeasured", mentions: [], competitors: [], citations: [], observed_at: observedAt };
  const items = payload?.output;
  if (payload?.status !== "completed" || !Array.isArray(items) ||
    !items.some(item => item.type === "web_search_call" && item.status === "completed" && item.action?.type === "search")) {
    return result;
  }
  const parts = items.filter(item => item.type === "message" && item.role === "assistant")
    .flatMap(item => Array.isArray(item.content) ? item.content : [])
    .filter(part => part.type === "output_text" && typeof part.text === "string");
  const names = new Map();
  for (const part of parts) {
    for (const match of part.text.matchAll(/^\s*(?:[-*]|\d+[.)])\s+\*\*([^*\n]{1,140})\*\*/gm)) {
      const label = cleanLine(match[1], 140);
      const key = normalizedName(label);
      if (key && !names.has(key)) names.set(key, label);
    }
  }
  const links = new Map();
  for (const part of parts) {
    for (const annotation of Array.isArray(part.annotations) ? part.annotations : []) {
      if (annotation.type !== "url_citation") continue;
      try {
        const url = citation(annotation.url);
        if (!links.has(url)) links.set(url, { url, title: cleanLine(annotation.title, 160) || new URL(url).hostname });
      } catch {
        // Ignore invalid provider URLs and retain the other citations.
      }
    }
  }
  const citations = [...links.values()].slice(0, 12);
  if (!names.size || !citations.length) return { ...result, citations };
  const brandName = withoutLegalSuffix(normalizedName(company.name));
  const brandDomains = new Set();
  if (company.website) {
    try {
      const hostname = new URL(company.website).hostname.replace(/^www\./i, "");
      brandDomains.add(normalizedName(hostname));
      brandDomains.add(normalizedName(`www.${hostname}`));
    } catch {
      // Older rooms can lack a normalized company website.
    }
  }
  const mentions = [];
  const competitors = [];
  for (const [key, label] of names) {
    const matches = brandDomains.has(key) || (brandName && withoutLegalSuffix(key) === brandName);
    (matches ? mentions : competitors).push(label);
  }
  return { ...result, outcome: mentions.length ? "mentioned" : "not_mentioned", mentions,
    competitors: competitors.slice(0, 10), citations };
}

export function aeoSearchMarkdown(run) {
  if (!run) return "";
  const heading = `### ${AEO_SEARCH_PROVIDER} · round ${run.round}`;
  if (run.status !== "finished") {
    return [heading, AEO_SEARCH_MESSAGES[run.reason] || "No completed search results."].join("\n");
  }
  return [heading, AEO_SEARCH_LIMITS, ...run.questions.flatMap((question, i) => {
    const row = run.results.find(result => result.question === i);
    if (!row) return [];
    return [`- ${question} ${AEO_SEARCH_OUTCOMES[row.outcome]} (${row.observed_at.slice(0, 10)}).`,
      ...(row.mentions.length ? [`  - Brand matches: ${row.mentions.join(", ")}`] : []),
      ...(row.competitors.length ? [`  - Other options: ${row.competitors.join(", ")}`] : []),
      ...row.citations.map(({ url }) => `  - Source: <${url}>`)];
  })].join("\n");
}

export function aeoEvidence(aeo) {
  if (!aeo) return undefined;
  return {
    category: aeo.category,
    questions: aeo.questions,
    limits: AEO_LIMITS,
    observations: aeo.observations.map(({ question, surface, outcome, observed_on, competitors, citations, context }) =>
      ({ question: question + 1, surface: AEO_SURFACES[surface], outcome: AEO_OUTCOMES[outcome],
        observed_on, competitors, citations, context })),
  };
}

export function aeoMarkdown(aeo) {
  const evidence = aeoEvidence(aeo);
  if (!evidence) return "";
  return [
    "## AI search (AEO) baseline",
    evidence.limits,
    ...evidence.questions.map((question, i) => [
      `### ${i + 1}. ${question}`,
      ...Object.values(AEO_SURFACES).map(surface => {
        const row = evidence.observations.find(o => o.question === i + 1 && o.surface === surface);
        if (!row) return `- ${surface}: Not checked`;
        return `- ${surface} (${row.observed_on}): ${row.outcome}` +
          (row.competitors ? `; other names: ${row.competitors}` : "") +
          (row.citations.length ? `; citations: ${row.citations.join(", ")}` : "") +
          (row.context ? `; context: ${row.context}` : "");
      }),
    ].join("\n")),
  ].join("\n\n");
}
