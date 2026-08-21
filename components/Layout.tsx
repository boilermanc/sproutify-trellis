
import React, { useState, useEffect, useRef } from 'react';
import { ViewState, User, Brand, Profile, BranchContext, ApiKeyConfig, SpokeConnection } from '../types';
import { Article } from '../src/data/helpContent';
import { PAGE_INFO } from '../src/data/pageInfo';
import SageChat from './SageChat';
import ContextAwareHelp from './ContextAwareHelp';
import PageInfoTooltip from './PageInfoTooltip';
import {
  LayoutDashboard, Users, Workflow, Mail, Code2, Sprout,
  CheckSquare, Rocket, Share2, Settings, LogOut, HelpCircle,
  LifeBuoy, BarChart3, BookOpen, GraduationCap, UserCog, Pencil, GitBranch, Layers, Dna,
  ChevronDown, Plug, Wand2, Palette, Video, Menu, X, Music, Clapperboard, Film, Send, MessageCircle, Sparkles, TrendingUp, CalendarClock, LayoutTemplate, Award, UserPlus, BrainCircuit
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
  spokeConnections?: SpokeConnection[];
  onOpenHelpArticle: (article: Article) => void;
  onOpenHelpCenter: () => void;
}

// Sidebar IA: two pinned "at a glance" destinations, then collapsible groups.
// Audience + Campaigns open by default; the specialised groups start collapsed so
// the default nav is ~11 visible items instead of 24.
const NAV_SECTIONS_KEY = 'trellis_nav_sections';

const PINNED = [
  { id: 'dashboard', label: 'Overview', icon: LayoutDashboard },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
];

const NAV_GROUPS = [
  {
    id: 'audience', label: 'Audience', defaultOpen: true, items: [
      { id: 'profiles', label: 'Profiles', icon: Users },
      { id: 'leads', label: 'Leads', icon: UserPlus },
      { id: 'segments', label: 'Segments', icon: Layers },
      { id: 'intelligence', label: 'Intelligence', icon: BarChart3 },
      { id: 'branches', label: 'Branches', icon: GitBranch },
    ],
  },
  {
    id: 'campaigns', label: 'Campaigns', defaultOpen: true, items: [
      { id: 'campaign-builder', label: 'Campaign Builder', icon: Rocket },
      { id: 'campaigns', label: 'Campaigns', icon: Send },
      { id: 'email-preview', label: 'Email Previews', icon: Mail },
      { id: 'marketing-wizard', label: 'Marketing AI', icon: Wand2 },
      { id: 'tasks', label: 'Campaign Tasks', icon: CheckSquare },
    ],
  },
  {
    id: 'content-studio', label: 'Content Studio', defaultOpen: false, items: [
      { id: 'social-hub', label: 'Social Hub', icon: Share2 },
      { id: 'content-intelligence', label: 'Content Intelligence', icon: BrainCircuit },
      { id: 'reddit-growth', label: 'Reddit Ads', icon: MessageCircle },
      { id: 'video-ad-lab', label: 'Creative Studio', icon: Sparkles },
      { id: 'media-generation', label: 'Media Generation', icon: Video },
      { id: 'post-scheduler', label: 'Post Scheduler', icon: CalendarClock },
      { id: 'card-studio', label: 'Card Studio', icon: LayoutTemplate },
      { id: 'ad-performance', label: 'Ad Performance', icon: TrendingUp },
      { id: 'post-performance', label: 'Post Performance', icon: Award },
      { id: 'clip-studio', label: 'Clip Studio', icon: Film },
      { id: 'trellis-studio', label: 'Trellis Sessions', icon: Music },
      { id: 'studio-albums', label: 'Studio Albums', icon: Music },
      { id: 'trellis-episodes', label: 'Trellis Episodes', icon: Clapperboard },
    ],
  },
  {
    id: 'brand', label: 'Brand', defaultOpen: false, items: [
      { id: 'brand-intelligence', label: 'Brand DNA', icon: Dna },
      { id: 'marketing-brands', label: 'Brand Profiles', icon: Palette },
    ],
  },
  {
    id: 'setup', label: 'Setup & Admin', defaultOpen: false, items: [
      { id: 'platform-wizard', label: 'Platform Setup', icon: Plug },
      { id: 'automations', label: 'n8n Flows', icon: Workflow },
      { id: 'dev-tools', label: 'Dev Resources', icon: Code2 },
      { id: 'team', label: 'Team', icon: UserCog },
      { id: 'knowledge-base', label: 'Knowledge Base', icon: BookOpen },
    ],
  },
];

