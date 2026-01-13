
import React, { useState, useMemo } from 'react';
import { MarketingTask, TaskType, AuditLogEntry } from '../types';
import { 
  Search, Calendar, AlertCircle, CheckCircle2, 
  Clock, Plus, X, PenTool, Image as ImageIcon, 
  Users, Terminal, BarChart, ChevronRight, Sparkles,
  Link, ExternalLink, ThumbsUp, ThumbsDown, MessageSquare,
  Activity, RefreshCw, Send, Save, FileText, Zap, Share2,
  Instagram, Twitter, Linkedin, Slack, LayoutGrid, List,
  CalendarDays, Trash2, Edit3, MoreHorizontal, History,
  Archive, Settings2, ShieldCheck, ArrowUpRight, ChevronLeft
} from 'lucide-react';

interface TasksProps {
  tasks: MarketingTask[];
  setTasks: React.Dispatch<React.SetStateAction<MarketingTask[]>>;
}

const TYPE_CONFIG = {
  copywriting: { icon: PenTool, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100', label: 'Copywriting' },
  design: { icon: ImageIcon, color: 'text-purple-600', bg: 'bg-purple-50', border: 'border-purple-100', label: 'Design' },
  audience: { icon: Users, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100', label: 'Audience' },
  technical: { icon: Terminal, color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-100', label: 'Technical' },
  analysis: { icon: BarChart, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100', label: 'Analysis' },
  social: { icon: Share2, color: 'text-pink-600', bg: 'bg-pink-50', border: 'border-pink-100', label: 'Social' },
};

const Tasks: React.FC<TasksProps> = ({ tasks, setTasks }) => {
  const [activeView, setActiveView] = useState<'grid' | 'list' | 'calendar'>('grid');
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<MarketingTask | null>(null);

  const [newTask, setNewTask] = useState<Partial<MarketingTask>>({
    title: '',
    description: '',
    priority: 'medium',
    status: 'pending',
    type: 'copywriting',
    due_date: new Date().toISOString().split('T')[0]
  });

  const generateLog = (action: string): AuditLogEntry => ({
    action,
    timestamp: new Date().toISOString(),
    user: 'Trellis Admin'
  });

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.title || !newTask.due_date) return;

    const task: MarketingTask = {
      id: `task_${crypto.randomUUID()}`,
      title: newTask.title || '',
      description: newTask.description || '',
      status: 'pending',
      priority: (newTask.priority as any) || 'medium',
      type: (newTask.type as TaskType) || 'copywriting',
      due_date: newTask.due_date || '',
      audit_log: [generateLog('Task Created')]
    };

    setTasks(prev => [task, ...prev]);
    setIsModalOpen(false);
    setNewTask({ title: '', description: '', priority: 'medium', status: 'pending', type: 'copywriting', due_date: new Date().toISOString().split('T')[0] });
  };

  const handleUpdateTask = (updated: MarketingTask) => {
    const logged = { ...updated, audit_log: [generateLog('Task properties modified'), ...(updated.audit_log || [])] };
    setTasks(prev => prev.map(t => t.id === updated.id ? logged : t));
    setEditingTask(null);
  };

  const toggleTaskStatus = (id: string) => {
    setTasks(prev => prev.map(t => {
      if (t.id === id) {
        const newStatus = t.status === 'completed' ? 'pending' : 'completed';
        return { 
          ...t, 
          status: newStatus as any, 
          audit_log: [generateLog(`Status changed to ${newStatus}`), ...(t.audit_log || [])] 
        };
      }
      return t;
    }));
  };

  const handleArchiveTask = (id: string) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, status: 'archived', audit_log: [generateLog('Task archived'), ...(t.audit_log || [])] } : t));
    setEditingTask(null);
  };

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      if (task.status === 'archived' && searchTerm === '') return false;
      return task.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
             task.description.toLowerCase().includes(searchTerm.toLowerCase());
    }).sort((a, b) => {
      const p = { high: 3, medium: 2, low: 1 };
      return p[b.priority] - p[a.priority];
    });
  }, [tasks, searchTerm]);

  // CALENDAR LOGIC
  const calendarData = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    return { firstDay, daysInMonth, monthLabel: now.toLocaleString('default', { month: 'long', year: 'numeric' }) };
  }, []);

  const renderGridView = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
      {filteredTasks.map((task) => {
        const config = TYPE_CONFIG[task.type];
        const isCompleted = task.status === 'completed';
        return (
          <div 
            key={task.id} 
            className={`group bg-white p-8 rounded-[2.5rem] border-2 transition-all duration-300 flex flex-col ${
              isCompleted ? 'border-slate-100 opacity-60' : `border-slate-100 hover:${config.border} hover:shadow-2xl hover:shadow-emerald-900/5`
            }`}
          >
            <div className="flex justify-between items-start mb-6">
              <div className={`p-3.5 rounded-2xl ${config.bg} ${config.color} transition-transform group-hover:rotate-6`}>
                {React.createElement(config.icon, { size: 22 })}
              </div>
              <div className="flex items-center space-x-3">
                <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${
                  task.priority === 'high' ? 'bg-rose-100 text-rose-600' : 
                  task.priority === 'medium' ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'
                }`}>
                  {task.priority}
                </span>
                <button 
                  onClick={() => toggleTaskStatus(task.id)}
                  className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
                    isCompleted ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-200 hover:border-emerald-500'
                  }`}
                >
                  {isCompleted && <CheckCircle2 size={14} />}
                </button>
              </div>
            </div>

            <h3 className={`text-base font-black mb-2 uppercase tracking-tight ${isCompleted ? 'line-through text-slate-400' : 'text-slate-800'}`}>
              {task.title}
            </h3>
            <p className="text-xs text-slate-500 mb-8 line-clamp-2 h-10 leading-relaxed font-medium">
              {task.description}
            </p>

            <div className="flex items-center justify-between mt-auto pt-6 border-t border-slate-50">
              <div className="flex items-center text-[10px] font-black text-slate-400 uppercase tracking-widest">
                <Clock size={12} className="mr-2" />
                {new Date(task.due_date).toLocaleDateString([], { month: 'short', day: 'numeric' })}
              </div>
              <button 
                onClick={() => setEditingTask(task)}
                className="p-2 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
              >
                <Settings2 size={18} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderListView = () => (
    <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden animate-in fade-in duration-300">
      <table className="w-full text-left">
        <thead className="bg-slate-50 border-b border-slate-100">
           <tr>
             <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Task Detail</th>
             <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Category</th>
             <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Priority</th>
             <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Due Date</th>
             <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
           </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {filteredTasks.map(task => {
             const config = TYPE_CONFIG[task.type];
             const isCompleted = task.status === 'completed';
             return (
               <tr key={task.id} className="group hover:bg-slate-50/80 transition-colors">
                  <td className="px-8 py-5">
                    <div className="flex items-center space-x-4">
                       <button 
                         onClick={() => toggleTaskStatus(task.id)}
                         className={`w-5 h-5 rounded border-2 shrink-0 flex items-center justify-center transition-all ${
                            isCompleted ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-200'
                         }`}
                       >
                          {isCompleted && <CheckCircle2 size={12} />}
                       </button>
                       <div>
                          <p className={`text-sm font-black uppercase tracking-tight ${isCompleted ? 'line-through text-slate-400' : 'text-slate-800'}`}>{task.title}</p>
                          <p className="text-[10px] text-slate-400 font-bold italic line-clamp-1">{task.description}</p>
                       </div>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <div className={`inline-flex items-center space-x-2 px-3 py-1.5 rounded-xl ${config.bg} ${config.color} text-[10px] font-black uppercase tracking-widest`}>
                       {React.createElement(config.icon, { size: 12 })}
                       <span>{config.label}</span>
                    </div>
                  </td>
                  <td className="px-8 py-5 text-center">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                      task.priority === 'high' ? 'bg-rose-50 text-rose-600 border border-rose-100' : 
                      task.priority === 'medium' ? 'bg-amber-50 text-amber-600 border border-amber-100' : 'bg-blue-50 text-blue-600 border border-blue-100'
                    }`}>
                      {task.priority}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-center font-bold text-xs text-slate-600">
                    {new Date(task.due_date).toLocaleDateString()}
                  </td>
                  <td className="px-8 py-5 text-right">
                    <div className="flex justify-end space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
                       <button onClick={() => setEditingTask(task)} className="p-2 text-slate-400 hover:text-indigo-600 transition"><Edit3 size={16} /></button>
                       <button onClick={() => handleArchiveTask(task.id)} className="p-2 text-slate-400 hover:text-rose-500 transition"><Archive size={16} /></button>
                    </div>
                  </td>
               </tr>
             );
          })}
        </tbody>
      </table>
    </div>
  );

  const renderCalendarView = () => {
    const { firstDay, daysInMonth, monthLabel } = calendarData;
    const totalSlots = Math.ceil((firstDay + daysInMonth) / 7) * 7;
    const days = Array.from({ length: totalSlots });

    return (
      <div className="bg-white rounded-[3rem] border border-slate-200 overflow-hidden shadow-sm animate-in fade-in duration-300">
        <div className="bg-slate-900 px-10 py-6 flex justify-between items-center text-white">
           <h3 className="text-sm font-black uppercase tracking-widest">{monthLabel}</h3>
           <div className="flex items-center space-x-4">
              <button className="p-2 bg-white/5 rounded-xl hover:bg-white/10 transition"><ChevronLeft size={16} /></button>
              <button className="p-2 bg-white/5 rounded-xl hover:bg-white/10 transition"><ChevronRight size={16} /></button>
           </div>
        </div>
        <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-100">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="py-4 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 auto-rows-[160px]">
          {days.map((_, idx) => {
            const dayNum = idx - firstDay + 1;
            const isPadding = dayNum <= 0 || dayNum > daysInMonth;
            const isToday = dayNum === new Date().getDate();
            
            const date = new Date();
            date.setDate(dayNum);
            const dateStr = date.toISOString().split('T')[0];
            const dayTasks = isPadding ? [] : tasks.filter(t => t.due_date === dateStr && t.status !== 'archived');
            
            return (
              <div key={idx} className={`border-r border-b border-slate-50 p-3 transition-colors group relative ${isPadding ? 'bg-slate-50/50' : 'hover:bg-slate-50/50'}`}>
                 {!isPadding && (
                    <>
                       <span className={`text-[10px] font-black mb-2 block w-6 h-6 flex items-center justify-center rounded-lg ${isToday ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400'}`}>
                          {dayNum}
                       </span>
                       <div className="space-y-1.5 overflow-y-auto custom-scrollbar-light max-h-[110px]">
                          {dayTasks.map(t => (
                            <div 
                              key={t.id} 
                              onClick={() => setEditingTask(t)}
                              className={`p-2 rounded-lg text-[9px] font-black uppercase truncate border cursor-pointer shadow-sm flex items-center space-x-1.5 transition-transform hover:scale-105 ${
                                t.status === 'completed' ? 'bg-emerald-50 text-emerald-600 border-emerald-100 opacity-60' : 
                                t.priority === 'high' ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-slate-50 text-slate-700 border-slate-100'
                              }`}
                            >
                               <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                  t.status === 'completed' ? 'bg-emerald-500' : 
                                  t.priority === 'high' ? 'bg-rose-500' : 'bg-slate-400'
                               }`}></div>
                               <span className="truncate">{t.title}</span>
                            </div>
                          ))}
                       </div>
                    </>
                 )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-10 pb-40">
      <div className="flex flex-col md:flex-row justify-between items-center gap-8">
        <div className="flex bg-slate-200/40 p-1.5 rounded-[2rem] w-fit border border-slate-200 shadow-inner">
          <button onClick={() => setActiveView('grid')} className={`flex items-center space-x-3 px-8 py-3 rounded-[1.5rem] text-xs font-black uppercase tracking-widest transition-all ${activeView === 'grid' ? 'bg-white text-emerald-700 shadow-lg' : 'text-slate-500 hover:text-slate-800'}`}>
            <LayoutGrid size={18} />
            <span>Grid</span>
          </button>
          <button onClick={() => setActiveView('list')} className={`flex items-center space-x-3 px-8 py-3 rounded-[1.5rem] text-xs font-black uppercase tracking-widest transition-all ${activeView === 'list' ? 'bg-white text-emerald-700 shadow-lg' : 'text-slate-500 hover:text-slate-800'}`}>
            <List size={18} />
            <span>List</span>
          </button>
          <button onClick={() => setActiveView('calendar')} className={`flex items-center space-x-3 px-8 py-3 rounded-[1.5rem] text-xs font-black uppercase tracking-widest transition-all ${activeView === 'calendar' ? 'bg-white text-emerald-700 shadow-lg' : 'text-slate-500 hover:text-slate-800'}`}>
            <CalendarDays size={18} />
            <span>Calendar</span>
          </button>
        </div>

        <div className="flex-1 max-w-xl w-full flex items-center space-x-4">
           <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="Audit tasks by title or desc..." 
                className="w-full pl-12 pr-4 py-3.5 bg-white border border-slate-200 rounded-[1.5rem] outline-none focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500 transition-all font-bold text-sm"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
           </div>
           <button 
            onClick={() => setIsModalOpen(true)} 
            className="p-3.5 bg-slate-900 text-white rounded-[1.2rem] flex items-center justify-center hover:bg-emerald-600 transition-all shadow-xl"
          >
            <Plus size={24} />
          </button>
        </div>
      </div>

      <div className="min-h-[600px]">
        {activeView === 'grid' && renderGridView()}
        {activeView === 'list' && renderListView()}
        {activeView === 'calendar' && renderCalendarView()}
      </div>

      {editingTask && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/90 backdrop-blur-xl animate-in fade-in duration-300">
           <div className="bg-white w-full max-w-5xl h-[85vh] rounded-[4rem] shadow-2xl overflow-hidden flex flex-col border border-white/20">
              <div className="p-10 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
                 <div className="flex items-center space-x-6">
                    <div className={`w-16 h-16 rounded-3xl flex items-center justify-center shadow-lg ${TYPE_CONFIG[editingTask.type].bg} ${TYPE_CONFIG[editingTask.type].color}`}>
                       {React.createElement(TYPE_CONFIG[editingTask.type].icon, { size: 32 })}
                    </div>
                    <div>
                       <h3 className="text-3xl font-black text-slate-800 tracking-tight uppercase">{editingTask.title}</h3>
                       <div className="flex items-center space-x-3 text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">
                          <span className="flex items-center text-emerald-600"><ShieldCheck size={12} className="mr-1" /> Campaign Integrity Verified</span>
                          <span>•</span>
                          <span>TASK ID: {editingTask.id}</span>
                       </div>
                    </div>
                 </div>
                 <button onClick={() => setEditingTask(null)} className="p-3 text-slate-300 hover:text-rose-500 transition-colors"><X size={32} /></button>
              </div>

              <div className="flex-1 flex min-h-0 bg-slate-50/40">
                 <div className="flex-1 overflow-y-auto p-12 space-y-12 custom-scrollbar">
                    <div className="space-y-6">
                       <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Task Parameters</label>
                       <div className="grid grid-cols-2 gap-6">
                          <div className="space-y-2">
                             <span className="text-[9px] font-black text-slate-400 uppercase ml-2">Title</span>
                             <input 
                               className="w-full bg-white border border-slate-200 rounded-2xl p-4 text-sm font-black uppercase text-slate-800 focus:border-emerald-500 outline-none transition"
                               value={editingTask.title}
                               onChange={e => setEditingTask({...editingTask, title: e.target.value})}
                             />
                          </div>
                          <div className="space-y-2">
                             <span className="text-[9px] font-black text-slate-400 uppercase ml-2">Due Date</span>
                             <input 
                               type="date"
                               className="w-full bg-white border border-slate-200 rounded-2xl p-4 text-sm font-bold text-slate-800 focus:border-emerald-500 outline-none transition"
                               value={editingTask.due_date}
                               onChange={e => setEditingTask({...editingTask, due_date: e.target.value})}
                             />
                          </div>
                       </div>
                       <div className="space-y-2">
                          <span className="text-[9px] font-black text-slate-400 uppercase ml-2">Description / Objectives</span>
                          <textarea 
                            className="w-full bg-white border border-slate-200 rounded-3xl p-6 text-sm font-medium text-slate-600 leading-relaxed min-h-[150px] outline-none focus:border-emerald-500 transition"
                            value={editingTask.description}
                            onChange={e => setEditingTask({...editingTask, description: e.target.value})}
                          />
                       </div>
                    </div>

                    <div className="bg-emerald-50 p-8 rounded-[2.5rem] border border-emerald-100 relative overflow-hidden group">
                       <div className="absolute right-0 top-0 p-4 opacity-10 group-hover:rotate-12 transition-transform">
                          <Sparkles size={100} className="text-emerald-500" />
                       </div>
                       <h4 className="text-sm font-black text-emerald-900 uppercase mb-4 flex items-center">
                          <Activity size={16} className="mr-2" /> 
                          Workspace Execution
                       </h4>
                       <p className="text-xs text-emerald-700 leading-relaxed italic max-w-xl">
                          "This task is linked to the <b>Global Onboarding Flow</b>. Automated drafting is available for the Copywriting and Design components."
                       </p>
                       <button className="mt-8 px-8 py-4 bg-emerald-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 transition flex items-center space-x-2">
                          <span>Initiate AI Flow</span>
                          <ArrowUpRight size={14} />
                       </button>
                    </div>
                 </div>

                 <div className="w-[400px] bg-white border-l border-slate-100 flex flex-col">
                    <div className="p-10 border-b border-slate-50 flex items-center space-x-3">
                       <History size={20} className="text-slate-400" />
                       <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest">Audit History</h4>
                    </div>
                    <div className="flex-1 overflow-y-auto p-10 space-y-6 custom-scrollbar">
                       {editingTask.audit_log?.map((log, i) => (
                         <div key={i} className="relative pl-8">
                            <div className="absolute left-0 top-0 bottom-[-24px] w-0.5 bg-slate-50 last:hidden"></div>
                            <div className="absolute left-[-4px] top-1 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white shadow-sm"></div>
                            <p className="text-[10px] font-black text-slate-800 uppercase tracking-tight mb-1">{log.action}</p>
                            <p className="text-[9px] text-slate-400 font-bold mb-1">BY {log.user}</p>
                            <p className="text-[8px] text-slate-300 font-mono">{new Date(log.timestamp).toLocaleString()}</p>
                         </div>
                       )) || (
                         <div className="text-center py-20 opacity-30">
                            <Archive size={48} className="mx-auto mb-4" />
                            <p className="text-[10px] font-black uppercase">No history found</p>
                         </div>
                       )}
                    </div>
                    <div className="p-8 bg-slate-50 border-t border-slate-100 space-y-3">
                       <button 
                         onClick={() => handleUpdateTask(editingTask)}
                         className="w-full py-5 bg-slate-900 text-white rounded-3xl font-black text-sm flex items-center justify-center space-x-3 shadow-xl hover:bg-slate-800 transition"
                       >
                          <Save size={18} />
                          <span>Commit Changes</span>
                       </button>
                       <button 
                         onClick={() => handleArchiveTask(editingTask.id)}
                         className="w-full py-5 bg-rose-50 text-rose-600 border border-rose-100 rounded-3xl font-black text-sm flex items-center justify-center space-x-3 hover:bg-rose-100 transition"
                       >
                          <Archive size={18} />
                          <span>Archive Task</span>
                       </button>
                    </div>
                 </div>
              </div>
           </div>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-6 bg-slate-900/80 backdrop-blur-md">
          <div className="bg-white w-full max-w-2xl rounded-[4rem] p-12 shadow-2xl animate-in zoom-in-95 duration-300 border border-white/20">
            <div className="flex justify-between items-center mb-10 pb-6 border-b border-slate-100">
              <div>
                <h3 className="text-3xl font-black text-slate-800 tracking-tighter uppercase">New Campaign Task</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">Global Orchestration Gateway</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-3 bg-slate-50 rounded-2xl text-slate-400 hover:text-rose-500 transition"><X size={28} /></button>
            </div>
            
            <form onSubmit={handleCreateTask} className="space-y-8">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 ml-2">Task Vertical</label>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                  {(Object.keys(TYPE_CONFIG) as TaskType[]).map(type => {
                    const cfg = TYPE_CONFIG[type];
                    const active = newTask.type === type;
                    return (
                      <button key={type} type="button" onClick={() => setNewTask({...newTask, type})} className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${active ? 'border-emerald-500 bg-emerald-50 shadow-lg scale-105' : 'border-slate-100 hover:border-slate-200'}`}>
                        {React.createElement(cfg.icon, { size: 20, className: active ? 'text-emerald-600' : 'text-slate-300' })}
                        <span className={`text-[8px] font-black uppercase ${active ? 'text-emerald-700' : 'text-slate-400'}`}>{cfg.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                   <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Title</label>
                   <input className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] outline-none focus:bg-white focus:border-emerald-500 transition font-black uppercase text-sm tracking-tight shadow-inner" placeholder="e.g. AUDIT FALL 2024 IMAGE ASSETS" value={newTask.title} onChange={e => setNewTask({...newTask, title: e.target.value})} required />
                </div>
                
                <div className="grid grid-cols-2 gap-6">
                   <div className="space-y-2">
                     <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Priority Level</label>
                     <select className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] outline-none font-bold text-xs shadow-inner" value={newTask.priority} onChange={e => setNewTask({...newTask, priority: e.target.value as any})}>
                        <option value="low">LOW PRIORITY</option>
                        <option value="medium">MEDIUM PRIORITY</option>
                        <option value="high">HIGH PRIORITY (URGENT)</option>
                      </select>
                   </div>
                   <div className="space-y-2">
                     <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest ml-2">Deadline</label>
                     <input type="date" className="w-full p-5 bg-slate-50 border-2 border-slate-100 rounded-[1.5rem] outline-none font-bold text-xs shadow-inner" value={newTask.due_date} onChange={e => setNewTask({...newTask, due_date: e.target.value})} required />
                   </div>
                </div>
              </div>

              <button type="submit" className="w-full py-6 bg-slate-900 text-white rounded-[2rem] font-black text-xl flex items-center justify-center space-x-4 shadow-2xl hover:bg-emerald-600 transition active:scale-95">
                <Zap size={24} className="text-emerald-400" />
                <span>Synchronize & Create Task</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Tasks;
