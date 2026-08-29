import { useCallback, useEffect, useState } from 'react';
import { BarChart3, ExternalLink, Newspaper, RefreshCw, Rss } from 'lucide-react';
import {
  fetchSubstackArticles,
  SubstackArticle,
  SWEETWATER_SUBSTACK_CHANNEL,
} from '../services/substackChannelService';

interface Props {
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

function articleSection(article: SubstackArticle) {
  return article.categories.find(category => SWEETWATER_SUBSTACK_CHANNEL.sections.includes(category)) || 'Sweetwater Technology';
}

export default function SubstackChannelPanel({ addToast }: Props) {
  const [articles, setArticles] = useState<SubstackArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);

  const load = useCallback(async (notify = false) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchSubstackArticles();
      setArticles(result.articles);
      setFetchedAt(result.fetchedAt);
      if (notify) addToast(`Synced ${result.articles.length} Substack article${result.articles.length === 1 ? '' : 's'}.`, 'success');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Could not sync the Substack feed.';
      setError(message);
      if (notify) addToast(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
        <div className="bg-gradient-to-br from-slate-900 via-slate-800 to-sky-950 p-6 text-white lg:p-7">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl bg-sky-400/15 p-3 text-sky-300 ring-1 ring-sky-300/20"><Newspaper size={26} /></div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-sky-300">Registered publication channel</p>
                  <span className="rounded-full border border-emerald-300/20 bg-emerald-400/10 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-300">RSS connected</span>
                </div>
                <h2 className="mt-1 text-2xl font-black tracking-tight">{SWEETWATER_SUBSTACK_CHANNEL.name}</h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">Public articles sync into Trellis for visibility. Writing, publishing, subscribers, and private analytics remain in Substack.</p>
                <div className="mt-4 flex flex-wrap gap-2">{SWEETWATER_SUBSTACK_CHANNEL.sections.map(section => <span key={section} className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold text-slate-200">{section}</span>)}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href={SWEETWATER_SUBSTACK_CHANNEL.dashboardUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2.5 text-xs font-black text-slate-900 transition hover:bg-sky-50"><ExternalLink size={14} /> Publisher dashboard</a>
              <a href={SWEETWATER_SUBSTACK_CHANNEL.statsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2.5 text-xs font-bold text-white transition hover:bg-white/10"><BarChart3 size={14} /> View stats</a>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-6 py-4">
          <div className="flex items-center gap-2 text-xs text-slate-500"><Rss size={14} className="text-orange-500" /><a href={SWEETWATER_SUBSTACK_CHANNEL.feedUrl} target="_blank" rel="noreferrer" className="font-bold text-slate-700 hover:text-sky-700">Official publication feed</a>{fetchedAt && <span className="text-slate-300">· refreshed {new Date(fetchedAt).toLocaleString()}</span>}</div>
          <button type="button" onClick={() => load(true)} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-wait disabled:opacity-50"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh feed</button>
        </div>
      </section>

      <section>
        <div className="mb-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-sky-600">Public RSS inventory</p>
          <h2 className="mt-1 text-lg font-black text-slate-800">Recent Substack articles</h2>
        </div>
        {loading && articles.length === 0 ? (
          <div className="rounded-[2rem] border border-slate-200 bg-white p-10 text-center text-sm text-slate-400"><RefreshCw className="mx-auto mb-3 animate-spin" size={22} />Syncing the publication feed…</div>
        ) : error ? (
          <div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-6"><p className="font-bold text-amber-900">The Substack channel is registered, but the feed could not be refreshed.</p><p className="mt-1 text-sm text-amber-700">{error}</p><p className="mt-3 text-xs text-amber-700">Deploy the <code>substack-feed</code> Edge Function, then refresh. The dashboard and stats links above remain available.</p></div>
        ) : articles.length === 0 ? (
          <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white p-10 text-center"><Newspaper className="mx-auto text-slate-300" size={30} /><p className="mt-3 font-black text-slate-700">No public articles found</p><p className="mt-1 text-sm text-slate-400">Published Substack posts will appear here automatically.</p></div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">{articles.map(article => <article key={article.id} className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-2"><span className="rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-sky-700">{articleSection(article)}</span>{article.publishedAt && <time className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{new Date(article.publishedAt).toLocaleDateString()}</time>}</div><h3 className="mt-4 text-lg font-black leading-snug text-slate-800">{article.title}</h3>{article.description && <p className="mt-2 line-clamp-3 text-sm leading-6 text-slate-500">{article.description}</p>}<a href={article.url} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-xs font-black text-sky-700 hover:text-sky-900">Read on Substack <ExternalLink size={13} /></a></article>)}</div>
        )}
      </section>
    </div>
  );
}
