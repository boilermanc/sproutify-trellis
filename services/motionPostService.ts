import { supabase } from '../lib/supabase';
import { MotionPostAudioOption, MotionPostJob } from '../types';
import { publishToSocial } from './socialService';

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
  return data.job as MotionPostJob;
}

export async function listMotionPosts(): Promise<MotionPostJob[]> {
  const { data, error } = await supabase.from('motion_post_jobs').select('*').order('created_at', { ascending: false }).limit(50);
  if (error) throw new Error(`Could not load Motion Posts: ${error.message}`);
  return (data || []) as MotionPostJob[];
}

export async function listMotionPostAudio(): Promise<MotionPostAudioOption[]> {
  const { data, error } = await supabase.functions.invoke('motion-posts', { body: { op: 'list_audio' } });
  if (error) throw new Error(await functionError(error, 'Could not load Rekkrd audio.'));
  return (data?.tracks || []) as MotionPostAudioOption[];
}

async function setPublishStatus(jobId: string, status: 'ready' | 'publishing' | 'published', errorMessage?: string) {
  const { data, error } = await supabase.functions.invoke('motion-posts', {
    body: { op: 'mark_publish_status', job_id: jobId, status, error_message: errorMessage || '' },
  });
  if (error) throw new Error(await functionError(error, 'Could not update publish status.'));
  return data?.job as MotionPostJob;
}

export async function publishMotionPost(job: MotionPostJob): Promise<MotionPostJob> {
  if (!job.output_url) throw new Error('This Motion Post has no finished video.');
  if (!job.branch_id) throw new Error('Choose a branch with an Instagram connection before publishing.');
  if (!job.caption?.trim()) throw new Error('Add a caption before publishing.');
  await setPublishStatus(job.id, 'publishing');
  const outcome = await publishToSocial(job.branch_id, job.caption, job.output_url, null, undefined, {
    media_type: 'video', media_urls: [job.output_url],
  });
  if (!outcome.ok) {
    await setPublishStatus(job.id, 'ready', outcome.error);
    throw new Error(outcome.error || 'Instagram publishing failed.');
  }
  return setPublishStatus(job.id, 'published');
}
