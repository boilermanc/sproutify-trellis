import { supabase } from '../lib/supabase';
import {
  MediaTextCue, MediaTextStyle, MotionPostAudioOption, MotionPostFinishingJob,
  MotionPostJob, ScheduledPost,
} from '../types';

const BUCKET = 'motion-posts';

function functionError(error: any, fallback: string) {
  const context = error?.context;
  if (context && typeof context.json === 'function') {
    return context.json().then((payload: any) => payload?.error || error.message || fallback).catch(() => error?.message || fallback);
  }
  return Promise.resolve(error?.message || fallback);
}

export async function uploadMotionPostSource(file: File): Promise<{ path: string; url: string }> {
  const imageExtension = /\.(?:jpe?g|jfif|png|webp|gif|avif)$/i.test(file.name);
  if (!file.type.startsWith('image/') && !imageExtension) throw new Error('Choose a PNG, JPEG, JFIF, WebP, or other image file.');
  if (file.size > 15 * 1024 * 1024) throw new Error('The source image must be 15 MB or smaller.');
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) throw new Error('Sign in before uploading a Motion Post image.');
  const ext = (file.name.split('.').pop() || 'jpg').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'jpg';
  const path = `${auth.user.id}/${crypto.randomUUID()}/source.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type || 'image/jpeg', upsert: false,
  });
  if (error) throw new Error(`Could not upload the image: ${error.message}`);
  const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  return { path, url };
}

export interface CreateMotionPostInput {
  branch_id: string;
  title: string;
  prompt: string;
  source_path: string;
  duration_seconds: 5 | 7 | 10 | 15;
  resolution: '480p' | '720p' | '1080p';
  audio?: MotionPostAudioOption | null;
  audio_start_seconds?: number;
  caption?: string;
}

export async function createMotionPost(input: CreateMotionPostInput): Promise<MotionPostJob> {
  const { data, error } = await supabase.functions.invoke('motion-posts', {
    body: {
      op: 'generate', branch_id: input.branch_id, title: input.title,
      prompt: input.prompt, source_path: input.source_path,
      duration_seconds: input.duration_seconds, resolution: input.resolution,
      audio_source_type: input.audio?.source_type || null,
      audio_source_id: input.audio?.id || null,
      audio_start_seconds: input.audio_start_seconds || 0,
      caption: input.caption || '',
    },
  });
  if (error) throw new Error(await functionError(error, 'Could not start motion generation.'));
  if (!data?.job) throw new Error(data?.error || 'The Motion Posts service returned no job.');
  return data.job as MotionPostJob;
}

export async function pollMotionPost(jobId: string): Promise<MotionPostJob> {
  const { data, error } = await supabase.functions.invoke('motion-posts', { body: { op: 'poll', job_id: jobId } });
  if (error) throw new Error(await functionError(error, 'Could not refresh the Motion Post.'));
  if (!data?.job) throw new Error(data?.error || 'Motion Post not found.');
  return (await hydrateMotionPosts([data.job as MotionPostJob]))[0];
}

export async function listMotionPosts(): Promise<MotionPostJob[]> {
  const { data, error } = await supabase.from('motion_post_jobs').select('*').order('created_at', { ascending: false }).limit(50);
  if (error) throw new Error(`Could not load Motion Posts: ${error.message}`);
  return hydrateMotionPosts((data || []) as MotionPostJob[]);
}

async function hydrateMotionPosts(jobs: MotionPostJob[]): Promise<MotionPostJob[]> {
  if (!jobs.length) return jobs;
  const ids = jobs.map(job => job.id);
  const [finishes, publications] = await Promise.all([
    supabase.from('motion_post_finishing_jobs').select('*').in('motion_post_job_id', ids).order('created_at', { ascending: false }),
    supabase.from('scheduled_social_posts').select('*').in('source_motion_post_id', ids).order('created_at', { ascending: false }),
  ]);
  if (finishes.error) throw new Error(`Could not load text renders: ${finishes.error.message}`);
  // Older deployments can briefly lack the provenance columns while the UI
  // rolls out. Treat that as no queued publications, but do not hide other DB errors.
  if (publications.error && !/source_motion_post_id/i.test(publications.error.message)) {
    throw new Error(`Could not load queued Reels: ${publications.error.message}`);
  }
  const latestFinish = new Map<string, MotionPostFinishingJob>();
  for (const row of (finishes.data || []) as MotionPostFinishingJob[]) {
    if (!latestFinish.has(row.motion_post_job_id)) latestFinish.set(row.motion_post_job_id, row);
  }
  const latestPublication = new Map<string, ScheduledPost>();
  for (const row of (publications.data || []) as ScheduledPost[]) {
    if (row.source_motion_post_id && !latestPublication.has(row.source_motion_post_id)) {
      latestPublication.set(row.source_motion_post_id, row);
    }
  }
  return jobs.map(job => ({
    ...job,
    latest_finish: latestFinish.get(job.id) || null,
    latest_publication: latestPublication.get(job.id) || null,
  }));
}

export async function listMotionPostAudio(): Promise<MotionPostAudioOption[]> {
  const { data, error } = await supabase.functions.invoke('motion-posts', { body: { op: 'list_audio' } });
  if (error) throw new Error(await functionError(error, 'Could not load Rekkrd audio.'));
  return (data?.tracks || []) as MotionPostAudioOption[];
}

export async function queueMotionPostFinish(input: {
  job_id: string;
  text_cues: MediaTextCue[];
  style: MediaTextStyle;
  idempotency_key: string;
}): Promise<MotionPostFinishingJob> {
  const { data, error } = await supabase.functions.invoke('motion-posts', {
    body: { op: 'queue_finish', ...input },
  });
  if (error) throw new Error(await functionError(error, 'Could not queue the text render.'));
  if (!data?.finishing_job) throw new Error(data?.error || 'The finishing service returned no job.');
  return data.finishing_job as MotionPostFinishingJob;
}

export async function queueMotionPostPublication(input: {
  job_id: string;
  finishing_job_id?: string | null;
  caption: string;
  scheduled_for: string;
  idempotency_key: string;
}): Promise<ScheduledPost> {
  const { data, error } = await supabase.functions.invoke('motion-posts', {
    body: { op: 'queue_publish', ...input },
  });
  if (error) throw new Error(await functionError(error, 'Could not queue the Reel.'));
  if (!data?.publication) throw new Error(data?.error || 'The publisher returned no queue record.');
  return data.publication as ScheduledPost;
}
