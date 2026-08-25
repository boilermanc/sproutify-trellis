import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, Check, CheckCircle2, Clapperboard, Clock3, FileCode2, Film,
  GitBranch, Loader2, Music2, Plus, RefreshCw, RotateCcw, ShieldCheck, Sparkles,
  Square, Subtitles, Volume2,
} from 'lucide-react';
import type { Branch } from '../types';
import {
  cancelPromoJob, createPromoProject, getPromoProject, listPromoProjects, queuePromoJob,
  retryPromoJob, type PromoJob, type PromoProject, type PromoProjectDetail,
} from '../services/promoStudioService';

interface Props {
  branches: Branch[];
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const formatOptions = ['9:16', '16:9', '1:1'] as const;
const terminalJobs = new Set(['succeeded', 'failed', 'cancelled']);

const statusClass: Record<string, string> = {
  succeeded: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  ready: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  failed: 'border-rose-200 bg-rose-50 text-rose-700',
  cancelled: 'border-slate-200 bg-slate-100 text-slate-600',
  running: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  queued: 'border-amber-200 bg-amber-50 text-amber-700',
  draft: 'border-slate-200 bg-slate-100 text-slate-600',
};

const PromoStudio: React.FC<Props> = ({ branches, addToast }) => {
  const activeBranches = useMemo(() => branches.filter(branch => branch.is_active), [branches]);
  const [projects, setProjects] = useState<PromoProject[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<PromoProjectDetail | null>(null);
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [branchId, setBranchId] = useState('');
  const [targetSeconds, setTargetSeconds] = useState(10);
  const [formats, setFormats] = useState<Array<typeof formatOptions[number]>>(['9:16']);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [unavailable, setUnavailable] = useState<string | null>(null);

  const loadProjects = useCallback(async () => {
    try {
      setLoading(true);
      const rows = await listPromoProjects();
      setProjects(rows);
      setSelectedId(current => current || rows[0]?.id || '');
      setUnavailable(null);
    } catch (error) {
      setUnavailable(error instanceof Error ? error.message : 'Promo Studio is not deployed yet.');
    } finally { setLoading(false); }
  }, []);

  const loadDetail = useCallback(async (projectId: string) => {
    try {
      const result = await getPromoProject(projectId);
      setDetail(result);
      setProjects(current => current.map(project => project.id === result.project.id ? result.project : project));
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Could not load Promo Studio project.', 'error');
    }
  }, [addToast]);

  useEffect(() => { void loadProjects(); }, [loadProjects]);
  useEffect(() => { if (selectedId) void loadDetail(selectedId); else setDetail(null); }, [loadDetail, selectedId]);
  useEffect(() => { if (!branchId && activeBranches[0]) setBranchId(activeBranches[0].id); }, [activeBranches, branchId]);

  const createProject = async () => {
    if (!title.trim() || !prompt.trim() || !branchId || formats.length === 0) return;
    try {
      setBusy(true);
      const created = await createPromoProject({ title, prompt, branch_id: branchId, target_seconds: targetSeconds, formats });
      setProjects(current => [created.project, ...current]);
      setSelectedId(created.project.id);
      setTitle(''); setPrompt('');
      addToast('Promo Studio draft created.');
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Could not create Promo Studio project.', 'error');
    } finally { setBusy(false); }
  };

  const updateJob = (job: PromoJob) => setDetail(current => current ? {
    ...current, jobs: current.jobs.some(item => item.id === job.id)
      ? current.jobs.map(item => item.id === job.id ? job : item)
      : [job, ...current.jobs],
  } : current);

  const queueFoundationCheck = async () => {
    if (!selectedId) return;
    try {
      setBusy(true);
      const job = await queuePromoJob(selectedId, 'noop', { purpose: 'verify_promo_job_orchestration' });
      updateJob(job);
      addToast('Foundation check queued.');
    } catch (error) { addToast(error instanceof Error ? error.message : 'Could not queue foundation check.', 'error'); }
    finally { setBusy(false); }
  };

  const mutateJob = async (job: PromoJob, action: 'cancel' | 'retry') => {
    try {
      setBusy(true);
      updateJob(action === 'cancel' ? await cancelPromoJob(job.project_id, job.id) : await retryPromoJob(job.project_id, job.id));
    } catch (error) { addToast(error instanceof Error ? error.message : `Could not ${action} job.`, 'error'); }
    finally { setBusy(false); }
  };

  const manifest = detail?.revision?.manifest;
  const stages = manifest ? [
    { name: 'Evidence', icon: GitBranch, ready: !!manifest.evidence.repository && !!manifest.evidence.capture_environment, note: manifest.evidence.repository ? `${manifest.evidence.repository.full_name}@${manifest.evidence.repository.commit_sha.slice(0, 7)}` : 'Repository and capture environment required' },
    { name: 'Script', icon: FileCode2, ready: manifest.script.status === 'approved', note: manifest.script.approved_text ? `${manifest.script.phrases.length} timed phrase${manifest.script.phrases.length === 1 ? '' : 's'}` : 'Script has not been drafted' },
    { name: 'Voice', icon: Volume2, ready: !!manifest.voice.selected_take_id, note: manifest.voice.takes.length ? `${manifest.voice.takes.length} take${manifest.voice.takes.length === 1 ? '' : 's'}` : 'No voice takes yet' },
    { name: 'Music', icon: Music2, ready: !!manifest.music.selected_take_id, note: manifest.music.takes.length ? `${manifest.music.takes.length} take${manifest.music.takes.length === 1 ? '' : 's'}` : 'No music takes yet' },
    { name: 'Capture', icon: Film, ready: manifest.captures.scenarios.some(item => item.status === 'verified'), note: manifest.captures.scenarios.length ? `${manifest.captures.scenarios.length} scenario${manifest.captures.scenarios.length === 1 ? '' : 's'}` : 'No real UI capture scenario yet' },
    { name: 'Storyboard', icon: Clapperboard, ready: manifest.scenes.length > 0, note: manifest.scenes.length ? `${manifest.scenes.length} scene${manifest.scenes.length === 1 ? '' : 's'}` : 'No scenes yet' },
    { name: 'Captions', icon: Subtitles, ready: manifest.captions.cues.length > 0, note: manifest.captions.cues.length ? `${manifest.captions.cues.length} cue${manifest.captions.cues.length === 1 ? '' : 's'}` : 'Awaiting voice timing' },
    { name: 'Render', icon: Sparkles, ready: !!manifest.render, note: manifest.render ? `${manifest.render.composition} · ${manifest.render.fps} fps` : 'Render settings not prepared' },
  ] : [];

  if (loading) return <div className="flex min-h-[55vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-violet-600" /></div>;
  if (unavailable) return (
    <div className="mx-auto max-w-3xl py-16"><div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-8">
      <AlertCircle className="h-8 w-8 text-amber-600" /><h2 className="mt-4 text-xl font-black text-slate-900">Promo Studio foundation is ready locally</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{unavailable}</p>
      <p className="mt-3 text-sm leading-6 text-slate-500">Apply the Promo Studio migration and deploy the promo-studio Edge Function to enable this workspace.</p>
      <button onClick={() => void loadProjects()} className="mt-5 rounded-xl bg-slate-950 px-4 py-2 text-sm font-bold text-white">Try again</button>
    </div></div>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-16">
      <section className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-950 via-violet-950 to-fuchsia-900 p-8 text-white shadow-xl">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div><div className="flex items-center gap-3"><div className="rounded-2xl bg-white/10 p-3"><Clapperboard className="h-7 w-7" /></div><div><p className="text-xs font-black uppercase tracking-[0.25em] text-violet-200">Evidence-led creative</p><h1 className="text-3xl font-black">Promo Studio</h1></div></div>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-violet-100">Build branch promos from verified repository evidence, real UI capture, timed voice and music, and reproducible renders.</p></div>
          <div className="flex items-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-xs font-bold"><ShieldCheck className="h-4 w-4 text-emerald-300" /> Claims and provenance stay gated</div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="space-y-5">
          <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-widest text-violet-600">New project</p><h2 className="mt-1 text-lg font-black text-slate-900">Start with intent</h2></div><Plus className="h-5 w-5 text-slate-400" /></div>
            <div className="mt-5 space-y-3">
              <input value={title} onChange={event => setTitle(event.target.value)} maxLength={160} placeholder="Project title" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-violet-400" />
              <textarea value={prompt} onChange={event => setPrompt(event.target.value)} maxLength={12000} rows={4} placeholder="What should this promo communicate?" className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-violet-400" />
              <select value={branchId} onChange={event => setBranchId(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-violet-400">
                <option value="">Choose a branch</option>{activeBranches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
              <div className="grid grid-cols-3 gap-2">{formatOptions.map(format => <button key={format} type="button" onClick={() => setFormats(current => current.includes(format) ? current.filter(item => item !== format) : [...current, format])} className={`rounded-xl border px-2 py-2 text-xs font-black ${formats.includes(format) ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-slate-200 text-slate-500'}`}>{formats.includes(format) && <Check className="mr-1 inline h-3 w-3" />}{format}</button>)}</div>
              <label className="block text-xs font-bold text-slate-500">Target seconds<input type="number" min={1} max={600} value={targetSeconds} onChange={event => setTargetSeconds(Number(event.target.value))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-violet-400" /></label>
              <button type="button" disabled={busy || !title.trim() || !prompt.trim() || !branchId || formats.length === 0} onClick={() => void createProject()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create draft</button>
            </div>
          </section>

          <section className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between px-1"><h2 className="text-xs font-black uppercase tracking-widest text-slate-500">Projects</h2><button onClick={() => void loadProjects()} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><RefreshCw className="h-4 w-4" /></button></div>
            <div className="mt-2 space-y-2">{projects.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No Promo Studio projects yet.</p> : projects.map(project => <button key={project.id} type="button" onClick={() => setSelectedId(project.id)} className={`w-full rounded-2xl border p-3 text-left ${selectedId === project.id ? 'border-violet-300 bg-violet-50' : 'border-slate-100 hover:border-slate-200'}`}><div className="flex items-start justify-between gap-2"><span className="text-sm font-black text-slate-900">{project.title}</span><span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${statusClass[project.status] || statusClass.draft}`}>{project.status.replace(/_/g, ' ')}</span></div><p className="mt-2 text-xs text-slate-500">{project.target_seconds}s · {project.requested_formats.join(' / ')}</p></button>)}</div>
          </section>
        </aside>

        <main className="space-y-6">
          {!detail || !manifest ? <section className="flex min-h-[420px] items-center justify-center rounded-[2rem] border border-dashed border-slate-300 bg-white p-8 text-center"><div><Clapperboard className="mx-auto h-9 w-9 text-slate-300" /><h2 className="mt-4 text-lg font-black text-slate-800">Choose or create a promo</h2><p className="mt-2 text-sm text-slate-500">The project workspace will show only evidence and stages that actually exist.</p></div></section> : <>
            <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-widest text-violet-600">Revision {detail.revision?.revision_number}</p><h2 className="mt-1 text-2xl font-black text-slate-950">{detail.project.title}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{detail.project.request_prompt}</p></div><div className="flex gap-2"><button onClick={() => void loadDetail(detail.project.id)} className="rounded-xl border border-slate-200 p-2.5 text-slate-500"><RefreshCw className="h-4 w-4" /></button><button disabled={busy} onClick={() => void queueFoundationCheck()} className="flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-50"><Sparkles className="h-4 w-4" /> Test job foundation</button></div></div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl bg-slate-50 p-3"><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Branch</p><p className="mt-1 text-sm font-bold text-slate-800">{manifest.promo.branch.display_name}</p></div><div className="rounded-2xl bg-slate-50 p-3"><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Deliverables</p><p className="mt-1 text-sm font-bold text-slate-800">{manifest.promo.formats.join(' · ')}</p></div><div className="rounded-2xl bg-slate-50 p-3"><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Fingerprint</p><p className="mt-1 truncate font-mono text-xs text-slate-700" title={detail.revision?.manifest_fingerprint}>{detail.revision?.manifest_fingerprint.slice(0, 16)}…</p></div></div>
            </section>

            <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-widest text-slate-400">Production gates</p><h2 className="mt-1 text-xl font-black text-slate-900">What is real, and what is missing</h2></div><ShieldCheck className="h-6 w-6 text-violet-500" /></div><div className="mt-5 grid gap-3 md:grid-cols-2">{stages.map(stage => <div key={stage.name} className="flex items-start gap-3 rounded-2xl border border-slate-100 p-4"><div className={`rounded-xl p-2 ${stage.ready ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>{stage.ready ? <CheckCircle2 className="h-4 w-4" /> : <stage.icon className="h-4 w-4" />}</div><div><p className="text-sm font-black text-slate-800">{stage.name}</p><p className="mt-1 text-xs leading-5 text-slate-500">{stage.note}</p></div></div>)}</div></section>

            <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-widest text-slate-400">Durable orchestration</p><h2 className="mt-1 text-xl font-black text-slate-900">Jobs</h2></div><Clock3 className="h-5 w-5 text-slate-400" /></div><div className="mt-4 space-y-2">{detail.jobs.length === 0 ? <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No jobs queued for this revision.</p> : detail.jobs.map(job => <div key={job.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 p-4"><div><div className="flex items-center gap-2"><p className="text-sm font-black text-slate-800">{job.job_type.replace(/_/g, ' ')}</p><span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${statusClass[job.status] || statusClass.draft}`}>{job.status.replace(/_/g, ' ')}</span></div><p className="mt-1 text-xs text-slate-500">Attempt {job.attempt_count} · {job.progress}%{job.error_message ? ` · ${job.error_message}` : ''}</p></div><div className="flex gap-2">{!terminalJobs.has(job.status) && job.status !== 'cancel_requested' && <button disabled={busy} onClick={() => void mutateJob(job, 'cancel')} className="rounded-lg border border-slate-200 p-2 text-slate-500"><Square className="h-3.5 w-3.5" /></button>}{['failed', 'cancelled'].includes(job.status) && <button disabled={busy} onClick={() => void mutateJob(job, 'retry')} className="rounded-lg border border-slate-200 p-2 text-slate-500"><RotateCcw className="h-3.5 w-3.5" /></button>}</div></div>)}</div></section>
          </>}
        </main>
      </div>
    </div>
  );
};

export default PromoStudio;
