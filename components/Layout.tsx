
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
  ChevronDown, Plug, Wand2, Palette, Video, Menu, X, Music, Clapperboard, Film, Send, MessageCircle, Sparkles, TrendingUp, CalendarClock, LayoutTemplate, Award, UserPlus, BrainCircuit, SearchCheck, Mic2
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
      { id: 'prospecting', label: 'SpectIQ Prospecting', icon: SearchCheck },
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
      { id: 'motion-posts', label: 'Motion Posts', icon: Video },
      { id: 'promo-studio', label: 'Promo Studio', icon: Clapperboard },
      { id: 'post-scheduler', label: 'Post Scheduler', icon: CalendarClock },
      { id: 'card-studio', label: 'Card Studio', icon: LayoutTemplate },
      { id: 'ad-performance', label: 'Ad Performance', icon: TrendingUp },
      { id: 'post-performance', label: 'Post Performance', icon: Award },
      { id: 'clip-studio', label: 'Clip Studio', icon: Film },
      { id: 'transcriptions', label: 'Transcriptions', icon: Mic2 },
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
    <div className="trellis-app flex h-screen overflow-hidden bg-trellis-canvas text-trellis-ink">
      {/* Mobile backdrop */}
      {isMobileNavOpen && (
        <div
          className="fixed inset-0 z-[60] bg-slate-950/60 lg:hidden"
          onClick={() => setIsMobileNavOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar — static on desktop, slide-in drawer on mobile */}
      <aside
        className={`fixed inset-y-0 left-0 z-[70] flex w-[232px] shrink-0 transform flex-col bg-yale-blue transition-transform duration-200 ease-out lg:static lg:z-40 lg:translate-x-0 ${
          isMobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-16 items-center justify-between border-b border-white/15 px-5 text-emerald-300">
          <div className="flex items-center gap-3">
            <Sprout size={24} strokeWidth={1.75} />
            <div>
              <span className="block text-lg font-bold tracking-tight text-white">Trellis</span>
              <span className="block font-mono text-[9px] uppercase tracking-[0.14em] text-white/45">Marketing operations</span>
            </div>
          </div>
          <button
            onClick={() => setIsMobileNavOpen(false)}
            className="min-h-11 min-w-11 border border-white/15 text-white/70 transition-colors hover:bg-white/10 hover:text-white lg:hidden"
            aria-label="Close navigation"
          >
            <X size={22} />
          </button>
        </div>

        <nav className="custom-scrollbar flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {/* Pinned — always visible, no group header */}
          {PINNED.map((item) => (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id as ViewState)}
              className={`group flex min-h-11 w-full items-center gap-3 border-l-2 px-3 py-2.5 text-left text-sm font-semibold transition-colors ${
                activeView === item.id
                ? 'border-emerald-400 bg-white/10 text-white'
                : 'border-transparent text-white/70 hover:bg-white/5 hover:text-white'
              }`}
            >
              <item.icon size={18} strokeWidth={1.75} />
              <span>{item.label}</span>
            </button>
          ))}

          {/* Collapsible groups */}
          {NAV_GROUPS.map((group) => {
            const isOpen = openSections[group.id] || group.id === activeGroupId;
            return (
              <div key={group.id} className="border-t border-white/10 pt-3 first:border-t-0">
                <button
                  onClick={() => toggleSection(group.id)}
                  className="flex min-h-9 w-full items-center justify-between px-3 py-1 font-mono text-white/45 transition-colors hover:text-white/80"
                  aria-expanded={isOpen}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-[0.12em]">{group.label}</span>
                  <ChevronDown
                    size={14}
                    className={`transition-transform duration-200 ${isOpen ? '' : '-rotate-90'}`}
                  />
                </button>

                {isOpen && (
                  <div className="mt-1 space-y-0.5">
                    {group.items.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => onViewChange(item.id as ViewState)}
                        className={`group flex min-h-11 w-full items-center gap-3 border-l-2 px-3 py-2.5 text-left text-sm font-medium transition-colors ${
                          activeView === item.id
                          ? 'border-emerald-400 bg-white/10 text-white'
                          : 'border-transparent text-white/70 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        <item.icon size={18} strokeWidth={1.75} />
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="space-y-1 border-t border-white/15 bg-black/5 p-3">
          <button
            onClick={() => onViewChange('help-center')}
            className={`flex min-h-11 w-full items-center gap-3 border-l-2 px-3 py-2 text-sm font-medium transition-colors ${
              activeView === 'help-center' ? 'border-emerald-400 bg-white/10 text-white' : 'border-transparent text-white/70 hover:bg-white/5 hover:text-white'
            }`}
          >
            <HelpCircle size={18} />
            <span>Help Center</span>
          </button>

          <button
            onClick={() => onViewChange('settings')}
            className={`flex min-h-11 w-full items-center gap-3 border-l-2 px-3 py-2 text-sm font-medium transition-colors ${
              activeView === 'settings' ? 'border-emerald-400 bg-white/10 text-white' : 'border-transparent text-white/70 hover:bg-white/5 hover:text-white'
            }`}
          >
            <Settings size={18} />
            <span>App Settings</span>
          </button>

          <div className="group mt-2 flex items-center gap-3 border border-white/15 p-3 transition-colors hover:border-white/30">
            <button
              onClick={() => onViewChange('user-profile')}
              className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left transition-opacity hover:opacity-90"
              title="Edit Profile"
            >
              <div className="relative">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center border border-white/20 bg-white/10 text-sm font-bold text-white">
                  {user.name.charAt(0)}
                </div>
                <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-cornflower-ocean rounded-full border-2 border-yale-blue" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="truncate text-xs font-semibold text-white">{user.name}</p>
                <p className="flex truncate font-mono text-[9px] uppercase tracking-wide text-white/45 transition-colors group-hover:text-white/70">
                  <Pencil size={8} className="mr-1" />
                  Edit Profile
                </p>
              </div>
            </button>
            <button
              onClick={onLogout}
              className="min-h-11 min-w-11 text-white/60 transition-colors hover:bg-white/10 hover:text-rose-300"
              title="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="relative min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-trellis-canvas">
        <header className="sticky top-0 z-10 flex h-14 items-center justify-between gap-2 border-b border-trellis-line bg-white/95 px-3 backdrop-blur sm:h-16 sm:gap-3 sm:px-4 lg:px-8">
          <div className="flex items-center space-x-2 min-w-0">
            <button
              onClick={() => setIsMobileNavOpen(true)}
              className="-ml-2 min-h-11 min-w-11 shrink-0 border border-transparent text-slate-500 transition-colors hover:border-trellis-line hover:bg-trellis-subtle hover:text-trellis-ink lg:hidden"
              aria-label="Open navigation"
            >
              <Menu size={22} />
            </button>
            <h2 className="truncate text-base font-bold tracking-tight text-trellis-ink sm:text-lg lg:text-xl">
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
                 className="flex min-h-11 items-center gap-1.5 border border-trellis-line bg-white px-2.5 text-xs font-semibold text-trellis-ink transition-colors hover:border-slate-400 sm:gap-2 sm:px-3 sm:text-sm lg:px-4"
               >
                 <GitBranch size={16} className="text-emerald-600 shrink-0" />
                 <span className="hidden sm:inline">
                   {branchContext.isAllSelected
                     ? `All Branches (${branchContext.allBranches.length})`
                     : `${branchContext.activeBranchSlugs.length} of ${branchContext.allBranches.length} Branches`
                   }
                 </span>
                 <span className="sm:hidden">
                   {branchContext.isAllSelected
                     ? `All (${branchContext.allBranches.length})`
                     : `${branchContext.activeBranchSlugs.length}/${branchContext.allBranches.length}`
                   }
                 </span>
                 <ChevronDown size={14} className={`text-slate-400 transition-transform ${isBranchPickerOpen ? 'rotate-180' : ''}`} />
               </button>

               {isBranchPickerOpen && (
                 <div className="absolute right-0 top-full z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] overflow-hidden border border-trellis-line bg-white shadow-[var(--trellis-shadow-float)]">
                   <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                     <span className="tr-label">Branch scope</span>
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
                           className={`flex min-h-11 w-full items-center gap-3 border px-3 py-2.5 transition-colors ${
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
                           <span className={`border px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider ${
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
                       className="min-h-11 w-full font-mono text-[10px] font-semibold uppercase tracking-wider text-emerald-700 transition-colors hover:bg-emerald-50"
                     >
                       Apply Scope
                     </button>
                   </div>
                 </div>
               )}
             </div>

             <button
               onClick={() => onViewChange('support-hub')}
               className={`group relative hidden min-h-11 min-w-11 border transition-colors sm:block ${activeView === 'support-hub' ? 'border-indigo-200 bg-indigo-50 text-indigo-700' : 'border-transparent text-slate-500 hover:border-trellis-line hover:bg-trellis-subtle hover:text-indigo-700'}`}
               title="Support Hub"
             >
                <GraduationCap size={22} />
                {activeView !== 'support-hub' && (
                  <span className="absolute -top-1 -right-1 w-2 h-2 bg-rose-500 rounded-full border border-white"></span>
                )}
             </button>

             <button
               onClick={() => onViewChange('help-center')}
               className={`group relative hidden min-h-11 min-w-11 border transition-colors sm:block ${activeView === 'help-center' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-transparent text-slate-500 hover:border-trellis-line hover:bg-trellis-subtle hover:text-emerald-700'}`}
               title="Academy / Help Center"
             >
                <HelpCircle size={20} />
             </button>

            <span className="hidden items-center border border-emerald-200 bg-emerald-50 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-emerald-800 xl:flex">
              <span className="w-2 h-2 bg-emerald-500 rounded-full mr-2 animate-pulse"></span>
              {brand.name} Orchestrator v1.2
            </span>
          </div>
        </header>

        <div className="p-3 sm:p-4 lg:p-8">
          {children}
        </div>

        {/* Global Overlays */}
        <ContextAwareHelp activeView={activeView} onOpenArticle={onOpenHelpArticle} onOpenHelpCenter={onOpenHelpCenter} />
        <SageChat brand={brand} profiles={profiles} apiKeys={apiKeys} spokeConnections={spokeConnections} branchContext={branchContext} />
      </main>
    </div>
  );
};

export default Layout;
