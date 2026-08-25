export interface PromoCompositionDefinition {
  readonly key: string;
  readonly version: string;
  readonly status: "proof_only" | "contract_only" | "render_verified" | "worker_enabled";
  readonly branch_scope: "all" | "allowlist";
  readonly branch_slugs: readonly string[];
  readonly formats: readonly string[];
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly worker_enabled: boolean;
  readonly source_fingerprint_sha256: string;
}

export interface PromoPresentationEnvelope {
  readonly schema_version: "1.0.0";
  readonly approved: true;
  readonly approval_id: string;
  readonly approval_source: "active_brand_identity" | "active_brand_identity+locked_style_registry";
  readonly source_branch_id: string;
  readonly target_branch_id: string;
  readonly source_updated_at: string;
  readonly brand: {
    readonly name: string;
    readonly logo_asset_id: string | null;
    readonly background: string;
    readonly surface: string;
    readonly foreground: string;
    readonly muted: string;
    readonly accent: string;
    readonly display_font: string;
    readonly label_font: string;
  };
}
