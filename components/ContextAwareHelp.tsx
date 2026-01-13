
import React, { useState, useEffect } from 'react';
import { ViewState } from '../types';
import { 
  HelpCircle, X, ChevronRight, Book, 
  Lightbulb, Zap, ArrowRight, ShieldCheck,
  Terminal, Search
} from 'lucide-react';

interface ContextHelpProps {
  activeView: ViewState;
}

const HELP_MAP: Record<string, { title: string, items: { label: string, icon: any }[] }> = {
  'dashboard': {
    title: 'Ecosystem Pulse',
    items: [
      { label: 'Understanding Spoke Distribution', icon: Lightbulb },
      { label: 'Active Strategy Definitions', icon: Book }
    ]
  },
  'profiles': {
    title: 'Identity Matching',
    items: [
      { label: 'The Atomic Merge Logic', icon: ShieldCheck },
      { label: 'Bulk Exporting Master IDs', icon: Zap },
      { label: 'Identity Lock Protocol', icon: HelpCircle }
    ]
  },
  'campaign-builder': {
    title: 'Deployment Strategy',
    items: [
      { label: 'Variable Token Syntax', icon: Terminal },
      { label: 'Resend Gateway Throttling', icon: Zap },
      { label: 'Dynamic Module Stacking', icon: Book }
    ]
  },
  'automations': {
    title: 'Orchestration Rules',
    items: [
      { label: 'Trigger Weighting', icon: Lightbulb },
      { label: 'Webhook Loop Prevention', icon: ShieldCheck }
    ]
  },
  'social-hub': {
    title: 'Social Intent Engine',
    items: [
      { label: 'Listening Spoke Setup', icon: Zap },
      { label: 'AI Response Compliance', icon: ShieldCheck }
    ]
  },
  'reports': {
    title: 'Strategic Audits',
    items: [
      { label: 'Metric Correlation Math', icon: Terminal },
      { label: 'Spoke Benchmarking', icon: Book }
    ]
  }
};

const ContextAwareHelp: React.FC<ContextHelpProps> = ({ activeView }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [hasNewTip, setHasNewTip] = useState(false);

  useEffect(() => {
    if (activeView !== 'help-center') {
      setHasNewTip(true);
      const timer = setTimeout(() => setHasNewTip(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [activeView]);

  const helpContext = HELP_MAP[activeView];

  if (activeView === 'help-center') return null;

  return (
    <div className="fixed bottom-32 right-8 z-[80] flex flex-col items-end pointer-events-none">
      
      {/* Dynamic Popover */}
      {isOpen && helpContext && (
        <div className="mb-6 w-80 bg-white rounded-[2.5rem] shadow-2xl border border-slate-200 overflow-hidden animate-in slide-in-from-bottom-4 duration-300 pointer-events-auto">
           <div className="p-6 bg-slate-900 text-white flex justify-between items-center">
              <div className="flex items-center space-x-3">
                 <div className="w-8 h-8 bg-emerald-500 rounded-lg flex items-center justify-center text-white shadow-lg"><Lightbulb size={18} /></div>
                 <h4 className="text-xs font-black uppercase tracking-widest">{helpContext.title} Tips</h4>
              </div>
              <button onClick={() => setIsOpen(false)} className="p-2 text-slate-500 hover:text-white transition"><X size={18} /></button>
           </div>
           <div className="p-6 space-y-3">
              {helpContext.items.map((item, i) => (
                <button key={i} className="w-full p-4 bg-slate-50 hover:bg-emerald-50 border border-slate-100 rounded-2xl text-left flex items-center justify-between group transition-all">
                   <div className="flex items-center space-x-3">
                      <div className="text-slate-400 group-hover:text-emerald-600 transition"><item.icon size={16} /></div>
                      <span className="text-[11px] font-bold text-slate-600 group-hover:text-slate-900 transition">{item.label}</span>
                   </div>
                   <ArrowRight size={14} className="opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all text-emerald-600" />
                </button>
              ))}
              <div className="pt-4 mt-4 border-t border-slate-100">
                 <button className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-emerald-600 transition flex items-center justify-center w-full">
                    Open Full Academy Guide
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* Floating Action Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className={`pointer-events-auto w-12 h-12 rounded-2xl flex items-center justify-center shadow-xl transition-all duration-500 relative group border-2 ${
          isOpen ? 'bg-slate-900 text-emerald-400 border-slate-800' : 'bg-white text-slate-400 border-slate-100 hover:border-emerald-300 hover:text-emerald-600'
        }`}
      >
         {isOpen ? <X size={20} /> : <HelpCircle size={24} />}
         
         {!isOpen && hasNewTip && (
           <div className="absolute -top-12 right-0 bg-emerald-600 text-white px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-xl animate-in slide-in-from-bottom-2 duration-300">
              New Tips for {activeView.replace('-', ' ')}
              <div className="absolute bottom-[-4px] right-5 w-2 h-2 bg-emerald-600 rotate-45"></div>
           </div>
         )}
      </button>
    </div>
  );
};

export default ContextAwareHelp;
