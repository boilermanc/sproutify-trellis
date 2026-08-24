DO $migration$
DECLARE
  updated_count INTEGER;
BEGIN
  UPDATE public.email_templates AS et
  SET html_body = $rekkrd_html$<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>Rekkrd founder letter</title>
  <style>
    @media only screen and (max-width: 620px) {
      .email-shell { width: 100% !important; }
      .email-gutter { padding-left: 24px !important; padding-right: 24px !important; }
      .outer-gutter { padding: 16px 8px !important; }
      .callout { padding-left: 16px !important; padding-right: 16px !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#0a0806; font-family:Georgia, 'Times New Roman', serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; background-color:#0a0806;">
    <tr>
      <td class="outer-gutter" align="center" style="padding:32px 16px;">
        <table class="email-shell" role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%; max-width:600px; background-color:#14100c;">
          <tr>
            <td align="center" style="padding:36px 24px 24px;">
              <a href="https://rekkrd.com" style="text-decoration:none;" aria-label="Rekkrd">
                <span style="font-family:Georgia, 'Times New Roman', serif; font-size:28px; letter-spacing:1px; color:#efe9e0;">Rekk<span style="color:#e8621a;">r</span>d</span>
              </a>
            </td>
          </tr>
          <tr>
            <td class="email-gutter" style="padding:0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr><td style="border-top:1px solid #2a241d; font-size:0; line-height:0;">&nbsp;</td></tr>
              </table>
            </td>
          </tr>
          <!-- IF_FIRST_NAME -->
          <tr>
            <td class="email-gutter" style="padding:32px 40px 8px; font-family:Georgia, 'Times New Roman', serif; font-size:16px; line-height:26px; color:#efe9e0;">
              Hey {{first_name}},
            </td>
          </tr>
          <!-- END_IF_FIRST_NAME -->
          <tr>
            <td class="email-gutter" style="padding:16px 40px 0; font-family:Georgia, 'Times New Roman', serif; font-size:16px; line-height:26px; color:#efe9e0;">
              {{intro_copy}}
            </td>
          </tr>
          <tr>
            <td class="email-gutter" style="padding:16px 40px 0; font-family:Georgia, 'Times New Roman', serif; font-size:16px; line-height:26px; color:#efe9e0;">
              {{story_copy}}
            </td>
          </tr>
          <tr>
            <td class="email-gutter" style="padding:16px 40px 0; font-family:Georgia, 'Times New Roman', serif; font-size:16px; line-height:26px; color:#efe9e0;">
              {{positioning_copy}}
            </td>
          </tr>
          <tr>
            <td class="callout" style="padding:28px 40px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%; background-color:#1c1712; border:1px solid #2a241d;">
                <tr>
                  <td style="padding:24px 24px 8px; font-family:'Courier New', Courier, monospace; font-size:12px; line-height:18px; letter-spacing:1px; text-transform:uppercase; color:#a89f92;">
                    {{announcement_label}}
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 24px 16px; font-family:Georgia, 'Times New Roman', serif; font-size:17px; line-height:26px; color:#efe9e0;">
                    {{announcement_headline}}
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 24px 24px; font-family:Georgia, 'Times New Roman', serif; font-size:15px; line-height:24px; color:#c9c2b6;">
                    {{announcement_copy}}
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding:0 24px 24px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td align="center" bgcolor="#efe9e0" style="background-color:#efe9e0; border-radius:2px;">
                          <a href="{{cta_url}}" style="display:inline-block; padding:12px 28px; font-family:'Courier New', Courier, monospace; font-size:13px; line-height:18px; letter-spacing:0.5px; text-transform:uppercase; color:#14100c; text-decoration:none;">{{cta_text}}</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 24px 0; font-family:Georgia, 'Times New Roman', serif; font-size:14px; line-height:22px; color:#a89f92; text-align:center;">
              {{supporting_copy}}
            </td>
          </tr>
          <tr>
            <td class="email-gutter" style="padding:28px 40px 0; font-family:Georgia, 'Times New Roman', serif; font-size:16px; line-height:26px; color:#efe9e0;">
              {{feedback_copy}}
            </td>
          </tr>
          <tr>
            <td class="email-gutter" style="padding:24px 40px 40px; font-family:Georgia, 'Times New Roman', serif; font-size:16px; line-height:24px; color:#efe9e0;">
              More soon,<br>
              Clint<br>
              <span style="font-size:14px; color:#a89f92;">Founder, Rekkrd</span>
            </td>
          </tr>
          <tr>
            <td class="email-gutter" style="padding:0 40px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="border-top:1px solid #2a241d;font-size:0;line-height:0;">
                    &nbsp;
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:24px 24px 32px;font-family:'Courier New',Courier,monospace;font-size:11px;line-height:19px;letter-spacing:0.25px;color:#6f675b;">
              <div style="margin:0 0 8px;">
                <a href="https://www.instagram.com/rekkrdapp/" target="_blank" style="color:#a89f92;text-decoration:underline;">Instagram</a>
                &nbsp;&middot;&nbsp;
                <a href="https://www.facebook.com/profile.php?id=61590210250901" target="_blank" style="color:#a89f92;text-decoration:underline;">Facebook</a>
              </div>
              <div style="margin:0 0 8px;">
                <a href="https://www.youtube.com/@RekkrdAfterDark" target="_blank" style="color:#a89f92;text-decoration:underline;">Rekkrd After Dark</a>
                &nbsp;&middot;&nbsp;
                <a href="https://www.youtube.com/@RekkrdListeningRoom" target="_blank" style="color:#a89f92;text-decoration:underline;">Listening Room on YouTube</a>
              </div>
              <div style="margin:0 0 8px;">
                <a href="https://rekkrd.com/listening-room" style="color:#a89f92;text-decoration:underline;">Open Listening Room in Rekkrd</a>
                &nbsp;&middot;&nbsp;
                <a href="https://rekkrd.com/support" style="color:#a89f92;text-decoration:underline;">Support</a>
                &nbsp;&middot;&nbsp;
                <a href="https://rekkrd.com" style="color:#a89f92;text-decoration:underline;">Visit Rekkrd</a>
              </div>
              <div style="margin:12px 0 0;">
                You’re receiving this because you opted in to Rekkrd emails.
                <a href="{{unsubscribe_url}}" style="color:#a89f92;text-decoration:underline;">Unsubscribe</a>
              </div>
              <div style="margin:12px 0 0;color:#6f675b;">
                &copy; 2026 Rekkrd. All rights reserved.
              </div>
              <div style="margin:4px 0 0;color:#6f675b;">
                Built by
                <a href="https://www.sweetwater.technology" target="_blank" style="color:#a89f92;text-decoration:underline;">Sweetwater Technology</a>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>$rekkrd_html$,
      updated_at = now()
  FROM public.branches AS b
  WHERE et.id = '8d8ff75e-f0e5-4b8a-9852-c8fdaf3c3759'
    AND et.branch_id = b.id::text
    AND b.slug = 'rekkrd';

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  IF updated_count <> 1 THEN
    RAISE EXCEPTION 'Expected to update exactly one Rekkrd email template, updated %', updated_count;
  END IF;
END
$migration$;
