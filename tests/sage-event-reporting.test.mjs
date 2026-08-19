import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Sage routes event questions to the protected live ATL event feed', () => {
  const chat = read('components/SageChat.tsx');
  const service = read('services/sageEventReportingService.ts');

  assert.match(chat, /answerEventRegistrationQuestion/);
  assert.match(chat, /povudgtvzggnxwgtjexa/);
  assert.match(chat, /How many people registered for ATL events/);
  assert.match(service, /fetchEventAudience\(connectionId\)/);
  assert.match(service, /I won’t guess/);
  assert.doesNotMatch(service, /chatWithSage|generateText/);
});

test('Sage event answers support counts, attendee lists, status, newsletter, and order filters', () => {
  const service = read('services/sageEventReportingService.ts');

  assert.match(service, /uniqueByEmail/);
  assert.match(service, /profileHasAtlNewsletterConsent/);
  assert.match(service, /profileHasOrdered/);
  assert.match(service, /row\.status === 'paid'/);
  assert.match(service, /formatPeople/);
});

test('Sage can save a consent-safe event-specific segment', () => {
  const service = read('services/sageEventReportingService.ts');
  const segments = read('Segments.tsx');

  assert.match(service, /trellis_custom_segments/);
  assert.match(service, /field: 'event_titles'/);
  assert.match(service, /field: 'event_notice_consent'/);
  assert.match(service, /trellis:segments-updated/);
  assert.match(segments, /trellis:segments-updated/);
});
