import { LEAD_LOGO_URL, renderLeadComplianceFooter, renderLeadSequenceHtml } from "./lead-sequence-template.ts";

export { LEAD_LOGO_URL };
export const LEAD_FROM = "Sheree | Sproutify Farm <sheree@sproutify.app>";
export const LEAD_CC = ["bret.bowlin@towerfarms.com", "sheree@sproutify.app"];
export const LEAD_TEST_RECIPIENT = "boilermanc@gmail.com";
export const LEAD_REPLY_DOMAIN = Deno.env.get("LEAD_REPLY_DOMAIN") || "";
export const leadReplyTo = (replyToken: string) => LEAD_REPLY_DOMAIN
  ? `lead+${replyToken}@${LEAD_REPLY_DOMAIN}`
  : "sheree@sproutify.app";

const esc = (value: string) => value
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function textToHtml(body: string): string {
  return body.replace(/\r\n/g, "\n").trim().split(/\n{2,}/).map((block) => {
    const html = esc(block)
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" style="color:#2f6d49">$1</a>')
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\n/g, "<br>");
    return `<p style="margin:0 0 15px;line-height:1.65">${html}</p>`;
  }).join("");
}

export function complianceFooter(email: string, scope = "sproutify-farm"): string {
  const hub = (Deno.env.get("SUPABASE_URL") || "https://horvjqqifgrzxesuxtfm.supabase.co").replace(/\/$/, "");
  return renderLeadComplianceFooter(email, scope, hub);
}

export function composeOperatorHtml(body: string, bodyFormat: "text" | "html", email: string, scope: string): string {
  const footer = complianceFooter(email, scope);
  if (bodyFormat === "html") {
    if (body.includes("<!-- SPROUTIFY_COMPLIANCE_FOOTER -->")) {
      return body.replace("<!-- SPROUTIFY_COMPLIANCE_FOOTER -->", footer);
    }
    return /<\/body\s*>/i.test(body) ? body.replace(/<\/body\s*>/i, `${footer}</body>`) : `${body}${footer}`;
  }
  return `<div style="max-width:600px;margin:0 auto;font:15px/1.6 Arial,sans-serif;color:#26352d">${textToHtml(body)}${footer}</div>`;
}

export function sequenceHtml(templateKey: string, firstName: string, email: string, scope: string): string {
  return renderLeadSequenceHtml(templateKey, firstName, complianceFooter(email, scope));
}

export async function resendToken(admin: any): Promise<{ token: string; from: string }> {
  const { data, error } = await admin.from("tenant_secrets").select("resend_token,resend_from_address").limit(1).single();
  if (error || !data?.resend_token) throw new Error("Resend is not configured in Trellis settings");
  return { token: data.resend_token, from: LEAD_FROM || data.resend_from_address };
}
