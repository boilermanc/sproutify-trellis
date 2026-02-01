interface TwilioCredentials {
  accountSid: string;
  authToken: string;
}

interface SendSmsOptions {
  to: string;
  body: string;
  from?: string;
}

interface MakeCallOptions {
  to: string;
  from?: string;
  twiml?: string;
  url?: string;
}

interface TwilioResult {
  success: boolean;
  sid?: string;
  error?: string;
}

const TWILIO_API_BASE = 'https://api.twilio.com/2010-04-01/Accounts';

function getAuthHeader(credentials: TwilioCredentials): string {
  return 'Basic ' + btoa(`${credentials.accountSid}:${credentials.authToken}`);
}

export async function sendSms(credentials: TwilioCredentials, options: SendSmsOptions): Promise<TwilioResult> {
  if (!credentials.accountSid || !credentials.authToken) {
    return { success: false, error: 'Twilio credentials not configured' };
  }

  try {
    const formData = new URLSearchParams();
    formData.append('To', options.to);
    formData.append('From', options.from || '+1234567890'); // Default should be configured
    formData.append('Body', options.body);

    const response = await fetch(
      `${TWILIO_API_BASE}/${credentials.accountSid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': getAuthHeader(credentials),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.message || 'Failed to send SMS' };
    }

    return { success: true, sid: data.sid };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send SMS',
    };
  }
}

export async function makeCall(credentials: TwilioCredentials, options: MakeCallOptions): Promise<TwilioResult> {
  if (!credentials.accountSid || !credentials.authToken) {
    return { success: false, error: 'Twilio credentials not configured' };
  }

  try {
    const formData = new URLSearchParams();
    formData.append('To', options.to);
    formData.append('From', options.from || '+1234567890');

    if (options.twiml) {
      formData.append('Twiml', options.twiml);
    } else if (options.url) {
      formData.append('Url', options.url);
    }

    const response = await fetch(
      `${TWILIO_API_BASE}/${credentials.accountSid}/Calls.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': getAuthHeader(credentials),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.message || 'Failed to make call' };
    }

    return { success: true, sid: data.sid };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to make call',
    };
  }
}

export async function sendTicketSmsNotification(
  credentials: TwilioCredentials,
  to: string,
  ticketId: string,
  message: string
): Promise<TwilioResult> {
  return sendSms(credentials, {
    to,
    body: `[Sproutify #${ticketId}] ${message}`,
  });
}

export async function sendOrderConfirmationSms(
  credentials: TwilioCredentials,
  to: string,
  orderNumber: string,
  total: string
): Promise<TwilioResult> {
  return sendSms(credentials, {
    to,
    body: `Thanks for your order! Order #${orderNumber} confirmed. Total: ${total}. Track at sproutify.app/orders`,
  });
}

export async function sendAppointmentReminder(
  credentials: TwilioCredentials,
  to: string,
  appointmentTime: string,
  location: string
): Promise<TwilioResult> {
  return sendSms(credentials, {
    to,
    body: `Reminder: Your appointment is scheduled for ${appointmentTime} at ${location}. Reply CONFIRM to confirm.`,
  });
}
