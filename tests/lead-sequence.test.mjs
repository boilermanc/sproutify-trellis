import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(new URL('../supabase/migrations/20260819195339_add_lead_email_sequences.sql', import.meta.url), 'utf8');
const worker = await readFile(new URL('../supabase/functions/lead-sequence-worker/index.ts', import.meta.url), 'utf8');
const webhook = await readFile(new URL('../supabase/functions/resend-webhook/index.ts', import.meta.url), 'utf8');
const leadsPage = await readFile(new URL('../pages/Leads.tsx', import.meta.url), 'utf8');
const sequenceService = await readFile(new URL('../services/leadSequenceService.ts', import.meta.url), 'utf8');
const outbox = await readFile(new URL('../components/leads/LeadEmailOutboxModal.tsx', import.meta.url), 'utf8');
const sequencePanel = await readFile(new URL('../components/leads/LeadSequencePanel.tsx', import.meta.url), 'utf8');

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

test('refreshes lead stage after sends and live email status while details are open', () => {
  assert.match(leadsPage, /Promise\.all\(\[loadTimeline\(lead\), loadLeads\(true\)\]\)/);
  assert.match(leadsPage, /if \(!silent\) setLoadingLeads\(true\)/);
  assert.match(leadsPage, /fetchLeadSequence\(expandedLeadId\)/);
  assert.match(leadsPage, /}, 15000\)/);
  assert.match(leadsPage, /Deep Dive Failed/);
});

test('lets the operator select any unsent sequence email before approval', () => {
  assert.match(sequencePanel, /selectedStepId/);
  assert.match(sequencePanel, /Click here to select/);
  assert.match(sequencePanel, /message\.status === 'failed'/);
  assert.match(sequencePanel, /selectedApprovalStep\.step_number/);
  assert.match(sequencePanel, /Click anywhere on an unsent email card to select it/);
  assert.match(sequencePanel, /event\.stopPropagation\(\)/);
  assert.match(sequencePanel, /if \(selectable && !working\) setSelectedStepId\(step\.id\)/);
  assert.match(sequencePanel, /disabled=\{working \|\| !approvalArmed\}/);
  assert.match(sequencePanel, /setSelectedStepId\(null\)/);
  assert.match(sequenceService, /approve_lead_email_sequence_step/);
  assert.match(sequenceService, /p_step_number: stepNumber/);
});

test('explains setup and compliance locks instead of leaving email cards silently disabled', () => {
  assert.match(sequencePanel, /Create sequence & choose email/);
  assert.match(sequencePanel, /Nothing sends until you select and approve an email/);
  assert.match(sequencePanel, /Sending locked:/);
});

test('opens the shared rendered template when an email number is clicked', () => {
  assert.match(sequencePanel, /setPreviewStep\(step\)/);
  assert.match(sequencePanel, /Preview email \$\{step\.step_number\}/);
  assert.match(sequencePanel, /renderLeadSequenceHtml/);
  assert.match(sequencePanel, /srcDoc=\{previewHtml\}/);
  assert.match(sequencePanel, /previewFirstName/);
  assert.match(sequencePanel, /previewRecipientEmail/);
});

test('requires the operator to confirm Tower Farm referral membership before starting', () => {
  assert.match(sequencePanel, /referralConfirmed/);
  assert.match(sequencePanel, /belongs on the Tower Farm referral list/);
  assert.match(sequencePanel, /disabled=\{working \|\| disabled \|\| !referralConfirmed\}/);
});

test('keeps the referral confirmation readable against its panel', () => {
  assert.match(sequencePanel, /bg-slate-950\/35/);
  assert.match(sequencePanel, /font-bold leading-4 text-white/);
  assert.doesNotMatch(sequencePanel, /text-amber-100/);
});

test('provides a live lead email outbox with recipient-level tracking statuses', () => {
  assert.match(leadsPage, /Email Outbox/);
  assert.match(leadsPage, /LeadEmailOutboxModal/);
  assert.match(sequenceService, /fetchLeadEmailOutbox/);
  assert.match(sequenceService, /\.from\('lead_email_messages'\)/);
  assert.match(sequenceService, /\.from\('email_events'\)/);
  assert.match(sequenceService, /select\('resend_email_id,event_type,email,link_url,occurred_at'\)/);
  assert.match(sequenceService, /recipientByResendId/);
  assert.match(sequenceService, /opened_inferred/);
  assert.match(sequenceService, /clickedLinksByMessage/);
  assert.match(sequenceService, /\.range\(from, from \+ OUTBOX_PAGE_SIZE - 1\)/);
  assert.match(outbox, /refreshes every 15 seconds/);
  assert.match(outbox, /'sent'.*'delivered'.*'opened'.*'clicked'.*'replied'/s);
  assert.match(outbox, /Open inferred from a click by the lead/);
  assert.match(outbox, /Links clicked/);
  assert.match(outbox, /target="_blank"/);
  assert.match(webhook, /isLeadRecipientEvent/);
  assert.match(webhook, /recipient_email/);
});

test('replies and negative delivery outcomes stop the sequence', () => {
  assert.match(webhook, /evt\?\.type === "email\.received"/);
  assert.match(webhook, /exit_reason: "replied"/);
  assert.match(webhook, /\["bounced", "complained", "failed", "suppressed"\]/);
  assert.match(webhook, /RESEND_WEBHOOK_SECRET is not configured/);
  assert.match(webhook, /shereeAlreadyCopied/);
  assert.match(webhook, /replyNotificationHtml/);
});
