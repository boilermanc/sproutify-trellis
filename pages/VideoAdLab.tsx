
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Profile, SpokeConnection, VideoAdConfig, VideoAdJob, VideoAdStatus } from '../types';
import { GoogleGenAI } from '@google/genai';
import { BRANCH_DISPLAY_NAMES, formatBranchName } from '../utils';
import {
  TONE_PRESETS, ACTOR_STYLES, PIPELINE_OPTIONS, VIDEO_AD_STAGES,
  ASPECT_RATIOS, VIDEO_SETTINGS, VIDEO_LIGHTING, VIDEO_MOODS,
} from '../constants';
import { submitVideoAdJob, getVideoAdJobs, cancelVideoAdJob, SpokeCredentials } from '../services/videoAdService';
import { useVideoAdPoller } from '../hooks/useVideoAdPoller';
import {
  Video, Sparkles, Loader2, Film, User, Play, Download, Trash2,
  ChevronDown, ChevronUp, Target, FileText, Zap, DollarSign,
  Palette, Eye, Check, BookTemplate,
} from 'lucide-react';

// ─── Supabase REST helpers for templates ─────────────────────────────

interface VideoAdTemplate {
  id: string;
  branch: string;
  template_name: string;
  settings: Record<string, any>;
  created_at: string;
}

