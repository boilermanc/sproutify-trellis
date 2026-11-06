import React, { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  FileText,
  Layers,
  Loader2,
} from "lucide-react";
import ProjectRoomDocuments from "./ProjectRoomDocuments";
import type { RoomDocument } from "../services/projectRoomDocuments";
import {
  intakeBrief,
  normalizeIntake,
  validateDocuments,
} from "../supabase/functions/_shared/project-room-intake.mjs";
type Kind = "client" | "product";
const control =
  "mt-2 w-full rounded-xl border border-slate-300 bg-white p-3 text-sm font-normal text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500";
const action =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40";
const companyFields = [
  ["name", "Company name", "The business you want reviewed"],
  [
    "website",
    "Company website",
    "https://example.com — optional if there is no website",
  ],
  [
    "objective",
    "What decision should this review help you make?",
    "For example: what should we improve first, and is a consulting engagement justified?",
  ],
  [
    "market",
    "Where and in what market does it operate?",
    "Location, services, customers and competitors you already know",
  ],
  [
    "audience",
    "Who will read or decide on the review?",
    "Owner, advisory team, internal planning…",
  ],
  [
    "known",
    "What pertinent information do you already have?",
    "Known strengths, conversations, current issues and context. Separate what you know from what you suspect.",
  ],
  [
    "constraints",
    "What needs to stay within scope?",
    "Existing systems, access, timing, budget and things already being improved",
  ],
  [
    "questions",
    "What should the team investigate?",
    "Specific questions, uncertainties or opportunities to test",
  ],
];
const productFields = [
  ["name", "Product or project name", "Name this specification"],
  [
    "objective",
    "What problem are we solving?",
    "Describe the outcome and why it matters",
  ],
  [
    "users",
    "Who is it for, and what should they be able to do?",
    "Intended users and the most important journeys",
  ],
  [
    "requirements",
    "What must the product do?",
    "Known features, behavior and functional requirements",
  ],
  [
    "constraints",
    "What are the difficult constraints?",
    "Hardware, power, performance, privacy, accessibility, cost or reliability",
  ],
  [
    "integrations",
    "What must it work with?",
    "APIs, devices, systems, data and external dependencies",
  ],
  [
    "decisions",
    "What have you already decided?",
    "Only decisions you have actually made; proposals can go in the open questions",
  ],
  [
    "success",
    "What would make the first version successful?",
    "Acceptance criteria, tests, limits and non-goals",
  ],
  [
    "questions",
    "What tradeoffs or unanswered questions need work?",
    "The hard requirements you want the team to challenge",
  ],
];
export default function ProjectRoomIntake({
  busy,
  missingConnections,
  onCreate,
}: {
  busy: boolean;
  missingConnections: string[];
  onCreate: (value: Record<string, unknown>) => Promise<boolean>;
}) {
  const [kind, setKind] = useState<Kind | null>(null);
  const [step, setStep] = useState(1);
  const [values, setValues] = useState<Record<Kind, Record<string, string>>>({
    client: {},
    product: {},
  });
  const [documents, setDocuments] = useState<RoomDocument[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [rounds, setRounds] = useState(3);
  const [budget, setBudget] = useState(15);
  const [error, setError] = useState("");
  function next() {
    try {
      if (!kind)
        throw new Error("Choose a company review or product specification.");
      if (step === 2) normalizeIntake(kind, values[kind]);
      if (step === 3) validateDocuments(documents);
      setError("");
      setStep(step + 1);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (step !== 4) {
      next();
      return;
    }
    try {
      const intake = normalizeIntake(kind, values[kind!]);
      validateDocuments(documents);
      setError("");
      await onCreate({
        kind,
        intake,
        documents,
        max_rounds: rounds,
        call_budget: budget,
      });
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <form
      onSubmit={submit}
      className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"
    >
      <header className="border-b border-blue-100 bg-[#102b4e] p-6 text-white md:p-8">
        <p className="text-[11px] font-bold uppercase tracking-[.22em] text-blue-200">
          Start with the right questions
        </p>
        <h2 className="mt-3 text-2xl font-bold">
          {step === 1
            ? "What are we working through?"
            : kind === "client"
              ? "Company opportunity review"
              : "Product specification"}
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-blue-100">
          {kind === "client"
            ? "Build a recommendation grounded in the company, its strengths and the practical work worth doing."
            : kind === "product"
              ? "Turn difficult requirements and tradeoffs into a specification the team can challenge and refine."
              : "Choose a path. We’ll guide the brief, supporting documents and decisions from there."}
        </p>
      </header>
      <div className="p-6 md:p-8">
        <ol
          aria-label="Setup progress"
          className="mb-8 flex flex-wrap gap-4 text-xs"
        >
          {[
            "Choose path",
            "Project context",
            "Documents",
            "Review & create",
          ].map((label, index) => (
            <li
              key={label}
              className={`flex items-center gap-2 ${step === index + 1 ? "font-bold text-blue-900" : "text-slate-400"}`}
              aria-current={step === index + 1 ? "step" : undefined}
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full border ${step > index + 1 ? "border-blue-700 bg-blue-700 text-white" : step === index + 1 ? "border-orange-400 bg-orange-50 text-blue-900" : "border-slate-200"}`}
              >
                {step > index + 1 ? <Check size={13} /> : index + 1}
              </span>
              {label}
            </li>
          ))}
        </ol>
        {error && (
          <p
            role="alert"
            className="mb-5 rounded-xl bg-orange-50 p-3 text-sm text-orange-900"
          >
            {error}
          </p>
        )}
        {step === 1 && (
          <div className="grid gap-4 md:grid-cols-2">
            {(
              [
                {
                  id: "client",
                  name: "Company review",
                  description:
                    "Research a business, understand what works, prioritize improvements and decide whether optional new work is justified.",
                  Icon: Building2,
                },
                {
                  id: "product",
                  name: "Product specification",
                  description:
                    "Work through users, requirements, constraints and acceptance criteria across several focused passes.",
                  Icon: Layers,
                },
              ] as const
            ).map(({ id, name, description, Icon }) => (
              <button
                type="button"
                key={id}
                aria-pressed={kind === id}
                className="group rounded-2xl border border-blue-200 p-6 text-left transition hover:border-orange-400 hover:bg-blue-50/50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                onClick={() => {
                  setKind(id);
                  setStep(2);
                  setError("");
                }}
              >
                <Icon size={28} className="text-blue-800" />
                <h3 className="mt-5 text-xl font-bold text-[#102b4e]">
                  {name}
                </h3>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  {description}
                </p>
                <span className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-blue-800">
                  Choose this path
                  <ArrowRight size={15} />
                </span>
              </button>
            ))}
          </div>
        )}
        {step === 2 && kind && (
          <div className="space-y-5">
            {(kind === "client" ? companyFields : productFields).map(
              ([key, label, hint]) => (
                <label
                  key={key}
                  className="block text-sm font-semibold text-[#102b4e]"
                  htmlFor={`room-intake-${key}`}
                >
                  {label}
                  {[
                    "name",
                    "objective",
                    ...(kind === "product" ? ["users", "success"] : []),
                  ].includes(key) && (
                    <span
                      className="ml-1 text-orange-700"
                      aria-label="required"
                    >
                      *
                    </span>
                  )}
                  {["name", "website", "audience"].includes(key) ? (
                    <input
                      id={`room-intake-${key}`}
                      className={control}
                      maxLength={key === "name" ? 140 : 2000}
                      value={values[kind][key] || ""}
                      onChange={(e) =>
                        setValues({
                          ...values,
                          [kind]: { ...values[kind], [key]: e.target.value },
                        })
                      }
                      placeholder={hint}
                    />
                  ) : (
                    <textarea
                      id={`room-intake-${key}`}
                      className={`${control} min-h-24 leading-6`}
                      maxLength={3000}
                      value={values[kind][key] || ""}
                      onChange={(e) =>
                        setValues({
                          ...values,
                          [kind]: { ...values[kind], [key]: e.target.value },
                        })
                      }
                      placeholder={hint}
                    />
                  )}
                </label>
              ),
            )}
            <p className="text-xs leading-5 text-slate-500">
              Project context and documents are user-supplied evidence. The team
              must verify claims and ask about gaps rather than treating them as
              established facts.
            </p>
          </div>
        )}
        {step === 3 && (
          <ProjectRoomDocuments
            documents={documents}
            onChange={setDocuments}
            onBusyChange={setExtracting}
            disabled={busy}
          />
        )}
        {step === 4 && kind && (
          <div className="space-y-6">
            <div className="rounded-2xl border-l-4 border-orange-400 bg-blue-50 p-5">
              <h3 className="font-bold text-[#102b4e]">
                {kind === "client"
                  ? "Recommendation first, evidence always"
                  : "Requirements you can test"}
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {kind === "client"
                  ? "The review will cover strengths, prioritized findings, improvements to what exists, optional new work, discovery, practical next steps, and sources and limits. No proposal becomes an approved decision automatically."
                  : "The spec will cover scope, functional requirements, constraints, integrations, acceptance criteria, unresolved tradeoffs and proposed decisions. Existing user decisions remain distinct from agent proposals."}
              </p>
            </div>
            <details>
              <summary className="cursor-pointer text-sm font-semibold text-blue-900">
                Review the project packet
              </summary>
              <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-slate-50 p-4 text-xs leading-6">
                {intakeBrief(kind, values[kind])}
              </pre>
            </details>
            <p className="flex items-center gap-2 text-sm text-slate-600">
              <FileText size={17} />
              {documents.length} document{documents.length === 1 ? "" : "s"} ·{" "}
              {documents
                .reduce((n, d) => n + d.text.length, 0)
                .toLocaleString()}{" "}
              extracted characters included in the next round
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold text-[#102b4e]">
                Maximum rounds
                <input
                  aria-label="Maximum rounds"
                  className={control}
                  type="number"
                  min={1}
                  max={5}
                  value={rounds}
                  onChange={(e) => setRounds(Number(e.target.value))}
                />
              </label>
              <label className="text-sm font-semibold text-[#102b4e]">
                Provider request budget
                <input
                  aria-label="Provider request budget"
                  className={control}
                  type="number"
                  min={1}
                  max={25}
                  value={budget}
                  onChange={(e) => setBudget(Number(e.target.value))}
                />
              </label>
            </div>
            <p className="text-xs leading-5 text-slate-500">
              A full round uses up to five generation requests. Limits cap
              requests, not dollar or Manus credit spend. Creating a room does
              not start provider work; review it and select Start research.
            </p>
            {missingConnections.length > 0 && (
              <p className="rounded-xl bg-orange-50 p-3 text-sm text-orange-900">
                Missing connections: {missingConnections.join(", ")}. Those
                handoffs pause for a connection or a clearly labeled imported
                response.
              </p>
            )}
          </div>
        )}
        {step > 1 && (
          <footer className="mt-8 flex flex-wrap justify-between gap-3 border-t border-slate-200 pt-5">
            <button
              type="button"
              disabled={busy || extracting}
              className={`${action} text-slate-600`}
              onClick={() => {
                setStep(step - 1);
                setError("");
              }}
            >
              <ArrowLeft size={16} />
              Back
            </button>
            <button
              disabled={busy || extracting}
              className={`${action} border-[#102b4e] bg-[#102b4e] text-white`}
            >
              {busy ? <Loader2 size={16} className="animate-spin" /> : null}
              {step === 4
                ? "Create private room"
                : step === 3 && documents.length === 0
                  ? "Continue without documents"
                  : "Continue"}
              <ArrowRight size={16} />
            </button>
          </footer>
        )}
      </div>
    </form>
  );
}
