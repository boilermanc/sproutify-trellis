import { useEffect, useMemo, useState } from 'react';
import { Beaker, CalendarClock } from 'lucide-react';
import type { ContentExperiment, ContentPost } from '../services/contentIntelligenceRegistry';
import { getExperimentReviewState } from '../services/contentExperimentReviewService';
import {
  ExperimentResultClassification,
  HubContentExperiment,
  registerHubContentExperiment,
  reviewHubContentExperiment,
} from '../services/contentExperimentRegistryService';

interface Props {
  projectId: string;
  experiments: ContentExperiment[];
  hubExperiments: HubContentExperiment[];
  posts: ContentPost[];
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onRegistered: (experiment: HubContentExperiment) => void;
  onReviewed: (experiment: HubContentExperiment) => void;
}

const inputClass = 'mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100';

export default function ContentExperimentWorkspace({ projectId, experiments, hubExperiments, posts, addToast, onRegistered, onReviewed }: Props) {
  const eligiblePosts = useMemo(() => posts.filter(post => post.status === 'published' && post.source_record_id), [posts]);
  const hubIds = useMemo(() => new Set(hubExperiments.map(experiment => experiment.experiment_id)), [hubExperiments]);
  const [postId, setPostId] = useState('');
  const [experimentId, setExperimentId] = useState(`experiment_${projectId}_`);
  const [hypothesis, setHypothesis] = useState('');
  const [metrics, setMetrics] = useState('impressions, saves, clicks');
  const [windowDays, setWindowDays] = useState(7);
  const [registering, setRegistering] = useState(false);
  const [reviewingId, setReviewingId] = useState('');
  const [classification, setClassification] = useState<ExperimentResultClassification>('supported');
  const [summary, setSummary] = useState('');
  const [reviewing, setReviewing] = useState(false);

  useEffect(() => {
    setPostId(eligiblePosts[0]?.post_id || '');
    setExperimentId(`experiment_${projectId}_`);
    setHypothesis('');
    setReviewingId('');
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!postId && eligiblePosts[0]) setPostId(eligiblePosts[0].post_id);
  }, [eligiblePosts, postId]);

  const register = async () => {
    const selectedPost = eligiblePosts.find(post => post.post_id === postId);
    if (!selectedPost) return addToast('Approve a published Scheduler asset before registering an experiment.', 'error');
    setRegistering(true);
    try {
      const experiment = await registerHubContentExperiment({
        projectId,
        experimentId,
        topicId: selectedPost.topic_id,
        postId: selectedPost.post_id,
        hypothesis,
        successMetrics: metrics.split(','),
        evaluationWindowDays: windowDays,
      });
      onRegistered(experiment);
      setExperimentId(`experiment_${projectId}_`);
      setHypothesis('');
      addToast('Experiment registered. Trellis will track its review window.', 'success');
    } catch (caught) {
      addToast(caught instanceof Error ? caught.message : 'Could not register the experiment.', 'error');
    } finally {
      setRegistering(false);
    }
  };

  const completeReview = async (experiment: ContentExperiment) => {
    setReviewing(true);
    try {
      const updated = await reviewHubContentExperiment({ projectId, experimentId: experiment.experiment_id, classification, summary });
      onReviewed(updated);
      setReviewingId('');
      setSummary('');
      addToast('Experiment reviewed. It is now eligible for evidence-backed learning promotion.', 'success');
    } catch (caught) {
      addToast(caught instanceof Error ? caught.message : 'Could not review the experiment.', 'error');
    } finally {
      setReviewing(false);
    }
  };

  return <div className="space-y-6">
    <section className="rounded-[2rem] border border-violet-200 bg-violet-50 p-6">
      <p className="text-[10px] font-black uppercase tracking-widest text-violet-700">Hub experiment registry</p>
      <h2 className="mt-1 text-lg font-black text-violet-950">Start the review clock from a real published asset</h2>
      <p className="mt-2 text-sm leading-6 text-violet-900">Registration is limited to approved Scheduler publications. The declared window produces a durable due date and one Slack reminder when review becomes due.</p>
      {eligiblePosts.length === 0 ? <div className="mt-5 rounded-2xl border border-dashed border-violet-300 bg-white/60 p-5 text-sm text-violet-800">No eligible asset yet. In Assets, approve a published Scheduler post with its real canonical URL first.</div> : <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <label className="text-xs font-bold text-violet-900">Approved published asset<select value={postId} onChange={event => setPostId(event.target.value)} className={inputClass}>{eligiblePosts.map(post => <option key={post.post_id} value={post.post_id}>{post.title || post.post_id}</option>)}</select></label>
        <label className="text-xs font-bold text-violet-900">Experiment ID<input value={experimentId} onChange={event => setExperimentId(event.target.value)} className={inputClass} /></label>
        <label className="text-xs font-bold text-violet-900 lg:col-span-2">Measurable hypothesis<textarea value={hypothesis} onChange={event => setHypothesis(event.target.value)} className={`${inputClass} min-h-24`} placeholder="Compared with the current approach, this change should…" /></label>
        <label className="text-xs font-bold text-violet-900">Success metrics<input value={metrics} onChange={event => setMetrics(event.target.value)} className={inputClass} /></label>
        <label className="text-xs font-bold text-violet-900">Evaluation window (days)<input type="number" min={1} max={365} value={windowDays} onChange={event => setWindowDays(Number(event.target.value))} className={inputClass} /></label>
        <div className="lg:col-span-2"><button type="button" onClick={register} disabled={registering} className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-black text-white hover:bg-violet-500 disabled:opacity-50"><Beaker size={15} /> {registering ? 'Registering…' : 'Register experiment'}</button></div>
      </div>}
    </section>

    {experiments.length === 0 ? <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white px-6 py-12 text-center"><Beaker className="mx-auto h-9 w-9 text-slate-300" /><h3 className="mt-4 text-sm font-black uppercase tracking-tight text-slate-700">No experiments registered</h3><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">Register an approved published asset above to start a falsifiable, time-bound experiment.</p></div> : <div className="grid gap-4 lg:grid-cols-2">{experiments.map(experiment => {
      const review = getExperimentReviewState(experiment, posts);
      const isHubExperiment = hubIds.has(experiment.experiment_id);
      const reviewStyle = review.status === 'overdue' ? 'border-rose-200 bg-rose-50 text-rose-700' : review.status === 'due' ? 'border-amber-200 bg-amber-50 text-amber-700' : review.status === 'reviewed' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : review.status === 'unlinked' ? 'border-slate-200 bg-slate-50 text-slate-600' : 'border-sky-200 bg-sky-50 text-sky-700';
      return <article key={experiment.experiment_id} className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3"><code className="text-[10px] text-slate-400">{experiment.experiment_id}</code><div className="flex flex-wrap items-center gap-2">{isHubExperiment && <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-black uppercase text-violet-700">Hub tracked</span>}<span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${reviewStyle}`}><CalendarClock size={12} /> {review.label}</span><span className="rounded-full border border-slate-200 px-2.5 py-1 text-[10px] font-black uppercase text-slate-600">{experiment.status}</span></div></div>
        <p className="mt-4 text-sm font-bold leading-6 text-slate-800">{experiment.hypothesis}</p>
        <div className="mt-5 flex flex-wrap gap-2">{experiment.success_metrics.map(metric => <span key={metric} className="rounded-lg bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-600">{metric}</span>)}</div>
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400"><span>Window: {experiment.evaluation_window_days} days</span>{review.dueAt && <span>Due: {new Date(review.dueAt).toLocaleDateString()}</span>}<span>Post: <code>{experiment.post_id}</code></span></div>
        {isHubExperiment && experiment.status !== 'reviewed' && <div className="mt-5 border-t border-slate-100 pt-4">{reviewingId !== experiment.experiment_id ? <button type="button" onClick={() => { setReviewingId(experiment.experiment_id); setClassification('supported'); setSummary(''); }} className="rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-black text-white hover:bg-violet-500">Review result</button> : <div className="grid gap-3"><label className="text-xs font-bold text-slate-600">Result classification<select value={classification} onChange={event => setClassification(event.target.value as ExperimentResultClassification)} className={inputClass}><option value="supported">Supported</option><option value="mixed">Mixed</option><option value="unsupported">Unsupported</option><option value="inconclusive">Inconclusive</option></select></label><label className="text-xs font-bold text-slate-600">Observed result<textarea value={summary} onChange={event => setSummary(event.target.value)} className={`${inputClass} min-h-24`} placeholder="Summarize the evidence, comparison, and important confounders." /></label><div className="flex gap-2"><button type="button" onClick={() => completeReview(experiment)} disabled={reviewing} className="rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50">{reviewing ? 'Saving…' : 'Complete review'}</button><button type="button" onClick={() => setReviewingId('')} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-500">Cancel</button></div></div>}</div>}
      </article>;
    })}</div>}
  </div>;
}
