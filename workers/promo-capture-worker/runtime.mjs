import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

import { executePromoCaptureClaim } from './executor.mjs';
import { captureWithPlaywright } from './playwright-adapter.mjs';
import { createCaptureSecretResolvers } from './config.mjs';

const required = (environment, name) => {
  const value = environment[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
};
const rpcArgs = args => Object.fromEntries(Object.entries(args).map(([key, value]) => [`p_${key}`, value]));

export function createPromoCaptureRuntime({
  environment = process.env,
  clientFactory = createClient,
  capture = captureWithPlaywright,
  uuid = randomUUID,
} = {}) {
  const claimsEnabled = environment.PROMO_CAPTURE_CLAIMS_ENABLED === 'true';
  const workerId = (environment.PROMO_CAPTURE_WORKER_ID || `promo-capture-${process.pid}`).slice(0, 160);
  let db;
  const database = () => {
    if (!db) db = clientFactory(required(environment, 'SUPABASE_URL'), environment.SUPABASE_SECRET_KEY || required(environment, 'SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    return db;
  };
  const rpcBoolean = async (name, args) => {
    const { data, error } = await database().rpc(name, rpcArgs(args));
    if (error) throw new Error(`${name} failed: ${error.message}`);
    return data === true;
  };
  const resolvers = createCaptureSecretResolvers(environment);

  async function processOnce() {
    if (!claimsEnabled) return { claimed: false, disabled: true };
    const client = database();
    const { data, error } = await client.rpc('claim_promo_job', {
      p_worker_id: workerId, p_lease_seconds: 300, p_job_types: ['capture'],
    });
    if (error) throw new Error(`Capture claim failed: ${error.message}`);
    const job = data?.[0];
    if (!job) return { claimed: false, disabled: false };
    const [projectResult, sourceResult, scenarioResult] = await Promise.all([
      client.from('promo_projects').select('id,current_revision_id,branch_id').eq('id', job.project_id).maybeSingle(),
      client.from('promo_branch_sources').select('*').eq('id', job.input?.branch_source_id || '').maybeSingle(),
      client.from('promo_capture_scenarios').select('*').eq('project_id', job.project_id)
        .eq('revision_id', job.revision_id).eq('scenario_key', job.input?.scenario_key || '')
        .eq('scenario_version', job.input?.scenario_version || 0).maybeSingle(),
    ]);
    const lookupError = projectResult.error || sourceResult.error || scenarioResult.error;
    if (lookupError || !projectResult.data || !sourceResult.data || !scenarioResult.data) {
      const message = lookupError?.message || 'Capture preflight records were not found.';
      await rpcBoolean('fail_promo_job', {
        job_id: job.id, worker_id: workerId, lease_token: job.lease_token,
        error_code: 'PROMO_CAPTURE_LOOKUP_FAILED', error_message: message.slice(0, 1000), retryable: true,
      });
      throw new Error(`Capture lookup failed: ${message}`);
    }
    const result = await executePromoCaptureClaim({
      job, worker_id: workerId, project: projectResult.data,
      branch_source: sourceResult.data, scenario: scenarioResult.data,
      adapters: {
        randomUuid: uuid,
        heartbeat: args => rpcBoolean('heartbeat_promo_job', { ...args, lease_seconds: 300 }),
        resolveFixture: resolvers.resolveFixture,
        resolveAuthProfile: resolvers.resolveAuthProfile,
        capture: args => capture({ ...args, environment }),
        upload: async value => {
          const { error: uploadError } = await client.storage.from(value.bucket).upload(value.path, value.bytes, {
            contentType: value.content_type, upsert: value.upsert, metadata: value.metadata,
          });
          if (uploadError) throw new Error(`Capture upload failed: ${uploadError.message}`);
        },
        complete: args => rpcBoolean('complete_promo_capture_job', args),
        fail: args => rpcBoolean('fail_promo_job', args),
        cleanup: async ({ bucket, paths }) => {
          const { error: cleanupError } = await client.storage.from(bucket).remove(paths);
          if (cleanupError) throw new Error(`Capture cleanup failed: ${cleanupError.message}`);
        },
      },
    });
    return { claimed: true, completed: result.completed, job_id: job.id, capture_run_id: result.capture_run_id };
  }

  return Object.freeze({ config: Object.freeze({ claimsEnabled, workerId }), processOnce });
}
