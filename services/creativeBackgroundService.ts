import { pollVideoAdJob, submitStaticAdJob } from './videoAdService';

interface GenerateCreativeBackgroundOptions {
  branchSlug: string;
  scene: string;
  styleNotes: string;
  platform: 'instagram' | 'reddit' | 'general';
  timeoutMs?: number;
}

export async function generateCreativeBackground(options: GenerateCreativeBackgroundOptions): Promise<string> {
  const { job_id } = await submitStaticAdJob({
    branch: options.branchSlug,
    message: options.scene,
    target_segment: '',
    platform: options.platform,
    aspect_ratio: '4:5',
    setting: '',
    style_notes: options.styleNotes,
    image_style: 'photo',
    purpose: 'card_background',
  });

  const pollMs = 5000;
  const timeoutMs = options.timeoutMs ?? 4 * 60 * 1000;
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    await new Promise(resolve => setTimeout(resolve, pollMs));
    const job = await pollVideoAdJob(job_id).catch(() => null);
    if (!job) continue;
    if (job.status === 'failed' || job.status === 'cancelled') {
      throw new Error(job.error_message || 'Background generation failed.');
    }
    if (job.frame_url) return job.frame_url;
  }

  throw new Error('Background generation timed out — check Creative Studio for the job, which may still finish.');
}
