
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Profile, SpokeConnection, VideoAdConfig, VideoAdJob, VideoAdStatus, VideoAdFormat, BranchContext, TextOverlayConfig, TextOverlayLayer } from '../types';
import { GoogleGenAI } from '@google/genai';
import { BRANCH_DISPLAY_NAMES, formatBranchName } from '../utils';
import {
  TONE_PRESETS, ACTOR_STYLES, PIPELINE_OPTIONS, VIDEO_AD_STAGES,
  ASPECT_RATIOS, VIDEO_SETTINGS, VIDEO_LIGHTING, VIDEO_MOODS,
} from '../constants';
import {
  submitVideoAdJob, getVideoAdJobs, cancelVideoAdJob,
  submitStaticAdJob, submitStaticAdBatch, submitCarouselJob, approveJob, approveAndRenderVideo,
  regenerateJob, discardJob, saveOverlayConfig, saveComposite, publishableImageUrl,
} from '../services/videoAdService';
import { publishToSocial } from '../services/socialService';
import { uploadSocialMedia } from '../lib/supabaseService';
import { supabase } from '../lib/supabase';
import { useVideoAdPoller } from '../hooks/useVideoAdPoller';
import TextOverlayEditor from '../components/TextOverlayEditor';
import MetaAdExportModal from '../components/MetaAdExportModal';
import { compositeOverlay, defaultOverlayForHeadline } from '../utils/imageComposite';
import {
  Video, Sparkles, Loader2, Film, User, Play, Download, Trash2,
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Target, FileText, Zap, DollarSign,
  Palette, Eye, Check, BookTemplate, RefreshCw, Clock, CalendarClock,
  Image as ImageIcon, Layers, Send, Instagram, ThumbsUp, Sliders, Upload, X, GitBranch, Plus, Megaphone,
  ListChecks, AlertTriangle, Wand2,
} from 'lucide-react';

// ─── Template helpers ────────────────────────────────────────────────
// video_ad_templates is Trellis orchestration data on the HUB (like
// video_ad_jobs), keyed by branch — read/written with the Hub client directly.

interface VideoAdTemplate {
  id: string;
  branch: string;
  template_name: string;
  settings: Record<string, any>;
  created_at: string;
}

async function fetchTemplates(branch: string): Promise<VideoAdTemplate[]> {
  if (!branch) return [];
  const { data, error } = await supabase
    .from('video_ad_templates')
    .select('*')
    .eq('branch', branch)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[videoAd] fetchTemplates failed:', error.message);
    return [];
  }
  return (data as VideoAdTemplate[]) || [];
}

async function saveTemplate(branch: string, name: string, settings: Record<string, any>): Promise<void> {
  if (!branch || !name) return;
  const { error } = await supabase
    .from('video_ad_templates')
    .insert({ branch, template_name: name, settings });
  if (error) console.error('[videoAd] saveTemplate failed:', error.message);
}

async function deleteTemplate(id: string): Promise<void> {
  if (!id) return;
  const { error } = await supabase.from('video_ad_templates').delete().eq('id', id);
  if (error) console.error('[videoAd] deleteTemplate failed:', error.message);
}

// ─── Constants ───────────────────────────────────────────────────────
interface VideoAdLabProps {
  profiles: Profile[];
  spokeConnections: SpokeConnection[];
  geminiApiKey: string;
  addToast: (message: string, type: 'success' | 'error' | 'info') => void;
  branchContext?: BranchContext;
}

const TERMINAL_STATUSES: VideoAdStatus[] = ['completed', 'failed', 'cancelled'];
const BRANCH_KEYS = Object.keys(BRANCH_DISPLAY_NAMES);

// Static/Carousel formats don't use the wider video aspect ratio set —
// these are the ratios the n8n image pipelines actually support.
const STATIC_ASPECT_RATIOS = [
  { value: '1:1', label: '1:1 Square' },
  { value: '4:5', label: '4:5 Portrait' },
  { value: '9:16', label: '9:16 Story' },
] as const;

// Video settings are physical shoot locations. Image posts often aren't scenes
// at all — a symbol, a texture, a sky — so static gets its own list, with
// "Let AI choose" as the default: it sends no setting and lets the scene brief
// (written from your message) decide the imagery.
const AI_CHOOSES_SETTING = 'Let AI choose';
const STATIC_SETTINGS = [
  AI_CHOOSES_SETTING,
  'Symbolic / abstract',
  'Outdoor / nature',
  'Sky',
  'Water',
  'Home interior',
  'Studio',
  'Kitchen',
  'Garden',
  'Cafe',
  'Market',
  'Office',
  'Rooftop',
] as const;

const CAROUSEL_ASPECT_RATIOS = [
  { value: '1:1', label: '1:1 Square' },
  { value: '4:5', label: '4:5 Portrait' },
] as const;

const SLIDE_COUNT_OPTIONS = [3, 4, 5, 6, 7] as const;

// Batch mode convenience presets for the static-image batch textarea — one
// click fills in a labelled set of lines (one image each). Scoped to a
// branch slug so they only surface for that branch; kept generic so more
// presets can be added later without touching the UI.
interface StaticBatchPreset {
  label: string;
  branchSlug: string;
  lines: string[];
}

const STATIC_BATCH_PRESETS: StaticBatchPreset[] = [
  {
    label: 'Load Rejoice emotion set',
    branchSlug: 'rejoice',
    lines: [
      "For the night anxiety won't let you sleep",
      'For the day you feel completely overwhelmed',
      'For the grief that still catches you off guard',
      'For the loneliness no one else can see',
      "For the anger you don't want to admit to",
      'For the fear of what comes next',
      "For the doubt you're afraid to say out loud",
      "For the exhaustion that sleep doesn't fix",
      'For the gratitude that surprised you today',
      'For the joy you almost missed',
      "For the hope you're trying to hold onto",
      'For the waiting that feels endless',
    ],
  },
];

// Hard cap on images per batch run — keeps a single "queue a batch" click
// from firing off an unbounded number of generation jobs.
const STATIC_BATCH_MAX = 25;

const FORMAT_OPTIONS: { value: VideoAdFormat; label: string; description: string; hint: string; icon: React.ElementType }[] = [
  { value: 'video', label: 'Video', description: 'AI actor or full scene with voiceover', hint: 'Premium · ~minutes', icon: Film },
  { value: 'static', label: 'Static Image', description: 'Single AI-generated ad image', hint: 'Seconds · pennies', icon: ImageIcon },
  { value: 'carousel', label: 'Carousel', description: '3–7 swipeable slides', hint: '3–7 slides · best IG engagement', icon: Layers },
];

type WizardStep = 0 | 1 | 2 | 3 | 4;

// Live stages shown on the tracking step. Static and carousel stop at review —
// only video continues into a render pass after the frame is approved.
const stagesForFormat = (fmt?: VideoAdFormat): { key: VideoAdStatus; label: string }[] => {
  if (fmt === 'static' || fmt === 'carousel') {
    return [
      { key: 'queued', label: 'Queued' },
      { key: 'generating_script', label: 'Writing copy' },
      { key: 'generating_frame', label: fmt === 'carousel' ? 'Drawing slides' : 'Drawing image' },
      { key: 'awaiting_approval', label: 'Ready for review' },
    ];
  }
  return [
    { key: 'queued', label: 'Queued' },
    { key: 'generating_script', label: 'Script' },
    { key: 'generating_frame', label: 'Frame' },
    { key: 'awaiting_approval', label: 'Review' },
    { key: 'rendering', label: 'Rendering' },
    { key: 'completed', label: 'Done' },
  ];
};

type StatusFilter = 'all' | 'active' | 'completed' | 'failed';
type FormatFilter = 'all' | VideoAdFormat;

const VOICE_NAMES: Record<string, string> = {
  '21m00Tcm4TlvDq8ikWAM': 'Rachel',
  '29vD33N1CtxCmqQRPOHJ': 'Drew',
  '2EiwWnXFnvU5JabPnv8n': 'Clyde',
  'AZnzlk1XvdvUeBnXmlld': 'Domi',
};

const formatLabel = (fmt?: VideoAdFormat): string =>
  fmt === 'static' ? 'Static' : fmt === 'carousel' ? 'Carousel' : 'Video';

const formatBadgeClasses = (fmt?: VideoAdFormat): string =>
  fmt === 'static' ? 'bg-sky-100 text-sky-600' :
  fmt === 'carousel' ? 'bg-violet-100 text-violet-600' :
  'bg-indigo-100 text-indigo-600';

const FormatIcon: React.FC<{ format?: VideoAdFormat; size?: number; className?: string }> = ({ format, size = 10, className }) => {
  const Icon = format === 'static' ? ImageIcon : format === 'carousel' ? Layers : Film;
  return <Icon size={size} className={className} />;
};

const statusChipClasses = (status: VideoAdStatus): string =>
  status === 'failed' ? 'bg-rose-50 text-rose-500' :
  status === 'cancelled' ? 'bg-slate-100 text-slate-400' :
  status === 'completed' ? 'bg-emerald-50 text-emerald-600' :
  status === 'awaiting_approval' ? 'bg-amber-100 text-amber-700 animate-pulse' :
  'bg-amber-50 text-amber-600';

