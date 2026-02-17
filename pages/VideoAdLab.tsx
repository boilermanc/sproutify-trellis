
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Profile, VideoAdConfig, VideoAdJob, VideoAdStatus } from '../types';
import { GoogleGenAI } from '@google/genai';
import { BRANCH_DISPLAY_NAMES, formatBranchName } from '../utils';
import { VOICE_OPTIONS, TONE_PRESETS, ACTOR_STYLES, ACTOR_GENDERS, PIPELINE_OPTIONS, DURATION_OPTIONS, VIDEO_AD_STAGES } from '../constants';
import { submitVideoAdJob, getVideoAdJobs, cancelVideoAdJob } from '../services/videoAdService';
import { useVideoAdPoller } from '../hooks/useVideoAdPoller';
import {
  Video, Sparkles, Send, Loader2, Film, Mic, User, Clock,
  DollarSign, RefreshCw, Play, Download, Share2, Trash2,
  ChevronDown, ChevronUp, Layers, Target, FileText, Zap
} from 'lucide-react';

interface VideoAdLabProps {
  profiles: Profile[];
  addToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const TERMINAL_STATUSES: VideoAdStatus[] = ['completed', 'failed', 'cancelled'];
const BRANCH_KEYS = Object.keys(BRANCH_DISPLAY_NAMES);

const PIPELINE_ICON_MAP: Record<string, React.ElementType> = { User, Film };
const PIPELINE_COST: Record<string, number> = { talking_head: 0.12, full_scene: 0.70 };

const VideoAdLab: React.FC<VideoAdLabProps> = ({ profiles, addToast }) => {

  // ═══════════════════════════════════════════════════════════════
  // FORM STATE
  // ═══════════════════════════════════════════════════════════════
  const [branch, setBranch] = useState(BRANCH_KEYS[4] ?? BRANCH_KEYS[0] ?? '');
  const [productDescription, setProductDescription] = useState('');
  const [targetSegment, setTargetSegment] = useState('health_conscious');
  const [tone, setTone] = useState<string>(TONE_PRESETS[0]);
  const [cta, setCta] = useState('');
  const [actorStyle, setActorStyle] = useState<string>(ACTOR_STYLES[0]);
  const [actorGender, setActorGender] = useState<'male' | 'female'>('female');
  const [selectedVoice, setSelectedVoice] = useState(VOICE_OPTIONS[0].id);
  const [duration, setDuration] = useState<15 | 30 | 60>(30);
  const [variants, setVariants] = useState(1);
  const [pipeline, setPipeline] = useState<'talking_head' | 'full_scene'>('full_scene');
  const [generatedScript, setGeneratedScript] = useState('');
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);

