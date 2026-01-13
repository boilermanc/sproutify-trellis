
import React, { useState, useEffect } from 'react';
import { GoogleGenAI } from "@google/genai";
import { 
  Workflow, Play, Clock, CheckCircle2, GitBranch, ArrowRight, 
  Mail, Instagram, Sparkles, MessageSquare, Share2, Slack, 
  Terminal, Zap, Copy, Check, Layout, Database, ShieldCheck,
  Plus, Trash2, Settings, ChevronRight, MousePointer2, 
  Search, Rocket, AlertTriangle, Layers, Split, Timer, 
  PlusCircle, Save, History, X, RefreshCw
} from 'lucide-react';

interface FlowNode {
  id: string;
  type: 'trigger' | 'action' | 'condition' | 'delay';
  label: string;
  sublabel: string;
  icon: any;
  color: string;
  bg: string;
  config?: any;
}

const NODE_TEMPLATES: Record<string, Partial<FlowNode>> = {
  trigger_signup: { type: 'trigger', label: 'New Signup', sublabel: 'Identity Created', icon: Play, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  trigger_purchase: { type: 'trigger', label: 'Purchase Made', sublabel: 'WooCommerce Order', icon: Play, color: 'text-emerald-600', bg: 'bg-emerald-50' },
  action_email: { type: 'action', label: 'Send Email', sublabel: 'Resend / Trellis Template', icon: Mail, color: 'text-indigo-600', bg: 'bg-indigo-50' },
  action_slack: { type: 'action', label: 'Notify Slack', sublabel: 'Internal Alert', icon: Slack, color: 'text-rose-600', bg: 'bg-rose-50' },
  condition_tag: { type: 'condition', label: 'Check Tag', sublabel: 'Logic Branch', icon: Split, color: 'text-amber-600', bg: 'bg-amber-50' },
  delay_time: { type: 'delay', label: 'Wait Period', sublabel: '24 Hour Default', icon: Timer, color: 'text-slate-600', bg: 'bg-slate-50' },
};

const Automations: React.FC = () => {
  const [activeMode, setActiveMode] = useState<'builder' | 'blueprints'>('builder');
  const [flowName, setFlowName] = useState('New Onboarding Flow');
  const [nodes, setNodes] = useState<FlowNode[]>([
    { id: '1', ...NODE_TEMPLATES.trigger_signup as FlowNode },
    { id: '2', ...NODE_TEMPLATES.delay_time as FlowNode },
    { id: '3', ...NODE_TEMPLATES.action_email as FlowNode },
  ]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const addNode = (typeKey: string) => {
    const newNode = {
      id: Math.random().toString(36).substr(2, 9),
      ...NODE_TEMPLATES[typeKey] as FlowNode
    };
    setNodes([...nodes, newNode]);
  };

  const removeNode = (id: string) => {
    setNodes(nodes.filter(n => n.id !== id));
    if (selectedNode === id) setSelectedNode(null);
  };

  const moveNode = (index: number, direction: 'up' | 'down') => {
    const newNodes = [...nodes];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= nodes.length) return;
    [newNodes[index], newNodes[targetIndex]] = [newNodes[targetIndex], newNodes[index]];
    setNodes(newNodes);
  };

  const handleAiBuild = async () => {
    setIsGenerating(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: "Suggest an automation flow for 'Recovering Abandoned Carts for Garden Tools'. Provide exactly 4 steps. Just the step names.",
      });
      // Simulation for demo purposes
      setNodes([
        { id: 'ai_1', ...NODE_TEMPLATES.trigger_purchase as FlowNode, label: 'Abandoned Cart', sublabel: 'Trigger Detected' },
        { id: 'ai_2', ...NODE_TEMPLATES.delay_time as FlowNode, label: 'Wait 4 Hours', sublabel: 'Timing Logic' },
        { id: 'ai_3', ...NODE_TEMPLATES.action_email as FlowNode, label: 'Send Discount', sublabel: 'Recovery Email' },
        { id: 'ai_4', ...NODE_TEMPLATES.action_slack as FlowNode, label: 'Alert Sales', sublabel: 'Internal Hook' },
      ]);
      setFlowName("Sage: Cart Recovery Strategy");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-8 pb-40 min-h-screen">
      
      {/* Top Controller */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex bg-slate-200/40 p-1.5 rounded-[2rem] w-fit border border-slate-200 shadow-inner">
          <button 
            onClick={() => setActiveMode('builder')}
            className={`flex items-center space-x-3 px-8 py-3 rounded-[1.5rem] text-xs font-black uppercase tracking-widest transition-all ${activeMode === 'builder' ? 'bg-white text-emerald-700 shadow-lg' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <Layers size={18} />
            <span>Flow Builder</span>
          </button>
          <button 
            onClick={() => setActiveMode('blueprints')}
            className={`flex items-center space-x-3 px-8 py-3 rounded-[1.5rem] text-xs font-black uppercase tracking-widest transition-all ${activeMode === 'blueprints' ? 'bg-white text-emerald-700 shadow-lg' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <History size={18} />
            <span>Historical Runs</span>
          </button>
        </div>

        <div className="flex items-center space-x-4">
           <button 
             onClick={handleAiBuild}
             disabled={isGenerating}
             className="px-6 py-3.5 bg-slate-900 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center space-x-3 hover:bg-emerald-600 transition-all shadow-xl disabled:opacity-50"
           >
              {/* Added RefreshCw to imports to fix error on line 114 */}
              {isGenerating ? <RefreshCw className="animate-spin" size={16} /> : <Sparkles size={16} className="text-emerald-400" />}
              <span>{isGenerating ? 'Consulting Sage...' : 'AI Strategy Build'}</span>
           </button>
           <button className="px-6 py-3.5 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center space-x-3 hover:bg-emerald-700 transition-all shadow-xl">
              <Save size={16} />
              <span>Deploy Flow</span>
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Left Library: Node Library */}
        <div className="lg:col-span-1 space-y-8">
           <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
              <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6 flex items-center">
                 <PlusCircle size={16} className="mr-2" />
                 Step Library
              </h3>
              <div className="space-y-4">
                 <p className="text-[9px] font-bold text-slate-400 uppercase ml-2">Event Triggers</p>
                 <button onClick={() => addNode('trigger_signup')} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-left hover:border-emerald-500 hover:bg-white transition-all group flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                       <Play size={16} className="text-emerald-600" />
                       <span className="text-xs font-black uppercase text-slate-700">New User</span>
                    </div>
                    <Plus size={14} className="text-slate-300 group-hover:text-emerald-500" />
                 </button>
                 <button onClick={() => addNode('trigger_purchase')} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-left hover:border-emerald-500 hover:bg-white transition-all group flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                       <Play size={16} className="text-emerald-600" />
                       <span className="text-xs font-black uppercase text-slate-700">New Order</span>
                    </div>
                    <Plus size={14} className="text-slate-300 group-hover:text-emerald-500" />
                 </button>

                 <p className="text-[9px] font-bold text-slate-400 uppercase ml-2 pt-4">Marketing Actions</p>
                 <button onClick={() => addNode('action_email')} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-left hover:border-indigo-500 hover:bg-white transition-all group flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                       <Mail size={16} className="text-indigo-600" />
                       <span className="text-xs font-black uppercase text-slate-700">Send Dispatch</span>
                    </div>
                    <Plus size={14} className="text-slate-300 group-hover:text-indigo-500" />
                 </button>
                 <button onClick={() => addNode('action_slack')} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-left hover:border-rose-500 hover:bg-white transition-all group flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                       <Slack size={16} className="text-rose-600" />
                       <span className="text-xs font-black uppercase text-slate-700">Internal Alert</span>
                    </div>
                    <Plus size={14} className="text-slate-300 group-hover:text-rose-500" />
                 </button>

                 <p className="text-[9px] font-bold text-slate-400 uppercase ml-2 pt-4">Logic Gates</p>
                 <button onClick={() => addNode('condition_tag')} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-left hover:border-amber-500 hover:bg-white transition-all group flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                       <Split size={16} className="text-amber-600" />
                       <span className="text-xs font-black uppercase text-slate-700">Logic Branch</span>
                    </div>
                    <Plus size={14} className="text-slate-300 group-hover:text-amber-500" />
                 </button>
                 <button onClick={() => addNode('delay_time')} className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl text-left hover:border-slate-500 hover:bg-white transition-all group flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                       <Timer size={16} className="text-slate-600" />
                       <span className="text-xs font-black uppercase text-slate-700">Time Delay</span>
                    </div>
                    <Plus size={14} className="text-slate-300 group-hover:text-slate-500" />
                 </button>
              </div>
           </div>

           <div className="bg-slate-900 p-8 rounded-[2.5rem] text-white shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-10">
                 <ShieldCheck size={80} className="text-emerald-400" />
              </div>
              <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-3">Builder Status</h4>
              <p className="text-xs text-slate-400 leading-relaxed font-medium">Your changes are automatically synced to the Trellis orchestration DB once deployed.</p>
           </div>
        </div>

        {/* Center: Visual Canvas */}
        <div className="lg:col-span-2">
           <div className="bg-white rounded-[4rem] border-4 border-slate-100 shadow-sm min-h-[800px] flex flex-col relative overflow-hidden">
              {/* Background Grid Lines */}
              <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(#000 1px, transparent 1px)', backgroundSize: '30px 30px' }}></div>
              
              <div className="p-10 border-b border-slate-50 flex items-center justify-between relative z-10">
                 <div>
                    <input 
                      className="text-2xl font-black text-slate-800 uppercase tracking-tight outline-none bg-transparent focus:text-emerald-600"
                      value={flowName}
                      onChange={e => setFlowName(e.target.value)}
                    />
                    <div className="flex items-center space-x-2 mt-1">
                       <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
                       <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Live Orchestration Active</span>
                    </div>
                 </div>
                 <div className="px-4 py-2 bg-slate-50 rounded-xl text-[10px] font-black text-slate-400 uppercase border border-slate-100">{nodes.length} Blocks</div>
              </div>

              <div className="flex-1 p-12 space-y-12 flex flex-col items-center relative z-10 overflow-y-auto custom-scrollbar">
                 {nodes.length > 0 ? nodes.map((node, index) => (
                   <React.Fragment key={node.id}>
                      <div 
                        onClick={() => setSelectedNode(node.id)}
                        className={`w-full max-w-sm bg-white p-6 rounded-3xl border-2 transition-all cursor-pointer group relative ${
                          selectedNode === node.id 
                          ? 'border-emerald-500 shadow-2xl scale-105 ring-8 ring-emerald-500/5' 
                          : 'border-slate-100 hover:border-slate-300 shadow-sm'
                        }`}
                      >
                         <div className="flex items-center justify-between mb-4">
                            <div className={`p-3 rounded-2xl ${node.bg} ${node.color} transition-transform group-hover:scale-110`}>
                               {React.createElement(node.icon, { size: 20 })}
                            </div>
                            <div className="flex space-x-1">
                               <button onClick={(e) => { e.stopPropagation(); moveNode(index, 'up'); }} className="p-1.5 text-slate-300 hover:text-slate-900 transition"><ArrowRight size={14} className="-rotate-90" /></button>
                               <button onClick={(e) => { e.stopPropagation(); moveNode(index, 'down'); }} className="p-1.5 text-slate-300 hover:text-slate-900 transition"><ArrowRight size={14} className="rotate-90" /></button>
                               <button onClick={(e) => { e.stopPropagation(); removeNode(node.id); }} className="p-1.5 text-slate-300 hover:text-rose-500 transition"><Trash2 size={14} /></button>
                            </div>
                         </div>
                         <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">{node.label}</h4>
                         <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{node.sublabel}</p>

                         {/* Node Config Indicator */}
                         <div className="absolute -right-2 top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-slate-200 rounded-full flex items-center justify-center">
                            <div className="w-1 h-1 bg-slate-300 rounded-full"></div>
                         </div>
                      </div>

                      {index < nodes.length - 1 && (
                        <div className="flex flex-col items-center space-y-1">
                           <div className="w-0.5 h-8 bg-slate-200"></div>
                           <div className="p-1.5 bg-slate-50 border border-slate-100 rounded-lg text-slate-400">
                              <PlusCircle size={14} />
                           </div>
                           <div className="w-0.5 h-8 bg-slate-200"></div>
                        </div>
                      )}
                   </React.Fragment>
                 )) : (
                   <div className="flex flex-col items-center justify-center h-96 opacity-30 text-center">
                      <Workflow size={64} className="mb-6" />
                      <p className="text-xl font-black uppercase tracking-widest text-slate-400">Builder Canvas Empty</p>
                      <p className="text-xs font-bold mt-2 text-slate-500 max-w-xs">Drag nodes from the Step Library or ask Sage to generate a sequence for you.</p>
                   </div>
                 )}
                 <div className="pb-20"></div>
              </div>
           </div>
        </div>

        {/* Right Sidebar: Configuration / Sage Advice */}
        <div className="lg:col-span-1 space-y-8">
           <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
              <div className="flex items-center space-x-3 mb-8">
                 <div className="w-10 h-10 rounded-2xl bg-slate-900 text-emerald-400 flex items-center justify-center shadow-lg"><Settings size={20} /></div>
                 <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Step Logic</h3>
              </div>

              {selectedNode ? (
                 <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="space-y-3">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Label</label>
                       <input 
                         className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-emerald-500 transition"
                         value={nodes.find(n => n.id === selectedNode)?.label || ''}
                         onChange={e => setNodes(nodes.map(n => n.id === selectedNode ? {...n, label: e.target.value} : n))}
                       />
                    </div>
                    <div className="space-y-3">
                       <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Release Window</label>
                       <select className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-800 outline-none">
                          <option>AS SOON AS POSSIBLE</option>
                          <option>24 HOUR DELAY</option>
                          <option>7 DAY SEQUENCE</option>
                       </select>
                    </div>
                    <div className="bg-amber-50 p-6 rounded-[2rem] border border-amber-200">
                       <div className="flex items-center space-x-3 mb-3">
                          <AlertTriangle size={16} className="text-amber-600" />
                          <p className="text-[10px] font-black text-amber-900 uppercase tracking-widest">Logic Insight</p>
                       </div>
                       <p className="text-[10px] text-amber-700 font-medium leading-relaxed italic">"Conditionals check master identity attributes from all 5 spokes before branching."</p>
                    </div>
                 </div>
              ) : (
                 <div className="py-20 text-center text-slate-300">
                    <MousePointer2 size={48} className="mx-auto mb-4 opacity-10" />
                    <p className="text-[10px] font-black uppercase tracking-widest">Select a block to audit</p>
                 </div>
              )}
           </div>

           <div className="bg-emerald-900 p-8 rounded-[3rem] text-white shadow-2xl relative overflow-hidden flex flex-col min-h-[400px]">
              <div className="absolute top-0 right-0 p-6 opacity-10">
                 <Sparkles size={120} className="text-emerald-400" />
              </div>
              <div className="relative z-10 flex flex-col h-full">
                 <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-[0.2em] mb-6 flex items-center">
                    <Zap size={12} className="mr-2" /> Sage Strategic Auditor
                 </h4>
                 <div className="flex-1 space-y-6">
                    <p className="text-sm font-medium leading-relaxed italic border-l-2 border-emerald-500 pl-4">
                       "Based on the current <b>{nodes.length} step sequence</b>, I predict an 18% increase in cross-site conversion between Farm and School."
                    </p>
                    <div className="space-y-3">
                       <h5 className="text-[9px] font-black text-emerald-300 uppercase tracking-widest">Optimization Tips</h5>
                       <ul className="space-y-2">
                          <li className="flex items-start space-x-2 text-[10px] text-emerald-100">
                             <Check size={12} className="shrink-0 mt-0.5" />
                             <span>Add a wait state after the initial signup to improve engagement.</span>
                          </li>
                          <li className="flex items-start space-x-2 text-[10px] text-emerald-100">
                             <Check size={12} className="shrink-0 mt-0.5" />
                             <span>Identity matching is active on step 2.</span>
                          </li>
                       </ul>
                    </div>
                 </div>
                 <button className="mt-8 w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition shadow-lg">
                    Verify Ecosystem Sync
                 </button>
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default Automations;
