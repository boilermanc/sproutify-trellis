
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Profile, SpokeConnection, VideoAdConfig, VideoAdJob, VideoAdStatus } from '../types';
import { GoogleGenAI } from '@google/genai';
import { BRANCH_DISPLAY_NAMES, formatBranchName } from '../utils';
import {
  TONE_PRESETS, ACTOR_STYLES, PIPELINE_OPTIONS, VIDEO_AD_STAGES,
  ASPECT_RATIOS, VIDEO_SETTINGS, VIDEO_LIGHTING, VIDEO_MOODS,
} from '../constants';
import { submitVideoAdJob, getVideoAdJobs, cancelVideoAdJob } from '../services/videoAdService';
import { supabase } from '../lib/supabase';
import { useVideoAdPoller } from '../hooks/useVideoAdPoller';
import {
  Video, Sparkles, Loader2, Film, User, Play, Download, Trash2,
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Target, FileText, Zap, DollarSign,
  Palette, Eye, Check, BookTemplate, RefreshCw, Clock, CalendarClock,
} from 'lucide-react';

// ─── Supabase REST helpers for templates (spoke-side) ────────────────

interface VideoAdTemplate {
  id: string;
  branch: string;
  template_name: string;
  settings: Record<string, any>;
  created_at: string;
}

// Templates live on the spoke (video_ad_templates). We reach them through the
// spoke-query Edge Function by connection id, so the spoke key stays server-side.
async function fetchTemplates(connectionId: string | null, branch: string): Promise<VideoAdTemplate[]> {
  if (!connectionId) return [];
  try {
    const { data, error } = await supabase.functions.invoke('spoke-query', {
      body: { op: 'template_list', connection_id: connectionId, branch },
    });
    if (error || data?.error) return [];
    return data?.templates || [];
  } catch {
    return [];
  }
}

async function saveTemplate(connectionId: string | null, branch: string, name: string, settings: Record<string, any>): Promise<void> {
  if (!connectionId) return;
  await supabase.functions.invoke('spoke-query', {
    body: { op: 'template_save', connection_id: connectionId, branch, template_name: name, settings },
  });
}

async function deleteTemplate(connectionId: string | null, id: string): Promise<void> {
  if (!connectionId) return;
  await supabase.functions.invoke('spoke-query', {
    body: { op: 'template_delete', connection_id: connectionId, id },
  });
}