// ─── Component ───────────────────────────────────────────────────────
const VideoAdLab: React.FC<VideoAdLabProps> = ({ profiles, spokeConnections, geminiApiKey, addToast, branchContext }) => {
  // ── Branch options — pulled from the real branches (fall back to the static
  //    ecosystem list only if branch context hasn't loaded). ──
  const branchOptions = useMemo(() => {
    if (branchContext?.allBranches?.length) {
      return branchContext.allBranches.map(b => ({ value: b.slug, label: b.name }));
    }
    return BRANCH_KEYS.map(k => ({ value: k, label: BRANCH_DISPLAY_NAMES[k] }));
  }, [branchContext]);
  // Prefer the real branch name for display; fall back to the slug formatter.
  const branchName = (slug: string) =>
    branchContext?.allBranches.find(b => b.slug === slug)?.name || formatBranchName(slug);
  // publishToSocial needs the branch UUID, not the slug used elsewhere in this page.
  const branchIdForSlug = (slug: string) =>
    branchContext?.allBranches.find(b => b.slug === slug)?.id || slug;

  // ── Wizard step & format ──
  const [step, setStep] = useState<WizardStep>(0);
  const [format, setFormat] = useState<VideoAdFormat>('video');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const STEPS = useMemo(() => {
    if (format === 'video') {
      return [
        { num: 0 as WizardStep, label: 'Format', icon: Sliders },
        { num: 1 as WizardStep, label: 'Message', icon: FileText },
        { num: 2 as WizardStep, label: 'Look & Feel', icon: Palette },
        { num: 3 as WizardStep, label: 'Review', icon: Eye },
        { num: 4 as WizardStep, label: 'Progress', icon: Zap },
      ];
    }
    return [
      { num: 0 as WizardStep, label: 'Format', icon: Sliders },
      { num: 1 as WizardStep, label: format === 'static' ? 'Message' : 'Topic', icon: FileText },
      { num: 3 as WizardStep, label: 'Review', icon: Eye },
      { num: 4 as WizardStep, label: 'Progress', icon: Zap },
    ];
  }, [format]);

  // ── Form fields (shared across formats where sensible) ──
  const [branch, setBranch] = useState('');
  // Default to the first real branch once branch options are available.
  useEffect(() => {
    if (!branch && branchOptions.length > 0) setBranch(branchOptions[0].value);
  }, [branchOptions, branch]);
  const [productDescription, setProductDescription] = useState('');
  const [targetSegment, setTargetSegment] = useState('');
  const [tone, setTone] = useState<string>(TONE_PRESETS[0]);
  const [cta, setCta] = useState('');
  const [pipeline, setPipeline] = useState<'talking_head' | 'full_scene'>('full_scene');
  const [actorGender, setActorGender] = useState<'male' | 'female'>('female');
  const [actorStyle, setActorStyle] = useState<string>(ACTOR_STYLES[1]);
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [duration, setDuration] = useState(10);
  const [platform, setPlatform] = useState<'general' | 'tiktok' | 'instagram_reels' | 'youtube_shorts'>('general');
  const [setting, setSetting] = useState<string>(VIDEO_SETTINGS[0]);
  const [lighting, setLighting] = useState<string>(VIDEO_LIGHTING[0]);
  const [mood, setMood] = useState<string>(VIDEO_MOODS[0]);
  const [customVisualNotes, setCustomVisualNotes] = useState('');

  // ── Static / carousel specific fields ──
  const [staticMessage, setStaticMessage] = useState('');
  const [carouselTopic, setCarouselTopic] = useState('');
  const [slideCount, setSlideCount] = useState<number>(5);
  const [styleNotes, setStyleNotes] = useState('');

  // ── Static batch mode: one image per non-blank line, all other static
  //    fields (branch, aspect ratio, setting, platform, style notes, ref
  //    photo) shared across the whole batch for visual consistency. ──
  const [staticBatchMode, setStaticBatchMode] = useState(false);
  const [staticBatchText, setStaticBatchText] = useState('');

  // ── Reference photo (static ads): a real photo the generation works from ──
  const [refImageUrl, setRefImageUrl] = useState('');
  const [refMode, setRefMode] = useState<'edit' | 'inspire'>('edit');
  const [isUploadingRef, setIsUploadingRef] = useState(false);
  const [isDraggingRef, setIsDraggingRef] = useState(false);
  // Photograph (a subject) vs Background (a canvas for text, no people).
  const [imageStyle, setImageStyle] = useState<'photo' | 'background'>('photo');

  const handleRefImageUpload = async (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { addToast('Reference must be an image file.', 'error'); return; }
    setIsUploadingRef(true);
    try {
      const { url, error } = await uploadSocialMedia(branch || 'creative-studio', file);
      if (!url) throw new Error(error || 'Upload failed');
      setRefImageUrl(url);
      addToast('Reference photo attached.', 'success');
    } catch (err: any) {
      addToast(`Upload failed: ${err.message}`, 'error');
    } finally {
      setIsUploadingRef(false);
    }
  };

  // Reset aspect ratio to a sensible default whenever the format changes
  // (the user can still override it on the config step).
  useEffect(() => {
    setAspectRatio(format === 'video' ? '9:16' : '1:1');
    setSetting(format === 'video' ? VIDEO_SETTINGS[0] : AI_CHOOSES_SETTING);
  }, [format]);

  // ── Script & template state ──
  const [generatedScript, setGeneratedScript] = useState('');
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [templates, setTemplates] = useState<VideoAdTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [saveAsTemplate, setSaveAsTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState('');

  // ── Job state ──
  const [jobs, setJobs] = useState<VideoAdJob[]>([]);
  const [activeJobIds, setActiveJobIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Tracking state — the job the Progress step is watching ──
  const [trackedJobId, setTrackedJobId] = useState<string | null>(null);

  // ── Approval / caption state ──
  const [approvingJobId, setApprovingJobId] = useState<string | null>(null);
  const [approvalPhase, setApprovalPhase] = useState<Record<string, 'compositing' | 'approving'>>({});
  const [captionDrafts, setCaptionDrafts] = useState<Record<string, string>>({});
  const getCaptionDraft = (job: VideoAdJob) => captionDrafts[job.id] ?? job.caption ?? '';

  // ── Text overlay state (static ads) — real text composited over the clean
  //    AI-generated image, keyed by job id so review state survives re-renders. ──
  const [overlayConfigs, setOverlayConfigs] = useState<Record<string, TextOverlayConfig>>({});
  const [savingLayoutJobId, setSavingLayoutJobId] = useState<string | null>(null);

  // n8n writes copy as a JSON string in job.script. Older jobs look like
  // {"headline":"...","subtext":"...","cta":"..."}; newer ones add
  // headline_variants (5 persuasion-angle options) and subhead. That field
  // predates the JSON convention and is sometimes plain text or missing —
  // parse defensively and fall back to the caption, then blank. Never throws.
  const parseJobCopy = (job: VideoAdJob): {
    headline: string;
    subtext?: string;
    subhead?: string;
    cta?: string;
    headline_variants: string[];
  } => {
    if (job.script) {
      try {
        const parsed = JSON.parse(job.script);
        if (parsed && typeof parsed === 'object' && typeof parsed.headline === 'string') {
          const headline_variants = Array.isArray(parsed.headline_variants)
            ? parsed.headline_variants.filter((v: unknown): v is string => typeof v === 'string' && v.trim().length > 0)
            : [];
          return {
            headline: parsed.headline,
            subtext: typeof parsed.subtext === 'string' ? parsed.subtext : undefined,
            subhead: typeof parsed.subhead === 'string' ? parsed.subhead : undefined,
            cta: typeof parsed.cta === 'string' ? parsed.cta : undefined,
            headline_variants,
          };
        }
      } catch {
        // job.script isn't JSON — fall through to caption/blank.
      }
    }
    return { headline: job.caption || '', headline_variants: [] };
  };

  const brandInfoForJob = (job: VideoAdJob) => branchContext?.allBranches.find(b => b.slug === job.branch);

  const getOverlayConfig = (job: VideoAdJob): TextOverlayConfig => {
    if (overlayConfigs[job.id]) return overlayConfigs[job.id];
    if (job.overlay_config) return job.overlay_config;
    const info = brandInfoForJob(job);
    const { headline } = parseJobCopy(job);
    return defaultOverlayForHeadline(headline, { fontFamily: info?.font_family, color: '#ffffff' });
  };

  const handleSaveLayout = async (job: VideoAdJob) => {
    setSavingLayoutJobId(job.id);
    try {
      const config = getOverlayConfig(job);
      await saveOverlayConfig(job.id, config);
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, overlay_config: config } : j));
      addToast('Layout saved.', 'success');
    } catch (err: any) {
      addToast(`Failed to save layout: ${err.message}`, 'error');
    } finally {
      setSavingLayoutJobId(null);
    }
  };

  // Swap only the primary text layer's copy — position, font, size, color, and
  // every other layer are left untouched. Free to try, since the headline is
  // composited onto the image rather than baked in by the generator.
  const applyHeadlineVariant = (job: VideoAdJob, variant: string) => {
    const config = getOverlayConfig(job);
    if (!config.layers.length) return;
    const nextLayers = config.layers.map((layer, i) => (i === 0 ? { ...layer, text: variant } : layer));
    setOverlayConfigs(prev => ({ ...prev, [job.id]: { ...config, layers: nextLayers } }));
  };

  // Convenience for the common two-line layout: append the subhead as a second
  // layer just under the primary headline, inheriting its font/color/alignment
  // so it reads as one cohesive design rather than a mismatched addition.
  const handleAddSubhead = (job: VideoAdJob, subhead: string) => {
    const config = getOverlayConfig(job);
    const primary = config.layers[0];
    if (!primary) return;
    const subheadLayer: TextOverlayLayer = {
      id: crypto.randomUUID(),
      text: subhead,
      x: primary.x,
      y: Math.min(0.97, primary.y + 0.09),
      widthPct: primary.widthPct,
      fontSize: primary.fontSize * 0.45,
      fontFamily: primary.fontFamily,
      fontWeight: 400,
      color: primary.color,
      align: primary.align,
      lineHeight: primary.lineHeight,
      letterSpacing: primary.letterSpacing,
      uppercase: false,
      shadow: primary.shadow,
    };
    setOverlayConfigs(prev => ({ ...prev, [job.id]: { ...config, layers: [...config.layers, subheadLayer] } }));
  };

  // ── Regenerate / discard state (review loop) ──
  const [regenerateOpenJobId, setRegenerateOpenJobId] = useState<string | null>(null);
  const [regenerateNotesDraft, setRegenerateNotesDraft] = useState<Record<string, string>>({});
  const [isRegenerating, setIsRegenerating] = useState<string | null>(null);
  const [discardConfirmJobId, setDiscardConfirmJobId] = useState<string | null>(null);
  const [isDiscarding, setIsDiscarding] = useState<string | null>(null);

  // ── Publish state ──
  const [publishDraftJobId, setPublishDraftJobId] = useState<string | null>(null);
  const [publishingJobId, setPublishingJobId] = useState<string | null>(null);

  // ── Meta Ads export state — the job (if any) currently open in the export modal ──
  const [adExportJobId, setAdExportJobId] = useState<string | null>(null);

  // ── Video Library state ──
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [formatFilter, setFormatFilter] = useState<FormatFilter>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 10;

  // ── Expanded row state ──
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);

  // ── Schedule state ──
  const [schedulingJobId, setSchedulingJobId] = useState<string | null>(null);
  const [scheduleDateTime, setScheduleDateTime] = useState('');
  const [isScheduling, setIsScheduling] = useState(false);

  // ── Schedule handler ──
  const handleSchedule = useCallback(async (job: VideoAdJob) => {
    if (!scheduleDateTime) return;
    setIsScheduling(true);
    try {
      const scheduledDate = new Date(scheduleDateTime);

      // Insert into content_calendar_events
      const { error: calError } = await supabase
        .from('content_calendar_events')
        .insert({
          branch_id: job.branch,
          channel: job.platform ?? 'general',
          event_type: 'social_post',
          title: `${formatLabel(job.format)} Ad - ${formatBranchName(job.branch)}`,
          content_preview: job.script || job.caption || null,
          scheduled_for: scheduledDate.toISOString(),
          status: 'scheduled',
          source: 'social_hub',
          source_id: job.id,
        });
      if (calError) throw new Error(calError.message);

      // The calendar row above is display-only. This is what actually gets
      // published: the S1 worker drains scheduled_social_posts every 10 min.
      // Videos aren't supported by the publish path yet, so only queue images.
      if (job.format === 'static' || job.format === 'carousel') {
        const caption = getCaptionDraft(job).trim() || job.caption || '';
        const mediaUrls = job.format === 'carousel' && job.media_urls?.length
          ? job.media_urls
          : [publishableImageUrl(job)].filter(Boolean);
        const branchUuid = branchIdForSlug(job.branch);

        if (!caption) throw new Error('Add a caption before scheduling — it publishes exactly as written.');
        if (!mediaUrls.length) throw new Error('No media to schedule.');

        const { error: queueError } = await supabase
          .from('scheduled_social_posts')
          .insert({
            branch_id: branchUuid,
            branch_slug: job.branch,
            platform: 'instagram',
            caption,
            media_type: job.format === 'carousel' ? 'carousel' : 'image',
            media_urls: mediaUrls,
            scheduled_for: scheduledDate.toISOString(),
            source: 'creative_studio',
          });
        if (queueError) throw new Error(queueError.message);
      }

      // Update video_ad_jobs row
      const { error: jobError } = await supabase
        .from('video_ad_jobs')
        .update({ publish_status: 'scheduled', scheduled_for: scheduledDate.toISOString() })
        .eq('id', job.id);
      if (jobError) throw new Error(jobError.message);

      // Update local state
      setJobs(prev => prev.map(j =>
        j.id === job.id
          ? { ...j, publish_status: 'scheduled', scheduled_for: scheduledDate.toISOString() }
          : j,
      ));

      const label = scheduledDate.toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
      });
      addToast(`${formatLabel(job.format)} scheduled for ${label}`, 'success');
      setSchedulingJobId(null);
      setScheduleDateTime('');
    } catch (err: any) {
      addToast(`Failed to schedule: ${err.message}`, 'error');
    } finally {
      setIsScheduling(false);
    }
    // captionDrafts/branchContext are read via getCaptionDraft/branchIdForSlug —
    // without them a stale closure would queue the pre-edit caption.
  }, [scheduleDateTime, addToast, captionDrafts, branchContext]);

  // ── Load jobs on mount from Hub Supabase ──
  useEffect(() => {
    (async () => {
      try {
        const fetched = await getVideoAdJobs();
        setJobs(fetched);
        setActiveJobIds(fetched.filter(j => !TERMINAL_STATUSES.includes(j.status)).map(j => j.id));
      } catch (err: any) {
        console.error('[VideoAdLab] Failed to load jobs:', err);
        addToast(`Failed to load video jobs: ${err.message}`, 'error');
      }
    })();
  }, []);

  // ── Load templates when branch changes (Hub) ──
  useEffect(() => {
    if (!branch) return;
    fetchTemplates(branch).then(setTemplates).catch(() => setTemplates([]));
  }, [branch]);

  // ── Poller ──
  const handleStatusChange = useCallback((updatedJob: VideoAdJob) => {
    // Upsert, not map: n8n inserts the row asynchronously, so a job we just
    // submitted often isn't in the list yet when its first poll lands.
    setJobs(prev => prev.some(j => j.id === updatedJob.id)
      ? prev.map(j => j.id === updatedJob.id ? updatedJob : j)
      : [updatedJob, ...prev]);
    if (updatedJob.status === 'completed') {
      addToast(`${formatLabel(updatedJob.format)} ad "${updatedJob.id.slice(0, 8)}..." completed!`, 'success');
    } else if (updatedJob.status === 'awaiting_approval') {
      addToast(`${formatLabel(updatedJob.format)} ad "${updatedJob.id.slice(0, 8)}..." is ready for review`, 'info');
    } else if (updatedJob.status === 'failed') {
      addToast(`${formatLabel(updatedJob.format)} ad "${updatedJob.id.slice(0, 8)}..." failed: ${updatedJob.error_message || 'Unknown error'}`, 'error');
    }
    if (TERMINAL_STATUSES.includes(updatedJob.status)) {
      setActiveJobIds(prev => prev.filter(id => id !== updatedJob.id));
    }
  }, [addToast]);

  const { activeCount } = useVideoAdPoller(activeJobIds, handleStatusChange, activeJobIds.length > 0);

  // ── Refresh handler ──
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const fetched = await getVideoAdJobs();
      setJobs(fetched);
      setActiveJobIds(fetched.filter(j => !TERMINAL_STATUSES.includes(j.status)).map(j => j.id));
      addToast('Video library refreshed', 'info');
    } catch (err: any) {
      console.error('[VideoAdLab] Failed to refresh jobs:', err);
      addToast(`Failed to refresh: ${err.message}`, 'error');
    } finally {
      setIsRefreshing(false);
    }
  }, [addToast]);

  // ── Filtered jobs ──
  const filteredJobs = useMemo(() => {
    let list = jobs;
    if (statusFilter === 'active') list = list.filter(j => !TERMINAL_STATUSES.includes(j.status));
    else if (statusFilter === 'completed') list = list.filter(j => j.status === 'completed');
    else if (statusFilter === 'failed') list = list.filter(j => j.status === 'failed' || j.status === 'cancelled');
    if (formatFilter !== 'all') list = list.filter(j => (j.format || 'video') === formatFilter);
    return list;
  }, [jobs, statusFilter, formatFilter]);

  // ── Filter counts ──
  const filterCounts = useMemo(() => ({
    all: jobs.length,
    active: jobs.filter(j => !TERMINAL_STATUSES.includes(j.status)).length,
    completed: jobs.filter(j => j.status === 'completed').length,
    failed: jobs.filter(j => j.status === 'failed' || j.status === 'cancelled').length,
  }), [jobs]);

  const formatCounts = useMemo(() => ({
    all: jobs.length,
    video: jobs.filter(j => (j.format || 'video') === 'video').length,
    static: jobs.filter(j => j.format === 'static').length,
    carousel: jobs.filter(j => j.format === 'carousel').length,
  }), [jobs]);

  // ── Jobs awaiting review ──
  // The Progress step already shows the job it's tracking in full, so exclude
  // it here — otherwise the same creative gets two identical review panels.
  const awaitingApprovalJobs = useMemo(
    () => jobs.filter(j =>
      j.status === 'awaiting_approval' && !(step === 4 && j.id === trackedJobId),
    ),
    [jobs, step, trackedJobId],
  );

  // ── The job the Progress step is watching ──
  const trackedJob = useMemo(
    () => (trackedJobId ? jobs.find(j => j.id === trackedJobId) : undefined),
    [jobs, trackedJobId],
  );

  // Clear the form and start over from the format picker.
  const startAnother = () => {
    setTrackedJobId(null);
    setProductDescription('');
    setCta('');
    setGeneratedScript('');
    setStaticMessage('');
    setCarouselTopic('');
    setTargetSegment('');
    setStyleNotes('');
    setRefImageUrl('');
    setStaticBatchMode(false);
    setStaticBatchText('');
    setStep(0);
  };

  // ── Pagination ──
  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / PAGE_SIZE));
  const paginatedJobs = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredJobs.slice(start, start + PAGE_SIZE);
  }, [filteredJobs, currentPage]);

  // Reset to page 1 when filter changes
  useEffect(() => { setCurrentPage(1); }, [statusFilter, formatFilter]);

  // ── Apply template ──
  const applyTemplate = (templateId: string | null) => {
    setSelectedTemplateId(templateId);
    if (!templateId) return;
    const tpl = templates.find(t => t.id === templateId);
    if (!tpl) return;
    const s = tpl.settings;
    if (s.pipeline) setPipeline(s.pipeline);
    if (s.actorGender) setActorGender(s.actorGender);
    if (s.actorStyle) setActorStyle(s.actorStyle);
    if (s.aspectRatio) setAspectRatio(s.aspectRatio);
    if (s.tone) setTone(s.tone);
    if (s.setting) setSetting(s.setting);
    if (s.lighting) setLighting(s.lighting);
    if (s.mood) setMood(s.mood);
    if (s.customVisualNotes) setCustomVisualNotes(s.customVisualNotes);
    addToast(`Template "${tpl.template_name}" applied`, 'info');
  };

  // ── Script generation ──
  const handleGenerateScript = async () => {
    if (!productDescription) return;
    setIsGeneratingScript(true);
    try {
      if (!geminiApiKey) { addToast('No Gemini API key configured. Add one in Settings.', 'error'); return; }
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });
      const wl = Math.floor(duration * 2.5);
      const prompt = `You are a video ad scriptwriter for Sproutify. Write a spoken-word script for a ${pipeline === 'talking_head' ? 'talking-head' : 'full scene'} video ad.

PRODUCT: ${productDescription}
BRAND: ${branchName(branch)}
TARGET AUDIENCE: ${targetSegment || 'general audience'}
TONE: ${tone}
CTA: ${cta || 'Visit our website'}
DURATION: ${duration} seconds

STRICT RULES:
1. Write ONLY spoken dialogue — words the actor will say out loud.
2. Do NOT include stage directions, actions, gestures, or parenthetical notes.
3. Maximum ${wl} words. This is a hard limit. The audio must fit in ${duration} seconds.
4. Start with a hook in the first sentence to grab attention.
5. End with the CTA naturally woven into the last sentence.
6. Match the ${tone} tone throughout.
7. Return ONLY the script text. No labels, no formatting, no markdown.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
      });
      setGeneratedScript(response.text || '');
    } catch (err: any) {
      addToast(`Script generation failed: ${err.message}`, 'error');
    } finally {
      setIsGeneratingScript(false);
    }
  };

  // ── Submit: Video ──
  const handleSubmit = async () => {
    if (!generatedScript || isSubmitting) return;
    setIsSubmitting(true);
    try {
      // Save template if requested
      if (saveAsTemplate && newTemplateName.trim()) {
        await saveTemplate(branch, newTemplateName.trim(), {
          pipeline, actorGender, actorStyle, aspectRatio, tone,
          setting, lighting, mood, customVisualNotes,
        });
        const refreshed = await fetchTemplates(branch);
        setTemplates(refreshed);
        addToast(`Template "${newTemplateName}" saved`, 'success');
      }

      const config: VideoAdConfig = {
        branch,
        product_description: productDescription,
        target_segment: targetSegment,
        tone,
        cta: cta || 'Visit our website',
        actor_style: actorStyle,
        actor_gender: actorGender,
        voice_style: 'friendly',
        video_duration: pipeline === 'full_scene' ? 15 : 30,
        pipeline,
        platform,
      };

      const result = await submitVideoAdJob({
        ...config,
        script: generatedScript,
        aspect_ratio: aspectRatio,
        setting,
      });
      setActiveJobIds(prev => [...prev, result.job_id]);
      addToast('Video generation started!', 'success');

      // Watch it on the Progress step. Form values are kept so a failure can
      // be retried without retyping — cleared by "Create another".
      setTrackedJobId(result.job_id);
      setStep(4);
      setSaveAsTemplate(false);
      setNewTemplateName('');

      const fetched = await getVideoAdJobs();
      setJobs(fetched);
    } catch (err: any) {
      addToast(`Submit failed: ${err.message}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Submit: Static ──
  const handleSubmitStatic = async () => {
    if (!staticMessage.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const result = await submitStaticAdJob({
        branch,
        message: staticMessage,
        target_segment: targetSegment,
        platform,
        aspect_ratio: aspectRatio,
        // "Let AI choose" means send nothing, so the scene brief written from
        // the message decides the imagery instead of a fixed location.
        setting: setting === AI_CHOOSES_SETTING ? '' : setting,
        style_notes: styleNotes,
        reference_image_url: refImageUrl,
        reference_mode: refMode,
        image_style: imageStyle,
      });
      setActiveJobIds(prev => [...prev, result.job_id]);
      addToast('Static ad generation started!', 'success');

      setTrackedJobId(result.job_id);
      setStep(4);

      const fetched = await getVideoAdJobs();
      setJobs(fetched);
    } catch (err: any) {
      addToast(`Submit failed: ${err.message}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Submit: Static batch ──
  // Queues one job per non-blank line so a week/month of daily images can be
  // generated in one go instead of one at a time. Every other static field
  // (branch, aspect ratio, setting, platform, style notes, reference photo)
  // is shared across the batch so the set reads as one consistent campaign.
  // Batch submits skip the single-job Progress step (step 4 tracks exactly
  // one job) — instead we return to the format picker and let "Needs Your
  // Review" plus the Creative Library (which already handle many jobs at
  // once) surface each image as it finishes.
  const handleSubmitStaticBatch = async () => {
    if (staticBatchLinesCapped.length === 0 || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const configs = staticBatchLinesCapped.map(message => ({
        branch,
        message,
        target_segment: targetSegment,
        platform,
        aspect_ratio: aspectRatio,
        // "Let AI choose" means send nothing, so the scene brief written from
        // the message decides the imagery instead of a fixed location.
        setting: setting === AI_CHOOSES_SETTING ? '' : setting,
        style_notes: styleNotes,
        reference_image_url: refImageUrl,
        reference_mode: refMode,
        image_style: imageStyle,
      }));
      const result = await submitStaticAdBatch(configs);
      setActiveJobIds(prev => [...prev, ...result.job_ids]);
      addToast(
        `${result.job_ids.length} image${result.job_ids.length === 1 ? '' : 's'} queued — they'll appear in Needs Your Review as they finish.`,
        'success',
      );

      // Batch jobs aren't tracked individually on the Progress step (it
      // watches exactly one job) — go back to the format picker and let the
      // review queue below pick each one up as it finishes.
      setStep(0);

      const fetched = await getVideoAdJobs();
      setJobs(fetched);
    } catch (err: any) {
      addToast(`Batch submit failed: ${err.message}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Submit: Carousel ──
  const handleSubmitCarousel = async () => {
    if (!carouselTopic.trim() || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const result = await submitCarouselJob({
        branch,
        topic: carouselTopic,
        slide_count: slideCount,
        target_segment: targetSegment,
        platform,
        aspect_ratio: aspectRatio,
        style_notes: styleNotes,
      });
      setActiveJobIds(prev => [...prev, result.job_id]);
      addToast('Carousel generation started!', 'success');

      setTrackedJobId(result.job_id);
      setStep(4);

      const fetched = await getVideoAdJobs();
      setJobs(fetched);
    } catch (err: any) {
      addToast(`Submit failed: ${err.message}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Cancel job ──
  const handleCancel = async (jobId: string) => {
    try {
      await cancelVideoAdJob(jobId);
      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: 'cancelled' as VideoAdStatus } : j));
      setActiveJobIds(prev => prev.filter(id => id !== jobId));
      addToast('Job cancelled.', 'info');
    } catch (err: any) {
      addToast(`Cancel failed: ${err.message}`, 'error');
    }
  };

  // ── Approve (static / carousel) ──
  // Static ads composite the real text overlay onto the clean AI image before
  // approving — if that fails (e.g. a CORS-tainted canvas), we bail out and
  // leave the job in review rather than approve an ad whose text never got
  // baked in.
  const handleApprove = async (job: VideoAdJob) => {
    setApprovingJobId(job.id);
    try {
      if (job.format === 'static' && job.frame_url) {
        const config = getOverlayConfig(job);
        setApprovalPhase(prev => ({ ...prev, [job.id]: 'compositing' }));
        let blob: Blob;
        try {
          blob = await compositeOverlay(job.frame_url, config);
        } catch (compositeErr: any) {
          addToast(`Couldn't render the text overlay: ${compositeErr.message || 'Unknown error'}. The ad was not approved — try again or adjust the layout.`, 'error');
          return;
        }
        setApprovalPhase(prev => ({ ...prev, [job.id]: 'approving' }));
        const compositeUrl = await saveComposite(job.id, blob, config);
        setJobs(prev => prev.map(j => j.id === job.id ? { ...j, composite_url: compositeUrl, overlay_config: config } : j));
      } else {
        setApprovalPhase(prev => ({ ...prev, [job.id]: 'approving' }));
      }
      await approveJob(job.id);
      setJobs(prev => prev.map(j => j.id === job.id
        ? { ...j, status: 'completed' as VideoAdStatus, frame_approved_at: new Date().toISOString() }
        : j));
      setActiveJobIds(prev => prev.filter(id => id !== job.id));
      addToast(`${formatLabel(job.format)} ad approved!`, 'success');
    } catch (err: any) {
      addToast(`Approve failed: ${err.message}`, 'error');
    } finally {
      setApprovingJobId(null);
      setApprovalPhase(prev => {
        const next = { ...prev };
        delete next[job.id];
        return next;
      });
    }
  };

  // ── Approve & render (video) ──
  const handleApproveAndRender = async (job: VideoAdJob) => {
    setApprovingJobId(job.id);
    try {
      await approveAndRenderVideo(job.id);
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'rendering' as VideoAdStatus } : j));
      addToast('Frame approved — rendering video now!', 'success');
    } catch (err: any) {
      addToast(`Approve & render failed: ${err.message}`, 'error');
    } finally {
      setApprovingJobId(null);
    }
  };

  // ── Regenerate: replay this job's inputs as a new job, optionally with change notes ──
  const handleRegenerate = async (job: VideoAdJob) => {
    if (isRegenerating) return;
    const notes = (regenerateNotesDraft[job.id] || '').trim();
    setIsRegenerating(job.id);
    try {
      const result = await regenerateJob(job, notes || undefined);
      setActiveJobIds(prev => [...prev, result.job_id]);
      addToast(`Regenerating your ${formatLabel(job.format).toLowerCase()} ad — new attempt queued.`, 'success');
      setRegenerateOpenJobId(null);
      setRegenerateNotesDraft(prev => {
        const next = { ...prev };
        delete next[job.id];
        return next;
      });
      // If the Progress step was watching this job, follow the retry instead.
      setTrackedJobId(prev => prev === job.id ? result.job_id : prev);

      const fetched = await getVideoAdJobs();
      setJobs(fetched);
    } catch (err: any) {
      addToast(err.message || 'Regenerate failed.', 'error');
    } finally {
      setIsRegenerating(null);
    }
  };

  // ── Discard: reject a finished creative (distinct from cancelling an in-flight job) ──
  const handleDiscard = async (job: VideoAdJob) => {
    setIsDiscarding(job.id);
    try {
      await discardJob(job.id);
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'cancelled' as VideoAdStatus } : j));
      setActiveJobIds(prev => prev.filter(id => id !== job.id));
      addToast(`${formatLabel(job.format)} ad discarded.`, 'info');
      setDiscardConfirmJobId(null);
    } catch (err: any) {
      addToast(`Discard failed: ${err.message}`, 'error');
    } finally {
      setIsDiscarding(null);
    }
  };

  // ── Publish approved static/carousel jobs to Instagram ──
  // Static/single-image jobs publish the flattened composite (real text
  // baked in); carousels still send their full slide array untouched.
  const handlePublish = async (job: VideoAdJob) => {
    const caption = getCaptionDraft(job).trim();
    if (!caption) { addToast('Add a caption before publishing.', 'error'); return; }

    const mediaUrls = job.format === 'carousel' && job.media_urls?.length
      ? job.media_urls
      : [publishableImageUrl(job)].filter(Boolean);
    const primaryImage = job.format === 'carousel' ? mediaUrls[0] : publishableImageUrl(job);
    if (!primaryImage) { addToast('No media to publish.', 'error'); return; }

    setPublishingJobId(job.id);
    try {
      const branchId = branchIdForSlug(job.branch);
      const result = await publishToSocial(
        branchId,
        caption,
        primaryImage,
        null,
        undefined,
        { media_type: job.format === 'carousel' ? 'carousel' : 'image', media_urls: mediaUrls },
      );
      if (result.ok) {
        addToast(`Published to Instagram${result.postId ? ` · post ${result.postId}` : ''}`, 'success');
        setJobs(prev => prev.map(j => j.id === job.id ? { ...j, publish_status: 'published', caption } : j));
        setPublishDraftJobId(null);
      } else {
        addToast(`Publish failed: ${result.error || 'Unknown error'}`, 'error');
      }
    } catch (err: any) {
      addToast(`Publish failed: ${err.message}`, 'error');
    } finally {
      setPublishingJobId(null);
    }
  };

  // ── Derived ──
  const wordCount = generatedScript.trim().split(/\s+/).filter(Boolean).length;
  const pipelineCost = PIPELINE_OPTIONS.find(p => p.value === pipeline)?.cost ?? 0.12;

  // ── Static batch derived state ──
  const staticBatchLines = useMemo(
    () => staticBatchText.split('\n').map(l => l.trim()).filter(Boolean),
    [staticBatchText],
  );
  const staticBatchLinesCapped = useMemo(
    () => staticBatchLines.slice(0, STATIC_BATCH_MAX),
    [staticBatchLines],
  );
  const staticBatchOverLimit = staticBatchLines.length > STATIC_BATCH_MAX;
  const availableStaticBatchPresets = useMemo(
    () => STATIC_BATCH_PRESETS.filter(p => p.branchSlug === branch),
    [branch],
  );

  const step1Valid = format === 'video'
    ? !!(branch && productDescription && cta)
    : format === 'static'
    ? (staticBatchMode ? !!(branch && staticBatchLines.length > 0) : !!(branch && staticMessage.trim()))
    : !!(branch && carouselTopic.trim());

  const advancedChanged = setting !== VIDEO_SETTINGS[0] || lighting !== VIDEO_LIGHTING[0] || mood !== VIDEO_MOODS[0] || customVisualNotes.trim() !== '';

  const currentAspectRatios = format === 'static' ? STATIC_ASPECT_RATIOS : format === 'carousel' ? CAROUSEL_ASPECT_RATIOS : ASPECT_RATIOS;

  // ═══════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-6 min-h-screen pb-40">

      {/* ── Top Bar ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Sparkles size={24} className="text-emerald-600" />
          <div>
            <h2 className="text-xl font-black text-slate-800">Creative Studio</h2>
            <p className="text-xs text-slate-400">Create AI-powered video, static, and carousel ads</p>
          </div>
        </div>

        {/* Template selector — video only, since static/carousel don't have Look & Feel settings to template */}
        {format === 'video' && (
          <div className="flex items-center gap-2">
            <BookTemplate size={16} className="text-slate-400" />
            <select
              value={selectedTemplateId || ''}
              onChange={e => applyTemplate(e.target.value || null)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:border-emerald-500"
            >
              <option value="">Start fresh</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>{t.template_name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ── Stepper ── */}
      <div className="flex items-center justify-center gap-0">
        {STEPS.map((s, i) => {
          const isActive = step === s.num;
          const isCompleted = step > s.num;
          const Icon = s.icon;
          return (
            <React.Fragment key={s.num}>
              {i > 0 && (
                <div className={`w-16 h-0.5 ${isCompleted ? 'bg-emerald-500' : 'bg-slate-200'}`} />
              )}
              <button
                onClick={() => {
                  if (isCompleted) setStep(s.num);
                }}
                className="flex flex-col items-center gap-1.5 cursor-default"
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center transition ${
                  isActive ? 'bg-emerald-500 text-white' :
                  isCompleted ? 'bg-emerald-500 text-white' :
                  'bg-slate-200 text-slate-400'
                }`}>
                  {isCompleted ? <Check size={18} /> : <Icon size={18} />}
                </div>
                <span className={`text-xs font-bold ${isActive || isCompleted ? 'text-emerald-600' : 'text-slate-400'}`}>
                  {s.label}
                </span>
              </button>
            </React.Fragment>
          );
        })}
      </div>

      {/* ── Step 0: Format picker ── */}
      {step === 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
          <h3 className="text-lg font-black text-slate-800 mb-1">What kind of ad?</h3>
          <p className="text-xs text-slate-400 mb-6">Pick a format — this drives what you'll configure next.</p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {FORMAT_OPTIONS.map(opt => {
              const Icon = opt.icon;
              const selected = format === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => { setFormat(opt.value); setStep(1); }}
                  className={`border-2 rounded-xl p-5 text-left transition ${
                    selected ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${selected ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                    <Icon size={18} />
                  </div>
                  <span className={`block text-sm font-black uppercase tracking-tight mb-1 ${selected ? 'text-emerald-700' : 'text-slate-700'}`}>{opt.label}</span>
                  <p className={`text-xs mb-2 ${selected ? 'text-emerald-600' : 'text-slate-400'}`}>{opt.description}</p>
                  <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${selected ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    <DollarSign size={10} />{opt.hint}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Step 1: Message / Topic (format-specific) ── */}
      {step === 1 && format === 'video' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
          <h3 className="text-lg font-black text-slate-800 mb-1">What's your message?</h3>
          <p className="text-xs text-slate-400 mb-6">Tell us about your product and who you're talking to.</p>

          <div className="space-y-5">
            {/* Branch */}
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Branch</label>
              <select
                value={branch}
                onChange={e => setBranch(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 transition"
              >
                {branchOptions.length === 0 && <option value="">No branches available</option>}
                {branchOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mt-1">Which brand is this video for?</p>
            </div>

            {/* Product Description */}
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Product Description</label>
              <textarea
                value={productDescription}
                onChange={e => setProductDescription(e.target.value)}
                rows={3}
                placeholder="Describe what you're promoting..."
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 transition resize-none"
              />
              <p className="text-xs text-slate-400 mt-1">Describe what you're promoting — be specific about features and benefits.</p>
            </div>

            {/* Target Audience */}
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Target Audience</label>
              <input
                value={targetSegment}
                onChange={e => setTargetSegment(e.target.value)}
                placeholder="e.g. health-conscious millennials, new gardeners"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 transition"
              />
              <p className="text-xs text-slate-400 mt-1">Who should this resonate with? e.g. health-conscious millennials, new gardeners</p>
            </div>

            {/* Tone */}
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Tone</label>
              <select
                value={tone}
                onChange={e => setTone(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 transition"
              >
                {TONE_PRESETS.map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mt-1">Sets the overall voice and energy of the script.</p>
            </div>

            {/* CTA */}
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Call to Action</label>
              <input
                value={cta}
                onChange={e => setCta(e.target.value)}
                placeholder="e.g. Visit oursite.com to learn more"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 transition"
              />
              <p className="text-xs text-slate-400 mt-1">What action should the viewer take? e.g. Visit oursite.com to learn more</p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-between mt-8">
            <button
              onClick={() => setStep(0)}
              className="px-6 py-2.5 border border-slate-200 text-slate-600 text-sm font-bold rounded-lg hover:bg-slate-50 transition"
            >
              Back
            </button>
            <button
              onClick={() => setStep(2)}
              disabled={!step1Valid}
              className="px-6 py-2.5 bg-emerald-500 text-white text-sm font-bold rounded-lg hover:bg-emerald-600 transition disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* ── Step 1: Static config ── */}
      {step === 1 && format === 'static' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
          <h3 className="text-lg font-black text-slate-800 mb-1">What's the offer?</h3>
          <p className="text-xs text-slate-400 mb-6">n8n writes the ad copy for you — just describe the message.</p>

          {/* Single / Batch mode toggle */}
          <div className="flex items-center gap-2 mb-6">
            <button
              onClick={() => setStaticBatchMode(false)}
              className={`flex items-center gap-1.5 border rounded-full px-4 py-1.5 text-sm font-bold transition ${
                !staticBatchMode ? 'bg-emerald-500 text-white border-emerald-500' : 'border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              <ImageIcon size={14} /> Single
            </button>
            <button
              onClick={() => setStaticBatchMode(true)}
              className={`flex items-center gap-1.5 border rounded-full px-4 py-1.5 text-sm font-bold transition ${
                staticBatchMode ? 'bg-emerald-500 text-white border-emerald-500' : 'border-slate-200 text-slate-600 hover:border-slate-300'
              }`}
            >
              <ListChecks size={14} /> Batch
            </button>
          </div>

          <div className="space-y-5">
            {/* Branch */}
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Branch</label>
              <select
                value={branch}
                onChange={e => setBranch(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 transition"
              >
                {branchOptions.length === 0 && <option value="">No branches available</option>}
                {branchOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Message — single job, or one line per image in batch mode */}
            {staticBatchMode ? (
              <div>
                <div className="flex items-center justify-between mb-1.5 flex-wrap gap-2">
                  <label className="text-xs font-bold uppercase tracking-widest text-slate-400">
                    Messages <span className="normal-case text-slate-300">(one per line — one image each)</span>
                  </label>
                  {availableStaticBatchPresets.length > 0 && (
                    <div className="flex gap-3">
                      {availableStaticBatchPresets.map(preset => (
                        <button
                          key={preset.label}
                          onClick={() => setStaticBatchText(preset.lines.join('\n'))}
                          className="flex items-center gap-1 text-xs font-bold text-emerald-600 hover:text-emerald-700 transition"
                        >
                          <Wand2 size={12} /> {preset.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <textarea
                  value={staticBatchText}
                  onChange={e => setStaticBatchText(e.target.value)}
                  rows={10}
                  placeholder={'e.g.\nMonday: 20% off microgreens starter kits\nTuesday: New arrivals just landed\nWednesday: Ask us anything — live Q&A at 5pm'}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:border-emerald-500 transition resize-y"
                />
                <p className="text-xs text-slate-400 mt-1">
                  {staticBatchLinesCapped.length} image{staticBatchLinesCapped.length === 1 ? '' : 's'} will be generated
                </p>
                {staticBatchOverLimit && (
                  <div className="flex items-start gap-2 mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <AlertTriangle size={14} className="text-amber-500 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-amber-700">
                      You pasted {staticBatchLines.length} lines — batches are capped at {STATIC_BATCH_MAX} images per run. Only the first {STATIC_BATCH_MAX} will be generated; remove {staticBatchLines.length - STATIC_BATCH_MAX} line{staticBatchLines.length - STATIC_BATCH_MAX === 1 ? '' : 's'} to include the rest.
                    </p>
                  </div>
                )}
                <p className="text-xs text-slate-400 mt-2">
                  Branch, aspect ratio, setting, platform, style notes, and reference photo below apply to every image in the batch, so the set looks visually consistent.
                </p>
              </div>
            ) : (
              <div>
                <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Message / Offer</label>
                <textarea
                  value={staticMessage}
                  onChange={e => setStaticMessage(e.target.value)}
                  rows={3}
                  placeholder="e.g. 20% off microgreens starter kits this week only"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 transition resize-none"
                />
                <p className="text-xs text-slate-400 mt-1">What should the image say or promote?</p>
              </div>
            )}

            {/* Target Audience */}
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Target Audience</label>
              <input
                value={targetSegment}
                onChange={e => setTargetSegment(e.target.value)}
                placeholder="e.g. Christian women 25-45 in a hard season"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 transition"
              />
              <p className="text-xs text-slate-400 mt-1">
                Shapes how the copy is written — the words, not who sees the post. Ad targeting is set later in Ads Manager.
              </p>
            </div>

            {/* Image Type */}
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2 block">Image Type</label>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { value: 'photo', label: 'Photograph', hint: 'A real scene with a subject — products, people, events' },
                  { value: 'background', label: 'Background', hint: 'A calm canvas for text — no people, no focal subject' },
                ] as const).map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setImageStyle(opt.value)}
                    className={`border-2 rounded-xl p-3 text-left transition ${
                      imageStyle === opt.value ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className={`text-sm font-bold ${imageStyle === opt.value ? 'text-emerald-700' : 'text-slate-700'}`}>{opt.label}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{opt.hint}</div>
                  </button>
                ))}
              </div>
              {imageStyle === 'background' && (
                <p className="text-xs text-slate-400 mt-1.5">
                  Built for verse and quote posts — the whole frame stays calm so text reads anywhere on it.
                </p>
              )}
            </div>

            {/* Aspect Ratio */}
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2 block">Aspect Ratio</label>
              <div className="flex gap-2 flex-wrap">
                {STATIC_ASPECT_RATIOS.map(ar => (
                  <button
                    key={ar.value}
                    onClick={() => setAspectRatio(ar.value)}
                    className={`border rounded-full px-4 py-1.5 text-sm transition ${
                      aspectRatio === ar.value ? 'bg-emerald-500 text-white border-emerald-500' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {ar.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Setting */}
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Setting</label>
              <select
                value={setting}
                onChange={e => setSetting(e.target.value)}
                disabled={!!refImageUrl && refMode === 'edit'}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {STATIC_SETTINGS.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mt-1">
                {refImageUrl && refMode === 'edit'
                  ? 'Not used — your uploaded photo is the scene.'
                  : setting === AI_CHOOSES_SETTING
                  ? 'The AI picks the imagery from your message. For something specific — "a single white dove against a pale sky" — describe it in Style Notes below.'
                  : 'A broad direction. Describe anything specific in Style Notes below.'}
              </p>
            </div>

            {/* Platform */}
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2 block">Platform</label>
              <div className="flex gap-2 flex-wrap">
                {([
                  { value: 'general', label: 'General' },
                  { value: 'instagram_reels', label: 'Instagram' },
                  { value: 'tiktok', label: 'TikTok' },
                  { value: 'youtube_shorts', label: 'YT Shorts' },
                ] as const).map(p => (
                  <button
                    key={p.value}
                    onClick={() => setPlatform(p.value)}
                    className={`border rounded-full px-4 py-1.5 text-sm transition ${
                      platform === p.value ? 'bg-emerald-500 text-white border-emerald-500' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Style Notes */}
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Style Notes <span className="normal-case text-slate-300">(optional)</span></label>
              <textarea
                value={styleNotes}
                onChange={e => setStyleNotes(e.target.value)}
                rows={2}
                placeholder="e.g. a single white dove against a pale morning sky, soft natural light, muted warm tones"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 transition resize-none"
              />
              <p className="text-xs text-slate-400 mt-1">
                {refImageUrl && refMode === 'edit'
                  ? 'With your own photo, this only steers the colour grade — the scene stays as shot.'
                  : 'Describe the actual subject and mood you want. This is the strongest lever on how the image looks.'}
              </p>
            </div>

            {/* Reference Photo */}
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">
                Reference Photo <span className="normal-case text-slate-300">(optional)</span>
              </label>
              {!refImageUrl ? (
                <label
                  onDragOver={e => { e.preventDefault(); setIsDraggingRef(true); }}
                  onDragLeave={() => setIsDraggingRef(false)}
                  onDrop={e => {
                    e.preventDefault();
                    setIsDraggingRef(false);
                    handleRefImageUpload(e.dataTransfer.files);
                  }}
                  className={`flex flex-col items-center justify-center gap-1.5 border-2 border-dashed rounded-xl px-4 py-8 text-sm transition cursor-pointer ${
                    isDraggingRef
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-600'
                      : 'border-slate-200 text-slate-400 hover:border-emerald-400 hover:text-emerald-500'
                  } ${isUploadingRef ? 'opacity-50 pointer-events-none' : ''}`}
                >
                  {isUploadingRef ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
                  <span className="font-bold">
                    {isUploadingRef ? 'Uploading…' : isDraggingRef ? 'Drop the photo here' : 'Drag a photo here'}
                  </span>
                  {!isUploadingRef && !isDraggingRef && (
                    <span className="text-xs text-slate-300">or click to browse</span>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => { handleRefImageUpload(e.target.files); e.target.value = ''; }}
                  />
                </label>
              ) : (
                <div className="space-y-3">
                  <div className="relative inline-block">
                    <img src={refImageUrl} alt="Reference" className="h-32 rounded-xl border border-slate-200 object-cover" />
                    <button
                      onClick={() => setRefImageUrl('')}
                      className="absolute -top-2 -right-2 bg-slate-800 text-white rounded-full p-1 hover:bg-red-500 transition"
                      title="Remove reference photo"
                    >
                      <X size={12} />
                    </button>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {([
                      { value: 'edit', label: 'Use my photo as-is' },
                      { value: 'inspire', label: 'Style inspiration (generate new)' },
                    ] as const).map(m => (
                      <button
                        key={m.value}
                        onClick={() => setRefMode(m.value)}
                        className={`border rounded-full px-4 py-1.5 text-sm transition ${
                          refMode === m.value ? 'bg-emerald-500 text-white border-emerald-500' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                  <p className="text-xs text-slate-400">
                    {refMode === 'edit'
                      ? 'Keeps your actual photo, untouched except for a subtle colour grade — most authentic. You add the headline afterward in the next step.'
                      : 'Generates a fresh image using your photo for setting, mood and composition — also text-free, with the headline added afterward.'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-between mt-8">
            <button
              onClick={() => setStep(0)}
              className="px-6 py-2.5 border border-slate-200 text-slate-600 text-sm font-bold rounded-lg hover:bg-slate-50 transition"
            >
              Back
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!step1Valid}
              className="px-6 py-2.5 bg-emerald-500 text-white text-sm font-bold rounded-lg hover:bg-emerald-600 transition disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* ── Step 1: Carousel config ── */}
      {step === 1 && format === 'carousel' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
          <h3 className="text-lg font-black text-slate-800 mb-1">What's the topic?</h3>
          <p className="text-xs text-slate-400 mb-6">n8n plans the slide-by-slide story and writes the caption.</p>

          <div className="space-y-5">
            {/* Branch */}
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Branch</label>
              <select
                value={branch}
                onChange={e => setBranch(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 transition"
              >
                {branchOptions.length === 0 && <option value="">No branches available</option>}
                {branchOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Topic */}
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Topic</label>
              <textarea
                value={carouselTopic}
                onChange={e => setCarouselTopic(e.target.value)}
                rows={3}
                placeholder="e.g. 5 reasons to start a microgreens garden this fall"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 transition resize-none"
              />
              <p className="text-xs text-slate-400 mt-1">What story should the slides tell?</p>
            </div>

            {/* Target Audience */}
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Target Audience</label>
              <input
                value={targetSegment}
                onChange={e => setTargetSegment(e.target.value)}
                placeholder="e.g. health-conscious millennials, new gardeners"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 transition"
              />
            </div>

            {/* Slide Count */}
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2 block">Slide Count</label>
              <div className="flex gap-2 flex-wrap">
                {SLIDE_COUNT_OPTIONS.map(n => (
                  <button
                    key={n}
                    onClick={() => setSlideCount(n)}
                    className={`w-10 h-10 rounded-full text-sm font-bold border transition ${
                      slideCount === n ? 'bg-emerald-500 text-white border-emerald-500' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-1">3–7 slides. IG carousels with more slides tend to see stronger engagement.</p>
            </div>

            {/* Aspect Ratio */}
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2 block">Aspect Ratio</label>
              <div className="flex gap-2 flex-wrap">
                {CAROUSEL_ASPECT_RATIOS.map(ar => (
                  <button
                    key={ar.value}
                    onClick={() => setAspectRatio(ar.value)}
                    className={`border rounded-full px-4 py-1.5 text-sm transition ${
                      aspectRatio === ar.value ? 'bg-emerald-500 text-white border-emerald-500' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {ar.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Platform */}
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2 block">Platform</label>
              <div className="flex gap-2 flex-wrap">
                {([
                  { value: 'general', label: 'General' },
                  { value: 'instagram_reels', label: 'Instagram' },
                  { value: 'tiktok', label: 'TikTok' },
                  { value: 'youtube_shorts', label: 'YT Shorts' },
                ] as const).map(p => (
                  <button
                    key={p.value}
                    onClick={() => setPlatform(p.value)}
                    className={`border rounded-full px-4 py-1.5 text-sm transition ${
                      platform === p.value ? 'bg-emerald-500 text-white border-emerald-500' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Style Notes */}
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Style Notes <span className="normal-case text-slate-300">(optional)</span></label>
              <textarea
                value={styleNotes}
                onChange={e => setStyleNotes(e.target.value)}
                rows={2}
                placeholder="e.g. consistent bold typography across slides, bright green accent color"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 transition resize-none"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-between mt-8">
            <button
              onClick={() => setStep(0)}
              className="px-6 py-2.5 border border-slate-200 text-slate-600 text-sm font-bold rounded-lg hover:bg-slate-50 transition"
            >
              Back
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!step1Valid}
              className="px-6 py-2.5 bg-emerald-500 text-white text-sm font-bold rounded-lg hover:bg-emerald-600 transition disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Look & Feel (video only) ── */}
      {step === 2 && format === 'video' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
          <h3 className="text-lg font-black text-slate-800 mb-1">How should it look?</h3>
          <p className="text-xs text-slate-400 mb-6">Choose the visual style for your video ad.</p>

          <div className="space-y-6">
            {/* Pipeline selector — two cards */}
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3 block">Pipeline</label>
              <div className="grid grid-cols-2 gap-3">
                {PIPELINE_OPTIONS.map(opt => {
                  const Icon = opt.value === 'talking_head' ? User : Film;
                  const selected = pipeline === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setPipeline(opt.value as 'talking_head' | 'full_scene')}
                      className={`border-2 rounded-xl p-4 text-left transition ${
                        selected ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Icon size={16} className={selected ? 'text-emerald-600' : 'text-slate-400'} />
                        <span className={`text-sm font-bold ${selected ? 'text-emerald-700' : 'text-slate-600'}`}>{opt.label}</span>
                      </div>
                      <p className={`text-xs ${selected ? 'text-emerald-600' : 'text-slate-400'}`}>{opt.description}</p>
                      <p className={`text-xs font-bold mt-1 ${selected ? 'text-emerald-700' : 'text-slate-500'}`}>${opt.cost.toFixed(2)}/video</p>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-slate-400 mt-1">Talking Head creates a realistic face speaking your script. Full Scene generates a complete video with scenery and action.</p>
            </div>

            {/* Gender pills */}
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2 block">Gender</label>
              <div className="flex gap-2">
                {(['female', 'male'] as const).map(g => (
                  <button
                    key={g}
                    onClick={() => setActorGender(g)}
                    className={`border rounded-full px-4 py-1.5 text-sm transition ${
                      actorGender === g ? 'bg-emerald-500 text-white border-emerald-500' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {g.charAt(0).toUpperCase() + g.slice(1)}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-1">Choose the presenter's gender.</p>
            </div>

            {/* Style */}
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Style</label>
              <select
                value={actorStyle}
                onChange={e => setActorStyle(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 transition"
              >
                {ACTOR_STYLES.map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mt-1">Affects the presenter's appearance and vibe.</p>
            </div>

            {/* Aspect Ratio pills */}
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2 block">Aspect Ratio</label>
              <div className="flex gap-2 flex-wrap">
                {ASPECT_RATIOS.map(ar => (
                  <button
                    key={ar.value}
                    onClick={() => setAspectRatio(ar.value)}
                    className={`border rounded-full px-4 py-1.5 text-sm transition ${
                      aspectRatio === ar.value ? 'bg-emerald-500 text-white border-emerald-500' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {ar.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-1">Vertical for Reels & TikTok, horizontal for YouTube, square for Instagram feed.</p>
            </div>

            {/* Platform pills */}
            <div>
              <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2 block">Platform</label>
              <div className="flex gap-2 flex-wrap">
                {([
                  { value: 'general', label: 'General' },
                  { value: 'tiktok', label: 'TikTok' },
                  { value: 'instagram_reels', label: 'IG Reels' },
                  { value: 'youtube_shorts', label: 'YT Shorts' },
                ] as const).map(p => (
                  <button
                    key={p.value}
                    onClick={() => {
                      setPlatform(p.value);
                      if (p.value !== 'general' && duration === 60) setDuration(15);
                    }}
                    className={`border rounded-full px-4 py-1.5 text-sm transition ${
                      platform === p.value ? 'bg-emerald-500 text-white border-emerald-500' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {platform !== 'general' && (
                <p className="text-xs text-emerald-500 mt-1">Optimized for vertical 9:16 format</p>
              )}
            </div>

            {/* Advanced options toggle */}
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-emerald-600 transition"
            >
              <ChevronDown size={16} className={`transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
              Show advanced options
            </button>

            {showAdvanced && (
              <div className="space-y-5 pl-2 border-l-2 border-emerald-100">
                {/* Setting */}
                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Setting</label>
                  <select
                    value={setting}
                    onChange={e => setSetting(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 transition"
                  >
                    {VIDEO_SETTINGS.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-400 mt-1">Where is the scene taking place?</p>
                </div>

                {/* Lighting */}
                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Lighting</label>
                  <select
                    value={lighting}
                    onChange={e => setLighting(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 transition"
                  >
                    {VIDEO_LIGHTING.map(l => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-400 mt-1">Sets the visual mood of the scene.</p>
                </div>

                {/* Mood */}
                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Mood</label>
                  <select
                    value={mood}
                    onChange={e => setMood(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 transition"
                  >
                    {VIDEO_MOODS.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-400 mt-1">The overall atmosphere and energy.</p>
                </div>

                {/* Custom Visual Notes */}
                <div>
                  <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1.5 block">Custom Visual Notes</label>
                  <textarea
                    value={customVisualNotes}
                    onChange={e => setCustomVisualNotes(e.target.value)}
                    rows={2}
                    placeholder="e.g. holding a tray of fresh microgreens, wearing an apron"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 transition resize-none"
                  />
                  <p className="text-xs text-slate-400 mt-1">Add any extra visual direction, e.g. 'holding a tray of fresh microgreens, wearing an apron'</p>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-between mt-8">
            <button
              onClick={() => setStep(1)}
              className="px-6 py-2.5 border border-slate-200 text-slate-600 text-sm font-bold rounded-lg hover:bg-slate-50 transition"
            >
              Back
            </button>
            <button
              onClick={() => setStep(3)}
              className="px-6 py-2.5 bg-emerald-500 text-white text-sm font-bold rounded-lg hover:bg-emerald-600 transition"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Review & Generate — Video ── */}
      {step === 3 && format === 'video' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
          <h3 className="text-lg font-black text-slate-800 mb-1">Review & generate</h3>
          <p className="text-xs text-slate-400 mb-6">Check everything looks good, then generate your video.</p>

          {/* Summary grid */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 mb-8">
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Branch</span>
              <p className="text-sm text-slate-700">{branchName(branch)}</p>
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Product</span>
              <p className="text-sm text-slate-700">{productDescription.length > 100 ? `${productDescription.slice(0, 100)}...` : productDescription}</p>
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Audience</span>
              <p className="text-sm text-slate-700">{targetSegment || 'General'}</p>
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Tone</span>
              <p className="text-sm text-slate-700">{tone}</p>
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">CTA</span>
              <p className="text-sm text-slate-700">{cta}</p>
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Pipeline</span>
              <p className="text-sm text-slate-700">{pipeline === 'talking_head' ? 'Talking Head' : 'Full Scene'}</p>
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Actor</span>
              <p className="text-sm text-slate-700">{actorGender.charAt(0).toUpperCase() + actorGender.slice(1)} / {actorStyle}</p>
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Aspect Ratio</span>
              <p className="text-sm text-slate-700">{ASPECT_RATIOS.find(a => a.value === aspectRatio)?.label || aspectRatio}</p>
            </div>
            {advancedChanged && (
              <>
                {setting !== VIDEO_SETTINGS[0] && (
                  <div>
                    <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Setting</span>
                    <p className="text-sm text-slate-700">{setting}</p>
                  </div>
                )}
                {lighting !== VIDEO_LIGHTING[0] && (
                  <div>
                    <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Lighting</span>
                    <p className="text-sm text-slate-700">{lighting}</p>
                  </div>
                )}
                {mood !== VIDEO_MOODS[0] && (
                  <div>
                    <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Mood</span>
                    <p className="text-sm text-slate-700">{mood}</p>
                  </div>
                )}
                {customVisualNotes.trim() && (
                  <div className="col-span-2">
                    <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Custom Notes</span>
                    <p className="text-sm text-slate-700">{customVisualNotes}</p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Script section */}
          <div className="space-y-3 mb-8">
            <button
              onClick={handleGenerateScript}
              disabled={!productDescription || isGeneratingScript}
              className="px-5 py-2.5 bg-slate-900 text-white text-sm font-bold rounded-lg hover:bg-emerald-600 transition disabled:opacity-30 flex items-center gap-2"
            >
              {isGeneratingScript ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} className="text-emerald-400" />}
              {isGeneratingScript ? 'Generating...' : 'Generate Script with Sage'}
            </button>

            <textarea
              value={generatedScript}
              onChange={e => setGeneratedScript(e.target.value)}
              rows={6}
              placeholder="AI will write your script, or paste your own. You can edit before generating."
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 transition resize-none"
            />
            <p className="text-xs text-slate-400">{wordCount} words</p>
          </div>

          {/* Template save option */}
          <div className="mb-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={saveAsTemplate}
                onChange={e => setSaveAsTemplate(e.target.checked)}
                className="rounded border-slate-300 text-emerald-500 focus:ring-emerald-500"
              />
              <span className="text-sm text-slate-600">Save these settings as a template</span>
            </label>
            {saveAsTemplate && (
              <div className="mt-2">
                <input
                  value={newTemplateName}
                  onChange={e => setNewTemplateName(e.target.value)}
                  placeholder="e.g. ATL Reels - Casual"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 transition"
                />
                <p className="text-xs text-slate-400 mt-1">Name this template so you can reuse these settings later, e.g. 'ATL Reels - Casual'</p>
              </div>
            )}
          </div>

          {/* Cost estimate */}
          <div className="flex items-center gap-2 mb-8 text-sm">
            <DollarSign size={16} className="text-slate-400" />
            <span className="font-bold text-slate-700">Estimated cost: ~${pipelineCost.toFixed(2)}</span>
          </div>

          {/* Footer */}
          <div className="flex justify-between">
            <button
              onClick={() => setStep(2)}
              className="px-6 py-2.5 border border-slate-200 text-slate-600 text-sm font-bold rounded-lg hover:bg-slate-50 transition"
            >
              Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || !generatedScript}
              className="px-8 py-3 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white text-sm font-bold rounded-lg hover:from-emerald-700 hover:to-emerald-600 transition disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg"
            >
              {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Zap size={18} />}
              {isSubmitting ? 'Generating...' : 'Generate Video'}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Review & Generate — Static / Carousel ── */}
      {step === 3 && format !== 'video' && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
          <h3 className="text-lg font-black text-slate-800 mb-1">Review & generate</h3>
          <p className="text-xs text-slate-400 mb-6">
            {format === 'static'
              ? (staticBatchMode
                  ? "n8n writes the copy and generates each image — check your inputs, then generate the batch."
                  : "n8n writes the copy and generates the image — check your inputs, then generate.")
              : "n8n plans the slides, writes the caption, and generates each frame — check your inputs, then generate."}
          </p>

          {/* Summary grid */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 mb-8">
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Branch</span>
              <p className="text-sm text-slate-700">{branchName(branch)}</p>
            </div>
            {format === 'static' && staticBatchMode ? (
              <div className="col-span-2">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">
                  Batch — {staticBatchLinesCapped.length} image{staticBatchLinesCapped.length === 1 ? '' : 's'}
                </span>
                <ul className="mt-2 space-y-1 max-h-56 overflow-y-auto pr-2">
                  {staticBatchLinesCapped.map((line, i) => (
                    <li key={i} className="text-sm text-slate-700 flex gap-2">
                      <span className="text-slate-300 font-mono text-xs mt-0.5 flex-shrink-0">{i + 1}.</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <div>
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">{format === 'static' ? 'Message' : 'Topic'}</span>
                <p className="text-sm text-slate-700">
                  {format === 'static'
                    ? (staticMessage.length > 100 ? `${staticMessage.slice(0, 100)}...` : staticMessage)
                    : (carouselTopic.length > 100 ? `${carouselTopic.slice(0, 100)}...` : carouselTopic)}
                </p>
              </div>
            )}
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Audience</span>
              <p className="text-sm text-slate-700">{targetSegment || 'General'}</p>
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Aspect Ratio</span>
              <p className="text-sm text-slate-700">{currentAspectRatios.find(a => a.value === aspectRatio)?.label || aspectRatio}</p>
            </div>
            {format === 'carousel' && (
              <div>
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Slide Count</span>
                <p className="text-sm text-slate-700">{slideCount} slides</p>
              </div>
            )}
            {format === 'static' && (
              <div>
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Setting</span>
                <p className="text-sm text-slate-700">{setting}</p>
              </div>
            )}
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Platform</span>
              <p className="text-sm text-slate-700">{platform === 'general' ? 'General' : platform}</p>
            </div>
            {styleNotes.trim() && (
              <div className="col-span-2">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Style Notes</span>
                <p className="text-sm text-slate-700">{styleNotes}</p>
              </div>
            )}
          </div>

          {/* Cost / speed note */}
          <div className="flex items-center gap-2 mb-8 text-sm bg-emerald-50 border border-emerald-100 rounded-lg px-4 py-3">
            <DollarSign size={16} className="text-emerald-500" />
            <span className="font-bold text-emerald-700">
              {format === 'static'
                ? (staticBatchMode
                    ? `${staticBatchLinesCapped.length} images will be generated in sequence, staggered a fraction of a second apart to stay within provider rate limits.`
                    : 'Static images typically generate in seconds for pennies per image.')
                : `Carousels typically take a minute or two — ${slideCount} slides generated in sequence.`}
            </span>
          </div>

          {/* Footer */}
          <div className="flex justify-between">
            <button
              onClick={() => setStep(1)}
              className="px-6 py-2.5 border border-slate-200 text-slate-600 text-sm font-bold rounded-lg hover:bg-slate-50 transition"
            >
              Back
            </button>
            <button
              onClick={format === 'static' ? (staticBatchMode ? handleSubmitStaticBatch : handleSubmitStatic) : handleSubmitCarousel}
              disabled={isSubmitting || !step1Valid}
              className="px-8 py-3 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white text-sm font-bold rounded-lg hover:from-emerald-700 hover:to-emerald-600 transition disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2 shadow-lg"
            >
              {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Zap size={18} />}
              {isSubmitting
                ? (format === 'static' && staticBatchMode ? 'Queuing…' : 'Generating...')
                : format === 'static'
                ? (staticBatchMode ? `Generate ${staticBatchLinesCapped.length} Images` : 'Generate Static Ad')
                : 'Generate Carousel'}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 4: Progress tracker ── */}
      {step === 4 && (() => {
        const job = trackedJob;
        const fmt = job?.format || format;
        const stages = stagesForFormat(fmt);
        const status = job?.status;
        const isFailed = status === 'failed' || status === 'cancelled';
        const isDone = status === 'completed';
        const isReview = status === 'awaiting_approval';
        const stageIndex = isDone ? stages.length : stages.findIndex(s => s.key === status);
        const media = job?.format === 'carousel' && job?.media_urls?.length
          ? job.media_urls
          : [job?.frame_url || job?.media_urls?.[0]].filter(Boolean) as string[];

        return (
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8 space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-black text-slate-800 mb-1">
                  {isFailed ? 'Generation failed'
                    : isDone ? 'Your ad is ready'
                    : isReview ? 'Ready for your review'
                    : `Creating your ${formatLabel(fmt).toLowerCase()} ad`}
                </h3>
                <p className="text-xs text-slate-400">
                  {isFailed ? 'Nothing was published. Your inputs are still filled in below.'
                    : isDone ? 'Approved and saved to your library.'
                    : isReview ? 'Check the image and caption, then approve.'
                    : 'This usually takes 30–90 seconds. You can leave this page — it keeps running.'}
                </p>
              </div>
              {job && (
                <div className="flex flex-col items-end gap-1.5">
                  <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${statusChipClasses(job.status)}`}>
                    {job.status.replace(/_/g, ' ')}
                  </span>
                  {job.revision_of && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-400">
                      <GitBranch size={10} /> Revision
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Stage tracker */}
            {!isFailed && (
              <div>
                <div className="flex items-center gap-0 mb-3">
                  {stages.map((s, i) => {
                    const reached = stageIndex >= 0 && i <= stageIndex;
                    const current = stageIndex === i && !isDone;
                    return (
                      <React.Fragment key={s.key}>
                        {i > 0 && <div className={`flex-1 h-0.5 ${reached ? 'bg-emerald-500' : 'bg-slate-200'}`} />}
                        <div className="flex flex-col items-center gap-1.5 px-1">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center transition ${
                            current ? 'bg-emerald-500 text-white' :
                            reached ? 'bg-emerald-500 text-white' :
                            'bg-slate-200 text-slate-400'
                          }`}>
                            {current ? <Loader2 size={13} className="animate-spin" />
                              : reached ? <Check size={13} />
                              : <span className="text-[10px] font-bold">{i + 1}</span>}
                          </div>
                          <span className={`text-[10px] font-bold text-center leading-tight ${reached ? 'text-emerald-600' : 'text-slate-400'}`}>
                            {s.label}
                          </span>
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                    style={{ width: `${isDone ? 100 : Math.max(5, job?.progress ?? 5)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Waiting for the row to appear */}
            {!job && (
              <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-500">
                <Loader2 size={16} className="animate-spin text-emerald-500" />
                Handing off to the generation pipeline…
              </div>
            )}

            {/* Failure */}
            {isFailed && (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-4">
                <p className="text-sm font-bold text-rose-700 mb-1">
                  {status === 'cancelled' ? 'This job was cancelled.' : 'The pipeline reported an error'}
                </p>
                {job?.error_message && (
                  <p className="text-xs text-rose-600 font-mono break-words">{job.error_message}</p>
                )}
              </div>
            )}

            {/* Media preview — static ads get the real-text overlay editor over the
                clean generated image; carousels/video keep the plain preview. */}
            {job && job.format === 'static' && job.frame_url && (isReview || isDone) ? (() => {
              const copy = parseJobCopy(job);
              const overlayConfig = getOverlayConfig(job);
              const activeHeadline = overlayConfig.layers[0]?.text;
              const canAddSubhead = !!copy.subhead && overlayConfig.layers.length === 1;
              return (
                <div className="space-y-3">
                  {copy.headline_variants.length > 1 && (
                    <div className="max-w-sm space-y-1.5 bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block">Headline options</span>
                      <p className="text-[10px] text-slate-400">
                        Free to swap — text is composited onto the image, not regenerated.
                      </p>
                      <div className="flex flex-col gap-1.5 mt-1">
                        {copy.headline_variants.map((variant, i) => {
                          const active = variant === activeHeadline;
                          return (
                            <button
                              key={i}
                              type="button"
                              onClick={() => applyHeadlineVariant(job, variant)}
                              className={`text-left border rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                                active
                                  ? 'bg-emerald-500 text-white border-emerald-500'
                                  : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                              }`}
                            >
                              {variant}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <TextOverlayEditor
                    imageUrl={job.frame_url}
                    config={overlayConfig}
                    onChange={c => setOverlayConfigs(prev => ({ ...prev, [job.id]: c }))}
                    brandColors={{
                      primary: brandInfoForJob(job)?.primary_color,
                      secondary: brandInfoForJob(job)?.secondary_color,
                      accent: brandInfoForJob(job)?.accent_color,
                    }}
                    brandFont={brandInfoForJob(job)?.font_family || 'sans-serif'}
                    className="rounded-xl border border-slate-200"
                  />
                  {canAddSubhead && (
                    <button
                      type="button"
                      onClick={() => handleAddSubhead(job, copy.subhead!)}
                      className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-50 transition"
                    >
                      <Plus size={13} /> Add subhead
                    </button>
                  )}
                  {isReview && (
                    <div className="flex justify-end">
                      <button
                        onClick={() => handleSaveLayout(job)}
                        disabled={savingLayoutJobId === job.id}
                        className="px-4 py-2 border border-slate-200 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-50 transition disabled:opacity-30 flex items-center gap-2"
                      >
                        {savingLayoutJobId === job.id ? <Loader2 size={13} className="animate-spin" /> : null}
                        {savingLayoutJobId === job.id ? 'Saving…' : 'Save layout'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })() : media.length > 0 && (
              <div className={media.length > 1 ? 'flex gap-2 overflow-x-auto pb-1' : ''}>
                {media.map((url, i) => (
                  <img
                    key={i}
                    src={url}
                    alt={media.length > 1 ? `Slide ${i + 1}` : 'Generated ad'}
                    className={media.length > 1
                      ? 'w-32 h-32 rounded-lg object-cover border border-slate-200 flex-shrink-0'
                      : 'w-full max-w-sm rounded-xl border border-slate-200'}
                  />
                ))}
              </div>
            )}
            {job?.video_url && (
              <video src={job.video_url} controls className="w-full max-w-sm rounded-xl border border-slate-200" />
            )}

            {/* Approved success state (static / carousel) */}
            {job && isDone && (job.format === 'static' || job.format === 'carousel') && (
              <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                <div className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center flex-shrink-0">
                  <Check size={16} />
                </div>
                <div>
                  <p className="text-sm font-bold text-emerald-700">Approved — ready to publish</p>
                  <p className="text-xs text-emerald-600 mt-0.5">
                    Download it, publish straight to Instagram, or schedule it for later — head to the Creative Library below.
                  </p>
                </div>
              </div>
            )}

            {/* Caption + actions for review / done */}
            {job && (isReview || isDone) && (job.format === 'static' || job.format === 'carousel') && (
              <div>
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 block">Caption</label>
                <textarea
                  value={getCaptionDraft(job)}
                  onChange={e => setCaptionDrafts(prev => ({ ...prev, [job.id]: e.target.value }))}
                  rows={3}
                  placeholder="Generated caption will appear here — edit as needed"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 transition resize-none"
                />
              </div>
            )}

            {/* Revision notes, shown while a revision job is in review */}
            {job && job.revision_of && job.revision_notes && isReview && (
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 block">Revision Notes</span>
                <blockquote className="border-l-4 border-amber-400 pl-4 py-2 bg-amber-50/60 rounded-r-lg text-sm text-slate-600 italic whitespace-pre-wrap">
                  {job.revision_notes}
                </blockquote>
              </div>
            )}

            {/* Regenerate: what should change? */}
            {job && isReview && regenerateOpenJobId === job.id && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block">What should change?</label>
                <textarea
                  value={regenerateNotesDraft[job.id] ?? ''}
                  onChange={e => setRegenerateNotesDraft(prev => ({ ...prev, [job.id]: e.target.value }))}
                  rows={2}
                  placeholder="e.g. Make the headline smaller, warmer lighting"
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 transition resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={() => handleRegenerate(job)}
                    disabled={isRegenerating === job.id}
                    className="px-4 py-2 bg-emerald-500 text-white text-xs font-bold rounded-lg hover:bg-emerald-600 transition disabled:opacity-30 flex items-center gap-2"
                  >
                    {isRegenerating === job.id ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                    {isRegenerating === job.id ? 'Regenerating…' : 'Confirm regenerate'}
                  </button>
                  <button
                    onClick={() => setRegenerateOpenJobId(null)}
                    disabled={isRegenerating === job.id}
                    className="px-4 py-2 border border-slate-200 text-slate-500 text-xs font-bold rounded-lg hover:bg-slate-50 transition disabled:opacity-30"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Discard: confirm step */}
            {job && isReview && discardConfirmJobId === job.id && (
              <div className="flex items-center gap-3 bg-rose-50 border border-rose-200 rounded-xl p-4">
                <span className="text-sm font-bold text-rose-700 flex-1">Discard this creative? This can't be undone.</span>
                <button
                  onClick={() => handleDiscard(job)}
                  disabled={isDiscarding === job.id}
                  className="px-4 py-2 bg-rose-500 text-white text-xs font-bold rounded-lg hover:bg-rose-600 transition disabled:opacity-30 flex items-center gap-2"
                >
                  {isDiscarding === job.id ? <Loader2 size={13} className="animate-spin" /> : null}
                  {isDiscarding === job.id ? 'Discarding…' : 'Yes, discard'}
                </button>
                <button
                  onClick={() => setDiscardConfirmJobId(null)}
                  disabled={isDiscarding === job.id}
                  className="px-4 py-2 border border-rose-200 text-rose-500 text-xs font-bold rounded-lg hover:bg-rose-100 transition disabled:opacity-30"
                >
                  Cancel
                </button>
              </div>
            )}

            {/* Footer actions */}
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-100">
              {job && isReview && (job.format === 'static' || job.format === 'carousel') && (
                <button
                  onClick={() => handleApprove(job)}
                  disabled={approvingJobId === job.id}
                  className="px-5 py-2.5 bg-emerald-500 text-white text-sm font-bold rounded-lg hover:bg-emerald-600 transition disabled:opacity-30 flex items-center gap-2"
                >
                  {approvingJobId === job.id ? <Loader2 size={15} className="animate-spin" /> : <ThumbsUp size={15} />}
                  {approvingJobId === job.id
                    ? (approvalPhase[job.id] === 'compositing' ? 'Rendering text…' : 'Approving…')
                    : 'Approve'}
                </button>
              )}
              {job && isReview && job.format !== 'static' && job.format !== 'carousel' && (
                <button
                  onClick={() => handleApproveAndRender(job)}
                  disabled={approvingJobId === job.id}
                  className="px-5 py-2.5 bg-emerald-500 text-white text-sm font-bold rounded-lg hover:bg-emerald-600 transition disabled:opacity-30 flex items-center gap-2"
                >
                  {approvingJobId === job.id ? <Loader2 size={15} className="animate-spin" /> : <Zap size={15} />}
                  {approvingJobId === job.id ? 'Starting…' : 'Approve & Render'}
                </button>
              )}
              {job && isReview && (
                <button
                  onClick={() => { setRegenerateOpenJobId(prev => prev === job.id ? null : job.id); setDiscardConfirmJobId(null); }}
                  className="px-5 py-2.5 border border-slate-200 text-slate-600 text-sm font-bold rounded-lg hover:bg-slate-50 transition flex items-center gap-2"
                >
                  <RefreshCw size={15} /> Regenerate
                </button>
              )}
              {job && isReview && (
                <button
                  onClick={() => { setDiscardConfirmJobId(prev => prev === job.id ? null : job.id); setRegenerateOpenJobId(null); }}
                  className="px-4 py-2.5 border border-slate-200 text-slate-400 hover:text-rose-500 hover:border-rose-200 text-sm font-bold rounded-lg transition flex items-center gap-2"
                >
                  <Trash2 size={15} /> Discard
                </button>
              )}
              {job && isDone && (job.format === 'static' || job.format === 'carousel') && (
                <button
                  onClick={() => handlePublish(job)}
                  disabled={publishingJobId === job.id || !getCaptionDraft(job).trim()}
                  title={!getCaptionDraft(job).trim() ? 'Add a caption first' : 'Publish to Instagram'}
                  className="px-5 py-2.5 bg-slate-800 text-white text-sm font-bold rounded-lg hover:bg-slate-900 transition disabled:opacity-30 flex items-center gap-2"
                >
                  {publishingJobId === job.id ? <Loader2 size={15} className="animate-spin" /> : <Instagram size={15} />}
                  {publishingJobId === job.id ? 'Publishing…' : 'Publish to Instagram'}
                </button>
              )}
              {job && isDone && (job.format === 'static' || job.format === 'carousel') && (
                <button
                  onClick={() => setAdExportJobId(job.id)}
                  className="px-5 py-2.5 border border-slate-200 text-slate-700 text-sm font-bold rounded-lg hover:bg-slate-50 transition flex items-center gap-2"
                >
                  <Megaphone size={15} /> Export for Meta Ads
                </button>
              )}
              {isFailed && (
                <button
                  onClick={() => setStep(3)}
                  className="px-5 py-2.5 bg-emerald-500 text-white text-sm font-bold rounded-lg hover:bg-emerald-600 transition flex items-center gap-2"
                >
                  <RefreshCw size={15} /> Back to review &amp; retry
                </button>
              )}
              {job && !isFailed && !isDone && !isReview && (
                <button
                  onClick={() => handleCancel(job.id)}
                  className="px-4 py-2.5 border border-slate-200 text-slate-500 text-sm font-bold rounded-lg hover:bg-slate-50 transition"
                >
                  Cancel job
                </button>
              )}
              <button
                onClick={startAnother}
                className="px-4 py-2.5 border border-slate-200 text-slate-600 text-sm font-bold rounded-lg hover:bg-slate-50 transition"
              >
                Create another
              </button>
            </div>
          </div>
        );
      })()}

      {/* ── Needs Your Review ── */}
      {awaitingApprovalJobs.length > 0 && (
        <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
            </span>
            <h3 className="text-sm font-black uppercase tracking-tight text-amber-800">
              Needs Your Review ({awaitingApprovalJobs.length})
            </h3>
          </div>

          <div className="grid gap-4">
            {awaitingApprovalJobs.map(job => {
              const isStaticOrCarousel = job.format === 'static' || job.format === 'carousel';
              const isApproving = approvingJobId === job.id;
              return (
                <div key={job.id} className="bg-white rounded-xl border border-amber-200 p-4 space-y-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${formatBadgeClasses(job.format)}`}>
                      <FormatIcon format={job.format} />
                      {formatLabel(job.format)}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-200 text-slate-600">
                      {formatBranchName(job.branch)}
                    </span>
                    {job.revision_of && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-400">
                        <GitBranch size={10} /> Revision
                      </span>
                    )}
                  </div>

                  {/* Preview */}
                  {job.format === 'carousel' && job.media_urls?.length ? (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {job.media_urls.map((url, i) => (
                        <img key={i} src={url} alt={`Slide ${i + 1}`} className="w-20 h-20 rounded-lg object-cover border border-slate-200 flex-shrink-0" />
                      ))}
                    </div>
                  ) : job.format === 'static' && job.frame_url ? (() => {
                    const copy = parseJobCopy(job);
                    const overlayConfig = getOverlayConfig(job);
                    const activeHeadline = overlayConfig.layers[0]?.text;
                    const canAddSubheadHere = !!copy.subhead && overlayConfig.layers.length === 1;
                    return (
                      <div className="space-y-3">
                        {copy.headline_variants.length > 1 && (
                          <div className="max-w-sm space-y-1.5 bg-slate-50 border border-slate-200 rounded-xl p-3">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block">Headline options</span>
                            <p className="text-[10px] text-slate-400">
                              Free to swap — text is composited onto the image, not regenerated.
                            </p>
                            <div className="flex flex-col gap-1.5 mt-1">
                              {copy.headline_variants.map((variant, i) => {
                                const active = variant === activeHeadline;
                                return (
                                  <button
                                    key={i}
                                    type="button"
                                    onClick={() => applyHeadlineVariant(job, variant)}
                                    className={`text-left border rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                                      active
                                        ? 'bg-emerald-500 text-white border-emerald-500'
                                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                                    }`}
                                  >
                                    {variant}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        <TextOverlayEditor
                          imageUrl={job.frame_url}
                          config={overlayConfig}
                          onChange={c => setOverlayConfigs(prev => ({ ...prev, [job.id]: c }))}
                          brandColors={{
                            primary: brandInfoForJob(job)?.primary_color,
                            secondary: brandInfoForJob(job)?.secondary_color,
                            accent: brandInfoForJob(job)?.accent_color,
                          }}
                          brandFont={brandInfoForJob(job)?.font_family || 'sans-serif'}
                          className="rounded-xl border border-slate-200"
                        />
                        <div className="flex items-center justify-between gap-2">
                          {canAddSubheadHere ? (
                            <button
                              type="button"
                              onClick={() => handleAddSubhead(job, copy.subhead!)}
                              className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-50 transition"
                            >
                              <Plus size={13} /> Add subhead
                            </button>
                          ) : <span />}
                          <button
                            onClick={() => handleSaveLayout(job)}
                            disabled={savingLayoutJobId === job.id}
                            className="px-4 py-2 border border-slate-200 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-50 transition disabled:opacity-30 flex items-center gap-2"
                          >
                            {savingLayoutJobId === job.id ? <Loader2 size={13} className="animate-spin" /> : null}
                            {savingLayoutJobId === job.id ? 'Saving…' : 'Save layout'}
                          </button>
                        </div>
                      </div>
                    );
                  })() : job.frame_url ? (
                    <img src={job.frame_url} alt="Generated frame" className="w-full h-40 rounded-lg object-cover border border-slate-200" />
                  ) : (
                    <div className="w-full h-40 rounded-lg bg-slate-100 flex items-center justify-center">
                      <FormatIcon format={job.format} size={24} className="text-slate-300" />
                    </div>
                  )}

                  {/* Caption (static / carousel) */}
                  {isStaticOrCarousel && (
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1 block">Caption</label>
                      <textarea
                        value={getCaptionDraft(job)}
                        onChange={e => setCaptionDrafts(prev => ({ ...prev, [job.id]: e.target.value }))}
                        rows={2}
                        placeholder="Generated caption will appear here — edit as needed"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 transition resize-none"
                      />
                    </div>
                  )}

                  {/* Revision notes */}
                  {job.revision_of && job.revision_notes && (
                    <blockquote className="border-l-4 border-amber-400 pl-3 py-1.5 bg-amber-50/60 rounded-r-lg text-xs text-slate-600 italic whitespace-pre-wrap">
                      {job.revision_notes}
                    </blockquote>
                  )}

                  {/* Regenerate: what should change? */}
                  {regenerateOpenJobId === job.id && (
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block">What should change?</label>
                      <textarea
                        value={regenerateNotesDraft[job.id] ?? ''}
                        onChange={e => setRegenerateNotesDraft(prev => ({ ...prev, [job.id]: e.target.value }))}
                        rows={2}
                        placeholder="e.g. Make the headline smaller, warmer lighting"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:border-emerald-500 transition resize-none"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleRegenerate(job)}
                          disabled={isRegenerating === job.id}
                          className="flex-1 px-3 py-1.5 bg-emerald-500 text-white text-xs font-bold rounded-lg hover:bg-emerald-600 transition disabled:opacity-30 flex items-center justify-center gap-1.5"
                        >
                          {isRegenerating === job.id ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                          {isRegenerating === job.id ? 'Regenerating…' : 'Confirm regenerate'}
                        </button>
                        <button
                          onClick={() => setRegenerateOpenJobId(null)}
                          disabled={isRegenerating === job.id}
                          className="px-3 py-1.5 border border-slate-200 text-slate-500 text-xs font-bold rounded-lg hover:bg-slate-50 transition disabled:opacity-30"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Discard: confirm step */}
                  {discardConfirmJobId === job.id && (
                    <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-lg p-2">
                      <span className="text-xs text-rose-700 font-bold flex-1">Discard this creative?</span>
                      <button
                        onClick={() => handleDiscard(job)}
                        disabled={isDiscarding === job.id}
                        className="px-2.5 py-1 text-[11px] font-bold bg-rose-500 text-white rounded-lg hover:bg-rose-600 transition disabled:opacity-40"
                      >
                        {isDiscarding === job.id ? 'Discarding…' : 'Yes, discard'}
                      </button>
                      <button
                        onClick={() => setDiscardConfirmJobId(null)}
                        disabled={isDiscarding === job.id}
                        className="px-2.5 py-1 text-[11px] font-bold bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200 transition"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {/* Actions */}
                  {regenerateOpenJobId !== job.id && discardConfirmJobId !== job.id && (
                    <div className="flex gap-2">
                      {isStaticOrCarousel ? (
                        <button
                          onClick={() => handleApprove(job)}
                          disabled={isApproving}
                          className="flex-1 px-4 py-2 bg-emerald-500 text-white text-xs font-bold rounded-lg hover:bg-emerald-600 transition disabled:opacity-30 flex items-center justify-center gap-2"
                        >
                          {isApproving ? <Loader2 size={14} className="animate-spin" /> : <ThumbsUp size={14} />}
                          {isApproving
                            ? (approvalPhase[job.id] === 'compositing' ? 'Rendering text…' : 'Approving...')
                            : 'Approve'}
                        </button>
                      ) : (
                        <button
                          onClick={() => handleApproveAndRender(job)}
                          disabled={isApproving}
                          className="flex-1 px-4 py-2 bg-emerald-500 text-white text-xs font-bold rounded-lg hover:bg-emerald-600 transition disabled:opacity-30 flex items-center justify-center gap-2"
                        >
                          {isApproving ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                          {isApproving ? 'Starting...' : 'Approve & Render'}
                        </button>
                      )}
                      <button
                        onClick={() => setRegenerateOpenJobId(job.id)}
                        title="Regenerate with changes"
                        className="px-3 py-2 border border-slate-200 text-slate-600 text-xs font-bold rounded-lg hover:bg-slate-50 transition flex items-center justify-center"
                      >
                        <RefreshCw size={14} />
                      </button>
                      <button
                        onClick={() => setDiscardConfirmJobId(job.id)}
                        title="Discard"
                        className="px-3 py-2 border border-slate-200 text-slate-400 hover:text-rose-500 hover:border-rose-200 text-xs font-bold rounded-lg transition flex items-center justify-center"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Video Library ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Video size={20} className="text-emerald-600" />
              <span className="text-sm font-black text-slate-800 uppercase tracking-tight">Creative Library</span>
              {activeCount > 0 && (
                <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-black rounded-full uppercase tracking-wider animate-pulse">
                  {activeCount} processing
                </span>
              )}
              <span className="text-xs text-slate-400">{jobs.length} total</span>
            </div>
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition disabled:opacity-30"
            >
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>

          {/* Filter pills */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-2">
              {(['all', 'active', 'completed', 'failed'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setStatusFilter(f)}
                  className={`px-3 py-1 text-xs font-bold rounded-full transition ${
                    statusFilter === f
                      ? 'bg-emerald-500 text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)} ({filterCounts[f]})
                </button>
              ))}
            </div>
            <div className="w-px h-4 bg-slate-200 hidden sm:block" />
            <div className="flex gap-2">
              {(['all', 'video', 'static', 'carousel'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFormatFilter(f)}
                  className={`flex items-center gap-1 px-3 py-1 text-xs font-bold rounded-full transition ${
                    formatFilter === f
                      ? 'bg-slate-800 text-white'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {f !== 'all' && <FormatIcon format={f as VideoAdFormat} size={11} />}
                  {f.charAt(0).toUpperCase() + f.slice(1)} ({formatCounts[f]})
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Table or empty state */}
        {filteredJobs.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Film size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-bold text-sm">
              {jobs.length === 0 ? 'No ads yet' : 'No ads match this filter'}
            </p>
            <p className="text-xs mt-1">
              {jobs.length === 0
                ? 'Configure and submit your first job above'
                : 'Try a different filter or refresh'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="w-8 px-2 py-3" />
                  <th className="text-left text-[10px] font-black uppercase tracking-widest text-slate-400 px-6 py-3 w-32">Preview</th>
                  <th className="text-left text-[10px] font-black uppercase tracking-widest text-slate-400 px-4 py-3">Details</th>
                  <th className="text-left text-[10px] font-black uppercase tracking-widest text-slate-400 px-4 py-3 w-36">Status</th>
                  <th className="text-left text-[10px] font-black uppercase tracking-widest text-slate-400 px-4 py-3 w-28">Created</th>
                  <th className="text-right text-[10px] font-black uppercase tracking-widest text-slate-400 px-4 py-3 w-20">Cost</th>
                  <th className="text-right text-[10px] font-black uppercase tracking-widest text-slate-400 px-6 py-3 w-32">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedJobs.map(job => {
                  const currentStage = VIDEO_AD_STAGES.find(s => s.key === job.status);
                  const thumbnailSrc = job.composite_url || job.thumbnail_url || job.frame_url || job.face_image_url;
                  const createdDate = new Date(job.created_at);
                  const isExpanded = expandedJobId === job.id;
                  const completedDate = job.completed_at ? new Date(job.completed_at) : null;
                  const voiceLabel = job.voice_id ? (VOICE_NAMES[job.voice_id] || job.voice_id) : null;
                  const isPublishable = job.status === 'completed' && (job.format === 'static' || job.format === 'carousel');
                  const isPublishing = publishingJobId === job.id;

                  return (
                    <React.Fragment key={job.id}>
                    <tr
                      className="border-b border-slate-50 hover:bg-slate-50/50 transition group cursor-pointer"
                      onClick={() => setExpandedJobId(prev => prev === job.id ? null : job.id)}
                    >
                      {/* Expand toggle */}
                      <td className="px-2 py-3 text-center">
                        {isExpanded
                          ? <ChevronUp size={14} className="text-emerald-500 mx-auto" />
                          : <ChevronDown size={14} className="text-slate-300 group-hover:text-slate-500 mx-auto transition" />
                        }
                      </td>

                      {/* Thumbnail */}
                      <td className="px-6 py-3">
                        {job.format === 'carousel' && job.media_urls?.length ? (
                          <div className="flex items-center gap-1.5">
                            <div className="flex -space-x-2">
                              {job.media_urls.slice(0, 3).map((url, i) => (
                                <img
                                  key={i}
                                  src={url}
                                  alt=""
                                  className="w-10 h-10 rounded-lg object-cover border-2 border-white shadow-sm"
                                  style={{ zIndex: 3 - i }}
                                />
                              ))}
                            </div>
                            <span className="text-[10px] font-black bg-slate-200 text-slate-600 rounded-full px-1.5 py-0.5">
                              {job.media_urls.length}
                            </span>
                          </div>
                        ) : thumbnailSrc ? (
                          <img src={thumbnailSrc} alt="" className="w-14 h-14 rounded-lg object-cover border border-slate-200" />
                        ) : (
                          <div className="w-14 h-14 rounded-lg bg-slate-100 flex items-center justify-center">
                            <FormatIcon format={job.format} size={18} className="text-slate-300" />
                          </div>
                        )}
                      </td>

                      {/* Details */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${formatBadgeClasses(job.format)}`}>
                            <FormatIcon format={job.format} />
                            {formatLabel(job.format)}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-200 text-slate-600">
                            {formatBranchName(job.branch)}
                          </span>
                          {job.platform && job.platform !== 'general' && (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              job.platform === 'tiktok' ? 'bg-pink-100 text-pink-600' :
                              job.platform === 'instagram_reels' ? 'bg-purple-100 text-purple-600' :
                              job.platform === 'youtube_shorts' ? 'bg-red-100 text-red-600' :
                              'bg-slate-100 text-slate-500'
                            }`}>
                              {job.platform === 'tiktok' ? 'TikTok' :
                               job.platform === 'instagram_reels' ? 'IG Reels' :
                               job.platform === 'youtube_shorts' ? 'YT Shorts' :
                               job.platform}
                            </span>
                          )}
                          {job.target_segment && (
                            <span className="flex items-center gap-1 text-[10px] text-slate-400">
                              <Target size={10} />{job.target_segment}
                            </span>
                          )}
                          {job.revision_of && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-400">
                              <GitBranch size={10} /> Revision
                            </span>
                          )}
                        </div>
                        {(job.script || job.caption) && (
                          <p className="text-xs text-slate-500 truncate max-w-xs" title={job.script || job.caption}>
                            {(job.script || job.caption || '').length > 80 ? `${(job.script || job.caption)!.slice(0, 80)}...` : (job.script || job.caption)}
                          </p>
                        )}
                        <span className="text-[10px] font-mono text-slate-300">{job.id.slice(0, 12)}</span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${statusChipClasses(job.status)}`}>
                          {job.status === 'completed' && <Check size={10} />}
                          {currentStage?.label || job.status}
                        </span>
                        {!TERMINAL_STATUSES.includes(job.status) && job.status !== 'awaiting_approval' && (
                          <div className="mt-1.5">
                            <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden w-24">
                              <div
                                className="h-full bg-emerald-400 rounded-full animate-pulse transition-all duration-500"
                                style={{ width: `${job.progress}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-slate-400 mt-0.5 block">{job.progress}%</span>
                          </div>
                        )}
                        {job.status === 'failed' && job.error_message && (
                          <p className="text-[10px] text-rose-400 mt-1 truncate max-w-[180px]" title={job.error_message}>
                            {job.error_message}
                          </p>
                        )}
                      </td>

                      {/* Created */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 text-xs text-slate-500">
                          <Clock size={12} className="text-slate-400" />
                          <span>{createdDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                        </div>
                        <span className="text-[10px] text-slate-400">
                          {createdDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                        </span>
                      </td>

                      {/* Cost */}
                      <td className="px-4 py-3 text-right">
                        {job.cost_estimate != null ? (
                          <span className="text-xs font-bold text-slate-600">${Number(job.cost_estimate).toFixed(2)}</span>
                        ) : (
                          <span className="text-xs text-slate-300">—</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-3 text-right" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {job.status === 'completed' && job.format !== 'static' && job.format !== 'carousel' && job.video_url && (
                            <>
                              <a
                                href={job.video_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                                title="Play video"
                              >
                                <Play size={14} />
                              </a>
                              <a
                                href={job.video_url}
                                download
                                className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition"
                                title="Download video"
                              >
                                <Download size={14} />
                              </a>
                              {job.publish_status === 'scheduled' && job.scheduled_for ? (
                                <span
                                  className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-[10px] font-bold"
                                  title={`Scheduled for ${new Date(job.scheduled_for).toLocaleString()}`}
                                >
                                  <CalendarClock size={12} />
                                  {new Date(job.scheduled_for).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </span>
                              ) : (
                                <button
                                  onClick={() => { setSchedulingJobId(job.id); setScheduleDateTime(''); }}
                                  className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                                  title="Schedule video"
                                >
                                  <CalendarClock size={14} />
                                </button>
                              )}
                            </>
                          )}
                          {job.status === 'completed' && (job.format === 'static' || job.format === 'carousel') && (job.frame_url || job.media_urls?.length) && (
                            <a
                              href={job.format === 'carousel' ? (job.media_urls?.[0] || job.frame_url || '') : publishableImageUrl(job)}
                              download
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition"
                              title={job.format === 'carousel' ? 'Download first slide' : 'Download image'}
                            >
                              <Download size={14} />
                            </a>
                          )}
                          {job.status === 'completed' && (job.format === 'static' || job.format === 'carousel') && (
                            <button
                              onClick={() => setAdExportJobId(job.id)}
                              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
                              title="Export for Meta Ads"
                            >
                              <Megaphone size={14} />
                            </button>
                          )}
                          {job.status === 'completed' && (job.format === 'static' || job.format === 'carousel') && (
                            job.publish_status === 'scheduled' && job.scheduled_for ? (
                              <span
                                className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-[10px] font-bold"
                                title={`Scheduled for ${new Date(job.scheduled_for).toLocaleString()}`}
                              >
                                <CalendarClock size={12} />
                                {new Date(job.scheduled_for).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </span>
                            ) : (
                              <button
                                onClick={() => { setSchedulingJobId(job.id); setScheduleDateTime(''); }}
                                className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                                title={`Schedule ${formatLabel(job.format).toLowerCase()}`}
                              >
                                <CalendarClock size={14} />
                              </button>
                            )
                          )}
                          {isPublishable && (
                            job.publish_status === 'published' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 rounded-lg text-[10px] font-bold">
                                <Check size={11} /> Published
                              </span>
                            ) : (
                              <button
                                onClick={() => {
                                  setPublishDraftJobId(prev => prev === job.id ? null : job.id);
                                  setCaptionDrafts(prev => prev[job.id] !== undefined ? prev : { ...prev, [job.id]: job.caption || '' });
                                }}
                                disabled={job.format === 'carousel' ? !job.media_urls?.length : !publishableImageUrl(job)}
                                title={(job.format === 'carousel' ? !job.media_urls?.length : !publishableImageUrl(job)) ? 'No media to publish' : 'Publish to Instagram'}
                                className="p-1.5 text-slate-400 hover:text-pink-600 hover:bg-pink-50 rounded-lg transition disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                <Instagram size={14} />
                              </button>
                            )
                          )}
                          {!TERMINAL_STATUSES.includes(job.status) && (
                            <button
                              onClick={() => handleCancel(job.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition"
                              title="Cancel job"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                        {/* Inline schedule form */}
                        {schedulingJobId === job.id && (
                          <div className="mt-2 flex items-center gap-2 justify-end">
                            <input
                              type="datetime-local"
                              value={scheduleDateTime}
                              onChange={e => setScheduleDateTime(e.target.value)}
                              className="px-2 py-1 text-xs border border-slate-200 rounded-lg focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400 outline-none"
                              min={new Date().toISOString().slice(0, 16)}
                            />
                            <button
                              onClick={() => handleSchedule(job)}
                              disabled={!scheduleDateTime || isScheduling}
                              className="px-2.5 py-1 text-[11px] font-bold bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {isScheduling ? 'Scheduling…' : 'Confirm'}
                            </button>
                            <button
                              onClick={() => { setSchedulingJobId(null); setScheduleDateTime(''); }}
                              className="px-2.5 py-1 text-[11px] font-bold bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200 transition"
                            >
                              Cancel
                            </button>
                          </div>
                        )}
                        {/* Inline publish form */}
                        {publishDraftJobId === job.id && (
                          <div className="mt-2 w-72 ml-auto text-left bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 block">Caption</label>
                            <textarea
                              value={getCaptionDraft(job)}
                              onChange={e => setCaptionDrafts(prev => ({ ...prev, [job.id]: e.target.value }))}
                              rows={2}
                              placeholder="Write a caption before publishing..."
                              className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-emerald-500 transition resize-none"
                            />
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => setPublishDraftJobId(null)}
                                className="px-2.5 py-1 text-[11px] font-bold bg-slate-100 text-slate-500 rounded-lg hover:bg-slate-200 transition"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handlePublish(job)}
                                disabled={isPublishing || !getCaptionDraft(job).trim()}
                                title={!getCaptionDraft(job).trim() ? 'Add a caption before publishing' : 'Publish to Instagram'}
                                className="px-2.5 py-1 text-[11px] font-bold bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1"
                              >
                                {isPublishing ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                                {isPublishing ? 'Publishing…' : 'Publish'}
                              </button>
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>

                    {/* ── Expanded detail panel ── */}
                    {isExpanded && (
                      <tr>
                        <td colSpan={7} className="px-0 py-0 border-b border-slate-100">
                          <div
                            className="bg-slate-50 mx-4 mb-4 mt-1 rounded-xl p-5 border border-slate-200/60"
                            style={{ animation: 'expandDown 200ms ease-out' }}
                          >
                            <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                              {/* Branch */}
                              <div>
                                <span className="text-xs uppercase tracking-wider text-slate-400 block mb-0.5">Branch</span>
                                <span className="text-sm font-medium text-slate-700">{formatBranchName(job.branch)}</span>
                              </div>

                              {/* Format */}
                              <div>
                                <span className="text-xs uppercase tracking-wider text-slate-400 block mb-0.5">Format</span>
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${formatBadgeClasses(job.format)}`}>
                                  <FormatIcon format={job.format} />
                                  {formatLabel(job.format)}
                                </span>
                              </div>

                              {/* Platform */}
                              <div>
                                <span className="text-xs uppercase tracking-wider text-slate-400 block mb-0.5">Platform</span>
                                {job.platform && job.platform !== 'general' ? (
                                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                    job.platform === 'tiktok' ? 'bg-pink-100 text-pink-600' :
                                    job.platform === 'instagram_reels' ? 'bg-purple-100 text-purple-600' :
                                    job.platform === 'youtube_shorts' ? 'bg-red-100 text-red-600' :
                                    'bg-slate-100 text-slate-500'
                                  }`}>
                                    {job.platform === 'tiktok' ? 'TikTok' :
                                     job.platform === 'instagram_reels' ? 'IG Reels' :
                                     job.platform === 'youtube_shorts' ? 'YT Shorts' :
                                     job.platform}
                                  </span>
                                ) : (
                                  <span className="text-sm font-medium text-slate-700">General</span>
                                )}
                              </div>

                              {/* Pipeline (video only) */}
                              {(!job.format || job.format === 'video') && (
                                <div>
                                  <span className="text-xs uppercase tracking-wider text-slate-400 block mb-0.5">Pipeline</span>
                                  <span className="text-sm font-medium text-slate-700">
                                    {(job as any).pipeline === 'talking_head' ? 'Talking Head' :
                                     (job as any).pipeline === 'full_scene' ? 'Full Scene' :
                                     (job as any).pipeline || '—'}
                                  </span>
                                </div>
                              )}

                              {/* Aspect ratio (static/carousel) */}
                              {(job.format === 'static' || job.format === 'carousel') && (
                                <div>
                                  <span className="text-xs uppercase tracking-wider text-slate-400 block mb-0.5">Aspect Ratio</span>
                                  <span className="text-sm font-medium text-slate-700">{job.aspect_ratio || '—'}</span>
                                </div>
                              )}

                              {/* Segment */}
                              <div>
                                <span className="text-xs uppercase tracking-wider text-slate-400 block mb-0.5">Segment</span>
                                <span className="text-sm font-medium text-slate-700">{job.target_segment || '—'}</span>
                              </div>

                              {/* Actor (video only) */}
                              {(!job.format || job.format === 'video') && (
                                <div>
                                  <span className="text-xs uppercase tracking-wider text-slate-400 block mb-0.5">Actor</span>
                                  <span className="text-sm font-medium text-slate-700">{job.actor_prompt || '—'}</span>
                                </div>
                              )}

                              {/* Voice (video only) */}
                              {(!job.format || job.format === 'video') && (
                                <div>
                                  <span className="text-xs uppercase tracking-wider text-slate-400 block mb-0.5">Voice</span>
                                  <span className="text-sm font-medium text-slate-700">
                                    {job.voice_style || voiceLabel
                                      ? [job.voice_style, voiceLabel].filter(Boolean).join(' · ')
                                      : '—'}
                                  </span>
                                </div>
                              )}

                              {/* Duration (video only) */}
                              {(!job.format || job.format === 'video') && (
                                <div>
                                  <span className="text-xs uppercase tracking-wider text-slate-400 block mb-0.5">Duration</span>
                                  <span className="text-sm font-medium text-slate-700">
                                    {job.duration_seconds ? `${job.duration_seconds}s` : 'N/A'}
                                  </span>
                                </div>
                              )}

                              {/* Cost */}
                              <div>
                                <span className="text-xs uppercase tracking-wider text-slate-400 block mb-0.5">Cost</span>
                                <span className="text-sm font-medium text-slate-700">
                                  {job.cost_estimate != null ? `$${Number(job.cost_estimate).toFixed(2)}` : '—'}
                                </span>
                              </div>

                              {/* Status */}
                              <div>
                                <span className="text-xs uppercase tracking-wider text-slate-400 block mb-0.5">Status</span>
                                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${statusChipClasses(job.status)}`}>
                                  {job.status === 'completed' && <Check size={10} />}
                                  {currentStage?.label || job.status}
                                </span>
                              </div>

                              {/* Created */}
                              <div>
                                <span className="text-xs uppercase tracking-wider text-slate-400 block mb-0.5">Created</span>
                                <span className="text-sm font-medium text-slate-700">
                                  {createdDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}{' '}
                                  {createdDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                </span>
                              </div>

                              {/* Completed */}
                              <div>
                                <span className="text-xs uppercase tracking-wider text-slate-400 block mb-0.5">Completed</span>
                                <span className="text-sm font-medium text-slate-700">
                                  {completedDate
                                    ? `${completedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} ${completedDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
                                    : '—'}
                                </span>
                              </div>

                              {/* Approved */}
                              {job.frame_approved_at && (
                                <div>
                                  <span className="text-xs uppercase tracking-wider text-slate-400 block mb-0.5">Approved</span>
                                  <span className="text-sm font-medium text-slate-700">
                                    {new Date(job.frame_approved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                  </span>
                                </div>
                              )}

                              {/* Face thumbnail (video only) */}
                              {job.face_image_url && (
                                <div>
                                  <span className="text-xs uppercase tracking-wider text-slate-400 block mb-0.5">Face</span>
                                  <img src={job.face_image_url} alt="Generated face" className="w-12 h-12 rounded-full object-cover border border-slate-200" />
                                </div>
                              )}

                              {/* Carousel gallery — full width */}
                              {job.format === 'carousel' && job.media_urls && job.media_urls.length > 0 && (
                                <div className="col-span-2 mt-1">
                                  <span className="text-xs uppercase tracking-wider text-slate-400 block mb-1">Slides ({job.media_urls.length})</span>
                                  <div className="flex gap-2 overflow-x-auto pb-1">
                                    {job.media_urls.map((url, i) => (
                                      <img key={i} src={url} alt={`Slide ${i + 1}`} className="w-24 h-24 rounded-lg object-cover border border-slate-200 flex-shrink-0" />
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Script — full width */}
                              {job.script && (
                                <div className="col-span-2 mt-1">
                                  <span className="text-xs uppercase tracking-wider text-slate-400 block mb-1">Script</span>
                                  <blockquote className="border-l-4 border-emerald-400 pl-4 py-2 bg-white/60 rounded-r-lg text-sm text-slate-600 italic whitespace-pre-wrap">
                                    {job.script}
                                  </blockquote>
                                </div>
                              )}

                              {/* Caption — full width */}
                              {job.caption && (
                                <div className="col-span-2 mt-1">
                                  <span className="text-xs uppercase tracking-wider text-slate-400 block mb-1">Caption</span>
                                  <blockquote className="border-l-4 border-emerald-400 pl-4 py-2 bg-white/60 rounded-r-lg text-sm text-slate-600 italic whitespace-pre-wrap">
                                    {job.caption}
                                  </blockquote>
                                </div>
                              )}

                              {/* Revision notes — full width */}
                              {job.revision_notes && (
                                <div className="col-span-2 mt-1">
                                  <span className="text-xs uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1.5">
                                    <GitBranch size={11} /> Revision Notes
                                  </span>
                                  <blockquote className="border-l-4 border-amber-400 pl-4 py-2 bg-white/60 rounded-r-lg text-sm text-slate-600 italic whitespace-pre-wrap">
                                    {job.revision_notes}
                                  </blockquote>
                                </div>
                              )}

                              {/* Image prompt — what was actually sent to the image model.
                                  The first line tells you whether a reference photo was used. */}
                              {job.frame_prompt && (
                                <div className="col-span-2 mt-1">
                                  <span className="text-xs uppercase tracking-wider text-slate-400 block mb-1">
                                    Image Prompt
                                    {/^The attached image is a real photograph/.test(job.frame_prompt) && (
                                      <span className="ml-2 normal-case tracking-normal text-emerald-600 font-bold">· used your photo</span>
                                    )}
                                    {/^A reference photograph is attached/.test(job.frame_prompt) && (
                                      <span className="ml-2 normal-case tracking-normal text-emerald-600 font-bold">· guided by your photo</span>
                                    )}
                                  </span>
                                  <p className="bg-white/60 rounded-lg px-3 py-2 text-xs text-slate-500 font-mono whitespace-pre-wrap break-words">
                                    {job.frame_prompt}
                                  </p>
                                </div>
                              )}
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

        {/* Pagination */}
        {filteredJobs.length > PAGE_SIZE && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-slate-100">
            <span className="text-xs text-slate-400">
              {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filteredJobs.length)} of {filteredJobs.length}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={16} />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`w-7 h-7 rounded-lg text-xs font-bold transition ${
                    page === currentPage
                      ? 'bg-emerald-500 text-white'
                      : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  {page}
                </button>
              ))}
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Export for Meta Ads modal ── */}
      {adExportJobId && (() => {
        const exportJob = jobs.find(j => j.id === adExportJobId);
        if (!exportJob) return null;
        return (
          <MetaAdExportModal
            job={exportJob}
            brandName={branchName(exportJob.branch)}
            geminiApiKey={geminiApiKey}
            onClose={() => setAdExportJobId(null)}
            addToast={addToast}
          />
        );
      })()}
    </div>
  );
};

export default VideoAdLab;
