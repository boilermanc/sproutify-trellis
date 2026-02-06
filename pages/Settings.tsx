
import React, { useState } from 'react';
import { ApiKeyConfig, LlmProvider, Integration, SpokeConnection, Branch } from '../types';
import {
  Key, Globe, Save, RefreshCw,
  Eye, EyeOff, Workflow, ShoppingBag, Send as SendIcon,
  Phone, Cpu, Sparkles, Zap, Plug,
  Trash2, Plus, X, Slack, Link2, Copy, Database, Clock
} from 'lucide-react';
import { MOCK_INTEGRATIONS } from '../constants';

interface SettingsProps {
  apiKeys: ApiKeyConfig;
  onUpdateApiKeys: (keys: ApiKeyConfig) => void;
  spokeConnections: SpokeConnection[];
  onSpokeConnectionsChange: (connections: SpokeConnection[]) => void;
  branches: Branch[];
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

const relativeTime = (dateStr?: string) => {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

const Settings: React.FC<SettingsProps> = ({
  apiKeys,
  onUpdateApiKeys,
  spokeConnections,
  onSpokeConnectionsChange,
  branches
}) => {
  const [activeTab, setActiveTab] = useState<'integrations' | 'spokes' | 'api'>('integrations');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [localApiKeys, setLocalApiKeys] = useState<ApiKeyConfig>(apiKeys);
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [integrations, setIntegrations] = useState<Integration[]>(MOCK_INTEGRATIONS);
  const [showAddModal, setShowAddModal] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const [newIntegration, setNewIntegration] = useState<Partial<Integration>>({
    name: '',
    type: 'webhook',
    description: '',
    credentials: {}
  });

  const handleSave = () => {
    setIsSaving(true);
    setTimeout(() => {
      onUpdateApiKeys(localApiKeys);
      setIsSaving(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }, 1500);
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

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(null), 2000);
  };

  const statusDot = (status: SpokeConnection['status']) => {
    const colors = { active: 'bg-emerald-500', disconnected: 'bg-amber-500', error: 'bg-rose-500' };
    return <span className={`inline-block w-2 h-2 rounded-full ${colors[status]}`} />;
  };

  const pairs = spokeConnections.map(conn => {
    const linkedBranch = branches.find(b => b.spoke_connection_id === conn.id);
    return { connection: conn, branch: linkedBranch || null };
  });

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-20">

      <div className="flex bg-white p-1 rounded-2xl border border-slate-200 shadow-sm w-fit overflow-x-auto max-w-full">
        {[
          { id: 'integrations', label: 'Integrations', icon: Plug },
          { id: 'spokes', label: 'Spoke Registry', icon: Database },
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
            <div className="space-y-8 animate-in fade-in duration-300">
              <div>
                <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">Spoke Registry</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">
                  {pairs.length} connection{pairs.length !== 1 ? 's' : ''} registered
                </p>
              </div>

              <div className="space-y-4">
                {pairs.map(({ connection: conn, branch }) => (
                  <div
                    key={conn.id}
                    className={`rounded-2xl border-2 border-slate-100 overflow-hidden transition-all hover:shadow-md ${
                      branch ? 'border-l-emerald-500 border-l-4' : 'border-l-amber-400 border-l-4'
                    }`}
                  >
                    <div className="grid grid-cols-1 md:grid-cols-[1fr,auto,1fr] items-stretch">
                      {/* LEFT — Connection */}
                      <div className="p-6 space-y-3">
                        <div className="flex items-center space-x-3">
                          <Database size={16} className="text-slate-400" />
                          <h4 className="text-sm font-black text-slate-800">{conn.name}</h4>
                          <span className="flex items-center space-x-1.5">
                            {statusDot(conn.status)}
                            <span className={`text-[9px] font-bold uppercase ${
                              conn.status === 'active' ? 'text-emerald-600' : conn.status === 'disconnected' ? 'text-amber-600' : 'text-rose-600'
                            }`}>{conn.status}</span>
                          </span>
                        </div>

                        <div className="flex items-center space-x-2">
                          <span className="text-[10px] font-mono text-slate-500 truncate max-w-[240px]">
                            {conn.supabase_url}
                          </span>
                          <button
                            onClick={() => handleCopyUrl(conn.supabase_url)}
                            className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition"
                            title="Copy URL"
                          >
                            <Copy size={12} />
                          </button>
                          {copiedUrl === conn.supabase_url && (
                            <span className="text-[9px] font-bold text-emerald-500">Copied!</span>
                          )}
                        </div>

                        <div className="flex items-center space-x-4">
                          <span className="text-[10px] font-bold text-slate-400">
                            {conn.tables.length} table{conn.tables.length !== 1 ? 's' : ''} mapped
                          </span>
                          <span className="flex items-center space-x-1 text-[10px] text-slate-400">
                            <Clock size={10} />
                            <span className="font-bold">{relativeTime(conn.last_tested_at)}</span>
                          </span>
                        </div>
                      </div>

                      {/* CENTER — Link indicator */}
                      <div className="hidden md:flex items-center justify-center px-4">
                        <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                          branch ? 'bg-emerald-50 text-emerald-500' : 'bg-slate-100 text-slate-300'
                        }`}>
                          <Link2 size={16} />
                        </div>
                      </div>

                      {/* RIGHT — Branch or empty state */}
                      <div className="p-6 bg-slate-50/50 space-y-3 border-t md:border-t-0 md:border-l border-slate-100">
                        {branch ? (
                          <>
                            <div className="flex items-center space-x-3">
                              <span
                                className="w-4 h-4 rounded-full ring-2 ring-white shadow-sm flex-shrink-0"
                                style={{ backgroundColor: branch.primary_color }}
                              />
                              <h4 className="text-sm font-black text-slate-800">{branch.name}</h4>
                            </div>
                            <div className="flex items-center space-x-2">
                              <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                                {branch.slug}
                              </span>
                              {branch.is_active ? (
                                <span className="text-[9px] font-bold uppercase text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded">Active</span>
                              ) : (
                                <span className="text-[9px] font-bold uppercase text-slate-400 bg-slate-100 px-2 py-0.5 rounded">Inactive</span>
                              )}
                            </div>
                            {branch.website_url && (
                              <span className="text-[10px] text-slate-400 truncate block">{branch.website_url}</span>
                            )}
                          </>
                        ) : (
                          <div className="flex flex-col items-center justify-center h-full text-center py-2">
                            <span className="text-[10px] font-bold text-slate-400 uppercase">No branch linked</span>
                            <span className="text-[9px] text-slate-300 mt-1">Link via Branch Command Center</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {pairs.length === 0 && (
                  <div className="text-center py-16 text-slate-400">
                    <Database size={48} className="mx-auto mb-4 opacity-50" />
                    <p className="text-sm font-bold">No spoke connections</p>
                    <p className="text-xs mt-1">Add a connection via the Connections Manager to get started</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'api' && (
            <div className="space-y-10 animate-in fade-in duration-300">
               <div>
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Strategic AI Engine</h3>
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
        </div>

        {activeTab !== 'integrations' && activeTab !== 'spokes' && (
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
