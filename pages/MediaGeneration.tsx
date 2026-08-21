import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Film, Loader2, Play, Plus, RefreshCw, RotateCcw, Square, Upload } from 'lucide-react';
import type { Branch, MediaGenerationJob, MediaGenerationProject, MediaGenerationTaskType, MediaModelCatalogEntry } from '../types';
import {
  cancelMediaGenerationJob,
  createMediaGenerationJob,
  createMediaProject,
  getMediaGenerationJob,
  getMediaGenerationJobs,
  getMediaModels,
  getMediaProjects,
  retryMediaGenerationJob,
  uploadMediaAsset,
} from '../services/mediaGenerationService';
import { useMediaGenerationPoller } from '../hooks/useMediaGenerationPoller';

interface Props {
  branches: Branch[];
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const terminal = new Set(['succeeded', 'failed', 'cancelled']);
const taskLabels: Record<MediaGenerationTaskType, string> = {
  text_to_video: 'Text to video',
  image_to_video: 'Image to video',
  audio_driven_avatar: 'Talking character',
  video_continuation: 'Continue a video',
};

const statusTone: Record<string, string> = {
  succeeded: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  failed: 'bg-rose-50 text-rose-700 border-rose-200',
  cancelled: 'bg-slate-100 text-slate-600 border-slate-200',
  running: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  submitted: 'bg-amber-50 text-amber-700 border-amber-200',
  queued: 'bg-amber-50 text-amber-700 border-amber-200',
};

const MediaGeneration: React.FC<Props> = ({ branches, addToast }) => {
  const [projects, setProjects] = useState<MediaGenerationProject[]>([]);
  const [models, setModels] = useState<MediaModelCatalogEntry[]>([]);
  const [jobs, setJobs] = useState<MediaGenerationJob[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectBranch, setNewProjectBranch] = useState('');
  const [modelId, setModelId] = useState('longcat-video-base');
  const [taskType, setTaskType] = useState<MediaGenerationTaskType>('text_to_video');
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [referenceImage, setReferenceImage] = useState<File | null>(null);
  const [drivingAudio, setDrivingAudio] = useState<File | null>(null);
  const [sourceVideo, setSourceVideo] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [resultUrls, setResultUrls] = useState<Record<string, string>>({});

  const selectedModel = useMemo(() => models.find(model => model.id === modelId), [modelId, models]);
  const activeIds = useMemo(() => jobs.filter(job => !terminal.has(job.status)).map(job => job.id), [jobs]);

  const replaceJob = useCallback((job: MediaGenerationJob) => {
    setJobs(current => current.some(item => item.id === job.id)
      ? current.map(item => item.id === job.id ? job : item)
      : [job, ...current]);
  }, []);
  useMediaGenerationPoller(activeIds, replaceJob, activeIds.length > 0);

  const loadFoundation = useCallback(async () => {
    try {
      setLoading(true);
      const [projectRows, modelRows] = await Promise.all([getMediaProjects(), getMediaModels()]);
      setProjects(projectRows);
      setModels(modelRows);
      setSelectedProjectId(current => current || projectRows[0]?.id || '');
      setModelId(current => modelRows.some(model => model.id === current) ? current : modelRows[0]?.id || current);
      setUnavailable(null);
    } catch (error) {
      setUnavailable(error instanceof Error ? error.message : 'Media Generation is not deployed yet.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadFoundation(); }, [loadFoundation]);
  useEffect(() => {
    if (!selectedProjectId) { setJobs([]); return; }
    getMediaGenerationJobs(selectedProjectId).then(setJobs).catch(error => addToast(error instanceof Error ? error.message : 'Could not load generation jobs.', 'error'));
  }, [addToast, selectedProjectId]);
  useEffect(() => {
    if (!selectedModel?.task_types.includes(taskType)) setTaskType(selectedModel?.task_types[0] || 'text_to_video');
  }, [selectedModel, taskType]);

  const createProject = async () => {
    if (!newProjectName.trim()) return;
    try {
      setBusy(true);
      const project = await createMediaProject({ name: newProjectName, branch_id: newProjectBranch || null });
      setProjects(current => [project, ...current]);
      setSelectedProjectId(project.id);
      setNewProjectName('');
      addToast('Generation project created.');
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Could not create project.', 'error');
    } finally { setBusy(false); }
  };

  const addInput = async (file: File, assetType: string, role: string) => {
    const asset = await uploadMediaAsset(selectedProjectId, file, { asset_type: assetType, role });
    return { asset_id: asset.id, input_role: role as any };
  };

  const submit = async () => {
    if (!selectedProjectId || !prompt.trim()) return;
    if ((taskType === 'image_to_video' || taskType === 'audio_driven_avatar') && !referenceImage) return addToast('Choose a reference image first.', 'error');
    if (taskType === 'audio_driven_avatar' && !drivingAudio) return addToast('Choose the character audio first.', 'error');
    if (taskType === 'video_continuation' && !sourceVideo) return addToast('Choose a source video first.', 'error');
    try {
      setBusy(true);
      const inputs: any[] = [];
      if (referenceImage && (taskType === 'image_to_video' || taskType === 'audio_driven_avatar')) inputs.push(await addInput(referenceImage, taskType === 'image_to_video' ? 'source_image' : 'reference_image', taskType === 'image_to_video' ? 'source_image' : 'reference_image'));
      if (drivingAudio && taskType === 'audio_driven_avatar') inputs.push(await addInput(drivingAudio, 'reference_audio', 'driving_audio'));
      if (sourceVideo && taskType === 'video_continuation') inputs.push(await addInput(sourceVideo, 'source_video', 'source_video'));
      const job = await createMediaGenerationJob({
        project_id: selectedProjectId,
        model_id: modelId,
        task_type: taskType,
        prompt,
        negative_prompt: negativePrompt || undefined,
        parameters: modelId === 'longcat-video-avatar-1.5' ? { steps: 8 } : {},
        inputs,
      });
      replaceJob(job);
      setPrompt(''); setNegativePrompt(''); setReferenceImage(null); setDrivingAudio(null); setSourceVideo(null);
      addToast('GPU generation queued.');
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Could not queue generation.', 'error');
    } finally { setBusy(false); }
  };

  const showResult = async (jobId: string) => {
    try {
      const detail = await getMediaGenerationJob(jobId);
      const url = String(detail.outputs[0]?.signed_url || '');
      if (!url) throw new Error('The output file is not available.');
      setResultUrls(current => ({ ...current, [jobId]: url }));
    } catch (error) { addToast(error instanceof Error ? error.message : 'Could not open result.', 'error'); }
  };

  if (loading) return <div className="flex min-h-[55vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-indigo-600" /></div>;
  if (unavailable) return (
    <div className="mx-auto max-w-3xl py-16"><div className="rounded-3xl border border-amber-200 bg-amber-50 p-8"><AlertCircle className="h-8 w-8 text-amber-600" /><h2 className="mt-4 text-xl font-black text-slate-900">Media Generation foundation is ready locally</h2><p className="mt-2 text-sm leading-6 text-slate-600">{unavailable}</p><button onClick={() => void loadFoundation()} className="mt-5 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white">Try again</button></div></div>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-16">
      <div className="rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-violet-900 p-8 text-white shadow-xl">
        <div className="flex items-center gap-3"><div className="rounded-2xl bg-white/10 p-3"><Film className="h-7 w-7" /></div><div><p className="text-xs font-black uppercase tracking-[0.25em] text-indigo-200">On-demand GPU</p><h1 className="text-3xl font-black">Media Generation</h1></div></div>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-indigo-100">Create video with LongCat now and add other GPU providers later. Inputs stay private, every attempt is tracked, and existing Trellis editors remain intact.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <aside className="space-y-5">
          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-500">Project</h2>
            <select value={selectedProjectId} onChange={event => setSelectedProjectId(event.target.value)} className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold">
              <option value="">Choose a project</option>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
            <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
              <input value={newProjectName} onChange={event => setNewProjectName(event.target.value)} placeholder="New project name" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
              <select value={newProjectBranch} onChange={event => setNewProjectBranch(event.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"><option value="">Personal project</option>{branches.filter(branch => branch.is_active).map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select>
              <button disabled={busy || !newProjectName.trim()} onClick={() => void createProject()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2.5 text-sm font-bold text-white disabled:opacity-40"><Plus className="h-4 w-4" /> Create project</button>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-black uppercase tracking-wider text-slate-500">Model & mode</h2>
            <label className="mt-3 block text-xs font-bold text-slate-500">Model<select value={modelId} onChange={event => setModelId(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-900">{models.map(model => <option key={model.id} value={model.id}>{model.display_name}</option>)}</select></label>
            <label className="mt-3 block text-xs font-bold text-slate-500">Generation mode<select value={taskType} onChange={event => setTaskType(event.target.value as MediaGenerationTaskType)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-900">{(selectedModel?.task_types || []).map(task => <option key={task} value={task}>{taskLabels[task]}</option>)}</select></label>
            {modelId === 'longcat-video-avatar-1.5' && <p className="mt-3 rounded-xl bg-indigo-50 p-3 text-xs leading-5 text-indigo-700">Avatar 1.5 uses its required eight-step distilled mode and is configured for a two-GPU worker.</p>}
          </section>
        </aside>

        <main className="space-y-6">
          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-black text-slate-900">Describe the shot</h2>
            <textarea value={prompt} onChange={event => setPrompt(event.target.value)} rows={5} placeholder="Describe the subject, action, setting, camera, and mood…" className="mt-4 w-full rounded-2xl border border-slate-200 p-4 text-sm leading-6 outline-none focus:border-indigo-400" />
            <textarea value={negativePrompt} onChange={event => setNegativePrompt(event.target.value)} rows={2} placeholder="Optional: what should the model avoid?" className="mt-3 w-full rounded-2xl border border-slate-200 p-4 text-sm outline-none focus:border-indigo-400" />
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {(taskType === 'image_to_video' || taskType === 'audio_driven_avatar') && <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-slate-300 p-4 text-sm font-semibold text-slate-600"><Upload className="h-5 w-5 text-indigo-600" /><span>{referenceImage?.name || (taskType === 'image_to_video' ? 'Choose source image' : 'Choose character image')}</span><input type="file" accept="image/*" className="hidden" onChange={event => setReferenceImage(event.target.files?.[0] || null)} /></label>}
              {taskType === 'audio_driven_avatar' && <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-slate-300 p-4 text-sm font-semibold text-slate-600"><Upload className="h-5 w-5 text-indigo-600" /><span>{drivingAudio?.name || 'Choose character audio'}</span><input type="file" accept="audio/*" className="hidden" onChange={event => setDrivingAudio(event.target.files?.[0] || null)} /></label>}
              {taskType === 'video_continuation' && <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-slate-300 p-4 text-sm font-semibold text-slate-600"><Upload className="h-5 w-5 text-indigo-600" /><span>{sourceVideo?.name || 'Choose source video'}</span><input type="file" accept="video/*" className="hidden" onChange={event => setSourceVideo(event.target.files?.[0] || null)} /></label>}
            </div>
            <button disabled={busy || !selectedProjectId || !prompt.trim()} onClick={() => void submit()} className="mt-5 flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-black text-white shadow-lg shadow-indigo-200 disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />} Generate</button>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center justify-between"><div><h2 className="text-lg font-black text-slate-900">Queue & results</h2><p className="mt-1 text-xs text-slate-500">{activeIds.length} active · {jobs.length} total</p></div><button disabled={!selectedProjectId} onClick={() => selectedProjectId && getMediaGenerationJobs(selectedProjectId).then(setJobs).catch(error => addToast(error instanceof Error ? error.message : 'Could not refresh jobs.', 'error'))} className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:text-indigo-600"><RefreshCw className="h-4 w-4" /></button></div>
            <div className="mt-5 space-y-3">
              {jobs.length === 0 && <div className="rounded-2xl bg-slate-50 p-8 text-center text-sm text-slate-500">Your first generation will appear here.</div>}
              {jobs.map(job => <div key={job.id} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><span className={`rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${statusTone[job.status] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>{job.status.replace('_', ' ')}</span><span className="text-xs font-semibold text-slate-400">{taskLabels[job.task_type]}</span></div><p className="mt-2 line-clamp-2 text-sm font-semibold text-slate-800">{job.prompt}</p></div><div className="flex gap-2">{!terminal.has(job.status) && <button title="Cancel" onClick={() => cancelMediaGenerationJob(job.id).then(replaceJob).catch(error => addToast(error.message, 'error'))} className="rounded-lg border border-slate-200 p-2 text-slate-500"><Square className="h-4 w-4" /></button>}{job.status === 'failed' && job.attempt_count < job.max_attempts && <button title="Retry" onClick={() => retryMediaGenerationJob(job.id).then(replaceJob).catch(error => addToast(error.message, 'error'))} className="rounded-lg border border-slate-200 p-2 text-slate-500"><RotateCcw className="h-4 w-4" /></button>}{job.status === 'succeeded' && <button onClick={() => void showResult(job.id)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">Open result</button>}</div></div>
                {!terminal.has(job.status) && <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-500 transition-all" style={{ width: `${Math.max(2, job.progress)}%` }} /></div>}
                {job.error_message && <p className="mt-3 flex items-start gap-2 rounded-xl bg-rose-50 p-3 text-xs text-rose-700"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{job.error_message}</p>}
                {resultUrls[job.id] && <video controls src={resultUrls[job.id]} className="mt-4 aspect-video w-full rounded-xl bg-black" />}
                {job.status === 'succeeded' && !resultUrls[job.id] && <p className="mt-3 flex items-center gap-2 text-xs font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" />Output stored privately and ready to review.</p>}
              </div>)}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};

export default MediaGeneration;
