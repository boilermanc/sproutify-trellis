import { Profile } from '../types';
import { Segment } from '../segmentTypes';
import {
  EventRegistrationRecord,
  fetchEventAudience,
  isEventNoticeEligibleStatus,
} from './eventAudienceService';

const EVENT_WORDS = /\b(event|events|workshop|greenhouse|registration|registrations|registered|registrant|registrants|attendee|attendees|pre[- ]?registered)\b/i;
const CREATE_AUDIENCE_WORDS = /\b(create|make|build|save)\b.*\b(audience|segment)\b|\b(audience|segment)\b.*\b(create|make|build|save)\b/i;
const GENERIC_TITLE_WORDS = new Set(['event', 'events', 'evening', 'the', 'workshop', 'atl', 'urban', 'farms', 'gardening']);

export const isEventRegistrationQuestion = (text: string): boolean => EVENT_WORDS.test(text);

const normalizedEmail = (value: string | null | undefined) => String(value || '').trim().toLowerCase();

const uniqueByEmail = (rows: EventRegistrationRecord[]): EventRegistrationRecord[] => {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const email = normalizedEmail(row.email);
    if (!email || seen.has(email)) return false;
    seen.add(email);
    return true;
  });
};

const eventLabel = (row: EventRegistrationRecord) => row.event?.title || 'Untitled event';

const findRequestedEvent = (text: string, rows: EventRegistrationRecord[]): EventRegistrationRecord['event'] | null => {
  const normalized = text.toLowerCase();
  const events = [...new Map(rows.filter((row) => row.event).map((row) => [row.event_id, row.event!])).values()];
  return events.find((event) => {
    const fullTitle = event.title.toLowerCase();
    if (normalized.includes(fullTitle)) return true;
    const distinctiveWords = fullTitle.split(/[^a-z0-9]+/).filter((word) => word.length >= 4 && !GENERIC_TITLE_WORDS.has(word));
    return distinctiveWords.some((word) => normalized.includes(word));
  }) || null;
};

const profileHasAtlNewsletterConsent = (profile: Profile | undefined): boolean => {
  if (!profile) return false;
  const atlConsent = Object.entries(profile.branch_consent || {}).find(([slug]) =>
    slug.toLowerCase().replace(/[^a-z0-9]/g, '').includes('atlurbanfarms')
  )?.[1];
  return atlConsent ? atlConsent.subscribed && !atlConsent.paused : profile.is_subscribed && !profile.marketing_pause;
};

const profileHasOrdered = (profile: Profile | undefined): boolean => {
  if (!profile) return false;
  return Number(profile.metadata?.order_stats?.order_count || 0) > 0 || Number(profile.ltv || 0) > 0;
};

