import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Album, Check, Loader2, Music2, Pencil, Plus, Save, Sparkles, Trash2, Wand2, X } from 'lucide-react';
import { StudioAlbum, StudioTrack } from '../types';
import { approveAllPlannedStudioTracks, approvePlannedStudioTrack, createPlannedStudioTrack, createStudioAlbum, deletePlannedStudioTrack, generateAllApprovedStudioTracks, generatePlannedStudioTrack, generateStudioTrack, getStudioAlbums, getStudioTracks, planStudioAlbum, planStudioTrack, reviewStudioTrack, StudioTrackDraft, updatePlannedStudioTrack } from '../services/studioAlbumsService';

interface Props { addToast: (message: string, type?: 'success' | 'error' | 'info') => void; }
const EMPTY = { title: '', artist_name: '', description: '', genre: '', mood: '', era: '', theme: '', vocal_direction: 'instrumental', targetMinutes: 60 };
const EMPTY_TRACK: StudioTrackDraft = { title: '', prompt: '', duration_seconds: 165 };
const formatDuration = (seconds: number) => `${Math.floor(seconds / 60)} min`;
const formatLength = (seconds: number) => `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
const BRIEF_SUGGESTIONS = {
  genre: ['Spy Jazz', 'Lo-fi Hip Hop', 'Ambient Electronica', 'Soulful House', 'Cinematic Jazz', 'Acoustic Folk'],
  mood: ['Bright & focused', 'Warm & nostalgic', 'Mysterious & elegant', 'Calm & restorative', 'Upbeat & optimistic', 'Dark & cinematic'],
  era: ['1960s', '1970s', '1980s', '1990s', 'Contemporary', 'Future-retro'],
  theme: ['French Riviera intelligence operation', 'Midnight poolside lounge', 'Sunrise greenhouse ritual', 'Rainy city rooftop', 'Desert highway at dusk', 'Coastal garden in bloom'],
};
const BRIEF_FIELDS: Array<{ field: 'title' | 'artist_name' | 'genre' | 'mood' | 'era' | 'theme'; label: string; hint: string; placeholder: string; suggestions?: string[] }> = [
  { field: 'title', label: 'Album title', hint: 'Give the release a memorable working title.', placeholder: 'Azure Coast Protocol' },
  { field: 'artist_name', label: 'Fictional artist name', hint: 'Use an original artist identity.', placeholder: 'The Covert Groove Collective' },
  { field: 'genre', label: 'Genre', hint: 'Choose a suggestion or type your own.', placeholder: '1960s Spy Jazz', suggestions: BRIEF_SUGGESTIONS.genre },
  { field: 'mood', label: 'Mood', hint: 'How should the listener feel?', placeholder: 'Bright, focused, sophisticated', suggestions: BRIEF_SUGGESTIONS.mood },
  { field: 'era', label: 'Era', hint: 'A creative reference point, not a real artist.', placeholder: '1960s', suggestions: BRIEF_SUGGESTIONS.era },
  { field: 'theme', label: 'Theme or setting', hint: 'The scene that anchors the album.', placeholder: 'French Riviera intelligence operation', suggestions: BRIEF_SUGGESTIONS.theme },
];

const StudioAlbums: React.FC<Props> = ({ addToast }) => {
  const [albums, setAlbums] = useState<StudioAlbum[]>([]);
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [selected, setSelected] = useState<StudioAlbum | null>(null);
  const [tracks, setTracks] = useState<StudioTrack[]>([]);
  const [trackForm, setTrackForm] = useState<StudioTrackDraft>(EMPTY_TRACK);
  const [trackBusy, setTrackBusy] = useState(false);
  const [generatingTrackId, setGeneratingTrackId] = useState<string | null>(null);
  const [approvingPlans, setApprovingPlans] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [planningTrack, setPlanningTrack] = useState(false);
  const [batchTrackCount, setBatchTrackCount] = useState(1);
  const [planningAlbum, setPlanningAlbum] = useState(false);
  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [editingTrack, setEditingTrack] = useState<StudioTrackDraft>(EMPTY_TRACK);
  const [savingTrack, setSavingTrack] = useState(false);

  const load = useCallback(async () => {
    try { setLoading(true); setAlbums(await getStudioAlbums()); setUnavailable(null); }
    catch (error) { setUnavailable(error instanceof Error ? error.message : 'Studio Albums is unavailable.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const loadTracks = useCallback(async (albumId: string) => {
    try { setTracks(await getStudioTracks(albumId)); }
    catch (error) { addToast(error instanceof Error ? error.message : 'Could not load tracks.', 'error'); }
  }, [addToast]);
  useEffect(() => { if (selected) loadTracks(selected.id); }, [selected?.id, loadTracks]);
  const hasActiveTrack = tracks.some(track => track.review_status === 'regenerating');
  useEffect(() => {
    if (!selected || !hasActiveTrack) return;
    const poll = window.setInterval(() => loadTracks(selected.id), 5000);
    return () => clearInterval(poll);
  }, [selected?.id, hasActiveTrack, loadTracks]);

  const totalTrackSeconds = useMemo(() => tracks.reduce((total, track) => total + (track.duration_seconds || 0), 0), [tracks]);
  const targetSeconds = selected?.target_duration_seconds || 0;
  const durationDelta = totalTrackSeconds - targetSeconds;
  const coverage = targetSeconds ? Math.min(100, Math.round((totalTrackSeconds / targetSeconds) * 100)) : 0;
  const suggestedTrackCount = durationDelta < 0 ? Math.min(24, Math.max(1, Math.ceil(Math.abs(durationDelta) / 165))) : 1;
  const initialTargetSeconds = Math.max(60, Number(form.targetMinutes) * 60);
  const initialTrackCount = Math.min(24, Math.max(1, Math.ceil(initialTargetSeconds / 165)));
  const initialTrackLength = Math.ceil(initialTargetSeconds / initialTrackCount);
  const plannedCount = tracks.filter(track => track.review_status === 'planned').length;
  const approvedForGenerationCount = tracks.filter(track => track.review_status === 'locked').length;
  const update = (field: keyof typeof EMPTY, value: string | number) => setForm(prev => ({ ...prev, [field]: value }));

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.title.trim() || !form.artist_name.trim()) { addToast('Album title and fictional artist name are required.', 'error'); return; }
    setCreating(true);
    try {
      const album = await createStudioAlbum({ ...form, target_duration_seconds: Math.max(1, Number(form.targetMinutes)) * 60, description: form.description || undefined });
      setAlbums(current => [album, ...current]); setSelected(album); setTracks([]); setForm(EMPTY); addToast(`Album “${album.title}” created.`, 'success');
    } catch (error) { addToast(error instanceof Error ? error.message : 'Could not create album.', 'error'); }
    finally { setCreating(false); }
  };
  const planTrack = async () => {
    if (!selected) return;
    setPlanningTrack(true);
    try { const plan = await planStudioTrack(selected.id); setTrackForm(current => ({ ...current, ...plan })); addToast('Next title and prompt are ready to review.', 'success'); }
    catch (error) { addToast(error instanceof Error ? error.message : 'Could not plan the next track.', 'error'); }
    finally { setPlanningTrack(false); }
  };
  const planAlbum = async (trackCount = batchTrackCount) => {
    if (!selected) return;
    setPlanningAlbum(true);
    try { const planned = await planStudioAlbum(selected.id, trackCount); setTracks(current => [...current, ...planned]); addToast(`${planned.length} tracks added to the album plan.`, 'success'); }
    catch (error) { addToast(error instanceof Error ? error.message : 'Could not plan this album.', 'error'); }
    finally { setPlanningAlbum(false); }
  };
  const validateDraft = (draft: StudioTrackDraft) => draft.title.trim() && draft.prompt.trim() && Number.isInteger(Number(draft.duration_seconds)) && draft.duration_seconds >= 15 && draft.duration_seconds <= 165;
  const addPlannedTrack = async () => {
    if (!selected || !validateDraft(trackForm)) { addToast('Add a title, prompt, and 15–165 second length first.', 'error'); return; }
    setTrackBusy(true);
    try { const track = await createPlannedStudioTrack(selected.id, { ...trackForm, title: trackForm.title.trim(), prompt: trackForm.prompt.trim() }); setTracks(current => [...current, track]); setTrackForm(EMPTY_TRACK); addToast('Track added to the album plan.', 'success'); }
    catch (error) { addToast(error instanceof Error ? error.message : 'Could not add the track.', 'error'); }
    finally { setTrackBusy(false); }
  };
  const generateTrack = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || !validateDraft(trackForm)) { addToast('Track title, generation prompt, and a 15–165 second length are required.', 'error'); return; }
    setTrackBusy(true);
    try { const track = await generateStudioTrack(selected.id, { ...trackForm, title: trackForm.title.trim(), prompt: trackForm.prompt.trim() }); setTracks(current => [...current, track]); setTrackForm(EMPTY_TRACK); addToast('Generation queued through the legacy Lyria adapter.', 'success'); }
    catch (error) { addToast(error instanceof Error ? error.message : 'Could not queue track generation.', 'error'); }
    finally { setTrackBusy(false); }
  };
  const generatePlannedTrack = async (track: StudioTrack) => {
    setGeneratingTrackId(track.id);
    try { const queued = await generatePlannedStudioTrack(track.id); setTracks(current => current.map(item => item.id === queued.id ? queued : item)); addToast(`“${track.title}” is generating through the Lyria adapter.`, 'success'); }
    catch (error) { addToast(error instanceof Error ? error.message : 'Could not queue this planned track.', 'error'); }
    finally { setGeneratingTrackId(null); }
  };
  const approvePlannedTrack = async (track: StudioTrack) => {
    try { const approved = await approvePlannedStudioTrack(track.id); setTracks(current => current.map(item => item.id === approved.id ? approved : item)); addToast(`“${track.title}” approved for generation.`, 'success'); }
    catch (error) { addToast(error instanceof Error ? error.message : 'Could not approve this plan.', 'error'); }
  };
  const approveAllPlans = async () => {
    if (!selected) return;
    setApprovingPlans(true);
    try { const approved = await approveAllPlannedStudioTracks(selected.id); const approvedIds = new Set(approved.map(track => track.id)); setTracks(current => current.map(track => approvedIds.has(track.id) ? approved.find(item => item.id === track.id)! : track)); addToast(`${approved.length} track plans approved for generation.`, 'success'); }
    catch (error) { addToast(error instanceof Error ? error.message : 'Could not approve all plans.', 'error'); }
    finally { setApprovingPlans(false); }
  };
  const generateAllPlans = async () => {
    if (!selected) return;
    setGeneratingAll(true);
    try { const queued = await generateAllApprovedStudioTracks(selected.id); const queuedIds = new Set(queued.map(track => track.id)); setTracks(current => current.map(track => queuedIds.has(track.id) ? queued.find(item => item.id === track.id)! : track)); addToast(`${queued.length} approved tracks are generating through the Lyria adapter.`, 'success'); }
    catch (error) { addToast(error instanceof Error ? error.message : 'Could not queue approved tracks.', 'error'); }
    finally { setGeneratingAll(false); }
  };
  const saveTrack = async () => {
    if (!editingTrackId || !validateDraft(editingTrack)) { addToast('Add a title, prompt, and 15–165 second length first.', 'error'); return; }
    setSavingTrack(true);
    try { const updated = await updatePlannedStudioTrack(editingTrackId, editingTrack); setTracks(current => current.map(track => track.id === updated.id ? updated : track)); setEditingTrackId(null); addToast('Track plan updated.', 'success'); }
    catch (error) { addToast(error instanceof Error ? error.message : 'Could not update the track.', 'error'); }
    finally { setSavingTrack(false); }
  };
  const deleteTrack = async (track: StudioTrack) => {
    if (!window.confirm(`Delete “${track.title}” from this album plan?`)) return;
    try { await deletePlannedStudioTrack(track.id); setTracks(current => current.filter(item => item.id !== track.id).map((item, index) => ({ ...item, track_number: index + 1 }))); addToast('Track removed from the plan.', 'info'); }
    catch (error) { addToast(error instanceof Error ? error.message : 'Could not delete the track.', 'error'); }
  };
  const reviewTrack = async (track: StudioTrack, approved: boolean) => {
    try { const updated = await reviewStudioTrack(track.id, approved); setTracks(current => current.map(item => item.id === track.id ? updated : item)); addToast(approved ? 'Track approved.' : 'Track rejected.', approved ? 'success' : 'info'); }
    catch (error) { addToast(error instanceof Error ? error.message : 'Could not update track review.', 'error'); }
  };

  if (loading) return <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-emerald-600" /></div>;
  if (unavailable) return <section className="max-w-3xl mx-auto bg-amber-50 border border-amber-200 rounded-[2rem] p-8"><h1 className="font-black text-xl text-slate-800">Music Albums is safely gated</h1><p className="mt-3 text-sm text-slate-600">{unavailable}</p></section>;

  return <div className="max-w-7xl mx-auto space-y-8">
    <section className="bg-slate-950 text-white rounded-[2rem] p-8 lg:p-10"><div className="flex gap-4 items-start"><div className="p-3 bg-emerald-500/20 rounded-2xl"><Music2 className="text-emerald-300" /></div><div><p className="text-emerald-300 text-[10px] font-black uppercase tracking-[.2em]">Trellis Studio</p><h1 className="text-3xl font-black tracking-tight mt-1">Music Albums</h1><p className="mt-3 max-w-2xl text-sm text-slate-300">Plan the full record, shape its running time, then explicitly approve each generation.</p></div></div></section>
    <section className="grid lg:grid-cols-[1.15fr_.85fr] gap-8 items-start"><form onSubmit={submit} className="bg-white border border-slate-200 rounded-[2rem] p-6 lg:p-8 space-y-5"><div><p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">New production</p><h2 className="text-xl font-black text-slate-800">Start an album brief</h2></div><div className="grid sm:grid-cols-2 gap-4">{BRIEF_FIELDS.map(({ field, label, hint, placeholder, suggestions }) => <label key={field} className="text-xs font-bold text-slate-600">{label}<span className="block mt-0.5 text-[10px] font-medium text-slate-400 normal-case">{hint}</span><input list={suggestions ? `studio-${field}-ideas` : undefined} placeholder={placeholder} value={form[field]} onChange={e => update(field, e.target.value)} className="mt-1.5 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm placeholder:text-slate-300" />{suggestions && <datalist id={`studio-${field}-ideas`}>{suggestions.map(suggestion => <option value={suggestion} key={suggestion} />)}</datalist>}</label>)}</div><label className="text-xs font-bold text-slate-600 block">Session description<textarea placeholder="A polished instrumental set for a focused morning work session." value={form.description} onChange={e => update('description', e.target.value)} className="mt-1.5 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm min-h-20" /></label><div className="grid sm:grid-cols-2 gap-4"><label className="text-xs font-bold text-slate-600">Target duration (minutes)<input type="number" min="1" max="240" value={form.targetMinutes} onChange={e => update('targetMinutes', Number(e.target.value))} className="mt-1.5 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm" /><span className="mt-1 block text-[10px] font-medium text-emerald-700 normal-case">We’ll plan {initialTrackCount} tracks at about {formatLength(initialTrackLength)} each.</span></label><label className="text-xs font-bold text-slate-600">Vocals<select value={form.vocal_direction} onChange={e => update('vocal_direction', e.target.value)} className="mt-1.5 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm"><option value="instrumental">Instrumental only</option><option value="mostly_instrumental">Mostly instrumental</option><option value="vocals">Vocals featured</option></select></label></div><button disabled={creating} className="inline-flex items-center gap-2 bg-emerald-600 text-white px-5 py-3 rounded-xl text-xs font-black uppercase tracking-wider disabled:opacity-50">{creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Create album</button></form><div className="bg-emerald-50 border border-emerald-100 rounded-[2rem] p-7"><Sparkles className="text-emerald-600" /><h2 className="mt-4 font-black text-slate-800">Automatic running time</h2><p className="mt-2 text-sm text-slate-600">The initial plan calculates the track count and individual lengths needed to hit your target. You only adjust it later if you want to change the creative shape.</p></div></section>
    <section><h2 className="text-lg font-black text-slate-800 mb-4">Albums</h2>{albums.length === 0 ? <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-10 text-center text-sm text-slate-500">No album briefs yet.</div> : <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{albums.map(album => <button type="button" onClick={() => { setSelected(album); setTracks([]); setEditingTrackId(null); }} key={album.id} className={`text-left bg-white border rounded-2xl p-5 ${selected?.id === album.id ? 'border-emerald-500 ring-2 ring-emerald-100' : 'border-slate-200'}`}><div className="flex justify-between gap-3"><div><h3 className="font-black text-slate-800">{album.title}</h3><p className="text-sm text-slate-500">{album.artist_name}</p></div><Album size={20} className="text-emerald-600" /></div><p className="mt-4 text-xs text-slate-500">{[album.genre, album.mood, album.era].filter(Boolean).join(' · ') || 'Brief not yet classified'}</p><div className="mt-4 flex justify-between text-[10px] uppercase tracking-wider font-black"><span className="text-slate-400">{formatDuration(album.target_duration_seconds)}</span><span className="text-amber-600">{album.status.replaceAll('_', ' ')}</span></div></button>)}</div>}</section>
    {selected && <section className="bg-white border border-slate-200 rounded-[2rem] p-6 lg:p-8"><div className="flex justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">AI Music Director</p><h2 className="text-xl font-black text-slate-800">{selected.title}</h2><p className="text-sm text-slate-500">Build the tracklist, approve the plans, then generate the approved tracks.</p></div><button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-800"><X /></button></div>
      <div className="mt-6 bg-slate-50 border border-slate-200 rounded-2xl p-4"><div className="flex flex-wrap items-baseline justify-between gap-2"><div><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Album running time</p><p className="mt-1 font-black text-slate-800">{formatLength(totalTrackSeconds)} <span className="text-sm font-bold text-slate-400">of {formatLength(targetSeconds)}</span></p></div><p className={`text-xs font-black ${durationDelta === 0 ? 'text-emerald-600' : durationDelta > 0 ? 'text-amber-600' : 'text-slate-500'}`}>{durationDelta === 0 ? 'Target reached' : durationDelta > 0 ? `${formatLength(durationDelta)} over target` : `${formatLength(Math.abs(durationDelta))} remaining`}</p></div><div className="mt-3 h-2 bg-slate-200 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${coverage}%` }} /></div><p className="mt-2 text-[11px] text-slate-500">{tracks.length} planned track{tracks.length === 1 ? '' : 's'} · Adjust track durations or add/remove tracks to shape the album.</p></div>
      {(plannedCount > 0 || approvedForGenerationCount > 0) && <div className="mt-4 flex flex-wrap gap-3 items-center bg-slate-950 rounded-2xl p-4 text-white"><div className="mr-auto"><p className="text-[10px] font-black uppercase tracking-widest text-emerald-300">Generation approval</p><p className="text-xs text-slate-300">{plannedCount} awaiting plan approval · {approvedForGenerationCount} approved to generate</p></div>{plannedCount > 0 && <button type="button" onClick={approveAllPlans} disabled={approvingPlans || generatingAll} className="inline-flex items-center gap-2 bg-emerald-500 text-slate-950 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider disabled:opacity-50">{approvingPlans ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Approve all plans</button>}{approvedForGenerationCount > 0 && <button type="button" onClick={generateAllPlans} disabled={generatingAll || approvingPlans} className="inline-flex items-center gap-2 bg-white text-slate-950 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider disabled:opacity-50">{generatingAll ? <Loader2 size={16} className="animate-spin" /> : <Music2 size={16} />} Generate all approved</button>}</div>}
      <div className="mt-4 flex flex-wrap gap-3 items-end bg-emerald-50 border border-emerald-100 rounded-2xl p-4">{tracks.length === 0 ? <><button type="button" onClick={() => planAlbum(suggestedTrackCount)} disabled={planningAlbum} className="inline-flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider disabled:opacity-50">{planningAlbum ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />} Plan {suggestedTrackCount} tracks for {formatLength(targetSeconds)}</button><p className="text-xs text-emerald-800">The planned lengths total exactly {formatLength(targetSeconds)}. No music credits are used.</p></> : durationDelta < 0 ? <><button type="button" onClick={() => planAlbum(suggestedTrackCount)} disabled={planningAlbum} className="inline-flex items-center gap-2 bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider disabled:opacity-50">{planningAlbum ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} />} Fill remaining {formatLength(Math.abs(durationDelta))}</button><p className="text-xs text-emerald-800">Adds {suggestedTrackCount} planned tracks and balances their lengths to reach the target automatically.</p></> : <p className="text-xs font-bold text-emerald-800">Your planned runtime is at the target. Add extra tracks only if you want a longer release.</p>}<label className="text-xs font-bold text-slate-600">Custom extra tracks<input type="number" min="1" max="24" value={batchTrackCount} onChange={e => setBatchTrackCount(Math.max(1, Math.min(24, Number(e.target.value) || 1)))} className="mt-1.5 block w-28 bg-white border border-emerald-200 rounded-xl px-3 py-2 text-sm" /></label>{tracks.length > 0 && <button type="button" onClick={() => planAlbum()} disabled={planningAlbum} className="inline-flex items-center gap-2 bg-white text-emerald-700 border border-emerald-200 px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider disabled:opacity-50"><Plus size={16} /> Add custom</button>}</div>
      <form onSubmit={generateTrack} className="mt-6 grid lg:grid-cols-[1fr_2fr_120px_auto] gap-3 items-end"><label className="text-xs font-bold text-slate-600">Track title<input value={trackForm.title} onChange={e => setTrackForm(current => ({ ...current, title: e.target.value }))} placeholder="Use AI Music Director" className="mt-1.5 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm" /></label><label className="text-xs font-bold text-slate-600">Generation prompt<input value={trackForm.prompt} onChange={e => setTrackForm(current => ({ ...current, prompt: e.target.value }))} placeholder="Generate a track idea first" className="mt-1.5 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm" /></label><label className="text-xs font-bold text-slate-600">Seconds<input type="number" min="15" max="165" value={trackForm.duration_seconds} onChange={e => setTrackForm(current => ({ ...current, duration_seconds: Number(e.target.value) }))} className="mt-1.5 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm" /></label><div className="flex flex-wrap gap-2"><button type="button" onClick={planTrack} disabled={planningTrack || trackBusy} className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-3 py-3 rounded-xl text-xs font-black uppercase tracking-wider disabled:opacity-50">{planningTrack ? <Loader2 className="animate-spin" size={16} /> : <Wand2 size={16} />} Plan</button><button type="button" onClick={addPlannedTrack} disabled={trackBusy} className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-700 px-3 py-3 rounded-xl text-xs font-black uppercase tracking-wider disabled:opacity-50"><Plus size={16} /> Add</button><button disabled={trackBusy || !trackForm.title || !trackForm.prompt} className="bg-slate-950 text-white px-4 py-3 rounded-xl text-xs font-black uppercase tracking-wider disabled:opacity-50">{trackBusy ? <Loader2 className="animate-spin" size={16} /> : 'Generate now'}</button></div></form>
      <div className="mt-6 space-y-3">{tracks.length === 0 ? <p className="text-sm text-slate-500">Plan the full album, or use <strong>Plan</strong> to add one track at a time.</p> : tracks.map(track => { const editable = !track.legacy_generation_id && ['planned', 'failed', 'rejected'].includes(track.review_status); const editing = editingTrackId === track.id; const statusLabel = track.review_status === 'locked' ? 'approved for generation' : track.review_status.replaceAll('_', ' '); return <div key={track.id} className="border border-slate-200 rounded-2xl p-4"><div className="flex flex-wrap gap-4 items-start justify-between"><div className="min-w-0 flex-1">{editing ? <div className="grid md:grid-cols-[1fr_2fr_110px] gap-3"><input aria-label="Track title" value={editingTrack.title} onChange={e => setEditingTrack(current => ({ ...current, title: e.target.value }))} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold" /><input aria-label="Generation prompt" value={editingTrack.prompt} onChange={e => setEditingTrack(current => ({ ...current, prompt: e.target.value }))} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm" /><input aria-label="Seconds" type="number" min="15" max="165" value={editingTrack.duration_seconds} onChange={e => setEditingTrack(current => ({ ...current, duration_seconds: Number(e.target.value) }))} className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-sm" /></div> : <><p className="font-black text-slate-800">{track.track_number}. {track.title}</p><p className="text-xs text-slate-500">{track.duration_seconds || '—'} sec · {statusLabel}</p><p className="mt-1 text-xs text-slate-400 max-w-2xl">{track.prompt}</p></>}</div><div className="flex gap-2 items-center">{editing ? <><button onClick={saveTrack} disabled={savingTrack} className="p-2 text-emerald-700 bg-emerald-50 rounded-lg" title="Save track"><Save size={16} /></button><button onClick={() => setEditingTrackId(null)} className="p-2 text-slate-500 bg-slate-100 rounded-lg" title="Cancel"><X size={16} /></button></> : <>{track.audio_url && <audio controls src={track.audio_url} className="h-8 max-w-[220px]" />}{editable && <><button onClick={() => { setEditingTrackId(track.id); setEditingTrack({ title: track.title, prompt: track.prompt, duration_seconds: track.duration_seconds || 165 }); }} className="p-2 text-slate-600 bg-slate-100 rounded-lg" title="Edit track"><Pencil size={16} /></button><button onClick={() => deleteTrack(track)} className="p-2 text-rose-600 bg-rose-50 rounded-lg" title="Delete track"><Trash2 size={16} /></button>{track.review_status === 'planned' && <button onClick={() => approvePlannedTrack(track)} className="inline-flex items-center gap-1.5 bg-emerald-600 text-white px-3 py-2 rounded-lg text-xs font-black uppercase tracking-wider" title="Approve this plan for generation"><Check size={15} /> Approve</button>}</>}{track.review_status === 'locked' && <button onClick={() => generatePlannedTrack(track)} disabled={generatingTrackId === track.id || generatingAll} className="inline-flex items-center gap-1.5 bg-slate-950 text-white px-3 py-2 rounded-lg text-xs font-black uppercase tracking-wider disabled:opacity-50" title="Generate approved track">{generatingTrackId === track.id ? <Loader2 className="animate-spin" size={15} /> : <Music2 size={15} />} Generate</button>}{track.review_status === 'pending_review' && <><button onClick={() => reviewTrack(track, true)} className="p-2 text-emerald-600 bg-emerald-50 rounded-lg" title="Approve audio"><Check size={16} /></button><button onClick={() => reviewTrack(track, false)} className="p-2 text-rose-600 bg-rose-50 rounded-lg" title="Reject audio"><X size={16} /></button></>}{track.review_status === 'regenerating' && <Loader2 className="animate-spin text-amber-600" size={18} />}{track.review_status === 'failed' && <span className="text-xs text-rose-600">{track.rejection_reason}</span>}</>}</div></div></div>; })}</div>
    </section>}
  </div>;
};
export default StudioAlbums;
