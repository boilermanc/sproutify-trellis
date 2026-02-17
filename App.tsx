
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Profiles from './pages/Profiles';
import EmailPreviewer from './pages/EmailPreviewer';
import DevTools from './pages/DevTools';
import Automations from './pages/Automations';
import Tasks from './pages/Tasks';
import CampaignBuilder from './pages/CampaignBuilder';
import SocialHub from './pages/SocialHub';
import VideoAdLab from './pages/VideoAdLab';
import RedditGrowth from './pages/RedditGrowth';
import SupportHub from './pages/SupportHub';
import KnowledgeBase from './pages/KnowledgeBase';
import HelpCenter from './pages/HelpCenter';
import Settings from './pages/Settings';
import Reports from './pages/Reports';
import TeamMembers from './pages/TeamMembers';
import UserProfile from './pages/UserProfile';
import BranchCommandCenter from './pages/BranchCommandCenter';
import PlatformSetupWizard from './pages/PlatformSetupWizard';
import Segments from './Segments';
import CustomerIntelligence from './CustomerIntelligence';
import BrandIntelligence from './BrandIntelligence';
import MarketingBrands from './pages/MarketingBrands';
import MarketingWizard from './pages/MarketingWizard';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { getProfileByEmail, fetchAllBranches } from './lib/supabaseService';
import { supabase } from './lib/supabase';
import { useBranchStats } from './hooks/useBranchStats';
import { fetchSecrets, saveSecrets } from './services/secretsService';
import { fetchSpokeConnections, migrateLocalStorageToSupabase } from './services/spokeConnectionsService';
import { fetchSocialSignals } from './services/socialService';
import { mapFederatedConsent } from './utils/profileMapper';
import { ViewState, Profile, MarketingEvent, MarketingTask, User, Brand, Ticket, Toast, ApiKeyConfig, SpokeConnection, SavedConnection, Branch, BranchInfo, BranchContext, BranchSocialAccountsMap, SocialActivity, DraftPost, DeployedCampaign } from './types';
import { MOCK_EVENTS, MOCK_TASKS, DEFAULT_BRAND, MOCK_TICKETS } from './constants';
import { AlertCircle, CheckCircle2, Info, X, Loader2 } from 'lucide-react';

const PERSISTENCE_KEY = 'trellis_v1_store';
// UUID for the main Sproutify organization - must match the organization_id in tenant_secrets table
const SPROUTIFY_ORG_ID = '00000000-0000-0000-0000-000000000001';

type AuthView = 'login' | 'reset-password';

