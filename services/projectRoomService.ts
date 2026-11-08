import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { RoomDocument } from "./projectRoomDocuments";
export type RoomRole = "research" | "openai" | "anthropic" | "review" | "chief";
export interface RoomClient {
  id: string;
  name: string;
  website?: string;
  status: "prospect" | "customer";
  archived_at?: string | null;
  archive_reason?: string | null;
  follow_up_date?: string | null;
  follow_up_note?: string | null;
  version: number;
}
export interface RoomMember {
  user_id: string;
  role: "owner" | "member";
  name?: string;
  email?: string;
}
export interface RoomOperator {
  user_id: string;
  name?: string;
  email?: string;
}
export type AeoSurface = "chatgpt" | "perplexity" | "google_ai_overviews";
export type AeoOutcome = "mentioned" | "not_mentioned" | "no_answer";
export interface AeoObservation {
  surface: AeoSurface;
  question: number;
  outcome: AeoOutcome;
  observed_on: string;
  competitors: string;
  citations: string[];
  context: string;
  recorded_at: string;
}
export interface AeoBaseline {
  category: string;
  questions: string[];
  observations: AeoObservation[];
}
export interface AeoSearchRun {
  round: number;
  status: "running" | "finished" | "skipped" | "interrupted";
  reason?: "missing_connection" | "budget" | "interrupted";
  questions: string[];
  results: {
    question: number;
    outcome: "mentioned" | "not_mentioned" | "unmeasured";
    mentions: string[];
    competitors: string[];
    citations: { url: string; title: string }[];
    observed_at: string;
    model?: string;
  }[];
}
export interface RoomProposal {
  schema_version: number;
  title: string;
  stage: string;
  currency: string;
  close_date: string | null;
  objective: string;
  scope: string;
  deliverables: string;
  timeline: string;
  assumptions: string;
  exclusions: string;
  payment_terms: string;
  next_step: string;
  pricing_basis: string;
  items: {
    description: string;
    estimate_unit?: "hours" | "units";
    phase?: string;
    basis?: string;
    evidence?: string;
    quantity: number;
    unit_cents: number | null;
    frequency: "once" | "monthly";
    optional: boolean;
  }[];
  source_summary?: string;
  created_at?: string;
  updated_at?: string;
}
export interface ProposalSummary {
  stage: string;
  title: string;
  close_date: string | null;
  totals: {
    once: number;
    monthly: number;
    unpriced: number;
    optional_once: number;
    optional_monthly: number;
  };
}
export interface ProjectRoom {
  proposal?: ProposalSummary | null;
  client_id?: string | null;
  member_role?: "owner" | "member";
  members?: RoomMember[];
  id: string;
  title: string;
  kind: "client" | "product";
  brief: string;
  status: string;
  version: number;
  error?: string;
  busy?: boolean;
  state: {
    proposal?: RoomProposal;
    aeo?: AeoBaseline;
    meetings?: {
      source: string;
      source_id: string;
      title: string;
      started_at: string;
      summary: string;
    }[];
    intake?: Record<string, string>;
    documents?: RoomDocument[];
    max_rounds: number;
    call_budget: number;
    calls_used: number;
    summary: string;
    next_handoff: string;
    rounds: {
      number: number;
      stage: string;
      focus: string;
      outputs: Record<string, {
        text: string;
        source: string;
        model?: string;
        usage?: { input_tokens: number; output_tokens: number };
      }>;
      tasks: Record<string, { id: string }>;
      in_flight?: string[];
      documents?: RoomDocument[];
      aeo?: AeoBaseline;
      aeo_search?: AeoSearchRun;
    }[];
    decisions: { id: string; text: string; status: string; round: number }[];
    questions: string[];
    notes: { text: string; at: string }[];
    events: { at: string; text: string }[];
  };
}
export async function callRoom<T = { room: ProjectRoom }>(
  action: string,
  input: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await supabase.functions.invoke("project-rooms", {
    body: { action, ...input },
  });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = await error.context
        .clone()
        .json()
        .catch(() => ({}));
      throw new Error(payload.error || error.message);
    }
    throw error;
  }
  if (data?.error) throw new Error(data.error);
  return data;
}
