
import React, { useState } from 'react';
import { User, ApiKeyConfig, Brand, LlmProvider, Profile, SpokeConfig } from '../types';
import Importer from './Importer';
import { 
  Key, Palette, User as UserIcon, Globe, Save, CheckCircle2, RefreshCw, 
  Eye, EyeOff, Workflow, ShoppingBag, Send as SendIcon, Lock, Info, 
  Clock, Phone, Cpu, Building, Sparkles, Zap, Database, ShieldCheck,
  ShieldAlert, MoreVertical, Ban, Copy, Terminal, Network, Slack
} from 'lucide-react';
import { MOCK_SPOKE_CONFIGS } from '../constants';

interface SettingsProps {
  user: User;
  onUpdateUser: (user: User) => void;
  apiKeys: ApiKeyConfig;
  onUpdateApiKeys: (keys: ApiKeyConfig) => void;
  brand: Brand;
  onUpdateBrand: (brand: Brand) => void;
  profiles: Profile[];
  onImportComplete: (newProfiles: Profile[]) => void;
}

const LLM_PROVIDERS: { id: LlmProvider; name: string; icon: any; color: string }[] = [
  { id: 'gemini', name: 'Google Gemini', icon: Sparkles, color: 'text-blue-500' },
  { id: 'openai', name: 'OpenAI GPT-4o', icon: Zap, color: 'text-emerald-500' },
  { id: 'anthropic', name: 'Anthropic Claude', icon: Cpu, color: 'text-amber-500' },
];

