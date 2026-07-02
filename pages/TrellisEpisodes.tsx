import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Clapperboard, Loader2, RefreshCw, Plus, Music, Image as ImageIcon, Film, FileText, Send,
  CheckCircle2, Archive, Link2, Download, Wand2, ExternalLink,
} from 'lucide-react';
import {
  Episode, EpisodeAsset, EpisodeMetadata, EpisodePublication, CreateEpisodeConfig, AssetType, MusicSession, PublishPlatform,
} from '../types';
import { EPISODE_PHASES, EPISODE_STATUS_META, PUBLISH_PLATFORMS, EPISODE_ART_STYLES } from '../constants';
import {
  createEpisode, getEpisodes, getEpisode, getAssets, getMetadata, getPublications,
  linkSession, setEpisodeStatus, setAssetApproved, getSessionMasterUrl,
  generateArtwork, buildVideo, generateMetadata, approveMetadata, publishEpisode, archiveEpisode,
} from '../services/episodeService';
import { getSessions, getSession } from '../services/sessionService';

interface Props {
  branches: Array<{ slug: string; name: string }>;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  userId?: string | null;
  geminiApiKey?: string;
}

const card = 'bg-white p-5 rounded-[1.75rem] border border-slate-100 shadow-sm';
const labelCls = 'block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2';
const inputCls = 'w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium focus:bg-white focus:border-emerald-500 outline-none transition';
const phaseHead = 'text-xs font-black text-slate-700 uppercase tracking-widest flex items-center gap-2';

