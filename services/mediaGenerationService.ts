import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type {
  CreateMediaFinishingJob,
  CreateMediaGenerationJob,
  MediaAsset,
  MediaGenerationJob,
  MediaGenerationLibraryItem,
  MediaGenerationProject,
  MediaModelCatalogEntry,
  ScheduleMediaGenerationOutput,
} from '../types';

export interface MediaJobDetail {
  job: MediaGenerationJob;
  inputs: Array<Record<string, unknown>>;
  attempts: Array<Record<string, unknown>>;
  outputs: Array<Record<string, unknown> & { signed_url?: string | null }>;
  events: Array<Record<string, unknown>>;
}

export interface MediaGenerationConfiguration {
  generation_enabled: boolean;
  finishing_enabled: boolean;
  role_allowed: boolean;
  cost_tracking_configured: boolean;
  max_active_jobs_per_user: number;
  max_daily_dispatches_per_user: number;
  execution_timeout_seconds: number;
  cost_per_gpu_second: number | null;
  publishing_handoff_enabled: boolean;
}

export async function getMediaGenerationLibrary(limit = 100): Promise<MediaGenerationLibraryItem[]> {
  return (await callMedia<{ items: MediaGenerationLibraryItem[] }>('list_library', { limit })).items;
}

export async function approveMediaGenerationOutput(outputId: string): Promise<void> {
  await callMedia<{ output: Record<string, unknown> }>('approve_output', { output_id: outputId });
}

export async function scheduleMediaGenerationOutput(input: ScheduleMediaGenerationOutput): Promise<{ post: Record<string, unknown> }> {
  return callMedia<{ post: Record<string, unknown> }>('schedule_output', { publication: input });
}

export async function createMediaFinishingJob(input: CreateMediaFinishingJob): Promise<{ finishing_job: Record<string, unknown> }> {
  return callMedia<{ finishing_job: Record<string, unknown> }>('create_finishing_job', { finishing: input });
}

async function mediaFunctionError(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const payload = await error.context.clone().json();
      return typeof payload?.error === 'string' ? payload.error : error.message;
    } catch {
      return error.message;
    }
  }
  return error instanceof Error ? error.message : 'Media generation request failed.';
}

async function callMedia<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('media-generation', { body: { action, ...payload } });
  if (error) throw new Error(await mediaFunctionError(error));
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export async function getMediaModels(): Promise<MediaModelCatalogEntry[]> {
  return (await callMedia<{ models: MediaModelCatalogEntry[] }>('list_models')).models;
}

export async function getMediaGenerationConfiguration(): Promise<MediaGenerationConfiguration> {
  return (await callMedia<{ configuration: MediaGenerationConfiguration }>('get_configuration')).configuration;
}

export async function createMediaProject(input: { name: string; description?: string; branch_id?: string | null }): Promise<MediaGenerationProject> {
  return (await callMedia<{ project: MediaGenerationProject }>('create_project', input)).project;
}

export async function getMediaProjects(): Promise<MediaGenerationProject[]> {
  return (await callMedia<{ projects: MediaGenerationProject[] }>('list_projects')).projects;
}

export async function uploadMediaAsset(
  projectId: string,
  file: File,
  options: { asset_type: string; role?: string; character_id?: string } ,
): Promise<MediaAsset> {
  const prepared = await callMedia<{ asset: MediaAsset; upload: { path: string; token: string } }>('create_upload', {
    project_id: projectId,
    filename: file.name,
    mime_type: file.type,
    ...options,
  });
  const { error } = await supabase.storage
    .from(prepared.asset.storage_bucket)
    .uploadToSignedUrl(prepared.upload.path, prepared.upload.token, file, { contentType: file.type });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return (await callMedia<{ asset: MediaAsset }>('complete_upload', {
    asset_id: prepared.asset.id,
    file_size_bytes: file.size,
  })).asset;
}

export async function createMediaGenerationJob(input: CreateMediaGenerationJob): Promise<MediaGenerationJob> {
  return (await callMedia<{ job: MediaGenerationJob }>('create_job', { job: input })).job;
}

export async function getMediaGenerationJobs(projectId: string, limit = 50): Promise<MediaGenerationJob[]> {
  return (await callMedia<{ jobs: MediaGenerationJob[] }>('list_jobs', { project_id: projectId, limit })).jobs;
}

export async function getMediaGenerationJob(jobId: string, refresh = false): Promise<MediaJobDetail> {
  return callMedia<MediaJobDetail>(refresh ? 'refresh_job' : 'get_job', { job_id: jobId });
}

export async function cancelMediaGenerationJob(jobId: string): Promise<MediaGenerationJob> {
  return (await callMedia<{ job: MediaGenerationJob }>('cancel_job', { job_id: jobId })).job;
}

export async function retryMediaGenerationJob(jobId: string): Promise<MediaGenerationJob> {
  return (await callMedia<{ job: MediaGenerationJob }>('retry_job', { job_id: jobId })).job;
}

