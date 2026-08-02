interface WebhookPayload {
  event_type: string;
  source: string;
  timestamp: string;
  data: Record<string, unknown>;
}

interface WebhookResult {
  success: boolean;
  error?: string;
}

export async function triggerWebhook(webhookUrl: string, payload: WebhookPayload): Promise<WebhookResult> {
  if (!webhookUrl) {
    return { success: false, error: 'n8n webhook URL not configured' };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        timestamp: payload.timestamp || new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      return { success: false, error: `Webhook returned ${response.status}` };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to trigger webhook',
    };
  }
}

export async function triggerProfileSync(webhookUrl: string, profileId: string, action: 'create' | 'update' | 'delete'): Promise<WebhookResult> {
  return triggerWebhook(webhookUrl, {
    event_type: `profile.${action}`,
    source: 'trellis',
    timestamp: new Date().toISOString(),
    data: { profile_id: profileId, action },
  });
}

export async function triggerEmailCampaign(
  webhookUrl: string,
  payload: {
    campaign_id: string;
    tags: string[] | null;
    subject: string;
    html_body: string;
    // Segment-honoring batch dispatch (Resend /emails/batch): the app sends the
    // exact deduped audience + a personalizable template. Optional for back-compat.
    html_template?: string;
    from?: string;
    recipients?: Array<{ email: string; first_name: string; unsubscribe_token?: string }>;
    recipient_count?: number;
    // Brand unsubscribe URL template with a {{token}} placeholder, filled per
    // recipient in n8n. Optional; falls back to the email-based Hub unsubscribe.
    unsubscribe_url_template?: string;
  }
): Promise<WebhookResult> {
  if (!webhookUrl) {
    return { success: false, error: 'n8n webhook URL not configured' };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return { success: false, error: `Webhook returned ${response.status}` };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to trigger webhook',
    };
  }
}

export async function triggerTaskQueue(webhookUrl: string, taskType: string, payload: Record<string, unknown>): Promise<WebhookResult> {
  return triggerWebhook(webhookUrl, {
    event_type: `task.${taskType}`,
    source: 'trellis',
    timestamp: new Date().toISOString(),
    data: payload,
  });
}

export async function triggerSocialIntent(webhookUrl: string, platform: string, username: string, content: string): Promise<WebhookResult> {
  return triggerWebhook(webhookUrl, {
    event_type: 'social.intent_detected',
    source: platform,
    timestamp: new Date().toISOString(),
    data: { platform, username, content },
  });
}
