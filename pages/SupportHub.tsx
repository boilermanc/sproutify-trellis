
import React, { useState, useMemo } from 'react';
import { Ticket, Profile, TicketPriority, Sentiment } from '../types';
import CustomerSitesTag from '../components/CustomerSitesTag';
import { sanitizePII } from '../services/aiService';
import { 
  LifeBuoy, RefreshCw, Globe, GraduationCap, Sprout, Heart, Building2,
  Filter, Activity, AlertTriangle, BarChart3, X, Search, Send, CheckCircle2,
  Zap, MoreVertical, Sparkles, ShieldCheck, Inbox, Clock, ShieldAlert,
  Eye, Lock, AlertCircle, Info
} from 'lucide-react';

interface SupportHubProps {
  tickets: Ticket[];
  setTickets: React.Dispatch<React.SetStateAction<Ticket[]>>;
  profiles: Profile[];
}

const SITE_ICONS: Record<string, any> = {
  'atlurbanfarms.com': Building2,
  'micro.sproutify.app': Sprout,
  'farm.sproutify.app': Sprout,
  'school.sproutify.app': GraduationCap,
  'letsrejoice.app': Heart,
};

const SupportHub: React.FC<SupportHubProps> = ({ tickets, setTickets, profiles }) => {
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(tickets[0]?.id || null);
  const [searchTerm, setSearchTerm] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<TicketPriority | 'all'>('all');
  
  const [isSending, setIsSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [showSanitizationLog, setShowSanitizationLog] = useState(false);

  const filteredTickets = useMemo(() => {
    return tickets.filter(t => {
      const profile = profiles.find(p => p.id === t.profile_id);
      const matchesSearch = t.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
                           t.id.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesPriority = priorityFilter === 'all' || t.priority === priorityFilter;
      return matchesSearch && matchesPriority;
    });
  }, [tickets, profiles, searchTerm, priorityFilter]);

  const selectedTicket = tickets.find(t => t.id === selectedTicketId);
  const profile = profiles.find(p => p.id === selectedTicket?.profile_id) || profiles[0];

  const handleApproveAndSend = async () => {
    if (!selectedTicketId || selectedTicket?.needs_human_review) return;
    setIsSending(true);
    await new Promise(r => setTimeout(r, 1200));
    setTickets(prev => prev.map(t => t.id === selectedTicketId ? { ...t, status: 'resolved' } : t));
    setIsSending(false);
    setSendSuccess(true);
    setTimeout(() => setSendSuccess(false), 3000);
  };

  const handleSanitizeDescription = () => {
    if (!selectedTicketId || !selectedTicket) return;
    const sanitized = sanitizePII(selectedTicket.description);
    setTickets(prev => prev.map(t => t.id === selectedTicketId ? { ...t, description: sanitized } : t));
    setShowSanitizationLog(true);
    setTimeout(() => setShowSanitizationLog(false), 3000);
  };

  const confidenceLevel = selectedTicket?.ai_confidence || 0;
  const isLowConfidence = confidenceLevel < 80;

  return (
    <div className="flex flex-col space-y-8 h-full pb-10">
      <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col lg:flex-row gap-6 items-center">
          <div className="relative flex-1 w-full lg:w-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-11 pr-4 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500 transition shadow-inner" placeholder="Triage by ID or subject..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            {(['urgent', 'high', 'medium', 'low'] as TicketPriority[]).map(p => (
              <button key={p} onClick={() => setPriorityFilter(priorityFilter === p ? 'all' : p)} className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-tight transition-all border flex items-center space-x-2 ${priorityFilter === p ? 'bg-slate-900 border-slate-900 text-white shadow-md' : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-white'}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${p === 'urgent' ? 'bg-rose-500' : p === 'high' ? 'bg-amber-500' : 'bg-blue-500'}`} />
                <span>{p}</span>
              </button>
            ))}
          </div>
      </div>

      <div className="flex gap-8 flex-1 min-h-0">
        <div className="w-96 flex flex-col space-y-4">
          <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-1">
            {filteredTickets.length > 0 ? filteredTickets.map(ticket => {
               const p = profiles.find(x => x.id === ticket.profile_id);
               const SiteIcon = SITE_ICONS[p?.source_sites[0] || ''] || Globe;
               const needsReview = ticket.ai_confidence && ticket.ai_confidence < 80;
               
               return (
                <button key={ticket.id} onClick={() => setSelectedTicketId(ticket.id)} className={`w-full text-left p-5 rounded-2xl border-2 transition-all group relative overflow-hidden ${selectedTicketId === ticket.id ? 'bg-white border-emerald-500 shadow-xl' : 'bg-white border-slate-100 hover:border-slate-300'}`}>
                  {ticket.priority === 'urgent' && <div className="absolute top-0 left-0 w-1 h-full bg-rose-500"></div>}
                  <div className="flex justify-between items-start mb-2">
                     <div className="flex items-center space-x-2">
                        <div className={`p-1.5 rounded-lg ${selectedTicketId === ticket.id ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}><SiteIcon size={12} /></div>
                        <span className="text-[9px] font-black text-slate-400 uppercase truncate max-w-[100px]">{p?.source_sites[0]}</span>
                     </div>
                     <div className="flex items-center space-x-1.5">
                       {needsReview && <AlertCircle size={14} className="text-amber-500 animate-pulse" />}
                       <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded ${ticket.status === 'resolved' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{ticket.status}</span>
                     </div>
                  </div>
                  <h4 className="text-xs font-black text-slate-800 line-clamp-1 mb-1">{ticket.subject}</h4>
                  <p className="text-[10px] text-slate-400 truncate">{p?.email}</p>
                </button>
               );
            }) : (
              <div className="py-20 text-center bg-slate-50 border-2 border-dashed border-slate-200 rounded-[2rem]">
                 <Inbox size={32} className="mx-auto text-slate-300 mb-2" />
                 <p className="text-[10px] font-black text-slate-400 uppercase">Queue Clear</p>
              </div>
            )}
          </div>
        </div>

        {selectedTicket ? (
          <div className="flex-1 flex flex-col bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden animate-in fade-in duration-300">
             <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/20">
                <div className="flex items-center space-x-4">
                   <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-2xl flex items-center justify-center font-black text-lg">{profile?.first_name.charAt(0)}</div>
                   <div>
                      <h3 className="text-lg font-black text-slate-800 leading-tight">{selectedTicket.subject}</h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{profile?.email} • {selectedTicket.id}</p>
                   </div>
                </div>
                <div className="flex items-center space-x-4">
                   <button 
                    onClick={handleSanitizeDescription}
                    className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-emerald-600 transition shadow-sm group"
                    title="Scrub PII from Transcript"
                   >
                     <ShieldCheck size={18} className="group-hover:scale-110 transition-transform" />
                   </button>
                   <span className="px-3 py-1 bg-rose-50 text-rose-600 rounded-full text-[10px] font-black uppercase border border-rose-100">{selectedTicket.priority}</span>
                </div>
             </div>

             {showSanitizationLog && (
                <div className="bg-emerald-600 text-white px-8 py-3 text-[10px] font-black uppercase tracking-widest animate-in slide-in-from-top duration-300 flex items-center justify-center">
                   <Lock size={12} className="mr-2" /> 
                   PII Hardening Applied: Sensitive data stripped from local transcript
                </div>
             )}

             <div className="flex-1 p-10 overflow-y-auto space-y-10 custom-scrollbar bg-slate-50/30">
                <div className="space-y-4">
                   <div className="flex items-center justify-between px-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Customer Request</span>
                      <span className="text-[9px] font-bold text-slate-300 italic">Auto-scrubbing active</span>
                   </div>
                   <div className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm text-sm text-slate-600 leading-relaxed italic max-w-[90%] relative">
                      <div className="absolute -top-3 -left-3 bg-slate-900 text-white p-2 rounded-xl"><Activity size={12}/></div>
                      "{selectedTicket.description}"
                   </div>
                </div>

                <div className="flex flex-col items-end space-y-4">
                   <div className="flex items-center space-x-3 px-2">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">AI Proposed Resolution</span>
                      <div className={`flex items-center space-x-2 px-3 py-1 rounded-full border ${isLowConfidence ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                         <span className="text-[9px] font-black uppercase tracking-tight">Confidence: {confidenceLevel}%</span>
                      </div>
                   </div>
                   <div className={`p-8 rounded-[2.5rem] rounded-tr-none text-white max-w-[85%] shadow-2xl relative overflow-hidden group ${isLowConfidence ? 'bg-slate-700' : 'bg-slate-900'}`}>
                      <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-125 transition-transform"><Sparkles size={100} className="text-emerald-400" /></div>
                      <div className="flex items-center space-x-2 text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-4">
                         <Zap size={12} />
                         <span>Sage Secure Resolution</span>
                      </div>
                      <p className="text-sm leading-relaxed font-medium mb-2">{selectedTicket.ai_draft}</p>
                      
                      <div className="mt-6 pt-6 border-t border-white/10 flex items-center justify-between">
                         <div className="flex items-center space-x-2 text-[9px] text-slate-400 font-black uppercase">
                            <ShieldCheck size={10} />
                            <span>Sanitized Strategy</span>
                         </div>
                         {isLowConfidence && (
                            <div className="flex items-center space-x-2 text-amber-400 text-[9px] font-black uppercase bg-amber-500/10 px-3 py-1 rounded-lg">
                               <Info size={10} />
                               <span>Requires Strategic Override</span>
                            </div>
                         )}
                      </div>
                   </div>
                </div>

                {isLowConfidence && (
                  <div className="bg-amber-50 border-2 border-amber-200 p-8 rounded-3xl animate-in shake-in duration-500">
                     <div className="flex items-start space-x-4">
                        <div className="p-3 bg-amber-100 text-amber-600 rounded-2xl">
                           <AlertCircle size={24} />
                        </div>
                        <div>
                           <h4 className="text-sm font-black text-amber-900 uppercase tracking-tight">Human Calibration Required</h4>
                           <p className="text-xs text-amber-700 font-medium leading-relaxed mt-1">
                              Sage confidence score (<b>{confidenceLevel}%</b>) is below the 80% security threshold. This ticket has been locked to prevent automated dispatch. Please review and manually calibrate the draft.
                           </p>
                        </div>
                     </div>
                  </div>
                )}
             </div>

             <div className="p-8 bg-white border-t border-slate-100 flex items-center justify-between">
                <div className="flex space-x-3">
                   <button 
                    onClick={handleApproveAndSend} 
                    disabled={isSending || sendSuccess || selectedTicket.status === 'resolved' || isLowConfidence} 
                    className={`px-10 py-5 rounded-[1.5rem] font-black text-sm flex items-center space-x-3 transition-all ${
                      isLowConfidence ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200' :
                      (sendSuccess || selectedTicket.status === 'resolved') ? 'bg-emerald-500 text-white shadow-lg' : 'bg-slate-900 text-white hover:bg-emerald-600 shadow-xl'
                    } disabled:opacity-50`}
                  >
                     {isSending ? <RefreshCw className="animate-spin" size={18} /> : (sendSuccess || selectedTicket.status === 'resolved') ? <CheckCircle2 size={18} /> : isLowConfidence ? <Lock size={18} /> : <Send size={18} />}
                     <span>
                        {isSending ? 'Resolving Identity...' : 
                         (sendSuccess || selectedTicket.status === 'resolved') ? 'Identity Reconciled' : 
                         isLowConfidence ? 'Auto-Dispatch Locked' : 'Approve & Global Dispatch'}
                     </span>
                  </button>
                  {isLowConfidence && (
                     <button className="px-6 py-5 bg-white border-2 border-slate-200 text-slate-600 rounded-[1.5rem] font-black text-xs uppercase tracking-widest hover:border-emerald-500 hover:text-emerald-600 transition">
                        Manual Edit
                     </button>
                  )}
                </div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center">
                   <Clock size={12} className="mr-2" /> 14m Avg Response
                </p>
             </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center bg-white rounded-[2.5rem] border-4 border-dashed border-slate-100 opacity-40">
             <LifeBuoy size={64} className="text-slate-200 mb-6" />
             <p className="text-xl font-black text-slate-300 uppercase tracking-tighter">Select a ticket to orchestrate</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SupportHub;
