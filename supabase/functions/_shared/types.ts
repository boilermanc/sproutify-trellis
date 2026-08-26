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
  readonly pipeline_fingerprint_sha256: string;
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

export interface PromoCaptureEvidenceAssertion {
  readonly kind: unknown;
  readonly value: unknown;
  readonly passed: unknown;
}

export interface PromoCaptureEvidence {
  readonly schema_version: unknown;
  readonly scenario_id: unknown;
  readonly scenario_key: unknown;
  readonly scenario_version: unknown;
  readonly commit_sha: unknown;
  readonly route: unknown;
  readonly contains_pii: unknown;
  readonly masks_applied: unknown[];
  readonly assertions: PromoCaptureEvidenceAssertion[];
}

export interface PromoCaptureScenarioRow {
  readonly id: string;
  readonly scenario_key: string;
  readonly scenario_version: number;
  readonly repository_ref: string;
  readonly commit_sha: string;
  readonly route: string;
  readonly status: string;
  readonly definition: { readonly id: string };
}

export interface PromoCaptureRunResult {
  readonly id: string;
  readonly job_id: string;
  readonly project_id: string;
  readonly revision_id: string;
  readonly scenario_id: string;
  readonly status: string;
  readonly video_asset_id: string;
  readonly still_asset_ids: string[];
  readonly trace_asset_id: string;
  readonly evidence: PromoCaptureEvidence;
}

export interface PromoCaptureAssetRow {
  readonly id: string;
  readonly project_id: string;
  readonly revision_id: string;
  readonly kind: string;
  readonly role: string;
  readonly status: string;
  readonly storage_bucket: string;
  readonly storage_path: string;
  readonly mime_type: string;
  readonly checksum_sha256: string;
  readonly file_size_bytes: number;
  readonly duration_seconds: number | null;
  readonly width: number | null;
  readonly height: number | null;
}
