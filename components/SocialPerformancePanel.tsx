import React, { useEffect, useMemo, useState } from 'react';
import {
  Facebook, Instagram, Loader2, RefreshCw, Users, TrendingUp, TrendingDown, Eye, Radio, Plug,
} from 'lucide-react';
import { BranchContext, BranchInfo } from '../types';
import {
  fetchBrandInsights, getBrandDailyMetrics, MetaInsights, BrandDailyMetric, SocialPlatform,
} from '../services/metaInsightsService';

// ─── Social Audience Panel ──────────────────────────────────────────
// Two things the rest of Reports can't show:
//   1. LIVE followers/reach per brand — Facebook fans + Instagram
//      followers pulled through the meta-insights Edge Function, right now.
//   2. FOLLOWER GROWTH over time — read from `brand_daily_metrics`, the
//      one-row-per-brand/platform/day table filled by the S4 "Daily Brand
//      Metrics" n8n job. Meta only ever reports "now", so this table is the
//      ONLY source of a trend. Empty until the job has run a couple of days,
//      so we render a "collecting" state rather than a fake flat line.
// ────────────────────────────────────────────────────────────────────

interface SocialPerformancePanelProps {
  branches: BranchInfo[];
  branchContext?: BranchContext;
}

interface BrandLive {
  branch: BranchInfo;
  insights: MetaInsights;
}

const fmt = (n: number | null | undefined): string =>
  n == null ? '—' : new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(n);

const fmtSigned = (n: number): string => `${n > 0 ? '+' : ''}${new Intl.NumberFormat().format(n)}`;

