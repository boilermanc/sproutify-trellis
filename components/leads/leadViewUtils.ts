import { Lead } from '../../types';

export interface FollowUpWindow {
  endOfToday: number;
  endOfNextSevenDays: number;
}

export function getFollowUpWindow(now = new Date()): FollowUpWindow {
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const endOfNextSevenDays = new Date(endOfToday);
  endOfNextSevenDays.setDate(endOfNextSevenDays.getDate() + 7);
  return { endOfToday: endOfToday.getTime(), endOfNextSevenDays: endOfNextSevenDays.getTime() };
}

export function followUpState(
  lead: Pick<Lead, 'status' | 'next_action_at'>,
  window = getFollowUpWindow()
): 'overdue' | 'upcoming' | null {
  if (lead.status !== 'open' || !lead.next_action_at) return null;
  const timestamp = new Date(lead.next_action_at).getTime();
  if (!Number.isFinite(timestamp) || timestamp > window.endOfNextSevenDays) return null;
  return timestamp <= window.endOfToday ? 'overdue' : 'upcoming';
}

export function sortFollowUps(leads: Lead[]): Lead[] {
  return [...leads].sort((left, right) => (
    new Date(left.next_action_at || 0).getTime() - new Date(right.next_action_at || 0).getTime()
  ));
}
