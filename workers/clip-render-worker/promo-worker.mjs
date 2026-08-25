#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { executePromoRenderClaim } from '../promo-render-worker/executor.mjs';
import { renderPromoVertical } from './promo-render.mjs';

const workerRoot = path.dirname(fileURLToPath(import.meta.url));
const hashSource = file => createHash('sha256').update(readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), 'utf8').digest('hex');
const compositionSourceSha256 = hashSource(path.join(workerRoot, 'remotion', 'PromoVerticalStory.tsx'));
const pipelineFingerprint = hashSource(path.join(workerRoot, '..', 'promo-render-worker', 'pipeline.mjs'));

const requiredEnvironment = environment => {
  const supabaseUrl = String(environment.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const serviceKey = String(environment.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const workerId = String(environment.PROMO_RENDER_WORKER_ID || 'promo-render-node-v1').trim().slice(0, 160);
  const claimsEnabled = environment.PROMO_RENDER_CLAIMS_ENABLED === 'true';
  const pollMs = Math.max(1000, Math.min(60000, Number(environment.PROMO_RENDER_POLL_MS) || 5000));
  if (!claimsEnabled) return { claimsEnabled, supabaseUrl, serviceKey, workerId, pollMs };
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrl) || !serviceKey || !workerId) {
    throw new Error('Enabled Promo render claims require SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and a worker ID.');
  }
  return { claimsEnabled, supabaseUrl, serviceKey, workerId, pollMs };
};

const single = async (query, message) => {
  const { data, error } = await query.single();
  if (error || !data) throw new Error(`${message}: ${error?.message || 'row not found'}`);
  return data;
};

