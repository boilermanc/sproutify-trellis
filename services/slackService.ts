interface SlackMessage {
  text: string;
  blocks?: SlackBlock[];
  channel?: string;
  username?: string;
  icon_emoji?: string;
}

interface SlackBlock {
  type: 'section' | 'divider' | 'header' | 'context';
  text?: { type: 'mrkdwn' | 'plain_text'; text: string };
  fields?: { type: 'mrkdwn' | 'plain_text'; text: string }[];
}

interface SlackResult {
  success: boolean;
  error?: string;
}

export async function sendSlackMessage(webhookUrl: string, message: SlackMessage): Promise<SlackResult> {
  if (!webhookUrl) {
    return { success: false, error: 'Slack webhook URL not configured' };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: message.text,
        blocks: message.blocks,
        username: message.username || 'Trellis Bot',
        icon_emoji: message.icon_emoji || ':seedling:',
      }),
    });

    if (!response.ok) {
      return { success: false, error: `Slack returned ${response.status}` };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send Slack message',
    };
  }
}

export async function sendDLQAlert(webhookUrl: string, failedEvent: {
  event_id: string;
  source: string;
  error_message: string;
  retry_count: number;
}): Promise<SlackResult> {
  return sendSlackMessage(webhookUrl, {
    text: `:warning: Failed event in DLQ: ${failedEvent.event_id}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: ':warning: Dead Letter Queue Alert' },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Event ID:*\n${failedEvent.event_id}` },
          { type: 'mrkdwn', text: `*Source:*\n${failedEvent.source}` },
          { type: 'mrkdwn', text: `*Retry Count:*\n${failedEvent.retry_count}` },
          { type: 'mrkdwn', text: `*Error:*\n${failedEvent.error_message}` },
        ],
      },
    ],
  });
}

export async function sendTicketAlert(webhookUrl: string, ticket: {
  id: string;
  subject: string;
  priority: string;
  sentiment: string;
}): Promise<SlackResult> {
  const priorityEmoji: Record<string, string> = {
    urgent: ':rotating_light:',
    high: ':exclamation:',
    medium: ':large_yellow_circle:',
    low: ':large_blue_circle:',
  };

  return sendSlackMessage(webhookUrl, {
    text: `New ${ticket.priority} priority ticket: ${ticket.subject}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `${priorityEmoji[ticket.priority] || ':ticket:'} New Support Ticket` },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Ticket:*\n#${ticket.id}` },
          { type: 'mrkdwn', text: `*Priority:*\n${ticket.priority}` },
          { type: 'mrkdwn', text: `*Subject:*\n${ticket.subject}` },
          { type: 'mrkdwn', text: `*Sentiment:*\n${ticket.sentiment}` },
        ],
      },
    ],
  });
}

export async function sendCampaignNotification(webhookUrl: string, campaign: {
  name: string;
  status: string;
  sent_count: number;
  open_rate?: number;
}): Promise<SlackResult> {
  return sendSlackMessage(webhookUrl, {
    text: `Campaign "${campaign.name}" ${campaign.status}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: ':email: Campaign Update' },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Campaign:*\n${campaign.name}` },
          { type: 'mrkdwn', text: `*Status:*\n${campaign.status}` },
          { type: 'mrkdwn', text: `*Sent:*\n${campaign.sent_count.toLocaleString()}` },
          ...(campaign.open_rate !== undefined
            ? [{ type: 'mrkdwn' as const, text: `*Open Rate:*\n${campaign.open_rate}%` }]
            : []),
        ],
      },
    ],
  });
}
