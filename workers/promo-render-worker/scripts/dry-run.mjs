import { createRekkrdRenderClaimFixture } from '../fixtures/rekkrd-preview.mjs';
import { assertPromoRenderActivationReady, inspectPromoRenderClaim } from '../preflight.mjs';

const fixture = createRekkrdRenderClaimFixture();
const preflight = inspectPromoRenderClaim({
  job: fixture.job, worker_id: fixture.workerId, project: fixture.project,
  approvals: fixture.approvals, assets: fixture.assets,
  composition_source_sha256: fixture.compositionSourceSha256,
  pipeline_fingerprint: fixture.pipelineFingerprint,
});
let activationError = null;
try { assertPromoRenderActivationReady(preflight); } catch (error) {
  activationError = { code: error.code, message: error.message };
}
console.log(JSON.stringify({
  status: 'preflight_verified_activation_blocked', job_id: preflight.job_id,
  input_asset_count: preflight.asset_plan.length, input_fingerprint: preflight.input_fingerprint,
  activation_ready: preflight.activation_ready, activation_blockers: preflight.activation_blockers,
  activation_error: activationError,
}, null, 2));
if (preflight.activation_ready || preflight.activation_blockers.length === 0) process.exitCode = 1;
