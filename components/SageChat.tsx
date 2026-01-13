
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  Sparkles, X, Send, User, RefreshCw, Bot, 
  Maximize2, Minimize2, Info, Target, 
  Activity, MessageSquare, ArrowRight,
  ShieldCheck, Zap, ChevronRight, BarChart3,
  Search, ExternalLink, HelpCircle
} from 'lucide-react';
import { ChatMessage, LlmProvider, Brand, Ticket, Profile } from '../types';
import { chatWithSage } from '../services/aiService';
import { MOCK_TICKETS, MOCK_PROFILES } from '../constants';

interface SageChatProps {
  provider?: LlmProvider;
  brand?: Brand;
}

// Stylized Icon Component with Purple-Pink Gradient Background
const SageIcon = ({ size = 24, className = "" }: { size?: number, className?: string }) => (
  <div 
    className={`flex items-center justify-center rounded-2xl shadow-lg transition-transform hover:scale-105 ${className}`}
    style={{ 
      width: size * 1.8, 
      height: size * 1.8,
      background: 'linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%)' 
    }}
  >
    <Sparkles size={size} className="text-white fill-white/20" />
  </div>
);

const SageChat: React.FC<SageChatProps> = ({ provider = 'gemini', brand }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'sage', content: `Hello! I'm Sage, the strategic engine for ${brand?.name || 'this brand'}. How can I help you orchestrate your marketing and support today?`, timestamp: new Date().toISOString() }
  ]);
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isTyping, isOpen, isMaximized]);

  // DERIVED CONTEXTUAL DATA
  const contextualInsights = useMemo(() => {
    const fullText = messages.map(m => m.content.toLowerCase()).join(' ');
    
    const relevantTickets = MOCK_TICKETS.filter(t => {
      const keywords = [...t.subject.toLowerCase().split(' '), ...t.description.toLowerCase().split(' ')];
      return keywords.some(k => k.length > 3 && fullText.includes(k));
    });

    const relevantProfiles = MOCK_PROFILES.filter(p => 
      fullText.includes(p.first_name.toLowerCase()) || 
      fullText.includes(p.email.toLowerCase())
    );

    let dynamicQuestions = [
      "Analyze cross-site behavior for these users",
      "Draft a recovery email for recent ticket issues",
      "Predict LTV impact of this conversation"
    ];

    if (fullText.includes('farm')) dynamicQuestions.unshift("Check Farm spoke inventory for these customers");
    if (fullText.includes('refund') || fullText.includes('problem')) dynamicQuestions.unshift("Calculate refund rate impact on Sproutify Hub");
    if (fullText.includes('mike') || fullText.includes('sarah')) dynamicQuestions.unshift("Compare purchase history for mentioned identities");

    return {
      tickets: relevantTickets,
      profiles: relevantProfiles,
      questions: dynamicQuestions.slice(0, 4)
    };
  }, [messages]);

  const handleSend = async (e?: React.FormEvent, customMsg?: string) => {
    if (e) e.preventDefault();
    const text = customMsg || input;
    if (!text.trim() || isTyping) return;

    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    if (!isMaximized && messages.length < 3) {
      setTimeout(() => setIsMaximized(true), 500);
    }

    const response = await chatWithSage(messages, text, provider as LlmProvider, { 
      tickets: MOCK_TICKETS, 
      brandName: brand?.name || 'Trellis' 
    });
    
    const sageMsg: ChatMessage = { role: 'sage', content: response, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, sageMsg]);
    setIsTyping(false);
  };

  const toggleMaximize = () => setIsMaximized(!isMaximized);

  if (!isOpen) {
    return (
      <button 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-8 right-8 w-16 h-16 rounded-full flex items-center justify-center text-white shadow-2xl hover:scale-110 transition-transform z-50 group border-4 border-white overflow-hidden p-0"
        style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%)' }}
      >
        <Sparkles size={28} className="group-hover:rotate-12 transition-transform relative z-10 text-white" />
        <div className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full border-2 border-white animate-pulse"></div>
      </button>
    );
  }

  if (isMaximized) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/80 backdrop-blur-xl animate-in fade-in duration-300">
        <div className="bg-white w-full max-w-6xl h-[85vh] rounded-[3.5rem] shadow-2xl overflow-hidden flex flex-col border border-white/20 animate-in zoom-in-95 duration-500">
          
          <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
            <div className="flex items-center space-x-6">
              <SageIcon size={24} />
              <div>
                <h2 className="text-2xl font-black text-slate-800 tracking-tight uppercase">Strategic Hub</h2>
                <div className="flex items-center space-x-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <span className="flex items-center text-emerald-600"><Zap size={10} className="mr-1" /> {provider.toUpperCase()} Engine Active</span>
                  <span>•</span>
                  <span>Contextual Analysis Engaged</span>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <button onClick={toggleMaximize} className="p-3 bg-slate-100 text-slate-400 rounded-xl hover:text-slate-900 transition"><Minimize2 size={20} /></button>
              <button onClick={() => {setIsOpen(false); setIsMaximized(false);}} className="p-3 bg-slate-100 text-slate-400 rounded-xl hover:text-rose-500 transition"><X size={20} /></button>
            </div>
          </div>

          <div className="flex-1 flex min-h-0">
            <div className="flex-1 flex flex-col bg-slate-50/50 relative border-r border-slate-100">
               <div ref={scrollRef} className="flex-1 overflow-y-auto p-10 space-y-6 custom-scrollbar">
                  {messages.map((m, idx) => (
                    <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 duration-300`}>
                      <div className={`max-w-[80%] p-6 rounded-3xl text-sm leading-relaxed ${
                        m.role === 'user' 
                        ? 'bg-slate-900 text-white rounded-tr-none shadow-xl' 
                        : 'bg-white text-slate-700 border border-slate-200 rounded-tl-none shadow-sm'
                      }`} style={m.role === 'user' ? { backgroundColor: brand?.primaryColor || '#1e293b' } : {}}>
                        <p className="font-semibold whitespace-pre-wrap">{m.content}</p>
                        <p className={`text-[8px] mt-3 font-black uppercase opacity-40 ${m.role === 'user' ? 'text-white' : 'text-slate-400'}`}>
                          {m.role === 'user' ? 'Strategic Query' : 'Intelligence Response'} • {new Date(m.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </p>
                      </div>
                    </div>
                  ))}
                  {isTyping && (
                    <div className="flex justify-start">
                      <div className="bg-white p-6 rounded-3xl rounded-tl-none border border-slate-200 shadow-sm flex items-center space-x-3">
                        <div className="flex space-x-1">
                          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce"></div>
                          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce [animation-delay:0.2s]"></div>
                          <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce [animation-delay:0.4s]"></div>
                        </div>
                        <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Sage is Thinking...</span>
                      </div>
                    </div>
                  )}
               </div>

               <div className="p-8 bg-white border-t border-slate-100">
                  <form onSubmit={handleSend} className="relative flex items-center">
                    <input 
                      autoFocus
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl pl-6 pr-20 py-5 text-base font-medium focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 outline-none transition-all shadow-inner"
                      placeholder="Ask for deeper strategic analysis or ecosystem correlation..."
                      value={input}
                      onChange={e => setInput(e.target.value)}
                    />
                    <button 
                      type="submit"
                      disabled={!input.trim() || isTyping}
                      className="absolute right-4 w-12 h-12 rounded-xl flex items-center justify-center text-white shadow-lg transition-all disabled:opacity-30 active:scale-90 z-20"
                      style={{ backgroundColor: brand?.primaryColor || '#10b981' }}
                    >
                      <Send size={20} />
                    </button>
                  </form>
               </div>
            </div>

            <div className="w-[420px] bg-white p-8 overflow-y-auto custom-scrollbar flex flex-col space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
              <div className="space-y-4">
                 <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center">
                    <Activity size={12} className="mr-2 text-rose-500" />
                    Relevant Support Context
                 </h4>
                 {contextualInsights.tickets.length > 0 ? (
                    <div className="space-y-3">
                       {contextualInsights.tickets.map(t => (
                          <div key={t.id} className="p-4 bg-rose-50/50 rounded-2xl border border-rose-100 transition hover:bg-rose-50 cursor-pointer group">
                             <div className="flex justify-between items-start mb-2">
                                <span className="text-[9px] font-black uppercase text-rose-600 tracking-tighter">Ticket {t.id}</span>
                                <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase ${
                                   t.priority === 'urgent' ? 'bg-rose-500 text-white' : 'bg-rose-100 text-rose-600'
                                }`}>{t.priority}</span>
                             </div>
                             <p className="text-xs font-bold text-slate-800 line-clamp-1 mb-1">{t.subject}</p>
                             <p className="text-[10px] text-slate-500 line-clamp-2 italic leading-relaxed">"{t.description}"</p>
                          </div>
                       ))}
                    </div>
                 ) : (
                    <div className="p-6 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 opacity-60">
                       <HelpCircle size={24} className="mx-auto text-slate-300 mb-2" />
                       <p className="text-[10px] font-black text-slate-400 uppercase">No direct ticket overlap found</p>
                    </div>
                 )}
              </div>

              <div className="space-y-4">
                 <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center">
                    <Target size={12} className="mr-2 text-indigo-500" />
                    Conversation Identities
                 </h4>
                 {contextualInsights.profiles.length > 0 ? (
                    <div className="space-y-3">
                       {contextualInsights.profiles.map(p => (
                          <div key={p.email} className="flex items-center space-x-4 p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100">
                             <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center font-black text-sm">
                                {p.first_name.charAt(0)}
                             </div>
                             <div className="flex-1 min-w-0">
                                <p className="text-xs font-black text-slate-800 uppercase">{p.first_name}</p>
                                <p className="text-[9px] text-indigo-600 font-bold truncate">{p.email}</p>
                             </div>
                             <ExternalLink size={14} className="text-indigo-400 hover:text-indigo-600 cursor-pointer" />
                          </div>
                       ))}
                    </div>
                 ) : (
                    <div className="bg-indigo-50/30 p-5 rounded-2xl border border-indigo-100/50">
                       <div className="flex items-center space-x-3 mb-2">
                          <ShieldCheck size={16} className="text-indigo-600" />
                          <span className="text-[10px] font-black text-indigo-900 uppercase">Identity Guard Active</span>
                       </div>
                       <p className="text-[11px] text-indigo-700 leading-relaxed font-medium">
                          Monitoring for profile mentions. Ask about specific customers like "Sarah" or "Mike" for drill-down context.
                       </p>
                    </div>
                 )}
              </div>

              <div className="space-y-4 flex-1">
                 <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center">
                    <MessageSquare size={12} className="mr-2 text-amber-500" />
                    Strategic Extensions
                 </h4>
                 <div className="space-y-2">
                    {contextualInsights.questions.map((q, i) => (
                      <button 
                        key={i}
                        onClick={() => handleSend(undefined, q)}
                        className="w-full p-4 text-left bg-white border border-slate-100 rounded-2xl text-[11px] font-bold text-slate-600 hover:border-emerald-500 hover:bg-emerald-50 transition-all flex items-center justify-between group shadow-sm"
                      >
                        <span className="line-clamp-2">{q}</span>
                        <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity text-emerald-600 shrink-0 ml-2" />
                      </button>
                    ))}
                 </div>
              </div>

              <div className="pt-6 border-t border-slate-100">
                 <div className="p-4 bg-slate-900 rounded-2xl text-white shadow-xl flex items-center justify-between group cursor-pointer hover:bg-emerald-950 transition">
                    <div className="flex items-center space-x-3">
                       <BarChart3 size={18} className="text-emerald-400 group-hover:scale-110 transition-transform" />
                       <span className="text-[10px] font-black uppercase tracking-widest">Ecosystem Report</span>
                    </div>
                    <ArrowRight size={14} className="text-emerald-400" />
                 </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-8 right-8 w-96 h-[500px] bg-white rounded-[2.5rem] shadow-[0_35px_60px_-15px_rgba(0,0,0,0.3)] flex flex-col overflow-hidden z-[60] animate-in slide-in-from-bottom-8 duration-300 border border-slate-100">
      <div className="p-6 bg-slate-900 text-white flex items-center justify-between" style={{ backgroundColor: brand?.primaryColor || '#1e293b' }}>
        <div className="flex items-center space-x-3">
          <div 
            className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #8B5CF6 0%, #EC4899 100%)' }}
          >
            <Sparkles size={20} className="text-white" />
          </div>
          <div>
            <h4 className="text-sm font-black uppercase tracking-widest">Sage Assistant</h4>
            <p className="text-[10px] text-white/60 font-bold uppercase">{brand?.name || 'Trellis'} Context</p>
          </div>
        </div>
        <div className="flex items-center space-x-1">
          <button onClick={toggleMaximize} className="p-2 text-white/40 hover:text-white transition"><Maximize2 size={16} /></button>
          <button onClick={() => setIsOpen(false)} className="p-2 text-white/40 hover:text-rose-400 transition"><X size={20} /></button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50 custom-scrollbar">
        {messages.map((m, idx) => (
          <div key={idx} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] p-4 rounded-2xl text-xs leading-relaxed ${
              m.role === 'user' 
              ? 'bg-slate-900 text-white rounded-tr-none' 
              : 'bg-white text-slate-700 border border-slate-200 rounded-tl-none shadow-sm'
            }`} style={m.role === 'user' ? { backgroundColor: brand?.primaryColor || '#1e293b' } : {}}>
              <p className="whitespace-pre-wrap font-medium">{m.content}</p>
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="flex justify-start">
            <div className="bg-white p-4 rounded-2xl rounded-tl-none border border-slate-200 shadow-sm flex items-center space-x-1">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce"></div>
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce [animation-delay:0.2s]"></div>
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce [animation-delay:0.4s]"></div>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSend} className="p-4 border-t border-slate-100 bg-white">
        <div className="relative flex items-center">
          <input 
            autoFocus
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-16 py-4 text-sm focus:ring-2 outline-none shadow-inner"
            placeholder="Ask Sage anything..."
            value={input}
            onChange={e => setInput(e.target.value)}
          />
          <button 
            type="submit"
            disabled={!input.trim() || isTyping}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 text-white rounded-lg transition disabled:opacity-30 z-20 shadow-sm flex items-center justify-center p-0"
            style={{ backgroundColor: brand?.primaryColor || '#10b981' }}
          >
            <Send size={18} />
          </button>
        </div>
        <div className="mt-3 flex justify-center">
           <button 
             type="button"
             onClick={toggleMaximize}
             className="text-[9px] font-black text-slate-400 uppercase tracking-widest hover:text-emerald-600 transition flex items-center"
           >
              <Info size={10} className="mr-1" /> Open Full Strategic Hub
           </button>
        </div>
      </form>
    </div>
  );
};

export default SageChat;