// ─── Constants ───────────────────────────────────────────────────────
interface VideoAdLabProps {
  profiles: Profile[];
  spokeConnections: SpokeConnection[];
  geminiApiKey: string;
  addToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const TERMINAL_STATUSES: VideoAdStatus[] = ['completed', 'failed', 'cancelled'];
const BRANCH_KEYS = Object.keys(BRANCH_DISPLAY_NAMES);

const STEPS = [
  { num: 1, label: 'Message', icon: FileText },
  { num: 2, label: 'Look & Feel', icon: Palette },
  { num: 3, label: 'Review', icon: Eye },
] as const;

type StatusFilter = 'all' | 'active' | 'completed' | 'failed';

const VOICE_NAMES: Record<string, string> = {
  '21m00Tcm4TlvDq8ikWAM': 'Rachel',
  '29vD33N1CtxCmqQRPOHJ': 'Drew',
  '2EiwWnXFnvU5JabPnv8n': 'Clyde',
  'AZnzlk1XvdvUeBnXmlld': 'Domi',
};

// ─── Component ───────────────────────────────────────────────────────
const VideoAdLab: React.FC<VideoAdLabProps> = ({ profiles, spokeConnections, geminiApiKey, addToast }) => {
  // ── Active spoke connection (templates are read/written server-side by id) ──
  const templateConnectionId = useMemo<string | null>(() => {
    return spokeConnections.find(c => c.status === 'active')?.id ?? null;
  }, [spokeConnections]);

  // ── Wizard step ──
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // ── Form fields ──
  const [branch, setBranch] = useState(BRANCH_KEYS[4] ?? BRANCH_KEYS[0] ?? '');
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

  // ── Video Library state ──
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
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
          title: `Video Ad - ${formatBranchName(job.branch)}`,
          content_preview: job.script,
          scheduled_for: scheduledDate.toISOString(),
          status: 'scheduled',
          source: 'social_hub',
          source_id: job.id,
        });
      if (calError) throw new Error(calError.message);

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
      addToast(`Video scheduled for ${label}`, 'success');
      setSchedulingJobId(null);
      setScheduleDateTime('');
    } catch (err: any) {
      addToast(`Failed to schedule: ${err.message}`, 'error');
    } finally {
      setIsScheduling(false);
    }
  }, [scheduleDateTime, addToast]);

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

  // ── Load templates when branch changes (spoke-side) ──
  useEffect(() => {
    if (!branch) return;
    fetchTemplates(templateConnectionId, branch).then(setTemplates).catch(() => setTemplates([]));
  }, [branch, templateConnectionId]);

  // ── Poller ──
  const handleStatusChange = useCallback((updatedJob: VideoAdJob) => {
    setJobs(prev => prev.map(j => j.id === updatedJob.id ? updatedJob : j));
    if (updatedJob.status === 'completed') {
      addToast(`Video ad "${updatedJob.id.slice(0, 8)}..." completed!`, 'success');
    } else if (updatedJob.status === 'failed') {
      addToast(`Video ad "${updatedJob.id.slice(0, 8)}..." failed: ${updatedJob.error_message || 'Unknown error'}`, 'error');
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
    if (statusFilter === 'all') return jobs;
    if (statusFilter === 'active') return jobs.filter(j => !TERMINAL_STATUSES.includes(j.status));
    if (statusFilter === 'completed') return jobs.filter(j => j.status === 'completed');
    return jobs.filter(j => j.status === 'failed' || j.status === 'cancelled');
  }, [jobs, statusFilter]);

  // ── Filter counts ──
  const filterCounts = useMemo(() => ({
    all: jobs.length,
    active: jobs.filter(j => !TERMINAL_STATUSES.includes(j.status)).length,
    completed: jobs.filter(j => j.status === 'completed').length,
    failed: jobs.filter(j => j.status === 'failed' || j.status === 'cancelled').length,
  }), [jobs]);

  // ── Pagination ──
  const totalPages = Math.max(1, Math.ceil(filteredJobs.length / PAGE_SIZE));
  const paginatedJobs = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredJobs.slice(start, start + PAGE_SIZE);
  }, [filteredJobs, currentPage]);

  // Reset to page 1 when filter changes
  useEffect(() => { setCurrentPage(1); }, [statusFilter]);

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
BRAND: ${formatBranchName(branch)}
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

  // ── Submit ──
  const handleSubmit = async () => {
    if (!generatedScript || isSubmitting) return;
    setIsSubmitting(true);
    try {
      // Save template if requested
      if (saveAsTemplate && newTemplateName.trim()) {
        await saveTemplate(templateConnectionId, branch, newTemplateName.trim(), {
          pipeline, actorGender, actorStyle, aspectRatio, tone,
          setting, lighting, mood, customVisualNotes,
        });
        const refreshed = await fetchTemplates(templateConnectionId, branch);
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

      const result = await submitVideoAdJob(config);
      setActiveJobIds(prev => [...prev, result.job_id]);
      addToast('Video generation started!', 'success');

      const fetched = await getVideoAdJobs();
      setJobs(fetched);

      // Reset
      setStep(1);
      setProductDescription('');
      setTargetSegment('');
      setCta('');
      setGeneratedScript('');
      setSaveAsTemplate(false);
      setNewTemplateName('');
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

  // ── Derived ──
  const wordCount = generatedScript.trim().split(/\s+/).filter(Boolean).length;
  const pipelineCost = PIPELINE_OPTIONS.find(p => p.value === pipeline)?.cost ?? 0.12;
  const step1Valid = !!(branch && productDescription && cta);

  const advancedChanged = setting !== VIDEO_SETTINGS[0] || lighting !== VIDEO_LIGHTING[0] || mood !== VIDEO_MOODS[0] || customVisualNotes.trim() !== '';

  // ═══════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════
  return (
    <div className="space-y-6 min-h-screen pb-40">

      {/* ── Top Bar ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Film size={24} className="text-emerald-600" />
          <div>
            <h2 className="text-xl font-black text-slate-800">Video Ad Lab</h2>
            <p className="text-xs text-slate-400">Create AI-powered video ads</p>
          </div>
        </div>

        {/* Template selector */}
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
                  if (isCompleted) setStep(s.num as 1 | 2 | 3);
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

      {/* ── Step 1: Message ── */}
      {step === 1 && (
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
                {BRANCH_KEYS.map(key => (
                  <option key={key} value={key}>{BRANCH_DISPLAY_NAMES[key]}</option>
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
          <div className="flex justify-end mt-8">
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

      {/* ── Step 2: Look & Feel ── */}
      {step === 2 && (
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

      {/* ── Step 3: Review & Generate ── */}
      {step === 3 && (
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-8">
          <h3 className="text-lg font-black text-slate-800 mb-1">Review & generate</h3>
          <p className="text-xs text-slate-400 mb-6">Check everything looks good, then generate your video.</p>

          {/* Summary grid */}
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 mb-8">
            <div>
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Branch</span>
              <p className="text-sm text-slate-700">{formatBranchName(branch)}</p>
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

      {/* ── Video Library ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Video size={20} className="text-emerald-600" />
              <span className="text-sm font-black text-slate-800 uppercase tracking-tight">Video Library</span>
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
        </div>

        {/* Table or empty state */}
        {filteredJobs.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Film size={40} className="mx-auto mb-3 opacity-30" />
            <p className="font-bold text-sm">
              {jobs.length === 0 ? 'No video ads yet' : 'No videos match this filter'}
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
                  <th className="text-left text-[10px] font-black uppercase tracking-widest text-slate-400 px-6 py-3 w-20">Preview</th>
                  <th className="text-left text-[10px] font-black uppercase tracking-widest text-slate-400 px-4 py-3">Details</th>
                  <th className="text-left text-[10px] font-black uppercase tracking-widest text-slate-400 px-4 py-3 w-36">Status</th>
                  <th className="text-left text-[10px] font-black uppercase tracking-widest text-slate-400 px-4 py-3 w-28">Created</th>
                  <th className="text-right text-[10px] font-black uppercase tracking-widest text-slate-400 px-4 py-3 w-20">Cost</th>
                  <th className="text-right text-[10px] font-black uppercase tracking-widest text-slate-400 px-6 py-3 w-28">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedJobs.map(job => {
                  const currentStage = VIDEO_AD_STAGES.find(s => s.key === job.status);
                  const thumbnailSrc = job.thumbnail_url || job.face_image_url;
                  const createdDate = new Date(job.created_at);
                  const isExpanded = expandedJobId === job.id;
                  const completedDate = job.completed_at ? new Date(job.completed_at) : null;
                  const voiceLabel = job.voice_id ? (VOICE_NAMES[job.voice_id] || job.voice_id) : null;

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
                        {thumbnailSrc ? (
                          <img src={thumbnailSrc} alt="" className="w-14 h-14 rounded-lg object-cover border border-slate-200" />
                        ) : (
                          <div className="w-14 h-14 rounded-lg bg-slate-100 flex items-center justify-center">
                            <Film size={18} className="text-slate-300" />
                          </div>
                        )}
                      </td>

                      {/* Details */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
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
                        </div>
                        {job.script && (
                          <p className="text-xs text-slate-500 truncate max-w-xs" title={job.script}>
                            {job.script.length > 80 ? `${job.script.slice(0, 80)}...` : job.script}
                          </p>
                        )}
                        <span className="text-[10px] font-mono text-slate-300">{job.id.slice(0, 12)}</span>
                      </td>

                      {/* Status */}
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                          job.status === 'failed' ? 'bg-rose-50 text-rose-500' :
                          job.status === 'cancelled' ? 'bg-slate-100 text-slate-400' :
                          job.status === 'completed' ? 'bg-emerald-50 text-emerald-600' :
                          'bg-amber-50 text-amber-600'
                        }`}>
                          {job.status === 'completed' && <Check size={10} />}
                          {currentStage?.label || job.status}
                        </span>
                        {!TERMINAL_STATUSES.includes(job.status) && (
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
                          {job.status === 'completed' && job.video_url && (
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

                              {/* Pipeline */}
                              <div>
                                <span className="text-xs uppercase tracking-wider text-slate-400 block mb-0.5">Pipeline</span>
                                <span className="text-sm font-medium text-slate-700">
                                  {(job as any).pipeline === 'talking_head' ? 'Talking Head' :
                                   (job as any).pipeline === 'full_scene' ? 'Full Scene' :
                                   (job as any).pipeline || '—'}
                                </span>
                              </div>

                              {/* Segment */}
                              <div>
                                <span className="text-xs uppercase tracking-wider text-slate-400 block mb-0.5">Segment</span>
                                <span className="text-sm font-medium text-slate-700">{job.target_segment || '—'}</span>
                              </div>

                              {/* Actor */}
                              <div>
                                <span className="text-xs uppercase tracking-wider text-slate-400 block mb-0.5">Actor</span>
                                <span className="text-sm font-medium text-slate-700">{job.actor_prompt || '—'}</span>
                              </div>

                              {/* Voice */}
                              <div>
                                <span className="text-xs uppercase tracking-wider text-slate-400 block mb-0.5">Voice</span>
                                <span className="text-sm font-medium text-slate-700">
                                  {job.voice_style || voiceLabel
                                    ? [job.voice_style, voiceLabel].filter(Boolean).join(' · ')
                                    : '—'}
                                </span>
                              </div>

                              {/* Duration */}
                              <div>
                                <span className="text-xs uppercase tracking-wider text-slate-400 block mb-0.5">Duration</span>
                                <span className="text-sm font-medium text-slate-700">
                                  {job.duration_seconds ? `${job.duration_seconds}s` : 'N/A'}
                                </span>
                              </div>

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
                                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                                  job.status === 'failed' ? 'bg-rose-50 text-rose-500' :
                                  job.status === 'cancelled' ? 'bg-slate-100 text-slate-400' :
                                  job.status === 'completed' ? 'bg-emerald-50 text-emerald-600' :
                                  'bg-amber-50 text-amber-600'
                                }`}>
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

                              {/* Face thumbnail */}
                              {job.face_image_url && (
                                <div>
                                  <span className="text-xs uppercase tracking-wider text-slate-400 block mb-0.5">Face</span>
                                  <img src={job.face_image_url} alt="Generated face" className="w-12 h-12 rounded-full object-cover border border-slate-200" />
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
    </div>
  );
};

export default VideoAdLab;
