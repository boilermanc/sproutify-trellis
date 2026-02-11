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
  ChevronDown,
  ChevronUp,
  Sparkles,
  Target,
  Megaphone,
  Eye,
  Plus,
  X,
  Trash2,
  Loader2,
  Lightbulb,
  Palette,
  Rocket,
  ArrowRight,
  AlertTriangle,
  Shield,
  TrendingUp,
  RefreshCw,
  BookOpen,
  Copy,
  Clock,
  Download,
  Save,
  FileDown,
  XCircle,
} from 'lucide-react';
import { MarketingBrand, MarketingWizardState, BranchContext, ApiKeyConfig } from '../types';
import { marketingBrandService } from '../services/marketingBrandService';
import { marketingGenerationService } from '../services/marketingGenerationService';
import { supabase } from '../lib/supabase';
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
const ONBOARDED_KEY = 'trellis_marketing_wizard_onboarded';

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

const ONBOARDING_STEPS = [
  {
    num: 1,
    title: 'Create a Brand',
    icon: Palette,
    description: 'Set up a brand profile with your business name, voice, audience, and competitors.',
  },
  {
    num: 2,
    title: 'Define Your Campaign',
    icon: Target,
    description: 'Name your campaign, pick an objective, and describe what you\'re marketing.',
  },
  {
    num: 3,
    title: 'AI Generates Everything',
    icon: Sparkles,
    description: 'Trellis AI will create positioning, content, ad copy, and email sequences for your brand.',
  },
  {
    num: 4,
    title: 'Review & Deploy',
    icon: Rocket,
    description: 'Edit anything, export the bundle, or push emails live through your existing pipeline.',
  },
];

