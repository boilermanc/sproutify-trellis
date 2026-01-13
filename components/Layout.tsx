
import React from 'react';
import { ViewState, User, Brand } from '../types';
import SageChat from './SageChat';
import ContextAwareHelp from './ContextAwareHelp';
import { 
  LayoutDashboard, Users, Workflow, Mail, Code2, Sprout, 
  CheckSquare, Rocket, Share2, Settings, LogOut, HelpCircle, 
  LifeBuoy, BarChart3, BookOpen, GraduationCap 
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  activeView: ViewState;
  onViewChange: (view: ViewState) => void;
  user: User;
  brand: Brand;
}

const Layout: React.FC<LayoutProps> = ({ children, activeView, onViewChange, user, brand }) => {
  const navItems = [
    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
    { id: 'knowledge-base', label: 'Knowledge Base', icon: BookOpen },
    { id: 'profiles', label: 'Profiles', icon: Users },
    { id: 'social-hub', label: 'Social Hub', icon: Share2 },
    { id: 'campaign-builder', label: 'Campaign Builder', icon: Rocket },
    { id: 'automations', label: 'n8n Flows', icon: Workflow },
    { id: 'tasks', label: 'Campaign Tasks', icon: CheckSquare },
    { id: 'email-preview', label: 'Email Previews', icon: Mail },
    { id: 'dev-tools', label: 'Dev Resources', icon: Code2 },
  ];

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 flex flex-col shrink-0">
        <div className="p-6 flex items-center space-x-3 text-emerald-400 border-b border-slate-800/50">
          <Sprout size={28} />
          <span className="font-bold text-xl text-white tracking-tight">Trellis</span>
        </div>
        
        <nav className="flex-1 mt-6 px-3 space-y-1 overflow-y-auto custom-scrollbar">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id as ViewState)}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 group ${
                activeView === item.id 
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/20' 
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <item.icon size={20} />
              <span className="font-medium text-sm">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800 space-y-2 bg-slate-900/50">
          <button 
            onClick={() => onViewChange('help-center')}
            className={`w-full flex items-center space-x-3 px-4 py-2 rounded-lg transition-colors ${
              activeView === 'help-center' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <HelpCircle size={18} className="text-emerald-400" />
            <span className="text-[10px] font-black uppercase tracking-widest">Help Center</span>
          </button>
          
          <button 
            onClick={() => onViewChange('settings')}
            className={`w-full flex items-center space-x-3 px-4 py-2 rounded-lg transition-colors ${
              activeView === 'settings' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Settings size={18} />
            <span className="text-[10px] font-black uppercase tracking-widest">App Settings</span>
          </button>
          
          <div className="flex items-center space-x-3 p-3 bg-slate-800/30 rounded-xl mt-2 group border border-slate-800/50">
            <div className="w-10 h-10 rounded-full bg-indigo-50 text-white flex items-center justify-center font-bold text-sm shadow-inner shrink-0">
              {user.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black text-white truncate uppercase tracking-tighter">{user.name}</p>
              <p className="text-[10px] text-slate-500 truncate capitalize">{user.role}</p>
            </div>
            <button className="text-slate-500 hover:text-rose-400 transition-colors">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-slate-50 relative">
        <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-slate-200 px-8 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-semibold text-slate-800 capitalize">
              {activeView.replace('-', ' ')}
            </h2>
          </div>
          <div className="flex items-center space-x-4">
             <button 
               onClick={() => onViewChange('support-hub')}
               className={`p-2 rounded-xl transition-all group relative ${activeView === 'support-hub' ? 'bg-indigo-50 text-indigo-600 border border-indigo-100 shadow-sm' : 'text-slate-400 hover:text-indigo-600 hover:bg-slate-100'}`}
               title="Support Hub"
             >
                <GraduationCap size={22} />
                {activeView !== 'support-hub' && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-rose-500 rounded-full border border-white"></span>
                )}
             </button>

             <button 
               onClick={() => onViewChange('help-center')}
               className={`p-2 rounded-xl transition-all group relative ${activeView === 'help-center' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100 shadow-sm' : 'text-slate-400 hover:text-emerald-600 hover:bg-slate-100'}`}
               title="Academy / Help Center"
             >
                <HelpCircle size={20} />
             </button>

            <span className="text-xs font-semibold bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full flex items-center border border-emerald-200">
              <span className="w-2 h-2 bg-emerald-500 rounded-full mr-2 animate-pulse"></span>
              {brand.name} Orchestrator v1.2
            </span>
          </div>
        </header>
        
        <div className="p-8">
          {children}
        </div>

        {/* Global Overlays */}
        <ContextAwareHelp activeView={activeView} />
        <SageChat brand={brand} />
      </main>
    </div>
  );
};

export default Layout;
