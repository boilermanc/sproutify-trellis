import { Lead } from '../../types';

export interface PaginationResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  startItem: number;
  endItem: number;
}

export function paginateItems<T>(items: T[], requestedPage: number, requestedPageSize: number): PaginationResult<T> {
  const pageSize = Math.max(1, Math.floor(requestedPageSize) || 1);
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(Math.max(1, Math.floor(requestedPage) || 1), totalPages);
  const startIndex = (page - 1) * pageSize;

  return {
    items: items.slice(startIndex, startIndex + pageSize),
    page,
    pageSize,
    totalItems,
    totalPages,
    startItem: totalItems === 0 ? 0 : startIndex + 1,
    endItem: Math.min(startIndex + pageSize, totalItems),
  };
}

export function leadMatchesSearch(lead: Lead, rawSearch: string): boolean {
  const terms = rawSearch.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;

  const searchableText = [
    lead.profile?.first_name,
    lead.profile?.last_name,
    lead.profile?.email,
    lead.profile?.phone,
    lead.source,
    lead.stage,
    lead.status,
    lead.inquiry_text,
    lead.notes,
    lead.assigned_to,
  ].filter(value => value != null).join(' ').toLowerCase();

  return terms.every(term => searchableText.includes(term));
}

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
