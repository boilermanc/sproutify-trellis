import type { PromoCompositionDefinition } from "./types.ts";

export const PROMO_COMPOSITION_REGISTRY_VERSION = "1.0.0" as const;

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
    source_fingerprint_sha256: "828b5ba150bd7fecf18f25c5edeba0fb5c9887d229fe2bcfd60868e84be7298f",
  }),
  Object.freeze({
    key: "vertical-ui-story",
    version: "v1",
    status: "render_verified",
    branch_scope: "all",
    branch_slugs: Object.freeze([]),
    formats: Object.freeze(["9:16"]),
    width: 1080,
    height: 1920,
    fps: 30,
    worker_enabled: false,
    source_fingerprint_sha256: "6f404ce3c28134c95c478735f8d1abd409a1d5fced689996feeff1c8237f7210",
  }),
]);

export function findPromoComposition(key: string, version: string) {
  return PROMO_COMPOSITIONS.find(item => item.key === key && item.version === version) || null;
}

export function promoCompositionAllowsBranch(definition: PromoCompositionDefinition, branchSlug: string) {
  return definition.branch_scope === "all" || definition.branch_slugs.includes(branchSlug);
}
