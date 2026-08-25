import type { PromoPresentationEnvelope } from "./types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HEX = /^#[0-9a-f]{6}$/i;

export class PromoPresentationReadinessError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "PromoPresentationReadinessError";
    this.code = code;
  }
}

const record = (value: unknown): value is Record<string, any> => !!value && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, maximum = 120) => typeof value === "string" && !!value.trim() && value.trim().length <= maximum;

const LOCKED_PRESENTATIONS: Readonly<Record<string, Readonly<{
  background: string; surface: string; foreground: string; muted: string; accent: string;
  display_font: string; label_font: string;
}>>> = Object.freeze({
  rekkrd: Object.freeze({
    background: "#14100c",
    surface: "#1e1811",
    foreground: "#efe9e0",
    muted: "#9a8f80",
    accent: "#e8621a",
    display_font: "Playfair Display",
    label_font: "JetBrains Mono",
  }),
});

export function buildPromoPresentationEnvelope(
  branchValue: unknown,
  brandIdentityValue: unknown,
  manifestValue: unknown,
): PromoPresentationEnvelope {
  if (!record(branchValue) || !UUID.test(String(branchValue.id || "")) || !text(branchValue.slug, 80)
    || !text(branchValue.name, 120) || branchValue.is_active !== true) {
    throw new PromoPresentationReadinessError("PROMO_PRESENTATION_BRANCH_INVALID", "The active branch presentation source is invalid.");
  }
  if (!record(brandIdentityValue) || !UUID.test(String(brandIdentityValue.id || ""))
    || brandIdentityValue.status !== "active" || brandIdentityValue.branch_id !== branchValue.slug
    || !text(brandIdentityValue.name, 120) || !text(brandIdentityValue.updated_at, 80)
    || !Number.isFinite(Date.parse(brandIdentityValue.updated_at))
    || !record(brandIdentityValue.color_palette) || !record(brandIdentityValue.typography)) {
    throw new PromoPresentationReadinessError(
      "PROMO_PRESENTATION_IDENTITY_NOT_READY",
      "An active Brand Identity bound to this branch is required before rendering.",
    );
  }
  const palette = brandIdentityValue.color_palette;
  const typography = brandIdentityValue.typography;
  if (![palette.primary, palette.secondary, palette.accent, palette.neutral].every(value => HEX.test(String(value || "")))
    || !text(typography.heading, 100) || !text(typography.body, 100)) {
    throw new PromoPresentationReadinessError(
      "PROMO_PRESENTATION_STYLE_NOT_READY",
      "The active Brand Identity requires complete hex palette and typography roles.",
    );
  }
  const locked = LOCKED_PRESENTATIONS[String(branchValue.slug).toLowerCase()];
  const style = locked || {
    background: palette.primary,
    surface: palette.secondary,
    foreground: palette.neutral,
    muted: palette.neutral,
    accent: palette.accent,
    display_font: typography.heading.trim(),
    label_font: typography.body.trim(),
  };
  const assets = record(manifestValue) && Array.isArray(manifestValue.assets) ? manifestValue.assets : [];
  const approvedLogos = assets.filter((asset: any) => record(asset) && asset.kind === "brand_logo"
    && UUID.test(String(asset.id || "")) && asset.provenance?.approved === true);
  if (approvedLogos.length > 1) {
    throw new PromoPresentationReadinessError(
      "PROMO_PRESENTATION_LOGO_AMBIGUOUS",
      "Choose one approved brand logo asset before rendering.",
    );
  }
  return Object.freeze({
    schema_version: "1.0.0",
    approved: true,
    approval_id: brandIdentityValue.id,
    approval_source: locked ? "active_brand_identity+locked_style_registry" : "active_brand_identity",
    source_branch_id: branchValue.id,
    target_branch_id: branchValue.id,
    source_updated_at: brandIdentityValue.updated_at,
    brand: Object.freeze({
      name: branchValue.name.trim(),
      logo_asset_id: approvedLogos[0]?.id || null,
      ...style,
    }),
  });
}
