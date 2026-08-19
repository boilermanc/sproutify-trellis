import React, { useEffect, useMemo, useState } from 'react';
import { CalendarDays, Download, Loader2, RefreshCw, TicketCheck, Users, X } from 'lucide-react';
import { BranchContext, SpokeConnection } from '../types';
import {
  EventRegistrationRecord,
  fetchEventAudience,
  isEventNoticeEligibleStatus,
} from '../services/eventAudienceService';

interface Props {
  spokeConnections: SpokeConnection[];
  branchContext?: BranchContext;
}

const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const EventRegistrationPanel: React.FC<Props> = ({ spokeConnections, branchContext }) => {
  const atlConnection = useMemo(() => spokeConnections.find((connection) =>
    connection.status === 'active' && connection.supabase_url.includes('povudgtvzggnxwgtjexa')
  ), [spokeConnections]);
  const atlVisible = !branchContext || branchContext.isAllSelected || branchContext.allBranches.some((branch) =>
    branch.spoke_connection_id === atlConnection?.id && branchContext.activeBranchSlugs.includes(branch.slug)
  );

  const [rows, setRows] = useState<EventRegistrationRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [eventFilter, setEventFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);

  const load = async () => {
    if (!atlConnection || !atlVisible) return;
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchEventAudience(atlConnection.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load event registrations');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [atlConnection?.id, atlVisible]);

  const events = useMemo(() => {
    const grouped = new Map<string, {
      id: string;
      title: string;
      startDate: string | null;
      location: string | null;
      registrations: EventRegistrationRecord[];
    }>();
    for (const row of rows) {
      const existing = grouped.get(row.event_id) || {
        id: row.event_id,
        title: row.event?.title || 'Untitled event',
        startDate: row.event?.start_date || null,
        location: row.event?.location || null,
        registrations: [],
      };
      existing.registrations.push(row);
      grouped.set(row.event_id, existing);
    }
    return [...grouped.values()].sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''));
  }, [rows]);

  const statuses = useMemo(() => [...new Set(rows.map((row) => row.status))].sort(), [rows]);
  const filteredRows = useMemo(() => rows.filter((row) =>
    (eventFilter === 'all' || row.event_id === eventFilter)
    && (statusFilter === 'all' || row.status === statusFilter)
  ), [rows, eventFilter, statusFilter]);
  const selectedEvent = events.find((event) => event.id === selectedEventId) || null;
  const uniquePeople = new Set(rows.map((row) => row.email)).size;
  const eligiblePeople = new Set(rows.filter((row) => isEventNoticeEligibleStatus(row.status)).map((row) => row.email)).size;
  const paidRegistrations = rows.filter((row) => row.status === 'paid').length;

  const downloadRows = (downloadRows: EventRegistrationRecord[], label: string) => {
    const header = ['Name', 'Email', 'Event', 'Event date', 'Status', 'Quantity', 'Amount paid', 'Registered at'];
    const body = downloadRows.map((row) => [
      row.name,
      row.email,
      row.event?.title || '',
      row.event?.start_date || '',
      row.status,
      row.quantity,
      row.amount_paid ?? '',
      row.created_at,
    ]);
    const csv = [header, ...body].map((line) => line.map(csvCell).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `atl-event-registrations-${label}-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (!atlVisible) {
    return <div className="rounded-[2rem] border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-500">Select ATL Urban Farms or All Branches to view event registrations.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-[2rem] border border-slate-200 bg-white p-6">
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-black text-slate-800"><CalendarDays className="text-teal-600" size={20} /> ATL Event Registrations</h2>
            <p className="mt-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">Live, read-only data from the ATL spoke</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => downloadRows(filteredRows, 'filtered')} disabled={filteredRows.length === 0} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-600 disabled:opacity-40"><Download size={14} /> CSV</button>
            <button type="button" onClick={load} disabled={loading || !atlConnection} className="rounded-xl border border-slate-200 p-2 text-slate-500 disabled:opacity-40" aria-label="Refresh event registrations">{loading ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}</button>
          </div>
        </div>

        {!atlConnection ? (
          <div className="rounded-2xl bg-amber-50 p-5 text-sm font-bold text-amber-700">ATL Urban Farms does not have an active spoke connection.</div>
        ) : error ? (
          <div className="rounded-2xl bg-rose-50 p-5 text-sm font-bold text-rose-700">{error}</div>
        ) : loading && rows.length === 0 ? (
          <div className="flex justify-center gap-2 py-12 text-sm text-slate-400"><Loader2 className="animate-spin" size={18} /> Loading event audience…</div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: 'Unique people', value: uniquePeople, icon: Users },
                { label: 'Notice eligible', value: eligiblePeople, icon: TicketCheck },
                { label: 'Events represented', value: events.length, icon: CalendarDays },
                { label: 'Paid registrations', value: paidRegistrations, icon: TicketCheck },
              ].map((card) => <div key={card.label} className="rounded-2xl border border-slate-100 bg-slate-50 p-4"><card.icon size={15} className="mb-2 text-teal-600" /><p className="text-2xl font-black text-slate-800">{card.value}</p><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{card.label}</p></div>)}
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <select value={eventFilter} onChange={(event) => setEventFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700" aria-label="Filter registrations by event"><option value="all">All events</option>{events.map((event) => <option key={event.id} value={event.id}>{event.title}</option>)}</select>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700" aria-label="Filter registrations by status"><option value="all">All statuses</option>{statuses.map((status) => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}</select>
            </div>
          </>
        )}
      </div>

      {events.length > 0 && (
        <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white">
          <div className="border-b border-slate-100 p-5"><h3 className="text-sm font-black uppercase tracking-tight text-slate-800">Events</h3></div>
          <div className="divide-y divide-slate-100">
            {events.map((event) => (
              <button key={event.id} type="button" onClick={() => setSelectedEventId(event.id)} className="grid w-full gap-2 p-5 text-left hover:bg-slate-50 sm:grid-cols-[1fr_auto] sm:items-center">
                <div><p className="font-bold text-slate-800">{event.title}</p><p className="text-xs text-slate-500">{event.startDate ? new Date(`${event.startDate}T12:00:00`).toLocaleDateString() : 'Date not set'}{event.location ? ` · ${event.location}` : ''}</p></div>
                <div className="text-left sm:text-right"><p className="text-xl font-black text-teal-700">{event.registrations.length}</p><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">registrations · view people</p></div>
              </button>
            ))}
          </div>
        </div>
      )}

      {filteredRows.length > 0 && <p className="text-center text-[10px] font-bold uppercase tracking-widest text-slate-400">{filteredRows.length} registration records match the current filters</p>}

      {selectedEvent && (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-slate-900/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={`${selectedEvent.title} registrations`}>
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-[2rem] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-5"><div><h3 className="font-black text-slate-800">{selectedEvent.title}</h3><p className="text-xs text-slate-500">{selectedEvent.registrations.length} registration records</p></div><div className="flex gap-2"><button type="button" onClick={() => downloadRows(selectedEvent.registrations, selectedEvent.id)} className="rounded-xl border border-slate-200 p-2 text-slate-500" aria-label="Download event registrations"><Download size={16} /></button><button type="button" onClick={() => setSelectedEventId(null)} className="rounded-xl bg-slate-100 p-2 text-slate-500" aria-label="Close event registrations"><X size={17} /></button></div></div>
            <div className="overflow-y-auto divide-y divide-slate-100 p-5">{selectedEvent.registrations.map((row) => <div key={row.id} className="grid gap-1 py-3 sm:grid-cols-[1fr_auto] sm:items-center"><div><p className="font-bold text-slate-800">{row.name || row.email}</p>{row.name && <p className="text-xs text-slate-500">{row.email}</p>}</div><div className="text-xs font-bold text-slate-500 sm:text-right"><p className="capitalize">{row.status.replace(/_/g, ' ')}</p><p>{new Date(row.created_at).toLocaleDateString()}</p></div></div>)}</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EventRegistrationPanel;
