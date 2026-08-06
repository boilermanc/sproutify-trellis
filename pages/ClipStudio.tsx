import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Film, Loader2, RefreshCw, Plus, ArrowLeft, Archive, Star, Wand2, CheckCircle2,
  FileText, Upload, MonitorPlay, X, Play, Pause, ScrollText, ShieldAlert,
  Quote, History, Lightbulb, MessageSquarePlus, Clapperboard, ThumbsUp, ThumbsDown,
  Trophy, Pencil, Download, Send, ExternalLink, Layers, Video,
} from 'lucide-react';
import {
  ClipProject, ClipSource, ClipGeneration, ClipFormat, CreateClipConfig,
  ClipBrollBeat, ClipRenderJob, ClipPublication, ClipTriage,
} from '../types';
import {
  createClipProject, getClipProjects, getClipSources, getClipGenerations,
  generateScript, approveScript, archiveClipProject, setClipRating,
  setCurrentGeneration, fetchUrlSourceText,
  getBrollBeats, generateBrollPlan, updateBrollBeat, setBeatTriage, regenerateBeat,
  getRenderJobs, queueBeatRender, queueAllRenders,
  queueAssemble, getClipPublications, generateClipMetadata, publishClip, setClipStatus,
} from '../services/clipService';

interface Props {
  branches: Array<{ slug: string; name: string }>;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  userId?: string | null;
  geminiApiKey?: string;
}

const card = 'bg-white p-5 rounded-[1.75rem] border border-slate-100 shadow-sm';
const labelCls = 'block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2';
const inputCls = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:bg-white focus:border-emerald-500 outline-none transition';
const panelHead = 'text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-2';

const TARGET_LENGTHS = [30, 60, 90, 120, 150];
const TEXT_FILE_EXTS = ['.txt', '.md', '.csv', '.srt', '.vtt', '.json', '.rtf'];

