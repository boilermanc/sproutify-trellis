import { supabase } from '../lib/supabase';

export async function xTracking<T>(action: 'list' | 'connect' | 'sync' | 'tag' | 'status' | 'history', params: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('x-tracking', { body: { ...params, action } });
  if (error) {
    let message = error.message;
    try { message = (await error.context?.clone().json())?.error || message; } catch { /* retain transport error */ }
    throw new Error(message || 'X tracking request failed.');
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}
