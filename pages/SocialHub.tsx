
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { DraftPost, SocialActivity, Profile, MarketingEvent, BranchContext, Branch, BranchSocialAccountsMap, SocialPlatform, Ticket, IntentType, CalendarEvent, CampaignChannel, ComplianceResult, DeployedCampaign, ApprovalStatus, ApiKeyConfig } from '../types';
import { Article } from '../src/data/helpContent';
import { GoogleGenAI, Type } from "@google/genai";
import { SOCIAL_PLATFORM_META, PLATFORM_ICONS, PLATFORM_COLORS, getSocialUrl } from '../utils';
import { updateSignalStatus, linkProfileToSocial, publishToSocial, publishToFacebook } from '../services/socialService';
import { uploadSocialImage, getPublishedPosts, PublishedPost } from '../lib/supabaseService';
import { runBrandComplianceAudit } from '../services/aiService';
import {
  Sparkles, Send,
  CheckCircle2, Clock, MessageSquare, Zap, RefreshCw,
  Edit2, XCircle, Loader2, Terminal, Layers, Archive, Rocket,
  Target, Settings2, CalendarDays, LayoutGrid, List, X, Check,
  History, Ban, RotateCcw, ChevronLeft, ChevronRight,
  AlertTriangle, ShieldCheck, Mail, Smartphone, Eye,
  Globe, ChevronDown, AlertCircle, ExternalLink, LifeBuoy, Users, ShoppingCart, Headphones, Star, Hash, Megaphone, Trash2, Plus, Info, Copy, ImagePlus, Download,
  BarChart3, Search, ArrowUpDown, Image as ImageIcon
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

type Recurrence = 'none' | 'weekly' | 'monthly';

// Format a Date as a datetime-local input value (local time, no timezone suffix)
const toLocalInput = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// Default schedule slot: tomorrow at 9:00am local
const defaultScheduleAt = (): string => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return toLocalInput(d);
};

// A draft's base id, ignoring any recurrence suffix (e.g. "lab_1_atl_r3" -> "lab_1_atl").
// Used to make re-scheduling idempotent so editing + re-scheduling replaces a series instead of duplicating it.
const baseDraftId = (id: string): string => id.replace(/_r\d+$/, '');

// Expand a start date + cadence into N ISO timestamps
const buildScheduleDates = (startIso: string, recurrence: Recurrence, count: number): string[] => {
  const start = new Date(startIso);
  const n = recurrence === 'none' ? 1 : Math.max(1, Math.min(count, 52));
  const dates: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(start);
    if (recurrence === 'weekly') d.setDate(d.getDate() + i * 7);
    else if (recurrence === 'monthly') d.setMonth(d.getMonth() + i);
    dates.push(d.toISOString());
  }
  return dates;
};

// Content models in preference order: the preview model first, then a stable GA
// model. Preview endpoints are deprioritized under load and 503 more often.
const CONTENT_MODELS = ['gemini-3-flash-preview', 'gemini-2.5-flash'];

const isTransientError = (e: unknown): boolean => {
  const msg = String((e as any)?.message || e);
  return msg.includes('503') || msg.includes('UNAVAILABLE') || msg.includes('overloaded') || msg.includes('high demand');
};

// Try each model in turn; for each, retry transient overloads (503 / UNAVAILABLE)
// with exponential backoff before falling back to the next model. Non-transient
// errors (bad key, schema) throw immediately. `fn` receives the model to use.
const generateWithFallback = async <T,>(
  fn: (model: string) => Promise<T>,
  models: string[] = CONTENT_MODELS,
  attemptsPerModel = 2,
): Promise<{ result: T; model: string }> => {
  let lastErr: unknown;
  for (const model of models) {
    for (let i = 0; i < attemptsPerModel; i++) {
      try {
        return { result: await fn(model), model };
      } catch (e) {
        lastErr = e;
        if (!isTransientError(e)) throw e;
        // Last attempt on this model: fall through to the next model.
        if (i === attemptsPerModel - 1) break;
        await new Promise(res => setTimeout(res, 1000 * Math.pow(2, i))); // 1s, 2s
      }
    }
  }
  throw lastErr;
};

