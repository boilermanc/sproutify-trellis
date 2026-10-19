export interface VideoEdit { start: number; end: number; headline: string; audio: boolean }

export function validateVideoEdit(edit: VideoEdit, duration: number): string | null {
  if (![duration, edit.start, edit.end].every(Number.isFinite) || duration <= 0) return 'Wait for the video to load.';
  if (edit.start < 0 || edit.end > duration || edit.end - edit.start < 0.5) return 'Choose at least half a second within the source video.';
  if (edit.end - edit.start > 180) return 'Keep this edit to three minutes or less.';
  return null;
}

export function mp4RecordingType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return ['video/mp4;codecs=avc1.424028,mp4a.40.2', 'video/mp4'].find(type => MediaRecorder.isTypeSupported(type));
}

function mediaEvent(video: HTMLVideoElement, name: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const finish = (error?: Error) => { clearTimeout(timer); video.removeEventListener(name, done); video.removeEventListener('error', failed); signal.removeEventListener('abort', aborted); error ? reject(error) : resolve(); };
    const done = () => finish();
    const failed = () => finish(new Error('This video cannot be decoded. Try an H.264 MP4 file.'));
    const aborted = () => finish(new DOMException('Export cancelled', 'AbortError'));
    const timer = setTimeout(() => finish(new Error('Video loading timed out.')), 15000);
    video.addEventListener(name, done, { once: true }); video.addEventListener('error', failed, { once: true }); signal.addEventListener('abort', aborted, { once: true });
    if (signal.aborted) aborted();
  });
}

/** Local, real-time export. Never uploads media or calls a publishing API. */
export async function exportVideoEdit(source: string, edit: VideoEdit, signal: AbortSignal, progress: (value: number) => void): Promise<Blob> {
  const mimeType = mp4RecordingType();
  if (!mimeType) throw new Error('MP4 export is unavailable in this browser. Try a current Chrome or Edge browser.');
  const video = document.createElement('video');
  video.playsInline = true; video.preload = 'auto';
  const audio = edit.audio ? new AudioContext() : null;
  let stream: MediaStream | undefined;
  let recorder: MediaRecorder | undefined;
  let frame = 0;
  try {
    if (audio) await audio.resume();
    const loaded = mediaEvent(video, 'loadeddata', signal); video.src = source; video.load(); await loaded;
    const error = validateVideoEdit(edit, video.duration); if (error) throw new Error(error);
    if (edit.start > 0) { const seeked = mediaEvent(video, 'seeked', signal); video.currentTime = edit.start; await seeked; }
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 1920 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(2, Math.round(video.videoWidth * scale / 2) * 2);
    canvas.height = Math.max(2, Math.round(video.videoHeight * scale / 2) * 2);
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Video canvas is unavailable.');
    const draw = () => {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const text = edit.headline.trim();
      if (text) {
        let size = canvas.width * 0.055;
        ctx.font = `bold ${size}px sans-serif`;
        while (ctx.measureText(text).width > canvas.width * 0.8 && size > 8) { size -= 1; ctx.font = `bold ${size}px sans-serif`; }
        const y = canvas.height * 0.14;
        ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(canvas.width * 0.07, y - size, canvas.width * 0.86, size * 1.6);
        ctx.textAlign = 'center'; ctx.fillStyle = 'white'; ctx.fillText(text, canvas.width / 2, y + size * 0.12);
      }
    };
    draw(); stream = canvas.captureStream(30);
    if (audio) {
      const destination = audio.createMediaStreamDestination();
      audio.createMediaElementSource(video).connect(destination);
      destination.stream.getAudioTracks().forEach(track => stream!.addTrack(track));
    } else video.muted = true;
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 });
    const chunks: BlobPart[] = [];
    await new Promise<void>((resolve, reject) => {
      let failure: Error | undefined;
      const stop = (error?: Error) => { failure ||= error; video.pause(); if (recorder!.state !== 'inactive') recorder!.stop(); else reject(failure || new Error('Recording stopped unexpectedly.')); };
      const abort = () => stop(new DOMException('Export cancelled', 'AbortError'));
      const hidden = () => { if (document.hidden) stop(new Error('Export interrupted: keep this tab visible and try again.')); };
      const timer = setTimeout(() => stop(new Error('Export stalled. Please try again.')), (edit.end - edit.start + 30) * 1000);
      signal.addEventListener('abort', abort, { once: true }); document.addEventListener('visibilitychange', hidden);
      recorder!.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder!.onerror = () => stop(new Error('MP4 encoding failed. Try a smaller clip.'));
      recorder!.onstop = () => { clearTimeout(timer); cancelAnimationFrame(frame); signal.removeEventListener('abort', abort); document.removeEventListener('visibilitychange', hidden); failure ? reject(failure) : resolve(); };
      const tick = () => { draw(); progress(Math.min(1, (video.currentTime - edit.start) / (edit.end - edit.start))); if (video.currentTime >= edit.end || video.ended) stop(); else frame = requestAnimationFrame(tick); };
      recorder!.start(250);
      if (signal.aborted) { abort(); return; }
      video.play().then(() => { if (recorder!.state === 'recording' && !signal.aborted) frame = requestAnimationFrame(tick); }).catch(() => stop(new Error('Playback could not start. Please try again.')));
    });
    const result = new Blob(chunks, { type: recorder.mimeType });
    if (!result.size) throw new Error('Export produced no video.');
    progress(1); return result;
  } finally {
    cancelAnimationFrame(frame); video.pause(); video.removeAttribute('src'); video.load();
    stream?.getTracks().forEach(track => track.stop());
    if (audio) await audio.close();
  }
}
