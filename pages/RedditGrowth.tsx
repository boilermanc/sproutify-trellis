import React, { useMemo, useState } from 'react';
import {
  AlertTriangle, BarChart3, CalendarDays, CheckCircle2, Clock3,
  BrainCircuit, DollarSign, Download, ExternalLink, Globe2, Hash, Image as ImageIcon, Layers3,
  Link, MapPin, Megaphone, Pencil, Plus, Rocket, Save, ShieldCheck,
  Sparkles, Target, Trash2, Video, XCircle, Loader2, Wand2,
} from 'lucide-react';
import {
  ApiKeyConfig,
  BranchContext,
  RedditAdCampaign,
  RedditAdCampaignStatus,
  RedditAdFormat,
  RedditAdObjective,
  RedditAdStrategy,
  RedditAdVariant,
  ViewState,
} from '../types';
import { generateRedditAdStrategy } from '../services/redditAdStrategyService';
import { generateCardConcepts, type CardConceptWithRef } from '../services/creativeDirectorService';
import { getBrandCardStyle } from '../services/brandCardStyles';
import { renderCardConcept, renderCardPreviewDataUrl } from '../utils/cardRenderer';
import { uploadPostImage } from '../services/scheduledPostService';

interface RedditAdsProps {
  branchContext?: BranchContext;
  apiKeys: ApiKeyConfig;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onNavigate: (view: ViewState) => void;
}

type WorkspaceTab = 'strategy' | 'campaigns' | 'create' | 'review' | 'performance';

interface InlineCreativeDraft {
  concept?: CardConceptWithRef;
  previewUrl?: string;
  isGenerating: boolean;
  isApproving: boolean;
  error?: string;
}

const STORAGE_KEY = 'trellis_reddit_ad_campaigns_v1';
const STRATEGY_STORAGE_KEY = 'trellis_reddit_ad_strategies_v1';
const DEFAULT_COMMUNITIES = ['UrbanGardening', 'gardening', 'Hydroponics'];
const DEFAULT_LOCATIONS = ['United States'];

const OBJECTIVE_LABELS: Record<RedditAdObjective, string> = {
  awareness: 'Awareness',
  traffic: 'Traffic',
  conversions: 'Conversions',
  video_views: 'Video Views',
};

const OBJECTIVE_HELP: Record<RedditAdObjective, string> = {
  awareness: 'Maximize qualified reach and brand recognition.',
  traffic: 'Drive visits to a landing page or product page.',
  conversions: 'Optimize toward a tracked website action.',
  video_views: 'Maximize meaningful views of video creative.',
};

const STATUS_LABELS: Record<RedditAdCampaignStatus, string> = {
  draft: 'Draft',
  pending_review: 'In Review',
  approved: 'Approved',
  rejected: 'Changes Requested',
  exported: 'Exported',
  deployed: 'Deployed',
  failed: 'Failed',
};

const STATUS_STYLES: Record<RedditAdCampaignStatus, string> = {
  draft: 'bg-slate-100 text-slate-600',
  pending_review: 'bg-amber-100 text-amber-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-rose-100 text-rose-700',
  exported: 'bg-indigo-100 text-indigo-700',
  deployed: 'bg-blue-100 text-blue-700',
  failed: 'bg-red-100 text-red-700',
};

const FORMAT_ICONS: Record<RedditAdFormat, React.ComponentType<{ size?: number; className?: string }>> = {
  image: ImageIcon,
  video: Video,
  carousel: Layers3,
};

function localDateTime(daysFromNow: number, hour = 9): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  date.setHours(hour, 0, 0, 0);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function newVariant(index = 1): RedditAdVariant {
  return {
    id: `variant_${Date.now()}_${index}`,
    name: `Variant ${String.fromCharCode(64 + Math.min(index, 26))}`,
    format: 'image',
    headline: '',
    body: '',
    callToAction: 'Learn More',
    landingUrl: '',
    assetUrl: '',
  };
}

function emptyCampaign(branchSlug: string): RedditAdCampaign {
  const now = new Date().toISOString();
  return {
    id: '',
    name: '',
    branchSlug,
    objective: 'traffic',
    status: 'draft',
    dailyBudgetUsd: 25,
    startAt: localDateTime(1),
    endAt: localDateTime(8),
    communityTargets: [...DEFAULT_COMMUNITIES],
    locationTargets: [...DEFAULT_LOCATIONS],
    conversionPixelId: '',
    variants: [newVariant()],
    createdAt: now,
    updatedAt: now,
  };
}

function emptyStrategy(branchSlug: string, websiteUrl = ''): RedditAdStrategy {
  const now = new Date().toISOString();
  return {
    id: '',
    branchSlug,
    status: 'draft',
    productName: '',
    productEvidence: '',
    websiteUrl,
    offerName: '',
    rationale: '',
    objective: 'traffic',
    landingPageUrl: websiteUrl,
    targetAudience: '',
    communityTargets: [],
    locationTargets: ['United States'],
    recommendedDailyBudgetUsd: 25,
    creatives: [],
    risks: [],
    assumptions: [],
    createdAt: now,
    updatedAt: now,
  };
}

function isCampaign(value: unknown): value is RedditAdCampaign {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<RedditAdCampaign>;
  return typeof item.id === 'string'
    && typeof item.name === 'string'
    && typeof item.branchSlug === 'string'
    && typeof item.objective === 'string'
    && typeof item.status === 'string'
    && typeof item.dailyBudgetUsd === 'number'
    && Array.isArray(item.communityTargets)
    && Array.isArray(item.locationTargets)
    && Array.isArray(item.variants);
}

function loadCampaigns(): RedditAdCampaign[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(isCampaign) : [];
  } catch {
    return [];
  }
}

function saveCampaigns(campaigns: RedditAdCampaign[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(campaigns));
}

function isStrategy(value: unknown): value is RedditAdStrategy {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<RedditAdStrategy>;
  return typeof item.id === 'string'
    && typeof item.branchSlug === 'string'
    && typeof item.status === 'string'
    && typeof item.productName === 'string'
    && Array.isArray(item.creatives);
}

function loadStrategies(): RedditAdStrategy[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STRATEGY_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(isStrategy) : [];
  } catch {
    return [];
  }
}

function saveStrategies(strategies: RedditAdStrategy[]): void {
  localStorage.setItem(STRATEGY_STORAGE_KEY, JSON.stringify(strategies));
}

