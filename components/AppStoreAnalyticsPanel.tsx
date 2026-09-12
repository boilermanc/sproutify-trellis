import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Download, Eye, Loader2, RefreshCw, Smartphone, TriangleAlert } from 'lucide-react';
import { fetchAppStoreAnalytics, syncAppStoreAnalytics } from '../services/appStoreAnalyticsService';
import { AppStoreAnalyticsResult, BranchContext, BranchInfo } from '../types';

interface Props { branches: BranchInfo[]; branchContext?: BranchContext }

const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
const sumPreferred = (result: AppStoreAnalyticsResult | null, needles: string[]): number => {
  if (!result) return 0;
  return result.snapshots.reduce((total, snapshot) => {
    const entries = Object.entries(snapshot.metrics);
    for (const needle of needles) {
      const match = entries.find(([key]) => normalize(key) === normalize(needle));
      if (match) return total + Number(match[1] || 0);
    }
    return total;
  }, 0);
};

const AppStoreAnalyticsPanel: React.FC<Props> = ({ branches, branchContext }) => {
  const [windowDays, setWindowDays] = useState<7 | 30 | 90>(30);
  const [result, setResult] = useState<AppStoreAnalyticsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const branchIds = useMemo(() => {
    if (!branchContext || branchContext.isAllSelected) return [];
    const slugs = new Set(branchContext.activeBranchSlugs);
    return branches.filter(branch => slugs.has(branch.slug)).map(branch => branch.id);
  }, [branches, branchContext]);

  const load = async () => {
    setLoading(true); setError(null);
    try { setResult(await fetchAppStoreAnalytics(windowDays, branchIds)); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not load App Store analytics'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [windowDays, branchIds.join('|')]);

  const sync = async () => {
    setSyncing(true); setError(null);
    try { await syncAppStoreAnalytics(); await load(); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not sync App Store analytics'); }
    finally { setSyncing(false); }
  };

  const totals = {
    impressions: sumPreferred(result, ['Total Impressions', 'Impressions']),
    pageViews: sumPreferred(result, ['Product Page Views', 'Page Views']),
    downloads: sumPreferred(result, ['Total Downloads', 'Downloads', 'First-Time Downloads']),
    sessions: sumPreferred(result, ['Sessions']),
    crashes: sumPreferred(result, ['Crashes']),
    deletions: sumPreferred(result, ['App Deletions', 'Deletions']),
  };

  return <section className="border border-slate-200 bg-white p-6 sm:p-7 space-y-6">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-100 text-sky-700"><Smartphone size={21} /></div>
        <div><p className="text-[10px] font-black uppercase tracking-widest text-sky-700">App Store analytics</p><p className="text-xs text-slate-500">Daily Apple aggregates · no device-level report rows retained</p></div>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex rounded-xl bg-slate-100 p-1">{([7, 30, 90] as const).map(days => <button key={days} onClick={() => setWindowDays(days)} className={`rounded-lg px-3 py-1.5 text-[9px] font-black ${windowDays === days ? 'bg-white text-sky-700 shadow-sm' : 'text-slate-400'}`}>{days}D</button>)}</div>
        <button onClick={sync} disabled={syncing || loading} className="rounded-xl bg-sky-600 p-2.5 text-white hover:bg-sky-700 disabled:opacity-40" title="Sync from App Store Connect"><RefreshCw size={14} className={syncing ? 'animate-spin' : ''} /></button>
      </div>
    </div>
    {error && <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-700"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{error}</div>}
    {loading && !result ? <div className="flex items-center justify-center py-12 text-sky-600"><Loader2 size={24} className="animate-spin" /></div> : <>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">{[
        ['Impressions', totals.impressions, Eye], ['Page views', totals.pageViews, Eye], ['Downloads', totals.downloads, Download], ['Sessions', totals.sessions, Smartphone], ['Crashes', totals.crashes, TriangleAlert], ['Deletions', totals.deletions, Download],
      ].map(([label, value, Icon]) => <div key={String(label)} className="rounded-2xl bg-slate-50 p-4"><Icon size={14} className="mb-2 text-sky-500" /><p className="text-xl font-black text-slate-800">{Number(value).toLocaleString()}</p><p className="mt-1 text-[8px] font-black uppercase tracking-widest text-slate-400">{String(label)}</p></div>)}</div>
      {!result?.snapshots.length && <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center"><Smartphone size={30} className="mx-auto mb-3 text-slate-300" /><p className="text-sm font-black text-slate-600">Apple is preparing the first reports</p><p className="mt-1 text-xs text-slate-400">New analytics requests commonly need 1–2 days before daily files are available.</p></div>}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">{result?.apps.map(app => <div key={app.id} className="rounded-2xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-black text-slate-800">{app.name}</p><p className="mt-1 text-[9px] text-slate-400">Apple ID {app.apple_app_id}</p></div><span className={`rounded-full px-2 py-1 text-[8px] font-black uppercase ${app.status === 'error' ? 'bg-rose-100 text-rose-700' : app.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{app.status}</span></div><p className="mt-3 text-[9px] text-slate-400">{app.last_synced_at ? `Last synced ${new Date(app.last_synced_at).toLocaleString()}` : 'Waiting for first successful import'}</p>{app.last_error && <p className="mt-2 text-[9px] font-bold text-rose-600">{app.last_error}</p>}</div>)}</div>
    </>}
  </section>;
};

export default AppStoreAnalyticsPanel;
