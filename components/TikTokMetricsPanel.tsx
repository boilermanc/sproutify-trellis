import React, { useEffect, useState } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import { tiktokMetrics, TikTokMetricsResult } from '../services/tiktokMetricsService';

interface Props { branchId: string; branchName: string; addToast?: (message: string, type?: 'success' | 'error' | 'info') => void; request?: typeof tiktokMetrics; }
const number = (value: number | null) => value == null ? '—' : value.toLocaleString();
export default function TikTokMetricsPanel({ branchId, branchName, addToast, request = tiktokMetrics }: Props) {
  const [result, setResult] = useState<TikTokMetricsResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [url, setUrl] = useState('');
  useEffect(() => {
    let active = true;
    if (!branchId) return;
    setBusy(true);
    request<TikTokMetricsResult>('list', branchId)
      .then(data => { if (active) setResult(data); })
      .catch(e => { if (active) setError(e.message); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [branchId, request]);
  async function run(action: 'sync' | 'track' | 'list') {
    setBusy(true); setError('');
    try {
      if (action !== 'list') {
        const response = await request<{ refreshed?: number; unavailable?: number }>(action, branchId, url);
        if (action === 'track') setUrl('');
        addToast?.(action === 'track' ? 'TikTok post assigned and metrics saved.' : `${response.refreshed || 0} posts refreshed; ${response.unavailable || 0} unavailable.`, 'success');
      }
      setResult(await request<TikTokMetricsResult>('list', branchId));
    } catch (e) { const message = e instanceof Error ? e.message : 'Metrics request failed'; setError(message); addToast?.(message, 'error'); }
    finally { setBusy(false); }
  }
  return <section className="bg-white border border-slate-200 rounded-[2rem] p-6 space-y-4" aria-label="TikTok metrics">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="font-black uppercase tracking-tight text-slate-900">TikTok performance</h2>
        <p className="text-sm text-slate-500">{branchName || 'Choose a branch'} · Read-only metrics. Automatic publishing stays off.</p></div>
      <button type="button" disabled={busy || !branchId} onClick={() => run(result?.ready ? 'sync' : 'list')} className="px-4 py-2 rounded-xl border text-sm font-bold disabled:opacity-50 flex items-center gap-2"><RefreshCw size={15} className={busy ? 'animate-spin' : ''}/>{result?.ready ? 'Sync metrics' : 'Check connection'}</button>
    </div>
    {!branchId ? <p className="text-sm">Choose Home or Farm above to track its posts.</p> : <>
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
      {result?.permission_error && <p className="text-sm bg-amber-50 text-amber-900 p-3 rounded-xl">{result.permission_error} For a shared account, reconnect its owner branch. Existing metrics are retained.</p>}
      <p className="text-xs text-slate-500">Assign each published video once to the branch it promotes. Sharing a TikTok account does not share or duplicate post results.</p>
      <form onSubmit={e => { e.preventDefault(); void run('track'); }} className="flex flex-wrap gap-2">
        <label className="flex-1 min-w-0 text-xs font-bold">Published TikTok URL
          <input aria-label="Published TikTok URL" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://www.tiktok.com/@sproutifytheapp/video/…" className="block w-full mt-1 p-3 border rounded-xl text-sm font-normal" disabled={busy}/>
        </label>
        <button type="submit" disabled={busy || !result?.ready || !url.trim()} className="self-end bg-emerald-700 text-white px-4 py-3 rounded-xl font-bold text-sm disabled:opacity-50">Track for {branchName}</button>
      </form>
      {busy && <p role="status" className="text-sm text-slate-500">Loading TikTok metrics…</p>}
      {result && !result.posts.length && <p className="text-sm text-slate-500">No TikTok posts tracked for this branch yet. Paste a public post URL above after connecting read access.</p>}
      {!!result?.posts.length && <div className="overflow-x-auto"><table className="w-full text-sm text-left"><thead><tr>{['Post', 'Views', 'Likes', 'Comments', 'Shares', 'Last synced'].map(label => <th key={label} className="p-3 whitespace-nowrap">{label}</th>)}</tr></thead>
        <tbody>{result.posts.map(post => <tr key={post.id} className="border-t"><td className="p-3 min-w-48 max-w-xs"><a className="font-bold text-emerald-800 inline-flex gap-1" href={post.share_url || `https://www.tiktok.com/player/v1/${post.video_id}`} target="_blank" rel="noreferrer">{post.caption || post.video_id}<ExternalLink size={14} className="shrink-0"/></a>{post.last_error && <p className="text-amber-800 text-xs mt-1">{post.last_error}</p>}</td>{[post.views,post.likes,post.comments,post.shares].map((value,index) => <td key={index} className="p-3">{number(value)}</td>)}<td className="p-3">{post.last_synced_at ? new Date(post.last_synced_at).toLocaleString() : 'Not synced'}</td></tr>)}</tbody></table></div>}
      {result && result.posts.length >= result.limit && <p className="text-xs">Showing the latest {result.limit} tracked posts.</p>}
      <p className="text-xs text-slate-500">Counts are lifetime totals at the last sync, not unique reach. “—” means unavailable. Watch time, retention and website clicks are not provided by this integration. Daily snapshots are stored for future trend reports.</p>
    </>}
  </section>;
}
