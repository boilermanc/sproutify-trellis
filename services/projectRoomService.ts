import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { RoomDocument } from "./projectRoomDocuments";
export type RoomRole = "research" | "openai" | "anthropic" | "review" | "chief";
export interface ProjectRoom {
  id: string;
  title: string;
  kind: "client" | "product";
  brief: string;
  status: string;
  version: number;
  error?: string;
  busy?: boolean;
  state: {
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
      outputs: Record<string, { text: string; source: string; model?: string }>;
      tasks: Record<string, { id: string }>;
      in_flight?: string[];
      documents?: RoomDocument[];
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
