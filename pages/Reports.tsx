
import React, { useState, useMemo } from 'react';
import { TrellisReport } from '../types';
import { 
  BarChart3, FileText, Download, Plus, Search, 
  Calendar, Globe, ShieldCheck, Zap, Sparkles, 
  ChevronRight, MoreVertical, LayoutGrid, List,
  ArrowUpRight, FileSpreadsheet, FileJson, 
  CheckCircle2, Clock, Activity, RefreshCw, X
} from 'lucide-react';
import { GoogleGenAI } from "@google/genai";

const REPORT_BLUEPRINTS: TrellisReport[] = [
  { id: 'rep_1', name: 'Monthly Multi-Site Conversion Audit', type: 'system', created_at: '2023-11-01', last_generated: '2023-12-01', metrics: ['CTR', 'Conversion', 'LTV'], spokes: ['farm.sproutify.app', 'school.sproutify.app'], status: 'ready' },
  { id: 'rep_2', name: 'Identity Resolution & Churn Forecast', type: 'system', created_at: '2023-11-15', last_generated: '2023-12-02', metrics: ['Duplicates Matched', 'Churn Probability'], spokes: ['letsrejoice.app', 'farm.sproutify.app'], status: 'ready' },
  { id: 'rep_3', name: 'Support Performance & Sentiment Pulse', type: 'system', created_at: '2023-11-20', last_generated: '2023-12-04', metrics: ['Avg. Response', 'CSAT', 'Sentiment'], spokes: ['All Spokes'], status: 'ready' },
];

