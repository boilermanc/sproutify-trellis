import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

import { normalizeMusicToWav } from './audio.mjs';
import { resolveLyriaProfile } from './config.mjs';
import { executePromoMusicClaim } from './executor.mjs';
import { generateLyriaMusic } from './lyria.mjs';
import { buildPromoMusicPrompt, PromoMusicPreflightError } from './preflight.mjs';

const required = (environment, name) => {
  const value = environment[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
};
const rpcArgs = args => Object.fromEntries(Object.entries(args).map(([key, value]) => [`p_${key}`, value]));

export function createPromoMusicRuntime({
  environment = process.env,
  clientFactory = createClient,
  generateProvider = generateLyriaMusic,
  normalize = normalizeMusicToWav,
  uuid = randomUUID,
} = {}) {
  const claimsEnabled = environment.PROMO_MUSIC_CLAIMS_ENABLED === 'true';
  const workerId = (environment.PROMO_MUSIC_WORKER_ID || `promo-music-${process.pid}`).slice(0, 160);
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

  async function processOnce() {
    if (!claimsEnabled) return { claimed: false, disabled: true };
    const client = database();
    const { data, error } = await client.rpc('claim_promo_job', {
      p_worker_id: workerId, p_lease_seconds: 600, p_job_types: ['music_generate'],
    });
    if (error) throw new Error(`Music claim failed: ${error.message}`);
    const job = data?.[0];
    if (!job) return { claimed: false, disabled: false };
    const { data: project, error: projectError } = await client.from('promo_projects')
      .select('id,current_revision_id,branch_id').eq('id', job.project_id).maybeSingle();
    if (projectError || !project) {
      const message = projectError?.message || 'Music project was not found.';
      await rpcBoolean('fail_promo_job', { job_id: job.id, worker_id: workerId, lease_token: job.lease_token,
        error_code: 'PROMO_MUSIC_PROJECT_LOOKUP_FAILED', error_message: message.slice(0, 1000), retryable: true });
      throw new Error(`Music project lookup failed: ${message}`);
    }
    const result = await executePromoMusicClaim({
      job, worker_id: workerId, project,
      adapters: {
        randomUuid: uuid,
        heartbeat: args => rpcBoolean('heartbeat_promo_job', { ...args, lease_seconds: 600 }),
        generate: async ({ plan, heartbeat }) => {
          let profile; let apiKey;
          try {
            profile = resolveLyriaProfile({ profileId: plan.music_profile_id,
              profileMapJson: required(environment, 'PROMO_LYRIA_PROFILE_MAP_JSON') });
            apiKey = required(environment, 'GEMINI_API_KEY');
          } catch (error) {
            throw new PromoMusicPreflightError('PROMO_MUSIC_PROVIDER_CONFIG_MISSING', error instanceof Error ? error.message : 'Music provider configuration is missing.');
          }
          const generated = await generateProvider({ apiKey, model: profile.model,
            prompt: buildPromoMusicPrompt(plan) });
          await heartbeat(55);
          const normalized = await normalize({ bytes: generated.bytes, targetSeconds: plan.target_seconds,
            ffmpegPath: environment.FFMPEG_PATH || 'ffmpeg', ffprobePath: environment.FFPROBE_PATH || 'ffprobe' });
          return { ...generated, ...normalized, instrumental_requested: plan.instrumental === true,
            estimated_cost_usd: profile.estimated_cost_usd };
        },
        upload: async value => {
          const { error: uploadError } = await client.storage.from(value.bucket).upload(value.path, value.bytes, {
            contentType: value.content_type, upsert: value.upsert, metadata: value.metadata,
          });
          if (uploadError) throw new Error(`Music upload failed: ${uploadError.message}`);
        },
        complete: args => rpcBoolean('complete_promo_music_generation_job', args),
        fail: args => rpcBoolean('fail_promo_job', args),
        cleanup: async ({ bucket, paths }) => {
          const { error: cleanupError } = await client.storage.from(bucket).remove(paths);
          if (cleanupError) throw new Error(`Music cleanup failed: ${cleanupError.message}`);
        },
      },
    });
    return { claimed: true, completed: result.completed, job_id: job.id, take_id: result.take_id };
  }

  return Object.freeze({ config: Object.freeze({ claimsEnabled, workerId }), processOnce });
}
