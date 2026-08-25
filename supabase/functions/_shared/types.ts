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