  // ═══════════════════════════════════════════════════════════════
  // JOB STATE
  // ═══════════════════════════════════════════════════════════════
  const [jobs, setJobs] = useState<VideoAdJob[]>([]);
  const [activeJobIds, setActiveJobIds] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showGallery, setShowGallery] = useState(true);

  // ═══════════════════════════════════════════════════════════════
  // LOAD JOBS ON MOUNT
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    (async () => {
      try {
        const fetched = await getVideoAdJobs();
        setJobs(fetched);
        setActiveJobIds(fetched.filter(j => !TERMINAL_STATUSES.includes(j.status)).map(j => j.id));
      } catch {
        // silent — jobs list will be empty
      }
    })();
  }, []);

  // ═══════════════════════════════════════════════════════════════
  // POLLER
  // ═══════════════════════════════════════════════════════════════
  const handleStatusChange = useCallback((updatedJob: VideoAdJob) => {
    setJobs(prev => prev.map(j => j.id === updatedJob.id ? updatedJob : j));
    if (updatedJob.status === 'completed') {
      addToast(`Video ad "${updatedJob.id.slice(0, 8)}…" completed!`, 'success');
    } else if (updatedJob.status === 'failed') {
      addToast(`Video ad "${updatedJob.id.slice(0, 8)}…" failed: ${updatedJob.error_message || 'Unknown error'}`, 'error');
    }
    if (TERMINAL_STATUSES.includes(updatedJob.status)) {
      setActiveJobIds(prev => prev.filter(id => id !== updatedJob.id));
    }
  }, [addToast]);

  const { activeCount } = useVideoAdPoller(activeJobIds, handleStatusChange, activeJobIds.length > 0);

  // ═══════════════════════════════════════════════════════════════
  // SCRIPT GENERATION (Gemini)
  // ═══════════════════════════════════════════════════════════════
  const handleGenerateScript = async () => {
    if (!productDescription) return;
    setIsGeneratingScript(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const wl = Math.floor(duration * 2.5);
      const prompt = `You are a video ad scriptwriter for Sproutify. Write a spoken-word script for a talking-head video ad.

PRODUCT: ${productDescription}
BRAND: ${formatBranchName(branch)}
TARGET AUDIENCE: ${targetSegment}
TONE: ${tone}
CTA: ${cta || 'Visit our website'}
DURATION: ${duration} seconds

STRICT RULES:
1. Write ONLY spoken dialogue — words the actor will say out loud.
2. Do NOT include stage directions, actions, gestures, or parenthetical notes like "(smiling)", "(holds up product)", "(nods)". The video is a face-only talking head — no body or props are visible.
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

  // ═══════════════════════════════════════════════════════════════
  // SUBMIT JOBS
  // ═══════════════════════════════════════════════════════════════
  const handleSubmit = async () => {
    if (!generatedScript || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const config: VideoAdConfig = {
        branch,
        product_description: productDescription,
        target_segment: targetSegment,
        tone,
        cta: cta || 'Visit our website',
        actor_style: actorStyle,
        actor_gender: actorGender,
        voice_style: selectedVoice,
        video_duration: duration,
        pipeline,
      };

      const newJobIds: string[] = [];
      for (let i = 0; i < variants; i++) {
        const result = await submitVideoAdJob(config);
        newJobIds.push(result.job_id);
      }

      setActiveJobIds(prev => [...prev, ...newJobIds]);
      addToast(`${variants} video ad job${variants > 1 ? 's' : ''} submitted!`, 'info');

      // Refresh full job list
      const fetched = await getVideoAdJobs();
      setJobs(fetched);
    } catch (err: any) {
      addToast(`Submit failed: ${err.message}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════
  // CANCEL JOB
  // ═══════════════════════════════════════════════════════════════
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

  // ═══════════════════════════════════════════════════════════════
  // DERIVED
  // ═══════════════════════════════════════════════════════════════
  const wordLimit = Math.floor(duration * 2.5);
  const wordCount = generatedScript.trim().split(/\s+/).filter(Boolean).length;
  const estimatedSeconds = Math.round(wordCount / 2.5);
  const costPerVariant = PIPELINE_COST[pipeline] ?? 0.12;
  const costEstimate = (variants * costPerVariant).toFixed(2);

  // ═══════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="space-y-8 min-h-screen pb-40">

      {/* ── Two-column top section ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">

        {/* ── LEFT: Script Studio (60%) ── */}
        <div className="lg:col-span-3">
          <div className="bg-white p-10 rounded-[3.5rem] border border-slate-200 shadow-sm">
            <h3 className="text-2xl font-black text-slate-800 flex items-center mb-8 pb-6 border-b border-slate-100">
              <Film size={28} className="mr-4 text-emerald-600" />Script Studio
            </h3>

            <div className="space-y-6">
              {/* Branch */}
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Branch</label>
                <select
                  value={branch}
                  onChange={e => setBranch(e.target.value)}
                  className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl text-slate-800 font-bold text-sm focus:outline-none focus:border-emerald-500 transition"
                >
                  {BRANCH_KEYS.map(key => (
                    <option key={key} value={key}>{BRANCH_DISPLAY_NAMES[key]}</option>
                  ))}
                </select>
              </div>

              {/* Product Description */}
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Product Description</label>
                <textarea
                  value={productDescription}
                  onChange={e => setProductDescription(e.target.value)}
                  placeholder="Describe your product or service..."
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-5 text-sm font-medium outline-none focus:bg-white focus:border-emerald-500 transition min-h-[100px]"
                />
              </div>

              {/* Target Segment */}
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Target Segment</label>
                <input
                  value={targetSegment}
                  onChange={e => setTargetSegment(e.target.value)}
                  placeholder="e.g. health_conscious, urban_gardeners"
                  className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-medium outline-none focus:bg-white focus:border-emerald-500 transition"
                />
              </div>

              {/* Tone — select dropdown */}
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Tone</label>
                <select
                  value={tone}
                  onChange={e => setTone(e.target.value)}
                  className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl text-slate-800 font-bold text-sm focus:outline-none focus:border-emerald-500 transition"
                >
                  {TONE_PRESETS.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              {/* CTA */}
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Call to Action</label>
                <input
                  value={cta}
                  onChange={e => setCta(e.target.value)}
                  placeholder="e.g. Visit atlurbanfarms.com to get started"
                  className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl text-sm font-medium outline-none focus:bg-white focus:border-emerald-500 transition"
                />
              </div>

              {/* Generate Script Button */}
              <button
                onClick={handleGenerateScript}
                disabled={!productDescription || isGeneratingScript}
                className="w-full py-5 bg-slate-900 text-white rounded-[2rem] font-black text-sm flex items-center justify-center space-x-3 shadow-xl hover:bg-emerald-600 transition disabled:opacity-20"
              >
                {isGeneratingScript ? <Loader2 size={20} className="animate-spin" /> : <Sparkles size={20} className="text-emerald-400" />}
                <span>{isGeneratingScript ? 'Generating...' : 'Generate Script with Sage'}</span>
              </button>

              {/* Editable Script */}
              {(generatedScript || isGeneratingScript) && (
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Script</label>
                  <textarea
                    value={generatedScript}
                    onChange={e => setGeneratedScript(e.target.value)}
                    placeholder="Your AI-generated script will appear here..."
                    className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-5 text-sm font-medium outline-none focus:bg-white focus:border-emerald-500 transition min-h-[160px]"
                  />
                  <div className="flex items-center gap-4 mt-2 text-[10px] font-bold text-slate-400">
                    <span className={wordCount > wordLimit ? 'text-amber-500' : ''}>{wordCount} / {wordLimit} words</span>
                    <span>~{estimatedSeconds}s spoken</span>
                    {wordCount > wordLimit && (
                      <span className="text-amber-500">Over limit — trim to fit {duration}s</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── RIGHT: Actor Configurator (40%) ── */}
        <div className="lg:col-span-2">
          <div className="bg-white p-10 rounded-[3.5rem] border border-slate-200 shadow-sm">
            <h3 className="text-2xl font-black text-slate-800 flex items-center mb-8 pb-6 border-b border-slate-100">
              <User size={28} className="mr-4 text-emerald-600" />Actor Configurator
            </h3>

            <div className="space-y-6">
              {/* Pipeline Selector — radio cards */}
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">Pipeline</label>
                <div className="grid grid-cols-2 gap-3">
                  {PIPELINE_OPTIONS.map(opt => {
                    const Icon = PIPELINE_ICON_MAP[opt.icon] ?? Film;
                    const selected = pipeline === opt.value;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => setPipeline(opt.value)}
                        className={`p-4 rounded-2xl text-left transition border-2 ${selected ? 'border-emerald-500 bg-emerald-500/10 shadow-md' : 'border-slate-100 bg-slate-50 hover:border-slate-200'}`}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <Icon size={16} className={selected ? 'text-emerald-600' : 'text-slate-400'} />
                          <span className={`text-xs font-black uppercase tracking-wider ${selected ? 'text-emerald-700' : 'text-slate-500'}`}>{opt.label}</span>
                        </div>
                        <p className={`text-[10px] font-medium ${selected ? 'text-emerald-600' : 'text-slate-400'}`}>{opt.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Actor Style — select dropdown */}
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">Style</label>
                <select
                  value={actorStyle}
                  onChange={e => setActorStyle(e.target.value)}
                  className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl text-slate-800 font-bold text-sm focus:outline-none focus:border-emerald-500 transition"
                >
                  {ACTOR_STYLES.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              {/* Gender Pills */}
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">Gender</label>
                <div className="flex gap-2">
                  {ACTOR_GENDERS.map(g => (
                    <button
                      key={g.value}
                      onClick={() => setActorGender(g.value)}
                      className={`flex-1 py-3 rounded-full text-xs font-black uppercase tracking-wider transition ${actorGender === g.value ? 'bg-emerald-600 text-white shadow-lg' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                    >{g.label}</button>
                  ))}
                </div>
              </div>

              {/* Voice */}
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
                  <Mic size={12} className="inline mr-1" />Voice
                </label>
                <select
                  value={selectedVoice}
                  onChange={e => setSelectedVoice(e.target.value)}
                  className="w-full px-5 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl text-slate-800 font-bold text-sm focus:outline-none focus:border-emerald-500 transition"
                >
                  {VOICE_OPTIONS.map(v => (
                    <option key={v.id} value={v.id}>{v.name} — {v.style}</option>
                  ))}
                </select>
              </div>

              {/* Duration Pills */}
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">
                  <Clock size={12} className="inline mr-1" />Duration
                </label>
                <div className="flex gap-2">
                  {DURATION_OPTIONS.map(d => (
                    <button
                      key={d}
                      onClick={() => setDuration(d)}
                      className={`flex-1 py-3 rounded-full text-xs font-black uppercase tracking-wider transition ${duration === d ? 'bg-emerald-600 text-white shadow-lg' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                    >{d}s</button>
                  ))}
                </div>
              </div>

              {/* Variants */}
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 block">
                  <Layers size={12} className="inline mr-1" />Variants
                </label>
                <input
                  type="range"
                  min={1}
                  max={5}
                  value={variants}
                  onChange={e => setVariants(Number(e.target.value))}
                  className="w-full accent-emerald-600"
                />
                <div className="flex justify-between text-[10px] font-bold text-slate-400 mt-1">
                  <span>{variants} variant{variants > 1 ? 's' : ''}</span>
                  <span className="flex items-center gap-1"><DollarSign size={10} />~${costEstimate}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── PRIMARY CTA ── */}
      <button
        onClick={handleSubmit}
        disabled={isSubmitting || !generatedScript}
        className="w-full py-8 bg-gradient-to-r from-emerald-600 to-emerald-500 text-white rounded-[2.5rem] font-black text-xl flex items-center justify-center space-x-4 shadow-2xl hover:from-emerald-700 hover:to-emerald-600 transition disabled:opacity-20"
      >
        {isSubmitting ? <Loader2 size={28} className="animate-spin" /> : <Zap size={28} />}
        <span>{isSubmitting ? 'Submitting...' : `Generate Video Ad${variants > 1 ? ` (${variants} variants)` : ''}`}</span>
      </button>

      {/* ── JOB GALLERY ── */}
      <div className="bg-white rounded-[3.5rem] border border-slate-200 shadow-sm overflow-hidden">
        <button
          onClick={() => setShowGallery(!showGallery)}
          className="w-full flex items-center justify-between p-8 hover:bg-slate-50 transition"
        >
          <div className="flex items-center gap-4">
            <Video size={24} className="text-emerald-600" />
            <span className="text-lg font-black text-slate-800">Job Queue</span>
            {activeCount > 0 && (
              <span className="px-3 py-1 bg-emerald-100 text-emerald-700 text-[10px] font-black rounded-full uppercase tracking-wider">
                {activeCount} active
              </span>
            )}
            <span className="text-xs font-bold text-slate-400">{jobs.length} total</span>
          </div>
          {showGallery ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
        </button>

        {showGallery && (
          <div className="px-8 pb-8 space-y-4">
            {jobs.length === 0 && (
              <div className="text-center py-16 text-slate-400">
                <Film size={48} className="mx-auto mb-4 opacity-30" />
                <p className="font-bold text-sm">No video ad jobs yet</p>
                <p className="text-xs mt-1">Configure and submit your first job above</p>
              </div>
            )}

            {jobs.map(job => {
              const currentStage = VIDEO_AD_STAGES.find(s => s.key === job.status);
              const thumbnailSrc = job.thumbnail_url || job.face_image_url;

              return (
                <div key={job.id} className="bg-slate-50 rounded-[2rem] p-6 border border-slate-100">
                  <div className="flex items-start gap-4">
                    {/* Thumbnail / Face Image */}
                    {thumbnailSrc && (
                      <img src={thumbnailSrc} alt="Video thumbnail" className="w-20 h-20 rounded-xl object-cover border border-slate-200 shrink-0" />
                    )}

                    <div className="flex-1 min-w-0">
                      {/* Header row */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono text-slate-400">{job.id.slice(0, 12)}…</span>
                          <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-200 text-slate-600">
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
                        <div className="flex items-center gap-2">
                          {job.status === 'completed' && job.video_url && (
                            <>
                              <a href={job.video_url} target="_blank" rel="noopener noreferrer" className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl transition"><Play size={16} /></a>
                              <a href={job.video_url} download className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl transition"><Download size={16} /></a>
                            </>
                          )}
                          {!TERMINAL_STATUSES.includes(job.status) && (
                            <button onClick={() => handleCancel(job.id)} className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition"><Trash2 size={16} /></button>
                          )}
                        </div>
                      </div>

                      {/* Script preview */}
                      {job.script && (
                        <p className="text-xs text-slate-500 mb-3 truncate">
                          <FileText size={10} className="inline mr-1" />
                          {job.script.length > 80 ? `${job.script.slice(0, 80)}…` : job.script}
                        </p>
                      )}

                      {/* Progress bar + stage label */}
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
                        <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
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

                      {/* Error message */}
                      {job.status === 'failed' && job.error_message && (
                        <p className="text-xs text-rose-500 font-medium mt-3 bg-rose-50 rounded-xl px-4 py-2">{job.error_message}</p>
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
