import { useState, useEffect, useRef, useCallback } from 'react';
import { MusicGeneration } from '../types';
import { pollMusicJob } from '../services/musicService';

const POLL_INTERVAL_MS = 5_000;
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'archived']);

export function useMusicPoller(
  jobIds: string[],
  onStatusChange: (job: MusicGeneration) => void,
  enabled: boolean = true,
): { activeCount: number } {
  const lastKnownRef = useRef<Map<string, MusicGeneration>>(new Map());
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

    const results = await Promise.allSettled(idsToPoll.map((id) => pollMusicJob(id)));

    for (const result of results) {
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
  }, [jobIds]);

  useEffect(() => {
    if (!enabled || jobIds.length === 0) {
      setActiveCount(0);
      return;
    }

    const map = lastKnownRef.current;
    for (const id of jobIds) {
      if (!map.has(id)) {
        map.set(id, { id, status: 'queued' } as MusicGeneration);
      }
    }
    setActiveCount(map.size);

    pollAll();
    const handle = setInterval(pollAll, POLL_INTERVAL_MS);
    return () => clearInterval(handle);
  }, [enabled, jobIds, pollAll]);

  return { activeCount };
}
