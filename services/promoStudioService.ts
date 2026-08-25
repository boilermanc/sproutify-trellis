import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { PromoManifest } from '../features/promo-studio/schemas/promoManifest';

export interface PromoProject {
  id: string;
  organization_id: string;
  branch_id: string;
  created_by: string;
  title: string;
  request_prompt: string;
  target_seconds: number;
  requested_formats: Array<'9:16' | '16:9' | '1:1'>;
  status: string;
  current_revision_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PromoRevision {
  id: string;
  project_id: string;
  revision_number: number;
  parent_revision_id: string | null;
  reason: string;
  schema_version: string;
  manifest: PromoManifest;
  manifest_fingerprint: string;
  immutable_at: string | null;
  created_at: string;
}

export interface PromoJob {
  id: string;
  project_id: string;
  revision_id: string;
  job_type: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancel_requested' | 'cancelled';
  progress: number;
  attempt_count: number;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
}

export interface PromoBranchSource {
  id: string;
  branch_id: string;
  repository_provider: 'github';
  repository_full_name: string;
  default_ref: string;
  permitted_paths: string[];
  prohibited_paths: string[];
  capture_base_url: string | null;
  capture_auth_profile_key: string | null;
  capture_fixture_key: string | null;
  is_active: boolean;
}

export interface PromoProjectDetail {
  project: PromoProject;
  source: PromoBranchSource | null;
  revision: PromoRevision | null;
  revisions: PromoRevision[];
  jobs: PromoJob[];
  approvals: Array<Record<string, unknown>>;
  assets: Array<Record<string, unknown>>;
  events: Array<Record<string, unknown>>;
}

async function messageFor(error: unknown) {
  if (error instanceof FunctionsHttpError) {
    try {
      const payload = await error.context.clone().json();
      return typeof payload?.error === 'string' ? payload.error : error.message;
    } catch { return error.message; }
  }
  return error instanceof Error ? error.message : 'Promo Studio request failed.';
}

async function callPromo<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('promo-studio', { body: { action, ...payload } });
  if (error) throw new Error(await messageFor(error));
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export async function listPromoProjects() {
  return (await callPromo<{ projects: PromoProject[] }>('list_projects')).projects;
}

export async function createPromoProject(input: {
  title: string; prompt: string; branch_id: string; target_seconds: number;
  formats: Array<'9:16' | '16:9' | '1:1'>;
}) {
  return callPromo<{ project: PromoProject; revision: PromoRevision }>('create_project', input);
}

export async function getPromoProject(projectId: string) {
  return callPromo<PromoProjectDetail>('get_project', { project_id: projectId });
}

export async function generatePromoCreativePlan(projectId: string) {
  return callPromo<{
    revision: PromoRevision;
    plan: Record<string, unknown>;
    claims: PromoManifest['evidence']['claims'];
  }>('generate_creative_plan', { project_id: projectId });
}

export async function createPromoRevision(projectId: string, manifest: PromoManifest, reason: string) {
  return callPromo<{ revision: PromoRevision }>('create_revision', {
    project_id: projectId, manifest, reason,
  });
}

export async function approvePromoClaim(projectId: string, claimId: string) {
  return callPromo<{ revision: PromoRevision; approval: Record<string, unknown> }>('approve_claim', {
    project_id: projectId, claim_id: claimId,
  });
}

export async function approvePromoScript(projectId: string) {
  return callPromo<{ revision: PromoRevision; approval: Record<string, unknown> }>('approve_script', {
    project_id: projectId,
  });
}

export async function queuePromoJob(projectId: string, jobType: string, input: Record<string, unknown> = {}) {
  return (await callPromo<{ job: PromoJob }>('create_job', {
    project_id: projectId, job_type: jobType, input,
  })).job;
}

export async function queuePromoCapture(projectId: string, scenarioId: string) {
  return (await callPromo<{ job: PromoJob }>('create_job', {
    project_id: projectId, job_type: 'capture', scenario_id: scenarioId,
  })).job;
}

export async function cancelPromoJob(projectId: string, jobId: string) {
  return (await callPromo<{ job: PromoJob }>('cancel_job', { project_id: projectId, job_id: jobId })).job;
}

export async function retryPromoJob(projectId: string, jobId: string) {
  return (await callPromo<{ job: PromoJob }>('retry_job', { project_id: projectId, job_id: jobId })).job;
}
