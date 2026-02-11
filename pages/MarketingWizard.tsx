import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Wand2,
  Settings2,
  Search,
  FileText,
  Mail,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Target,
  Megaphone,
  Eye,
  Plus,
  X,
  Trash2,
  Loader2,
} from 'lucide-react';
import { MarketingBrand, MarketingWizardState, BranchContext } from '../types';
import { marketingBrandService } from '../services/marketingBrandService';
import { formatBranchName } from '../utils';

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STEPS = [
  { id: 'setup', title: 'Setup', icon: Settings2, desc: 'Brand & Objective' },
  { id: 'research', title: 'Research', icon: Search, desc: 'Positioning & Analysis' },
  { id: 'content', title: 'Content', icon: FileText, desc: 'Lead Magnet & Ads' },
  { id: 'email', title: 'Email', icon: Mail, desc: 'Nurture Sequence' },
  { id: 'review', title: 'Review', icon: CheckCircle2, desc: 'Export & Deploy' },
];

const DRAFT_KEY = 'trellis_marketing_wizard_draft';

const OBJECTIVES: {
  value: MarketingWizardState['objective'];
  label: string;
  icon: React.FC<{ size?: number; className?: string }>;
  description: string;
}[] = [
  {
    value: 'lead_generation',
    label: 'Lead Generation',
    icon: Target,
    description: 'Capture and nurture new leads with a magnet, ads, and an email sequence.',
  },
  {
    value: 'product_launch',
    label: 'Product Launch',
    icon: Megaphone,
    description: 'Build buzz and drive first sales for a new product or service.',
  },
  {
    value: 'awareness',
    label: 'Brand Awareness',
    icon: Eye,
    description: 'Grow recognition and trust within your target market.',
  },
];

const DEFAULT_SEGMENTS = [
  'Solo Founders',
  'Small Business Owners',
  'Marketing Agencies',
  'E-commerce Sellers',
  'Content Creators',
  'Enterprise Teams',
];

