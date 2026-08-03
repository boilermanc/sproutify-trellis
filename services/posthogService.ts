import { supabase } from '../lib/supabase';
import { PostHogAnalyticsResult, PostHogConnection } from '../types';

async function functionErrorMessage(error: unknown, fallback: string): Promise<string> {
  const context = (error as any)?.context;
  if (context instanceof Response) {
    try {
      const payload = await context.clone().json();
      if (payload?.error) return String(payload.error);
    } catch { /* use the transport message below */ }
  }
  return (error as any)?.message || fallback;
}

export const DEFAULT_POSTHOG_EVENTS = [
  'user_signed_up',
  'account_created',
  'onboarding_completed',
  'activation_milestone_reached',
  'core_feature_milestone',
  'meaningful_return',
];

export const DEFAULT_POSTHOG_PROPERTIES = [
  'platform',
  'feature',
  'milestone',
  'app_version',
  'return_interval_bucket',
];

async function invokeConnections<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('posthog-connections', { body });
  if (error) throw new Error(await functionErrorMessage(error, 'PostHog connection request failed'));
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export async function fetchPosthogConnections(): Promise<PostHogConnection[]> {
  const data = await invokeConnections<{ connections: PostHogConnection[] }>({ op: 'list' });
  return data.connections || [];
}

export interface SavePostHogConnectionInput {
  branch_id: string;
  host_url: string;
  project_id: string;
  api_key?: string;
  allowed_events: string[];
  allowed_properties: string[];
}

export async function savePosthogConnection(input: SavePostHogConnectionInput): Promise<{
  connection: PostHogConnection;
  webhook_secret: string | null;
}> {
  return invokeConnections({ op: 'save', ...input });
}

export async function testPosthogConnection(connectionId: string): Promise<void> {
  await invokeConnections({ op: 'test', connection_id: connectionId });
}

export async function rotatePosthogWebhookSecret(connectionId: string): Promise<string> {
  const data = await invokeConnections<{ webhook_secret: string }>({
    op: 'rotate_webhook_secret',
    connection_id: connectionId,
  });
  return data.webhook_secret;
}

export async function deletePosthogConnection(connectionId: string): Promise<void> {
  await invokeConnections({ op: 'delete', connection_id: connectionId });
}

export async function fetchPosthogAnalytics(
  connectionId: string,
  windowDays: 7 | 30 | 90 = 30,
  force = false,
): Promise<PostHogAnalyticsResult> {
  const { data, error } = await supabase.functions.invoke('posthog-analytics', {
    body: { connection_id: connectionId, window_days: windowDays, force },
  });
  if (error) throw new Error(await functionErrorMessage(error, 'PostHog analytics request failed'));
  if (data?.error) throw new Error(data.error);
  return data as PostHogAnalyticsResult;
}