const TrellisEpisodes: React.FC<Props> = ({ branches, addToast, userId, geminiApiKey }) => {
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [selected, setSelected] = useState<Episode | null>(null);
  const [assets, setAssets] = useState<EpisodeAsset[]>([]);
  const [metadata, setMetadata] = useState<EpisodeMetadata | null>(null);
  const [pubs, setPubs] = useState<EpisodePublication[]>([]);
  const [sessionsList, setSessionsList] = useState<MusicSession[]>([]);
  const [linkedSession, setLinkedSession] = useState<MusicSession | null>(null);
  const [masterUrl, setMasterUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [artStyleId, setArtStyleId] = useState(EPISODE_ART_STYLES[0].id);

  const [branch, setBranch] = useState(branches[0]?.slug || '');
  const [title, setTitle] = useState('');
  const [showName, setShowName] = useState('');
  const [theme, setTheme] = useState('');
  const [linkChoice, setLinkChoice] = useState('');

  useEffect(() => { if (!branch && branches[0]) setBranch(branches[0].slug); }, [branches, branch]);

  const loadEpisodes = useCallback(async () => {
    try { setLoading(true); setEpisodes(await getEpisodes(undefined, 50)); }
    catch (e) { addToast(`Failed to load episodes: ${msg(e)}`, 'error'); }
    finally { setLoading(false); }
  }, [addToast]);
  useEffect(() => { loadEpisodes(); }, [loadEpisodes]);

  const loadDetail = useCallback(async (ep: Episode) => {
    const [a, m, p] = await Promise.all([getAssets(ep.id), getMetadata(ep.id), getPublications(ep.id)]);
    setAssets(a); setMetadata(m); setPubs(p);
    if (ep.session_id) {
      const [s, url] = await Promise.all([getSession(ep.session_id), getSessionMasterUrl(ep.session_id)]);
      setLinkedSession(s); setMasterUrl(url);
    } else { setLinkedSession(null); setMasterUrl(null); }
  }, []);

  const select = useCallback(async (ep: Episode) => {
    setSelected(ep); setAssets([]); setMetadata(null); setPubs([]); setLinkedSession(null); setMasterUrl(null);
    try { setSessionsList(await getSessions(ep.branch || undefined, 50)); } catch { /* ignore */ }
    await loadDetail(ep);
  }, [loadDetail]);

  // Poll while assets or publications are in flight
  const pollRef = useRef<number | null>(null);
  const active = useMemo(() =>
    assets.some(a => a.status === 'queued' || a.status === 'processing') ||
    pubs.some(p => p.status === 'pending' || p.status === 'uploading' || p.status === 'processing'),
  [assets, pubs]);
  useEffect(() => {
    if (!selected || !active) { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } return; }
    pollRef.current = window.setInterval(async () => {
      const [a, p, ep] = await Promise.all([getAssets(selected.id), getPublications(selected.id), getEpisode(selected.id)]);
      setAssets(a); setPubs(p);
      if (!ep) return;
      // A publication went live → advance the episode to 'published' (once)
      if (p.some(x => x.status === 'live') && ep.status === 'publishing') {
        setEpisodeStatus(ep.id, 'published').catch(() => {});
        const done = { ...ep, status: 'published' as const };
        setSelected(done); setEpisodes(prev => prev.map(x => x.id === ep.id ? done : x));
      } else {
        setSelected(ep); setEpisodes(prev => prev.map(x => x.id === ep.id ? ep : x));
      }
    }, 5000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  }, [selected, active]);

  const latest = (type: AssetType) => assets.filter(a => a.asset_type === type).sort((x, y) => y.version - x.version)[0];
  const cover = latest('cover_art');
  const video = latest('video_mp4');

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); if (selected) await loadDetail(selected); }
    catch (e) { addToast(msg(e), 'error'); }
    finally { setBusy(''); }
  };

  const handleCreate = async () => {
    if (!branch || !title.trim()) { addToast('Branch and title required', 'error'); return; }
    setBusy('create');
    try {
      const ep = await createEpisode({ branch, title: title.trim(), show_name: showName || undefined, theme: theme || undefined } as CreateEpisodeConfig, userId);
      setEpisodes(prev => [ep, ...prev]); setTitle(''); await select(ep);
      addToast(`Episode "${ep.title}" created`, 'success');
    } catch (e) { addToast(msg(e), 'error'); } finally { setBusy(''); }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pb-20">
      {/* Left: create + list */}
      <div className="lg:col-span-1 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-100 flex items-center justify-center"><Clapperboard className="w-6 h-6 text-emerald-600" /></div>
          <div>
            <h2 className="text-lg font-black text-slate-800 uppercase tracking-tight">Trellis Episodes</h2>
            <p className="text-[11px] text-slate-400 font-medium">AI content production pipeline</p>
          </div>
        </div>

        <div className={`${card} space-y-4`}>
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Plus size={14} /> New Episode</h3>
          <div><label className={labelCls}>Branch</label>
            <select className={inputCls} value={branch} onChange={e => setBranch(e.target.value)}>
              {branches.map(b => <option key={b.slug} value={b.slug}>{b.name}</option>)}
            </select>
          </div>
          <div><label className={labelCls}>Episode Title</label>
            <input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} placeholder="Late Night Jazz for Vinyl Lovers" />
          </div>
          <div><label className={labelCls}>Show / Brand</label>
            <input className={inputCls} value={showName} onChange={e => setShowName(e.target.value)} placeholder="Rekkrd After Dark" />
          </div>
          <div><label className={labelCls}>Theme</label>
            <input className={inputCls} value={theme} onChange={e => setTheme(e.target.value)} placeholder="smoky late-night jazz lounge" />
          </div>
          <button type="button" onClick={handleCreate} disabled={busy === 'create' || !branch || !title.trim()}
            className="w-full py-3 bg-emerald-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-emerald-700 transition disabled:opacity-50">
            {busy === 'create' ? <Loader2 size={16} className="animate-spin" /> : <Clapperboard size={16} />} Create Episode
          </button>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Episodes</h3>
            <button onClick={loadEpisodes} className="text-slate-400 hover:text-emerald-600 transition"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
          </div>
          {episodes.length === 0 && !loading ? <p className="text-xs text-slate-400 px-1 py-4">No episodes yet.</p> :
            episodes.map(ep => {
              const m = EPISODE_STATUS_META[ep.status] || EPISODE_STATUS_META.draft;
              return (
                <button key={ep.id} type="button" onClick={() => select(ep)}
                  className={`w-full text-left p-4 rounded-2xl border-2 transition ${selected?.id === ep.id ? 'border-emerald-500 bg-emerald-50/50' : 'border-slate-100 bg-white hover:border-slate-200'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-black text-slate-800 text-xs truncate">{ep.title}</span>
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest ${m.cls}`}>{m.label}</span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-medium mt-1 truncate">{ep.show_name || 'No show'}</p>
                </button>
              );
            })}
        </div>
      </div>

      {/* Right: pipeline */}
      <div className="lg:col-span-2">
        {!selected ? (
          <div className="flex flex-col items-center justify-center py-24 text-center bg-white rounded-[2rem] border border-slate-100">
            <Clapperboard size={44} className="text-slate-300 mb-3" />
            <p className="text-sm font-bold text-slate-600">Select or create an episode</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm">An episode runs the full pipeline: music → master → artwork → video → metadata → publish. Music is the first asset; everything else attaches here.</p>
          </div>
        ) : (
          <div className="space-y-5">
            {/* Header + stepper */}
            <div className={card}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-xl font-black text-slate-800">{selected.title}</h3>
                  <p className="text-[11px] text-slate-400 font-medium mt-1">{[selected.show_name, selected.theme].filter(Boolean).join(' · ') || '—'}</p>
                </div>
                <button type="button" onClick={() => run('archive', () => archiveEpisode(selected.id).then(() => setEpisodes(p => p.map(x => x.id === selected.id ? { ...x, status: 'archived' } : x))))}
                  className="px-3 py-2 text-slate-400 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-100 transition flex items-center gap-1"><Archive size={13} /> Archive</button>
              </div>
              <div className="flex items-center gap-1 mt-5 overflow-x-auto">
                {EPISODE_PHASES.map((ph, i) => {
                  const order = EPISODE_PHASES.map(p => p.key);
                  const curIdx = order.indexOf(selected.status as typeof order[number]);
                  const done = curIdx > i || selected.status === 'published';
                  const cur = order[i] === selected.status;
                  return (
                    <React.Fragment key={ph.key}>
                      {i > 0 && <div className={`h-0.5 w-5 ${done ? 'bg-emerald-500' : 'bg-slate-200'}`} />}
                      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest shrink-0 ${cur ? 'bg-slate-900 text-white' : done ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                        {done && <CheckCircle2 size={10} />}{ph.label}
                      </div>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            {/* Phase 1: Music */}
            <div className={card}>
              <h4 className={phaseHead}><Music size={15} className="text-amber-500" /> Music Session</h4>
              {linkedSession ? (
                <p className="text-xs text-slate-500 mt-3">Linked: <b className="text-slate-800">{linkedSession.title}</b> ({linkedSession.status})</p>
              ) : (
                <div className="mt-3 flex gap-2">
                  <select className={inputCls} value={linkChoice} onChange={e => setLinkChoice(e.target.value)}>
                    <option value="">Select a session…</option>
                    {sessionsList.map(s => <option key={s.id} value={s.id}>{s.title} ({s.status})</option>)}
                  </select>
                  <button type="button" disabled={!linkChoice || busy === 'link'} onClick={() => run('link', () => linkSession(selected.id, linkChoice).then(() => setSelected(p => p ? { ...p, session_id: linkChoice, status: 'master' } : p)))}
                    className="px-4 py-2.5 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1 hover:bg-emerald-600 transition disabled:opacity-40 shrink-0"><Link2 size={13} /> Link</button>
                </div>
              )}
            </div>

            {/* Phase 2: Master */}
            <div className={card}>
              <h4 className={phaseHead}><Music size={15} className="text-blue-500" /> Master Audio</h4>
              {masterUrl ? (
                <div className="mt-3 space-y-2">
                  <audio controls src={masterUrl} className="w-full" />
                  <div className="flex gap-2">
                    <a href={masterUrl} download className="text-[11px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-1"><Download size={13} /> MP3</a>
                    <span className="text-[10px] text-slate-400 italic">WAV master generated by the stitch worker (future)</span>
                  </div>
                </div>
              ) : <p className="text-xs text-slate-400 mt-3">No master yet — stitch approved tracks in the linked session first.</p>}
            </div>

            {/* Phase 3: Artwork */}
            <div className={card}>
              <h4 className={phaseHead}><ImageIcon size={15} className="text-violet-500" /> Artwork</h4>

              {/* Art style picker — drives the generator's look + scene setting */}
              <div className="mt-3">
                <label className={labelCls}>Art Style</label>
                <select value={artStyleId} onChange={e => setArtStyleId(e.target.value)} disabled={!!busy}
                  className={inputCls}>
                  {EPISODE_ART_STYLES.map(s => (
                    <option key={s.id} value={s.id}>{s.name} — {s.desc}</option>
                  ))}
                </select>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {(['cover_art', 'thumbnail', 'vertical'] as AssetType[]).map(t => (
                  <button key={t} type="button" disabled={!!busy} onClick={() => run(`art-${t}`, () => generateArtwork(selected, t, undefined, EPISODE_ART_STYLES.find(s => s.id === artStyleId)).then(() => {}))}
                    className="px-3 py-1.5 rounded-lg bg-violet-50 border border-violet-100 text-[10px] font-black text-violet-600 uppercase tracking-tight hover:border-violet-400 transition disabled:opacity-40 flex items-center gap-1">
                    <Wand2 size={11} /> {t.replace('_', ' ')}
                  </button>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {(['cover_art', 'thumbnail', 'vertical'] as AssetType[]).map(t => {
                  const a = latest(t);
                  if (!a) return <div key={t} className="aspect-video rounded-xl bg-slate-50 border border-dashed border-slate-200 flex items-center justify-center text-[9px] font-black text-slate-300 uppercase">{t.replace('_', ' ')}</div>;
                  return (
                    <div key={t} className="relative rounded-xl overflow-hidden border border-slate-200">
                      {a.status === 'ready' && a.url ? <img src={a.url} alt={t} className="w-full aspect-video object-cover" /> :
                        <div className="w-full aspect-video bg-slate-50 flex items-center justify-center">{a.status === 'failed' ? <span className="text-[9px] text-rose-500 font-black">FAILED</span> : <Loader2 size={16} className="animate-spin text-slate-400" />}</div>}
                      {a.status === 'ready' && (
                        <button type="button" onClick={() => run('approve-art', () => setAssetApproved(a.id, !a.approved))}
                          className={`absolute bottom-1 right-1 px-2 py-0.5 rounded text-[8px] font-black uppercase ${a.approved ? 'bg-emerald-600 text-white' : 'bg-white/90 text-slate-600'}`}>{a.approved ? '✓' : 'approve'}</button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Phase 4: Video */}
            <div className={card}>
              <h4 className={phaseHead}><Film size={15} className="text-indigo-500" /> Video</h4>
              <div className="mt-3">
                <button type="button" disabled={!masterUrl || !!busy} onClick={() => run('video', () => buildVideo(selected, masterUrl!, cover?.url || null).then(() => {}))}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1 hover:bg-indigo-700 transition disabled:opacity-40">
                  <Film size={13} /> Build Video (master + cover)
                </button>
                {!masterUrl && <span className="ml-2 text-[10px] text-slate-400">needs a master</span>}
              </div>
              {video && (
                <div className="mt-3">
                  {video.status === 'ready' && video.url ? (
                    <div className="space-y-2">
                      <video controls src={video.url} className="w-full rounded-xl bg-black" />
                      <a href={video.url} download className="text-[11px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-1"><Download size={13} /> MP4</a>
                    </div>
                  ) : <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 rounded-xl p-3"><Loader2 size={13} className="animate-spin" /> Rendering video…</div>}
                </div>
              )}
            </div>

            {/* Phase 5: Metadata */}
            <div className={card}>
              <h4 className={phaseHead}><FileText size={15} className="text-cyan-500" /> Metadata</h4>
              <button type="button" disabled={!!busy} onClick={() => run('meta', () => generateMetadata(selected, linkedSession, geminiApiKey || '').then(() => {}))}
                className="mt-3 px-4 py-2 bg-cyan-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-1 hover:bg-cyan-700 transition disabled:opacity-40">
                {busy === 'meta' ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />} Generate Metadata
              </button>
              {metadata && (
                <div className="mt-3 space-y-2 text-xs">
                  <div><span className={labelCls}>Title</span><p className="font-bold text-slate-800">{metadata.title}</p></div>
                  {metadata.description && <div><span className={labelCls}>Description</span><p className="text-slate-600 whitespace-pre-wrap line-clamp-4">{metadata.description}</p></div>}
                  {metadata.chapters?.length > 0 && <div><span className={labelCls}>Chapters</span><p className="text-slate-600 font-mono text-[11px]">{metadata.chapters.map(c => `${c.time} ${c.title}`).join('  ·  ')}</p></div>}
                  {metadata.tags?.length > 0 && <div className="flex flex-wrap gap-1">{metadata.tags.slice(0, 30).map((t, i) => <span key={i} className="px-2 py-0.5 rounded bg-slate-100 text-[9px] font-bold text-slate-500">{t}</span>)}</div>}
                  {metadata.hashtags?.length > 0 && <p className="text-[11px] font-bold text-cyan-600">{metadata.hashtags.join(' ')}</p>}
                  <button type="button" onClick={() => run('approve-meta', () => approveMetadata(selected.id))}
                    className={`mt-1 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest ${metadata.status === 'approved' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    {metadata.status === 'approved' ? '✓ Approved' : 'Approve Metadata'}
                  </button>
                </div>
              )}
            </div>

            {/* Phase 6: Publish */}
            <div className={card}>
              <h4 className={phaseHead}><Send size={15} className="text-emerald-500" /> Publish</h4>
              <div className="mt-3 flex flex-wrap gap-2">
                {PUBLISH_PLATFORMS.map(p => (
                  <button key={p.id} type="button" disabled={!p.available || !!busy}
                    onClick={() => run(`pub-${p.id}`, () => publishEpisode(selected, p.id as PublishPlatform, video?.url || null, metadata).then(() => {}))}
                    className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-100 text-[10px] font-black text-emerald-700 uppercase tracking-tight hover:border-emerald-400 transition disabled:opacity-40 flex items-center gap-1">
                    <Send size={11} /> {p.label}{!p.available && ' (soon)'}
                  </button>
                ))}
              </div>
              {pubs.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  {pubs.map(p => (
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

function msg(e: unknown): string { return e instanceof Error ? e.message : 'Something went wrong'; }

export default TrellisEpisodes;
