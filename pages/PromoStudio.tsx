import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle, Check, CheckCircle2, Clapperboard, Clock3, FileCode2, Film,
  GitBranch, Loader2, Music2, Plus, RefreshCw, RotateCcw, ShieldCheck, Sparkles,
  Square, Subtitles, Volume2,
} from 'lucide-react';
import type { Branch } from '../types';
import {
  adoptPromoCapture, adoptPromoMusic, adoptPromoVoiceAlignment, adoptPromoVoiceGeneration,
  approvePromoClaim, approvePromoScript, cancelPromoJob, createPromoProject, createPromoRevision, generatePromoCreativePlan,
  getPromoProject, listPromoBranchReadiness, listPromoProjects, queuePromoCapture, queuePromoJob, queuePromoMusicGeneration, queuePromoRender,
  queuePromoVoiceAlignment, queuePromoVoiceGeneration, retryPromoJob, reviewPromoPreview, schedulePromoFinalPublish, selectPromoPreview,
  signPromoAsset, upsertPromoBranchSource, type PromoBranchReadiness, type PromoJob, type PromoProject, type PromoProjectDetail,
} from '../services/promoStudioService';
import { PROMO_CAMERA_MOVEMENTS, PROMO_CAMERA_MOVEMENT_BY_ID } from '../features/promo-studio/schemas/cameraDirections';
import { planPromoPreviewWorkflow, type PromoGuidedStep } from '../features/promo-studio/guidedWorkflow';

