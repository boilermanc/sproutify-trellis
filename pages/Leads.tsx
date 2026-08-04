import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertCircle,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  FileSpreadsheet,
  Loader2,
  Mail,
  Plus,
  Search,
  Tag,
  Target,
  Upload,
  UserPlus,
  X,
} from 'lucide-react';
import { BranchContext, Lead, LeadPipeline, NewLeadInput, TimelineEntry } from '../types';
import LeadTimeline from '../components/leads/LeadTimeline';
import {
  checkExistingLeads,
  createLead,
  createLeadsBulk,
  fetchLeads,
  fetchLeadTimeline,
  fetchPipelines,
  LeadExistenceStatus,
  parseLeadPaste,
  parseLeadRows,
  updateLead,
  updateLeadStage,
} from '../leadService';

interface LeadsProps {
  branchContext: BranchContext;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

type LeadStatusFilter = 'open' | 'won' | 'lost' | 'recycled' | 'all';
type ImportStep = 'paste' | 'preview' | 'result';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const STATUS_STYLES: Record<string, string> = {
  open: 'border-cyan-400/30 bg-cyan-400/10 text-cyan-300',
  won: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  lost: 'border-slate-500/30 bg-slate-500/10 text-slate-300',
  recycled: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
};

const STATUS_FILTERS: Array<{ value: LeadStatusFilter; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'won', label: 'Won' },
  { value: 'lost', label: 'Lost' },
  { value: 'recycled', label: 'Recycled' },
  { value: 'all', label: 'All' },
];

const emptyLeadForm = (): NewLeadInput => ({
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  source: 'manual',
  inquiry_text: '',
  estimated_value: undefined,
  notes: '',
  branch_id: '',
  pipeline_id: '',
});

const formatDate = (value?: string | null): string => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const formatMoney = (value?: number | null): string => {
  if (value == null) return 'Not estimated';
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
};

const profileName = (lead: Lead): string => {
  const name = [lead.profile?.first_name, lead.profile?.last_name].filter(Boolean).join(' ').trim();
  return name || lead.profile?.email || 'Unknown lead';
};

const profileTags = (lead: Lead): string[] => {
  const profile = lead.profile as (Lead['profile'] & { tags?: unknown });
  return Array.isArray(profile?.tags) ? profile.tags.filter((tag): tag is string => typeof tag === 'string') : [];
};

const dateInputValue = (value?: string | null): string => value ? value.slice(0, 10) : '';

