import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle, ArrowRight, BadgeCheck, Building2, CalendarClock, Check,
  ClipboardCheck, Download, ExternalLink, FileSearch, Filter,
  Globe2, Inbox, ListChecks, Loader2, Mail, Map, MapPin, MessageSquarePlus,
  Phone, Plus, Pencil, RefreshCw, Save, Search, ShieldCheck, Sparkles, Target,
  Trash2, Users, X,
} from 'lucide-react';
import type {
  ProspectingEvidenceDecision, ProspectingProspect, ProspectingProspectDetail, ProspectingSalesStage,
  ProspectingStats, ProspectingTaskStatus, ProspectingTerritory,
  ProspectingVerificationState,
} from '../types';
import {
  addProspectNote, cancelProspectTask,
  completeProspectTask, createOrUpdateProspect, createProspect, createProspectClaim,
  createProspectContact, createProspectTask, createTerritory, exportProspectsCsv,
  getProspectDetail, getProspectingAccessStatus, getProspectingStats,
  listProspects, listTerritories, reviewProspectClaim, updateProspect,
  updateProspectClaim, updateProspectContact, updateProspectStage,
  updateProspectVerification, updateTerritory,
} from '../services/prospectingService';
import {
  getProspectResearchSnapshot, getResearchCandidateSnapshot, getProspectingResearchRun, importProspectingResearchCandidate,
  listProspectingResearchRuns, pollProspectingResearchRun,
  retryProspectingResearchRun, reviewProspectingResearchCandidate,
  startProspectingResearch,
} from '../services/prospectingResearchService';
import type { ProspectingResearchCandidate, ProspectingTerritoryMarketFactor } from '../services/prospectingResearchService';
import ProspectDossier from '../components/prospecting/ProspectDossier';

type Tab = 'research' | 'pipeline' | 'review' | 'playbook' | 'territories';
type ToastFn = (message: string, type?: 'success' | 'error' | 'info') => void;

type ResearchMode = 'county' | 'zip' | 'state' | 'city';
type ResearchRun = Record<string, any>;
type ResearchCandidate = Record<string, any>;

interface ProspectingProps { addToast: ToastFn; }

const STAGES = ['new', 'audited', 'review_pending', 'pitch_ready', 'contacted', 'engaged', 'demo_booked', 'won', 'nurture', 'not_a_fit'] as const;
const STAGE_META: Record<string, { label: string; style: string }> = {
  new: { label: 'New', style: 'bg-slate-100 text-slate-700' },
  audited: { label: 'Audited', style: 'bg-sky-100 text-sky-700' },
  review_pending: { label: 'Review pending', style: 'bg-amber-100 text-amber-700' },
  pitch_ready: { label: 'Pitch ready', style: 'bg-indigo-100 text-indigo-700' },
  contacted: { label: 'Contacted', style: 'bg-blue-100 text-blue-700' },
  engaged: { label: 'Engaged', style: 'bg-violet-100 text-violet-700' },
  demo_booked: { label: 'Demo booked', style: 'bg-cyan-100 text-cyan-700' },
  won: { label: 'Won', style: 'bg-emerald-100 text-emerald-700' },
  nurture: { label: 'Nurture', style: 'bg-teal-100 text-teal-700' },
  not_a_fit: { label: 'Disqualified', style: 'bg-rose-100 text-rose-700' },
};