const SocialHub: React.FC<SocialHubProps> = ({ profiles, setEvents, branchContext, branches, branchSocialAccounts, socialSignals, setSocialSignals, tickets, setTickets, scheduledPosts, setScheduledPosts, deployedCampaigns, addToast, apiKeys, onOpenArticle }) => {
  const [activeTab, setActiveTab] = useState<'lab' | 'queue' | 'pipeline' | 'reports'>('lab');

  // ─── Reports tab: published posts from marketing_events ─────────────
  const [reportPosts, setReportPosts] = useState<PublishedPost[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [reportsLoaded, setReportsLoaded] = useState(false);
  const [reportSearch, setReportSearch] = useState('');
  const [reportPlatformFilter, setReportPlatformFilter] = useState<'all' | 'instagram' | 'facebook'>('all');
  const [reportSortKey, setReportSortKey] = useState<'date' | 'platform' | 'branch'>('date');
  const [reportSortDir, setReportSortDir] = useState<'asc' | 'desc'>('desc');
  const [reportImgErrors, setReportImgErrors] = useState<Record<string, boolean>>({});

  // Resolve a branch_id to a display name (falls back to the id).
  const reportBranchName = (branchId: string | null): string => {
    if (!branchId) return 'Unknown';
    return branches?.find(b => b.id === branchId)?.name || branchId;
  };

  // Load published posts lazily the first time the Reports tab is opened.
  const loadReports = async () => {
    setReportsLoading(true);
    setReportsError(null);
    try {
      const posts = await getPublishedPosts();
      setReportPosts(posts);
      setReportsLoaded(true);
    } catch (err) {
      console.error('Failed to load published posts:', err);
      setReportsError('Could not load published posts. Please try again.');
    } finally {
      setReportsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'reports' && !reportsLoaded && !reportsLoading) {
      loadReports();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Toggle sort: clicking the active column flips direction; a new column resets to desc.
  const toggleReportSort = (key: 'date' | 'platform' | 'branch') => {
    if (reportSortKey === key) {
      setReportSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setReportSortKey(key);
      setReportSortDir('desc');
    }
  };

  // Filtered + sorted view of the published posts.
  const visibleReportPosts = useMemo(() => {
    const q = reportSearch.trim().toLowerCase();
    let rows = reportPosts;

    if (reportPlatformFilter !== 'all') {
      rows = rows.filter(p => p.source === reportPlatformFilter);
    }
    if (q) {
      rows = rows.filter(p =>
        p.caption.toLowerCase().includes(q) ||
        reportBranchName(p.branch_id).toLowerCase().includes(q)
      );
    }

    const dir = reportSortDir === 'asc' ? 1 : -1;
    const sorted = [...rows].sort((a, b) => {
      let cmp = 0;
      if (reportSortKey === 'date') {
        cmp = new Date(a.published_at || a.created_at).getTime() - new Date(b.published_at || b.created_at).getTime();
      } else if (reportSortKey === 'platform') {
        cmp = a.source.localeCompare(b.source);
      } else {
        cmp = reportBranchName(a.branch_id).localeCompare(reportBranchName(b.branch_id));
      }
      // Stable tiebreaker on date (newest first) when the primary key is equal.
      if (cmp === 0) cmp = new Date(a.published_at || a.created_at).getTime() - new Date(b.published_at || b.created_at).getTime();
      return cmp * dir;
    });
    return sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportPosts, reportSearch, reportPlatformFilter, reportSortKey, reportSortDir, branches]);
  const [baseContent, setBaseContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeDrafts, setActiveDrafts] = useState<DraftPost[]>([]);
  const [workflowStatus, setWorkflowStatus] = useState<'idle' | 'reviewing'>('idle');
  const [inboundQueue, setInboundQueue] = useState<DraftPost[]>([]);
  const [archivedPosts, setArchivedPosts] = useState<DraftPost[]>(() => {
    try {
      const stored = localStorage.getItem(PIPELINE_STORAGE_KEY);
      return stored ? JSON.parse(stored).archived || [] : [];
    } catch { return []; }
  });
  const [publishedPosts, setPublishedPosts] = useState<DraftPost[]>(() => {
    try {
      const stored = localStorage.getItem(PIPELINE_STORAGE_KEY);
      return stored ? JSON.parse(stored).published || [] : [];
    } catch { return []; }
  });
  const [selectedBranchIds, setSelectedBranchIds] = useState<string[]>([]);

  // Content-only mode: which platforms to generate variants for (no publishing — export to Meta Business Suite)
  const [selectedPlatforms, setSelectedPlatforms] = useState<SocialPlatform[]>(['facebook', 'instagram']);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [uploadingDraftId, setUploadingDraftId] = useState<string | null>(null);

  // Publish Now (Instagram + Facebook) — confirm modal + in-flight tracking.
  // Tracked per (draft, platform) so a draft can publish to each platform separately.
  const [publishConfirm, setPublishConfirm] = useState<{ draftId: string; platform: 'instagram' | 'facebook' } | null>(null);
  const [publishingKey, setPublishingKey] = useState<string | null>(null); // `${draftId}_${platform}` while in flight

  // Scheduling controls (content-only: drafts land on the calendar, not published)
  const [scheduleAt, setScheduleAt] = useState<string>(() => defaultScheduleAt());
  const [recurrence, setRecurrence] = useState<Recurrence>('none');
  const [recurrenceCount, setRecurrenceCount] = useState<number>(4);

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
  const [selectedCalendarDay, setSelectedCalendarDay] = useState<Date | null>(null);
  const dayDetailRef = useRef<HTMLDivElement>(null);
  const [complianceResult, setComplianceResult] = useState<ComplianceResult | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [showCompliancePanel, setShowCompliancePanel] = useState(false);
  const [approvalNote, setApprovalNote] = useState('');

  // Persist archived + published posts to localStorage
  useEffect(() => {
    localStorage.setItem(PIPELINE_STORAGE_KEY, JSON.stringify({
      scheduled: scheduledPosts,
      archived: archivedPosts,
      published: publishedPosts,
    }));
  }, [scheduledPosts, archivedPosts, publishedPosts]);

  // Bring the Day Detail panel into view when a calendar day is clicked
  useEffect(() => {
    if (selectedCalendarDay && !selectedCalendarEvent) {
      requestAnimationFrame(() => {
        dayDetailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }, [selectedCalendarDay, selectedCalendarEvent]);

  // Filter branches by active context
  const availableBranches = useMemo(() => {
    if (!branches) return [];
    if (!branchContext || branchContext.isAllSelected) return branches.filter(b => b.is_active);
    return branches.filter(b => b.is_active && branchContext.activeBranchSlugs.includes(b.slug));
  }, [branches, branchContext]);

  // Auto-select first branch
  useEffect(() => {
    if (selectedBranchIds.length === 0 && availableBranches.length > 0) {
      setSelectedBranchIds([availableBranches[0].id]);
    }
  }, [availableBranches, selectedBranchIds]);

  // One-time cleanup: collapse any duplicate scheduled posts (same id) left over from the pre-fix duplication bug.
  useEffect(() => {
    setScheduledPosts(prev => {
      const seen = new Set<string>();
      const deduped = prev.filter(p => (seen.has(p.id) ? false : (seen.add(p.id), true)));
      return deduped.length === prev.length ? prev : deduped;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Brands selected for content fan-out (one draft generated per brand)
  const selectedBranches = useMemo(() =>
    (branches || []).filter(b => selectedBranchIds.includes(b.id)),
    [branches, selectedBranchIds]
  );

  const toggleBranch = (branchId: string) => {
    setSelectedBranchIds(prev =>
      prev.includes(branchId) ? prev.filter(id => id !== branchId) : [...prev, branchId]
    );
  };

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

  // Upcoming events grouped by day — powers the mobile agenda (phones can't show a 7-col grid)
  const agendaGroups = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const sorted = calendarEvents
      .filter(e => new Date(e.scheduled_for) >= startOfToday)
      .sort((a, b) => new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime());
    const groups: { key: string; date: Date; events: CalendarEvent[] }[] = [];
    const index: Record<string, number> = {};
    sorted.forEach(ev => {
      const d = new Date(ev.scheduled_for);
      const key = d.toDateString();
      if (index[key] === undefined) {
        index[key] = groups.length;
        groups.push({ key, date: d, events: [] });
      }
      groups[index[key]].events.push(ev);
    });
    return groups;
  }, [calendarEvents]);

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

    // Gaps: branch has posts but missing a platform this month.
    // Only consider platforms actually in use this month (so X/LinkedIn don't nag if you only do FB + IG).
    const branchPlatforms: Record<string, Set<string>> = {};
    monthEvents.forEach(e => {
      if (!branchPlatforms[e.branch_id]) branchPlatforms[e.branch_id] = new Set();
      branchPlatforms[e.branch_id].add(e.channel);
    });
    const socialChannels = Array.from(new Set(monthEvents.map(e => e.channel)));
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
      const platformKeys: string[] = selectedPlatforms.length > 0
        ? (selectedPlatforms as string[])
        : ['facebook', 'instagram'];
      const uniquePlatforms: string[] = Array.from(new Set(platformKeys));
      const platformList = uniquePlatforms.map(p => SOCIAL_PLATFORM_META[p]?.label || p).join(', ');

      const schemaProperties: Record<string, any> = {};
      uniquePlatforms.forEach(p => {
        schemaProperties[p] = { type: Type.STRING };
      });

      const geminiKey = apiKeys?.gemini_api_key;
      if (!geminiKey) { addToast?.('Gemini API key not configured. Set it in Settings.', 'error'); setIsGenerating(false); return; }
      const ai = new GoogleGenAI({ apiKey: geminiKey });

      // Fan out: one draft per selected brand (or a single generic draft if none selected)
      const targetBranches = selectedBranches.length > 0 ? selectedBranches : [null];
      const drafts: DraftPost[] = [];
      let usedFallbackModel = false;

      for (const branch of targetBranches) {
        const branchName = branch?.name || 'brand';
        const tone = branch?.tone || 'friendly';
        const keywords = (branch?.brand_keywords || []).join(', ');
        const prompt = `TASK: Brand Broadcast for ${branchName}. VOICE: ${tone}. ${keywords ? `KEYWORDS: ${keywords}. ` : ''}SEED: "${promptText}". Generate variants for ${platformList}. Return JSON.`;

        try {
          const { result: response, model } = await generateWithFallback((model) => ai.models.generateContent({
            model,
            contents: prompt,
            config: {
              responseMimeType: "application/json",
              responseSchema: { type: Type.OBJECT, properties: schemaProperties, required: uniquePlatforms },
            },
          }));
          if (model !== CONTENT_MODELS[0]) usedFallbackModel = true;
          const result = JSON.parse(response.text || "{}");
          drafts.push({
            id: `lab_${Date.now()}_${branch?.id || 'generic'}`,
            branch_id: branch?.id || undefined,
            base_content: promptText,
            versions: result,
            status: 'drafting',
            created_at: new Date().toISOString(),
          });
        } catch (e) {
          console.error(e);
          addToast?.(
            isTransientError(e)
              ? `Gemini is overloaded right now — content for ${branchName} couldn't generate. Try again in a moment.`
              : `Content generation failed for ${branchName}.`,
            'error'
          );
        }
      }

      if (drafts.length > 0) {
        if (usedFallbackModel) addToast?.('Preview model was busy — generated with the stable model instead.', 'info');
        setActiveDrafts(drafts);
        setWorkflowStatus('reviewing');
      }
    } catch (error) {
      console.error(error);
    } finally { setIsGenerating(false); }
  };

  // Schedule one or more drafts onto the Content Calendar, expanding each by the chosen cadence.
  const scheduleDrafts = (drafts: DraftPost[]) => {
    if (drafts.length === 0) return;
    const startIso = scheduleAt ? new Date(scheduleAt).toISOString() : new Date(Date.now() + 86400000).toISOString();
    const dates = buildScheduleDates(startIso, recurrence, recurrenceCount);

    const newPosts: DraftPost[] = [];
    drafts.forEach(draft => {
      const root = baseDraftId(draft.id);
      dates.forEach((iso, i) => {
        newPosts.push({
          ...draft,
          id: i === 0 ? root : `${root}_r${i}`,
          status: 'scheduled',
          scheduled_for: iso,
        });
      });
    });

    // Idempotent: drop any previously-scheduled posts from the same draft series before adding the fresh set,
    // so editing + re-scheduling replaces rather than duplicating.
    const bases = new Set(drafts.map(d => baseDraftId(d.id)));
    setScheduledPosts(prev => [...newPosts, ...prev.filter(p => !bases.has(baseDraftId(p.id)))]);

    const scheduledIds = new Set(drafts.map(d => d.id));
    setInboundQueue(prev => prev.filter(p => !scheduledIds.has(p.id)));
    const remaining = activeDrafts.filter(p => !scheduledIds.has(p.id));
    setActiveDrafts(remaining);
    if (remaining.length === 0) setWorkflowStatus('idle');

    const primaryPlatform = Object.keys(drafts[0].versions)[0] || 'instagram';
    const event: MarketingEvent = {
      id: `soc_${Date.now()}`,
      profile_id: 'SYSTEM',
      event_type: 'social_intent',
      source: primaryPlatform as any,
      payload: { brands: drafts.length, scheduled_count: newPosts.length },
      created_at: new Date().toISOString()
    };
    setEvents(prev => [event, ...prev]);
    addToast?.(`Scheduled ${newPosts.length} post${newPosts.length > 1 ? 's' : ''}${drafts.length > 1 ? ` across ${drafts.length} brands` : ''} onto the calendar.`, 'success');
    setActiveTab('pipeline');
  };

  const handleQuickApprove = (draft: DraftPost) => scheduleDrafts([draft]);
  const handleApproveAll = () => scheduleDrafts(activeDrafts);

  const updateDraftVersion = (draftId: string, platform: string, value: string) => {
    setActiveDrafts(prev => prev.map(d => d.id === draftId ? { ...d, versions: { ...d.versions, [platform]: value } } : d));
  };

  // Upload image file(s) from the user's computer to Supabase storage and attach to the draft.
  const handleImageUpload = async (draftId: string, fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const draft = activeDrafts.find(d => d.id === draftId);
    const branchId = draft?.branch_id || 'brand';
    setUploadingDraftId(draftId);
    const urls: string[] = [];
    for (const file of Array.from(fileList)) {
      if (!file.type.startsWith('image/')) { addToast?.(`${file.name} is not an image.`, 'error'); continue; }
      if (file.size > 10 * 1024 * 1024) { addToast?.(`${file.name} is over 10MB.`, 'error'); continue; }
      const { url, error } = await uploadSocialImage(branchId, file);
      if (url) urls.push(url);
      else addToast?.(error || `Failed to upload ${file.name}.`, 'error');
    }
    if (urls.length > 0) {
      setActiveDrafts(prev => prev.map(d => d.id === draftId ? { ...d, image_urls: [...(d.image_urls || []), ...urls] } : d));
      addToast?.(`Added ${urls.length} image${urls.length > 1 ? 's' : ''}.`, 'success');
    }
    setUploadingDraftId(null);
  };

  const removeDraftImage = (draftId: string, url: string) => {
    setActiveDrafts(prev => prev.map(d => d.id === draftId ? { ...d, image_urls: (d.image_urls || []).filter(u => u !== url) } : d));
  };

  const handleEditFromPipeline = (draft: DraftPost) => {
    // Pull the whole series back under its base id so re-scheduling replaces it (no duplicates),
    // and remove its currently-scheduled instances while it's being edited.
    const root = baseDraftId(draft.id);
    setScheduledPosts(prev => prev.filter(p => baseDraftId(p.id) !== root));
    setActiveDrafts([{ ...draft, id: root, status: 'drafting' }]);
    setWorkflowStatus('reviewing');
    setActiveTab('lab');
  };

  const handleArchivePost = (draft: DraftPost) => {
    setScheduledPosts(prev => prev.filter(p => p.id !== draft.id));
    setArchivedPosts(prev => [{ ...draft, status: 'archived' }, ...prev]);
  };

  // ─── Publish Now (Instagram + Facebook) ───────────────────────────
  // Only these two platforms are wired to live webhooks today.
  const WIRED_PUBLISH_PLATFORMS: Array<'instagram' | 'facebook'> = ['instagram', 'facebook'];
  const PLATFORM_LABEL: Record<'instagram' | 'facebook', string> = { instagram: 'Instagram', facebook: 'Facebook' };

  // Has this draft already been published to the given platform?
  const isPlatformPublished = (draft: DraftPost, platform: string) =>
    (draft.publish_results || []).some(r => r.platform === platform && r.success);

  // Open the confirmation modal for a (draft, platform). Publish fires in confirmPublish.
  const requestPublish = (draft: DraftPost, platform: 'instagram' | 'facebook') =>
    setPublishConfirm({ draftId: draft.id, platform });

  // Record a successful publish. Tracks per-platform: the draft is kept in the
  // active list (with the platform's result recorded) until EVERY wired platform
  // present on the draft has been published — only then is it removed. This lets a
  // draft be published to Instagram and Facebook separately without one blocking the other.
  const recordPublish = (draft: DraftPost, platform: 'instagram' | 'facebook', postId?: string) => {
    const publishedAt = new Date().toISOString();
    const newResult = { platform, success: true, post_id: postId };
    const mergedResults = [
      ...(draft.publish_results || []).filter(r => r.platform !== platform),
      newResult,
    ];

    // Which wired platforms does this draft actually have a caption for?
    const present = WIRED_PUBLISH_PLATFORMS.filter(p => draft.versions[p]);
    const allDone = present.every(p => mergedResults.some(r => r.platform === p && r.success));

    if (allDone) {
      // Nothing left to publish — remove from the active list (matches single-platform behavior).
      setActiveDrafts(prev => prev.filter(d => d.id !== draft.id));
      if (activeDrafts.length <= 1) setWorkflowStatus('idle');
    } else {
      // Keep the draft so the other platform can still be published; just record this result.
      setActiveDrafts(prev => prev.map(d => d.id === draft.id ? { ...d, publish_results: mergedResults, published_at: publishedAt } : d));
    }

    // Trace record per platform publish (mirrors the archivedPosts/publishedPosts pattern + persistence).
    const publishedRecord: DraftPost = {
      ...draft,
      id: `${draft.id}_pub_${platform}`,
      status: 'published',
      published_at: publishedAt,
      publish_results: [newResult],
    };
    setPublishedPosts(prev => [publishedRecord, ...prev.filter(p => p.id !== publishedRecord.id)]);

    // Marketing event so the publish shows in the timeline/reports.
    const event: MarketingEvent = {
      id: `pub_${platform}_${Date.now()}`,
      profile_id: 'SYSTEM',
      event_type: 'social_publish',
      source: platform as any,
      payload: { branch_id: draft.branch_id, post_id: postId, caption: draft.versions[platform] || '', platform, published_at: publishedAt },
      created_at: publishedAt,
    };
    setEvents(prev => [event, ...prev]);
  };

  // Publish the confirmed (draft, platform) via the matching webhook. Slow/synchronous.
  const confirmPublish = async () => {
    if (!publishConfirm) return;
    const { draftId, platform } = publishConfirm;
    const draft = activeDrafts.find(d => d.id === draftId);
    if (!draft) { setPublishConfirm(null); return; }

    const caption = draft.versions[platform] || '';
    const imageUrl = draft.image_urls?.[0];
    const label = PLATFORM_LABEL[platform];

    if (!draft.branch_id) { addToast?.('Select a brand before publishing.', 'error'); setPublishConfirm(null); return; }
    // Instagram requires an image; Facebook does not.
    if (platform === 'instagram' && !imageUrl) { addToast?.('Instagram requires an image to publish.', 'error'); setPublishConfirm(null); return; }

    setPublishingKey(`${draftId}_${platform}`);
    addToast?.(`Publishing to ${label}…`, 'info');

    const result = platform === 'instagram'
      ? await publishToSocial(draft.branch_id, caption, imageUrl!, null)
      : await publishToFacebook(draft.branch_id, caption, imageUrl || null, null);

    setPublishingKey(null);
    setPublishConfirm(null);

    if (result.ok) {
      recordPublish(draft, platform, result.postId);
      addToast?.(`Published to ${label} ✓${result.postId ? ` · post ${result.postId}` : ''}`, 'success');
    } else {
      // Leave the draft in place so the user can retry.
      addToast?.(`${label} publish failed: ${result.error}`, 'error');
    }
  };

  // Render the per-platform Publish Now control (or a "Published" badge once done).
  const renderPublishControl = (draft: DraftPost, platform: 'instagram' | 'facebook') => {
    if (isPlatformPublished(draft, platform)) {
      return (
        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase tracking-wider cursor-default">
          <Check size={12} /> Published
        </span>
      );
    }
    const hasImage = !!(draft.image_urls && draft.image_urls.length > 0);
    const hasBranch = !!draft.branch_id;
    const publishing = publishingKey === `${draft.id}_${platform}`;
    const needsImage = platform === 'instagram' && !hasImage;
    const disabled = !hasBranch || needsImage || publishing;
    const reason = !hasBranch
      ? 'Select a brand to publish'
      : needsImage
      ? 'Instagram requires an image — upload one below'
      : platform === 'instagram'
      ? 'Publish this caption + image to Instagram now'
      : 'Publish this caption to Facebook now';
    const activeClass = platform === 'instagram' ? 'bg-pink-600 hover:bg-pink-700' : 'bg-blue-600 hover:bg-blue-700';
    return (
      <button
        type="button"
        onClick={() => requestPublish(draft, platform)}
        disabled={disabled}
        title={reason}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition ${disabled ? 'bg-slate-100 text-slate-300 cursor-not-allowed' : `${activeClass} text-white shadow-sm`}`}
      >
        {publishing ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Publish Now
      </button>
    );
  };

  // ─── Content-only export: copy posts to paste into Meta Business Suite / native apps ───
  const togglePlatform = (platform: SocialPlatform) => {
    setSelectedPlatforms(prev =>
      prev.includes(platform) ? prev.filter(p => p !== platform) : [...prev, platform]
    );
  };

  const copyText = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(curr => (curr === key ? null : curr)), 1800);
      addToast?.('Copied to clipboard.', 'success');
    } catch {
      addToast?.('Could not copy — check browser clipboard permissions.', 'error');
    }
  };

  const draftToText = (draft: DraftPost): string => {
    const brandName = getBranchForDraft(draft)?.name || 'Brand';
    const block = Object.entries(draft.versions)
      .map(([plat, text]) => `── ${SOCIAL_PLATFORM_META[plat]?.label || plat} ──\n${text}`)
      .join('\n\n');
    const images = draft.image_urls && draft.image_urls.length > 0
      ? `\n\n── Images (${draft.image_urls.length}) ──\n${draft.image_urls.join('\n')}`
      : '';
    return `${brandName}\n\n${block}${images}`;
  };

  const copyAllVariants = (draft: DraftPost) => {
    copyText(draftToText(draft), `all_${draft.id}`);
  };

  // Copy every brand's content in one block — for pasting a full batch into Meta Business Suite
  const copyAllBrands = () => {
    const block = activeDrafts.map(draftToText).join('\n\n══════════════════════\n\n');
    copyText(block, 'all_brands');
  };

  // ─── Queue Action Handlers ────────────────────────────────────────

  const handleRespondToSignal = (signal: SocialActivity) => {
    setBaseContent(signal.content);
    if (signal.branch_id) setSelectedBranchIds([signal.branch_id]);
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
    const drafts = activeDrafts.filter(d => d.status === 'drafting');
    return [...drafts, ...scheduledPosts, ...publishedPosts, ...archivedPosts];
  }, [activeDrafts, scheduledPosts, publishedPosts, archivedPosts]);

  const conflictCount = calendarAlerts.filter(a => a.type === 'conflict').length;
  const gapCount = calendarAlerts.filter(a => a.type === 'gap').length;

  return (
    <div className="space-y-8 min-h-screen pb-40">
      {/* ═══════════════ PUBLISH NOW — CONFIRMATION MODAL ═══════════════ */}
      {publishConfirm && (() => {
        const draft = activeDrafts.find(d => d.id === publishConfirm.draftId);
        if (!draft) return null;
        const platform = publishConfirm.platform;
        const label = PLATFORM_LABEL[platform];
        const brandName = getBranchForDraft(draft)?.name || 'Brand';
        const publishing = publishingKey === `${draft.id}_${platform}`;
        const iconBg = platform === 'instagram' ? 'bg-pink-50 border-pink-200' : 'bg-blue-50 border-blue-200';
        const iconColor = platform === 'instagram' ? 'text-pink-500' : 'text-blue-600';
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { if (!publishing) setPublishConfirm(null); }} />
            <div className="relative bg-white rounded-[2.5rem] border border-slate-200 shadow-2xl p-8 max-w-md w-full animate-in fade-in zoom-in-95 duration-200">
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center ${iconBg}`}>
                  {React.createElement(getPlatformIcon(platform), { size: 24, className: iconColor })}
                </div>
                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Publish to {label}</h3>
              </div>
              <p className="text-sm font-medium text-slate-600 leading-relaxed mb-6">
                Publish this post to {label} for <strong className="text-slate-900">{brandName}</strong>? It will go live immediately.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setPublishConfirm(null)} disabled={publishing} className="flex-1 py-3.5 rounded-2xl border-2 border-slate-200 text-slate-600 font-black text-sm uppercase tracking-wider hover:bg-slate-50 transition disabled:opacity-40">Cancel</button>
                <button onClick={confirmPublish} disabled={publishing} className="flex-1 py-3.5 rounded-2xl bg-slate-900 text-white font-black text-sm uppercase tracking-wider flex items-center justify-center gap-2 hover:bg-emerald-600 transition disabled:opacity-60">
                  {publishing ? <><Loader2 size={16} className="animate-spin" /> Publishing…</> : <><Send size={16} className="text-emerald-400" /> Publish Now</>}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      <div className="flex bg-slate-200/40 p-1.5 rounded-[2rem] w-fit max-w-full overflow-x-auto border border-slate-200 shadow-sm">
        <button onClick={() => setActiveTab('lab')} className={`flex items-center shrink-0 space-x-2 sm:space-x-3 px-5 sm:px-8 py-3.5 rounded-[1.5rem] text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'lab' ? 'bg-white text-emerald-700 shadow-lg' : 'text-slate-500 hover:text-slate-800'}`}><Zap size={18} /><span>Lab</span></button>
        <button onClick={() => setActiveTab('queue')} className={`flex items-center shrink-0 space-x-2 sm:space-x-3 px-5 sm:px-8 py-3.5 rounded-[1.5rem] text-xs font-black uppercase tracking-widest transition-all relative ${activeTab === 'queue' ? 'bg-white text-emerald-700 shadow-lg' : 'text-slate-500 hover:text-slate-800'}`}>
          <Terminal size={18} />
          <span>Queue</span>
          {newSignalCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">{newSignalCount}</span>
          )}
        </button>
        <button onClick={() => setActiveTab('pipeline')} className={`flex items-center shrink-0 space-x-2 sm:space-x-3 px-5 sm:px-8 py-3.5 rounded-[1.5rem] text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'pipeline' ? 'bg-white text-emerald-700 shadow-lg' : 'text-slate-500 hover:text-slate-800'}`}><CalendarDays size={18} /><span>Pipeline</span></button>
        <button onClick={() => setActiveTab('reports')} className={`flex items-center shrink-0 space-x-2 sm:space-x-3 px-5 sm:px-8 py-3.5 rounded-[1.5rem] text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'reports' ? 'bg-white text-emerald-700 shadow-lg' : 'text-slate-500 hover:text-slate-800'}`}><BarChart3 size={18} /><span>Reports</span></button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 min-h-[700px]">
          {/* ═══════════════ LAB TAB ═══════════════ */}
          {activeTab === 'lab' && (
            <div className="space-y-8 animate-in fade-in duration-500">
              {availableBranches.length > 0 && (
                <div className="flex items-start gap-4">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest pt-2.5">Brands</label>
                  <div className="flex flex-wrap items-center gap-2 flex-1">
                    {availableBranches.map(b => {
                      const active = selectedBranchIds.includes(b.id);
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => toggleBranch(b.id)}
                          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all border ${active ? 'bg-slate-900 text-white border-slate-900 shadow-sm' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
                        >
                          <span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: b.primary_color || '#6b7280' }} />
                          {b.name}
                          {active && <Check size={12} className="text-emerald-400" />}
                        </button>
                      );
                    })}
                    {selectedBranchIds.length > 1 && (
                      <span className="text-[10px] font-black text-emerald-600 ml-1 uppercase tracking-wider">Fan-out · {selectedBranchIds.length} brands</span>
                    )}
                  </div>
                </div>
              )}

              {workflowStatus === 'idle' ? (
                <div className={`bg-white p-6 sm:p-12 rounded-[3.5rem] border border-slate-200 shadow-sm relative ${isGenerating ? 'opacity-40' : ''}`}>
                  {isGenerating && <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/60 backdrop-blur-sm z-20 rounded-[3.5rem]"><Loader2 className="animate-spin text-emerald-600" size={56} /></div>}
                  <h3 className="text-2xl font-black text-slate-800 flex items-center mb-10 pb-6 border-b border-slate-100"><Layers size={32} className="mr-4 text-emerald-600" />Strategy Lab</h3>
                  <textarea className="w-full bg-slate-50 border-2 border-slate-100 rounded-[2rem] p-5 sm:p-8 text-base sm:text-xl font-medium outline-none focus:bg-white focus:border-emerald-500 transition-all min-h-[220px] shadow-inner mb-8" placeholder="Describe your concept..." value={baseContent} onChange={(e) => setBaseContent(e.target.value)} />
                  <div className="flex flex-wrap items-center gap-2 mb-10">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mr-1">Platforms</span>
                    {(['facebook', 'instagram', 'x', 'linkedin'] as SocialPlatform[]).map(p => {
                      const Icon = getPlatformIcon(p);
                      const active = selectedPlatforms.includes(p);
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => togglePlatform(p)}
                          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all border ${active ? 'bg-slate-900 text-white border-slate-900 shadow-sm' : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'}`}
                        >
                          <Icon size={14} className={active ? 'text-emerald-400' : ''} />
                          {SOCIAL_PLATFORM_META[p]?.label || p}
                        </button>
                      );
                    })}
                  </div>
                  <button onClick={() => handleGenerateVariants()} disabled={!baseContent || isGenerating || selectedPlatforms.length === 0} className="w-full py-5 sm:py-8 text-white bg-slate-900 rounded-[2.5rem] font-black text-base sm:text-xl flex items-center justify-center space-x-3 sm:space-x-4 shadow-2xl hover:bg-emerald-600 transition disabled:opacity-20"><Sparkles size={28} className="text-emerald-400" /><span>Create</span></button>
                </div>
              ) : activeDrafts.length > 0 && (
                <div className="space-y-6 animate-in slide-in-from-bottom-8 duration-700">
                  {/* Header */}
                  <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm">
                    <div>
                      <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Reviewing {activeDrafts.length} Draft{activeDrafts.length > 1 ? 's' : ''}</h3>
                      <p className="text-[11px] font-bold text-slate-400 mt-1">One per brand — edit, schedule, or copy each below.</p>
                    </div>
                    <button onClick={() => { setWorkflowStatus('idle'); setActiveDrafts([]); }} className="p-3 text-slate-300 hover:text-rose-500"><X size={24} /></button>
                  </div>

                  {/* Shared scheduling controls + batch actions */}
                  <div className="bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm">
                    <div className="flex flex-wrap items-end gap-4 mb-5 p-5 bg-slate-50 rounded-[2rem] border border-slate-100">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">First post</label>
                        <input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-800 font-bold text-sm focus:outline-none focus:border-emerald-500 shadow-sm" />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Repeat</label>
                        <select value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recurrence)} className="px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-800 font-bold text-sm focus:outline-none focus:border-emerald-500 shadow-sm">
                          <option value="none">One-time</option>
                          <option value="weekly">Weekly</option>
                          <option value="monthly">Monthly</option>
                        </select>
                      </div>
                      {recurrence !== 'none' && (
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">How many</label>
                          <input type="number" min={1} max={52} value={recurrenceCount} onChange={(e) => setRecurrenceCount(Math.max(1, Math.min(52, parseInt(e.target.value) || 1)))} className="w-24 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-800 font-bold text-sm focus:outline-none focus:border-emerald-500 shadow-sm" />
                        </div>
                      )}
                      <p className="text-[11px] font-bold text-slate-400 flex-1 min-w-[180px]">
                        {recurrence === 'none'
                          ? `Schedules ${activeDrafts.length} post${activeDrafts.length > 1 ? 's (one per brand)' : ''} on the calendar.`
                          : `Creates ${recurrenceCount} ${recurrence} posts per brand (${recurrenceCount * activeDrafts.length} total).`}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-4">
                      <button onClick={handleApproveAll} className="flex-1 min-w-[160px] py-4 sm:py-6 bg-white border-2 border-slate-200 text-slate-800 rounded-[2rem] font-black text-base sm:text-lg flex items-center justify-center gap-3 shadow-sm hover:border-emerald-500 hover:text-emerald-700 transition">
                        <CalendarDays size={24} className="text-emerald-500" />
                        <span>Schedule All{activeDrafts.length > 1 ? ` (${activeDrafts.length} brands)` : ''}</span>
                      </button>
                      <button onClick={copyAllBrands} className="flex-1 min-w-[160px] py-4 sm:py-6 bg-slate-900 text-white rounded-[2rem] font-black text-base sm:text-lg flex items-center justify-center gap-3 shadow-2xl hover:bg-emerald-600 transition">
                        {copiedKey === 'all_brands' ? <Check size={24} className="text-emerald-400" /> : <Copy size={24} className="text-emerald-400" />}
                        <span>{copiedKey === 'all_brands' ? 'Copied All Brands' : 'Copy All for Meta Business'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Per-brand draft cards */}
                  {activeDrafts.map(draft => {
                    const brand = getBranchForDraft(draft);
                    return (
                      <div key={draft.id} className="bg-white p-5 sm:p-8 rounded-[3rem] border-2 border-slate-200 shadow-lg">
                        <div className="flex flex-wrap items-center justify-between gap-y-3 mb-6 pb-4 border-b border-slate-100">
                          <div className="flex items-center gap-2">
                            {brand && <div className="w-3 h-3 rounded" style={{ backgroundColor: brand.primary_color }} />}
                            <span className="text-sm font-black text-slate-700 uppercase tracking-tight">{brand?.name || 'Brand'}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <button onClick={() => copyAllVariants(draft)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-emerald-100 text-slate-500 hover:text-emerald-700 text-[10px] font-black uppercase tracking-wider transition">
                              {copiedKey === `all_${draft.id}` ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy brand</>}
                            </button>
                            <button onClick={() => handleQuickApprove(draft)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white hover:bg-emerald-600 text-[10px] font-black uppercase tracking-wider transition">
                              <CalendarDays size={12} /> Schedule
                            </button>
                          </div>
                        </div>
                        <div className="space-y-6">
                          {Object.entries(draft.versions).map(([plat, rawText]) => {
                            const text = String(rawText);
                            return (
                              <div key={plat}>
                                <div className="flex flex-wrap items-center justify-between gap-y-2 mb-2">
                                  <div className="flex items-center space-x-2 text-[10px] font-black uppercase text-slate-400">
                                    {React.createElement(getPlatformIcon(plat), { size: 14 })}
                                    <span>{SOCIAL_PLATFORM_META[plat]?.label || plat}</span>
                                    <span className="text-slate-300 normal-case font-bold">· {text.length} chars</span>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    <button type="button" onClick={() => copyText(text, `${draft.id}_${plat}`)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-emerald-100 text-slate-500 hover:text-emerald-700 text-[10px] font-black uppercase tracking-wider transition">
                                      {copiedKey === `${draft.id}_${plat}` ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy</>}
                                    </button>
                                    {(plat === 'instagram' || plat === 'facebook') && renderPublishControl(draft, plat)}
                                    {(plat === 'x' || plat === 'linkedin') && (
                                      <span title="Direct publishing for this platform isn't connected yet — copy the text for now" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 text-slate-400 text-[10px] font-black uppercase tracking-wider cursor-default">
                                        <Clock size={12} /> Publish soon
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <textarea className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-6 text-sm font-medium" value={text} onChange={(e) => updateDraftVersion(draft.id, plat, e.target.value)} />
                                {plat === 'instagram' && !(draft.image_urls && draft.image_urls.length > 0) && (
                                  <p className="mt-2 text-[10px] font-bold text-amber-600 flex items-center gap-1.5"><AlertTriangle size={11} /> Add an image below — Instagram requires one to publish.</p>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Images — uploaded from your computer, then attached manually in Meta Business when you paste the text */}
                        <div className="mt-6 pt-5 border-t border-slate-100">
                          <div className="flex items-center justify-between mb-3">
                            <span className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-400">
                              <ImagePlus size={14} /> Images{draft.image_urls?.length ? ` · ${draft.image_urls.length}` : ''}
                            </span>
                            <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition cursor-pointer ${uploadingDraftId === draft.id ? 'bg-slate-100 text-slate-400 cursor-wait' : 'bg-slate-900 text-white hover:bg-emerald-600'}`}>
                              {uploadingDraftId === draft.id ? <><Loader2 size={12} className="animate-spin" /> Uploading</> : <><ImagePlus size={12} /> Upload</>}
                              <input type="file" accept="image/*" multiple className="hidden" disabled={uploadingDraftId === draft.id} onChange={(e) => { handleImageUpload(draft.id, e.target.files); e.target.value = ''; }} />
                            </label>
                          </div>
                          {draft.image_urls && draft.image_urls.length > 0 ? (
                            <div className="flex flex-wrap gap-3">
                              {draft.image_urls.map((url, i) => (
                                <div key={url} className="relative group w-24 h-24 rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                                  <img src={url} alt={`upload ${i + 1}`} className="w-full h-full object-cover" />
                                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                                    <a href={url} download target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg bg-white/90 text-slate-700 hover:text-emerald-600" title="Download"><Download size={14} /></a>
                                    <button type="button" onClick={() => removeDraftImage(draft.id, url)} className="p-1.5 rounded-lg bg-white/90 text-slate-700 hover:text-rose-600" title="Remove"><X size={14} /></button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[11px] font-bold text-slate-400">No images yet. Upload here, then attach them in Meta Business Suite when you paste the text.</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
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
                  onClick={() => setSocialSignals(prev => [generateTestSignal(selectedBranchIds[0] || null), ...prev])}
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
                          <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100">
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
                <div className="hidden lg:flex bg-slate-100 p-1 rounded-xl">
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
                <div className="hidden lg:block bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
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
                      const isSelectedDay = selectedCalendarDay &&
                        day.date.getFullYear() === selectedCalendarDay.getFullYear() &&
                        day.date.getMonth() === selectedCalendarDay.getMonth() &&
                        day.date.getDate() === selectedCalendarDay.getDate();
                      return (
                        <div
                          key={idx}
                          onClick={() => { setSelectedCalendarDay(new Date(day.date)); setSelectedCalendarEvent(null); }}
                          className={`min-h-[90px] border-b border-r border-slate-50 p-1.5 cursor-pointer hover:bg-slate-50 transition ${!day.isCurrentMonth ? 'opacity-40 bg-slate-50/50' : ''} ${today ? 'ring-2 ring-inset ring-emerald-500' : ''} ${isSelectedDay ? 'bg-emerald-50/60 ring-2 ring-inset ring-emerald-400' : ''}`}
                        >
                          <span className={`text-[10px] font-black ${today ? 'text-emerald-600' : 'text-slate-400'}`}>{day.date.getDate()}</span>
                          <div className="mt-1 space-y-0.5">
                            {dayEvents.slice(0, 3).map(ev => {
                              const PIcon = getPlatformIcon(ev.channel);
                              return (
                                <button
                                  key={ev.id}
                                  onClick={(e) => { e.stopPropagation(); setSelectedCalendarEvent(ev); setComplianceResult(null); setShowCompliancePanel(false); }}
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
                <div className="hidden lg:block bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
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

              {/* Mobile Agenda — vertical day-grouped list (phones can't render a 7-col grid) */}
              <div className="lg:hidden space-y-4">
                {agendaGroups.length === 0 ? (
                  <div className="bg-slate-50 border-4 border-dashed border-slate-200 rounded-[2rem] py-16 text-center">
                    <CalendarDays size={40} className="mx-auto text-slate-300 mb-3" />
                    <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Nothing scheduled ahead</p>
                    <p className="text-xs text-slate-400 font-bold mt-1">Generate posts in the Lab to fill your calendar.</p>
                  </div>
                ) : (
                  agendaGroups.map(group => {
                    const isTodayGroup = isToday(group.date);
                    return (
                      <div key={group.key} className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
                        <div className={`flex items-baseline gap-2 px-4 py-3 border-b border-slate-100 ${isTodayGroup ? 'bg-emerald-50' : 'bg-slate-50'}`}>
                          <span className={`text-sm font-black uppercase tracking-tight ${isTodayGroup ? 'text-emerald-700' : 'text-slate-700'}`}>
                            {isTodayGroup ? 'Today' : group.date.toLocaleDateString('en-US', { weekday: 'short' })}
                          </span>
                          <span className="text-xs font-bold text-slate-400">
                            {group.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                          <span className="ml-auto text-[10px] font-black text-slate-400 uppercase">{group.events.length} post{group.events.length === 1 ? '' : 's'}</span>
                        </div>
                        <div className="p-2 space-y-1.5">
                          {group.events.map(ev => {
                            const PIcon = getPlatformIcon(ev.channel);
                            const time = new Date(ev.scheduled_for).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                            return (
                              <button
                                key={ev.id}
                                onClick={() => { setSelectedCalendarEvent(ev); setComplianceResult(null); setShowCompliancePanel(false); }}
                                className="w-full flex items-center gap-3 rounded-2xl p-3 border border-slate-100 hover:border-emerald-300 hover:bg-slate-50 transition text-left"
                                style={{ borderLeft: `4px solid ${ev.branch_color}` }}
                              >
                                <PIcon size={16} className="text-slate-400 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-bold text-slate-700 truncate">{ev.title}</p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-[10px] font-bold text-slate-400">{time}</span>
                                    <span className="text-[10px] text-slate-300">|</span>
                                    <span className="text-[10px] font-bold text-slate-400 truncate">{ev.branch_name}</span>
                                    <span className="text-[10px] text-slate-300">|</span>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase">{ev.channel}</span>
                                  </div>
                                </div>
                                <span className={`text-[8px] font-black uppercase px-2 py-1 rounded flex-shrink-0 ${
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
                  })
                )}
              </div>

              {/* Day Detail — posts scheduled for the clicked day */}
              {selectedCalendarDay && !selectedCalendarEvent && (() => {
                const dayEvents = getEventsForDay(selectedCalendarDay)
                  .sort((a, b) => new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime());
                return (
                  <div ref={dayDetailRef} className="bg-white rounded-[2rem] border-2 border-emerald-200 shadow-lg p-8 animate-in slide-in-from-bottom-4 duration-300 scroll-mt-6">
                    <div className="flex justify-between items-start mb-6">
                      <div>
                        <h4 className="text-lg font-black text-slate-800 uppercase tracking-tight">
                          {selectedCalendarDay.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                        </h4>
                        <p className="text-xs font-bold text-slate-400 mt-1">
                          {dayEvents.length} post{dayEvents.length === 1 ? '' : 's'} scheduled
                        </p>
                      </div>
                      <button onClick={() => setSelectedCalendarDay(null)} className="p-2 text-slate-300 hover:text-rose-500"><X size={20} /></button>
                    </div>

                    {dayEvents.length === 0 ? (
                      <div className="bg-slate-50 rounded-2xl p-8 text-center">
                        <CalendarDays size={28} className="text-slate-300 mx-auto mb-2" />
                        <p className="text-sm font-bold text-slate-400">No posts scheduled for this day.</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {dayEvents.map(ev => {
                          const PIcon = getPlatformIcon(ev.channel);
                          const time = new Date(ev.scheduled_for).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
                          return (
                            <button
                              key={ev.id}
                              onClick={() => { setSelectedCalendarEvent(ev); setComplianceResult(null); setShowCompliancePanel(false); }}
                              className="w-full flex items-center gap-3 rounded-2xl p-4 border border-slate-100 hover:border-emerald-300 hover:bg-slate-50 transition text-left"
                              style={{ borderLeft: `4px solid ${ev.branch_color}` }}
                            >
                              <PIcon size={16} className="text-slate-400 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-slate-700 truncate">{ev.title}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  <span className="text-[10px] font-bold text-slate-400">{time}</span>
                                  <span className="text-[10px] text-slate-300">|</span>
                                  <span className="text-[10px] font-bold text-slate-400">{ev.branch_name}</span>
                                  <span className="text-[10px] text-slate-300">|</span>
                                  <span className="text-[10px] font-bold text-slate-400 uppercase">{ev.channel}</span>
                                </div>
                              </div>
                              <span className={`text-[8px] font-black uppercase px-2 py-1 rounded flex-shrink-0 ${
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
                    )}
                  </div>
                );
              })()}

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

                  {/* Attached images — hover to download, then upload them in Meta Business */}
                  {(() => {
                    const post = scheduledPosts.find(p => p.id === selectedCalendarEvent.source_id);
                    if (!post?.image_urls?.length) return null;
                    return (
                      <div className="mb-6">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Images ({post.image_urls.length})</p>
                        <div className="flex flex-wrap gap-3">
                          {post.image_urls.map((url, i) => (
                            <div key={url} className="relative group w-20 h-20 rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
                              <img src={url} alt={`image ${i + 1}`} className="w-full h-full object-cover" />
                              <a href={url} download target="_blank" rel="noopener noreferrer" className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 opacity-0 group-hover:opacity-100 transition" title="Download image">
                                <Download size={16} className="text-white" />
                              </a>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

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
                    {selectedCalendarEvent.source === 'social_hub' && (() => {
                      const draft = scheduledPosts.find(p => p.id === selectedCalendarEvent.source_id);
                      if (!draft) return null;
                      const posted = draft.status === 'published';
                      return (
                        <button
                          onClick={() => setScheduledPosts(prev => prev.map(p => p.id === draft.id ? { ...p, status: posted ? 'scheduled' : 'published', published_at: posted ? undefined : new Date().toISOString() } : p))}
                          className={`flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-black transition ${posted ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'border border-emerald-200 text-emerald-700 hover:bg-emerald-50'}`}
                          title={posted ? 'Click to undo' : 'Mark this post as published'}
                        >
                          <CheckCircle2 size={14} />
                          <span>{posted ? 'Posted' : 'Mark as Posted'}</span>
                        </button>
                      );
                    })()}
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

          {/* ═══════════════ REPORTS TAB ═══════════════ */}
          {activeTab === 'reports' && (
            <div className="space-y-6 animate-in fade-in duration-500">
              <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
                {/* Header + controls */}
                <div className="p-6 sm:p-8 border-b border-slate-100">
                  <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                    <div>
                      <h3 className="text-2xl font-black text-slate-800 flex items-center"><BarChart3 size={28} className="mr-3 text-emerald-600" />Published Posts</h3>
                      <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
                        {reportsLoading ? 'Loading…' : `${visibleReportPosts.length} post${visibleReportPosts.length !== 1 ? 's' : ''}`}
                      </p>
                    </div>
                    <button onClick={loadReports} disabled={reportsLoading} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-wider hover:bg-slate-200 transition disabled:opacity-50">
                      <RefreshCw size={14} className={reportsLoading ? 'animate-spin' : ''} /> Refresh
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    {/* Search */}
                    <div className="relative flex-1 min-w-[220px]">
                      <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={reportSearch}
                        onChange={e => setReportSearch(e.target.value)}
                        placeholder="Search caption or branch…"
                        className="w-full pl-11 pr-4 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400/40"
                      />
                    </div>
                    {/* Platform filter chips */}
                    <div className="flex items-center gap-1.5">
                      {(['all', 'instagram', 'facebook'] as const).map(p => (
                        <button key={p} onClick={() => setReportPlatformFilter(p)} className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition ${reportPlatformFilter === p ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>
                          {p === 'all' ? 'All' : SOCIAL_PLATFORM_META[p]?.label || p}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Body */}
                {reportsLoading ? (
                  <div className="py-20 text-center">
                    <Loader2 size={32} className="mx-auto text-emerald-500 animate-spin mb-3" />
                    <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Loading published posts…</p>
                  </div>
                ) : reportsError ? (
                  <div className="py-20 text-center">
                    <AlertTriangle size={32} className="mx-auto text-amber-500 mb-3" />
                    <p className="text-sm font-black text-slate-500 uppercase tracking-widest">{reportsError}</p>
                    <button onClick={loadReports} className="mt-4 px-4 py-2 rounded-xl bg-slate-900 text-white text-[10px] font-black uppercase tracking-wider hover:bg-emerald-600 transition">Retry</button>
                  </div>
                ) : visibleReportPosts.length === 0 ? (
                  <div className="py-20 text-center">
                    <Send size={32} className="mx-auto text-slate-200 mb-3" />
                    <p className="text-sm font-black text-slate-400 uppercase tracking-widest">
                      {reportPosts.length === 0 ? 'No published posts yet' : 'No posts match your filters'}
                    </p>
                    <p className="text-xs text-slate-400 font-bold mt-1">
                      {reportPosts.length === 0 ? 'Publish from the Lab to see your history here.' : 'Try clearing the search or platform filter.'}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                          <th className="px-6 py-3 font-black">Post</th>
                          <th className="px-3 py-3 font-black">
                            <button onClick={() => toggleReportSort('platform')} className="flex items-center gap-1 hover:text-slate-700 transition">
                              Platform {reportSortKey === 'platform' ? <ChevronDown size={12} className={reportSortDir === 'asc' ? 'rotate-180' : ''} /> : <ArrowUpDown size={11} className="opacity-40" />}
                            </button>
                          </th>
                          <th className="px-3 py-3 font-black">
                            <button onClick={() => toggleReportSort('branch')} className="flex items-center gap-1 hover:text-slate-700 transition">
                              Branch {reportSortKey === 'branch' ? <ChevronDown size={12} className={reportSortDir === 'asc' ? 'rotate-180' : ''} /> : <ArrowUpDown size={11} className="opacity-40" />}
                            </button>
                          </th>
                          <th className="px-3 py-3 font-black">
                            <button onClick={() => toggleReportSort('date')} className="flex items-center gap-1 hover:text-slate-700 transition">
                              Published {reportSortKey === 'date' ? <ChevronDown size={12} className={reportSortDir === 'asc' ? 'rotate-180' : ''} /> : <ArrowUpDown size={11} className="opacity-40" />}
                            </button>
                          </th>
                          <th className="px-3 py-3 font-black">Link</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleReportPosts.map(post => {
                          const Icon = PLATFORM_ICONS[post.source];
                          const showImg = post.image_url && !reportImgErrors[post.id];
                          const when = new Date(post.published_at || post.created_at);
                          return (
                            <tr key={post.id} className="border-b border-slate-50 hover:bg-slate-50/60 transition align-top">
                              {/* Thumbnail + caption */}
                              <td className="px-6 py-4">
                                <div className="flex items-start gap-3">
                                  <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200 shrink-0 overflow-hidden flex items-center justify-center">
                                    {showImg ? (
                                      <img
                                        src={post.image_url!}
                                        alt=""
                                        className="w-full h-full object-cover"
                                        onError={() => setReportImgErrors(prev => ({ ...prev, [post.id]: true }))}
                                      />
                                    ) : (
                                      <ImageIcon size={18} className="text-slate-300" />
                                    )}
                                  </div>
                                  <p className="text-sm text-slate-600 font-medium line-clamp-2 max-w-md" title={post.caption}>
                                    {post.caption || <span className="text-slate-300 italic">No caption</span>}
                                  </p>
                                </div>
                              </td>
                              {/* Platform */}
                              <td className="px-3 py-4">
                                <span className={`inline-flex items-center gap-1.5 text-xs font-black ${PLATFORM_COLORS[post.source] || 'text-slate-500'}`}>
                                  {Icon && <Icon size={16} />}
                                  {SOCIAL_PLATFORM_META[post.source]?.label || post.source}
                                </span>
                              </td>
                              {/* Branch */}
                              <td className="px-3 py-4">
                                <span className="text-xs font-bold text-slate-600">{reportBranchName(post.branch_id)}</span>
                              </td>
                              {/* Date */}
                              <td className="px-3 py-4 whitespace-nowrap">
                                <span className="text-xs font-bold text-slate-600">{when.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                <span className="block text-[10px] font-medium text-slate-400">{when.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
                              </td>
                              {/* Link */}
                              <td className="px-3 py-4 whitespace-nowrap">
                                {post.permalink ? (
                                  <a href={post.permalink} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-black text-emerald-600 hover:text-emerald-700 transition">
                                    View <ExternalLink size={12} />
                                  </a>
                                ) : post.post_id ? (
                                  <span className="text-[10px] font-mono text-slate-400" title="No public link available for this platform">{post.post_id}</span>
                                ) : (
                                  <span className="text-[10px] font-bold text-slate-300">—</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
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
