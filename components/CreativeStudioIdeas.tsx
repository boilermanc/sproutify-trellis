import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Clock, Image as ImageIcon, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import type { BrandIdentity, BranchInfo, CreativeStudioIdea, VideoAdJob } from '../types';
import {
  buildCreativeIdeaContext, creativeHistoryStatus, creativeHistoryTitle,
  generateCreativeIdeas, recentCreativeJobs, starterCreativeIdeas,
} from '../services/creativeStudioIdeas';

interface Props {
  branch: BranchInfo;
  brand: BrandIdentity | null;
  brandLoading: boolean;
  brandFailed: boolean;
  jobs: VideoAdJob[];
  historyLoading: boolean;
  historyFailed: boolean;
  apiKey: string;
  onUseIdea: (idea: CreativeStudioIdea) => void;
  onOpenCreative: (job: VideoAdJob) => void;
  onRetryHistory: () => void;
  addToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const formatNames = { video: 'Video', static: 'Static image', carousel: 'Carousel' };
const previewUrl = (job: VideoAdJob): string | undefined =>
  [job.composite_url, job.thumbnail_url, job.frame_url, job.media_urls?.[0], job.face_image_url]
    .find(url => typeof url === 'string' && /^https?:\/\//i.test(url));
const createdDate = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const CreativeStudioIdeas: React.FC<Props> = (props) => {
  const { branch, brand, brandLoading, brandFailed, jobs, historyLoading, historyFailed, apiKey, onUseIdea, onOpenCreative, onRetryHistory } = props;
  const recent = useMemo(() => recentCreativeJobs(jobs, branch.slug), [jobs, branch.slug]);
  const context = useMemo(() => buildCreativeIdeaContext(branch, brand, jobs, !historyFailed), [branch, brand, jobs, historyFailed]);
  // The parent keeps this component mounted while navigating the wizard. Polling
  // updates the history, but must not spend another AI request or replace ideas.
  // Refresh explicitly takes a fresh snapshot; no API keys or ideas are persisted.
  const contextRef = useRef(context);
  contextRef.current = context;
  const toastRef = useRef(props.addToast);
  toastRef.current = props.addToast;
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<{ ideas: CreativeStudioIdea[]; source: 'ai' | 'starter'; failed: boolean } | null>(null);
  const [generating, setGenerating] = useState(false);
  const ready = !brandLoading && !historyLoading;

  useEffect(() => {
    if (!ready) return;
    const snapshot = contextRef.current;
    const fallback = starterCreativeIdeas(snapshot);
    if (!apiKey) {
      setResult({ ideas: fallback, source: 'starter', failed: false });
      setGenerating(false);
      return;
    }
    const controller = new AbortController();
    setGenerating(true);
    generateCreativeIdeas(apiKey, snapshot, controller.signal).then(ideas => {
      if (!controller.signal.aborted) setResult({ ideas, source: 'ai', failed: false });
    }).catch(() => {
      if (controller.signal.aborted) return;
      setResult({ ideas: fallback, source: 'starter', failed: true });
      toastRef.current('AI ideas are unavailable. Three starter ideas are ready to use.', 'info');
    }).finally(() => {
      if (!controller.signal.aborted) setGenerating(false);
    });
    return () => controller.abort();
  }, [ready, branch.slug, apiKey, refresh]);

  return (
    <section aria-label="Creative starting points" className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800"><Clock size={16} /> Recently created for {branch.name}</h3>
        <p className="text-xs text-slate-500 mt-1">Your latest Creative Studio work. Dates show when each creative was created.</p>
        {historyLoading ? <p className="text-sm text-slate-500 mt-4" role="status">Loading recent creatives…</p>
          : historyFailed ? <div className="text-sm text-slate-600 mt-4" role="status">Recent history could not be loaded. <button type="button" onClick={onRetryHistory} className="font-bold text-emerald-700 underline">Retry history</button></div>
          : recent.length === 0 ? <p className="text-sm text-slate-500 mt-4">No creatives yet for {branch.name}. Pick an idea below to get started.</p>
          : <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mt-4">
            {recent.slice(0, 3).map(job => (
              <button key={job.id} type="button" onClick={() => onOpenCreative(job)} aria-label={`Open creative: ${creativeHistoryTitle(job)}`} className="flex gap-3 min-w-0 text-left rounded-xl border border-slate-200 p-3 hover:border-emerald-400 focus-visible:outline-emerald-600">
                <span className="relative flex items-center justify-center w-16 h-16 shrink-0 overflow-hidden bg-slate-100 rounded-lg text-slate-400">
                  <ImageIcon size={20} />
                  {previewUrl(job) && <img src={previewUrl(job)} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" onError={event => { event.currentTarget.style.display = 'none'; }} />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-800 line-clamp-2 break-words">{creativeHistoryTitle(job)}</span>
                  <span className="block text-xs text-slate-500 mt-1">{formatNames[job.format || 'video']} · {createdDate(job.created_at)}</span>
                  <span className="block text-xs font-semibold text-emerald-700 mt-1">{creativeHistoryStatus(job)}</span>
                </span>
              </button>
            ))}
          </div>}
      </div>

      <div className="bg-emerald-50/60 border border-emerald-100 rounded-2xl p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-black text-slate-800"><Sparkles size={18} className="text-emerald-600" /> Three ideas for {branch.name}</h3>
            <p className="text-sm text-slate-600 mt-1">Pick a direction to fill your brief. You can edit it before creating anything.</p>
          </div>
          <button type="button" disabled={!ready || generating || !apiKey} onClick={() => setRefresh(value => value + 1)} className="inline-flex items-center gap-2 border border-emerald-200 bg-white rounded-lg px-3 py-2 text-xs font-bold text-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed">
            <RefreshCw size={14} className={generating ? 'animate-spin' : ''} /> {result?.failed ? 'Retry ideas' : 'Refresh ideas'}
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-3" role="status">
          {!ready ? 'Loading brand details and creative history…' : generating ? 'Writing three ideas from your brand context…'
            : result?.failed ? 'AI suggestions could not be loaded. These starter ideas are ready to use.'
            : result?.source === 'starter' ? 'Starter ideas. Configure Gemini in Settings for AI suggestions based on your recent work.'
            : 'AI suggestions based on available brand details and recent creative history. Performance results are not included.'}
        </p>
        {!brandLoading && (brandFailed || !brand) && <p className="text-xs text-amber-800 mt-2">{brandFailed ? 'Brand DNA could not be loaded.' : 'No active Brand DNA found.'} Ideas will be more specific when saved brand details are available.</p>}
        {historyFailed && <p className="text-xs text-amber-800 mt-2">Suggestions cannot account for recent work until history is available. Retry history to include recent work.</p>}

        {(!ready || generating) ? <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4" aria-busy="true">
          {[0, 1, 2].map(index => <div key={index} className="bg-white rounded-xl border border-emerald-100 p-5 min-h-44 flex items-center justify-center"><Loader2 className="animate-spin text-emerald-500" size={22} aria-hidden="true" /></div>)}
        </div> : <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
          {result?.ideas.map(idea => <article key={idea.id} className="flex flex-col min-w-0 bg-white border border-emerald-100 rounded-xl p-5">
            <span className="text-xs font-bold text-emerald-700">{formatNames[idea.format]} · {result.source === 'ai' ? 'Idea to test' : 'Starter idea'}</span>
            <h4 className="font-bold text-slate-900 mt-2 break-words">{idea.title}</h4>
            <p className="text-sm text-slate-700 mt-2 break-words">“{idea.hook}”</p>
            <p className="text-xs text-slate-600 mt-3 break-words"><span className="font-bold">Why try this? </span>{idea.rationale}</p>
            <details className="mt-3 text-xs text-slate-500"><summary className="cursor-pointer font-semibold">Preview brief</summary><p className="mt-2 whitespace-pre-wrap break-words">{idea.brief}</p></details>
            <button type="button" onClick={() => onUseIdea(idea)} aria-label={`Use this idea: ${idea.title}`} className="mt-5 inline-flex items-center justify-center gap-2 w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg py-2.5 px-3 text-sm font-bold">
              Use this idea <ArrowRight size={15} />
            </button>
          </article>)}
        </div>}
      </div>
    </section>
  );
};

export default CreativeStudioIdeas;