const label = (value?: string | null) => value ? value.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'Not set';
const asRecord = (value: unknown): Record<string, any> => (value && typeof value === 'object' ? value as Record<string, any> : {});
const itemsOf = <T,>(value: unknown): T[] => Array.isArray(value) ? value as T[] : (Array.isArray(asRecord(value).data) ? asRecord(value).data as T[] : []);
const dateText = (value?: string | null) => value ? new Date(value).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not scheduled';
const safeWebsiteHref = (website?: unknown, domain?: unknown) => {
  const candidate = String(website || (domain ? `https://${domain}` : '')).trim();
  if (!candidate) return null;
  try { const parsed = new URL(candidate); return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : null; }
  catch { return null; }
};
const fitPresentation = (score: number | null, category?: string | null) => {
  if (score === null || category === 'insufficient_evidence') return { label: 'Fit pending', style: 'bg-slate-100 text-slate-600' };
  if (score >= 90) return { label: `Extreme fit · ${score}`, style: 'bg-emerald-600 text-white' };
  if (score >= 80) return { label: `High fit · ${score}`, style: 'bg-emerald-50 text-emerald-800 ring-1 ring-inset ring-emerald-300' };
  if (score >= 50) return { label: `Moderate · ${score}`, style: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-300' };
  return { label: `Low priority · ${score}`, style: 'bg-slate-50 text-slate-600 ring-1 ring-inset ring-slate-300' };
};
const stackPresentation = (stack: string[]) => {
  if (!stack.length) return { label: 'Stack not identified', style: 'bg-slate-100 text-slate-600' };
  const normalized = stack.join(' ').toLowerCase();
  if (/spectora|homegauge|inspection support network|\bisn\b|inspectcheck|horizon|enterprise|all-in-one|full stack/.test(normalized)) {
    return { label: 'Full-stack incumbent', style: 'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-300' };
  }
  if (/scheduler|scheduling|calendar|booking|iframe|widget/.test(normalized)) {
    return { label: 'Partial scheduler', style: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-300' };
  }
  if (/phone|manual|spreadsheet|email|social|directory/.test(normalized)) {
    return { label: 'Manual or limited stack', style: 'bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-300' };
  }
  return { label: 'Stack observed', style: 'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-300' };
};
const blankProspect = { company_name: '', territory_id: '', website_url: '', official_domain: '', phone: '', summary: '', address_line_1: '', city: '', state_code: '', postal_code: '' };
const blankTerritory = { name: '', kind: 'city', city: '', county: '', state_code: '', target_count: '25', status: 'draft' };
const blankContact = { full_name: '', title: '', email: '', phone: '', source_url: '', is_primary: false, email_status: 'unknown' };
const blankClaim = { claim_type: 'company_identity', display_value: '', normalized_value: '', source_url: '', source_type: 'founder_observation', source_excerpt: '', confidence: '0.80' };
const blankResearch = { mode: 'county' as ResearchMode, query: '', state_code: '', target_count: '25' };

function Field({ label: text, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">{text}</span>{children}</label>;
}

const inputClass = 'w-full rounded-sm border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-800 outline-none focus:border-blue-400';

function Badge({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-widest ${className}`}>{children}</span>;
}

const Prospecting: React.FC<ProspectingProps> = ({ addToast }) => {
  const [tab, setTab] = useState<Tab>('research');
  const [prospects, setProspects] = useState<ProspectingProspect[]>([]);
  const [territories, setTerritories] = useState<ProspectingTerritory[]>([]);
  const [stats, setStats] = useState<ProspectingStats | null>(null);
  const [territoryId, setTerritoryId] = useState('all');
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('all');
  const [verification, setVerification] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focused, setFocused] = useState<ProspectingProspect | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskDue, setTaskDue] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [access, setAccess] = useState<Record<string, any> | null>(null);
  const [accessLoading, setAccessLoading] = useState(true);
  const [prospectFormOpen, setProspectFormOpen] = useState(false);
  const [prospectForm, setProspectForm] = useState<Record<string, any>>(blankProspect);
  const [territoryFormOpen, setTerritoryFormOpen] = useState(false);
  const [territoryForm, setTerritoryForm] = useState<Record<string, any>>(blankTerritory);
  const [contactForm, setContactForm] = useState<Record<string, any> | null>(null);
  const [claimForm, setClaimForm] = useState<Record<string, any> | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ title: string; detail: string; run: () => Promise<void> } | null>(null);
  const [researchForm, setResearchForm] = useState(blankResearch);
  const [researchRuns, setResearchRuns] = useState<ResearchRun[]>([]);
  const [activeResearchRun, setActiveResearchRun] = useState<ResearchRun | null>(null);
  const [researchCandidates, setResearchCandidates] = useState<ResearchCandidate[]>([]);
  const [marketFactors, setMarketFactors] = useState<ProspectingTerritoryMarketFactor[]>([]);
  const [researchLoading, setResearchLoading] = useState(false);
  const [researchError, setResearchError] = useState<string | null>(null);
  const [candidateCorrections, setCandidateCorrections] = useState<Record<string, { field: string; value: string }>>({});
  const [candidateMergeTargets, setCandidateMergeTargets] = useState<Record<string, string>>({});

  const checkAccess = useCallback(async () => {
    setAccessLoading(true);
    try {
      const result = await getProspectingAccessStatus();
      setAccess(asRecord(asRecord(result).data || result));
    } catch (cause) {
      setAccess({ authorized: false, role_ok: false, error: cause instanceof Error ? cause.message : 'Access could not be verified.' });
    } finally { setAccessLoading(false); }
  }, []);

  useEffect(() => { void checkAccess(); }, [checkAccess]);
  const load = useCallback(async (quiet = false) => {
    if (!access?.authorized) return;
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const [prospectResult, territoryResult, statsResult] = await Promise.all([
        listProspects({ territoryId: territoryId === 'all' ? undefined : territoryId }),
        listTerritories(),
        getProspectingStats(territoryId === 'all' ? undefined : territoryId),
      ]);
      setProspects(itemsOf<ProspectingProspect>(prospectResult));
      setTerritories(itemsOf<ProspectingTerritory>(territoryResult));
      setStats((asRecord(statsResult).data || statsResult || null) as ProspectingStats | null);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not load prospecting data.';
      setError(message);
      if (quiet) addToast(message, 'error');
    } finally { setLoading(false); }
  }, [territoryId, addToast, access?.authorized]);

  useEffect(() => { if (access?.authorized) void load(); }, [load, access?.authorized]);

  const adoptResearchDetail = useCallback((detail: any) => {
    if (!detail) return;
    const record = asRecord(detail);
    const run = asRecord(record.run || record.data?.run || (record.id ? record : null));
    const candidates = itemsOf<ResearchCandidate>(record.candidates || record.data?.candidates);
    const factors = itemsOf<ProspectingTerritoryMarketFactor>(record.marketFactors || record.market_factors || record.data?.marketFactors);
    if (Object.keys(run).length) {
      setActiveResearchRun(run);
      setResearchRuns(previous => [run, ...previous.filter(item => String(item.id) !== String(run.id))]);
    }
    setResearchCandidates(candidates);
    setMarketFactors(factors);
  }, []);

  const loadResearch = useCallback(async (selectRunId?: string) => {
    if (!access?.authorized) return;
    setResearchLoading(true); setResearchError(null);
    try {
      const runs = await listProspectingResearchRuns(20);
      setResearchRuns(runs || []);
      const runId = selectRunId || String(activeResearchRun?.id || runs?.[0]?.id || '');
      if (runId) adoptResearchDetail(await getProspectingResearchRun(runId));
      else { setActiveResearchRun(null); setResearchCandidates([]); setMarketFactors([]); }
    } catch (cause) { setResearchError(cause instanceof Error ? cause.message : 'Could not load research runs.'); }
    finally { setResearchLoading(false); }
  }, [access?.authorized, activeResearchRun?.id, adoptResearchDetail]);

  useEffect(() => { if (access?.authorized && tab === 'research') void loadResearch(); }, [access?.authorized, tab]);

  useEffect(() => {
    const status = String(activeResearchRun?.status || '');
    if (!activeResearchRun?.id || !['queued', 'running', 'waiting'].includes(status)) return;
    const timer = window.setInterval(() => {
      void pollProspectingResearchRun(String(activeResearchRun.id))
        .then(adoptResearchDetail)
        .catch(cause => setResearchError(cause instanceof Error ? cause.message : 'Research status could not refresh.'));
    }, 4000);
    return () => window.clearInterval(timer);
  }, [activeResearchRun?.id, activeResearchRun?.status, adoptResearchDetail]);

  const startResearch = async () => {
    const query = researchForm.query.trim();
    const stateCode = researchForm.state_code.trim().toUpperCase();
    const targetCount = Number(researchForm.target_count);
    if (!query) { addToast(`Enter a ${researchForm.mode === 'zip' ? 'ZIP code' : researchForm.mode}.`, 'error'); return; }
    if (['city', 'county'].includes(researchForm.mode) && !/^[A-Z]{2}$/.test(stateCode)) { addToast('Add the two-letter state for this search area.', 'error'); return; }
    if (researchForm.mode === 'state' && !/^(?:[A-Za-z]{2}|[A-Za-z][A-Za-z .'-]{1,29})$/.test(query)) { addToast('Enter a state name or two-letter code.', 'error'); return; }
    if (researchForm.mode === 'zip' && !/^\d{5}(?:-\d{4})?$/.test(query)) { addToast('Enter a valid 5-digit ZIP code.', 'error'); return; }
    if (!Number.isInteger(targetCount) || targetCount < 1 || targetCount > 100) { addToast('Target count must be between 1 and 100.', 'error'); return; }
    const locationValue = ['city', 'county'].includes(researchForm.mode) ? `${query}, ${stateCode}` : query;
    setResearchLoading(true); setResearchError(null);
    try {
      const run = await startProspectingResearch({ locationKind: researchForm.mode, locationValue, targetCount });
      setActiveResearchRun(run); setResearchCandidates([]); setMarketFactors([]); setResearchRuns(previous => [run, ...previous.filter(item => String(item.id) !== String(run.id))]);
      addToast(`Research started for ${locationValue}.`, 'success');
      adoptResearchDetail(await getProspectingResearchRun(String(run.id)));
    } catch (cause) { const message = cause instanceof Error ? cause.message : 'Could not start research.'; setResearchError(message); addToast(message, 'error'); }
    finally { setResearchLoading(false); }
  };

  const retryResearch = async (runId: string) => {
    setResearchLoading(true); setResearchError(null);
    try { const run = await retryProspectingResearchRun(runId); setActiveResearchRun(run); setResearchCandidates([]); setMarketFactors([]); addToast('Research retry queued.', 'success'); adoptResearchDetail(await getProspectingResearchRun(String(run.id))); }
    catch (cause) { const message = cause instanceof Error ? cause.message : 'Could not retry research.'; setResearchError(message); addToast(message, 'error'); }
    finally { setResearchLoading(false); }
  };

  const reviewCandidate = async (candidate: ResearchCandidate, decision: 'approved' | 'corrected' | 'rejected') => {
    const id = String(candidate.id);
    const correction = candidateCorrections[id];
    if (decision === 'corrected' && !correction?.value.trim()) { addToast('Choose a field and enter its corrected value.', 'error'); return; }
    setSaving(true);
    try {
      await reviewProspectingResearchCandidate(id, { decision, corrections: correction?.value.trim() ? { [correction.field]: correction.value.trim() } : undefined });
      addToast(decision === 'approved' ? 'Candidate approved for import.' : decision === 'rejected' ? 'Candidate rejected.' : 'Correction saved for review.', 'success');
      adoptResearchDetail(await getProspectingResearchRun(String(activeResearchRun?.id)));
    } catch (cause) { addToast(cause instanceof Error ? cause.message : 'Could not review candidate.', 'error'); }
    finally { setSaving(false); }
  };

  const importCandidate = async (candidate: ResearchCandidate, mode: 'create' | 'merge') => {
    const territory = territoryId !== 'all' ? territoryId : String(candidate.territory_id || '');
    if (!territory) { addToast('Choose a territory from the page header before importing.', 'error'); return; }
    let prospectId: string | undefined;
    if (mode === 'merge') {
      prospectId = candidateMergeTargets[String(candidate.id)] || undefined;
      if (!prospectId) { addToast('Choose an existing prospect to merge into.', 'error'); return; }
    }
    setSaving(true);
    try {
      await importProspectingResearchCandidate(String(candidate.id), { territoryId: territory, mode, prospectId });
      addToast(mode === 'merge' ? 'Candidate merged into the existing prospect.' : 'Candidate imported into the pipeline.', 'success');
      adoptResearchDetail(await getProspectingResearchRun(String(activeResearchRun?.id))); await load(true);
    } catch (cause) { addToast(cause instanceof Error ? cause.message : 'Could not import candidate.', 'error'); }
    finally { setSaving(false); }
  };

  const filtered = useMemo(() => prospects.filter(item => {
    const p = asRecord(item);
    const haystack = [p.company_name, p.city, p.state_code, p.website_url, p.official_domain].filter(Boolean).join(' ').toLowerCase();
    return (!search || haystack.includes(search.toLowerCase()))
      && (stage === 'all' || p.sales_state === stage)
      && (verification === 'all' || p.verification_state === verification);
  }), [prospects, search, stage, verification]);

  const reviewQueue = useMemo(() => filtered.filter(item => {
    const p = asRecord(item);
    return p.verification_state !== 'outreach_approved' || p.sales_state === 'review_pending' || p.website_state === 'needs_human_verification';
  }), [filtered]);
  const visible = tab === 'review' ? reviewQueue : filtered;

  const pipelineMetrics = useMemo(() => {
    const scores: number[] = [];
    let noOfficialUrl = 0; let phoneOnly = 0; let manualQuote = 0;
    filtered.forEach(item => {
      const prospect = item as ProspectingProspect; const snapshot = getProspectResearchSnapshot(prospect);
      if (snapshot?.fitScore !== null && snapshot?.fitScore !== undefined) scores.push(snapshot.fitScore);
      const hasOfficialUrl = Boolean(prospect.website_url || prospect.official_domain);
      if (snapshot?.websitePresenceClass === 'official_website_not_identified' || (!snapshot && !hasOfficialUrl)) noOfficialUrl += 1;
      if (snapshot?.phoneOnlyQuote === true) phoneOnly += 1;
      if (snapshot?.manualQuoteProcess === true) manualQuote += 1;
    });
    return {
      total: filtered.length,
      highFit: scores.filter(score => score >= 80).length,
      noOfficialUrl,
      phoneOnly,
      manualQuote,
      averageFit: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : null,
    };
  }, [filtered]);
  const activeTerritoryName = territoryId === 'all'
    ? 'Territory'
    : String(asRecord(territories.find(item => String(asRecord(item).id) === territoryId)).name || 'Territory');

  const stat = (key: string, fallback = 0) => Number(asRecord(stats)[key] ?? fallback);
  const fallbackStats = {
    total: prospects.length,
    review: prospects.filter(p => asRecord(p).verification_state !== 'outreach_approved').length,
    ready: prospects.filter(p => asRecord(p).sales_state === 'pitch_ready').length,
    engaged: prospects.filter(p => ['engaged', 'demo_booked', 'won'].includes(asRecord(p).sales_state)).length,
  };

  const toggleSelected = (id: string) => setSelected(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });

  const handleStage = async (item: ProspectingProspect, nextStage: string) => {
    const id = String(asRecord(item).id);
    setSaving(true);
    try {
      await updateProspectStage(id, nextStage as ProspectingSalesStage);
      setProspects(prev => prev.map(p => asRecord(p).id === id ? ({ ...asRecord(p), sales_state: nextStage } as ProspectingProspect) : p));
      setFocused(prev => prev && asRecord(prev).id === id ? ({ ...asRecord(prev), sales_state: nextStage } as ProspectingProspect) : prev);
      addToast(`Moved to ${label(nextStage)}.`, 'success');
    } catch (cause) { addToast(cause instanceof Error ? cause.message : 'Could not update stage.', 'error'); }
    finally { setSaving(false); }
  };

  const saveNote = async () => {
    if (!focused || !note.trim()) return;
    setSaving(true);
    try { await addProspectNote(String(asRecord(focused).id), note.trim()); setNote(''); addToast('Note added.', 'success'); await load(true); }
    catch (cause) { addToast(cause instanceof Error ? cause.message : 'Could not add note.', 'error'); }
    finally { setSaving(false); }
  };

  const saveTask = async () => {
    if (!focused || !taskTitle.trim()) return;
    setSaving(true);
    try {
      await createProspectTask({ prospect_id: asRecord(focused).id, title: taskTitle.trim(), due_at: taskDue || null });
      setTaskTitle(''); setTaskDue(''); addToast('Follow-up task created.', 'success'); await load(true);
    } catch (cause) { addToast(cause instanceof Error ? cause.message : 'Could not create task.', 'error'); }
    finally { setSaving(false); }
  };

  const saveNextAction = async () => {
    if (!focused) return;
    setSaving(true);
    try {
      const updated = await createOrUpdateProspect({ id: asRecord(focused).id, next_follow_up_at: nextAction || null });
      const next = (asRecord(updated).data || updated || { ...asRecord(focused), next_follow_up_at: nextAction }) as ProspectingProspect;
      setFocused(next); addToast('Next action saved.', 'success'); await load(true);
    } catch (cause) { addToast(cause instanceof Error ? cause.message : 'Could not save next action.', 'error'); }
    finally { setSaving(false); }
  };

  const exportSelected = async () => {
    if (!selected.size) { addToast('Select at least one prospect to export.', 'info'); return; }
    try {
      const result = await exportProspectsCsv({ prospectIds: [...selected], redacted: false });
      if (typeof result === 'string') {
        const blob = new Blob([result], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
        anchor.href = url; anchor.download = `spectiq-prospects-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click(); URL.revokeObjectURL(url);
      } else if (asRecord(result).url) window.open(asRecord(result).url, '_blank', 'noopener,noreferrer');
      addToast(`Exported ${selected.size} prospect${selected.size === 1 ? '' : 's'} safely.`, 'success');
    } catch (cause) { addToast(cause instanceof Error ? cause.message : 'Export failed.', 'error'); }
  };

  const openDetail = async (item: ProspectingProspect) => {
    setFocused(item); setNextAction(asRecord(item).next_follow_up_at?.slice(0, 16) || '');
    try {
      const detail = await getProspectDetail(String(asRecord(item).id));
      if (detail) { setFocused(detail); setNextAction(asRecord(detail).next_follow_up_at?.slice(0, 16) || ''); }
    } catch (cause) { addToast(cause instanceof Error ? cause.message : 'Could not load prospect detail.', 'error'); }
  };

  const refreshFocused = async (prospectId: string) => {
    const detail = await getProspectDetail(prospectId);
    if (detail) setFocused(detail);
    await load(true);
  };

  const saveProspect = async () => {
    if (!String(prospectForm.company_name || '').trim()) { addToast('Company name is required.', 'error'); return; }
    setSaving(true);
    try {
      const values = { ...prospectForm, territory_id: prospectForm.territory_id || null };
      for (const key of ['website_url','official_domain','phone','summary','address_line_1','city','state_code','postal_code']) if (!values[key]) values[key] = null;
      const saved = prospectForm.id
        ? await updateProspect(String(prospectForm.id), values as any)
        : await createProspect(values as any);
      setProspectFormOpen(false); setProspectForm(blankProspect); addToast(prospectForm.id ? 'Prospect updated.' : 'Prospect created.', 'success');
      await load(true); if (prospectForm.id) await openDetail(saved);
    } catch (cause) { addToast(cause instanceof Error ? cause.message : 'Could not save prospect.', 'error'); }
    finally { setSaving(false); }
  };

  const editProspect = () => {
    if (!focused) return;
    const p = asRecord(focused);
    setProspectForm({ id: p.id, company_name: p.company_name || '', territory_id: p.territory_id || '', website_url: p.website_url || '', official_domain: p.official_domain || '', phone: p.phone || '', summary: p.summary || '', address_line_1: p.address_line_1 || '', city: p.city || '', state_code: p.state_code || '', postal_code: p.postal_code || '' });
    setProspectFormOpen(true);
  };

  const saveTerritory = async () => {
    if (!String(territoryForm.name || '').trim() || !String(territoryForm.state_code || '').trim()) { addToast('Territory name and state are required.', 'error'); return; }
    setSaving(true);
    try {
      const values = { ...territoryForm, target_count: Number(territoryForm.target_count) || 0, city: territoryForm.city || null, county: territoryForm.county || null } as any;
      if (territoryForm.id) await updateTerritory(String(territoryForm.id), values);
      else await createTerritory(values);
      setTerritoryFormOpen(false); setTerritoryForm(blankTerritory); addToast(territoryForm.id ? 'Territory updated.' : 'Territory created.', 'success'); await load(true);
    } catch (cause) { addToast(cause instanceof Error ? cause.message : 'Could not save territory.', 'error'); }
    finally { setSaving(false); }
  };

  const saveContact = async () => {
    if (!focused || !contactForm) return;
    if (!String(contactForm.full_name || '').trim() && !String(contactForm.email || '').trim() && !String(contactForm.phone || '').trim()) { addToast('Add a name, email, or phone.', 'error'); return; }
    setSaving(true);
    try {
      if (contactForm.id) await updateProspectContact(String(contactForm.id), contactForm as any);
      else await createProspectContact({ ...contactForm, prospect_id: asRecord(focused).id } as any);
      setContactForm(null); addToast(contactForm.id ? 'Contact updated.' : 'Contact added.', 'success'); await refreshFocused(String(asRecord(focused).id));
    } catch (cause) { addToast(cause instanceof Error ? cause.message : 'Could not save contact.', 'error'); }
    finally { setSaving(false); }
  };

  const saveClaim = async () => {
    if (!focused || !claimForm) return;
    if (!String(claimForm.claim_type || '').trim() || !String(claimForm.display_value || '').trim() || !String(claimForm.source_url || '').trim()) { addToast('Claim type, value, and source URL are required.', 'error'); return; }
    setSaving(true);
    try {
      const values = { ...claimForm, normalized_value: claimForm.normalized_value || claimForm.display_value, confidence: Number(claimForm.confidence) } as any;
      if (claimForm.id) await updateProspectClaim(String(claimForm.id), values);
      else await createProspectClaim({ ...values, prospect_id: asRecord(focused).id });
      setClaimForm(null); addToast(claimForm.id ? 'Evidence updated.' : 'Evidence added for founder review.', 'success'); await refreshFocused(String(asRecord(focused).id));
    } catch (cause) { addToast(cause instanceof Error ? cause.message : 'Could not add evidence.', 'error'); }
    finally { setSaving(false); }
  };

  const setVerificationState = async (value: ProspectingVerificationState) => {
    if (!focused) return;
    setSaving(true);
    try { await updateProspectVerification(String(asRecord(focused).id), value); addToast(`Verification set to ${label(value)}.`, 'success'); await refreshFocused(String(asRecord(focused).id)); }
    catch (cause) { addToast(cause instanceof Error ? cause.message : 'Could not update verification.', 'error'); }
    finally { setSaving(false); }
  };

  const updateTaskState = async (taskId: string, status: ProspectingTaskStatus) => {
    if (!focused) return;
    setSaving(true);
    try { if (status === 'completed') await completeProspectTask(taskId); else await cancelProspectTask(taskId); addToast(status === 'completed' ? 'Task completed.' : 'Task cancelled.', 'success'); await refreshFocused(String(asRecord(focused).id)); }
    catch (cause) { addToast(cause instanceof Error ? cause.message : 'Could not update task.', 'error'); }
    finally { setSaving(false); }
  };

  const reviewClaim = async (claimId: string, decision: Exclude<ProspectingEvidenceDecision, 'pending'>, correction?: string) => {
    if (!focused) return;
    setSaving(true);
    try { await reviewProspectClaim(claimId, { decision, founder_correction: correction || null }); addToast(`Evidence ${decision}.`, 'success'); await refreshFocused(String(asRecord(focused).id)); }
    catch (cause) { addToast(cause instanceof Error ? cause.message : 'Could not review evidence.', 'error'); }
    finally { setSaving(false); }
  };

  const kpis = [
    { label: 'Prospects', value: stat('total', fallbackStats.total), icon: Building2, tone: 'bg-blue-600' },
    { label: 'Needs review', value: stat('needs_verification', fallbackStats.review), icon: ClipboardCheck, tone: 'bg-amber-500' },
    { label: 'Pitch ready', value: stat('pitch_ready', fallbackStats.ready), icon: Target, tone: 'bg-indigo-600' },
    { label: 'Active conversations', value: stat('engaged', fallbackStats.engaged), icon: Users, tone: 'bg-emerald-600' },
  ];

  if (accessLoading) return <div className="flex min-h-[65vh] items-center justify-center rounded-sm border border-slate-200 bg-white"><Loader2 className="animate-spin text-blue-600"/><span className="ml-3 text-sm font-bold text-slate-500">Verifying founder access…</span></div>;

  if (!access?.authorized) {
    return <div className="flex min-h-[65vh] items-center justify-center rounded-sm bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-6">
      <div className="w-full max-w-xl rounded-sm border border-white/10 bg-white/10 p-8 text-center text-white  backdrop-blur sm:p-10">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-sm bg-blue-500/20 text-blue-200 ring-1 ring-blue-400/30"><ShieldCheck size={30}/></div>
        <Badge className="mt-5 bg-white/10 text-slate-200">Founder control plane</Badge>
        <h1 className="mt-4 text-2xl font-black">Prospecting unavailable</h1>
        <p className="mt-3 text-sm font-medium leading-relaxed text-slate-300">This workspace is restricted to the active SpectIQ platform administrator. No prospect data was loaded.</p>
        {access?.error && <p className="mt-4 rounded-sm bg-rose-400/10 p-3 text-xs font-semibold text-rose-200">{String(access.error)}</p>}
        <button onClick={() => void checkAccess()} className="mt-5 inline-flex items-center gap-2 rounded-sm bg-white px-5 py-3 text-xs font-black uppercase tracking-widest text-slate-900"><RefreshCw size={15}/>Check access again</button>
      </div>
    </div>;
  }

  return <div className="min-h-full bg-slate-50/60 pb-16">
    <div className="rounded-sm bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-7 text-white  sm:p-10">
      <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
        <div><Badge className="mb-4 bg-blue-500/20 text-blue-200 ring-1 ring-blue-400/30"><ShieldCheck size={12}/> Founder workspace</Badge>
          <h1 className="text-3xl font-black   sm:text-4xl">SpectIQ Prospecting</h1>
          <p className="mt-3 max-w-2xl text-sm font-medium leading-relaxed text-slate-300">Find, verify, and thoughtfully progress inspection companies. Research output is evidence—not permission to contact.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <select value={territoryId} onChange={e => setTerritoryId(e.target.value)} className="rounded-sm border border-white/10 bg-white/10 px-4 py-3 text-xs font-black uppercase tracking-widest text-white outline-none">
            <option value="all" className="text-slate-900">All territories</option>
            {territories.map(t => <option key={String(asRecord(t).id)} value={String(asRecord(t).id)} className="text-slate-900">{asRecord(t).name}</option>)}
          </select>
          <button onClick={() => void load()} className="flex items-center gap-2 rounded-sm bg-white px-4 py-3 text-xs font-black uppercase tracking-widest text-slate-900"><RefreshCw size={15}/>Refresh</button>
          <button onClick={() => { setProspectForm(blankProspect); setProspectFormOpen(true); }} className="flex items-center gap-2 rounded-sm bg-blue-500 px-4 py-3 text-xs font-black uppercase tracking-widest text-white"><Plus size={15}/>New prospect</button>
        </div>
      </div>
    </div>

    <div className="mt-6 grid grid-cols-2 gap-4 xl:grid-cols-4">{kpis.map(({ label: text, value, icon: Icon, tone }) => <div key={text} className="rounded-sm border border-slate-200 bg-white p-5 "><div className={`mb-4 flex h-10 w-10 items-center justify-center rounded-sm text-white ${tone}`}><Icon size={19}/></div><p className="text-3xl font-black tracking-tight text-slate-900">{value}</p><p className="mt-1 text-[10px] font-black uppercase tracking-widest text-slate-400">{text}</p></div>)}</div>

    <div className="mt-6 flex gap-2 overflow-x-auto rounded-sm border border-slate-200 bg-white p-2 ">{([
      ['research', 'Research', Search], ['pipeline', 'Pipeline', Inbox], ['review', 'Review Queue', FileSearch], ['playbook', 'Playbook', ListChecks], ['territories', 'Territories', Map],
    ] as const).map(([id, text, Icon]) => <button key={id} onClick={() => setTab(id)} className={`flex shrink-0 items-center gap-2 rounded-sm px-4 py-2.5 text-xs font-black uppercase tracking-widest ${tab === id ? 'bg-blue-600 text-white ' : 'text-slate-500 hover:bg-slate-50'}`}><Icon size={15}/>{text}{id === 'review' && reviewQueue.length > 0 && <span className="rounded-full bg-white/20 px-1.5">{reviewQueue.length}</span>}</button>)}</div>

    {tab === 'research' && <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.6fr)]">
      <div className="space-y-5">
        <section className="rounded-sm border border-slate-200 bg-white p-6  sm:p-7">
          <div className="flex items-start gap-3"><div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-sm bg-blue-600 text-white"><Search size={20}/></div><div><p className="text-[10px] font-black   text-blue-600">Geographic discovery</p><h2 className="mt-1 text-xl font-black   text-slate-900">Find inspection companies</h2><p className="mt-2 text-sm leading-relaxed text-slate-500">Search one county, ZIP code, state, or city. Results remain candidates until you review and import them.</p></div></div>
          <div className="mt-6 space-y-4">
            <Field label="Search area type"><div className="grid grid-cols-2 gap-2">{(['county','zip','state','city'] as ResearchMode[]).map(mode => <button key={mode} type="button" onClick={() => setResearchForm(value => ({ ...value, mode, query: '', state_code: '' }))} className={`rounded-sm border px-3 py-3 text-xs font-black uppercase tracking-widest ${researchForm.mode === mode ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>{mode === 'zip' ? 'ZIP code' : mode}</button>)}</div></Field>
            <Field label={researchForm.mode === 'zip' ? 'ZIP code' : researchForm.mode === 'state' ? 'State' : `${label(researchForm.mode)} name`}><input maxLength={researchForm.mode === 'state' ? 30 : undefined} value={researchForm.query} onChange={e => setResearchForm(value => ({ ...value, query: researchForm.mode === 'zip' ? e.target.value.replace(/[^\d-]/g, '') : researchForm.mode === 'state' ? e.target.value.replace(/[^A-Za-z .'-]/g, '') : e.target.value }))} placeholder={researchForm.mode === 'county' ? 'Forsyth County' : researchForm.mode === 'city' ? 'Cumming' : researchForm.mode === 'zip' ? '30040' : 'Georgia or GA'} className={inputClass}/></Field>
            {['city','county'].includes(researchForm.mode) && <Field label="State context *"><input maxLength={2} value={researchForm.state_code} onChange={e => setResearchForm(value => ({ ...value, state_code: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') }))} placeholder="GA" className={inputClass}/></Field>}
            <Field label="Companies to find"><input type="number" min="1" max="100" value={researchForm.target_count} onChange={e => setResearchForm(value => ({ ...value, target_count: e.target.value }))} className={inputClass}/><span className="mt-1.5 block text-[11px] font-semibold text-slate-400">Between 1 and 100 candidates per run.</span></Field>
            <Field label="Import destination"><select value={territoryId} onChange={e => setTerritoryId(e.target.value)} className={inputClass}><option value="all">Choose after research</option>{territories.map(item => <option key={String(asRecord(item).id)} value={String(asRecord(item).id)}>{asRecord(item).name}</option>)}</select><span className="mt-1.5 block text-[11px] font-semibold text-slate-400">Searching does not import anything. Choose an active territory before importing a reviewed candidate.</span></Field>
            <button onClick={() => void startResearch()} disabled={researchLoading} className="flex w-full items-center justify-center gap-2 rounded-sm bg-blue-600 py-3.5 text-xs font-black uppercase tracking-widest text-white disabled:opacity-50">{researchLoading ? <Loader2 size={16} className="animate-spin"/> : <Search size={16}/>}Start search</button>
          </div>
          <div className="mt-5 flex items-start gap-2 rounded-sm bg-amber-50 p-4 text-xs font-semibold leading-relaxed text-amber-900"><ShieldCheck size={16} className="mt-0.5 shrink-0"/>Research collects source-backed candidates. It never approves outreach or sends email.</div>
        </section>

        <section className="rounded-sm border border-slate-200 bg-white p-6 "><div className="flex items-center justify-between"><h3 className="text-xs font-black   text-slate-400">Recent searches</h3><button onClick={() => void loadResearch()} disabled={researchLoading} aria-label="Refresh research runs" className="rounded-sm p-2 text-slate-500 hover:bg-slate-100"><RefreshCw size={15} className={researchLoading ? 'animate-spin' : ''}/></button></div>
          <div className="mt-3 space-y-2">{researchRuns.length ? researchRuns.map(run => <button key={String(run.id)} onClick={() => void loadResearch(String(run.id))} className={`w-full rounded-sm border p-4 text-left ${String(activeResearchRun?.id) === String(run.id) ? 'border-blue-300 bg-blue-50' : 'border-slate-100 hover:bg-slate-50'}`}><div className="flex items-center justify-between gap-3"><span className="truncate text-sm font-black text-slate-800">{run.location_value || run.locationValue || 'Search area'}</span><Badge className={['completed','partial'].includes(String(run.status)) ? 'bg-emerald-50 text-emerald-700' : String(run.status) === 'failed' ? 'bg-rose-50 text-rose-700' : 'bg-blue-50 text-blue-700'}>{String(run.status) === 'running' && <Loader2 size={10} className="animate-spin"/>}{label(run.status)}</Badge></div><p className="mt-1 text-[10px] font-black uppercase tracking-widest text-slate-400">{label(run.location_kind || run.locationKind)} · Target {run.target_count ?? run.targetCount ?? '—'}</p></button>) : <p className="rounded-sm border border-dashed border-slate-200 p-4 text-sm text-slate-400">No searches have been started.</p>}</div>
        </section>
      </div>

      <section className="rounded-sm border border-slate-200 bg-white p-6  sm:p-7">
        {!activeResearchRun ? <div className="flex min-h-[26rem] flex-col items-center justify-center text-center"><FileSearch size={38} className="text-slate-300"/><h2 className="mt-4 text-lg font-black  text-slate-700">Ready to search</h2><p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-400">Choose a geographic area and target count. Candidate evidence will appear here for founder review.</p></div> : (() => { const run = activeResearchRun; const status = String(run.status || 'queued'); const processed = Number(run.processed_count ?? run.completed_count ?? researchCandidates.length ?? 0); const target = Number(run.target_count ?? run.targetCount ?? 0); const percent = target ? Math.min(100, Math.round((processed / target) * 100)) : (status === 'completed' ? 100 : 0); return <>
          <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><Badge className={status === 'failed' ? 'bg-rose-50 text-rose-700' : status === 'partial' ? 'bg-amber-50 text-amber-700' : status === 'completed' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}>{['queued','running'].includes(status) && <Loader2 size={10} className="animate-spin"/>}{label(status)}</Badge><Badge className="bg-slate-100 text-slate-600">{label(run.location_kind || run.locationKind)}</Badge></div><h2 className="mt-3 text-xl font-black   text-slate-900">{run.location_value || run.locationValue}</h2><p className="mt-1 text-sm font-semibold text-slate-400">{researchCandidates.length} candidate{researchCandidates.length === 1 ? '' : 's'} found · target {target || '—'}</p></div>{['failed','partial'].includes(status) && <button onClick={() => void retryResearch(String(run.id))} disabled={researchLoading} className="flex items-center justify-center gap-2 rounded-sm bg-slate-900 px-4 py-3 text-xs font-black   text-white disabled:opacity-50"><RefreshCw size={14}/>Retry search</button>}</div>
          {['queued','running','waiting'].includes(status) && <div className="mt-5"><div className="mb-2 flex justify-between text-[10px] font-black uppercase tracking-widest text-slate-400"><span>{status === 'queued' ? 'Waiting for research worker' : status === 'waiting' ? 'Waiting for research results' : 'Research in progress'}</span><span>{target ? `${percent}%` : 'Working'}</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-blue-600 transition-colors" style={{ width: `${Math.max(percent, status === 'running' ? 8 : 3)}%` }}/></div></div>}
          {(status === 'failed' || status === 'partial') && <div className={`mt-5 rounded-sm border p-4 text-sm ${status === 'failed' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}><div className="flex items-start gap-2"><AlertCircle size={17} className="mt-0.5 shrink-0"/><div><p className="font-black">{status === 'partial' ? 'Partial results available' : 'Search did not finish'}</p><p className="mt-1 text-xs leading-relaxed">{run.error_message || run.error || (status === 'partial' ? 'Review the candidates below or retry to continue gathering results.' : 'Retry this area when you are ready.')}</p></div></div></div>}
          {researchError && <div className="mt-5 flex items-start gap-2 rounded-sm border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"><AlertCircle size={17} className="mt-0.5 shrink-0"/><span>{researchError}</span></div>}
          {marketFactors.length > 0 && <section className="mt-5 rounded-sm border border-indigo-100 bg-indigo-50/50 p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-widest text-indigo-600">Market intel</p><h3 className="mt-1 text-lg font-black text-slate-900">Territory-level factors</h3><p className="mt-1 text-xs leading-relaxed text-slate-500">Source-backed context for this search. Each factor remains advisory until founder review.</p></div><Badge className="shrink-0 bg-amber-50 text-amber-800"><ShieldCheck size={11}/>Review required</Badge></div><div className="mt-4 grid gap-3 md:grid-cols-2">{marketFactors.map(factor => { const href = safeWebsiteHref(factor.source_url); return <article key={factor.id} className="rounded-sm border border-indigo-100 bg-white p-4"><div className="flex flex-wrap items-center gap-2"><Badge className="bg-indigo-50 text-indigo-700">{label(factor.category)}</Badge><Badge className={factor.verification_decision === 'approved' || factor.verification_decision === 'corrected' ? 'bg-emerald-50 text-emerald-700' : factor.verification_decision === 'rejected' ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-700'}>{label(factor.verification_decision)}</Badge></div><h4 className="mt-3 text-sm font-black text-slate-900">{factor.title}</h4><p className="mt-2 text-xs leading-relaxed text-slate-600">{factor.founder_correction || factor.summary}</p>{href && <a href={href} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-blue-600">Review source <ExternalLink size={10}/></a>}</article>; })}</div></section>}
          <div className="mt-5 space-y-4">{researchCandidates.length ? researchCandidates.map((candidate, index) => { const id = String(candidate.id || index); const candidateSnapshot = getResearchCandidateSnapshot(candidate as ProspectingResearchCandidate); const candidateFit = fitPresentation(candidateSnapshot.fitScore, candidateSnapshot.fitCategory); const candidateStack = stackPresentation(candidateSnapshot.currentStack); const candidateHref = safeWebsiteHref(candidate.website_url || candidate.website); const sources = itemsOf<any>(candidate.sources || candidate.evidence || candidate.source_urls || asRecord(candidate.raw_payload).sources); const statusText = String(candidate.status || candidate.review_status || 'pending'); return <article key={id} className="rounded-sm border border-slate-200 p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><h3 className="text-lg font-black   text-slate-900">{candidate.company_name || candidate.name || 'Unnamed inspection company'}</h3><p className="mt-1 flex items-center gap-1 text-xs font-semibold text-slate-400"><MapPin size={12}/>{candidate.location || [candidate.city, candidate.state_code].filter(Boolean).join(', ') || 'Location needs review'}</p></div><div className="flex flex-wrap gap-2"><Badge className={candidateFit.style}><Sparkles size={11}/>{candidateFit.label}</Badge><Badge className={candidateStack.style}><ListChecks size={11}/>{candidateStack.label}</Badge><Badge className={statusText === 'rejected' ? 'bg-rose-50 text-rose-700' : ['approved','corrected','imported','merged'].includes(statusText) ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}>{label(statusText)}</Badge></div></div>
            {candidateHref && <a href={candidateHref} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-black text-blue-600">{candidate.website_url || candidate.website}<ExternalLink size={12}/></a>}
            {(candidate.summary || candidate.description) && <p className="mt-3 text-sm leading-relaxed text-slate-600">{candidate.summary || candidate.description}</p>}
            {(candidateSnapshot.currentStack.length > 0 || candidateSnapshot.opportunityHypothesis || candidateSnapshot.frictionPoint) && <div className="mt-4 grid gap-3 lg:grid-cols-3"><div className="rounded-sm bg-slate-50 p-3"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Current stack</p><p className="mt-1 text-xs font-semibold leading-relaxed text-slate-700">{candidateSnapshot.currentStack.join(' · ') || 'Not identified'}</p></div><div className="rounded-sm bg-blue-50 p-3"><p className="text-[9px] font-black uppercase tracking-widest text-blue-600">Opportunity hypothesis</p><p className="mt-1 text-xs leading-relaxed text-blue-900">{candidateSnapshot.opportunityHypothesis || 'Needs founder assessment.'}</p></div><div className="rounded-sm bg-amber-50 p-3"><p className="text-[9px] font-black uppercase tracking-widest text-amber-700">Friction point</p><p className="mt-1 text-xs leading-relaxed text-amber-900">{candidateSnapshot.frictionPoint || 'Not identified.'}</p></div></div>}
            <div className="mt-4"><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Sources and evidence</p><div className="mt-2 space-y-2">{sources.length ? sources.map((source, sourceIndex) => { const entry = typeof source === 'string' ? { url: source } : asRecord(source); return <div key={`${id}-${sourceIndex}`} className="rounded-sm bg-slate-50 p-3"><p className="text-xs font-semibold leading-relaxed text-slate-600">{entry.excerpt || entry.claim || entry.title || 'Source retained for review.'}</p>{entry.url && <a href={entry.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[10px] font-black uppercase text-blue-600">Open source <ExternalLink size={10}/></a>}</div>; }) : <p className="rounded-sm bg-amber-50 p-3 text-xs font-semibold text-amber-800">No source evidence was returned. Do not import without verification.</p>}</div></div>
            {!['imported','merged','rejected'].includes(statusText) && <><div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,0.65fr)_minmax(0,1.35fr)]"><select value={candidateCorrections[id]?.field || 'company_name'} onChange={e => setCandidateCorrections(previous => ({ ...previous, [id]: { field: e.target.value, value: previous[id]?.value || '' } }))} aria-label="Correction field" className="rounded-sm border border-slate-200 px-3 py-3 text-xs font-bold text-slate-700">{['company_name','website_url','phone','address_line_1','city','state_code','postal_code','summary'].map(field => <option key={field} value={field}>{label(field)}</option>)}</select><input value={candidateCorrections[id]?.value || ''} onChange={e => setCandidateCorrections(previous => ({ ...previous, [id]: { field: previous[id]?.field || 'company_name', value: e.target.value } }))} placeholder="Corrected value…" className="rounded-sm border border-slate-200 px-3 py-3 text-sm outline-none focus:border-blue-400"/></div><div className="mt-3 flex flex-wrap gap-2"><button onClick={() => void reviewCandidate(candidate, 'approved')} disabled={saving} className="rounded-sm bg-emerald-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-emerald-700">Approve evidence</button><button onClick={() => void reviewCandidate(candidate, 'corrected')} disabled={saving} className="rounded-sm bg-blue-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-blue-700">Correct</button><button onClick={() => void reviewCandidate(candidate, 'rejected')} disabled={saving} className="rounded-sm bg-rose-50 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-rose-700">Reject</button>{['approved','corrected'].includes(statusText) && <><button onClick={() => void importCandidate(candidate, 'create')} disabled={saving} className="rounded-sm bg-slate-900 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-white">Import as new</button><select value={candidateMergeTargets[id] || ''} onChange={e => setCandidateMergeTargets(previous => ({ ...previous, [id]: e.target.value }))} aria-label="Existing prospect to merge" className="max-w-56 rounded-sm border border-slate-300 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-700"><option value="">Choose prospect to merge</option>{prospects.map(item => <option key={String(asRecord(item).id)} value={String(asRecord(item).id)}>{asRecord(item).company_name}</option>)}</select><button onClick={() => void importCandidate(candidate, 'merge')} disabled={saving || !candidateMergeTargets[id]} className="rounded-sm border border-slate-300 px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-700 disabled:opacity-40">Merge</button></>}</div></>}
          </article>; }) : !['queued','running','waiting'].includes(status) && <div className="rounded-sm border border-dashed border-slate-300 p-10 text-center"><Inbox className="mx-auto text-slate-300" size={30}/><p className="mt-3 font-black uppercase text-slate-700">No candidates returned</p><p className="mt-2 text-sm text-slate-400">Try a nearby city, county, ZIP code, or a broader state search.</p></div>}</div>
        </>; })()}
      </section>
    </div>}

    {(tab === 'pipeline' || tab === 'review') && <>
      {tab === 'pipeline' && <>
        <div className="mt-5 flex flex-wrap items-center gap-2 rounded-sm border border-slate-200 bg-white p-2">
          <button className="rounded-sm bg-slate-950 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-white">Territory prospect matrix</button>
          <button onClick={() => setTab('review')} className="rounded-sm px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100 hover:text-slate-800">Live website auditor</button>
          <button onClick={() => setTab('playbook')} className="rounded-sm px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100 hover:text-slate-800">SpectIQ pitch playbook</button>
          <button onClick={() => setTab('research')} className="rounded-sm px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100 hover:text-slate-800">{activeTerritoryName} market intel</button>
          <span className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-2 text-[9px] font-black uppercase tracking-widest text-amber-800"><ShieldCheck size={12}/>{reviewQueue.length} awaiting human review</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {[
            { label: 'Total monitored', value: pipelineMetrics.total, icon: Building2, tone: 'text-blue-700 bg-blue-50' },
            { label: 'High-fit signals', value: pipelineMetrics.highFit, icon: Target, tone: 'text-emerald-700 bg-emerald-50' },
            { label: 'Official URL not identified', value: pipelineMetrics.noOfficialUrl, icon: Globe2, tone: 'text-rose-700 bg-rose-50' },
            { label: 'Phone-only signals', value: pipelineMetrics.phoneOnly, icon: Phone, tone: 'text-indigo-700 bg-indigo-50' },
            { label: 'Manual quote signals', value: pipelineMetrics.manualQuote, icon: ClipboardCheck, tone: 'text-amber-700 bg-amber-50' },
            { label: 'Average advisory fit', value: pipelineMetrics.averageFit === null ? 'Pending' : pipelineMetrics.averageFit, icon: Sparkles, tone: 'text-violet-700 bg-violet-50' },
          ].map(metric => <div key={metric.label} className="rounded-sm border border-slate-200 bg-white p-4 shadow-sm"><div className={`flex h-8 w-8 items-center justify-center rounded-sm ${metric.tone}`}><metric.icon size={15}/></div><p className="mt-3 text-xl font-black text-slate-950">{metric.value}</p><p className="mt-1 text-[9px] font-black uppercase leading-snug tracking-widest text-slate-400">{metric.label}</p></div>)}
        </div>
      </>}
      <div className="mt-5 flex flex-col gap-3 rounded-sm border border-slate-200 bg-white p-4  lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1"><Search size={17} className="absolute left-4 top-3.5 text-slate-400"/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search company, city, domain, or contact" className="w-full rounded-sm border border-slate-200 py-3 pl-11 pr-4 text-sm font-semibold outline-none focus:border-blue-400"/></div>
        <div className="flex items-center gap-2"><Filter size={15} className="text-slate-400"/><select value={stage} onChange={e => setStage(e.target.value)} className="rounded-sm border border-slate-200 px-3 py-3 text-xs font-bold text-slate-700"><option value="all">All stages</option>{STAGES.map(s => <option key={s} value={s}>{STAGE_META[s]?.label || label(s)}</option>)}</select></div>
        <select value={verification} onChange={e => setVerification(e.target.value)} className="rounded-sm border border-slate-200 px-3 py-3 text-xs font-bold text-slate-700"><option value="all">All verification</option>{['unreviewed','evidence_reviewed','identity_verified','contact_verified','outreach_approved'].map(s => <option key={s} value={s}>{label(s)}</option>)}</select>
        <button onClick={exportSelected} disabled={!selected.size} className="flex items-center justify-center gap-2 rounded-sm bg-slate-900 px-4 py-3 text-xs font-black uppercase tracking-widest text-white disabled:cursor-not-allowed disabled:opacity-35"><Download size={15}/>Export {selected.size || ''}</button>
      </div>

      {loading ? <div className="mt-5 flex min-h-72 items-center justify-center rounded-sm border border-slate-200 bg-white"><Loader2 className="animate-spin text-blue-600"/><span className="ml-3 text-sm font-bold text-slate-500">Loading founder pipeline…</span></div>
      : error ? <div className="mt-5 flex min-h-72 flex-col items-center justify-center rounded-sm border border-rose-200 bg-rose-50 p-8 text-center"><AlertCircle className="mb-3 text-rose-500" size={28}/><p className="font-black text-rose-900">Prospecting data could not load</p><p className="mt-2 text-sm text-rose-700">{error}</p><button onClick={() => void load()} className="mt-5 rounded-sm bg-rose-600 px-4 py-2 text-xs font-black uppercase tracking-widest text-white">Try again</button></div>
      : visible.length === 0 ? <div className="mt-5 flex min-h-72 flex-col items-center justify-center rounded-sm border border-dashed border-slate-300 bg-white p-8 text-center"><Inbox className="mb-3 text-slate-300" size={34}/><p className="font-black uppercase tracking-tight text-slate-700">{tab === 'review' ? 'Review queue is clear' : 'No prospects yet'}</p><p className="mt-2 max-w-md text-sm text-slate-400">{tab === 'review' ? 'Prospects needing founder evidence review will appear here.' : 'Start a geographic search or create the first company record manually.'}</p>{tab === 'pipeline' && <div className="mt-5 flex flex-wrap justify-center gap-2"><button onClick={() => setTab('research')} className="flex items-center gap-2 rounded-sm bg-blue-600 px-5 py-3 text-xs font-black uppercase tracking-widest text-white"><Search size={15}/>Start research</button><button onClick={() => { setProspectForm(blankProspect); setProspectFormOpen(true); }} className="flex items-center gap-2 rounded-sm border border-slate-300 px-5 py-3 text-xs font-black uppercase tracking-widest text-slate-700"><Plus size={15}/>Create manually</button></div>}</div>
      : <div className="mt-5 grid gap-5 md:grid-cols-2 xl:grid-cols-3">{visible.map(item => {
        const p = asRecord(item); const id = String(p.id); const snapshot = getProspectResearchSnapshot(item); const meta = STAGE_META[p.sales_state] || STAGE_META.new;
        const evidenceCount = Number(p.evidence_count ?? p.claim_count ?? asRecord(p.metadata).evidence_count ?? 0);
        const fitScore = snapshot?.fitScore ?? null;
        const websiteIdentified = Boolean(p.website_url || p.official_domain);
        const websiteHref = safeWebsiteHref(p.website_url, p.official_domain);
        const observedStack = snapshot?.currentStack || [];
        const currentStack = observedStack.length ? observedStack.join(' · ') : (websiteIdentified ? 'Official website identified' : 'Public web presence not identified');
        const fit = fitPresentation(fitScore, snapshot?.fitCategory);
        const stack = stackPresentation(observedStack);
        const opportunity = snapshot?.opportunityHypothesis || p.opportunity_category || p.summary || 'Review the evidence to form a SpectIQ opportunity hypothesis.';
        const friction = snapshot?.frictionPoint || 'Not yet identified — founder review required.';
        const territory = territories.find(candidate => String(asRecord(candidate).id) === String(p.territory_id));
        return <article key={id} className="flex min-h-[31rem] flex-col overflow-hidden rounded-sm border border-slate-200 bg-white shadow-sm transition hover:border-blue-200 hover:shadow-md">
          <div className="flex flex-1 flex-col p-5 sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <label className="mt-1 flex shrink-0 items-center" title="Select for export"><input type="checkbox" checked={selected.has(id)} onChange={() => toggleSelected(id)} className="h-4 w-4 rounded border-slate-300 accent-blue-600"/><span className="sr-only">Select {p.company_name || 'company'}</span></label>
              <div className="min-w-0 flex-1"><button onClick={() => void openDetail(item)} className="text-left"><h3 className="text-base font-black leading-snug text-slate-950">{p.company_name || 'Unnamed company'}</h3></button><p className="mt-1 flex items-center gap-1 text-xs font-semibold text-slate-400"><MapPin size={12}/>{[p.city, p.state_code].filter(Boolean).join(', ') || asRecord(territory).name || 'Location needs verification'}</p></div>
              <Badge className={`shrink-0 ${fit.style}`}><Sparkles size={11}/>{fit.label}</Badge>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {!websiteIdentified && <Badge className="bg-rose-50 text-rose-700"><AlertCircle size={11}/>Official URL not identified</Badge>}
              {observedStack.length > 0 && <Badge className={stack.style}><ListChecks size={11}/>{stack.label}</Badge>}
              <Badge className={p.verification_state === 'outreach_approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}><ShieldCheck size={11}/>{label(p.verification_state || 'unreviewed')}</Badge>
              {evidenceCount > 0 && <Badge className="bg-blue-50 text-blue-700"><BadgeCheck size={11}/>{evidenceCount} sources</Badge>}
            </div>

            <dl className="mt-5 space-y-2 rounded-sm bg-slate-50 p-4 text-xs">
              <div className="flex gap-3"><dt className="w-24 shrink-0 font-semibold text-slate-500">Current stack:</dt><dd className="min-w-0 text-right font-bold text-slate-800 sm:ml-auto">{String(currentStack)}</dd></div>
              <div className="flex gap-3"><dt className="w-24 shrink-0 font-semibold text-slate-500">Phone:</dt><dd className="min-w-0 text-right font-bold text-slate-800 sm:ml-auto">{p.phone || 'Not identified'}</dd></div>
              <div className="flex gap-3"><dt className="w-24 shrink-0 font-semibold text-slate-500">Website:</dt><dd className="min-w-0 break-all text-right font-bold sm:ml-auto">{websiteHref ? <a href={websiteHref} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">{p.official_domain || p.website_url}</a> : websiteIdentified ? <span className="italic text-amber-700">Needs URL review</span> : <span className="italic text-rose-600">Not identified</span>}</dd></div>
            </dl>

            <div className="mt-5"><p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-blue-700"><Sparkles size={13}/>SpectIQ opportunity hypothesis</p><p className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-600">{String(opportunity)}</p></div>
            <div className="mt-4 rounded-sm border border-amber-200 bg-amber-50 p-3"><p className="text-[10px] font-black uppercase tracking-wider text-amber-800">Key friction point</p><p className="mt-1 line-clamp-2 text-xs leading-relaxed text-amber-900">{String(friction)}</p></div>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/50 px-5 py-4 sm:px-6">
            <button onClick={() => void openDetail(item)} className="flex items-center gap-1.5 text-xs font-black text-blue-700">View dossier <ArrowRight size={14}/></button>
            <select aria-label={`Sales stage for ${p.company_name || 'company'}`} value={p.sales_state || 'new'} disabled={saving} onChange={e => void handleStage(item, e.target.value)} className={`max-w-36 rounded-sm border-0 px-3 py-2 text-[10px] font-black uppercase tracking-wider ${meta.style}`}>{STAGES.map(s => <option key={s} value={s}>{STAGE_META[s]?.label || label(s)}</option>)}</select>
          </div>
        </article>;
      })}</div>}
      <div className="mt-4 flex items-start gap-3 rounded-sm border border-blue-100 bg-blue-50 p-4 text-xs font-semibold leading-relaxed text-blue-900"><ShieldCheck size={17} className="mt-0.5 shrink-0"/><span>Research candidates enter this pipeline only after explicit founder review and import. Outbound email remains disabled.</span></div>
    </>}

    {tab === 'playbook' && <div className="mt-5 grid gap-5 lg:grid-cols-3">{[
      ['Missed-inquiry friction', 'Listen for slow callbacks, repeated intake questions, and buyers waiting while staff rebuild context.', 'Lead with one visible path from inquiry to an explainable estimate.'],
      ['Disconnected handoffs', 'Look for separate tools or manual steps across estimates, agreements, payment, and scheduling.', 'Describe operational continuity. Never promise unsupported conversion or revenue gains.'],
      ['Control and trust', 'Inspection owners are right to question black-box automation and inflexible rules.', 'Show evidence, audit trails, human approval, and an explicit way out.'],
    ].map(([title, observe, guidance], index) => <div key={title} className="rounded-sm border border-slate-200 bg-white p-7 "><span className="text-4xl font-black text-blue-100">0{index + 1}</span><h3 className="mt-3 text-lg font-black   text-slate-900">{title}</h3><p className="mt-4 text-xs font-black   text-slate-400">What to observe</p><p className="mt-2 text-sm leading-relaxed text-slate-600">{observe}</p><p className="mt-4 text-xs font-black   text-slate-400">Founder guidance</p><p className="mt-2 text-sm leading-relaxed text-slate-600">{guidance}</p></div>)}</div>}

    {tab === 'territories' && <div className="mt-5"><div className="mb-4 flex justify-end"><button onClick={() => { setTerritoryForm(blankTerritory); setTerritoryFormOpen(true); }} className="flex items-center gap-2 rounded-sm bg-blue-600 px-4 py-3 text-xs font-black   text-white"><Plus size={15}/>New territory</button></div><div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">{territories.length ? territories.map(item => { const t = asRecord(item); return <div key={String(t.id)} className="rounded-sm border border-slate-200 bg-white p-7 text-left "><div className="flex items-start justify-between"><span className="flex h-11 w-11 items-center justify-center rounded-sm bg-blue-600 text-white"><MapPin size={20}/></span><Badge className={t.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}>{t.status}</Badge></div><h3 className="mt-5 text-lg font-black   text-slate-900">{t.name}</h3><p className="mt-1 text-sm font-semibold text-slate-400">{[t.city || t.county, t.state_code].filter(Boolean).join(', ') || label(t.kind)}</p><div className="mt-5 flex items-center justify-between gap-2 border-t border-slate-100 pt-4"><button onClick={() => { setTerritoryId(String(t.id)); setTab('pipeline'); }} className="flex items-center gap-1 text-xs font-black   text-blue-600">View prospects <ArrowRight size={15}/></button><div className="flex gap-1"><button aria-label={`Edit ${t.name}`} onClick={() => { setTerritoryForm({ ...blankTerritory, ...t, target_count: String(t.target_count ?? 0) }); setTerritoryFormOpen(true); }} className="rounded-sm p-2 text-slate-500 hover:bg-slate-100"><Pencil size={15}/></button><button aria-label={`Archive ${t.name}`} onClick={() => setConfirmAction({ title: 'Archive territory?', detail: `${t.name} will leave active territory views. Its prospect records are preserved.`, run: async () => { const mod = await import('../services/prospectingService'); await mod.archiveTerritory(String(t.id)); setConfirmAction(null); addToast('Territory archived.', 'success'); await load(true); } })} className="rounded-sm p-2 text-rose-500 hover:bg-rose-50"><Trash2 size={15}/></button></div></div></div>; }) : <div className="col-span-full rounded-sm border border-dashed border-slate-300 bg-white p-12 text-center"><Map className="mx-auto text-slate-300" size={36}/><p className="mt-4 font-black  text-slate-700">No territories configured</p><p className="mt-2 text-sm text-slate-400">Create a territory to organize manual prospect records.</p><button onClick={() => { setTerritoryForm(blankTerritory); setTerritoryFormOpen(true); }} className="mx-auto mt-5 flex items-center gap-2 rounded-sm bg-blue-600 px-5 py-3 text-xs font-black   text-white"><Plus size={15}/>Create first territory</button></div>}</div></div>}

    {focused && (() => { const p = asRecord(focused); const evidence = itemsOf<any>(p.claims); const notes = itemsOf<any>(p.notes); const tasks = itemsOf<any>(p.tasks); const primaryContact = itemsOf<any>(p.contacts).find(contact => contact.is_primary) || itemsOf<any>(p.contacts)[0]; return <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={e => { if (e.target === e.currentTarget) setFocused(null); }}><div className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-t-[2.5rem] bg-white  sm:rounded-sm">
      <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-100 bg-white/95 px-6 py-6 backdrop-blur sm:px-8"><div><div className="mb-2 flex flex-wrap gap-2"><Badge className={(STAGE_META[p.sales_state] || STAGE_META.new).style}>{(STAGE_META[p.sales_state] || STAGE_META.new).label}</Badge><Badge className={p.verification_state === 'outreach_approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}><ShieldCheck size={11}/>{label(p.verification_state || 'unreviewed')}</Badge></div><h2 className="text-2xl font-black   text-slate-900">{p.company_name}</h2><p className="mt-1 text-sm font-semibold text-slate-400">{[p.city, p.state_code].filter(Boolean).join(', ') || 'Location unverified'}</p></div><div className="flex gap-1"><button onClick={editProspect} aria-label="Edit prospect" className="rounded-sm bg-slate-100 p-2 text-slate-500"><Pencil size={18}/></button><button onClick={() => setConfirmAction({ title: 'Archive prospect?', detail: `${p.company_name} will leave the active pipeline. Its audit history is preserved.`, run: async () => { const mod = await import('../services/prospectingService'); await mod.archiveProspect(String(p.id)); setConfirmAction(null); setFocused(null); addToast('Prospect archived.', 'success'); await load(true); } })} aria-label="Archive prospect" className="rounded-sm bg-rose-50 p-2 text-rose-600"><Trash2 size={18}/></button><button onClick={() => setFocused(null)} className="rounded-sm bg-slate-100 p-2 text-slate-500"><X size={18}/></button></div></div>
      <div className="border-b border-slate-100 bg-slate-50/60 p-6 sm:p-8">
        <ProspectDossier
          record={focused as ProspectingProspectDetail}
          kind="prospect"
          busy={saving}
          onReviewClaim={(claimId, decision, correction) => { void reviewClaim(claimId, decision, correction); }}
          onRequestPitchReady={() => { void handleStage(focused, 'pitch_ready'); }}
        />
      </div>
      <div className="grid gap-7 p-6 sm:p-8 lg:grid-cols-5"><div className="space-y-6 lg:col-span-3">
        <section><h3 className="text-xs font-black   text-slate-400">Company record</h3><div className="mt-3 grid gap-3 sm:grid-cols-2">{[[Globe2, p.website_url || label(p.website_state), p.website_url],[Mail, primaryContact?.email || 'Email not verified', null],[Phone, primaryContact?.phone || p.phone || 'Phone not verified',null],[MapPin,[p.address_line_1,p.city,p.state_code].filter(Boolean).join(', ') || 'Address not verified',null]].map(([Icon, text, href], i) => <div key={i} className="flex min-w-0 items-center gap-3 rounded-sm bg-slate-50 p-4"><Icon size={16} className="shrink-0 text-blue-600"/><span className="truncate text-xs font-bold text-slate-700">{String(text || '')}</span>{href && <a href={String(href).startsWith('http') ? String(href) : `https://${href}`} target="_blank" rel="noreferrer" className="ml-auto text-slate-400"><ExternalLink size={13}/></a>}</div>)}</div></section>
        <section><div className="flex items-center justify-between"><h3 className="text-xs font-black   text-slate-400">Contacts</h3><button onClick={() => setContactForm(blankContact)} className="flex items-center gap-1 text-xs font-black text-blue-600"><Plus size={14}/>Add contact</button></div><div className="mt-3 space-y-2">{itemsOf<any>(p.contacts).length ? itemsOf<any>(p.contacts).map(contact => <div key={contact.id} className="flex items-center gap-3 rounded-sm bg-slate-50 p-4"><div className="min-w-0 flex-1"><p className="truncate text-sm font-black text-slate-800">{contact.full_name || contact.email || contact.phone}</p><p className="truncate text-xs text-slate-500">{[contact.title, contact.email, contact.phone].filter(Boolean).join(' · ')}</p></div>{contact.is_primary && <Badge className="bg-blue-50 text-blue-700">Primary</Badge>}<button onClick={() => setContactForm({ ...blankContact, ...contact })} aria-label="Edit contact" className="rounded-sm p-2 text-slate-500"><Pencil size={14}/></button></div>) : <p className="rounded-sm border border-dashed border-slate-200 p-4 text-sm text-slate-500">No contacts recorded.</p>}</div></section>
        <section><div className="flex items-center justify-between"><h3 className="text-xs font-black   text-slate-400">Evidence and claims</h3><button onClick={() => setClaimForm(blankClaim)} className="flex items-center gap-1 text-xs font-black text-blue-600"><Plus size={14}/>Add evidence</button></div><div className="mt-3 space-y-3">{evidence.length ? evidence.map((claim, index) => <div key={claim.id || index} className="rounded-sm border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><p className="text-sm font-black text-slate-800">{label(claim.claim_type || claim.field_name)}</p><Badge className={claim.verification_decision === 'approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}>{label(claim.verification_decision || 'pending')}</Badge></div><p className="mt-2 text-sm leading-relaxed text-slate-600">{claim.display_value || claim.normalized_value || claim.excerpt || 'Evidence retained for founder review.'}</p>{claim.founder_correction && <p className="mt-2 rounded-sm bg-blue-50 p-3 text-xs font-semibold text-blue-900">Founder correction: {claim.founder_correction}</p>}<div className="mt-3 flex flex-wrap items-center gap-2">{claim.source_url && <a href={claim.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-black text-blue-600">Open source <ExternalLink size={12}/></a>}<button onClick={() => setClaimForm({ ...blankClaim, ...claim, confidence: String(claim.confidence ?? .8) })} className="rounded-sm bg-slate-100 px-2.5 py-1.5 text-[10px] font-black  text-slate-700">Edit evidence</button><button onClick={() => void reviewClaim(String(claim.id), 'approved')} className="rounded-sm bg-emerald-50 px-2.5 py-1.5 text-[10px] font-black  text-emerald-700">Approve</button><button onClick={() => { const correction = window.prompt('Enter the corrected value'); if (correction?.trim()) void reviewClaim(String(claim.id), 'corrected', correction.trim()); }} className="rounded-sm bg-blue-50 px-2.5 py-1.5 text-[10px] font-black  text-blue-700">Correct</button><button onClick={() => void reviewClaim(String(claim.id), 'rejected')} className="rounded-sm bg-rose-50 px-2.5 py-1.5 text-[10px] font-black  text-rose-700">Reject</button></div></div>) : <div className="rounded-sm border border-dashed border-amber-200 bg-amber-50 p-5 text-sm font-semibold text-amber-800">No evidence is attached. This record cannot be treated as verified.</div>}</div></section>
        {(notes.length > 0 || tasks.length > 0) && <section className="grid gap-4 sm:grid-cols-2"><div><h3 className="text-xs font-black   text-slate-400">Recent notes</h3><div className="mt-3 space-y-2">{notes.slice(0, 3).map((entry, index) => <div key={entry.id || index} className="rounded-sm bg-slate-50 p-4"><p className="text-sm leading-relaxed text-slate-700">{entry.body}</p><p className="mt-2 text-[9px] font-black   text-slate-400">{dateText(entry.created_at)}</p></div>)}</div></div><div><h3 className="text-xs font-black   text-slate-400">Tasks</h3><div className="mt-3 space-y-2">{tasks.slice(0, 5).map((entry, index) => <div key={entry.id || index} className="rounded-sm bg-slate-50 p-4"><p className={`text-sm font-bold ${entry.status === 'completed' ? 'text-slate-400 line-through' : 'text-slate-700'}`}>{entry.title}</p><p className="mt-2 text-[9px] font-black   text-slate-400">{label(entry.status)} · Due {dateText(entry.due_at)}</p>{!['completed','cancelled'].includes(entry.status) && <div className="mt-3 flex gap-2"><button onClick={() => void updateTaskState(String(entry.id), 'completed')} className="rounded-sm bg-emerald-50 px-2.5 py-1.5 text-[10px] font-black  text-emerald-700">Complete</button><button onClick={() => void updateTaskState(String(entry.id), 'cancelled')} className="rounded-sm bg-slate-200 px-2.5 py-1.5 text-[10px] font-black  text-slate-600">Cancel</button></div>}</div>)}</div></div></section>}
      </div><div className="space-y-5 lg:col-span-2">
        <section className="rounded-sm bg-slate-950 p-5 text-white"><h3 className="text-xs font-black   text-slate-400">Sales stage</h3><select value={p.sales_state || 'new'} disabled={saving} onChange={e => void handleStage(focused, e.target.value)} className="mt-3 w-full rounded-sm border border-white/10 bg-white/10 px-3 py-3 text-sm font-bold">{STAGES.map(s => <option className="text-slate-900" key={s} value={s}>{STAGE_META[s]?.label || label(s)}</option>)}</select><div className="mt-4 flex items-start gap-2 rounded-sm bg-white/5 p-3 text-[11px] leading-relaxed text-slate-300"><ShieldCheck size={14} className="mt-0.5 shrink-0"/>Stage changes never grant outreach approval.</div></section>
        <section className="rounded-sm border border-slate-200 p-5"><h3 className="text-xs font-black   text-slate-400">Verification state</h3><select value={p.verification_state || 'unreviewed'} disabled={saving} onChange={e => void setVerificationState(e.target.value as ProspectingVerificationState)} className="mt-3 w-full rounded-sm border border-slate-200 px-3 py-3 text-sm font-bold">{['unreviewed','evidence_reviewed','identity_verified','contact_verified','outreach_approved'].map(value => <option key={value} value={value}>{label(value)}</option>)}</select><p className="mt-3 text-[11px] leading-relaxed text-slate-500">Founder review is explicit. Changing sales stage does not approve outreach.</p></section>
        <section className="rounded-sm border border-slate-200 p-5"><h3 className="text-xs font-black   text-slate-400">Next action</h3><input type="datetime-local" value={nextAction} onChange={e => setNextAction(e.target.value)} className="mt-3 w-full rounded-sm border border-slate-200 px-3 py-3 text-sm"/><button onClick={saveNextAction} disabled={saving} className="mt-3 w-full rounded-sm bg-blue-600 py-3 text-xs font-black   text-white disabled:opacity-50">Save next action</button></section>
        <section className="rounded-sm border border-slate-200 p-5"><h3 className="flex items-center gap-2 text-xs font-black   text-slate-400"><MessageSquarePlus size={14}/>Add note</h3><textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Record what you learned…" className="mt-3 min-h-24 w-full rounded-sm border border-slate-200 p-3 text-sm"/><button onClick={saveNote} disabled={saving || !note.trim()} className="mt-2 w-full rounded-sm bg-slate-900 py-3 text-xs font-black   text-white disabled:opacity-35">Add note</button></section>
        <section className="rounded-sm border border-slate-200 p-5"><h3 className="flex items-center gap-2 text-xs font-black   text-slate-400"><CalendarClock size={14}/>Follow-up task</h3><input value={taskTitle} onChange={e => setTaskTitle(e.target.value)} placeholder="Task title" className="mt-3 w-full rounded-sm border border-slate-200 px-3 py-3 text-sm"/><input type="datetime-local" value={taskDue} onChange={e => setTaskDue(e.target.value)} className="mt-2 w-full rounded-sm border border-slate-200 px-3 py-3 text-sm"/><button onClick={saveTask} disabled={saving || !taskTitle.trim()} className="mt-2 w-full rounded-sm bg-slate-900 py-3 text-xs font-black   text-white disabled:opacity-35">Create task</button></section>
        <div className="rounded-sm border border-blue-100 bg-blue-50 p-4 text-xs font-semibold leading-relaxed text-blue-900"><Sparkles size={16} className="mb-2"/>Research evidence is preserved separately from founder approval. Email sending remains disabled.</div>
      </div></div>
    </div></div>; })()}

    {prospectFormOpen && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4"><div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-sm bg-white p-6  sm:p-8"><div className="flex items-center justify-between"><div><p className="text-[10px] font-black   text-blue-600">Manual record</p><h2 className="mt-1 text-xl font-black  text-slate-900">{prospectForm.id ? 'Edit prospect' : 'Create prospect'}</h2></div><button onClick={() => setProspectFormOpen(false)} className="rounded-sm bg-slate-100 p-2 text-slate-500"><X size={18}/></button></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><Field label="Company name *"><input autoFocus value={prospectForm.company_name} onChange={e => setProspectForm(v => ({ ...v, company_name: e.target.value }))} className={inputClass}/></Field><Field label="Territory"><select value={prospectForm.territory_id} onChange={e => setProspectForm(v => ({ ...v, territory_id: e.target.value }))} className={inputClass}><option value="">No territory</option>{territories.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field><Field label="Website"><input type="url" placeholder="https://…" value={prospectForm.website_url} onChange={e => setProspectForm(v => ({ ...v, website_url: e.target.value }))} className={inputClass}/></Field><Field label="Official domain"><input placeholder="company.com" value={prospectForm.official_domain} onChange={e => setProspectForm(v => ({ ...v, official_domain: e.target.value }))} className={inputClass}/></Field><Field label="Phone"><input value={prospectForm.phone} onChange={e => setProspectForm(v => ({ ...v, phone: e.target.value }))} className={inputClass}/></Field><Field label="Street address"><input value={prospectForm.address_line_1} onChange={e => setProspectForm(v => ({ ...v, address_line_1: e.target.value }))} className={inputClass}/></Field><Field label="City"><input value={prospectForm.city} onChange={e => setProspectForm(v => ({ ...v, city: e.target.value }))} className={inputClass}/></Field><div className="grid grid-cols-2 gap-3"><Field label="State"><input maxLength={2} value={prospectForm.state_code} onChange={e => setProspectForm(v => ({ ...v, state_code: e.target.value.toUpperCase() }))} className={inputClass}/></Field><Field label="Postal code"><input value={prospectForm.postal_code} onChange={e => setProspectForm(v => ({ ...v, postal_code: e.target.value }))} className={inputClass}/></Field></div><div className="sm:col-span-2"><Field label="Founder summary"><textarea value={prospectForm.summary} onChange={e => setProspectForm(v => ({ ...v, summary: e.target.value }))} className={`${inputClass} min-h-24`}/></Field></div></div><div className="mt-6 flex justify-end gap-2"><button onClick={() => setProspectFormOpen(false)} className="rounded-sm px-4 py-3 text-xs font-black  text-slate-500">Cancel</button><button onClick={() => void saveProspect()} disabled={saving} className="flex items-center gap-2 rounded-sm bg-blue-600 px-5 py-3 text-xs font-black  text-white disabled:opacity-50">{saving ? <Loader2 size={15} className="animate-spin"/> : <Save size={15}/>}Save prospect</button></div></div></div>}

    {territoryFormOpen && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/60 p-4"><div className="w-full max-w-xl rounded-sm bg-white p-6  sm:p-8"><div className="flex items-center justify-between"><h2 className="text-xl font-black  text-slate-900">{territoryForm.id ? 'Edit territory' : 'Create territory'}</h2><button onClick={() => setTerritoryFormOpen(false)} className="rounded-sm bg-slate-100 p-2"><X size={18}/></button></div><div className="mt-6 grid gap-4 sm:grid-cols-2"><Field label="Territory name *"><input autoFocus value={territoryForm.name} onChange={e => setTerritoryForm(v => ({ ...v, name: e.target.value }))} className={inputClass}/></Field><Field label="Type"><select value={territoryForm.kind} onChange={e => setTerritoryForm(v => ({ ...v, kind: e.target.value }))} className={inputClass}>{['city','county','state','multi_market'].map(v => <option key={v} value={v}>{label(v)}</option>)}</select></Field><Field label="City"><input value={territoryForm.city} onChange={e => setTerritoryForm(v => ({ ...v, city: e.target.value }))} className={inputClass}/></Field><Field label="County"><input value={territoryForm.county} onChange={e => setTerritoryForm(v => ({ ...v, county: e.target.value }))} className={inputClass}/></Field><Field label="State *"><input maxLength={2} value={territoryForm.state_code} onChange={e => setTerritoryForm(v => ({ ...v, state_code: e.target.value.toUpperCase() }))} className={inputClass}/></Field><Field label="Target count"><input type="number" min="0" value={territoryForm.target_count} onChange={e => setTerritoryForm(v => ({ ...v, target_count: e.target.value }))} className={inputClass}/></Field><Field label="Status"><select value={territoryForm.status} onChange={e => setTerritoryForm(v => ({ ...v, status: e.target.value }))} className={inputClass}><option value="draft">Draft</option><option value="active">Active</option></select></Field></div><div className="mt-6 flex justify-end gap-2"><button onClick={() => setTerritoryFormOpen(false)} className="rounded-sm px-4 py-3 text-xs font-black  text-slate-500">Cancel</button><button onClick={() => void saveTerritory()} disabled={saving} className="rounded-sm bg-blue-600 px-5 py-3 text-xs font-black  text-white disabled:opacity-50">Save territory</button></div></div></div>}

    {contactForm && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4"><div className="w-full max-w-xl rounded-sm bg-white p-6 "><div className="flex items-center justify-between"><h2 className="text-xl font-black  text-slate-900">{contactForm.id ? 'Edit contact' : 'Add contact'}</h2><button onClick={() => setContactForm(null)} className="rounded-sm bg-slate-100 p-2"><X size={18}/></button></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><Field label="Full name"><input value={contactForm.full_name} onChange={e => setContactForm(v => ({ ...v!, full_name: e.target.value }))} className={inputClass}/></Field><Field label="Title"><input value={contactForm.title} onChange={e => setContactForm(v => ({ ...v!, title: e.target.value }))} className={inputClass}/></Field><Field label="Email"><input type="email" value={contactForm.email} onChange={e => setContactForm(v => ({ ...v!, email: e.target.value }))} className={inputClass}/></Field><Field label="Phone"><input value={contactForm.phone} onChange={e => setContactForm(v => ({ ...v!, phone: e.target.value }))} className={inputClass}/></Field><Field label="Source URL"><input type="url" value={contactForm.source_url} onChange={e => setContactForm(v => ({ ...v!, source_url: e.target.value }))} className={inputClass}/></Field><Field label="Email verification"><select value={contactForm.email_status} onChange={e => setContactForm(v => ({ ...v!, email_status: e.target.value }))} className={inputClass}>{['unknown','unverified','verified','invalid','bounced','complained','unsubscribed'].map(v => <option key={v} value={v}>{label(v)}</option>)}</select></Field><label className="flex items-center gap-2 text-sm font-bold text-slate-700"><input type="checkbox" checked={contactForm.is_primary} onChange={e => setContactForm(v => ({ ...v!, is_primary: e.target.checked }))}/>Primary contact</label></div><button onClick={() => void saveContact()} disabled={saving} className="mt-6 w-full rounded-sm bg-blue-600 py-3 text-xs font-black  text-white disabled:opacity-50">Save contact</button></div></div>}

    {claimForm && <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4"><div className="w-full max-w-xl rounded-sm bg-white p-6 "><div className="flex items-center justify-between"><h2 className="text-xl font-black  text-slate-900">{claimForm.id ? 'Edit evidence' : 'Add evidence'}</h2><button onClick={() => setClaimForm(null)} className="rounded-sm bg-slate-100 p-2"><X size={18}/></button></div><p className="mt-2 text-sm text-slate-500">Record only what the source supports. Founder review remains explicit.</p><div className="mt-5 space-y-4"><Field label="Claim type *"><select value={claimForm.claim_type} onChange={e => setClaimForm(v => ({ ...v!, claim_type: e.target.value }))} className={inputClass}>{['company_identity','official_website','contact_identity','contact_email','services','service_area','opportunity','outreach_angle','other'].map(value => <option key={value} value={value}>{label(value)}</option>)}</select></Field><Field label="Observed value *"><textarea value={claimForm.display_value} onChange={e => setClaimForm(v => ({ ...v!, display_value: e.target.value }))} className={`${inputClass} min-h-20`}/></Field><Field label="Source URL *"><input type="url" value={claimForm.source_url} onChange={e => setClaimForm(v => ({ ...v!, source_url: e.target.value }))} className={inputClass}/></Field><Field label="Source excerpt"><textarea value={claimForm.source_excerpt} onChange={e => setClaimForm(v => ({ ...v!, source_excerpt: e.target.value }))} className={`${inputClass} min-h-20`}/></Field><Field label="Confidence (0–1)"><input type="number" min="0" max="1" step="0.05" value={claimForm.confidence} onChange={e => setClaimForm(v => ({ ...v!, confidence: e.target.value }))} className={inputClass}/></Field></div><button onClick={() => void saveClaim()} disabled={saving} className="mt-6 w-full rounded-sm bg-blue-600 py-3 text-xs font-black  text-white disabled:opacity-50">{claimForm.id ? 'Save evidence' : 'Add evidence'}</button></div></div>}

    {confirmAction && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-4"><div className="w-full max-w-md rounded-sm bg-white p-7 text-center "><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-sm bg-rose-50 text-rose-600"><Trash2 size={21}/></div><h2 className="mt-4 text-xl font-black  text-slate-900">{confirmAction.title}</h2><p className="mt-2 text-sm leading-relaxed text-slate-500">{confirmAction.detail}</p><div className="mt-6 grid grid-cols-2 gap-3"><button onClick={() => setConfirmAction(null)} className="rounded-sm border border-slate-200 py-3 text-xs font-black  text-slate-600">Keep record</button><button onClick={() => { setSaving(true); void confirmAction.run().catch(cause => { addToast(cause instanceof Error ? cause.message : 'Archive failed.', 'error'); }).finally(() => setSaving(false)); }} disabled={saving} className="rounded-sm bg-rose-600 py-3 text-xs font-black  text-white disabled:opacity-50">Confirm archive</button></div></div></div>}
  </div>;
};

export default Prospecting;
