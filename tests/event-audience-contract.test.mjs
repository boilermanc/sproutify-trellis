import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('spoke gateway exposes a fixed ATL event audience operation', () => {
  const gateway = read('supabase/functions/spoke-query/index.ts');
  const operation = gateway.slice(gateway.indexOf('if (op === "event_audience")'), gateway.indexOf('// ── bible_passage'));

  assert.match(operation, /povudgtvzggnxwgtjexa/);
  assert.match(operation, /"event_registrations"/);
  assert.match(operation, /"events"/);
  assert.match(operation, /id,event_id,name,email,status,amount_paid,quantity,created_at,updated_at/);
  assert.doesNotMatch(operation, /stripe_payment_intent_id/);
  assert.doesNotMatch(operation, /phone/);
});

test('event intent stays federated and is segmentable', () => {
  const connector = read('spokeConnector.ts');
  const types = read('segmentTypes.ts');
  const app = read('App.tsx');

  assert.match(connector, /fetchEventAudience/);
  assert.match(connector, /eventOnlyProfiles/);
  assert.match(connector, /event_notice_consent/);
  assert.match(types, /category: 'events'/);
  assert.match(types, /name: 'ATL Event Registrants'/);
  assert.match(types, /event_titles/);
  assert.match(types, /event_statuses/);
  assert.match(app, /event_registrations: p\.event_registrations/);
});

test('Reports provides event filters, attendee drill-down, and CSV', () => {
  const reports = read('pages/Reports.tsx');
  const panel = read('components/EventRegistrationPanel.tsx');

  assert.match(reports, /id: 'events', label: 'Events'/);
  assert.match(reports, /<EventRegistrationPanel/);
  assert.match(panel, /Filter registrations by event/);
  assert.match(panel, /Filter registrations by status/);
  assert.match(panel, /role="dialog"/);
  assert.match(panel, /downloadRows/);
});

test('Campaign Builder separates event consent from newsletter consent', () => {
  const builder = read('pages/CampaignBuilder.tsx');

  assert.match(builder, /isEventAudienceSegment/);
  assert.match(builder, /event_notice_consent === true/);
  assert.match(builder, /matchesEvent && eventEligible/);
  assert.match(builder, /Event registration consent must not be reused for general marketing/);
});
