interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
  tags?: { name: string; value: string }[];
}

interface SendEmailResult {
  success: boolean;
  id?: string;
  error?: string;
}

interface BatchEmailOptions {
  emails: SendEmailOptions[];
}

const RESEND_API_URL = 'https://api.resend.com/emails';

export async function sendEmail(apiKey: string, options: SendEmailOptions): Promise<SendEmailResult> {
  if (!apiKey) {
    return { success: false, error: 'Resend API key not configured' };
  }

  try {
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: options.from || 'Sproutify <noreply@sproutify.app>',
        to: Array.isArray(options.to) ? options.to : [options.to],
        subject: options.subject,
        html: options.html,
        reply_to: options.replyTo,
        tags: options.tags,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.message || 'Failed to send email' };
    }

    const data = await response.json();
    return { success: true, id: data.id };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function sendBatchEmails(apiKey: string, options: BatchEmailOptions): Promise<SendEmailResult[]> {
  if (!apiKey) {
    return options.emails.map(() => ({ success: false, error: 'Resend API key not configured' }));
  }

  try {
    const response = await fetch(`${RESEND_API_URL}/batch`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(
        options.emails.map(email => ({
          from: email.from || 'Sproutify <noreply@sproutify.app>',
          to: Array.isArray(email.to) ? email.to : [email.to],
          subject: email.subject,
          html: email.html,
          reply_to: email.replyTo,
          tags: email.tags,
        }))
      ),
    });

    if (!response.ok) {
      const error = await response.json();
      return options.emails.map(() => ({ success: false, error: error.message || 'Batch send failed' }));
    }

    const data = await response.json();
    return data.data.map((result: { id: string }) => ({ success: true, id: result.id }));
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return options.emails.map(() => ({ success: false, error: errorMessage }));
  }
}

export async function sendWelcomeEmail(apiKey: string, to: string, firstName: string): Promise<SendEmailResult> {
  const html = `
    <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
      <h1 style="color: #10b981;">Welcome to Sproutify, ${firstName}!</h1>
      <p>Thanks for joining our community. We're excited to have you on board.</p>
      <p>Here's what you can do next:</p>
      <ul>
        <li>Complete your profile</li>
        <li>Explore our features</li>
        <li>Connect with the community</li>
      </ul>
      <p>If you have any questions, just reply to this email.</p>
      <p>— The Sproutify Team</p>
    </div>
  `;

  return sendEmail(apiKey, {
    to,
    subject: `Welcome to Sproutify, ${firstName}!`,
    html,
    tags: [{ name: 'type', value: 'welcome' }],
  });
}

export async function sendTicketResponseEmail(
  apiKey: string,
  to: string,
  ticketId: string,
  subject: string,
  responseHtml: string
): Promise<SendEmailResult> {
  const html = `
    <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
      <p style="color: #6b7280; font-size: 12px;">Ticket #${ticketId}</p>
      <h2 style="color: #1f2937;">Re: ${subject}</h2>
      <div style="padding: 16px; background: #f9fafb; border-radius: 8px;">
        ${responseHtml}
      </div>
      <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">
        Reply to this email to continue the conversation.
      </p>
    </div>
  `;

  return sendEmail(apiKey, {
    to,
    subject: `Re: ${subject} [#${ticketId}]`,
    html,
    tags: [
      { name: 'type', value: 'ticket-response' },
      { name: 'ticket_id', value: ticketId },
    ],
  });
}
