import { useState, useEffect, useRef, useCallback } from 'react';
import { VideoAdJob } from '../types';
import { pollVideoAdJob, SpokeCredentials } from '../services/videoAdService';

const POLL_INTERVAL_MS = 5_000;
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

export function useVideoAdPoller(
  jobIds: string[],
  onStatusChange: (job: VideoAdJob) => void,
  enabled: boolean = true,
  creds?: SpokeCredentials,
): { activeCount: number } {
  const lastKnownRef = useRef<Map<string, VideoAdJob>>(new Map());
  const onStatusChangeRef = useRef(onStatusChange);
  onStatusChangeRef.current = onStatusChange;

  const [activeCount, setActiveCount] = useState(0);

  const pollAll = useCallback(async () => {
    const map = lastKnownRef.current;
    const idsToPoll = jobIds.filter((id) => !map.has(id) || !TERMINAL_STATUSES.has(map.get(id)!.status));

    if (idsToPoll.length === 0) {
      setActiveCount(0);
      return;
    }

    const results = await Promise.allSettled(
      idsToPoll.map((id) => pollVideoAdJob(id, creds)),
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status !== 'fulfilled' || !result.value) continue;

      const job = result.value;
      const prev = map.get(job.id);

      if (!prev || prev.status !== job.status) {
        onStatusChangeRef.current(job);
      }

      if (TERMINAL_STATUSES.has(job.status)) {
        map.delete(job.id);
      } else {
        map.set(job.id, job);
      }
    }

    setActiveCount(map.size);
  }, [jobIds, creds]);

  useEffect(() => {
    if (!enabled || jobIds.length === 0) {
      setActiveCount(0);
      return;
    }

    // Seed map entries for new IDs so we track them immediately
    const map = lastKnownRef.current;
    for (const id of jobIds) {
      if (!map.has(id)) {
        map.set(id, { id, status: 'queued' } as VideoAdJob);
      }
    }
    setActiveCount(map.size);

    // Kick off an immediate poll, then interval
    pollAll();
    const handle = setInterval(pollAll, POLL_INTERVAL_MS);
    return () => clearInterval(handle);
  }, [enabled, jobIds, pollAll]);

  return { activeCount };
}