const Settings: React.FC<SettingsProps> = ({ 
  user, 
  onUpdateUser, 
  apiKeys, 
  onUpdateApiKeys, 
  brand, 
  onUpdateBrand,
  profiles,
  onImportComplete 
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'brand' | 'spokes' | 'api' | 'import'>('profile');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [localApiKeys, setLocalApiKeys] = useState<ApiKeyConfig>(apiKeys);
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [spokeConfigs, setSpokeConfigs] = useState<SpokeConfig[]>(MOCK_SPOKE_CONFIGS);

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      onUpdateApiKeys(localApiKeys);
      setIsSaving(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }, 1500);
  };

  const toggleSpokeStatus = (id: string) => {
     setSpokeConfigs(prev => prev.map(s => {
       if (s.id === id) {
         return { ...s, status: s.status === 'active' ? 'revoked' : 'active' };
       }
       return s;
     }));
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20">
      
      <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-3xl flex items-start space-x-4">
         <div className="bg-emerald-100 p-2 rounded-xl text-emerald-600">
            <ShieldCheck size={24} />
         </div>
         <div className="space-y-1">
            <h4 className="text-sm font-black text-emerald-900 uppercase tracking-widest">Identity Guard Active</h4>
            <p className="text-xs text-emerald-700 leading-relaxed">
               Trellis is enforcing <b>Mandatory Key Validation</b> for all ecosystem spokes. Secure your ingest loops below.
            </p>
         </div>
      </div>

      <div className="flex bg-white p-1 rounded-2xl border border-slate-200 shadow-sm w-fit overflow-x-auto max-w-full">
        {[
          { id: 'profile', label: 'User', icon: UserIcon },
          { id: 'brand', label: 'Brand', icon: Building },
          { id: 'spokes', label: 'Spoke Registry', icon: Network },
          { id: 'import', label: 'Ingest', icon: Database },
          { id: 'api', label: 'Secrets', icon: Key },
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
              activeTab === tab.id ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-800'
            }`}
          >
            <tab.icon size={14} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden min-h-[500px] flex flex-col">
        <div className="flex-1 p-10">
          {activeTab === 'profile' && (
            <div className="space-y-10 animate-in fade-in duration-300">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Display Name</label>
                  <input className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 focus:ring-2 focus:ring-emerald-500 outline-none transition" value={user.name} onChange={e => onUpdateUser({...user, name: e.target.value})} />
                </div>
                <div className="space-y-4">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Timezone</label>
                  <select className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800" value={user.timezone} onChange={e => onUpdateUser({...user, timezone: e.target.value})}>
                    <option value="America/New_York">America/New_York</option>
                    <option value="Europe/London">Europe/London</option>
                    <option value="Asia/Tokyo">Asia/Tokyo</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'brand' && (
            <div className="space-y-10 animate-in fade-in duration-300">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Company Name</label>
                  <input className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none" value={brand.name} onChange={e => onUpdateBrand({...brand, name: e.target.value})} />
                </div>
                <div className="space-y-4">
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest">Industry</label>
                  <input className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none" value={brand.industry} onChange={e => onUpdateBrand({...brand, industry: e.target.value})} />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'spokes' && (
             <div className="space-y-8 animate-in fade-in duration-300">
                <div className="flex justify-between items-end mb-6">
                   <div>
                      <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Spoke Registry</h3>
                      <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Manage Cryptographic Ingest Handshakes</p>
                   </div>
                </div>

                <div className="space-y-4">
                   {spokeConfigs.map(spoke => (
                      <div key={spoke.id} className={`p-6 rounded-2xl border-2 flex items-center justify-between transition-all ${spoke.status === 'revoked' ? 'bg-slate-50 border-slate-100 opacity-60' : 'bg-white border-slate-100 hover:border-emerald-200 shadow-sm'}`}>
                         <div className="flex items-center space-x-6">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${spoke.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                               {spoke.status === 'active' ? <Globe size={24} /> : <Ban size={24} />}
                            </div>
                            <div>
                               <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight">{spoke.site_name}</h4>
                               <div className="flex items-center space-x-3 mt-1">
                                  <div className="flex items-center space-x-2 bg-slate-50 px-2 py-1 rounded border border-slate-200 group relative">
                                     <Terminal size={10} className="text-slate-400" />
                                     <span className="text-[9px] font-mono text-slate-600 font-bold">
                                        {visibleKeys[spoke.id] ? spoke.api_key : '••••••••••••••••'}
                                     </span>
                                     <button onClick={() => setVisibleKeys(prev => ({...prev, [spoke.id]: !prev[spoke.id]}))} className="ml-2 text-slate-400 hover:text-slate-900">
                                        {visibleKeys[spoke.id] ? <EyeOff size={10} /> : <Eye size={10} />}
                                     </button>
                                  </div>
                               </div>
                            </div>
                         </div>
                      </div>
                   ))}
                </div>
             </div>
          )}

          {activeTab === 'api' && (
            <div className="space-y-10 animate-in fade-in duration-300">
               <div>
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Strategic AI Engine</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {LLM_PROVIDERS.map(provider => (
                      <button 
                        key={provider.id}
                        onClick={() => setLocalApiKeys({...localApiKeys, active_llm: provider.id})}
                        className={`p-6 rounded-2xl border-2 transition-all flex flex-col items-center text-center space-y-3 ${
                          localApiKeys.active_llm === provider.id ? 'border-emerald-500 bg-emerald-50 shadow-lg' : 'border-slate-100 hover:bg-slate-50'
                        }`}
                      >
                         <provider.icon size={24} className={provider.color} />
                         <span className="text-[10px] font-black uppercase tracking-tight">{provider.name}</span>
                      </button>
                    ))}
                  </div>
               </div>

               <div className="space-y-6 pt-6 border-t border-slate-100">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">System Secret Vault</h3>
                  {[
                    { id: 'n8n_webhook', label: 'n8n Master Webhook', icon: Workflow },
                    { id: 'slack_webhook', label: 'Slack Alert Endpoint (DLQ)', icon: Slack },
                  ].map(cfg => (
                    <div key={cfg.id} className="relative">
                       <label className="block text-[9px] font-black text-slate-400 uppercase mb-2 ml-1">{cfg.label}</label>
                       <input 
                          type={visibleKeys[cfg.id] ? 'text' : 'password'}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-12 py-3 text-sm font-mono text-slate-800 outline-none transition focus:border-emerald-500"
                          value={(localApiKeys as any)[cfg.id]}
                          onChange={(e) => setLocalApiKeys({ ...localApiKeys, [cfg.id]: e.target.value })}
                       />
                       <button onClick={() => setVisibleKeys(prev => ({...prev, [cfg.id]: !prev[cfg.id]}))} className="absolute right-4 top-10 text-slate-400 hover:text-slate-900 transition-colors"><Eye size={16} /></button>
                    </div>
                  ))}
               </div>
            </div>
          )}
        </div>

        {activeTab !== 'import' && activeTab !== 'spokes' && (
          <div className="p-8 bg-slate-50 border-t border-slate-100 flex justify-end items-center space-x-4">
            <button 
              onClick={handleSave}
              disabled={isSaving}
              className="px-8 py-3 bg-emerald-600 text-white rounded-xl font-black text-sm flex items-center space-x-2 shadow-lg hover:bg-emerald-700 transition"
            >
              {isSaving ? <RefreshCw className="animate-spin" /> : <Save size={18} />}
              <span>{isSaving ? 'Updating Vault...' : 'Save Configuration'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Settings;
