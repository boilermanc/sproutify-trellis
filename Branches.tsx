import { useState, useEffect } from 'react';
import { Globe, Database, AlertCircle, RefreshCw, Unplug, Loader2, PlugZap, Settings2, Users, Package, Layers, CreditCard, AlertTriangle, Settings } from 'lucide-react';
import { SpokeConnection } from './types';
import { fetchEnrichedProfiles, getSpokeClient } from './spokeConnector';
import { generateSnapshot, saveSnapshot } from './services/branchSnapshotService';

interface BranchesProps {
  spokeConnections: SpokeConnection[];
  onSpokeConnectionsChange: (connections: SpokeConnection[]) => void;
}

export default function Branches({ spokeConnections, onSpokeConnectionsChange }: BranchesProps) {
  const [isTesting, setIsTesting] = useState<Record<string, boolean>>({});
  const [profileCounts, setProfileCounts] = useState<Record<string, number>>({});
  const [isLoadingCounts, setIsLoadingCounts] = useState<Record<string, boolean>>({});
  const [reconnectErrors, setReconnectErrors] = useState<Record<string, string>>({});

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

  const activeCount = spokeConnections.filter(c => c.status === 'active').length;

  const fireSnapshotForConnection = (connection: SpokeConnection) => {
    generateSnapshot(connection.id, 'on_connect').then(snapshot => {
      saveSnapshot(snapshot);
      console.log('[branchSnapshot] Snapshot saved:', snapshot.branch_name,
        '| Profiles:', snapshot.total_profiles,
        '| Revenue: $' + snapshot.total_revenue);
    }).catch(err => {
      console.warn('[branchSnapshot] Snapshot generation failed (non-blocking):', err);
    });
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
      const client = getSpokeClient(connection.supabase_url, connection.supabase_key);
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
        // Fire-and-forget snapshot on successful retest
        fireSnapshotForConnection(connection);
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

  const handleReconnect = async (connection: SpokeConnection) => {
    setIsTesting(prev => ({ ...prev, [connection.name]: true }));
    setReconnectErrors(prev => {
      const updated = { ...prev };
      delete updated[connection.name];
      return updated;
    });

    try {
      const client = getSpokeClient(connection.supabase_url, connection.supabase_key);
      const customerTable = connection.tables.find(t => t.table_type === 'customers');
      const tableName = customerTable?.table_name || 'profiles';

      const { count, error } = await client
        .from(tableName)
        .select('id', { count: 'exact', head: true });

      if (error) {
        setReconnectErrors(prev => ({ ...prev, [connection.name]: error.message }));
      } else {
        // Reactivate the connection
        const updated = spokeConnections.map(c =>
          c.id === connection.id ? { ...c, status: 'active' as const, last_error: undefined, last_tested_at: new Date().toISOString() } : c
        );
        onSpokeConnectionsChange(updated);
        if (count !== null) {
          setProfileCounts(prev => ({ ...prev, [connection.name]: count }));
        }
        // Fire-and-forget snapshot on successful reconnect
        fireSnapshotForConnection(connection);
      }
    } catch (err: any) {
      setReconnectErrors(prev => ({ ...prev, [connection.name]: err.message || 'Reconnection failed' }));
    } finally {
      setIsTesting(prev => ({ ...prev, [connection.name]: false }));
    }
  };

  const handleForgetConnection = (site: string) => {
    const filtered = spokeConnections.filter(c => c.name !== site);
    onSpokeConnectionsChange(filtered);
    setReconnectErrors(prev => {
      const updated = { ...prev };
      delete updated[site];
      return updated;
    });
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
          <p className="text-slate-500 mt-1 text-sm">Manage and reconnect your spoke databases</p>
        </div>
        <div className="px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-xl">
          <span className="text-sm font-bold text-emerald-700">
            {activeCount} of {spokeConnections.length} Active
          </span>
        </div>
      </div>

      {/* Empty State */}
      {spokeConnections.length === 0 && (
        <div className="bg-white rounded-[2.5rem] p-12 text-center border border-slate-200 shadow-sm">
          <Database className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-slate-800 mb-2">No connections yet</h3>
          <p className="text-slate-500 mb-6">Set up your first data connection in Settings to get started.</p>
          <div className="flex items-center justify-center gap-2 text-sm text-slate-400">
            <Settings className="w-4 h-4" />
            <span>Settings → Connections → Add Connection</span>
          </div>
        </div>
      )}

      {/* Connection Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {spokeConnections.map(connection => {
          const isActive = connection.status === 'active';
          const isDisconnected = connection.status === 'disconnected';
          const isError = connection.status === 'error';
          const testing = isTesting[connection.name];
          const reconnectError = reconnectErrors[connection.name];

          return (
            <div key={connection.id} className="flex flex-col">
              {/* Card */}
              <div
                className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${
                  isActive
                    ? 'border-l-4 border-l-emerald-500 border-slate-200'
                    : isError
                    ? 'border-l-4 border-l-rose-400 border-slate-200'
                    : isDisconnected
                    ? 'border-l-4 border-l-amber-400 border-slate-200'
                    : 'border-l-4 border-l-slate-200 border-slate-200'
                }`}
              >
                <div className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        isActive ? 'bg-emerald-100' : isError ? 'bg-rose-50' : isDisconnected ? 'bg-amber-50' : 'bg-slate-100'
                      }`}>
                        <Database className={`w-5 h-5 ${isActive ? 'text-emerald-600' : isError ? 'text-rose-500' : isDisconnected ? 'text-amber-500' : 'text-slate-400'}`} />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-800">{connection.name}</h3>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-500' : isError ? 'bg-rose-500' : isDisconnected ? 'bg-amber-400' : 'bg-slate-300'}`} />
                          <span className={`text-xs font-medium ${isActive ? 'text-emerald-600' : isError ? 'text-rose-600' : isDisconnected ? 'text-amber-600' : 'text-slate-400'}`}>
                            {isActive ? 'Connected' : isError ? 'Error' : isDisconnected ? 'Saved — Disconnected' : 'Unknown'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Connection Details (active + error states) */}
                  {(isActive || isError) && (
                    <div className="mt-4 space-y-3">
                      {/* Table type badges */}
                      <div className="flex items-center flex-wrap gap-1.5">
                        {(connection.tables || []).filter(t => t.enabled).map((table) => (
                          <span
                            key={table.id}
                            className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded flex items-center gap-1 ${
                              table.table_type === 'customers'
                                ? 'bg-emerald-100 text-emerald-700'
                                : table.table_type === 'orders'
                                ? 'bg-blue-100 text-blue-700'
                                : table.table_type === 'order_items'
                                ? 'bg-purple-100 text-purple-700'
                                : table.table_type === 'subscriptions'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {table.table_type === 'customers' && <Users className="w-2.5 h-2.5" />}
                            {table.table_type === 'orders' && <Package className="w-2.5 h-2.5" />}
                            {table.table_type === 'order_items' && <Layers className="w-2.5 h-2.5" />}
                            {table.table_type === 'subscriptions' && <CreditCard className="w-2.5 h-2.5" />}
                            <span>{table.table_type === 'order_items' ? 'items' : table.table_type}</span>
                            <span className="opacity-60 font-mono">{table.table_name}</span>
                            <span className="opacity-60">{Object.values(table.field_mapping).filter(Boolean).length}f</span>
                          </span>
                        ))}
                        {(!connection.tables || connection.tables.length === 0) && (
                          <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-700 flex items-center gap-1">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            <span>Needs reconfiguration</span>
                          </span>
                        )}
                      </div>

                      {/* URL */}
                      <p className="text-[11px] text-slate-400 font-mono truncate">{connection.supabase_url}</p>

                      {/* Stats row */}
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">Profiles</span>
                        <span className="font-bold text-slate-800">
                          {isLoadingCounts[connection.name] ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            profileCounts[connection.name]?.toLocaleString() ?? '—'
                          )}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">Last Tested</span>
                        <span className="text-slate-600 text-xs">{formatTimestamp(connection.last_tested_at)}</span>
                      </div>

                      {/* Error display */}
                      {connection.last_error && (
                        <div className="flex items-center gap-1.5 text-rose-500">
                          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                          <span className="text-[10px] font-bold truncate">{connection.last_error}</span>
                        </div>
                      )}

                      {/* Actions */}
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
                          onClick={() => handleDisconnect(connection.name)}
                          className="flex-1 px-3 py-2 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 text-sm font-bold transition-colors flex items-center justify-center gap-2"
                        >
                          <Unplug className="w-4 h-4" />
                          Disconnect
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Disconnected - Quick Reconnect */}
                  {isDisconnected && (
                    <div className="mt-4 space-y-3">
                      {/* Table type badges */}
                      <div className="flex items-center flex-wrap gap-1.5">
                        {(connection.tables || []).filter(t => t.enabled).map((table) => (
                          <span
                            key={table.id}
                            className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded flex items-center gap-1 opacity-70 ${
                              table.table_type === 'customers'
                                ? 'bg-emerald-100 text-emerald-700'
                                : table.table_type === 'orders'
                                ? 'bg-blue-100 text-blue-700'
                                : table.table_type === 'order_items'
                                ? 'bg-purple-100 text-purple-700'
                                : table.table_type === 'subscriptions'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {table.table_type === 'customers' && <Users className="w-2.5 h-2.5" />}
                            {table.table_type === 'orders' && <Package className="w-2.5 h-2.5" />}
                            {table.table_type === 'order_items' && <Layers className="w-2.5 h-2.5" />}
                            {table.table_type === 'subscriptions' && <CreditCard className="w-2.5 h-2.5" />}
                            <span>{table.table_type === 'order_items' ? 'items' : table.table_type}</span>
                            <span className="opacity-60 font-mono">{table.table_name}</span>
                          </span>
                        ))}
                      </div>

                      {/* URL */}
                      <p className="text-[11px] text-slate-400 font-mono truncate">{connection.supabase_url}</p>

                      <div className="flex items-center justify-between text-sm">
                        <span className="text-slate-500">Last Connected</span>
                        <span className="text-slate-600 text-xs">{formatTimestamp(connection.last_tested_at)}</span>
                      </div>

                      {/* Reconnect Error */}
                      {reconnectError && (
                        <div className="p-3 rounded-xl flex items-center gap-2 bg-red-50 text-red-700 border border-red-200">
                          <AlertCircle className="w-4 h-4 flex-shrink-0" />
                          <span className="text-sm font-medium">{reconnectError}</span>
                        </div>
                      )}

                      {/* Reconnect Actions */}
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          onClick={() => handleReconnect(connection)}
                          disabled={testing}
                          className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                          {testing ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Reconnecting...
                            </>
                          ) : (
                            <>
                              <PlugZap className="w-4 h-4" />
                              Reconnect
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => handleForgetConnection(connection.name)}
                          className="px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-bold transition-colors flex items-center justify-center gap-2"
                          title="Forget saved credentials and connect fresh"
                        >
                          <Settings2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