const fmtDate = (iso: string): string => {
  try { return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
  catch { return iso; }
};

const PLATFORM_COLOR: Record<SocialPlatform, string> = {
  facebook: '#4f46e5',   // indigo-600
  instagram: '#e11d48',  // rose-600
};

const SocialPerformancePanel: React.FC<SocialPerformancePanelProps> = ({ branches, branchContext }) => {
  const [live, setLive] = useState<BrandLive[]>([]);
  const [history, setHistory] = useState<BrandDailyMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Which brands the global branch picker has active. Meta credentials live
  // per-brand, so an out-of-scope brand shouldn't be fetched or charted.
  const scopedBranches = useMemo(() => {
    const active = branches.filter(b => b.is_active !== false);
    if (!branchContext || branchContext.isAllSelected) return active;
    const slugs = new Set(branchContext.activeBranchSlugs);
    return active.filter(b => slugs.has(b.slug));
  }, [branches, branchContext]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [liveResults, hist] = await Promise.all([
        Promise.all(scopedBranches.map(async (branch) => ({ branch, insights: await fetchBrandInsights(branch.id) }))),
        getBrandDailyMetrics(30),
      ]);
      setLive(liveResults);
      setHistory(hist);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load social audience data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [scopedBranches.map(b => b.id).join(',')]);

  const connected = useMemo(() => live.filter(l => l.insights.connected), [live]);

  const totals = useMemo(() => {
    let fb = 0, ig = 0, reach = 0;
    for (const { insights } of connected) {
      // Prefer `followers` (Meta's forward-looking metric) over `fans` (Page
      // likes, being deprecated). They're usually identical today.
      fb += insights.facebook?.followers ?? insights.facebook?.fans ?? 0;
      ig += insights.instagram?.followers ?? 0;
      reach += insights.instagram?.reach_28d ?? 0;
    }
    return { fb, ig, total: fb + ig, reach };
  }, [connected]);

  // ── Growth series: aggregate followers across in-scope brands, per day, per platform ──
  const scopedBranchIds = useMemo(() => new Set(scopedBranches.map(b => b.id)), [scopedBranches]);

  const growth = useMemo(() => {
    const rows = history.filter(r => scopedBranchIds.has(r.branch_id));
    // date -> { facebook, instagram } summed across brands
    const byDate = new Map<string, { facebook: number | null; instagram: number | null }>();
    for (const r of rows) {
      if (r.followers == null) continue;
      const bucket = byDate.get(r.captured_on) ?? { facebook: null, instagram: null };
      bucket[r.platform] = (bucket[r.platform] ?? 0) + r.followers;
      byDate.set(r.captured_on, bucket);
    }
    const dates = Array.from(byDate.keys()).sort();
    const facebook = dates.map(d => byDate.get(d)!.facebook);
    const instagram = dates.map(d => byDate.get(d)!.instagram);
    return { dates, facebook, instagram };
  }, [history, scopedBranchIds]);

  const hasTrend = growth.dates.length >= 2;

  const delta = (series: (number | null)[]): number | null => {
    const vals = series.filter((v): v is number => v != null);
    if (vals.length < 2) return null;
    return vals[vals.length - 1] - vals[0];
  };
  const fbDelta = delta(growth.facebook);
  const igDelta = delta(growth.instagram);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-8">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 via-purple-500 to-rose-500 rounded-2xl flex items-center justify-center shadow-lg">
              <Users size={22} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Social Audience</h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                Facebook + Instagram &middot; live followers &amp; growth
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {!loading && (
              <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-600">
                <Radio size={12} /> {connected.length} of {scopedBranches.length} connected
              </span>
            )}
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 text-[10px] font-black uppercase tracking-widest disabled:opacity-50"
            >
              {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold text-amber-700">{error}</div>
        )}

        {loading && live.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-indigo-500" />
          </div>
        ) : connected.length === 0 ? (
          <div className="text-center py-12 px-6">
            <Plug size={32} className="text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-black text-slate-500 uppercase tracking-widest mb-2">No connected brands in scope</p>
            <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
              Connect a Facebook Page + Instagram account for a brand in <b>Settings → Platform Setup</b> (or widen the
              branch picker), and its live follower counts appear here.
            </p>
          </div>
        ) : (
          <>
            {/* Totals */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 text-center">
                <p className="text-[9px] font-black uppercase tracking-widest text-indigo-500 flex items-center justify-center gap-1"><Facebook size={11} /> FB Followers</p>
                <p className="text-2xl font-black text-indigo-600 mt-1">{fmt(totals.fb)}</p>
              </div>
              <div className="rounded-2xl border border-rose-100 bg-rose-50/50 p-4 text-center">
                <p className="text-[9px] font-black uppercase tracking-widest text-rose-500 flex items-center justify-center gap-1"><Instagram size={11} /> IG Followers</p>
                <p className="text-2xl font-black text-rose-600 mt-1">{fmt(totals.ig)}</p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 text-center">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 flex items-center justify-center gap-1"><Users size={11} /> Total Audience</p>
                <p className="text-2xl font-black text-slate-800 mt-1">{fmt(totals.total)}</p>
              </div>
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 text-center">
                <p className="text-[9px] font-black uppercase tracking-widest text-emerald-500 flex items-center justify-center gap-1"><Eye size={11} /> IG Reach 28d</p>
                <p className="text-2xl font-black text-emerald-600 mt-1">{fmt(totals.reach)}</p>
              </div>
            </div>

            {/* Per-brand rows */}
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[9px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                    <th className="py-2 pr-3">Brand</th>
                    <th className="py-2 px-2 text-right">FB Followers</th>
                    <th className="py-2 px-2 text-right">IG Followers</th>
                    <th className="py-2 px-2 text-right">IG Posts</th>
                    <th className="py-2 pl-2 text-right">IG Reach 28d</th>
                  </tr>
                </thead>
                <tbody>
                  {connected.map(({ branch, insights }) => (
                    <tr key={branch.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="py-3 pr-3 text-xs font-bold text-slate-700">{branch.name}</td>
                      <td className="py-3 px-2 text-right text-xs font-bold text-indigo-600">{fmt(insights.facebook?.followers ?? insights.facebook?.fans)}</td>
                      <td className="py-3 px-2 text-right text-xs font-bold text-rose-600">{fmt(insights.instagram?.followers)}</td>
                      <td className="py-3 px-2 text-right text-xs text-slate-500">{fmt(insights.instagram?.posts)}</td>
                      <td className="py-3 pl-2 text-right text-xs text-slate-500">{fmt(insights.instagram?.reach_28d)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Follower growth chart */}
      <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-8">
        <div className="flex items-center space-x-4 mb-6">
          <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center shadow-lg">
            <TrendingUp size={22} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Follower Growth</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Daily snapshots &middot; last 30 days</p>
          </div>
        </div>

        {!hasTrend ? (
          <div className="text-center py-12 px-6">
            <TrendingUp size={32} className="text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-black text-slate-500 uppercase tracking-widest mb-2">Collecting daily snapshots</p>
            <p className="text-xs text-slate-400 max-w-lg mx-auto leading-relaxed">
              Instagram and Facebook only report follower counts as of <i>right now</i> — so a growth trend has to be
              built up one day at a time. The <b>Daily Brand Metrics</b> job records one point per brand each morning;
              this chart draws a real line once there are at least two days of history{growth.dates.length === 1 ? ' (one recorded so far)' : ''}.
            </p>
          </div>
        ) : (
          <>
            {/* Deltas */}
            <div className="flex flex-wrap gap-3 mb-5">
              {fbDelta != null && (
                <DeltaChip label="Facebook" value={fbDelta} color="text-indigo-600" bg="bg-indigo-50 border-indigo-100" />
              )}
              {igDelta != null && (
                <DeltaChip label="Instagram" value={igDelta} color="text-rose-600" bg="bg-rose-50 border-rose-100" />
              )}
              <span className="ml-auto text-[10px] font-bold text-slate-400 self-center">
                {fmtDate(growth.dates[0])} → {fmtDate(growth.dates[growth.dates.length - 1])}
              </span>
            </div>

            <LineChart
              dates={growth.dates}
              series={[
                { name: 'Facebook', color: PLATFORM_COLOR.facebook, values: growth.facebook },
                { name: 'Instagram', color: PLATFORM_COLOR.instagram, values: growth.instagram },
              ]}
            />

            {/* Legend */}
            <div className="flex items-center gap-5 mt-4 justify-center">
              {(['facebook', 'instagram'] as SocialPlatform[]).map(p => (
                <span key={p} className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  <span className="w-3 h-1 rounded-full" style={{ backgroundColor: PLATFORM_COLOR[p] }} />
                  {p === 'facebook' ? 'Facebook' : 'Instagram'}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const DeltaChip: React.FC<{ label: string; value: number; color: string; bg: string }> = ({ label, value, color, bg }) => (
  <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-black ${bg} ${color}`}>
    {value >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
    {label} {fmtSigned(value)}
  </span>
);

// ── Minimal dependency-free SVG line chart ──────────────────────────
// Handles gaps (null points) by only drawing segments between present values,
// so a platform with sparser snapshots doesn't get a fake straight line.
interface Series { name: string; color: string; values: (number | null)[] }

const LineChart: React.FC<{ dates: string[]; series: Series[] }> = ({ dates, series }) => {
  const W = 720, H = 240, padL = 48, padR = 16, padT = 16, padB = 28;
  const plotW = W - padL - padR, plotH = H - padT - padB;

  const allVals = series.flatMap(s => s.values).filter((v): v is number => v != null);
  const rawMin = Math.min(...allVals);
  const rawMax = Math.max(...allVals);
  // Pad the range so lines aren't glued to the edges; never let min/max collapse.
  const span = rawMax - rawMin || Math.max(rawMax, 1);
  const yMin = Math.max(0, Math.floor((rawMin - span * 0.1)));
  const yMax = Math.ceil(rawMax + span * 0.1);

  const n = dates.length;
  const x = (i: number) => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const y = (v: number) => padT + plotH - ((v - yMin) / (yMax - yMin || 1)) * plotH;

  // Build path strings, breaking on nulls.
  const pathFor = (values: (number | null)[]): string => {
    let d = '';
    let penDown = false;
    values.forEach((v, i) => {
      if (v == null) { penDown = false; return; }
      d += `${penDown ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)} `;
      penDown = true;
    });
    return d.trim();
  };

  const yTicks = 4;
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => yMin + ((yMax - yMin) / yTicks) * i);

  // X labels: first, middle, last (avoid crowding).
  const xLabelIdx = n <= 1 ? [0] : Array.from(new Set([0, Math.floor((n - 1) / 2), n - 1]));

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[520px]" role="img" aria-label="Follower growth over time">
        {/* Gridlines + y labels */}
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke="#f1f5f9" strokeWidth={1} />
            <text x={padL - 8} y={y(t) + 3} textAnchor="end" className="fill-slate-400" style={{ fontSize: 10, fontWeight: 700 }}>
              {new Intl.NumberFormat(undefined, { notation: 'compact' }).format(Math.round(t))}
            </text>
          </g>
        ))}

        {/* X labels */}
        {xLabelIdx.map(i => (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" className="fill-slate-400" style={{ fontSize: 10, fontWeight: 700 }}>
            {fmtDate(dates[i])}
          </text>
        ))}

        {/* Series */}
        {series.map(s => {
          const d = pathFor(s.values);
          if (!d) return null;
          return (
            <g key={s.name}>
              <path d={d} fill="none" stroke={s.color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
              {s.values.map((v, i) => v == null ? null : (
                <circle key={i} cx={x(i)} cy={y(v)} r={2.5} fill={s.color} />
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

export default SocialPerformancePanel;
