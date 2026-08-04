import { Lead } from '../../types';

const COLUMNS = [
  'first_name',
  'last_name',
  'email',
  'phone',
  'stage',
  'status',
  'source',
  'estimated_value',
  'next_action_at',
  'created_at',
  'notes',
] as const;

function csvCell(value: unknown): string {
  const text = value == null ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function buildLeadCsv(leads: Lead[]): string {
  const rows = leads.map(lead => [
    lead.profile?.first_name,
    lead.profile?.last_name,
    lead.profile?.email,
    lead.profile?.phone,
    lead.stage,
    lead.status,
    lead.source,
    lead.estimated_value,
    lead.next_action_at,
    lead.created_at,
    lead.notes,
  ].map(csvCell).join(','));
  return `\uFEFF${COLUMNS.join(',')}\r\n${rows.join('\r\n')}${rows.length ? '\r\n' : ''}`;
}