function supabaseHeaders(key: string): Record<string, string> {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

async function fetchTemplates(creds: SpokeCredentials | null, branch: string): Promise<VideoAdTemplate[]> {
  if (!creds?.url || !creds?.key) return [];
  try {
    const res = await fetch(
      `${creds.url}/rest/v1/video_ad_templates?branch=eq.${branch}&order=created_at.desc&select=*`,
      { headers: supabaseHeaders(creds.key) },
    );
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

async function saveTemplate(creds: SpokeCredentials | null, branch: string, name: string, settings: Record<string, any>): Promise<void> {
  if (!creds?.url || !creds?.key) return;
  await fetch(`${creds.url}/rest/v1/video_ad_templates`, {
    method: 'POST',
    headers: { ...supabaseHeaders(creds.key), Prefer: 'return=minimal' },
    body: JSON.stringify({ branch, template_name: name, settings }),
  });
}

async function deleteTemplate(creds: SpokeCredentials | null, id: string): Promise<void> {
  if (!creds?.url || !creds?.key) return;
  await fetch(`${creds.url}/rest/v1/video_ad_templates?id=eq.${id}`, {
    method: 'DELETE',
    headers: { ...supabaseHeaders(creds.key), Prefer: 'return=minimal' },
  });
}

// ─── Constants ───────────────────────────────────────────────────────
interface VideoAdLabProps {
  profiles: Profile[];
  spokeConnections: SpokeConnection[];
  addToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const TERMINAL_STATUSES: VideoAdStatus[] = ['completed', 'failed', 'cancelled'];
const BRANCH_KEYS = Object.keys(BRANCH_DISPLAY_NAMES);

const STEPS = [
  { num: 1, label: 'Message', icon: FileText },
  { num: 2, label: 'Look & Feel', icon: Palette },
  { num: 3, label: 'Review', icon: Eye },
] as const;

// ─── Component ───────────────────────────────────────────────────────
const VideoAdLab: React.FC<VideoAdLabProps> = ({ profiles, spokeConnections, addToast }) => {
  // ── Derive spoke credentials from first active connection ──
  const spokeCreds = useMemo<SpokeCredentials | null>(() => {
    const active = spokeConnections.find(c => c.status === 'active');
    if (!active?.supabase_url || !active?.supabase_key) return null;
    return { url: active.supabase_url, key: active.supabase_key };
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
  const [showGallery, setShowGallery] = useState(true);

  // ── Load jobs on mount (and when creds become available) ──
  useEffect(() => {
    if (!spokeCreds) return;
    (async () => {
      try {
        const fetched = await getVideoAdJobs(spokeCreds);
        setJobs(fetched);
        setActiveJobIds(fetched.filter(j => !TERMINAL_STATUSES.includes(j.status)).map(j => j.id));
      } catch {
        // silent
      }
    })();
  }, [spokeCreds]);

  // ── Load templates when branch changes ──
  useEffect(() => {
    if (!branch) return;
    fetchTemplates(spokeCreds, branch).then(setTemplates).catch(() => setTemplates([]));
  }, [branch, spokeCreds]);

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

  const { activeCount } = useVideoAdPoller(activeJobIds, handleStatusChange, activeJobIds.length > 0, spokeCreds ?? undefined);

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
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
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
        await saveTemplate(spokeCreds, branch, newTemplateName.trim(), {
          pipeline, actorGender, actorStyle, aspectRatio, tone,
          setting, lighting, mood, customVisualNotes,
        });
        const refreshed = await fetchTemplates(spokeCreds, branch);
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
      };

      const result = await submitVideoAdJob(config);
      setActiveJobIds(prev => [...prev, result.job_id]);
      addToast('Video generation started!', 'success');

      const fetched = await getVideoAdJobs(spokeCreds);
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
      await cancelVideoAdJob(jobId, spokeCreds ?? undefined);
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

      {/* ── Job Queue ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <button
          onClick={() => setShowGallery(!showGallery)}
          className="w-full flex items-center justify-between p-6 hover:bg-slate-50 transition"
        >
          <div className="flex items-center gap-3">
            <Video size={20} className="text-emerald-600" />
            <span className="text-sm font-black text-slate-800">Generation Queue</span>
            {activeCount > 0 && (
              <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-black rounded-full uppercase tracking-wider">
                {activeCount} active
              </span>
            )}
            <span className="text-xs text-slate-400">{jobs.length} total</span>
          </div>
          {showGallery ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </button>

        {showGallery && (
          <div className="px-6 pb-6 space-y-3">
            {jobs.length === 0 && (
              <div className="text-center py-12 text-slate-400">
                <Film size={40} className="mx-auto mb-3 opacity-30" />
                <p className="font-bold text-sm">No video ad jobs yet</p>
                <p className="text-xs mt-1">Configure and submit your first job above</p>
              </div>
            )}

            {jobs.map(job => {
              const currentStage = VIDEO_AD_STAGES.find(s => s.key === job.status);
              const thumbnailSrc = job.thumbnail_url || job.face_image_url;

              return (
                <div key={job.id} className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <div className="flex items-start gap-3">
                    {thumbnailSrc && (
                      <img src={thumbnailSrc} alt="Video thumbnail" className="w-16 h-16 rounded-lg object-cover border border-slate-200 shrink-0" />
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-slate-400">{job.id.slice(0, 12)}...</span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-200 text-slate-600">
                            {formatBranchName(job.branch)}
                          </span>
                          {job.target_segment && (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                              <Target size={10} />{job.target_segment}
                            </span>
                          )}
                          {job.cost_estimate != null && (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-slate-400">
                              <DollarSign size={10} />${job.cost_estimate.toFixed(2)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {job.status === 'completed' && job.video_url && (
                            <>
                              <a href={job.video_url} target="_blank" rel="noopener noreferrer" className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition"><Play size={14} /></a>
                              <a href={job.video_url} download className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition"><Download size={14} /></a>
                            </>
                          )}
                          {!TERMINAL_STATUSES.includes(job.status) && (
                            <button onClick={() => handleCancel(job.id)} className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition"><Trash2 size={14} /></button>
                          )}
                        </div>
                      </div>

                      {job.script && (
                        <p className="text-xs text-slate-500 mb-2 truncate">
                          <FileText size={10} className="inline mr-1" />
                          {job.script.length > 80 ? `${job.script.slice(0, 80)}...` : job.script}
                        </p>
                      )}

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-[10px] font-black uppercase tracking-wider ${
                            job.status === 'failed' ? 'text-rose-500' :
                            job.status === 'cancelled' ? 'text-slate-400' :
                            job.status === 'completed' ? 'text-emerald-600' :
                            'text-slate-500'
                          }`}>
                            {currentStage?.label || job.status}
                          </span>
                          <span className="text-[10px] font-bold text-slate-400">{job.progress}%</span>
                        </div>
                        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              job.status === 'failed' ? 'bg-rose-400' :
                              job.status === 'cancelled' ? 'bg-slate-300' :
                              job.status === 'completed' ? 'bg-emerald-500' :
                              'bg-emerald-400 animate-pulse'
                            }`}
                            style={{ width: `${job.progress}%` }}
                          />
                        </div>
                      </div>

                      {job.status === 'failed' && job.error_message && (
                        <p className="text-xs text-rose-500 font-medium mt-2 bg-rose-50 rounded-lg px-3 py-1.5">{job.error_message}</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoAdLab;