const EMPTY_WIZARD: MarketingWizardState = {
  brand_id: '',
  objective: 'lead_generation',
  product_description: '',
  target_segments: [],
  wizard_step: 0,
  last_saved_at: new Date().toISOString(),
};

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface MarketingWizardProps {
  branchContext: BranchContext;
  profiles: any[];
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  apiKeys: any;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function MarketingWizard({
  branchContext,
  addToast,
}: MarketingWizardProps) {
  /* ---- core state ---- */
  const [currentStep, setCurrentStep] = useState(0);
  const [wizardState, setWizardState] = useState<MarketingWizardState>(EMPTY_WIZARD);
  const [campaignName, setCampaignName] = useState('');

  /* ---- brand state ---- */
  const [availableBrands, setAvailableBrands] = useState<MarketingBrand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<MarketingBrand | null>(null);
  const [isLoadingBrands, setIsLoadingBrands] = useState(true);

  /* ---- segment input ---- */
  const [customSegmentInput, setCustomSegmentInput] = useState('');

  /* ---- draft restored flag (prevents double-toast) ---- */
  const [draftRestored, setDraftRestored] = useState(false);
  const hasHydrated = useRef(false);

  /* ---- branch helpers ---- */

  const branchMap = useMemo(() => {
    return branchContext.allBranches.reduce(
      (acc, b) => {
        acc[b.id] = b;
        acc[b.slug] = b;
        return acc;
      },
      {} as Record<string, (typeof branchContext.allBranches)[number]>,
    );
  }, [branchContext.allBranches]);

  const activeBranchIds = useMemo(() => {
    if (branchContext.isAllSelected)
      return branchContext.allBranches.map((b) => b.id);
    return branchContext.allBranches
      .filter((b) => branchContext.activeBranchSlugs.includes(b.slug))
      .map((b) => b.id);
  }, [branchContext.isAllSelected, branchContext.allBranches, branchContext.activeBranchSlugs]);

  /* ---- filtered brands ---- */

  const filteredBrands = useMemo(() => {
    return availableBrands.filter((b) => activeBranchIds.includes(b.branch_id));
  }, [availableBrands, activeBranchIds]);

  /* ---- data loading ---- */

  const loadBrands = useCallback(async () => {
    setIsLoadingBrands(true);
    try {
      const all = await marketingBrandService.getAllBrands();
      setAvailableBrands(all);
    } catch (err) {
      console.error('Failed to load brands', err);
      addToast('Failed to load brand profiles.', 'error');
    } finally {
      setIsLoadingBrands(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadBrands();
  }, [loadBrands]);

  /* ---- localStorage restore ---- */

  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) {
        hasHydrated.current = true;
        return;
      }
      const draft = JSON.parse(raw);
      if (draft.wizardState) setWizardState(draft.wizardState);
      if (draft.campaignName) setCampaignName(draft.campaignName);
      if (typeof draft.currentStep === 'number') setCurrentStep(draft.currentStep);
      setDraftRestored(true);
      hasHydrated.current = true;
    } catch {
      /* ignore corrupt data */
      hasHydrated.current = true;
    }
  }, []);

  /* show toast after brands load so we can also restore selectedBrand */
  useEffect(() => {
    if (!draftRestored || isLoadingBrands) return;
    if (wizardState.brand_id) {
      const match = availableBrands.find((b) => b.id === wizardState.brand_id);
      if (match) setSelectedBrand(match);
    }
    addToast('Draft restored.', 'info');
    setDraftRestored(false);
  }, [draftRestored, isLoadingBrands, availableBrands, wizardState.brand_id, addToast]);

  /* ---- localStorage auto-save ---- */

  useEffect(() => {
    if (!hasHydrated.current) return;
    const payload = { wizardState, campaignName, currentStep };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
  }, [wizardState, campaignName, currentStep]);

  /* ---- mutations ---- */

  const updateWizard = (patch: Partial<MarketingWizardState>) => {
    setWizardState((prev) => ({
      ...prev,
      ...patch,
      last_saved_at: new Date().toISOString(),
    }));
  };

  const selectBrand = (brand: MarketingBrand) => {
    setSelectedBrand(brand);
    updateWizard({ brand_id: brand.id });
  };

  const clearDraft = () => {
    setWizardState(EMPTY_WIZARD);
    setCampaignName('');
    setCurrentStep(0);
    setSelectedBrand(null);
    setCustomSegmentInput('');
    localStorage.removeItem(DRAFT_KEY);
    addToast('Draft cleared.', 'info');
  };

  const toggleSegment = (segment: string) => {
    setWizardState((prev) => {
      const exists = prev.target_segments.includes(segment);
      return {
        ...prev,
        target_segments: exists
          ? prev.target_segments.filter((s) => s !== segment)
          : [...prev.target_segments, segment],
        last_saved_at: new Date().toISOString(),
      };
    });
  };

  const addCustomSegment = () => {
    const trimmed = customSegmentInput.trim();
    if (!trimmed) return;
    if (!wizardState.target_segments.includes(trimmed)) {
      toggleSegment(trimmed);
    }
    setCustomSegmentInput('');
  };

  /* ---- navigation guards ---- */

  const canAdvance = (step: number): boolean => {
    if (step === 0) {
      return !!wizardState.brand_id && !!wizardState.product_description.trim();
    }
    return true;
  };

  const canNavigateTo = (idx: number): boolean => {
    if (idx <= currentStep) return true;
    /* can only go forward one step at a time, and only if current step is valid */
    if (idx === currentStep + 1) return canAdvance(currentStep);
    return false;
  };

  /* ---- branch display helpers ---- */

  const getBranchLabel = (branchId: string) => {
    const branch = branchMap[branchId];
    return branch ? formatBranchName(branch.slug) : branchId;
  };

  const getBranchColor = (branchId: string) => {
    return branchMap[branchId]?.primary_color ?? '#64748b';
  };

  /* ================================================================ */
  /*  Step Renderers                                                   */
  /* ================================================================ */

  const renderSetup = () => (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Campaign Name */}
      <div>
        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block">
          Campaign Name
        </label>
        <input
          value={campaignName}
          onChange={(e) => setCampaignName(e.target.value)}
          placeholder="e.g. Q1 Lead Gen — Organic Growers"
          className="w-full px-5 py-4 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition shadow-sm"
        />
      </div>

      {/* Brand Selector */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">
            Brand Profile *
          </label>
          <button
            onClick={() => {
              /* navigate to brand profiles page — parent controls routing */
              addToast('Navigate to Brand Profiles to create a new brand.', 'info');
            }}
            className="flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-600 hover:text-emerald-700 transition"
          >
            <Plus size={12} />
            Create New
          </button>
        </div>

        {isLoadingBrands ? (
          <div className="flex items-center justify-center py-8 bg-white rounded-2xl border border-slate-200">
            <Loader2 size={20} className="text-emerald-600 animate-spin" />
          </div>
        ) : filteredBrands.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
            <p className="text-sm text-slate-500 font-medium">
              No brand profiles found for active branches.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredBrands.map((brand) => {
              const isSelected = selectedBrand?.id === brand.id;
              return (
                <button
                  key={brand.id}
                  onClick={() => selectBrand(brand)}
                  className={`text-left p-5 rounded-2xl border-2 transition-all ${
                    isSelected
                      ? 'border-emerald-500 bg-emerald-50/50 shadow-lg shadow-emerald-500/10'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div
                      className="w-3.5 h-3.5 rounded-full shrink-0"
                      style={{
                        backgroundColor: brand.primary_color,
                        boxShadow: `0 0 0 2px white, 0 0 0 3px ${brand.primary_color}`,
                      }}
                    />
                    <span className="text-sm font-black text-slate-800 truncate">
                      {brand.name}
                    </span>
                  </div>
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider mb-2"
                    style={{
                      backgroundColor: getBranchColor(brand.branch_id) + '18',
                      color: getBranchColor(brand.branch_id),
                    }}
                  >
                    {getBranchLabel(brand.branch_id)}
                  </span>
                  {brand.industry && (
                    <p className="text-xs text-slate-500 font-medium truncate">
                      {brand.industry}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Brand Summary Card */}
        {selectedBrand && (
          <div className="mt-4 p-6 bg-white rounded-2xl border border-emerald-200 shadow-sm animate-in fade-in duration-200">
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-4 h-4 rounded-full"
                style={{
                  backgroundColor: selectedBrand.primary_color,
                  boxShadow: `0 0 0 2px white, 0 0 0 4px ${selectedBrand.primary_color}`,
                }}
              />
              <h4 className="text-base font-black text-slate-800">
                {selectedBrand.name}
              </h4>
            </div>
            <div className="grid grid-cols-2 gap-4 text-xs">
              {selectedBrand.industry && (
                <div>
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-0.5">
                    Industry
                  </span>
                  <span className="font-bold text-slate-700">{selectedBrand.industry}</span>
                </div>
              )}
              {selectedBrand.tone && (
                <div>
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-0.5">
                    Tone
                  </span>
                  <span className="font-bold text-slate-700">{selectedBrand.tone}</span>
                </div>
              )}
              {selectedBrand.value_proposition && (
                <div className="col-span-2">
                  <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-0.5">
                    Value Proposition
                  </span>
                  <span className="font-bold text-slate-700">{selectedBrand.value_proposition}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Campaign Objective */}
      <div>
        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3 block">
          Campaign Objective *
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {OBJECTIVES.map((obj) => {
            const isSelected = wizardState.objective === obj.value;
            return (
              <button
                key={obj.value}
                onClick={() => updateWizard({ objective: obj.value })}
                className={`text-left p-6 rounded-2xl border-2 transition-all ${
                  isSelected
                    ? 'border-emerald-500 bg-emerald-50/50 shadow-lg shadow-emerald-500/10'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm'
                }`}
              >
                <div
                  className={`w-11 h-11 rounded-xl flex items-center justify-center mb-3 ${
                    isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  <obj.icon size={22} />
                </div>
                <p className="text-sm font-black text-slate-800 mb-1">{obj.label}</p>
                <p className="text-xs text-slate-500 leading-relaxed">{obj.description}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Product / Service Description */}
      <div>
        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-2 block">
          Product / Service Description *
        </label>
        <textarea
          value={wizardState.product_description}
          onChange={(e) => updateWizard({ product_description: e.target.value })}
          rows={4}
          placeholder="Describe what you're marketing..."
          className="w-full px-5 py-4 bg-white border border-slate-200 rounded-2xl text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition shadow-sm resize-none"
        />
      </div>

      {/* Target Segments */}
      <div>
        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3 block">
          Target Segments
        </label>
        <div className="flex flex-wrap gap-2 mb-3">
          {DEFAULT_SEGMENTS.map((seg) => {
            const isActive = wizardState.target_segments.includes(seg);
            return (
              <button
                key={seg}
                onClick={() => toggleSegment(seg)}
                className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                    : 'bg-white text-slate-600 border border-slate-200 hover:border-emerald-300'
                }`}
              >
                {seg}
              </button>
            );
          })}
          {/* custom segments not in defaults */}
          {wizardState.target_segments
            .filter((s) => !DEFAULT_SEGMENTS.includes(s))
            .map((seg) => (
              <button
                key={seg}
                onClick={() => toggleSegment(seg)}
                className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-emerald-600 text-white shadow-md shadow-emerald-600/20 flex items-center gap-1.5 transition-all"
              >
                {seg}
                <X size={12} />
              </button>
            ))}
        </div>
        <div className="flex gap-2">
          <input
            value={customSegmentInput}
            onChange={(e) => setCustomSegmentInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCustomSegment()}
            placeholder="Add custom segment…"
            className="flex-1 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 transition"
          />
          <button
            onClick={addCustomSegment}
            disabled={!customSegmentInput.trim()}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-black uppercase tracking-widest transition disabled:opacity-40"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>
    </div>
  );

  const renderPlaceholder = (stepIdx: number) => {
    const step = STEPS[stepIdx];
    const descriptions: Record<string, string> = {
      research:
        'AI-powered competitive analysis, market positioning statement, and unique differentiators will be generated here.',
      content:
        'Lead magnet outline, full content generation, and multi-platform ad copy bundles will be created here.',
      email:
        'A complete nurture email sequence with subject lines, preview text, and body content will be composed here.',
      review:
        'Final review of all generated assets, export options, and campaign deployment controls will live here.',
    };

    return (
      <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
        <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-16 text-center">
          <div className="w-20 h-20 bg-emerald-50 rounded-[1.5rem] flex items-center justify-center mx-auto mb-6">
            <Sparkles size={36} className="text-emerald-500" />
          </div>
          <h3 className="text-lg font-black text-slate-800 mb-2">
            {step.title} — Coming in Sprint 2
          </h3>
          <p className="text-sm text-slate-500 max-w-lg mx-auto leading-relaxed">
            {descriptions[step.id] ?? ''}
          </p>
        </div>
      </div>
    );
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return renderSetup();
      case 1:
      case 2:
      case 3:
      case 4:
        return renderPlaceholder(currentStep);
      default:
        return null;
    }
  };

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

  return (
    <div className="space-y-12 pb-20">
      {/* ---- Header ---- */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
            <Wand2 size={28} className="text-emerald-600" />
            Marketing Campaign Generator
          </h2>
          <p className="text-sm text-slate-500 mt-1 font-medium">
            AI-powered campaign creation — from positioning to deployment
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={clearDraft}
            className="flex items-center gap-2 px-5 py-2.5 text-xs font-black uppercase tracking-widest text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition"
          >
            <Trash2 size={14} />
            Clear Draft
          </button>
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-100 px-4 py-2.5 rounded-xl">
            Step {currentStep + 1} of {STEPS.length}
          </span>
        </div>
      </div>

      {/* ---- Progress Bar ---- */}
      <div className="flex justify-between items-start relative px-4">
        {/* Background track */}
        <div className="absolute top-6 left-10 right-10 h-1 bg-slate-100 -z-10 rounded-full">
          <div
            className="h-full bg-emerald-500 transition-all duration-700 rounded-full"
            style={{ width: `${(currentStep / (STEPS.length - 1)) * 100}%` }}
          />
        </div>

        {STEPS.map((step, idx) => {
          const isActive = idx === currentStep;
          const isCompleted = idx < currentStep;
          const canNav = canNavigateTo(idx);

          return (
            <div
              key={step.id}
              className={`flex flex-col items-center group ${
                canNav ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'
              }`}
              onClick={() => canNav && setCurrentStep(idx)}
            >
              <div
                className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500 border-4 shadow-xl ${
                  isActive
                    ? 'bg-slate-900 text-white border-emerald-500 scale-110'
                    : isCompleted
                      ? 'bg-emerald-600 text-white border-white'
                      : 'bg-white text-slate-300 border-slate-100'
                }`}
              >
                {isCompleted ? <CheckCircle2 size={24} /> : <step.icon size={24} />}
              </div>
              <div className="mt-4 text-center">
                <p
                  className={`text-[9px] font-black uppercase tracking-[0.2em] transition-colors ${
                    isActive ? 'text-slate-900' : 'text-slate-400'
                  }`}
                >
                  {step.title}
                </p>
                <p className="text-[9px] text-slate-400 mt-0.5 hidden sm:block">
                  {step.desc}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* ---- Step Content ---- */}
      <div className="min-h-[500px]">{renderStep()}</div>

      {/* ---- Footer Navigation ---- */}
      <div className="flex justify-between items-center pt-10 border-t border-slate-200">
        <button
          onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
          disabled={currentStep === 0}
          className="px-8 py-4 flex items-center space-x-3 text-slate-500 font-black text-xs uppercase tracking-widest hover:text-slate-800 transition disabled:opacity-0 group"
        >
          <ChevronLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
          <span>Previous Step</span>
        </button>

        {currentStep < STEPS.length - 1 ? (
          <button
            onClick={() => setCurrentStep(Math.min(STEPS.length - 1, currentStep + 1))}
            disabled={!canAdvance(currentStep)}
            className="px-10 py-5 bg-emerald-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center space-x-3 shadow-xl hover:bg-emerald-700 transition disabled:opacity-50 group"
          >
            <span>{currentStep === 0 ? 'Next: Research' : 'Continue'}</span>
            <ChevronRight
              size={20}
              className="group-hover:translate-x-1 transition-transform"
            />
          </button>
        ) : (
          <button
            disabled
            className="px-12 py-5 bg-slate-900 text-white rounded-[2rem] font-black text-xs uppercase tracking-widest shadow-2xl shadow-slate-900/40 flex items-center space-x-4 disabled:opacity-50"
          >
            <Sparkles size={20} className="text-emerald-400" />
            <span>Deploy Campaign</span>
          </button>
        )}
      </div>
    </div>
  );
}
