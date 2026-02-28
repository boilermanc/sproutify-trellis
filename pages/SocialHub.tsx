
import React, { useState, useMemo, useEffect } from 'react';
import { DraftPost, SocialActivity, Profile, MarketingEvent, BranchContext, Branch, BranchSocialAccountsMap, PlatformPublishResult, SocialPlatform, Ticket, IntentType, CalendarEvent, CampaignChannel, ComplianceResult, DeployedCampaign, ApprovalStatus, ApiKeyConfig } from '../types';
import { Article } from '../src/data/helpContent';
import { GoogleGenAI, Type } from "@google/genai";
import { SOCIAL_PLATFORM_META, PLATFORM_ICONS, PLATFORM_COLORS, getSocialUrl } from '../utils';
import { publishToSocial, updateSignalStatus, linkProfileToSocial } from '../services/socialService';
import { runBrandComplianceAudit } from '../services/aiService';
import {
  Sparkles, Send,
  CheckCircle2, Clock, MessageSquare, Zap, RefreshCw,
  Edit2, XCircle, Loader2, Terminal, Layers, Archive, Rocket,
  Target, Settings2, CalendarDays, LayoutGrid, List, X, Check,
  History, Ban, RotateCcw, ChevronLeft, ChevronRight,
  AlertTriangle, ShieldCheck, Mail, Smartphone, Eye,
  Globe, ChevronDown, AlertCircle, ExternalLink, LifeBuoy, Users, ShoppingCart, Headphones, Star, Hash, Megaphone, Trash2, Plus, Info
} from 'lucide-react';

interface SocialHubProps {
  profiles: Profile[];
  setEvents: React.Dispatch<React.SetStateAction<MarketingEvent[]>>;
  branchContext?: BranchContext;
  branches?: Branch[];
  branchSocialAccounts?: BranchSocialAccountsMap;
  socialSignals: SocialActivity[];
  setSocialSignals: React.Dispatch<React.SetStateAction<SocialActivity[]>>;
  tickets?: Ticket[];
  setTickets?: React.Dispatch<React.SetStateAction<Ticket[]>>;
  scheduledPosts: DraftPost[];
  setScheduledPosts: React.Dispatch<React.SetStateAction<DraftPost[]>>;
  deployedCampaigns: DeployedCampaign[];
  addToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
  apiKeys?: ApiKeyConfig;
  onOpenArticle?: (article: Article) => void;
}

const INTENT_ICONS: Record<string, any> = {
  buying_intent: ShoppingCart,
  support_request: Headphones,
  brand_mention: Star,
  engagement: Hash,
  complaint: AlertCircle,
  partnership: Megaphone,
  spam: Trash2,
};

const INTENT_LABELS: Record<string, string> = {
  buying_intent: 'Buying Intent',
  support_request: 'Support Request',
  brand_mention: 'Brand Mention',
  engagement: 'Engagement',
  complaint: 'Complaint',
  partnership: 'Partnership',
  spam: 'Spam',
};

const INTENT_COLORS: Record<string, string> = {
  buying_intent: 'bg-emerald-100 text-emerald-700',
  support_request: 'bg-blue-100 text-blue-700',
  brand_mention: 'bg-purple-100 text-purple-700',
  engagement: 'bg-amber-100 text-amber-700',
  complaint: 'bg-rose-100 text-rose-700',
  partnership: 'bg-indigo-100 text-indigo-700',
  spam: 'bg-slate-100 text-slate-500',
};

const BRANCH_COLOR_MAP: Record<string, string> = {
  'farm': '#10b981',
  'school': '#6366f1',
  'letsrejoice': '#f59e0b',
  'micro': '#ec4899',
  'atlurbanfarms': '#3b82f6',
};

interface CalendarAlert {
  type: 'conflict' | 'gap';
  severity: 'warning' | 'info';
  message: string;
  events?: CalendarEvent[];
}