const Reports: React.FC = () => {
  const [reports, setReports] = useState<TrellisReport[]>(REPORT_BLUEPRINTS);
  const [activeView, setActiveView] = useState<'blueprints' | 'custom'>('blueprints');
  const [isBuilderOpen, setIsBuilderOpen] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [exportType, setExportType] = useState<'pdf' | 'xlsx' | null>(null);
  const [isGeneratingAiInsight, setIsGeneratingAiInsight] = useState(false);
  const [selectedReport, setSelectedReport] = useState<TrellisReport | null>(null);
  const [aiInsight, setAiInsight] = useState<string | null>(null);

  const [newReport, setNewReport] = useState<Partial<TrellisReport>>({
    name: '',
    metrics: [],
    spokes: [],
  });

  const handleExport = (id: string, type: 'pdf' | 'xlsx') => {
    setExportingId(id);
    setExportType(type);
    // Simulate high-fidelity export process
    setTimeout(() => {
      setExportingId(null);
      setExportType(null);
      alert(`${type.toUpperCase()} Export Dispatched to Browser Hub.`);
    }, 2500);
  };

  const handleAiDeepDive = async (report: TrellisReport) => {
    setSelectedReport(report);
    setIsGeneratingAiInsight(true);
    setAiInsight(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Analyze this marketing report config: ${report.name}. Metrics: ${report.metrics.join(', ')}. Spokes: ${report.spokes.join(', ')}. Suggest 2 strategic optimizations for a multi-site brand. Keep it concise.`,
      });
      setAiInsight(response.text || "Insight resolution failed. Sage engine offline.");
    } catch (e) {
      setAiInsight("Unable to connect to Sage Strategic Core for real-time analysis.");
    } finally {
      setIsGeneratingAiInsight(false);
    }
  };

  const handleCreateReport = (e: React.FormEvent) => {
    e.preventDefault();
    const created: TrellisReport = {
      id: `rep_${Date.now()}`,
      name: newReport.name || 'Untitled Audit',
      type: 'custom',
      created_at: new Date().toISOString().split('T')[0],
      last_generated: 'Never',
      metrics: newReport.metrics || [],
      spokes: newReport.spokes || [],
      status: 'ready'
    };
    setReports([created, ...reports]);
    setIsBuilderOpen(false);
    setNewReport({ name: '', metrics: [], spokes: [] });
  };

  return (
    <div className="space-y-8 pb-40">
      
      {/* Dynamic Header */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-8">
        <div className="flex bg-slate-200/40 p-1.5 rounded-[2rem] w-fit border border-slate-200 shadow-inner">
          <button 
            onClick={() => setActiveView('blueprints')}
            className={`flex items-center space-x-3 px-8 py-3 rounded-[1.5rem] text-xs font-black uppercase tracking-widest transition-all ${activeView === 'blueprints' ? 'bg-white text-emerald-700 shadow-lg' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <ShieldCheck size={18} />
            <span>System Blueprints</span>
          </button>
          <button 
            onClick={() => setActiveView('custom')}
            className={`flex items-center space-x-3 px-8 py-3 rounded-[1.5rem] text-xs font-black uppercase tracking-widest transition-all ${activeView === 'custom' ? 'bg-white text-emerald-700 shadow-lg' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <Zap size={18} />
            <span>Custom Workspace</span>
          </button>
        </div>

        <button 
          onClick={() => setIsBuilderOpen(true)}
          className="px-8 py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest flex items-center space-x-3 shadow-xl hover:bg-emerald-600 transition-all"
        >
          <Plus size={18} />
          <span>New Strategic Audit</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Reports Grid/List */}
        <div className="lg:col-span-3 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {reports.filter(r => activeView === 'blueprints' ? r.type === 'system' : r.type === 'custom').map(report => (
              <div key={report.id} className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm hover:border-emerald-400 transition-all group relative overflow-hidden flex flex-col">
                <div className="flex justify-between items-start mb-6">
                   <div className={`p-3.5 rounded-2xl ${report.type === 'system' ? 'bg-indigo-50 text-indigo-600' : 'bg-amber-50 text-amber-600'} transition-transform group-hover:scale-110`}>
                      <BarChart3 size={24} />
                   </div>
                   <div className="flex space-x-2">
                      <button 
                        onClick={() => handleExport(report.id, 'pdf')}
                        disabled={exportingId === report.id}
                        className="p-2 text-slate-400 hover:text-rose-600 transition-colors" 
                        title="Export as PDF"
                      >
                         {exportingId === report.id && exportType === 'pdf' ? <RefreshCw size={16} className="animate-spin" /> : <FileText size={18} />}
                      </button>
                      <button 
                        onClick={() => handleExport(report.id, 'xlsx')}
                        disabled={exportingId === report.id}
                        className="p-2 text-slate-400 hover:text-emerald-600 transition-colors" 
                        title="Export as Excel"
                      >
                         {exportingId === report.id && exportType === 'xlsx' ? <RefreshCw size={16} className="animate-spin" /> : <FileSpreadsheet size={18} />}
                      </button>
                   </div>
                </div>

                <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight mb-2 leading-tight">{report.name}</h3>
                <div className="flex flex-wrap gap-2 mb-8">
                   {report.metrics.slice(0, 3).map(m => (
                     <span key={m} className="px-2 py-0.5 bg-slate-50 border border-slate-100 rounded text-[8px] font-black text-slate-400 uppercase tracking-widest">
                       {m}
                     </span>
                   ))}
                   {report.metrics.length > 3 && <span className="text-[8px] font-black text-slate-300 uppercase">+{report.metrics.length - 3} More</span>}
                </div>

                <div className="mt-auto pt-6 border-t border-slate-50 flex items-center justify-between">
                   <div className="space-y-0.5">
                      <p className="text-[9px] font-black text-slate-300 uppercase tracking-widest">Last Sync</p>
                      <p className="text-[11px] font-bold text-slate-500">{report.last_generated}</p>
                   </div>
                   <button 
                    onClick={() => handleAiDeepDive(report)}
                    className="px-4 py-2 bg-slate-900 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center space-x-2 hover:bg-emerald-600 transition shadow-lg"
                   >
                      <Sparkles size={12} className="text-emerald-400" />
                      <span>Sage Audit</span>
                   </button>
                </div>
              </div>
            ))}
          </div>
          
          {reports.filter(r => activeView === 'blueprints' ? r.type === 'system' : r.type === 'custom').length === 0 && (
            <div className="py-40 text-center bg-slate-50 border-4 border-dashed border-slate-200 rounded-[4rem]">
               <Activity size={64} className="mx-auto text-slate-200 mb-6 opacity-40" />
               <p className="text-xl font-black text-slate-400 uppercase tracking-widest">Workspace Empty</p>
               <p className="text-xs text-slate-500 font-bold mt-2">Initialize a Custom Strategy Audit to begin monitoring.</p>
            </div>
          )}
        </div>

        {/* Sidebar: Sage Analysis */}
        <div className="lg:col-span-1 space-y-8">
           <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm min-h-[500px] flex flex-col">
              <div className="flex items-center space-x-4 mb-8 border-b border-slate-50 pb-8">
                 <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center shadow-lg"><Sparkles size={24} /></div>
                 <div>
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">Strategic Auditor</h4>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">Trellis Global Sync</p>
                 </div>
              </div>

              {selectedReport ? (
                <div className="flex-1 space-y-8 animate-in fade-in duration-300">
                   <div className="space-y-2">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Active Audit</p>
                      <h5 className="text-sm font-black text-slate-800 leading-tight">{selectedReport.name}</h5>
                   </div>

                   {isGeneratingAiInsight ? (
                     <div className="py-20 flex flex-col items-center justify-center text-center space-y-4">
                        <RefreshCw className="animate-spin text-emerald-500" size={32} />
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest animate-pulse">Resolving Cross-Site Patterns...</p>
                     </div>
                   ) : aiInsight ? (
                     <div className="bg-emerald-900 p-8 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:rotate-12 transition-transform">
                           <Activity size={80} />
                        </div>
                        <h6 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-4">Sage Multi-Site Insight</h6>
                        <p className="text-sm font-medium leading-relaxed italic border-l-2 border-emerald-500 pl-4">
                          "{aiInsight}"
                        </p>
                     </div>
                   ) : (
                     <div className="p-10 text-center opacity-30">
                        <BarChart3 size={48} className="mx-auto mb-4" />
                        <p className="text-[10px] font-black uppercase tracking-widest">Select Audit to view Logic</p>
                     </div>
                   )}
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-8 opacity-20">
                   <LayoutGrid size={64} className="mb-6" />
                   <p className="text-sm font-black uppercase tracking-widest">Insight Engine Dormant</p>
                   <p className="text-[10px] mt-2 font-medium">Trigger a 'Sage Audit' on any blueprint to activate patterns.</p>
                </div>
              )}

              <div className="pt-8 border-t border-slate-50 mt-auto">
                 <div className="bg-slate-50 p-6 rounded-2xl space-y-4">
                    <div className="flex justify-between items-center text-[10px] font-black text-slate-400 uppercase tracking-widest">
                       <span>Data Integrity</span>
                       <span className="text-emerald-600">99.8%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                       <div className="h-full bg-emerald-500" style={{ width: '99.8%' }}></div>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      </div>

      {/* Report Builder Modal */}
      {isBuilderOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-slate-900/90 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-4xl rounded-[4rem] p-12 shadow-2xl overflow-hidden border border-white/20">
             <div className="flex justify-between items-center mb-10 pb-10 border-b border-slate-100">
                <div className="flex items-center space-x-6">
                   <div className="w-16 h-16 bg-slate-900 text-emerald-400 rounded-3xl flex items-center justify-center shadow-lg"><Plus size={32} /></div>
                   <div>
                      <h3 className="text-3xl font-black text-slate-800 tracking-tight uppercase">Custom Strategy Audit</h3>
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">Global Ecosystem Configuration</p>
                   </div>
                </div>
                <button onClick={() => setIsBuilderOpen(false)} className="p-3 bg-slate-50 text-slate-400 hover:text-rose-500 rounded-2xl transition-colors"><X size={32} /></button>
             </div>

             <form onSubmit={handleCreateReport} className="space-y-10">
                <div className="grid grid-cols-2 gap-10">
                   <div className="space-y-6">
                      <div className="space-y-2">
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Audit Identity</label>
                         <input 
                           className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] font-black uppercase text-sm outline-none focus:border-emerald-500 transition shadow-inner" 
                           placeholder="e.g. Q4 GROWTH CORRELATION"
                           value={newReport.name}
                           onChange={e => setNewReport({...newReport, name: e.target.value})}
                           required
                         />
                      </div>
                      <div className="space-y-4">
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Spoke Sites Scope</label>
                         <div className="flex flex-wrap gap-2">
                            {['farm.sproutify.app', 'school.sproutify.app', 'letsrejoice.app', 'micro.sproutify.app'].map(site => {
                               const active = newReport.spokes?.includes(site);
                               return (
                                 <button 
                                   key={site} 
                                   type="button" 
                                   onClick={() => setNewReport({...newReport, spokes: active ? newReport.spokes?.filter(s => s !== site) : [...(newReport.spokes || []), site]})}
                                   className={`px-4 py-2.5 rounded-xl text-[10px] font-black uppercase transition-all border ${active ? 'bg-slate-900 border-slate-900 text-white shadow-lg' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-300'}`}
                                 >
                                    {site.split('.')[0]}
                                 </button>
                               );
                            })}
                         </div>
                      </div>
                   </div>

                   <div className="space-y-6">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Performance Metrics</label>
                      <div className="grid grid-cols-2 gap-3">
                        {['LTV Growth', 'CTR Pulse', 'Identity Churn', 'Site Resolution', 'Campaign Velocity', 'CSAT Sync'].map(metric => {
                           const active = newReport.metrics?.includes(metric);
                           return (
                             <button 
                               key={metric} 
                               type="button" 
                               onClick={() => setNewReport({...newReport, metrics: active ? newReport.metrics?.filter(m => m !== metric) : [...(newReport.metrics || []), metric]})}
                               className={`p-4 rounded-2xl border-2 text-left flex flex-col justify-between transition-all h-24 ${active ? 'bg-emerald-50 border-emerald-500 text-emerald-700 shadow-md scale-[1.02]' : 'bg-white border-slate-100 text-slate-400 hover:border-slate-200'}`}
                             >
                                <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${active ? 'bg-emerald-500 text-white' : 'bg-slate-50 text-slate-300'}`}>
                                   <Activity size={12} />
                                </div>
                                <span className="text-[10px] font-black uppercase tracking-tight">{metric}</span>
                             </button>
                           );
                        })}
                      </div>
                   </div>
                </div>

                <div className="pt-10 flex space-x-4">
                   <button type="submit" className="flex-1 py-8 bg-slate-900 text-white rounded-[2.5rem] font-black text-2xl flex items-center justify-center space-x-6 shadow-2xl hover:bg-emerald-600 transition active:scale-95">
                      <ArrowUpRight size={32} className="text-emerald-400" />
                      <span>Initialize Strategic Logic</span>
                   </button>
                </div>
             </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;