export function createPromoRenderRuntime({
  environment = process.env, render = renderPromoVertical, clientFactory = createClient, fetchImpl = fetch,
} = {}) {
  const config = requiredEnvironment(environment);
  if (!config.claimsEnabled) return Object.freeze({ config, processOnce: async () => ({ claimed: false, disabled: true }) });
  const db = clientFactory(config.supabaseUrl, config.serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { 'x-client-info': 'trellis-promo-render-worker/1.0.0' } },
  });

  const rpcBoolean = async (name, parameters) => {
    const { data, error } = await db.rpc(name, parameters);
    if (error) throw new Error(`${name} failed: ${error.message}`);
    return data === true;
  };

  const adapters = {
    heartbeat: value => rpcBoolean('heartbeat_promo_job', {
      p_job_id: value.job_id, p_worker_id: value.worker_id, p_lease_token: value.lease_token,
      p_progress: value.progress, p_lease_seconds: 900,
    }),
    randomUuid: randomUUID,
    signAsset: async ({ bucket, path: storagePath, expires_in: expiresIn }) => {
      const { data, error } = await db.storage.from(bucket).createSignedUrl(storagePath, expiresIn);
      if (error || !data?.signedUrl) throw new Error(`Could not sign private render asset: ${error?.message || 'URL missing'}`);
      return data.signedUrl;
    },
    fetchAsset: async (url, { max_bytes: maximumBytes }) => {
      const response = await fetchImpl(url, { cache: 'no-store', signal: AbortSignal.timeout(120000) });
      if (!response.ok) throw new Error(`Private render asset download failed with HTTP ${response.status}.`);
      const declared = Number(response.headers.get('content-length'));
      if (Number.isFinite(declared) && declared > maximumBytes) throw new Error('Private render asset exceeds its registered size.');
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > maximumBytes) throw new Error('Private render asset exceeded the download limit.');
      return bytes;
    },
    render,
    upload: async ({ bucket, path: storagePath, bytes, content_type: contentType, upsert, metadata }) => {
      const { error } = await db.storage.from(bucket).upload(storagePath, bytes, {
        contentType, upsert, cacheControl: '31536000', metadata,
      });
      if (error) throw new Error(`Immutable render upload failed: ${error.message}`);
    },
    complete: value => rpcBoolean('complete_promo_render_job', {
      p_job_id: value.job_id, p_worker_id: value.worker_id, p_lease_token: value.lease_token,
      p_render_asset_id: value.render_asset_id, p_qa_asset_id: value.qa_asset_id,
      p_render_checksum_sha256: value.render_checksum_sha256, p_qa_checksum_sha256: value.qa_checksum_sha256,
      p_render_file_size_bytes: value.render_file_size_bytes, p_qa_file_size_bytes: value.qa_file_size_bytes,
      p_duration_seconds: value.duration_seconds, p_output_fingerprint: value.output_fingerprint, p_qa: value.qa,
    }),
    fail: value => rpcBoolean('fail_promo_job', {
      p_job_id: value.job_id, p_worker_id: value.worker_id, p_lease_token: value.lease_token,
      p_error_code: value.error_code, p_error_message: value.error_message, p_retryable: value.retryable,
    }),
    cleanup: async ({ bucket, paths }) => {
      const { error } = await db.storage.from(bucket).remove(paths);
      if (error) throw new Error(`Render orphan cleanup failed: ${error.message}`);
    },
  };

  const processOnce = async () => {
    const { data: rows, error: claimError } = await db.rpc('claim_promo_job', {
      p_worker_id: config.workerId, p_lease_seconds: 900, p_job_types: ['preview_render', 'final_render'],
    });
    if (claimError) throw new Error(`Could not claim Promo render job: ${claimError.message}`);
    const job = rows?.[0];
    if (!job) return { claimed: false };
    let executorStarted = false;
    try {
      const [project, approvalsResult, assetsResult] = await Promise.all([
        single(db.from('promo_projects').select('id,branch_id,current_revision_id,selected_preview_render_id').eq('id', job.project_id), 'Could not reload the Promo project'),
        db.from('promo_approvals').select('revision_id,gate,subject_type,subject_id,decision,created_at').eq('project_id', job.project_id).eq('revision_id', job.revision_id),
        db.from('promo_assets').select('id,project_id,revision_id,kind,status,storage_bucket,storage_path,mime_type,checksum_sha256,file_size_bytes,width,height').eq('project_id', job.project_id).eq('revision_id', job.revision_id),
      ]);
      if (approvalsResult.error || assetsResult.error) {
        throw new Error(`Could not reload render context: ${approvalsResult.error?.message || assetsResult.error?.message}`);
      }
      executorStarted = true;
      const result = await executePromoRenderClaim({
        job, worker_id: config.workerId, project, approvals: approvalsResult.data || [], assets: assetsResult.data || [],
        composition_source_sha256: compositionSourceSha256, pipeline_fingerprint: pipelineFingerprint, adapters,
      });
      return { claimed: true, job_id: job.id, completed: result.completed };
    } catch (error) {
      if (!executorStarted) {
        try {
          await adapters.fail({
            job_id: job.id, worker_id: config.workerId, lease_token: job.lease_token,
            error_code: 'PROMO_RENDER_CONTEXT_RELOAD_FAILED',
            error_message: error instanceof Error ? error.message.slice(0, 1000) : 'Could not reload render context.',
            retryable: true,
          });
        } catch { /* lease may have expired */ }
      }
      throw error;
    }
  };
  return Object.freeze({ config, processOnce });
}

async function main() {
  const runtime = createPromoRenderRuntime();
  if (!runtime.config.claimsEnabled) {
    console.log('[promo-render] claims disabled; set PROMO_RENDER_CLAIMS_ENABLED=true only after deployment verification');
    return;
  }
  console.log(`[promo-render] worker ${runtime.config.workerId} started`);
  for (;;) {
    try {
      const result = await runtime.processOnce();
      if (result.claimed) console.log(`[promo-render] completed ${result.job_id}`);
    } catch (error) {
      console.error(`[promo-render] ${error instanceof Error ? error.message : 'worker failure'}`);
    }
    await new Promise(resolve => setTimeout(resolve, runtime.config.pollMs));
  }
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  await main();
}
