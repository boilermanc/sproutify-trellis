import { supabase } from '../lib/supabase';
import { uploadSocialMedia } from '../lib/supabaseService';
import { ScheduledPost, NewScheduledPost } from '../types';

// ─── Post Scheduler Service ────────────────────────────────────────
// "Bring your own creative": upload images designed elsewhere, caption
// them, and drop them into scheduled_social_posts on Hub Supabase. An
// n8n worker (built in parallel) polls for due rows every ~10 minutes
// and publishes them — this service only ever writes to the queue.
// ────────────────────────────────────────────────────────────────────

// n8n's Supabase node writes JSONB columns by stringifying them, which
// PostgREST then stores as a JSON *string* rather than a native array.
// Normalize on read so callers can always trust the shape, whoever wrote
// the row (see services/videoAdService.ts for the same pattern).
function parseJsonbField<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value as T;
  try {
    const parsed = JSON.parse(value);
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

function normalizePost(row: any): ScheduledPost {
  return {
    ...row,
    media_urls: parseJsonbField<string[]>(row.media_urls, []),
  } as ScheduledPost;
}

// ─── 1. uploadPostImage ────────────────────────────────────────────
// Reuses the existing social media upload path (avatars bucket, social/
// prefix) — no new storage bucket/policy needed.
export async function uploadPostImage(branchSlug: string, file: File): Promise<string> {
  const { url, error } = await uploadSocialMedia(branchSlug || 'post-scheduler', file);
  if (!url) {
    throw new Error(error || `Failed to upload ${file.name}`);
  }
  return url;
}

// ─── 2. createScheduledPosts ───────────────────────────────────────
// Bulk insert — a week's worth of drops in one go.
export async function createScheduledPosts(posts: NewScheduledPost[]): Promise<ScheduledPost[]> {
  if (posts.length === 0) return [];

  const rows = posts.map(p => ({
    branch_id: p.branch_id,
    branch_slug: p.branch_slug ?? null,
    platform: p.platform,
    caption: p.caption,
    media_type: p.media_type,
    media_urls: p.media_urls,
    scheduled_for: p.scheduled_for,
    source: p.source || 'upload',
    created_by: p.created_by ?? null,
  }));

  const { data, error } = await supabase
    .from('scheduled_social_posts')
    .insert(rows)
    .select();

  if (error) {
    throw new Error(`Failed to queue scheduled posts: ${error.message}`);
  }

  return ((data as any[]) ?? []).map(normalizePost);
}

// ─── 3. fetchScheduledPosts ────────────────────────────────────────
// Normalized on read, ordered by scheduled_for (soonest first).
export async function fetchScheduledPosts(opts?: {
  branchSlug?: string;
  status?: string;
}): Promise<ScheduledPost[]> {
  let query = supabase
    .from('scheduled_social_posts')
    .select('*')
    .order('scheduled_for', { ascending: true });

  if (opts?.branchSlug) {
    query = query.eq('branch_slug', opts.branchSlug);
  }
  if (opts?.status) {
    query = query.eq('status', opts.status);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to fetch scheduled posts: ${error.message}`);
  }

  return ((data as any[]) ?? []).map(normalizePost);
}

// ─── 4. updateScheduledPost ────────────────────────────────────────
export async function updateScheduledPost(
  id: string,
  patch: Partial<Pick<ScheduledPost, 'caption' | 'platform' | 'scheduled_for' | 'status' | 'media_urls'>>,
): Promise<ScheduledPost> {
  const { data, error } = await supabase
    .from('scheduled_social_posts')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update scheduled post ${id}: ${error.message}`);
  }

  return normalizePost(data);
}

// ─── 5. cancelScheduledPost ────────────────────────────────────────
export async function cancelScheduledPost(id: string): Promise<void> {
  const { error } = await supabase
    .from('scheduled_social_posts')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    throw new Error(`Failed to cancel scheduled post ${id}: ${error.message}`);
  }
}

// ─── 6. buildSchedule ──────────────────────────────────────────────
// Pure date-sequencing helper: given a start date, a row count, a
// cadence, and a time of day, returns that many ISO timestamps.
// `weekdays` skips Saturday/Sunday when advancing (the start date
// itself is used as-is even if it falls on a weekend).
export function buildSchedule(
  startISO: string,
  count: number,
  cadence: 'daily' | 'weekdays' | 'every_2_days' | 'weekly',
  timeOfDay: string,
): string[] {
  if (count <= 0) return [];

  const [hh, mm] = (timeOfDay || '09:00').split(':').map(n => parseInt(n, 10));
  const hours = Number.isFinite(hh) ? hh : 9;
  const minutes = Number.isFinite(mm) ? mm : 0;

  const start = new Date(startISO);
  start.setHours(hours, minutes, 0, 0);

  const results: string[] = [];
  const cursor = new Date(start);

  const stepDays = cadence === 'every_2_days' ? 2 : cadence === 'weekly' ? 7 : 1;

  // For weekdays cadence, even the start date itself must land on a
  // weekday — nudge forward if the chosen start falls on Sat/Sun.
  if (cadence === 'weekdays') {
    while (cursor.getDay() === 0 || cursor.getDay() === 6) {
      cursor.setDate(cursor.getDate() + 1);
    }
  }

  let i = 0;
  while (results.length < count) {
    if (i === 0) {
      results.push(new Date(cursor).toISOString());
    } else {
      if (cadence === 'weekdays') {
        cursor.setDate(cursor.getDate() + 1);
        while (cursor.getDay() === 0 || cursor.getDay() === 6) {
          cursor.setDate(cursor.getDate() + 1);
        }
      } else {
        cursor.setDate(cursor.getDate() + stepDays);
      }
      results.push(new Date(cursor).toISOString());
    }
    i++;
  }

  return results;
}
