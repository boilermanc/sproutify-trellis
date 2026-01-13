
import React, { useState, useMemo } from 'react';
import { FAQ, KnowledgeDoc } from '../types';
import CustomerSitesTag from '../components/CustomerSitesTag';
import { GoogleGenAI } from "@google/genai";
import { 
  BookOpen, Plus, Search, Filter, Globe, 
  ShieldCheck, Zap, Sparkles, RefreshCw, 
  FileText, MessageCircle, ChevronRight, 
  MoreVertical, Clock, CheckCircle2, 
  AlertTriangle, ArrowUpRight, X, Edit3, 
  Trash2, Layers, Cpu, Database
} from 'lucide-react';

const MOCK_DOCS: KnowledgeDoc[] = [
  { id: 'doc_1', title: 'Hydroponic pH Calibration Guide', content: 'Detailed instructions on setting up pH sensors for the Sproutify Smart App...', category: 'troubleshooting', sites: ['farm.sproutify.app', 'micro.sproutify.app'], status: 'indexed', last_updated: '2023-11-24T10:00:00Z', author: 'Dr. Green' },
  { id: 'doc_2', title: 'Urban Farm Workshop FAQ', content: 'Everything a new student needs to know about attending the downtown plant exchange...', category: 'onboarding', sites: ['school.sproutify.app'], status: 'indexed', last_updated: '2023-12-01T14:30:00Z', author: 'Elara Vance' },
  { id: 'doc_3', title: 'Refund Policy: Sproutify Hub', content: 'Global refund policy for all Sproutify ecosystem sites and subscriptions...', category: 'policy', sites: ['Global'], status: 'stale', last_updated: '2023-09-15T09:15:00Z', author: 'Legal Team' },
];

const MOCK_FAQS: FAQ[] = [
  { id: 'faq_1', question: 'How do I link my smart sensor?', answer: 'Open the Sproutify App, go to Settings > Devices and click the sync button.', category: 'Technical', sites: ['farm.sproutify.app'], last_updated: '2023-11-20T00:00:00Z', status: 'indexed' },
  { id: 'faq_2', question: 'Can I cancel my school subscription?', answer: 'Yes, cancellations are handled through the School dashboard under the Billing tab.', category: 'Account', sites: ['school.sproutify.app'], last_updated: '2023-10-12T00:00:00Z', status: 'indexed' },
];

