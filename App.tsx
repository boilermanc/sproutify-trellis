
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
import { ViewState, Profile, MarketingEvent, MarketingTask, User, ApiKeyConfig, Brand, Ticket, Toast } from './types';
import { MOCK_PROFILES, MOCK_EVENTS, MOCK_TASKS, DEFAULT_BRAND, MOCK_TICKETS } from './constants';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';

const PERSISTENCE_KEY = 'trellis_v1_store';

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<ViewState>('dashboard');
  const [testEmail, setTestEmail] = useState<string | null>(null);
  const [currentBrand, setCurrentBrand] = useState<Brand>(DEFAULT_BRAND);
  const [toasts, setToasts] = useState<Toast[]>([]);
  
  // Initialize Global State from LocalStorage or Mocks
  const [profiles, setProfiles] = useState<Profile[]>(() => {
    const saved = localStorage.getItem(`${PERSISTENCE_KEY}_profiles`);
    return saved ? JSON.parse(saved) : MOCK_PROFILES;
  });
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

  const [currentUser, setCurrentUser] = useState<User>({
    id: 'u_1',
    name: 'Trellis Admin',
    email: 'admin@trellis.app',
    role: 'admin',
    timezone: 'America/New_York'
  });

  // Persistence Sync
  useEffect(() => {
    localStorage.setItem(`${PERSISTENCE_KEY}_profiles`, JSON.stringify(profiles));
    localStorage.setItem(`${PERSISTENCE_KEY}_events`, JSON.stringify(events));
    localStorage.setItem(`${PERSISTENCE_KEY}_tasks`, JSON.stringify(tasks));
    localStorage.setItem(`${PERSISTENCE_KEY}_tickets`, JSON.stringify(tickets));
  }, [profiles, events, tasks, tickets]);

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
      case 'profiles': return <Profiles onTestFlow={setTestEmail} profiles={profiles} setProfiles={setProfiles} events={events} />;
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
      case 'settings': return (
        <Settings 
          user={currentUser} 
          onUpdateUser={setCurrentUser} 
          apiKeys={{active_llm: 'gemini', gemini_api_key: '', openai_api_key: '', anthropic_api_key: '', n8n_webhook: '', woo_consumer_key: '', woo_consumer_secret: '', resend_token: '', twilio_sid: '', twilio_token: ''}} 
          onUpdateApiKeys={() => addToast('System configuration committed to vault.')}
          brand={currentBrand}
          onUpdateBrand={setCurrentBrand}
          profiles={profiles}
          onImportComplete={(newProfiles) => {
            setProfiles(prev => [...prev, ...newProfiles]);
            addToast(`Identity ingest complete: ${newProfiles.length} new gardeners synced.`);
          }}
        />
      );
      default: return <Dashboard onViewChange={setActiveView} events={events} tasks={tasks} profiles={profiles} brand={currentBrand} />;
    }
  };

  return (
    <Layout activeView={activeView} onViewChange={setActiveView} user={currentUser} brand={currentBrand}>
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

export default App;
