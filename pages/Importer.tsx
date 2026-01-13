
import React, { useState, useMemo } from 'react';
import { Profile } from '../types';
import { 
  Database, Upload, Link, CheckCircle2, ChevronRight, 
  Search, Target, Layout, Send, Zap, Eye, Clock,
  FileText, Sparkles, RefreshCw, Info, ShieldCheck,
  Activity, BarChart3, ArrowRight, Mail, AlertTriangle,
  Layers, Filter, Trash2, Split, Rocket, HelpCircle, X,
  ShieldAlert, Fingerprint, Network
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

interface ImporterProps {
  profiles: Profile[];
  onImportComplete: (newProfiles: Profile[]) => void;
}

const STEPS = [
  { id: 'source', title: 'Source', icon: Database, desc: 'Connect Data' },
  { id: 'map', title: 'Mapping', icon: Split, desc: 'Field Logic' },
  { id: 'audit', title: 'Audit', icon: ShieldCheck, desc: 'Deduplication' },
  { id: 'commit', title: 'Commit', icon: Rocket, desc: 'Global Sync' },
];

const MOCK_IMPORT_BATCH = [
  { email: 'sarah.green@example.com', fname: 'Sarah', site: 'mailchimp_import', tags: ['new_site_tag'] }, // Duplicate
  { email: 'new.gardener@gmail.com', fname: 'Julian', site: 'mailchimp_import', tags: ['subscriber'] }, // New
  { email: 'mike.tech@example.com', fname: 'Mikey', site: 'letsrejoice.app', tags: ['app_user'] }, // Duplicate / Conflict
  { email: 'urban.jungle@outlook.com', fname: 'Chloe', site: 'mailchimp_import', tags: ['urban'] }, // New
];

const Importer: React.FC<ImporterProps> = ({ profiles, onImportComplete }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [sourceType, setSourceType] = useState<'mailchimp' | 'supabase' | 'csv' | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [selectedSegment, setSelectedSegment] = useState('imported_batch');
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [isGeneratingInsight, setIsGeneratingInsight] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const dedupeAudit = useMemo(() => {
    return MOCK_IMPORT_BATCH.map(incoming => {
      const existing = profiles.find(p => p.email === incoming.email);
      if (!existing) return { ...incoming, action: 'create' as const, impact: 'New Identity Added' };
      
      const siteExists = existing.source_sites.includes(incoming.site);
      if (siteExists) return { ...incoming, action: 'skip' as const, impact: 'Exact Duplicate (Skipping)' };
      
      return { ...incoming, action: 'merge' as const, impact: `Merging into existing Hub Profile (${existing.source_sites.length} spokes)` };
    });
  }, [profiles]);

  const stats = useMemo(() => {
    return {
      new: dedupeAudit.filter(a => a.action === 'create').length,
      merged: dedupeAudit.filter(a => a.action === 'merge').length,
      skipped: dedupeAudit.filter(a => a.action === 'skip').length,
    };
  }, [dedupeAudit]);

  const runSageAudit = async () => {
    setIsGeneratingInsight(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analyze this import batch: ${stats.new} new users, ${stats.merged} merged records. 
        Proposed segment: "${selectedSegment}". 
        The context is Sproutify, a multi-site gardening ecosystem. 
        Give a 1-sentence strategic advice for this batch.`,
      });
      setAiInsight(response.text || "Sage engine timeout.");
    } finally {
      setIsGeneratingInsight(false);
    }
  };

  const handleCommitImport = () => {
    setIsProcessing(true);
    let prog = 0;
    const interval = setInterval(() => {
      prog += 5;
      setImportProgress(prog);
      if (prog >= 100) {
        clearInterval(interval);
        
        const newProfiles: Profile[] = dedupeAudit
          .filter(a => a.action === 'create')
          .map(a => ({
            // Added missing Profile properties to fix type error
            id: `p_${crypto.randomUUID()}`,
            email: a.email,
            first_name: a.fname,
            is_subscribed: true,
            marketing_pause: false,
            tags: a.tags,
            segments: [selectedSegment],
            source_sites: [a.site],
            status: 'active',
            ltv: 0,
            churn_risk: 'minimal',
            last_active: new Date().toISOString()
          }));
        
        onImportComplete(newProfiles);
        
        setTimeout(() => {
          setIsProcessing(false);
          setCurrentStep(0);
          setSourceType(null);
          alert(`Success: ${newProfiles.length} Identities Orchestrated.`);
        }, 500);
      }
    }, 100);
  };

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-300">
             <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
               {[
                 { id: 'mailchimp', title: 'Mailchimp API', desc: 'Sync Audience Lists', icon: Mail, color: 'emerald' },
                 { id: 'supabase', title: 'Supabase / SQL', desc: 'Direct DB Ingest', icon: Database, color: 'blue' },
                 { id: 'csv', title: 'Legacy CSV', icon: FileText, desc: 'Local File Upload', color: 'rose' }
               ].map(opt => (
                 <button 
                   key={opt.id}
                   onClick={() => setSourceType(opt.id as any)}
                   className={`group relative text-left p-10 rounded-[3rem] border-4 transition-all duration-300 ${
                     sourceType === opt.id 
                     ? 'border-emerald-500 bg-emerald-50 shadow-2xl scale-105' 
                     : 'border-slate-100 bg-white hover:border-slate-200'
                   }`}
                 >
                   <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-10 transition-transform group-hover:rotate-6 ${
                     sourceType === opt.id ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400 shadow-inner'
                   }`}>
                     {React.createElement(opt.icon as any, { size: 32 })}
                   </div>
                   <h5 className="font-black text-slate-800 text-lg mb-2 uppercase tracking-tight">{opt.title}</h5>
                   <p className="text-xs text-slate-500 leading-relaxed font-medium">{opt.desc}</p>
                 </button>
               ))}
             </div>

             {sourceType && (
               <div className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm animate-in zoom-in-95 duration-500">
                  <div className="flex justify-between items-center mb-8">
                     <h4 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Source Parameters</h4>
                     <span className="text-[10px] font-black text-emerald-600 bg-emerald-100 px-4 py-1 rounded-full uppercase">Authenticated</span>
                  </div>
                  <div className="space-y-6">
                    <div>
                       <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-2">Assign Global Segment</label>
                       <input 
                         className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 text-sm font-bold text-slate-800 focus:bg-white focus:border-emerald-500 outline-none transition shadow-inner"
                         value={selectedSegment}
                         onChange={e => setSelectedSegment(e.target.value)}
                         placeholder="e.g. MAILCHIMP_FALL_2024"
                       />
                    </div>
                  </div>
               </div>
             )}
          </div>
        );
      case 1:
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="bg-white rounded-[3rem] border border-slate-200 shadow-sm overflow-hidden">
               <div className="bg-slate-900 px-10 py-6 flex justify-between items-center">
                  <p className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em]">Field Mapping Logic</p>
                  <p className="text-[10px] font-bold text-slate-400">Incoming Sample: 4 Rows detected</p>
               </div>
               <div className="p-10 space-y-6">
                  {[
                    { source: 'email_address', hub: 'email', status: 'mapped' },
                    { source: 'first_name', hub: 'first_name', status: 'mapped' },
                    { source: 'spoke_origin', hub: 'source_sites', status: 'manual' },
                    { source: 'user_tags', hub: 'tags', status: 'mapped' },
                  ].map((field, idx) => (
                    <div key={idx} className="flex items-center justify-between p-6 bg-slate-50 border border-slate-100 rounded-2xl group hover:border-emerald-300 transition-colors">
                       <div className="flex items-center space-x-12">
                          <div className="space-y-1">
                             <p className="text-[9px] font-black text-slate-400 uppercase">Incoming Field</p>
                             <p className="text-sm font-black text-slate-800 font-mono">{field.source}</p>
                          </div>
                          <ArrowRight className="text-slate-300" />
                          <div className="space-y-1">
                             <p className="text-[9px] font-black text-slate-400 uppercase">Hub Attribute</p>
                             <p className="text-sm font-black text-emerald-600 font-mono">{field.hub}</p>
                          </div>
                       </div>
                       <div className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest ${
                         field.status === 'mapped' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                       }`}>
                         {field.status}
                       </div>
                    </div>
                  ))}
               </div>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="grid grid-cols-3 gap-6">
               {[
                 { label: 'New Identities', value: stats.new, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                 { label: 'Site Merges', value: stats.merged, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                 { label: 'Duplicates Filtered', value: stats.skipped, color: 'text-slate-400', bg: 'bg-slate-50' }
               ].map(stat => (
                 <div key={stat.label} className="bg-white p-8 rounded-[2.5rem] border border-slate-200 text-center">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">{stat.label}</p>
                    <p className={`text-4xl font-black ${stat.color}`}>{stat.value}</p>
                 </div>
               ))}
            </div>

            <div className="bg-white rounded-[3rem] border-4 border-slate-100 overflow-hidden shadow-sm">
               <div className="px-10 py-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">Deduplication Dry-Run</h4>
                  <button onClick={runSageAudit} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center space-x-2">
                    <Sparkles size={12} className="text-emerald-400" />
                    <span>Sage Audit</span>
                  </button>
               </div>
               <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="px-10 py-4 text-[10px] font-black text-slate-400 uppercase">Incoming Identity</th>
                        <th className="px-10 py-4 text-[10px] font-black text-slate-400 uppercase">Ecosystem Impact</th>
                        <th className="px-10 py-4 text-[10px] font-black text-slate-400 uppercase text-right">Result</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                       {dedupeAudit.map((audit, i) => (
                         <tr key={i} className="group hover:bg-slate-50/50 transition-colors">
                           <td className="px-10 py-6">
                              <p className="text-sm font-black text-slate-800">{audit.fname}</p>
                              <p className="text-[10px] text-slate-400 font-mono tracking-tighter">{audit.email}</p>
                           </td>
                           <td className="px-10 py-6 text-[11px] font-bold text-slate-500 uppercase tracking-tight">
                              {audit.impact}
                           </td>
                           <td className="px-10 py-6 text-right">
                              <span className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest ${
                                audit.action === 'create' ? 'bg-emerald-100 text-emerald-700' :
                                audit.action === 'merge' ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-400 opacity-40'
                              }`}>
                                {audit.action}
                              </span>
                           </td>
                         </tr>
                       ))}
                    </tbody>
                  </table>
               </div>
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <div className="bg-white p-12 rounded-[4rem] border-4 border-slate-100 shadow-2xl text-center max-w-2xl mx-auto">
               <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-[2rem] flex items-center justify-center mx-auto mb-10 shadow-lg border border-emerald-200">
                  <ShieldCheck size={48} />
               </div>
               <h3 className="text-3xl font-black text-slate-800 tracking-tight uppercase mb-4">Orchestration Ready</h3>
               <p className="text-slate-500 text-sm font-medium mb-12 leading-relaxed">
                 Identity resolution verified. We will now synchronize <b>{stats.new} new identities</b> and link <b>{stats.merged} existing spokes</b> into the global Sproutify Trellis.
               </p>
               
               <div className="bg-slate-50 p-8 rounded-[2.5rem] border border-slate-100 mb-12 text-left space-y-4">
                  <div className="flex justify-between items-center text-[10px] font-black text-slate-400 uppercase tracking-widest">
                     <span>Deployment Target</span>
                     <span className="text-slate-900 font-black">Sproutify Trellis Hub</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-black text-slate-400 uppercase tracking-widest">
                     <span>Auth Verification</span>
                     <span className="text-emerald-600">PASSED</span>
                  </div>
               </div>

               <button 
                onClick={handleCommitImport}
                className="w-full py-8 bg-slate-900 text-white rounded-[2.5rem] font-black text-2xl flex items-center justify-center space-x-6 shadow-2xl hover:bg-emerald-600 transition active:scale-95 group"
               >
                  <Rocket size={32} className="text-emerald-400 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
                  <span>Execute Global Sync</span>
               </button>
            </div>
          </div>
        );
      default: return null;
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-12 pb-40 relative">
      
      {/* Help Modal Overlay */}
      {showHelp && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in duration-300">
           <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden flex flex-col max-h-[85vh] border border-white/20 scale-in-center">
              <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white">
                 <div className="flex items-center space-x-4">
                    <div className="p-3 bg-emerald-500 rounded-2xl shadow-lg shadow-emerald-500/20 text-white">
                       <HelpCircle size={24} />
                    </div>
                    <div>
                       <h3 className="text-xl font-black uppercase tracking-tight">Ingest Documentation</h3>
                       <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Ecosystem Identity Protocol</p>
                    </div>
                 </div>
                 <button onClick={() => setShowHelp(false)} className="p-2 text-slate-400 hover:text-white transition"><X size={24} /></button>
              </div>
              
              <div className="flex-1 overflow-y-auto p-10 space-y-8 custom-scrollbar bg-slate-50/50">
                 <section className="space-y-4">
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center">
                       <Fingerprint size={16} className="mr-2 text-emerald-600" />
                       Atomic Resolution Logic
                    </h4>
                    <p className="text-sm text-slate-600 leading-relaxed font-medium">
                       Trellis uses <b>Exact Email Matching</b> to prevent duplicate identities across Sproutify spokes. If an incoming email exists in the Hub, we perform a <b>Spoke Merge</b> instead of creating a new record.
                    </p>
                 </section>

                 <section className="space-y-4">
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center">
                       <Network size={16} className="mr-2 text-blue-600" />
                       The 4-Step Pipeline
                    </h4>
                    <div className="grid grid-cols-1 gap-4">
                       {[
                          { title: "1. Source Connection", desc: "Select where the data originates. This sets the 'Primary Spoke' attribute for new identities." },
                          { title: "2. Schema Mapping", desc: "Align external headers (e.g., 'fname') with internal Trellis attributes ('first_name')." },
                          { title: "3. Conflict Audit", desc: "Preview deduplication impact. Identities flagged as 'Merge' will update existing master profiles." },
                          { title: "4. Atomic Sync", desc: "Commit data to the Hub and trigger automated onboarding workflows if applicable." }
                       ].map((item, i) => (
                          <div key={i} className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                             <p className="text-[11px] font-black text-slate-800 mb-1">{item.title}</p>
                             <p className="text-[11px] text-slate-500 font-medium leading-relaxed">{item.desc}</p>
                          </div>
                       ))}
                    </div>
                 </section>

                 <div className="bg-amber-50 border border-amber-100 p-6 rounded-2xl">
                    <div className="flex items-center space-x-2 mb-2">
                       <ShieldAlert size={16} className="text-amber-600" />
                       <p className="text-[10px] font-black text-amber-900 uppercase">Warning</p>
                    </div>
                    <p className="text-[11px] text-amber-700 leading-relaxed font-medium">
                       Commiting a sync is an <b>irreversible</b> operation in the Master Hub. Always perform a 'Dry-Run Audit' (Step 3) before executing the global sync.
                    </p>
                 </div>
              </div>

              <div className="p-8 border-t border-slate-100 bg-white">
                 <button onClick={() => setShowHelp(false)} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-sm uppercase tracking-widest shadow-xl hover:bg-emerald-600 transition">
                    Understood
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* Main Stepper Flow */}
      <div className="lg:col-span-3 space-y-12">
        <div className="flex justify-between items-start relative px-10">
          <div className="absolute top-7 left-20 right-20 h-1 bg-slate-100 -z-10 rounded-full">
             <div className="h-full bg-emerald-500 transition-all duration-700 rounded-full" style={{ width: `${(currentStep / (STEPS.length - 1)) * 100}%` }}></div>
          </div>
          {STEPS.map((step, idx) => {
            const isActive = idx === currentStep;
            const isCompleted = idx < currentStep;
            return (
              <div key={step.id} className="flex flex-col items-center group cursor-pointer" onClick={() => !isProcessing && idx <= currentStep + 1 && setCurrentStep(idx)}>
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500 border-4 shadow-xl ${
                  isActive ? 'bg-slate-900 text-white border-emerald-500 scale-110' : 
                  isCompleted ? 'bg-emerald-600 text-white border-white' : 
                  'bg-white text-slate-300 border-slate-100'
                }`}>
                  {isCompleted ? <CheckCircle2 size={24} /> : <step.icon size={24} />}
                </div>
                <div className="mt-4 text-center">
                  <p className={`text-[10px] font-black uppercase tracking-[0.2em] transition-colors ${isActive ? 'text-slate-900' : 'text-slate-400'}`}>{step.title}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="min-h-[500px]">
          {renderStep()}
        </div>

        <div className="flex justify-between items-center pt-10 border-t border-slate-200">
           <button onClick={() => setCurrentStep(Math.max(0, currentStep - 1))} disabled={currentStep === 0 || isProcessing} className="px-10 py-5 flex items-center space-x-3 text-slate-500 font-black text-[10px] uppercase tracking-widest hover:text-slate-800 transition disabled:opacity-0 group">
              <ArrowRight className="rotate-180" size={16} />
              <span>Back</span>
           </button>

           {currentStep < STEPS.length - 1 && (
             <button 
               onClick={() => setCurrentStep(currentStep + 1)} 
               disabled={(currentStep === 0 && !sourceType) || isProcessing} 
               className="px-12 py-5 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest flex items-center space-x-3 shadow-xl hover:bg-emerald-600 transition disabled:opacity-50"
             >
                <span>Continue</span>
                <ArrowRight size={16} />
             </button>
           )}
        </div>
      </div>

      {/* Strategic Side Panel */}
      <div className="lg:col-span-1 space-y-8">
         <div className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm min-h-[500px] flex flex-col relative overflow-hidden">
            {/* Help Trigger Icon */}
            <button 
              onClick={() => setShowHelp(true)}
              className="absolute top-8 right-8 text-slate-300 hover:text-emerald-500 transition-colors p-2"
              title="Identity Protocol Help"
            >
               <HelpCircle size={24} />
            </button>

            <div className="flex items-center space-x-4 mb-10 pb-10 border-b border-slate-100">
               <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center shadow-lg border border-indigo-100">
                  <ShieldCheck size={24} />
               </div>
               <div>
                  <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Identity Auditor</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Site Resolution Active</p>
               </div>
            </div>

            <div className="flex-1 space-y-10 animate-in fade-in slide-in-from-right-4 duration-500">
               <div className="space-y-4">
                  <div className="flex items-center space-x-2">
                     <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                     <h4 className="text-[11px] font-black text-slate-800 uppercase tracking-widest">Ecosystem Insight</h4>
                  </div>
                  {isGeneratingInsight ? (
                     <div className="flex flex-col items-center justify-center py-10 space-y-4 text-center">
                        <RefreshCw className="animate-spin text-emerald-500" />
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Consulting Sage Intelligence...</p>
                     </div>
                  ) : aiInsight ? (
                     <p className="text-sm font-medium text-slate-600 leading-relaxed italic border-l-2 border-emerald-500 pl-4 py-1">
                        "{aiInsight}"
                     </p>
                  ) : (
                     <p className="text-[11px] text-slate-400 font-medium italic">
                        Select a source to begin identity auditing. Click the <b>?</b> icon for protocol details.
                     </p>
                  )}
               </div>

               <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-100 space-y-6">
                  <div className="flex justify-between items-center text-[10px] font-black text-slate-400 uppercase tracking-widest">
                     <span>Batch Health</span>
                     <span className="text-emerald-600">Optimal</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden shadow-inner">
                     <div className="h-full bg-emerald-500 transition-all duration-1000" style={{ width: sourceType ? '100%' : '0%' }}></div>
                  </div>
                  <div className="flex items-center space-x-3">
                     <Info size={14} className="text-slate-400" />
                     <p className="text-[9px] font-bold text-slate-500 leading-tight">
                        Deduping logic uses Atomic Resolution on primary email addresses.
                     </p>
                  </div>
               </div>
            </div>

            <div className="pt-10 border-t border-slate-100 mt-auto">
               <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden group hover:bg-emerald-950 transition-all">
                  <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">
                     <Database size={80} />
                  </div>
                  <p className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em] mb-3">Ingest Status</p>
                  <p className="text-[11px] font-medium leading-relaxed italic mb-8">
                     "Synchronizing identities from Mailchimp can trigger automated onboarding flows for new Gardeners."
                  </p>
                  <div className="flex items-center text-[10px] font-black text-emerald-400 uppercase tracking-widest cursor-pointer group-hover:translate-x-1 transition-transform">
                     <span>View Webhook Specs</span>
                     <ArrowRight size={14} className="ml-2" />
                  </div>
               </div>
            </div>
         </div>
      </div>

      {isProcessing && (
        <div className="fixed inset-0 bg-slate-900/95 backdrop-blur-xl z-[200] flex flex-col items-center justify-center text-white p-8 text-center animate-in fade-in duration-500">
           <div className="relative mb-12">
              <div className="absolute inset-0 bg-emerald-500 rounded-full blur-[120px] opacity-20 animate-pulse"></div>
              <Activity size={80} className="text-emerald-400 animate-pulse relative z-10" />
           </div>
           <h2 className="text-5xl font-black mb-6 tracking-tighter uppercase italic">Atomic Sync in Progress...</h2>
           <div className="w-full max-w-xl bg-white/10 rounded-full h-4 overflow-hidden mb-8 border border-white/5 shadow-2xl">
              <div className="bg-emerald-500 h-full transition-all duration-300 relative" style={{ width: `${importProgress}%` }}>
                 <div className="absolute inset-0 bg-white/40 animate-pulse"></div>
              </div>
           </div>
           <div className="flex flex-col items-center space-y-4">
              <p className="text-sm font-black uppercase tracking-[0.4em] text-emerald-400 animate-pulse">{importProgress}% Synchronized</p>
              <p className="text-xs font-bold text-slate-400 max-w-sm">Resolving site-specific tags, deduplicating master identities, and establishes Resend gateway links...</p>
           </div>
        </div>
      )}
    </div>
  );
};

export default Importer;