const KnowledgeBase: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'docs' | 'faqs'>('docs');
  const [searchTerm, setSearchTerm] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [isAuditing, setIsAuditing] = useState(false);
  const [auditInsight, setAuditInsight] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  
  const filteredDocs = useMemo(() => {
    return MOCK_DOCS.filter(doc => 
      doc.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.category.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm]);

  const filteredFaqs = useMemo(() => {
    return MOCK_FAQS.filter(faq => 
      faq.question.toLowerCase().includes(searchTerm.toLowerCase()) ||
      faq.category.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm]);

  const handleGlobalSync = async () => {
    setIsSyncing(true);
    // Simulate RAG Indexing Process
    await new Promise(r => setTimeout(r, 3000));
    setIsSyncing(false);
    alert("Knowledge Index Rebuilt. Sage Intelligence has been updated with latest context.");
  };

  const runKnowledgeAudit = async () => {
    setIsAuditing(true);
    setAuditInsight(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analyze this knowledge base summary: ${MOCK_DOCS.length} docs, ${MOCK_FAQS.length} FAQs. Top categories: troubleshooting, onboarding.
        Provide a 1-sentence strategic recommendation for what content is missing for a gardening agtech ecosystem.`,
      });
      setAuditInsight(response.text || "Unable to resolve audit patterns.");
    } catch (e) {
      setAuditInsight("Sage Strategic core is temporarily offline.");
    } finally {
      setIsAuditing(false);
    }
  };

  return (
    <div className="space-y-8 pb-40 animate-in fade-in duration-500">
      
      {/* Top Knowledge Toolbar */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex bg-slate-200/40 p-1.5 rounded-[2rem] border border-slate-200 shadow-inner">
          <button 
            onClick={() => setActiveTab('docs')}
            className={`flex items-center space-x-3 px-8 py-3 rounded-[1.5rem] text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'docs' ? 'bg-white text-emerald-700 shadow-lg' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <FileText size={18} />
            <span>Support Docs</span>
          </button>
          <button 
            onClick={() => setActiveTab('faqs')}
            className={`flex items-center space-x-3 px-8 py-3 rounded-[1.5rem] text-xs font-black uppercase tracking-widest transition-all ${activeTab === 'faqs' ? 'bg-white text-emerald-700 shadow-lg' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <MessageCircle size={18} />
            <span>FAQ Library</span>
          </button>
        </div>

        <div className="flex items-center space-x-4">
           <button 
             onClick={handleGlobalSync}
             disabled={isSyncing}
             className="px-6 py-3.5 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center space-x-3 hover:bg-emerald-600 transition-all shadow-xl disabled:opacity-50"
           >
              {isSyncing ? <RefreshCw className="animate-spin" size={16} /> : <Database size={16} className="text-emerald-400" />}
              <span>{isSyncing ? 'Indexing...' : 'Sync to RAG Engine'}</span>
           </button>
           <button 
            onClick={() => setShowEditor(true)}
            className="px-6 py-3.5 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center space-x-3 hover:bg-emerald-700 transition-all shadow-xl"
          >
              <Plus size={16} />
              <span>Create Record</span>
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Main Content Area */}
        <div className="lg:col-span-3 space-y-6">
           <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm">
              <div className="relative mb-10">
                 <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300" size={20} />
                 <input 
                   className="w-full pl-16 pr-8 py-5 bg-slate-50 border-2 border-slate-100 rounded-3xl text-sm font-bold focus:bg-white focus:border-emerald-500 transition-all shadow-inner outline-none"
                   placeholder={`Search ${activeTab === 'docs' ? 'support documents' : 'FAQs'} by title, content or site tags...`}
                   value={searchTerm}
                   onChange={e => setSearchTerm(e.target.value)}
                 />
              </div>

              <div className="space-y-4">
                 {activeTab === 'docs' ? (
                   filteredDocs.map(doc => (
                     <div key={doc.id} className="group p-6 bg-white border border-slate-100 rounded-[2rem] hover:border-emerald-400 hover:shadow-xl hover:shadow-emerald-900/5 transition-all flex items-center justify-between">
                        <div className="flex items-center space-x-6">
                           <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-inner ${
                             doc.status === 'indexed' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                           }`}>
                              <FileText size={24} />
                           </div>
                           <div>
                              <div className="flex items-center space-x-3 mb-1">
                                 <h4 className="text-base font-black text-slate-800 uppercase tracking-tight">{doc.title}</h4>
                                 <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full border ${
                                   doc.status === 'indexed' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : 'bg-amber-100 text-amber-700 border-amber-200'
                                 }`}>
                                   {doc.status === 'indexed' ? 'Live in RAG' : 'Stale Context'}
                                 </span>
                              </div>
                              <div className="flex items-center space-x-4">
                                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{doc.category}</p>
                                 <span className="text-slate-200">•</span>
                                 <CustomerSitesTag sites={doc.sites} />
                              </div>
                           </div>
                        </div>
                        <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                           <button className="p-3 text-slate-400 hover:text-emerald-600 transition"><Edit3 size={18} /></button>
                           <button className="p-3 text-slate-400 hover:text-rose-500 transition"><Trash2 size={18} /></button>
                           <button className="p-3 text-slate-400 hover:text-slate-900 transition"><ChevronRight size={18} /></button>
                        </div>
                     </div>
                   ))
                 ) : (
                   filteredFaqs.map(faq => (
                     <div key={faq.id} className="group p-6 bg-white border border-slate-100 rounded-[2rem] hover:border-indigo-400 hover:shadow-xl hover:shadow-indigo-900/5 transition-all">
                        <div className="flex justify-between items-start mb-4">
                           <div className="flex items-center space-x-4">
                              <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl">
                                 <MessageCircle size={20} />
                              </div>
                              <div>
                                 <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">{faq.question}</h4>
                                 <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{faq.category} • {faq.sites[0]}</p>
                              </div>
                           </div>
                           <span className="text-[10px] font-black text-slate-300 uppercase">{new Date(faq.last_updated).toLocaleDateString()}</span>
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed pl-14 italic">"{faq.answer}"</p>
                     </div>
                   ))
                 )}
              </div>
           </div>
        </div>

        {/* Knowledge Sidebar */}
        <div className="lg:col-span-1 space-y-8">
           <div className="bg-slate-900 p-8 rounded-[3rem] text-white shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                 <Cpu size={120} className="text-emerald-400" />
              </div>
              <h3 className="text-xs font-black uppercase tracking-[0.2em] text-emerald-400 mb-8 flex items-center">
                 <Layers size={18} className="mr-3" />
                 Index Health
              </h3>
              <div className="space-y-6 relative z-10">
                 <div className="bg-white/5 border border-white/10 p-5 rounded-2xl backdrop-blur-md">
                    <div className="flex justify-between items-center mb-3">
                       <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Knowledge Load</span>
                       <span className="text-xs font-black text-emerald-400">1.4 MB</span>
                    </div>
                    <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden shadow-inner">
                       <div className="h-full bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.5)]" style={{ width: '88%' }}></div>
                    </div>
                 </div>
                 <div className="grid grid-cols-2 gap-4">
                    <div className="bg-white/5 border border-white/10 p-4 rounded-2xl text-center">
                       <p className="text-[9px] font-black text-slate-500 uppercase tracking-tighter mb-1">RAG Ready</p>
                       <p className="text-xl font-black text-white">12</p>
                    </div>
                    <div className="bg-white/5 border border-white/10 p-4 rounded-2xl text-center">
                       <p className="text-[9px] font-black text-slate-500 uppercase tracking-tighter mb-1">Stale Docs</p>
                       <p className="text-xl font-black text-amber-400">2</p>
                    </div>
                 </div>
              </div>
           </div>

           <div className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm flex flex-col min-h-[400px]">
              <div className="flex items-center space-x-3 mb-10 border-b border-slate-50 pb-10">
                 <div className="w-10 h-10 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-sm border border-indigo-100"><Sparkles size={20} /></div>
                 <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Sage Knowledge Audit</h3>
              </div>

              <div className="flex-1 space-y-10">
                 <div className="space-y-4">
                    <div className="flex items-center space-x-2">
                       <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                       <h4 className="text-[11px] font-black text-slate-800 uppercase tracking-widest">Knowledge Gap Discovery</h4>
                    </div>
                    {isAuditing ? (
                      <div className="py-12 flex flex-col items-center justify-center text-center space-y-4">
                        <RefreshCw className="animate-spin text-emerald-500" />
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Scanning support load...</p>
                      </div>
                    ) : auditInsight ? (
                      <p className="text-sm font-medium text-slate-600 leading-relaxed italic border-l-2 border-emerald-500 pl-4 py-1">
                        "{auditInsight}"
                      </p>
                    ) : (
                      <p className="text-[11px] text-slate-400 font-medium italic">
                        Sage is ready to analyze your support tickets against your knowledge base.
                      </p>
                    )}
                 </div>
                 
                 <button 
                  onClick={runKnowledgeAudit}
                  className="w-full py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all hover:bg-emerald-600 shadow-lg"
                 >
                    Search for Documentation Gaps
                 </button>
              </div>

              <div className="pt-10 mt-10 border-t border-slate-50 text-center">
                 <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                       <ShieldCheck size={16} className="text-emerald-500" />
                       <span className="text-[9px] font-black uppercase text-slate-400">Context Compliance</span>
                    </div>
                    <span className="text-[10px] font-black text-slate-800">PASSED</span>
                 </div>
              </div>
           </div>
        </div>
      </div>

      {/* Record Editor Modal */}
      {showEditor && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-slate-900/90 backdrop-blur-xl animate-in fade-in duration-300">
           <div className="bg-white w-full max-w-4xl h-[85vh] rounded-[4rem] shadow-2xl overflow-hidden flex flex-col border border-white/20">
              <div className="p-10 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
                 <div className="flex items-center space-x-6">
                    <div className="w-16 h-16 bg-slate-900 text-emerald-400 rounded-3xl flex items-center justify-center shadow-lg"><Plus size={32} /></div>
                    <div>
                       <h3 className="text-3xl font-black text-slate-800 tracking-tight uppercase">Knowledge Composer</h3>
                       <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">Multi-Site Contextual Indexing</p>
                    </div>
                 </div>
                 <button onClick={() => setShowEditor(false)} className="p-3 text-slate-300 hover:text-rose-500 transition-colors"><X size={32} /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-12 space-y-10 custom-scrollbar bg-slate-50/40">
                 <div className="grid grid-cols-2 gap-10">
                    <div className="space-y-6">
                       <div className="space-y-2">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Record Title</label>
                          <input 
                            className="w-full p-5 bg-white border-2 border-slate-100 rounded-3xl font-black uppercase text-sm focus:border-emerald-500 outline-none transition" 
                            placeholder="e.g. WINTER SOIL PREP PROTOCOL"
                          />
                       </div>
                       <div className="space-y-4">
                          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Spoke Availability</label>
                          <div className="flex flex-wrap gap-2">
                             {['Global', 'farm.sproutify.app', 'school.sproutify.app', 'letsrejoice.app'].map(s => (
                               <button key={s} className="px-4 py-2 bg-white border border-slate-100 rounded-xl text-[9px] font-black uppercase hover:border-emerald-400 transition-all">
                                  {s.split('.')[0]}
                               </button>
                             ))}
                          </div>
                       </div>
                    </div>
                    <div className="space-y-6">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Classification</label>
                       <div className="grid grid-cols-2 gap-3">
                          {['Troubleshooting', 'Onboarding', 'Policy', 'Strategic'].map(cat => (
                            <button key={cat} className="p-4 bg-white border border-slate-100 rounded-2xl text-left flex flex-col justify-between transition-all h-20 hover:border-emerald-500">
                               <div className="w-5 h-5 bg-slate-50 rounded flex items-center justify-center"><Layers size={10} className="text-slate-400" /></div>
                               <span className="text-[10px] font-black uppercase tracking-tight">{cat}</span>
                            </button>
                          ))}
                       </div>
                    </div>
                 </div>

                 <div className="space-y-4">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Knowledge Content (RAG Payload)</label>
                    <textarea 
                      className="w-full min-h-[300px] p-8 bg-white border-2 border-slate-100 rounded-[3rem] text-sm font-medium text-slate-600 leading-relaxed outline-none focus:border-emerald-500 transition shadow-inner"
                      placeholder="Enter the detailed support logic, instructions, or FAQ answer here..."
                    />
                 </div>
              </div>

              <div className="p-10 bg-white border-t border-slate-100 flex space-x-4">
                 <button 
                  onClick={() => setShowEditor(false)}
                  className="flex-1 py-6 bg-slate-900 text-white rounded-[2rem] font-black text-xl flex items-center justify-center space-x-4 shadow-2xl hover:bg-emerald-600 transition active:scale-95"
                 >
                    <ArrowUpRight size={28} className="text-emerald-400" />
                    <span>Commit & Index Knowledge</span>
                 </button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default KnowledgeBase;