function normalizeTarget(value: string): string {
  return value.trim().replace(/^r\//i, '');
}

function validHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function buildInlineCreativeBrandContext(branch: BranchContext['allBranches'][number]): string {
  const website = branch.website_url ? ` Website: ${branch.website_url}.` : '';
  return `Brand: ${branch.name}.${website}`;
}

function reviewErrors(campaign: RedditAdCampaign): string[] {
  const errors: string[] = [];
  if (!campaign.name.trim()) errors.push('Add a campaign name.');
  if (!campaign.branchSlug) errors.push('Choose a brand branch.');
  if (!Number.isFinite(campaign.dailyBudgetUsd) || campaign.dailyBudgetUsd <= 0) errors.push('Set a daily budget above $0.');
  if (!campaign.startAt || !campaign.endAt || new Date(campaign.endAt) <= new Date(campaign.startAt)) errors.push('End time must be after start time.');
  if (campaign.communityTargets.length === 0) errors.push('Add at least one community target.');
  if (campaign.locationTargets.length === 0) errors.push('Add at least one location target.');
  if (campaign.objective === 'conversions' && !campaign.conversionPixelId?.trim()) errors.push('Conversions require a Reddit conversion pixel ID.');
  if (campaign.variants.length === 0) errors.push('Add at least one creative variant.');
  campaign.variants.forEach((variant, index) => {
    const label = variant.name.trim() || `Variant ${index + 1}`;
    if (!variant.headline.trim()) errors.push(`${label}: add a headline.`);
    if (!variant.body.trim()) errors.push(`${label}: add body copy.`);
    if (!validHttpUrl(variant.landingUrl)) errors.push(`${label}: add a valid landing URL.`);
    if (!variant.assetUrl?.trim()) errors.push(`${label}: attach an approved creative URL.`);
  });
  return errors;
}

const EVIDENCE_REQUIRED_CLAIMS = [
  { pattern: /\bno data loss\b/i, evidence: /\bno data loss\b/i, message: '“No data loss” is an absolute guarantee and must appear in the supplied evidence.' },
  { pattern: /\bautomatic(?:ally)?\b/i, evidence: /\bautomatic(?:ally)?\b/i, message: 'Automatic synchronization must be explicitly supported by the supplied evidence.' },
  { pattern: /\bguarantee(?:d|s)?\b/i, evidence: /\bguarantee(?:d|s)?\b/i, message: 'Guarantee language must be explicitly supported by the supplied evidence.' },
  { pattern: /\bfree(?: trial)?\b/i, evidence: /\bfree(?: trial)?\b/i, message: 'Free or free-trial language must be explicitly supported by the supplied evidence.' },
];

function strategyReviewErrors(strategy: RedditAdStrategy): string[] {
  const errors: string[] = [];
  if (!strategy.offerName.trim()) errors.push('Add a specific offer.');
  if (!strategy.targetAudience.trim()) errors.push('Define the target audience.');
  if (!validHttpUrl(strategy.landingPageUrl)) errors.push('Add a valid landing page URL.');
  if (strategy.locationTargets.length !== 1) errors.push('Keep a first test to one location so results are interpretable.');
  if (strategy.creatives.length === 0) errors.push('Add at least one creative concept.');

  strategy.creatives.forEach((creative, index) => {
    const label = `Creative ${index + 1}`;
    if (!creative.headline.trim()) errors.push(`${label}: add a headline.`);
    if (!creative.body.trim()) errors.push(`${label}: add body copy.`);
    const copy = `${creative.headline}\n${creative.body}`;
    EVIDENCE_REQUIRED_CLAIMS.forEach(rule => {
      if (rule.pattern.test(copy) && !rule.evidence.test(strategy.productEvidence)) {
        errors.push(`${label}: ${rule.message}`);
      }
    });
  });

  return errors;
}

function formatDate(value: string): string {
  if (!value) return 'Not scheduled';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not scheduled';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

const RedditGrowth: React.FC<RedditAdsProps> = ({ branchContext, apiKeys, addToast, onNavigate }) => {
  const defaultBranch = branchContext?.activeBranchSlugs[0] || branchContext?.allBranches[0]?.slug || '';
  const defaultWebsite = branchContext?.allBranches.find(branch => branch.slug === defaultBranch)?.website_url || '';
  const [campaigns, setCampaigns] = useState<RedditAdCampaign[]>(loadCampaigns);
  const [strategies, setStrategies] = useState<RedditAdStrategy[]>(loadStrategies);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('strategy');
  const [form, setForm] = useState<RedditAdCampaign>(() => emptyCampaign(defaultBranch));
  const [strategyForm, setStrategyForm] = useState<RedditAdStrategy>(() => emptyStrategy(defaultBranch, defaultWebsite));
  const [isGeneratingStrategy, setIsGeneratingStrategy] = useState(false);
  const [communityInput, setCommunityInput] = useState('');
  const [locationInput, setLocationInput] = useState('');
  const [inlineCreativeDrafts, setInlineCreativeDrafts] = useState<Record<string, InlineCreativeDraft>>({});

  const visibleCampaigns = useMemo(() => {
    if (!branchContext || branchContext.isAllSelected) return campaigns;
    const active = new Set(branchContext.activeBranchSlugs);
    return campaigns.filter(campaign => active.has(campaign.branchSlug));
  }, [campaigns, branchContext]);

  const reviewCampaigns = useMemo(
    () => visibleCampaigns.filter(campaign => ['pending_review', 'approved', 'rejected', 'exported'].includes(campaign.status)),
    [visibleCampaigns],
  );

  const strategyErrors = useMemo(() => strategyReviewErrors(strategyForm), [strategyForm]);

  const totals = useMemo(() => ({
    campaigns: visibleCampaigns.length,
    review: visibleCampaigns.filter(campaign => campaign.status === 'pending_review').length,
    approved: visibleCampaigns.filter(campaign => campaign.status === 'approved').length,
    exported: visibleCampaigns.filter(campaign => campaign.status === 'exported').length,
    deployed: visibleCampaigns.filter(campaign => campaign.status === 'deployed').length,
  }), [visibleCampaigns]);

  const commitCampaign = (next: RedditAdCampaign) => {
    setCampaigns(previous => {
      const exists = previous.some(campaign => campaign.id === next.id);
      const updated = exists
        ? previous.map(campaign => campaign.id === next.id ? next : campaign)
        : [next, ...previous];
      saveCampaigns(updated);
      return updated;
    });
  };

  const commitStrategy = (next: RedditAdStrategy) => {
    setStrategies(previous => {
      const exists = previous.some(strategy => strategy.id === next.id);
      const updated = exists
        ? previous.map(strategy => strategy.id === next.id ? next : strategy)
        : [next, ...previous];
      saveStrategies(updated);
      return updated;
    });
    setStrategyForm(next);
  };

  const startStrategy = () => {
    const branch = branchContext?.allBranches.find(item => item.slug === defaultBranch);
    setStrategyForm(emptyStrategy(defaultBranch, branch?.website_url || ''));
    setActiveTab('strategy');
  };

  const runStrategy = async () => {
    if (!strategyForm.branchSlug) {
      addToast('Choose a brand before generating a strategy.', 'error');
      return;
    }
    if (!strategyForm.productName.trim() && !strategyForm.productEvidence.trim()) {
      addToast('Add a product, offer, or some website evidence first.', 'error');
      return;
    }

    setIsGeneratingStrategy(true);
    try {
      const branch = branchContext?.allBranches.find(item => item.slug === strategyForm.branchSlug);
      const recommendation = await generateRedditAdStrategy(apiKeys, {
        brandName: branch?.name || strategyForm.branchSlug,
        branchSlug: strategyForm.branchSlug,
        websiteUrl: strategyForm.websiteUrl,
        productName: strategyForm.productName,
        productEvidence: strategyForm.productEvidence,
      });
      const now = new Date().toISOString();
      commitStrategy({
        ...strategyForm,
        ...recommendation,
        id: strategyForm.id || `reddit_strategy_${Date.now()}`,
        status: 'generated',
        createdAt: strategyForm.id ? strategyForm.createdAt : now,
        updatedAt: now,
        generatedAt: now,
        approvedAt: undefined,
      });
      addToast('Reddit strategy generated. Review every assumption before approval.', 'success');
    } catch (error) {
      addToast(error instanceof Error ? error.message : 'Unable to generate the strategy.', 'error');
    } finally {
      setIsGeneratingStrategy(false);
    }
  };

  const approveStrategy = () => {
    if (strategyErrors.length > 0) {
      addToast(strategyErrors[0], 'error');
      return;
    }
    const now = new Date().toISOString();
    commitStrategy({ ...strategyForm, status: 'approved', approvedAt: now, updatedAt: now });
    addToast('Strategy approved. It can now seed a paused campaign draft.', 'success');
  };

  const updateStrategyCreative = (index: number, patch: Partial<RedditAdStrategy['creatives'][number]>) => {
    setStrategyForm(previous => ({
      ...previous,
      status: 'generated',
      approvedAt: undefined,
      creatives: previous.creatives.map((creative, creativeIndex) => creativeIndex === index ? { ...creative, ...patch } : creative),
    }));
  };

  const createCampaignFromStrategy = () => {
    if (strategyForm.status !== 'approved') {
      addToast('Approve the strategy before creating a campaign draft.', 'error');
      return;
    }
    const next = emptyCampaign(strategyForm.branchSlug);
    setForm({
      ...next,
      name: `${strategyForm.offerName} Reddit Test`,
      objective: strategyForm.objective,
      dailyBudgetUsd: strategyForm.recommendedDailyBudgetUsd,
      communityTargets: strategyForm.communityTargets,
      locationTargets: strategyForm.locationTargets,
      variants: strategyForm.creatives.map((creative, index) => ({
        ...newVariant(index + 1),
        headline: creative.headline,
        body: creative.body,
        callToAction: creative.callToAction,
        landingUrl: strategyForm.landingPageUrl,
      })),
    });
    setActiveTab('create');
    addToast('Approved strategy copied into a new local campaign draft.', 'success');
  };

  const startNew = () => {
    setForm(emptyCampaign(defaultBranch));
    setCommunityInput('');
    setLocationInput('');
    setActiveTab('create');
  };

  const editCampaign = (campaign: RedditAdCampaign) => {
    setForm({ ...campaign, variants: campaign.variants.map(variant => ({ ...variant })) });
    setActiveTab('create');
  };

  const saveDraft = () => {
    const now = new Date().toISOString();
    const saved: RedditAdCampaign = {
      ...form,
      id: form.id || `reddit_ad_${Date.now()}`,
      status: 'draft',
      createdAt: form.id ? form.createdAt : now,
      updatedAt: now,
      submittedAt: undefined,
      approvedAt: undefined,
      exportedAt: undefined,
      deployment: undefined,
      lastError: undefined,
    };
    commitCampaign(saved);
    setForm(saved);
    addToast('Reddit ad campaign saved as a local draft.', 'success');
  };

  const submitForReview = () => {
    const errors = reviewErrors(form);
    if (errors.length > 0) {
      addToast(errors[0], 'error');
      return;
    }
    const now = new Date().toISOString();
    const submitted: RedditAdCampaign = {
      ...form,
      id: form.id || `reddit_ad_${Date.now()}`,
      status: 'pending_review',
      createdAt: form.id ? form.createdAt : now,
      updatedAt: now,
      submittedAt: now,
      approvedAt: undefined,
      exportedAt: undefined,
      deployment: undefined,
      lastError: undefined,
    };
    commitCampaign(submitted);
    setForm(submitted);
    setActiveTab('review');
    addToast('Campaign submitted for human review.', 'success');
  };

  const changeStatus = (campaign: RedditAdCampaign, status: RedditAdCampaignStatus) => {
    const now = new Date().toISOString();
    commitCampaign({
      ...campaign,
      status,
      updatedAt: now,
      approvedAt: status === 'approved' ? now : campaign.approvedAt,
    });
    addToast(status === 'approved' ? 'Campaign approved and ready to export.' : 'Campaign returned for changes.', status === 'approved' ? 'success' : 'info');
  };

  const deleteCampaign = (campaignId: string) => {
    setCampaigns(previous => {
      const updated = previous.filter(campaign => campaign.id !== campaignId);
      saveCampaigns(updated);
      return updated;
    });
    addToast('Draft removed.', 'info');
  };

  const exportCampaign = (campaign: RedditAdCampaign) => {
    if (campaign.status !== 'approved' && campaign.status !== 'exported') {
      addToast('Approve the campaign before exporting it.', 'error');
      return;
    }
    const exportedAt = new Date().toISOString();
    const payload = {
      schema_version: 'trellis.reddit-ads.v1',
      deployment_status: 'not_deployed',
      exported_at: exportedAt,
      campaign: {
        ...campaign,
        status: 'exported' as const,
        exportedAt,
        deployment: undefined,
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = `${campaign.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'reddit-ad-campaign'}.json`;
    anchor.click();
    URL.revokeObjectURL(href);
    commitCampaign({ ...campaign, status: 'exported', exportedAt, updatedAt: exportedAt });
    addToast('Campaign package exported. Nothing was deployed.', 'success');
  };

  const updateVariant = (variantId: string, patch: Partial<RedditAdVariant>) => {
    setForm(previous => ({
      ...previous,
      variants: previous.variants.map(variant => variant.id === variantId ? { ...variant, ...patch } : variant),
    }));
  };

  const updateInlineCreativeDraft = (variantId: string, patch: Partial<InlineCreativeDraft>) => {
    setInlineCreativeDrafts(previous => ({
      ...previous,
      [variantId]: {
        isGenerating: false,
        isApproving: false,
        ...previous[variantId],
        ...patch,
      },
    }));
  };

  const generateInlineCreative = async (variant: RedditAdVariant) => {
    const branch = branchContext?.allBranches.find(item => item.slug === form.branchSlug);
    if (!branch) {
      addToast('Choose a brand branch before generating creative.', 'error');
      return;
    }
    if (!variant.headline.trim() || !variant.body.trim()) {
      addToast('Add the headline and body copy before generating creative.', 'error');
      return;
    }
    if (!apiKeys.gemini_api_key) {
      addToast('Gemini API key is not configured. Add it in Settings first.', 'error');
      return;
    }

    updateInlineCreativeDraft(variant.id, {
      isGenerating: true,
      isApproving: false,
      concept: undefined,
      previewUrl: undefined,
      error: undefined,
    });

    try {
      const concepts = await generateCardConcepts({
        apiKey: apiKeys.gemini_api_key,
        brandName: branch.name,
        brandContext: buildInlineCreativeBrandContext(branch),
        brief: [
          'Create one static Reddit image-ad concept for this exact campaign variant.',
          `Headline: ${variant.headline.trim()}`,
          `Supporting copy: ${variant.body.trim()}`,
          `Campaign objective: ${OBJECTIVE_LABELS[form.objective]}.`,
          `Audience: ${form.communityTargets.map(target => `r/${target}`).join(', ') || 'Reddit users'}.`,
          'Make the message readable at feed size. Do not invent features, prices, guarantees, statistics, testimonials, or offers.',
          'Do not use scripture. Keep the design appropriate for a paid Reddit placement and the supplied brand.',
        ].join('\n'),
        count: 1,
        scripturePolicy: 'avoid',
        palette: {
          primary: branch.primary_color,
          secondary: branch.secondary_color,
          accent: branch.accent_color,
        },
        cardStyle: getBrandCardStyle(branch.slug),
      });
      const concept = concepts[0];
      if (!concept) throw new Error('The creative director did not return a usable concept.');
      const previewUrl = await renderCardPreviewDataUrl(concept);
      updateInlineCreativeDraft(variant.id, { concept, previewUrl, isGenerating: false });
      addToast(`${variant.name || 'Variant'} creative is ready for review.`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Creative generation failed.';
      updateInlineCreativeDraft(variant.id, { isGenerating: false, error: message });
      addToast(message, 'error');
    }
  };

  const approveInlineCreative = async (variant: RedditAdVariant) => {
    const draft = inlineCreativeDrafts[variant.id];
    const branch = branchContext?.allBranches.find(item => item.slug === form.branchSlug);
    if (!draft?.concept || !branch) return;

    updateInlineCreativeDraft(variant.id, { isApproving: true, error: undefined });
    try {
      const blob = await renderCardConcept(draft.concept);
      const safeName = (variant.name || 'reddit-ad').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'reddit-ad';
      const file = new File([blob], `${safeName}.jpg`, { type: 'image/jpeg' });
      const assetUrl = await uploadPostImage(branch.slug, file);
      updateVariant(variant.id, { assetUrl });
      updateInlineCreativeDraft(variant.id, { isApproving: false });
      addToast(`${variant.name || 'Variant'} creative approved and attached.`, 'success');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to attach the approved creative.';
      updateInlineCreativeDraft(variant.id, { isApproving: false, error: message });
      addToast(message, 'error');
    }
  };

  const addTarget = (kind: 'community' | 'location') => {
    const raw = kind === 'community' ? communityInput : locationInput;
    const target = kind === 'community' ? normalizeTarget(raw) : raw.trim();
    if (!target) return;
    if (kind === 'community') {
      setForm(previous => ({ ...previous, communityTargets: Array.from(new Set([...previous.communityTargets, target])) }));
      setCommunityInput('');
    } else {
      setForm(previous => ({ ...previous, locationTargets: Array.from(new Set([...previous.locationTargets, target])) }));
      setLocationInput('');
    }
  };

  const branchName = (slug: string) => branchContext?.allBranches.find(branch => branch.slug === slug)?.name || slug || 'Unassigned';

  const metricCards = [
    { label: 'Campaigns', value: totals.campaigns, icon: Megaphone, color: 'text-slate-700' },
    { label: 'In Review', value: totals.review, icon: Clock3, color: 'text-amber-600' },
    { label: 'Approved', value: totals.approved, icon: ShieldCheck, color: 'text-emerald-600' },
    { label: 'Exported', value: totals.exported, icon: Download, color: 'text-indigo-600' },
    { label: 'Deployed', value: totals.deployed, icon: Rocket, color: 'text-blue-600' },
  ];

  return (
    <div className="space-y-8 min-h-screen pb-40">
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-5">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 bg-gradient-to-br from-orange-500 to-red-600 rounded-2xl flex items-center justify-center shadow-lg">
            <Megaphone className="w-7 h-7 text-white" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Reddit Ads</h1>
              <span className="px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700 text-[9px] font-black uppercase tracking-widest">Draft Workspace</span>
            </div>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">Plan, review, and export paid Reddit campaigns</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={startStrategy} className="flex items-center gap-2 px-4 py-2.5 bg-orange-50 border border-orange-200 rounded-xl text-xs font-black text-orange-700 hover:bg-orange-100 transition">
            <BrainCircuit size={15} /> New Strategy
          </button>
          <button type="button" onClick={() => onNavigate('card-studio')} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-600 hover:border-orange-300 transition">
            <ImageIcon size={15} /> Card Studio
          </button>
          <button type="button" onClick={() => onNavigate('video-ad-lab')} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-600 hover:border-orange-300 transition">
            <Video size={15} /> Creative Studio
          </button>
          <button type="button" onClick={startNew} className="flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-orange-600 transition shadow-lg">
            <Plus size={15} /> Create Ad
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {metricCards.map(metric => (
          <div key={metric.label} className="bg-white p-5 rounded-[2rem] border border-slate-200 shadow-sm">
            <metric.icon size={17} className={`${metric.color} mb-3`} />
            <p className={`text-3xl font-black ${metric.color}`}>{metric.value}</p>
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">{metric.label}</p>
          </div>
        ))}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4 flex items-start gap-3">
        <AlertTriangle size={18} className="text-amber-600 mt-0.5 shrink-0" />
        <div>
          <p className="text-xs font-black text-amber-800 uppercase tracking-widest">Deployment intentionally disabled</p>
          <p className="text-xs text-amber-700 mt-1 leading-relaxed">This first increment creates honest campaign drafts and exports. A campaign is never marked deployed without a confirmed Reddit campaign ID, ad group ID, and ad IDs.</p>
        </div>
      </div>

      <div className="flex bg-slate-200/40 p-1.5 rounded-[2rem] w-fit max-w-full overflow-x-auto border border-slate-200 shadow-sm">
        {([
          { id: 'strategy' as const, label: 'Ad Strategist', icon: BrainCircuit },
          { id: 'campaigns' as const, label: 'Campaigns', icon: Megaphone },
          { id: 'create' as const, label: 'Create Ad', icon: Plus },
          { id: 'review' as const, label: `Review (${totals.review})`, icon: ShieldCheck },
          { id: 'performance' as const, label: 'Performance', icon: BarChart3 },
        ]).map(tab => (
          <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2 px-6 py-3 rounded-[1.5rem] text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition ${activeTab === tab.id ? 'bg-white text-orange-700 shadow-lg' : 'text-slate-500 hover:text-slate-800'}`}>
            <tab.icon size={15} /> {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'strategy' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          <div className="xl:col-span-2 space-y-8">
            <section className="bg-white p-8 lg:p-10 rounded-[3rem] border border-slate-200 shadow-sm">
              <div className="flex items-center gap-3 mb-8 pb-6 border-b border-slate-100">
                <BrainCircuit className="text-orange-500" size={22} />
                <div><h2 className="text-lg font-black text-slate-800">Research & Strategy</h2><p className="text-xs text-slate-400">Give Trellis evidence, then review the recommendation before any campaign exists</p></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <label><span className="form-label">Brand Branch</span><select value={strategyForm.branchSlug} onChange={event => { const slug = event.target.value; const website = branchContext?.allBranches.find(branch => branch.slug === slug)?.website_url || ''; setStrategyForm(previous => ({ ...previous, branchSlug: slug, websiteUrl: website, landingPageUrl: website })); }} className="form-input"><option value="">Select branch</option>{branchContext?.allBranches.map(branch => <option key={branch.slug} value={branch.slug}>{branch.name}</option>)}</select></label>
                <label><span className="form-label">Website or Candidate Landing Page</span><div className="relative"><Globe2 size={14} className="absolute left-4 top-3.5 text-slate-400" /><input value={strategyForm.websiteUrl} onChange={event => setStrategyForm(previous => ({ ...previous, websiteUrl: event.target.value }))} placeholder="https://rekkrd.com" className="form-input pl-10" /></div></label>
                <label className="md:col-span-2"><span className="form-label">Product or Offer to Evaluate</span><input value={strategyForm.productName} onChange={event => setStrategyForm(previous => ({ ...previous, productName: event.target.value }))} placeholder="Free trial, subscription, price alerts, or a specific product" className="form-input" /></label>
                <label className="md:col-span-2"><span className="form-label">Product and Website Evidence</span><textarea rows={7} value={strategyForm.productEvidence} onChange={event => setStrategyForm(previous => ({ ...previous, productEvidence: event.target.value }))} placeholder="Paste product-page copy, pricing, features, customer problem, constraints, and anything Trellis must treat as fact." className="form-input resize-none" /><span className="text-[10px] text-slate-400 mt-2 block">A URL identifies the destination; pasted evidence prevents the model from pretending it inspected content it cannot see.</span></label>
              </div>
              <div className="mt-7 flex flex-wrap justify-end gap-3">
                <button type="button" onClick={() => commitStrategy({ ...strategyForm, id: strategyForm.id || `reddit_strategy_${Date.now()}`, updatedAt: new Date().toISOString() })} className="flex items-center gap-2 px-5 py-3 bg-white border border-slate-300 text-slate-700 rounded-xl text-xs font-black uppercase tracking-widest"><Save size={14} /> Save Inputs</button>
                <button type="button" onClick={runStrategy} disabled={isGeneratingStrategy} className="flex items-center gap-2 px-6 py-3 bg-slate-900 disabled:bg-slate-400 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-orange-600 transition"><Sparkles size={14} /> {isGeneratingStrategy ? 'Analyzing…' : 'Generate Strategy'}</button>
              </div>
            </section>

            {(strategyForm.status === 'generated' || strategyForm.status === 'approved') && (
              <section className="bg-white p-8 lg:p-10 rounded-[3rem] border border-slate-200 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-8 pb-6 border-b border-slate-100"><div><h2 className="text-lg font-black text-slate-800">Recommended First Test</h2><p className="text-xs text-slate-400">Editable recommendation · facts and assumptions remain separate</p></div><span className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${strategyForm.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : 'bg-indigo-100 text-indigo-700'}`}>{strategyForm.status}</span></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <label className="md:col-span-2"><span className="form-label">Offer</span><input value={strategyForm.offerName} onChange={event => setStrategyForm(previous => ({ ...previous, offerName: event.target.value, status: 'generated' }))} className="form-input" /></label>
                  <label className="md:col-span-2"><span className="form-label">Why This Test</span><textarea rows={4} value={strategyForm.rationale} onChange={event => setStrategyForm(previous => ({ ...previous, rationale: event.target.value, status: 'generated' }))} className="form-input resize-none" /></label>
                  <label><span className="form-label">Objective</span><select value={strategyForm.objective} onChange={event => setStrategyForm(previous => ({ ...previous, objective: event.target.value as RedditAdObjective, status: 'generated' }))} className="form-input">{Object.entries(OBJECTIVE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  <label><span className="form-label">Recommended Daily Test Budget</span><div className="relative"><DollarSign size={14} className="absolute left-4 top-3.5 text-slate-400" /><input type="number" min="1" value={strategyForm.recommendedDailyBudgetUsd} onChange={event => setStrategyForm(previous => ({ ...previous, recommendedDailyBudgetUsd: Number(event.target.value), status: 'generated' }))} className="form-input pl-10" /></div></label>
                  <label className="md:col-span-2"><span className="form-label">Landing Page</span><input value={strategyForm.landingPageUrl} onChange={event => setStrategyForm(previous => ({ ...previous, landingPageUrl: event.target.value, status: 'generated' }))} className="form-input" /></label>
                  <label className="md:col-span-2"><span className="form-label">Target Audience</span><textarea rows={3} value={strategyForm.targetAudience} onChange={event => setStrategyForm(previous => ({ ...previous, targetAudience: event.target.value, status: 'generated' }))} className="form-input resize-none" /></label>
                  <label><span className="form-label">Community Hypotheses</span><input value={strategyForm.communityTargets.join(', ')} onChange={event => setStrategyForm(previous => ({ ...previous, communityTargets: event.target.value.split(',').map(item => normalizeTarget(item)).filter(Boolean), status: 'generated' }))} className="form-input" /></label>
                  <label><span className="form-label">Locations</span><input value={strategyForm.locationTargets.join(', ')} onChange={event => setStrategyForm(previous => ({ ...previous, locationTargets: event.target.value.split(',').map(item => item.trim()).filter(Boolean), status: 'generated' }))} className="form-input" /></label>
                </div>
                <div className="mt-8 space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Creative Concepts</h3>
                  {strategyForm.creatives.map((creative, index) => <div key={index} className="p-5 bg-slate-50 border border-slate-200 rounded-2xl"><div className="grid grid-cols-1 md:grid-cols-2 gap-4"><label><span className="form-label">Angle</span><input value={creative.angle} onChange={event => updateStrategyCreative(index, { angle: event.target.value })} className="form-input" /></label><label><span className="form-label">Call to Action</span><input value={creative.callToAction} onChange={event => updateStrategyCreative(index, { callToAction: event.target.value })} className="form-input" /></label><label className="md:col-span-2"><span className="form-label">Headline</span><input maxLength={100} value={creative.headline} onChange={event => updateStrategyCreative(index, { headline: event.target.value })} className="form-input" /></label><label className="md:col-span-2"><span className="form-label">Body Copy</span><textarea rows={4} value={creative.body} onChange={event => updateStrategyCreative(index, { body: event.target.value })} className="form-input resize-none" /></label></div></div>)}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-8"><div className="p-5 rounded-2xl bg-rose-50 border border-rose-100"><h3 className="text-[10px] font-black uppercase tracking-widest text-rose-700 mb-3">Risks</h3>{strategyForm.risks.length ? strategyForm.risks.map(item => <p key={item} className="text-xs text-rose-700 mb-2">• {item}</p>) : <p className="text-xs text-rose-500">No risks returned.</p>}</div><div className="p-5 rounded-2xl bg-amber-50 border border-amber-100"><h3 className="text-[10px] font-black uppercase tracking-widest text-amber-700 mb-3">Assumptions to Verify</h3>{strategyForm.assumptions.length ? strategyForm.assumptions.map(item => <p key={item} className="text-xs text-amber-700 mb-2">• {item}</p>) : <p className="text-xs text-amber-500">No assumptions returned.</p>}</div></div>
                {strategyErrors.length > 0 && <div className="mt-6 p-5 rounded-2xl bg-rose-50 border border-rose-200"><div className="flex items-center gap-2 mb-3"><AlertTriangle size={15} className="text-rose-600" /><h3 className="text-[10px] font-black uppercase tracking-widest text-rose-700">Resolve Before Approval</h3></div>{strategyErrors.map(error => <p key={error} className="text-xs text-rose-700 mb-2">• {error}</p>)}</div>}
                <div className="mt-8 flex flex-wrap justify-end gap-3"><button type="button" onClick={approveStrategy} disabled={strategyErrors.length > 0} className="flex items-center gap-2 px-6 py-3 bg-emerald-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl text-xs font-black uppercase tracking-widest"><CheckCircle2 size={14} /> Approve Strategy</button><button type="button" onClick={createCampaignFromStrategy} disabled={strategyForm.status !== 'approved'} className="flex items-center gap-2 px-6 py-3 bg-slate-900 disabled:bg-slate-300 text-white rounded-xl text-xs font-black uppercase tracking-widest"><Megaphone size={14} /> Create Paused Draft</button></div>
              </section>
            )}
          </div>

          <aside className="space-y-6">
            <div className="bg-slate-900 p-7 rounded-[2.5rem] text-white"><h3 className="text-sm font-black uppercase tracking-widest mb-4">Safety Gate</h3><div className="space-y-3 text-xs text-slate-300"><p>AI recommendations remain editable drafts.</p><p>Assumptions must be verified before approval.</p><p>Creating a campaign does not deploy it.</p><p>Billing and launch remain outside this step.</p></div></div>
            <div className="bg-white p-7 rounded-[2.5rem] border border-slate-200 shadow-sm"><h3 className="text-sm font-black text-slate-800 uppercase tracking-widest mb-4">Saved Strategies</h3>{strategies.length === 0 ? <p className="text-xs text-slate-400">No strategy records yet.</p> : <div className="space-y-2">{strategies.slice(0, 6).map(strategy => <button key={strategy.id} type="button" onClick={() => setStrategyForm(strategy)} className="w-full text-left p-3 rounded-xl border border-slate-200 hover:border-orange-300"><p className="text-xs font-black text-slate-700 truncate">{strategy.offerName || strategy.productName || 'Untitled strategy'}</p><p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-1">{branchName(strategy.branchSlug)} · {strategy.status}</p></button>)}</div>}</div>
          </aside>
        </div>
      )}

      {activeTab === 'campaigns' && (
        <section className="bg-white rounded-[3rem] border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-8 border-b border-slate-100 flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-black text-slate-800">Paid Campaigns</h2>
              <p className="text-xs text-slate-400 mt-1">{branchContext && !branchContext.isAllSelected ? `Filtered to ${branchContext.activeBranchSlugs.length} selected branches` : 'All branch campaigns'}</p>
            </div>
            <button type="button" onClick={startNew} className="flex items-center gap-2 px-4 py-2 bg-orange-50 text-orange-700 border border-orange-200 rounded-xl text-[10px] font-black uppercase tracking-widest"><Plus size={13} /> New Campaign</button>
          </div>
          {visibleCampaigns.length === 0 ? (
            <div className="py-24 text-center px-6">
              <Megaphone size={52} className="mx-auto text-slate-200 mb-4" />
              <h3 className="text-lg font-black text-slate-600">No Reddit ad campaigns yet</h3>
              <p className="text-sm text-slate-400 mt-2">Create the first real campaign brief. No sample performance or fake deployments are shown.</p>
              <button type="button" onClick={startNew} className="mt-6 px-6 py-3 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest">Create First Ad</button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {visibleCampaigns.map(campaign => (
                <div key={campaign.id} className="p-6 lg:p-8 flex flex-col lg:flex-row lg:items-center gap-5 hover:bg-slate-50/60 transition">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <h3 className="font-black text-slate-800">{campaign.name || 'Untitled campaign'}</h3>
                      <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${STATUS_STYLES[campaign.status]}`}>{STATUS_LABELS[campaign.status]}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-5 gap-y-2 text-[11px] font-bold text-slate-400">
                      <span>{branchName(campaign.branchSlug)}</span>
                      <span>{OBJECTIVE_LABELS[campaign.objective]}</span>
                      <span>${campaign.dailyBudgetUsd.toFixed(2)}/day</span>
                      <span>{campaign.variants.length} creative{campaign.variants.length === 1 ? '' : 's'}</span>
                      <span>{formatDate(campaign.startAt)} – {formatDate(campaign.endAt)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {campaign.status === 'approved' || campaign.status === 'exported' ? (
                      <button type="button" onClick={() => exportCampaign(campaign)} className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition"><Download size={13} /> Export</button>
                    ) : null}
                    <button type="button" onClick={() => editCampaign(campaign)} className="p-2.5 bg-white border border-slate-200 text-slate-500 rounded-xl hover:text-orange-600 transition" aria-label={`Edit ${campaign.name}`}><Pencil size={15} /></button>
                    {campaign.status === 'draft' || campaign.status === 'rejected' ? (
                      <button type="button" onClick={() => deleteCampaign(campaign.id)} className="p-2.5 bg-white border border-slate-200 text-slate-400 rounded-xl hover:text-rose-600 transition" aria-label={`Delete ${campaign.name}`}><Trash2 size={15} /></button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === 'create' && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          <div className="xl:col-span-2 space-y-8">
            <section className="bg-white p-8 lg:p-10 rounded-[3rem] border border-slate-200 shadow-sm">
              <div className="flex items-center gap-3 mb-8 pb-6 border-b border-slate-100">
                <Target className="text-orange-500" size={22} />
                <div><h2 className="text-lg font-black text-slate-800">Campaign Brief</h2><p className="text-xs text-slate-400">Objective, brand, budget, and schedule</p></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <label className="md:col-span-2"><span className="form-label">Campaign Name</span><input value={form.name} onChange={event => setForm(previous => ({ ...previous, name: event.target.value }))} placeholder="Fall container garden launch" className="form-input" /></label>
                <label><span className="form-label">Brand Branch</span><select value={form.branchSlug} onChange={event => setForm(previous => ({ ...previous, branchSlug: event.target.value }))} className="form-input"><option value="">Select branch</option>{branchContext?.allBranches.map(branch => <option key={branch.slug} value={branch.slug}>{branch.name}</option>)}</select></label>
                <label><span className="form-label">Objective</span><select value={form.objective} onChange={event => setForm(previous => ({ ...previous, objective: event.target.value as RedditAdObjective }))} className="form-input">{Object.entries(OBJECTIVE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><span className="text-[10px] text-slate-400 mt-1 block">{OBJECTIVE_HELP[form.objective]}</span></label>
                <label><span className="form-label">Daily Budget (USD)</span><div className="relative"><DollarSign size={14} className="absolute left-4 top-3.5 text-slate-400" /><input type="number" min="1" step="1" value={form.dailyBudgetUsd} onChange={event => setForm(previous => ({ ...previous, dailyBudgetUsd: Number(event.target.value) }))} className="form-input pl-10" /></div></label>
                <label><span className="form-label">Conversion Pixel ID {form.objective === 'conversions' ? '(Required)' : '(Optional)'}</span><input value={form.conversionPixelId || ''} onChange={event => setForm(previous => ({ ...previous, conversionPixelId: event.target.value }))} placeholder="Reddit pixel ID" className="form-input" /></label>
                <label><span className="form-label">Start</span><input type="datetime-local" value={form.startAt} onChange={event => setForm(previous => ({ ...previous, startAt: event.target.value }))} className="form-input" /></label>
                <label><span className="form-label">End</span><input type="datetime-local" value={form.endAt} onChange={event => setForm(previous => ({ ...previous, endAt: event.target.value }))} className="form-input" /></label>
              </div>
            </section>

            <section className="bg-white p-8 lg:p-10 rounded-[3rem] border border-slate-200 shadow-sm">
              <div className="flex items-center gap-3 mb-8 pb-6 border-b border-slate-100"><Hash className="text-indigo-500" size={22} /><div><h2 className="text-lg font-black text-slate-800">Audience Targeting</h2><p className="text-xs text-slate-400">Communities and locations are validated during deployment</p></div></div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div><span className="form-label">Community Targets</span><div className="flex gap-2"><input value={communityInput} onChange={event => setCommunityInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addTarget('community'); } }} placeholder="r/UrbanGardening" className="form-input" /><button type="button" onClick={() => addTarget('community')} className="px-4 bg-slate-900 text-white rounded-xl"><Plus size={15} /></button></div><div className="flex flex-wrap gap-2 mt-3">{form.communityTargets.map(target => <button type="button" key={target} onClick={() => setForm(previous => ({ ...previous, communityTargets: previous.communityTargets.filter(item => item !== target) }))} className="px-3 py-1.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200 text-[10px] font-black">r/{target} ×</button>)}</div></div>
                <div><span className="form-label">Location Targets</span><div className="flex gap-2"><input value={locationInput} onChange={event => setLocationInput(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); addTarget('location'); } }} placeholder="Georgia, United States" className="form-input" /><button type="button" onClick={() => addTarget('location')} className="px-4 bg-slate-900 text-white rounded-xl"><Plus size={15} /></button></div><div className="flex flex-wrap gap-2 mt-3">{form.locationTargets.map(target => <button type="button" key={target} onClick={() => setForm(previous => ({ ...previous, locationTargets: previous.locationTargets.filter(item => item !== target) }))} className="px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-black">{target} ×</button>)}</div></div>
              </div>
            </section>

            <section className="bg-white p-8 lg:p-10 rounded-[3rem] border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between gap-4 mb-8 pb-6 border-b border-slate-100"><div className="flex items-center gap-3"><Layers3 className="text-emerald-500" size={22} /><div><h2 className="text-lg font-black text-slate-800">Creative Variants</h2><p className="text-xs text-slate-400">Every variant needs copy, a destination, and an approved asset</p></div></div><button type="button" onClick={() => setForm(previous => ({ ...previous, variants: [...previous.variants, newVariant(previous.variants.length + 1)] }))} className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl text-[10px] font-black uppercase tracking-widest"><Plus size={13} /> Add Variant</button></div>
              <div className="space-y-6">
                {form.variants.map((variant, index) => {
                  const FormatIcon = FORMAT_ICONS[variant.format];
                  const creativeDraft = inlineCreativeDrafts[variant.id];
                  return <div key={variant.id} className="p-6 rounded-[2rem] bg-slate-50 border border-slate-200">
                    <div className="flex items-center justify-between gap-3 mb-5"><div className="flex items-center gap-2"><FormatIcon size={16} className="text-orange-500" /><span className="text-xs font-black text-slate-700">{variant.name}</span></div>{form.variants.length > 1 && <button type="button" onClick={() => setForm(previous => ({ ...previous, variants: previous.variants.filter(item => item.id !== variant.id) }))} className="text-slate-300 hover:text-rose-500"><Trash2 size={15} /></button>}</div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <label><span className="form-label">Variant Name</span><input value={variant.name} onChange={event => updateVariant(variant.id, { name: event.target.value })} className="form-input" /></label>
                      <label><span className="form-label">Format</span><select value={variant.format} onChange={event => updateVariant(variant.id, { format: event.target.value as RedditAdFormat })} className="form-input"><option value="image">Image</option><option value="video">Video</option><option value="carousel">Carousel</option></select></label>
                      <label className="md:col-span-2"><span className="form-label">Headline</span><input maxLength={300} value={variant.headline} onChange={event => updateVariant(variant.id, { headline: event.target.value })} placeholder="A clear, specific reason to stop scrolling" className="form-input" /></label>
                      <label className="md:col-span-2"><span className="form-label">Body Copy</span><textarea rows={4} value={variant.body} onChange={event => updateVariant(variant.id, { body: event.target.value })} placeholder="Helpful, transparent copy written for the target community" className="form-input resize-none" /></label>
                      <label><span className="form-label">Call to Action</span><select value={variant.callToAction} onChange={event => updateVariant(variant.id, { callToAction: event.target.value })} className="form-input"><option>Learn More</option><option>Shop Now</option><option>Sign Up</option><option>Download</option><option>Get Quote</option></select></label>
                      <label><span className="form-label">Landing URL</span><input value={variant.landingUrl} onChange={event => updateVariant(variant.id, { landingUrl: event.target.value })} placeholder="https://..." className="form-input" /></label>
                      <label className="md:col-span-2"><span className="form-label">Approved Creative URL</span><input value={variant.assetUrl || ''} onChange={event => updateVariant(variant.id, { assetUrl: event.target.value })} placeholder="Generate one below or paste an approved asset URL" className="form-input" /></label>
                      <div className="md:col-span-2 rounded-2xl border border-orange-200 bg-white p-5">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <div>
                            <p className="text-xs font-black text-slate-800 uppercase tracking-widest">Inline Creative Builder</p>
                            <p className="text-[11px] text-slate-500 mt-1">Generate a preview here. Nothing is uploaded until you approve and attach it.</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => generateInlineCreative(variant)}
                            disabled={creativeDraft?.isGenerating || creativeDraft?.isApproving}
                            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-orange-50 border border-orange-200 text-orange-700 disabled:opacity-50 text-[10px] font-black uppercase tracking-widest"
                          >
                            {creativeDraft?.isGenerating ? <Loader2 size={13} className="animate-spin" /> : <Wand2 size={13} />}
                            {creativeDraft?.isGenerating ? 'Generating…' : creativeDraft?.previewUrl ? 'Regenerate' : 'Generate Creative'}
                          </button>
                        </div>

                        {creativeDraft?.error && <div className="mt-4 flex items-start gap-2 rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs text-rose-700"><AlertTriangle size={14} className="shrink-0 mt-0.5" /><span>{creativeDraft.error}</span></div>}

                        {creativeDraft?.previewUrl && creativeDraft.concept && (
                          <div className="mt-5 grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-5 items-start">
                            <img src={creativeDraft.previewUrl} alt={`${variant.name || `Variant ${index + 1}`} generated creative preview`} className="w-full max-w-[220px] aspect-square object-cover rounded-2xl border border-slate-200 shadow-sm" />
                            <div>
                              <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Preview only</p>
                              <p className="text-xs text-slate-600 leading-relaxed mt-2">{creativeDraft.concept.rationale || 'Review the layout and copy before attaching it to this ad variant.'}</p>
                              <button
                                type="button"
                                onClick={() => approveInlineCreative(variant)}
                                disabled={creativeDraft.isApproving}
                                className="mt-4 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white disabled:bg-emerald-300 text-[10px] font-black uppercase tracking-widest"
                              >
                                {creativeDraft.isApproving ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                                {creativeDraft.isApproving ? 'Attaching…' : 'Approve & Attach'}
                              </button>
                              <p className="text-[10px] text-slate-400 mt-2">This uploads the image and fills the URL. It does not save or submit the campaign.</p>
                            </div>
                          </div>
                        )}

                        {variant.assetUrl && <div className="mt-4 flex items-center gap-2 text-xs font-bold text-emerald-700"><CheckCircle2 size={14} /> Approved creative attached to this variant.</div>}
                      </div>
                    </div>
                  </div>;
                })}
              </div>
            </section>

            <div className="flex flex-wrap justify-end gap-3">
              <button type="button" onClick={saveDraft} className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-300 text-slate-700 rounded-xl text-xs font-black uppercase tracking-widest"><Save size={14} /> Save Draft</button>
              <button type="button" onClick={submitForReview} className="flex items-center gap-2 px-7 py-3 bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-600 transition shadow-lg"><ShieldCheck size={14} /> Submit for Review</button>
            </div>
          </div>

          <aside className="space-y-6">
            <div className="bg-slate-900 p-7 rounded-[2.5rem] text-white sticky top-6">
              <h3 className="text-sm font-black uppercase tracking-widest mb-5">Readiness</h3>
              <div className="space-y-3">{reviewErrors(form).length === 0 ? <div className="flex items-center gap-2 text-emerald-300 text-xs font-bold"><CheckCircle2 size={15} /> Ready for human review</div> : reviewErrors(form).slice(0, 6).map(error => <div key={error} className="flex items-start gap-2 text-slate-300 text-xs"><XCircle size={14} className="text-amber-400 shrink-0 mt-0.5" /><span>{error}</span></div>)}</div>
              <div className="border-t border-slate-700 mt-6 pt-6 space-y-3 text-xs text-slate-300"><div className="flex justify-between"><span>Objective</span><strong className="text-white">{OBJECTIVE_LABELS[form.objective]}</strong></div><div className="flex justify-between"><span>Daily budget</span><strong className="text-white">${Number.isFinite(form.dailyBudgetUsd) ? form.dailyBudgetUsd.toFixed(2) : '0.00'}</strong></div><div className="flex justify-between"><span>Variants</span><strong className="text-white">{form.variants.length}</strong></div><div className="flex justify-between"><span>Communities</span><strong className="text-white">{form.communityTargets.length}</strong></div></div>
            </div>
          </aside>
        </div>
      )}

      {activeTab === 'review' && (
        <div className="space-y-5">
          {reviewCampaigns.length === 0 ? <div className="py-28 text-center bg-slate-50 border-4 border-dashed border-slate-200 rounded-[4rem]"><ShieldCheck size={56} className="mx-auto text-slate-200 mb-4" /><h3 className="text-lg font-black text-slate-500">Review queue is empty</h3><p className="text-sm text-slate-400 mt-2">Complete a campaign brief and submit it for review.</p></div> : reviewCampaigns.map(campaign => <div key={campaign.id} className="bg-white p-7 lg:p-9 rounded-[2.5rem] border border-slate-200 shadow-sm"><div className="flex flex-col lg:flex-row lg:items-start gap-6"><div className="flex-1"><div className="flex flex-wrap items-center gap-2 mb-3"><h3 className="text-lg font-black text-slate-800">{campaign.name}</h3><span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${STATUS_STYLES[campaign.status]}`}>{STATUS_LABELS[campaign.status]}</span></div><div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">{[{ icon: Target, label: OBJECTIVE_LABELS[campaign.objective] }, { icon: DollarSign, label: `$${campaign.dailyBudgetUsd}/day` }, { icon: Hash, label: `${campaign.communityTargets.length} communities` }, { icon: CalendarDays, label: formatDate(campaign.startAt) }].map(item => <div key={item.label} className="flex items-center gap-2 text-[11px] font-bold text-slate-500"><item.icon size={13} className="text-orange-500" />{item.label}</div>)}</div><div className="space-y-3">{campaign.variants.map(variant => <div key={variant.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100"><div className="flex items-center gap-2 mb-2"><span className="text-[9px] font-black uppercase tracking-widest text-indigo-600">{variant.name} · {variant.format}</span></div><p className="text-sm font-black text-slate-700">{variant.headline}</p><p className="text-xs text-slate-500 mt-1 line-clamp-2">{variant.body}</p><a href={variant.landingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 mt-2"><ExternalLink size={10} /> Inspect destination</a></div>)}</div></div><div className="flex lg:flex-col gap-2 shrink-0">{campaign.status === 'pending_review' && <><button type="button" onClick={() => changeStatus(campaign, 'approved')} className="flex items-center justify-center gap-2 px-5 py-3 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest"><CheckCircle2 size={13} /> Approve</button><button type="button" onClick={() => changeStatus(campaign, 'rejected')} className="flex items-center justify-center gap-2 px-5 py-3 bg-white border border-rose-200 text-rose-600 rounded-xl text-[10px] font-black uppercase tracking-widest"><XCircle size={13} /> Changes</button></>}{(campaign.status === 'approved' || campaign.status === 'exported') && <button type="button" onClick={() => exportCampaign(campaign)} className="flex items-center justify-center gap-2 px-5 py-3 bg-indigo-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest"><Download size={13} /> Export Package</button>}<button type="button" onClick={() => editCampaign(campaign)} className="flex items-center justify-center gap-2 px-5 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-widest"><Pencil size={13} /> Edit</button></div></div></div>)}
        </div>
      )}

      {activeTab === 'performance' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 py-28 text-center bg-white border border-slate-200 rounded-[3rem] shadow-sm px-8"><BarChart3 size={58} className="mx-auto text-slate-200 mb-5" /><h3 className="text-xl font-black text-slate-700">No Reddit delivery data connected</h3><p className="text-sm text-slate-400 max-w-xl mx-auto mt-3 leading-relaxed">Spend, impressions, clicks, CTR, CPC, conversions, and ROAS will appear only after the Reddit Ads API reporting connection is implemented. Trellis will not manufacture performance metrics.</p><button type="button" onClick={() => onNavigate('ad-performance')} className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest"><BarChart3 size={13} /> Open Ad Performance</button></div>
          <div className="bg-indigo-50 border border-indigo-200 rounded-[3rem] p-8"><h3 className="text-sm font-black text-indigo-900 uppercase tracking-widest mb-5">Next Integration</h3><div className="space-y-4 text-xs text-indigo-800"><div className="flex gap-3"><Link size={15} className="shrink-0" /><span>Authenticated Reddit Ads developer application</span></div><div className="flex gap-3"><ShieldCheck size={15} className="shrink-0" /><span>Supabase-owned campaign records and approval audit</span></div><div className="flex gap-3"><Rocket size={15} className="shrink-0" /><span>n8n deployment with confirmed provider IDs</span></div><div className="flex gap-3"><BarChart3 size={15} className="shrink-0" /><span>Scheduled reporting sync and attribution</span></div><div className="flex gap-3"><MapPin size={15} className="shrink-0" /><span>Provider validation for communities and locations</span></div></div></div>
        </div>
      )}
    </div>
  );
};

export default RedditGrowth;
