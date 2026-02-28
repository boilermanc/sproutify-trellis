import type { Profile } from '../../types';
import { supabaseHub } from '../../lib/supabase';

// ─── Types ───────────────────────────────────────
export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
  tags?: Array<{ name: string; value: string }>;
}

export interface SendEmailResult {
  id: string; // Resend message ID
}

export interface ResendError {
  statusCode: number;
  message: string;
  name: string;
}

// ─── Token Fetcher ───────────────────────────────
// Reads resend_token from Hub Supabase tenant_secrets table

let cachedToken: string | null = null;
let tokenFetchedAt: number = 0;
const TOKEN_TTL = 5 * 60 * 1000; // Cache token for 5 minutes

export async function fetchResendToken(): Promise<string> {
  // Return cached token if fresh
  if (cachedToken && Date.now() - tokenFetchedAt < TOKEN_TTL) {
    return cachedToken;
  }

  if (!supabaseHub) {
    throw new Error(
      'VITE_TRELLIS_HUB_KEY not set in .env.local. Cannot fetch Resend token.',
    );
  }

  const { data, error } = await supabaseHub
    .from('tenant_secrets')
    .select('resend_token')
    .limit(1)
    .single();

  if (error) {
    throw new Error(`Failed to fetch tenant_secrets: ${error.message}`);
  }

  const token = data?.resend_token;

  if (!token) {
    throw new Error(
      'resend_token is empty in tenant_secrets. Add your Resend API key via Supabase SQL Editor or Settings.',
    );
  }

  cachedToken = token;
  tokenFetchedAt = Date.now();
  return token;
}

// ─── Send Single Email ───────────────────────────
export async function sendEmail(
  params: SendEmailParams,
): Promise<SendEmailResult> {
  const token = await fetchResendToken();

  const body: Record<string, any> = {
    from: params.from || 'Sproutify <marketing@sproutify.me>',
    to: Array.isArray(params.to) ? params.to : [params.to],
    subject: params.subject,
    html: params.html,
  };

  if (params.replyTo) body.reply_to = params.replyTo;
  if (params.tags) body.tags = params.tags;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const result = await res.json();

  if (!res.ok) {
    const err = result as ResendError;
    throw new Error(
      `Resend error (${err.statusCode || res.status}): ${err.message || 'Unknown error'}`,
    );
  }

  return result as SendEmailResult;
}

// ─── HTML Escaping ───────────────────────────────
// Prevents XSS when interpolating user-controlled values into email HTML.
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Validates hex color to prevent CSS injection in style attributes.
function safeColor(color: string): string {
  return /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : '#059669';
}

// ─── Generate HTML from Template ─────────────────
// Renders template HTML for a given profile.
// For now, generates a simple branded email.
// This should eventually call the same rendering logic as EmailPreviewer/UnifiedOnboarding.

export function renderCampaignHtml(params: {
  profile: Profile;
  subject: string;
  templateId: string;
  themeColor?: string;
  campaignName?: string;
}): string {
  const {
    profile,
    subject,
    templateId: _templateId,
    themeColor = '#059669',
    campaignName,
  } = params;
  const firstName = escapeHtml(profile.first_name || 'Friend');
  const safeSubject = escapeHtml(subject);
  const safeThemeColor = safeColor(themeColor);
  const safeCampaignName = campaignName ? escapeHtml(campaignName) : '';
  const unsubUrl = `https://trellis.sproutify.app/unsubscribe?email=${encodeURIComponent(profile.email)}&source=${encodeURIComponent(profile.branches[0] || 'global')}`;

  // Simple responsive HTML email
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeSubject}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;margin-top:32px;margin-bottom:32px;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">
    <tr>
      <td style="background:${safeThemeColor};padding:40px 32px;text-align:center;">
        <h1 style="color:#ffffff;font-size:28px;font-weight:900;margin:0;letter-spacing:-0.5px;">Sproutify</h1>
        <p style="color:rgba(255,255,255,0.8);font-size:14px;margin:8px 0 0;font-style:italic;">Your unified gardening ecosystem</p>
      </td>
    </tr>
    <tr>
      <td style="padding:32px;">
        <h2 style="color:#1e293b;font-size:22px;font-weight:700;margin:0 0 16px;">Hey ${firstName}!</h2>
        <p style="color:#475569;font-size:15px;line-height:1.6;margin:0 0 24px;">
          ${safeSubject}
        </p>
        <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
          <tr>
            <td style="background:${safeThemeColor};border-radius:8px;">
              <a href="https://farm.sproutify.app" style="display:inline-block;padding:14px 32px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;letter-spacing:0.5px;">
                Visit the Farm →
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:24px 32px;border-top:1px solid #e2e8f0;text-align:center;">
        <p style="color:#94a3b8;font-size:11px;margin:0;">
          You received this because you're part of the Sproutify ecosystem.
          ${safeCampaignName ? `Campaign: ${safeCampaignName}.` : ''}
        </p>
        <p style="margin:8px 0 0;">
          <a href="${unsubUrl}" style="color:#94a3b8;font-size:11px;text-decoration:underline;">Unsubscribe</a>
        </p>
      </td>
    </tr>
  </table>
  <p style="text-align:center; font-size:11px; color:#999; margin-top:40px;">
    You're receiving this because you subscribed to ATL Urban Farms updates.<br>
    <a href="{{unsubscribe_url}}" style="color:#999;">Unsubscribe</a>
  </p>
</body>
</html>`;
}
