
import React, { useState, useEffect, useRef } from 'react';
import { ViewState, User, Brand, Profile, BranchContext, ApiKeyConfig } from '../types';
import { Article } from '../src/data/helpContent';
import SageChat from './SageChat';
import ContextAwareHelp from './ContextAwareHelp';
import {
  LayoutDashboard, Users, Workflow, Mail, Code2, Sprout,
  CheckSquare, Rocket, Share2, Settings, LogOut, HelpCircle,
  LifeBuoy, BarChart3, BookOpen, GraduationCap, UserCog, Pencil, GitBranch, Layers, Dna,
  ChevronDown, Plug, Wand2, Palette, Video
} from 'lucide-react';

interface LayoutProps {
  children: React.ReactNode;
  activeView: ViewState;
  onViewChange: (view: ViewState) => void;
  user: User;
  brand: Brand;
  profiles?: Profile[];
  onLogout?: () => void;
  branchContext: BranchContext;
  apiKeys?: ApiKeyConfig;
  onOpenHelpArticle: (article: Article) => void;
  onOpenHelpCenter: () => void;
}

const Layout: React.FC<LayoutProps> = ({ children, activeView, onViewChange, user, brand, profiles = [], onLogout, branchContext, apiKeys, onOpenHelpArticle, onOpenHelpCenter }) => {
  const [isBranchPickerOpen, setIsBranchPickerOpen] = useState(false);
  const branchPickerRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isBranchPickerOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (branchPickerRef.current && !branchPickerRef.current.contains(e.target as Node)) {
        setIsBranchPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isBranchPickerOpen]);

  const navItems = [
    { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
    { id: 'reports', label: 'Reports', icon: BarChart3 },
    { id: 'knowledge-base', label: 'Knowledge Base', icon: BookOpen },
    { id: 'profiles', label: 'Profiles', icon: Users },
    { id: 'segments', label: 'Segments', icon: Layers },
    { id: 'intelligence', label: 'Intelligence', icon: BarChart3 },
    { id: 'branches', label: 'Branches', icon: GitBranch },
    { id: 'social-hub', label: 'Social Hub', icon: Share2 },
    { id: 'video-ad-lab', label: 'Video Ad Lab', icon: Video },
    { id: 'platform-wizard', label: 'Platform Setup', icon: Plug },
    { id: 'brand-intelligence', label: 'Brand DNA', icon: Dna },
    { id: 'campaign-builder', label: 'Campaign Builder', icon: Rocket },
    { id: 'marketing-wizard', label: 'Marketing AI', icon: Wand2 },
    { id: 'marketing-brands', label: 'Brand Profiles', icon: Palette },
    { id: 'automations', label: 'n8n Flows', icon: Workflow },
    { id: 'tasks', label: 'Campaign Tasks', icon: CheckSquare },
    { id: 'email-preview', label: 'Email Previews', icon: Mail },
    { id: 'dev-tools', label: 'Dev Resources', icon: Code2 },
    { id: 'team', label: 'Team', icon: UserCog },
  ];

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-yale-blue flex flex-col shrink-0">
        <div className="p-6 flex items-center space-x-3 text-sky-300 border-b border-blue-slate-2/30">
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
                ? 'bg-sky-400/20 text-sky-300 shadow-lg shadow-yale-blue/20'
                : 'text-white/75 hover:bg-blue-slate-2 hover:text-white'
              }`}
            >
              <item.icon size={20} />
              <span className="font-medium text-sm">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-blue-slate-2/30 space-y-2 bg-yale-blue/50">
          <button
            onClick={() => onViewChange('help-center')}
            className={`w-full flex items-center space-x-3 px-4 py-2 rounded-lg transition-colors ${
              activeView === 'help-center' ? 'bg-blue-slate-2 text-white' : 'text-white/75 hover:bg-blue-slate-2 hover:text-white'
            }`}
          >
            <HelpCircle size={18} className="text-sky-300" />
            <span className="text-[10px] font-black uppercase tracking-widest">Help Center</span>
          </button>

          <button
            onClick={() => onViewChange('settings')}
            className={`w-full flex items-center space-x-3 px-4 py-2 rounded-lg transition-colors ${
              activeView === 'settings' ? 'bg-blue-slate-2 text-white' : 'text-white/75 hover:bg-blue-slate-2 hover:text-white'
            }`}
          >
            <Settings size={18} />
            <span className="text-[10px] font-black uppercase tracking-widest">App Settings</span>
          </button>

          <div className="flex items-center space-x-3 p-3 bg-blue-slate-2/30 rounded-xl mt-2 group border border-blue-slate-2/30 hover:border-cornflower-ocean/30 transition-colors">
            <button
              onClick={() => onViewChange('user-profile')}
              className="flex items-center space-x-3 flex-1 min-w-0 hover:opacity-90 transition-opacity"
              title="Edit Profile"
            >
              <div className="relative">
                <div className="w-10 h-10 rounded-full bg-cerulean/20 text-cornflower-ocean flex items-center justify-center font-bold text-sm shadow-inner shrink-0">
                  {user.name.charAt(0)}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-cornflower-ocean rounded-full border-2 border-yale-blue" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-xs font-black text-white truncate uppercase tracking-tighter">{user.name}</p>
                <p className="text-[10px] text-sky-300 truncate flex items-center group-hover:text-sky-200 transition-colors">
                  <Pencil size={8} className="mr-1" />
                  Edit Profile
                </p>
              </div>
            </button>
            <button
              onClick={onLogout}
              className="text-white/60 hover:text-rose-400 transition-colors"
              title="Sign out"
            >
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
             {/* Branch Scope Picker */}
             <div className="relative" ref={branchPickerRef}>
               <button
                 onClick={() => setIsBranchPickerOpen(!isBranchPickerOpen)}
                 className="flex items-center space-x-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all border border-slate-200"
               >
                 <GitBranch size={16} className="text-emerald-600" />
                 <span className="text-xs font-black uppercase tracking-widest text-slate-700">
                   {branchContext.isAllSelected
                     ? `All Branches (${branchContext.allBranches.length})`
                     : `${branchContext.activeBranchSlugs.length} of ${branchContext.allBranches.length} Branches`
                   }
                 </span>
                 <ChevronDown size={14} className={`text-slate-400 transition-transform ${isBranchPickerOpen ? 'rotate-180' : ''}`} />
               </button>

               {isBranchPickerOpen && (
                 <div className="absolute top-full mt-2 right-0 w-72 bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden">
                   <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                     <span className="text-xs font-black uppercase tracking-widest text-slate-500">Branch Scope</span>
                     <div className="flex items-center space-x-2">
                       <button
                         onClick={() => branchContext.setActiveBranchSlugs(branchContext.allBranches.map(b => b.slug))}
                         className="text-[10px] font-bold text-emerald-600 hover:underline"
                       >
                         All
                       </button>
                       <span className="text-slate-300">|</span>
                       <button
                         onClick={() => branchContext.setActiveBranchSlugs([])}
                         className="text-[10px] font-bold text-slate-400 hover:underline"
                       >
                         None
                       </button>
                     </div>
                   </div>
                   <div className="p-2 max-h-64 overflow-y-auto">
                     {branchContext.allBranches.map(branch => {
                       const isActive = branchContext.activeBranchSlugs.includes(branch.slug);
                       return (
                         <button
                           key={branch.id}
                           onClick={() => {
                             const newSlugs = isActive
                               ? branchContext.activeBranchSlugs.filter(s => s !== branch.slug)
                               : [...branchContext.activeBranchSlugs, branch.slug];
                             branchContext.setActiveBranchSlugs(newSlugs);
                           }}
                           className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl transition-all ${
                             isActive ? 'bg-emerald-50 border border-emerald-200' : 'hover:bg-slate-50 border border-transparent'
                           }`}
                         >
                           <div
                             className="w-3 h-3 rounded-full shrink-0 border-2"
                             style={{
                               backgroundColor: isActive ? branch.primary_color : 'transparent',
                               borderColor: branch.primary_color,
                             }}
                           />
                           <div className="flex-1 text-left">
                             <p className={`text-xs font-bold ${isActive ? 'text-slate-800' : 'text-slate-400'}`}>
                               {branch.name}
                             </p>
                             <p className="text-[10px] text-slate-400">{branch.slug}</p>
                           </div>
                           <span className={`text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${
                             branch.type === 'internal' ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'
                           }`}>
                             {branch.type}
                           </span>
                         </button>
                       );
                     })}
                   </div>
                   <div className="p-3 border-t border-slate-100 bg-slate-50">
                     <button
                       onClick={() => setIsBranchPickerOpen(false)}
                       className="w-full py-2 text-[10px] font-black uppercase tracking-widest text-emerald-600 hover:text-emerald-700 transition"
                     >
                       Apply Scope
                     </button>
                   </div>
                 </div>
               )}
             </div>

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
        <ContextAwareHelp activeView={activeView} onOpenArticle={onOpenHelpArticle} onOpenHelpCenter={onOpenHelpCenter} />
        <SageChat brand={brand} profiles={profiles} apiKeys={apiKeys} />
      </main>
    </div>
  );
};

export default Layout;
