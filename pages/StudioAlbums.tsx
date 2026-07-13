import React, { useCallback, useEffect, useState } from 'react';
import { Album, Check, Loader2, Music2, Plus, Sparkles, Wand2, X } from 'lucide-react';
import { StudioAlbum, StudioTrack } from '../types';
import { createStudioAlbum, generateStudioTrack, getStudioAlbums, getStudioTracks, planStudioTrack, reviewStudioTrack } from '../services/studioAlbumsService';

interface Props { addToast: (message: string, type?: 'success' | 'error' | 'info') => void; }
const EMPTY = { title: '', artist_name: '', description: '', genre: '', mood: '', era: '', theme: '', vocal_direction: 'instrumental', targetMinutes: 60 };
const formatDuration = (seconds: number) => `${Math.floor(seconds / 60)} min`;
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
  const [trackForm, setTrackForm] = useState({ title: '', prompt: '', duration_seconds: 30 });
  const [trackBusy, setTrackBusy] = useState(false);
  const [planningTrack, setPlanningTrack] = useState(false);

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
  // Load once when the user selects an album. Keeping this separate from the
  // poller prevents a new signed audio URL from being created on every render.
  useEffect(() => {
    if (selected) loadTracks(selected.id);
  }, [selected?.id, loadTracks]);
  const hasActiveTrack = tracks.some(track => track.review_status === 'regenerating');
  useEffect(() => {
    if (!selected || !hasActiveTrack) return;
    const poll = window.setInterval(() => loadTracks(selected.id), 5000);
    return () => clearInterval(poll);
  }, [selected?.id, hasActiveTrack, loadTracks]);

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

  const generateTrack = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected || !trackForm.title.trim() || !trackForm.prompt.trim()) { addToast('Track title and generation prompt are required.', 'error'); return; }
    setTrackBusy(true);
    try {
      const track = await generateStudioTrack(selected.id, { ...trackForm, title: trackForm.title.trim(), prompt: trackForm.prompt.trim() });
      setTracks(current => [...current, track]); setTrackForm({ title: '', prompt: '', duration_seconds: 30 }); addToast('Generation queued through the legacy Lyria adapter.', 'success');
    } catch (error) { addToast(error instanceof Error ? error.message : 'Could not queue track generation.', 'error'); }
    finally { setTrackBusy(false); }
  };
  const planTrack = async () => {
    if (!selected) return;
    setPlanningTrack(true);
    try {
      const plan = await planStudioTrack(selected.id);
      setTrackForm(current => ({ ...current, ...plan }));
      addToast('Track title and generation prompt are ready to review.', 'success');
    } catch (error) { addToast(error instanceof Error ? error.message : 'Could not plan the next track.', 'error'); }
    finally { setPlanningTrack(false); }
  };
  const reviewTrack = async (track: StudioTrack, approved: boolean) => {
    try { const updated = await reviewStudioTrack(track.id, approved); setTracks(current => current.map(item => item.id === track.id ? updated : item)); addToast(approved ? 'Track approved.' : 'Track rejected.', approved ? 'success' : 'info'); }
    catch (error) { addToast(error instanceof Error ? error.message : 'Could not update track review.', 'error'); }
  };

  if (loading) return <div className="py-20 flex justify-center"><Loader2 className="animate-spin text-emerald-600" /></div>;
  if (unavailable) return <section className="max-w-3xl mx-auto bg-amber-50 border border-amber-200 rounded-[2rem] p-8"><h1 className="font-black text-xl text-slate-800">Music Albums is safely gated</h1><p className="mt-3 text-sm text-slate-600">{unavailable}</p><p className="mt-3 text-xs text-slate-500">Apply the Studio Albums migration, then add your user ID to the <code>studio_music_enabled</code> flag’s allow list before using this production module.</p></section>;

  return <div className="max-w-7xl mx-auto space-y-8">
    <section className="bg-slate-950 text-white rounded-[2rem] p-8 lg:p-10"><div className="flex gap-4 items-start"><div className="p-3 bg-emerald-500/20 rounded-2xl"><Music2 className="text-emerald-300" /></div><div><p className="text-emerald-300 text-[10px] font-black uppercase tracking-[.2em]">Trellis Studio</p><h1 className="text-3xl font-black tracking-tight mt-1">Music Albums</h1><p className="mt-3 max-w-2xl text-sm text-slate-300">A separate production pipeline. Album planning is available now; generation, mastering, visuals, and publishing remain explicit approval gates.</p></div></div></section>
    <section className="grid lg:grid-cols-[1.15fr_.85fr] gap-8 items-start"><form onSubmit={submit} className="bg-white border border-slate-200 rounded-[2rem] p-6 lg:p-8 space-y-5"><div><p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">New production</p><h2 className="text-xl font-black text-slate-800">Start an album brief</h2><p className="mt-1 text-xs text-slate-500">Start with a suggestion, or type any direction that fits your release.</p></div><div className="grid sm:grid-cols-2 gap-4">{BRIEF_FIELDS.map(({ field, label, hint, placeholder, suggestions }) => <label key={field} className="text-xs font-bold text-slate-600">{label}<span className="block mt-0.5 text-[10px] font-medium text-slate-400 normal-case">{hint}</span><input list={suggestions ? `studio-${field}-ideas` : undefined} placeholder={placeholder} value={form[field]} onChange={e => update(field, e.target.value)} className="mt-1.5 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm placeholder:text-slate-300" />{suggestions && <datalist id={`studio-${field}-ideas`}>{suggestions.map(suggestion => <option value={suggestion} key={suggestion} />)}</datalist>}</label>)}</div><label className="text-xs font-bold text-slate-600 block">Session description<span className="block mt-0.5 text-[10px] font-medium text-slate-400 normal-case">Optional: describe the listener’s world, purpose, or pacing.</span><textarea placeholder="A polished instrumental set for a focused morning work session, with Riviera energy and subtle intrigue." value={form.description} onChange={e => update('description', e.target.value)} className="mt-1.5 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm placeholder:text-slate-300 min-h-20" /></label><div className="grid sm:grid-cols-2 gap-4"><label className="text-xs font-bold text-slate-600">Target duration (minutes)<span className="block mt-0.5 text-[10px] font-medium text-slate-400 normal-case">A 60-minute album is a good starting point.</span><input type="number" min="1" max="240" value={form.targetMinutes} onChange={e => update('targetMinutes', Number(e.target.value))} className="mt-1.5 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm" /></label><label className="text-xs font-bold text-slate-600">Vocals<span className="block mt-0.5 text-[10px] font-medium text-slate-400 normal-case">Choose the overall vocal direction.</span><select value={form.vocal_direction} onChange={e => update('vocal_direction', e.target.value)} className="mt-1.5 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm"><option value="instrumental">Instrumental only</option><option value="mostly_instrumental">Mostly instrumental</option><option value="vocals">Vocals featured</option></select></label></div><button disabled={creating} className="inline-flex items-center gap-2 bg-emerald-600 text-white px-5 py-3 rounded-xl text-xs font-black uppercase tracking-wider disabled:opacity-50">{creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Create album</button></form>
      <div className="bg-emerald-50 border border-emerald-100 rounded-[2rem] p-7"><Sparkles className="text-emerald-600" /><h2 className="mt-4 font-black text-slate-800">First vertical slice</h2><p className="mt-2 text-sm text-slate-600">Create an album → plan one track → generate → save to private Studio storage → review it. No publishing handoff is connected yet.</p></div></section>
    <section><h2 className="text-lg font-black text-slate-800 mb-4">Albums</h2>{albums.length === 0 ? <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-10 text-center text-sm text-slate-500">No album briefs yet.</div> : <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">{albums.map(album => <button type="button" onClick={() => { setSelected(album); setTracks([]); }} key={album.id} className={`text-left bg-white border rounded-2xl p-5 ${selected?.id === album.id ? 'border-emerald-500 ring-2 ring-emerald-100' : 'border-slate-200'}`}><div className="flex justify-between gap-3"><div><h3 className="font-black text-slate-800">{album.title}</h3><p className="text-sm text-slate-500">{album.artist_name}</p></div><Album size={20} className="text-emerald-600" /></div><p className="mt-4 text-xs text-slate-500">{[album.genre, album.mood, album.era].filter(Boolean).join(' · ') || 'Brief not yet classified'}</p><div className="mt-4 flex justify-between text-[10px] uppercase tracking-wider font-black"><span className="text-slate-400">{formatDuration(album.target_duration_seconds)}</span><span className="text-amber-600">{album.status.replaceAll('_', ' ')}</span></div></button>)}</div>}</section>
    {selected && <section className="bg-white border border-slate-200 rounded-[2rem] p-6 lg:p-8"><div className="flex justify-between gap-4"><div><p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">AI Music Director</p><h2 className="text-xl font-black text-slate-800">{selected.title}</h2><p className="text-sm text-slate-500">Create a title and Lyria-ready prompt from this album brief, then generate when it looks right.</p></div><button onClick={() => setSelected(null)} className="text-slate-400 hover:text-slate-800"><X /></button></div><form onSubmit={generateTrack} className="mt-6 grid lg:grid-cols-[1fr_2fr_120px_auto] gap-3 items-end"><label className="text-xs font-bold text-slate-600">Track title<input value={trackForm.title} onChange={e => setTrackForm(current => ({ ...current, title: e.target.value }))} placeholder="Use AI Music Director" className="mt-1.5 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm" /></label><label className="text-xs font-bold text-slate-600">Generation prompt<input value={trackForm.prompt} onChange={e => setTrackForm(current => ({ ...current, prompt: e.target.value }))} placeholder="Generate a track idea first" className="mt-1.5 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm" /></label><label className="text-xs font-bold text-slate-600">Seconds<input type="number" min="15" max="165" value={trackForm.duration_seconds} onChange={e => setTrackForm(current => ({ ...current, duration_seconds: Number(e.target.value) }))} className="mt-1.5 w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm" /></label><div className="flex gap-2"><button type="button" onClick={planTrack} disabled={planningTrack || trackBusy} className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 px-3 py-3 rounded-xl text-xs font-black uppercase tracking-wider disabled:opacity-50">{planningTrack ? <Loader2 className="animate-spin" size={16} /> : <Wand2 size={16} />} Plan</button><button disabled={trackBusy || !trackForm.title || !trackForm.prompt} className="bg-slate-950 text-white px-4 py-3 rounded-xl text-xs font-black uppercase tracking-wider disabled:opacity-50">{trackBusy ? <Loader2 className="animate-spin" size={16} /> : 'Generate'}</button></div></form><div className="mt-6 space-y-3">{tracks.length === 0 ? <p className="text-sm text-slate-500">Use <strong>Plan</strong> to create the first title and prompt.</p> : tracks.map(track => <div key={track.id} className="border border-slate-200 rounded-2xl p-4 flex flex-wrap gap-4 items-center justify-between"><div><p className="font-black text-slate-800">{track.track_number}. {track.title}</p><p className="text-xs text-slate-500">{track.duration_seconds || '—'} sec · {track.review_status.replaceAll('_', ' ')}</p></div><div className="flex gap-2 items-center">{track.audio_url && <audio controls src={track.audio_url} className="h-8 max-w-[220px]" />} {track.review_status === 'pending_review' && <><button onClick={() => reviewTrack(track, true)} className="p-2 text-emerald-600 bg-emerald-50 rounded-lg" title="Approve"><Check size={16} /></button><button onClick={() => reviewTrack(track, false)} className="p-2 text-rose-600 bg-rose-50 rounded-lg" title="Reject"><X size={16} /></button></>} {track.review_status === 'regenerating' && <Loader2 className="animate-spin text-amber-600" size={18} />} {track.review_status === 'failed' && <span className="text-xs text-rose-600">{track.rejection_reason}</span>}</div></div>)}</div></section>}
  </div>;
};
export default StudioAlbums;
