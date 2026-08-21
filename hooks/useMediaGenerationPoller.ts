import { useCallback, useEffect, useRef, useState } from 'react';
import type { MediaGenerationJob } from '../types';
import { getMediaGenerationJob } from '../services/mediaGenerationService';

const TERMINAL = new Set(['succeeded', 'failed', 'cancelled']);

export function useMediaGenerationPoller(
  jobIds: string[],
  onChange: (job: MediaGenerationJob) => void,
  enabled = true,
  intervalMs = 5_000,
): { activeCount: number; pollNow: () => Promise<void> } {
  const known = useRef(new Map<string, MediaGenerationJob>());
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [activeCount, setActiveCount] = useState(0);

  const pollNow = useCallback(async () => {
    const activeIds = jobIds.filter(id => !known.current.has(id) || !TERMINAL.has(known.current.get(id)!.status));
    const results = await Promise.allSettled(activeIds.map(id => getMediaGenerationJob(id, true)));
    for (const result of results) {
      if (result.status !== 'fulfilled') continue;
      const job = result.value.job;
      const previous = known.current.get(job.id);
      if (!previous || previous.status !== job.status || previous.progress !== job.progress || previous.error_message !== job.error_message) onChangeRef.current(job);
      if (TERMINAL.has(job.status)) known.current.delete(job.id);
      else known.current.set(job.id, job);
    }
    setActiveCount(known.current.size);
  }, [jobIds]);

  useEffect(() => {
    if (!enabled || jobIds.length === 0) {
      setActiveCount(0);
      return;
    }
    void pollNow();
    const timer = window.setInterval(() => void pollNow(), intervalMs);
    return () => window.clearInterval(timer);
  }, [enabled, intervalMs, jobIds, pollNow]);

  return { activeCount, pollNow };
}
