export interface SendTestEmailParams {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

export async function fetchResendToken(): Promise<string> {
  const apiKey = import.meta.env.VITE_TRELLIS_HUB_KEY;

  let response: Response;
  try {
    response = await fetch(
      'https://cdhymstkzhlxcucbzipr.supabase.co/rest/v1/tenant_secrets?select=resend_token&limit=1',
      {
        headers: {
          apikey: apiKey,
          Authorization: `Bearer ${apiKey}`,
        },
      },
    );
  } catch {
    throw new Error(
      'Resend token not found in tenant_secrets. Add it via Settings or Supabase SQL Editor.',
    );
  }

  if (!response.ok) {
    throw new Error(
      'Resend token not found in tenant_secrets. Add it via Settings or Supabase SQL Editor.',
    );
  }

  const data = await response.json();
  const token = data?.[0]?.resend_token;

  if (!token) {
    throw new Error(
      'Resend token not found in tenant_secrets. Add it via Settings or Supabase SQL Editor.',
    );
  }

  return token;
}

export async function sendTestEmail({
  to,
  subject,
  html,
  from,
}: SendTestEmailParams): Promise<{ id: string }> {
  const resendToken = await fetchResendToken();

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${resendToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: from || 'Sproutify <marketing@sproutify.me>',
      to: [to],
      subject,
      html,
    }),
  });

  if (!response.ok) {
    let message = 'Failed to send email via Resend';
    try {
      const errorBody = await response.json();
      if (errorBody?.message) {
        message = errorBody.message;
      }
    } catch {
      // Could not parse error body, use default message
    }
    throw new Error(message);
  }

  return response.json();
}
