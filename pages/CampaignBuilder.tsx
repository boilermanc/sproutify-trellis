
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { Profile, SpokeConnection, BranchContext, Branch, MarketingEvent, Toast, CampaignChannel, ChannelContent, CampaignTimingRule, ChannelDeployResult, DeployedCampaign, EmailTemplate, BranchStatsResult, EnrichedProfile } from '../types';
import { Segment, PRESET_SEGMENTS, isEventAudienceSegment } from '../segmentTypes';
import { evaluateSegment } from '../segmentEngine';
import { Article } from '../src/data/helpContent';
import HelpLink from '../src/components/HelpLink';
import { createCampaign, fetchCampaignById, fetchCampaigns, saveCampaignDraft, launchCampaignDraft, Campaign, CampaignCreateInput, enqueueCampaignRecipients, pingCampaignSender } from '../supabaseService';
import { loadNameCache } from '../demographicsService';
import { timeAgo, formatBranchName } from '../utils';
import { isSubscribedForAnyBranch } from '../consentUtils';
import { sendEmail, renderCampaignHtml, SendEmailResult } from '../src/services/resendService';
import { generateText } from '../services/aiService';
import { fetchSecrets } from '../services/secretsService';
import { fetchSuppressedEmails } from '../services/suppressionService';
import { fetchNewsletterAudience, NewsletterAudienceRecipient } from '../services/newsletterAudienceService';
import {
  EngagementSummary, fetchEngagementByEmail, fetchLinkInterestByEmail, LinkInterestClickSummary,
} from '../services/emailReportingService';
import { fetchTemplatesForBranch, fetchBrandByBranch } from '../brandRepository';
import { BUILTIN_EMAIL_TEMPLATES } from '../constants';
import CampaignBrandAssetLibrary from '../components/CampaignBrandAssetLibrary';
import {
  applyTemplateImageOverrides,
  extractTemplateImageSlots,
  listBrandGalleryAssets,
  uploadBrandGalleryAsset,
  BrandGalleryAsset,
} from '../services/brandAssetLibraryService';
import {
  Users, Mail, Calendar, Rocket, ChevronRight,
  ChevronLeft, CheckCircle2, Target,
  Layout, Send, Clock, History, Trash2,
  FileText, Sparkles, Megaphone, RefreshCw,
  Info, ShieldCheck, BarChart3,
  Globe, ChevronDown, AlertTriangle,
  Instagram, Twitter, Linkedin, MessageSquare,
  Phone, Zap, ArrowRight, Layers,
  Eye, XCircle, Loader2, Save
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════
// TYPES & CONSTANTS
// ═══════════════════════════════════════════════════════════════

interface CampaignRecord {
  id: string;
  name: string;
  launchedAt: string;
  audienceSize: number;
  branches: string[];
  presets: string[];
  template: string;
  trigger: string;
  status: 'deployed' | 'scheduled' | 'draft';
  channels?: ChannelDeployResult[];
}

const EMAIL_ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface CampaignBuilderProps {
  onCampaignLaunch: (campaign: { name: string, audienceSize: number, segments: string[] }) => void;
  profiles: Profile[];
  branchStats?: BranchStatsResult;
  spokeConnections?: SpokeConnection[];
  branches?: Branch[];
  branchContext?: BranchContext;
  branchSocialAccounts?: Record<string, any[]>;
  addToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
  setEvents?: React.Dispatch<React.SetStateAction<MarketingEvent[]>>;
  onCampaignDeployed?: (campaign: DeployedCampaign) => void;
  onOpenArticle?: (article: Article) => void;
  draftCampaignId?: string | null;
  onDraftIdChange?: (id: string | null) => void;
}

interface CampaignBuilderDraftState {
  version: 1;
  currentStep: number;
  campaignName: string;
  emailSubject: string;
  emailPreviewText: string;
  emailCc: string;
  selectedBranches: string[];
  selectedSegments: string[];
  selectedSavedSegments: string[];
  triggerType: 'immediate' | 'scheduled' | 'staggered';
  enabledChannels: CampaignChannel[];
  channelContents: Record<CampaignChannel, string>;
  activeComposeTab: CampaignChannel;
  emailTemplate: string;
  customTemplateFields: Record<string, string>;
  templateImageOverrides: Record<string, string>;
  timingRules: CampaignTimingRule[];
  scheduledDate: string;
  scheduledTime: string;
  branchContent: Record<string, string>;
}

interface ChannelConfig {
  id: CampaignChannel;
  label: string;
  icon: React.FC<any>;
  charLimit: number;
  placeholder: string;
  gateway: string;
  color: string;
}

// Mailchimp-style "Preview Text" (preheader): the inbox snippet shown after the
// subject line. Injected as a hidden block at the very top of <body> so mail
// clients read it for the preview but it never renders in the email itself. The
// trailing zero-width-joiner + nbsp padding stops the body copy from bleeding
// into the preview after the preview text ends.
const injectPreheader = (html: string, previewText: string): string => {
  const preview = previewText.trim();
  if (!preview) return html;
  const esc = preview.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const spacer = '&nbsp;&zwnj;'.repeat(60);
  const block = `<div style="display:none !important;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#ffffff;opacity:0;">${esc}${spacer}</div>`;
  if (/<body[^>]*>/i.test(html)) {
    return html.replace(/(<body[^>]*>)/i, `$1${block}`);
  }
  // Fragment template with no <body> tag — prepend so it's first in the DOM.
  return block + html;
};

const CHANNEL_CONFIG: ChannelConfig[] = [
  { id: 'email', label: 'Email', icon: Mail, charLimit: 0, placeholder: 'Email is composed via the template system below', gateway: 'resend', color: 'indigo' },
  { id: 'instagram', label: 'Instagram', icon: Instagram, charLimit: 2200, placeholder: 'Write your Instagram caption... Include hashtags for reach.', gateway: 'social_publish', color: 'pink' },
  { id: 'x', label: 'X', icon: Twitter, charLimit: 280, placeholder: 'Craft a punchy post for X (formerly Twitter)...', gateway: 'social_publish', color: 'slate' },
  { id: 'linkedin', label: 'LinkedIn', icon: Linkedin, charLimit: 3000, placeholder: 'Write a professional LinkedIn post...', gateway: 'social_publish', color: 'blue' },
  { id: 'sms', label: 'SMS', icon: Phone, charLimit: 160, placeholder: 'Short SMS message (160 chars)...', gateway: 'sms_dispatch', color: 'emerald' },
];

const STEPS = [
  { id: 'identify', title: 'Identify', icon: Users, desc: 'Audience & Channels' },
  { id: 'compose', title: 'Compose', icon: Layout, desc: 'Multi-Channel Content' },
  { id: 'schedule', title: 'Schedule', icon: Calendar, desc: 'Timing & Sequence' },
  { id: 'deploy', title: 'Deploy', icon: Rocket, desc: 'Review & Launch' },
];

const TEMPLATES = [
  { id: 'UnifiedSproutifyUpdate', name: 'Unified Sproutify Update', icon: Layout, desc: 'Full-featured dynamic newsletter with smart blocks.', color: 'emerald' },
  { id: 'SimpleNewsletter', name: 'Minimal Announcement', icon: FileText, desc: 'Clean, text-focused template for quick updates.', color: 'blue' },
  { id: 'FlashSale', name: 'Promotional Alert', icon: Megaphone, desc: 'High-contrast CTA focus for product launches.', color: 'rose' },
];

const CAMPAIGN_PRESETS = [
  { id: 'high_value', label: 'High-Value Customers', desc: 'Top spenders — over $200 lifetime value. Ideal for VIP offers & early access.', filter: (p: Profile) => p.ltv >= 200, color: 'emerald' },
  { id: 'at_risk', label: 'Churn Risk', desc: 'Slipping away — flagged moderate-to-critical churn. Best for win-back offers.', filter: (p: Profile) => ['moderate', 'high', 'critical'].includes(p.churn_risk), color: 'rose' },
  { id: 'engaged', label: 'Recently Active', desc: 'Warm audience — bought, opened, or clicked in the last 30 days.', filter: (p: Profile) => { const d = p.last_active ? new Date(p.last_active) : null; return d ? (Date.now() - d.getTime()) < 30*24*60*60*1000 : false; }, color: 'blue' },
  { id: 'dormant', label: 'Dormant', desc: 'Gone quiet — no activity in 90+ days. Good for a "we miss you" re-engage.', filter: (p: Profile) => { const d = p.last_active ? new Date(p.last_active) : null; return d ? (Date.now() - d.getTime()) > 90*24*60*60*1000 : true; }, color: 'amber' },
  { id: 'subscribed', label: 'Opted-In', desc: 'Confirmed opt-ins — subscribed and not paused. Always safe to email.', filter: (p: Profile) => p.is_subscribed && !p.marketing_pause, color: 'indigo' },
  { id: 'multi_branch', label: 'Cross-Pollinated', desc: 'Cross-shoppers — active on 2+ Sproutify sites. Your most engaged fans.', filter: (p: Profile) => p.branches.length >= 2, color: 'violet' },
  { id: 'all', label: 'Entire Ecosystem', desc: 'Everyone contactable in the selected branch(es). Broadest reach.', filter: () => true, color: 'slate' },
];

const PRESET_COLOR_MAP: Record<string, { bg: string, border: string, text: string, selectedBg: string }> = {
  emerald: { bg: 'bg-emerald-50', border: 'border-emerald-500', text: 'text-emerald-700', selectedBg: 'bg-emerald-500' },
  rose: { bg: 'bg-rose-50', border: 'border-rose-500', text: 'text-rose-700', selectedBg: 'bg-rose-500' },
  blue: { bg: 'bg-blue-50', border: 'border-blue-500', text: 'text-blue-700', selectedBg: 'bg-blue-500' },
  amber: { bg: 'bg-amber-50', border: 'border-amber-500', text: 'text-amber-700', selectedBg: 'bg-amber-500' },
  indigo: { bg: 'bg-indigo-50', border: 'border-indigo-500', text: 'text-indigo-700', selectedBg: 'bg-indigo-500' },
  violet: { bg: 'bg-violet-50', border: 'border-violet-500', text: 'text-violet-700', selectedBg: 'bg-violet-500' },
  slate: { bg: 'bg-slate-50', border: 'border-slate-400', text: 'text-slate-700', selectedBg: 'bg-slate-500' },
  pink: { bg: 'bg-pink-50', border: 'border-pink-500', text: 'text-pink-700', selectedBg: 'bg-pink-500' },
};

const CHANNEL_COLOR_MAP: Record<string, string> = {
  email: 'indigo',
  instagram: 'pink',
  x: 'slate',
  linkedin: 'blue',
  sms: 'emerald',
};

const SPROUTIFY_ORG_ID = '00000000-0000-0000-0000-000000000001';
const CAMPAIGN_HISTORY_KEY = 'trellis_campaign_history';
const ATL_SPOKE_PROJECT_REF = 'povudgtvzggnxwgtjexa';

// ═══════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════

const CampaignBuilder: React.FC<CampaignBuilderProps> = ({
  onCampaignLaunch,
  profiles,
  branchStats,
  spokeConnections = [],
  branches = [],
  branchContext,
  addToast,
  setEvents,
  onCampaignDeployed,
  onOpenArticle,
  draftCampaignId = null,
  onDraftIdChange,
}) => {
  // Ref for launch interval cleanup on unmount
  const launchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const stepContentRef = useRef<HTMLDivElement>(null);
  const draftHydrationRequestRef = useRef(0);

  // Step state
  const [currentStep, setCurrentStep] = useState(0);

  // Campaign identity
  const [campaignName, setCampaignName] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailPreviewText, setEmailPreviewText] = useState('');
  const [emailCc, setEmailCc] = useState('');
  const emailCcIsValid = !emailCc.trim() || EMAIL_ADDRESS_PATTERN.test(emailCc.trim());
  const [selectedBranches, setSelectedBranches] = useState<string[]>([]);
  const [selectedSegments, setSelectedSegments] = useState<string[]>([]);
  const [selectedSavedSegments, setSelectedSavedSegments] = useState<string[]>([]);
  const [showAudiencePreview, setShowAudiencePreview] = useState(false);
  const [suppressedEmails, setSuppressedEmails] = useState<Set<string>>(new Set());
  const [engagementByEmail, setEngagementByEmail] = useState<Map<string, EngagementSummary>>(new Map());
  const [linkInterestByEmail, setLinkInterestByEmail] = useState<Map<string, LinkInterestClickSummary[]>>(new Map());
  const [selectedTags] = useState<string[]>([]);
  const [triggerType, setTriggerType] = useState<'immediate' | 'scheduled' | 'staggered'>('immediate');

  // Cross-channel state
  const [enabledChannels, setEnabledChannels] = useState<Set<CampaignChannel>>(new Set(['email']));
  const [channelContents, setChannelContents] = useState<Record<CampaignChannel, string>>({
    email: '',
    instagram: '',
    x: '',
    linkedin: '',
    sms: '',
  });
  const [activeComposeTab, setActiveComposeTab] = useState<CampaignChannel>('email');
  const [emailTemplate, setEmailTemplate] = useState('UnifiedSproutifyUpdate');
  const [showEmailPreview, setShowEmailPreview] = useState(false);

  // Custom email templates from DB
  const [customTemplates, setCustomTemplates] = useState<EmailTemplate[]>([]);
  // Brand's unsubscribe URL template (Brand DNA), with a {{token}} placeholder
  // filled per recipient at send. Empty = fall back to the email-based unsubscribe.
  const [brandUnsubscribeUrl, setBrandUnsubscribeUrl] = useState<string>('');
  // Fill-in values keyed by token name (e.g. { headline: '', body_copy: '' }).
  // Keys are discovered from the selected template — NOT hardcoded — so the
  // Compose form always matches whatever tokens the template author placed.
  const [customTemplateFields, setCustomTemplateFields] = useState<Record<string, string>>({});
  const [templateImageOverrides, setTemplateImageOverrides] = useState<Record<string, string>>({});
  const [brandGalleryAssets, setBrandGalleryAssets] = useState<BrandGalleryAsset[]>([]);
  const [isLoadingBrandAssets, setIsLoadingBrandAssets] = useState(false);
  const [isUploadingBrandAsset, setIsUploadingBrandAsset] = useState(false);
  const [brandAssetError, setBrandAssetError] = useState<string | null>(null);
  const isCustomTemplate = emailTemplate.startsWith('custom:');
  // The HTML of the currently-selected template (custom row or built-in).
  const selectedTemplateHtml = isCustomTemplate
    ? (customTemplates.find(t => t.id === emailTemplate.replace('custom:', ''))?.html_body || '')
    : (BUILTIN_EMAIL_TEMPLATES[emailTemplate] || '');
  // The fill-in tokens actually present in the selected template, in order of
  // first appearance. {{first_name}}/{{unsubscribe_url}} are applied per-recipient
  // at send time, so they never become editor fields. Duplicate token names
  // collapse to one field (all occurrences get the same value) — use distinct
  // names ({{body_1}}, {{body_2}}) in the template for independently editable slots.
  const templateTokens = useMemo(() => {
    const AUTO = new Set(['first_name', 'unsubscribe_url']);
    const seen: string[] = [];
    const re = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(selectedTemplateHtml)) !== null) {
      const t = m[1].toLowerCase();
      if (!AUTO.has(t) && !seen.includes(t)) seen.push(t);
    }
    return seen;
  }, [selectedTemplateHtml]);
  const templateHasTokens = templateTokens.length > 0;
  const templateImageSlots = useMemo(
    () => extractTemplateImageSlots(selectedTemplateHtml),
    [selectedTemplateHtml],
  );
  // Pretty label for a token: body_copy -> "Body Copy", cta_url -> "CTA URL".
  const humanizeToken = (t: string) => t
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\bCta\b/g, 'CTA')
    .replace(/\bUrl\b/g, 'URL');

  // Timing rules (staggered sequence)
  const [timingRules, setTimingRules] = useState<CampaignTimingRule[]>([]);

  // Typed helper — avoids `as` casts in JSX
  const channelList: CampaignChannel[] = useMemo(() => [...enabledChannels], [enabledChannels]);

  // Deploy state
  const [channelDeployResults, setChannelDeployResults] = useState<ChannelDeployResult[]>([]);
  const [deployedCampaigns, setDeployedCampaigns] = useState<DeployedCampaign[]>(() => {
    try {
      const saved = localStorage.getItem('trellis_deployed_campaigns');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  // Existing state
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchProgress, setLaunchProgress] = useState(0);
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [testEmailAddress, setTestEmailAddress] = useState('team@sproutify.app');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testSentStatus, setTestSentStatus] = useState<null | 'success'>(null);
  const [testSendError, setTestSendError] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<SendEmailResult | null>(null);
  const [savedCampaigns, setSavedCampaigns] = useState<Campaign[]>([]);
  const [scheduledDate, setScheduledDate] = useState<string>('');
  const [scheduledTime, setScheduledTime] = useState<string>('09:00');
  const [historyOpen, setHistoryOpen] = useState(true);
  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [branchContent, setBranchContent] = useState<Record<string, string>>({});
  const [authoritativeNewsletterAudience, setAuthoritativeNewsletterAudience] = useState<NewsletterAudienceRecipient[] | null>(null);
  const [newsletterAudienceError, setNewsletterAudienceError] = useState<string | null>(null);
  const [isLoadingNewsletterAudience, setIsLoadingNewsletterAudience] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(draftCampaignId);
  const [isDraftHydrated, setIsDraftHydrated] = useState(!draftCampaignId);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [lastDraftSavedAt, setLastDraftSavedAt] = useState<string | null>(null);
  const [draftSaveError, setDraftSaveError] = useState<string | null>(null);

  const [campaignHistory, setCampaignHistory] = useState<CampaignRecord[]>(() => {
    try {
      const saved = localStorage.getItem(CAMPAIGN_HISTORY_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  useEffect(() => {
    localStorage.setItem(CAMPAIGN_HISTORY_KEY, JSON.stringify(campaignHistory));
  }, [campaignHistory]);

  useEffect(() => {
    localStorage.setItem('trellis_deployed_campaigns', JSON.stringify(deployedCampaigns));
  }, [deployedCampaigns]);

  useEffect(() => {
    const loadCampaigns = async () => {
      const campaigns = await fetchCampaigns();
      setSavedCampaigns(campaigns);
    };
    loadCampaigns();
  }, []);

  // Saved engagement and link-interest segments depend on Hub email-event
  // aggregates. Load both maps in bulk so Campaign Builder evaluates the same
  // dynamic membership shown on the Segments page.
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchEngagementByEmail(), fetchLinkInterestByEmail()]).then(([engagement, linkInterest]) => {
      if (cancelled) return;
      setEngagementByEmail(engagement);
      setLinkInterestByEmail(linkInterest);
    });
    return () => { cancelled = true; };
  }, []);

  // Restore a saved draft into the wizard. Audience and consent are deliberately
  // not restored: both are re-evaluated from the live federated sources.
  useEffect(() => {
    const requestId = ++draftHydrationRequestRef.current;
    setDraftId(draftCampaignId);
    onDraftIdChange?.(draftCampaignId);

    if (!draftCampaignId) {
      setIsDraftHydrated(true);
      setLastDraftSavedAt(null);
      setDraftSaveError(null);
      return;
    }

    setIsDraftHydrated(false);
    const restoreDraft = async () => {
      try {
        const campaign = await fetchCampaignById(draftCampaignId);
        if (requestId !== draftHydrationRequestRef.current) return;
        if (!campaign || campaign.status !== 'draft') {
          throw new Error('This campaign draft is no longer available.');
        }

        const saved = campaign.metadata?.builder_state as Partial<CampaignBuilderDraftState> | undefined;
        if (!saved || saved.version !== 1) {
          throw new Error('This draft does not contain resumable builder data.');
        }

        const validChannels = (saved.enabledChannels || []).filter((channel): channel is CampaignChannel =>
          CHANNEL_CONFIG.some(config => config.id === channel)
        );
        const restoredChannels = validChannels.length > 0 ? validChannels : ['email' as CampaignChannel];
        const restoredComposeTab = saved.activeComposeTab && restoredChannels.includes(saved.activeComposeTab)
          ? saved.activeComposeTab
          : restoredChannels[0];

        setCurrentStep(Math.max(0, Math.min(STEPS.length - 1, Number(saved.currentStep) || 0)));
        setCampaignName(saved.campaignName || campaign.name || '');
        setEmailSubject(saved.emailSubject || campaign.subject || '');
        setEmailPreviewText(saved.emailPreviewText || campaign.dispatch?.preview_text || '');
        setEmailCc(saved.emailCc || '');
        setSelectedBranches(Array.isArray(saved.selectedBranches) ? saved.selectedBranches : campaign.branches);
        setSelectedSegments(Array.isArray(saved.selectedSegments) ? saved.selectedSegments : campaign.segments);
        setSelectedSavedSegments(Array.isArray(saved.selectedSavedSegments) ? saved.selectedSavedSegments : []);
        setTriggerType(['immediate', 'scheduled', 'staggered'].includes(saved.triggerType || '') ? saved.triggerType! : 'immediate');
        setEnabledChannels(new Set(restoredChannels));
        setChannelContents({ email: '', instagram: '', x: '', linkedin: '', sms: '', ...(saved.channelContents || {}) });
        setActiveComposeTab(restoredComposeTab);
        setEmailTemplate(saved.emailTemplate || campaign.template || 'UnifiedSproutifyUpdate');
        setCustomTemplateFields(saved.customTemplateFields || {});
        setTemplateImageOverrides(saved.templateImageOverrides || {});
        setTimingRules(Array.isArray(saved.timingRules) ? saved.timingRules : []);
        setScheduledDate(saved.scheduledDate || '');
        setScheduledTime(saved.scheduledTime || '09:00');
        setBranchContent(saved.branchContent || {});
        setConsentConfirmed(false);
        setLastDraftSavedAt(campaign.updated_at);
        setDraftSaveError(null);
        addToast?.(`Draft restored: ${campaign.name}`, 'info');
      } catch (err: any) {
        if (requestId !== draftHydrationRequestRef.current) return;
        console.error('Failed to restore campaign draft:', err);
        setDraftSaveError(err.message || 'Failed to restore campaign draft.');
        addToast?.(err.message || 'Failed to restore campaign draft.', 'error');
      } finally {
        if (requestId === draftHydrationRequestRef.current) setIsDraftHydrated(true);
      }
    };
    restoreDraft();
  }, [draftCampaignId]);

  useEffect(() => {
    loadNameCache();
  }, []);

  // Load custom email templates + the brand's unsubscribe URL when branches change
  useEffect(() => {
    const loadBranchBrandData = async () => {
      if (selectedBranches.length === 0) {
        setCustomTemplates([]);
        setBrandUnsubscribeUrl('');
        return;
      }
      // Resolve the selected branch, normalizing slug/domain/hyphen variants
      // (atl-urban-farms, atlurbanfarms.com, atlurbanfarms all match).
      // NOTE the two tables are keyed differently: email_templates.branch_id is
      // the stable branch UUID, but brand_identities.branch_id is the SLUG. Use
      // the right key for each or the lookup silently returns nothing.
      const norm = (s: string) => (s || '').toLowerCase().replace(/\.(com|app|io|net|org)$/, '').replace(/[^a-z0-9]/g, '');
      const target = norm(selectedBranches[0]);
      const matched = branchContext?.allBranches.find(b => norm(b.slug) === target);
      const branchUuid = matched?.id || selectedBranches[0];
      const branchSlug = matched?.slug || selectedBranches[0];
      try {
        const branchTemplates = await fetchTemplatesForBranch(branchUuid);
        setCustomTemplates(branchTemplates);
      } catch (err) {
        console.error('Failed to load custom templates:', err);
        setCustomTemplates([]);
      }
      try {
        const brand = await fetchBrandByBranch(branchSlug);
        setBrandUnsubscribeUrl(brand?.unsubscribe_url || '');
      } catch (err) {
        console.error('Failed to load brand unsubscribe URL:', err);
        setBrandUnsubscribeUrl('');
      }
    };
    loadBranchBrandData();
  }, [selectedBranches]);

  const brandAssetBranch = useMemo(() => {
    if (selectedBranches.length === 0) return '';
    const normalize = (value: string) => (value || '').toLowerCase().replace(/\.(com|app|io|net|org)$/, '').replace(/[^a-z0-9]/g, '');
    const selected = selectedBranches[0];
    return branchContext?.allBranches.find(branch => normalize(branch.slug) === normalize(selected))?.slug || selected;
  }, [selectedBranches, branchContext]);

  const loadBrandAssets = useCallback(async () => {
    if (!brandAssetBranch) {
      setBrandGalleryAssets([]);
      setBrandAssetError(null);
      return;
    }
    setIsLoadingBrandAssets(true);
    setBrandAssetError(null);
    try {
      setBrandGalleryAssets(await listBrandGalleryAssets(brandAssetBranch));
    } catch (err) {
      setBrandGalleryAssets([]);
      setBrandAssetError(err instanceof Error ? err.message : 'Could not load brand images.');
    } finally {
      setIsLoadingBrandAssets(false);
    }
  }, [brandAssetBranch]);

  useEffect(() => {
    loadBrandAssets();
  }, [loadBrandAssets]);

  const handleBrandAssetUpload = useCallback(async (file: File): Promise<BrandGalleryAsset | null> => {
    setIsUploadingBrandAsset(true);
    setBrandAssetError(null);
    try {
      const asset = await uploadBrandGalleryAsset(brandAssetBranch, file);
      setBrandGalleryAssets(previous => [asset, ...previous.filter(item => item.path !== asset.path)]);
      addToast?.(`Added "${file.name}" to the ${formatBranchName(brandAssetBranch)} asset library.`, 'success');
      return asset;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not upload the image.';
      setBrandAssetError(message);
      addToast?.(message, 'error');
      return null;
    } finally {
      setIsUploadingBrandAsset(false);
    }
  }, [brandAssetBranch, addToast]);

  // Initialize timing rules when channels change
  useEffect(() => {
    const channels = channelList;
    setTimingRules(prev => {
      const existing = new Map(prev.map(r => [r.channel, r]));
      return channels.map((ch, idx) =>
        existing.get(ch) || { channel: ch, delay_hours: idx * 2 }
      );
    });
  }, [enabledChannels]);

  // Reset activeComposeTab if its channel is removed
  useEffect(() => {
    if (!enabledChannels.has(activeComposeTab)) {
      setActiveComposeTab(enabledChannels.has('email') ? 'email' : channelList[0] || 'email');
    }
  }, [enabledChannels]);

  // Clean up launch interval on unmount
  useEffect(() => {
    return () => {
      if (launchIntervalRef.current) {
        clearInterval(launchIntervalRef.current);
      }
    };
  }, []);

  // Scroll to subject field and highlight it when entering Compose step
  useEffect(() => {
    if (currentStep === 1) {
      // Small delay to let the step content render
      const timeout = setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        if (subjectRef.current) {
          subjectRef.current.focus();
          subjectRef.current.classList.add('ring-4', 'ring-emerald-400', 'ring-offset-2');
          setTimeout(() => {
            subjectRef.current?.classList.remove('ring-4', 'ring-emerald-400', 'ring-offset-2');
          }, 2000);
        }
      }, 150);
      return () => clearTimeout(timeout);
    }
  }, [currentStep]);

  // Resolve spoke connection id → branch slug
  const slugByConnectionId = useMemo(() => {
    const map = new Map<string, string>();
    for (const b of branches) {
      if (b.spoke_connection_id && b.slug) {
        map.set(b.spoke_connection_id, b.slug);
      }
    }
    return map;
  }, [branches]);

  const availableBranches = useMemo(() => {
    // The branches table is the source of truth: every active branch is
    // targetable, whether or not it has a spoke DB behind it. Branches whose
    // audience lives Hub-side (spoke_connection_id NULL) used to fall through
    // both of the derived lists below and silently disappear from the picker.
    const fromBranchRecords = branches
      .filter(b => b.is_active !== false && b.slug)
      .map(b => b.slug);
    const fromProfiles = profiles.flatMap(p => p.branches);
    const fromSpokes = spokeConnections
      .filter(c => c.status === 'active')
      .map(c => slugByConnectionId.get(c.id) || c.name);
    return Array.from(new Set([...fromBranchRecords, ...fromProfiles, ...fromSpokes])).filter(Boolean);
  }, [branches, profiles, spokeConnections, slugByConnectionId]);

  const spokeStatusMap = useMemo(() => {
    const map: Record<string, SpokeConnection['status']> = {};
    for (const conn of spokeConnections) {
      const slug = slugByConnectionId.get(conn.id) || conn.name;
      map[slug] = conn.status;
    }
    return map;
  }, [spokeConnections, slugByConnectionId]);

  const atlNewsletterConnectionId = useMemo(() => {
    if (selectedBranches.length !== 1) return null;
    const selected = selectedBranches[0];
    const branch = branches.find(b => b.slug === selected);
    if (!branch?.spoke_connection_id) return null;
    // Only the SELECTED branch's own connection counts — never fall back to "any ATL
    // connection", or a non-ATL branch (e.g. letsrejoice.app) would inherit ATL's
    // newsletter audience and blow the count up to the whole ATL list.
    const connection = spokeConnections.find(c => c.id === branch.spoke_connection_id);
    return connection?.supabase_url?.includes(ATL_SPOKE_PROJECT_REF) ? connection.id : null;
  }, [branches, selectedBranches, spokeConnections]);

  const branchProfileCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const branch of availableBranches) {
      counts[branch] = profiles.filter(p => p.branches.includes(branch)).length;
    }
    return counts;
  }, [profiles, availableBranches]);

  const scopedProfiles = useMemo(() => {
    if (selectedBranches.length === 0) return [];
    const seen = new Set<string>();
    return profiles.filter(p => {
      if (!p.branches.some(b => selectedBranches.includes(b))) return false;
      const key = p.email.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [profiles, selectedBranches]);

  const consentFiltered = useMemo(() => {
    if (selectedBranches.length === 0) return [];
    return scopedProfiles.filter(p =>
      isSubscribedForAnyBranch(p, selectedBranches) &&
      !suppressedEmails.has((p.email || '').toLowerCase())
    );
  }, [scopedProfiles, selectedBranches, suppressedEmails]);

  const eventConsentFiltered = useMemo(() => scopedProfiles.filter((profile) => {
    const email = (profile.email || '').toLowerCase();
    return profile.metadata?.event_notice_consent === true && !suppressedEmails.has(email);
  }), [scopedProfiles, suppressedEmails]);

  useEffect(() => {
    let cancelled = false;
    setAuthoritativeNewsletterAudience(null);
    setNewsletterAudienceError(null);

    if (!atlNewsletterConnectionId) {
      setIsLoadingNewsletterAudience(false);
      return;
    }

    setIsLoadingNewsletterAudience(true);
    fetchNewsletterAudience(atlNewsletterConnectionId)
      .then(rows => {
        if (cancelled) return;
        const seen = new Set<string>();
        const deduped = rows.filter(row => {
          const email = row.email.toLowerCase();
          if (seen.has(email)) return false;
          seen.add(email);
          return !suppressedEmails.has(email);
        });
        setAuthoritativeNewsletterAudience(deduped);
      })
      .catch(err => {
        if (cancelled) return;
        setNewsletterAudienceError(err instanceof Error ? err.message : 'Could not load newsletter audience');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingNewsletterAudience(false);
      });

    return () => { cancelled = true; };
  }, [atlNewsletterConnectionId, suppressedEmails]);

  const authoritativeNewsletterProfiles = useMemo<Profile[]>(() => {
    if (!authoritativeNewsletterAudience || selectedBranches.length !== 1) return [];
    const branch = selectedBranches[0];
    const profilesByEmail = new Map<string, Profile>(profiles.map(p => [p.email.toLowerCase(), p] as const));
    return authoritativeNewsletterAudience.map(row => {
      const existing = profilesByEmail.get(row.email);
      if (existing) return { ...existing, is_subscribed: true, marketing_pause: false };
      return {
        id: row.customer_id || row.email,
        email: row.email,
        first_name: row.first_name || '',
        last_name: row.last_name,
        is_subscribed: true,
        marketing_pause: false,
        tags: ['newsletter_subscriber'],
        segments: [],
        branches: [branch],
        branch_consent: {
          [branch]: {
            subscribed: true,
            paused: false,
            updated_at: new Date().toISOString(),
          },
        },
        status: 'active' as const,
        ltv: existing?.ltv || 0,
        churn_risk: existing?.churn_risk || 'minimal',
        last_active: existing?.last_active,
        metadata: {
          ...(existing?.metadata || {}),
          consent_source: 'newsletter_subscribers',
          subscriber_only: !existing,
        },
      };
    });
  }, [authoritativeNewsletterAudience, profiles, selectedBranches]);

  // Saved Segments — the same rule-based library managed on the Segments page
  // (built-in presets + user-created custom segments from localStorage). These are
  // evaluated with the shared segmentEngine over the ENRICHED profiles so that what
  // you see on the Segments page matches what you can target here.
  const savedSegments = useMemo<Segment[]>(() => {
    const presets: Segment[] = PRESET_SEGMENTS.map((preset, index) => ({
      ...preset,
      id: `preset-${index}`,
      created_at: '',
      updated_at: '',
    }));
    let custom: Segment[] = [];
    try {
      const raw = localStorage.getItem('trellis_custom_segments');
      if (raw) custom = JSON.parse(raw);
    } catch { /* ignore malformed cache */ }
    return [...presets, ...custom];
  }, []);

  // Freeze the selected audience definitions onto every draft/launch. Segment
  // membership stays live, but historical campaign attribution must still say
  // exactly which intent rule Sheree selected at send time.
  const selectedSavedSegmentSnapshot = useMemo(() => selectedSavedSegments
    .map((id) => savedSegments.find((segment) => segment.id === id))
    .filter((segment): segment is Segment => Boolean(segment))
    .map((segment) => ({
      id: segment.id,
      name: segment.name,
      kind: segment.kind || 'rules',
      link_interest: segment.link_interest || null,
      recommended_branches: segment.recommended_branches || [],
    })), [selectedSavedSegments, savedSegments]);

  // For each saved segment, the lowercased set of emails that qualify (evaluated once
  // over every enriched profile). Membership is then intersected with the scoped,
  // consent-filtered audience below — so branch scope + consent are still enforced.
  const savedSegmentEmails = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    const enriched = branchStats?.enrichedProfiles || [];
    for (const seg of savedSegments) {
      // Test lists bypass rule evaluation + consent — handled separately (testListEmails).
      if (seg.kind === 'email_list') continue;
      const emails = new Set<string>();
      for (const ep of enriched) {
        if (ep.email && evaluateSegment(ep, seg, engagementByEmail, linkInterestByEmail)) emails.add(ep.email.toLowerCase());
      }
      // Newsletter-only clickers are intentionally absent from the federated
      // customer profile feed. Seed link-interest membership from the Hub event
      // aggregate, then intersect it with live newsletter consent below.
      if (seg.kind === 'link_interest') {
        for (const email of linkInterestByEmail.keys()) {
          const clickOnlyIdentity: EnrichedProfile = {
            email,
            _spoke_id: 'hub-link-interest',
            _spoke_name: 'Email engagement',
          };
          if (evaluateSegment(clickOnlyIdentity, seg, engagementByEmail, linkInterestByEmail)) emails.add(email);
        }
      }
      map[seg.id] = emails;
    }
    return map;
  }, [savedSegments, branchStats?.enrichedProfiles, engagementByEmail, linkInterestByEmail]);

  const eventSegmentIds = useMemo(() => new Set(
    savedSegments.filter(isEventAudienceSegment).map((segment) => segment.id),
  ), [savedSegments]);
  const isEventAudienceSelected = selectedSavedSegments.some((id) => eventSegmentIds.has(id));

  const segmentProfiles = useMemo(() => {
    if (authoritativeNewsletterAudience && selectedSegments.length === 0 && selectedSavedSegments.length === 0) {
      return authoritativeNewsletterProfiles;
    }
    if (selectedSegments.length === 0 && selectedSavedSegments.length === 0) return consentFiltered;
    const activeFilters = CAMPAIGN_PRESETS.filter(p => selectedSegments.includes(p.id));
    const activeEventSets = selectedSavedSegments
      .filter((id) => eventSegmentIds.has(id))
      .map((id) => savedSegmentEmails[id])
      .filter(Boolean);
    const activeRegularSets = selectedSavedSegments
      .filter((id) => !eventSegmentIds.has(id))
      .map((id) => savedSegmentEmails[id])
      .filter(Boolean);
    const sourceProfiles = authoritativeNewsletterAudience ? authoritativeNewsletterProfiles : consentFiltered;
    if (activeEventSets.length > 0) {
      const newsletterEligible = new Set(sourceProfiles.map((profile) => (profile.email || '').toLowerCase()));
      return scopedProfiles.filter((profile) => {
        const email = (profile.email || '').toLowerCase();
        if (!email || suppressedEmails.has(email)) return false;
        const matchesEvent = activeEventSets.some((set) => set.has(email));
        const matchesRegular = activeFilters.some((preset) => preset.filter(profile))
          || activeRegularSets.some((set) => set.has(email));
        const eventEligible = profile.metadata?.event_notice_consent === true;
        return (matchesEvent && eventEligible) || (matchesRegular && newsletterEligible.has(email));
      });
    }
    return sourceProfiles.filter(profile => {
      const matchesQuick = activeFilters.some(preset => preset.filter(profile));
      const matchesSaved = activeRegularSets.some(set => set.has((profile.email || '').toLowerCase()));
      return matchesQuick || matchesSaved;
    });
  }, [authoritativeNewsletterAudience, authoritativeNewsletterProfiles, consentFiltered, selectedSegments, selectedSavedSegments, savedSegmentEmails, eventSegmentIds, scopedProfiles, suppressedEmails]);

  // Static test-list addresses from any selected 'email_list' segment. These bypass
  // branch scope + consent entirely and are emailed directly (QA sends).
  const testListEmails = useMemo(() => {
    const set = new Set<string>();
    for (const id of selectedSavedSegments) {
      const seg = savedSegments.find(s => s.id === id);
      if (seg?.kind === 'email_list') {
        for (const e of seg.email_list || []) set.add((e || '').toLowerCase());
      }
    }
    return set;
  }, [selectedSavedSegments, savedSegments]);

  // Drop any test address already present in the rule-based audience (avoid dupes).
  const extraTestEmails = useMemo(() => {
    const inAudience = new Set(segmentProfiles.map(p => (p.email || '').toLowerCase()));
    return [...testListEmails].filter(e => !inAudience.has(e));
  }, [testListEmails, segmentProfiles]);

  const audienceSize = segmentProfiles.length + extraTestEmails.length;

  // Same selection as segmentProfiles, but BEFORE consent filtering — lets us show
  // exactly where the drop happens (matched → opted-in → excluded for consent).
  const matchBeforeConsent = useMemo(() => {
    if (selectedBranches.length === 0) return 0;
    if (authoritativeNewsletterAudience && selectedSegments.length === 0 && selectedSavedSegments.length === 0) return authoritativeNewsletterAudience.length;
    if (selectedSegments.length === 0 && selectedSavedSegments.length === 0) return scopedProfiles.length;
    const activeFilters = CAMPAIGN_PRESETS.filter(p => selectedSegments.includes(p.id));
    const activeSavedSets = selectedSavedSegments.map(id => savedSegmentEmails[id]).filter(Boolean);
    return scopedProfiles.filter(profile => {
      const matchesQuick = activeFilters.some(preset => preset.filter(profile));
      const matchesSaved = activeSavedSets.some(set => set.has((profile.email || '').toLowerCase()));
      return matchesQuick || matchesSaved;
    }).length;
  }, [authoritativeNewsletterAudience, scopedProfiles, selectedBranches, selectedSegments, selectedSavedSegments, savedSegmentEmails]);

  const excludedForConsent = Math.max(0, matchBeforeConsent - audienceSize);

  const presetCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const preset of CAMPAIGN_PRESETS) {
      counts[preset.id] = scopedProfiles.filter(p => preset.filter(p)).length;
    }
    return counts;
  }, [scopedProfiles]);

  // Count of each saved segment WITHIN the currently scoped branches (reflects reach here)
  const savedSegmentCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const countProfiles = authoritativeNewsletterAudience ? authoritativeNewsletterProfiles : scopedProfiles;
    for (const seg of savedSegments) {
      if (seg.kind === 'email_list') { counts[seg.id] = seg.email_list?.length || 0; continue; }
      const set = savedSegmentEmails[seg.id];
      counts[seg.id] = set ? countProfiles.filter(p => set.has((p.email || '').toLowerCase())).length : 0;
    }
    return counts;
  }, [savedSegments, savedSegmentEmails, scopedProfiles, authoritativeNewsletterAudience, authoritativeNewsletterProfiles]);

  const enabledChannelCount = enabledChannels.size;

  const draftSnapshot = useMemo<CampaignBuilderDraftState>(() => ({
    version: 1,
    currentStep,
    campaignName,
    emailSubject,
    emailPreviewText,
    emailCc,
    selectedBranches,
    selectedSegments,
    selectedSavedSegments,
    triggerType,
    enabledChannels: channelList,
    channelContents,
    activeComposeTab,
    emailTemplate,
    customTemplateFields,
    templateImageOverrides,
    timingRules,
    scheduledDate,
    scheduledTime,
    branchContent,
  }), [
    currentStep, campaignName, emailSubject, emailPreviewText, emailCc, selectedBranches,
    selectedSegments, selectedSavedSegments, triggerType, channelList,
    channelContents, activeComposeTab, emailTemplate, customTemplateFields,
    templateImageOverrides,
    timingRules, scheduledDate, scheduledTime, branchContent,
  ]);

  // Autosave only once there's REAL content — a name, subject, or body copy. Selecting
  // a branch alone is just scoping and shouldn't spawn an "Untitled campaign" draft
  // (that was the main source of draft clutter on the Campaigns page).
  const hasSaveworthyContent = useMemo(() => (
    !!campaignName.trim()
    || !!emailSubject.trim()
    || !!emailPreviewText.trim()
    || Object.keys(channelContents).some(channel => channelContents[channel as CampaignChannel].trim().length > 0)
    || Object.keys(customTemplateFields).some(field => customTemplateFields[field].trim().length > 0)
    || Object.keys(templateImageOverrides).some(source => templateImageOverrides[source].trim().length > 0)
    || Object.keys(branchContent).some(branch => branchContent[branch].trim().length > 0)
  ), [campaignName, emailSubject, emailPreviewText, channelContents, customTemplateFields, templateImageOverrides, branchContent]);

  const draftSaveInFlightRef = useRef(false);
  const handleSaveDraft = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!isDraftHydrated || isLaunching || draftSaveInFlightRef.current) return;
    draftSaveInFlightRef.current = true;
    setIsSavingDraft(true);

    const scheduledAt = triggerType === 'scheduled' && scheduledDate
      ? new Date(`${scheduledDate}T${scheduledTime}`).toISOString()
      : null;
    const savedAt = new Date().toISOString();
    const { campaign, error } = await saveCampaignDraft(draftId, {
      name: campaignName.trim() || 'Untitled campaign',
      template: emailTemplate,
      subject: emailSubject,
      trigger_type: triggerType === 'immediate' ? 'immediate' : triggerType === 'scheduled' ? 'scheduled' : 'event_based',
      scheduled_at: scheduledAt,
      segments: selectedSegments,
      tags: selectedTags,
      branches: selectedBranches,
      audience_size: audienceSize,
      metadata: {
        builder_state: draftSnapshot,
        query: {
          branches: selectedBranches,
          presets: selectedSegments,
          saved_segments: selectedSavedSegments,
          saved_segment_snapshot: selectedSavedSegmentSnapshot,
          branch_content: branchContent,
        },
        channels: channelList,
        timing_rules: triggerType === 'staggered' ? timingRules : [],
        channel_contents: Object.fromEntries(channelList.map(channel => [channel, channelContents[channel]])),
        draft_saved_at: savedAt,
      },
      created_by: 'app',
      campaign_type: 'standard',
    });

    draftSaveInFlightRef.current = false;
    setIsSavingDraft(false);
    if (!campaign || error) {
      setDraftSaveError(error || 'Draft could not be saved.');
      if (!silent) addToast?.(error || 'Draft could not be saved.', 'error');
      return;
    }

    setDraftId(campaign.id);
    onDraftIdChange?.(campaign.id);
    setLastDraftSavedAt(campaign.updated_at || savedAt);
    setDraftSaveError(null);
    setSavedCampaigns(prev => [campaign, ...prev.filter(existing => existing.id !== campaign.id)]);
    if (!silent) addToast?.('Campaign draft saved.', 'success');
  }, [
    isDraftHydrated, isLaunching, triggerType, scheduledDate, scheduledTime,
    draftId, campaignName, emailTemplate, emailSubject, selectedSegments,
    selectedTags, selectedBranches, audienceSize, draftSnapshot,
    selectedSavedSegments, selectedSavedSegmentSnapshot, branchContent, channelList, timingRules,
    channelContents, addToast, onDraftIdChange,
  ]);

  // Autosave meaningful work after a short idle period. The explicit Save Draft
  // button remains available for an immediate checkpoint.
  useEffect(() => {
    if (!isDraftHydrated || isLaunching || !hasSaveworthyContent) return;
    const timer = window.setTimeout(() => handleSaveDraft({ silent: true }), 1500);
    return () => window.clearTimeout(timer);
  }, [draftSnapshot, isDraftHydrated, isLaunching, hasSaveworthyContent, handleSaveDraft]);

  // ═══════════════════════════════════════════════════════════════
  // HANDLERS
  // ═══════════════════════════════════════════════════════════════

  const toggleBranch = (branch: string) => {
    setSelectedBranches(prev =>
      prev.includes(branch)
        ? prev.filter(b => b !== branch)
        : [...prev, branch]
    );
  };

  const toggleAllBranches = () => {
    setSelectedBranches(prev =>
      prev.length === availableBranches.length ? [] : [...availableBranches]
    );
  };

  const togglePreset = (presetId: string) => {
    setSelectedSegments(prev =>
      prev.includes(presetId)
        ? prev.filter(id => id !== presetId)
        : [...prev, presetId]
    );
  };

  const toggleSavedSegment = (segmentId: string) => {
    setSelectedSavedSegments(prev =>
      prev.includes(segmentId)
        ? prev.filter(id => id !== segmentId)
        : [...prev, segmentId]
    );
  };

  // Load the Hub suppression list (unsubscribes + hard bounces + complaints) so
  // suppressed addresses are excluded from every audience count and send. Mirror
  // the sender's scope logic: a single-branch campaign also honors that branch's
  // per-branch unsubscribes; a multi-branch campaign only honors global rows.
  useEffect(() => {
    const scopes = selectedBranches.length === 1 ? selectedBranches : [];
    fetchSuppressedEmails(scopes).then(setSuppressedEmails);
  }, [selectedBranches]);

  // One-time handoff from the Segments page "Send Campaign" button. Segments may
  // recommend a consent-bearing origin branch; otherwise preserve the established
  // all-branches fallback.
  const handoffAppliedRef = useRef(false);
  useEffect(() => {
    if (handoffAppliedRef.current) return;
    if (draftCampaignId || draftId) return;
    let pending: string | null = null;
    try { pending = localStorage.getItem('trellis_pending_campaign_segment'); } catch { /* ignore */ }
    if (!pending) { handoffAppliedRef.current = true; return; }
    // Wait until segments + branches have loaded before applying the handoff.
    if (savedSegments.length === 0 || availableBranches.length === 0) return;
    handoffAppliedRef.current = true;
    try { localStorage.removeItem('trellis_pending_campaign_segment'); } catch { /* ignore */ }
    const handedOffSegment = savedSegments.find(s => s.id === pending);
    if (handedOffSegment) {
      setSelectedSavedSegments([pending]);
      const recommended = (handedOffSegment.recommended_branches || [])
        .filter((slug) => availableBranches.includes(slug));
      setSelectedBranches(recommended.length > 0 ? recommended : [...availableBranches]);
      setCurrentStep(0);
      setShowAudiencePreview(true);
    }
  }, [savedSegments, availableBranches, draftCampaignId, draftId]);

  // Seed the branch scope from the global Branch Scope picker (top bar) so
  // narrowing the global scope pre-selects those branches here. Runs once, is
  // skipped while a Segments "Send Campaign" handoff is pending, and never
  // overwrites manual changes afterward.
  const scopeSeededRef = useRef(false);
  useEffect(() => {
    if (scopeSeededRef.current) return;
    if (draftCampaignId || draftId) return;
    if (!branchContext || branchContext.isAllSelected) return;
    if (availableBranches.length === 0) return;
    let pending: string | null = null;
    try { pending = localStorage.getItem('trellis_pending_campaign_segment'); } catch { /* ignore */ }
    if (pending) return; // let the handoff effect win
    scopeSeededRef.current = true;
    const active = new Set(branchContext.activeBranchSlugs);
    const seeded = availableBranches.filter(b => active.has(b));
    if (seeded.length) setSelectedBranches(seeded);
  }, [branchContext, availableBranches, draftCampaignId, draftId]);

  const toggleChannel = (channel: CampaignChannel) => {
    setEnabledChannels(prev => {
      const next = new Set(prev);
      if (next.has(channel)) {
        next.delete(channel);
      } else {
        next.add(channel);
      }
      return next;
    });
  };

  const updateChannelContent = (channel: CampaignChannel, content: string) => {
    setChannelContents(prev => ({ ...prev, [channel]: content }));
  };

  const injectVariable = (variable: string) => {
    if (activeComposeTab === 'email') {
      setEmailSubject(prev => prev + ` {{${variable}}}`);
    } else {
      updateChannelContent(activeComposeTab, channelContents[activeComposeTab] + ` {{${variable}}}`);
    }
  };

  const handleAIGenerateAll = async () => {
    if (!emailSubject.trim()) return;
    setIsGeneratingAI(true);

    try {
      const apiKeys = await fetchSecrets(SPROUTIFY_ORG_ID);
      const socialChannels = channelList.filter(ch => ch !== 'email');

      for (const channel of socialChannels) {
        const cfg = CHANNEL_CONFIG.find(c => c.id === channel);
        if (!cfg) continue;

        const result = await generateText(apiKeys, {
          prompt: `Based on this email campaign subject: "${emailSubject}"

Generate a ${cfg.label} post for a gardening/agriculture brand called Sproutify.
${cfg.charLimit > 0 ? `Keep it under ${cfg.charLimit} characters.` : ''}
${channel === 'instagram' ? 'Include relevant hashtags.' : ''}
${channel === 'x' ? 'Be punchy and engaging. Use emojis sparingly.' : ''}
${channel === 'linkedin' ? 'Professional tone. Can include line breaks for readability.' : ''}
${channel === 'sms' ? 'Very concise. Include a CTA. No links.' : ''}

Return ONLY the post content, no explanations or labels.`,
          temperature: 0.8,
          maxTokens: 512,
        });

        if (result.text) {
          updateChannelContent(channel, result.text.trim());
        }
      }

      addToast?.('AI generated content for all enabled channels', 'success');
    } catch (err) {
      console.error('AI generation failed:', err);
      addToast?.('AI generation failed — check API key settings', 'error');
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const updateTimingRule = (channel: CampaignChannel, updates: Partial<CampaignTimingRule>) => {
    setTimingRules(prev =>
      prev.map(r => r.channel === channel ? { ...r, ...updates } : r)
    );
  };

  // Build HTML for the selected template (custom OR built-in — both editable)
  const buildDispatchHtml = (profile: Profile): string => {
    const fill = (html: string) => {
      let out = applyTemplateImageOverrides(html, templateImageOverrides);
      // Replace each discovered token with the value typed in Compose. Empty
      // tokens collapse to '' so a raw {{token}} never leaks into the sent email.
      // A FUNCTION replacer is used (not a string) so `$` sequences in the copy
      // — "Save $$$", "$5 off", "$&" — are inserted literally rather than being
      // interpreted as replacement patterns and silently corrupting the email.
      templateTokens.forEach(token => {
        const re = new RegExp(`\\{\\{\\s*${token}\\s*\\}\\}`, 'gi');
        const value = customTemplateFields[token] || '';
        out = out.replace(re, () => value);
      });
      // Per-recipient personalization. The real campaign launch keeps these tokens
      // INTACT (empty profile) so the campaign-sender worker (durable outbox, NOT
      // n8n) fills them per recipient at batch-send. A test send passes a real
      // profile, so we resolve them here — otherwise the test email's unsubscribe
      // link would be a literal {{unsubscribe_url}} (the send_resend_email RPC is a
      // passthrough and substitutes nothing).
      // Unsubscribe link resolution, in order of preference:
      //  1. Brand-native token URL (Brand DNA) when we have this recipient's token
      //     — the authoritative spoke unsubscribe. campaign-sender uses this same
      //     path on real launches when the brand has a template + a recipient token.
      //  2. Hub email-based unsubscribe — a working fallback for test sends to
      //     addresses that aren't subscribers (no token). Scope it to the selected
      //     branch (single-branch campaign) so the confirmation page names the brand
      //     — e.g. "ATL Urban Farms", not the generic all-brands message. Mirrors the
      //     campaign-sender scope logic; multi-branch falls back to 'global'.
      //  3. Keep the {{unsubscribe_url}} token intact for the launch path (empty
      //     profile) so campaign-sender fills it per recipient with the per-branch scope.
      const testScope = selectedBranches.length === 1 ? selectedBranches[0] : 'global';
      const unsubUrl = (brandUnsubscribeUrl && profile.unsubscribe_token)
        ? brandUnsubscribeUrl.replace(/\{\{\s*token\s*\}\}/gi, () => profile.unsubscribe_token!)
        : profile.email
          ? `https://horvjqqifgrzxesuxtfm.supabase.co/functions/v1/unsubscribe?email=${encodeURIComponent(profile.email)}&scope=${encodeURIComponent(testScope)}`
          : '{{unsubscribe_url}}';
      return out
        .replace(/\{\{\s*first_name\s*\}\}/gi, () => profile.first_name || '{{first_name}}')
        .replace(/\{\{\s*unsubscribe_url\s*\}\}/gi, () => unsubUrl);
    };

    const buildRaw = (): string => {
      if (isCustomTemplate) {
        const ct = customTemplates.find(t => t.id === emailTemplate.replace('custom:', ''));
        if (ct) return fill(ct.html_body);
      }
      if (BUILTIN_EMAIL_TEMPLATES[emailTemplate]) {
        return fill(BUILTIN_EMAIL_TEMPLATES[emailTemplate]);
      }
      return renderCampaignHtml({ profile, subject: emailSubject, templateId: emailTemplate, campaignName });
    };
    // Bake the preview text into the template as a hidden preheader. Run it through
    // fill() too so {{first_name}} resolves — for the launch snapshot (empty profile)
    // the token stays intact and campaign-sender fills it per recipient, exactly like
    // the body copy.
    return injectPreheader(buildRaw(), fill(emailPreviewText));
  };

  const handleSendTest = async () => {
    if (!testEmailAddress || !emailCcIsValid) return;
    setIsSendingTest(true);
    setTestSendError(null);
    setTestSentStatus(null);

    try {
      const testProfile: Profile = {
        id: 'test_send',
        email: testEmailAddress,
        first_name: testEmailAddress.split('@')[0],
        is_subscribed: true,
        marketing_pause: false,
        tags: [],
        segments: [],
        branches: ['trellis.sproutify.app'],
        status: 'active',
        ltv: 0,
        churn_risk: 'minimal',
      };

      const html = buildDispatchHtml(testProfile);

      // Use the first selected branch's from address if available
      const activeBranch = branches.find(b => selectedBranches.includes(b.slug));

      const result = await sendEmail({
        to: testEmailAddress,
        cc: emailCc.trim() || undefined,
        subject: `[TEST] ${emailSubject || 'Campaign Preview'}`,
        html,
        from: activeBranch?.resend_from_address || undefined,
        tags: [
          { name: 'type', value: 'test' },
          { name: 'campaign', value: campaignName || 'untitled' },
        ],
      });

      console.log('Test email sent! Resend ID:', result.id);
      setSendResult(result);
      setTestSentStatus('success');
      setTimeout(() => setTestSentStatus(null), 5000);
    } catch (err: any) {
      console.error('Test send failed:', err);
      setTestSendError(err.message || 'Failed to send test email');
      setTimeout(() => setTestSendError(null), 8000);
    } finally {
      setIsSendingTest(false);
    }
  };

  const handleLaunch = async () => {
    setIsLaunching(true);
    setChannelDeployResults([]);

    const launchedAt = new Date().toISOString();
    const scheduledAt = triggerType === 'scheduled' && scheduledDate
      ? new Date(scheduledDate + 'T' + scheduledTime).toISOString()
      : null;

    const channels = channelList;

    // Initialize all channels as pending
    const pendingResults: ChannelDeployResult[] = channels.map(ch => ({
      channel: ch,
      status: 'pending',
    }));
    setChannelDeployResults(pendingResults);

    // Render the email ONCE and save it on the campaign, so a send can be retried
    // later from exactly what was stored (nothing re-derived). {{first_name}} and
    // {{unsubscribe_url}} stay intact here — the worker fills them per recipient.
    const emailEnabled = enabledChannels.has('email');
    const activeBranch = branches.find(b => selectedBranches.includes(b.slug));
    const dispatch = {
      subject: emailSubject,
      preview_text: emailPreviewText.trim() || undefined,
      from: activeBranch?.resend_from_address || undefined,
      cc: emailCc.trim() || undefined,
      html_template: buildDispatchHtml({ email: '', first_name: '' } as Profile),
      unsubscribe_url_template: brandUnsubscribeUrl || undefined,
    };

    const campaignPayload: CampaignCreateInput = {
      name: campaignName,
      status: triggerType === 'scheduled' ? 'scheduled' : 'active',
      template: emailTemplate,
      subject: emailSubject,
      trigger_type: triggerType === 'immediate' ? 'immediate' : triggerType === 'scheduled' ? 'scheduled' : 'event_based',
      scheduled_at: scheduledAt,
      segments: selectedSegments,
      tags: selectedTags,
      branches: selectedBranches,
      audience_size: audienceSize,
      // Durable outbox: the rendered email is saved, and email campaigns start
      // 'queued' so the campaign-sender worker (immediate ping or pg_cron) drains
      // them. Non-email campaigns leave send_status null (not part of the queue).
      dispatch: emailEnabled ? dispatch : null,
      send_status: emailEnabled ? 'queued' : null,
      metadata: {
        query: {
          branches: selectedBranches,
          presets: selectedSegments,
          saved_segments: selectedSavedSegments,
          saved_segment_snapshot: selectedSavedSegmentSnapshot,
          branch_content: branchContent,
        },
        channels: channels,
        timing_rules: triggerType === 'staggered' ? timingRules : [],
        channel_contents: Object.fromEntries(
          channels.map(ch => [ch, channelContents[ch]])
        ),
        snapshot_audience_size: segmentProfiles.length,
        evaluated_at: new Date().toISOString(),
      },
      created_by: 'app',
      launched_at: triggerType === 'immediate' ? launchedAt : null,
      campaign_type: 'standard',
    };
    const newCampaign = draftId
      ? await launchCampaignDraft(draftId, campaignPayload)
      : await createCampaign(campaignPayload);

    if (!newCampaign) {
      // Persisting the campaign is the gate for sending — if it fails, nothing
      // goes out. Abort loudly instead of playing a fake success animation.
      addToast?.('Campaign could not be saved, so nothing was sent. Please try again.', 'error');
      setIsLaunching(false);
      setChannelDeployResults([]);
      return;
    }
    setDraftId(null);
    onDraftIdChange?.(null);
    setLastDraftSavedAt(null);
    setSavedCampaigns(prev => [newCampaign, ...prev]);

    // Snapshot the EXACT audience into the durable outbox BEFORE any send, so a
    // bombed send is fully retryable from what's saved. segmentProfiles is already
    // deduped by email, consent-filtered, and narrowed to the selected segments/
    // branches. The worker sends in Resend batches and records per-recipient status.
    if (emailEnabled) {
      const recipients = [
        ...segmentProfiles.map(p => ({
          email: p.email,
          first_name: p.first_name || '',
          unsubscribe_token: p.unsubscribe_token || '',
        })),
        // Test-list addresses: emailed directly, bypassing branch scope + consent.
        ...extraTestEmails.map(email => ({ email, first_name: '', unsubscribe_token: '' })),
      ];

      const { inserted, error: enqErr } = await enqueueCampaignRecipients(newCampaign.id, recipients);
      if (enqErr) {
        addToast?.(`Saved the campaign, but only queued ${inserted}/${recipients.length} recipients (${enqErr}). Fix and retry from the Campaigns page.`, 'error');
      } else if (triggerType === 'immediate') {
        // Kick the worker now; scheduled campaigns wait for their time via pg_cron.
        pingCampaignSender();
        addToast?.(`Queued ${inserted} recipient(s) — sending now. Track live status on the Campaigns page.`, 'success');
      } else {
        addToast?.(`Scheduled ${inserted} recipient(s) for ${scheduledAt ? new Date(scheduledAt).toLocaleString() : 'the chosen time'}.`, 'success');
      }
    }

    // Simulate per-channel deployment with staggered progress
    let progress = 0;
    const totalSteps = channels.length * 10;
    let currentChannelIdx = 0;

    launchIntervalRef.current = setInterval(() => {
      progress += 1;
      setLaunchProgress(Math.round((progress / totalSteps) * 100));

      // Flip channels to success as progress advances
      const channelProgress = Math.floor(progress / 10);
      if (channelProgress > currentChannelIdx && currentChannelIdx < channels.length) {
        const completedChannel = channels[currentChannelIdx];
        setChannelDeployResults(prev =>
          prev.map(r =>
            r.channel === completedChannel
              ? { ...r, status: 'success', recipients: audienceSize }
              : r
          )
        );
        currentChannelIdx = channelProgress;
      }

      if (progress >= totalSteps) {
        if (launchIntervalRef.current) clearInterval(launchIntervalRef.current);
        launchIntervalRef.current = null;

        // Mark any remaining channels as success
        setChannelDeployResults(prev =>
          prev.map(r => r.status === 'pending' ? { ...r, status: 'success', recipients: audienceSize } : r)
        );

        const finalResults: ChannelDeployResult[] = channels.map(ch => ({
          channel: ch,
          status: 'success' as const,
          recipients: audienceSize,
        }));

        onCampaignLaunch({
          name: campaignName,
          audienceSize,
          segments: selectedSegments,
        });

        // Save to deployed campaigns
        const newDeployedCampaign: DeployedCampaign = {
          id: `dep_${Date.now()}`,
          name: campaignName,
          date: launchedAt,
          reach: audienceSize,
          channels: finalResults,
        };
        setDeployedCampaigns(prev => [newDeployedCampaign, ...prev]);
        onCampaignDeployed?.(newDeployedCampaign);

        setCampaignHistory(prev => [{
          id: `cmp_${Date.now()}`,
          name: campaignName,
          launchedAt,
          audienceSize,
          branches: selectedBranches,
          presets: selectedSegments,
          template: emailTemplate,
          trigger: triggerType,
          status: triggerType === 'immediate' ? 'deployed' : 'scheduled',
          channels: finalResults,
        }, ...prev]);

        if (setEvents) {
          const newEvent: MarketingEvent = {
            id: `evt_${Date.now()}`,
            profile_id: 'SYSTEM',
            event_type: 'campaign_launched',
            source: 'app',
            payload: {
              campaign_name: campaignName,
              reach: audienceSize,
              channels: channels,
            },
            created_at: launchedAt,
          };
          setEvents(prev => [newEvent, ...prev]);
        }

        setTimeout(() => {
          setIsLaunching(false);
          setLaunchProgress(0);
          setCurrentStep(0);
          setCampaignName('');
          setEmailSubject('');
          setEmailPreviewText('');
          setEmailCc('');
          setSelectedBranches([]);
          setSelectedSegments([]);
          setTriggerType('immediate');
          setEnabledChannels(new Set(['email']));
          setChannelContents({ email: '', instagram: '', x: '', linkedin: '', sms: '' });
          setEmailTemplate('UnifiedSproutifyUpdate');
          setCustomTemplateFields({});
          setTimingRules([]);
          setChannelDeployResults([]);
          setConsentConfirmed(false);
          setScheduledDate('');
          setScheduledTime('09:00');
          setBranchContent({});
        }, 800);
      }
    }, 60);
  };

  // ═══════════════════════════════════════════════════════════════
  // RENDER HELPERS
  // ═══════════════════════════════════════════════════════════════

  const renderChannelSelector = () => (
    <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
      <h4 className="font-black text-slate-800 uppercase tracking-widest text-xs mb-2 flex items-center">
        <Layers size={18} className="mr-3 text-indigo-500" />
        Channel Selector
      </h4>
      <p className="text-[11px] text-slate-400 mb-6">Choose which channels to include in this campaign. Each channel can have its own content.</p>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {CHANNEL_CONFIG.map(cfg => {
          const Icon = cfg.icon;
          const isEnabled = enabledChannels.has(cfg.id);
          const colorKey = CHANNEL_COLOR_MAP[cfg.id] || 'slate';
          const colors = PRESET_COLOR_MAP[colorKey] || PRESET_COLOR_MAP.slate;
          return (
            <button
              type="button"
              key={cfg.id}
              onClick={() => toggleChannel(cfg.id)}
              className={`relative p-5 rounded-2xl border-2 transition-all duration-200 text-center ${
                isEnabled
                  ? `${colors.bg} ${colors.border} shadow-md`
                  : 'border-slate-100 bg-white hover:border-slate-200'
              }`}
            >
              <div className={`w-10 h-10 mx-auto rounded-xl flex items-center justify-center mb-3 ${
                isEnabled ? `${colors.selectedBg} text-white` : 'bg-slate-100 text-slate-400'
              }`}>
                <Icon size={20} />
              </div>
              <p className={`text-[10px] font-black uppercase tracking-tight ${
                isEnabled ? colors.text : 'text-slate-500'
              }`}>
                {cfg.label}
              </p>
              {cfg.charLimit > 0 && (
                <p className="text-[8px] text-slate-400 mt-1">{cfg.charLimit} chars</p>
              )}
              {isEnabled && (
                <div className="absolute top-2 right-2">
                  <CheckCircle2 size={14} className={colors.text} />
                </div>
              )}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
          {enabledChannelCount} Channel{enabledChannelCount !== 1 ? 's' : ''} Enabled
        </span>
        {enabledChannelCount > 1 && (
          <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100">
            Cross-Channel Active
          </span>
        )}
      </div>
    </div>
  );

  const renderSocialCompose = (cfg: ChannelConfig) => {
    const content = channelContents[cfg.id];
    const charCount = content.length;
    const isOverLimit = cfg.charLimit > 0 && charCount > cfg.charLimit;
    const Icon = cfg.icon;

    return (
      <div key={cfg.id} className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              PRESET_COLOR_MAP[CHANNEL_COLOR_MAP[cfg.id]]?.selectedBg || 'bg-slate-500'
            } text-white`}>
              <Icon size={16} />
            </div>
            <span className="text-xs font-black text-slate-800 uppercase tracking-tight">{cfg.label} Content</span>
          </div>
          {cfg.charLimit > 0 && (
            <span className={`text-[10px] font-black ${isOverLimit ? 'text-rose-500' : 'text-slate-400'}`}>
              {charCount}/{cfg.charLimit}
            </span>
          )}
        </div>

        <textarea
          placeholder={cfg.placeholder}
          rows={cfg.id === 'sms' ? 3 : 5}
          className={`w-full bg-slate-50 border-2 rounded-xl px-5 py-4 text-sm focus:bg-white outline-none transition resize-none ${
            isOverLimit ? 'border-rose-300 focus:border-rose-500' : 'border-slate-100 focus:border-emerald-500'
          }`}
          value={content}
          onChange={e => updateChannelContent(cfg.id, e.target.value)}
        />

        {/* Token injection */}
        <div className="flex items-center space-x-3">
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Tokens:</span>
          <HelpLink articleId="art_campaigns_email_modules" variant="inline" label="Token syntax reference" onOpenArticle={onOpenArticle!} />
          <div className="flex gap-2">
            {['first_name', 'branch', 'ltv'].map(v => (
              <button
                key={v}
                onClick={() => {
                  updateChannelContent(cfg.id, content + ` {{${v}}}`);
                }}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[9px] font-black text-slate-600 hover:border-emerald-500 transition-all uppercase tracking-tighter"
              >
                {`{{${v}}}`}
              </button>
            ))}
          </div>
        </div>

        {/* Live preview card */}
        {content.trim() && (
          <div className={`p-4 rounded-xl border-2 ${
            PRESET_COLOR_MAP[CHANNEL_COLOR_MAP[cfg.id]]?.bg || 'bg-slate-50'
          } ${PRESET_COLOR_MAP[CHANNEL_COLOR_MAP[cfg.id]]?.border || 'border-slate-200'}`}>
            <div className="flex items-center space-x-2 mb-2">
              <Eye size={12} className="text-slate-400" />
              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Preview</span>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
              {content.replace(/\{\{first_name\}\}/g, 'Sarah').replace(/\{\{branch\}\}/g, 'ATL Urban Farms').replace(/\{\{ltv\}\}/g, '$247')}
            </p>
          </div>
        )}
      </div>
    );
  };

  const renderChannelReadiness = () => {
    const channels = channelList;
    return (
      <div className="space-y-3">
        {channels.map(ch => {
          const cfg = CHANNEL_CONFIG.find(c => c.id === ch)!;
          const Icon = cfg.icon;
          const content = ch === 'email' ? emailSubject : channelContents[ch];
          const hasContent = !!content?.trim();
          const isOverLimit = cfg.charLimit > 0 && (content?.length || 0) > cfg.charLimit;

          let status: 'ready' | 'warning' | 'error' = 'ready';
          let statusLabel = 'Ready';
          if (!hasContent) { status = 'error'; statusLabel = 'No content'; }
          else if (isOverLimit) { status = 'warning'; statusLabel = 'Over character limit'; }

          const timingRule = timingRules.find(r => r.channel === ch);
          const delay = timingRule?.delay_hours || 0;

          return (
            <div key={ch} className={`flex items-center justify-between p-4 rounded-xl border-2 transition-all ${
              status === 'ready' ? 'bg-emerald-50 border-emerald-200' :
              status === 'warning' ? 'bg-amber-50 border-amber-200' :
              'bg-rose-50 border-rose-200'
            }`}>
              <div className="flex items-center space-x-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  status === 'ready' ? 'bg-emerald-500' :
                  status === 'warning' ? 'bg-amber-500' :
                  'bg-rose-500'
                } text-white`}>
                  <Icon size={16} />
                </div>
                <div>
                  <p className="text-xs font-black text-slate-800 uppercase tracking-tight">{cfg.label}</p>
                  <p className={`text-[10px] font-bold ${
                    status === 'ready' ? 'text-emerald-600' :
                    status === 'warning' ? 'text-amber-600' :
                    'text-rose-600'
                  }`}>
                    {statusLabel}
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                {triggerType === 'staggered' && delay > 0 && (
                  <span className="text-[9px] font-black text-slate-500 bg-slate-100 px-2 py-1 rounded-full">
                    +{delay}h delay
                  </span>
                )}
                {status === 'ready' ? (
                  <CheckCircle2 size={18} className="text-emerald-500" />
                ) : status === 'warning' ? (
                  <AlertTriangle size={18} className="text-amber-500" />
                ) : (
                  <XCircle size={18} className="text-rose-500" />
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ═══════════════════════════════════════════════════════════════
  // STEP RENDERERS
  // ═══════════════════════════════════════════════════════════════

  const renderStep = () => {
    switch (currentStep) {
      // ───── STEP 0: IDENTIFY ─────
      case 0:
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Campaign Name */}
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Campaign Master ID</label>
              <input
                type="text"
                placeholder="e.g. FALL_2024_RECOVERY_PHASE_1"
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-4 text-xl font-black uppercase tracking-tight focus:ring-2 focus:ring-emerald-500 outline-none shadow-sm"
                value={campaignName}
                onChange={e => setCampaignName(e.target.value)}
              />
            </div>

            {/* Branch Targeting */}
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-3">
                  <h4 className="font-black text-slate-800 uppercase tracking-widest text-xs flex items-center">
                    <Globe size={18} className="mr-3 text-emerald-500" />
                    Branch Targeting
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={toggleAllBranches}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border ${
                    selectedBranches.length === availableBranches.length
                      ? 'bg-emerald-600 border-emerald-600 text-white'
                      : 'bg-white border-slate-200 text-slate-500 hover:border-emerald-500'
                  }`}
                >
                  {selectedBranches.length === availableBranches.length ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {availableBranches.map(branch => {
                  const isSelected = selectedBranches.includes(branch);
                  const count = branchProfileCounts[branch] || 0;
                  const connectionStatus = spokeStatusMap[branch];
                  return (
                    <button
                      type="button"
                      key={branch}
                      onClick={() => toggleBranch(branch)}
                      className={`group relative text-left p-5 rounded-2xl border-2 transition-all duration-200 ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-50/50 shadow-md'
                          : 'border-slate-100 bg-white hover:border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                          isSelected ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400'
                        }`}>
                          <Globe size={16} />
                        </div>
                        <div className="flex items-center space-x-2">
                          {connectionStatus && (
                            <span className={`w-2 h-2 rounded-full ${
                              connectionStatus === 'active' ? 'bg-emerald-500' :
                              connectionStatus === 'error' ? 'bg-rose-500' : 'bg-slate-400'
                            }`} />
                          )}
                          {isSelected && <CheckCircle2 size={16} className="text-emerald-600" />}
                        </div>
                      </div>
                      <h5 className="font-black text-slate-800 text-xs uppercase tracking-tight mb-0.5">{formatBranchName(branch)}</h5>
                      <div className="flex items-center space-x-1">
                        <Users size={10} className="text-slate-400" />
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{count}</span>
                      </div>
                    </button>
                  );
                })}
                {availableBranches.length === 0 && (
                  <div className="col-span-full p-8 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200">
                    <Globe size={32} className="mx-auto text-slate-300 mb-3" />
                    <p className="font-black text-slate-400 uppercase tracking-widest text-xs">No Branches Connected</p>
                  </div>
                )}
              </div>
            </div>

            {/* Segment Engine */}
            <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
              <div className="flex items-center space-x-3 mb-2">
                <h4 className="font-black text-slate-800 uppercase tracking-widest text-xs flex items-center">
                  <Target size={18} className="mr-3 text-indigo-500" />
                  Segment Engine
                </h4>
                <HelpLink articleId="art_gs_build_segment" variant="badge" label="Segment guide" onOpenArticle={onOpenArticle!} />
              </div>
              <p className="text-[11px] text-slate-400 mb-3">Select one or more segments. Everything you select combines with OR logic.</p>
              <div className="flex items-start gap-2 mb-6 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-2.5">
                <Info size={13} className="text-amber-500 mt-0.5 shrink-0" />
                <p className="text-[10px] text-amber-700 leading-relaxed">
                  Counts here are <b>who you can actually email</b> — people in your selected branch(es) who are opted-in and not paused. This is normally lower than the total shown on the Segments page, which counts everyone regardless of consent.
                </p>
              </div>

              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Quick Filters</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {CAMPAIGN_PRESETS.map(preset => {
                  const isActive = selectedSegments.includes(preset.id);
                  const count = presetCounts[preset.id] || 0;
                  const colors = PRESET_COLOR_MAP[preset.color] || PRESET_COLOR_MAP.slate;
                  return (
                    <button
                      type="button"
                      key={preset.id}
                      onClick={() => togglePreset(preset.id)}
                      className={`text-left p-4 rounded-2xl border-2 transition-all duration-200 flex items-center justify-between ${
                        isActive
                          ? `${colors.bg} ${colors.border} shadow-md`
                          : 'border-slate-100 bg-white hover:border-slate-200'
                      }`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className={`w-1.5 h-10 rounded-full ${isActive ? colors.selectedBg : 'bg-slate-200'}`} />
                        <div>
                          <p className={`text-xs font-black uppercase tracking-tight ${isActive ? colors.text : 'text-slate-700'}`}>
                            {preset.label}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{preset.desc}</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className={`text-sm font-black ${isActive ? colors.text : 'text-slate-400'}`}>{count}</span>
                        {isActive && <CheckCircle2 size={16} className={colors.text} />}
                      </div>
                    </button>
                  );
                })}
              </div>

              {/* Saved Segments — mirror of the Segments page (built-in presets + your custom segments) */}
              <div className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    Saved Segments <span className="text-slate-300 normal-case font-medium tracking-normal">· from the Segments page</span>
                  </p>
                  <span className="text-[10px] font-bold text-indigo-400">{savedSegments.length} available</span>
                </div>

                {savedSegments.length === 0 ? (
                  <p className="text-[11px] text-slate-400 bg-slate-50 rounded-2xl px-4 py-3">
                    Build reusable, rule-based segments on the <b className="text-slate-500">Segments</b> page and they'll appear here automatically.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {savedSegments.map(seg => {
                      const isActive = selectedSavedSegments.includes(seg.id);
                      const count = savedSegmentCounts[seg.id] || 0;
                      const isPreset = seg.id.startsWith('preset-');
                      return (
                        <button
                          type="button"
                          key={seg.id}
                          onClick={() => toggleSavedSegment(seg.id)}
                          className={`text-left p-4 rounded-2xl border-2 transition-all duration-200 flex items-center justify-between ${
                            isActive
                              ? 'bg-indigo-50 border-indigo-300 shadow-md'
                              : 'border-slate-100 bg-white hover:border-slate-200'
                          }`}
                        >
                          <div className="flex items-center space-x-3 min-w-0">
                            <div className={`w-1.5 h-10 rounded-full ${isActive ? 'bg-indigo-500' : 'bg-slate-200'}`} />
                            <div className="min-w-0">
                              <p className={`text-xs font-black uppercase tracking-tight truncate ${isActive ? 'text-indigo-700' : 'text-slate-700'}`}>
                                {seg.name}
                                {seg.kind === 'email_list'
                                  ? <span className="ml-2 text-[8px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full align-middle tracking-normal">TEST</span>
                                  : seg.kind === 'link_interest'
                                    ? <span className="ml-2 text-[8px] bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded-full align-middle tracking-normal">INTENT</span>
                                  : !isPreset && <span className="ml-2 text-[8px] bg-emerald-100 text-emerald-600 px-1.5 py-0.5 rounded-full align-middle tracking-normal">CUSTOM</span>}
                              </p>
                              {seg.description && <p className="text-[10px] text-slate-400 mt-0.5 truncate">{seg.description}</p>}
                            </div>
                          </div>
                          <div className="flex items-center space-x-2 shrink-0 pl-2">
                            <span className={`text-sm font-black ${isActive ? 'text-indigo-700' : 'text-slate-400'}`}>{count}</span>
                            {isActive && <CheckCircle2 size={16} className="text-indigo-700" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {testListEmails.size > 0 && (
                  <div className="mt-3 flex items-start gap-2 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3">
                    <AlertTriangle size={15} className="shrink-0 mt-0.5" />
                    <span>
                      Test list active — {extraTestEmails.length} {extraTestEmails.length === 1 ? 'address' : 'addresses'} will be emailed
                      <b> directly, bypassing branch scope and consent</b>. The selected branch still sets the “from” address.
                    </span>
                  </div>
                )}
                {isEventAudienceSelected && (
                  <div className="mt-3 flex items-start gap-2 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-[11px] font-semibold text-teal-800">
                    <Calendar size={15} className="mt-0.5 shrink-0" />
                    <span><b>Event audience active.</b> Event-specific consent is valid only for notices about the event(s) these people registered for. Do not use this audience for general promotions or newsletters.</span>
                  </div>
                )}
              </div>

              {/* Audience Preview — see who's actually in the segment (no more selecting blind) */}
              <div className="mt-6 pt-6 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAudiencePreview(v => !v)}
                  disabled={selectedBranches.length === 0}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border transition-all ${
                    selectedBranches.length === 0
                      ? 'border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed'
                      : 'border-indigo-100 bg-indigo-50/60 text-indigo-700 hover:bg-indigo-50'
                  }`}
                >
                  <span className="flex items-center text-[11px] font-black uppercase tracking-widest">
                    <Eye size={15} className="mr-2.5" />
                    Preview this audience
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-xs font-black">
                      {isLoadingNewsletterAudience ? 'Loading...' : `${audienceSize} ${audienceSize === 1 ? 'person' : 'people'}`}
                    </span>
                    <ChevronDown size={16} className={`transition-transform ${showAudiencePreview ? 'rotate-180' : ''}`} />
                  </span>
                </button>

                {newsletterAudienceError && (
                  <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-[11px] font-bold text-amber-700">
                    Could not load ATL newsletter audience: {newsletterAudienceError}. Trellis is showing the federated fallback count.
                  </div>
                )}

                {showAudiencePreview && (
                  <div className="mt-3">
                    {selectedBranches.length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-4">Pick a branch above to see who qualifies.</p>
                    ) : isLoadingNewsletterAudience ? (
                      <div className="py-6 text-center text-xs font-bold text-slate-400 flex items-center justify-center gap-2">
                        <Loader2 size={14} className="animate-spin" /> Loading authoritative newsletter audience...
                      </div>
                    ) : audienceSize === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-4">
                        No opted-in customers match {selectedSegments.length > 0 ? 'these presets' : 'this branch'} yet — try {selectedSegments.length > 0 ? 'different or fewer presets' : 'another branch'}.
                      </p>
                    ) : (
                      <>
                        <div className="space-y-1.5">
                          {segmentProfiles.slice(0, 8).map(p => (
                            <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-slate-50">
                              <div className="min-w-0 flex-1">
                                <p className="text-xs font-bold text-slate-700 truncate">
                                  {p.first_name || 'Unknown'}
                                  <span className="font-normal text-slate-400 ml-2">{p.email}</span>
                                </p>
                              </div>
                              <div className="flex items-center gap-3 shrink-0 text-[10px] font-black">
                                <span className="text-emerald-600" title="Lifetime value">${Math.round(p.ltv || 0)}</span>
                                <span className="text-slate-400" title="Last activity">{p.last_active ? timeAgo(p.last_active) : 'no activity'}</span>
                              </div>
                            </div>
                          ))}
                          {segmentProfiles.length < 8 && extraTestEmails.slice(0, 8 - segmentProfiles.length).map(email => (
                            <div key={`test-${email}`} className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-amber-50">
                              <p className="text-xs font-normal text-slate-500 truncate min-w-0 flex-1">{email}</p>
                              <span className="text-[9px] font-black uppercase bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full shrink-0">Test</span>
                            </div>
                          ))}
                        </div>
                        {audienceSize > 8 && (
                          <p className="text-[10px] text-slate-400 text-center mt-2.5 font-medium">
                            + {audienceSize - 8} more not shown — this is a sample of the full {audienceSize}-person audience.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Channel Selector Grid */}
            {renderChannelSelector()}

            {/* Reach Summary */}
            <div className={`p-8 rounded-[2.5rem] border-4 transition-all duration-500 ${
              audienceSize > 0 ? 'bg-emerald-50 border-emerald-500/10' : 'bg-slate-50 border-slate-100'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-6">
                  <div className={`w-16 h-16 rounded-[1.5rem] flex items-center justify-center shadow-lg ${audienceSize > 0 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-white'}`}>
                    <Users size={32} />
                  </div>
                  <div>
                    <p className="text-slate-400 text-[10px] font-black uppercase tracking-[0.2em]">Strategy Reach</p>
                    <p className="text-3xl font-black text-slate-800">{isLoadingNewsletterAudience ? '...' : audienceSize} Identities</p>
                    {authoritativeNewsletterAudience && (
                      <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest mt-1">
                        ATL newsletter source of truth
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-right space-y-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{selectedBranches.length} Branches</p>
                  <p className="text-[10px] font-black text-indigo-600">{enabledChannelCount} Channels</p>
                </div>
              </div>

              {/* Consent breakdown — where the drop happens */}
              {matchBeforeConsent > 0 && (
                <div className="mt-6 pt-6 border-t border-emerald-500/10">
                  <div className="grid grid-cols-3 gap-2">
                    <div className="text-center">
                      <p className="text-2xl font-black text-slate-700">{matchBeforeConsent}</p>
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-1">Match the rules</p>
                    </div>
                    <div className="text-center border-x border-slate-200/70">
                      <p className="text-2xl font-black text-emerald-600">{audienceSize}</p>
                      <p className="text-[9px] font-black uppercase tracking-widest text-emerald-500 mt-1">Opted-in · will send</p>
                    </div>
                    <div className="text-center">
                      <p className={`text-2xl font-black ${excludedForConsent > 0 ? 'text-amber-500' : 'text-slate-300'}`}>{excludedForConsent}</p>
                      <p className="text-[9px] font-black uppercase tracking-widest text-amber-500/80 mt-1">Excluded · no consent</p>
                    </div>
                  </div>
                  {excludedForConsent > 0 && (
                    <p className="text-[10px] text-slate-400 text-center mt-4 leading-relaxed">
                      {excludedForConsent} {excludedForConsent === 1 ? 'person matches' : 'people match'} this segment but {excludedForConsent === 1 ? "isn't" : "aren't"} subscribed (or {excludedForConsent === 1 ? 'is' : 'are'} paused), so they'll be skipped. Only the <b className="text-emerald-600">{audienceSize} opted-in</b> will receive this campaign.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        );

      // ───── STEP 1: COMPOSE ─────
      case 1:
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Channel Tabs */}
            <div className="flex items-center space-x-2 overflow-x-auto pb-2">
              {channelList.map(ch => {
                const cfg = CHANNEL_CONFIG.find(c => c.id === ch)!;
                const Icon = cfg.icon;
                const isActive = activeComposeTab === ch;
                const colorKey = CHANNEL_COLOR_MAP[ch];
                const colors = PRESET_COLOR_MAP[colorKey] || PRESET_COLOR_MAP.slate;
                return (
                  <button
                    key={ch}
                    onClick={() => setActiveComposeTab(ch)}
                    className={`flex items-center space-x-2 px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border-2 whitespace-nowrap ${
                      isActive
                        ? `${colors.bg} ${colors.border} ${colors.text}`
                        : 'border-transparent bg-slate-50 text-slate-400 hover:bg-slate-100'
                    }`}
                  >
                    <Icon size={14} />
                    <span>{cfg.label}</span>
                    {ch !== 'email' && channelContents[ch]?.trim() && (
                      <CheckCircle2 size={12} className="text-emerald-500" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* AI Generate All Button */}
            {enabledChannels.size > 1 && emailSubject.trim() && (
              <button
                onClick={handleAIGenerateAll}
                disabled={isGeneratingAI}
                className="w-full px-6 py-4 bg-gradient-to-r from-indigo-500 to-purple-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center space-x-3 shadow-xl hover:shadow-2xl transition-all disabled:opacity-50"
              >
                {isGeneratingAI ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Sparkles size={18} />
                )}
                <span>{isGeneratingAI ? 'Generating Content...' : 'AI: Generate All from Email Subject'}</span>
              </button>
            )}

            {/* Email Compose */}
            {activeComposeTab === 'email' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-200">
                <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm space-y-6">
                  <div className="flex justify-between items-end">
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Email Subject Line</label>
                    <div className="flex items-center space-x-1 text-[10px] font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full border border-emerald-100 uppercase tracking-widest">
                      <Sparkles size={12} />
                      <span>AI Optimization On</span>
                    </div>
                  </div>
                  <input
                    ref={subjectRef}
                    type="text"
                    placeholder="e.g. A specialized update for you, {{first_name}}!"
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-6 py-5 text-xl font-bold focus:bg-white focus:border-emerald-500 outline-none transition-all duration-300 shadow-inner"
                    value={emailSubject}
                    onChange={e => setEmailSubject(e.target.value)}
                  />

                  {/* Preview Text (a.k.a. preheader) — the inbox snippet shown right
                      after the subject. Baked into the sent HTML as a hidden block. */}
                  <div>
                    <div className="flex justify-between items-end mb-2">
                      <label htmlFor="campaign-preview-text" className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Preview Text <span className="font-bold normal-case tracking-normal text-slate-400">(inbox preheader)</span>
                      </label>
                      <span className={`text-[10px] font-bold ${emailPreviewText.length > 150 ? 'text-amber-500' : 'text-slate-300'}`}>
                        {emailPreviewText.length}/150
                      </span>
                    </div>
                    <input
                      id="campaign-preview-text"
                      type="text"
                      placeholder="Shown in the inbox after the subject — e.g. Buy gift cards now and save on summer seedlings."
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl px-5 py-3.5 text-sm font-bold text-slate-800 focus:bg-white focus:border-emerald-500 outline-none transition-all duration-300 shadow-inner"
                      value={emailPreviewText}
                      onChange={e => setEmailPreviewText(e.target.value)}
                    />
                    <p className="mt-1.5 text-[10px] text-slate-400 font-medium">
                      Optional. Most inboxes show the first ~90–150 characters. Supports <span className="font-mono">{'{{first_name}}'}</span>.
                    </p>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-[9rem_1fr] sm:items-center">
                    <label htmlFor="campaign-email-cc" className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                      CC <span className="font-bold normal-case tracking-normal text-slate-400">(optional)</span>
                    </label>
                    <div>
                      <input
                        id="campaign-email-cc"
                        type="email"
                        placeholder="proof@sproutify.app"
                        className={`w-full rounded-2xl border-2 bg-white px-5 py-3 text-sm font-bold text-slate-800 outline-none transition focus:border-cyan-500 ${
                          !emailCcIsValid
                            ? 'border-rose-300'
                            : 'border-slate-200'
                        }`}
                        value={emailCc}
                        onChange={e => setEmailCc(e.target.value)}
                        aria-invalid={!emailCcIsValid}
                        aria-describedby="campaign-email-cc-help"
                      />
                      <p id="campaign-email-cc-help" className={`mt-2 text-[10px] font-bold ${
                        !emailCcIsValid
                          ? 'text-rose-600'
                          : 'text-slate-400'
                      }`}>
                        {!emailCcIsValid
                          ? 'Enter one valid email address.'
                          : 'Receives a copy of test sends and every email in this campaign.'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Token Injection:</span>
                    <div className="flex gap-2">
                      {['first_name', 'email', 'branch', 'ltv'].map(v => (
                        <button
                          key={v}
                          onClick={() => injectVariable(v)}
                          className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[9px] font-black text-slate-600 hover:border-emerald-500 transition-all uppercase tracking-tighter"
                        >
                          {`{{${v}}}`}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* All layouts are editable — soft guidance */}
                <div className="flex items-start gap-2 rounded-2xl bg-slate-50 border border-slate-200 p-4">
                  <Info size={16} className="mt-0.5 text-slate-400 shrink-0" />
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Pick any layout below and fill in your <b>Headline / Body Copy / CTA</b> &mdash; every layout is ready to use. Want a fully branded template? Build one in <b>Brand Intelligence &rarr; Brand DNA &rarr; Email Templates</b> and it'll show up in the violet <b className="text-violet-600">Custom Templates</b> row.
                  </p>
                </div>

                {/* Template Picker */}
                <div className="space-y-6">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">Email Template</label>

                  {/* Custom Templates from DB */}
                  {customTemplates.length > 0 && (
                    <>
                      <p className="text-[9px] font-black text-violet-500 uppercase tracking-widest px-4">Custom Templates</p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {customTemplates.map(ct => {
                          const ctId = `custom:${ct.id}`;
                          return (
                            <button
                              key={ctId}
                              onClick={() => setEmailTemplate(ctId)}
                              className={`group relative text-left p-6 rounded-[2rem] border-4 transition-all duration-300 ${
                                emailTemplate === ctId
                                ? 'border-emerald-500 bg-emerald-50/50 shadow-xl scale-[1.02]'
                                : 'border-slate-100 bg-white hover:border-slate-200'
                              }`}
                            >
                              <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-6 transition-transform group-hover:rotate-6 ${
                                emailTemplate === ctId ? 'bg-emerald-600 text-white' : 'bg-violet-100 text-violet-500 shadow-inner'
                              }`}>
                                <Mail size={24} />
                              </div>
                              <h5 className="font-black text-slate-800 text-sm mb-2 uppercase tracking-tight">{ct.name}</h5>
                              <p className="text-[11px] text-slate-500 leading-relaxed font-medium">{ct.description || 'Custom template'}</p>
                              {emailTemplate === ctId && (
                                <div className="absolute top-4 right-4 text-emerald-600">
                                  <CheckCircle2 size={20} />
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-4 pt-2">Built-in Templates</p>
                    </>
                  )}

                  {/* Built-in fallback templates */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {TEMPLATES.map(tmpl => (
                      <button
                        key={tmpl.id}
                        onClick={() => setEmailTemplate(tmpl.id)}
                        className={`group relative text-left p-6 rounded-[2rem] border-4 transition-all duration-300 ${
                          emailTemplate === tmpl.id
                          ? 'border-emerald-500 bg-emerald-50/50 shadow-xl scale-[1.02]'
                          : 'border-slate-100 bg-white hover:border-slate-200'
                        }`}
                      >
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-6 transition-transform group-hover:rotate-6 ${
                          emailTemplate === tmpl.id ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400 shadow-inner'
                        }`}>
                          <tmpl.icon size={24} />
                        </div>
                        <h5 className="font-black text-slate-800 text-sm mb-2 uppercase tracking-tight">{tmpl.name}</h5>
                        <p className="text-[11px] text-slate-500 leading-relaxed font-medium">{tmpl.desc}</p>
                        {emailTemplate === tmpl.id && (
                          <div className="absolute top-4 right-4 text-emerald-600">
                            <CheckCircle2 size={20} />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Compose fields + live preview, side by side */}
                {!!emailTemplate && (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
                    {/* LEFT — fill-in fields (token templates) or as-is note */}
                    <div className="space-y-4">
                      <CampaignBrandAssetLibrary
                        brandName={formatBranchName(brandAssetBranch || selectedBranches[0] || 'selected brand')}
                        assets={brandGalleryAssets}
                        imageSlots={templateImageSlots}
                        imageOverrides={templateImageOverrides}
                        isLoading={isLoadingBrandAssets}
                        isUploading={isUploadingBrandAsset}
                        error={brandAssetError}
                        onRefresh={loadBrandAssets}
                        onUpload={handleBrandAssetUpload}
                        onSelect={(originalSource, assetUrl) => setTemplateImageOverrides(previous => ({ ...previous, [originalSource]: assetUrl }))}
                        onReset={originalSource => setTemplateImageOverrides(previous => {
                          const next = { ...previous };
                          delete next[originalSource];
                          return next;
                        })}
                      />
                      {templateHasTokens ? (
                        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-4">
                          <h4 className="font-black text-slate-800 uppercase tracking-widest text-xs mb-1 flex items-center">
                            <Mail size={16} className="mr-3 text-violet-500" />
                            Template Content
                          </h4>
                          <p className="text-[11px] text-slate-400 -mt-1 mb-2 leading-relaxed">
                            One box per fill-in slot in your template. Type this week's copy — the preview updates live.
                          </p>
                          {templateTokens.map(token => {
                            const isUrl = /url|link|href/i.test(token);
                            const isLong = !isUrl && /(body|copy|text|paragraph|message|content|intro|blurb|section)/i.test(token);
                            return (
                              <div key={token}>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{humanizeToken(token)}</label>
                                {isLong ? (
                                  <textarea
                                    rows={4}
                                    placeholder={`Content for ${humanizeToken(token)}...`}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:border-emerald-500 outline-none transition-all resize-none"
                                    value={customTemplateFields[token] || ''}
                                    onChange={e => setCustomTemplateFields(prev => ({ ...prev, [token]: e.target.value }))}
                                  />
                                ) : (
                                  <input
                                    type={isUrl ? 'url' : 'text'}
                                    placeholder={isUrl ? 'https://...' : `${humanizeToken(token)}...`}
                                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold focus:bg-white focus:border-emerald-500 outline-none transition-all"
                                    value={customTemplateFields[token] || ''}
                                    onChange={e => setCustomTemplateFields(prev => ({ ...prev, [token]: e.target.value }))}
                                  />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex items-start gap-2 rounded-2xl bg-emerald-50 border border-emerald-200 p-4">
                          <CheckCircle2 size={16} className="mt-0.5 text-emerald-600 shrink-0" />
                          <p className="text-xs text-emerald-800 leading-relaxed">
                            This template is <b>ready to send as-is</b> — its content is baked in, so there's nothing to fill here. Check the live preview on the right. (Only recipient personalization like <span className="font-mono">{'{{first_name}}'}</span> is applied at send time.)
                          </p>
                        </div>
                      )}
                    </div>

                    {/* RIGHT — live preview, updates as you type */}
                    <div className="xl:sticky xl:top-6">
                      <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
                        <div className="flex items-center justify-between px-6 py-3 border-b border-slate-100 bg-slate-50">
                          <div className="flex items-center gap-2">
                            <Eye size={16} className="text-emerald-600" />
                            <h4 className="font-black text-slate-800 uppercase tracking-widest text-xs">Live Preview</h4>
                          </div>
                          <button
                            type="button"
                            onClick={() => setShowEmailPreview(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-emerald-600 transition"
                          >
                            <Eye size={12} /> Expand
                          </button>
                        </div>
                        <div className="px-6 py-2.5 border-b border-slate-100 bg-white">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Subject</p>
                          <p className="text-xs font-bold text-slate-800 mt-0.5 break-words">{emailSubject || '(no subject yet)'}</p>
                          {emailPreviewText.trim() && (
                            <p className="text-[11px] text-slate-400 mt-1 break-words">
                              <span className="font-black uppercase tracking-widest text-[9px] text-slate-400">Preview</span>{' '}
                              {emailPreviewText}
                            </p>
                          )}
                        </div>
                        <iframe
                          title="Live email preview"
                          srcDoc={buildDispatchHtml(previewProfile)}
                          className="w-full h-[540px] bg-white"
                        />
                      </div>
                      <p className="text-[10px] text-slate-400 text-center mt-2 font-medium">Updates live as you type · this is the real branded email</p>
                    </div>
                  </div>
                )}
                {showEmailPreview && (
                  <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4" onClick={() => setShowEmailPreview(false)}>
                    <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                      <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                          <Eye size={18} className="text-emerald-600" />
                          <h4 className="font-black text-slate-800 uppercase tracking-widest text-xs">Email Preview</h4>
                        </div>
                        <button type="button" onClick={() => setShowEmailPreview(false)} className="text-slate-400 hover:text-slate-700 transition">
                          <XCircle size={22} />
                        </button>
                      </div>
                      <div className="px-6 py-3 border-b border-slate-100 bg-slate-50">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Subject</p>
                        <p className="text-sm font-bold text-slate-800 mt-1 break-words">{emailSubject || '(no subject yet)'}</p>
                      </div>
                      <div className="flex-1 overflow-auto bg-slate-100 p-4">
                        <iframe title="Email preview" srcDoc={buildDispatchHtml(previewProfile)} className="w-full h-[60vh] bg-white rounded-xl border border-slate-200" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Branch Content */}
                {selectedBranches.length > 0 && (
                  <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm space-y-4">
                    <h4 className="font-black text-slate-800 uppercase tracking-widest text-xs mb-1 flex items-center">
                      <Globe size={16} className="mr-3 text-emerald-500" />
                      Branch-Conditional Content
                      <span className="group relative ml-2 inline-flex">
                        <Info size={14} className="text-slate-400 hover:text-emerald-500 cursor-help" />
                        <span className="pointer-events-none absolute left-1/2 top-6 z-50 w-72 -translate-x-1/2 rounded-xl bg-slate-900 p-3 text-[11px] font-medium normal-case tracking-normal leading-relaxed text-slate-100 opacity-0 shadow-xl transition-opacity duration-200 group-hover:opacity-100">
                          <span className="mb-1 block font-bold text-emerald-300">When to use it</span>
                          Sending one campaign to <b>several branches at once</b>? Add a block that <b>only that branch's recipients see</b> — e.g. an ATL-only coupon that Farm or School readers won't get.
                          <span className="mt-2 mb-1 block font-bold text-slate-400">When to skip it</span>
                          Targeting a <b>single branch</b>? Leave it blank — everyone already gets your main email content.
                        </span>
                      </span>
                    </h4>
                    <p className="text-[11px] font-medium normal-case tracking-normal text-slate-400 -mt-1">
                      Optional extra content shown only to recipients of a specific branch.
                    </p>
                    {selectedBranches.length === 1 && (
                      <div className="flex items-start gap-2 rounded-xl bg-slate-50 border border-slate-200 p-3">
                        <Info size={14} className="mt-0.5 text-slate-400 shrink-0" />
                        <p className="text-[11px] font-medium text-slate-500 leading-relaxed">
                          You're targeting a <b>single branch</b>, so this is optional — every recipient already receives your main content above. Branch blocks matter when a campaign spans multiple branches.
                        </p>
                      </div>
                    )}
                    <div className="space-y-3">
                      {selectedBranches.map(branch => (
                        <div key={branch} className="border-l-4 border-emerald-400 pl-4">
                          <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">
                            {formatBranchName(branch)} Exclusive Block
                          </label>
                          <textarea
                            placeholder={`Optional content only shown to ${formatBranchName(branch)} recipients...`}
                            rows={2}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:bg-white focus:border-emerald-500 outline-none transition resize-none"
                            value={branchContent[branch] || ''}
                            onChange={e => setBranchContent(prev => ({ ...prev, [branch]: e.target.value }))}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Social / SMS Compose */}
            {activeComposeTab !== 'email' && (
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-sm">
                {renderSocialCompose(CHANNEL_CONFIG.find(c => c.id === activeComposeTab)!)}
              </div>
            )}
          </div>
        );

      // ───── STEP 2: SCHEDULE ─────
      case 2:
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="flex items-start gap-3 rounded-2xl bg-emerald-50 border border-emerald-200 p-5">
              <ShieldCheck size={18} className="mt-0.5 text-emerald-600 shrink-0" />
              <p className="text-xs text-emerald-800 leading-relaxed font-medium">
                <b className="font-black">This won't send anything yet.</b> Choosing a timing below only sets <b>when</b> the campaign goes out. On the next step (<b>Deploy</b>) you can <b>send yourself a test email</b> and review the full audience first — even “Send Now” waits for your final confirmation there.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {[
                { id: 'immediate' as const, title: 'Send Now', desc: 'Deploy all channels immediately', icon: Send },
                { id: 'scheduled' as const, title: 'Schedule', desc: 'Choose a specific date and time', icon: Calendar },
                { id: 'staggered' as const, title: 'Staggered Sequence', desc: 'Time-delayed multi-channel cascade', icon: Zap },
              ].map(opt => (
                <button
                  type="button"
                  key={opt.id}
                  onClick={() => setTriggerType(opt.id)}
                  className={`p-8 rounded-[2.5rem] border-4 text-left transition-all ${
                    triggerType === opt.id ? 'border-emerald-500 bg-emerald-50 shadow-xl scale-[1.02]' : 'border-slate-100 hover:bg-slate-50'
                  }`}
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-6 ${
                    triggerType === opt.id ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' : 'bg-slate-100 text-slate-400'
                  }`}>
                    <opt.icon size={24} />
                  </div>
                  <h5 className="font-black text-slate-800 uppercase tracking-tight text-base">{opt.title}</h5>
                  <p className="text-[11px] text-slate-500 mt-2 font-medium italic">{opt.desc}</p>
                </button>
              ))}
            </div>

            {/* Scheduled Date/Time */}
            {triggerType === 'scheduled' && (
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm animate-in fade-in slide-in-from-top-4 duration-300">
                <h4 className="font-black text-slate-800 uppercase tracking-widest text-xs mb-6 flex items-center">
                  <Calendar size={18} className="mr-3 text-amber-500" />
                  Schedule Deployment
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Date</label>
                    <input
                      type="date"
                      value={scheduledDate}
                      min={new Date().toISOString().split('T')[0]}
                      onChange={e => setScheduledDate(e.target.value)}
                      className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl px-5 py-4 text-base font-bold focus:bg-white focus:border-emerald-500 outline-none transition"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Time</label>
                    <input
                      type="time"
                      value={scheduledTime}
                      onChange={e => setScheduledTime(e.target.value)}
                      className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl px-5 py-4 text-base font-bold focus:bg-white focus:border-emerald-500 outline-none transition"
                    />
                  </div>
                </div>
                {scheduledDate && (
                  <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                    <p className="text-sm font-bold text-amber-800">
                      <Clock size={14} className="inline mr-2" />
                      Campaign will deploy on{' '}
                      <span className="font-black">
                        {new Date(scheduledDate + 'T' + scheduledTime).toLocaleDateString('en-US', {
                          weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
                        })}
                      </span>
                      {' '}at{' '}
                      <span className="font-black">
                        {new Date(scheduledDate + 'T' + scheduledTime).toLocaleTimeString('en-US', {
                          hour: 'numeric', minute: '2-digit', hour12: true,
                        })}
                      </span>
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Staggered Sequence Builder */}
            {triggerType === 'staggered' && (
              <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm animate-in fade-in slide-in-from-top-4 duration-300">
                <h4 className="font-black text-slate-800 uppercase tracking-widest text-xs mb-6 flex items-center">
                  <Zap size={18} className="mr-3 text-purple-500" />
                  Channel Sequence Builder
                </h4>
                <p className="text-[11px] text-slate-400 mb-6">Set delay and conditional triggers for each channel. Channels execute in order, top to bottom.</p>

                <div className="space-y-4">
                  {timingRules.map((rule, idx) => {
                    const cfg = CHANNEL_CONFIG.find(c => c.id === rule.channel)!;
                    const Icon = cfg.icon;
                    const colorKey = CHANNEL_COLOR_MAP[rule.channel];
                    const colors = PRESET_COLOR_MAP[colorKey] || PRESET_COLOR_MAP.slate;
                    const otherChannels = timingRules.filter(r => r.channel !== rule.channel);

                    return (
                      <div key={rule.channel} className={`p-5 rounded-2xl border-2 ${colors.bg} ${colors.border}`}>
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center space-x-3">
                            {idx > 0 && (
                              <ArrowRight size={14} className="text-slate-400 -ml-1 mr-1" />
                            )}
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colors.selectedBg} text-white`}>
                              <Icon size={16} />
                            </div>
                            <span className="text-xs font-black text-slate-800 uppercase tracking-tight">{cfg.label}</span>
                            {idx === 0 && (
                              <span className="text-[8px] font-black text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full uppercase">First</span>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Delay After Start</label>
                            <select
                              value={rule.delay_hours}
                              onChange={e => updateTimingRule(rule.channel, { delay_hours: Number(e.target.value) })}
                              className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold focus:border-emerald-500 outline-none"
                            >
                              <option value={0}>Immediate (0h)</option>
                              <option value={1}>+1 hour</option>
                              <option value={2}>+2 hours</option>
                              <option value={4}>+4 hours</option>
                              <option value={6}>+6 hours</option>
                              <option value={12}>+12 hours</option>
                              <option value={24}>+24 hours</option>
                              <option value={48}>+48 hours</option>
                              <option value={72}>+72 hours</option>
                            </select>
                          </div>

                          {idx > 0 && otherChannels.length > 0 && (
                            <div>
                              <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Conditional Trigger</label>
                              <select
                                value={rule.condition?.type || 'always'}
                                onChange={e => {
                                  const type = e.target.value as 'always' | 'no_open' | 'no_click' | 'no_purchase';
                                  if (type === 'always') {
                                    updateTimingRule(rule.channel, { condition: undefined });
                                  } else {
                                    updateTimingRule(rule.channel, {
                                      condition: {
                                        type,
                                        reference_channel: otherChannels[0].channel,
                                        window_hours: rule.delay_hours || 24,
                                      },
                                    });
                                  }
                                }}
                                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold focus:border-emerald-500 outline-none"
                              >
                                <option value="always">Always send</option>
                                <option value="no_open">If no open on reference</option>
                                <option value="no_click">If no click on reference</option>
                                <option value="no_purchase">If no purchase after reference</option>
                              </select>
                            </div>
                          )}
                        </div>

                        {rule.condition && (
                          <div className="mt-3 p-3 bg-white/50 rounded-xl border border-slate-200">
                            <p className="text-[10px] text-slate-500">
                              <span className="font-black text-slate-700">Condition:</span> Send {cfg.label} if{' '}
                              <span className="font-bold text-amber-600">{rule.condition.type.replace(/_/g, ' ')}</span>{' '}
                              on {CHANNEL_CONFIG.find(c => c.id === rule.condition!.reference_channel)?.label || 'reference'}{' '}
                              within {rule.condition.window_hours}h window
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Visual Timeline */}
                <div className="mt-6 p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-3">Execution Timeline</p>
                  <div className="flex items-center space-x-2 overflow-x-auto">
                    {[...timingRules]
                      .sort((a, b) => a.delay_hours - b.delay_hours)
                      .map((rule, idx) => {
                        const cfg = CHANNEL_CONFIG.find(c => c.id === rule.channel)!;
                        const Icon = cfg.icon;
                        return (
                          <React.Fragment key={rule.channel}>
                            {idx > 0 && (
                              <div className="flex items-center space-x-1 text-slate-300 shrink-0">
                                <div className="w-8 h-px bg-slate-300" />
                                <span className="text-[8px] font-black text-slate-400">+{rule.delay_hours}h</span>
                                <div className="w-8 h-px bg-slate-300" />
                              </div>
                            )}
                            <div className={`flex items-center space-x-2 px-3 py-2 rounded-lg shrink-0 ${
                              PRESET_COLOR_MAP[CHANNEL_COLOR_MAP[rule.channel]]?.bg || 'bg-slate-100'
                            } border ${PRESET_COLOR_MAP[CHANNEL_COLOR_MAP[rule.channel]]?.border || 'border-slate-200'}`}>
                              <Icon size={12} />
                              <span className="text-[9px] font-black uppercase">{cfg.label}</span>
                            </div>
                          </React.Fragment>
                        );
                      })}
                  </div>
                </div>
              </div>
            )}
          </div>
        );

      // ───── STEP 3: DEPLOY ─────
      case 3:
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            {/* Deployment Manifest */}
            <div className="bg-white rounded-[3rem] border-4 border-slate-100 overflow-hidden shadow-2xl">
              <div className="bg-slate-50 px-10 py-8 border-b border-slate-100 flex justify-between items-center">
                <div>
                  <h4 className="text-xl font-black text-slate-800 uppercase tracking-tight">Deployment Manifest</h4>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">Cross-Channel Orchestration Review</p>
                </div>
                <div className="flex items-center space-x-2 bg-emerald-100 text-emerald-700 px-4 py-2 rounded-full border border-emerald-200">
                  <ShieldCheck size={18} className="mr-1" />
                  <span className="text-[10px] font-black uppercase tracking-widest">Validated</span>
                </div>
              </div>

              <div className="p-10 space-y-8">
                {/* Summary Grid */}
                <div className="grid grid-cols-2 gap-x-12 gap-y-6">
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Master Dispatch ID</p>
                    <p className="font-black text-slate-800 text-lg uppercase tracking-tight">{campaignName || 'UNTITLED_FLOW'}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Audience Resolution</p>
                    <p className="font-black text-emerald-600 text-lg uppercase tracking-tight">{audienceSize} Verified Profiles</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Active Channels</p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {channelList.map(ch => {
                        const cfg = CHANNEL_CONFIG.find(c => c.id === ch)!;
                        const Icon = cfg.icon;
                        return (
                          <span key={ch} className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase text-white ${
                            PRESET_COLOR_MAP[CHANNEL_COLOR_MAP[ch]]?.selectedBg || 'bg-slate-500'
                          }`}>
                            <Icon size={12} />
                            <span>{cfg.label}</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Delivery Method</p>
                    <p className="font-black text-slate-800 text-base flex items-center">
                      {triggerType === 'immediate' && <><Send size={16} className="mr-2 text-emerald-600" />Immediate</>}
                      {triggerType === 'scheduled' && <><Calendar size={16} className="mr-2 text-amber-600" />Scheduled</>}
                      {triggerType === 'staggered' && <><Zap size={16} className="mr-2 text-purple-600" />Staggered Sequence</>}
                    </p>
                  </div>
                </div>

                {/* Channel Readiness */}
                <div className="pt-6 border-t border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Channel Readiness</p>
                  {renderChannelReadiness()}
                </div>

                {/* Payload Preview */}
                <div className="pt-6 border-t border-slate-100">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Payload Preview</p>
                  <div className="space-y-3">
                    {enabledChannels.has('email') && (
                      <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-200">
                        <p className="text-[9px] font-black text-indigo-600 uppercase tracking-widest mb-1">Email Subject</p>
                        <p className="text-sm font-bold text-slate-800 italic">"{emailSubject || 'No subject set'}"</p>
                      </div>
                    )}
                    {channelList.filter(ch => ch !== 'email').map(ch => {
                      const cfg = CHANNEL_CONFIG.find(c => c.id === ch)!;
                      const content = channelContents[ch];
                      if (!content?.trim()) return null;
                      const colorKey = CHANNEL_COLOR_MAP[ch];
                      return (
                        <div key={ch} className={`p-4 rounded-xl border ${
                          PRESET_COLOR_MAP[colorKey]?.bg || 'bg-slate-50'
                        } ${PRESET_COLOR_MAP[colorKey]?.border || 'border-slate-200'}`}>
                          <p className={`text-[9px] font-black uppercase tracking-widest mb-1 ${
                            PRESET_COLOR_MAP[colorKey]?.text || 'text-slate-600'
                          }`}>{cfg.label}</p>
                          <p className="text-sm text-slate-700 line-clamp-2">{content}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Send a Test Email */}
                {enabledChannels.has('email') && (
                  <div className="pt-6 border-t border-slate-100 bg-slate-50/50 -mx-10 p-10">
                    <div className="flex items-center space-x-3 mb-6">
                      <Mail size={24} className="text-indigo-600" />
                      <h5 className="text-[11px] font-black text-slate-800 uppercase tracking-widest">Send a Test Email</h5>
                    </div>
                    <div className="flex items-center space-x-4">
                      <input
                        type="email"
                        className="flex-1 bg-white border-2 border-slate-200 rounded-2xl px-6 py-4 text-sm font-bold focus:border-indigo-500 outline-none transition shadow-inner"
                        placeholder="marketing@sproutify.app"
                        value={testEmailAddress}
                        onChange={e => setTestEmailAddress(e.target.value)}
                      />
                      <button
                        onClick={handleSendTest}
                        disabled={isSendingTest || !testEmailAddress || !emailCcIsValid}
                        className={`px-10 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all flex items-center space-x-3 shadow-xl ${
                          testSentStatus === 'success'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-900 text-white hover:bg-slate-800'
                        }`}
                      >
                        {isSendingTest ? (
                          <RefreshCw size={18} className="animate-spin" />
                        ) : testSentStatus === 'success' ? (
                          <CheckCircle2 size={18} />
                        ) : (
                          <Send size={18} />
                        )}
                        <span>{isSendingTest ? 'Sending...' : testSentStatus === 'success' ? 'Sent' : 'Send Test'}</span>
                      </button>
                    </div>
                    {testSendError && (
                      <div className="flex items-center space-x-2 px-4 py-2 bg-rose-50 border border-rose-200 rounded-xl mt-2">
                        <AlertTriangle size={14} className="text-rose-500 shrink-0" />
                        <p className="text-[10px] font-bold text-rose-700">{testSendError}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Compliance */}
            <div className="bg-white rounded-[2.5rem] border-2 border-slate-100 overflow-hidden shadow-sm">
              <div className="px-8 py-6 border-b border-slate-100 flex items-center space-x-3">
                <ShieldCheck size={20} className="text-indigo-600" />
                <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">Compliance Checkpoint</h4>
              </div>
              <div className="p-8 space-y-5">
                <div className="grid grid-cols-3 gap-4">
                  <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100 text-center">
                    <p className="text-2xl font-black text-emerald-700">{isEventAudienceSelected ? eventConsentFiltered.length : consentFiltered.length}</p>
                    <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest mt-1">{isEventAudienceSelected ? 'Event Eligible' : 'Opted-In'}</p>
                  </div>
                  <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 text-center">
                    <p className="text-2xl font-black text-amber-700">{scopedProfiles.filter(p => selectedBranches.some(slug => { const entry = p.branch_consent?.[slug]; return entry ? entry.paused : p.marketing_pause; })).length}</p>
                    <p className="text-[9px] font-black text-amber-600 uppercase tracking-widest mt-1">Paused</p>
                  </div>
                  <div className="p-4 bg-rose-50 rounded-xl border border-rose-100 text-center">
                    <p className="text-2xl font-black text-rose-700">{scopedProfiles.length - consentFiltered.length}</p>
                    <p className="text-[9px] font-black text-rose-600 uppercase tracking-widest mt-1">Blocked</p>
                  </div>
                </div>
                <label className={`flex items-start space-x-4 p-5 rounded-2xl border-2 cursor-pointer transition-all ${
                  consentConfirmed
                    ? 'bg-emerald-50 border-emerald-500'
                    : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                }`}>
                  <input
                    type="checkbox"
                    checked={consentConfirmed}
                    onChange={e => setConsentConfirmed(e.target.checked)}
                    className="mt-0.5 w-5 h-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <div>
                    <p className="text-xs font-black text-slate-800 uppercase tracking-tight">{isEventAudienceSelected ? 'I confirm this message is specifically about the registered event(s)' : 'I confirm this campaign targets opted-in recipients only'}</p>
                    <p className="text-[11px] text-slate-500 mt-1">{isEventAudienceSelected ? 'Event registration consent must not be reused for general marketing.' : 'The delivery gateway will enforce subscription status at send time.'}</p>
                  </div>
                </label>
              </div>
            </div>

            {/* Deployed Campaign History */}
            {deployedCampaigns.length > 0 && (
              <div className="bg-white rounded-[2rem] border border-slate-200 overflow-hidden shadow-sm">
                <div className="bg-slate-50 px-8 py-6 border-b border-slate-100 flex items-center space-x-3">
                  <History size={20} className="text-slate-500" />
                  <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">Recent Deployments</h4>
                </div>
                <div className="divide-y divide-slate-100">
                  {deployedCampaigns.slice(0, 5).map(dep => (
                    <div key={dep.id} className="px-8 py-5 flex items-center justify-between hover:bg-slate-50 transition">
                      <div className="flex-1">
                        <p className="font-black text-slate-800 text-sm uppercase tracking-tight">{dep.name}</p>
                        <p className="text-[10px] text-slate-400 mt-1">{dep.reach} profiles — {timeAgo(dep.date)}</p>
                      </div>
                      <div className="flex items-center space-x-2">
                        {dep.channels.map(ch => {
                          const cfg = CHANNEL_CONFIG.find(c => c.id === ch.channel);
                          if (!cfg) return null;
                          const Icon = cfg.icon;
                          return (
                            <div
                              key={ch.channel}
                              className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                                ch.status === 'success' ? 'bg-emerald-100 text-emerald-600' :
                                ch.status === 'failed' ? 'bg-rose-100 text-rose-600' :
                                'bg-slate-100 text-slate-400'
                              }`}
                              title={`${cfg.label}: ${ch.status}`}
                            >
                              <Icon size={14} />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );

      default: return null;
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // MAIN RENDER
  // ═══════════════════════════════════════════════════════════════

  // Gate: when Email is a selected channel, a custom template must be chosen
  // before leaving Compose. Built-in layouts can't hold custom copy, so a
  // real send requires a template created in Brand Intelligence.
  // Token templates need body copy written; fully-designed templates ship as-is.
  // Block send only when the template has fill-in slots and none of them were
  // filled — a totally empty compose. Partial fills are allowed (unused slots
  // simply collapse to blank), so a 4-section newsletter can run with 2 sections.
  const emailComposeIncomplete = enabledChannels.has('email') && templateHasTokens && templateTokens.every(t => !customTemplateFields[t]?.trim());

  // Synthetic recipient used to render the in-page email preview modal.
  const previewProfile: Profile = {
    id: 'preview', email: 'preview@sproutify.app', first_name: 'there',
    is_subscribed: true, marketing_pause: false, tags: [], segments: [],
    branches: selectedBranches.length ? selectedBranches : ['atl-urban-farms'],
    status: 'active', ltv: 0, churn_risk: 'minimal',
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-12 pb-20">
      <div className="lg:col-span-3 space-y-12">
        <div className={`rounded-2xl border px-5 py-4 flex flex-wrap items-center justify-between gap-4 ${
          draftSaveError ? 'border-rose-200 bg-rose-50' : 'border-emerald-100 bg-emerald-50/70'
        }`}>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-700">
              {draftId ? 'Saved campaign draft' : 'Draft autosave'}
            </p>
            <p className={`mt-1 text-xs font-bold ${draftSaveError ? 'text-rose-600' : 'text-slate-500'}`}>
              {!isDraftHydrated
                ? 'Restoring your draft…'
                : isSavingDraft
                  ? 'Saving your latest changes…'
                  : draftSaveError
                    ? draftSaveError
                    : lastDraftSavedAt
                      ? `Saved ${timeAgo(lastDraftSavedAt)} — audience and consent will be refreshed before launch.`
                      : 'Your work saves automatically after you begin. You can also save a checkpoint now.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleSaveDraft()}
            disabled={!isDraftHydrated || isSavingDraft || isLaunching}
            className="inline-flex items-center gap-2 rounded-xl bg-white border border-emerald-200 px-4 py-2.5 text-[10px] font-black uppercase tracking-widest text-emerald-700 shadow-sm hover:bg-emerald-100 transition disabled:opacity-50"
          >
            {isSavingDraft ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Save Draft
          </button>
        </div>

        {/* Step Progress */}
        <div className="flex justify-between items-start relative px-4">
          <div className="absolute top-6 left-10 right-10 h-1 bg-slate-100 -z-10 rounded-full">
            <div className="h-full bg-emerald-500 transition-all duration-700 rounded-full" style={{ width: `${(currentStep / (STEPS.length - 1)) * 100}%` }} />
          </div>
          {STEPS.map((step, idx) => {
            const isActive = idx === currentStep;
            const isCompleted = idx < currentStep;
            const canNavigate = isDraftHydrated && !isLaunching && (
              idx <= currentStep ||
              (idx === 1 && selectedBranches.length > 0 && campaignName) ||
              (idx === 2 && selectedBranches.length > 0 && campaignName && emailSubject && !emailComposeIncomplete && emailCcIsValid) ||
              (idx === 3 && selectedBranches.length > 0 && campaignName && emailSubject && !emailComposeIncomplete && emailCcIsValid && (triggerType !== 'scheduled' || scheduledDate))
            );
            return (
              <div key={step.id} className={`flex flex-col items-center group ${canNavigate ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`} onClick={() => canNavigate && setCurrentStep(idx)}>
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500 border-4 shadow-xl ${
                  isActive ? 'bg-slate-900 text-white border-emerald-500 scale-110' :
                  isCompleted ? 'bg-emerald-600 text-white border-white' :
                  'bg-white text-slate-300 border-slate-100'
                }`}>
                  {isCompleted ? <CheckCircle2 size={24} /> : <step.icon size={24} />}
                </div>
                <div className="mt-4 text-center">
                  <p className={`text-[9px] font-black uppercase tracking-[0.2em] transition-colors ${isActive ? 'text-slate-900' : 'text-slate-400'}`}>{step.title}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div ref={stepContentRef} className="min-h-[500px]">
          {!isDraftHydrated ? (
            <div className="min-h-[500px] flex items-center justify-center gap-3 text-slate-400 font-bold">
              <Loader2 size={22} className="animate-spin" /> Restoring campaign draft…
            </div>
          ) : renderStep()}
        </div>

        {/* Navigation */}
        <div className="flex justify-between items-center pt-10 border-t border-slate-200">
          <button onClick={() => setCurrentStep(Math.max(0, currentStep - 1))} disabled={!isDraftHydrated || currentStep === 0 || isLaunching} className="px-8 py-4 flex items-center space-x-3 text-slate-500 font-black text-xs uppercase tracking-widest hover:text-slate-800 transition disabled:opacity-0 group">
            <ChevronLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
            <span>Previous Step</span>
          </button>

          {currentStep === STEPS.length - 1 ? (
            <button
              onClick={handleLaunch}
              disabled={!isDraftHydrated || isSavingDraft || isLaunching || audienceSize === 0 || !campaignName || !emailSubject || !consentConfirmed || !emailCcIsValid}
              className="px-12 py-5 bg-slate-900 text-white rounded-[2rem] font-black text-xl shadow-2xl shadow-slate-900/40 hover:bg-emerald-600 transition disabled:opacity-50 flex items-center space-x-4"
            >
              <Rocket size={24} className="text-emerald-400" />
              <span>Launch Across {enabledChannelCount} Channel{enabledChannelCount !== 1 ? 's' : ''}</span>
            </button>
          ) : (
            <button
              onClick={() => setCurrentStep(Math.min(STEPS.length - 1, currentStep + 1))}
              disabled={
                !isDraftHydrated ||
                (currentStep === 0 && (selectedBranches.length === 0 || !campaignName)) ||
                (currentStep === 1 && (!emailSubject || emailComposeIncomplete || !emailCcIsValid)) ||
                (currentStep === 2 && triggerType === 'scheduled' && !scheduledDate)
              }
              className="px-10 py-5 bg-emerald-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center space-x-3 shadow-xl hover:bg-emerald-700 transition disabled:opacity-50 group"
            >
              <span>Continue Strategy</span>
              <ChevronRight size={20} className="group-hover:translate-x-1 transition-transform" />
            </button>
          )}
        </div>
      </div>

      {/* Sidebar */}
      <div className="lg:col-span-1 space-y-8">
        {/* Strategic Guidance */}
        <div className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm flex flex-col min-h-[400px]">
          <div className="flex items-center space-x-3 mb-10 border-b border-slate-100 pb-10">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-sm border border-indigo-100"><Info size={20} /></div>
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Sage Guidance</h3>
          </div>
          <div className="flex-1 space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">{STEPS[currentStep]?.title}</h4>
              </div>
              <p className="text-sm font-medium text-slate-600 leading-relaxed italic border-l-2 border-emerald-500 pl-4 py-1">
                {currentStep === 0 && '"Select branches, define segments, and choose channels. Cross-channel campaigns show 2.4x higher engagement."'}
                {currentStep === 1 && '"Compose unique content per channel. Use AI to auto-generate social posts from your email subject."'}
                {currentStep === 2 && '"Staggered sequences let you cascade channels with conditional triggers based on engagement signals."'}
                {currentStep === 3 && '"Review the deployment manifest. Each channel shows readiness status and delay configuration."'}
              </p>
            </div>
            <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Channels</span>
                <span className="text-xs font-black text-emerald-600">{enabledChannelCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Audience</span>
                <span className="text-xs font-black text-emerald-600">{audienceSize}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Branches</span>
                <span className="text-xs font-black text-emerald-600">{selectedBranches.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Est. Total Reach</span>
                <span className="text-xs font-black text-indigo-600">{audienceSize * enabledChannelCount}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Deployment Log */}
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
          <button
            onClick={() => setHistoryOpen(!historyOpen)}
            className="w-full flex items-center justify-between"
          >
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-2xl bg-slate-50 text-slate-500 flex items-center justify-center shadow-sm border border-slate-100">
                <History size={20} />
              </div>
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Deployment Log</h3>
            </div>
            <ChevronDown size={18} className={`text-slate-400 transition-transform duration-300 ${historyOpen ? 'rotate-180' : ''}`} />
          </button>

          {historyOpen && (
            <div className="mt-6 space-y-3">
              {campaignHistory.length === 0 ? (
                <div className="text-center py-8">
                  <Rocket size={28} className="mx-auto text-slate-300 mb-3" />
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">No campaigns deployed yet</p>
                </div>
              ) : (
                <>
                  {campaignHistory.slice(0, 5).map(record => (
                    <div key={record.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-black text-slate-800 uppercase tracking-tight truncate max-w-[160px]">{record.name}</p>
                        <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${
                          record.status === 'deployed' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {record.status}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-bold">
                        {record.audienceSize} profiles → {record.branches.length} branch{record.branches.length !== 1 ? 'es' : ''}
                      </p>
                      {record.channels && (
                        <div className="flex items-center space-x-1">
                          {record.channels.map(ch => {
                            const cfg = CHANNEL_CONFIG.find(c => c.id === ch.channel);
                            if (!cfg) return null;
                            const Icon = cfg.icon;
                            return (
                              <div
                                key={ch.channel}
                                className={`w-5 h-5 rounded flex items-center justify-center ${
                                  ch.status === 'success' ? 'bg-emerald-100 text-emerald-600' :
                                  ch.status === 'failed' ? 'bg-rose-100 text-rose-600' :
                                  'bg-slate-100 text-slate-400'
                                }`}
                              >
                                <Icon size={10} />
                              </div>
                            );
                          })}
                        </div>
                      )}
                      <p className="text-[9px] text-slate-400 font-medium">{timeAgo(record.launchedAt)}</p>
                    </div>
                  ))}
                  <button
                    onClick={() => setCampaignHistory([])}
                    className="w-full text-center text-[10px] font-bold text-slate-400 hover:text-rose-500 transition pt-2 flex items-center justify-center space-x-1"
                  >
                    <Trash2 size={10} />
                    <span>Clear History</span>
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Launch Overlay */}
      {isLaunching && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[60] flex flex-col items-center justify-center text-white p-8 text-center animate-in fade-in duration-500">
          <div className="relative mb-12">
            <div className="absolute inset-0 bg-emerald-500 rounded-full blur-[120px] opacity-20 animate-pulse" />
            <Rocket size={80} className="text-emerald-400 animate-bounce relative z-10" />
          </div>
          <h2 className="text-4xl font-black mb-6 tracking-tighter uppercase italic">
            Deploying Across {enabledChannelCount} Channel{enabledChannelCount !== 1 ? 's' : ''}...
          </h2>
          <div className="w-full max-w-xl bg-white/10 rounded-full h-4 overflow-hidden mb-8 border border-white/5 shadow-2xl">
            <div className="bg-emerald-500 h-full transition-all duration-300 relative" style={{ width: `${launchProgress}%` }}>
              <div className="absolute inset-0 bg-white/40 animate-pulse" />
            </div>
          </div>

          {/* Per-channel status */}
          <div className="flex items-center space-x-6 mb-8">
            {channelDeployResults.map(result => {
              const cfg = CHANNEL_CONFIG.find(c => c.id === result.channel);
              if (!cfg) return null;
              const Icon = cfg.icon;
              return (
                <div key={result.channel} className="flex flex-col items-center space-y-2">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-500 ${
                    result.status === 'success' ? 'bg-emerald-500 scale-110' :
                    result.status === 'pending' ? 'bg-white/10 animate-pulse' :
                    'bg-rose-500'
                  }`}>
                    {result.status === 'success' ? (
                      <CheckCircle2 size={24} />
                    ) : result.status === 'pending' ? (
                      <Icon size={24} className="animate-pulse" />
                    ) : (
                      <XCircle size={24} />
                    )}
                  </div>
                  <span className="text-[9px] font-black uppercase tracking-widest opacity-60">{cfg.label}</span>
                </div>
              );
            })}
          </div>

          <p className="text-sm font-black uppercase tracking-[0.4em] text-emerald-400 animate-pulse">{launchProgress}% Synchronized</p>
        </div>
      )}

      {/* Email Sent Confirmation Modal */}
      {sendResult && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => setSendResult(null)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md bg-white rounded-2xl shadow-2xl z-50 overflow-hidden">
            <div className="bg-emerald-600 px-6 py-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle2 size={22} className="text-white" />
                <h3 className="text-white font-black text-sm uppercase tracking-wide">Email Sent</h3>
              </div>
              <button onClick={() => setSendResult(null)} className="text-white/70 hover:text-white transition">
                <XCircle size={20} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-[80px_1fr] gap-y-3 text-sm">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest pt-0.5">Resend ID</span>
                <span className="font-mono text-slate-800 text-xs break-all">{sendResult.id}</span>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest pt-0.5">From</span>
                <span className="text-slate-800">{sendResult.from}</span>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest pt-0.5">To</span>
                <span className="font-mono text-slate-800">{sendResult.to}</span>
                {sendResult.cc && <>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest pt-0.5">CC</span>
                  <span className="font-mono text-slate-800">{sendResult.cc}</span>
                </>}
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest pt-0.5">Subject</span>
                <span className="text-slate-800">{sendResult.subject}</span>
              </div>
              <button
                onClick={() => setSendResult(null)}
                className="w-full mt-2 py-3 bg-slate-900 text-white rounded-xl font-black text-sm hover:bg-slate-800 transition"
              >
                Done
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default CampaignBuilder;
