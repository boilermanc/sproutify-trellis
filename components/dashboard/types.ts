// Shared contract for the redesigned Dashboard (docs/design_handoff_dashboard_redesign).
//
// Every value here must be traceable to a live source. Where a number cannot be
// computed from real data, the type allows null and the UI renders an em dash —
// it must never fall back to 0, because "zero" and "unknown" mean different
// things and conflating them is the exact failure the audit describes.

import { ViewState } from '../../types';

export type DashboardTab = 'control' | 'standup' | 'board';
export type TimeWindow = '7d' | '30d';

// ── Windowed metrics ──────────────────────────────────────────────
// delta is null when there is no prior window to compare against (e.g. the
// spoke has less history than the window), NOT zero.
export interface WindowMetric {
  value: number;
  delta: number | null;      // absolute change vs the prior window
  deltaPct: number | null;   // percentage change, null when the prior window is 0
}

export interface WindowTotals {
  revenue: WindowMetric;
  postsPublished: WindowMetric;
  newProfiles: WindowMetric;
  openRate: WindowMetric;    // percentage points; delta is also in points
  bounced: number;
  hasEmailData: boolean;     // false → render the open-rate row as unavailable
}

// ── System health ─────────────────────────────────────────────────
export type SystemStatus = 'ok' | 'down' | 'error' | 'stale';

export interface SystemRow {
  key: string;
  name: string;          // mono-rendered service name
  status: SystemStatus;
  code: string;          // 'OK' | '404' | 'STALE' | 'ERROR'
  detail: string;
}

export interface WebhookHealth {
  path: string;
  label: string;
  status: 'ok' | 'down' | 'error';
  http_code: number | null;
  detail: string;
  checked_at: string;
}

// ── Today timeline ────────────────────────────────────────────────
export type TimelineState =
  | 'posted' | 'synced' | 'queued' | 'waiting' | 'error' | 'at_risk' | 'empty';

export interface TimelineItem {
  id: string;
  at: string;              // ISO; may be in the future for queued items
  branchName: string;
  branchColor: string;
  branchSlug: string | null;
  text: string;
  state: TimelineState;
  actionLabel?: string;    // 'Preview' | 'Approve' | 'Fix' | 'Reroute' | 'Draft'
  actionView?: ViewState;
}

// ── Queue (Morning Standup + Control Room preview) ────────────────
export type Severity = 'blocking' | 'overdue' | 'stale' | 'waiting' | 'idle';

export const SEVERITY_RANK: Record<Severity, number> = {
  blocking: 1, overdue: 2, stale: 3, waiting: 4, idle: 5,
};

export interface QueueItem {
  // Stable identity derived from the item itself (e.g. 'spoke-error:{id}'),
  // never a list index — snoozes are keyed on this and must survive re-sorting.
  key: string;
  severity: Severity;
  title: string;
  detail: string;
  branchName: string;
  branchColor: string;
  branchSlug: string | null;
  occurredAt: string | null;   // drives the age label; null → no age shown
  actionLabel: string;
  actionView?: ViewState;
  inlineAction?: 'sync';       // handled in place rather than by navigating
}

// ── Branch Board ──────────────────────────────────────────────────
export type BranchHealth = 'healthy' | 'aging' | 'stale' | 'down' | 'offline';

export interface BranchCardData {
  slug: string;
  name: string;
  color: string;
  host: string;
  logoUrl: string | null;
  health: BranchHealth;
  healthLabel: string;
  profiles: number;
  profilesDelta: number | null;
  revenue: number;
  revenueDelta: number | null;
  followers: number | null;      // null when Meta insights are unavailable
  followersDelta: null;          // deliberately always null: no follower history is kept
  posts: number;
  sparkline: number[];           // daily revenue over the window, oldest first
  nextAction: {
    text: string;
    tone: 'blocking' | 'warning' | 'positive';
    label: string;               // one word: 'Re-test' | 'Fix' | 'Review' | 'Draft' | 'Schedule'
    view?: ViewState;
  } | null;
}

// ── What worked ───────────────────────────────────────────────────
export interface PerformerPost {
  id: string;
  title: string;
  branchName: string;
  platform: string;
  engagementRate: number | null;
  reach: number | null;
  imageUrl: string | null;
}

// Requires >= 3 posts in the window; below that the card is hidden entirely
// rather than crowning a winner from a sample of one.
export interface WhatWorked {
  top: PerformerPost;
  bottom: PerformerPost;
}