const STATUS_META: Record<string, { label: string; cls: string }> = {
  draft: { label: 'Draft', cls: 'bg-slate-100 text-slate-500' },
  scripting: { label: 'Scripting', cls: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Approved', cls: 'bg-emerald-100 text-emerald-700' },
  broll: { label: 'B-roll', cls: 'bg-violet-100 text-violet-700' },
  production: { label: 'Production', cls: 'bg-blue-100 text-blue-700' },
  publishing: { label: 'Publishing', cls: 'bg-cyan-100 text-cyan-700' },
  published: { label: 'Published', cls: 'bg-emerald-600 text-white' },
  archived: { label: 'Archived', cls: 'bg-slate-200 text-slate-500' },
  failed: { label: 'Failed', cls: 'bg-rose-100 text-rose-700' },
};

const BEAT_TYPE_LABEL: Record<string, string> = {
  motion_graphic: 'Motion Graphic',
  kinetic_quote_card: 'Kinetic Quote Card',
  animation: 'Animation',
  ui_callout: 'UI Callout',
  timeline: 'Timeline',
  source_receipt_card: 'Source Receipt Card',
  text_highlight: 'Text Highlight',
};

const TRIAGE_META: Record<ClipTriage, { label: string; cls: string }> = {
  undecided: { label: 'Undecided', cls: 'bg-slate-100 text-slate-500' },
  kept: { label: 'Kept', cls: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: 'Rejected', cls: 'bg-rose-100 text-rose-600' },
  winner: { label: 'Winner', cls: 'bg-amber-100 text-amber-700' },
  edited: { label: 'Made the edit', cls: 'bg-blue-100 text-blue-700' },
};

const ClipStudio: React.FC<Props> = ({ branches, addToast, userId, geminiApiKey }) => {
  const [mode, setMode] = useState<'library' | 'create' | 'project'>('library');
  const [projects, setProjects] = useState<ClipProject[]>([]);
  const [selected, setSelected] = useState<ClipProject | null>(null);
  const [sources, setSources] = useState<ClipSource[]>([]);
  const [generations, setGenerations] = useState<ClipGeneration[]>([]);
  const [brollBeats, setBrollBeats] = useState<ClipBrollBeat[]>([]);
  const [renderJobs, setRenderJobs] = useState<ClipRenderJob[]>([]);
  const [publications, setPublications] = useState<ClipPublication[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [tab, setTab] = useState<'script' | 'broll' | 'runs' | 'publish'>('script');
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [videoOnly, setVideoOnly] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [prompterOpen, setPrompterOpen] = useState(false);
  const [brollFilter, setBrollFilter] = useState<'all' | 'rendered' | 'kept' | 'undecided' | 'failed'>('all');
  const [promptDrafts, setPromptDrafts] = useState<Record<string, string>>({});
  const [pubMeta, setPubMeta] = useState<{ title: string; description: string; tags: string[]; hashtags: string[] } | null>(null);

  // Create form
  const [branch, setBranch] = useState(branches[0]?.slug || '');
  const [urls, setUrls] = useState('');
  const [pasted, setPasted] = useState('');
  const [files, setFiles] = useState<Array<{ name: string; text: string }>>([]);
  const [steering, setSteering] = useState('');
  const [targetSeconds, setTargetSeconds] = useState(60);
  const [formats, setFormats] = useState<ClipFormat[]>(['interview']);
  const [sponsor, setSponsor] = useState('');
  const [talkingPoints, setTalkingPoints] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!branch && branches[0]) setBranch(branches[0].slug); }, [branches, branch]);

  const loadProjects = useCallback(async () => {
    try { setLoading(true); setProjects(await getClipProjects()); }
    catch (e) { addToast(`Failed to load clips: ${msg(e)}`, 'error'); }
    finally { setLoading(false); }
  }, [addToast]);
  useEffect(() => { loadProjects(); }, [loadProjects]);

  const openProject = useCallback(async (p: ClipProject) => {
    setSelected(p); setMode('project'); setTab('script'); setFeedback(''); setPubMeta(null); setPromptDrafts({});
    try {
      const [s, g, b, j, pubs] = await Promise.all([
        getClipSources(p.id), getClipGenerations(p.id), getBrollBeats(p.id),
        getRenderJobs(p.id), getClipPublications(p.id),
      ]);
      setSources(s); setGenerations(g); setBrollBeats(b); setRenderJobs(j); setPublications(pubs);
    } catch (e) { addToast(msg(e), 'error'); }
  }, [addToast]);

  const current = useMemo(() => generations.find(g => g.is_current) || generations[0] || null, [generations]);
  const aRollText = useMemo(() =>
    (current?.script || []).filter(b => b.lane === 'aroll').map(b => b.text).join('\n\n'), [current]);

  const refreshProject = useCallback(async (id: string) => {
    const list = await getClipProjects();
    setProjects(list);
    const p = list.find(x => x.id === id);
    if (p) setSelected(p);
    setGenerations(await getClipGenerations(id));
  }, []);

  // Latest render job per beat (jobs come back newest-first)
  const latestJobForBeat = useCallback((beatId: string): ClipRenderJob | undefined =>
    renderJobs.find(j => j.beat_id === beatId), [renderJobs]);

  const queueCounts = useMemo(() => ({
    running: renderJobs.filter(j => j.status === 'running').length,
    queued: renderJobs.filter(j => j.status === 'queued').length,
    done: renderJobs.filter(j => j.status === 'completed').length,
    failed: renderJobs.filter(j => j.status === 'failed').length,
  }), [renderJobs]);

  // Poll while renders or publications are in flight
  const pollRef = useRef<number | null>(null);
  const pollActive = useMemo(() =>
    renderJobs.some(j => j.status === 'queued' || j.status === 'running') ||
    publications.some(p => ['pending', 'uploading', 'processing'].includes(p.status)),
  [renderJobs, publications]);
  useEffect(() => {
    if (!selected || !pollActive) { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } return; }
    const id = selected.id;
    pollRef.current = window.setInterval(async () => {
      try {
        const [j, pubs, list] = await Promise.all([getRenderJobs(id), getClipPublications(id), getClipProjects()]);
        setRenderJobs(j); setPublications(pubs); setProjects(list);
        const p = list.find(x => x.id === id);
        if (p) {
          // A publication went live → advance the project to published (once)
          if (pubs.some(x => x.status === 'live') && p.status === 'publishing') {
            setClipStatus(id, 'published').catch(() => {});
            setSelected({ ...p, status: 'published' });
          } else setSelected(p);
        }
      } catch { /* transient poll errors are fine */ }
    }, 5000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [selected?.id, pollActive]);

  // ─── Create flow: save project + sources, then generate v1 ─────────
  const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked: File[] = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    picked.forEach(f => {
      const ok = TEXT_FILE_EXTS.some(ext => f.name.toLowerCase().endsWith(ext));
      if (!ok) { addToast(`${f.name}: only text formats for now (${TEXT_FILE_EXTS.join(' ')})`, 'error'); return; }
      const reader = new FileReader();
      reader.onload = () => setFiles(prev => [...prev, { name: f.name, text: String(reader.result || '') }]);
      reader.readAsText(f);
    });
  };

  const handleCreate = async () => {
    const urlList = urls.split(/[\n,]/).map(u => u.trim()).filter(Boolean);
    if (!urlList.length && !pasted.trim() && !files.length) { addToast('Add at least one source', 'error'); return; }
    if (!geminiApiKey) { addToast('Gemini API key missing — add it in Settings', 'error'); return; }
    setBusy('create');
    try {
      const srcs: CreateClipConfig['sources'] = [];
      for (const u of urlList) {
        try { srcs.push({ kind: 'url', url: u, raw_text: await fetchUrlSourceText(u) }); }
        catch (e) { addToast(msg(e), 'error'); }
      }
      if (pasted.trim()) srcs.push({ kind: 'pasted_text', raw_text: pasted.trim() });
      files.forEach(f => srcs.push({ kind: 'file', filename: f.name, raw_text: f.text }));
      if (!srcs.length) throw new Error('No usable sources — the URLs could not be read');

      const project = await createClipProject({
        branch,
        steering: steering.trim() || undefined,
        target_seconds: targetSeconds,
        format: { kinds: formats, sponsor: sponsor.trim() || undefined, talking_points: talkingPoints.trim() || undefined },
        sources: srcs,
      }, userId);

      const projSources = await getClipSources(project.id);
      addToast('Sources saved — writing the script…', 'info');
      await generateScript(project, projSources, geminiApiKey);
      await loadProjects();
      const fresh = (await getClipProjects()).find(p => p.id === project.id);
      setUrls(''); setPasted(''); setFiles([]); setSteering(''); setSponsor(''); setTalkingPoints('');
      await openProject(fresh || project);
      addToast('Script generated', 'success');
    } catch (e) { addToast(msg(e), 'error'); }
    finally { setBusy(''); }
  };

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } catch (e) { addToast(msg(e), 'error'); } finally { setBusy(''); }
  };

  const handleRegenerate = (fb?: string) => {
    if (!selected || !geminiApiKey) { addToast('Gemini API key missing — add it in Settings', 'error'); return; }
    run(fb ? 'revise' : 'regen', async () => {
      await generateScript(selected, sources, geminiApiKey, fb, current || undefined);
      await refreshProject(selected.id);
      setFeedback('');
      addToast(fb ? 'Script revised — saved as a new version' : 'Fresh script generated', 'success');
    });
  };

  // ─── B-roll helpers ─────────────────────────────────────────────────
  const scriptApproved = selected ? !['draft', 'scripting'].includes(selected.status) : false;

  const handleGeneratePlan = () => {
    if (!selected || !current || !geminiApiKey) { addToast('Approve a script first (and set the Gemini key)', 'error'); return; }
    run('broll-plan', async () => {
      const beats = await generateBrollPlan(selected, current, geminiApiKey);
      setBrollBeats(beats); setRenderJobs(await getRenderJobs(selected.id));
      await refreshProject(selected.id);
      addToast(`${beats.length} B-roll beats planned`, 'success');
    });
  };

  const filteredBeats = useMemo(() => brollBeats.filter(b => {
    const job = latestJobForBeat(b.id);
    switch (brollFilter) {
      case 'rendered': return job?.status === 'completed';
      case 'failed': return job?.status === 'failed';
      case 'kept': return b.triage === 'kept' || b.triage === 'winner';
      case 'undecided': return b.triage === 'undecided';
      default: return true;
    }
  }), [brollBeats, brollFilter, latestJobForBeat]);

  const keptClips = useMemo(() =>
    brollBeats
      .filter(b => b.triage === 'kept' || b.triage === 'winner' || b.triage === 'edited')
      .sort((a, b) => a.position - b.position)
      .map(b => ({ beat: b, job: latestJobForBeat(b.id) }))
      .filter(x => x.job?.status === 'completed' && x.job.output_url),
  [brollBeats, latestJobForBeat]);

  const assembleJob = useMemo(() => renderJobs.find(j => j.job_type === 'assemble'), [renderJobs]);
  const videoForPublish = selected?.final_video_url || (keptClips.length === 1 ? keptClips[0].job!.output_url : null);

  const triageBtn = (beat: ClipBrollBeat, t: ClipTriage, Icon: React.ComponentType<{ size?: number | string; className?: string }>, label: string, activeCls: string) => (
    <button type="button" disabled={!!busy}
      onClick={() => run(`triage-${beat.id}`, async () => {
        const next = beat.triage === t ? 'undecided' : t;
        await setBeatTriage(beat.id, next);
        setBrollBeats(prev => prev.map(b => b.id === beat.id ? { ...b, triage: next } : b));
      })}
      className={`px-2.5 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border transition flex items-center gap-1 ${
        beat.triage === t ? activeCls : 'bg-white border-slate-200 text-slate-500 hover:border-slate-400'}`}>
      <Icon size={11} /> {label}
    </button>
  );

  // ═══ RENDER ══════════════════════════════════════════════════════════

  const header = (
    <div className="flex items-center gap-3">
      <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center"><Film className="w-6 h-6 text-emerald-600" /></div>
      <div>
        <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Clip Studio</h2>
        <p className="text-[11px] text-slate-400 font-medium">Short-form video: sources → script → B-roll → publish</p>
      </div>
    </div>
  );

  if (mode === 'create') {
    return (
      <div className="max-w-3xl mx-auto space-y-6 pb-20">
        <div className="flex items-center justify-between">
          {header}
          <button type="button" onClick={() => setMode('library')} className="px-3 py-2 text-slate-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 transition flex items-center gap-1"><ArrowLeft size={13} /> Library</button>
        </div>
        <div className={`${card} space-y-6`}>
          <div>
            <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">— New Production</p>
            <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight mt-1">Create a Short</h3>
            <p className="text-xs text-slate-400 mt-1">Feed it sources, steer the angle if you want, and it writes a script in your voice — receipts attached, B-roll after approval.</p>
          </div>

          {/* 01 Sources */}
          <div className="space-y-3">
            <p className={panelHead}><span className="text-emerald-600 font-black">01</span> Sources</p>
            <div><label className={labelCls}>URL or URLs</label>
              <textarea className={`${inputCls} h-20 resize-none`} value={urls} onChange={e => setUrls(e.target.value)} placeholder="https://…  (one per line, or comma-separated)" />
            </div>
            <div><label className={labelCls}>Copied text</label>
              <textarea className={`${inputCls} h-28 resize-none`} value={pasted} onChange={e => setPasted(e.target.value)} placeholder="Paste article text, notes, transcript, or source excerpts" />
            </div>
            <div>
              <label className={labelCls}>Source files</label>
              <button type="button" onClick={() => fileRef.current?.click()}
                className="w-full py-6 border-2 border-dashed border-slate-200 rounded-2xl text-xs font-bold text-slate-400 hover:border-emerald-400 hover:text-emerald-600 transition flex flex-col items-center gap-1">
                <Upload size={16} /> Click to browse — {TEXT_FILE_EXTS.join(', ')}
              </button>
              <input ref={fileRef} type="file" multiple accept={TEXT_FILE_EXTS.join(',')} className="hidden" onChange={handleFiles} />
              {files.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {files.map((f, i) => (
                    <span key={i} className="px-2 py-1 rounded-lg bg-slate-100 text-[10px] font-bold text-slate-600 flex items-center gap-1">
                      <FileText size={11} /> {f.name}
                      <button type="button" onClick={() => setFiles(prev => prev.filter((_, x) => x !== i))} className="text-slate-400 hover:text-rose-500"><X size={11} /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 02 Steering */}
          <div className="space-y-3">
            <p className={panelHead}><span className="text-emerald-600 font-black">02</span> Steering</p>
            <div><label className={labelCls}>Direction (optional)</label>
              <textarea className={`${inputCls} h-16 resize-none`} value={steering} onChange={e => setSteering(e.target.value)} placeholder="Steer the angle — e.g. 'Focus on the privacy implications, skip the pricing details'" />
            </div>
            <div><label className={labelCls}>Target length</label>
              <div className="flex gap-1.5">
                {TARGET_LENGTHS.map(s => (
                  <button key={s} type="button" onClick={() => setTargetSeconds(s)}
                    className={`px-4 py-2 rounded-xl text-xs font-black transition ${targetSeconds === s ? 'bg-slate-900 text-white' : 'bg-amber-50 text-slate-600 hover:bg-amber-100'}`}>{s}s</button>
                ))}
              </div>
            </div>
          </div>

          {/* 03 Format */}
          <div className="space-y-3">
            <p className={panelHead}><span className="text-emerald-600 font-black">03</span> Format</p>
            <div className="flex gap-4">
              {(['promotion', 'interview'] as ClipFormat[]).map(f => (
                <label key={f} className="flex items-center gap-2 text-xs font-bold text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={formats.includes(f)} onChange={() =>
                    setFormats(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f])} className="accent-emerald-600" />
                  {f === 'promotion' ? 'Promotion' : 'Interview'}
                </label>
              ))}
            </div>
            {formats.includes('promotion') && (
              <div className="space-y-2 pl-1">
                <div><label className={labelCls}>Sponsor / product</label>
                  <input className={inputCls} value={sponsor} onChange={e => setSponsor(e.target.value)} placeholder="Sponsor name" /></div>
                <div><label className={labelCls}>Talking points</label>
                  <textarea className={`${inputCls} h-16 resize-none`} value={talkingPoints} onChange={e => setTalkingPoints(e.target.value)} placeholder="What the sponsor wants highlighted" /></div>
              </div>
            )}
          </div>

          {/* 04 Branch + create */}
          <div className="space-y-3">
            <p className={panelHead}><span className="text-emerald-600 font-black">04</span> Branch</p>
            <select className={inputCls} value={branch} onChange={e => setBranch(e.target.value)}>
              {branches.map(b => <option key={b.slug} value={b.slug}>{b.name}</option>)}
            </select>
            <button type="button" onClick={handleCreate} disabled={busy === 'create'}
              className="w-full py-3.5 bg-emerald-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-emerald-700 transition disabled:opacity-50">
              {busy === 'create' ? <><Loader2 size={16} className="animate-spin" /> Writing script…</> : <><Wand2 size={16} /> Generate Script</>}
            </button>
            <p className="text-[10px] text-slate-400 text-center">Uses Gemini. Sources are PII-scrubbed before the model sees them.</p>
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'project' && selected) {
    const m = STATUS_META[selected.status] || STATUS_META.draft;
    return (
      <div className="space-y-5 pb-20">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <button type="button" onClick={() => { setMode('library'); loadProjects(); }} className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-emerald-600 transition flex items-center gap-1"><ArrowLeft size={12} /> Library</button>
            <div className="flex items-center gap-2 mt-2">
              <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${m.cls}`}>{m.label}</span>
              {(selected.format?.kinds || []).map(k => <span key={k} className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-blue-100 text-blue-700">{k}</span>)}
            </div>
            <h2 className="text-2xl font-black text-slate-800 tracking-tight mt-1.5">{selected.title}</h2>
            <p className="text-[11px] text-slate-400 font-medium mt-1">
              {current ? `${current.word_count} words · ~${current.est_seconds}s · ${current.model}${current.tokens_used ? ` · ${current.tokens_used.toLocaleString()} tokens` : ''}` : 'No script yet'}
              {` · target ${selected.target_seconds}s`}
            </p>
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} type="button" onClick={() => run('rate', async () => { await setClipRating(selected.id, selected.rating === n ? null : n); await refreshProject(selected.id); })}>
                <Star size={16} className={selected.rating && selected.rating >= n ? 'text-amber-400 fill-amber-400' : 'text-slate-200'} />
              </button>
            ))}
          </div>
        </div>

        {/* Tabs + actions */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex gap-1.5">
            {([['script', 'Script', ScrollText], ['broll', 'B-roll', Clapperboard], ['runs', 'Runs', History], ['publish', 'Publish', Send]] as const).map(([id, label, Icon]) => (
              <button key={id} type="button" onClick={() => setTab(id)}
                className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 transition ${tab === id ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>
          {tab === 'script' && (
            <div className="flex gap-2">
              <button type="button" disabled={!!busy} onClick={() => handleRegenerate()}
                className="px-4 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-emerald-400 transition flex items-center gap-1.5 disabled:opacity-40">
                {busy === 'regen' ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />} Regenerate Script
              </button>
              <button type="button" disabled={!!busy || !current || scriptApproved} onClick={() => run('approve', async () => { await approveScript(selected.id); await refreshProject(selected.id); addToast('Script approved — B-roll unlocked', 'success'); setTab('broll'); })}
                className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition flex items-center gap-1.5 disabled:opacity-40">
                <CheckCircle2 size={13} /> {scriptApproved ? 'Approved' : 'Approve'}
              </button>
            </div>
          )}
        </div>

        {/* ─── SCRIPT TAB ─── */}
        {tab === 'script' && (!current ? (
          <div className={`${card} py-16 text-center`}>
            <ScrollText size={36} className="text-slate-300 mx-auto mb-3" />
            <p className="text-sm font-bold text-slate-600">No script yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="lg:col-span-2 space-y-5">
              <div className={card}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <h4 className={panelHead}><ScrollText size={15} className="text-emerald-500" /> Generation {current.version}</h4>
                    <p className="text-[10px] text-slate-400 font-medium mt-1">{current.word_count} words · ~{current.est_seconds}s read · target {selected.target_seconds}s</p>
                  </div>
                  <button type="button" onClick={() => setPrompterOpen(true)}
                    className="px-3 py-1.5 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 hover:bg-emerald-600 transition">
                    <MonitorPlay size={13} /> Teleprompter
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 mt-3">A-roll lines are yours to record — SOT segments are verbatim from the sources. Cut them in this order.</p>
                <div className="mt-3 space-y-2.5">
                  {current.script.map((b, i) => (
                    <div key={i} className={`p-4 rounded-2xl border ${b.lane === 'aroll' ? 'bg-amber-50/60 border-amber-100' : 'bg-blue-50/50 border-blue-100'}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-[9px] font-black uppercase tracking-widest ${b.lane === 'aroll' ? 'text-amber-600' : 'text-blue-600'}`}>
                          {b.lane === 'aroll' ? 'YOU · A-ROLL (record this)' : b.speaker}
                        </span>
                        <span className="text-[9px] font-black text-slate-300">#{i + 1}{b.source_label ? ` · ${b.source_label}` : ''}</span>
                      </div>
                      <p className={`text-sm mt-1.5 ${b.lane === 'sot' ? 'italic text-slate-700' : 'font-medium text-slate-800'}`}>{b.lane === 'sot' ? `“${b.text}”` : b.text}</p>
                      {b.rationale && <p className="text-[10px] text-slate-400 mt-1.5">{b.rationale}</p>}
                    </div>
                  ))}
                </div>
              </div>

              <div className={card}>
                <h4 className={panelHead}><MessageSquarePlus size={15} className="text-emerald-500" /> Give Feedback</h4>
                <p className="text-[10px] text-slate-400 mt-1.5">Talk to it like a writer on your team — it revises the script while keeping the formula, hook, and length on target.</p>
                <textarea className={`${inputCls} h-20 resize-none mt-3`} value={feedback} onChange={e => setFeedback(e.target.value)}
                  placeholder="e.g. 'Lean harder into the privacy angle. Cut the pricing detail. End on the open question instead of the summary.'" />
                <div className="flex items-center justify-between mt-2">
                  <p className="text-[10px] text-slate-400">Saved as a new version — the current one stays in history.</p>
                  <button type="button" disabled={!feedback.trim() || !!busy} onClick={() => handleRegenerate(feedback.trim())}
                    className="px-4 py-2 bg-teal-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 hover:bg-teal-600 transition disabled:opacity-40">
                    {busy === 'revise' ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />} Revise Script
                  </button>
                </div>
              </div>

              {current.hooks?.length > 0 && (
                <div className={card}>
                  <h4 className={panelHead}><Lightbulb size={15} className="text-amber-500" /> Hook Lab</h4>
                  <div className="mt-3 space-y-2.5">
                    {current.hooks.map((h, i) => (
                      <div key={i} className="pl-3 border-l-2 border-amber-200">
                        <p className="text-sm font-bold text-slate-800">{h.text}</p>
                        <p className="text-[10px] text-slate-400 mt-0.5"><span className="font-black text-amber-600">{h.archetype}</span>{h.rationale ? ` — ${h.rationale}` : ''}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-5">
              <div className={card}>
                <h4 className={panelHead}><History size={15} className="text-slate-400" /> Script Versions</h4>
                <div className="mt-3 space-y-1.5">
                  {generations.map(g => (
                    <button key={g.id} type="button" disabled={g.is_current || !!busy}
                      onClick={() => run('switch', async () => { await setCurrentGeneration(selected.id, g.id); setGenerations(await getClipGenerations(selected.id)); })}
                      className={`w-full text-left p-3 rounded-xl border transition ${g.is_current ? 'border-emerald-400 bg-emerald-50/60' : 'border-slate-100 bg-slate-50 hover:border-slate-300'}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-slate-700">v{g.version}{g.feedback_prompt ? ' · revised' : ''}</span>
                        {g.is_current && <span className="text-[9px] font-black text-emerald-600 uppercase">Current</span>}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">{g.model} · ~{g.est_seconds}s{g.tokens_used ? ` · ${g.tokens_used.toLocaleString()} tok` : ''}</p>
                    </button>
                  ))}
                </div>
              </div>

              {current.fact_checks?.length > 0 && (
                <div className={card}>
                  <h4 className={panelHead}><ShieldAlert size={15} className="text-orange-500" /> Fact Check</h4>
                  <span className="inline-block mt-2 px-2 py-0.5 rounded bg-orange-50 text-[9px] font-black text-orange-600 uppercase tracking-widest">verify before recording</span>
                  <ul className="mt-3 space-y-2.5">
                    {current.fact_checks.map((f, i) => (
                      <li key={i} className="text-[11px] text-slate-600 leading-relaxed">
                        <span className="font-bold text-slate-800">{f.claim}</span> — {f.advice}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {current.formula && (
                <div className={card}>
                  <h4 className={panelHead}><Wand2 size={15} className="text-violet-500" /> Learned Formula</h4>
                  <p className="text-[11px] text-slate-600 leading-relaxed mt-3 whitespace-pre-wrap">{current.formula}</p>
                </div>
              )}

              {current.receipts?.length > 0 && (
                <div className={card}>
                  <h4 className={panelHead}><Quote size={15} className="text-blue-500" /> Receipts</h4>
                  {sources.length > 0 && (
                    <p className="text-[10px] text-slate-400 mt-2">
                      {sources.map(s => `${s.label}: ${s.filename || s.url || 'pasted text'}`).join(' · ')}
                    </p>
                  )}
                  <div className="mt-3 space-y-3">
                    {current.receipts.map((r, i) => (
                      <div key={i} className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                        <span className="text-[9px] font-black text-blue-600 uppercase">{r.source_label}</span>
                        <p className="text-[11px] font-bold text-slate-700 mt-1">{r.claim}</p>
                        <p className="text-[10px] text-slate-500 italic mt-1">“{r.quote}”</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* ─── B-ROLL TAB ─── */}
        {tab === 'broll' && (
          brollBeats.length === 0 ? (
            <div className={`${card} py-16 text-center`}>
              <Clapperboard size={36} className="text-slate-300 mx-auto mb-3" />
              {!scriptApproved ? (
                <>
                  <p className="text-sm font-bold text-slate-600">Approve the script first</p>
                  <p className="text-xs text-slate-400 mt-1">B-roll planning works from the approved cut sheet.</p>
                </>
              ) : (
                <>
                  <p className="text-sm font-bold text-slate-600">No B-roll plan yet</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">Each script beat gets a Remotion direction, template params, and complementary real-footage prompts.</p>
                  <button type="button" disabled={!!busy} onClick={handleGeneratePlan}
                    className="mt-4 px-5 py-2.5 bg-violet-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 mx-auto hover:bg-violet-700 transition disabled:opacity-40">
                    {busy === 'broll-plan' ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />} Generate B-roll Plan
                  </button>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {/* Queue bar */}
              <div className={`${card} flex items-center justify-between gap-3 flex-wrap`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={panelHead}><Layers size={14} /> Render Queue</span>
                  {([['running', queueCounts.running, 'bg-amber-100 text-amber-700'], ['queued', queueCounts.queued, 'bg-slate-100 text-slate-500'], ['done', queueCounts.done, 'bg-emerald-100 text-emerald-700'], ['failed', queueCounts.failed, 'bg-rose-100 text-rose-600']] as const).map(([label, n, cls]) => (
                    <span key={label} className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${cls}`}>{n} {label}</span>
                  ))}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button type="button" disabled={!!busy} onClick={handleGeneratePlan}
                    className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:border-violet-400 transition flex items-center gap-1 disabled:opacity-40">
                    {busy === 'broll-plan' ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />} Regenerate Plan
                  </button>
                  <button type="button" disabled={!!busy} onClick={() => run('render-all', async () => {
                    const n = await queueAllRenders(brollBeats);
                    setRenderJobs(await getRenderJobs(selected.id));
                    addToast(`${n} renders queued — the clip worker picks them up`, 'success');
                  })}
                    className="px-3 py-2 bg-violet-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-violet-700 transition flex items-center gap-1 disabled:opacity-40">
                    <Video size={12} /> Render All
                  </button>
                </div>
              </div>

              {/* Filters */}
              <div className="flex gap-1.5 flex-wrap">
                {(['all', 'rendered', 'kept', 'undecided', 'failed'] as const).map(f => (
                  <button key={f} type="button" onClick={() => setBrollFilter(f)}
                    className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition ${brollFilter === f ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-300'}`}>{f}</button>
                ))}
              </div>

              {/* Beat cards */}
              {filteredBeats.map(beat => {
                const job = latestJobForBeat(beat.id);
                const tm = TRIAGE_META[beat.triage];
                const draft = promptDrafts[beat.id];
                const dirty = draft !== undefined && draft !== (beat.remotion_prompt || '');
                return (
                  <div key={beat.id} className={card}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded bg-slate-900 text-white text-[9px] font-black">{fmtRange(beat.time_start, beat.time_end)}</span>
                      <span className="px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 text-[9px] font-black uppercase tracking-widest">{BEAT_TYPE_LABEL[beat.beat_type] || beat.beat_type}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${tm.cls}`}>{tm.label}</span>
                    </div>
                    <h4 className="text-base font-black text-slate-800 mt-2">{beat.headline}</h4>
                    {beat.rationale && <p className="text-[11px] text-slate-400 mt-1">{beat.rationale}</p>}

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                      {/* Preview / render */}
                      <div>
                        {job?.status === 'completed' && job.output_url ? (
                          <div className="space-y-2">
                            <video controls src={job.output_url} className="w-full max-w-[240px] aspect-[9/16] rounded-xl bg-black mx-auto lg:mx-0" />
                            <div className="flex items-center gap-2 flex-wrap">
                              {Object.entries(job.qa || {}).map(([k, v]) => (
                                <span key={k} className="px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-100 text-[9px] font-bold text-emerald-700">{k}: {String(v)}</span>
                              ))}
                              <a href={job.output_url} download className="text-[10px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-1"><Download size={12} /> MP4</a>
                            </div>
                          </div>
                        ) : job && (job.status === 'queued' || job.status === 'running') ? (
                          <div className="w-full max-w-[240px] aspect-[9/16] rounded-xl bg-slate-900 flex flex-col items-center justify-center gap-2 mx-auto lg:mx-0">
                            <Loader2 size={20} className="animate-spin text-slate-400" />
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{job.status}</span>
                          </div>
                        ) : job?.status === 'failed' ? (
                          <div className="w-full max-w-[240px] aspect-[9/16] rounded-xl bg-rose-50 border border-rose-100 flex flex-col items-center justify-center gap-2 p-3 mx-auto lg:mx-0">
                            <span className="text-[9px] font-black text-rose-500 uppercase">render failed</span>
                            <p className="text-[9px] text-rose-400 text-center line-clamp-4">{job.error_message}</p>
                          </div>
                        ) : (
                          <div className="w-full max-w-[240px] aspect-[9/16] rounded-xl bg-slate-50 border border-dashed border-slate-200 flex items-center justify-center mx-auto lg:mx-0">
                            <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">not rendered</span>
                          </div>
                        )}
                        <button type="button" disabled={!!busy || job?.status === 'queued' || job?.status === 'running'}
                          onClick={() => run(`render-${beat.id}`, async () => {
                            await queueBeatRender(beat);
                            setRenderJobs(await getRenderJobs(selected.id));
                            addToast('Render queued', 'success');
                          })}
                          className="mt-2 px-3 py-1.5 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-violet-600 transition disabled:opacity-40 flex items-center gap-1">
                          <Video size={12} /> {job?.status === 'completed' || job?.status === 'failed' ? 'Re-render' : 'Render'}
                        </button>
                      </div>

                      {/* Prompt + footage */}
                      <div>
                        <label className={labelCls}>Remotion direction <span className="normal-case font-medium text-slate-400">— edit, then regenerate to redraw this beat</span></label>
                        <textarea className={`${inputCls} h-28 resize-none text-xs`} value={draft ?? beat.remotion_prompt ?? ''}
                          onChange={e => setPromptDrafts(prev => ({ ...prev, [beat.id]: e.target.value }))} />
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          {dirty && (
                            <button type="button" disabled={!!busy} onClick={() => run(`save-${beat.id}`, async () => {
                              await updateBrollBeat(beat.id, { remotion_prompt: draft });
                              setBrollBeats(prev => prev.map(b => b.id === beat.id ? { ...b, remotion_prompt: draft } : b));
                              setPromptDrafts(prev => { const n = { ...prev }; delete n[beat.id]; return n; });
                              addToast('Direction saved', 'success');
                            })}
                              className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition">Save Direction</button>
                          )}
                          <button type="button" disabled={!!busy} onClick={() => run(`reprompt-${beat.id}`, async () => {
                            if (!selected) return;
                            if (!geminiApiKey) { addToast('Gemini API key missing — add it in Settings', 'error'); return; }
                            // Persist any unsaved direction edit first, so the model regenerates from it.
                            let current = beat;
                            if (dirty && draft !== undefined) {
                              await updateBrollBeat(beat.id, { remotion_prompt: draft });
                              current = { ...beat, remotion_prompt: draft };
                              setPromptDrafts(prev => { const n = { ...prev }; delete n[beat.id]; return n; });
                            }
                            const updated = await regenerateBeat(selected, current, geminiApiKey);
                            setBrollBeats(prev => prev.map(b => b.id === beat.id ? updated : b));
                            addToast('Beat regenerated from your direction', 'success');
                          })}
                            className="px-3 py-1.5 bg-violet-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-violet-700 transition flex items-center gap-1 disabled:opacity-40">
                            {busy === `reprompt-${beat.id}` ? <Loader2 size={11} className="animate-spin" /> : <Wand2 size={11} />} Reprompt + Generate
                          </button>
                        </div>
                        {beat.footage_prompts?.length > 0 && (
                          <div className="mt-3">
                            <label className={labelCls}>Complementary footage prompts <span className="normal-case font-medium">(Seedance / Veo — footage lane, not motion graphics)</span></label>
                            <ul className="space-y-1">
                              {beat.footage_prompts.map((f, i) => <li key={i} className="text-[11px] text-slate-500 bg-slate-50 rounded-lg px-3 py-2">{f}</li>)}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Triage */}
                    <div className="flex gap-1.5 mt-4 flex-wrap">
                      {triageBtn(beat, 'kept', ThumbsUp, 'Keep', 'bg-emerald-600 border-emerald-600 text-white')}
                      {triageBtn(beat, 'rejected', ThumbsDown, 'Reject', 'bg-rose-500 border-rose-500 text-white')}
                      {triageBtn(beat, 'edited', Pencil, 'Made the edit', 'bg-blue-600 border-blue-600 text-white')}
                      {triageBtn(beat, 'winner', Trophy, 'Winner', 'bg-amber-500 border-amber-500 text-white')}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}

        {/* ─── RUNS TAB ─── */}
        {tab === 'runs' && (
          renderJobs.length === 0 ? (
            <div className={`${card} py-16 text-center`}>
              <History size={36} className="text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-bold text-slate-600">No runs yet</p>
              <p className="text-xs text-slate-400 mt-1">Queue renders from the B-roll tab — the clip worker picks them up and results land here.</p>
            </div>
          ) : (
            <div className={card}>
              <h4 className={panelHead}><History size={15} className="text-slate-400" /> Render Runs</h4>
              <div className="mt-3 space-y-1.5">
                {renderJobs.map(j => {
                  const beat = brollBeats.find(b => b.id === j.beat_id);
                  const cls = j.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : j.status === 'failed' ? 'bg-rose-100 text-rose-600' : j.status === 'running' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500';
                  return (
                    <div key={j.id} className="flex items-center justify-between gap-3 text-xs bg-slate-50 rounded-xl px-3 py-2.5 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className={`shrink-0 px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${cls}`}>{j.status}</span>
                        <span className="font-black text-slate-700 text-[10px] uppercase tracking-widest shrink-0">{j.job_type === 'assemble' ? 'Assemble' : BEAT_TYPE_LABEL[beat?.beat_type || ''] || 'Beat'}</span>
                        <span className="text-slate-500 truncate">{j.job_type === 'assemble' ? 'Final video stitch' : beat?.headline || j.beat_id}</span>
                      </div>
                      <span className="flex items-center gap-2 shrink-0">
                        {j.error_message && <span className="text-[10px] text-rose-500 max-w-[280px] truncate" title={j.error_message}>{j.error_message}</span>}
                        {j.duration_seconds != null && <span className="text-[10px] text-slate-400">{Number(j.duration_seconds).toFixed(1)}s · {j.width}x{j.height}</span>}
                        {j.output_url && <a href={j.output_url} target="_blank" rel="noreferrer" className="text-emerald-600"><ExternalLink size={13} /></a>}
                        <span className="text-[10px] text-slate-400">{new Date(j.created_at).toLocaleTimeString()}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-slate-400 mt-3">Renders run on the local clip worker (<span className="font-mono">workers/clip-render-worker</span>) — see its README to start it.</p>
            </div>
          )
        )}

        {/* ─── PUBLISH TAB ─── */}
        {tab === 'publish' && (
          <div className="space-y-5">
            {/* Assembly */}
            <div className={card}>
              <h4 className={panelHead}><Layers size={15} className="text-blue-500" /> Assembly</h4>
              <p className="text-[10px] text-slate-400 mt-1.5">Kept / winner clips stitch in beat order into the final vertical video. Or download clips individually from the B-roll tab and cut externally.</p>
              {keptClips.length === 0 ? (
                <p className="text-xs text-slate-400 mt-3">No kept clips with finished renders yet — triage and render in the B-roll tab first.</p>
              ) : (
                <>
                  <div className="mt-3 space-y-1.5">
                    {keptClips.map(({ beat, job }, i) => (
                      <div key={beat.id} className="flex items-center justify-between text-xs bg-slate-50 rounded-xl px-3 py-2">
                        <span className="flex items-center gap-2 min-w-0">
                          <span className="font-black text-slate-300">#{i + 1}</span>
                          <span className="px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 text-[9px] font-black uppercase">{BEAT_TYPE_LABEL[beat.beat_type]}</span>
                          <span className="text-slate-600 truncate">{beat.headline}</span>
                        </span>
                        <a href={job!.output_url!} target="_blank" rel="noreferrer" className="text-emerald-600 shrink-0"><ExternalLink size={13} /></a>
                      </div>
                    ))}
                  </div>
                  <button type="button" disabled={!!busy || assembleJob?.status === 'queued' || assembleJob?.status === 'running'}
                    onClick={() => run('assemble', async () => {
                      await queueAssemble(selected, keptClips.map(x => x.job!.output_url!));
                      setRenderJobs(await getRenderJobs(selected.id));
                      addToast('Assembly queued — the clip worker stitches the final video', 'success');
                    })}
                    className="mt-3 px-4 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition disabled:opacity-40 flex items-center gap-1.5">
                    {assembleJob?.status === 'queued' || assembleJob?.status === 'running' ? <Loader2 size={13} className="animate-spin" /> : <Layers size={13} />} Stitch Final Video ({keptClips.length} clips)
                  </button>
                </>
              )}
              {selected.final_video_url && (
                <div className="mt-4 space-y-2">
                  <label className={labelCls}>Final video</label>
                  <video controls src={selected.final_video_url} className="w-full max-w-[280px] aspect-[9/16] rounded-xl bg-black" />
                  <a href={selected.final_video_url} download className="text-[11px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-1"><Download size={13} /> Download MP4</a>
                </div>
              )}
            </div>

            {/* Publish */}
            <div className={card}>
              <h4 className={panelHead}><Send size={15} className="text-emerald-500" /> Publish to YouTube (Shorts)</h4>
              {!videoForPublish ? (
                <p className="text-xs text-slate-400 mt-3">Needs a final video — stitch above (or keep exactly one rendered clip).</p>
              ) : !pubMeta ? (
                <button type="button" disabled={!!busy} onClick={() => run('meta', async () => {
                  setPubMeta(await generateClipMetadata(selected, current, geminiApiKey || ''));
                })}
                  className="mt-3 px-4 py-2 bg-cyan-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-cyan-700 transition disabled:opacity-40 flex items-center gap-1.5">
                  {busy === 'meta' ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />} Prepare Metadata
                </button>
              ) : (
                <div className="mt-3 space-y-3">
                  <div><label className={labelCls}>Title</label>
                    <input className={inputCls} value={pubMeta.title} onChange={e => setPubMeta({ ...pubMeta, title: e.target.value })} /></div>
                  <div><label className={labelCls}>Description</label>
                    <textarea className={`${inputCls} h-24 resize-none`} value={pubMeta.description} onChange={e => setPubMeta({ ...pubMeta, description: e.target.value })} /></div>
                  <p className="text-[11px] font-bold text-cyan-600">{pubMeta.hashtags.join(' ')}</p>
                  <div className="flex flex-wrap gap-1">{pubMeta.tags.slice(0, 20).map((t, i) => <span key={i} className="px-2 py-0.5 rounded bg-slate-100 text-[9px] font-bold text-slate-500">{t}</span>)}</div>
                  <button type="button" disabled={!!busy} onClick={() => run('publish', async () => {
                    await publishClip(selected, videoForPublish!, pubMeta);
                    setPublications(await getClipPublications(selected.id));
                    await refreshProject(selected.id);
                    addToast('Publishing — n8n uploads to YouTube', 'success');
                  })}
                    className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition disabled:opacity-40 flex items-center gap-1.5">
                    {busy === 'publish' ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />} Publish to YouTube
                  </button>
                </div>
              )}

              {publications.length > 0 && (
                <div className="mt-4 space-y-1.5">
                  {publications.map(p => (
                    <div key={p.id} className="flex items-center justify-between text-xs bg-slate-50 rounded-xl px-3 py-2">
                      <span className="font-black text-slate-700 uppercase tracking-widest text-[10px]">{p.platform}</span>
                      <span className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${p.status === 'live' ? 'bg-emerald-100 text-emerald-700' : p.status === 'failed' ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>{p.status}</span>
                        {p.external_url && <a href={p.external_url} target="_blank" rel="noreferrer" className="text-emerald-600"><ExternalLink size={13} /></a>}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-slate-400 mt-3">Publishing runs through the n8n flow <span className="font-mono">E8-clip-publish</span> (same YouTube OAuth as Episodes).</p>
            </div>
          </div>
        )}

        {prompterOpen && <Teleprompter text={aRollText} onClose={() => setPrompterOpen(false)} />}
      </div>
    );
  }

  // ─── Library ────────────────────────────────────────────────────────
  const visible = projects.filter(p => {
    const archived = p.status === 'archived';
    if (showArchived !== archived) return false;
    if (videoOnly && !p.final_video_url) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return p.title.toLowerCase().includes(q) || (p.hook_line || '').toLowerCase().includes(q) || p.status.includes(q);
  });

  const kpis = {
    active: projects.filter(p => p.status !== 'archived').length,
    production: projects.filter(p => ['production', 'publishing', 'published'].includes(p.status)).length,
    archived: projects.filter(p => p.status === 'archived').length,
    withVideo: projects.filter(p => !!p.final_video_url && p.status !== 'archived').length,
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {header}
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl overflow-hidden border border-slate-200">
            {([['active', `Active ${kpis.active}`], ['archive', `Archive ${kpis.archived}`]] as const).map(([id, label]) => (
              <button key={id} type="button" onClick={() => setShowArchived(id === 'archive')}
                className={`px-3 py-2 text-[10px] font-black uppercase tracking-widest transition ${(id === 'archive') === showArchived ? 'bg-slate-900 text-white' : 'bg-white text-slate-500'}`}>{label}</button>
            ))}
          </div>
          <button type="button" onClick={() => setMode('create')}
            className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 hover:bg-emerald-700 transition">
            <Plus size={14} /> Create a Short
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {([['Active scripts', kpis.active], ['In production', kpis.production], ['Archived', kpis.archived]] as const).map(([label, n]) => (
          <div key={label} className={card}><p className={labelCls}>{label}</p><p className="text-2xl font-black text-slate-800">{n}</p></div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <input className={inputCls} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search title, hook, or status" />
        {!showArchived && (
          <button type="button" onClick={() => setVideoOnly(v => !v)}
            className={`shrink-0 px-3 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition flex items-center gap-1.5 ${videoOnly ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:border-slate-300'}`}>
            <Video size={13} /> With video{kpis.withVideo ? ` ${kpis.withVideo}` : ''}
          </button>
        )}
        <button type="button" onClick={loadProjects} className="p-2.5 text-slate-400 hover:text-emerald-600 transition shrink-0"><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></button>
      </div>

      {visible.length === 0 && !loading ? (
        <div className={`${card} py-16 text-center`}>
          <Film size={36} className="text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-slate-600">{showArchived ? 'Nothing archived' : 'No shorts yet'}</p>
          {!showArchived && <p className="text-xs text-slate-400 mt-1">Feed it a transcript, article, or interview and it writes the script.</p>}
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map(p => {
            const pm = STATUS_META[p.status] || STATUS_META.draft;
            return (
              <div key={p.id} className={`${card} flex items-center justify-between gap-4 flex-wrap`}>
                <div className="flex items-center gap-4 min-w-0 flex-1">
                  {p.final_video_url && (
                    <button type="button" onClick={() => openProject(p)}
                      title="Open — play in the Publish tab"
                      className="relative shrink-0 w-16 aspect-[9/16] rounded-lg overflow-hidden bg-black group">
                      {/* #t seeks to a frame so the poster isn't a black first frame */}
                      <video src={`${p.final_video_url}#t=0.5`} muted playsInline preload="metadata" className="w-full h-full object-cover" />
                      <span className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/40 transition">
                        <Play size={18} className="text-white fill-white/90" />
                      </span>
                    </button>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${pm.cls}`}>{pm.label}</span>
                      {p.final_video_url && <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-700 flex items-center gap-1"><Video size={10} /> Video</span>}
                      {(p.format?.kinds || []).map(k => <span key={k} className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-blue-100 text-blue-700">{k}</span>)}
                    </div>
                    <h3 className="font-black text-slate-800 mt-1.5 truncate">{p.title}</h3>
                    {p.hook_line && <p className="text-xs text-slate-400 mt-0.5 line-clamp-1">{p.hook_line}</p>}
                    <p className="text-[10px] text-slate-400 font-medium mt-1">target {p.target_seconds}s · {p.branch || 'no branch'} · updated {new Date(p.updated_at).toLocaleDateString()}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex gap-0.5">{[1, 2, 3, 4, 5].map(n => <Star key={n} size={12} className={p.rating && p.rating >= n ? 'text-amber-400 fill-amber-400' : 'text-slate-200'} />)}</div>
                  {p.final_video_url && (
                    <a href={p.final_video_url} download title="Download MP4"
                      className="p-2 text-slate-300 hover:text-emerald-600 transition"><Download size={15} /></a>
                  )}
                  <button type="button" onClick={() => openProject(p)}
                    className="px-3 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 transition">Open</button>
                  {p.status !== 'archived' && (
                    <button type="button" onClick={() => run(`arch-${p.id}`, async () => { await archiveClipProject(p.id); await loadProjects(); })}
                      className="p-2 text-slate-300 hover:text-slate-600 transition"><Archive size={15} /></button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── Teleprompter: full-screen auto-scrolling A-roll ──────────────────
const Teleprompter: React.FC<{ text: string; onClose: () => void }> = ({ text, onClose }) => {
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1.5); // px per frame
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const tick = () => { if (boxRef.current) boxRef.current.scrollTop += speed; raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      <div className="flex items-center justify-between px-5 py-3 shrink-0">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setPlaying(p => !p)} className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition">
            {playing ? <Pause size={17} /> : <Play size={17} />}
          </button>
          <input type="range" min={0.5} max={4} step={0.25} value={speed} onChange={e => setSpeed(Number(e.target.value))} className="w-32 accent-emerald-500" />
          <span className="text-white/40 text-[10px] font-black uppercase tracking-widest">{speed.toFixed(2)}x</span>
        </div>
        <button type="button" onClick={onClose} className="w-10 h-10 rounded-full bg-white/10 text-white flex items-center justify-center hover:bg-white/20 transition"><X size={17} /></button>
      </div>
      <div ref={boxRef} className="flex-1 overflow-y-auto px-8 lg:px-32" onClick={() => setPlaying(p => !p)}>
        <div className="h-[40vh]" />
        <p className="text-white text-3xl lg:text-5xl font-bold leading-snug lg:leading-snug max-w-4xl mx-auto whitespace-pre-wrap">{text || 'No A-roll lines in this script yet.'}</p>
        <div className="h-[60vh]" />
      </div>
    </div>
  );
};

function fmtRange(a: number, b: number): string {
  const f = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  return `${f(Number(a))}-${f(Number(b))}`;
}

function msg(e: unknown): string { return e instanceof Error ? e.message : 'Something went wrong'; }

export default ClipStudio;
