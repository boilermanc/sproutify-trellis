
import React, { useState, useMemo } from 'react';
import { DraftPost, SocialActivity, Profile, MarketingEvent } from '../types';
import { SITES_LIST } from '../constants';
import { GoogleGenAI, Type } from "@google/genai";
import { 
  Instagram, Twitter, Linkedin, Sparkles, Send, 
  CheckCircle2, Clock, MessageSquare, Zap, RefreshCw,
  Edit2, XCircle, Loader2, Terminal, Layers, Archive, Rocket, 
  Target, Settings2, CalendarDays, LayoutGrid, List, X, Check, History, Ban, RotateCcw
} from 'lucide-react';

interface SocialHubProps {
  profiles: Profile[];
  setEvents: React.Dispatch<React.SetStateAction<MarketingEvent[]>>;
}

const MOCK_INTENTS: SocialActivity[] = [
  { id: 'sig_1', platform: 'instagram', username: 'garden_guru_99', content: 'Do you ship these to New York? I need that soil kit ASAP!', intent_type: 'buying_intent', profile_matched: true, created_at: new Date().toISOString() },
  { id: 'sig_2', platform: 'instagram', username: 'plantlover_ca', content: 'Price for the indoor bonsai kit?', intent_type: 'buying_intent', profile_matched: false, created_at: new Date().toISOString() },
];

