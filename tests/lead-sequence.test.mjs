import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(new URL('../supabase/migrations/20260819195339_add_lead_email_sequences.sql', import.meta.url), 'utf8');
const worker = await readFile(new URL('../supabase/functions/lead-sequence-worker/index.ts', import.meta.url), 'utf8');
const webhook = await readFile(new URL('../supabase/functions/resend-webhook/index.ts', import.meta.url), 'utf8');

test('defines the four-step 0/3/5/7-day farm sequence', () => {
  assert.match(migration, /\(1, 0, 'Initial introduction'/);
  assert.match(migration, /\(2, 3, 'Quick follow-up'/);
  assert.match(migration, /\(3, 5, 'First-harvest value'/);
  assert.match(migration, /\(4, 7, 'Soft close'/);
});

test('claims sequence work with row locks and enforces one live enrollment', () => {
  assert.match(migration, /for update of enrollment skip locked/i);
  assert.match(migration, /idx_lead_email_enrollments_one_live/);
  assert.match(migration, /where status in \('active', 'awaiting_approval', 'paused'\)/);
});

test('uses exact Resend IDs and idempotency keys for outbound attribution', () => {
  assert.match(worker, /Idempotency-Key.*lead-sequence\/\$\{claim\.message_id\}/s);
  assert.match(worker, /p_resend_email_id: body\.id/);
  assert.match(webhook, /lead_email_messages/);
  assert.match(webhook, /eq\("resend_email_id", data\.email_id\)/);
});

test('supports authenticated browser invocation of the sequence worker', () => {
  assert.match(worker, /req\.method === "OPTIONS"/);
  assert.match(worker, /Access-Control-Allow-Origin/);
  assert.match(worker, /authorization, apikey, content-type, x-client-info, x-supabase-api-version/);
});

test('replies and negative delivery outcomes stop the sequence', () => {
  assert.match(webhook, /evt\?\.type === "email\.received"/);
  assert.match(webhook, /exit_reason: "replied"/);
  assert.match(webhook, /\["bounced", "complained", "failed", "suppressed"\]/);
  assert.match(webhook, /RESEND_WEBHOOK_SECRET is not configured/);
});
