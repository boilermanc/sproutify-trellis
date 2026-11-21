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
    pipeline_fingerprint_sha256: "3b507045648c68790fbd57b9562445a25277eca5a70dc5ea8994fc46ddd595be",
  }),
  Object.freeze({
    key: "vertical-ui-story",
    version: "v1",
    status: "worker_enabled",
    branch_scope: "all",
    branch_slugs: Object.freeze([]),
    formats: Object.freeze(["9:16"]),
    width: 1080,
    height: 1920,
    fps: 30,
    worker_enabled: true,
    source_fingerprint_sha256: "6f404ce3c28134c95c478735f8d1abd409a1d5fced689996feeff1c8237f7210",
    pipeline_fingerprint_sha256: "0a9e6171f5890e5308058f3ed06f3abfd68361d5cbae97c45b5b481613bb258e",
  }),
]);

export function findPromoComposition(key: string, version: string) {
  return PROMO_COMPOSITIONS.find(item => item.key === key && item.version === version) || null;
}

export function promoCompositionAllowsBranch(definition: PromoCompositionDefinition, branchSlug: string) {
  return definition.branch_scope === "all" || definition.branch_slugs.includes(branchSlug);
}
