
import React, { useState, useEffect } from 'react';
import { ApiKeyConfig, LlmProvider, Integration, SpokeConnection, Branch, BranchContext } from '../types';
import { Article } from '../src/data/helpContent';
import HelpLink from '../src/components/HelpLink';
import {
  Key, Globe, Save, RefreshCw,
  Eye, EyeOff, Workflow, ShoppingBag, Send as SendIcon,
  Phone, Cpu, Sparkles, Zap, Plug,
  Trash2, Plus, X, Slack, Database, Mail,
  Instagram, ExternalLink, AlertCircle, ChevronRight, CheckCheck, Lock, Info,
  Users
} from 'lucide-react';
import { MOCK_INTEGRATIONS } from '../constants';
import ConnectionsManager from '../ConnectionsManager';
import TeamPanel from './TeamPanel';
import PostHogConnectionsPanel from '../components/PostHogConnectionsPanel';
import { testManusConnection, ManusTestResult } from '../services/manusService';

interface SettingsProps {
  apiKeys: ApiKeyConfig;
  onUpdateApiKeys: (keys: ApiKeyConfig) => void;
  spokeConnections: SpokeConnection[];
  onSpokeConnectionsChange: (connections: SpokeConnection[]) => void;
  branches: Branch[];
  branchContext?: BranchContext;
  onOpenArticle?: (article: Article) => void;
  initialTab?: 'integrations' | 'spokes' | 'api' | 'social' | 'team';
  /** Bumped to auto-open the connection wizard on the spokes tab. */
  autoStartConnectionNonce?: number;
  /** Display name to pre-fill when auto-opening the connection wizard. */
  connectionPrefillName?: string;
  /** Called once the auto-start signal has been consumed. */
  onConnectionAutoStartConsumed?: () => void;
}

const LLM_PROVIDERS: { id: LlmProvider; name: string; icon: any; color: string }[] = [
  { id: 'gemini', name: 'Google Gemini', icon: Sparkles, color: 'text-blue-500' },
  { id: 'openai', name: 'OpenAI GPT-4o', icon: Zap, color: 'text-emerald-500' },
  { id: 'anthropic', name: 'Anthropic Claude', icon: Cpu, color: 'text-amber-500' },
];

const INTEGRATION_TYPES: { id: Integration['type']; label: string }[] = [
  { id: 'webhook', label: 'Webhook' },
  { id: 'api', label: 'API Key' },
  { id: 'oauth', label: 'OAuth' },
  { id: 'custom', label: 'Custom' },
];

