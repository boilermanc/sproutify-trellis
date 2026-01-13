
import React, { useState, useEffect } from 'react';
import { SQL_SCHEMA, WEBHOOK_SPECS, MOCK_PROFILES, MOCK_SPOKE_CONFIGS, MOCK_FAILED_SYNCS, SITES_LIST, N8N_BLUEPRINTS } from '../constants';
import { QueuedTask, Profile } from '../types';
import { 
  Terminal, Database, CheckSquare, ExternalLink, Activity, 
  Globe, Shield, Code2, Zap, Lock, FileJson, Copy, 
  CheckCircle2, Server, Key, Clock, LifeBuoy, PhoneCall,
  RefreshCw, Send, AlertTriangle, Mail, Play, Code,
  ShieldCheck, ShieldAlert, Network, Trash2, RotateCcw,
  Bug, Fingerprint, ShieldEllipsis, Slack, History, Calendar,
  UserRound, Fingerprint as FingerprintIcon, Ban, ShieldX,
  Cpu, Layers, Box, Timer, UserMinus, ShieldAlert as ZombieIcon,
  Recycle, Archive, HardDrive, Filter, Eraser, Workflow
} from 'lucide-react';

interface DevToolsProps {
  profiles: Profile[];
}

const DevTools: React.FC<DevToolsProps> = ({ profiles }) => {
  const [activeTab, setActiveTab] = useState<'sim' | 'worker' | 'hygiene' | 'dlq' | 'sql' | 'n8n'>('sim');
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  
  // Handshake Sim
  const [isSimulating, setIsSimulating] = useState(false);
  const [simResult, setSimResult] = useState<{ msg: string, type: 'success' | 'error' | 'info' | 'warning' } | null>(null);
  const [providedKey, setProvidedKey] = useState('tr_live_f4rm_9921');
  const [eventId, setEventId] = useState('evt_' + Math.random().toString(36).substr(2, 5));
  const [processedEvents, setProcessedEvents] = useState<string[]>(['evt_initial_123']);
  
  // Lifecycle Simulation State
  const [simProfile, setSimProfile] = useState<Profile>(profiles[0] || MOCK_PROFILES[0]);

  // Worker Queue State
  const [taskQueue, setTaskQueue] = useState<QueuedTask[]>([]);
  const [isWorkerActive, setIsWorkerActive] = useState(false);
  const [processedCount, setProcessedCount] = useState(0);

  // Hygiene State
  const [isCleaning, setIsCleaning] = useState(false);
  const [hygieneStats, setHygieneStats] = useState({ hot: 1420, cold: 8900, purged: 450 });

  // DLQ State
  const [failedSyncs, setFailedSyncs] = useState(MOCK_FAILED_SYNCS);

  // Worker Loop Simulation
  useEffect(() => {
    let interval: any;
    if (isWorkerActive && taskQueue.some(t => t.status === 'pending')) {
        interval = setInterval(() => {
            setTaskQueue(prev => {
                const nextBatch = prev.filter(t => t.status === 'pending').slice(0, 5);
                if (nextBatch.length === 0) {
                    setIsWorkerActive(false);
                    return prev;
                }
                const idsToProcess = nextBatch.map(b => b.id);
                setProcessedCount(c => c + idsToProcess.length);
                return prev.map(t => idsToProcess.includes(t.id) ? { ...t, status: 'completed', processed_at: new Date().toISOString() } : t);
            });
        }, 1000);
    }
    return () => clearInterval(interval);
  }, [isWorkerActive, taskQueue]);

  const handleFloodQueue = () => {
    const newTasks: QueuedTask[] = Array.from({ length: 50 }).map((_, i) => ({
        id: `task_${Date.now()}_${i}`,
        task_type: 'email_dispatch',
        payload: { recipient: `user_${i}@example.com`, template: 'welcome' },
        priority: Math.floor(Math.random() * 10),
        status: 'pending',
        created_at: new Date().toISOString()
    }));
    setTaskQueue(prev => [...newTasks, ...prev]);
    setIsWorkerActive(true);
  };

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(id);
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const runCleanupManual = async () => {
    setIsCleaning(true);
    await new Promise(r => setTimeout(r, 2000));
    setHygieneStats(prev => ({
        hot: prev.hot - 200,
        cold: prev.cold + 150,
        purged: prev.purged + 50
    }));
    setIsCleaning(false);
  };

  const simulateIngest = async (site: string) => {
    if (!providedKey) return;
    setIsSimulating(true);
    await new Promise(r => setTimeout(r, 1200));
    
    if (processedEvents.includes(eventId)) {
        setSimResult({ msg: `Idempotency Rejection: Duplicate request discarded.`, type: 'info' });
    } else {
        setProcessedEvents(prev => [eventId, ...prev]);
        setSimResult({ msg: `Atomic Success: Event logged and stashed in task_queue.`, type: 'success' });
    }
    setIsSimulating(false);
  };

  const simulateDelete = async (site: string) => {
    setIsSimulating(true);
    await new Promise(r => setTimeout(r, 1200));

    const updatedSites = simProfile.source_sites.filter(s => s !== site);
    const isNowEmpty = updatedSites.length === 0;

    setSimProfile({
        ...simProfile,
        source_sites: updatedSites,
        is_subscribed: isNowEmpty ? false : simProfile.is_subscribed,
        status: isNowEmpty ? 'deleted' : simProfile.status
    });

    if (isNowEmpty) {
        setSimResult({ 
            msg: `Global Hardening: Final spoke '${site}' removed. Identity ${simProfile.email} marked as DELETED. Marketing stopped.`, 
            type: 'warning' 
        });
    } else {
        setSimResult({ 
            msg: `Partial Cleanup: Removed spoke '${site}'. User remains active on ${updatedSites.length} other site(s).`, 
            type: 'info' 
        });
    }
    
    setIsSimulating(false);
  };

  return (
    <div className="space-y-8 pb-40">
      
      <div className="flex bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm w-fit overflow-x-auto max-w-full">
        {[
          { id: 'sim', label: 'Protocol Sim', icon: Zap },
          { id: 'worker', label: 'Worker Queue', icon: Cpu },
          { id: 'hygiene', label: 'Data Hygiene', icon: Recycle },
          { id: 'dlq', label: 'Dead Letter', icon: Bug },
          { id: 'sql', label: 'Schema Engine', icon: Terminal },
          { id: 'n8n', label: 'n8n Blueprints', icon: Workflow },
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center space-x-2 px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
              activeTab === tab.id ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:text-slate-800'
            }`}
          >
            <tab.icon size={14} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {activeTab === 'sim' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-8 animate-in fade-in duration-300">
           <div className="bg-slate-900 p-10 rounded-[3rem] shadow-2xl relative overflow-hidden flex flex-col min-h-[700px]">
              <div className="absolute top-0 right-0 p-10 opacity-10 pointer-events-none">
                 <Network size={120} className="text-emerald-400" />
              </div>
              <div className="relative z-10 flex flex-col h-full">
                 <div className="mb-10">
                    <h3 className="text-2xl font-black text-white flex items-center">
                       <ShieldCheck size={28} className="mr-4 text-emerald-400" />
                       Strategic Handshake
                    </h3>
                    <p className="text-[10px] text-slate-500 font-black uppercase mt-1 ml-11">Delete Lifecycle & Sync v5.0</p>
                 </div>

                 <div className="space-y-6 mb-10">
                    <div className="p-6 bg-white/5 border border-white/10 rounded-3xl space-y-4">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center space-x-2 text-[10px] font-black text-emerald-400 uppercase tracking-widest">
                               <UserRound size={12} />
                               <span>Target identity: {simProfile.email}</span>
                            </div>
                            <button 
                                onClick={() => setSimProfile(profiles[0] || MOCK_PROFILES[0])}
                                className="text-[8px] font-black text-slate-500 uppercase hover:text-white"
                            >
                                Reset Profile
                            </button>
                        </div>
                        <div className="flex flex-wrap gap-2">
                           {simProfile.source_sites.map(s => (
                               <span key={s} className="px-3 py-1 bg-emerald-500/10 text-emerald-400 text-[9px] font-black rounded-lg border border-emerald-500/20">{s}</span>
                           ))}
                           {simProfile.source_sites.length === 0 && (
                               <span className="px-3 py-1 bg-rose-500/20 text-rose-400 text-[9px] font-black rounded-lg border border-rose-500/30 flex items-center">
                                   <Ban size={10} className="mr-1" /> ALL SPOKES REMOVED
                               </span>
                           )}
                        </div>
                        <div className="flex space-x-4">
                            <div className="flex items-center space-x-1.5 text-[9px] font-black uppercase">
                                <span className="text-slate-500">Status:</span>
                                <span className={simProfile.status === 'deleted' ? 'text-rose-400' : 'text-emerald-400'}>{simProfile.status}</span>
                            </div>
                            <div className="flex items-center space-x-1.5 text-[9px] font-black uppercase">
                                <span className="text-slate-500">Subscribed:</span>
                                <span className={simProfile.is_subscribed ? 'text-emerald-400' : 'text-rose-400'}>{simProfile.is_subscribed ? 'TRUE' : 'FALSE'}</span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-3">
                            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Simulate Ingest</label>
                            <div className="grid grid-cols-1 gap-2">
                                {SITES_LIST.slice(0, 2).map(site => (
                                    <button 
                                        key={site} 
                                        onClick={() => simulateIngest(site)}
                                        className="w-full p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-[10px] font-black text-emerald-400 uppercase hover:bg-emerald-500/20 transition flex justify-between items-center"
                                    >
                                        <span>Sync {site.split('.')[0]}</span>
                                        <Send size={12} />
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="space-y-3">
                            <label className="block text-[10px] font-black text-rose-400 uppercase tracking-widest ml-1">Simulate Delete</label>
                            <div className="grid grid-cols-1 gap-2">
                                {simProfile.source_sites.map(site => (
                                    <button 
                                        key={site} 
                                        onClick={() => simulateDelete(site)}
                                        className="w-full p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-[10px] font-black text-rose-400 uppercase hover:bg-rose-500/20 transition flex justify-between items-center"
                                    >
                                        <span>Delete from {site.split('.')[0]}</span>
                                        <UserMinus size={12} />
                                    </button>
                                ))}
                                {simProfile.source_sites.length === 0 && (
                                    <div className="p-4 bg-slate-800 rounded-2xl text-[9px] text-slate-500 italic text-center">No spokes to delete</div>
                                )}
                            </div>
                        </div>
                    </div>
                 </div>

                 <div className="mt-auto pt-10">
                    {simResult ? (
                       <div className={`p-5 rounded-2xl text-xs font-black uppercase animate-in zoom-in-95 border flex items-center space-x-4 shadow-xl ${
                            simResult.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 
                            simResult.type === 'warning' ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' :
                            'bg-indigo-500/10 border-indigo-500/20 text-indigo-400'
                       }`}>
                          {simResult.type === 'warning' ? <ZombieIcon size={18} /> : <CheckCircle2 size={18} />}
                          <span className="leading-tight">{simResult.msg}</span>
                       </div>
                    ) : (
                       <div className="p-5 bg-white/5 border border-white/10 rounded-2xl text-slate-500 text-[10px] font-black uppercase tracking-widest text-center italic">
                          Awaiting Hub Handshake...
                       </div>
                    )}
                 </div>
              </div>
           </div>
           <div className="space-y-8">
              <div className="bg-indigo-900 p-8 rounded-[3rem] text-white shadow-2xl relative overflow-hidden">
                 <div className="absolute top-0 right-0 p-4 opacity-10"><UserMinus size={80} /></div>
                 <h4 className="text-xs font-black uppercase tracking-widest text-indigo-300 mb-6">Zombie Prevention Protocol</h4>
                 <div className="space-y-6 relative z-10">
                    <div className="flex items-start space-x-4">
                       <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center shrink-0"><ShieldCheck size={16} /></div>
                       <div>
                          <p className="text-[11px] font-black uppercase tracking-tight">Cross-Spoke Check</p>
                          <p className="text-[10px] text-indigo-200 opacity-60">Deleting from one site doesn't erase the master record if the user exists elsewhere in the ecosystem.</p>
                       </div>
                    </div>
                    <div className="flex items-start space-x-4">
                       <div className="w-8 h-8 rounded-lg bg-rose-500 flex items-center justify-center shrink-0"><ZombieIcon size={16} /></div>
                       <div>
                          <p className="text-[11px] font-black uppercase tracking-tight">Auto-Unsubscribe (Harden)</p>
                          <p className="text-[10px] text-indigo-200 opacity-60">If 'source_sites' becomes empty, Trellis automatically sets 'is_subscribed = false' to prevent phantom marketing sends.</p>
                       </div>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}

      {activeTab === 'hygiene' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in duration-300">
           <div className="lg:col-span-2 space-y-8">
              <div className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm">
                 <div className="flex justify-between items-center mb-10">
                    <div>
                        <h3 className="text-2xl font-black text-slate-800 flex items-center uppercase tracking-tight">
                            <Recycle size={32} className="mr-4 text-emerald-600" />
                            Data Hygiene (pg_cron)
                        </h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 ml-12">TTL Lifecycle: 90 Days</p>
                    </div>
                    <button 
                        onClick={runCleanupManual}
                        disabled={isCleaning}
                        className="px-6 py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 transition shadow-xl flex items-center space-x-2"
                    >
                        {isCleaning ? <RefreshCw className="animate-spin" size={14} /> : <Eraser size={14} />}
                        <span>{isCleaning ? 'Archiving...' : 'Manual Purge'}</span>
                    </button>
                 </div>

                 <div className="grid grid-cols-3 gap-6 mb-10">
                    <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 text-center group">
                        <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Hot Storage (Active)</p>
                        <p className="text-3xl font-black text-slate-900">{hygieneStats.hot.toLocaleString()}</p>
                        <p className="text-[8px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">&lt; 90 Days</p>
                    </div>
                    <div className="bg-indigo-50 p-6 rounded-3xl border border-indigo-100 text-center">
                        <p className="text-[9px] font-black text-indigo-700 uppercase mb-1">Cold Storage (Archive)</p>
                        <p className="text-3xl font-black text-indigo-600">{hygieneStats.cold.toLocaleString()}</p>
                        <p className="text-[8px] font-bold text-indigo-400 mt-1 uppercase tracking-tighter">Compressed rows</p>
                    </div>
                    <div className="bg-rose-50 p-6 rounded-3xl border border-rose-100 text-center">
                        <p className="text-[9px] font-black text-rose-700 uppercase mb-1">Noise Purged</p>
                        <p className="text-3xl font-black text-rose-600">{hygieneStats.purged.toLocaleString()}</p>
                        <p className="text-[8px] font-bold text-rose-400 mt-1 uppercase tracking-tighter">Opens/Clicks Deleted</p>
                    </div>
                 </div>

                 <div className="p-8 bg-slate-900 rounded-[2.5rem] text-white">
                    <h4 className="text-xs font-black uppercase tracking-widest text-emerald-400 mb-6 flex items-center">
                        <Code size={16} className="mr-2" />
                        pg_cron definition
                    </h4>
                    <pre className="bg-black/30 p-6 rounded-2xl font-mono text-[10px] text-emerald-300 leading-relaxed overflow-x-auto">
{`-- Move core events to Cold Storage
INSERT INTO compressed_archive_events
SELECT * FROM marketing_events 
WHERE created_at < NOW() - INTERVAL '90 days'
AND event_type IN ('purchase', 'signup');

-- Purge noise events permanently
DELETE FROM marketing_events 
WHERE created_at < NOW() - INTERVAL '90 days'
AND event_type IN ('open', 'click');`}
                    </pre>
                 </div>
              </div>
           </div>
           <div className="space-y-8">
              <div className="bg-slate-900 p-8 rounded-[3rem] text-white shadow-2xl relative overflow-hidden">
                 <div className="absolute top-0 right-0 p-4 opacity-10"><Recycle size={80} /></div>
                 <h4 className="text-xs font-black uppercase tracking-widest text-emerald-400 mb-6">Storage Protocol</h4>
                 <div className="space-y-6 relative z-10">
                    <div className="flex items-start space-x-4">
                       <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0"><HardDrive size={16} className="text-emerald-400" /></div>
                       <div>
                          <p className="text-[11px] font-black uppercase">Tiered Storage</p>
                          <p className="text-[10px] text-slate-400 leading-relaxed">Trellis keeps indices fast by moving aged events to a separate compressed table.</p>
                       </div>
                    </div>
                    <div className="flex items-start space-x-4">
                       <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center shrink-0"><Filter size={16} className="text-indigo-400" /></div>
                       <div>
                          <p className="text-[11px] font-black uppercase">Noise Filtering</p>
                          <p className="text-[10px] text-slate-400 leading-relaxed">High-volume transactional logs like 'Email Open' are deleted after 90 days to keep PG storage costs lean.</p>
                       </div>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}

      {activeTab === 'worker' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in duration-300">
           <div className="lg:col-span-2 space-y-8">
              <div className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm">
                 <div className="flex justify-between items-center mb-10">
                    <div>
                        <h3 className="text-2xl font-black text-slate-800 flex items-center uppercase tracking-tight">
                            <Cpu size={32} className="mr-4 text-emerald-600" />
                            Worker Node (Supabase Gate)
                        </h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1 ml-12">Controlled Throttling: 5 tasks / sec</p>
                    </div>
                    <div className="flex space-x-3">
                       <button onClick={handleFloodQueue} className="px-6 py-3 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-600 transition shadow-xl">Flood Hub (50 Requests)</button>
                    </div>
                 </div>

                 <div className="grid grid-cols-3 gap-6 mb-10">
                    <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 text-center">
                        <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Queue Depth</p>
                        <p className="text-3xl font-black text-slate-900">{taskQueue.filter(t => t.status === 'pending').length}</p>
                    </div>
                    <div className="bg-emerald-50 p-6 rounded-3xl border border-emerald-100 text-center">
                        <p className="text-[9px] font-black text-emerald-700 uppercase mb-1">Processed</p>
                        <p className="text-3xl font-black text-emerald-600">{processedCount}</p>
                    </div>
                    <div className="bg-slate-900 p-6 rounded-3xl text-center flex flex-col justify-center">
                        <div className="flex items-center justify-center space-x-2 text-emerald-400">
                            {isWorkerActive ? <RefreshCw className="animate-spin" size={14} /> : <Timer size={14} />}
                            <span className="text-[10px] font-black uppercase">{isWorkerActive ? 'Heartbeat Active' : 'Worker Idle'}</span>
                        </div>
                    </div>
                 </div>

                 <div className="overflow-hidden border border-slate-100 rounded-[2rem]">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 border-b border-slate-100">
                           <tr>
                              <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase">Task Detail</th>
                              <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase">Status</th>
                              <th className="px-8 py-4 text-[10px] font-black text-slate-400 uppercase text-right">Batch Time</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                           {taskQueue.slice(0, 10).map(task => (
                             <tr key={task.id} className="transition-colors">
                                <td className="px-8 py-4">
                                   <div className="flex items-center space-x-3">
                                      <Box size={14} className="text-slate-400" />
                                      <span className="text-[10px] font-mono text-slate-600 font-bold">{task.id}</span>
                                   </div>
                                </td>
                                <td className="px-8 py-4">
                                   <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${task.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700 animate-pulse'}`}>
                                      {task.status}
                                   </span>
                                </td>
                                <td className="px-8 py-4 text-right">
                                   <span className="text-[9px] font-mono text-slate-400">{task.processed_at ? new Date(task.processed_at).toLocaleTimeString() : '--:--:--'}</span>
                                </td>
                             </tr>
                           ))}
                           {taskQueue.length > 10 && (
                             <tr>
                                <td colSpan={3} className="px-8 py-4 text-center bg-slate-50 text-[10px] font-black text-slate-400 uppercase">
                                   +{taskQueue.length - 10} more tasks in buffer
                                </td>
                             </tr>
                           )}
                           {taskQueue.length === 0 && (
                             <tr><td colSpan={3} className="py-20 text-center text-slate-300 uppercase font-black text-[10px]">Queue Clear</td></tr>
                           )}
                        </tbody>
                    </table>
                 </div>
              </div>
           </div>
           <div className="space-y-8">
              <div className="bg-slate-900 p-8 rounded-[3rem] text-white shadow-2xl relative overflow-hidden">
                 <div className="absolute top-0 right-0 p-4 opacity-10"><Layers size={80} /></div>
                 <h4 className="text-xs font-black uppercase tracking-widest text-emerald-400 mb-6">API Guard Protocol</h4>
                 <div className="space-y-6 relative z-10">
                    <div className="flex items-start space-x-4">
                       <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0"><ShieldCheck size={16} className="text-emerald-400" /></div>
                       <div>
                          <p className="text-[11px] font-black uppercase">Throttled Egress</p>
                          <p className="text-[10px] text-slate-400 leading-relaxed">The worker workflow pulls from the Supabase table at a fixed frequency to avoid GEMINI-429 errors.</p>
                       </div>
                    </div>
                    <div className="flex items-start space-x-4">
                       <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center shrink-0"><RotateCcw size={16} className="text-indigo-400" /></div>
                       <div>
                          <p className="text-[11px] font-black uppercase">Auto-Retry (FIFO)</p>
                          <p className="text-[10px] text-slate-400 leading-relaxed">Failed attempts are incremented and re-queued with lower priority to ensure high-velocity peaks don't break logic.</p>
                       </div>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}

      {activeTab === 'dlq' && (
        <div className="space-y-8 animate-in fade-in duration-300">
           <div className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm">
              <div className="flex justify-between items-center mb-10">
                 <div>
                    <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight flex items-center">
                       <Bug size={32} className="mr-4 text-rose-500" />
                       Dead Letter Queue
                    </h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mt-1 ml-12">Failed Ingest Terminal</p>
                 </div>
              </div>
              <div className="overflow-hidden border border-slate-100 rounded-[2rem]">
                 <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-100">
                       <tr>
                          <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase">Incident Detail</th>
                          <th className="px-8 py-6 text-[10px] font-black text-slate-400 uppercase text-right">Action</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                       {failedSyncs.map(fail => (
                         <tr key={fail.id} className="group hover:bg-slate-50/80 transition-colors">
                            <td className="px-8 py-6">
                               <div className="flex items-center space-x-4">
                                  <div className="w-10 h-10 bg-rose-50 text-rose-600 rounded-xl flex items-center justify-center font-black">!</div>
                                  <div>
                                     <p className="text-sm font-black text-slate-800 uppercase">{fail.event_id}</p>
                                     <p className="text-[10px] text-slate-400 font-bold italic line-clamp-1">"{fail.error_message}"</p>
                                  </div>
                               </div>
                            </td>
                            <td className="px-8 py-6 text-right">
                               <button className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><RotateCcw size={16} /></button>
                            </td>
                         </tr>
                       ))}
                    </tbody>
                 </table>
              </div>
           </div>
        </div>
      )}

      {activeTab === 'sql' && (
        <div className="space-y-8 animate-in fade-in duration-300">
           <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm">
              <div className="flex justify-between items-center mb-6">
                 <h3 className="text-lg font-black text-slate-800 uppercase tracking-tight">Active Schema</h3>
                 <button onClick={() => handleCopy(SQL_SCHEMA, 'sql')} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-xl transition-all">
                    {copiedSection === 'sql' ? <CheckCircle2 size={20} /> : <Copy size={20} />}
                 </button>
              </div>
              <div className="bg-slate-900 p-8 rounded-3xl font-mono text-[11px] text-emerald-400 h-[600px] overflow-y-auto custom-scrollbar border border-slate-800">
                 <pre className="whitespace-pre-wrap">{SQL_SCHEMA}</pre>
              </div>
           </div>
        </div>
      )}

      {activeTab === 'n8n' && (
        <div className="space-y-12 animate-in fade-in duration-300 pb-20">
           <div className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm">
              <div className="flex justify-between items-center mb-10 pb-6 border-b border-slate-100">
                 <div>
                    <h3 className="text-2xl font-black text-slate-800 uppercase tracking-tight flex items-center">
                       <Workflow size={32} className="mr-4 text-emerald-600" />
                       n8n Orchestration Blueprints
                    </h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mt-1 ml-12">Copy JSON into your n8n workspace</p>
                 </div>
              </div>

              <div className="grid grid-cols-1 gap-12">
                 {[
                   { id: 'ingest', title: 'Identity Ingest Gateway', desc: 'Atomic resolution and profile merging across 5 spokes.', json: N8N_BLUEPRINTS.ingest_gateway },
                   { id: 'worker', title: 'Throttled API Worker', desc: 'Handles high-volume egress to Resend and Gemini.', json: N8N_BLUEPRINTS.worker_node },
                   { id: 'social', title: 'Social Listening Intent', desc: 'Gemini-powered sentiment analysis for Instagram triggers.', json: N8N_BLUEPRINTS.social_intent }
                 ].map(bp => (
                   <div key={bp.id} className="space-y-4">
                      <div className="flex justify-between items-center px-4">
                         <div>
                            <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">{bp.title}</h4>
                            <p className="text-[10px] text-slate-400 font-medium italic">{bp.desc}</p>
                         </div>
                         <button 
                           onClick={() => handleCopy(bp.json, bp.id)}
                           className="flex items-center space-x-2 px-4 py-2 bg-emerald-50 text-emerald-600 rounded-xl text-[10px] font-black uppercase hover:bg-emerald-600 hover:text-white transition-all shadow-sm"
                         >
                            {copiedSection === bp.id ? <CheckCircle2 size={14} /> : <Copy size={14} />}
                            <span>{copiedSection === bp.id ? 'Copied to Clipboard' : 'Copy JSON'}</span>
                         </button>
                      </div>
                      <div className="bg-slate-900 rounded-[2.5rem] p-8 h-80 overflow-y-auto border border-slate-800 custom-scrollbar-dark font-mono text-[10px] text-emerald-400">
                         <pre className="whitespace-pre-wrap">{bp.json}</pre>
                      </div>
                   </div>
                 ))}
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default DevTools;
