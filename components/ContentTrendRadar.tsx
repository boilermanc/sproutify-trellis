import { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowUpRight, Check, Copy, Download, Loader2, Radar, RefreshCw, Save, Search, Sparkles, Upload, X } from 'lucide-react';
import { radarDraftText, radarRequest, type RadarConfig, type RadarOpportunity, type RadarSnapshot } from '../services/contentTrendRadarService';
import type { ContentIntelligenceProject, ContentPost } from '../services/contentIntelligenceRegistry';

interface Props {
  project: ContentIntelligenceProject;
  website?: string;
  posts: ContentPost[];
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}
const field = 'mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-normal text-slate-800 outline-none focus:border-emerald-500';
const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50';
const primary = `${button} !border-emerald-600 !bg-emerald-600 !text-white hover:!bg-emerald-700`;
const when = (value: string) => new Date(value).toLocaleString();
const draftRunning = (item: RadarOpportunity) => item.draft_status === 'generating' && Boolean(item.draft_started_at) && Date.parse(item.draft_started_at!) > Date.now() - 600000;

function Sources({ opportunity }: { opportunity: RadarOpportunity }) {
  const evidence = opportunity.evidence;
  const signal = evidence.signal;
  const label = evidence.kind === 'google_trends_csv' ? 'Google Trends export' : evidence.kind === 'google_trends_rss' ? 'Google Trends current searches' : 'Search research · demand unverified';
  return <div className="space-y-3 text-xs text-slate-500">
    <div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-sky-50 px-3 py-1 font-bold text-sky-700">{label}</span><span>{opportunity.country}</span>{signal?.growth_display && <span className="font-bold text-emerald-700">{signal.growth_display} growth</span>}{signal?.traffic_display && <span>{signal.traffic_display} approximate feed traffic</span>}</div>
    {(signal?.captured_at || evidence.captured_at) && <p>Captured {when(signal?.captured_at || evidence.captured_at!)}</p>}
    {signal?.filters && <p>{signal.filters.date} · Category {signal.filters.category} · {signal.filters.property} · {signal.filters.seed || 'No seed term'}</p>}
    <div className="flex flex-wrap gap-x-4 gap-y-2">{evidence.sources.map((source, index) => <a key={`${source.url}-${index}`} href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-bold text-emerald-700 underline decoration-emerald-200 underline-offset-4">{source.title || 'Research source'}<ArrowUpRight size={12} /></a>)}</div>
    {evidence.search_entry_point && <iframe title="Google Search suggestions for this research" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={evidence.search_entry_point} className="h-28 w-full rounded-xl border-0" />}
  </div>;
}

export default function ContentTrendRadar({ project, website, posts, addToast }: Props) {
  const [data, setData] = useState<RadarSnapshot | null>(null);
  const [config, setConfig] = useState<RadarConfig>({ website: website ? (/^https?:\/\//i.test(website) ? website : 'https://' + website) : '', country: 'US', language: 'English', category: '', brief: '', strategy: '', existing_pages: [], interval_days: 7, auto_draft: true });
  const [pagesText, setPagesText] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('active');
  const [search, setSearch] = useState('');
  const [csv, setCsv] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [capturedDate, setCapturedDate] = useState(new Date().toISOString().slice(0, 10));
  const alive = useRef(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const projectId = project.projectId;

  async function refresh(resetForm = false) {
    const snapshot = await radarRequest<RadarSnapshot>(projectId, 'list');
    if (!alive.current) return;
    setData(snapshot); setError('');
    if (resetForm) {
      const saved = snapshot.settings;
      if (saved) { setConfig(saved.config); setPagesText(saved.config.existing_pages.join('\n')); setEnabled(saved.enabled); }
      else setPagesText(posts.filter(post => post.canonical_url && website && post.canonical_url.startsWith(website)).map(post => post.canonical_url).join('\n'));
    }
  }
  useEffect(() => {
    alive.current = true;
    refresh(true).catch(caught => { if (alive.current) setError(caught.message); }).finally(() => { if (alive.current) setLoading(false); });
    return () => { alive.current = false; };
  }, [projectId]); // Component is keyed by project; responses cannot cross brand boundaries.

  const inProgress = data?.runs.some(run => run.status === 'running' && Date.parse(run.lease_expires_at) > Date.now()) || data?.opportunities.some(draftRunning);
  useEffect(() => {
    if (!inProgress && !busy) return;
    const timer = window.setInterval(() => { refresh().catch(() => {}); }, 6000);
    return () => window.clearInterval(timer);
  }, [inProgress, busy, projectId]);

  async function perform(label: string, action: () => Promise<string>) {
    setBusy(label); setError('');
    try { const success = await action(); if (alive.current) addToast(success, 'success'); }
    catch (caught) {
      const detail = caught instanceof Error ? caught.message : 'Trend Radar could not finish this action.';
      if (alive.current) { setError(detail); addToast(detail, 'error'); }
    } finally {
      try { await refresh(); } catch { /* Preserve the actionable failure and current work. */ }
      if (alive.current) setBusy('');
    }
  }
  async function saveSettings() {
    const next = { ...config, existing_pages: pagesText.split(/\r?\n/).map(line => line.trim()).filter(Boolean), strategy: [project.contentStrategy, project.seoSocialRules, project.contentLearnings].filter(Boolean).join('\n\n').slice(0, 12000) };
    await radarRequest(projectId, 'save', { config: next, enabled });
  }
  const update = <K extends keyof RadarConfig>(key: K, value: RadarConfig[K]) => setConfig(current => ({ ...current, [key]: value }));
  const canAct = Boolean(data?.can_manage) && !busy && !loading;
  const visible = (data?.opportunities || []).filter(item => (filter === 'all' || (filter === 'active' ? item.status !== 'dismissed' : item.status === filter)) && `${item.query} ${item.title}`.toLowerCase().includes(search.toLowerCase()));
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); addToast('Copied draft text.', 'success'); } catch { addToast('Clipboard unavailable. Use Download draft instead.', 'error'); } };
  const download = (item: RadarOpportunity) => {
    const url = URL.createObjectURL(new Blob([radarDraftText(item)], { type: 'text/markdown;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `trellis-${item.id}.md`; document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    addToast('Download requested. If your browser does not save it, use Copy draft bundle.', 'info');
  };

  return <div className="space-y-6">
    <section className="rounded-[2rem] border border-emerald-200 bg-emerald-50/60 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2 text-emerald-700"><Radar size={20} /><span className="text-xs font-black uppercase tracking-widest">Trend Radar</span></div><h2 className="mt-2 text-xl font-black text-slate-900">Find the next useful thing to publish</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Discover timely searches and research topics that fit this brand. Keep the evidence, improve existing pages, and turn worthwhile ideas into article and social drafts.</p></div><button type="button" className={button} disabled={loading} onClick={() => perform('refresh', async () => { await refresh(); return 'Trend Radar refreshed.'; })}><RefreshCw size={15} />Refresh</button></div>
      <p className="mt-4 text-xs text-emerald-800">Uses your existing Gemini key for research and writing. AI and search usage may be billed by your provider. No additional SEO subscription is required.</p>
    </section>
    {error && <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><AlertCircle className="shrink-0" size={18} />{error}</div>}
    {loading ? <div className="flex items-center gap-2 p-6 text-slate-500"><Loader2 className="animate-spin" size={20} />Loading brand research…</div> : <>
      <details open={!data?.settings} className="rounded-[2rem] border border-slate-200 bg-white p-6">
        <summary className="cursor-pointer font-bold text-slate-800">Brand & schedule <span className="ml-2 text-xs font-normal text-slate-500">{data?.settings?.enabled ? `Enabled · next eligible ${when(data.settings.next_run_at)}` : 'Automatic scans paused'}</span></summary>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <label className="text-xs font-bold text-slate-600">Website<input className={field} type="url" value={config.website} onChange={event => update('website', event.target.value)} placeholder="https://yourwebsite.com" /></label>
          <label className="text-xs font-bold text-slate-600">Business category<input className={field} value={config.category} onChange={event => update('category', event.target.value)} placeholder="Gardening, seedlings, garden education…" maxLength={160} /></label>
          <label className="text-xs font-bold text-slate-600">Target country<input className={field} value={config.country} onChange={event => update('country', event.target.value.toUpperCase())} maxLength={2} placeholder="US" /></label>
          <label className="text-xs font-bold text-slate-600">Language<input className={field} value={config.language} onChange={event => update('language', event.target.value)} maxLength={80} /></label>
          <label className="text-xs font-bold text-slate-600 md:col-span-2">What you sell, who you help, and your expertise<textarea className={`${field} min-h-32`} value={config.brief} onChange={event => update('brief', event.target.value)} maxLength={8000} placeholder="Include your audience, products, service area, seasonal priorities, and claims the writer should avoid." /></label>
          <label className="text-xs font-bold text-slate-600 md:col-span-2">Existing articles and landing pages · one URL per line<textarea className={`${field} min-h-24`} value={pagesText} onChange={event => setPagesText(event.target.value)} placeholder="Add pages we should improve or link to before creating more content." /></label>
          <label className="text-xs font-bold text-slate-600">Scan frequency<select className={field} value={config.interval_days} onChange={event => update('interval_days', Number(event.target.value))}><option value={7}>Weekly</option><option value={1}>Daily</option></select></label>
          <div className="space-y-3 self-end pb-2 text-sm text-slate-700"><label className="flex items-center gap-2"><input type="checkbox" checked={enabled} onChange={event => setEnabled(event.target.checked)} />Run automatically</label><label className="flex items-center gap-2"><input type="checkbox" checked={config.auto_draft} onChange={event => update('auto_draft', event.target.checked)} />Draft one new opportunity per scan</label></div>
        </div>
        <p className="mt-4 text-xs leading-5 text-slate-500">Each scan returns up to five relevant opportunities. The schedule checks for due brands every 15 minutes. Drafts remain here for review and export.</p>
        <div className="mt-5 flex flex-wrap gap-3"><button type="button" disabled={!canAct} className={button} onClick={() => perform('save', async () => { await saveSettings(); return 'Brand research settings saved.'; })}><Save size={15} />Save settings</button><button type="button" disabled={!canAct || Boolean(inProgress)} className={primary} onClick={() => perform('scan', async () => { await saveSettings(); const response = await radarRequest<{ run?: RadarRunResult; skipped?: boolean; reason?: string }>(projectId, 'scan'); return response.skipped ? response.reason! : 'Scan started. Progress and results will appear here.'; })}><Sparkles size={15} />Save & scan now</button></div>
      </details>
      {data?.settings && <button type="button" disabled={!canAct || Boolean(inProgress)} className={primary} onClick={() => perform('scan', async () => { const response = await radarRequest<{ run?: RadarRunResult; skipped?: boolean; reason?: string }>(projectId, 'scan'); return response.skipped ? response.reason! : 'Scan started. Progress and results will appear here.'; })}><Radar size={16} />Scan with saved settings</button>}
      {(busy || inProgress) && <p role="status" className="flex items-center gap-2 text-sm text-emerald-700"><Loader2 size={17} className="animate-spin" />{busy === 'draft' ? 'Researching and writing the draft…' : busy === 'scan' || inProgress ? 'Research is running. Saved progress refreshes here automatically…' : 'Saving changes…'}</p>}
      <div className="flex flex-wrap items-center justify-between gap-4"><h3 className="font-black text-slate-800">Opportunities <span className="font-normal text-slate-400">{visible.length}</span></h3><div className="flex flex-wrap gap-3"><label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3"><Search size={15} className="text-slate-400" /><input aria-label="Search opportunities" className="min-h-11 bg-transparent text-sm outline-none" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search topics" /></label><select aria-label="Filter opportunities" className={`${field} !mt-0 !w-auto`} value={filter} onChange={event => setFilter(event.target.value)}><option value="active">Active</option><option value="new">New</option><option value="drafted">Drafted</option><option value="dismissed">Dismissed</option><option value="all">All</option></select></div></div>
      {visible.length === 0 && <div className="rounded-[2rem] border border-dashed border-slate-300 bg-white p-10 text-center"><Radar size={30} className="mx-auto text-slate-300" /><h4 className="mt-3 font-bold text-slate-700">No matching opportunities yet</h4><p className="mt-2 text-sm text-slate-500">Run a scan or import Rising queries. A scan can return nothing when topics lack evidence, fit, or a new angle.</p></div>}
      {visible.map(item => <article key={item.id} className="space-y-5 rounded-[2rem] border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold text-emerald-700">{item.query}</p><h4 className="mt-1 text-lg font-black text-slate-900">{item.title}</h4></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{item.status === 'drafted' ? 'Draft ready' : item.status === 'dismissed' ? 'Dismissed' : item.recommendation === 'update_existing' ? 'Improve a page' : item.recommendation === 'needs_review' ? 'Check business fit' : 'New article idea'}</span></div>
        <p className="text-sm leading-6 text-slate-600">{item.rationale}</p><Sources opportunity={item} />
        {item.existing_url && <a className="inline-flex items-center gap-1 text-sm font-bold text-emerald-700" href={item.existing_url} target="_blank" rel="noreferrer">Page to improve<ArrowUpRight size={14} /></a>}
        <div className="rounded-xl bg-amber-50 p-4 text-xs leading-5 text-amber-900"><strong>Before publishing:</strong> {item.validation_notes}</div>
        {item.draft_error && <p className="text-sm text-rose-700">{item.draft_error}</p>}
        <div className="flex flex-wrap gap-3">{!item.draft && item.status !== 'dismissed' && <button type="button" className={primary} disabled={!canAct || draftRunning(item)} onClick={() => perform('draft', async () => { await radarRequest(projectId, 'draft', { id: item.id }); return 'Draft started. It will appear here when ready.'; })}><Sparkles size={15} />{draftRunning(item) ? 'Drafting…' : 'Create draft'}</button>}{item.draft && <><button type="button" className={button} onClick={() => copy(radarDraftText(item))}><Copy size={15} />Copy draft bundle</button><button type="button" className={button} onClick={() => download(item)}><Download size={15} />Download Markdown</button></>}<button type="button" className={button} disabled={!canAct} onClick={() => perform('review', async () => { await radarRequest(projectId, item.status === 'dismissed' ? 'restore' : 'dismiss', { id: item.id }); return item.status === 'dismissed' ? 'Opportunity restored.' : 'Opportunity dismissed.'; })}>{item.status === 'dismissed' ? <Check size={15} /> : <X size={15} />}{item.status === 'dismissed' ? 'Restore' : 'Dismiss'}</button></div>
        {item.draft && <details className="rounded-2xl border border-slate-200 p-4"><summary className="cursor-pointer text-sm font-bold text-slate-800">Read article and social drafts</summary><p className="mt-4 text-xs text-slate-500">{item.draft.citation_review_required && <strong className="mb-3 block text-amber-800">{item.draft.reused_research ? 'This draft uses previously saved research. ' : ''}Verify individual factual claims and add inline citations before publishing. The research source list is included below.</strong>}Meta description: {item.draft.meta_description}</p><pre className="mt-4 whitespace-pre-wrap break-words font-sans text-sm leading-7 text-slate-700">{item.draft.article_markdown}</pre><div className="mt-6 space-y-4">{item.draft.social_posts.map((post, index) => <div key={index} className="rounded-xl bg-slate-50 p-4"><div className="flex items-center justify-between"><strong className="text-xs uppercase text-slate-600">{post.platform}</strong><button type="button" className="text-xs font-bold text-emerald-700" onClick={() => copy(post.text)}>Copy</button></div><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-600">{post.text}</p></div>)}</div><div className="mt-4 flex flex-wrap gap-3">{item.draft.sources.map((source, index) => <a key={index} href={source.url} target="_blank" rel="noreferrer" className="text-xs text-emerald-700 underline">{source.title}</a>)}</div>{item.draft.search_entry_point && <iframe title="Google Search suggestions for this draft" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={item.draft.search_entry_point} className="mt-4 h-28 w-full border-0" />}</details>}
      </article>)}
      <details className="rounded-[2rem] border border-slate-200 bg-white p-6"><summary className="cursor-pointer font-bold text-slate-800">Import Google Trends Rising queries</summary><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-500">Explore category growth in Google Trends, choose Related queries → Rising, and download the English CSV. Include the exact Explore link and capture date so geography, category, and time range stay attached. These figures measure growth, not monthly search volume.</p><div className="mt-5 grid gap-4 md:grid-cols-2"><label className="text-xs font-bold text-slate-600">Google Trends Explore link<input type="url" className={field} value={sourceUrl} onChange={event => setSourceUrl(event.target.value)} placeholder="https://trends.google.com/trends/explore?geo=US&date=today%2012-m&cat=269" /></label><label className="text-xs font-bold text-slate-600">Capture date<input type="date" className={field} value={capturedDate} max={new Date().toISOString().slice(0, 10)} onChange={event => setCapturedDate(event.target.value)} /></label></div><input ref={fileInput} type="file" accept=".csv,text/csv" className="mt-4 block max-w-full text-sm text-slate-600" aria-label="Google Trends Rising queries CSV" onChange={async event => { const file = event.target.files?.[0]; setCsv(''); if (!file) return; if (file.size > 100000) return addToast('Choose a CSV smaller than 100 KB.', 'error'); try { setCsv(await file.text()); } catch { addToast('Could not read the CSV.', 'error'); } }} /><button type="button" className={`${button} mt-4`} disabled={!canAct || !data?.settings || !csv || !sourceUrl || Boolean(inProgress)} onClick={() => perform('import', async () => { const response = await radarRequest<{ run: RadarRunResult }>(projectId, 'import', { csv, source_url: sourceUrl, captured_at: `${capturedDate}T00:00:00Z` }); setCsv(''); if (fileInput.current) fileInput.current.value = ''; return `Imported ${response.run.new_opportunities} new queries; duplicates were skipped.`; })}><Upload size={15} />Import queries</button>{!data?.settings && <p className="mt-2 text-xs text-slate-500">Save this brand's settings before importing.</p>}</details>
      <details className="rounded-[2rem] border border-slate-200 bg-white p-6"><summary className="cursor-pointer font-bold text-slate-800">Recent scans</summary><div className="mt-4 space-y-3">{!data?.runs.length && <p className="text-sm text-slate-500">No scans recorded.</p>}{data?.runs.map(run => <div key={run.id} className="rounded-xl bg-slate-50 p-4 text-xs"><div className="flex flex-wrap justify-between gap-2 font-bold text-slate-700"><span>{when(run.started_at)} · {run.trigger_kind}</span><span>{run.status === 'running' && Date.parse(run.lease_expires_at) < Date.now() ? 'Timed out · retry available' : run.status} · {run.new_opportunities} new</span></div>{run.error_message && <p className="mt-2 text-rose-700">{run.error_message}</p>}{run.warnings.map((warning, index) => <p key={index} className="mt-2 text-amber-700">{warning}</p>)}</div>)}</div></details>
    </>}
  </div>;
}

interface RadarRunResult { new_opportunities: number }
