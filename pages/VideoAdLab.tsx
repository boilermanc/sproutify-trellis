
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Profile, VideoAdConfig, VideoAdJob, VideoAdStatus } from '../types';
import { GoogleGenAI } from '@google/genai';
import { BRANCH_DISPLAY_NAMES, formatBranchName } from '../utils';
import { VOICE_OPTIONS, TONE_PRESETS, ACTOR_STYLES, DURATION_OPTIONS, VIDEO_AD_COST_PER_VARIANT, VIDEO_AD_STAGES } from '../constants';
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
      const prompt = `Write a ${duration}-second video ad script for "${formatBranchName(branch)}".
Product: ${productDescription}
Target audience: ${targetSegment}
Tone: ${tone}
CTA: ${cta || 'Visit our website'}
Actor style: ${actorStyle}, ${actorGender}

Return ONLY the spoken script text — no stage directions, no scene descriptions, no formatting. Just the words the actor will say on camera. Keep it punchy and within ${duration} seconds when read aloud (~${Math.round(duration * 2.5)} words).`;

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
  const wordCount = generatedScript.trim().split(/\s+/).filter(Boolean).length;
  const estimatedSeconds = Math.round(wordCount / 2.5);
  const costEstimate = (variants * VIDEO_AD_COST_PER_VARIANT).toFixed(2);

  const stageIndex = (status: VideoAdStatus) => VIDEO_AD_STAGES.findIndex(s => s.key === status);

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

              {/* Tone Pills */}
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">Tone</label>
                <div className="flex flex-wrap gap-2">
                  {TONE_PRESETS.map(t => (
                    <button
                      key={t}
                      onClick={() => setTone(t)}
                      className={`px-5 py-2.5 rounded-full text-xs font-black uppercase tracking-wider transition ${tone === t ? 'bg-emerald-600 text-white shadow-lg' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                    >{t}</button>
                  ))}
                </div>
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
                    <span>{wordCount} words</span>
                    <span>~{estimatedSeconds}s spoken</span>
                    {estimatedSeconds > duration && (
                      <span className="text-amber-500">Exceeds {duration}s target</span>
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
              {/* Actor Style Grid */}
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">Style</label>
                <div className="grid grid-cols-2 gap-3">
                  {ACTOR_STYLES.map(s => (
                    <button
                      key={s}
                      onClick={() => setActorStyle(s)}
                      className={`p-4 rounded-2xl text-xs font-black uppercase tracking-wider text-center transition border-2 ${actorStyle === s ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-md' : 'border-slate-100 bg-slate-50 text-slate-500 hover:border-slate-200'}`}
                    >{s}</button>
                  ))}
                </div>
              </div>

              {/* Gender Pills */}
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 block">Gender</label>
                <div className="flex gap-2">
                  {(['female', 'male'] as const).map(g => (
                    <button
                      key={g}
                      onClick={() => setActorGender(g)}
                      className={`flex-1 py-3 rounded-full text-xs font-black uppercase tracking-wider transition ${actorGender === g ? 'bg-emerald-600 text-white shadow-lg' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                    >{g === 'female' ? 'Female' : 'Male'}</button>
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

            {jobs.map(job => (
              <div key={job.id} className="bg-slate-50 rounded-[2rem] p-6 border border-slate-100">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-slate-400">{job.id.slice(0, 12)}…</span>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-200 text-slate-600">
                      {formatBranchName(job.config.branch)}
                    </span>
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

                {/* Pipeline Progress */}
                <div className="flex items-center gap-1">
                  {VIDEO_AD_STAGES.map((stage, idx) => {
                    const currentIdx = stageIndex(job.status);
                    const isFailed = job.status === 'failed';
                    const isCancelled = job.status === 'cancelled';
                    const isComplete = idx <= currentIdx && !isFailed && !isCancelled;
                    const isCurrent = idx === currentIdx && !isFailed && !isCancelled;

                    return (
                      <div key={stage.key} className="flex-1">
                        <div className={`h-2 rounded-full transition-all ${
                          isFailed ? (idx <= currentIdx ? 'bg-rose-400' : 'bg-slate-200') :
                          isCancelled ? 'bg-slate-300' :
                          isComplete ? 'bg-emerald-500' : 'bg-slate-200'
                        } ${isCurrent ? 'animate-pulse' : ''}`} />
                        <span className={`text-[9px] font-bold mt-1 block text-center ${
                          isComplete ? 'text-emerald-600' :
                          isFailed && idx === currentIdx ? 'text-rose-500' :
                          'text-slate-300'
                        }`}>{stage.label}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Error message */}
                {job.status === 'failed' && job.error_message && (
                  <p className="text-xs text-rose-500 font-medium mt-3 bg-rose-50 rounded-xl px-4 py-2">{job.error_message}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoAdLab;
