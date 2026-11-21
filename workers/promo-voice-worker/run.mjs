import { randomUUID } from 'node:crypto';
import process from 'node:process';

import { createClient } from '@supabase/supabase-js';

import { executePromoVoiceClaim } from './executor.mjs';
import { executePromoVoiceAlignmentClaim } from './alignment-executor.mjs';
import { generateGeminiVoiceByPhrase } from './gemini-tts.mjs';
import { buildPromoVoicePrompt } from './preflight.mjs';
import { resolveGeminiVoice } from './provider-config.mjs';

const required = name => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
};
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const workerId = (process.env.PROMO_VOICE_WORKER_ID || `promo-voice-${process.pid}`).slice(0, 160);
const claimsEnabled = process.env.PROMO_VOICE_CLAIMS_ENABLED === 'true';
const once = process.argv.includes('--once');

if (!claimsEnabled) {
  console.log('Promo voice claims are disabled. Set PROMO_VOICE_CLAIMS_ENABLED=true only after migrations and private Storage are deployed.');
  process.exit(0);
}

const db = createClient(required('SUPABASE_URL'), process.env.SUPABASE_SECRET_KEY || required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false, autoRefreshToken: false },
});
const geminiApiKey = required('GEMINI_API_KEY');
const model = process.env.PROMO_GEMINI_TTS_MODEL || 'gemini-3.1-flash-tts-preview';
const defaultVoice = process.env.PROMO_GEMINI_TTS_VOICE || 'Kore';
const voiceMapJson = process.env.PROMO_GEMINI_VOICE_MAP_JSON || '';

const rpcBoolean = async (name, args) => {
  const { data, error } = await db.rpc(name, Object.fromEntries(Object.entries(args).map(([key, value]) => [`p_${key}`, value])));
  if (error) throw new Error(`${name} failed: ${error.message}`);
  return data === true;
};

async function claimOne() {
  const { data, error } = await db.rpc('claim_promo_job', {
    p_worker_id: workerId, p_lease_seconds: 300, p_job_types: ['voice_generate', 'voice_align'],
  });
  if (error) throw new Error(`Voice claim failed: ${error.message}`);
  return data?.[0] || null;
}

async function runClaim(job) {
  const { data: project, error } = await db.from('promo_projects').select('id,current_revision_id,branch_id').eq('id', job.project_id).maybeSingle();
  if (error) {
    await rpcBoolean('fail_promo_job', {
      job_id: job.id, worker_id: workerId, lease_token: job.lease_token,
      error_code: 'PROMO_VOICE_PROJECT_LOOKUP_FAILED', error_message: error.message.slice(0, 1000), retryable: true,
    });
    throw new Error(`Claimed voice project lookup failed: ${error.message}`);
  }
  const adapters = {
      randomUuid: randomUUID,
      heartbeat: args => rpcBoolean('heartbeat_promo_job', { ...args, lease_seconds: 300 }),
      generate: ({ plan, heartbeat }) => generateGeminiVoiceByPhrase({
        apiKey: geminiApiKey, model,
        voice: resolveGeminiVoice({ voiceProfileId: plan.voice_profile_id, defaultVoice, voiceMapJson }),
        phraseRequests: plan.phrases.map(phrase => ({ phrase_id: phrase.phrase_id, prompt: buildPromoVoicePrompt(plan, [phrase]) })),
        onPhrase: ({ completed, total }) => heartbeat(10 + Math.floor((completed / total) * 60)),
      }),
      upload: async value => {
        const { error: uploadError } = await db.storage.from(value.bucket).upload(value.path, value.bytes, {
          contentType: value.content_type, upsert: value.upsert, metadata: value.metadata,
        });
        if (uploadError) throw new Error(`Voice upload failed: ${uploadError.message}`);
      },
      fail: args => rpcBoolean('fail_promo_job', args),
      cleanup: async ({ bucket, paths }) => {
        const { error: cleanupError } = await db.storage.from(bucket).remove(paths);
        if (cleanupError) throw new Error(`Voice cleanup failed: ${cleanupError.message}`);
      },
  };
  if (job.job_type === 'voice_generate') {
    return executePromoVoiceClaim({
      job, worker_id: workerId, project,
      adapters: { ...adapters, complete: args => rpcBoolean('complete_promo_voice_generation_job', args) },
    });
  }
  const [{ data: take, error: takeError }, { data: audioAsset, error: assetError }, { data: binding, error: bindingError }] = await Promise.all([
    db.from('promo_voice_takes').select('id,project_id,revision_id,audio_asset_id,status,duration_seconds,settings')
      .eq('id', job.input?.take_id || '').maybeSingle(),
    db.from('promo_assets').select('id,project_id,revision_id,kind,status,mime_type,checksum_sha256')
      .eq('id', job.input?.audio_asset_id || '').maybeSingle(),
    db.from('promo_revision_assets').select('asset_id').eq('project_id', job.project_id)
      .eq('revision_id', job.revision_id).eq('asset_id', job.input?.audio_asset_id || '').maybeSingle(),
  ]);
  if (takeError || assetError || bindingError) {
    const message = (takeError || assetError || bindingError).message;
    await adapters.fail({ job_id: job.id, worker_id: workerId, lease_token: job.lease_token,
      error_code: 'PROMO_VOICE_ALIGNMENT_LOOKUP_FAILED', error_message: message.slice(0, 1000), retryable: true });
    throw new Error(`Voice alignment lookup failed: ${message}`);
  }
  return executePromoVoiceAlignmentClaim({
    job, worker_id: workerId, project, take, audioAsset, assetBound: binding?.asset_id === job.input?.audio_asset_id,
    adapters: { ...adapters, complete: args => rpcBoolean('complete_promo_voice_alignment_job', args) },
  });
}

do {
  const job = await claimOne();
  if (!job) {
    if (once) break;
    await sleep(Math.max(1000, Number(process.env.PROMO_VOICE_POLL_MS || 5000)));
    continue;
  }
  try {
    const result = await runClaim(job);
    console.log(JSON.stringify({
      event: job.job_type === 'voice_align' ? 'promo_voice_alignment_completed' : 'promo_voice_completed',
      job_id: job.id, take_id: result.take_id || job.input?.take_id, alignment_asset_id: result.alignment_asset_id,
    }));
  } catch (error) {
    console.error(JSON.stringify({ event: 'promo_voice_failed', job_id: job.id, error: error instanceof Error ? error.message : 'Unknown worker failure' }));
  }
} while (!once);
