import React, { useState } from 'react';
import { SpokeConnection } from './types';
import { testSpokeConnection } from './spokeConnector';
import {
  Database,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Eye,
  EyeOff,
  Plug,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface ConnectionsManagerProps {
  connections: SpokeConnection[];
  onConnectionsChange: (connections: SpokeConnection[]) => void;
}

interface NewConnectionForm {
  name: string;
  supabase_url: string;
  supabase_key: string;
  table_name: string;
  field_mapping: {
    email: string;
    first_name: string;
    last_name: string;
    phone: string;
    subscribed: string;
    created_at: string;
  };
}

const initialFormState: NewConnectionForm = {
  name: '',
  supabase_url: '',
  supabase_key: '',
  table_name: 'profiles',
  field_mapping: {
    email: 'email',
    first_name: '',
    last_name: '',
    phone: '',
    subscribed: '',
    created_at: '',
  },
};

const ConnectionsManager: React.FC<ConnectionsManagerProps> = ({
  connections,
  onConnectionsChange,
}) => {
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [newConnection, setNewConnection] = useState<NewConnectionForm>(initialFormState);
  const [showFieldMapping, setShowFieldMapping] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [testingConnectionId, setTestingConnectionId] = useState<string | null>(null);

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    const result = await testSpokeConnection({
      supabase_url: newConnection.supabase_url,
      supabase_key: newConnection.supabase_key,
      table_name: newConnection.table_name,
    });

    if (result.success) {
      setTestResult({ success: true, message: `Connected! Found ${result.rowCount} records.` });
    } else {
      setTestResult({ success: false, message: result.error });
    }

    setIsTesting(false);
  };

  const handleTestExisting = async (connection: SpokeConnection) => {
    setTestingConnectionId(connection.id);

    const result = await testSpokeConnection({
      supabase_url: connection.supabase_url,
      supabase_key: connection.supabase_key,
      table_name: connection.table_name,
    });

    const updatedConnections = connections.map((c) => {
      if (c.id === connection.id) {
        return {
          ...c,
          status: result.success ? 'active' : 'error',
          last_tested_at: new Date().toISOString(),
          last_error: result.success ? undefined : result.error,
        } as SpokeConnection;
      }
      return c;
    });

    onConnectionsChange(updatedConnections);
    setTestingConnectionId(null);
  };

  const handleSaveConnection = () => {
    const connection: SpokeConnection = {
      id: crypto.randomUUID(),
      name: newConnection.name,
      supabase_url: newConnection.supabase_url,
      supabase_key: newConnection.supabase_key,
      table_name: newConnection.table_name,
      field_mapping: {
        email: newConnection.field_mapping.email,
        ...(newConnection.field_mapping.first_name && { first_name: newConnection.field_mapping.first_name }),
        ...(newConnection.field_mapping.last_name && { last_name: newConnection.field_mapping.last_name }),
        ...(newConnection.field_mapping.phone && { phone: newConnection.field_mapping.phone }),
        ...(newConnection.field_mapping.subscribed && { subscribed: newConnection.field_mapping.subscribed }),
        ...(newConnection.field_mapping.created_at && { created_at: newConnection.field_mapping.created_at }),
      },
      status: 'active',
      last_tested_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };

    onConnectionsChange([...connections, connection]);
    setNewConnection(initialFormState);
    setIsAddingNew(false);
    setTestResult(null);
    setShowFieldMapping(false);
  };

  const handleDeleteConnection = (id: string) => {
    onConnectionsChange(connections.filter((c) => c.id !== id));
    setDeleteConfirm(null);
  };

  const handleCancel = () => {
    setIsAddingNew(false);
    setNewConnection(initialFormState);
    setTestResult(null);
    setShowFieldMapping(false);
  };

  const toggleKeyVisibility = (id: string) => {
    setVisibleKeys((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const getStatusIndicator = (status: SpokeConnection['status']) => {
    switch (status) {
      case 'active':
        return <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />;
      case 'error':
        return <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />;
      case 'disconnected':
        return <span className="w-2.5 h-2.5 rounded-full bg-slate-400" />;
    }
  };

  const formatTimestamp = (timestamp?: string) => {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleString();
  };

  const canSave = testResult?.success && newConnection.name && newConnection.field_mapping.email;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
            <Database size={20} className="text-emerald-600" />
          </div>
          <div>
            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">
              Data Connections
            </h3>
            <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">
              Connect external Supabase databases
            </p>
          </div>
        </div>
        {!isAddingNew && (
          <button
            onClick={() => setIsAddingNew(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-xs hover:bg-emerald-700 transition"
          >
            <Plus size={16} />
            <span>Add Connection</span>
          </button>
        )}
      </div>

      {/* Add New Connection Form */}
      {isAddingNew && (
        <div className="bg-white rounded-2xl border-2 border-emerald-200 shadow-sm p-6 space-y-5">
          <div className="flex items-center space-x-2 text-emerald-600 mb-2">
            <Plug size={18} />
            <span className="text-sm font-black uppercase">New Connection</span>
          </div>

          {/* Display Name */}
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
              Display Name
            </label>
            <input
              type="text"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-emerald-500 transition"
              placeholder="e.g., ATL Urban Farms"
              value={newConnection.name}
              onChange={(e) => setNewConnection((prev) => ({ ...prev, name: e.target.value }))}
            />
          </div>

          {/* Supabase URL */}
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
              Supabase URL
            </label>
            <input
              type="text"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono text-slate-800 outline-none focus:border-emerald-500 transition"
              placeholder="https://xxxxx.supabase.co"
              value={newConnection.supabase_url}
              onChange={(e) => setNewConnection((prev) => ({ ...prev, supabase_url: e.target.value }))}
            />
          </div>

          {/* API Key */}
          <div className="relative">
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
              API Key (anon)
            </label>
            <input
              type={visibleKeys['new_key'] ? 'text' : 'password'}
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 pr-12 py-3 text-sm font-mono text-slate-800 outline-none focus:border-emerald-500 transition"
              placeholder="Enter your anon key..."
              value={newConnection.supabase_key}
              onChange={(e) => setNewConnection((prev) => ({ ...prev, supabase_key: e.target.value }))}
            />
            <button
              onClick={() => toggleKeyVisibility('new_key')}
              className="absolute right-4 top-9 text-slate-400 hover:text-slate-800 transition"
            >
              {visibleKeys['new_key'] ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {/* Table Name */}
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
              Table Name
            </label>
            <input
              type="text"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono text-slate-800 outline-none focus:border-emerald-500 transition"
              placeholder="profiles"
              value={newConnection.table_name}
              onChange={(e) => setNewConnection((prev) => ({ ...prev, table_name: e.target.value }))}
            />
          </div>

          {/* Field Mapping (Collapsible) */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setShowFieldMapping(!showFieldMapping)}
              className="w-full px-4 py-3 bg-slate-50 flex items-center justify-between text-left hover:bg-slate-100 transition"
            >
              <span className="text-[10px] font-black text-slate-600 uppercase tracking-widest">
                Field Mapping
              </span>
              {showFieldMapping ? (
                <ChevronUp size={16} className="text-slate-400" />
              ) : (
                <ChevronDown size={16} className="text-slate-400" />
              )}
            </button>
            {showFieldMapping && (
              <div className="p-4 space-y-4 bg-white">
                <div>
                  <label className="block text-[9px] font-black text-slate-400 uppercase mb-1.5">
                    Email Column <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono text-slate-800 outline-none focus:border-emerald-500"
                    placeholder="email"
                    value={newConnection.field_mapping.email}
                    onChange={(e) =>
                      setNewConnection((prev) => ({
                        ...prev,
                        field_mapping: { ...prev.field_mapping, email: e.target.value },
                      }))
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { key: 'first_name', label: 'First Name Column' },
                    { key: 'last_name', label: 'Last Name Column' },
                    { key: 'phone', label: 'Phone Column' },
                    { key: 'subscribed', label: 'Subscribed Column' },
                    { key: 'created_at', label: 'Created At Column' },
                  ].map((field) => (
                    <div key={field.key}>
                      <label className="block text-[9px] font-black text-slate-400 uppercase mb-1.5">
                        {field.label}
                      </label>
                      <input
                        type="text"
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono text-slate-800 outline-none focus:border-emerald-500"
                        placeholder={field.key}
                        value={(newConnection.field_mapping as any)[field.key]}
                        onChange={(e) =>
                          setNewConnection((prev) => ({
                            ...prev,
                            field_mapping: { ...prev.field_mapping, [field.key]: e.target.value },
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Test Result */}
          {testResult && (
            <div
              className={`flex items-center space-x-2 p-3 rounded-xl ${
                testResult.success ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
              }`}
            >
              {testResult.success ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
              <span className="text-sm font-bold">{testResult.message}</span>
            </div>
          )}

          {/* Form Actions */}
          <div className="flex items-center space-x-3 pt-2">
            <button
              onClick={handleTestConnection}
              disabled={isTesting || !newConnection.supabase_url || !newConnection.supabase_key || !newConnection.table_name}
              className="flex items-center space-x-2 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold text-xs hover:bg-slate-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isTesting ? (
                <RefreshCw size={14} className="animate-spin" />
              ) : (
                <RefreshCw size={14} />
              )}
              <span>{isTesting ? 'Testing...' : 'Test Connection'}</span>
            </button>
            <button
              onClick={handleSaveConnection}
              disabled={!canSave}
              className="flex items-center space-x-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-xs hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <CheckCircle2 size={14} />
              <span>Save Connection</span>
            </button>
            <button
              onClick={handleCancel}
              className="px-4 py-2.5 text-slate-500 hover:text-slate-800 font-bold text-xs transition"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Existing Connections List */}
      <div className="space-y-3">
        {connections.map((connection) => (
          <div
            key={connection.id}
            className={`p-5 rounded-2xl border-2 transition-all ${
              connection.status === 'error'
                ? 'bg-rose-50/50 border-rose-100'
                : connection.status === 'disconnected'
                ? 'bg-slate-50 border-slate-100 opacity-60'
                : 'bg-white border-slate-100 hover:border-emerald-200 shadow-sm'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start space-x-4">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    connection.status === 'active'
                      ? 'bg-emerald-50 text-emerald-600'
                      : connection.status === 'error'
                      ? 'bg-rose-50 text-rose-500'
                      : 'bg-slate-100 text-slate-400'
                  }`}
                >
                  <Database size={20} />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    {getStatusIndicator(connection.status)}
                    <h4 className="text-sm font-black text-slate-800">{connection.name}</h4>
                    <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-500">
                      {connection.table_name}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 font-mono mt-1">{connection.supabase_url}</p>
                  <div className="flex items-center space-x-4 mt-2">
                    <span className="text-[9px] text-slate-400 font-bold">
                      Last tested: {formatTimestamp(connection.last_tested_at)}
                    </span>
                    {connection.last_error && (
                      <div className="flex items-center space-x-1 text-rose-500">
                        <AlertTriangle size={10} />
                        <span className="text-[9px] font-bold truncate max-w-[200px]">
                          {connection.last_error}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleTestExisting(connection)}
                  disabled={testingConnectionId === connection.id}
                  className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition disabled:opacity-50"
                  title="Test connection"
                >
                  {testingConnectionId === connection.id ? (
                    <RefreshCw size={16} className="animate-spin" />
                  ) : (
                    <RefreshCw size={16} />
                  )}
                </button>
                {deleteConfirm === connection.id ? (
                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => handleDeleteConnection(connection.id)}
                      className="px-2 py-1 text-[10px] font-bold bg-rose-500 text-white rounded-lg hover:bg-rose-600 transition"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      className="px-2 py-1 text-[10px] font-bold bg-slate-200 text-slate-600 rounded-lg hover:bg-slate-300 transition"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeleteConfirm(connection.id)}
                    className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition"
                    title="Delete connection"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

        {connections.length === 0 && !isAddingNew && (
          <div className="text-center py-12 text-slate-400 bg-slate-50 rounded-2xl border border-slate-200">
            <Database size={48} className="mx-auto mb-4 opacity-50" />
            <p className="text-sm font-bold">No connections yet</p>
            <p className="text-xs mt-1">Add your first data connection to get started</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConnectionsManager;
