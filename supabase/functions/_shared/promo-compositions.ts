export const PROMO_COMPOSITION_REGISTRY_VERSION = "1.0.0" as const;

export type PromoCompositionDefinition = Readonly<{
  key: string;
  version: string;
  status: "proof_only" | "contract_only" | "worker_enabled";
  branch_scope: "all" | "allowlist";
  branch_slugs: readonly string[];
  formats: readonly string[];
  width: number;
  height: number;
  fps: number;
  worker_enabled: boolean;
}>;

export const PROMO_COMPOSITIONS: readonly PromoCompositionDefinition[] = Object.freeze([
  Object.freeze({
    key: "PromoProof",
    version: "ps-002-v1",
    status: "proof_only",
    branch_scope: "allowlist",
    branch_slugs: Object.freeze(["rekkrd"]),
    formats: Object.freeze(["9:16"]),
    width: 1080,
    height: 1920,
    fps: 30,
    worker_enabled: false,
  }),
  Object.freeze({
    key: "vertical-ui-story",
    version: "v1",
    status: "contract_only",
    branch_scope: "all",
    branch_slugs: Object.freeze([]),
    formats: Object.freeze(["9:16"]),
    width: 1080,
    height: 1920,
    fps: 30,
    worker_enabled: false,
  }),
]);

export function findPromoComposition(key: string, version: string) {
  return PROMO_COMPOSITIONS.find(item => item.key === key && item.version === version) || null;
}

export function promoCompositionAllowsBranch(definition: PromoCompositionDefinition, branchSlug: string) {
  return definition.branch_scope === "all" || definition.branch_slugs.includes(branchSlug);
}
