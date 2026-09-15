import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { TranscriptionJob, TranscriptionSegment } from '../types';

const BUCKET = 'transcription-audio';
const MAX_BYTES = 100 * 1024 * 1024;

async function functionError(error: unknown): Promise<string> {
  if (error instanceof FunctionsHttpError) {
    try {
      const body = await error.context.clone().json();
      return typeof body?.error === 'string' ? body.error : error.message;
    } catch { return error.message; }
  }
  return error instanceof Error ? error.message : 'Transcription request failed.';
}

async function call<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('transcriptions', { body: { action, ...payload } });
  if (error) throw new Error(await functionError(error));
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export async function listTranscriptions(): Promise<TranscriptionJob[]> {
  return (await call<{ jobs: TranscriptionJob[] }>('list')).jobs;
}

export async function createTranscription(file: File, title: string, mode: 'standard' | 'diarized'): Promise<TranscriptionJob> {
  if (!file.size || file.size > MAX_BYTES) throw new Error('Choose an audio or video file smaller than 100 MB.');
  const prepared = await call<{ job: TranscriptionJob; upload: { path: string; token: string } }>('create_upload', {
    title, filename: file.name, mime_type: file.type || 'application/octet-stream', file_size_bytes: file.size, mode,
  });
  const { error } = await supabase.storage.from(BUCKET)
    .uploadToSignedUrl(prepared.upload.path, prepared.upload.token, file, { contentType: file.type || prepared.job.mime_type });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  return (await call<{ job: TranscriptionJob }>('transcribe', { job_id: prepared.job.id })).job;
}

export async function updateTranscript(jobId: string, title: string, transcriptText: string): Promise<TranscriptionJob> {
  return (await call<{ job: TranscriptionJob }>('update', { job_id: jobId, title, transcript_text: transcriptText })).job;
}

export async function deleteTranscription(jobId: string): Promise<void> {
  await call('delete', { job_id: jobId });
}

const clock = (seconds: number, vtt = false) => {
  const safe = Math.max(0, seconds || 0);
  const hours = Math.floor(safe / 3600).toString().padStart(2, '0');
  const minutes = Math.floor((safe % 3600) / 60).toString().padStart(2, '0');
  const secs = Math.floor(safe % 60).toString().padStart(2, '0');
  const millis = Math.floor((safe % 1) * 1000).toString().padStart(3, '0');
  return `${hours}:${minutes}:${secs}${vtt ? '.' : ','}${millis}`;
};

export function exportTranscript(job: TranscriptionJob, format: 'txt' | 'srt' | 'vtt'): void {
  let content = job.transcript_text || '';
  const segments: TranscriptionSegment[] = Array.isArray(job.segments) ? job.segments : [];
  if (format === 'srt' || format === 'vtt') {
    const cues = segments.length ? segments : [{ start: 0, end: Math.max(1, job.duration_seconds || 1), text: content }];
    content = `${format === 'vtt' ? 'WEBVTT\n\n' : ''}${cues.map((segment, index) =>
      `${format === 'srt' ? `${index + 1}\n` : ''}${clock(segment.start, format === 'vtt')} --> ${clock(segment.end, format === 'vtt')}\n${segment.speaker ? `${segment.speaker}: ` : ''}${segment.text.trim()}`
    ).join('\n\n')}\n`;
  }
  const blob = new Blob([content], { type: format === 'txt' ? 'text/plain' : `text/${format}` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${job.title.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '') || 'transcript'}.${format}`;
  anchor.click();
  URL.revokeObjectURL(url);
}