interface Props {
  branches: Branch[];
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const formatOptions = ['9:16', '16:9', '1:1'] as const;
const terminalJobs = new Set(['succeeded', 'failed', 'cancelled']);
const localDateTimeValue = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

const statusClass: Record<string, string> = {
  verified: 'border-emerald-200 bg-emerald-50 text-emerald-700',
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
  const [scriptDrafts, setScriptDrafts] = useState<Record<string, { display_text: string; speech_text: string }>>({});
  const [publishCaption, setPublishCaption] = useState('');
  const [publishAt, setPublishAt] = useState(() => localDateTimeValue(new Date(Date.now() + 15 * 60 * 1000)));
  const [branchReadiness, setBranchReadiness] = useState<PromoBranchReadiness[]>([]);
  const [canConfigureBranches, setCanConfigureBranches] = useState(false);
  const [guidedActive, setGuidedActive] = useState(false);
  const [reviewMediaUrl, setReviewMediaUrl] = useState<string | null>(null);
  const lastGuidedAction = useRef('');
  const [sourceDraft, setSourceDraft] = useState({ repository: '', ref: 'main', permitted: 'package.json, README.md, src, app, public', prohibited: '', captureUrl: '', fixtureKey: '', authProfileKey: '' });
  const selectedReadiness = useMemo(() => branchReadiness.find(item => item.branch_id === branchId) || null, [branchId, branchReadiness]);
  const guidedStep = useMemo(() => planPromoPreviewWorkflow(detail), [detail]);
  const reviewAssetId = useMemo(() => {
    if (!detail || !guidedStep.target_id) return null;
    if (guidedStep.gate === 'review_preview') return guidedStep.target_id;
    if (guidedStep.gate === 'review_voice') return detail.voice_takes.find(take => take.id === guidedStep.target_id)?.audio_asset_id || null;
    if (guidedStep.gate === 'review_music') return detail.music_takes.find(take => take.id === guidedStep.target_id)?.audio_asset_id || null;
    return null;
  }, [detail, guidedStep.gate, guidedStep.target_id]);

  const loadProjects = useCallback(async () => {
    try {
      setLoading(true);
      const rows = await listPromoProjects();
      setProjects(rows);
      setSelectedId(current => current || rows[0]?.id || '');
      setUnavailable(null);
      try {
        const readiness = await listPromoBranchReadiness();
        setBranchReadiness(readiness.branches);
        setCanConfigureBranches(readiness.can_configure);
      } catch {
        setBranchReadiness([]);
        setCanConfigureBranches(false);
      }
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
  useEffect(() => {
    const source = selectedReadiness?.source;
    setSourceDraft({
      repository: source?.repository_full_name || '', ref: source?.default_ref || 'main',
      permitted: source?.permitted_paths.join(', ') || 'package.json, README.md, src, app, public',
      prohibited: source?.prohibited_paths.join(', ') || '', captureUrl: source?.capture_base_url || '',
      fixtureKey: source?.capture_fixture_key || '', authProfileKey: source?.capture_auth_profile_key || '',
    });
  }, [selectedReadiness?.branch_id, selectedReadiness?.source]);
  useEffect(() => {
    setScriptDrafts(Object.fromEntries((detail?.revision?.manifest.script.phrases || []).map(phrase => [phrase.id, {
      display_text: phrase.display_text, speech_text: phrase.speech_text,
    }])));
    const activeManifest = detail?.revision?.manifest;
    setPublishCaption(activeManifest ? [activeManifest.script.approved_text, activeManifest.request.cta].filter(Boolean).join('\n\n') : '');
    setPublishAt(localDateTimeValue(new Date(Date.now() + 15 * 60 * 1000)));
  }, [detail?.revision?.id]);
  useEffect(() => {
    let current = true;
    setReviewMediaUrl(null);
    if (!selectedId || !reviewAssetId) return () => { current = false; };
    void signPromoAsset(selectedId, reviewAssetId)
      .then(result => { if (current) setReviewMediaUrl(result.signed_url); })
      .catch(() => { if (current) setReviewMediaUrl(null); });
    return () => { current = false; };
  }, [reviewAssetId, selectedId]);

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

  const saveScriptDraft = async () => {
    if (!selectedId || !manifest) return;
    try {
      setBusy(true);
      const next = structuredClone(manifest);
      next.script.phrases = next.script.phrases.map(phrase => ({ ...phrase, ...scriptDrafts[phrase.id] }));
      next.script.approved_text = next.script.phrases.map(phrase => phrase.display_text).join(' ');
      next.script.status = 'review';
      next.promo.status = 'script_review';
      await createPromoRevision(selectedId, next, 'Edited Creative Director script draft');
      await loadDetail(selectedId);
      addToast('Script edits saved as a new immutable revision.');
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Could not save the script draft.', 'error');
    } finally { setBusy(false); }
  };

  const approveClaim = async (claimId: string) => {
    if (!selectedId) return;
    try {
      setBusy(true);
      await approvePromoClaim(selectedId, claimId);
      await loadDetail(selectedId);
      addToast('Claim approved in a new immutable revision.');
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Could not approve the claim.', 'error');
    } finally { setBusy(false); }
  };

  const approveScript = async () => {
    if (!selectedId) return;
    try {
      setBusy(true);
      await approvePromoScript(selectedId);
      await loadDetail(selectedId);
      lastGuidedAction.current = '';
      setGuidedActive(true);
      addToast('Script approved. The project is ready for audio review.');
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Could not approve the script.', 'error');
    } finally { setBusy(false); }
  };

  const saveBranchSource = async () => {
    if (!branchId || !sourceDraft.repository.trim() || !sourceDraft.ref.trim()) return;
    const paths = (value: string) => value.split(/[\n,]+/).map(item => item.trim()).filter(Boolean);
    try {
      setBusy(true);
      await upsertPromoBranchSource({
        branch_id: branchId, repository_full_name: sourceDraft.repository, default_ref: sourceDraft.ref,
        permitted_paths: paths(sourceDraft.permitted), prohibited_paths: paths(sourceDraft.prohibited),
        capture_base_url: sourceDraft.captureUrl.trim() || null,
        capture_fixture_key: sourceDraft.fixtureKey.trim() || null,
        capture_auth_profile_key: sourceDraft.authProfileKey.trim() || null,
      });
      const readiness = await listPromoBranchReadiness();
      setBranchReadiness(readiness.branches);
      setCanConfigureBranches(readiness.can_configure);
      addToast('Branch evidence source saved.');
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Could not save branch evidence source.', 'error');
    } finally { setBusy(false); }
  };

  const runAudioAction = async (action: () => Promise<unknown>, success: string, continueWorkflow = false) => {
    if (!selectedId) return;
    try {
      setBusy(true);
      await action();
      await loadDetail(selectedId);
      if (continueWorkflow) {
        lastGuidedAction.current = '';
        setGuidedActive(true);
      }
      addToast(success);
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Could not update Promo Studio audio.', 'error');
    } finally { setBusy(false); }
  };

  const updateSceneCamera = async (sceneId: string, movementId: string) => {
    if (!selectedId || !manifest) return;
    const definition = PROMO_CAMERA_MOVEMENT_BY_ID.get(movementId as any);
    if (!definition) return;
    try {
      setBusy(true);
      const next = structuredClone(manifest);
      const scene = next.scenes.find(item => item.id === sceneId);
      if (!scene) throw new Error('Scene is no longer present in the active revision.');
      const current = scene.visual.camera;
      const preferredExecution = scene.visual.kind === 'generated_visual' ? 'source_generation' : 'post_production';
      const execution = definition.supported_executions.includes(preferredExecution)
        ? preferredExecution : 'reference_only';
      scene.visual.camera = {
        movement: definition.id, execution,
        speed: definition.id === 'static' ? 'still' : current?.speed || 'moderate',
        framing: current?.framing || `Keep ${scene.name} readable throughout the shot`,
        end_frame: current?.end_frame || `Settle on a clear final view of ${scene.name}`,
        subject_action: current?.subject_action || null,
        mood: current?.mood || null,
      };
      await createPromoRevision(selectedId, next, `Changed ${scene.name} camera direction to ${definition.label}`);
      await loadDetail(selectedId);
      addToast(`${definition.label} saved in a new immutable revision.`);
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Could not update camera direction.', 'error');
    } finally { setBusy(false); }
  };

  const scheduleFinal = async (assetId: string) => {
    if (!selectedId || !publishCaption.trim() || !publishAt) return;
    try {
      setBusy(true);
      await schedulePromoFinalPublish(selectedId, assetId, publishCaption, new Date(publishAt).toISOString());
      await loadDetail(selectedId);
      addToast('Final render approved and scheduled for Instagram.');
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Could not approve and schedule the final render.', 'error');
    } finally { setBusy(false); }
  };

  const mutateJob = async (job: PromoJob, action: 'cancel' | 'retry') => {
    try {
      setBusy(true);
      updateJob(action === 'cancel' ? await cancelPromoJob(job.project_id, job.id) : await retryPromoJob(job.project_id, job.id));
    } catch (error) { addToast(error instanceof Error ? error.message : `Could not ${action} job.`, 'error'); }
    finally { setBusy(false); }
  };

  const performGuidedAction = useCallback(async (step: PromoGuidedStep) => {
    if (!selectedId || !step.action) return;
    try {
      setBusy(true);
      switch (step.action) {
        case 'generate_plan': await generatePromoCreativePlan(selectedId); break;
        case 'queue_capture': await queuePromoCapture(selectedId, String(step.target_id)); break;
        case 'adopt_capture': await adoptPromoCapture(selectedId, String(step.target_id)); break;
        case 'queue_voice': await queuePromoVoiceGeneration(selectedId, 'warm_authority'); break;
        case 'adopt_voice_master': await adoptPromoVoiceGeneration(selectedId, String(step.target_id)); break;
        case 'queue_alignment': await queuePromoVoiceAlignment(selectedId, String(step.target_id)); break;
        case 'queue_music': await queuePromoMusicGeneration(selectedId, 'balanced'); break;
        case 'queue_preview': await queuePromoRender(selectedId, 'preview', '9:16'); break;
        case 'select_preview': await selectPromoPreview(selectedId, String(step.target_id)); break;
        case 'retry_job': await retryPromoJob(selectedId, String(step.job_id)); break;
      }
      await loadDetail(selectedId);
    } catch (error) {
      setGuidedActive(false);
      addToast(error instanceof Error ? error.message : 'Could not continue preview production.', 'error');
    } finally { setBusy(false); }
  }, [addToast, loadDetail, selectedId]);

  useEffect(() => {
    if (!guidedActive || busy || !selectedId) return;
    if (guidedStep.status === 'waiting') {
      const timer = window.setTimeout(() => void loadDetail(selectedId), 2500);
      return () => window.clearTimeout(timer);
    }
    if (guidedStep.status === 'action' || (guidedStep.status === 'blocked' && guidedStep.action === 'retry_job')) {
      const signature = [detail?.revision?.id, guidedStep.action, guidedStep.target_id, guidedStep.job_id].join(':');
      if (lastGuidedAction.current !== signature) {
        lastGuidedAction.current = signature;
        void performGuidedAction(guidedStep);
      }
      return;
    }
    setGuidedActive(false);
  }, [busy, detail?.revision?.id, guidedActive, guidedStep, loadDetail, performGuidedAction, selectedId]);

  const startGuidedWorkflow = () => {
    lastGuidedAction.current = '';
    setGuidedActive(true);
  };

  const approvePreviewAndRenderFinal = async () => {
    if (!selectedId) return;
    try {
      setBusy(true);
      await reviewPromoPreview(selectedId, 'approved');
      await queuePromoRender(selectedId, 'final', '9:16');
      await loadDetail(selectedId);
      lastGuidedAction.current = '';
      setGuidedActive(true);
      addToast('Preview approved. The final video is rendering.');
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Could not approve the preview.', 'error');
    } finally { setBusy(false); }
  };

  const renderFinalVideo = async () => {
    if (!selectedId) return;
    try {
      setBusy(true);
      await queuePromoRender(selectedId, 'final', '9:16');
      await loadDetail(selectedId);
      lastGuidedAction.current = '';
      setGuidedActive(true);
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Could not render the final video.', 'error');
    } finally { setBusy(false); }
  };

  const manifest = detail?.revision?.manifest;
  const scriptHasUnsavedChanges = !!manifest && manifest.script.phrases.some(phrase =>
    (scriptDrafts[phrase.id]?.display_text ?? phrase.display_text) !== phrase.display_text
    || (scriptDrafts[phrase.id]?.speech_text ?? phrase.speech_text) !== phrase.speech_text
  );
  const claimsReadyForScript = !!manifest && manifest.evidence.claims.every(claim =>
    ['verified', 'user_attested'].includes(claim.status) && claim.approved
  );
  const manifestVoiceIds = new Set(manifest?.voice.takes.map(take => take.id) || []);
  const manifestMusicIds = new Set(manifest?.music.takes.map(take => take.id) || []);
  const generatedVoiceResults = (detail?.voice_takes || []).filter(take => take.status === 'aligning' && !manifestVoiceIds.has(take.id));
  const alignedVoiceResults = (detail?.voice_takes || []).filter(take => take.status === 'ready'
    && manifest?.voice.takes.some(item => item.id === take.id && item.status === 'aligning'));
  const generatedMusicResults = (detail?.music_takes || []).filter(take => take.status === 'ready' && !manifestMusicIds.has(take.id));
  const finalRenderAssets = (detail?.assets || []).filter(asset => asset.kind === 'render_master'
    && asset.status === 'ready' && asset.revision_id === detail?.revision?.id);
  const stages = manifest ? [
    { name: 'Evidence', icon: GitBranch, ready: !!manifest.evidence.repository && !!manifest.evidence.capture_environment, note: manifest.evidence.repository ? `${manifest.evidence.repository.full_name}@${manifest.evidence.repository.commit_sha.slice(0, 7)}` : detail?.source ? `${detail.source.repository_full_name}@${detail.source.default_ref} mapped; ${detail.source.capture_base_url ? 'capture environment mapped' : 'capture environment required'}` : 'Branch repository and capture environment required' },
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
                <option value="">Choose a branch</option>{activeBranches.map(branch => { const readiness = branchReadiness.find(item => item.branch_id === branch.id); return <option key={branch.id} value={branch.id}>{branch.name}{readiness ? readiness.generation_ready ? ' · evidence ready' : ' · setup needed' : ''}</option>; })}
              </select>
              {selectedReadiness && <div className="rounded-2xl border border-slate-100 bg-slate-50 p-3"><div className="flex flex-wrap gap-1.5">{[
                ['Repository', selectedReadiness.repository_ready], ['Brand', selectedReadiness.brand_ready],
                ['Capture', selectedReadiness.capture_ready], ['Instagram', selectedReadiness.instagram_ready],
              ].map(([label, ready]) => <span key={String(label)} className={`rounded-full border px-2 py-1 text-[9px] font-black uppercase ${ready ? statusClass.ready : 'border-amber-200 bg-amber-50 text-amber-700'}`}>{ready ? '✓ ' : ''}{label}</span>)}</div>{selectedReadiness.blockers.length > 0 && <p className="mt-2 text-[11px] leading-4 text-slate-500">Still needed: {selectedReadiness.blockers.join(' · ')}</p>}</div>}
              <div className="grid grid-cols-3 gap-2">{formatOptions.map(format => <button key={format} type="button" onClick={() => setFormats(current => current.includes(format) ? current.filter(item => item !== format) : [...current, format])} className={`rounded-xl border px-2 py-2 text-xs font-black ${formats.includes(format) ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-slate-200 text-slate-500'}`}>{formats.includes(format) && <Check className="mr-1 inline h-3 w-3" />}{format}</button>)}</div>
              <label className="block text-xs font-bold text-slate-500">Target seconds<input type="number" min={1} max={600} value={targetSeconds} onChange={event => setTargetSeconds(Number(event.target.value))} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-violet-400" /></label>
              <button type="button" disabled={busy || !title.trim() || !prompt.trim() || !branchId || formats.length === 0} onClick={() => void createProject()} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create draft</button>
            </div>
          </section>

          {canConfigureBranches && branchId && <details className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
            <summary className="cursor-pointer text-xs font-black uppercase tracking-widest text-slate-600">Configure branch production</summary>
            <p className="mt-3 text-xs leading-5 text-slate-500">Store only a GitHub owner/repository and opaque fixture references. Credentials stay in server secrets and the capture worker.</p>
            <div className="mt-4 space-y-3">
              <input value={sourceDraft.repository} onChange={event => setSourceDraft(current => ({ ...current, repository: event.target.value }))} placeholder="owner/repository" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-violet-400" />
              <input value={sourceDraft.ref} onChange={event => setSourceDraft(current => ({ ...current, ref: event.target.value }))} placeholder="main" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-violet-400" />
              <textarea value={sourceDraft.permitted} onChange={event => setSourceDraft(current => ({ ...current, permitted: event.target.value }))} rows={2} placeholder="Permitted repository paths" className="w-full resize-y rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-violet-400" />
              <textarea value={sourceDraft.prohibited} onChange={event => setSourceDraft(current => ({ ...current, prohibited: event.target.value }))} rows={2} placeholder="Additional prohibited paths (optional)" className="w-full resize-y rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-violet-400" />
              <input value={sourceDraft.captureUrl} onChange={event => setSourceDraft(current => ({ ...current, captureUrl: event.target.value }))} placeholder="https://approved-capture.example (optional)" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-violet-400" />
              <div className="grid gap-2 sm:grid-cols-2"><input value={sourceDraft.fixtureKey} onChange={event => setSourceDraft(current => ({ ...current, fixtureKey: event.target.value }))} placeholder="Fixture key" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-violet-400" /><input value={sourceDraft.authProfileKey} onChange={event => setSourceDraft(current => ({ ...current, authProfileKey: event.target.value }))} placeholder="Auth profile key" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-violet-400" /></div>
              <button disabled={busy || !sourceDraft.repository.trim() || !sourceDraft.ref.trim() || !sourceDraft.permitted.trim()} onClick={() => void saveBranchSource()} className="w-full rounded-xl bg-slate-950 px-4 py-3 text-xs font-black uppercase tracking-wider text-white disabled:opacity-40">Save branch source</button>
            </div>
          </details>}

          <section className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between px-1"><h2 className="text-xs font-black uppercase tracking-widest text-slate-500">Projects</h2><button onClick={() => void loadProjects()} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><RefreshCw className="h-4 w-4" /></button></div>
            <div className="mt-2 space-y-2">{projects.length === 0 ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No Promo Studio projects yet.</p> : projects.map(project => <button key={project.id} type="button" onClick={() => setSelectedId(project.id)} className={`w-full rounded-2xl border p-3 text-left ${selectedId === project.id ? 'border-violet-300 bg-violet-50' : 'border-slate-100 hover:border-slate-200'}`}><div className="flex items-start justify-between gap-2"><span className="text-sm font-black text-slate-900">{project.title}</span><span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${statusClass[project.status] || statusClass.draft}`}>{project.status.replace(/_/g, ' ')}</span></div><p className="mt-2 text-xs text-slate-500">{project.target_seconds}s · {project.requested_formats.join(' / ')}</p></button>)}</div>
          </section>
        </aside>

        <main className="space-y-6">
          {!detail || !manifest ? <section className="flex min-h-[420px] items-center justify-center rounded-[2rem] border border-dashed border-slate-300 bg-white p-8 text-center"><div><Clapperboard className="mx-auto h-9 w-9 text-slate-300" /><h2 className="mt-4 text-lg font-black text-slate-800">Choose or create a promo</h2><p className="mt-2 text-sm text-slate-500">The project workspace will show only evidence and stages that actually exist.</p></div></section> : <>
            <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-widest text-violet-600">Revision {detail.revision?.revision_number}</p><h2 className="mt-1 text-2xl font-black text-slate-950">{detail.project.title}</h2><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{detail.project.request_prompt}</p></div><button onClick={() => void loadDetail(detail.project.id)} aria-label="Refresh project" className="rounded-xl border border-slate-200 p-2.5 text-slate-500"><RefreshCw className="h-4 w-4" /></button></div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-2xl bg-slate-50 p-3"><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Branch</p><p className="mt-1 text-sm font-bold text-slate-800">{manifest.promo.branch.display_name}</p></div><div className="rounded-2xl bg-slate-50 p-3"><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Deliverables</p><p className="mt-1 text-sm font-bold text-slate-800">{manifest.promo.formats.join(' · ')}</p></div><div className="rounded-2xl bg-slate-50 p-3"><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Fingerprint</p><p className="mt-1 truncate font-mono text-xs text-slate-700" title={detail.revision?.manifest_fingerprint}>{detail.revision?.manifest_fingerprint.slice(0, 16)}…</p></div></div>
            </section>

            <section className="overflow-hidden rounded-[2rem] border border-violet-200 bg-gradient-to-br from-white to-violet-50 p-6 shadow-sm">
              <div className="flex flex-wrap gap-2">{(['Brief', 'Content', 'Production', 'Preview'] as const).map((label, index) => {
                const phaseIndex = { setup: 0, content: 1, production: 2, preview: 3, complete: 4 }[guidedStep.phase];
                return <div key={label} className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-wider ${index < phaseIndex ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : index === phaseIndex ? 'border-violet-300 bg-violet-100 text-violet-700' : 'border-slate-200 bg-white text-slate-400'}`}>{index < phaseIndex && <Check className="h-3 w-3" />}{label}</div>;
              })}</div>
              <div className="mt-5 flex flex-wrap items-end justify-between gap-5">
                <div className="max-w-2xl"><div className="flex items-center gap-2"><p className="text-xs font-black uppercase tracking-widest text-violet-600">Guided workflow</p>{guidedStep.status === 'review' && <span className="rounded-full bg-amber-100 px-2 py-1 text-[9px] font-black uppercase text-amber-700">Your review needed</span>}</div><h2 className="mt-1 text-xl font-black text-slate-950">{guidedStep.title}</h2><p className="mt-2 text-sm leading-6 text-slate-600">{guidedStep.description}</p>{guidedStep.status === 'waiting' && <div className="mt-4 h-2 overflow-hidden rounded-full bg-violet-100"><div className="h-full rounded-full bg-violet-600 transition-all" style={{ width: `${Math.max(6, guidedStep.progress || 0)}%` }} /></div>}</div>
                {(guidedStep.status === 'action' || guidedStep.action === 'retry_job') && <button disabled={busy || guidedActive} onClick={startGuidedWorkflow} className="flex min-w-44 items-center justify-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-black text-white shadow-sm disabled:opacity-50">{busy || guidedActive ? <Loader2 className="h-4 w-4 animate-spin" /> : guidedStep.action === 'retry_job' ? <RotateCcw className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}{guidedStep.action === 'retry_job' ? 'Retry this step' : 'Produce preview'}</button>}
                {guidedStep.gate === 'ready_for_final' && <button disabled={busy} onClick={() => void renderFinalVideo()} className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white disabled:opacity-50">Render final video</button>}
              </div>
            </section>

            <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-widest text-slate-400">Production gates</p><h2 className="mt-1 text-xl font-black text-slate-900">What is real, and what is missing</h2></div><ShieldCheck className="h-6 w-6 text-violet-500" /></div><div className="mt-5 grid gap-3 md:grid-cols-2">{stages.map(stage => <div key={stage.name} className="flex items-start gap-3 rounded-2xl border border-slate-100 p-4"><div className={`rounded-xl p-2 ${stage.ready ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>{stage.ready ? <CheckCircle2 className="h-4 w-4" /> : <stage.icon className="h-4 w-4" />}</div><div><p className="text-sm font-black text-slate-800">{stage.name}</p><p className="mt-1 text-xs leading-5 text-slate-500">{stage.note}</p></div></div>)}</div></section>

            {manifest.evidence.claims.length > 0 && <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-widest text-slate-400">Claims review</p><h2 className="mt-1 text-xl font-black text-slate-900">Evidence before approval</h2><p className="mt-2 text-sm text-slate-500">Generated claims remain unapproved. Unsupported claims block strict-mode final approval.</p></div><ShieldCheck className="h-6 w-6 text-violet-500" /></div>
              <div className="mt-5 space-y-3">{manifest.evidence.claims.map(claim => <div key={claim.id} className="rounded-2xl border border-slate-100 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-sm font-black text-slate-900">{claim.text}</p><p className="mt-1 text-xs text-slate-500">{claim.claim_type.replace(/_/g, ' ')}</p></div><div className="flex flex-wrap justify-end gap-2"><span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase ${['verified', 'user_attested'].includes(claim.status) ? statusClass.ready : statusClass.failed}`}>{claim.status.replace(/_/g, ' ')}</span><span className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase ${claim.approved ? statusClass.ready : 'border-amber-200 bg-amber-50 text-amber-700'}`}>{claim.approved ? 'Approved' : 'Not approved'}</span>{!claim.approved && ['verified', 'user_attested'].includes(claim.status) && <button disabled={busy} onClick={() => void approveClaim(claim.id)} className="rounded-lg bg-slate-950 px-3 py-1.5 text-[10px] font-black uppercase text-white disabled:opacity-40">Approve claim</button>}</div></div><div className="mt-3 flex flex-wrap gap-2">{claim.evidence_refs.map(ref => <code key={ref} className="rounded-lg bg-slate-50 px-2 py-1 text-[10px] text-slate-600">{ref}</code>)}</div></div>)}</div>
            </section>}

            {manifest.script.phrases.length > 0 && <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-widest text-slate-400">Script review</p><h2 className="mt-1 text-xl font-black text-slate-900">Display and spoken text</h2><p className="mt-2 text-sm text-slate-500">Speech text may use pronunciation spelling without changing the on-screen wording.</p></div><div className="flex flex-wrap justify-end gap-2"><button disabled={busy || !scriptHasUnsavedChanges || manifest.script.phrases.some(phrase => !(scriptDrafts[phrase.id]?.display_text ?? '').trim() || !(scriptDrafts[phrase.id]?.speech_text ?? '').trim())} onClick={() => void saveScriptDraft()} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-700 disabled:opacity-40">Save new revision</button><button disabled={busy || scriptHasUnsavedChanges || !claimsReadyForScript || manifest.script.status === 'approved'} onClick={() => void approveScript()} className="rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-black text-white disabled:opacity-40">{manifest.script.status === 'approved' ? 'Script approved' : 'Approve script & continue'}</button></div></div>
              <div className="mt-5 space-y-4">{manifest.script.phrases.map((phrase, index) => <div key={phrase.id} className="rounded-2xl border border-slate-100 p-4"><div className="flex items-center justify-between"><p className="text-xs font-black uppercase tracking-widest text-violet-600">Phrase {index + 1}</p><span className="text-[10px] font-bold uppercase text-slate-400">{phrase.emphasis} emphasis</span></div><label className="mt-3 block text-xs font-bold text-slate-500">On-screen text<textarea rows={2} value={scriptDrafts[phrase.id]?.display_text ?? phrase.display_text} onChange={event => setScriptDrafts(current => ({ ...current, [phrase.id]: { display_text: event.target.value, speech_text: current[phrase.id]?.speech_text ?? phrase.speech_text } }))} className="mt-1 w-full resize-y rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-violet-400" /></label><label className="mt-3 block text-xs font-bold text-slate-500">Voice text<textarea rows={2} value={scriptDrafts[phrase.id]?.speech_text ?? phrase.speech_text} onChange={event => setScriptDrafts(current => ({ ...current, [phrase.id]: { display_text: current[phrase.id]?.display_text ?? phrase.display_text, speech_text: event.target.value } }))} className="mt-1 w-full resize-y rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 outline-none focus:border-violet-400" /></label><div className="mt-3 flex flex-wrap gap-2">{phrase.evidence_refs.map(ref => <code key={ref} className="rounded-lg bg-slate-50 px-2 py-1 text-[10px] text-slate-600">{ref}</code>)}</div></div>)}</div>
            </section>}

            {manifest.captures.scenarios.length > 0 && <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-widest text-slate-400">Real UI evidence</p><h2 className="mt-1 text-xl font-black text-slate-900">Product capture</h2><p className="mt-2 text-sm text-slate-500">Trellis captures the real product from the branch’s approved environment and verifies its source.</p></div><Film className="h-6 w-6 text-violet-500" /></div>
              <div className="mt-5 space-y-3">{manifest.captures.scenarios.map(scenario => {
                const run = detail.capture_runs.find(item => item.status === 'succeeded' && item.evidence?.scenario_id === scenario.id);
                return <div key={scenario.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 p-4"><div><div className="flex items-center gap-2"><p className="text-sm font-black text-slate-900">{scenario.key}</p><span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${statusClass[scenario.status] || statusClass.draft}`}>{scenario.status}</span></div><p className="mt-1 text-xs text-slate-500">{scenario.route} · {scenario.commit_sha.slice(0, 7)}</p></div><span className="text-xs font-bold text-slate-400">{scenario.status === 'verified' ? `${scenario.artifact_asset_ids.length} verified artifact${scenario.artifact_asset_ids.length === 1 ? '' : 's'}` : run ? 'Verified · ready to attach' : 'Handled during preview production'}</span></div>;
              })}</div>
            </section>}

            {manifest.script.status === 'approved' && <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-widest text-slate-400">Audio review</p><h2 className="mt-1 text-xl font-black text-slate-900">Voice and music</h2><p className="mt-2 text-sm text-slate-500">Listen when Trellis asks for your approval. Caption timing is created automatically from the approved narration.</p></div><details className="relative"><summary className="cursor-pointer rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-600">Generate another take</summary><div className="mt-2 flex flex-wrap justify-end gap-2"><button disabled={busy || manifest.voice.takes.length >= 3} onClick={() => void runAudioAction(() => queuePromoVoiceGeneration(detail.project.id, 'warm_authority'), 'Voice generation queued.')} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-700 disabled:opacity-40"><Volume2 className="mr-2 inline h-4 w-4" />Voice</button><button disabled={busy || manifest.music.takes.length >= 3} onClick={() => void runAudioAction(() => queuePromoMusicGeneration(detail.project.id, 'balanced'), 'Music generation queued.')} className="rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-700 disabled:opacity-40"><Music2 className="mr-2 inline h-4 w-4" />Music</button></div></details></div>
              <div className="mt-5 space-y-3">
                {generatedVoiceResults.map(take => <div key={take.id} className="rounded-2xl border border-violet-100 bg-violet-50/40 p-4"><p className="text-sm font-black text-slate-900">Narration take {take.take_number}</p><p className="mt-1 text-xs text-slate-500">{take.provider} · {Number(take.duration_seconds).toFixed(1)}s · Trellis is preparing caption timing</p></div>)}
                {manifest.voice.takes.filter(take => take.status === 'aligning' && !alignedVoiceResults.some(result => result.id === take.id)).map(take => <div key={take.id} className="rounded-2xl border border-slate-100 p-4"><p className="text-sm font-black text-slate-900">Narration take {take.take_number}</p><p className="mt-1 text-xs text-slate-500">Preparing exact phrase timing…</p></div>)}
                {alignedVoiceResults.map(take => <div key={take.id} className="grid gap-4 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 lg:grid-cols-[minmax(0,1fr)_auto]"><div><p className="text-sm font-black text-slate-900">Narration take {take.take_number}</p><p className="mt-1 text-xs text-slate-500">Timing verified · approval creates captions</p>{guidedStep.gate === 'review_voice' && guidedStep.target_id === take.id && (reviewMediaUrl ? <audio controls className="mt-3 w-full" src={reviewMediaUrl}>Your browser does not support audio playback.</audio> : <p className="mt-3 text-xs text-slate-400">Preparing secure audio preview…</p>)}</div><button disabled={busy} onClick={() => void runAudioAction(() => adoptPromoVoiceAlignment(detail.project.id, take.id), 'Narration approved and caption timing adopted.', true)} className="self-center rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-40">Approve narration</button></div>)}
                {generatedMusicResults.map(take => <div key={take.id} className="grid gap-4 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4 lg:grid-cols-[minmax(0,1fr)_auto]"><div><p className="text-sm font-black text-slate-900">Music take {take.take_number}</p><p className="mt-1 text-xs text-slate-500">{take.provider} · {Number(take.duration_seconds).toFixed(1)}s · instrumental master</p>{guidedStep.gate === 'review_music' && guidedStep.target_id === take.id && (reviewMediaUrl ? <audio controls className="mt-3 w-full" src={reviewMediaUrl}>Your browser does not support audio playback.</audio> : <p className="mt-3 text-xs text-slate-400">Preparing secure audio preview…</p>)}</div><button disabled={busy} onClick={() => void runAudioAction(() => adoptPromoMusic(detail.project.id, take.id), 'Music approved and adopted.', true)} className="self-center rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-black text-white disabled:opacity-40">Approve music</button></div>)}
                {!generatedVoiceResults.length && !alignedVoiceResults.length && !generatedMusicResults.length && !manifest.voice.takes.some(take => take.status === 'aligning') && <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No completed audio results are waiting for review.</p>}
              </div>
            </section>}

            {manifest.scenes.length > 0 && <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm">
              <div><p className="text-xs font-black uppercase tracking-widest text-slate-400">Shot direction</p><h2 className="mt-1 text-xl font-black text-slate-900">Camera movement</h2><p className="mt-2 text-sm text-slate-500">Movement is stored separately from scene content and translated by the selected generator, capture process, or renderer.</p></div>
              <div className="mt-5 space-y-3">{manifest.scenes.map(scene => <div key={scene.id} className="grid gap-3 rounded-2xl border border-slate-100 p-4 md:grid-cols-[minmax(0,1fr)_260px]"><div><p className="text-sm font-black text-slate-900">{scene.name}</p><p className="mt-1 text-xs text-slate-500">{scene.visual.camera?.execution?.replace(/_/g, ' ') || 'No execution selected'}{scene.visual.camera?.framing ? ` · ${scene.visual.camera.framing}` : ''}</p></div><select disabled={busy} value={scene.visual.camera?.movement || 'static'} onChange={event => void updateSceneCamera(scene.id, event.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-violet-400 disabled:opacity-40">{PROMO_CAMERA_MOVEMENTS.map(item => <option key={item.id} value={item.id}>{item.label} · {item.category.replace(/_/g, ' ')}</option>)}</select></div>)}</div>
            </section>}

            {guidedStep.gate === 'review_preview' && <section className="rounded-[2rem] border border-violet-200 bg-white p-6 shadow-sm">
              <div><p className="text-xs font-black uppercase tracking-widest text-violet-600">Final review</p><h2 className="mt-1 text-xl font-black text-slate-950">Watch your promo</h2><p className="mt-2 text-sm text-slate-500">Check the voice, music, captions, product capture, and camera movement before creating the final file.</p></div>
              <div className="mt-5 overflow-hidden rounded-2xl bg-slate-950">{reviewMediaUrl ? <video controls playsInline className="mx-auto max-h-[70vh] w-full object-contain" src={reviewMediaUrl}>Your browser does not support video playback.</video> : <div className="flex min-h-72 items-center justify-center text-sm font-bold text-slate-400"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Preparing secure video preview…</div>}</div>
              <div className="mt-5 flex justify-end"><button disabled={busy || !reviewMediaUrl} onClick={() => void approvePreviewAndRenderFinal()} className="rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white disabled:opacity-40">Approve preview & render final</button></div>
            </section>}

            {finalRenderAssets.length > 0 && <section className="rounded-[2rem] border border-emerald-200 bg-emerald-50/40 p-6 shadow-sm">
              <div><p className="text-xs font-black uppercase tracking-widest text-emerald-700">Publishing handoff</p><h2 className="mt-1 text-xl font-black text-slate-900">Approve and schedule the final render</h2><p className="mt-2 text-sm text-slate-600">The private master stays in Promo Storage. The scheduler signs it only after atomically claiming the due post.</p></div>
              <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]"><textarea rows={4} maxLength={2200} value={publishCaption} onChange={event => setPublishCaption(event.target.value)} placeholder="Instagram caption" className="w-full resize-y rounded-xl border border-emerald-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-emerald-500" /><div className="space-y-3"><input type="datetime-local" value={publishAt} onChange={event => setPublishAt(event.target.value)} className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 outline-none focus:border-emerald-500" />{finalRenderAssets.map(asset => <button key={String(asset.id)} disabled={busy || !publishCaption.trim() || !publishAt} onClick={() => void scheduleFinal(String(asset.id))} className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black uppercase tracking-wider text-white disabled:opacity-40">Approve & schedule Instagram</button>)}</div></div>
            </section>}

            <details className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm"><summary className="flex cursor-pointer list-none items-center justify-between"><div><p className="text-xs font-black uppercase tracking-widest text-slate-400">Advanced</p><h2 className="mt-1 text-lg font-black text-slate-900">Job details and diagnostics</h2></div><Clock3 className="h-5 w-5 text-slate-400" /></summary><div className="mt-5 flex justify-end"><button disabled={busy} onClick={() => void queueFoundationCheck()} className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-black text-slate-600 disabled:opacity-50"><CheckCircle2 className="h-4 w-4" /> Test foundation</button></div><div className="mt-4 space-y-2">{detail.jobs.length === 0 ? <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">No jobs queued for this revision.</p> : detail.jobs.map(job => <div key={job.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 p-4"><div><div className="flex items-center gap-2"><p className="text-sm font-black text-slate-800">{job.job_type.replace(/_/g, ' ')}</p><span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${statusClass[job.status] || statusClass.draft}`}>{job.status.replace(/_/g, ' ')}</span></div><p className="mt-1 text-xs text-slate-500">Attempt {job.attempt_count} · {job.progress}%{job.error_message ? ` · ${job.error_message}` : ''}</p></div><div className="flex gap-2">{!terminalJobs.has(job.status) && job.status !== 'cancel_requested' && <button aria-label={`Cancel ${job.job_type}`} disabled={busy} onClick={() => void mutateJob(job, 'cancel')} className="rounded-lg border border-slate-200 p-2 text-slate-500"><Square className="h-3.5 w-3.5" /></button>}{['failed', 'cancelled'].includes(job.status) && <button aria-label={`Retry ${job.job_type}`} disabled={busy} onClick={() => void mutateJob(job, 'retry')} className="rounded-lg border border-slate-200 p-2 text-slate-500"><RotateCcw className="h-3.5 w-3.5" /></button>}</div></div>)}</div></details>
          </>}
        </main>
      </div>
    </div>
  );
};

export default PromoStudio;
