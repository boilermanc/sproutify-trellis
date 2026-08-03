import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  RotateCw,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { WEBHOOK_SPECS } from '../constants';
import {
  DEFAULT_POSTHOG_EVENTS,
  DEFAULT_POSTHOG_PROPERTIES,
  deletePosthogConnection,
  fetchPosthogConnections,
  rotatePosthogWebhookSecret,
  savePosthogConnection,
  testPosthogConnection,
} from '../services/posthogService';
import { Branch, PostHogConnection } from '../types';

interface Props {
  branches: Branch[];
}

const csv = (values: string[]) => values.join(', ');
const parseCsv = (value: string) => [...new Set(value.split(',').map(item => item.trim()).filter(Boolean))];
const displayDate = (value?: string | null) => value ? new Date(value).toLocaleString() : 'Never';

const PostHogConnectionsPanel: React.FC<Props> = ({ branches }) => {
  const [connections, setConnections] = useState<PostHogConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [webhookSetup, setWebhookSetup] = useState<{ connection: PostHogConnection; secret: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [form, setForm] = useState({
    branch_id: '',
    host_url: 'https://us.posthog.com',
    project_id: '',
    api_key: '',
    allowed_events: csv(DEFAULT_POSTHOG_EVENTS),
    allowed_properties: csv(DEFAULT_POSTHOG_PROPERTIES),
  });

  const load = async () => {
    setLoading(true);
    setError(null);
    try { setConnections(await fetchPosthogConnections()); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not load PostHog connections'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const availableBranches = useMemo(() => {
    const connected = new Set(connections.filter(connection => connection.id !== editingId).map(connection => connection.branch_id));
    return branches.filter(branch => branch.is_active && !connected.has(branch.id));
  }, [branches, connections, editingId]);

  const resetForm = () => {
    setEditingId(null);
    setForm({
      branch_id: '',
      host_url: 'https://us.posthog.com',
      project_id: '',
      api_key: '',
      allowed_events: csv(DEFAULT_POSTHOG_EVENTS),
      allowed_properties: csv(DEFAULT_POSTHOG_PROPERTIES),
    });
    setShowForm(false);
  };

  const edit = (connection: PostHogConnection) => {
    setEditingId(connection.id);
    setForm({
      branch_id: connection.branch_id,
      host_url: connection.host_url,
      project_id: connection.project_id,
      api_key: '',
      allowed_events: csv(connection.allowed_events),
      allowed_properties: csv(connection.allowed_properties),
    });
    setShowForm(true);
  };

  const save = async () => {
    if (!form.branch_id || !form.project_id || (!editingId && !form.api_key)) return;
    setBusy('save');
    setError(null);
    try {
      const result = await savePosthogConnection({
        branch_id: form.branch_id,
        host_url: form.host_url,
        project_id: form.project_id,
        api_key: form.api_key || undefined,
        allowed_events: parseCsv(form.allowed_events),
        allowed_properties: parseCsv(form.allowed_properties),
      });
      if (result.webhook_secret) setWebhookSetup({ connection: result.connection, secret: result.webhook_secret });
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save PostHog connection');
    } finally { setBusy(null); }
  };

  const test = async (connection: PostHogConnection) => {
    setBusy(`test:${connection.id}`);
    setError(null);
    try { await testPosthogConnection(connection.id); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Connection test failed'); await load(); }
    finally { setBusy(null); }
  };

  const rotate = async (connection: PostHogConnection) => {
    setBusy(`rotate:${connection.id}`);
    setError(null);
    try {
      const secret = await rotatePosthogWebhookSecret(connection.id);
      setWebhookSetup({ connection, secret });
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not rotate webhook secret'); }
    finally { setBusy(null); }
  };

  const remove = async (connection: PostHogConnection) => {
    if (!window.confirm(`Disconnect PostHog from ${connection.branch_name || connection.branch_slug}? Cached analytics snapshots will also be removed.`)) return;
    setBusy(`delete:${connection.id}`);
    setError(null);
    try { await deletePosthogConnection(connection.id); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not delete PostHog connection'); }
    finally { setBusy(null); }
  };

  const copy = async (label: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(null), 1800);
  };

  return (
    <section className="rounded-[2rem] border border-violet-200 bg-gradient-to-br from-violet-50 via-white to-amber-50 p-6 space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-violet-600 text-white flex items-center justify-center shadow-lg"><BarChart3 size={23} /></div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">PostHog Product Analytics</h3>
              <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest text-violet-700">Federated</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">Raw events stay in PostHog. Trellis caches aggregates and accepts only approved milestones.</p>
          </div>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-black text-white hover:bg-violet-700"
        >
          <Plus size={15} /> Connect branch
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">
          <AlertTriangle size={15} className="mt-0.5 shrink-0" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8 text-violet-600"><Loader2 size={22} className="animate-spin" /></div>
      ) : connections.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-violet-200 bg-white/70 p-8 text-center">
          <Activity size={30} className="mx-auto mb-3 text-violet-300" />
          <p className="text-sm font-black text-slate-700">No PostHog branches connected</p>
          <p className="mt-1 text-xs text-slate-400">Start with Rejoice, then reuse the same connection contract for each app.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {connections.map(connection => (
            <div key={connection.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {connection.status === 'active'
                      ? <CheckCircle2 size={16} className="text-emerald-500" />
                      : <AlertTriangle size={16} className="text-rose-500" />}
                    <p className="font-black text-slate-800">{connection.branch_name || connection.branch_slug || connection.branch_id}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[8px] font-black uppercase ${connection.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>{connection.status}</span>
                  </div>
                  <p className="mt-1 truncate text-[10px] font-mono text-slate-400">{connection.host_url} · project {connection.project_id} · {connection.api_key_preview}</p>
                  <p className="mt-2 text-[10px] text-slate-500">Last analytics query: <b>{displayDate(connection.last_successful_query_at)}</b> · Last milestone: <b>{displayDate(connection.last_event_at)}</b></p>
                  {connection.last_error && <p className="mt-1 max-w-2xl text-[10px] font-bold text-rose-600">{connection.last_error}</p>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => edit(connection)} className="rounded-lg bg-slate-100 px-3 py-2 text-[10px] font-black text-slate-600 hover:bg-slate-200">Edit</button>
                  <button onClick={() => test(connection)} disabled={busy === `test:${connection.id}`} className="flex items-center gap-1.5 rounded-lg bg-violet-50 px-3 py-2 text-[10px] font-black text-violet-700 hover:bg-violet-100 disabled:opacity-50">
                    {busy === `test:${connection.id}` ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Test
                  </button>
                  <button onClick={() => rotate(connection)} disabled={busy === `rotate:${connection.id}`} className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-[10px] font-black text-amber-700 hover:bg-amber-100 disabled:opacity-50"><RotateCw size={12} /> Webhook key</button>
                  <button onClick={() => remove(connection)} disabled={busy === `delete:${connection.id}`} className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] bg-white p-7 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <div><h3 className="text-lg font-black text-slate-900">{editingId ? 'Edit PostHog connection' : 'Connect PostHog project'}</h3><p className="text-xs text-slate-400">One PostHog project maps to one Trellis branch.</p></div>
              <button onClick={resetForm} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="space-y-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400">
                Branch
                <select value={form.branch_id} disabled={!!editingId} onChange={event => setForm(current => ({ ...current, branch_id: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold normal-case tracking-normal text-slate-800 outline-none focus:border-violet-500 disabled:opacity-60">
                  <option value="">Select a branch</option>
                  {availableBranches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                </select>
              </label>
              <label className="space-y-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400">
                PostHog region
                <select value={form.host_url} onChange={event => setForm(current => ({ ...current, host_url: event.target.value }))} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-bold normal-case tracking-normal text-slate-800 outline-none focus:border-violet-500">
                  <option value="https://us.posthog.com">US Cloud</option>
                  <option value="https://eu.posthog.com">EU Cloud</option>
                </select>
              </label>
              <label className="space-y-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400">
                Project ID
                <input value={form.project_id} onChange={event => setForm(current => ({ ...current, project_id: event.target.value.replace(/\D/g, '') }))} placeholder="12345" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-mono normal-case tracking-normal text-slate-800 outline-none focus:border-violet-500" />
              </label>
              <label className="space-y-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400">
                Personal API key {editingId && '(leave blank to keep current)'}
                <div className="relative"><KeyRound size={14} className="absolute left-3 top-3.5 text-slate-400" /><input type="password" value={form.api_key} onChange={event => setForm(current => ({ ...current, api_key: event.target.value }))} placeholder="phx_…" className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-9 pr-3 text-sm font-mono normal-case tracking-normal text-slate-800 outline-none focus:border-violet-500" /></div>
              </label>
            </div>
            <label className="mt-4 block space-y-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400">
              Approved event names — comma separated
              <textarea value={form.allowed_events} onChange={event => setForm(current => ({ ...current, allowed_events: event.target.value }))} rows={3} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-mono normal-case tracking-normal text-slate-800 outline-none focus:border-violet-500" />
            </label>
            <label className="mt-4 block space-y-1.5 text-[10px] font-black uppercase tracking-widest text-slate-400">
              Approved categorical properties — comma separated
              <textarea value={form.allowed_properties} onChange={event => setForm(current => ({ ...current, allowed_properties: event.target.value }))} rows={2} className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-xs font-mono normal-case tracking-normal text-slate-800 outline-none focus:border-violet-500" />
            </label>
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[10px] font-bold leading-relaxed text-amber-800">Journal, prayer, mood, emotion, faith, free-text, URL, contact, and secret-like properties are always dropped even if entered above.</div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={resetForm} className="rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-black text-slate-600">Cancel</button>
              <button onClick={save} disabled={busy === 'save' || !form.branch_id || !form.project_id || (!editingId && !form.api_key)} className="flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-xs font-black text-white disabled:opacity-50">
                {busy === 'save' ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Test and save
              </button>
            </div>
          </div>
        </div>
      )}

      {webhookSetup && (() => {
        const webhookUrl = `${WEBHOOK_SPECS.posthog_ingest}/${webhookSetup.connection.id}`;
        const header = `Authorization: Bearer ${webhookSetup.secret}`;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
            <div className="w-full max-w-2xl rounded-[2rem] bg-white p-7 shadow-2xl">
              <div className="flex items-start justify-between gap-4"><div><h3 className="text-lg font-black text-slate-900">PostHog webhook setup</h3><p className="mt-1 text-xs text-rose-600 font-bold">This secret is shown once. Copy it before closing.</p></div><button onClick={() => setWebhookSetup(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X size={18} /></button></div>
              {[['Webhook URL', webhookUrl], ['Authorization header', header]].map(([label, value]) => (
                <div key={label} className="mt-4"><p className="mb-1 text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p><div className="flex items-center gap-2 rounded-xl bg-slate-950 p-3"><code className="min-w-0 flex-1 break-all text-[11px] text-emerald-300">{value}</code><button onClick={() => copy(label, value)} className="shrink-0 rounded-lg bg-white/10 p-2 text-white hover:bg-white/20">{copied === label ? <CheckCircle2 size={14} /> : <Copy size={14} />}</button></div></div>
              ))}
              <div className="mt-5 rounded-xl border border-violet-200 bg-violet-50 p-4 text-xs leading-relaxed text-violet-900">In PostHog, create a <b>Webhook destination</b>, add the allowlisted event filter, set the URL and header above, and use the payload template documented in <code>n8n-blueprints/B6-posthog-event-ingest.json</code>.</div>
              <button onClick={() => setWebhookSetup(null)} className="mt-6 w-full rounded-xl bg-violet-600 px-4 py-3 text-xs font-black text-white">I saved the secret</button>
            </div>
          </div>
        );
      })()}
    </section>
  );
};

export default PostHogConnectionsPanel;
