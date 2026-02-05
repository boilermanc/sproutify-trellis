import { useState, useEffect } from 'react';
import { Globe, Database, Check, X, AlertCircle, Eye, EyeOff, RefreshCw, Unplug, Loader2 } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { SpokeConnection } from './types';
import { SITES_LIST } from './constants';
import { fetchEnrichedProfiles } from './spokeConnector';

interface BranchesProps {
  spokeConnections: SpokeConnection[];
  onSpokeConnectionsChange: (connections: SpokeConnection[]) => void;
}

interface ConnectionForm {
  supabaseUrl: string;
  apiKey: string;
  tableName: string;
}

interface TestResult {
  success: boolean;
  message: string;
  profileCount?: number;
}

export default function Branches({ spokeConnections, onSpokeConnectionsChange }: BranchesProps) {
  const [expandedSite, setExpandedSite] = useState<string | null>(null);
  const [connectionForms, setConnectionForms] = useState<Record<string, ConnectionForm>>({});
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, TestResult>>({});
  const [isTesting, setIsTesting] = useState<Record<string, boolean>>({});
  const [profileCounts, setProfileCounts] = useState<Record<string, number>>({});
  const [isLoadingCounts, setIsLoadingCounts] = useState<Record<string, boolean>>({});

  // Fetch profile counts for all connected spokes using enriched merge logic
  const fetchAllProfileCounts = async () => {
    const activeConns = spokeConnections.filter(c => c.status === 'active');
    if (activeConns.length === 0) return;

    // Set loading state for all active connections
    const loadingState: Record<string, boolean> = {};
    activeConns.forEach(c => { loadingState[c.name] = true; });
    setIsLoadingCounts(loadingState);

    try {
      // Use fetchEnrichedProfiles which merges customers + order-only identities
      const { profiles, errors } = await fetchEnrichedProfiles(spokeConnections);

      if (errors.length > 0) {
        console.warn('Profile fetch errors:', errors);
      }

      // Group profiles by spoke_name and count
      const counts: Record<string, number> = {};
      for (const profile of profiles) {
        const spokeName = profile._spoke_name;
        counts[spokeName] = (counts[spokeName] || 0) + 1;
      }

      setProfileCounts(counts);
    } catch (err) {
      console.error('Failed to fetch enriched profiles:', err);
    } finally {
      // Clear loading state
      const doneState: Record<string, boolean> = {};
      activeConns.forEach(c => { doneState[c.name] = false; });
      setIsLoadingCounts(doneState);
    }
  };

  useEffect(() => {
    if (spokeConnections.some(c => c.status === 'active')) {
      fetchAllProfileCounts();
    }
  }, [spokeConnections]);

  const getConnectionForSite = (site: string): SpokeConnection | undefined => {
    return spokeConnections.find(conn => conn.name === site && conn.status === 'active');
  };

  const connectedCount = SITES_LIST.filter(site => getConnectionForSite(site)).length;

  const handleExpandSite = (site: string) => {
    if (expandedSite === site) {
      setExpandedSite(null);
    } else {
      setExpandedSite(site);
      if (!connectionForms[site]) {
        setConnectionForms(prev => ({
          ...prev,
          [site]: { supabaseUrl: '', apiKey: '', tableName: 'profiles' }
        }));
      }
    }
  };

  const updateForm = (site: string, field: keyof ConnectionForm, value: string) => {
    setConnectionForms(prev => ({
      ...prev,
      [site]: { ...prev[site], [field]: value }
    }));
    // Clear test result when form changes
    setTestResults(prev => {
      const updated = { ...prev };
      delete updated[site];
      return updated;
    });
  };

  const handleTestConnection = async (site: string) => {
    const form = connectionForms[site];
    if (!form?.supabaseUrl || !form?.apiKey) {
      setTestResults(prev => ({
        ...prev,
        [site]: { success: false, message: 'Please fill in URL and API Key' }
      }));
      return;
    }

    setIsTesting(prev => ({ ...prev, [site]: true }));
    setTestResults(prev => {
      const updated = { ...prev };
      delete updated[site];
      return updated;
    });

    try {
      const client = createClient(form.supabaseUrl, form.apiKey);

      // First test: try to query the table
      const { error: queryError } = await client
        .from(form.tableName)
        .select('*')
        .limit(1);

      if (queryError) {
        setTestResults(prev => ({
          ...prev,
          [site]: { success: false, message: queryError.message }
        }));
        return;
      }

      // Second: get count
      const { count, error: countError } = await client
        .from(form.tableName)
        .select('id', { count: 'exact', head: true });

      if (countError) {
        setTestResults(prev => ({
          ...prev,
          [site]: { success: false, message: countError.message }
        }));
        return;
      }

      setTestResults(prev => ({
        ...prev,
        [site]: {
          success: true,
          message: `Connection successful! Found ${count ?? 0} profiles.`,
          profileCount: count ?? 0
        }
      }));
    } catch (err: any) {
      setTestResults(prev => ({
        ...prev,
        [site]: { success: false, message: err.message || 'Connection failed' }
      }));
    } finally {
      setIsTesting(prev => ({ ...prev, [site]: false }));
    }
  };

  const handleSaveConnection = (site: string) => {
    const form = connectionForms[site];
    const testResult = testResults[site];

    if (!form || !testResult?.success) return;

    const newConnection: SpokeConnection = {
      id: `spoke_${Date.now()}`,
      name: site,
      supabase_url: form.supabaseUrl,
      supabase_key: form.apiKey,
      tables: [{
        id: `table_${Date.now()}`,
        table_type: 'customers',
        table_name: form.tableName,
        field_mapping: {},
        enabled: true
      }],
      status: 'active',
      last_tested_at: new Date().toISOString(),
      created_at: new Date().toISOString()
    };

    // Remove any existing connection for this site, then add new one
    const filtered = spokeConnections.filter(c => c.name !== site);
    onSpokeConnectionsChange([...filtered, newConnection]);

    // Update profile count
    if (testResult.profileCount !== undefined) {
      setProfileCounts(prev => ({ ...prev, [site]: testResult.profileCount! }));
    }

    // Collapse form
    setExpandedSite(null);
  };

  const handleDisconnect = (site: string) => {
    const updated = spokeConnections.map(conn =>
      conn.name === site ? { ...conn, status: 'disconnected' as const } : conn
    );
    onSpokeConnectionsChange(updated);
  };

  const handleRetest = async (connection: SpokeConnection) => {
    setIsTesting(prev => ({ ...prev, [connection.name]: true }));

    try {
      const client = createClient(connection.supabase_url, connection.supabase_key);
      const customerTable = connection.tables.find(t => t.table_type === 'customers');
      const tableName = customerTable?.table_name || 'profiles';

      const { count, error } = await client
        .from(tableName)
        .select('id', { count: 'exact', head: true });

      if (error) {
        // Update connection to error status
        const updated = spokeConnections.map(c =>
          c.id === connection.id ? { ...c, status: 'error' as const, last_error: error.message, last_tested_at: new Date().toISOString() } : c
        );
        onSpokeConnectionsChange(updated);
      } else {
        // Update to active and refresh count
        const updated = spokeConnections.map(c =>
          c.id === connection.id ? { ...c, status: 'active' as const, last_error: undefined, last_tested_at: new Date().toISOString() } : c
        );
        onSpokeConnectionsChange(updated);
        if (count !== null) {
          setProfileCounts(prev => ({ ...prev, [connection.name]: count }));
        }
      }
    } catch (err: any) {
      const updated = spokeConnections.map(c =>
        c.id === connection.id ? { ...c, status: 'error' as const, last_error: err.message, last_tested_at: new Date().toISOString() } : c
      );
      onSpokeConnectionsChange(updated);
    } finally {
      setIsTesting(prev => ({ ...prev, [connection.name]: false }));
    }
  };

  const formatTimestamp = (ts?: string) => {
    if (!ts) return 'Never';
    const date = new Date(ts);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-yale-blue flex items-center gap-3">
            <Globe className="w-7 h-7 text-emerald-600" />
            Branch Network
          </h1>
          <p className="text-slate-500 mt-1 text-sm">Connect and manage your spoke databases</p>
        </div>
        <div className="px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-xl">
          <span className="text-sm font-bold text-emerald-700">
            {connectedCount} of {SITES_LIST.length} Connected
          </span>
        </div>
      </div>

      {/* Branch Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {SITES_LIST.map(site => {
          const connection = getConnectionForSite(site);
          const isConnected = !!connection;
          const isExpanded = expandedSite === site;
          const form = connectionForms[site];
          const testResult = testResults[site];
          const testing = isTesting[site];

          return (
            <div key={site} className="flex flex-col">
              {/* Card */}
              <div
                className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${
                  isConnected
                    ? 'border-l-4 border-l-emerald-500 border-slate-200'
                    : 'border-l-4 border-l-slate-200 border-slate-200'
                }`}
              >
                <div className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        isConnected ? 'bg-emerald-100' : 'bg-slate-100'
                      }`}>
                        <Database className={`w-5 h-5 ${isConnected ? 'text-emerald-600' : 'text-slate-400'}`} />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-800">{site}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                          <span className={`text-xs font-medium ${isConnected ? 'text-emerald-600' : 'text-slate-400'}`}>
                            {isConnected ? 'Connected' : 'Not Connected'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Connected State Details */}
                  {isConnected && connection && (
                    <div className="mt-4 space-y-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">Profiles</span>
                        <span className="font-bold text-slate-800">
                          {isLoadingCounts[site] ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            profileCounts[site]?.toLocaleString() ?? '—'
                          )}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">Table</span>
                        <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-xs font-mono">
                          {connection.tables.find(t => t.table_type === 'customers')?.table_name || 'profiles'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">Last Tested</span>
                        <span className="text-slate-600 text-xs">{formatTimestamp(connection.last_tested_at)}</span>
                      </div>

                      {/* Connected Actions */}
                      <div className="flex items-center gap-2 pt-2">
                        <button
                          onClick={() => handleRetest(connection)}
                          disabled={testing}
                          className="flex-1 px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                          {testing ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RefreshCw className="w-4 h-4" />
                          )}
                          Test
                        </button>
                        <button
                          onClick={() => handleDisconnect(site)}
                          className="flex-1 px-3 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 text-sm font-bold transition-colors flex items-center justify-center gap-2"
                        >
                          <Unplug className="w-4 h-4" />
                          Disconnect
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Not Connected - Connect Button */}
                  {!isConnected && !isExpanded && (
                    <div className="mt-4">
                      <button
                        onClick={() => handleExpandSite(site)}
                        className="w-full px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold transition-colors"
                      >
                        Connect
                      </button>
                    </div>
                  )}
                </div>

                {/* Expanded Connection Form */}
                {isExpanded && !isConnected && (
                  <div className="border-t border-slate-100 bg-slate-50 p-5 space-y-4">
                    {/* Supabase URL */}
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                        Supabase URL
                      </label>
                      <input
                        type="text"
                        value={form?.supabaseUrl || ''}
                        onChange={(e) => updateForm(site, 'supabaseUrl', e.target.value)}
                        placeholder="https://xxxxx.supabase.co"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 font-mono text-sm"
                      />
                    </div>

                    {/* API Key */}
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                        API Key (anon)
                      </label>
                      <div className="relative">
                        <input
                          type={showApiKey[site] ? 'text' : 'password'}
                          value={form?.apiKey || ''}
                          onChange={(e) => updateForm(site, 'apiKey', e.target.value)}
                          placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                          className="w-full px-3 py-2 pr-10 bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 font-mono text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => setShowApiKey(prev => ({ ...prev, [site]: !prev[site] }))}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                        >
                          {showApiKey[site] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Table Name */}
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">
                        Table Name
                      </label>
                      <input
                        type="text"
                        value={form?.tableName || 'profiles'}
                        onChange={(e) => updateForm(site, 'tableName', e.target.value)}
                        placeholder="profiles"
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 font-mono text-sm"
                      />
                    </div>

                    {/* Test Result */}
                    {testResult && (
                      <div className={`p-3 rounded-xl flex items-center gap-2 ${
                        testResult.success
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-red-50 text-red-700 border border-red-200'
                      }`}>
                        {testResult.success ? (
                          <Check className="w-4 h-4 flex-shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        )}
                        <span className="text-sm font-medium">{testResult.message}</span>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex items-center gap-2 pt-2">
                      <button
                        onClick={() => setExpandedSite(null)}
                        className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-sm font-bold transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleTestConnection(site)}
                        disabled={testing || !form?.supabaseUrl || !form?.apiKey}
                        className="flex-1 px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-800 text-white text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {testing ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Testing...
                          </>
                        ) : (
                          'Test Connection'
                        )}
                      </button>
                      <button
                        onClick={() => handleSaveConnection(site)}
                        disabled={!testResult?.success}
                        className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Save & Activate
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