const ModalShell: React.FC<{
  title: string;
  subtitle: string;
  icon: React.ElementType;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ title, subtitle, icon: Icon, onClose, children }) => (
  <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#050713]/80 p-4 backdrop-blur-sm">
    <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-[2rem] border border-cyan-400/15 bg-[#10142E] shadow-2xl shadow-cyan-950/40">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-[#10142E]/95 px-6 py-5 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-300">
            <Icon size={21} />
          </div>
          <div>
            <h2 className="text-lg font-black uppercase tracking-tight text-white">{title}</h2>
            <p className="text-xs text-slate-400">{subtitle}</p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="rounded-xl p-2 text-slate-400 transition hover:bg-white/10 hover:text-white" aria-label="Close">
          <X size={20} />
        </button>
      </div>
      {children}
    </div>
  </div>
);

const Leads: React.FC<LeadsProps> = ({ branchContext, addToast }) => {
  const [pipelines, setPipelines] = useState<LeadPipeline[]>([]);
  const [selectedPipelineId, setSelectedPipelineId] = useState('');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loadingPipelines, setLoadingPipelines] = useState(true);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [statusFilter, setStatusFilter] = useState<LeadStatusFilter>('open');
  const [stageFilter, setStageFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);
  const [detailDraft, setDetailDraft] = useState<Partial<Lead>>({});
  const [savingDetail, setSavingDetail] = useState<string | null>(null);
  const [stageSavingId, setStageSavingId] = useState<string | null>(null);
  const [timelines, setTimelines] = useState<Record<string, TimelineEntry[]>>({});
  const [timelineLoadingId, setTimelineLoadingId] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const [showAddModal, setShowAddModal] = useState(false);
  const [leadForm, setLeadForm] = useState<NewLeadInput>(emptyLeadForm);
  const [submittingLead, setSubmittingLead] = useState(false);

  const [showImportModal, setShowImportModal] = useState(false);
  const [importStep, setImportStep] = useState<ImportStep>('paste');
  const [pasteRaw, setPasteRaw] = useState('');
  const [parsedRows, setParsedRows] = useState<NewLeadInput[]>([]);
  const [parsedSkipped, setParsedSkipped] = useState<{ line: string; reason: string }[]>([]);
  const [existingStatuses, setExistingStatuses] = useState<Record<string, LeadExistenceStatus>>({});
  const [importSource, setImportSource] = useState('tower_farm_form');
  const [checkingExisting, setCheckingExisting] = useState(false);
  const [readingFile, setReadingFile] = useState(false);
  const [draggingFile, setDraggingFile] = useState(false);
  const [sheetInfo, setSheetInfo] = useState('');
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<{ created: number; skipped: { line: string; reason: string }[] } | null>(null);

  const scopedBranches = useMemo(() => (
    branchContext.allBranches.filter(branch => branchContext.activeBranchSlugs.includes(branch.slug))
  ), [branchContext.activeBranchSlugs, branchContext.allBranches]);
  const activeBranch = scopedBranches[0] || null;
  const multipleBranchesSelected = scopedBranches.length > 1;
  const selectedPipeline = pipelines.find(pipeline => pipeline.id === selectedPipelineId) || null;

  useEffect(() => {
    let cancelled = false;
    setPipelines([]);
    setSelectedPipelineId('');
    setLeads([]);
    setTimelines({});
    setStageFilter('all');

    if (!activeBranch) {
      setLoadingPipelines(false);
      return () => { cancelled = true; };
    }

    setLoadingPipelines(true);
    fetchPipelines(activeBranch.id)
      .then(data => {
        if (cancelled) return;
        setPipelines(data);
        setSelectedPipelineId(data[0]?.id || '');
      })
      .catch(error => {
        if (cancelled) return;
        console.error('Failed to load lead pipelines:', error);
        addToast('Failed to load lead pipelines.', 'error');
      })
      .finally(() => { if (!cancelled) setLoadingPipelines(false); });

    return () => { cancelled = true; };
  }, [activeBranch?.id, addToast]);

  const loadLeads = useCallback(async () => {
    if (!activeBranch || !selectedPipeline) {
      setLeads([]);
      return;
    }

    setLoadingLeads(true);
    try {
      const data = await fetchLeads(activeBranch.id, {
        status: statusFilter === 'all' ? undefined : statusFilter,
        stage: stageFilter === 'all' ? undefined : stageFilter,
      });
      setLeads(data);
    } catch (error) {
      console.error('Failed to load leads:', error);
      addToast('Failed to load leads.', 'error');
    } finally {
      setLoadingLeads(false);
    }
  }, [activeBranch, addToast, selectedPipeline, stageFilter, statusFilter]);

  useEffect(() => { void loadLeads(); }, [loadLeads, refreshNonce]);

  const filteredLeads = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return leads.filter(lead => {
      if (lead.pipeline_id !== selectedPipelineId) return false;
      if (statusFilter !== 'all' && lead.status !== statusFilter) return false;
      if (stageFilter !== 'all' && lead.stage !== stageFilter) return false;
      if (!needle) return true;
      return `${profileName(lead)} ${lead.profile?.email || ''}`.toLowerCase().includes(needle);
    });
  }, [leads, search, selectedPipelineId, stageFilter, statusFilter]);

  const openAddModal = () => {
    if (!activeBranch || !selectedPipeline) return;
    setLeadForm({ ...emptyLeadForm(), branch_id: activeBranch.id, pipeline_id: selectedPipeline.id });
    setShowAddModal(true);
  };

  const submitLead = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!activeBranch || !selectedPipeline || !leadForm.first_name.trim() || !EMAIL_PATTERN.test(leadForm.email.trim())) return;
    setSubmittingLead(true);
    try {
      const result = await createLead({
        ...leadForm,
        first_name: leadForm.first_name.trim(),
        last_name: leadForm.last_name.trim(),
        email: leadForm.email.trim().toLowerCase(),
        branch_id: activeBranch.id,
        pipeline_id: selectedPipeline.id,
      });
      if ('duplicate' in result) {
        addToast('This contact already has an open lead for this branch.', 'info');
        return;
      }
      addToast('Lead created successfully.', 'success');
      setShowAddModal(false);
      setRefreshNonce(value => value + 1);
    } catch (error) {
      console.error('Failed to create lead:', error);
      addToast(error instanceof Error ? error.message : 'Failed to create lead.', 'error');
    } finally {
      setSubmittingLead(false);
    }
  };

  const changeStage = async (lead: Lead, stage: string) => {
    const previous = lead;
    const optimisticStatus = stage === 'won' ? 'won' : stage === 'lost' ? 'lost' : lead.status;
    setStageSavingId(lead.id);
    setLeads(current => current.map(item => item.id === lead.id ? { ...item, stage, status: optimisticStatus } : item));
    try {
      const updated = await updateLeadStage(lead.id, stage);
      setLeads(current => current.map(item => item.id === lead.id ? { ...updated, profile: lead.profile } : item));
      addToast(`Lead moved to ${stage}.`, 'success');
    } catch (error) {
      console.error('Failed to update lead stage:', error);
      setLeads(current => current.map(item => item.id === lead.id ? previous : item));
      addToast('Could not update the lead stage.', 'error');
    } finally {
      setStageSavingId(null);
    }
  };

  const toggleLeadDetails = (lead: Lead) => {
    if (expandedLeadId === lead.id) {
      setExpandedLeadId(null);
      setDetailDraft({});
      return;
    }
    setExpandedLeadId(lead.id);
    setDetailDraft({ notes: lead.notes, next_action_at: lead.next_action_at });
    setTimelineLoadingId(lead.id);
    fetchLeadTimeline(lead.id, lead.profile_id)
      .then(entries => setTimelines(current => ({ ...current, [lead.id]: entries })))
      .catch(error => {
        console.error('Failed to load lead timeline:', error);
        addToast('Could not load lead activity.', 'error');
      })
      .finally(() => setTimelineLoadingId(current => current === lead.id ? null : current));
  };

  const saveDetail = async (lead: Lead, field: 'notes' | 'next_action_at') => {
    const nextValue = detailDraft[field] ?? null;
    if ((lead[field] ?? null) === nextValue) return;
    setSavingDetail(field);
    try {
      const updated = await updateLead(lead.id, { [field]: nextValue });
      setLeads(current => current.map(item => item.id === lead.id ? { ...updated, profile: lead.profile } : item));
      addToast(field === 'notes' ? 'Lead notes saved.' : 'Next action updated.', 'success');
    } catch (error) {
      console.error('Failed to update lead details:', error);
      setDetailDraft(current => ({ ...current, [field]: lead[field] }));
      addToast('Could not save lead details.', 'error');
    } finally {
      setSavingDetail(null);
    }
  };

  const resetImport = () => {
    setPasteRaw('');
    setParsedRows([]);
    setParsedSkipped([]);
    setExistingStatuses({});
    setImportSource('tower_farm_form');
    setCheckingExisting(false);
    setReadingFile(false);
    setDraggingFile(false);
    setSheetInfo('');
    setImportStep('paste');
    setImportSummary(null);
    setImporting(false);
  };

  const openImportModal = () => {
    resetImport();
    setShowImportModal(true);
  };

  const prepareImportPreview = async (
    parsed: ReturnType<typeof parseLeadRows>,
    nextSheetInfo = ''
  ) => {
    if (!activeBranch) return;
    setParsedRows(parsed.leads);
    setParsedSkipped(parsed.skipped);
    setSheetInfo(nextSheetInfo);
    setExistingStatuses({});
    setImportStep('preview');
    setCheckingExisting(true);
    try {
      const statuses = await checkExistingLeads(
        parsed.leads.map(row => row.email),
        activeBranch.id
      );
      setExistingStatuses(statuses);
    } catch (error) {
      console.error('Failed to check existing leads:', error);
      setExistingStatuses(Object.fromEntries(parsed.leads.map(row => [row.email, 'new' as const])));
      addToast('Could not check for existing leads. The database will still prevent duplicates.', 'info');
    } finally {
      setCheckingExisting(false);
    }
  };

  const previewImport = () => {
    void prepareImportPreview(parseLeadPaste(pasteRaw));
  };

  const readSpreadsheetFile = async (file: File) => {
    setReadingFile(true);
    try {
      const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => reader.result instanceof ArrayBuffer
          ? resolve(reader.result)
          : reject(new Error('Could not read the selected file'));
        reader.onerror = () => reject(reader.error || new Error('Could not read the selected file'));
        reader.readAsArrayBuffer(file);
      });
      const workbook = XLSX.read(buffer);
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) throw new Error('The workbook does not contain any sheets');
      const sheet = workbook.Sheets[sheetName];
      const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        raw: false,
        defval: '',
      }).map(row => row.map(cell => String(cell ?? '').trim()));
      const info = workbook.SheetNames.length > 1
        ? `Read first sheet “${sheetName}” from ${workbook.SheetNames.length} sheets.`
        : `Read sheet “${sheetName}”.`;
      await prepareImportPreview(parseLeadRows(grid), info);
    } catch (error) {
      console.error('Failed to read spreadsheet:', error);
      addToast(error instanceof Error ? error.message : 'Could not read the spreadsheet.', 'error');
    } finally {
      setReadingFile(false);
      setDraggingFile(false);
    }
  };

  const openLeadRows = parsedRows.filter(row => existingStatuses[row.email] === 'open_lead');
  const importableRows = parsedRows.filter(row => existingStatuses[row.email] !== 'open_lead');

  const confirmImport = async () => {
    if (!activeBranch || !selectedPipeline || importableRows.length === 0) return;
    setImporting(true);
    try {
      const result = await createLeadsBulk(importableRows.map(row => ({
        ...row,
        source: importSource,
        branch_id: activeBranch.id,
        pipeline_id: selectedPipeline.id,
      })));
      const previewDuplicates = openLeadRows.map(row => ({
        line: row.email,
        reason: 'already has an open lead',
      }));
      setImportSummary({
        created: result.created,
        skipped: [
          ...parsedSkipped,
          ...previewDuplicates,
          ...result.skipped.map(skip => ({ line: skip.email, reason: skip.reason })),
        ],
      });
      setImportStep('result');
      setRefreshNonce(value => value + 1);
      addToast(`Imported ${result.created} lead${result.created === 1 ? '' : 's'}.`, 'success');
    } catch (error) {
      console.error('Failed to import leads:', error);
      addToast('Lead import failed.', 'error');
    } finally {
      setImporting(false);
    }
  };

  const closeImport = () => {
    setShowImportModal(false);
    resetImport();
  };

  const formEmailValid = EMAIL_PATTERN.test(leadForm.email.trim());

  return (
    <div className="space-y-6 rounded-[2.25rem] bg-[#0A0E27] p-5 text-white shadow-2xl shadow-slate-950/10 lg:p-8">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-cyan-400/10 text-cyan-300 ring-1 ring-cyan-400/20">
            <Target size={27} />
          </div>
          <div>
            <h1 className="text-3xl font-black uppercase tracking-tight text-white">Leads</h1>
            <p className="mt-1 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
              {selectedPipeline?.name || (loadingPipelines ? 'Loading pipeline…' : 'No active pipeline')}
            </p>
            {multipleBranchesSelected && activeBranch && (
              <p className="mt-1 text-[11px] text-cyan-300/70">Single-branch view · showing {activeBranch.name}, the first selected branch.</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {pipelines.length > 0 && (
            <label className="relative">
              <span className="sr-only">Pipeline</span>
              <select
                value={selectedPipelineId}
                onChange={event => { setSelectedPipelineId(event.target.value); setStageFilter('all'); }}
                className="appearance-none rounded-xl border border-white/10 bg-[#10142E] py-3 pl-4 pr-10 text-xs font-bold text-white outline-none transition focus:border-cyan-400/50"
              >
                {pipelines.map(pipeline => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-slate-400" />
            </label>
          )}
          <button
            type="button"
            onClick={openImportModal}
            disabled={!selectedPipeline}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-200 transition hover:border-cyan-400/30 hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <FileSpreadsheet size={16} /> Import from Spreadsheet
          </button>
          <button
            type="button"
            onClick={openAddModal}
            disabled={!selectedPipeline}
            className="flex items-center gap-2 rounded-xl bg-[#00D9FF] px-4 py-3 text-xs font-black uppercase tracking-wider text-[#07101D] shadow-lg shadow-cyan-500/20 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus size={16} /> Add Lead
          </button>
        </div>
      </div>

      {!activeBranch ? (
        <div className="rounded-[2rem] border border-dashed border-white/15 bg-[#10142E] px-6 py-16 text-center">
          <Target className="mx-auto mb-4 text-slate-600" size={36} />
          <h2 className="text-lg font-black text-white">Select a branch to view leads</h2>
          <p className="mx-auto mt-2 max-w-lg text-sm text-slate-400">Leads are single-branch scoped. Choose at least one branch from the global branch selector.</p>
        </div>
      ) : loadingPipelines ? (
        <div className="flex items-center justify-center gap-3 rounded-[2rem] border border-white/10 bg-[#10142E] py-20 text-sm text-slate-400">
          <Loader2 className="animate-spin text-cyan-300" size={20} /> Loading lead pipelines…
        </div>
      ) : pipelines.length === 0 ? (
        <div className="rounded-[2rem] border border-dashed border-amber-400/25 bg-[#10142E] px-6 py-16 text-center">
          <AlertCircle className="mx-auto mb-4 text-amber-300" size={36} />
          <h2 className="text-lg font-black text-white">No pipeline configured for {activeBranch.name}</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-slate-400">A lead pipeline must be seeded for this branch before leads can be managed. Pipeline creation is not available in v1.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-[#10142E] p-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
              {STATUS_FILTERS.map(filter => (
                <button
                  key={filter.value}
                  type="button"
                  onClick={() => setStatusFilter(filter.value)}
                  className={`rounded-full px-4 py-2 text-[10px] font-black uppercase tracking-widest transition ${statusFilter === filter.value ? 'bg-[#00D9FF] text-[#07101D]' : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'}`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="relative">
                <span className="sr-only">Filter by stage</span>
                <select
                  value={stageFilter}
                  onChange={event => setStageFilter(event.target.value)}
                  className="w-full appearance-none rounded-xl border border-white/10 bg-[#0A0E27] py-2.5 pl-4 pr-10 text-xs font-bold text-slate-200 outline-none focus:border-cyan-400/50 sm:w-48"
                >
                  <option value="all">All stages</option>
                  {selectedPipeline?.stages.map(stage => <option key={stage} value={stage}>{stage}</option>)}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-500" />
              </label>
              <label className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
                <input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder="Search name or email"
                  className="w-full rounded-xl border border-white/10 bg-[#0A0E27] py-2.5 pl-10 pr-4 text-xs text-white outline-none placeholder:text-slate-600 focus:border-cyan-400/50 sm:w-64"
                />
              </label>
            </div>
          </div>

          <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-[#10142E] shadow-xl shadow-slate-950/20">
            {loadingLeads ? (
              <div className="flex items-center justify-center gap-3 py-24 text-sm text-slate-400">
                <Loader2 className="animate-spin text-cyan-300" size={20} /> Loading leads…
              </div>
            ) : filteredLeads.length === 0 ? (
              <div className="px-6 py-24 text-center">
                <UserPlus className="mx-auto mb-4 text-slate-600" size={38} />
                <h3 className="text-lg font-black text-white">No leads match these filters</h3>
                <p className="mt-2 text-sm text-slate-400">Adjust the filters, add a lead, or import rows from a spreadsheet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-left">
                  <thead className="border-b border-white/10 bg-white/[0.025] text-[10px] font-black uppercase tracking-[0.18em] text-slate-500">
                    <tr>
                      <th className="px-6 py-4">Name</th>
                      <th className="px-4 py-4">Email</th>
                      <th className="px-4 py-4">Source</th>
                      <th className="px-4 py-4">Stage</th>
                      <th className="px-4 py-4">Next Action</th>
                      <th className="px-4 py-4">Created</th>
                      <th className="px-4 py-4"><span className="sr-only">Expand</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {filteredLeads.map(lead => {
                      const isExpanded = expandedLeadId === lead.id;
                      const tags = profileTags(lead);
                      return (
                        <React.Fragment key={lead.id}>
                          <tr onClick={() => toggleLeadDetails(lead)} className="cursor-pointer transition hover:bg-cyan-400/[0.035]">
                            <td className="px-6 py-5">
                              <div className="flex items-center gap-3">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-400/10 text-xs font-black text-cyan-300">
                                  {(lead.profile?.first_name?.[0] || lead.profile?.email?.[0] || '?').toUpperCase()}
                                </div>
                                <div>
                                  <p className="font-black text-white">{profileName(lead)}</p>
                                  <span className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${STATUS_STYLES[lead.status] || STATUS_STYLES.open}`}>{lead.status}</span>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-5 text-xs text-slate-300">{lead.profile?.email || '—'}</td>
                            <td className="px-4 py-5 text-xs font-bold text-slate-400">{lead.source.replace(/_/g, ' ')}</td>
                            <td className="px-4 py-5" onClick={event => event.stopPropagation()}>
                              <div className="relative w-40">
                                <select
                                  value={lead.stage}
                                  onChange={event => void changeStage(lead, event.target.value)}
                                  disabled={stageSavingId === lead.id}
                                  className="w-full appearance-none rounded-lg border border-cyan-400/15 bg-cyan-400/[0.06] py-2 pl-3 pr-8 text-xs font-bold capitalize text-cyan-200 outline-none focus:border-cyan-400/50 disabled:opacity-50"
                                >
                                  {selectedPipeline?.stages.map(stage => <option key={stage} value={stage}>{stage}</option>)}
                                </select>
                                {stageSavingId === lead.id ? <Loader2 className="pointer-events-none absolute right-2.5 top-2.5 h-3.5 w-3.5 animate-spin text-cyan-300" /> : <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-3.5 w-3.5 text-cyan-300" />}
                              </div>
                            </td>
                            <td className="px-4 py-5 text-xs text-slate-400">{formatDate(lead.next_action_at)}</td>
                            <td className="px-4 py-5 text-xs text-slate-400">{formatDate(lead.created_at)}</td>
                            <td className="px-4 py-5 text-slate-500"><ChevronRight className={`h-4 w-4 transition ${isExpanded ? 'rotate-90 text-cyan-300' : ''}`} /></td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td colSpan={7} className="bg-[#0A0E27]/70 px-6 py-6">
                                <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
                                  <div className="space-y-4">
                                    <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                                      <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-500">Inquiry</p>
                                      <p className="text-sm leading-6 text-slate-200">{lead.inquiry_text || 'No inquiry text provided.'}</p>
                                    </div>
                                    <LeadTimeline entries={timelines[lead.id] || []} loading={timelineLoadingId === lead.id} />
                                    <label className="block rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                                      <span className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                        Notes {savingDetail === 'notes' && <Loader2 className="h-3 w-3 animate-spin text-cyan-300" />}
                                      </span>
                                      <textarea
                                        value={(detailDraft.notes as string | null) ?? ''}
                                        onChange={event => setDetailDraft(current => ({ ...current, notes: event.target.value || null }))}
                                        onBlur={() => void saveDetail(lead, 'notes')}
                                        rows={4}
                                        className="w-full resize-none rounded-xl border border-white/10 bg-[#10142E] p-3 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-400/40"
                                        placeholder="Add internal notes…"
                                      />
                                    </label>
                                  </div>
                                  <div className="space-y-4">
                                    <div className="grid grid-cols-2 gap-3">
                                      <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                                        <CircleDollarSign className="mb-2 text-emerald-300" size={17} />
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Estimated Value</p>
                                        <p className="mt-1 text-sm font-black text-white">{formatMoney(lead.estimated_value)}</p>
                                      </div>
                                      <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                                        <UserPlus className="mb-2 text-cyan-300" size={17} />
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Assigned To</p>
                                        <p className="mt-1 text-sm font-black text-white">{lead.assigned_to || 'Unassigned'}</p>
                                      </div>
                                    </div>
                                    <label className="block rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                                      <span className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                        <Calendar size={13} /> Next Action {savingDetail === 'next_action_at' && <Loader2 className="h-3 w-3 animate-spin text-cyan-300" />}
                                      </span>
                                      <input
                                        type="date"
                                        value={dateInputValue(detailDraft.next_action_at as string | null)}
                                        onChange={event => setDetailDraft(current => ({ ...current, next_action_at: event.target.value ? `${event.target.value}T12:00:00.000Z` : null }))}
                                        onBlur={() => void saveDetail(lead, 'next_action_at')}
                                        className="w-full rounded-xl border border-white/10 bg-[#10142E] p-3 text-sm text-slate-200 outline-none focus:border-cyan-400/40"
                                      />
                                    </label>
                                    <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                                      <p className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500"><Mail size={13} /> Profile Context</p>
                                      <p className="break-all text-xs text-slate-300">{lead.profile?.email || 'No email'}</p>
                                      <div className="mt-3 flex flex-wrap gap-2">
                                        {tags.length > 0 ? tags.map(tag => <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-cyan-400/10 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-cyan-300"><Tag size={10} />{tag}</span>) : <span className="text-[10px] text-slate-500">Tags are not included in the lead response.</span>}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {showAddModal && activeBranch && selectedPipeline && (
        <ModalShell title="Add Lead" subtitle={`${activeBranch.name} · ${selectedPipeline.name}`} icon={UserPlus} onClose={() => !submittingLead && setShowAddModal(false)}>
          <form onSubmit={submitLead} className="space-y-5 p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-xs font-bold text-slate-300">First name *<input autoFocus value={leadForm.first_name} onChange={event => setLeadForm(current => ({ ...current, first_name: event.target.value }))} className="w-full rounded-xl border border-white/10 bg-[#0A0E27] p-3 text-white outline-none focus:border-cyan-400/50" /></label>
              <label className="space-y-2 text-xs font-bold text-slate-300">Last name<input value={leadForm.last_name} onChange={event => setLeadForm(current => ({ ...current, last_name: event.target.value }))} className="w-full rounded-xl border border-white/10 bg-[#0A0E27] p-3 text-white outline-none focus:border-cyan-400/50" /></label>
              <label className="space-y-2 text-xs font-bold text-slate-300">Email *<input type="email" value={leadForm.email} onChange={event => setLeadForm(current => ({ ...current, email: event.target.value }))} className={`w-full rounded-xl border bg-[#0A0E27] p-3 text-white outline-none ${leadForm.email && !formEmailValid ? 'border-rose-400/60' : 'border-white/10 focus:border-cyan-400/50'}`} /></label>
              <label className="space-y-2 text-xs font-bold text-slate-300">Phone<input value={leadForm.phone || ''} onChange={event => setLeadForm(current => ({ ...current, phone: event.target.value }))} className="w-full rounded-xl border border-white/10 bg-[#0A0E27] p-3 text-white outline-none focus:border-cyan-400/50" /></label>
              <label className="space-y-2 text-xs font-bold text-slate-300">Source<select value={leadForm.source} onChange={event => setLeadForm(current => ({ ...current, source: event.target.value }))} className="w-full rounded-xl border border-white/10 bg-[#0A0E27] p-3 text-white outline-none focus:border-cyan-400/50"><option value="manual">Manual</option><option value="tower_farm_form">Tower Farm form</option><option value="referral">Referral</option><option value="other">Other</option></select></label>
              <label className="space-y-2 text-xs font-bold text-slate-300">Estimated value<input type="number" min="0" step="0.01" value={leadForm.estimated_value ?? ''} onChange={event => setLeadForm(current => ({ ...current, estimated_value: event.target.value ? Number(event.target.value) : undefined }))} className="w-full rounded-xl border border-white/10 bg-[#0A0E27] p-3 text-white outline-none focus:border-cyan-400/50" /></label>
            </div>
            <label className="block space-y-2 text-xs font-bold text-slate-300">Inquiry<textarea rows={3} value={leadForm.inquiry_text || ''} onChange={event => setLeadForm(current => ({ ...current, inquiry_text: event.target.value }))} className="w-full resize-none rounded-xl border border-white/10 bg-[#0A0E27] p-3 text-white outline-none focus:border-cyan-400/50" /></label>
            <label className="block space-y-2 text-xs font-bold text-slate-300">Notes<textarea rows={3} value={leadForm.notes || ''} onChange={event => setLeadForm(current => ({ ...current, notes: event.target.value }))} className="w-full resize-none rounded-xl border border-white/10 bg-[#0A0E27] p-3 text-white outline-none focus:border-cyan-400/50" /></label>
            <div className="flex justify-end gap-3 border-t border-white/10 pt-5">
              <button type="button" onClick={() => setShowAddModal(false)} disabled={submittingLead} className="rounded-xl px-4 py-3 text-xs font-black uppercase tracking-wider text-slate-400 hover:bg-white/5">Cancel</button>
              <button type="submit" disabled={submittingLead || !leadForm.first_name.trim() || !formEmailValid} className="flex items-center gap-2 rounded-xl bg-[#00D9FF] px-5 py-3 text-xs font-black uppercase tracking-wider text-[#07101D] disabled:cursor-not-allowed disabled:opacity-40">{submittingLead ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />} Create Lead</button>
            </div>
          </form>
        </ModalShell>
      )}

      {showImportModal && activeBranch && selectedPipeline && (
        <ModalShell title="Import Leads" subtitle={`${activeBranch.name} · ${selectedPipeline.name}`} icon={FileSpreadsheet} onClose={() => !importing && closeImport()}>
          <div className="p-6">
            <div className="mb-6 flex items-center gap-3">
              {['Paste', 'Preview', 'Result'].map((label, index) => {
                const currentIndex = importStep === 'paste' ? 0 : importStep === 'preview' ? 1 : 2;
                const complete = index < currentIndex;
                const active = index === currentIndex;
                return <React.Fragment key={label}><div className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-black ${complete ? 'bg-emerald-400 text-[#07101D]' : active ? 'bg-[#00D9FF] text-[#07101D]' : 'bg-white/5 text-slate-500'}`}>{complete ? <Check size={15} /> : index + 1}</div><span className={`text-[10px] font-black uppercase tracking-widest ${active ? 'text-white' : 'text-slate-500'}`}>{label}</span>{index < 2 && <div className="h-px flex-1 bg-white/10" />}</React.Fragment>;
              })}
            </div>

            {importStep === 'paste' && (
              <div className="space-y-5">
                <div className="rounded-2xl border border-cyan-400/15 bg-cyan-400/[0.04] p-4 text-xs leading-5 text-slate-300">
                  <Upload className="mb-2 text-cyan-300" size={18} />
                  Paste tab- or comma-separated rows, or upload a spreadsheet. Email, name, and phone columns are detected from their contents.
                </div>
                <label
                  className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-8 text-center transition ${draggingFile ? 'border-cyan-300 bg-cyan-400/10' : 'border-white/15 bg-[#0A0E27] hover:border-cyan-400/40 hover:bg-cyan-400/[0.03]'}`}
                  onDragEnter={event => { event.preventDefault(); setDraggingFile(true); }}
                  onDragOver={event => { event.preventDefault(); setDraggingFile(true); }}
                  onDragLeave={event => { event.preventDefault(); setDraggingFile(false); }}
                  onDrop={event => {
                    event.preventDefault();
                    setDraggingFile(false);
                    const file = event.dataTransfer.files[0];
                    if (file) void readSpreadsheetFile(file);
                  }}
                >
                  {readingFile ? <Loader2 className="mb-3 animate-spin text-cyan-300" size={25} /> : <FileSpreadsheet className="mb-3 text-cyan-300" size={25} />}
                  <span className="text-sm font-black text-white">Drop an .xlsx, .xls, or .csv file</span>
                  <span className="mt-1 text-xs text-slate-500">or click to choose a file</span>
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    disabled={readingFile}
                    className="sr-only"
                    onChange={event => {
                      const file = event.target.files?.[0];
                      if (file) void readSpreadsheetFile(file);
                      event.currentTarget.value = '';
                    }}
                  />
                </label>
                <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-slate-600"><div className="h-px flex-1 bg-white/10" />or paste rows<div className="h-px flex-1 bg-white/10" /></div>
                <textarea autoFocus rows={9} value={pasteRaw} onChange={event => setPasteRaw(event.target.value)} placeholder="Paste rows from your spreadsheet (tab or comma separated)…" className="w-full resize-y rounded-2xl border border-white/10 bg-[#0A0E27] p-4 font-mono text-xs leading-6 text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-400/50" />
                <div className="flex justify-end"><button type="button" onClick={previewImport} disabled={!pasteRaw.trim() || readingFile} className="flex items-center gap-2 rounded-xl bg-[#00D9FF] px-5 py-3 text-xs font-black uppercase tracking-wider text-[#07101D] disabled:opacity-40">Preview <ChevronRight size={16} /></button></div>
              </div>
            )}

            {importStep === 'preview' && (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="flex items-center gap-2 text-sm font-black text-white">
                    {checkingExisting && <Loader2 className="animate-spin text-cyan-300" size={15} />}
                    {importableRows.length} ready, {openLeadRows.length} already in pipeline, {parsedSkipped.length} skipped
                  </p>
                  <button type="button" onClick={() => setImportStep('paste')} className="text-xs font-bold text-cyan-300 hover:text-cyan-200">Choose different input</button>
                </div>
                {sheetInfo && <div className="rounded-xl border border-cyan-400/15 bg-cyan-400/[0.04] px-4 py-3 text-xs text-cyan-200">{sheetInfo}</div>}
                <label className="flex max-w-xs flex-col gap-2 text-xs font-bold text-slate-300">
                  Import source
                  <select value={importSource} onChange={event => setImportSource(event.target.value)} className="rounded-xl border border-white/10 bg-[#0A0E27] p-3 text-white outline-none focus:border-cyan-400/50">
                    <option value="tower_farm_form">Tower Farm form</option>
                    <option value="manual">Manual</option>
                    <option value="referral">Referral</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <div className="max-h-80 overflow-auto rounded-2xl border border-white/10">
                  <table className="w-full min-w-[620px] text-left text-xs">
                    <thead className="sticky top-0 bg-[#0A0E27] text-[9px] font-black uppercase tracking-widest text-slate-500"><tr><th className="px-4 py-3">Status</th><th className="px-4 py-3">Name</th><th className="px-4 py-3">Email</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3">Notes</th></tr></thead>
                    <tbody className="divide-y divide-white/[0.06]">
                      {importableRows.map((row, index) => {
                        const known = existingStatuses[row.email] === 'known_profile';
                        return <tr key={`${row.email}-${index}`}><td className="px-4 py-3">{known ? <span className="inline-flex rounded-full border border-cyan-400/25 bg-cyan-400/10 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-cyan-300">Known contact</span> : <span className="inline-flex items-center gap-1 text-emerald-300"><Check size={13} /> Ready</span>}</td><td className="px-4 py-3 text-slate-200">{[row.first_name, row.last_name].filter(Boolean).join(' ') || '—'}</td><td className="px-4 py-3 text-slate-300">{row.email}</td><td className="px-4 py-3 text-slate-400">{row.phone || '—'}</td><td className="max-w-64 truncate px-4 py-3 text-slate-500" title={row.notes}>{row.notes || '—'}</td></tr>;
                      })}
                    </tbody>
                  </table>
                </div>
                {parsedRows.length === 0 && <div className="rounded-2xl border border-dashed border-white/10 py-10 text-center text-sm text-slate-500">No valid email rows were found.</div>}
                {openLeadRows.length > 0 && <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.04]"><div className="border-b border-amber-400/15 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-amber-300">Already open leads · excluded</div><div className="divide-y divide-white/[0.06]">{openLeadRows.map(row => <div key={row.email} className="flex items-center justify-between gap-4 px-4 py-3 text-xs"><span className="text-slate-300">{row.email}</span><span className="rounded-full bg-amber-400/10 px-2 py-1 text-[9px] font-black uppercase tracking-wider text-amber-300">Already open lead</span></div>)}</div></div>}
                {parsedSkipped.length > 0 && <div className="rounded-2xl border border-white/10"><div className="border-b border-white/10 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Skipped while parsing</div><div className="max-h-44 divide-y divide-white/[0.06] overflow-auto">{parsedSkipped.map((skip, index) => <div key={`${skip.line}-${index}`} className="flex items-start justify-between gap-4 px-4 py-3 text-xs"><span className="min-w-0 break-all text-slate-400">{skip.line || 'Empty row'}</span><span className="shrink-0 text-right text-rose-300">{skip.reason}</span></div>)}</div></div>}
                <div className="flex justify-end"><button type="button" onClick={confirmImport} disabled={importing || checkingExisting || importableRows.length === 0} className="flex items-center gap-2 rounded-xl bg-[#00D9FF] px-5 py-3 text-xs font-black uppercase tracking-wider text-[#07101D] disabled:opacity-40">{importing ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />} Import {importableRows.length} Lead{importableRows.length === 1 ? '' : 's'}</button></div>
              </div>
            )}

            {importStep === 'result' && importSummary && (
              <div className="space-y-5">
                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.06] p-6 text-center"><div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-400 text-[#07101D]"><Check size={22} /></div><h3 className="text-xl font-black text-white">{importSummary.created} lead{importSummary.created === 1 ? '' : 's'} created</h3><p className="mt-1 text-sm text-slate-400">{importSummary.skipped.length} row{importSummary.skipped.length === 1 ? '' : 's'} skipped</p></div>
                {importSummary.skipped.length > 0 && <div className="rounded-2xl border border-white/10"><div className="border-b border-white/10 px-4 py-3 text-[10px] font-black uppercase tracking-widest text-slate-500">Skipped rows</div><div className="divide-y divide-white/[0.06]">{importSummary.skipped.map((skip, index) => <div key={`${skip.line}-${index}`} className="flex items-start justify-between gap-4 px-4 py-3 text-xs"><span className="min-w-0 break-all text-slate-300">{skip.line || 'Missing row'}</span><span className="shrink-0 text-right text-rose-300">{skip.reason}</span></div>)}</div></div>}
                <div className="flex justify-end"><button type="button" onClick={closeImport} className="rounded-xl bg-[#00D9FF] px-5 py-3 text-xs font-black uppercase tracking-wider text-[#07101D]">Done</button></div>
              </div>
            )}
          </div>
        </ModalShell>
      )}
    </div>
  );
};

export default Leads;
