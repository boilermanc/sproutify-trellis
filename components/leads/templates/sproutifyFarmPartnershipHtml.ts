export const SPROUTIFY_FARM_LOGO_URL = 'https://www.sproutify.app/images/sproutify-farm-white.png';

// Email-client-safe XHTML adapted from the supplied partnership announcement.
// The sender replaces the footer marker with Trellis' standard compliance footer.
export const SPROUTIFY_FARM_PARTNERSHIP_HTML = `<!DOCTYPE HTML PUBLIC "-//W3C//DTD XHTML 1.0 Transitional //EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="x-apple-disable-message-reformatting" />
  <title>Your Farm Just Got a Head Start</title>
  <style type="text/css">
    body { margin: 0; padding: 0; background-color: #EEF2E6; }
    table, td, tr { border-collapse: collapse; vertical-align: top; }
    p { margin: 0; }
    a { color: #14402C; }
    @media only screen and (max-width: 620px) {
      .u-row { width: 100% !important; }
      .u-content-padding { padding-left: 20px !important; padding-right: 20px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#EEF2E6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#EEF2E6;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="u-row" style="max-width:600px;width:100%;">
          <tr>
            <td align="center" style="background-color:#14402C;border-bottom:4px solid #7AC143;padding:22px 20px;font-family:Arial,sans-serif;">
              <a href="https://farm.sproutify.app/" target="_blank" style="text-decoration:none;">
                <img src="${SPROUTIFY_FARM_LOGO_URL}" alt="Sproutify Farm — Grow Smarter" width="210" style="display:inline-block;width:210px;max-width:100%;height:auto;border:0;outline:none;text-decoration:none;" />
              </a>
            </td>
          </tr>
          <tr>
            <td align="center" style="background-color:#1D543B;padding:10px 20px;font-family:Arial,sans-serif;">
              <p style="margin:0;color:#EAF3E9;font-size:12px;line-height:18px;letter-spacing:1.5px;text-transform:uppercase;font-weight:700;">Introducing Sproutify Farm</p>
            </td>
          </tr>
          <tr>
            <td class="u-content-padding" style="background-color:#FFFDF8;padding:30px 28px 24px;font-family:Arial,sans-serif;font-size:15px;line-height:1.65;color:#2C2C2A;">
              <p style="margin:0 0 18px;font-size:21px;line-height:28px;font-weight:700;color:#14402C;">Your Farm Just Got a Head Start</p>
              <p style="margin:0 0 14px;">Hi {{first_name}},</p>
              <p style="margin:0 0 14px;">Congratulations on your new Tower Farm! I wanted to introduce you to Sproutify Farm, the software Tower Farm Corp partners with to help new aeroponic farms get off to a strong start.</p>
              <p style="margin:0 0 14px;"><strong>What Sproutify Farm does:</strong> Running a tower farm well takes more than good equipment&mdash;it takes staying on top of seed dates, tower space, daily tasks, and harvest timing all at once. Sproutify Farm is built specifically for that: tower capacity planning, seed-to-harvest tracking, and task management made for aeroponic operations, not generic farm software.</p>
              <p style="margin:0 0 14px;"><strong>Why Tower Farm Corp partnered with us:</strong> Tower Farm builds great equipment, but the operational side&mdash;actually running a profitable farm day to day&mdash;is where new farmers often get stuck. Sproutify Farm fills that gap.</p>
              <p style="margin:0 0 22px;"><strong>What&rsquo;s in it for you:</strong> Your first 3 months of Sproutify Farm are complimentary, courtesy of Tower Farm Corp. No cost, no obligation. Whether you&rsquo;re still waiting on equipment, mid-installation, or already growing, now&rsquo;s a good time to get your operation organized from the start.</p>
              <p style="margin:0 0 24px;">I&rsquo;d love to hop on a quick call to walk you through the app and show you how it works.</p>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto;">
                <tr>
                  <td align="center" style="border-radius:6px;background-color:#7AC143;">
                    <a href="mailto:sheree@sproutify.app?subject=Sproutify%20Farm%20Demo" style="display:inline-block;padding:13px 30px;font-family:Arial,sans-serif;font-size:15px;font-weight:700;color:#14402C;text-decoration:none;border-radius:6px;">Reply to Get Started</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color:#FFFDF8;padding:0 28px 28px;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#2C2C2A;">
              <p style="margin:0;">With blessings,</p>
              <p style="margin:2px 0 0;font-weight:700;color:#14402C;">Sheree</p>
              <p style="margin:0;font-size:13px;color:#5F5E5A;">Co-Founder, Sproutify</p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#E1F0DE;padding:20px;text-align:center;font-family:Arial,sans-serif;border-top:1px solid #DCE5D8;">
              <p style="margin:0;font-size:15px;font-weight:700;color:#14402C;">Built for aeroponic tower farms</p>
              <p style="margin:6px 0 0;font-size:13px;color:#14402C;">Tower capacity planning &middot; seed-to-harvest workflows &middot; task coordination</p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#FFFDF8;padding:0 24px 24px;">
              <!-- SPROUTIFY_COMPLIANCE_FOOTER -->
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