const Layout: React.FC<LayoutProps> = ({ children, activeView, onViewChange, user, brand, profiles = [], onLogout, branchContext, apiKeys, spokeConnections = [], onOpenHelpArticle, onOpenHelpCenter }) => {
  const [isBranchPickerOpen, setIsBranchPickerOpen] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
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

  // Close the mobile nav whenever the view changes
  useEffect(() => {
    setIsMobileNavOpen(false);
  }, [activeView]);

  // Which nav groups are expanded. Seeded from each group's defaultOpen, then
  // overlaid with whatever the user last chose (persisted in localStorage).
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const defaults: Record<string, boolean> = {};
    NAV_GROUPS.forEach(g => { defaults[g.id] = g.defaultOpen; });
    try {
      const saved = localStorage.getItem(NAV_SECTIONS_KEY);
      if (saved) return { ...defaults, ...JSON.parse(saved) };
    } catch { /* ignore malformed storage */ }
    return defaults;
  });

  const toggleSection = (id: string) => {
    setOpenSections(prev => {
      const next = { ...prev, [id]: !prev[id] };
      try { localStorage.setItem(NAV_SECTIONS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  // The group holding the current view is always shown, so you can never be
  // "lost" inside a collapsed section. This doesn't overwrite the saved state.
  const activeGroupId = NAV_GROUPS.find(g => g.items.some(i => i.id === activeView))?.id;

  // Page title = the nav item's label, so the header can never disagree with
  // the sidebar. The old fallback rendered the raw route id via
  // activeView.replace('-', ' ') — which replaces only the FIRST hyphen, so
  // 'video-ad-lab' showed as "Video Ad-Lab" while the sidebar said
  // "Creative Studio".
  const pageTitle =
    PINNED.find(i => i.id === activeView)?.label
    ?? NAV_GROUPS.flatMap(g => g.items).find(i => i.id === activeView)?.label
    ?? activeView.replace(/-/g, ' ');

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile backdrop */}
      {isMobileNavOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/50 backdrop-blur-sm lg:hidden"
          onClick={() => setIsMobileNavOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar — static on desktop, slide-in drawer on mobile */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-yale-blue flex flex-col shrink-0 transform transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 ${
          isMobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-6 flex items-center justify-between text-sky-300 border-b border-blue-slate-2/30">
          <div className="flex items-center space-x-3">
            <Sprout size={28} />
            <span className="font-bold text-xl text-white tracking-tight">Trellis</span>
          </div>
          <button
            onClick={() => setIsMobileNavOpen(false)}
            className="lg:hidden text-white/70 hover:text-white transition-colors"
            aria-label="Close navigation"
          >
            <X size={22} />
          </button>
        </div>

        <nav className="flex-1 mt-6 px-3 space-y-1 overflow-y-auto custom-scrollbar">
          {/* Pinned — always visible, no group header */}
          {PINNED.map((item) => (
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

          {/* Collapsible groups */}
          {NAV_GROUPS.map((group) => {
            const isOpen = openSections[group.id] || group.id === activeGroupId;
            return (
              <div key={group.id} className="pt-3">
                <button
                  onClick={() => toggleSection(group.id)}
                  className="w-full flex items-center justify-between px-4 py-1.5 rounded-lg text-white/40 hover:text-white/80 transition-colors"
                  aria-expanded={isOpen}
                >
                  <span className="text-[10px] font-black uppercase tracking-widest">{group.label}</span>
                  <ChevronDown
                    size={14}
                    className={`transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`}
                  />
                </button>

                {isOpen && (
                  <div className="space-y-1 mt-1">
                    {group.items.map((item) => (
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
                  </div>
                )}
              </div>
            );
          })}
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
        <header className="sticky top-0 z-10 bg-white/80 backdrop-blur-md border-b border-slate-200 px-4 lg:px-8 py-4 flex justify-between items-center gap-3">
          <div className="flex items-center space-x-2 min-w-0">
            <button
              onClick={() => setIsMobileNavOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors shrink-0"
              aria-label="Open navigation"
            >
              <Menu size={22} />
            </button>
            <h2 className="text-lg lg:text-xl font-semibold text-slate-800 capitalize truncate">
              {pageTitle}
            </h2>
            {PAGE_INFO[activeView] && (
              <PageInfoTooltip title={pageTitle} description={PAGE_INFO[activeView]} />
            )}
          </div>
          <div className="flex items-center space-x-2 lg:space-x-4 shrink-0">
             {/* Branch Scope Picker */}
             <div className="relative" ref={branchPickerRef}>
               <button
                 onClick={() => setIsBranchPickerOpen(!isBranchPickerOpen)}
                 className="flex items-center space-x-2 px-3 lg:px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all border border-slate-200"
               >
                 <GitBranch size={16} className="text-emerald-600 shrink-0" />
                 <span className="hidden sm:inline text-xs font-black uppercase tracking-widest text-slate-700">
                   {branchContext.isAllSelected
                     ? `All Branches (${branchContext.allBranches.length})`
                     : `${branchContext.activeBranchSlugs.length} of ${branchContext.allBranches.length} Branches`
                   }
                 </span>
                 <span className="sm:hidden text-xs font-black uppercase tracking-widest text-slate-700">
                   {branchContext.isAllSelected
                     ? `All (${branchContext.allBranches.length})`
                     : `${branchContext.activeBranchSlugs.length}/${branchContext.allBranches.length}`
                   }
                 </span>
                 <ChevronDown size={14} className={`text-slate-400 transition-transform ${isBranchPickerOpen ? 'rotate-180' : ''}`} />
               </button>

               {isBranchPickerOpen && (
                 <div className="absolute top-full mt-2 right-0 w-72 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-slate-200 z-50 overflow-hidden">
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

            <span className="hidden xl:flex text-xs font-semibold bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full items-center border border-emerald-200">
              <span className="w-2 h-2 bg-emerald-500 rounded-full mr-2 animate-pulse"></span>
              {brand.name} Orchestrator v1.2
            </span>
          </div>
        </header>

        <div className="p-4 lg:p-8">
          {children}
        </div>

        {/* Global Overlays */}
        <ContextAwareHelp activeView={activeView} onOpenArticle={onOpenHelpArticle} onOpenHelpCenter={onOpenHelpCenter} />
        <SageChat brand={brand} profiles={profiles} apiKeys={apiKeys} spokeConnections={spokeConnections} />
      </main>
    </div>
  );
};

export default Layout;
