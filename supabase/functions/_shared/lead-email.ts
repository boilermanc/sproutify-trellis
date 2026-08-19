export const LEAD_FROM = "Sheree | Sproutify Farm <sheree@sproutify.app>";
export const LEAD_CC = ["bret.bowlin@towerfarms.com", "sheree@sproutify.app"];
export const LEAD_TEST_RECIPIENT = "boilermanc@gmail.com";
export const LEAD_LOGO_URL = "https://www.sproutify.app/images/sproutify-farm-white.png";
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
  const unsubscribe = `${hub}/functions/v1/unsubscribe?email=${encodeURIComponent(email)}&scope=${encodeURIComponent(scope)}`;
  return `<div style="margin-top:28px;padding-top:16px;border-top:1px solid #dce5d8;font:12px/1.6 Arial,sans-serif;color:#64748b">
    <div style="font-weight:bold;color:#14402c">Sproutify Farm</div>
    <div>Manage Your Tower Farm Like a Pro</div>
    <div style="margin-top:6px">Reply to this email or reach us at <a href="mailto:sheree@sproutify.app" style="color:#2f6d49">sheree@sproutify.app</a>.</div>
    <div style="margin-top:6px"><a href="https://farm.sproutify.app/" style="color:#2f6d49">farm.sproutify.app</a> · 1295 Smithdale Heights Drive, Cumming, GA 30040</div>
    <div style="margin-top:10px"><a href="${unsubscribe}" style="color:#94a3b8">Unsubscribe</a></div>
  </div>`;
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

const layout = (title: string, content: string, email: string, scope: string) => `<!doctype html><html><body style="margin:0;background:#eef2e6">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fffdf8">
      <tr><td align="center" style="background:#14402c;border-bottom:4px solid #7ac143;padding:22px"><img src="${LEAD_LOGO_URL}" width="210" alt="Sproutify Farm — Grow Smarter" style="display:block;max-width:100%;height:auto"></td></tr>
      <tr><td style="padding:30px 28px;font:15px/1.65 Arial,sans-serif;color:#2c2c2a"><h1 style="margin:0 0 18px;font-size:21px;line-height:1.3;color:#14402c">${title}</h1>${content}${complianceFooter(email, scope)}</td></tr>
    </table>
  </td></tr></table></body></html>`;

const p = (value: string) => `<p style="margin:0 0 14px">${value}</p>`;

export function sequenceHtml(templateKey: string, firstName: string, email: string, scope: string): string {
  const name = esc(firstName || "there");
  if (templateKey === "farm-introduction") {
    return layout("Congrats on your new Tower Farm — meet Sproutify Farm! 🎉", [
      p(`Hi ${name},`),
      p("Congratulations on your new Tower Farm — this is such an exciting step, and I’m thrilled to welcome you to the tower farm family!"),
      p('I want to personally introduce <a href="https://farm.sproutify.app/" style="color:#14402c;font-weight:bold">Sproutify Farm</a>, the only farm management software developed specifically for commercial aeroponic farms. We partnered with Tower Farm Corp to help new farms get started smoothly and successfully.'),
      p("Sproutify gives you tower and port management, capacity planning, seed-to-harvest workflows, seed inventory and expenses, task coordination, and clear reporting in one place."),
      p("There’s no wrong time to jump in. Since seedling production takes a few weeks, the sooner you plan your seeding schedule, the smoother your first harvest will be."),
      p("<strong>Free for 90 days.</strong> Tower Farm Corp is covering your first three months—no cost and no obligation—while you get your operation off the ground."),
      p("Clint and I run our own tower farm, so we know the gap between the equipment arriving and the farm becoming profitable. We built Sproutify Farm to help close that gap."),
      p('I would love to set up a quick demo. Reply with the best times, send any questions, or explore <a href="https://farm.sproutify.app/" style="color:#14402c;font-weight:bold">farm.sproutify.app</a> anytime.'),
      p("Can’t wait to grow with you!<br><br>With blessings,<br><strong>Sheree</strong><br>Tower Farmer<br>Co-Founder, Sproutify.app"),
    ].join(""), email, scope);
  }
  if (templateKey === "farm-follow-up") {
    return layout("Just making sure this landed", [
      p(`Hi ${name},`),
      p("I wanted to make sure my note about your complimentary Sproutify Farm access reached you."),
      p("Tower Farm Corp is covering your first 90 days, and we can help you get your towers, ports, seeding schedule, and daily work organized before the first harvest gets busy."),
      p("Would a quick walkthrough be helpful? Just reply with a day and time that works."),
      p("With blessings,<br><strong>Sheree</strong><br>Co-Founder, Sproutify"),
    ].join(""), email, scope);
  }
  if (templateKey === "farm-value-add") {
    return layout("A smoother first harvest starts with the schedule", [
      p(`Hi ${name},`),
      p("One quick lesson from running our own tower farm: the first harvest gets much easier when three decisions are made early."),
      '<ol style="margin:0 0 18px;padding-left:22px"><li style="margin-bottom:8px"><strong>Map tower and port capacity</strong> before choosing crop quantities.</li><li style="margin-bottom:8px"><strong>Work backward from harvest dates</strong> to build the seeding schedule.</li><li><strong>Assign recurring farm tasks</strong> so watering, transplanting, and harvest prep never live in someone’s head.</li></ol>',
      p("Sproutify Farm keeps those pieces connected from seed to harvest. Your first 90 days are covered, and I’m happy to show you how to set up the first plan."),
      p("Reply with your target opening or first-harvest date and I’ll help you choose the best place to start."),
      p("With blessings,<br><strong>Sheree</strong>"),
    ].join(""), email, scope);
  }
  return layout("Should I keep your Sproutify Farm access open?", [
    p(`Hi ${name},`),
    p("I haven’t heard back, so I don’t want to keep filling your inbox."),
    p("Would you still like to use the complimentary 90 days of Sproutify Farm and schedule a quick setup call, or should I close this out for now?"),
    p("Either answer is completely fine—just reply “keep it open” or “close it out,” and I’ll take care of the rest."),
    p("With blessings,<br><strong>Sheree</strong>"),
  ].join(""), email, scope);
}

export async function resendToken(admin: any): Promise<{ token: string; from: string }> {
  const { data, error } = await admin.from("tenant_secrets").select("resend_token,resend_from_address").limit(1).single();
  if (error || !data?.resend_token) throw new Error("Resend is not configured in Trellis settings");
  return { token: data.resend_token, from: LEAD_FROM || data.resend_from_address };
}