const Settings: React.FC<SettingsProps> = ({
  apiKeys,
  onUpdateApiKeys,
  spokeConnections,
  onSpokeConnectionsChange,
  branches,
  onOpenArticle,
  initialTab,
  autoStartConnectionNonce,
  connectionPrefillName,
  onConnectionAutoStartConsumed,
}) => {
  const [activeTab, setActiveTab] = useState<'integrations' | 'spokes' | 'api' | 'social' | 'team'>(initialTab ?? 'integrations');

  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [localApiKeys, setLocalApiKeys] = useState<ApiKeyConfig>(apiKeys);
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [integrations, setIntegrations] = useState<Integration[]>(MOCK_INTEGRATIONS);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newIntegration, setNewIntegration] = useState<Partial<Integration>>({
    name: '',
    type: 'webhook',
    description: '',
    credentials: {}
  });
  const [metaWizardStep, setMetaWizardStep] = useState<number>(0);
  const [metaSaveStatus, setMetaSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [manusSaving, setManusSaving] = useState(false);
  const [manusTesting, setManusTesting] = useState(false);
  const [manusTestResult, setManusTestResult] = useState<ManusTestResult | null>(null);

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      onUpdateApiKeys(localApiKeys);
      setIsSaving(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }, 1500);
  };

  const handleMetaSave = () => {
    if (!localApiKeys.meta_app_id || !localApiKeys.meta_app_secret) return;
    setMetaSaveStatus('saving');
    setTimeout(() => {
      onUpdateApiKeys(localApiKeys);
      setMetaSaveStatus('saved');
      setMetaWizardStep(4);
    }, 1500);
  };

  const metaIsConnected = !!(localApiKeys.meta_app_id && localApiKeys.meta_app_secret);

  const manusConnected = !!localApiKeys.manus_api_key;

  const handleManusSave = () => {
    setManusSaving(true);
    onUpdateApiKeys(localApiKeys);
    setTimeout(() => setManusSaving(false), 1200);
  };

  const handleManusTest = async () => {
    setManusTesting(true);
    setManusTestResult(null);
    const result = await testManusConnection(localApiKeys.manus_api_key);
    setManusTestResult(result);
    setManusTesting(false);
  };

  const toggleIntegrationStatus = (id: string) => {
    setIntegrations(prev => prev.map(i => {
      if (i.id === id) {
        return { ...i, status: i.status === 'active' ? 'inactive' : 'active' };
      }
      return i;
    }));
  };

  const deleteIntegration = (id: string) => {
    setIntegrations(prev => prev.filter(i => i.id !== id));
  };

  const addIntegration = () => {
    if (!newIntegration.name) return;
    const integration: Integration = {
      id: `int_${Date.now()}`,
      name: newIntegration.name,
      type: newIntegration.type || 'webhook',
      description: newIntegration.description,
      credentials: newIntegration.credentials || {},
      status: 'active',
      created_at: new Date().toISOString()
    };
    setIntegrations(prev => [...prev, integration]);
    setNewIntegration({ name: '', type: 'webhook', description: '', credentials: {} });
    setShowAddModal(false);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20">

      <div className="flex bg-white p-1 rounded-2xl border border-slate-200 shadow-sm w-fit overflow-x-auto max-w-full">
        {[
          { id: 'integrations', label: 'Integrations', icon: Plug },
          { id: 'spokes', label: 'Connections', icon: Database },
          { id: 'api', label: 'Secrets', icon: Key },
          { id: 'social', label: 'Social', icon: Instagram },
          { id: 'team', label: 'Team', icon: Users },
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
          {activeTab === 'integrations' && (
            <div className="space-y-8 animate-in fade-in duration-300">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Integrations</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Connect your tools and services</p>
                </div>
                <button
                  onClick={() => setShowAddModal(true)}
                  className="flex items-center space-x-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-xs hover:bg-emerald-700 transition"
                >
                  <Plus size={16} />
                  <span>Add Integration</span>
                </button>
              </div>

              <PostHogConnectionsPanel branches={branches} />

              {/* Manus Deep Research */}
              <div className="border-2 border-slate-100 rounded-3xl p-6 space-y-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center">
                      <Sparkles size={22} className="text-white" />
                    </div>
                    <div>
                      <h4 className="font-black text-slate-800 text-sm">Manus Deep Research</h4>
                      <p className="text-xs text-slate-500">AI deep-dive research on leads, saved to Trellis</p>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${manusConnected ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {manusConnected ? 'Connected' : 'Not connected'}
                  </span>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">API Key</label>
                    <div className="relative">
                      <input
                        type={visibleKeys['manus'] ? 'text' : 'password'}
                        placeholder="Paste your Manus API key"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-12 py-3 text-sm font-mono text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                        value={localApiKeys.manus_api_key || ''}
                        onChange={e => { setLocalApiKeys({ ...localApiKeys, manus_api_key: e.target.value }); setManusTestResult(null); }}
                      />
                      <button onClick={() => setVisibleKeys(prev => ({ ...prev, manus: !prev['manus'] }))} className="absolute right-4 top-3.5 text-slate-400 hover:text-slate-900 transition-colors">
                        {visibleKeys['manus'] ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <p className="text-[10px] text-slate-400 ml-1">Create one in Manus &rarr; Settings &rarr; API Integration. It is shown only once.</p>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">Research Model</label>
                    <select
                      value={localApiKeys.manus_model || 'manus-1.6'}
                      onChange={e => setLocalApiKeys({ ...localApiKeys, manus_model: e.target.value })}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    >
                      <option value="manus-1.6">manus-1.6 (balanced)</option>
                      <option value="manus-1.6-max">manus-1.6-max (deepest, higher cost)</option>
                      <option value="manus-1.6-lite">manus-1.6-lite (fastest, cheapest)</option>
                    </select>
                  </div>

                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 flex items-start space-x-3">
                    <Lock size={14} className="text-slate-400 flex-shrink-0 mt-0.5" />
                    <p className="text-[10px] text-slate-500 leading-relaxed">Stored server-side in your Trellis vault and never exposed in the browser. Save the key after entering it.</p>
                  </div>

                  {manusTestResult && (
                    <div className={`rounded-xl p-3 text-xs font-bold flex items-center space-x-2 ${manusTestResult.ok ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'}`}>
                      {manusTestResult.ok ? <CheckCheck size={14} className="flex-shrink-0" /> : <AlertCircle size={14} className="flex-shrink-0" />}
                      <span>{manusTestResult.ok ? 'Connection verified — your Manus API key works.' : (manusTestResult.error || 'Connection failed.')}</span>
                    </div>
                  )}

                  <div className="flex space-x-3">
                    <button
                      onClick={handleManusSave}
                      disabled={manusSaving}
                      className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-emerald-700 transition flex items-center justify-center space-x-2 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {manusSaving ? <RefreshCw size={14} className="animate-spin" /> : <Lock size={14} />}
                      <span>{manusSaving ? 'Saving...' : 'Save Key'}</span>
                    </button>
                    <button
                      onClick={handleManusTest}
                      disabled={manusTesting || !localApiKeys.manus_api_key}
                      className="flex-1 py-3 border border-slate-200 rounded-xl font-black text-xs uppercase tracking-widest text-slate-600 hover:bg-slate-50 transition flex items-center justify-center space-x-2 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {manusTesting ? <RefreshCw size={14} className="animate-spin" /> : <Zap size={14} />}
                      <span>{manusTesting ? 'Testing...' : 'Test Connection'}</span>
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <div className="h-px flex-1 bg-slate-100" />
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-300">Other integrations</span>
                <div className="h-px flex-1 bg-slate-100" />
              </div>

              <div className="space-y-4">
                {integrations.map(integration => (
                  <div key={integration.id} className={`p-6 rounded-2xl border-2 flex items-center justify-between transition-all ${integration.status === 'inactive' ? 'bg-slate-50 border-slate-100 opacity-60' : 'bg-white border-slate-100 hover:border-emerald-200 shadow-sm'}`}>
                    <div className="flex items-center space-x-6">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${integration.status === 'active' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
                        <Plug size={24} />
                      </div>
                      <div>
                        <div className="flex items-center space-x-3">
                          <h4 className="text-sm font-black text-slate-800">{integration.name}</h4>
                          <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-500">{integration.type}</span>
                        </div>
                        {integration.description && (
                          <p className="text-xs text-slate-500 mt-1">{integration.description}</p>
                        )}
                        <div className="flex items-center space-x-3 mt-2">
                          {integration.credentials.api_key && (
                            <div className="flex items-center space-x-2 bg-slate-50 px-2 py-1 rounded border border-slate-200">
                              <Key size={10} className="text-slate-400" />
                              <span className="text-[9px] font-mono text-slate-600 font-bold">
                                {visibleKeys[integration.id] ? integration.credentials.api_key : '••••••••••••'}
                              </span>
                              <button onClick={() => setVisibleKeys(prev => ({...prev, [integration.id]: !prev[integration.id]}))} className="ml-1 text-slate-400 hover:text-slate-900">
                                {visibleKeys[integration.id] ? <EyeOff size={10} /> : <Eye size={10} />}
                              </button>
                            </div>
                          )}
                          {integration.credentials.webhook_url && (
                            <div className="flex items-center space-x-2 bg-slate-50 px-2 py-1 rounded border border-slate-200">
                              <Globe size={10} className="text-slate-400" />
                              <span className="text-[9px] font-mono text-slate-600 font-bold truncate max-w-[200px]">
                                {integration.credentials.webhook_url}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => toggleIntegrationStatus(integration.id)}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase transition ${
                          integration.status === 'active'
                            ? 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        {integration.status === 'active' ? 'Active' : 'Inactive'}
                      </button>
                      <button
                        onClick={() => deleteIntegration(integration.id)}
                        className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}

                {integrations.length === 0 && (
                  <div className="text-center py-12 text-slate-400">
                    <Plug size={48} className="mx-auto mb-4 opacity-50" />
                    <p className="text-sm font-bold">No integrations yet</p>
                    <p className="text-xs mt-1">Add your first integration to get started</p>
                  </div>
                )}
              </div>

              {/* Add Integration Modal */}
              {showAddModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                  <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl">
                    <div className="flex justify-between items-center mb-6">
                      <h3 className="text-lg font-black text-slate-800 uppercase">Add Integration</h3>
                      <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-800">
                        <X size={20} />
                      </button>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Name</label>
                        <input
                          type="text"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-emerald-500"
                          placeholder="e.g., Stripe, Shopify, Custom API"
                          value={newIntegration.name}
                          onChange={e => setNewIntegration(prev => ({ ...prev, name: e.target.value }))}
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Type</label>
                        <div className="grid grid-cols-4 gap-2">
                          {INTEGRATION_TYPES.map(type => (
                            <button
                              key={type.id}
                              onClick={() => setNewIntegration(prev => ({ ...prev, type: type.id }))}
                              className={`py-2 rounded-lg text-[10px] font-bold uppercase transition ${
                                newIntegration.type === type.id
                                  ? 'bg-emerald-600 text-white'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}
                            >
                              {type.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">Description (optional)</label>
                        <input
                          type="text"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-800 outline-none focus:border-emerald-500"
                          placeholder="What does this integration do?"
                          value={newIntegration.description}
                          onChange={e => setNewIntegration(prev => ({ ...prev, description: e.target.value }))}
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-black text-slate-400 uppercase mb-2">
                          {newIntegration.type === 'webhook' ? 'Webhook URL' : 'API Key'}
                        </label>
                        <input
                          type="text"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono text-slate-800 outline-none focus:border-emerald-500"
                          placeholder={newIntegration.type === 'webhook' ? 'https://...' : 'Enter API key...'}
                          onChange={e => setNewIntegration(prev => ({
                            ...prev,
                            credentials: {
                              ...prev.credentials,
                              [newIntegration.type === 'webhook' ? 'webhook_url' : 'api_key']: e.target.value
                            }
                          }))}
                        />
                      </div>
                    </div>

                    <div className="flex space-x-3 mt-8">
                      <button
                        onClick={() => setShowAddModal(false)}
                        className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm hover:bg-slate-200 transition"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={addIntegration}
                        disabled={!newIntegration.name}
                        className="flex-1 px-4 py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Add Integration
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'spokes' && (
            <div className="space-y-6 animate-in fade-in duration-300">
              <div className="flex justify-end">
                <HelpLink articleId="art_gs_connect_spokes" variant="badge" label="How to connect" onOpenArticle={onOpenArticle!} />
              </div>
              <ConnectionsManager
                connections={spokeConnections}
                onConnectionsChange={onSpokeConnectionsChange}
                autoStartNonce={autoStartConnectionNonce}
                prefillName={connectionPrefillName}
                onAutoStartConsumed={onConnectionAutoStartConsumed}
              />
            </div>
          )}

          {activeTab === 'api' && (
            <div className="space-y-10 animate-in fade-in duration-300">
               <div>
                  <div className="flex items-center space-x-3 mb-6">
                    <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Strategic AI Engine</h3>
                    <HelpLink articleId="art_admin_api_keys" variant="badge" label="Key reference" onOpenArticle={onOpenArticle!} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
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
                  <div className="space-y-4">
                    {[
                      { id: 'gemini_api_key', label: 'Gemini API Key', provider: 'gemini', icon: Sparkles, color: 'text-blue-500' },
                      { id: 'openai_api_key', label: 'OpenAI API Key', provider: 'openai', icon: Zap, color: 'text-emerald-500' },
                      { id: 'anthropic_api_key', label: 'Anthropic API Key', provider: 'anthropic', icon: Cpu, color: 'text-amber-500' },
                    ].map(cfg => (
                      <div key={cfg.id} className={`relative transition-opacity ${localApiKeys.active_llm === cfg.provider ? 'opacity-100' : 'opacity-40'}`}>
                         <label className="flex items-center gap-2 text-[9px] font-black text-slate-400 uppercase mb-2 ml-1">
                           <cfg.icon size={14} className={cfg.color} />
                           {cfg.label} {localApiKeys.active_llm === cfg.provider && <span className="text-emerald-500">(Active)</span>}
                         </label>
                         <input
                            type={visibleKeys[cfg.id] ? 'text' : 'password'}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-12 py-3 text-sm font-mono text-slate-800 outline-none transition focus:border-emerald-500"
                            value={(localApiKeys as any)[cfg.id]}
                            onChange={(e) => setLocalApiKeys({ ...localApiKeys, [cfg.id]: e.target.value })}
                            placeholder={`Enter your ${cfg.label}...`}
                         />
                         <button onClick={() => setVisibleKeys(prev => ({...prev, [cfg.id]: !prev[cfg.id]}))} className="absolute right-4 top-10 text-slate-400 hover:text-slate-900 transition-colors">
                           {visibleKeys[cfg.id] ? <EyeOff size={16} /> : <Eye size={16} />}
                         </button>
                      </div>
                    ))}
                  </div>
               </div>

               <div className="space-y-6 pt-6 border-t border-slate-100">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">n8n Webhooks</h3>
                  <div className="relative">
                    <label className="flex items-center gap-2 text-[9px] font-black text-slate-400 uppercase mb-2 ml-1">
                      <Workflow size={14} className="text-orange-500" />
                      n8n Chat Webhook (AI/Sage)
                    </label>
                    <input
                      type={visibleKeys['n8n_chat'] ? 'text' : 'password'}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-12 py-3 text-sm font-mono text-slate-800 outline-none transition focus:border-emerald-500"
                      value={localApiKeys.n8n_webhooks?.chat || ''}
                      onChange={(e) => setLocalApiKeys({ ...localApiKeys, n8n_webhooks: { ...localApiKeys.n8n_webhooks, chat: e.target.value } })}
                      placeholder="Enter n8n chat webhook URL..."
                    />
                    <button onClick={() => setVisibleKeys(prev => ({...prev, n8n_chat: !prev.n8n_chat}))} className="absolute right-4 top-10 text-slate-400 hover:text-slate-900 transition-colors">
                      {visibleKeys['n8n_chat'] ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <div className="relative">
                    <label className="flex items-center gap-2 text-[9px] font-black text-slate-400 uppercase mb-2 ml-1">
                      <Workflow size={14} className="text-orange-500" />
                      n8n Workflow Webhook
                    </label>
                    <input
                      type={visibleKeys['n8n_workflow'] ? 'text' : 'password'}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-12 py-3 text-sm font-mono text-slate-800 outline-none transition focus:border-emerald-500"
                      value={localApiKeys.n8n_webhooks?.workflow || ''}
                      onChange={(e) => setLocalApiKeys({ ...localApiKeys, n8n_webhooks: { ...localApiKeys.n8n_webhooks, workflow: e.target.value } })}
                      placeholder="Enter n8n workflow webhook URL..."
                    />
                    <button onClick={() => setVisibleKeys(prev => ({...prev, n8n_workflow: !prev.n8n_workflow}))} className="absolute right-4 top-10 text-slate-400 hover:text-slate-900 transition-colors">
                      {visibleKeys['n8n_workflow'] ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
               </div>

               <div className="space-y-6 pt-6 border-t border-slate-100">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Other Webhooks</h3>
                  <div className="relative">
                    <label className="flex items-center gap-2 text-[9px] font-black text-slate-400 uppercase mb-2 ml-1">
                      <Slack size={14} className="text-purple-500" />
                      Slack Alert Endpoint (DLQ)
                    </label>
                    <input
                      type={visibleKeys['slack_webhook'] ? 'text' : 'password'}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-12 py-3 text-sm font-mono text-slate-800 outline-none transition focus:border-emerald-500"
                      value={localApiKeys.slack_webhook || ''}
                      onChange={(e) => setLocalApiKeys({ ...localApiKeys, slack_webhook: e.target.value })}
                      placeholder="Enter slack webhook URL..."
                    />
                    <button onClick={() => setVisibleKeys(prev => ({...prev, slack_webhook: !prev.slack_webhook}))} className="absolute right-4 top-10 text-slate-400 hover:text-slate-900 transition-colors">
                      {visibleKeys['slack_webhook'] ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
               </div>

               <div className="space-y-6 pt-6 border-t border-slate-100">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Communication Services</h3>
                  {[
                    { id: 'resend_token', label: 'Resend API Token', icon: SendIcon, color: 'text-sky-500' },
                    { id: 'twilio_sid', label: 'Twilio Account SID', icon: Phone, color: 'text-red-500' },
                    { id: 'twilio_token', label: 'Twilio Auth Token', icon: Phone, color: 'text-red-500' },
                  ].map(cfg => (
                    <div key={cfg.id} className="relative">
                       <label className="flex items-center gap-2 text-[9px] font-black text-slate-400 uppercase mb-2 ml-1">
                         <cfg.icon size={14} className={cfg.color} />
                         {cfg.label}
                       </label>
                       <input
                          type={visibleKeys[cfg.id] ? 'text' : 'password'}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-12 py-3 text-sm font-mono text-slate-800 outline-none transition focus:border-emerald-500"
                          value={(localApiKeys as any)[cfg.id]}
                          onChange={(e) => setLocalApiKeys({ ...localApiKeys, [cfg.id]: e.target.value })}
                          placeholder={`Enter ${cfg.label.toLowerCase()}...`}
                       />
                       <button onClick={() => setVisibleKeys(prev => ({...prev, [cfg.id]: !prev[cfg.id]}))} className="absolute right-4 top-10 text-slate-400 hover:text-slate-900 transition-colors">
                         {visibleKeys[cfg.id] ? <EyeOff size={16} /> : <Eye size={16} />}
                       </button>
                    </div>
                  ))}
                  <div>
                    <label className="flex items-center gap-2 text-[9px] font-black text-slate-400 uppercase mb-2 ml-1">
                      <Mail size={14} className="text-sky-500" />
                      Resend From Address
                    </label>
                    <input
                      type="text"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-4 py-3 text-sm text-slate-800 outline-none transition focus:border-emerald-500"
                      value={localApiKeys.resend_from_address}
                      onChange={(e) => setLocalApiKeys({ ...localApiKeys, resend_from_address: e.target.value })}
                      placeholder="Display Name <email@domain.com>"
                    />
                  </div>
               </div>

               <div className="space-y-6 pt-6 border-t border-slate-100">
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">E-Commerce</h3>
                  {[
                    { id: 'woo_consumer_key', label: 'WooCommerce Consumer Key', icon: ShoppingBag, color: 'text-violet-500' },
                    { id: 'woo_consumer_secret', label: 'WooCommerce Consumer Secret', icon: ShoppingBag, color: 'text-violet-500' },
                  ].map(cfg => (
                    <div key={cfg.id} className="relative">
                       <label className="flex items-center gap-2 text-[9px] font-black text-slate-400 uppercase mb-2 ml-1">
                         <cfg.icon size={14} className={cfg.color} />
                         {cfg.label}
                       </label>
                       <input
                          type={visibleKeys[cfg.id] ? 'text' : 'password'}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-12 py-3 text-sm font-mono text-slate-800 outline-none transition focus:border-emerald-500"
                          value={(localApiKeys as any)[cfg.id]}
                          onChange={(e) => setLocalApiKeys({ ...localApiKeys, [cfg.id]: e.target.value })}
                          placeholder={`Enter ${cfg.label.toLowerCase()}...`}
                       />
                       <button onClick={() => setVisibleKeys(prev => ({...prev, [cfg.id]: !prev[cfg.id]}))} className="absolute right-4 top-10 text-slate-400 hover:text-slate-900 transition-colors">
                         {visibleKeys[cfg.id] ? <EyeOff size={16} /> : <Eye size={16} />}
                       </button>
                    </div>
                  ))}
               </div>
            </div>
          )}

          {activeTab === 'social' && (
            <div className="space-y-8 animate-in fade-in duration-300">
              <div>
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Social Platform Connections</h3>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Connect your business accounts to enable publishing and listening</p>
              </div>

              {/* Meta / Instagram Card */}
              <div className="border-2 border-slate-100 rounded-3xl overflow-hidden">
                {/* Card Header */}
                <div className="p-6 flex items-center justify-between bg-gradient-to-r from-purple-50 to-pink-50 border-b border-slate-100">
                  <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-lg">
                      <Instagram size={22} className="text-white" />
                    </div>
                    <div>
                      <h4 className="font-black text-slate-800 text-sm uppercase tracking-tight">Meta / Instagram</h4>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Instagram Graph API &middot; Pages API</p>
                    </div>
                  </div>
                  {metaIsConnected ? (
                    <div className="flex items-center space-x-2 bg-emerald-100 text-emerald-700 px-4 py-2 rounded-full">
                      <CheckCheck size={14} />
                      <span className="text-[10px] font-black uppercase tracking-widest">Connected</span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2 bg-amber-100 text-amber-700 px-4 py-2 rounded-full">
                      <AlertCircle size={14} />
                      <span className="text-[10px] font-black uppercase tracking-widest">Not Connected</span>
                    </div>
                  )}
                </div>

                {/* Wizard Body */}
                <div className="p-8 space-y-8">

                  {/* Step Progress */}
                  <div className="flex items-center space-x-2">
                    {['Create App', 'Use Cases', 'Business', 'Credentials', 'Done'].map((label, i) => (
                      <React.Fragment key={i}>
                        <div className="flex flex-col items-center space-y-1">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black transition-all ${
                            metaWizardStep > i ? 'bg-emerald-500 text-white' :
                            metaWizardStep === i ? 'bg-slate-800 text-white ring-4 ring-slate-200' :
                            'bg-slate-100 text-slate-400'
                          }`}>
                            {metaWizardStep > i ? <CheckCheck size={12} /> : i + 1}
                          </div>
                          <span className="text-[8px] font-black uppercase tracking-widest text-slate-400 hidden sm:block whitespace-nowrap">{label}</span>
                        </div>
                        {i < 4 && <div className={`flex-1 h-0.5 mb-4 transition-all ${metaWizardStep > i ? 'bg-emerald-400' : 'bg-slate-100'}`} />}
                      </React.Fragment>
                    ))}
                  </div>

                  {/* Step 0 — Create App */}
                  {metaWizardStep === 0 && (
                    <div className="space-y-6">
                      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6 space-y-3">
                        <div className="flex items-center space-x-3">
                          <Info size={18} className="text-blue-600 flex-shrink-0" />
                          <h5 className="font-black text-blue-900 text-sm">One-Time Meta Developer Setup</h5>
                        </div>
                        <p className="text-sm text-blue-800 leading-relaxed">
                          Trellis uses the <b>Instagram Graph API</b> to publish posts, respond to comments, and listen for buying signals across all your properties. You only create this Meta app once &mdash; all your branches (ATL Urban Farms, school.sproutify.app, etc.) connect through it.
                        </p>
                      </div>
                      <div className="space-y-4">
                        <h5 className="font-black text-slate-700 text-xs uppercase tracking-widest">Step 1: Create Your Meta App</h5>
                        <ol className="space-y-3 text-sm text-slate-600">
                          <li className="flex items-start space-x-3"><span className="bg-slate-100 text-slate-600 font-black text-[10px] rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">1</span><span>Go to <b>developers.facebook.com/apps</b> and click <b>&quot;Create App&quot;</b></span></li>
                          <li className="flex items-start space-x-3"><span className="bg-slate-100 text-slate-600 font-black text-[10px] rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">2</span><span>Name your app after your primary property (e.g. <b>&quot;ATL Urban Farms&quot;</b>) and enter your contact email</span></li>
                          <li className="flex items-start space-x-3"><span className="bg-slate-100 text-slate-600 font-black text-[10px] rounded-full w-5 h-5 flex items-center justify-center flex-shrink-0 mt-0.5">3</span><span>Click <b>Next</b> to reach the Use Cases screen</span></li>
                        </ol>
                        <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer" className="inline-flex items-center space-x-2 bg-blue-600 text-white px-5 py-2.5 rounded-xl font-black text-xs hover:bg-blue-700 transition">
                          <ExternalLink size={14} />
                          <span>Open Meta Developer Portal</span>
                        </a>
                      </div>
                      <button onClick={() => setMetaWizardStep(1)} className="w-full py-3 bg-slate-800 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-700 transition flex items-center justify-center space-x-2">
                        <span>App Created &mdash; Next Step</span>
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  )}

                  {/* Step 1 — Use Cases */}
                  {metaWizardStep === 1 && (
                    <div className="space-y-6">
                      <h5 className="font-black text-slate-700 text-xs uppercase tracking-widest">Step 2: Select Use Cases</h5>
                      <div className="space-y-3 text-sm text-slate-600">
                        <p>On the <b>&quot;Use Cases&quot;</b> screen, click <b>&quot;Content management (5)&quot;</b> in the left filter, then select <b>both</b> of the following:</p>
                        <div className="space-y-3 mt-4">
                          {[
                            { title: 'Manage messaging & content on Instagram', desc: 'Enables publishing posts, stories, responding to comments and DMs' },
                            { title: 'Manage everything on your Page', desc: 'Required to enumerate all your Pages/properties under one Business Manager login' }
                          ].map((item, i) => (
                            <div key={i} className="flex items-start space-x-3 bg-emerald-50 border border-emerald-100 rounded-xl p-4">
                              <CheckCheck size={18} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                              <div>
                                <p className="font-black text-emerald-900 text-xs uppercase">{item.title}</p>
                                <p className="text-xs text-emerald-700 mt-1">{item.desc}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="flex space-x-3">
                        <button onClick={() => setMetaWizardStep(0)} className="px-5 py-3 border border-slate-200 rounded-xl font-black text-xs text-slate-500 hover:bg-slate-50 transition">Back</button>
                        <button onClick={() => setMetaWizardStep(2)} className="flex-1 py-3 bg-slate-800 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-700 transition flex items-center justify-center space-x-2">
                          <span>Use Cases Selected &mdash; Next</span>
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Step 2 — Business */}
                  {metaWizardStep === 2 && (
                    <div className="space-y-6">
                      <h5 className="font-black text-slate-700 text-xs uppercase tracking-widest">Step 3: Connect Business Portfolio</h5>
                      <div className="space-y-3 text-sm text-slate-600">
                        <p>On the <b>&quot;Business&quot;</b> screen, select your <b>verified business portfolio</b> &mdash; it shows &quot;Business verification complete.&quot;</p>
                        <div className="bg-amber-50 border border-amber-100 rounded-xl p-4 flex items-start space-x-3 mt-4">
                          <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                          <p className="text-xs text-amber-800"><b>Do not</b> select a personal portfolio. Only a verified business portfolio unlocks third-party user data access needed for multi-property management.</p>
                        </div>
                        <p className="mt-2">Click through <b>Requirements</b> (no action needed) and <b>Overview</b>, then click <b>&quot;Go to dashboard.&quot;</b></p>
                      </div>
                      <div className="flex space-x-3">
                        <button onClick={() => setMetaWizardStep(1)} className="px-5 py-3 border border-slate-200 rounded-xl font-black text-xs text-slate-500 hover:bg-slate-50 transition">Back</button>
                        <button onClick={() => setMetaWizardStep(3)} className="flex-1 py-3 bg-slate-800 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-700 transition flex items-center justify-center space-x-2">
                          <span>App Created &mdash; Add Credentials</span>
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Step 3 — Enter Credentials */}
                  {metaWizardStep === 3 && (
                    <div className="space-y-6">
                      <h5 className="font-black text-slate-700 text-xs uppercase tracking-widest">Step 4: Copy Your App Credentials</h5>
                      <p className="text-sm text-slate-600">From your Meta App dashboard, your <b>App ID</b> is at the top of the page. Go to <b>App Settings &rarr; Basic</b> to reveal your <b>App Secret</b>.</p>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">App ID</label>
                          <input
                            type="text"
                            placeholder="e.g. 4336246873255158"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                            value={localApiKeys.meta_app_id || ''}
                            onChange={e => setLocalApiKeys({ ...localApiKeys, meta_app_id: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="block text-[9px] font-black text-slate-400 uppercase tracking-widest ml-1">App Secret</label>
                          <div className="relative">
                            <input
                              type={visibleKeys['meta_secret'] ? 'text' : 'password'}
                              placeholder="32-character hex string"
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-12 py-3 text-sm font-mono text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                              value={localApiKeys.meta_app_secret || ''}
                              onChange={e => setLocalApiKeys({ ...localApiKeys, meta_app_secret: e.target.value })}
                            />
                            <button onClick={() => setVisibleKeys(prev => ({ ...prev, meta_secret: !prev['meta_secret'] }))} className="absolute right-4 top-3.5 text-slate-400 hover:text-slate-900 transition-colors">
                              {visibleKeys['meta_secret'] ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                          </div>
                        </div>
                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 flex items-start space-x-3">
                          <Lock size={14} className="text-slate-400 flex-shrink-0 mt-0.5" />
                          <p className="text-[10px] text-slate-500 leading-relaxed">These credentials are stored encrypted in your Trellis vault. They are never exposed in the browser or committed to code.</p>
                        </div>
                      </div>
                      <div className="flex space-x-3">
                        <button onClick={() => setMetaWizardStep(2)} className="px-5 py-3 border border-slate-200 rounded-xl font-black text-xs text-slate-500 hover:bg-slate-50 transition">Back</button>
                        <button
                          onClick={handleMetaSave}
                          disabled={!localApiKeys.meta_app_id || !localApiKeys.meta_app_secret || metaSaveStatus === 'saving'}
                          className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-emerald-700 transition flex items-center justify-center space-x-2 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {metaSaveStatus === 'saving' ? <RefreshCw size={14} className="animate-spin" /> : <Lock size={14} />}
                          <span>{metaSaveStatus === 'saving' ? 'Saving to Vault...' : 'Save & Connect'}</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Step 4 — Connected */}
                  {metaWizardStep === 4 && (
                    <div className="space-y-6 text-center py-4">
                      <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
                        <CheckCheck size={36} className="text-emerald-600" />
                      </div>
                      <div>
                        <h5 className="font-black text-slate-800 text-lg">Meta App Connected</h5>
                        <p className="text-sm text-slate-500 mt-2 max-w-sm mx-auto">Your App ID and Secret are stored in the Trellis vault. The next step is to connect individual Instagram accounts per branch in the Social Hub.</p>
                      </div>
                      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 text-left space-y-3">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Stored Credentials</p>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-600 font-bold">App ID</span>
                          <span className="text-xs font-mono text-slate-800">{localApiKeys.meta_app_id}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-600 font-bold">App Secret</span>
                          <span className="text-xs font-mono text-slate-500">&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;</span>
                        </div>
                      </div>
                      <button onClick={() => { setMetaWizardStep(3); setMetaSaveStatus('idle'); }} className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-700 transition">
                        Update Credentials
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* X / Twitter Placeholder */}
              <div className="border-2 border-slate-100 rounded-3xl p-6 flex items-center justify-between opacity-50">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 rounded-2xl bg-slate-900 flex items-center justify-center">
                    <span className="text-white font-black text-lg">&#120143;</span>
                  </div>
                  <div>
                    <h4 className="font-black text-slate-800 text-sm uppercase tracking-tight">X / Twitter</h4>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Twitter API v2</p>
                  </div>
                </div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-100 px-3 py-1.5 rounded-full">Coming Soon</span>
              </div>

              {/* LinkedIn Placeholder */}
              <div className="border-2 border-slate-100 rounded-3xl p-6 flex items-center justify-between opacity-50">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 rounded-2xl bg-blue-700 flex items-center justify-center">
                    <span className="text-white font-black text-sm">in</span>
                  </div>
                  <div>
                    <h4 className="font-black text-slate-800 text-sm uppercase tracking-tight">LinkedIn</h4>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Marketing API</p>
                  </div>
                </div>
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-100 px-3 py-1.5 rounded-full">Coming Soon</span>
              </div>
            </div>
          )}

          {activeTab === 'team' && <TeamPanel />}
        </div>

        {activeTab !== 'integrations' && activeTab !== 'spokes' && activeTab !== 'social' && activeTab !== 'team' && (
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
