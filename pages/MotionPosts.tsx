import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarClock, CheckCircle2, Download, Film, ImagePlus, Loader2, Music2,
  RefreshCw, Sparkles, Type, Upload, Wand2, XCircle,
} from 'lucide-react';
import { Branch, BranchContext, MotionPostAudioOption, MotionPostJob } from '../types';
import {
  createMotionPost, listMotionPostAudio, listMotionPosts, pollMotionPost,
  uploadMotionPostSource,
} from '../services/motionPostService';
import MotionPostFinishingEditor from '../components/motion-posts/MotionPostFinishingEditor';
import MotionPostPublishDialog from '../components/motion-posts/MotionPostPublishDialog';

interface MotionPostsProps {
  branches: Branch[];
  branchContext: BranchContext;
  selectedBranchSlug: string;
  addToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const ACTIVE = new Set(['queued', 'generating', 'mixing', 'publishing']);
const STATUS_LABEL: Record<string, string> = {
  queued: 'Queued', generating: 'Animating', mixing: 'Adding music', ready: 'Ready',
  failed: 'Failed', publishing: 'Publishing', published: 'Published', cancelled: 'Cancelled',
};
const PRICE_PER_SECOND: Record<string, number> = { '480p': 0.08, '720p': 0.14, '1080p': 0.25 };

export default function MotionPosts({ branches, selectedBranchSlug, addToast }: MotionPostsProps) {
  const branchSlug = selectedBranchSlug;
  const selectedBranch = branches.find(branch => branch.slug === branchSlug && branch.is_active);
  const branchId = selectedBranch?.id || '';
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState<5 | 7 | 10 | 15>(7);
  const [resolution, setResolution] = useState<'480p' | '720p' | '1080p'>('720p');
  const [caption, setCaption] = useState('');
  const [tracks, setTracks] = useState<MotionPostAudioOption[]>([]);
  const [audioKey, setAudioKey] = useState('');
  const [audioStart, setAudioStart] = useState(0);
  const [jobs, setJobs] = useState<MotionPostJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [finishingJob, setFinishingJob] = useState<MotionPostJob | null>(null);
  const [publishingJob, setPublishingJob] = useState<MotionPostJob | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [workspace, setWorkspace] = useState<'create' | 'library'>('create');
  const [draftStep, setDraftStep] = useState<2 | 3 | 4>(2);

  const branchJobs = jobs.filter(job => job.branch_id === branchId || (!job.branch_id && job.branch_slug === branchSlug));
  const selectedAudio = useMemo(
    () => tracks.find(track => `${track.source_type}:${track.id}` === audioKey) || null,
    [tracks, audioKey],
  );
  const estimatedCost = useMemo(() => duration * PRICE_PER_SECOND[resolution] + 0.01, [duration, resolution]);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [nextJobs, nextTracks] = await Promise.all([listMotionPosts(), listMotionPostAudio()]);
      setJobs(nextJobs);
      setTracks(nextTracks);
    } catch (error) {
      if (!quiet) addToast(error instanceof Error ? error.message : 'Could not load Motion Posts.', 'error');
    } finally { if (!quiet) setLoading(false); }
  }, [addToast]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  useEffect(() => {
    const active = jobs.filter(job => ACTIVE.has(job.status)
      || ['queued', 'running'].includes(job.latest_finish?.status || '')
      || job.latest_publication?.status === 'publishing');
    if (!active.length) return;
    const timer = window.setInterval(async () => {
      try {
        const refreshed = await Promise.all(active.map(job => pollMotionPost(job.id)));
        setJobs(current => current.map(job => refreshed.find(next => next.id === job.id) || job));
      } catch { /* retain the last good state; next poll can recover */ }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [jobs]);

  const chooseFile = (next: File | null) => {
    if (!next) return;
    const imageExtension = /\.(?:jpe?g|jfif|png|webp|gif|avif)$/i.test(next.name);
    if (!next.type.startsWith('image/') && !imageExtension) { addToast('Choose an image file.', 'error'); return; }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setFile(next);
    setPreviewUrl(URL.createObjectURL(next));
    if (!title.trim()) setTitle(next.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' '));
  };

  const submit = async () => {
    if (!branchId) { addToast('Choose a branch in the header first.', 'error'); return; }
    if (!file) { addToast('Upload the still image you want to animate.', 'error'); return; }
    if (!title.trim()) { addToast('Add a post title.', 'error'); return; }
    if (prompt.trim().length < 12) { addToast('Describe the movement you want.', 'error'); return; }
    if (!caption.trim()) { addToast('Add an Instagram caption before animating.', 'error'); return; }
    setSubmitting(true);
    try {
      const source = await uploadMotionPostSource(file);
      const job = await createMotionPost({
        branch_id: branchId, title: title.trim(), prompt,
        source_path: source.path, duration_seconds: duration, resolution,
        audio: selectedAudio, audio_start_seconds: audioStart, caption,
      });
      setJobs(current => [job, ...current]);
      setWorkspace('library');
      addToast(selectedAudio ? 'Animation started. Your selected music will be mixed when it finishes.' : 'Animation started.', 'success');
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Could not start the Motion Post.', 'error');
    } finally { setSubmitting(false); }
  };

  if (!selectedBranch) return <div className="space-y-6 pb-20">
    <header>
      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.24em] text-violet-600"><Sparkles size={14} /> Creative Studio</div>
      <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Motion Posts</h1>
    </header>
    <section className="rounded-2xl border border-violet-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-black uppercase tracking-widest text-violet-700">Get started</p>
      <h2 className="mt-2 text-xl font-black text-slate-900">{branchSlug ? 'Loading selected branch' : 'Choose a branch to begin'}</h2>
      <p className="mt-2 max-w-xl text-sm text-slate-600">Use the branch switcher in the top header. Then upload an image, describe its motion, review the settings and cost, and start the animation.</p>
    </section>
  </div>;

  return <div className="space-y-8 pb-20">
    {finishingJob && <MotionPostFinishingEditor job={finishingJob} branches={branches} onClose={() => setFinishingJob(null)} onQueued={() => load(true)} addToast={addToast} />}
    {publishingJob && <MotionPostPublishDialog job={publishingJob} onClose={() => setPublishingJob(null)} onQueued={() => load(true)} addToast={addToast} />}
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.24em] text-violet-600"><Sparkles size={14} /> Creative Studio</div>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Motion Posts</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">Turn an image for {selectedBranch.name} into a vertical animation, then finish and schedule the Reel.</p>
      </div>
      <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black uppercase tracking-wider text-slate-600 disabled:opacity-50">
        <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
      </button>
    </header>

    {branchJobs.length > 0 && <nav aria-label="Motion Posts workspace" className="flex gap-2">
      <button type="button" onClick={() => setWorkspace('create')} aria-pressed={workspace === 'create'} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold">Create a post</button>
      <button type="button" onClick={() => setWorkspace('library')} aria-pressed={workspace === 'library'} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold">Library ({branchJobs.length})</button>
    </nav>}

    {workspace === 'create' && <nav aria-label="Motion Post steps" className="flex flex-wrap gap-2">
      {([2, 3, 4] as const).map(step => <button type="button" key={step} disabled={step > 2 && !file || step === 4 && (!title.trim() || prompt.trim().length < 12 || !caption.trim())} onClick={() => setDraftStep(step)} aria-current={draftStep === step ? 'step' : undefined} className={`min-h-11 rounded-xl border px-4 py-2 text-sm font-bold disabled:opacity-40 ${draftStep === step ? 'border-violet-600 bg-violet-600 text-white' : 'border-slate-200 bg-white text-slate-600'}`}>{step === 2 ? '1. Image' : step === 3 ? '2. Post details' : '3. Review and animate'}</button>)}
    </nav>}

    {workspace === 'create' && <section className="mx-auto max-w-3xl">
      {draftStep === 2 && <div className="border border-slate-800 bg-slate-950 p-4">
        <h2 className="mb-4 text-sm font-black text-white">Upload the image to animate</h2>
        <button type="button" onClick={() => fileInput.current?.click()} className="group relative flex aspect-[9/16] max-h-[420px] w-full items-center justify-center overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-900">
          {previewUrl ? <img src={previewUrl} alt="Motion Post source preview" className="h-full w-full object-cover" /> : <div className="px-8 text-center text-slate-400"><ImagePlus className="mx-auto" size={34} /><p className="mt-4 text-sm font-black text-white">Upload the image to animate</p><p className="mt-1 text-xs">Portrait images work best for Instagram Reels.</p></div>}
          <span className="absolute bottom-4 right-4 inline-flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white backdrop-blur"><Upload size={13} /> {previewUrl ? 'Replace' : 'Browse'}</span>
        </button>
        <input ref={fileInput} type="file" accept="image/*,.jfif" className="hidden" onChange={event => { chooseFile(event.target.files?.[0] || null); event.target.value = ''; }} />
        <button type="button" disabled={!file} onClick={() => setDraftStep(3)} className="mt-4 min-h-11 rounded-xl bg-violet-600 px-5 py-2 text-sm font-bold text-white disabled:opacity-40">Next: post details</button>
      </div>}

      {draftStep !== 2 && <div className="border border-slate-200 bg-white p-6 lg:p-8">
        {draftStep === 3 && <>
        <h2 className="text-lg font-black text-slate-900">Write the post</h2>
        <p className="mt-1 text-xs text-slate-500">Creating for {selectedBranch.name}. Change branches in the top header.</p>
        <label className="mt-5 block text-xs font-bold text-slate-600">Post title<input value={title} onChange={event => setTitle(event.target.value)} maxLength={120} placeholder="Name this post" className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" /></label>

        <label className="mt-5 block text-xs font-bold text-slate-600">Describe the motion<textarea value={prompt} onChange={event => setPrompt(event.target.value)} rows={6} maxLength={1200} placeholder="Describe one camera move and the subtle movement you want in the image." className="mt-1.5 w-full resize-none rounded-xl border border-violet-200 bg-violet-50/40 px-3 py-3 text-sm leading-relaxed outline-none focus:border-violet-500" /></label>
        <p className="mt-2 text-[11px] text-slate-400">One shot and one emotional beat work best. Trellis removes emails, phone numbers, payment numbers, and API-like secrets before sending the prompt.</p>

        <label className="mt-5 block text-xs font-bold text-slate-600">Instagram caption<textarea value={caption} onChange={event => setCaption(event.target.value)} rows={4} maxLength={2200} placeholder="Write the caption that will accompany the Reel." className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm" /></label>

        <div className="mt-5 flex justify-between gap-3"><button type="button" onClick={() => setDraftStep(2)} className="min-h-11 px-3 text-sm font-bold text-slate-600">Back to image</button><button type="button" disabled={!title.trim() || prompt.trim().length < 12 || !caption.trim()} onClick={() => setDraftStep(4)} className="min-h-11 rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">Next: review settings</button></div>
        </>}
        {draftStep === 4 && <>
        <h2 className="text-lg font-black text-slate-900">Review settings and cost</h2>
        <p className="mt-2 text-sm text-slate-600">{title} for {selectedBranch.name}. Music is optional.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div><p className="text-xs font-bold text-slate-600">Duration</p><div className="mt-1.5 grid grid-cols-4 gap-2">{([5, 7, 10, 15] as const).map(value => <button key={value} type="button" onClick={() => setDuration(value)} className={`rounded-xl border px-2 py-2.5 text-xs font-black ${duration === value ? 'border-violet-600 bg-violet-600 text-white' : 'border-slate-200 text-slate-600'}`}>{value}s</button>)}</div></div>
          <label className="text-xs font-bold text-slate-600">Generation quality<select value={resolution} onChange={event => setResolution(event.target.value as typeof resolution)} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm"><option value="480p">480p draft</option><option value="720p">720p recommended</option><option value="1080p">1080p final</option></select></label>
        </div>

        <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-center gap-2"><Music2 size={16} className="text-emerald-700" /><p className="text-xs font-black uppercase tracking-wider text-emerald-900">Optional owned music</p></div>
          <select value={audioKey} onChange={event => setAudioKey(event.target.value)} className="mt-3 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm"><option value="">No music — keep generated clip silent</option>{tracks.map(track => <option key={`${track.source_type}-${track.id}`} value={`${track.source_type}:${track.id}`}>{track.artist ? `${track.artist} — ` : ''}{track.title}</option>)}</select>
          {selectedAudio && <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_130px]"><audio controls src={selectedAudio.audio_url} className="h-9 w-full" /><label className="text-[10px] font-black uppercase tracking-wider text-emerald-800">Start at (seconds)<input type="number" min="0" step="1" value={audioStart} onChange={event => setAudioStart(Math.max(0, Number(event.target.value) || 0))} className="mt-1 w-full rounded-lg border border-emerald-200 bg-white px-2 py-1.5 text-sm font-normal text-slate-800" /></label></div>}
          {!loading && tracks.length === 0 && <p className="mt-2 text-xs text-amber-700">No owned Studio or generated tracks are ready yet. The animation can still be generated without music.</p>}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t border-slate-100 pt-5">
          <div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Estimated xAI cost</p><p className="text-lg font-black text-slate-900">${estimatedCost.toFixed(2)} <span className="text-xs font-bold text-slate-400">per attempt</span></p></div>
          <button type="button" onClick={submit} disabled={submitting || !file || !branchId || !title.trim() || prompt.trim().length < 12 || !caption.trim()} className="inline-flex min-h-11 items-center gap-2 bg-violet-600 px-6 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">
            {submitting ? <Loader2 size={17} className="animate-spin" /> : <Wand2 size={17} />} {submitting ? 'Starting…' : 'Animate post'}
          </button>
        </div>
        <button type="button" onClick={() => setDraftStep(3)} className="mt-4 min-h-11 text-sm font-bold text-slate-600">Back to post details</button>
        </>}
      </div>}
    </section>}

    {workspace === 'library' && <section>
      <div className="mb-4"><div className="flex items-center gap-2"><Film size={18} className="text-violet-600" /><h2 className="text-lg font-black text-slate-900">Motion Post Library for {selectedBranch.name}</h2></div><p className="mt-1 text-xs text-slate-500">When an animation is ready, add text if needed, then schedule the Reel.</p></div>
      {loading ? <div className="flex justify-center border border-slate-200 bg-white py-16"><Loader2 className="animate-spin text-violet-600" /></div> : branchJobs.length === 0 ? <div className="border border-dashed border-slate-300 bg-white py-16 text-center text-sm text-slate-400">Your generated Motion Posts will appear here.</div> : <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{branchJobs.map(job => {
        const active = ACTIVE.has(job.status);
        const ready = job.status === 'ready' || job.status === 'published';
        const finish = job.latest_finish;
        const finishActive = finish?.status === 'queued' || finish?.status === 'running';
        const finalUrl = finish?.status === 'succeeded' && finish.output_url ? finish.output_url : job.output_url;
        const publication = job.latest_publication;
        const publicationActive = publication?.status === 'scheduled' || publication?.status === 'publishing';
        return <article key={job.id} className="overflow-hidden border border-slate-200 bg-white">
          <div className="relative aspect-[9/16] max-h-[560px] bg-slate-950">
            {finalUrl ? <video controls playsInline preload="metadata" src={finalUrl} className="h-full w-full object-cover" /> : job.source_url ? <img src={job.source_url} alt="Motion Post source" className="h-full w-full object-cover opacity-80" /> : null}
            {active && <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/60 text-white backdrop-blur-sm"><Loader2 className="animate-spin" size={28} /><p className="mt-3 text-xs font-black uppercase tracking-widest">{STATUS_LABEL[job.status]}</p><div className="mt-3 h-1.5 w-40 overflow-hidden rounded-full bg-white/20"><div className="h-full rounded-full bg-violet-400 transition-all" style={{ width: `${Math.max(5, job.progress)}%` }} /></div><p className="mt-2 text-[10px] text-white/70">{job.progress}%</p></div>}
            {finishActive && !active && <div className="absolute inset-x-3 bottom-3 flex items-center gap-2 rounded-xl bg-slate-950/80 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-white backdrop-blur"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Rendering text · {finish?.progress || 0}%</div>}
            {job.status === 'failed' && <div className="absolute inset-0 flex items-center justify-center bg-rose-950/70 p-6 text-center text-white backdrop-blur-sm"><div><XCircle className="mx-auto" /><p className="mt-3 text-xs font-black uppercase tracking-widest">Generation failed</p><p className="mt-2 text-xs text-rose-100">{job.error_message}</p></div></div>}
            {(job.status === 'published' || publication?.status === 'published') && <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-white"><CheckCircle2 size={12} /> Published</span>}
          </div>
          <div className="p-4">
            <div className="flex items-start justify-between gap-3"><div><h3 className="font-black text-slate-900">{job.title}</h3><p className="mt-1 text-[10px] font-black uppercase tracking-wider text-slate-400">{job.duration_seconds}s · {job.resolution} · {job.audio_title || 'No music'}</p></div><span className={`rounded-full px-2 py-1 text-[9px] font-black uppercase ${ready ? 'bg-emerald-100 text-emerald-700' : job.status === 'failed' ? 'bg-rose-100 text-rose-700' : 'bg-violet-100 text-violet-700'}`}>{STATUS_LABEL[job.status]}</span></div>
            <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-slate-500">{job.prompt}</p>
            {publication && <p className={`mt-3 rounded-xl px-3 py-2 text-[10px] font-bold ${publication.status === 'failed' || publication.status === 'needs_review' ? 'bg-rose-50 text-rose-700' : publication.status === 'published' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>Post Publisher: {publication.status.replace('_', ' ')}{publication.status === 'scheduled' ? ` for ${new Date(publication.scheduled_for).toLocaleString()}` : ''}</p>}
            {finish?.status === 'failed' && <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-[10px] font-bold text-rose-700">Text render failed: {finish.error_message || 'Unknown render error'}</p>}
            {ready && <div className="mt-4 flex flex-wrap gap-2">
              <a href={finalUrl!} download className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-600"><Download size={13} /> Download</a>
              <button type="button" onClick={() => setFinishingJob(job)} disabled={finishActive} className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-violet-700 disabled:opacity-40"><Type size={13} /> {finish?.status === 'succeeded' ? 'Edit text' : 'Add text'}</button>
              <button type="button" onClick={() => setPublishingJob(job)} disabled={!job.caption || finishActive || publicationActive} className="inline-flex min-h-11 items-center gap-1.5 bg-violet-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-40"><CalendarClock size={13} /> {publicationActive ? 'In queue' : 'Schedule Reel'}</button>
            </div>}
            <div className="mt-3 flex items-center justify-between text-[10px] text-slate-400"><span>{new Date(job.created_at).toLocaleString()}</span><span>{job.cost_actual != null ? `$${Number(job.cost_actual).toFixed(2)} actual` : `$${Number(job.cost_estimate).toFixed(2)} est.`}</span></div>
          </div>
        </article>;
      })}</div>}
    </section>}
  </div>;
}
