import { useState, useEffect, useMemo } from 'react';
import {
  Globe, Database, Users, DollarSign, ShoppingCart, TrendingUp, RefreshCw,
  Unplug, PlugZap, Loader2, Settings2, AlertTriangle, AlertCircle,
  Package, Layers, CreditCard, Link2, Unlink, Palette, Type, Mail,
  Building2, ExternalLink, Plus, X, ArrowLeft, Archive, ChevronDown,
  Crown, Repeat, Activity, Clock, Pause
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import { SpokeConnection, Branch, BrandIdentity, BranchStatsResult, MergedBranch } from '../types';
import { fetchAllBranches, createBranch, updateBranch, deleteBranch } from '../lib/supabaseService';
import { fetchAllBrands } from '../brandRepository';
import { mergeBranchData, linkConnectionToBranch, unlinkConnectionFromBranch } from '../services/branchLinker';
import { generateSnapshot, saveSnapshot } from '../services/branchSnapshotService';

const FONT_OPTIONS = ['Inter', 'Poppins', 'Roboto', 'System'];
const TONE_OPTIONS = ['friendly', 'professional', 'playful', 'authoritative'];

interface BranchCommandCenterProps {
  branchStats: BranchStatsResult;
  spokeConnections: SpokeConnection[];
  onSpokeConnectionsChange: (connections: SpokeConnection[]) => void;
}

export default function BranchCommandCenter({ branchStats, spokeConnections, onSpokeConnectionsChange }: BranchCommandCenterProps) {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [brands, setBrands] = useState<BrandIdentity[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(true);
  const [isTesting, setIsTesting] = useState<Record<string, boolean>>({});
  const [reconnectErrors, setReconnectErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Edit drawer state
  const [editingBranch, setEditingBranch] = useState<MergedBranch | null>(null);
  const [editedBranch, setEditedBranch] = useState<Partial<Branch>>({});
  const [isSaving, setIsSaving] = useState(false);

  // Create modal state
  const [isCreating, setIsCreating] = useState(false);
  const [newBranch, setNewBranch] = useState<Partial<Branch>>({
    type: 'external',
    primary_color: '#10b981',
    secondary_color: '#1e293b',
    accent_color: '#f59e0b',
    font_family: 'Inter',
    tone: 'friendly',
    is_active: true,
  });

  // Link dropdown state
  const [linkingCardId, setLinkingCardId] = useState<string | null>(null);

  useEffect(() => {
    loadBranchData();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  async function loadBranchData() {
    setIsLoadingBranches(true);
    try {
      const [branchData, brandData] = await Promise.all([
        fetchAllBranches(),
        fetchAllBrands(),
      ]);
      setBranches(branchData);
      setBrands(brandData);
    } catch (err) {
      console.error('Failed to load branch data:', err);
    } finally {
      setIsLoadingBranches(false);
    }
  }

  function showToast(message: string, type: 'success' | 'error') {
    setToast({ message, type });
  }

  // Merge all data sources
  const mergedBranches = useMemo(() =>
    mergeBranchData(spokeConnections, branches, brands, branchStats.spokeStats),
    [spokeConnections, branches, brands, branchStats.spokeStats]
  );

  // Connection management handlers (absorbed from Branches.tsx)
  const fireSnapshotForConnection = (connection: SpokeConnection) => {
    const customerTable = connection.tables.find(t => t.table_type === 'customers');
    const orderTables = connection.tables.filter(t => t.table_type === 'orders');
    generateSnapshot({
      id: connection.id,
      name: connection.name,
      supabase_url: connection.supabase_url,
      supabase_key: connection.supabase_key,
      tables: {
        customers: customerTable?.table_name,
        orders: orderTables.find(t => t.table_name === 'orders')?.table_name,
        legacy_orders: orderTables.find(t => t.table_name !== 'orders')?.table_name,
      },
    }, 'on_connect').then(snapshot => {
      saveSnapshot(snapshot);
      console.log('[branchSnapshot] Snapshot saved:', snapshot.branch_name,
        '| Profiles:', snapshot.total_profiles,
        '| Revenue: $' + snapshot.total_revenue);
    }).catch(err => {
      console.warn('[branchSnapshot] Snapshot generation failed (non-blocking):', err);
    });
  };

  const handleDisconnect = (connectionName: string) => {
    const updated = spokeConnections.map(conn =>
      conn.name === connectionName ? { ...conn, status: 'disconnected' as const } : conn
    );
    onSpokeConnectionsChange(updated);
  };

  const handleRetest = async (connection: SpokeConnection) => {
    setIsTesting(prev => ({ ...prev, [connection.id]: true }));
    try {
      const client = createClient(connection.supabase_url, connection.supabase_key);
      const customerTable = connection.tables.find(t => t.table_type === 'customers');
      const tableName = customerTable?.table_name || 'profiles';
      const { error } = await client.from(tableName).select('id', { count: 'exact', head: true });
      if (error) {
        const updated = spokeConnections.map(c =>
          c.id === connection.id ? { ...c, status: 'error' as const, last_error: error.message, last_tested_at: new Date().toISOString() } : c
        );
        onSpokeConnectionsChange(updated);
      } else {
        const updated = spokeConnections.map(c =>
          c.id === connection.id ? { ...c, status: 'active' as const, last_error: undefined, last_tested_at: new Date().toISOString() } : c
        );
        onSpokeConnectionsChange(updated);
        // Fire-and-forget snapshot on successful retest
        fireSnapshotForConnection(connection);
      }
    } catch (err: any) {
      const updated = spokeConnections.map(c =>
        c.id === connection.id ? { ...c, status: 'error' as const, last_error: err.message, last_tested_at: new Date().toISOString() } : c
      );
      onSpokeConnectionsChange(updated);
    } finally {
      setIsTesting(prev => ({ ...prev, [connection.id]: false }));
    }
  };

  const handleReconnect = async (connection: SpokeConnection) => {
    setIsTesting(prev => ({ ...prev, [connection.id]: true }));
    setReconnectErrors(prev => { const u = { ...prev }; delete u[connection.id]; return u; });
    try {
      const client = createClient(connection.supabase_url, connection.supabase_key);
      const customerTable = connection.tables.find(t => t.table_type === 'customers');
      const tableName = customerTable?.table_name || 'profiles';
      const { error } = await client.from(tableName).select('id', { count: 'exact', head: true });
      if (error) {
        setReconnectErrors(prev => ({ ...prev, [connection.id]: error.message }));
      } else {
        const updated = spokeConnections.map(c =>
          c.id === connection.id ? { ...c, status: 'active' as const, last_error: undefined, last_tested_at: new Date().toISOString() } : c
        );
        onSpokeConnectionsChange(updated);
        // Fire-and-forget snapshot on successful reconnect
        fireSnapshotForConnection(connection);
      }
    } catch (err: any) {
      setReconnectErrors(prev => ({ ...prev, [connection.id]: err.message || 'Reconnection failed' }));
    } finally {
      setIsTesting(prev => ({ ...prev, [connection.id]: false }));
    }
  };

  const handleForgetConnection = (connectionName: string) => {
    const filtered = spokeConnections.filter(c => c.name !== connectionName);
    onSpokeConnectionsChange(filtered);
  };

  // Link/unlink handlers
  const handleLinkBranch = async (branchId: string, spokeConnectionId: string) => {
    try {
      await linkConnectionToBranch(branchId, spokeConnectionId);
      await loadBranchData();
      setLinkingCardId(null);
      showToast('Branch linked to connection', 'success');
    } catch (err) {
      showToast('Failed to link branch', 'error');
    }
  };

  const handleUnlink = async (branchId: string) => {
    try {
      await unlinkConnectionFromBranch(branchId);
      await loadBranchData();
      showToast('Branch unlinked', 'success');
    } catch (err) {
      showToast('Failed to unlink branch', 'error');
    }
  };

  // Edit drawer handlers
  const openEditDrawer = (mb: MergedBranch) => {
    setEditingBranch(mb);
    if (mb.branch) {
      setEditedBranch({ ...mb.branch });
    } else {
      setEditedBranch({
        name: mb.name,
        primary_color: mb.primaryColor,
        secondary_color: mb.secondaryColor,
        accent_color: mb.accentColor,
        type: mb.type || 'external',
        font_family: 'Inter',
        tone: 'friendly',
        is_active: true,
      });
    }
  };

  const handleSaveEdit = async () => {
    if (!editingBranch?.branchId) return;
    setIsSaving(true);
    try {
      await updateBranch(editingBranch.branchId, editedBranch);
      showToast('Branch updated', 'success');
      await loadBranchData();
      setEditingBranch(null);
    } catch (err) {
      showToast('Failed to update branch', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchiveBranch = async () => {
    if (!editingBranch?.branchId) return;
    if (!confirm(`Archive "${editingBranch.name}"? This will deactivate the branch.`)) return;
    setIsSaving(true);
    try {
      await deleteBranch(editingBranch.branchId);
      showToast('Branch archived', 'success');
      setEditingBranch(null);
      await loadBranchData();
    } catch (err) {
      showToast('Failed to archive branch', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateBranch = async (spokeConnectionId?: string) => {
    if (!newBranch.name?.trim()) {
      showToast('Branch name is required', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const created = await createBranch({
        ...newBranch,
        spoke_connection_id: spokeConnectionId || null,
      });
      showToast('Branch created', 'success');
      setIsCreating(false);
      setNewBranch({ type: 'external', primary_color: '#10b981', secondary_color: '#1e293b', accent_color: '#f59e0b', font_family: 'Inter', tone: 'friendly', is_active: true });
      await loadBranchData();
    } catch (err) {
      showToast('Failed to create branch', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const formatTimestamp = (ts?: string) => {
    if (!ts) return 'Never';
    const date = new Date(ts);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatCurrency = (n: number) => '$' + n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const formatPct = (n: number, total: number) => total > 0 ? Math.round((n / total) * 100) + '%' : '0%';

  const activeCount = spokeConnections.filter(c => c.status === 'active').length;

  // Unlinked items for dropdowns
  const unlinkedBranches = branches.filter(b => !b.spoke_connection_id && b.is_active);
  const unlinkedConnections = spokeConnections.filter(c => !mergedBranches.some(mb => mb.spokeConnectionId === c.id && mb.linkStatus === 'linked'));

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-6 py-3 rounded-2xl shadow-lg ${
          toast.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
        }`}>
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-yale-blue flex items-center gap-3">
            <Globe className="w-7 h-7 text-emerald-600" />
            Branch Command Center
          </h1>
          <p className="text-slate-500 mt-1 text-sm">Connection health, performance, and brand identity across your ecosystem</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => branchStats.refresh()}
            disabled={branchStats.isLoading}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            {branchStats.isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Refresh
          </button>
          <button
            onClick={() => setIsCreating(true)}
            className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Branch
          </button>
        </div>
      </div>

      {/* Global KPI Bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-emerald-600" />
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Total Profiles</span>
          </div>
          <p className="text-2xl font-black text-slate-800">{branchStats.totals.profiles.toLocaleString()}</p>
          <p className="text-xs text-slate-400 mt-0.5">{branchStats.totals.profilesWithOrders.toLocaleString()} with orders</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-emerald-600" />
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Total Revenue</span>
          </div>
          <p className="text-2xl font-black text-slate-800">{formatCurrency(branchStats.totals.revenue)}</p>
          <p className="text-xs text-slate-400 mt-0.5">AOV: {formatCurrency(branchStats.totals.avgOrderValue)}</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <ShoppingCart className="w-4 h-4 text-blue-600" />
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Total Orders</span>
          </div>
          <p className="text-2xl font-black text-slate-800">{branchStats.totals.orders.toLocaleString()}</p>
          <p className="text-xs text-slate-400 mt-0.5">{branchStats.totals.repeatBuyers.toLocaleString()} repeat buyers</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-purple-600" />
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Avg LTV</span>
          </div>
          <p className="text-2xl font-black text-slate-800">{formatCurrency(branchStats.totals.avgLTV)}</p>
          <p className="text-xs text-slate-400 mt-0.5">{branchStats.totals.vipCount.toLocaleString()} VIP ($50+)</p>
        </div>
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <Activity className="w-4 h-4 text-amber-600" />
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Connections</span>
          </div>
          <p className="text-2xl font-black text-slate-800">{activeCount} <span className="text-sm font-bold text-slate-400">/ {spokeConnections.length}</span></p>
          <p className="text-xs text-slate-400 mt-0.5">{branchStats.totals.activeIn90Days.toLocaleString()} active 90d</p>
        </div>
      </div>

      {/* Loading indicator */}
      {(branchStats.isLoading || isLoadingBranches) && (
        <div className="flex items-center justify-center gap-2 py-4">
          <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
          <span className="text-sm text-slate-500 font-medium">Syncing branch data...</span>
        </div>
      )}

      {/* Empty State */}
      {mergedBranches.length === 0 && !branchStats.isLoading && !isLoadingBranches && (
        <div className="bg-white rounded-[2.5rem] p-12 text-center border border-slate-200 shadow-sm">
          <Database className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-slate-800 mb-2">No branches or connections yet</h3>
          <p className="text-slate-500 mb-6">Set up a connection in Settings or create a branch to get started.</p>
          <button
            onClick={() => setIsCreating(true)}
            className="px-6 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold transition-colors inline-flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Create Branch
          </button>
        </div>
      )}

      {/* Branch Cards Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {mergedBranches.map((mb) => {
          const conn = mb.connection;
          const stats = mb.stats;
          const isActive = conn?.status === 'active';
          const isError = conn?.status === 'error';
          const isDisconnected = conn?.status === 'disconnected';
          const testing = conn ? isTesting[conn.id] : false;
          const reconnectError = conn ? reconnectErrors[conn.id] : undefined;
          const cardKey = mb.spokeConnectionId || mb.branchId || mb.name;

          return (
            <div key={cardKey} className="bg-white rounded-2xl border border-slate-200 shadow-sm">
              {/* Card Header */}
              <div className="p-5 pb-0">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    {/* Brand color swatch / logo */}
                    <div
                      className="w-11 h-11 rounded-xl flex items-center justify-center text-white text-lg font-black shadow-sm flex-shrink-0"
                      style={{ backgroundColor: mb.primaryColor }}
                    >
                      {mb.logoUrl ? (
                        <img src={mb.logoUrl} alt="" className="w-full h-full object-contain rounded-xl" />
                      ) : (
                        mb.name.charAt(0)
                      )}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-black text-slate-800 truncate">{mb.name}</h3>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        {mb.slug && <span className="text-[10px] text-slate-400 font-mono">/{mb.slug}</span>}
                        {mb.type && (
                          <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${
                            mb.type === 'internal' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
                          }`}>{mb.type}</span>
                        )}
                        {mb.tone && (
                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{mb.tone}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Status dot */}
                  {conn && (
                    <div className="flex items-center gap-1.5">
                      <span className={`w-2.5 h-2.5 rounded-full ${isActive ? 'bg-emerald-500' : isError ? 'bg-rose-500' : 'bg-amber-400'}`} />
                      <span className={`text-[10px] font-bold ${isActive ? 'text-emerald-600' : isError ? 'text-rose-600' : 'text-amber-600'}`}>
                        {isActive ? 'Connected' : isError ? 'Error' : 'Disconnected'}
                      </span>
                    </div>
                  )}
                  {!conn && (
                    <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded">No Data</span>
                  )}
                </div>
              </div>

              {/* Connection section */}
              {conn && (isActive || isError) && (
                <div className="px-5 pt-3">
                  {/* Table badges */}
                  <div className="flex items-center flex-wrap gap-1.5 mb-2">
                    {(conn.tables || []).filter(t => t.enabled).map(table => (
                      <span key={table.id} className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded flex items-center gap-1 ${
                        table.table_type === 'customers' ? 'bg-emerald-100 text-emerald-700' :
                        table.table_type === 'orders' ? 'bg-blue-100 text-blue-700' :
                        table.table_type === 'order_items' ? 'bg-purple-100 text-purple-700' :
                        'bg-amber-100 text-amber-700'
                      }`}>
                        {table.table_type === 'customers' && <Users className="w-2.5 h-2.5" />}
                        {table.table_type === 'orders' && <Package className="w-2.5 h-2.5" />}
                        {table.table_type === 'order_items' && <Layers className="w-2.5 h-2.5" />}
                        {table.table_type === 'subscriptions' && <CreditCard className="w-2.5 h-2.5" />}
                        {table.table_type === 'order_items' ? 'items' : table.table_type}
                      </span>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-400 font-mono truncate">{conn.supabase_url}</p>
                  {conn.last_error && (
                    <div className="flex items-center gap-1.5 text-rose-500 mt-2">
                      <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                      <span className="text-[10px] font-bold truncate">{conn.last_error}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Stats section */}
              {stats && stats.profileCount > 0 && (
                <div className="px-5 pt-3">
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div className="bg-slate-50 rounded-xl p-2.5 text-center">
                      <p className="text-lg font-black text-slate-800">{stats.profileCount.toLocaleString()}</p>
                      <p className="text-[9px] font-bold uppercase text-slate-400">Profiles</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-2.5 text-center">
                      <p className="text-lg font-black text-emerald-700">{formatCurrency(stats.totalRevenue)}</p>
                      <p className="text-[9px] font-bold uppercase text-slate-400">Revenue</p>
                    </div>
                    <div className="bg-slate-50 rounded-xl p-2.5 text-center">
                      <p className="text-lg font-black text-blue-700">{stats.totalOrders.toLocaleString()}</p>
                      <p className="text-[9px] font-bold uppercase text-slate-400">Orders</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] font-bold text-slate-500 mb-2">
                    <span className="flex items-center gap-1"><Crown className="w-3 h-3 text-amber-500" />{stats.vipCount} VIP</span>
                    <span className="flex items-center gap-1"><DollarSign className="w-3 h-3" />AOV {formatCurrency(stats.avgOrderValue)}</span>
                    <span className="flex items-center gap-1"><Repeat className="w-3 h-3" />{formatPct(stats.repeatBuyerCount, stats.profilesWithOrders)} repeat</span>
                  </div>

                  {/* Gender distribution bar */}
                  {stats.profileCount > 0 && (
                    <div className="mb-2">
                      <div className="flex h-2 rounded-full overflow-hidden bg-slate-100">
                        {stats.genderDistribution.male > 0 && (
                          <div className="bg-blue-400" style={{ width: `${(stats.genderDistribution.male / stats.profileCount) * 100}%` }} />
                        )}
                        {stats.genderDistribution.female > 0 && (
                          <div className="bg-pink-400" style={{ width: `${(stats.genderDistribution.female / stats.profileCount) * 100}%` }} />
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[9px] text-slate-400 font-bold">
                        <span>M {formatPct(stats.genderDistribution.male, stats.profileCount)}</span>
                        <span>F {formatPct(stats.genderDistribution.female, stats.profileCount)}</span>
                        <span>? {formatPct(stats.genderDistribution.unknown, stats.profileCount)}</span>
                      </div>
                    </div>
                  )}

                  {/* Top products */}
                  {stats.topProducts.length > 0 && (
                    <div className="mb-2">
                      <p className="text-[9px] font-black uppercase text-slate-400 mb-1">Top Products</p>
                      <div className="flex flex-wrap gap-1">
                        {stats.topProducts.slice(0, 3).map((p) => (
                          <span key={p.name} className="text-[9px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-medium truncate max-w-[150px]">
                            {p.name} ({formatCurrency(p.revenue)})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Brand color preview for branch-only cards */}
              {mb.linkStatus === 'branch-only' && mb.branch && (
                <div className="px-5 pt-3">
                  <div className="flex gap-1.5 mb-2">
                    <div className="flex-1 h-6 rounded-lg" style={{ backgroundColor: mb.primaryColor }} />
                    <div className="flex-1 h-6 rounded-lg" style={{ backgroundColor: mb.secondaryColor }} />
                    <div className="flex-1 h-6 rounded-lg" style={{ backgroundColor: mb.accentColor }} />
                  </div>
                  {mb.fontFamily && <p className="text-[10px] text-slate-400"><span className="font-bold">Font:</span> {mb.fontFamily}</p>}
                  {mb.brandIdentity && (
                    <p className="text-[10px] text-emerald-600 font-bold mt-1">Brand Identity: Active</p>
                  )}
                </div>
              )}

              {/* Link warnings */}
              {mb.linkStatus === 'connection-only' && mb.connection?.branch_skipped && (
                <div className="px-5 pt-3">
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-2">
                    <Pause className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="text-[10px] font-bold text-slate-500">Branch linking deferred — link when ready</span>
                  </div>
                </div>
              )}
              {mb.linkStatus === 'connection-only' && !mb.connection?.branch_skipped && (
                <div className="px-5 pt-3">
                  <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="text-[10px] font-bold text-amber-700">Legacy connection — no branch linked</span>
                      {mb.connection?.created_at && (
                        <p className="text-[9px] text-amber-500 mt-0.5">Created {formatTimestamp(mb.connection.created_at)}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
              {mb.linkStatus === 'branch-only' && (
                <div className="px-5 pt-3">
                  <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-2">
                    <Database className="w-4 h-4 text-slate-400 flex-shrink-0" />
                    <span className="text-[10px] font-bold text-slate-500">No data connection</span>
                  </div>
                </div>
              )}

              {/* Last tested */}
              {conn?.last_tested_at && (
                <div className="px-5 pt-2">
                  <div className="flex items-center gap-1 text-[10px] text-slate-400">
                    <Clock className="w-3 h-3" />
                    Last tested {formatTimestamp(conn.last_tested_at)}
                  </div>
                </div>
              )}

              {/* Reconnect error */}
              {reconnectError && (
                <div className="px-5 pt-2">
                  <div className="p-2.5 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
                    <span className="text-[10px] font-bold text-red-700">{reconnectError}</span>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="p-5 pt-3">
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Edit brand (if linked or branch-only) */}
                  {mb.branchId && (
                    <button
                      onClick={() => openEditDrawer(mb)}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold transition-colors flex items-center gap-1.5"
                    >
                      <Palette className="w-3.5 h-3.5" />
                      Edit Brand
                    </button>
                  )}

                  {/* Connection actions */}
                  {conn && isActive && (
                    <>
                      <button onClick={() => handleRetest(conn)} disabled={testing}
                        className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold transition-colors flex items-center gap-1.5 disabled:opacity-50">
                        {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                        Test
                      </button>
                      <button onClick={() => handleDisconnect(conn.name)}
                        className="px-3 py-1.5 rounded-lg bg-red-50 hover:bg-red-100 text-red-600 text-[11px] font-bold transition-colors flex items-center gap-1.5">
                        <Unplug className="w-3.5 h-3.5" />
                        Disconnect
                      </button>
                    </>
                  )}
                  {conn && isError && (
                    <button onClick={() => handleRetest(conn)} disabled={testing}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold transition-colors flex items-center gap-1.5 disabled:opacity-50">
                      {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      Retest
                    </button>
                  )}
                  {conn && isDisconnected && (
                    <>
                      <button onClick={() => handleReconnect(conn)} disabled={testing}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-bold transition-colors flex items-center gap-1.5 disabled:opacity-50">
                        {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlugZap className="w-3.5 h-3.5" />}
                        Reconnect
                      </button>
                      <button onClick={() => handleForgetConnection(conn.name)}
                        className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-bold transition-colors" title="Forget">
                        <Settings2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}

                  {/* Link/unlink */}
                  {mb.linkStatus === 'linked' && (
                    <button onClick={() => handleUnlink(mb.branchId!)}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 text-[11px] font-bold transition-colors flex items-center gap-1.5">
                      <Unlink className="w-3.5 h-3.5" />
                      Unlink
                    </button>
                  )}
                  {mb.linkStatus === 'connection-only' && (
                    <div className="relative">
                      <button onClick={() => setLinkingCardId(linkingCardId === cardKey ? null : cardKey)}
                        className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-bold transition-colors flex items-center gap-1.5">
                        <Link2 className="w-3.5 h-3.5" />
                        Link to Branch
                        <ChevronDown className="w-3 h-3" />
                      </button>
                      {linkingCardId === cardKey && (
                        <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 w-56 py-1 max-h-48 overflow-y-auto">
                          {unlinkedBranches.length === 0 ? (
                            <p className="px-3 py-2 text-xs text-slate-400">No unlinked branches</p>
                          ) : (
                            unlinkedBranches.map(b => (
                              <button key={b.id} onClick={() => handleLinkBranch(b.id, mb.spokeConnectionId!)}
                                className="w-full text-left px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                                <div className="w-3 h-3 rounded" style={{ backgroundColor: b.primary_color }} />
                                {b.name}
                              </button>
                            ))
                          )}
                          <div className="border-t border-slate-100 mt-1 pt-1">
                            <button onClick={() => { setLinkingCardId(null); setIsCreating(true); }}
                              className="w-full text-left px-3 py-2 text-sm font-bold text-emerald-600 hover:bg-emerald-50 flex items-center gap-2">
                              <Plus className="w-3.5 h-3.5" />
                              Create New Branch
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {mb.linkStatus === 'branch-only' && (
                    <div className="relative">
                      <button onClick={() => setLinkingCardId(linkingCardId === cardKey ? null : cardKey)}
                        className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-bold transition-colors flex items-center gap-1.5">
                        <Link2 className="w-3.5 h-3.5" />
                        Link Connection
                        <ChevronDown className="w-3 h-3" />
                      </button>
                      {linkingCardId === cardKey && (
                        <div className="absolute top-full left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-20 w-56 py-1 max-h-48 overflow-y-auto">
                          {unlinkedConnections.length === 0 ? (
                            <p className="px-3 py-2 text-xs text-slate-400">No unlinked connections</p>
                          ) : (
                            unlinkedConnections.map(c => (
                              <button key={c.id} onClick={() => handleLinkBranch(mb.branchId!, c.id)}
                                className="w-full text-left px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2">
                                <span className={`w-2.5 h-2.5 rounded-full ${c.status === 'active' ? 'bg-emerald-500' : c.status === 'error' ? 'bg-rose-500' : 'bg-amber-400'}`} />
                                {c.name}
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Edit Brand Drawer */}
      {editingBranch && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/30" onClick={() => setEditingBranch(null)} />
          <div className="absolute right-0 top-0 bottom-0 w-full max-w-xl bg-white shadow-2xl overflow-y-auto">
            <div className="p-6 space-y-6">
              {/* Drawer Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button onClick={() => setEditingBranch(null)} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 transition-colors">
                    <ArrowLeft className="w-5 h-5 text-slate-600" />
                  </button>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black shadow-sm"
                    style={{ backgroundColor: editedBranch.primary_color || '#10b981' }}>
                    {editedBranch.name?.charAt(0) || 'B'}
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-slate-800">Edit Branch</h2>
                    <p className="text-sm text-slate-500">{editingBranch.name}</p>
                  </div>
                </div>
                <button onClick={() => setEditingBranch(null)} className="p-2 text-slate-400 hover:text-slate-600">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Basic Info */}
              <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200">
                <h3 className="text-[10px] font-black text-slate-400 mb-4 flex items-center gap-2 uppercase tracking-widest">
                  <Building2 className="w-4 h-4" /> Basic Information
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Name</label>
                    <input type="text" value={editedBranch.name || ''} onChange={(e) => setEditedBranch({ ...editedBranch, name: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-800 font-bold focus:outline-none focus:border-emerald-500" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Slug</label>
                    <input type="text" value={editedBranch.slug || ''} onChange={(e) => setEditedBranch({ ...editedBranch, slug: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-800 font-mono focus:outline-none focus:border-emerald-500" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Type</label>
                    <select value={editedBranch.type || 'external'} onChange={(e) => setEditedBranch({ ...editedBranch, type: e.target.value as 'internal' | 'external' })}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-800 font-bold focus:outline-none focus:border-emerald-500">
                      <option value="internal">Internal</option>
                      <option value="external">External</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Tagline</label>
                    <input type="text" value={editedBranch.tagline || ''} onChange={(e) => setEditedBranch({ ...editedBranch, tagline: e.target.value })}
                      placeholder="Your catchy tagline..." className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Logo URL</label>
                    <input type="url" value={editedBranch.logo_url || ''} onChange={(e) => setEditedBranch({ ...editedBranch, logo_url: e.target.value })}
                      placeholder="https://..." className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 font-mono text-sm focus:outline-none focus:border-emerald-500" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Website URL</label>
                    <input type="url" value={editedBranch.website_url || ''} onChange={(e) => setEditedBranch({ ...editedBranch, website_url: e.target.value })}
                      placeholder="https://..." className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 font-mono text-sm focus:outline-none focus:border-emerald-500" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Description</label>
                    <textarea value={editedBranch.description || ''} onChange={(e) => setEditedBranch({ ...editedBranch, description: e.target.value })}
                      placeholder="Describe this branch..." rows={3}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 resize-none" />
                  </div>
                </div>
              </div>

              {/* Colors */}
              <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200">
                <h3 className="text-[10px] font-black text-slate-400 mb-4 flex items-center gap-2 uppercase tracking-widest">
                  <Palette className="w-4 h-4" /> Brand Colors
                </h3>
                <div className="grid grid-cols-3 gap-4 mb-3">
                  {(['primary_color', 'secondary_color', 'accent_color'] as const).map(field => (
                    <div key={field}>
                      <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">{field.replace('_color', '')}</label>
                      <div className="flex items-center gap-2">
                        <input type="color" value={(editedBranch as any)[field] || '#10b981'}
                          onChange={(e) => setEditedBranch({ ...editedBranch, [field]: e.target.value })}
                          className="w-10 h-10 rounded-lg cursor-pointer border border-slate-200" />
                        <input type="text" value={(editedBranch as any)[field] || ''}
                          onChange={(e) => setEditedBranch({ ...editedBranch, [field]: e.target.value })}
                          className="flex-1 px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-800 text-sm font-mono focus:outline-none focus:border-emerald-500" />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <div className="flex-1 h-8 rounded-lg shadow-inner" style={{ backgroundColor: editedBranch.primary_color || '#10b981' }} />
                  <div className="flex-1 h-8 rounded-lg shadow-inner" style={{ backgroundColor: editedBranch.secondary_color || '#1e293b' }} />
                  <div className="flex-1 h-8 rounded-lg shadow-inner" style={{ backgroundColor: editedBranch.accent_color || '#f59e0b' }} />
                </div>
              </div>

              {/* Typography & Voice */}
              <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200">
                <h3 className="text-[10px] font-black text-slate-400 mb-4 flex items-center gap-2 uppercase tracking-widest">
                  <Type className="w-4 h-4" /> Typography & Voice
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Font Family</label>
                    <select value={editedBranch.font_family || 'Inter'} onChange={(e) => setEditedBranch({ ...editedBranch, font_family: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-800 font-bold focus:outline-none focus:border-emerald-500">
                      {FONT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Tone</label>
                    <select value={editedBranch.tone || 'friendly'} onChange={(e) => setEditedBranch({ ...editedBranch, tone: e.target.value })}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-800 font-bold focus:outline-none focus:border-emerald-500">
                      {TONE_OPTIONS.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Brand Keywords</label>
                    <input type="text" value={(editedBranch.brand_keywords || []).join(', ')}
                      onChange={(e) => setEditedBranch({ ...editedBranch, brand_keywords: e.target.value.split(',').map(k => k.trim()).filter(Boolean) })}
                      placeholder="innovative, sustainable, premium..."
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500" />
                    <p className="mt-1 text-xs text-slate-400">Comma-separated keywords</p>
                  </div>
                </div>
              </div>

              {/* Email Settings */}
              <div className="bg-slate-50 rounded-2xl p-5 border border-slate-200">
                <h3 className="text-[10px] font-black text-slate-400 mb-4 flex items-center gap-2 uppercase tracking-widest">
                  <Mail className="w-4 h-4" /> Email Settings
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Contact Email</label>
                    <input type="email" value={editedBranch.contact_email || ''} onChange={(e) => setEditedBranch({ ...editedBranch, contact_email: e.target.value })}
                      placeholder="contact@example.com" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 font-mono text-sm focus:outline-none focus:border-emerald-500" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Default From Name</label>
                    <input type="text" value={editedBranch.default_from_name || ''} onChange={(e) => setEditedBranch({ ...editedBranch, default_from_name: e.target.value })}
                      placeholder="Your Brand Name" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Default Reply-To</label>
                    <input type="email" value={editedBranch.default_reply_to || ''} onChange={(e) => setEditedBranch({ ...editedBranch, default_reply_to: e.target.value })}
                      placeholder="reply@example.com" className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 font-mono text-sm focus:outline-none focus:border-emerald-500" />
                  </div>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-200 sticky bottom-0 bg-white pb-6">
                <button onClick={handleArchiveBranch} disabled={isSaving}
                  className="px-4 py-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2 disabled:opacity-50 text-sm font-bold">
                  <Archive className="w-4 h-4" /> Archive
                </button>
                <button onClick={handleSaveEdit} disabled={isSaving}
                  className="px-6 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold transition-colors disabled:opacity-50 flex items-center gap-2">
                  {isSaving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Branch Modal */}
      {isCreating && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[2rem] p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-3 uppercase tracking-tight">
              <Plus className="w-6 h-6 text-emerald-500" />
              Create Branch
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Name <span className="text-red-500">*</span></label>
                <input type="text" value={newBranch.name || ''} onChange={(e) => setNewBranch({ ...newBranch, name: e.target.value })}
                  placeholder="My Branch" className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold" />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Type</label>
                <select value={newBranch.type || 'external'} onChange={(e) => setNewBranch({ ...newBranch, type: e.target.value as 'internal' | 'external' })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold">
                  <option value="internal">Internal</option>
                  <option value="external">External</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Tagline</label>
                <input type="text" value={newBranch.tagline || ''} onChange={(e) => setNewBranch({ ...newBranch, tagline: e.target.value })}
                  placeholder="Your catchy tagline..." className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Primary Color</label>
                <div className="flex items-center gap-3">
                  <input type="color" value={newBranch.primary_color || '#10b981'} onChange={(e) => setNewBranch({ ...newBranch, primary_color: e.target.value })}
                    className="w-12 h-12 rounded-xl cursor-pointer border border-slate-200" />
                  <input type="text" value={newBranch.primary_color || '#10b981'} onChange={(e) => setNewBranch({ ...newBranch, primary_color: e.target.value })}
                    className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-8">
              <button onClick={() => setIsCreating(false)} className="px-6 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors font-bold">Cancel</button>
              <button onClick={() => handleCreateBranch()} disabled={isSaving || !newBranch.name?.trim()}
                className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold transition-colors disabled:opacity-50 flex items-center gap-2">
                {isSaving ? 'Creating...' : 'Create Branch'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