const formatPeople = (rows: EventRegistrationRecord[], profilesByEmail: Map<string, Profile>): string => {
  const people = uniqueByEmail(rows).slice(0, 25).map((row) => {
    const profile = profilesByEmail.get(normalizedEmail(row.email));
    const profileName = profile ? [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim() : '';
    const name = row.name || profileName;
    return `- ${name ? `${name} — ` : ''}${row.email}`;
  });
  const remaining = uniqueByEmail(rows).length - people.length;
  return `${people.join('\n')}${remaining > 0 ? `\n…and ${remaining.toLocaleString()} more.` : ''}`;
};

const saveEventSegment = (event: NonNullable<EventRegistrationRecord['event']>): { created: boolean; name: string } => {
  const key = 'trellis_custom_segments';
  const segmentId = `sage-event-${event.id}`;
  const now = new Date().toISOString();
  const name = `ATL Event — ${event.title}`;
  const existing = JSON.parse(localStorage.getItem(key) || '[]') as Segment[];
  if (existing.some((segment) => segment.id === segmentId)) return { created: false, name };

  const segment: Segment = {
    id: segmentId,
    name,
    description: `People eligible for notices about ${event.title}`,
    icon: 'calendar',
    color: 'teal',
    kind: 'rules',
    is_preset: false,
    rule_groups: [{
      id: `${segmentId}-group`,
      join: 'AND',
      rules: [
        { id: `${segmentId}-event`, field: 'event_titles', operator: 'contains', value: event.title },
        { id: `${segmentId}-consent`, field: 'event_notice_consent', operator: 'is_true', value: true },
      ],
    }],
    created_at: now,
    updated_at: now,
  };
  localStorage.setItem(key, JSON.stringify([...existing, segment]));
  window.dispatchEvent(new CustomEvent('trellis:segments-updated'));
  return { created: true, name };
};

export async function answerEventRegistrationQuestion(
  text: string,
  connectionId: string | null,
  profiles: Profile[],
): Promise<string | null> {
  if (!isEventRegistrationQuestion(text)) return null;
  if (!connectionId) return 'I can answer that from live data once the ATL Urban Farms spoke connection is active.';

  let rows: EventRegistrationRecord[];
  try {
    rows = await fetchEventAudience(connectionId);
  } catch {
    return 'I couldn’t read the live ATL event registrations, so I won’t guess. Open Reports → Events or retry here.';
  }
  if (rows.length === 0) return 'I found no ATL event registration records in the live spoke.';

  const requestedEvent = findRequestedEvent(text, rows);
  const availableEvents = [...new Set(rows.map(eventLabel))];

  let selectedRows = requestedEvent ? rows.filter((row) => row.event_id === requestedEvent.id) : rows;
  const normalized = text.toLowerCase();
  if (/\bpaid\b/.test(normalized)) selectedRows = selectedRows.filter((row) => row.status === 'paid');
  else if (/\bpending\b/.test(normalized)) selectedRows = selectedRows.filter((row) => row.status.includes('pending'));
  else if (/\bpre[- ]?registered\b/.test(normalized)) selectedRows = selectedRows.filter((row) => row.status === 'pre_registered');
  else if (/\b(cancelled|canceled|refunded)\b/.test(normalized)) selectedRows = selectedRows.filter((row) => /cancelled|canceled|refunded/.test(row.status));
  else if (/\beligible\b/.test(normalized)) selectedRows = selectedRows.filter((row) => isEventNoticeEligibleStatus(row.status));

  const profilesByEmail = new Map(profiles.map((profile) => [normalizedEmail(profile.email), profile]));
  if (/\b(not|isn['’]?t|aren['’]?t|without)\b.*\b(newsletter|subscribed|subscriber)\b|\bnewsletter\b.*\b(not|isn['’]?t|aren['’]?t|without)\b/i.test(text)) {
    selectedRows = selectedRows.filter((row) => !profileHasAtlNewsletterConsent(profilesByEmail.get(normalizedEmail(row.email))));
  }
  if (/\b(ordered|order|bought|purchased|customer)\b/i.test(text)) {
    selectedRows = selectedRows.filter((row) => profileHasOrdered(profilesByEmail.get(normalizedEmail(row.email))));
  }

  if (CREATE_AUDIENCE_WORDS.test(text)) {
    if (!requestedEvent) return `Name the event you want the audience for. I can see ${availableEvents.map((title) => `“${title}”`).join(' and ')}.`;
    try {
      const saved = saveEventSegment(requestedEvent);
      const count = uniqueByEmail(rows.filter((row) => row.event_id === requestedEvent.id && isEventNoticeEligibleStatus(row.status))).length;
      return `${saved.created ? 'Created' : 'You already have'} the segment “${saved.name}” with ${count.toLocaleString()} event-eligible ${count === 1 ? 'person' : 'people'}. It is available in Segments and Campaign Builder.`;
    } catch {
      return 'I found the event, but I couldn’t save the audience in this browser. Open Segments and use Registered Event plus Event Notice Consent.';
    }
  }

  const uniquePeople = uniqueByEmail(selectedRows);
  const scope = requestedEvent ? ` for “${requestedEvent.title}”` : ' across ATL events';
  const asksWho = /\b(who|names?|people|attendees?|registrants?)\b/i.test(text);
  if (asksWho) {
    if (uniquePeople.length === 0) return `I found 0 matching people${scope}.`;
    return `${uniquePeople.length.toLocaleString()} ${uniquePeople.length === 1 ? 'person matches' : 'people match'}${scope}:\n\n${formatPeople(selectedRows, profilesByEmail)}\n\nThis comes from the live ATL event-registration feed.`;
  }

  if (requestedEvent || /\b(how many|count|total|registered|paid|pending|eligible)\b/i.test(text)) {
    return `${uniquePeople.length.toLocaleString()} unique ${uniquePeople.length === 1 ? 'person matches' : 'people match'}${scope} (${selectedRows.length.toLocaleString()} registration ${selectedRows.length === 1 ? 'record' : 'records'}).`;
  }

  const byEvent = availableEvents.map((title) => {
    const eventRows = rows.filter((row) => eventLabel(row) === title);
    return `- “${title}” — ${uniqueByEmail(eventRows).length.toLocaleString()} people`;
  });
  return `${uniqueByEmail(rows).length.toLocaleString()} unique people have registered across ${availableEvents.length.toLocaleString()} ATL events:\n\n${byEvent.join('\n')}`;
}
