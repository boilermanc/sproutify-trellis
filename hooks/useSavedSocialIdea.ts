import { useMemo, useRef, useState } from 'react';
import type { SocialIdeaWorkspace } from '../types';
import { sanitizePII } from '../services/aiService';

// Separate fields prevent the chat and notes editor from overwriting each other.
// Versioned keys isolate this workspace from other Trellis drafts.
export function useSavedSocialIdea<K extends keyof SocialIdeaWorkspace>(brand: string, field: K) {
  type Value = SocialIdeaWorkspace[K];
  type Entry = { value: Value; failed: boolean };
  const key = `trellis_social_idea_v1:${encodeURIComponent(brand)}:${field}`;
  const loaded = useMemo<Entry>(() => {
    const empty = (field === 'messages' ? [] : '') as Value;
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return { value: empty, failed: false };
      const data: unknown = JSON.parse(raw);
      if (field === 'messages') {
        if (!Array.isArray(data) || !data.every(item => item && (item.role === 'user' || item.role === 'sage') && typeof item.text === 'string')) throw new Error('Invalid chat');
        return { value: data.map(item => ({ role: item.role, text: sanitizePII(item.text) })) as Value, failed: false };
      }
      if (typeof data !== 'string') throw new Error('Invalid draft');
      return { value: sanitizePII(data) as Value, failed: false };
    } catch {
      return { value: empty, failed: true };
    }
  }, [key, field]);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const entry = entries[key] ?? loaded;
  const current = useRef(entry.value);
  current.current = entry.value;

  const update = (change: Value | ((previous: Value) => Value)) => {
    const value = typeof change === 'function' ? change(current.current) : change;
    current.current = value;
    let failed = false;
    try {
      const clean = typeof value === 'string' ? sanitizePII(value) : (value as SocialIdeaWorkspace['messages']).map(message => ({ role: message.role, text: sanitizePII(message.text) }));
      // Save during the edit, so immediate navigation doesn't outrun an effect.
      localStorage.setItem(key, JSON.stringify(clean));
    } catch { failed = true; }
    setEntries(previous => ({ ...previous, [key]: { value, failed } }));
  };
  return [entry.value, update, entry.failed] as const;
}