const SocialHub: React.FC<SocialHubProps> = ({ profiles, setEvents }) => {
  const [activeTab, setActiveTab] = useState<'lab' | 'queue' | 'pipeline'>('lab');
  const [pipelineView, setPipelineView] = useState<'board' | 'list' | 'calendar'>('board');
  const [baseContent, setBaseContent] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeDraft, setActiveDraft] = useState<DraftPost | null>(null);
  const [workflowStatus, setWorkflowStatus] = useState<'idle' | 'reviewing'>('idle');
  const [inboundQueue, setInboundQueue] = useState<DraftPost[]>([]);
  const [scheduledPosts, setScheduledPosts] = useState<DraftPost[]>([]);
  const [archivedPosts, setArchivedPosts] = useState<DraftPost[]>([]);
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  const handleGenerateVariants = async (promptOverride?: string) => {
    const promptText = promptOverride || baseContent;
    if (!promptText) return;
    setIsGenerating(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `TASK: Brand Broadcast. SEED: "${promptText}". Generate variants for Instagram, X, and LinkedIn. Return JSON.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: { type: Type.OBJECT, properties: { instagram: { type: Type.STRING }, x: { type: Type.STRING }, linkedin: { type: Type.STRING } }, required: ["instagram", "x", "linkedin"] },
        },
      });

      const result = JSON.parse(response.text || "{}");
      setActiveDraft({ id: `lab_${Date.now()}`, base_content: promptText, versions: result, status: 'drafting', created_at: new Date().toISOString() });
      setWorkflowStatus('reviewing');
    } catch (error) {
      console.error(error);
    } finally { setIsGenerating(false); }
  };

  const handleQuickApprove = (draft: DraftPost) => {
    const newScheduled: DraftPost = { ...draft, status: 'scheduled', scheduled_for: new Date(Date.now() + 86400000).toISOString() };
    setScheduledPosts(prev => [newScheduled, ...prev]);
    setInboundQueue(prev => prev.filter(p => p.id !== draft.id));
    
    // Broadcast back to global timeline
    const event: MarketingEvent = {
        id: `soc_${Date.now()}`,
        profile_id: 'SYSTEM',
        event_type: 'social_intent',
        source: 'instagram',
        payload: { content: draft.base_content },
        created_at: new Date().toISOString()
    };
    setEvents(prev => [event, ...prev]);
    setActiveTab('pipeline');
  };

  const getPlatformIcon = (id: string) => {
    switch (id) {
      case 'instagram': return Instagram;
      case 'x': return Twitter;
      case 'linkedin': return Linkedin;
      default: return MessageSquare;
    }
  };

  return (
    <div className="space-y-8 min-h-screen pb-40">
      <div className="flex bg-slate-200/40 p-1.5 rounded-[2rem] w-fit border border-slate-200 shadow-sm">
        <button onClick={() => setActiveTab('lab')} className={`flex items-center space-x-3 px-8 py-3.5 rounded-[1.5rem] text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'lab' ? 'bg-white text-emerald-700 shadow-lg' : 'text-slate-500 hover:text-slate-800'}`}><Zap size={18} /><span>Lab</span></button>
        <button onClick={() => setActiveTab('queue')} className={`flex items-center space-x-3 px-8 py-3.5 rounded-[1.5rem] text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'queue' ? 'bg-white text-emerald-700 shadow-lg' : 'text-slate-500 hover:text-slate-800'}`}><Terminal size={18} /><span>Queue</span></button>
        <button onClick={() => setActiveTab('pipeline')} className={`flex items-center space-x-3 px-8 py-3.5 rounded-[1.5rem] text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'pipeline' ? 'bg-white text-emerald-700 shadow-lg' : 'text-slate-500 hover:text-slate-800'}`}><CalendarDays size={18} /><span>Pipeline</span></button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 min-h-[700px]">
          {activeTab === 'lab' && (
            <div className="space-y-8 animate-in fade-in duration-500">
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
                    <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Reviewing Draft</h3>
                    <button onClick={() => setWorkflowStatus('idle')} className="p-3 text-slate-300 hover:text-rose-500"><X size={24} /></button>
                  </div>
                  <div className="space-y-8 mb-12">
                    {Object.entries(activeDraft.versions).map(([plat, text]) => (
                        <div key={plat}>
                           <div className="flex items-center space-x-2 text-[10px] font-black uppercase text-slate-400 mb-2">
                             {React.createElement(getPlatformIcon(plat), { size: 14 })}
                             <span>{plat} Strategy</span>
                           </div>
                           <textarea className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-6 text-sm font-medium" value={text} onChange={(e) => setActiveDraft({...activeDraft, versions: {...activeDraft.versions, [plat]: e.target.value}})} />
                        </div>
                    ))}
                  </div>
                  <button onClick={() => handleQuickApprove(activeDraft)} className="w-full py-7 bg-slate-900 text-white rounded-[2.5rem] font-black text-xl flex items-center justify-center space-x-4 shadow-xl hover:bg-emerald-600 transition"><Rocket size={28} className="text-emerald-400" /><span>Add to Global Sync</span></button>
                </div>
              )}
            </div>
          )}
          {activeTab === 'queue' && (
              <div className="py-32 text-center bg-slate-50 border-4 border-dashed border-slate-200 rounded-[4rem]">
                <Rocket size={64} className="mx-auto text-slate-200 mb-6 opacity-40" />
                <p className="text-xl font-black text-slate-400 uppercase tracking-widest">Inbound Queue Clear</p>
                <p className="text-xs text-slate-500 font-bold mt-2">All incoming AI social signals have been orchestrated.</p>
              </div>
          )}
        </div>
        <div className="space-y-8">
           <div className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm">
             <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center mb-10"><Target size={22} className="mr-4 text-pink-500" />Intent Watcher</h3>
             <div className="space-y-6">
              {MOCK_INTENTS.map((intent) => (
                <div key={intent.id} onClick={() => handleGenerateVariants(intent.content)} className="p-8 rounded-[2.5rem] border-2 bg-slate-50 border-slate-100 hover:border-emerald-300 hover:bg-white shadow-sm transition-all cursor-pointer group">
                  <div className="flex items-center space-x-3 mb-4">
                    <div className={`p-2.5 rounded-xl bg-white shadow-sm border border-slate-100 ${intent.platform === 'instagram' ? 'text-pink-500' : 'text-blue-600'}`}>{React.createElement(getPlatformIcon(intent.platform), { size: 18 })}</div>
                    <span className="text-xs font-black text-slate-700 uppercase">@{intent.username}</span>
                  </div>
                  <p className="text-sm text-slate-600 leading-relaxed font-medium italic line-clamp-3">"{intent.content}"</p>
                </div>
              ))}
             </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SocialHub;