const generateTestSignal = (branchId?: string | null): SocialActivity => ({
  id: `sig_test_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  platform: (['instagram', 'x', 'linkedin'] as SocialPlatform[])[Math.floor(Math.random() * 3)],
  username: ['garden_guru_99', 'plantlover_ca', 'urban_farmer_atl', 'soil_queen'][Math.floor(Math.random() * 4)],
  content: [
    'Do you ship to New York?',
    'Price for the indoor bonsai kit?',
    'Love your organic soil mix!',
    'My order #4521 never arrived...',
    'Interested in a wholesale partnership',
  ][Math.floor(Math.random() * 5)],
  intent_type: (['buying_intent', 'support_request', 'brand_mention', 'engagement', 'complaint'] as IntentType[])[Math.floor(Math.random() * 5)],
  confidence: 50 + Math.floor(Math.random() * 50),
  branch_id: branchId || undefined,
  profile_matched: Math.random() > 0.5,
  matched_profile_id: Math.random() > 0.5 ? 'p_uuid_1' : undefined,
  status: 'new',
  created_at: new Date().toISOString(),
});

const PIPELINE_STORAGE_KEY = 'trellis_social_pipeline';

const SocialHub: React.FC<SocialHubProps> = ({ profiles, setEvents, branchContext, branches, branchSocialAccounts, socialSignals, setSocialSignals, tickets, setTickets, scheduledPosts, setScheduledPosts, deployedCampaigns, addToast, apiKeys, onOpenArticle }) => {
  const [activeTab, setActiveTab] = useState<'lab' | 'queue' | 'pipeline'>('lab');
  const [baseContent, setBaseContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeDraft, setActiveDraft] = useState<DraftPost | null>(null);
  const [workflowStatus, setWorkflowStatus] = useState<'idle' | 'reviewing'>('idle');
  const [inboundQueue, setInboundQueue] = useState<DraftPost[]>([]);
  const [archivedPosts, setArchivedPosts] = useState<DraftPost[]>(() => {
    try {
      const stored = localStorage.getItem(PIPELINE_STORAGE_KEY);
      return stored ? JSON.parse(stored).archived || [] : [];
    } catch { return []; }
  });
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);

  // Phase 3: Publish state
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishResults, setPublishResults] = useState<Record<string, PlatformPublishResult[]>>({});

  // Queue filters
  const [queuePlatformFilter, setQueuePlatformFilter] = useState<SocialPlatform | 'all'>('all');
  const [queueStatusFilter, setQueueStatusFilter] = useState<'new' | 'reviewed' | 'all'>('new');
  const [queueIntentFilter, setQueueIntentFilter] = useState<string>('all');
  const [showDismissed, setShowDismissed] = useState(false);

  // Link to profile modal
  const [linkingSignalId, setLinkingSignalId] = useState<string | null>(null);
  const [profileSearchTerm, setProfileSearchTerm] = useState('');

  // Calendar state
  const [calendarView, setCalendarView] = useState<'month' | 'week'>('month');
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [selectedCalendarEvent, setSelectedCalendarEvent] = useState<CalendarEvent | null>(null);
  const [complianceResult, setComplianceResult] = useState<ComplianceResult | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [showCompliancePanel, setShowCompliancePanel] = useState(false);
  const [approvalNote, setApprovalNote] = useState('');

  // Persist archived posts to localStorage
  useEffect(() => {
    localStorage.setItem(PIPELINE_STORAGE_KEY, JSON.stringify({
      scheduled: scheduledPosts,
      archived: archivedPosts,
    }));
  }, [scheduledPosts, archivedPosts]);

  // Filter branches by active context
  const availableBranches = useMemo(() => {
    if (!branches) return [];
    if (!branchContext || branchContext.isAllSelected) return branches.filter(b => b.is_active);
    return branches.filter(b => b.is_active && branchContext.activeBranchSlugs.includes(b.slug));
  }, [branches, branchContext]);

  // Auto-select first branch
  useEffect(() => {
    if (!selectedBranchId && availableBranches.length > 0) {
      setSelectedBranchId(availableBranches[0].id);
    }
  }, [availableBranches, selectedBranchId]);

  const selectedBranch = useMemo(() =>
    branches?.find(b => b.id === selectedBranchId) || null,
    [branches, selectedBranchId]
  );

  const selectedBranchAccounts = useMemo(() =>
    selectedBranchId && branchSocialAccounts?.[selectedBranchId] ? branchSocialAccounts[selectedBranchId] : [],
    [selectedBranchId, branchSocialAccounts]
  );

  // Queue filtered signals
  const filteredSignals = useMemo(() => {
    return socialSignals.filter(s => {
      if (!showDismissed && s.status === 'dismissed') return false;
      if (queuePlatformFilter !== 'all' && s.platform !== queuePlatformFilter) return false;
      if (queueStatusFilter !== 'all' && s.status !== queueStatusFilter) return false;
      if (queueIntentFilter !== 'all' && s.intent_type !== queueIntentFilter) return false;
      return true;
    });
  }, [socialSignals, queuePlatformFilter, queueStatusFilter, queueIntentFilter, showDismissed]);

  const newSignalCount = socialSignals.filter(s => s.status === 'new').length;

  // Profile search for link modal
  const profileSearchResults = useMemo(() => {
    if (!profileSearchTerm || profileSearchTerm.length < 2) return [];
    const term = profileSearchTerm.toLowerCase();
    return profiles.filter(p =>
      p.email.toLowerCase().includes(term) || p.first_name.toLowerCase().includes(term)
    ).slice(0, 5);
  }, [profiles, profileSearchTerm]);

  // ═══════════════════════════════════════════════════════════════
  // CALENDAR EVENT GENERATION
  // ═══════════════════════════════════════════════════════════════
  const deriveBranchColor = (branchId: string): string => {
    for (const [key, color] of Object.entries(BRANCH_COLOR_MAP)) {
      if (branchId.includes(key)) return color;
    }
    return '#6b7280';
  };

  const deriveBranchName = (branchId: string): string => {
    const branch = branches?.find(b => b.id === branchId);
    if (branch) return branch.name;
    const seg = branchId.split('.')[0];
    return seg.charAt(0).toUpperCase() + seg.slice(1);
  };

  const calendarEvents: CalendarEvent[] = useMemo(() => {
    const events: CalendarEvent[] = [];

    // From scheduledPosts
    scheduledPosts.forEach(draft => {
      if (draft.status !== 'scheduled' || !draft.scheduled_for) return;
      const branchId = draft.branch_id || 'atlurbanfarms.com';
      Object.keys(draft.versions).forEach(platform => {
        events.push({
          id: `${draft.id}_${platform}`,
          type: 'social_post',
          branch_id: branchId,
          branch_name: deriveBranchName(branchId),
          branch_color: deriveBranchColor(branchId),
          channel: platform as CampaignChannel,
          title: (draft.versions[platform] || draft.base_content).slice(0, 60),
          content_preview: (draft.versions[platform] || draft.base_content).slice(0, 120),
          scheduled_for: draft.scheduled_for!,
          status: draft.approval_status || 'scheduled',
          source: 'social_hub',
          source_id: draft.id,
        });
      });
    });

    // From deployedCampaigns
    deployedCampaigns.forEach(campaign => {
      campaign.channels.forEach(ch => {
        events.push({
          id: `${campaign.id}_${ch.channel}`,
          type: 'campaign_channel',
          branch_id: 'atlurbanfarms.com',
          branch_name: 'ATL Urban Farms',
          branch_color: '#3b82f6',
          channel: ch.channel,
          title: `${campaign.name} — ${ch.channel}`,
          scheduled_for: campaign.date,
          status: ch.status === 'success' ? 'published' : ch.status === 'failed' ? 'failed' : 'scheduled',
          source: 'campaign_builder',
          source_id: campaign.id,
        });
      });
    });

    return events;
  }, [scheduledPosts, deployedCampaigns, branches]);

  // ═══════════════════════════════════════════════════════════════
  // CONFLICT & GAP DETECTION
  // ═══════════════════════════════════════════════════════════════
  const calendarAlerts: CalendarAlert[] = useMemo(() => {
    const alerts: CalendarAlert[] = [];
    const monthStart = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1);
    const monthEnd = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 0, 23, 59, 59);
    const monthEvents = calendarEvents.filter(e => {
      const d = new Date(e.scheduled_for);
      return d >= monthStart && d <= monthEnd;
    });

    // Conflicts: same branch_id + same channel within 2 hours
    for (let i = 0; i < monthEvents.length; i++) {
      for (let j = i + 1; j < monthEvents.length; j++) {
        const a = monthEvents[i];
        const b = monthEvents[j];
        if (a.branch_id === b.branch_id && a.channel === b.channel) {
          const diff = Math.abs(new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime());
          if (diff < 2 * 60 * 60 * 1000) {
            const dateStr = new Date(a.scheduled_for).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            alerts.push({
              type: 'conflict',
              severity: 'warning',
              message: `2 posts for ${a.branch_name} on ${a.channel} within 2 hours on ${dateStr}`,
              events: [a, b],
            });
          }
        }
      }
    }

    // Gaps: branch has posts but missing a platform this month
    const branchPlatforms: Record<string, Set<string>> = {};
    monthEvents.forEach(e => {
      if (!branchPlatforms[e.branch_id]) branchPlatforms[e.branch_id] = new Set();
      branchPlatforms[e.branch_id].add(e.channel);
    });
    const socialChannels = ['instagram', 'x', 'linkedin'];
    Object.entries(branchPlatforms).forEach(([branchId, platforms]) => {
      socialChannels.forEach(ch => {
        if (!platforms.has(ch)) {
          alerts.push({
            type: 'gap',
            severity: 'info',
            message: `No ${ch} content scheduled for ${deriveBranchName(branchId)} this month`,
          });
        }
      });
    });

    return alerts;
  }, [calendarEvents, calendarDate, branches]);

  // ═══════════════════════════════════════════════════════════════
  // CALENDAR GRID HELPERS
  // ═══════════════════════════════════════════════════════════════
  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const days: { date: Date; isCurrentMonth: boolean }[] = [];
    for (let i = firstDay - 1; i >= 0; i--) {
      days.push({ date: new Date(year, month, -i), isCurrentMonth: false });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      days.push({ date: new Date(year, month, d), isCurrentMonth: true });
    }
    while (days.length % 7 !== 0) {
      const nextDay = days.length - firstDay - daysInMonth + 1;
      days.push({ date: new Date(year, month + 1, nextDay), isCurrentMonth: false });
    }
    return days;
  };

  const getEventsForDay = (date: Date) => {
    return calendarEvents.filter(e => {
      const eDate = new Date(e.scheduled_for);
      return eDate.getFullYear() === date.getFullYear() &&
             eDate.getMonth() === date.getMonth() &&
             eDate.getDate() === date.getDate();
    });
  };

  const getWeekDays = (date: Date) => {
    const day = date.getDay();
    const start = new Date(date);
    start.setDate(start.getDate() - day);
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  };

  const isToday = (date: Date) => {
    const now = new Date();
    return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  };

  // ═══════════════════════════════════════════════════════════════
  // COMPLIANCE AUDIT HANDLER
  // ═══════════════════════════════════════════════════════════════
  const handleRunAudit = async (event: CalendarEvent) => {
    setIsAuditing(true);
    setShowCompliancePanel(true);
    setComplianceResult(null);

    const defaultKeys = { active_llm: 'gemini' as const, gemini_api_key: '', openai_api_key: '', anthropic_api_key: '', n8n_webhooks: {} as any, woo_consumer_key: '', woo_consumer_secret: '', resend_token: '', twilio_sid: '', twilio_token: '' };
    const result = await runBrandComplianceAudit(
      apiKeys || defaultKeys,
      event.content_preview || event.title,
      event.branch_name,
      'Professional yet earthy and encouraging',
      ['sustainable', 'urban farming', 'community', 'growth', 'organic'],
      event.channel
    );

    setComplianceResult(result);
    setIsAuditing(false);
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-emerald-600';
    if (score >= 40) return 'text-amber-600';
    return 'text-rose-600';
  };

  const getScoreBg = (score: number) => {
    if (score >= 70) return 'bg-emerald-50 border-emerald-200';
    if (score >= 40) return 'bg-amber-50 border-amber-200';
    return 'bg-rose-50 border-rose-200';
  };

  const handleApproveFromCalendar = (sourceId: string) => {
    setScheduledPosts(prev => prev.map(p => p.id === sourceId ? { ...p, approval_status: 'approved' as ApprovalStatus, approved_by: 'Admin', compliance_score: complianceResult?.overall_score } : p));
    setSelectedCalendarEvent(null);
    setComplianceResult(null);
    setShowCompliancePanel(false);
    addToast?.('Post approved and scheduled.', 'success');
  };

  const handleRejectFromCalendar = (sourceId: string) => {
    setScheduledPosts(prev => prev.map(p => p.id === sourceId ? { ...p, approval_status: 'rejected' as ApprovalStatus, approval_note: approvalNote } : p));
    setSelectedCalendarEvent(null);
    setComplianceResult(null);
    setShowCompliancePanel(false);
    setApprovalNote('');
    addToast?.('Post rejected.', 'info');
  };

  const handleSubmitForReview = (sourceId: string) => {
    setScheduledPosts(prev => prev.map(p => p.id === sourceId ? { ...p, approval_status: 'pending_review' as ApprovalStatus } : p));
    addToast?.('Submitted for review.', 'success');
  };

  // ═══════════════════════════════════════════════════════════════
  // EXISTING HANDLERS (preserved from before)
  // ═══════════════════════════════════════════════════════════════
  const handleGenerateVariants = async (promptOverride?: string) => {
    const promptText = promptOverride || baseContent;
    if (!promptText) return;
    setIsGenerating(true);

    try {
      const platformKeys: string[] = selectedBranchAccounts.length > 0
        ? selectedBranchAccounts.map(a => a.platform as string)
        : ['instagram', 'x', 'linkedin'];
      const uniquePlatforms: string[] = Array.from(new Set(platformKeys));
      const platformList = uniquePlatforms.map(p => SOCIAL_PLATFORM_META[p]?.label || p).join(', ');

      const branchName = selectedBranch?.name || 'brand';
      const tone = selectedBranch?.tone || 'friendly';
      const keywords = (selectedBranch?.brand_keywords || []).join(', ');

      const prompt = `TASK: Brand Broadcast for ${branchName}. VOICE: ${tone}. ${keywords ? `KEYWORDS: ${keywords}. ` : ''}SEED: "${promptText}". Generate variants for ${platformList}. Return JSON.`;

      const schemaProperties: Record<string, any> = {};
      uniquePlatforms.forEach(p => {
        schemaProperties[p] = { type: Type.STRING };
      });

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: { type: Type.OBJECT, properties: schemaProperties, required: uniquePlatforms },
        },
      });

      const result = JSON.parse(response.text || "{}");
      setActiveDraft({
        id: `lab_${Date.now()}`,
        branch_id: selectedBranchId || undefined,
        base_content: promptText,
        versions: result,
        status: 'drafting',
        created_at: new Date().toISOString(),
      });
      setWorkflowStatus('reviewing');
    } catch (error) {
      console.error(error);
    } finally { setIsGenerating(false); }
  };

  const handleQuickApprove = (draft: DraftPost) => {
    const newScheduled: DraftPost = { ...draft, status: 'scheduled', scheduled_for: new Date(Date.now() + 86400000).toISOString() };
    setScheduledPosts(prev => [newScheduled, ...prev]);
    setInboundQueue(prev => prev.filter(p => p.id !== draft.id));
    if (activeDraft?.id === draft.id) {
      setActiveDraft(null);
      setWorkflowStatus('idle');
    }

    const primaryPlatform = Object.keys(draft.versions)[0] || 'instagram';
    const event: MarketingEvent = {
      id: `soc_${Date.now()}`,
      profile_id: 'SYSTEM',
      event_type: 'social_intent',
      source: primaryPlatform as any,
      payload: { content: draft.base_content, branch_id: draft.branch_id },
      created_at: new Date().toISOString()
    };
    setEvents(prev => [event, ...prev]);
    setActiveTab('pipeline');
  };

  const handlePublishNow = async (draft: DraftPost) => {
    if (!draft.branch_id) {
      handleQuickApprove(draft);
      return;
    }

    const branchAccounts = branchSocialAccounts?.[draft.branch_id] || [];
    const connectedPlatforms = branchAccounts
      .filter(acc => acc.is_connected && draft.versions[acc.platform])
      .map(acc => acc.platform as SocialPlatform);

    if (connectedPlatforms.length === 0) {
      handleQuickApprove(draft);
      return;
    }

    setIsPublishing(true);

    const content: Record<string, string> = {};
    connectedPlatforms.forEach(p => {
      content[p] = draft.versions[p];
    });

    const result = await publishToSocial(draft.branch_id, connectedPlatforms, content);

    setPublishResults(prev => ({ ...prev, [draft.id]: result.results }));

    const anySuccess = result.results.some(r => r.success);
    const publishedDraft: DraftPost = {
      ...draft,
      status: anySuccess ? 'published' : 'scheduled',
      published_at: anySuccess ? new Date().toISOString() : undefined,
      publish_results: result.results,
    };

    setScheduledPosts(prev => {
      const existing = prev.findIndex(p => p.id === draft.id);
      if (existing >= 0) {
        return prev.map(p => p.id === draft.id ? publishedDraft : p);
      }
      return [publishedDraft, ...prev];
    });

    if (activeDraft?.id === draft.id) {
      setActiveDraft(null);
      setWorkflowStatus('idle');
    }

    const event: MarketingEvent = {
      id: `soc_pub_${Date.now()}`,
      profile_id: 'SYSTEM',
      event_type: 'social_publish',
      source: connectedPlatforms[0] as any,
      payload: {
        branch_id: draft.branch_id,
        platforms: connectedPlatforms,
        results: result.results,
      },
      created_at: new Date().toISOString(),
    };
    setEvents(prev => [event, ...prev]);

    setIsPublishing(false);
    setActiveTab('pipeline');
  };

  const handleEditFromPipeline = (draft: DraftPost) => {
    setActiveDraft(draft);
    setWorkflowStatus('reviewing');
    setActiveTab('lab');
  };

  const handleArchivePost = (draft: DraftPost) => {
    setScheduledPosts(prev => prev.filter(p => p.id !== draft.id));
    setArchivedPosts(prev => [{ ...draft, status: 'archived' }, ...prev]);
  };

  // ─── Queue Action Handlers ────────────────────────────────────────

  const handleRespondToSignal = (signal: SocialActivity) => {
    setBaseContent(signal.content);
    if (signal.branch_id) setSelectedBranchId(signal.branch_id);
    setSocialSignals(prev => prev.map(s => s.id === signal.id ? { ...s, status: 'actioned' as const, actioned_at: new Date().toISOString() } : s));
    updateSignalStatus(signal.id, 'actioned');
    setActiveTab('lab');
  };

  const handleRouteToSupport = (signal: SocialActivity) => {
    if (!setTickets) return;
    const newTicket: Ticket = {
      id: `tic_social_${Date.now()}`,
      profile_id: signal.matched_profile_id || 'UNKNOWN',
      subject: `Social ${INTENT_LABELS[signal.intent_type] || signal.intent_type}: @${signal.username}`,
      description: signal.content,
      status: 'open',
      priority: signal.confidence > 80 ? 'high' : 'medium',
      source: signal.platform as any,
      sentiment: signal.intent_type === 'complaint' ? 'frustrated' : 'neutral',
      needs_human_review: true,
      created_at: new Date().toISOString(),
    };
    setTickets(prev => [newTicket, ...prev]);
    setSocialSignals(prev => prev.map(s => s.id === signal.id ? { ...s, status: 'actioned' as const, actioned_at: new Date().toISOString() } : s));
    updateSignalStatus(signal.id, 'actioned');
    addToast?.('Routed to Support Hub.', 'success');
  };

  const handleDismissSignal = (signal: SocialActivity) => {
    setSocialSignals(prev => prev.map(s => s.id === signal.id ? { ...s, status: 'dismissed' as const, actioned_at: new Date().toISOString() } : s));
    updateSignalStatus(signal.id, 'dismissed');
  };

  const handleLinkProfile = async (signalId: string, profileId: string, profileName: string) => {
    const signal = socialSignals.find(s => s.id === signalId);
    if (!signal) return;

    await linkProfileToSocial(profileId, signal.platform, signal.username);
    setSocialSignals(prev => prev.map(s => s.id === signalId ? { ...s, matched_profile_id: profileId, profile_matched: true } : s));
    setLinkingSignalId(null);
    setProfileSearchTerm('');
    addToast?.(`Linked @${signal.username} to ${profileName}.`, 'success');
  };

  const getPlatformIcon = (id: string) => {
    if (id === 'email') return Mail;
    if (id === 'sms') return Smartphone;
    return PLATFORM_ICONS[id] || MessageSquare;
  };

  const getBranchForDraft = (draft: DraftPost) => {
    if (!draft.branch_id || !branches) return null;
    return branches.find(b => b.id === draft.branch_id) || null;
  };

  const getBranchNameForSignal = (branchId?: string) => {
    if (!branchId || !branches) return null;
    return branches.find(b => b.id === branchId)?.name || null;
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'text-emerald-600 bg-emerald-50';
    if (confidence >= 50) return 'text-amber-600 bg-amber-50';
    return 'text-rose-600 bg-rose-50';
  };

  const isNewSignal = (createdAt: string) => {
    return Date.now() - new Date(createdAt).getTime() < 5 * 60 * 1000;
  };

  const getMatchedProfileName = (profileId?: string) => {
    if (!profileId) return null;
    const profile = profiles.find(p => p.id === profileId);
    return profile ? `${profile.first_name}${profile.last_name ? ` ${profile.last_name}` : ''}` : null;
  };

  const allPipelinePosts = useMemo(() => {
    const drafts = activeDraft && activeDraft.status === 'drafting' ? [activeDraft] : [];
    return [...drafts, ...scheduledPosts, ...archivedPosts];
  }, [activeDraft, scheduledPosts, archivedPosts]);

  const conflictCount = calendarAlerts.filter(a => a.type === 'conflict').length;
  const gapCount = calendarAlerts.filter(a => a.type === 'gap').length;

  return (
    <div className="space-y-8 min-h-screen pb-40">
      <div className="flex bg-slate-200/40 p-1.5 rounded-[2rem] w-fit border border-slate-200 shadow-sm">
        <button onClick={() => setActiveTab('lab')} className={`flex items-center space-x-3 px-8 py-3.5 rounded-[1.5rem] text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'lab' ? 'bg-white text-emerald-700 shadow-lg' : 'text-slate-500 hover:text-slate-800'}`}><Zap size={18} /><span>Lab</span></button>
        <button onClick={() => setActiveTab('queue')} className={`flex items-center space-x-3 px-8 py-3.5 rounded-[1.5rem] text-xs font-black uppercase tracking-widest transition-all relative ${activeTab === 'queue' ? 'bg-white text-emerald-700 shadow-lg' : 'text-slate-500 hover:text-slate-800'}`}>
          <Terminal size={18} />
          <span>Queue</span>
          {newSignalCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">{newSignalCount}</span>
          )}
        </button>
        <button onClick={() => setActiveTab('pipeline')} className={`flex items-center space-x-3 px-8 py-3.5 rounded-[1.5rem] text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'pipeline' ? 'bg-white text-emerald-700 shadow-lg' : 'text-slate-500 hover:text-slate-800'}`}><CalendarDays size={18} /><span>Pipeline</span></button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 min-h-[700px]">
          {/* ═══════════════ LAB TAB ═══════════════ */}
          {activeTab === 'lab' && (
            <div className="space-y-8 animate-in fade-in duration-500">
              {availableBranches.length > 0 && (
                <div className="flex items-center gap-4">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Branch</label>
                  <div className="flex items-center gap-3 flex-1">
                    <select
                      value={selectedBranchId || ''}
                      onChange={(e) => setSelectedBranchId(e.target.value || null)}
                      className="px-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-slate-800 font-bold text-sm focus:outline-none focus:border-emerald-500 shadow-sm"
                    >
                      {availableBranches.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                    {selectedBranchAccounts.length > 0 && (
                      <div className="flex items-center gap-1.5">
                        {selectedBranchAccounts.map((acc) => {
                          const Icon = getPlatformIcon(acc.platform);
                          return (
                            <span key={`${acc.platform}-${acc.handle}`} className={`p-1.5 rounded-lg bg-white border border-slate-200 shadow-sm ${PLATFORM_COLORS[acc.platform] || 'text-slate-500'}`}>
                              <Icon size={14} />
                            </span>
                          );
                        })}
                      </div>
                    )}
                    {selectedBranchAccounts.length === 0 && selectedBranch && (
                      <span className="text-[10px] text-slate-400 font-bold">No social accounts configured</span>
                    )}
                  </div>
                </div>
              )}

              {workflowStatus === 'idle' ? (
                <div className={`bg-white p-12 rounded-[3.5rem] border border-slate-200 shadow-sm relative ${isGenerating ? 'opacity-40' : ''}`}>
                  {isGenerating && <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/60 backdrop-blur-sm z-20 rounded-[3.5rem]"><Loader2 className="animate-spin text-emerald-600" size={56} /></div>}
                  <h3 className="text-2xl font-black text-slate-800 flex items-center mb-10 pb-6 border-b border-slate-100"><Layers size={32} className="mr-4 text-emerald-600" />Strategy Lab</h3>
                  <textarea className="w-full bg-slate-50 border-2 border-slate-100 rounded-[2rem] p-8 text-xl font-medium outline-none focus:bg-white focus:border-emerald-500 transition-all min-h-[220px] shadow-inner mb-10" placeholder="Describe your concept..." value={baseContent} onChange={(e) => setBaseContent(e.target.value)} />
                  <button onClick={() => handleGenerateVariants()} disabled={!baseContent || isGenerating} className="w-full py-8 text-white bg-slate-900 rounded-[2.5rem] font-black text-xl flex items-center justify-center space-x-4 shadow-2xl hover:bg-emerald-600 transition disabled:opacity-20"><Sparkles size={28} className="text-emerald-400" /><span>Generate multi-platform variants</span></button>
                </div>
              ) : activeDraft && (
                <div className="bg-white p-10 rounded-[3.5rem] border-4 border-emerald-500 shadow-2xl animate-in slide-in-from-bottom-8 duration-700">
                  <div className="flex justify-between items-center mb-10 pb-6 border-b border-slate-100">
                    <div>
                      <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Reviewing Draft</h3>
                      {selectedBranch && (
                        <div className="flex items-center gap-2 mt-2">
                          <div className="w-3 h-3 rounded" style={{ backgroundColor: selectedBranch.primary_color }} />
                          <span className="text-xs font-bold text-slate-500">{selectedBranch.name}</span>
                        </div>
                      )}
                    </div>
                    <button onClick={() => { setWorkflowStatus('idle'); setActiveDraft(null); }} className="p-3 text-slate-300 hover:text-rose-500"><X size={24} /></button>
                  </div>
                  <div className="space-y-8 mb-12">
                    {Object.entries(activeDraft.versions).map(([plat, text]) => (
                        <div key={plat}>
                           <div className="flex items-center space-x-2 text-[10px] font-black uppercase text-slate-400 mb-2">
                             {React.createElement(getPlatformIcon(plat), { size: 14 })}
                             <span>{SOCIAL_PLATFORM_META[plat]?.label || plat} Strategy</span>
                           </div>
                           <textarea className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-6 text-sm font-medium" value={text} onChange={(e) => setActiveDraft({...activeDraft, versions: {...activeDraft.versions, [plat]: e.target.value}})} />
                        </div>
                    ))}
                  </div>
                  <div className="flex gap-4">
                    <button
                      onClick={() => handleQuickApprove(activeDraft)}
                      disabled={isPublishing}
                      className="flex-1 py-7 bg-white border-2 border-slate-200 text-slate-800 rounded-[2.5rem] font-black text-xl flex items-center justify-center space-x-4 shadow-sm hover:border-emerald-500 hover:text-emerald-700 transition disabled:opacity-30"
                    >
                      <Check size={28} className="text-emerald-500" />
                      <span>Approve Draft</span>
                    </button>
                    <button
                      onClick={() => handlePublishNow(activeDraft)}
                      disabled={isPublishing || !activeDraft.branch_id}
                      className="flex-1 py-7 bg-slate-900 text-white rounded-[2.5rem] font-black text-xl flex items-center justify-center space-x-4 shadow-2xl hover:bg-emerald-600 transition disabled:opacity-30"
                    >
                      {isPublishing ? (
                        <Loader2 size={28} className="animate-spin text-emerald-400" />
                      ) : (
                        <Rocket size={28} className="text-emerald-400" />
                      )}
                      <span>{isPublishing ? 'Publishing...' : 'Publish Now'}</span>
                    </button>
                  </div>

                  {publishResults[activeDraft.id] && (
                    <div className="mt-6 space-y-2">
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Publish Results</h4>
                      {publishResults[activeDraft.id].map((r) => {
                        const PIcon = getPlatformIcon(r.platform);
                        return (
                          <div key={r.platform} className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${r.success ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                            <PIcon size={16} className={r.success ? 'text-emerald-600' : 'text-red-500'} />
                            <span className="text-sm font-bold flex-1">
                              {SOCIAL_PLATFORM_META[r.platform]?.label || r.platform}
                            </span>
                            {r.success ? (
                              <div className="flex items-center gap-2">
                                <CheckCircle2 size={14} className="text-emerald-600" />
                                <span className="text-xs font-bold text-emerald-700">Published</span>
                                {r.post_url && (
                                  <a href={r.post_url} target="_blank" rel="noopener noreferrer" className="text-emerald-600 hover:text-emerald-800">
                                    <ExternalLink size={12} />
                                  </a>
                                )}
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                <AlertCircle size={14} className="text-red-500" />
                                <span className="text-xs font-bold text-red-600">{r.error || 'Failed'}</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ═══════════════ QUEUE TAB ═══════════════ */}
          {activeTab === 'queue' && (
            <div className="space-y-6 animate-in fade-in duration-500">
              <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1">
                  <button onClick={() => setQueuePlatformFilter('all')} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition ${queuePlatformFilter === 'all' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>All</button>
                  {(['instagram', 'x', 'linkedin'] as SocialPlatform[]).map(p => {
                    const Icon = getPlatformIcon(p);
                    const count = socialSignals.filter(s => s.platform === p && s.status !== 'dismissed').length;
                    return (
                      <button key={p} onClick={() => setQueuePlatformFilter(p)} className={`p-1.5 rounded-lg transition relative ${queuePlatformFilter === p ? 'bg-slate-900 text-white' : `bg-slate-100 hover:bg-slate-200 ${PLATFORM_COLORS[p]}`}`}>
                        <Icon size={14} />
                        {count > 0 && <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-500 text-white text-[7px] font-bold rounded-full flex items-center justify-center">{count}</span>}
                      </button>
                    );
                  })}
                </div>
                <div className="w-px h-6 bg-slate-200" />
                <div className="flex items-center gap-1">
                  {(['new', 'reviewed', 'all'] as const).map(s => (
                    <button key={s} onClick={() => setQueueStatusFilter(s)} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition ${queueStatusFilter === s ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{s === 'all' ? 'All Status' : s}</button>
                  ))}
                </div>
                <div className="w-px h-6 bg-slate-200" />
                <select value={queueIntentFilter} onChange={e => setQueueIntentFilter(e.target.value)} className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-slate-100 text-slate-600 border-0 focus:outline-none cursor-pointer">
                  <option value="all">All Intents</option>
                  {Object.entries(INTENT_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
                <div className="flex-1" />
                <button onClick={() => setShowDismissed(!showDismissed)} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition ${showDismissed ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>
                  <Eye size={12} className="inline mr-1" />Dismissed
                </button>
                <button
                  onClick={() => setSocialSignals(prev => [generateTestSignal(selectedBranchId), ...prev])}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition"
                >
                  <Plus size={12} className="inline mr-1" />Test Signal
                </button>
              </div>

              {filteredSignals.length === 0 ? (
                <div className="py-32 text-center bg-slate-50 border-4 border-dashed border-slate-200 rounded-[4rem]">
                  <Rocket size={64} className="mx-auto text-slate-200 mb-6 opacity-40" />
                  <p className="text-xl font-black text-slate-400 uppercase tracking-widest">Inbound Queue Clear</p>
                  <p className="text-xs text-slate-500 font-bold mt-2">No signals match your current filters.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredSignals.map(signal => {
                    const PlatIcon = getPlatformIcon(signal.platform);
                    const IntentIcon = INTENT_ICONS[signal.intent_type] || Hash;
                    const branchName = getBranchNameForSignal(signal.branch_id);
                    const matchedName = getMatchedProfileName(signal.matched_profile_id);
                    const isDismissed = signal.status === 'dismissed';

                    return (
                      <div key={signal.id} className={`bg-white rounded-[2rem] p-6 border border-slate-200 shadow-sm transition-all ${isDismissed ? 'opacity-50' : ''}`}>
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-xl bg-white shadow-sm border border-slate-100 ${PLATFORM_COLORS[signal.platform] || 'text-slate-500'}`}>
                              <PlatIcon size={18} />
                            </div>
                            <span className="text-xs font-black text-slate-700 uppercase">@{signal.username}</span>
                            {isNewSignal(signal.created_at) && signal.status === 'new' && (
                              <span className="relative flex h-2.5 w-2.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                              </span>
                            )}
                          </div>
                          <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black ${getConfidenceColor(signal.confidence)}`}>
                            {signal.confidence}% conf
                          </span>
                        </div>
                        {branchName && <p className="text-[10px] font-bold text-slate-400 mb-2">branch: {branchName}</p>}
                        <p className="text-sm text-slate-600 leading-relaxed font-medium italic mb-4">&quot;{signal.content}&quot;</p>
                        <div className="flex items-center gap-3 mb-4">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase ${INTENT_COLORS[signal.intent_type] || 'bg-slate-100 text-slate-500'}`}>
                            <IntentIcon size={12} />
                            {INTENT_LABELS[signal.intent_type] || signal.intent_type}
                          </span>
                          {signal.profile_matched ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600">
                              <CheckCircle2 size={12} /> Matched{matchedName ? ` — ${matchedName}` : ''}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400">
                              <XCircle size={12} /> Unmatched
                            </span>
                          )}
                        </div>
                        {!isDismissed && (
                          <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                            <button onClick={() => handleRespondToSignal(signal)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 hover:bg-emerald-100 text-slate-600 hover:text-emerald-700 text-[10px] font-black uppercase tracking-wider transition"><Zap size={14} /> Respond</button>
                            <button onClick={() => handleRouteToSupport(signal)} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 hover:bg-blue-100 text-slate-600 hover:text-blue-700 text-[10px] font-black uppercase tracking-wider transition"><LifeBuoy size={14} /> Route to Support</button>
                            <button onClick={() => { setLinkingSignalId(signal.id); setProfileSearchTerm(''); }} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 hover:bg-purple-100 text-slate-600 hover:text-purple-700 text-[10px] font-black uppercase tracking-wider transition"><Users size={14} /> Link to Profile</button>
                            <div className="flex-1" />
                            <button onClick={() => handleDismissSignal(signal)} className="p-2 rounded-xl bg-slate-100 hover:bg-rose-100 text-slate-400 hover:text-rose-500 transition"><X size={14} /></button>
                          </div>
                        )}
                        {linkingSignalId === signal.id && (
                          <div className="mt-3 p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                            <input type="text" placeholder="Search by email or name..." value={profileSearchTerm} onChange={e => setProfileSearchTerm(e.target.value)} className="w-full px-4 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:border-emerald-500" autoFocus />
                            {profileSearchResults.length > 0 && (
                              <div className="space-y-1">
                                {profileSearchResults.map(p => (
                                  <button key={p.id} onClick={() => handleLinkProfile(signal.id, p.id, `${p.first_name}${p.last_name ? ` ${p.last_name}` : ''}`)} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-emerald-50 transition text-left">
                                    <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center text-xs font-bold text-slate-600">{p.first_name.charAt(0)}</div>
                                    <div>
                                      <p className="text-sm font-bold text-slate-700">{p.first_name}{p.last_name ? ` ${p.last_name}` : ''}</p>
                                      <p className="text-[10px] text-slate-400">{p.email}</p>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            )}
                            <button onClick={() => setLinkingSignalId(null)} className="text-[10px] font-bold text-slate-400 hover:text-slate-600">Cancel</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ═══════════════ PIPELINE TAB — CONTENT CALENDAR ═══════════════ */}
          {activeTab === 'pipeline' && (
            <div className="space-y-6 animate-in fade-in duration-500">
              {/* Header + View toggle */}
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black text-slate-800 flex items-center gap-3">
                  <CalendarDays size={22} className="text-emerald-600" />
                  Content Calendar
                </h3>
                <div className="flex bg-slate-100 p-1 rounded-xl">
                  <button onClick={() => setCalendarView('month')} className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${calendarView === 'month' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}><LayoutGrid size={14} />Month</button>
                  <button onClick={() => setCalendarView('week')} className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${calendarView === 'week' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}><List size={14} />Week</button>
                </div>
              </div>

              {/* Calendar Alerts */}
              {calendarAlerts.length > 0 && (
                <div className="space-y-2">
                  {calendarAlerts.slice(0, 4).map((alert, i) => (
                    <div key={i} className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${alert.type === 'conflict' ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'}`}>
                      {alert.type === 'conflict' ? <AlertTriangle size={14} className="text-amber-600 flex-shrink-0" /> : <Info size={14} className="text-blue-600 flex-shrink-0" />}
                      <span className={`text-xs font-bold ${alert.type === 'conflict' ? 'text-amber-700' : 'text-blue-700'}`}>{alert.message}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Month View */}
              {calendarView === 'month' && (
                <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
                  {/* Month header */}
                  <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <button onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1))} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition"><ChevronLeft size={18} /></button>
                    <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">
                      {calendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </h4>
                    <button onClick={() => setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1))} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition"><ChevronRight size={18} /></button>
                  </div>

                  {/* Day headers */}
                  <div className="grid grid-cols-7 border-b border-slate-100">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                      <div key={d} className="px-2 py-2 text-center text-[9px] font-black text-slate-400 uppercase tracking-widest">{d}</div>
                    ))}
                  </div>

                  {/* Day cells */}
                  <div className="grid grid-cols-7">
                    {getDaysInMonth(calendarDate).map((day, idx) => {
                      const dayEvents = getEventsForDay(day.date);
                      const today = isToday(day.date);
                      return (
                        <div key={idx} className={`min-h-[90px] border-b border-r border-slate-50 p-1.5 ${!day.isCurrentMonth ? 'opacity-40 bg-slate-50/50' : ''} ${today ? 'ring-2 ring-inset ring-emerald-500' : ''}`}>
                          <span className={`text-[10px] font-black ${today ? 'text-emerald-600' : 'text-slate-400'}`}>{day.date.getDate()}</span>
                          <div className="mt-1 space-y-0.5">
                            {dayEvents.slice(0, 3).map(ev => {
                              const PIcon = getPlatformIcon(ev.channel);
                              return (
                                <button
                                  key={ev.id}
                                  onClick={() => { setSelectedCalendarEvent(ev); setComplianceResult(null); setShowCompliancePanel(false); }}
                                  className="w-full flex items-center gap-1 px-1.5 py-0.5 rounded text-left hover:bg-slate-100 transition group"
                                  style={{ borderLeft: `3px solid ${ev.branch_color}` }}
                                >
                                  <PIcon size={10} className="text-slate-400 flex-shrink-0" />
                                  <span className="text-[8px] font-bold text-slate-600 truncate">{ev.title.slice(0, 30)}</span>
                                </button>
                              );
                            })}
                            {dayEvents.length > 3 && (
                              <span className="text-[8px] font-bold text-slate-400 pl-1">+{dayEvents.length - 3} more</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Week View */}
              {calendarView === 'week' && (
                <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
                    <button onClick={() => { const d = new Date(calendarDate); d.setDate(d.getDate() - 7); setCalendarDate(d); }} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition"><ChevronLeft size={18} /></button>
                    <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">
                      {(() => {
                        const week = getWeekDays(calendarDate);
                        const start = week[0];
                        const end = week[6];
                        return `Week of ${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
                      })()}
                    </h4>
                    <button onClick={() => { const d = new Date(calendarDate); d.setDate(d.getDate() + 7); setCalendarDate(d); }} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition"><ChevronRight size={18} /></button>
                  </div>
                  <div className="grid grid-cols-7 divide-x divide-slate-100">
                    {getWeekDays(calendarDate).map((day, idx) => {
                      const dayEvents = getEventsForDay(day);
                      const today = isToday(day);
                      return (
                        <div key={idx} className={`min-h-[300px] p-2 ${today ? 'bg-emerald-50/30' : ''}`}>
                          <div className="text-center mb-3">
                            <p className="text-[9px] font-black text-slate-400 uppercase">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][idx]}</p>
                            <p className={`text-lg font-black ${today ? 'text-emerald-600' : 'text-slate-700'}`}>{day.getDate()}</p>
                          </div>
                          <div className="space-y-2">
                            {dayEvents.map(ev => {
                              const PIcon = getPlatformIcon(ev.channel);
                              const time = new Date(ev.scheduled_for).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                              return (
                                <button
                                  key={ev.id}
                                  onClick={() => { setSelectedCalendarEvent(ev); setComplianceResult(null); setShowCompliancePanel(false); }}
                                  className="w-full rounded-xl p-2 border border-slate-100 hover:border-emerald-300 transition text-left"
                                  style={{ borderLeft: `3px solid ${ev.branch_color}` }}
                                >
                                  <div className="flex items-center gap-1 mb-1">
                                    <PIcon size={10} className="text-slate-400" />
                                    <span className="text-[8px] font-bold text-slate-400">{time}</span>
                                  </div>
                                  <p className="text-[10px] font-bold text-slate-700 line-clamp-2">{ev.title}</p>
                                  <span className={`inline-block mt-1 text-[7px] font-black uppercase px-1.5 py-0.5 rounded ${
                                    ev.status === 'published' ? 'bg-emerald-100 text-emerald-700' :
                                    ev.status === 'failed' ? 'bg-rose-100 text-rose-700' :
                                    ev.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                                    ev.status === 'rejected' ? 'bg-rose-100 text-rose-700' :
                                    ev.status === 'pending_review' ? 'bg-amber-100 text-amber-700' :
                                    'bg-blue-100 text-blue-700'
                                  }`}>{ev.status}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Event Detail + Compliance Panel */}
              {selectedCalendarEvent && (
                <div className="bg-white rounded-[2rem] border-2 border-emerald-200 shadow-lg p-8 animate-in slide-in-from-bottom-4 duration-300">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h4 className="text-lg font-black text-slate-800 uppercase tracking-tight">Event Detail</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="w-3 h-3 rounded" style={{ backgroundColor: selectedCalendarEvent.branch_color }} />
                        <span className="text-xs font-bold text-slate-500">{selectedCalendarEvent.branch_name}</span>
                        <span className="text-[10px] text-slate-400">|</span>
                        <span className="text-[10px] font-bold text-slate-400 uppercase">{selectedCalendarEvent.channel}</span>
                        <span className="text-[10px] text-slate-400">|</span>
                        <span className="text-[10px] font-bold text-slate-400">{new Date(selectedCalendarEvent.scheduled_for).toLocaleString()}</span>
                      </div>
                    </div>
                    <button onClick={() => { setSelectedCalendarEvent(null); setComplianceResult(null); setShowCompliancePanel(false); }} className="p-2 text-slate-300 hover:text-rose-500"><X size={20} /></button>
                  </div>

                  <div className="bg-slate-50 rounded-2xl p-6 mb-6">
                    <p className="text-sm text-slate-700 font-medium leading-relaxed">{selectedCalendarEvent.content_preview || selectedCalendarEvent.title}</p>
                  </div>

                  {/* Approval Status Display */}
                  {selectedCalendarEvent.source === 'social_hub' && (() => {
                    const draft = scheduledPosts.find(p => p.id === selectedCalendarEvent.source_id);
                    if (!draft) return null;
                    const approvalSt = draft.approval_status || 'draft';
                    return (
                      <div className="mb-6 space-y-3">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Approval Status</p>
                        {approvalSt === 'draft' && (
                          <button onClick={() => handleSubmitForReview(draft.id)} className="px-4 py-2 rounded-xl bg-blue-100 text-blue-700 text-xs font-black hover:bg-blue-200 transition">Submit for Review</button>
                        )}
                        {approvalSt === 'pending_review' && (
                          <div className="flex items-center gap-3">
                            <span className="px-3 py-1.5 rounded-xl bg-amber-100 text-amber-700 text-[10px] font-black uppercase">Pending Review</span>
                            <button onClick={() => handleApproveFromCalendar(draft.id)} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-black hover:bg-emerald-700 transition">Approve</button>
                            <button onClick={() => handleRejectFromCalendar(draft.id)} className="px-4 py-2 rounded-xl bg-rose-100 text-rose-700 text-xs font-black hover:bg-rose-200 transition">Reject</button>
                            <textarea value={approvalNote} onChange={e => setApprovalNote(e.target.value)} placeholder="Rejection note..." className="flex-1 px-3 py-2 border border-slate-200 rounded-xl text-xs" />
                          </div>
                        )}
                        {approvalSt === 'approved' && (
                          <div className="flex items-center gap-2">
                            <CheckCircle2 size={16} className="text-emerald-600" />
                            <span className="text-xs font-black text-emerald-700">Approved{draft.approved_by ? ` by ${draft.approved_by}` : ''}</span>
                          </div>
                        )}
                        {approvalSt === 'rejected' && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <XCircle size={16} className="text-rose-600" />
                              <span className="text-xs font-black text-rose-700">Rejected</span>
                            </div>
                            {draft.approval_note && <p className="text-xs text-slate-500 italic">{draft.approval_note}</p>}
                            <button onClick={() => { handleEditFromPipeline(draft); setSelectedCalendarEvent(null); }} className="px-4 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-black hover:bg-slate-200 transition">Revise & Resubmit</button>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Compliance Audit */}
                  <div className="flex items-center gap-3 mb-4">
                    <button
                      onClick={() => handleRunAudit(selectedCalendarEvent)}
                      disabled={isAuditing}
                      className="flex items-center gap-2 px-5 py-3 rounded-xl bg-slate-900 text-white text-xs font-black hover:bg-emerald-600 transition disabled:opacity-50"
                    >
                      {isAuditing ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                      <span>{isAuditing ? 'Auditing...' : 'Run Compliance Audit'}</span>
                    </button>
                    {selectedCalendarEvent.source === 'social_hub' && (
                      <button
                        onClick={() => {
                          const draft = scheduledPosts.find(p => p.id === selectedCalendarEvent.source_id);
                          if (draft) { handleEditFromPipeline(draft); setSelectedCalendarEvent(null); }
                        }}
                        className="flex items-center gap-2 px-5 py-3 rounded-xl border border-slate-200 text-slate-600 text-xs font-black hover:border-emerald-500 hover:text-emerald-700 transition"
                      >
                        <Edit2 size={14} />
                        <span>Edit & Recheck</span>
                      </button>
                    )}
                  </div>

                  {/* Compliance Results */}
                  {showCompliancePanel && complianceResult && (
                    <div className={`rounded-2xl border p-6 space-y-4 ${getScoreBg(complianceResult.overall_score)}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <span className={`text-4xl font-black ${getScoreColor(complianceResult.overall_score)}`}>{complianceResult.overall_score}</span>
                          <div>
                            <span className={`inline-block px-3 py-1 rounded-lg text-xs font-black uppercase ${
                              complianceResult.status === 'approved' ? 'bg-emerald-200 text-emerald-800' :
                              complianceResult.status === 'warning' ? 'bg-amber-200 text-amber-800' :
                              'bg-rose-200 text-rose-800'
                            }`}>{complianceResult.status}</span>
                            <p className="text-[9px] text-slate-400 mt-1">Audited {new Date(complianceResult.audited_at).toLocaleTimeString()}</p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {complianceResult.checks.map((check, i) => (
                          <div key={i} className="flex items-start gap-3 bg-white/60 rounded-xl px-4 py-3">
                            {check.status === 'pass' ? <CheckCircle2 size={16} className="text-emerald-600 mt-0.5 flex-shrink-0" /> :
                             check.status === 'warning' ? <AlertTriangle size={16} className="text-amber-600 mt-0.5 flex-shrink-0" /> :
                             <XCircle size={16} className="text-rose-600 mt-0.5 flex-shrink-0" />}
                            <div className="flex-1">
                              <p className="text-[10px] font-black text-slate-500 uppercase tracking-wider">{check.category.replace('_', ' ')}</p>
                              <p className="text-xs text-slate-700 font-medium">{check.message}</p>
                              {check.suggestion && <p className="text-[10px] text-slate-400 italic mt-1">{check.suggestion}</p>}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Action buttons based on score */}
                      {selectedCalendarEvent.source === 'social_hub' && (
                        <div className="flex items-center gap-3 pt-4 border-t border-slate-200/50">
                          {complianceResult.overall_score >= 70 && (
                            <button onClick={() => handleApproveFromCalendar(selectedCalendarEvent.source_id)} className="px-5 py-3 rounded-xl bg-emerald-600 text-white text-xs font-black hover:bg-emerald-700 transition flex items-center gap-2">
                              <CheckCircle2 size={14} /> Approve & Schedule
                            </button>
                          )}
                          {complianceResult.overall_score >= 40 && complianceResult.overall_score < 70 && (
                            <>
                              <button onClick={() => handleApproveFromCalendar(selectedCalendarEvent.source_id)} className="px-5 py-3 rounded-xl bg-amber-500 text-white text-xs font-black hover:bg-amber-600 transition flex items-center gap-2">
                                <AlertTriangle size={14} /> Publish Anyway
                              </button>
                              <button onClick={() => {
                                const draft = scheduledPosts.find(p => p.id === selectedCalendarEvent.source_id);
                                if (draft) { handleEditFromPipeline(draft); setSelectedCalendarEvent(null); }
                              }} className="px-5 py-3 rounded-xl border border-slate-200 text-slate-600 text-xs font-black hover:border-emerald-500 transition flex items-center gap-2">
                                <Edit2 size={14} /> Edit & Recheck
                              </button>
                            </>
                          )}
                          {complianceResult.overall_score < 40 && (
                            <>
                              <button disabled className="px-5 py-3 rounded-xl bg-slate-200 text-slate-400 text-xs font-black cursor-not-allowed flex items-center gap-2">
                                <Ban size={14} /> Blocked — Edit Required
                              </button>
                              <button onClick={() => {
                                const draft = scheduledPosts.find(p => p.id === selectedCalendarEvent.source_id);
                                if (draft) { handleEditFromPipeline(draft); setSelectedCalendarEvent(null); }
                              }} className="px-5 py-3 rounded-xl border border-slate-200 text-slate-600 text-xs font-black hover:border-emerald-500 transition flex items-center gap-2">
                                <Edit2 size={14} /> Edit & Recheck
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Empty state */}
              {calendarEvents.length === 0 && !selectedCalendarEvent && (
                <div className="py-20 text-center bg-slate-50 border-4 border-dashed border-slate-200 rounded-[4rem]">
                  <CalendarDays size={48} className="mx-auto text-slate-200 mb-4" />
                  <p className="text-lg font-black text-slate-300 uppercase tracking-widest">Calendar Empty</p>
                  <p className="text-sm text-slate-400 font-bold mt-2">Generate and approve content from the Lab to populate your calendar</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-8">
          {/* Intent Watcher */}
          <div className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center mb-10"><Target size={22} className="mr-4 text-pink-500" />Intent Watcher</h3>
            <div className="space-y-6">
              {socialSignals.filter(s => s.status === 'new').length > 0 ? (
                socialSignals.filter(s => s.status === 'new').slice(0, 5).map((signal) => {
                  const branchName = getBranchNameForSignal(signal.branch_id);
                  return (
                    <div key={signal.id} onClick={() => handleGenerateVariants(signal.content)} className="p-8 rounded-[2.5rem] border-2 bg-slate-50 border-slate-100 hover:border-emerald-300 hover:bg-white shadow-sm transition-all cursor-pointer group">
                      <div className="flex items-center space-x-3 mb-2">
                        <div className={`p-2.5 rounded-xl bg-white shadow-sm border border-slate-100 ${PLATFORM_COLORS[signal.platform] || 'text-slate-500'}`}>{React.createElement(getPlatformIcon(signal.platform), { size: 18 })}</div>
                        <span className="text-xs font-black text-slate-700 uppercase">@{signal.username}</span>
                        {isNewSignal(signal.created_at) && (
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                          </span>
                        )}
                      </div>
                      {branchName && <p className="text-[9px] font-bold text-slate-400 mb-2 ml-12">{branchName}</p>}
                      <div className="flex items-center gap-2 mb-3 ml-12">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black ${getConfidenceColor(signal.confidence)}`}>{signal.confidence}%</span>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black ${INTENT_COLORS[signal.intent_type] || 'bg-slate-100 text-slate-500'}`}>{INTENT_LABELS[signal.intent_type] || signal.intent_type}</span>
                      </div>
                      <p className="text-sm text-slate-600 leading-relaxed font-medium italic line-clamp-3">&quot;{signal.content}&quot;</p>
                    </div>
                  );
                })
              ) : (
                <div className="py-12 text-center">
                  <Target size={32} className="mx-auto text-slate-200 mb-3" />
                  <p className="text-sm font-black text-slate-300 uppercase tracking-widest">Inbound Queue Clear</p>
                  <p className="text-xs text-slate-400 font-bold mt-1">No pending social signals.</p>
                </div>
              )}
            </div>
          </div>

          {/* Calendar Alerts Summary */}
          <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm">
            <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center mb-6"><ShieldCheck size={20} className="mr-3 text-emerald-600" />Calendar Health</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} className="text-amber-500" />
                  <span className="text-xs font-bold text-slate-600">Conflicts</span>
                </div>
                <span className={`text-sm font-black ${conflictCount > 0 ? 'text-amber-600' : 'text-slate-300'}`}>{conflictCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Info size={14} className="text-blue-500" />
                  <span className="text-xs font-bold text-slate-600">Coverage Gaps</span>
                </div>
                <span className={`text-sm font-black ${gapCount > 0 ? 'text-blue-600' : 'text-slate-300'}`}>{gapCount}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarDays size={14} className="text-emerald-500" />
                  <span className="text-xs font-bold text-slate-600">Scheduled Events</span>
                </div>
                <span className="text-sm font-black text-emerald-600">{calendarEvents.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SocialHub;
