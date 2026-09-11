-- Configure SpectIQ as a Trellis-native internal branch.
-- SpectIQ intentionally has no spoke connection and does not use the Farm lead pipeline.
do $migration$
declare
  spectiq_branch_id uuid;
  spectiq_brand_identity_id uuid;
  clint_user_id uuid;
  template_id uuid;
begin
  insert into public.branches (
    name, slug, type, logo_url, primary_color, secondary_color, accent_color,
    font_family, tagline, tone, brand_keywords, website_url, contact_email,
    description, is_active, default_from_name, default_reply_to,
    resend_from_address, default_cta, spoke_connection_id, updated_at
  ) values (
    'SpectIQ',
    'spectiq',
    'internal',
    '/brands/spectiq-logo-mark.svg',
    '#E56A2C',
    '#1B1F27',
    '#FAF8F5',
    'Public Sans',
    'Win the inspection while the buyer is still on the phone.',
    'Direct, evidence-led, operational, and respectful of skeptical buyers.',
    array[
      'home inspection business software',
      'home inspection CRM',
      'inspection estimates',
      'inspection agreements',
      'inspection payments',
      'inspection booking'
    ]::text[],
    'https://spectiq.app',
    'clint@spectiq.app',
    'Home inspection business software that keeps inquiry, estimate, agreement, payment, and booking on one auditable path.',
    true,
    'SpectIQ',
    'clint@spectiq.app',
    'SpectIQ <clint@spectiq.app>',
    'See whether SpectIQ fits your inspection company.',
    null,
    now()
  )
  on conflict (slug) do update set
    name = excluded.name,
    type = excluded.type,
    logo_url = excluded.logo_url,
    primary_color = excluded.primary_color,
    secondary_color = excluded.secondary_color,
    accent_color = excluded.accent_color,
    font_family = excluded.font_family,
    tagline = excluded.tagline,
    tone = excluded.tone,
    brand_keywords = excluded.brand_keywords,
    website_url = excluded.website_url,
    contact_email = excluded.contact_email,
    description = excluded.description,
    is_active = excluded.is_active,
    default_from_name = excluded.default_from_name,
    default_reply_to = excluded.default_reply_to,
    resend_from_address = excluded.resend_from_address,
    default_cta = excluded.default_cta,
    spoke_connection_id = null,
    updated_at = now()
  returning id into spectiq_branch_id;

  insert into public.brand_identities (
    branch_id, name, tagline, mission, values, target_audience, voice,
    website_url, color_palette, typography, image_prompt, marketing_hooks,
    site_preview_description, extracted_images, status, unsubscribe_url, updated_at
  ) values (
    'spectiq',
    'SpectIQ',
    'Win the inspection while the buyer is still on the phone.',
    'Help home inspection companies move an inquiry through an explainable estimate, signed agreement, payment, and correctly routed booking while preserving company rules and human judgment.',
    '["Transparency", "Accountability", "Control", "Speed", "Human judgment"]'::jsonb,
    'Owners, operators, and office teams at home inspection companies who need a reliable inquiry-to-booking workflow.',
    'Direct, evidence-led, and operator-to-operator. Use operational language that respects a skeptical buyer. Distinguish what exists today from what is planned, explain how decisions can be audited, and never make unsupported performance claims.',
    'https://spectiq.app',
    '{"primary":"#E56A2C","secondary":"#1B1F27","accent":"#FAF8F5","neutral":"#FAF8F5"}'::jsonb,
    '{"heading":"Public Sans","body":"Public Sans"}'::jsonb,
    'Professional, documentary-style imagery of working home inspectors and office operators using clear inspection workflows. Use paper backgrounds, ink typography, and signal-orange accents including the official floor-plan mark with one orange room. No gradients, magnifying glasses, house-lens imagery, glossy SaaS abstractions, or unsupported results.',
    '["Win the inspection while the buyer is still on the phone.","One clear path from inquiry to inspection.","Automation with an audit trail and a way out."]'::jsonb,
    'SpectIQ connects estimates, agreements, payments, scheduling, and next actions for home inspection companies in one auditable workflow.',
    '["/brands/spectiq-logo-lockup.svg","/brands/spectiq-logo-mark.svg"]'::jsonb,
    'active',
    null,
    now()
  )
  on conflict (branch_id) where status = 'active' do update set
    name = excluded.name,
    tagline = excluded.tagline,
    mission = excluded.mission,
    values = excluded.values,
    target_audience = excluded.target_audience,
    voice = excluded.voice,
    website_url = excluded.website_url,
    color_palette = excluded.color_palette,
    typography = excluded.typography,
    image_prompt = excluded.image_prompt,
    marketing_hooks = excluded.marketing_hooks,
    site_preview_description = excluded.site_preview_description,
    extracted_images = excluded.extracted_images,
    status = 'active',
    unsubscribe_url = excluded.unsubscribe_url,
    updated_at = now()
  returning id into spectiq_brand_identity_id;

  insert into public.marketing_brands (
    branch_id, brand_identity_id, name, industry, description, target_audience,
    tone, value_proposition, primary_color, logo_url, website_url, keywords,
    competitors, metadata, legal_name, contact_email, address_line_1, city,
    state_region, postal_code, country_code, updated_at
  ) values (
    spectiq_branch_id,
    spectiq_brand_identity_id,
    'SpectIQ',
    'Home Inspection Business Software',
    'Business software for home inspection companies that connects estimates, agreements, payments, scheduling, and next actions.',
    'Owners and operators of home inspection companies.',
    'Professional, founder-led, direct, evidence-led, and operational.',
    'One auditable path from inquiry through estimate, agreement, payment, and booking.',
    '#E56A2C',
    '/brands/spectiq-logo-lockup.svg',
    'https://spectiq.app',
    '["home inspection business software","home inspection CRM","inspection scheduling software","inspection estimate software","inspection agreements","inspection payments","inspection booking"]'::jsonb,
    '[]'::jsonb,
    '{"positioning":"one auditable path from inquiry through estimate, agreement, payment, and booking","production_prospect_outreach_enabled":false,"spoke_mode":"trellis_native_no_spoke"}'::jsonb,
    'Sweetwater Technology LLC',
    'clint@spectiq.app',
    '1295 Smithdale Heights Drive',
    'Cumming',
    'GA',
    '30040',
    'US',
    now()
  )
  on conflict (branch_id) do update set
    brand_identity_id = excluded.brand_identity_id,
    name = excluded.name,
    industry = excluded.industry,
    description = excluded.description,
    target_audience = excluded.target_audience,
    tone = excluded.tone,
    value_proposition = excluded.value_proposition,
    primary_color = excluded.primary_color,
    logo_url = excluded.logo_url,
    website_url = excluded.website_url,
    keywords = excluded.keywords,
    competitors = excluded.competitors,
    metadata = excluded.metadata,
    legal_name = excluded.legal_name,
    contact_email = excluded.contact_email,
    address_line_1 = excluded.address_line_1,
    address_line_2 = null,
    city = excluded.city,
    state_region = excluded.state_region,
    postal_code = excluded.postal_code,
    country_code = excluded.country_code,
    updated_at = now();

  insert into public.brand_profiles (
    branch, brand_name, pronunciation_guide, default_tone,
    default_actor_style, default_actor_gender, tagline, brand_colors,
    logo_url, website_url, industry, updated_at
  ) values (
    'spectiq.app',
    'SpectIQ',
    'SpectIQ is pronounced “Spect eye-cue.” The website is “spectiq dot app.”',
    'Professional, direct, evidence-led, and operational; founder-to-operator rather than promotional.',
    'professional founder-led delivery',
    'male',
    'Win the inspection while the buyer is still on the phone.',
    '["#E56A2C","#1B1F27","#FAF8F5"]'::jsonb,
    '/brands/spectiq-logo-mark.svg',
    'https://spectiq.app',
    'Home Inspection Business Software',
    now()
  )
  on conflict (branch) do update set
    brand_name = excluded.brand_name,
    pronunciation_guide = excluded.pronunciation_guide,
    default_tone = excluded.default_tone,
    default_actor_style = excluded.default_actor_style,
    default_actor_gender = excluded.default_actor_gender,
    tagline = excluded.tagline,
    brand_colors = excluded.brand_colors,
    logo_url = excluded.logo_url,
    website_url = excluded.website_url,
    industry = excluded.industry,
    updated_at = now();

  select id into clint_user_id
  from public.trellis_users
  where lower(email) = 'clint@sproutify.app'
  limit 1;

  if clint_user_id is null then
    raise exception 'Cannot configure SpectIQ: Trellis operator clint@sproutify.app was not found';
  end if;

  insert into public.trellis_user_branches (trellis_user_id, branch_id, branch_role)
  values (clint_user_id, spectiq_branch_id, 'lead')
  on conflict (trellis_user_id, branch_id) do update set
    branch_role = 'lead';

  select id into template_id
  from public.email_templates
  where branch_id = spectiq_branch_id::text
    and name = 'SpectIQ General Update'
  order by created_at, id
  limit 1;

  if template_id is null then
    insert into public.email_templates (
      branch_id, brand_identity_id, name, description, html_body,
      is_default, design_json, updated_at
    ) values (
      spectiq_branch_id::text,
      spectiq_brand_identity_id,
      'SpectIQ General Update',
      'Versioned neutral update template for authenticated Trellis test sends. This is not a prospect-introduction campaign.',
      $spectiq_email$<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SpectIQ update</title></head>
<body style="margin:0;background:#FAF8F5;color:#1B1F27;font-family:'Public Sans',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF8F5;width:100%;">
    <tr><td align="center" style="padding:28px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e7e1da;">
        <tr><td style="padding:30px 34px 20px;border-top:6px solid #E56A2C;">
          <a href="https://spectiq.app" aria-label="SpectIQ"><img src="https://spectiq.app/spectiq-email-logo.png" width="188" alt="SpectIQ" style="display:block;width:188px;max-width:100%;height:auto;border:0;"></a>
        </td></tr>
        <!-- IF_FIRST_NAME --><tr><td style="padding:8px 34px 0;font-size:16px;line-height:25px;">Hello {{first_name}},</td></tr><!-- END_IF_FIRST_NAME -->
        <tr><td style="padding:18px 34px 0;font-size:16px;line-height:26px;">{{body_copy}}</td></tr>
        <tr><td style="padding:26px 34px 8px;">
          <a href="{{cta_url}}" style="display:inline-block;background:#E56A2C;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:4px;">{{cta_text}}</a>
        </td></tr>
        <tr><td style="padding:26px 34px 30px;font-size:13px;line-height:20px;color:#59606c;border-top:1px solid #e7e1da;">
          <div>Sweetwater Technology LLC · 1295 Smithdale Heights Drive · Cumming, GA 30040</div>
          <div style="margin-top:8px;"><a href="https://spectiq.app/privacy" style="color:#1B1F27;">Privacy</a> · <a href="{{unsubscribe_url}}" style="color:#1B1F27;">Unsubscribe</a></div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>$spectiq_email$,
      true,
      '{"schema_version":"1.0","template_version":"spectiq-general-update-v1","purpose":"general_update_test","production_prospect_outreach_enabled":false,"default_fields":{"body_copy":"This is a SpectIQ general update test. It confirms that branch-specific branding and delivery are ready before prospect outreach is enabled.","cta_text":"See whether SpectIQ fits your inspection company.","cta_url":"https://spectiq.app"}}'::jsonb,
      now()
    )
    returning id into template_id;
  else
    update public.email_templates set
      brand_identity_id = spectiq_brand_identity_id,
      description = 'Versioned neutral update template for authenticated Trellis test sends. This is not a prospect-introduction campaign.',
      html_body = $spectiq_email$<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SpectIQ update</title></head>
