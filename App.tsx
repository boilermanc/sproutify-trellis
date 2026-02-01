
import React, { useState, useEffect, useCallback } from 'react';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Profiles from './pages/Profiles';
import EmailPreviewer from './pages/EmailPreviewer';
import DevTools from './pages/DevTools';
import Automations from './pages/Automations';
import Tasks from './pages/Tasks';
import CampaignBuilder from './pages/CampaignBuilder';
import SocialHub from './pages/SocialHub';
import SupportHub from './pages/SupportHub';
import KnowledgeBase from './pages/KnowledgeBase';
import HelpCenter from './pages/HelpCenter';
import Settings from './pages/Settings';
import Reports from './pages/Reports';
import TeamMembers from './pages/TeamMembers';
import UserProfile from './pages/UserProfile';
import Branches from './src/pages/Branches';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { getProfileByEmail } from './lib/supabaseService';
import { fetchProfiles } from './supabaseService';
import { fetchSecrets, saveSecrets } from './services/secretsService';
import { ViewState, Profile, MarketingEvent, MarketingTask, User, Brand, Ticket, Toast, ApiKeyConfig, SpokeConnection } from './types';
import { MOCK_PROFILES, MOCK_EVENTS, MOCK_TASKS, DEFAULT_BRAND, MOCK_TICKETS } from './constants';
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
  
  // Initialize Global State from LocalStorage or Mocks
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(true);
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

  // Fetch profiles from Supabase on mount
  useEffect(() => {
    const loadProfiles = async () => {
      setIsLoadingProfiles(true);
      const data = await fetchProfiles();
      setProfiles(data.length > 0 ? data : MOCK_PROFILES); // Fallback to mock if empty
      setIsLoadingProfiles(false);
    };
    loadProfiles();
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
  }, [events, tasks, tickets]);

  useEffect(() => {
    localStorage.setItem('trellis_spoke_connections', JSON.stringify(spokeConnections));
  }, [spokeConnections]);

  const addToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
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
      case 'dashboard': return <Dashboard onViewChange={setActiveView} events={events} tasks={tasks} profiles={profiles} brand={currentBrand} />;
      case 'profiles': return <Profiles onTestFlow={setTestEmail} events={events} />;
      case 'branches': return <Branches />;
      case 'social-hub': return <SocialHub profiles={profiles} setEvents={setEvents} />;
      case 'support-hub': return <SupportHub tickets={tickets} setTickets={setTickets} profiles={profiles} />;
      case 'knowledge-base': return <KnowledgeBase />;
      case 'help-center': return <HelpCenter />;
      case 'campaign-builder': return <CampaignBuilder onCampaignLaunch={handleCampaignLaunch} profiles={profiles} />;
      case 'automations': return <Automations />;
      case 'tasks': return <Tasks tasks={tasks} setTasks={setTasks} />;
      case 'email-preview': return <EmailPreviewer profiles={profiles} initialEmail={testEmail} />;
      case 'dev-tools': return <DevTools profiles={profiles} />;
      case 'reports': return <Reports />;
      case 'team': return <TeamMembers />;
      case 'user-profile': return <UserProfile profile={userProfile} onProfileUpdate={setUserProfile} />;
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
          profiles={profiles}
          onImportComplete={(newProfiles) => {
            setProfiles(prev => [...prev, ...newProfiles]);
            addToast(`Identity ingest complete: ${newProfiles.length} new gardeners synced.`);
          }}
          spokeConnections={spokeConnections}
          onSpokeConnectionsChange={setSpokeConnections}
        />
      );
      default: return <Dashboard onViewChange={setActiveView} events={events} tasks={tasks} profiles={profiles} brand={currentBrand} />;
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
    <Layout activeView={activeView} onViewChange={setActiveView} user={currentUser} brand={currentBrand} onLogout={signOut}>
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