const AppContent: React.FC = () => {
  const { user, loading, signOut } = useAuth();
  const [authView, setAuthView] = useState<AuthView>('login');
  const [activeView, setActiveView] = useState<ViewState>('dashboard');
  const [testEmail, setTestEmail] = useState<string | null>(null);
  const [currentBrand, setCurrentBrand] = useState<Brand>(DEFAULT_BRAND);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [allBranches, setAllBranches] = useState<BranchInfo[]>([]);
  const [activeBranchSlugs, setActiveBranchSlugs] = useState<string[]>([]);

  // Initialize Global State from LocalStorage or Mocks
  const [events, setEvents] = useState<MarketingEvent[]>(() => {
    const saved = localStorage.getItem(`${PERSISTENCE_KEY}_events`);
    return saved ? JSON.parse(saved) : MOCK_EVENTS;
  });
  const [tasks, setTasks] = useState<MarketingTask[]>(() => {
    const saved = localStorage.getItem(`${PERSISTENCE_KEY}_tasks`);
    return saved ? JSON.parse(saved) : MOCK_TASKS;
  });
  const [tickets, setTickets] = useState<Ticket[]>(() => {
    const saved = localStorage.getItem(`${PERSISTENCE_KEY}_tickets`);
    return saved ? JSON.parse(saved) : MOCK_TICKETS;
  });
  const [savedConnections, setSavedConnections] = useState<SavedConnection[]>(() => {
    const saved = localStorage.getItem(`${PERSISTENCE_KEY}_connections`);
    return saved ? JSON.parse(saved) : [
      {
        id: 'conn_1',
        name: 'Mailchimp - Main Audience',
        type: 'mailchimp',
        icon_type: 'mail',
        last_used: new Date().toISOString(),
        is_favorite: true,
        config: { list_id: 'main_audience_2024' },
        status: 'connected',
        profile_count: 4816
      },
      {
        id: 'conn_2',
        name: 'Supabase - Farm Store',
        type: 'supabase',
        icon_type: 'database',
        last_used: new Date(Date.now() - 86400000 * 3).toISOString(),
        is_favorite: false,
        config: { table: 'customers', schema: 'public' },
        status: 'connected',
        profile_count: 1203
      }
    ];
  });
  const [apiKeys, setApiKeys] = useState<ApiKeyConfig>({
    active_llm: 'gemini',
    gemini_api_key: '',
    openai_api_key: '',
    anthropic_api_key: '',
    n8n_webhooks: { chat: '', workflow: '' },
    slack_webhook: '',
    resend_token: '',
    twilio_sid: '',
    twilio_token: '',
    woo_consumer_key: '',
    woo_consumer_secret: '',
  });

  const [spokeConnections, setSpokeConnections] = useState<SpokeConnection[]>(() => {
    const saved = localStorage.getItem('trellis_spoke_connections');
    return saved ? JSON.parse(saved) : [];
  });

  const [branchSocialAccounts, setBranchSocialAccounts] = useState<BranchSocialAccountsMap>(() => {
    try {
      const saved = localStorage.getItem('trellis_branch_social_accounts');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });

  // Social Signals state (Phase 4 — Inbound Social Listening)
  const [socialSignals, setSocialSignals] = useState<SocialActivity[]>(() => {
    try {
      const saved = localStorage.getItem('trellis_social_signals');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  // Scheduled posts (shared between SocialHub and Calendar)
  const [scheduledPosts, setScheduledPosts] = useState<DraftPost[]>(() => {
    try {
      const stored = localStorage.getItem('trellis_social_pipeline');
      return stored ? JSON.parse(stored).scheduled || [] : [];
    } catch { return []; }
  });

  // Deployed campaigns (fed from CampaignBuilder, read by SocialHub calendar)
  const [deployedCampaigns, setDeployedCampaigns] = useState<DeployedCampaign[]>(() => {
    try {
      const saved = localStorage.getItem('trellis_deployed_campaigns');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  // Shared branch stats hook — single source of truth for all federated data
  const branchStats = useBranchStats(spokeConnections);

  // Branch records from Supabase — needed to resolve connectionId → branch slug
  const [branches, setBranches] = useState<Branch[]>([]);
  useEffect(() => {
    fetchAllBranches().then(setBranches).catch(() => {});
  }, []);

  // Fetch active branches for the global branch context picker
  useEffect(() => {
    const loadBranches = async () => {
      try {
        const { data, error } = await supabase
          .from('branches')
          .select('id, name, slug, type, is_active, primary_color, logo_url')
          .eq('is_active', true)
          .order('name');
        if (data && !error) {
          setAllBranches(data);
          // Default: all branches are active (no filtering)
          setActiveBranchSlugs(data.map((b: BranchInfo) => b.slug));
        }
      } catch (err) {
        console.error('Failed to load branches:', err);
      }
    };
    loadBranches();
  }, []);

  const branchContext: BranchContext = {
    allBranches,
    activeBranchSlugs,
    setActiveBranchSlugs,
    isAllSelected: activeBranchSlugs.length === allBranches.length,
  };

  // Derive Profile[] for backwards compatibility with pages that still use it
  // Build connectionId → branch slug lookup so profiles carry slugs, not display names
  const profiles: Profile[] = useMemo(() => {
    const slugByConnectionId = new Map<string, string>();
    for (const b of branches) {
      if (b.spoke_connection_id && b.slug) {
        slugByConnectionId.set(b.spoke_connection_id, b.slug);
      }
    }

    const now = new Date().toISOString();
    return branchStats.enrichedProfiles.map(p => {
      const consent = mapFederatedConsent(p);
      const branchSlug = slugByConnectionId.get(p._spoke_id) || p._spoke_name;
      return {
        id: p.id || p.email,
        email: p.email,
        first_name: p.first_name || '',
        last_name: p.last_name,
        phone: p.phone,
        is_subscribed: consent.is_subscribed,
        marketing_pause: consent.marketing_pause,
        tags: (p as any)._order_only ? ['order_only'] : [],
        segments: (p as any)._order_only ? ['legacy_orders'] : [],
        branches: [branchSlug],
        branch_consent: {
          [branchSlug]: {
            subscribed: consent.is_subscribed,
            paused: consent.marketing_pause,
            updated_at: now,
          },
        },
        status: 'active' as const,
        ltv: p.order_stats?.ltv || 0,
        churn_risk: 'minimal' as const,
        last_active: p.order_stats?.last_purchase_at || p.created_at,
        metadata: {
          consent_source: consent.consent_source,
          spoke_origin: p._spoke_name,
          spoke_id: p._spoke_id,
          spoke_name: p._spoke_name,
          order_stats: p.order_stats,
          predicted_demographics: p._predicted_demographics,
        },
      };
    });
  }, [branchStats.enrichedProfiles, branches]);
  const isLoadingProfiles = branchStats.isLoading;

  // Fetch user's profile from Supabase to get first_name
  const [userProfile, setUserProfile] = useState<Profile | null>(null);

  useEffect(() => {
    if (user?.email) {
      getProfileByEmail(user.email).then(setUserProfile);
    } else {
      setUserProfile(null);
    }
  }, [user?.email]);

  // Fetch secrets from Supabase on mount
  useEffect(() => {
    fetchSecrets(SPROUTIFY_ORG_ID).then(setApiKeys);
  }, []);

  // Fetch spoke connections from Supabase on mount (localStorage is instant cache)
  useEffect(() => {
    const loadConnections = async () => {
      await migrateLocalStorageToSupabase(SPROUTIFY_ORG_ID);
      const connections = await fetchSpokeConnections(SPROUTIFY_ORG_ID);
      if (connections.length > 0 || spokeConnections.length === 0) {
        setSpokeConnections(connections);
      }
    };
    loadConnections();
  }, []);

  // Poll for social signals (30s interval).
  // fetchSocialSignals internally gates on table existence — if social_signals
  // doesn't exist yet, it returns [] after a single probe and never retries.
  useEffect(() => {
    const poll = async () => {
      const signals = await fetchSocialSignals({ status: ['new', 'reviewed'] });
      if (signals.length > 0) {
        setSocialSignals(prev => {
          const map = new Map<string, SocialActivity>(prev.map(s => [s.id, s]));
          signals.forEach(s => map.set(s.id, s));
          return Array.from(map.values()).sort((a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          );
        });
      }
    };
    poll();
    const interval = setInterval(poll, 30000);
    return () => clearInterval(interval);
  }, []);

  // Derive currentUser from Supabase auth user + profile
  const currentUser: User = {
    id: user?.id || 'u_1',
    name: userProfile?.first_name || user?.email?.split('@')[0] || 'User',
    email: user?.email || '',
    role: 'admin',
    timezone: 'America/New_York'
  };

  // Persistence Sync (localStorage for non-sensitive data)
  useEffect(() => {
    localStorage.setItem(`${PERSISTENCE_KEY}_events`, JSON.stringify(events));
    localStorage.setItem(`${PERSISTENCE_KEY}_tasks`, JSON.stringify(tasks));
    localStorage.setItem(`${PERSISTENCE_KEY}_tickets`, JSON.stringify(tickets));
    localStorage.setItem(`${PERSISTENCE_KEY}_connections`, JSON.stringify(savedConnections));
  }, [events, tasks, tickets, savedConnections]);

  useEffect(() => {
    localStorage.setItem('trellis_spoke_connections', JSON.stringify(spokeConnections));
  }, [spokeConnections]);

  useEffect(() => {
    localStorage.setItem('trellis_branch_social_accounts', JSON.stringify(branchSocialAccounts));
  }, [branchSocialAccounts]);

  useEffect(() => {
    localStorage.setItem('trellis_social_signals', JSON.stringify(socialSignals));
  }, [socialSignals]);

  const addToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const handleToggleFavorite = useCallback((connectionId: string) => {
    setSavedConnections(prev =>
      prev.map(c =>
        c.id === connectionId ? { ...c, is_favorite: !c.is_favorite } : c
      )
    );
  }, []);

  const handleCampaignLaunch = (campaign: { name: string, audienceSize: number, segments: string[] }) => {
    const newEvent: MarketingEvent = {
      id: `evt_${Date.now()}`,
      profile_id: 'SYSTEM',
      event_type: 'signup',
      source: 'app',
      payload: { brand: currentBrand.name, campaign_name: campaign.name, reach: campaign.audienceSize },
      created_at: new Date().toISOString()
    };
    setEvents(prev => [newEvent, ...prev]);
    addToast(`Global sync successful: ${campaign.name} is now live across ${currentBrand.name} spokes.`);
  };

  const renderView = () => {
    switch (activeView) {
      case 'dashboard': return <Dashboard onViewChange={setActiveView} events={events} tasks={tasks} profiles={profiles} brand={currentBrand} spokeConnections={spokeConnections} savedConnections={savedConnections} onToggleFavorite={handleToggleFavorite} branchStats={branchStats} branches={branches} branchContext={branchContext} />;
      case 'profiles': return <Profiles onTestFlow={setTestEmail} events={events} spokeConnections={spokeConnections} branchStats={branchStats} branchContext={branchContext} />;
      case 'segments': return <Segments spokeConnections={spokeConnections} branchStats={branchStats} />;
      case 'intelligence': return <CustomerIntelligence spokeConnections={spokeConnections} branchStats={branchStats} />;
      case 'branches': return <BranchCommandCenter branchStats={branchStats} spokeConnections={spokeConnections} onSpokeConnectionsChange={setSpokeConnections} branchSocialAccounts={branchSocialAccounts} onBranchSocialAccountsChange={setBranchSocialAccounts} />;
      case 'social-hub': return <SocialHub profiles={profiles} setEvents={setEvents} branchContext={branchContext} branches={branches} branchSocialAccounts={branchSocialAccounts} socialSignals={socialSignals} setSocialSignals={setSocialSignals} tickets={tickets} setTickets={setTickets} scheduledPosts={scheduledPosts} setScheduledPosts={setScheduledPosts} deployedCampaigns={deployedCampaigns} addToast={addToast} apiKeys={apiKeys} />;
      case 'video-ad-lab': return <VideoAdLab profiles={profiles} spokeConnections={spokeConnections} geminiApiKey={apiKeys.gemini_api_key} addToast={addToast} />;
      case 'reddit-growth': return <RedditGrowth setEvents={setEvents} geminiApiKey={apiKeys.gemini_api_key} addToast={addToast} />;
      case 'brand-intelligence': return <BrandIntelligence geminiApiKey={apiKeys.gemini_api_key} branchContext={branchContext} />;
      case 'support-hub': return <SupportHub tickets={tickets} setTickets={setTickets} profiles={profiles} branchContext={branchContext} />;
      case 'knowledge-base': return <KnowledgeBase />;
      case 'help-center': return <HelpCenter />;
      case 'campaign-builder': return <CampaignBuilder onCampaignLaunch={handleCampaignLaunch} profiles={profiles} spokeConnections={spokeConnections} branches={branches} branchContext={branchContext} branchSocialAccounts={branchSocialAccounts} addToast={addToast} setEvents={setEvents} onCampaignDeployed={(c) => setDeployedCampaigns(prev => [c, ...prev])} />;
      case 'marketing-brands': return (
        <MarketingBrands
          branchContext={branchContext}
          addToast={addToast}
        />
      );
      case 'marketing-wizard': return (
        <MarketingWizard
          branchContext={branchContext}
          addToast={addToast}
          apiKeys={apiKeys}
        />
      );
      case 'automations': return <Automations />;
      case 'tasks': return <Tasks tasks={tasks} setTasks={setTasks} />;
      case 'email-preview': return <EmailPreviewer profiles={profiles} initialEmail={testEmail} branchContext={branchContext} />;
      case 'dev-tools': return <DevTools profiles={profiles} branchContext={branchContext} />;
      case 'reports': return <Reports spokeConnections={spokeConnections} branchStats={branchStats} branchContext={branchContext} apiKeys={apiKeys} />;
      case 'team': return <TeamMembers />;
      case 'user-profile': return <UserProfile profile={userProfile} onProfileUpdate={setUserProfile} />;
      case 'platform-wizard': return (
        <PlatformSetupWizard
          supabaseUrl={import.meta.env.VITE_SUPABASE_URL}
          onComplete={(platform, credentials) => {
            addToast(`${platform.charAt(0).toUpperCase() + platform.slice(1)} credentials saved successfully.`);
            setActiveView('social-hub');
          }}
          onClose={() => setActiveView('social-hub')}
        />
      );
      case 'settings': return (
        <Settings
          apiKeys={apiKeys}
          onUpdateApiKeys={async (keys) => {
            setApiKeys(keys);
            const success = await saveSecrets(SPROUTIFY_ORG_ID, keys);
            addToast(
              success ? 'Secrets committed to vault.' : 'Failed to save secrets.',
              success ? 'success' : 'error'
            );
          }}
          spokeConnections={spokeConnections}
          onSpokeConnectionsChange={setSpokeConnections}
          branches={branches}
          branchContext={branchContext}
        />
      );
      default: return <Dashboard onViewChange={setActiveView} events={events} tasks={tasks} profiles={profiles} brand={currentBrand} spokeConnections={spokeConnections} savedConnections={savedConnections} onToggleFavorite={handleToggleFavorite} branchStats={branchStats} branchContext={branchContext} />;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (!user) {
    if (authView === 'reset-password') {
      return <ResetPassword onBackToLogin={() => setAuthView('login')} />;
    }
    return <Login onForgotPassword={() => setAuthView('reset-password')} />;
  }

  return (
    <Layout activeView={activeView} onViewChange={setActiveView} user={currentUser} brand={currentBrand} profiles={profiles} onLogout={signOut} branchContext={branchContext} apiKeys={apiKeys}>
      {renderView()}

      {/* Global Toast Notification Engine */}
      <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[300] space-y-3 w-full max-w-md pointer-events-none">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className="pointer-events-auto bg-white/80 backdrop-blur-xl border border-slate-200/50 shadow-2xl p-4 rounded-2xl flex items-center justify-between animate-in slide-in-from-bottom-4 duration-300"
          >
            <div className="flex items-center space-x-3">
              <div className={`p-2 rounded-xl ${
                toast.type === 'success' ? 'bg-emerald-100 text-emerald-600' :
                toast.type === 'error' ? 'bg-rose-100 text-rose-600' : 'bg-blue-100 text-blue-600'
              }`}>
                {toast.type === 'success' ? <CheckCircle2 size={18} /> :
                 toast.type === 'error' ? <AlertCircle size={18} /> : <Info size={18} />}
              </div>
              <p className="text-xs font-black uppercase text-slate-800 tracking-tight leading-tight max-w-[280px]">
                {toast.message}
              </p>
            </div>
            <button
              onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
              className="p-1.5 text-slate-400 hover:text-slate-900 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </Layout>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;