<body style="margin:0;background:#FAF8F5;color:#1B1F27;font-family:'Public Sans',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAF8F5;width:100%;">
    <tr><td align="center" style="padding:28px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e7e1da;">
        <tr><td style="padding:30px 34px 20px;border-top:6px solid #E56A2C;">
          <a href="https://spectiq.app" aria-label="SpectIQ"><img src="https://spectiq.app/spectiq-email-logo.png" width="188" alt="SpectIQ" style="display:block;width:188px;max-width:100%;height:auto;border:0;"></a>
        </td></tr>
        <!-- IF_FIRST_NAME --><tr><td style="padding:8px 34px 0;font-size:16px;line-height:25px;">Hello {{first_name}},</td></tr><!-- END_IF_FIRST_NAME -->
        <tr><td style="padding:18px 34px 0;font-size:16px;line-height:26px;">{{body_copy}}</td></tr>
        <tr><td style="padding:26px 34px 8px;"><a href="{{cta_url}}" style="display:inline-block;background:#E56A2C;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:4px;">{{cta_text}}</a></td></tr>
        <tr><td style="padding:26px 34px 30px;font-size:13px;line-height:20px;color:#59606c;border-top:1px solid #e7e1da;"><div>Sweetwater Technology LLC · 1295 Smithdale Heights Drive · Cumming, GA 30040</div><div style="margin-top:8px;"><a href="https://spectiq.app/privacy" style="color:#1B1F27;">Privacy</a> · <a href="{{unsubscribe_url}}" style="color:#1B1F27;">Unsubscribe</a></div></td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>$spectiq_email$,
      is_default = true,
      design_json = '{"schema_version":"1.0","template_version":"spectiq-general-update-v1","purpose":"general_update_test","production_prospect_outreach_enabled":false,"default_fields":{"body_copy":"This is a SpectIQ general update test. It confirms that branch-specific branding and delivery are ready before prospect outreach is enabled.","cta_text":"See whether SpectIQ fits your inspection company.","cta_url":"https://spectiq.app"}}'::jsonb,
      updated_at = now()
    where id = template_id;
  end if;

  if (select count(*) from public.branches where slug = 'spectiq') <> 1
    or (select count(*) from public.brand_identities where branch_id = 'spectiq' and status = 'active') <> 1
    or (select count(*) from public.marketing_brands where branch_id = spectiq_branch_id) <> 1
    or (select count(*) from public.brand_profiles where branch = 'spectiq.app') <> 1
    or (select count(*) from public.email_templates where branch_id = spectiq_branch_id::text and name = 'SpectIQ General Update') <> 1
    or (select count(*) from public.trellis_user_branches where trellis_user_id = clint_user_id and branch_id = spectiq_branch_id and branch_role = 'lead') <> 1
  then
    raise exception 'SpectIQ branch configuration did not converge to exactly one operational record per service';
  end if;
end
$migration$;
