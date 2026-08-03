import React, { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, BarChart3, Clock3, Loader2, RefreshCw, Repeat2, Route, Users } from 'lucide-react';
import { fetchPosthogAnalytics, fetchPosthogConnections } from '../services/posthogService';
import { BranchContext, BranchInfo, PostHogAnalyticsResult, PostHogConnection } from '../types';

interface Props {
  branches: BranchInfo[];
  branchContext?: BranchContext;
  onDataChange?: (results: PostHogAnalyticsResult[]) => void;
}

const PostHogAnalyticsPanel: React.FC<Props> = ({ branches, branchContext, onDataChange }) => {
  const [connections, setConnections] = useState<PostHogConnection[]>([]);
  const [results, setResults] = useState<PostHogAnalyticsResult[]>([]);
  const [windowDays, setWindowDays] = useState<7 | 30 | 90>(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchPosthogConnections().then(setConnections).catch(err => setError(err instanceof Error ? err.message : 'Could not load PostHog connections'));
  }, []);

  const scopedConnections = useMemo(() => {
    const active = connections.filter(connection => connection.status !== 'disconnected');
    if (!branchContext || branchContext.isAllSelected) return active;
    const branchIds = new Set(branches.filter(branch => branchContext.activeBranchSlugs.includes(branch.slug)).map(branch => branch.id));
    return active.filter(connection => branchIds.has(connection.branch_id));
  }, [connections, branches, branchContext]);

  const load = async (force = false) => {
    if (scopedConnections.length === 0) {
      setResults([]);
      setLoading(false);
      onDataChange?.([]);
      return;
    }
    setLoading(true);
    setError(null);
    const settled = await Promise.allSettled(scopedConnections.map(connection => fetchPosthogAnalytics(connection.id, windowDays, force)));
    const loaded = settled.filter((item): item is PromiseFulfilledResult<PostHogAnalyticsResult> => item.status === 'fulfilled').map(item => item.value);
    const failures = settled.filter((item): item is PromiseRejectedResult => item.status === 'rejected');
    setResults(loaded);
    onDataChange?.(loaded);
    if (failures.length) setError(`${failures.length} PostHog ${failures.length === 1 ? 'project' : 'projects'} could not be queried. Cached data is shown when available.`);
    setLoading(false);
  };

  useEffect(() => { load(false); }, [windowDays, scopedConnections.map(connection => connection.id).join('|')]);

  const totals = useMemo(() => results.reduce((sum, result) => {
    sum.dau += result.data.active_users.daily;
    sum.wau += result.data.active_users.weekly;
    sum.mau += result.data.active_users.monthly;
    sum.sessions += result.data.sessions;
    sum.newUsers += result.data.users.new;
    sum.returning += result.data.users.returning;
    return sum;
  }, { dau: 0, wau: 0, mau: 0, sessions: 0, newUsers: 0, returning: 0 }), [results]);

  return (
    <section className="rounded-[2.5rem] border border-violet-200 bg-white p-7 shadow-sm space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100 text-violet-700"><BarChart3 size={21} /></div>
          <div><p className="text-[10px] font-black uppercase tracking-widest text-violet-700">Product analytics</p><p className="text-xs text-slate-500">Live PostHog aggregates · raw events remain at the source</p></div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl bg-slate-100 p-1">
            {([7, 30, 90] as const).map(days => <button key={days} onClick={() => setWindowDays(days)} className={`rounded-lg px-3 py-1.5 text-[9px] font-black ${windowDays === days ? 'bg-white text-violet-700 shadow-sm' : 'text-slate-400'}`}>{days}D</button>)}
          </div>
          <button onClick={() => load(true)} disabled={loading || scopedConnections.length === 0} className="rounded-xl bg-violet-600 p-2.5 text-white hover:bg-violet-700 disabled:opacity-40" title="Refresh from PostHog"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
        </div>
      </div>

      {error && <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-700"><AlertTriangle size={14} className="mt-0.5 shrink-0" />{error}</div>}

      {loading && results.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-violet-600"><Loader2 size={24} className="animate-spin" /></div>
      ) : scopedConnections.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center"><Activity size={30} className="mx-auto mb-3 text-slate-300" /><p className="text-sm font-black text-slate-600">No PostHog connection in this branch scope</p><p className="mt-1 text-xs text-slate-400">Connect a project under Settings → Integrations to add product analytics.</p></div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {[
              ['DAU (branch sum)', totals.dau, Activity], ['WAU (branch sum)', totals.wau, Users], ['MAU (branch sum)', totals.mau, Users],
              [`Sessions ${windowDays}D`, totals.sessions, Clock3], ['New users', totals.newUsers, Route], ['Returning', totals.returning, Repeat2],
            ].map(([label, value, Icon]) => (
              <div key={String(label)} className="rounded-2xl bg-slate-50 p-4"><Icon size={14} className="mb-2 text-violet-500" /><p className="text-xl font-black text-slate-800">{Number(value).toLocaleString()}</p><p className="mt-1 text-[8px] font-black uppercase tracking-widest text-slate-400">{String(label)}</p></div>
            ))}
          </div>

          {results.length > 1 && <p className="text-[9px] font-bold text-slate-400">Active-user totals add each scoped PostHog project. A person active in more than one app can be counted once per branch.</p>}

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {results.map(result => {
              const data = result.data;
              return (
                <div key={result.connection_id} className="rounded-2xl border border-slate-200 p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div><p className="font-black text-slate-800">{result.branch_name || result.branch_id}</p><p className="mt-1 text-[9px] text-slate-400">Fetched {new Date(result.fetched_at).toLocaleString()} · {result.cached ? 'hourly cache' : 'live query'}</p></div>
                    {result.stale && <span className="rounded-full bg-amber-100 px-2 py-1 text-[8px] font-black uppercase text-amber-700">Stale fallback</span>}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="rounded-xl bg-violet-50 p-3 text-center"><p className="text-lg font-black text-violet-800">{data.lifecycle_funnel.signed_up}</p><p className="text-[8px] font-black uppercase text-violet-500">Signed up</p></div>
                    <div className="rounded-xl bg-violet-50 p-3 text-center"><p className="text-lg font-black text-violet-800">{data.lifecycle_funnel.onboarded}</p><p className="text-[8px] font-black uppercase text-violet-500">Onboarded</p></div>
                    <div className="rounded-xl bg-violet-50 p-3 text-center"><p className="text-lg font-black text-violet-800">{data.lifecycle_funnel.activated}</p><p className="text-[8px] font-black uppercase text-violet-500">Activated</p></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div><p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Signup → onboarding</p><p className="mt-1 text-lg font-black text-slate-800">{data.lifecycle_funnel.signup_to_onboarding_pct.toFixed(1)}%</p></div>
                    <div><p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Onboarding → activation</p><p className="mt-1 text-lg font-black text-slate-800">{data.lifecycle_funnel.onboarding_to_activation_pct.toFixed(1)}%</p></div>
                    <div><p className="text-[8px] font-black uppercase tracking-widest text-slate-400">7-day retention</p><p className="mt-1 text-lg font-black text-emerald-700">{data.retention.day_7_pct.toFixed(1)}%</p></div>
                    <div><p className="text-[8px] font-black uppercase tracking-widest text-slate-400">30-day retention</p><p className="mt-1 text-lg font-black text-emerald-700">{data.retention.day_30_pct.toFixed(1)}%</p></div>
                  </div>
                  {data.feature_adoption.length > 0 && <div><p className="mb-2 text-[8px] font-black uppercase tracking-widest text-slate-400">Approved milestone adoption</p><div className="space-y-1">{data.feature_adoption.slice(0, 5).map(item => <div key={item.event} className="flex items-center justify-between text-[10px]"><span className="font-mono text-slate-600">{item.event}</span><span className="font-black text-violet-700">{item.users} users · {item.events} events</span></div>)}</div></div>}
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
};

export default PostHogAnalyticsPanel;