const AD_PLATFORM_LABELS: Record<string, string> = {
  google_search: 'Google Search',
  linkedin: 'LinkedIn',
  meta: 'Meta (Facebook/Instagram)',
  x: 'X (Twitter)',
};

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface MarketingWizardProps {
  branchContext: BranchContext;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  apiKeys: ApiKeyConfig;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function MarketingWizard({
  branchContext,
  addToast,
  apiKeys,
}: MarketingWizardProps) {
  /* ---- core state ---- */
  const [currentStep, setCurrentStep] = useState(0);
  const [wizardState, setWizardState] = useState<MarketingWizardState>(EMPTY_WIZARD);
  const [campaignName, setCampaignName] = useState('');

  /* ---- brand state ---- */
  const [availableBrands, setAvailableBrands] = useState<MarketingBrand[]>([]);
  const [selectedBrand, setSelectedBrand] = useState<MarketingBrand | null>(null);
  const [isLoadingBrands, setIsLoadingBrands] = useState(true);

  /* ---- onboarding state ---- */
  const [showOnboarding, setShowOnboarding] = useState(() => {
    return !localStorage.getItem(ONBOARDED_KEY);
  });

  /* ---- generation state ---- */
  const [isGenerating, setIsGenerating] = useState(false);
  const [stepErrors, setStepErrors] = useState<Record<number, string | null>>({});
  const [isGeneratingOutline, setIsGeneratingOutline] = useState(false);
  const [isGeneratingContent, setIsGeneratingContent] = useState(false);
  const [isGeneratingAds, setIsGeneratingAds] = useState(false);
  const [contentProgress, setContentProgress] = useState('');

  /* ---- content UI state ---- */
  const [contentExpanded, setContentExpanded] = useState(false);

  /* ---- email UI state ---- */
  const [isGeneratingEmails, setIsGeneratingEmails] = useState(false);
  const [expandedEmail, setExpandedEmail] = useState<number | null>(null);

  /* ---- segment input ---- */
  const [customSegmentInput, setCustomSegmentInput] = useState('');

  /* ---- export state ---- */
  const [isSaving, setIsSaving] = useState(false);

  /* ---- draft restored flag (prevents double-toast) ---- */
  const [draftRestored, setDraftRestored] = useState(false);
  const hasHydrated = useRef(false);

  /* ---- error helper ---- */

  const setStepError = (step: number, error: string | null) => {
    setStepErrors((prev) => ({ ...prev, [step]: error }));
  };

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
    setStepErrors({});
    localStorage.removeItem(DRAFT_KEY);
    addToast('Draft cleared.', 'info');
  };

  const dismissOnboarding = () => {
    setShowOnboarding(false);
    localStorage.setItem(ONBOARDED_KEY, 'true');
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

  /* ---- export handlers ---- */

  const handleExportJSON = () => {
    const exportData = {
      campaign_name: campaignName,
      brand: selectedBrand ? { name: selectedBrand.name, industry: selectedBrand.industry, tone: selectedBrand.tone } : null,
      objective: wizardState.objective,
      product_description: wizardState.product_description,
      target_segments: wizardState.target_segments,
      positioning: wizardState.positioning,
      lead_magnet: wizardState.lead_magnet ? {
        title: wizardState.lead_magnet.title,
        subtitle: wizardState.lead_magnet.subtitle,
        type: wizardState.lead_magnet.type,
        outline: wizardState.lead_magnet.outline,
        content_markdown: wizardState.lead_magnet.content_markdown,
      } : null,
      ad_copy: wizardState.ad_copy,
      email_sequence: wizardState.email_sequence,
      generated_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${campaignName || 'trellis-campaign'}-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    addToast('Campaign exported as JSON', 'success');
  };

  const handleExportMarkdown = () => {
    const lines: string[] = [];
    lines.push(`# ${campaignName || 'Marketing Campaign'}`);
    lines.push(`*Generated by Trellis AI on ${new Date().toLocaleDateString()}*\n`);

    if (wizardState.positioning) {
      lines.push(`## Positioning`);
      lines.push(`> ${wizardState.positioning.statement}\n`);
      lines.push(`### Differentiators`);
      wizardState.positioning.differentiators.forEach(d => lines.push(`- ${d}`));
      lines.push('');
      lines.push(`### Market Gap`);
      lines.push(wizardState.positioning.market_gap + '\n');
      lines.push(`### Unique Angle`);
      lines.push(wizardState.positioning.unique_angle + '\n');
      if (wizardState.positioning.competitive_analysis?.length) {
        lines.push(`### Competitive Analysis`);
        wizardState.positioning.competitive_analysis.forEach(comp => {
          lines.push(`#### ${comp.name}`);
          lines.push(`*${comp.positioning}*`);
          lines.push(`**Strengths:** ${comp.strengths.join(', ')}`);
          lines.push(`**Weaknesses:** ${comp.weaknesses.join(', ')}\n`);
        });
      }
    }

    if (wizardState.lead_magnet) {
      lines.push(`## Lead Magnet: ${wizardState.lead_magnet.title}`);
      lines.push(`*${wizardState.lead_magnet.subtitle}*\n`);
      if (wizardState.lead_magnet.content_markdown) {
        lines.push(wizardState.lead_magnet.content_markdown);
      } else {
        lines.push(`### Outline`);
        wizardState.lead_magnet.outline.forEach((ch, i) => {
          lines.push(`${i + 1}. **${ch.title}** — ${ch.description}`);
        });
      }
      lines.push('');
    }

    if (wizardState.ad_copy) {
      lines.push(`## Ad Copy\n`);
      Object.entries(wizardState.ad_copy).forEach(([platform, variations]) => {
        if (Array.isArray(variations) && variations.length > 0) {
          lines.push(`### ${AD_PLATFORM_LABELS[platform] || platform}`);
          variations.forEach((v: any, i: number) => {
            lines.push(`**Variation ${i + 1}:** ${v.headline}`);
            lines.push(v.body);
            lines.push(`CTA: ${v.cta}\n`);
          });
        }
      });
    }

    if (wizardState.email_sequence) {
      lines.push(`## Email Nurture Sequence\n`);
      lines.push(`*Strategy: ${wizardState.email_sequence.strategy_notes}*\n`);
      wizardState.email_sequence.emails.forEach(email => {
        lines.push(`### Email ${email.sequence_number} — Day ${email.delay_days}`);
        lines.push(`**Subject:** ${email.subject}`);
        lines.push(`**Preview:** ${email.preview_text}`);
        lines.push(email.body_markdown);
        lines.push(`**CTA:** ${email.cta_text}\n`);
      });
    }

    const content = lines.join('\n');
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${campaignName || 'trellis-campaign'}-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    addToast('Campaign exported as Markdown', 'success');
  };

  const handleSaveCampaign = async () => {
    if (!selectedBrand) return;
    setIsSaving(true);
    try {
      const { error } = await supabase.from('campaigns').insert({
        name: campaignName || 'AI Generated Campaign',
        campaign_type: 'marketing_wizard',
        status: 'draft',
        query_definition: {
          wizard_state: wizardState,
          brand_id: selectedBrand.id,
          brand_name: selectedBrand.name,
        },
      });
      if (error) throw error;
      addToast('Campaign saved to Trellis!', 'success');
    } catch (err: any) {
      addToast(err.message || 'Failed to save campaign', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  /* ---- generation handlers ---- */

  const handleGeneratePositioning = async () => {
    if (!selectedBrand || !wizardState.product_description) return;
    setIsGenerating(true);
    setStepError(1, null);
    try {
      const result = await marketingGenerationService.generatePositioning(
        selectedBrand,
        wizardState.product_description,
        selectedBrand.competitors || [],
        wizardState.target_segments,
        apiKeys,
      );
      updateWizard({ positioning: result });
      addToast('Positioning analysis generated!', 'success');
    } catch (err: any) {
      setStepError(1, err.message || 'Failed to generate positioning');
      addToast(err.message || 'Generation failed', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateOutline = async () => {
    if (!selectedBrand || !wizardState.positioning) return;
    setIsGeneratingOutline(true);
    setStepError(2, null);
    setContentExpanded(false);
    try {
      const result = await marketingGenerationService.generateLeadMagnetOutline(
        selectedBrand,
        wizardState.positioning,
        wizardState.target_segments,
        wizardState.objective,
        apiKeys,
      );
      updateWizard({ lead_magnet: result });
      addToast('Lead magnet outline generated!', 'success');
    } catch (err: any) {
      setStepError(2, err.message || 'Failed to generate outline');
      addToast(err.message || 'Outline generation failed', 'error');
    } finally {
      setIsGeneratingOutline(false);
    }
  };

  const handleGenerateFullContent = async () => {
    if (!selectedBrand || !wizardState.lead_magnet) return;
    setIsGeneratingContent(true);
    setStepError(2, null);
    setContentProgress('Starting content generation...');
    try {
      const outline = wizardState.lead_magnet;
      setContentProgress(`Generating ${outline.outline.length} chapters...`);
      const fullContent = await marketingGenerationService.generateLeadMagnetContent(
        selectedBrand,
        outline,
        apiKeys,
      );
      updateWizard({
        lead_magnet: { ...outline, content_markdown: fullContent },
      });
      addToast('Full lead magnet content generated!', 'success');
    } catch (err: any) {
      setStepError(2, err.message || 'Failed to generate content');
      addToast(err.message || 'Content generation failed', 'error');
    } finally {
      setIsGeneratingContent(false);
      setContentProgress('');
    }
  };

  const handleGenerateAdCopy = async () => {
    if (!selectedBrand || !wizardState.positioning) return;
    setIsGeneratingAds(true);
    setStepError(2, null);
    try {
      const result = await marketingGenerationService.generateAdCopy(
        selectedBrand,
        wizardState.positioning,
        wizardState.product_description,
        wizardState.target_segments,
        Object.keys(AD_PLATFORM_LABELS),
        apiKeys,
      );
      updateWizard({ ad_copy: result });
      addToast('Ad copy generated!', 'success');
    } catch (err: any) {
      setStepError(2, err.message || 'Failed to generate ad copy');
      addToast(err.message || 'Ad copy generation failed', 'error');
    } finally {
      setIsGeneratingAds(false);
    }
  };

  const handleGenerateEmails = async () => {
    if (!selectedBrand || !wizardState.positioning || !wizardState.lead_magnet) return;
    setIsGeneratingEmails(true);
    setStepError(3, null);
    try {
      const result = await marketingGenerationService.generateEmailSequence(
        selectedBrand,
        wizardState.positioning,
        wizardState.lead_magnet,
        wizardState.product_description,
        wizardState.target_segments,
        wizardState.objective,
        apiKeys,
      );
      updateWizard({ email_sequence: result });
      addToast('Email nurture sequence generated!', 'success');
    } catch (err: any) {
      setStepError(3, err.message || 'Failed to generate email sequence');
      addToast(err.message || 'Email generation failed', 'error');
    } finally {
      setIsGeneratingEmails(false);
    }
  };

  /* ---- navigation guards ---- */

  const canAdvance = (step: number): boolean => {
    if (step === 0) {
      return !!wizardState.brand_id && !!wizardState.product_description.trim();
    }
    if (step === 1) {
      return !!wizardState.positioning;
    }
    if (step === 2) {
      return !!wizardState.lead_magnet;
    }
    if (step === 3) {
      return !!wizardState.email_sequence;
    }
    return true;
  };

  const canNavigateTo = (idx: number): boolean => {
    if (idx <= currentStep) return true;
    /* can only go forward one step at a time, and only if current step is valid */
    if (idx === currentStep + 1) return canAdvance(currentStep);
    return false;
  };

  /* ---- next button label ---- */

  const getNextLabel = (): string => {
    switch (currentStep) {
      case 0: return 'Next: Research';
      case 1: return 'Next: Content';
      case 2: return 'Next: Email';
      case 3: return 'Next: Review';
      default: return 'Continue';
    }
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

  const noBrands = !isLoadingBrands && filteredBrands.length === 0;

  const renderOnboarding = () => {
    if (!showOnboarding && !noBrands) return null;

    return (
      <div className="rounded-2xl border border-emerald-200/60 bg-gradient-to-br from-emerald-50/80 via-white to-white p-8 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center">
            <Lightbulb size={18} className="text-emerald-600" />
          </div>
          <h3 className="text-base font-black text-slate-800 tracking-tight">How This Works</h3>
        </div>

        {/* 4-step row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {ONBOARDING_STEPS.map((s) => (
            <div
              key={s.num}
              className="relative bg-white rounded-xl border border-slate-100 p-5 flex flex-col gap-3"
            >
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-emerald-600 text-white text-[10px] font-black flex items-center justify-center shrink-0">
                  {s.num}
                </span>
                <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center">
                  <s.icon size={16} className="text-slate-500" />
                </div>
              </div>
              <p className="text-sm font-black text-slate-800 leading-snug">{s.title}</p>
              <p className="text-xs text-slate-500 leading-relaxed">{s.description}</p>
              {s.num === 1 && noBrands && (
                <button
                  onClick={() =>
                    addToast('Head to Brand Profiles in the sidebar to create your first brand.', 'info')
                  }
                  className="mt-auto flex items-center gap-1.5 text-xs font-black text-emerald-600 hover:text-emerald-700 transition"
                >
                  <ArrowRight size={14} />
                  Create Brand Profile
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          {noBrands && (
            <p className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200/60 px-4 py-2.5 rounded-xl flex items-center gap-2">
              <ArrowRight size={14} className="shrink-0" />
              First step: Create a brand profile in the sidebar under Brand Profiles
            </p>
          )}
          <button
            onClick={dismissOnboarding}
            className="text-xs font-bold text-slate-400 hover:text-slate-600 transition ml-auto"
          >
            Got it, don't show this again
          </button>
        </div>
      </div>
    );
  };

  const renderSetup = () => (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-300">
      {/* Onboarding Banner */}
      {renderOnboarding()}

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
              No brand profiles found. Create one in{' '}
              <span
                onClick={() =>
                  addToast('Open Brand Profiles from the sidebar to create your first brand.', 'info')
                }
                className="underline text-emerald-600 hover:text-emerald-700 cursor-pointer transition"
              >
                Brand Profiles
              </span>{' '}
              (sidebar) to get started.{' '}
              <ArrowRight size={12} className="inline -mt-0.5" />
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
            placeholder="Add custom segment..."
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

  /* ------------------------------------------------------------------ */
  /*  Step 1 — Research & Positioning                                    */
  /* ------------------------------------------------------------------ */

  const renderResearch = () => {
    const pos = wizardState.positioning;

    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
        {/* ── Section A: Generation Controls ── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <Search size={20} className="text-emerald-600" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-800 tracking-tight">
                AI Research & Positioning
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Generate competitive analysis and positioning strategy for{' '}
                {selectedBrand?.name || 'your brand'}
              </p>
            </div>
          </div>

          {/* Input summary */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-slate-50 rounded-xl p-3">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-0.5">Brand</span>
              <span className="text-xs font-bold text-slate-700 truncate block">{selectedBrand?.name || '—'}</span>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-0.5">Industry</span>
              <span className="text-xs font-bold text-slate-700 truncate block">{selectedBrand?.industry || 'General'}</span>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-0.5">Product</span>
              <span className="text-xs font-bold text-slate-700 truncate block">
                {wizardState.product_description
                  ? wizardState.product_description.slice(0, 100) + (wizardState.product_description.length > 100 ? '...' : '')
                  : '—'}
              </span>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-0.5">Inputs</span>
              <span className="text-xs font-bold text-slate-700">
                {selectedBrand?.competitors?.length || 0} competitors, {wizardState.target_segments.length} segments
              </span>
            </div>
          </div>

          {/* Generate button */}
          <div className="mt-6">
            <button
              onClick={handleGeneratePositioning}
              disabled={isGenerating || !selectedBrand}
              className="w-full px-8 py-5 bg-emerald-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl shadow-emerald-600/20 hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  Analyzing market & competitors...
                </>
              ) : (
                <>
                  <Sparkles size={20} />
                  {pos ? 'Regenerate Positioning Analysis' : 'Generate Positioning Analysis'}
                </>
              )}
            </button>
          </div>

          {/* Error display */}
          {stepErrors[1] && (
            <div className="mt-4 bg-red-50 border border-red-200/60 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-bold text-red-700">{stepErrors[1]}</p>
                <button
                  onClick={handleGeneratePositioning}
                  disabled={isGenerating}
                  className="mt-2 text-xs font-black text-red-600 hover:text-red-700 uppercase tracking-widest transition"
                >
                  Try Again
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Section B: Results (only when positioning exists) ── */}
        {pos && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Card 1: Positioning Statement */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">
                Positioning Statement
              </h4>
              <blockquote className="text-lg font-bold text-slate-800 italic border-l-4 border-emerald-500 pl-4 leading-relaxed">
                {pos.statement}
              </blockquote>
            </div>

            {/* Card 2: Key Differentiators */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">
                Key Differentiators
              </h4>
              <div className="space-y-3">
                {pos.differentiators.map((diff: string, i: number) => (
                  <div key={i} className="flex items-start gap-3">
                    <CheckCircle2 size={18} className="text-emerald-500 shrink-0 mt-0.5" />
                    <span className="text-sm font-bold text-slate-700 leading-relaxed">{diff}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Card 3: Competitive Analysis */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">
                Competitive Analysis
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {pos.competitive_analysis.map((comp: { name: string; positioning: string; strengths: string[]; weaknesses: string[] }, i: number) => (
                  <div
                    key={i}
                    className="bg-slate-50 rounded-xl border border-slate-100 p-5 flex flex-col gap-3"
                  >
                    <div className="flex items-center gap-2">
                      <Shield size={16} className="text-slate-400" />
                      <span className="text-sm font-black text-slate-800">{comp.name}</span>
                    </div>
                    <p className="text-xs text-slate-500 italic leading-relaxed">{comp.positioning}</p>
                    <div>
                      <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600 block mb-1">Strengths</span>
                      {comp.strengths.map((s: string, j: number) => (
                        <div key={j} className="flex items-center gap-2 mb-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                          <span className="text-xs text-slate-600">{s}</span>
                        </div>
                      ))}
                    </div>
                    <div>
                      <span className="text-[9px] font-black uppercase tracking-widest text-red-500 block mb-1">Weaknesses</span>
                      {comp.weaknesses.map((w: string, j: number) => (
                        <div key={j} className="flex items-center gap-2 mb-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />
                          <span className="text-xs text-slate-600">{w}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Card 4: Market Opportunity */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">
                Market Opportunity
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-slate-50 rounded-xl border border-slate-100 p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp size={16} className="text-slate-500" />
                    <span className="text-xs font-black uppercase tracking-widest text-slate-500">Market Gap</span>
                  </div>
                  <p className="text-sm text-slate-700 leading-relaxed">{pos.market_gap}</p>
                </div>
                <div className="bg-emerald-50 rounded-xl border border-emerald-200/60 p-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles size={16} className="text-emerald-600" />
                    <span className="text-xs font-black uppercase tracking-widest text-emerald-600">Unique Angle</span>
                  </div>
                  <p className="text-sm text-emerald-800 font-bold leading-relaxed">{pos.unique_angle}</p>
                </div>
              </div>
            </div>

            {/* Card 5: Regenerate */}
            <div className="flex justify-center">
              <button
                onClick={handleGeneratePositioning}
                disabled={isGenerating}
                className="flex items-center gap-2 px-6 py-3 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition disabled:opacity-50"
              >
                <RefreshCw size={14} className={isGenerating ? 'animate-spin' : ''} />
                Not quite right? Regenerate
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  /* ------------------------------------------------------------------ */
  /*  Step 2 — Content: Lead Magnet & Ads                                */
  /* ------------------------------------------------------------------ */

  const renderContent = () => {
    const outline = wizardState.lead_magnet;
    const hasOutline = !!outline;
    const hasContent = !!outline?.content_markdown;
    const ads = wizardState.ad_copy;

    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
        {/* ── Section A: Lead Magnet Generator ── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <FileText size={20} className="text-emerald-600" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-800 tracking-tight">
                Lead Magnet Generator
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Create a downloadable resource to capture leads
              </p>
            </div>
          </div>

          {/* Error display */}
          {stepErrors[2] && (
            <div className="mt-4 bg-red-50 border border-red-200/60 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-bold text-red-700">{stepErrors[2]}</p>
              </div>
            </div>
          )}

          {/* State 1: No outline yet */}
          {!hasOutline && (
            <div className="mt-6">
              {!wizardState.positioning ? (
                <p className="text-xs text-amber-600 font-bold bg-amber-50 border border-amber-200/60 rounded-xl px-4 py-3">
                  Complete the Research step first to generate a lead magnet outline.
                </p>
              ) : (
                <button
                  onClick={handleGenerateOutline}
                  disabled={isGeneratingOutline}
                  className="w-full px-8 py-5 bg-emerald-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl shadow-emerald-600/20 hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGeneratingOutline ? (
                    <>
                      <Loader2 size={20} className="animate-spin" />
                      Crafting your lead magnet structure...
                    </>
                  ) : (
                    <>
                      <Sparkles size={20} />
                      Generate Outline
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {/* State 2: Outline exists, no content yet */}
          {hasOutline && !hasContent && (
            <div className="mt-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
              {/* Outline header */}
              <div className="bg-slate-50 rounded-xl border border-slate-100 p-6">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h4 className="text-base font-black text-slate-800">{outline!.title}</h4>
                    <p className="text-xs text-slate-500 font-medium mt-0.5">{outline!.subtitle}</p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase tracking-widest">
                    <BookOpen size={12} />
                    {outline!.type}
                  </span>
                </div>
              </div>

              {/* Chapter list */}
              <div className="space-y-3">
                {outline!.outline.map((chapter, i) => (
                  <div
                    key={i}
                    className="bg-white rounded-xl border border-slate-100 p-5 hover:border-slate-200 transition"
                  >
                    <div className="flex items-start gap-3">
                      <span className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 text-[11px] font-black flex items-center justify-center shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-slate-800">{chapter.title}</p>
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">{chapter.description}</p>
                        {chapter.key_points.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mt-3">
                            {chapter.key_points.map((kp, j) => (
                              <span
                                key={j}
                                className="px-2.5 py-1 rounded-md bg-slate-50 text-[10px] font-bold text-slate-500 border border-slate-100"
                              >
                                {kp}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Action buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  onClick={handleGenerateFullContent}
                  disabled={isGeneratingContent}
                  className="flex-1 px-8 py-5 bg-emerald-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl shadow-emerald-600/20 hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGeneratingContent ? (
                    <>
                      <Loader2 size={20} className="animate-spin" />
                      {contentProgress || 'Generating...'}
                    </>
                  ) : (
                    <>
                      <Sparkles size={20} />
                      Generate Full Content
                    </>
                  )}
                </button>
                <button
                  onClick={handleGenerateOutline}
                  disabled={isGeneratingOutline || isGeneratingContent}
                  className="px-6 py-5 text-slate-500 bg-white border border-slate-200 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-50 transition disabled:opacity-50"
                >
                  <RefreshCw size={14} className={isGeneratingOutline ? 'animate-spin' : ''} />
                  Regenerate Outline
                </button>
              </div>
            </div>
          )}

          {/* State 3: Outline + content exist */}
          {hasOutline && hasContent && (
            <div className="mt-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
              {/* Success header */}
              <div className="bg-emerald-50 rounded-xl border border-emerald-200/60 p-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
                      <CheckCircle2 size={20} className="text-emerald-600" />
                    </div>
                    <div>
                      <p className="text-sm font-black text-emerald-800">Content Generated</p>
                      <p className="text-xs text-emerald-600 font-medium mt-0.5">{outline!.title}</p>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase tracking-widest">
                    <BookOpen size={12} />
                    {outline!.type}
                  </span>
                </div>

                {/* Stats */}
                <div className="flex items-center gap-4 mt-4">
                  <div className="bg-white rounded-lg px-4 py-2.5 border border-emerald-200/60">
                    <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500 block">Words</span>
                    <span className="text-sm font-black text-emerald-800">
                      {outline!.content_markdown.split(/\s+/).length.toLocaleString()}
                    </span>
                  </div>
                  <div className="bg-white rounded-lg px-4 py-2.5 border border-emerald-200/60">
                    <span className="text-[9px] font-black uppercase tracking-widest text-emerald-500 block">Chapters</span>
                    <span className="text-sm font-black text-emerald-800">
                      {outline!.outline.length}
                    </span>
                  </div>
                </div>
              </div>

              {/* Content preview */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <button
                  onClick={() => setContentExpanded(!contentExpanded)}
                  className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition"
                >
                  <span className="text-xs font-black uppercase tracking-widest text-slate-500">
                    Content Preview
                  </span>
                  {contentExpanded ? (
                    <ChevronUp size={16} className="text-slate-400" />
                  ) : (
                    <ChevronDown size={16} className="text-slate-400" />
                  )}
                </button>
                {contentExpanded && (
                  <div className="px-6 pb-6 border-t border-slate-100">
                    <pre className="mt-4 text-xs text-slate-600 leading-relaxed whitespace-pre-wrap font-sans max-h-[500px] overflow-y-auto">
                      {outline!.content_markdown}
                    </pre>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(outline!.content_markdown);
                    addToast('Content copied to clipboard!', 'success');
                  }}
                  className="px-5 py-3 bg-white border border-slate-200 rounded-xl text-xs font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition flex items-center gap-2"
                >
                  <Copy size={14} />
                  Copy to Clipboard
                </button>
                <button
                  onClick={handleGenerateFullContent}
                  disabled={isGeneratingContent}
                  className="px-5 py-3 bg-white border border-slate-200 rounded-xl text-xs font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition flex items-center gap-2 disabled:opacity-50"
                >
                  <RefreshCw size={14} className={isGeneratingContent ? 'animate-spin' : ''} />
                  Regenerate Content
                </button>
                <button
                  onClick={handleGenerateOutline}
                  disabled={isGeneratingOutline}
                  className="px-5 py-3 bg-white border border-slate-200 rounded-xl text-xs font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 hover:bg-slate-50 transition flex items-center gap-2 disabled:opacity-50"
                >
                  <RefreshCw size={14} className={isGeneratingOutline ? 'animate-spin' : ''} />
                  New Outline
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Section B: Ad Copy Generator ── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <Megaphone size={20} className="text-emerald-600" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-800 tracking-tight">
                Ad Copy Generator
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Multi-platform ad variations for Google, LinkedIn, Meta & X
              </p>
            </div>
          </div>

          {/* Generate button */}
          {!ads && (
            <div className="mt-6">
              {!wizardState.positioning ? (
                <p className="text-xs text-amber-600 font-bold bg-amber-50 border border-amber-200/60 rounded-xl px-4 py-3">
                  Complete the Research step first to generate ad copy.
                </p>
              ) : (
                <button
                  onClick={handleGenerateAdCopy}
                  disabled={isGeneratingAds}
                  className="w-full px-8 py-5 bg-emerald-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl shadow-emerald-600/20 hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGeneratingAds ? (
                    <>
                      <Loader2 size={20} className="animate-spin" />
                      Generating ad variations...
                    </>
                  ) : (
                    <>
                      <Sparkles size={20} />
                      Generate Ad Copy
                    </>
                  )}
                </button>
              )}
            </div>
          )}

          {/* Ad copy results */}
          {ads && (
            <div className="mt-6 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
              {(Object.keys(AD_PLATFORM_LABELS) as string[]).map((platformKey) => {
                const variations = (ads as any)[platformKey] as { headline: string; body: string; cta: string; platform_notes?: string }[] | undefined;
                if (!variations || variations.length === 0) return null;
                return (
                  <div key={platformKey}>
                    <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">
                      {AD_PLATFORM_LABELS[platformKey]}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {variations.map((v, i) => (
                        <div
                          key={i}
                          className="bg-slate-50 rounded-xl border border-slate-100 p-5 flex flex-col gap-2"
                        >
                          <p className="text-sm font-black text-slate-800 leading-snug">{v.headline}</p>
                          <p className="text-xs text-slate-600 leading-relaxed">{v.body}</p>
                          <div className="flex items-center justify-between mt-2">
                            <span className="inline-flex items-center px-3 py-1 rounded-lg bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase tracking-widest">
                              {v.cta}
                            </span>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(`${v.headline}\n\n${v.body}\n\nCTA: ${v.cta}`);
                                addToast('Ad copy copied!', 'success');
                              }}
                              className="text-slate-400 hover:text-slate-600 transition"
                            >
                              <Copy size={14} />
                            </button>
                          </div>
                          {v.platform_notes && (
                            <p className="text-[10px] text-slate-400 italic mt-1">{v.platform_notes}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* Regenerate */}
              <div className="flex justify-center">
                <button
                  onClick={handleGenerateAdCopy}
                  disabled={isGeneratingAds}
                  className="flex items-center gap-2 px-6 py-3 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition disabled:opacity-50"
                >
                  <RefreshCw size={14} className={isGeneratingAds ? 'animate-spin' : ''} />
                  Regenerate Ad Copy
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  /* ------------------------------------------------------------------ */
  /*  Step 3 — Email Nurture Sequence                                    */
  /* ------------------------------------------------------------------ */

  const renderEmails = () => {
    const seq = wizardState.email_sequence;
    const canGenerate = !!wizardState.positioning && !!wizardState.lead_magnet;

    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
        {/* ── Header ── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <Mail size={20} className="text-emerald-600" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-800 tracking-tight">
                Email Nurture Sequence
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                Automated email series triggered after lead magnet download
              </p>
            </div>
          </div>

          {/* Error display */}
          {stepErrors[3] && (
            <div className="mt-4 bg-red-50 border border-red-200/60 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-bold text-red-700">{stepErrors[3]}</p>
                <button
                  onClick={handleGenerateEmails}
                  disabled={isGeneratingEmails}
                  className="mt-2 text-xs font-black text-red-600 hover:text-red-700 uppercase tracking-widest transition"
                >
                  Try Again
                </button>
              </div>
            </div>
          )}

          {/* No sequence yet */}
          {!seq && (
            <div className="mt-6">
              {!canGenerate ? (
                <p className="text-xs text-amber-600 font-bold bg-amber-50 border border-amber-200/60 rounded-xl px-4 py-3">
                  Complete Research and Content steps first
                </p>
              ) : (
                <>
                  <div className="bg-slate-50 rounded-xl border border-slate-100 p-5 mb-4">
                    <p className="text-sm text-slate-600 leading-relaxed">
                      Generate a <span className="font-black text-slate-800">4-email sequence</span> tied to your lead magnet:{' '}
                      <span className="font-black text-emerald-700">
                        &lsquo;{wizardState.lead_magnet?.title || 'your resource'}&rsquo;
                      </span>
                    </p>
                  </div>
                  <button
                    onClick={handleGenerateEmails}
                    disabled={isGeneratingEmails}
                    className="w-full px-8 py-5 bg-emerald-600 text-white rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3 shadow-xl shadow-emerald-600/20 hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isGeneratingEmails ? (
                      <>
                        <Loader2 size={20} className="animate-spin" />
                        Composing your nurture sequence...
                      </>
                    ) : (
                      <>
                        <Sparkles size={20} />
                        Generate Email Sequence
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Sequence Results ── */}
        {seq && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Strategy Notes */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
              <div className="flex items-center gap-2 mb-4">
                <BookOpen size={16} className="text-emerald-600" />
                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  Strategy Notes
                </h4>
              </div>
              <div className="border-l-4 border-emerald-500 pl-4">
                <p className="text-sm text-slate-600 italic leading-relaxed">
                  {seq.strategy_notes}
                </p>
              </div>
            </div>

            {/* Email Timeline */}
            <div className="relative pl-8">
              {/* Timeline connector */}
              <div className="absolute left-[23px] top-6 bottom-6 border-l-2 border-slate-200" />

              <div className="space-y-4">
                {seq.emails.map((email) => {
                  const isExpanded = expandedEmail === email.sequence_number;
                  const isFirstEmail = email.delay_days === 0;
                  const totalEmails = seq.emails.length;

                  return (
                    <div key={email.sequence_number} className="relative">
                      {/* Day badge */}
                      <div className="absolute -left-8 top-4">
                        <div
                          className={`w-12 h-12 rounded-full flex items-center justify-center text-[10px] font-black leading-tight text-center ${
                            isFirstEmail
                              ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
                              : 'bg-slate-700 text-slate-300'
                          }`}
                        >
                          <div>
                            <div className="text-[8px] uppercase tracking-wider opacity-80">Day</div>
                            <div className="text-sm">{email.delay_days}</div>
                          </div>
                        </div>
                      </div>

                      {/* Email card */}
                      <div
                        onClick={() =>
                          setExpandedEmail(isExpanded ? null : email.sequence_number)
                        }
                        className={`ml-8 bg-white rounded-2xl border shadow-sm cursor-pointer transition-all hover:shadow-md ${
                          isExpanded
                            ? 'border-emerald-300 shadow-md'
                            : 'border-slate-200'
                        }`}
                      >
                        {/* Collapsed header (always visible) */}
                        <div className="p-6">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                Email {email.sequence_number} of {totalEmails}
                              </span>
                              <div className="flex items-center gap-1 text-[10px] text-slate-400">
                                <Clock size={10} />
                                Day {email.delay_days}
                              </div>
                            </div>
                            {isExpanded ? (
                              <ChevronUp size={16} className="text-slate-400" />
                            ) : (
                              <ChevronDown size={16} className="text-slate-400" />
                            )}
                          </div>
                          <p className="text-base font-semibold text-slate-800 mb-1">
                            {email.subject}
                          </p>
                          {!isExpanded && (
                            <p className="text-xs text-slate-400 truncate">
                              {email.preview_text}
                            </p>
                          )}
                        </div>

                        {/* Expanded content */}
                        {isExpanded && (
                          <div className="px-6 pb-6 space-y-4 animate-in fade-in duration-200">
                            {/* Preview text */}
                            <div>
                              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 block mb-1">
                                Preview Text
                              </span>
                              <p className="text-xs text-slate-500 leading-relaxed">
                                {email.preview_text}
                              </p>
                            </div>

                            {/* Body */}
                            <div className="bg-slate-50 rounded-xl p-4">
                              <pre className="text-sm text-slate-700 whitespace-pre-wrap font-mono leading-relaxed">
                                {email.body_markdown}
                              </pre>
                            </div>

                            {/* CTA preview */}
                            <div className="flex flex-col items-start gap-2">
                              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">
                                Call to Action
                              </span>
                              <span className="inline-flex items-center px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase tracking-widest">
                                {email.cta_text}
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono">
                                {email.cta_url_placeholder}
                              </span>
                            </div>

                            {/* Copy button */}
                            <button
                              onClick={(e: React.MouseEvent) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(
                                  `Subject: ${email.subject}\nPreview: ${email.preview_text}\n\n${email.body_markdown}\n\nCTA: ${email.cta_text} → ${email.cta_url_placeholder}`,
                                );
                                addToast('Email copied to clipboard!', 'success');
                              }}
                              className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-black uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition"
                            >
                              <Copy size={14} />
                              Copy Email
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Footer actions */}
            <div className="flex justify-center">
              <button
                onClick={handleGenerateEmails}
                disabled={isGeneratingEmails}
                className="flex items-center gap-2 px-6 py-3 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 transition disabled:opacity-50"
              >
                <RefreshCw size={14} className={isGeneratingEmails ? 'animate-spin' : ''} />
                Regenerate Sequence
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  /* ------------------------------------------------------------------ */
  /*  Step 4 — Review & Export                                           */
  /* ------------------------------------------------------------------ */

  const renderReview = () => {
    const sections = [
      { label: 'Positioning', done: !!wizardState.positioning, icon: Target },
      { label: 'Lead Magnet', done: !!wizardState.lead_magnet, icon: FileText },
      { label: 'Ad Copy', done: !!wizardState.ad_copy, icon: Megaphone },
      { label: 'Email Sequence', done: !!wizardState.email_sequence, icon: Mail },
    ];
    const completedCount = sections.filter(s => s.done).length;

    return (
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            Review & Export
          </h2>
          <p className="text-slate-500 text-sm mt-1">Review your complete campaign package</p>
        </div>

        {/* Completion Checklist */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Campaign Completeness</span>
            <span className="text-sm font-semibold text-emerald-600">{completedCount} of {sections.length} complete</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {sections.map((s) => (
              <div key={s.label} className={`flex items-center gap-2 p-3 rounded-xl border ${s.done ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-slate-50'}`}>
                <s.icon className={`w-4 h-4 ${s.done ? 'text-emerald-500' : 'text-slate-300'}`} />
                <span className={`text-sm font-medium ${s.done ? 'text-emerald-700' : 'text-slate-400'}`}>{s.label}</span>
                {s.done ? <CheckCircle2 className="w-4 h-4 text-emerald-500 ml-auto" /> : <XCircle className="w-4 h-4 text-slate-300 ml-auto" />}
              </div>
            ))}
          </div>
        </div>

        {/* Campaign Summary */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Campaign Summary</span>
          <h3 className="text-lg font-bold text-slate-800 mt-2">{campaignName || 'Untitled Campaign'}</h3>
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {selectedBrand && (
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                {selectedBrand.name}
              </span>
            )}
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
              {wizardState.objective.replace(/_/g, ' ')}
            </span>
            {wizardState.target_segments.map((seg: string) => (
              <span key={seg} className="text-xs px-2 py-1 rounded-full bg-slate-50 text-slate-500 border border-slate-200">{seg}</span>
            ))}
          </div>
          {wizardState.product_description && (
            <p className="text-sm text-slate-500 mt-3 line-clamp-2">{wizardState.product_description}</p>
          )}
        </div>

        {/* Section Previews */}
        {wizardState.positioning && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-3">
              <Target className="w-4 h-4 text-emerald-500" />
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Positioning</span>
            </div>
            <blockquote className="border-l-4 border-emerald-500 pl-4 italic text-slate-700 text-sm">
              {wizardState.positioning.statement}
            </blockquote>
            <div className="flex gap-4 mt-3 text-xs text-slate-400">
              <span>{wizardState.positioning.differentiators.length} differentiators</span>
              <span>{wizardState.positioning.competitive_analysis?.length || 0} competitors analyzed</span>
            </div>
          </div>
        )}

        {wizardState.lead_magnet && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-4 h-4 text-emerald-500" />
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Lead Magnet</span>
            </div>
            <h4 className="font-semibold text-slate-800">{wizardState.lead_magnet.title}</h4>
            <p className="text-sm text-slate-500 mt-1">{wizardState.lead_magnet.subtitle}</p>
            <div className="flex gap-4 mt-3 text-xs text-slate-400">
              <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-500">{wizardState.lead_magnet.type}</span>
              <span>{wizardState.lead_magnet.outline.length} chapters</span>
              {wizardState.lead_magnet.content_markdown && (
                <span>{wizardState.lead_magnet.content_markdown.split(/\s+/).length.toLocaleString()} words</span>
              )}
            </div>
          </div>
        )}

        {wizardState.ad_copy && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-3">
              <Megaphone className="w-4 h-4 text-emerald-500" />
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Ad Copy</span>
            </div>
            <div className="flex gap-4 text-xs text-slate-400">
              <span>{Object.keys(wizardState.ad_copy).length} platforms</span>
              <span>{Object.values(wizardState.ad_copy).flat().length} total variations</span>
            </div>
          </div>
        )}

        {wizardState.email_sequence && (
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-3">
              <Mail className="w-4 h-4 text-emerald-500" />
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Email Sequence</span>
            </div>
            <div className="flex gap-4 text-xs text-slate-400">
              <span>{wizardState.email_sequence.emails.length} emails</span>
              <span>
                {wizardState.email_sequence.emails.length > 0
                  ? `Day 0 to Day ${wizardState.email_sequence.emails[wizardState.email_sequence.emails.length - 1].delay_days}`
                  : 'No emails'}
              </span>
            </div>
          </div>
        )}

        {/* Export Actions */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4 block">Export Campaign</span>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              onClick={handleExportJSON}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 text-sm font-semibold text-slate-700 transition-all"
            >
              <Download className="w-4 h-4" />
              Export JSON
            </button>
            <button
              onClick={handleExportMarkdown}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 text-sm font-semibold text-slate-700 transition-all"
            >
              <FileDown className="w-4 h-4" />
              Export Markdown
            </button>
            <button
              onClick={handleSaveCampaign}
              disabled={isSaving}
              className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold transition-all disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {isSaving ? 'Saving...' : 'Save to Trellis'}
            </button>
          </div>
        </div>

        {/* Start New */}
        <div className="text-center pt-4">
          <button
            onClick={clearDraft}
            className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
          >
            ← Start New Campaign
          </button>
        </div>
      </div>
    );
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return renderSetup();
      case 1:
        return renderResearch();
      case 2:
        return renderContent();
      case 3:
        return renderEmails();
      case 4:
        return renderReview();
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

        {currentStep < STEPS.length - 1 && (
          <button
            onClick={() => setCurrentStep(Math.min(STEPS.length - 1, currentStep + 1))}
            disabled={!canAdvance(currentStep)}
            className="px-10 py-5 bg-emerald-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center space-x-3 shadow-xl hover:bg-emerald-700 transition disabled:opacity-50 group"
          >
            <span>{getNextLabel()}</span>
            <ChevronRight
              size={20}
              className="group-hover:translate-x-1 transition-transform"
            />
          </button>
        )}
      </div>
    </div>
  );
}
