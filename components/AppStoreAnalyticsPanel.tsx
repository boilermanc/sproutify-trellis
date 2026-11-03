import React, { useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw, Smartphone } from 'lucide-react';
import { fetchAppStoreAnalytics, syncAppStoreAnalytics } from '../services/appStoreAnalyticsService';
import { summarizeDownloads } from '../services/appStoreDownloadSummary.mjs';
import { AppStoreAnalyticsResult, BranchContext, BranchInfo } from '../types';

interface Props {
  branches: BranchInfo[]; branchContext?: BranchContext;
  request?: typeof fetchAppStoreAnalytics; syncRequest?: typeof syncAppStoreAnalytics;
}
const APP_CATALOG: Record<string, string> = { '6795955100': 'Rekkrd', '6478242429': 'Sproutify Home', '6754806358': 'Rejoice' };
const number = (value: number | null) => value == null ? '—' : value.toLocaleString();
const AppStoreAnalyticsPanel: React.FC<Props> = ({ branches, branchContext, request = fetchAppStoreAnalytics, syncRequest = syncAppStoreAnalytics }) => {
  const [windowDays, setWindowDays] = useState<7 | 30 | 90>(30);
  const [result, setResult] = useState<AppStoreAnalyticsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [selectedAppleId, setSelectedAppleId] = useState('6795955100');
  const generation = useRef(0);
  const selectedIdRef = useRef<string | undefined>(undefined);
  const selectionEpoch = useRef(0);
  const branchIds = useMemo(() => {
    if (!branchContext || branchContext.isAllSelected) return [];
    return branches.filter(branch => branchContext.activeBranchSlugs.includes(branch.slug)).map(branch => branch.id);
  }, [branches, branchContext]);
  const scope = branchIds.join('|');
  useEffect(() => {
    const current = ++generation.current;
    setLoading(true); setError(''); setResult(null);
    request(windowDays, branchIds).then(data => { if (current === generation.current) setResult(data); })
      .catch(err => { if (current === generation.current) setError(err instanceof Error ? err.message : 'Could not load App Store analytics'); })
      .finally(() => { if (current === generation.current) setLoading(false); });
    return () => { generation.current++; };
  }, [windowDays, scope, request, revision]);
  const apps = result?.apps.filter(app => APP_CATALOG[app.apple_app_id] &&
    (!branchContext || branchContext.isAllSelected || branchIds.includes(app.branch_id))) || [];
  const selectedApp = apps.find(app => app.apple_app_id === selectedAppleId) || apps[0];
  selectedIdRef.current = selectedApp?.id;
  const appName = selectedApp ? APP_CATALOG[selectedApp.apple_app_id] : 'App Store';
  const summary = summarizeDownloads(result?.snapshots.filter(snapshot => snapshot.app_id === selectedApp?.id) || []);
  const latest = summary.daily.at(-1)?.date;
  async function sync() {
    if (!selectedApp) return;
    const current = generation.current;
    const appId = selectedApp.id;
    const epoch = selectionEpoch.current;
    setSyncing(true); setError('');
    try { await syncRequest(appId); if (current === generation.current && selectedIdRef.current === appId && selectionEpoch.current === epoch) setRevision(value => value + 1); }
    catch (err) { if (current === generation.current && selectedIdRef.current === appId && selectionEpoch.current === epoch) setError(err instanceof Error ? err.message : 'Could not sync app downloads'); }
    finally { setSyncing(false); }
  }
  return <section aria-label="App Store downloads" className="rounded-[2rem] border border-slate-200 bg-white p-5 sm:p-7 space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3"><Smartphone className="text-emerald-700"/><div><h2 className="font-black uppercase tracking-tight">{appName}{selectedApp ? ' · App Store' : ' downloads'}</h2><p className="text-xs text-slate-500">Daily downloads from Apple{selectedApp ? ` · Apple ID ${selectedApp.apple_app_id}` : ''}</p></div></div>
      {apps.length > 1 && <label className="text-xs font-bold text-slate-600">App<select aria-label="App Store app" value={selectedApp?.apple_app_id || ''} onChange={event => { selectionEpoch.current++; setSelectedAppleId(event.target.value); setError(''); }} className="ml-2 rounded-xl border border-slate-200 bg-white p-3 text-sm">{apps.map(app => <option key={app.id} value={app.apple_app_id}>{APP_CATALOG[app.apple_app_id]}</option>)}</select></label>}
      <div className="flex flex-wrap gap-2"><div aria-label="Reporting period" className="flex rounded-xl bg-slate-100 p-1">{([7,30,90] as const).map(days => <button type="button" key={days} aria-pressed={windowDays === days} onClick={() => setWindowDays(days)} className={`rounded-lg px-3 py-2 text-xs font-bold ${windowDays === days ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-600'}`}>{days} days</button>)}</div><button type="button" onClick={sync} disabled={loading || syncing || !selectedApp} className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"><RefreshCw size={15} className={syncing ? 'animate-spin' : ''}/>{syncing ? 'Syncing…' : `Sync ${selectedApp ? appName : 'app'}`}</button></div>
    </div>
    {error && <div role="alert" className="rounded-xl bg-rose-50 p-4 text-sm text-rose-800">{error}<button type="button" className="ml-3 underline" onClick={() => setRevision(value => value + 1)}>Try again</button></div>}
    {loading ? <p role="status" className="text-sm text-slate-500">Loading app downloads…</p> : !error && !selectedApp ? <div className="rounded-2xl bg-slate-50 p-6"><p className="font-bold">App Store reporting is not connected in this view.</p><p className="mt-2 text-sm text-slate-500">Select Rekkrd, Sproutify Home, Rejoice, or all branches. If already selected, complete the App Store Connect reporting setup.</p></div> : <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{[['First-time downloads', summary.totals.first], ['Redownloads', summary.totals.redownloads], ['Updates', summary.totals.updates]].map(([label, value]) => <div key={String(label)} className="rounded-2xl bg-slate-50 p-5"><p className="text-2xl font-black text-slate-900">{number(value as number | null)}</p><p className="mt-1 text-xs font-bold text-slate-500">{label}</p></div>)}</div>
      {(selectedApp ? [selectedApp] : []).map(app => <div key={app.id} className="text-sm text-slate-600"><p><span className="font-bold">{app.status === 'pending' ? 'Reports pending' : app.status === 'error' ? 'Sync needs attention' : 'Connected'}</span> · {app.last_synced_at ? `Last successful sync: ${new Date(app.last_synced_at).toLocaleString()}` : 'No successful import yet'}</p>{app.last_error && <p role="alert" className="mt-2 text-rose-700">{app.last_error}</p>}</div>)}
      {!summary.daily.length ? <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">No download report data for this period. New Apple report requests may take 1–2 days. Missing reports are not counted as zero.</p> : <>
        <p className="text-xs text-slate-500">Latest reported date: {latest} · {summary.daily.length} dates reported in this window. Missing dates are not counted as zero.</p>
        <div className="grid gap-6 lg:grid-cols-2"><div><h3 className="mb-3 font-bold">Daily downloads</h3><div className="max-h-80 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Date</th><th className="p-2">First-time</th><th className="p-2">Redownloads</th></tr></thead><tbody>{summary.daily.map(day => <tr key={day.date} className="border-t"><td className="p-2 whitespace-nowrap">{day.date}</td><td className="p-2">{number(day.first)}</td><td className="p-2">{number(day.redownloads)}</td></tr>)}</tbody></table></div></div><div><h3 className="mb-3 font-bold">First-time downloads by country</h3>{!summary.countries.length ? <p className="text-sm text-slate-500">Country breakdown unavailable.</p> : <div className="max-h-80 overflow-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Country / territory</th><th className="p-2">Downloads</th></tr></thead><tbody>{summary.countries.map(([country, count]) => <tr key={country} className="border-t"><td className="p-2">{country}</td><td className="p-2">{number(count)}</td></tr>)}</tbody></table></div>}</div></div>
      </>}
      <p className="text-xs text-slate-500">“—” means unavailable. Updates are separate from new downloads. Recent Apple data may be revised; these aggregate reports do not identify individual users.</p>
    </>}
  </section>;
};
export default AppStoreAnalyticsPanel;
