import React, { useEffect, useMemo, useState } from 'react';
import { Clapperboard, ExternalLink, Loader2, MessageCircle, PlayCircle, RefreshCw, ThumbsUp, Youtube } from 'lucide-react';
import { getYouTubePerformance, VideoPerformanceRow } from '../services/videoPerformanceService';

const fmtNumber = (value: number | null) => value == null ? '—' : new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
const fmtWatchHours = (minutes: number) => new Intl.NumberFormat(undefined, { maximumFractionDigits: minutes / 60 >= 10 ? 0 : 1 }).format(minutes / 60);
const fmtDate = (iso: string | null) => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
  catch { return '—'; }
};

// Rolls up trellis_youtube_daily_metrics (the E9 sync) across BOTH the Episodes and
// Studio Albums publishing pipelines into a single reporting view.
export const YouTubePerformancePanel: React.FC = () => {
  const [rows, setRows] = useState<VideoPerformanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await getYouTubePerformance());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load YouTube performance.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const totals = useMemo(() => rows.reduce(
    (acc, r) => {
      acc.views += r.total_views ?? r.seven_day_views;
      acc.watchMinutes += r.seven_day_watch_minutes;
      acc.likes += r.likes;
      acc.comments += r.comments;
      return acc;
    },
    { views: 0, watchMinutes: 0, likes: 0, comments: 0 },
  ), [rows]);

  const hasData = rows.length > 0;

  return (
    <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 bg-gradient-to-br from-red-500 to-rose-600 rounded-2xl flex items-center justify-center shadow-lg">
            <Youtube size={22} className="text-white" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">YouTube Performance</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Episodes + Studio Albums &middot; synced daily</p>
          </div>
        </div>
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

      {error && (
        <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold text-amber-700">{error}</div>
      )}

      {loading && !hasData ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-red-500" />
        </div>
      ) : !hasData ? (
        <div className="text-center py-12 px-6">
          <PlayCircle size={32} className="text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-black text-slate-500 uppercase tracking-widest mb-2">No YouTube data yet</p>
          <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
            This fills in once the E9 YouTube Analytics Sync workflow runs against a live episode or
            studio album release. Check <b>Trellis Episodes</b> or <b>Studio Albums</b> for publish status.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <div className="rounded-2xl border border-red-100 bg-red-50/50 p-4 text-center">
              <p className="text-[9px] font-black uppercase tracking-widest text-red-500 flex items-center justify-center gap-1"><PlayCircle size={11} /> Total Views</p>
              <p className="text-2xl font-black text-red-600 mt-1">{fmtNumber(totals.views)}</p>
            </div>
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-4 text-center">
              <p className="text-[9px] font-black uppercase tracking-widest text-indigo-500">7-Day Watch</p>
              <p className="text-2xl font-black text-indigo-600 mt-1">{fmtWatchHours(totals.watchMinutes)} hr</p>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 text-center">
              <p className="text-[9px] font-black uppercase tracking-widest text-emerald-500 flex items-center justify-center gap-1"><ThumbsUp size={11} /> Likes</p>
              <p className="text-2xl font-black text-emerald-600 mt-1">{fmtNumber(totals.likes)}</p>
            </div>
            <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4 text-center">
              <p className="text-[9px] font-black uppercase tracking-widest text-blue-500 flex items-center justify-center gap-1"><MessageCircle size={11} /> Comments</p>
              <p className="text-2xl font-black text-blue-600 mt-1">{fmtNumber(totals.comments)}</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[9px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                  <th className="py-2 pr-3">Title</th>
                  <th className="py-2 px-2">Pipeline</th>
                  <th className="py-2 px-2 text-right">Total Views</th>
                  <th className="py-2 px-2 text-right">7-Day Views</th>
                  <th className="py-2 px-2 text-right">Retention</th>
                  <th className="py-2 px-2 text-right">Likes</th>
                  <th className="py-2 pl-2 text-right">Last synced</th>
                  <th className="py-2 pl-2 text-right"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(row => (
                  <tr key={row.youtube_video_id} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="py-3 pr-3 text-xs font-bold text-slate-700 max-w-[220px] truncate" title={row.title}>{row.title}</td>
                    <td className="py-3 px-2 text-[10px]">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-black uppercase tracking-widest ${row.pipeline === 'studio' ? 'bg-purple-50 text-purple-600' : 'bg-cyan-50 text-cyan-600'}`}>
                        <Clapperboard size={10} /> {row.pipeline === 'studio' ? 'Studio' : 'Episode'}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-right text-xs font-bold text-slate-700">{fmtNumber(row.total_views)}</td>
                    <td className="py-3 px-2 text-right text-xs text-slate-500">{fmtNumber(row.seven_day_views)}</td>
                    <td className="py-3 px-2 text-right text-xs font-bold text-emerald-600">{row.latest_retention_pct.toFixed(1)}%</td>
                    <td className="py-3 px-2 text-right text-xs font-bold text-slate-600">{fmtNumber(row.likes)}</td>
                    <td className="py-3 pl-2 text-right text-[10px] text-slate-400">{fmtDate(row.synced_at)}</td>
                    <td className="py-3 pl-2 text-right">
                      <a
                        href={row.external_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700 text-[9px] font-black uppercase tracking-widest whitespace-nowrap"
                      >
                        <ExternalLink size={11} /> Watch
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export default YouTubePerformancePanel;
