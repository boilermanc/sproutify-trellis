import React, { useEffect, useRef, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { XDailySnapshot, XTrackedPost, XTrackingResult } from '../types';
import { xTracking } from '../services/xTrackingService';

const metricLabels = [
  ['impression_count', 'Impressions'], ['like_count', 'Likes'], ['reply_count', 'Replies'],
  ['retweet_count', 'Reposts'], ['quote_count', 'Quotes'], ['bookmark_count', 'Bookmarks'],
];
const number = (value?: number | null) => value == null ? '—' : value.toLocaleString();
const button = 'px-4 py-2 min-h-11 rounded-xl border border-slate-300 text-sm font-bold disabled:opacity-50';
interface Props { addToast?: (message: string, type?: 'success' | 'error' | 'info') => void; request?: typeof xTracking; }

function PostCard({ post, projects, busy, save, request }: {
  key?: string; post: XTrackedPost; projects: XTrackingResult['projects']; busy: boolean;
  save: (action: 'tag' | 'status', params: Record<string, unknown>) => Promise<void>; request: typeof xTracking;
}) {
  const [tags, setTags] = useState(post.project_tags);
  const [history, setHistory] = useState<XDailySnapshot[] | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => { setTags(post.project_tags); }, [post.project_tags]);
  const dirty = [...tags].sort().join(',') !== [...post.project_tags].sort().join(',');
  async function loadHistory() {
    if (history) { setHistory(null); return; }
    setLoading(true); setError('');
    try { setHistory((await request<{ snapshots: XDailySnapshot[] }>('history', { id: post.id })).snapshots); }
    catch (e) { setError(e instanceof Error ? e.message : 'Could not load daily metrics.'); }
    finally { setLoading(false); }
  }
  return <article className="border border-slate-200 rounded-2xl p-4 sm:p-6 space-y-4 bg-white">
    <div className="flex justify-between flex-wrap gap-2 text-xs text-slate-500">
      <span>{post.is_own ? '@boilermanc' : 'Mention of @boilermanc'} · {new Date(post.published_at).toLocaleString()}</span>
      <a href={`https://x.com/i/web/status/${post.post_id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-emerald-800 font-bold">View on X <ExternalLink size={14}/></a>
    </div>
    <p className="whitespace-pre-wrap break-words text-slate-800">{post.text}</p>
    <dl className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {metricLabels.map(([key, label]) => <div key={key}><dt className="text-xs text-slate-500">{label}</dt><dd className="font-black text-lg">{number(post.metrics[key])}</dd></div>)}
    </dl>
    <fieldset disabled={busy} className="space-y-2">
      <legend className="text-sm font-bold">Project tags</legend>
      <div className="flex flex-wrap gap-2">{projects.map(project => <label key={project.id} className="inline-flex items-center gap-2 border rounded-lg px-3 py-2 text-sm cursor-pointer">
        <input type="checkbox" checked={tags.includes(project.id)} onChange={e => setTags(current => e.target.checked ? [...current, project.id] : current.filter(id => id !== project.id))}/>{project.name}
      </label>)}</div>
      {!tags.length && <p className="text-xs text-slate-500">Unassigned — select one or more projects.</p>}
      <button className={button} disabled={busy || !dirty} onClick={() => save('tag', { id: post.id, tags })}>Save tags</button>
    </fieldset>
    <div className="flex flex-wrap gap-2">
      <button className={button} disabled={loading} onClick={loadHistory}>{loading ? 'Loading…' : history ? 'Hide daily metrics' : 'Daily metrics'}</button>
      {post.is_mention && <button className={button} disabled={busy} onClick={() => save('status', { id: post.id, status: post.mention_status === 'new' ? 'done' : 'new' })}>{post.mention_status === 'new' ? 'Mark handled' : 'Reopen mention'}</button>}
    </div>
    {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    {history && <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Daily metrics history">
      {!history.length ? <p className="text-sm text-slate-500">No snapshots recorded yet.</p> : <table className="w-full text-sm text-left"><caption className="text-left text-xs text-slate-500 pb-2">Daily snapshots (UTC) · lifetime totals at capture time, not daily gains</caption><thead><tr><th className="p-2">Date</th>{metricLabels.map(([key, label]) => <th key={key} className="p-2">{label}</th>)}</tr></thead>
        <tbody>{history.map(row => <tr key={row.snapshot_date} className="border-t"><td className="p-2 whitespace-nowrap">{row.snapshot_date}</td>{metricLabels.map(([key]) => <td key={key} className="p-2">{number(row.metrics[key])}</td>)}</tr>)}</tbody></table>}
    </div>}
    <p className="text-xs text-slate-500">Captured {new Date(post.last_synced_at).toLocaleString()}{post.last_error ? ` · ${post.last_error}` : ''}</p>
  </article>;
}

export default function XTrackingPanel({ addToast, request = xTracking }: Props) {
  const [result, setResult] = useState<XTrackingResult | null>(null);
  const [kind, setKind] = useState<'posts' | 'mentions'>('posts');
  const [project, setProject] = useState('');
  const [unread, setUnread] = useState(false);
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    request<XTrackingResult>('list', { kind, project, unread, page })
      .then(data => { if (active) setResult(data); })
      .catch(e => { if (active) { setResult(null); setError(e.message); } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [request, kind, project, unread, page, revision]);
  async function run(action: 'sync' | 'tag' | 'status', params: Record<string, unknown> = {}) {
    setBusy(true); setError(''); setNotice('');
    try {
      const response = await request<{ collected?: number; refreshed?: number; unavailable?: number }>(action, params);
      if (!mounted.current) return;
      const message = action === 'sync' ? `${response.collected || 0} posts/mentions collected; ${response.refreshed || 0} daily metrics refreshed.${response.unavailable ? ` ${response.unavailable} unavailable.` : ''}` : action === 'tag' ? 'Project tags saved.' : 'Mention status saved.';
      setNotice(message); addToast?.(message, 'success'); setRevision(value => value + 1);
    } catch (e) {
      if (!mounted.current) return;
      const message = e instanceof Error ? e.message : 'X tracking request failed.';
      setError(message); addToast?.(message, 'error');
    } finally { if (mounted.current) setBusy(false); }
  }
  async function connect() {
    // Open synchronously during the gesture so browser popup blockers do not
    // discard the OAuth window while we request its one-time authorization URL.
    const popup = window.open('about:blank', 'trellis_shared_x', 'width=600,height=750');
    if (!popup) { setError('Allow popups for Trellis, then connect again.'); return; }
    popup.opener = null;
    setBusy(true); setError('');
    try {
      const data = await request<{ url: string }>('connect');
      const url = new URL(data.url);
      if (url.origin !== 'https://x.com' || url.pathname !== '/i/oauth2/authorize') throw new Error('Invalid X authorization URL.');
      popup.location.href = url.href;
      if (mounted.current) setNotice('Complete authorization as @boilermanc, then select Refresh here.');
    } catch (e) { popup.close(); if (mounted.current) setError(e instanceof Error ? e.message : 'Could not connect X.'); }
    finally { if (mounted.current) setBusy(false); }
  }
  return <section aria-label="Shared X tracking" className="space-y-5">
    <div className="bg-white border border-slate-200 rounded-[2rem] p-5 sm:p-8 space-y-4">
      <div className="flex flex-wrap justify-between gap-4">
        <div><h2 className="text-2xl font-black uppercase tracking-tight">@boilermanc</h2><p className="text-sm text-slate-500">One shared X account across all projects · Owners and admins</p></div>
        <div className="flex flex-wrap gap-2">
          <button disabled={busy || loading || !result} className={button} onClick={connect}>{result?.account.connected ? 'Reconnect X' : 'Connect @boilermanc'}</button>
          <button disabled={busy || loading} className={`${button} flex items-center gap-2`} onClick={() => setRevision(value => value + 1)}><RefreshCw size={16}/>Refresh</button>
          <button disabled={busy || loading || !result?.account.connected} className={`${button} bg-emerald-700 text-white`} onClick={() => run('sync')}>Sync now</button>
        </div>
      </div>
      <p className="text-sm">{result?.account.connected ? 'Connected' : 'Not connected'} · Last successful sync: {result?.account.last_synced_at ? new Date(result.account.last_synced_at).toLocaleString() : 'Not yet'}</p>
      {result?.account.last_error && <p className="text-sm text-amber-800">{result.account.last_error}</p>}
      <p className="text-xs text-slate-500">Imports the last 30 days initially, then collects new posts and mentions. Own posts refresh daily for their first 30 days. “—” means unavailable. Counts are lifetime totals; impressions are not unique viewers. Click metrics are not included.</p>
      <p className="text-xs text-slate-500">Project tags are manual and can include multiple projects. Changing the global brand selector does not change this shared account.</p>
    </div>
    {error && <p role="alert" className="rounded-xl bg-rose-50 p-4 text-rose-800">{error}</p>}
    {notice && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-emerald-900">{notice}</p>}
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-sm font-bold">Show<select aria-label="Show X posts or mentions" disabled={busy} value={kind} onChange={e => { setKind(e.target.value as typeof kind); setPage(0); }} className="block border rounded-xl p-3 mt-1"><option value="posts">Own posts</option><option value="mentions">Mentions</option></select></label>
      <label className="text-sm font-bold">Project<select aria-label="Filter by project" disabled={busy} value={project} onChange={e => { setProject(e.target.value); setPage(0); }} className="block border rounded-xl p-3 mt-1 max-w-full"><option value="">All projects</option><option value="unassigned">Unassigned</option>{result?.projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      {kind === 'mentions' && <label className="flex gap-2 items-center text-sm p-3"><input type="checkbox" checked={unread} disabled={busy} onChange={e => { setUnread(e.target.checked); setPage(0); }}/>Needs attention only</label>}
    </div>
    {(loading || busy) && <p role="status" className="text-sm text-slate-500">{busy ? 'Working…' : 'Loading X tracking…'}</p>}
    {!loading && result && <>
      <p className="text-sm text-slate-500">{result.total} {kind === 'posts' ? 'posts' : 'mentions'} matching this filter</p>
      {!result.posts.length && <p className="p-6 border border-dashed rounded-2xl text-slate-500">{result.account.connected ? 'Nothing here yet. Sync the account or change your filters.' : 'Connect @boilermanc to start tracking posts and mentions.'}</p>}
      {result.posts.map(post => <PostCard key={post.id} post={post} projects={result.projects} busy={busy} save={run} request={request}/>)}
      <div className="flex gap-3 items-center"><button className={button} disabled={!page || busy} onClick={() => setPage(value => value - 1)}>Previous</button><span className="text-sm">Page {page + 1}</span><button className={button} disabled={(page + 1) * 50 >= result.total || busy} onClick={() => setPage(value => value + 1)}>Next</button></div>
    </>}
  </section>;
}
