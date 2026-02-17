import React, { useState, useEffect } from 'react';
import { SpokeConnection, SpokeTableConfig, Branch } from './types';
import { testSpokeConnection, discoverTables, autoMapFields, disconnectSpoke } from './spokeConnector';
import { generateSnapshot, saveSnapshot } from './services/branchSnapshotService';
import { fetchAllBranches } from './lib/supabaseService';
import { linkConnectionToBranch } from './services/branchLinker';
import { upsertSpokeConnection, deleteSpokeConnection } from './services/spokeConnectionsService';

const SPROUTIFY_ORG_ID = '00000000-0000-0000-0000-000000000001';

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
  Layers,
  Package,
  CreditCard,
  Users,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  GitBranch,
} from 'lucide-react';

interface ConnectionsManagerProps {
  connections: SpokeConnection[];
  onConnectionsChange: (connections: SpokeConnection[]) => void;
}

type WizardStep = 'idle' | 'connect' | 'discover' | 'customers' | 'data-types' | 'orders' | 'order-items' | 'subscriptions' | 'branch' | 'review';

interface TableConfig {
  table_name: string;
  field_mapping: Record<string, string>;
  columns: string[];
}

const ConnectionsManager: React.FC<ConnectionsManagerProps> = ({
  connections,
  onConnectionsChange,
}) => {
  // Wizard state
  const [wizardStep, setWizardStep] = useState<WizardStep>('idle');
  const [discoveredTables, setDiscoveredTables] = useState<string[]>([]);
  const [selectedDataTypes, setSelectedDataTypes] = useState<{ orders: boolean; orderItems: boolean; subscriptions: boolean }>({ orders: false, orderItems: false, subscriptions: false });

  // Connection form state
  const [newConnection, setNewConnection] = useState({
    name: '',
    supabase_url: '',
    supabase_key: '',
  });

  // Table configuration states
  const [customerTableConfig, setCustomerTableConfig] = useState<TableConfig>({ table_name: '', field_mapping: {}, columns: [] });
  const [orderTableConfigs, setOrderTableConfigs] = useState<TableConfig[]>([]);
  const [orderItemTableConfigs, setOrderItemTableConfigs] = useState<TableConfig[]>([]);
  const [subscriptionTableConfig, setSubscriptionTableConfig] = useState<TableConfig>({ table_name: '', field_mapping: {}, columns: [] });

  // UI state
  const [isTesting, setIsTesting] = useState(false);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Record<string, boolean>>({});
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [testingConnectionId, setTestingConnectionId] = useState<string | null>(null);
  const [successSummary, setSuccessSummary] = useState<{
    name: string;
    tables: { type: string; fields: number }[];
  } | null>(null);

  // Branch linking state
  const [availableBranches, setAvailableBranches] = useState<Branch[]>([]);
  const [isLoadingBranches, setIsLoadingBranches] = useState(false);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [branchMode, setBranchMode] = useState<'existing' | 'skip'>('skip');

  // Fetch branches when entering the branch step
  useEffect(() => {
    if (wizardStep === 'branch') {
      setIsLoadingBranches(true);
      fetchAllBranches()
        .then(branches => {
          // Show all branches (including already-linked ones) so users can re-link
          setAvailableBranches(branches);
          // Auto-select existing branch if one matches the connection name
          if (newConnection.name) {
            const slug = newConnection.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
            const match = branches.find(b => b.slug === slug || b.name === newConnection.name);
            if (match) {
              setBranchMode('existing');
              setSelectedBranchId(match.id);
            }
          }
        })
        .catch(err => console.error('Failed to fetch branches:', err))
        .finally(() => setIsLoadingBranches(false));
    }
  }, [wizardStep]);

  const resetWizard = () => {
    setWizardStep('idle');
    setDiscoveredTables([]);
    setSelectedDataTypes({ orders: false, orderItems: false, subscriptions: false });
    setNewConnection({ name: '', supabase_url: '', supabase_key: '' });
    setCustomerTableConfig({ table_name: '', field_mapping: {}, columns: [] });
    setOrderTableConfigs([]);
    setOrderItemTableConfigs([]);
    setSubscriptionTableConfig({ table_name: '', field_mapping: {}, columns: [] });
    setTestResult(null);
    setSelectedBranchId(null);
    setBranchMode('skip');
  };

  const buildTablesConfig = (): SpokeTableConfig[] => {
    const tables: SpokeTableConfig[] = [];

    // Always add customers table
    if (customerTableConfig.table_name) {
      tables.push({
        id: crypto.randomUUID(),
        table_type: 'customers',
        table_name: customerTableConfig.table_name,
        field_mapping: customerTableConfig.field_mapping,
        enabled: true,
      });
    }

    // Add all selected order tables
    if (selectedDataTypes.orders) {
      for (const orderConfig of orderTableConfigs) {
        if (orderConfig.table_name) {
          tables.push({
            id: crypto.randomUUID(),
            table_type: 'orders',
            table_name: orderConfig.table_name,
            field_mapping: orderConfig.field_mapping,
            enabled: true,
          });
        }
      }
    }

    // Add all selected order item tables
    if (selectedDataTypes.orderItems) {
      for (const itemConfig of orderItemTableConfigs) {
        if (itemConfig.table_name) {
          tables.push({
            id: crypto.randomUUID(),
            table_type: 'order_items',
            table_name: itemConfig.table_name,
            field_mapping: itemConfig.field_mapping,
            enabled: true,
          });
        }
      }
    }

    // Add subscriptions if selected
    if (selectedDataTypes.subscriptions && subscriptionTableConfig.table_name) {
      tables.push({
        id: crypto.randomUUID(),
        table_type: 'subscriptions',
        table_name: subscriptionTableConfig.table_name,
        field_mapping: subscriptionTableConfig.field_mapping,
        enabled: true,
      });
    }

    return tables;
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    // First test that we can connect to the database
    const result = await testSpokeConnection({
      supabase_url: newConnection.supabase_url,
      supabase_key: newConnection.supabase_key,
      table_name: 'profiles', // Test with a common table name
    });

    if (result.success) {
      setTestResult({ success: true, message: 'Connection successful!' });
      // Now discover tables
      setIsDiscovering(true);
      const discovery = await discoverTables(newConnection.supabase_url, newConnection.supabase_key);
      setDiscoveredTables(discovery.tables);
      setIsDiscovering(false);
      setWizardStep('discover');
    } else {
      // Try discovering tables anyway - the test table might not exist
      setIsDiscovering(true);
      const discovery = await discoverTables(newConnection.supabase_url, newConnection.supabase_key);
      if (discovery.tables.length > 0) {
        setDiscoveredTables(discovery.tables);
        setTestResult({ success: true, message: `Found ${discovery.tables.length} tables!` });
        setWizardStep('discover');
      } else {
        setTestResult({ success: false, message: discovery.error || result.error });
      }
      setIsDiscovering(false);
    }

    setIsTesting(false);
  };

  const handleSelectCustomerTable = async (tableName: string) => {
    // Test this specific table to get columns
    const result = await testSpokeConnection({
      supabase_url: newConnection.supabase_url,
      supabase_key: newConnection.supabase_key,
      table_name: tableName,
    });

    if (result.success) {
      const mapping = autoMapFields(result.columns, 'customers');
      setCustomerTableConfig({
        table_name: tableName,
        field_mapping: mapping,
        columns: result.columns,
      });
    }
  };

  const handleAddOrderTable = async (tableName: string) => {
    try {
      const result = await testSpokeConnection({
        supabase_url: newConnection.supabase_url,
        supabase_key: newConnection.supabase_key,
        table_name: tableName,
      });

      if (result.success && result.columns) {
        const autoMapping = autoMapFields(result.columns, 'orders');
        setOrderTableConfigs(prev => [
          ...prev,
          {
            table_name: tableName,
            field_mapping: autoMapping,
            columns: result.columns,
          }
        ]);
      }
    } catch (err) {
      console.error('Failed to fetch columns for', tableName, err);
    }
  };

  const handleRemoveOrderTable = (tableName: string) => {
    setOrderTableConfigs(prev => prev.filter(c => c.table_name !== tableName));
  };

  const updateOrderTableMapping = (tableName: string, field: string, value: string) => {
    setOrderTableConfigs(prev => prev.map(c =>
      c.table_name === tableName
        ? { ...c, field_mapping: { ...c.field_mapping, [field]: value } }
        : c
    ));
  };

  const handleAddOrderItemTable = async (tableName: string) => {
    try {
      const result = await testSpokeConnection({
        supabase_url: newConnection.supabase_url,
        supabase_key: newConnection.supabase_key,
        table_name: tableName,
      });

      if (result.success && result.columns) {
        const autoMapping = autoMapFields(result.columns, 'order_items');
        setOrderItemTableConfigs(prev => [
          ...prev,
          {
            table_name: tableName,
            field_mapping: autoMapping,
            columns: result.columns,
          }
        ]);
      }
    } catch (err) {
      console.error('Failed to fetch columns for', tableName, err);
    }
  };

  const handleRemoveOrderItemTable = (tableName: string) => {
    setOrderItemTableConfigs(prev => prev.filter(c => c.table_name !== tableName));
  };

  const updateOrderItemTableMapping = (tableName: string, field: string, value: string) => {
    setOrderItemTableConfigs(prev => prev.map(c =>
      c.table_name === tableName
        ? { ...c, field_mapping: { ...c.field_mapping, [field]: value } }
        : c
    ));
  };

  const handleSelectSubscriptionTable = async (tableName: string) => {
    const result = await testSpokeConnection({
      supabase_url: newConnection.supabase_url,
      supabase_key: newConnection.supabase_key,
      table_name: tableName,
    });

    if (result.success) {
      const mapping = autoMapFields(result.columns, 'subscriptions');
      setSubscriptionTableConfig({
        table_name: tableName,
        field_mapping: mapping,
        columns: result.columns,
      });
    }
  };

  const handleTestExisting = async (connection: SpokeConnection) => {
    setTestingConnectionId(connection.id);

    // Test the first enabled table (handle legacy connections without tables array)
    const tables = connection.tables || [];
    const firstTable = tables.find(t => t.enabled);
    if (!firstTable) {
      setTestingConnectionId(null);
      return;
    }

    const result = await testSpokeConnection({
      supabase_url: connection.supabase_url,
      supabase_key: connection.supabase_key,
      table_name: firstTable.table_name,
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
    const persistConn = updatedConnections.find(c => c.id === connection.id);
    if (persistConn) upsertSpokeConnection(SPROUTIFY_ORG_ID, persistConn);
    setTestingConnectionId(null);
  };

  const handleSaveConnection = async () => {
    const tables = buildTablesConfig();
    const connection: SpokeConnection = {
      id: crypto.randomUUID(),
      name: newConnection.name,
      supabase_url: newConnection.supabase_url,
      supabase_key: newConnection.supabase_key,
      tables,
      status: 'active',
      branch_skipped: false,
      created_at: new Date().toISOString(),
      last_tested_at: new Date().toISOString(),
    };
    onConnectionsChange([...connections, connection]);
    upsertSpokeConnection(SPROUTIFY_ORG_ID, connection);

    // Link to branch if one was selected
    const savedBranchId = selectedBranchId;

    if (branchMode === 'existing' && savedBranchId) {
      linkConnectionToBranch(savedBranchId, connection.id).then(() => {
        console.log('[branchLink] Linked connection to existing branch:', savedBranchId, '→', connection.name);
      }).catch(err => {
        console.warn('[branchLink] Failed to link branch (non-blocking):', err);
      });
    }

    // Generate and save analytics snapshot on successful connection (fire-and-forget)
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
      customerColumns: customerTable ? Object.values(customerTable.field_mapping).filter(Boolean) : [],
    }, 'on_connect').then(snapshot => {
      saveSnapshot(snapshot);
      console.log('[branchSnapshot] Snapshot saved:', snapshot.branch_name,
        '| Profiles:', snapshot.total_profiles,
        '| Revenue: $' + snapshot.total_revenue);
    }).catch(err => {
      console.warn('[branchSnapshot] Snapshot generation failed (non-blocking):', err);
    });

    // Show success summary
    setSuccessSummary({
      name: connection.name,
      tables: connection.tables.map(t => ({
        type: t.table_type,
        fields: Object.keys(t.field_mapping).filter(k => t.field_mapping[k]).length
      }))
    });

    // Auto-dismiss after 5 seconds
    setTimeout(() => setSuccessSummary(null), 5000);

    resetWizard();
  };

  const handleDeleteConnection = (id: string) => {
    const conn = connections.find((c) => c.id === id);
    if (conn) disconnectSpoke(conn.supabase_url, conn.supabase_key);
    onConnectionsChange(connections.filter((c) => c.id !== id));
    deleteSpokeConnection(id);
    setDeleteConfirm(null);
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

  const getTableIcon = (tableName: string) => {
    const lower = tableName.toLowerCase();
    if (lower.includes('customer') || lower.includes('profile') || lower.includes('user')) {
      return <Users size={16} className="text-emerald-500" />;
    }
    if (lower.includes('order') && !lower.includes('item')) {
      return <Package size={16} className="text-blue-500" />;
    }
    if (lower.includes('item') || lower.includes('line')) {
      return <Layers size={16} className="text-purple-500" />;
    }
    if (lower.includes('subscription') || lower.includes('payment')) {
      return <CreditCard size={16} className="text-amber-500" />;
    }
    return <Database size={16} className="text-slate-400" />;
  };

  const getWizardStepNumber = (): number => {
    const steps: WizardStep[] = ['connect', 'discover', 'customers', 'data-types', 'orders', 'order-items', 'subscriptions', 'branch', 'review'];
    return steps.indexOf(wizardStep) + 1;
  };

  const getTotalSteps = (): number => {
    let total = 6; // connect, discover, customers, data-types, branch, review
    if (selectedDataTypes.orders) total++;
    if (selectedDataTypes.orderItems) total++;
    if (selectedDataTypes.subscriptions) total++;
    return total;
  };

  const navigateNext = () => {
    switch (wizardStep) {
      case 'customers':
        setWizardStep('data-types');
        break;
      case 'data-types':
        if (selectedDataTypes.orders) {
          setWizardStep('orders');
        } else if (selectedDataTypes.orderItems) {
          setWizardStep('order-items');
        } else if (selectedDataTypes.subscriptions) {
          setWizardStep('subscriptions');
        } else {
          setWizardStep('branch');
        }
        break;
      case 'orders':
        if (selectedDataTypes.orderItems) {
          setWizardStep('order-items');
        } else if (selectedDataTypes.subscriptions) {
          setWizardStep('subscriptions');
        } else {
          setWizardStep('branch');
        }
        break;
      case 'order-items':
        if (selectedDataTypes.subscriptions) {
          setWizardStep('subscriptions');
        } else {
          setWizardStep('branch');
        }
        break;
      case 'subscriptions':
        setWizardStep('branch');
        break;
      case 'branch':
        setWizardStep('review');
        break;
    }
  };

  const navigateBack = () => {
    switch (wizardStep) {
      case 'discover':
        setWizardStep('connect');
        break;
      case 'customers':
        setWizardStep('discover');
        break;
      case 'data-types':
        setWizardStep('customers');
        break;
      case 'orders':
        setWizardStep('data-types');
        break;
      case 'order-items':
        if (selectedDataTypes.orders) {
          setWizardStep('orders');
        } else {
          setWizardStep('data-types');
        }
        break;
      case 'subscriptions':
        if (selectedDataTypes.orderItems) {
          setWizardStep('order-items');
        } else if (selectedDataTypes.orders) {
          setWizardStep('orders');
        } else {
          setWizardStep('data-types');
        }
        break;
      case 'branch':
        if (selectedDataTypes.subscriptions) {
          setWizardStep('subscriptions');
        } else if (selectedDataTypes.orderItems) {
          setWizardStep('order-items');
        } else if (selectedDataTypes.orders) {
          setWizardStep('orders');
        } else {
          setWizardStep('data-types');
        }
        break;
      case 'review':
        setWizardStep('branch');
        break;
    }
  };

  const canProceedFromCustomers = customerTableConfig.table_name && customerTableConfig.field_mapping.email;

  // Render wizard progress indicator
  const renderProgressIndicator = () => {
    const steps = ['Connect', 'Discover', 'Customers', 'Data Types'];
    if (selectedDataTypes.orders) steps.push('Orders');
    if (selectedDataTypes.orderItems) steps.push('Items');
    if (selectedDataTypes.subscriptions) steps.push('Subscriptions');
    steps.push('Branch');
    steps.push('Review');

    const currentIndex = getWizardStepNumber() - 1;

    return (
      <div className="flex items-center justify-center space-x-2 mb-6">
        {steps.map((step, index) => (
          <React.Fragment key={step}>
            <div className="flex items-center space-x-1">
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  index < currentIndex
                    ? 'bg-emerald-500 text-white'
                    : index === currentIndex
                    ? 'bg-emerald-100 text-emerald-700 ring-2 ring-emerald-500'
                    : 'bg-slate-100 text-slate-400'
                }`}
              >
                {index < currentIndex ? <Check size={12} /> : index + 1}
              </div>
              <span className={`text-[9px] font-bold uppercase hidden sm:inline ${
                index === currentIndex ? 'text-emerald-700' : 'text-slate-400'
              }`}>
                {step}
              </span>
            </div>
            {index < steps.length - 1 && (
              <div className={`w-8 h-0.5 ${index < currentIndex ? 'bg-emerald-500' : 'bg-slate-200'}`} />
            )}
          </React.Fragment>
        ))}
      </div>
    );
  };

  // Render field mapping inputs for a table type
  const renderFieldMappingInputs = (
    tableType: 'customers' | 'orders' | 'subscriptions',
    config: TableConfig,
    setConfig: React.Dispatch<React.SetStateAction<TableConfig>>
  ) => {
    const fieldDefinitions: Record<string, { label: string; required: boolean }[]> = {
      customers: [
        { label: 'Email', required: true },
        { label: 'First Name', required: false },
        { label: 'Last Name', required: false },
        { label: 'Phone', required: false },
        { label: 'Subscribed', required: false },
        { label: 'Created At', required: false },
      ],
      orders: [
        { label: 'ID', required: true },
        { label: 'Order Number', required: false },
        { label: 'Customer ID', required: false },
        { label: 'Guest Email', required: false },
        { label: 'Status', required: false },
        { label: 'Total', required: false },
        { label: 'Subtotal', required: false },
        { label: 'Tax', required: false },
        { label: 'Paid At', required: false },
        { label: 'Created At', required: false },
        { label: 'Shipped At', required: false },
        { label: 'Delivered At', required: false },
      ],
      subscriptions: [
        { label: 'ID', required: true },
        { label: 'Customer ID', required: false },
        { label: 'Email', required: false },
        { label: 'Status', required: false },
        { label: 'Plan', required: false },
        { label: 'Started At', required: false },
        { label: 'Expires At', required: false },
        { label: 'Created At', required: false },
      ],
    };

    const fields = fieldDefinitions[tableType];
    const toFieldKey = (label: string) => label.toLowerCase().replace(/ /g, '_');

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          {fields.map((field) => {
            const fieldKey = toFieldKey(field.label);
            const isMapped = !!config.field_mapping[fieldKey];
            return (
              <div key={fieldKey}>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[9px] font-black text-slate-400 uppercase">
                    {field.label} {field.required && <span className="text-rose-500">*</span>}
                  </label>
                  {isMapped && (
                    <span className="flex items-center space-x-1 text-[9px] font-bold text-emerald-600">
                      <CheckCircle2 size={10} />
                      <span>Auto</span>
                    </span>
                  )}
                </div>
                <select
                  className={`w-full bg-slate-50 border rounded-lg px-3 py-2 text-sm font-mono text-slate-800 outline-none focus:border-emerald-500 ${
                    isMapped ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200'
                  }`}
                  value={config.field_mapping[fieldKey] || ''}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      field_mapping: { ...prev.field_mapping, [fieldKey]: e.target.value },
                    }))
                  }
                >
                  <option value="">-- Select column --</option>
                  {config.columns.map((col) => (
                    <option key={col} value={col}>
                      {col}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>

        {/* Available columns reference */}
        {config.columns.length > 0 && (
          <div className="mt-4 p-3 bg-slate-50 rounded-lg">
            <p className="text-[9px] font-black text-slate-400 uppercase mb-2">Available Columns</p>
            <div className="flex flex-wrap gap-1.5">
              {config.columns.map((col) => {
                const isMapped = Object.values(config.field_mapping).includes(col);
                return (
                  <span
                    key={col}
                    className={`text-[10px] font-mono px-2 py-1 rounded ${
                      isMapped ? 'bg-emerald-100 text-emerald-700' : 'bg-white text-slate-600 border border-slate-200'
                    }`}
                  >
                    {col}
                    {isMapped && <CheckCircle2 size={10} className="inline ml-1" />}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

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
        {wizardStep === 'idle' && (
          <button
            onClick={() => setWizardStep('connect')}
            className="flex items-center space-x-2 px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-xs hover:bg-emerald-700 transition"
          >
            <Plus size={16} />
            <span>Add Connection</span>
          </button>
        )}
      </div>

      {/* Wizard */}
      {wizardStep !== 'idle' && (
        <div className="bg-white rounded-2xl border-2 border-emerald-200 shadow-sm p-6">
          {renderProgressIndicator()}

          {/* Step: Connect */}
          {wizardStep === 'connect' && (
            <div className="space-y-5">
              <div className="flex items-center space-x-2 text-emerald-600 mb-2">
                <Plug size={18} />
                <span className="text-sm font-black uppercase">Step 1: Connect to Database</span>
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

              {/* Actions */}
              <div className="flex items-center space-x-3 pt-2">
                <button
                  onClick={handleTestConnection}
                  disabled={isTesting || isDiscovering || !newConnection.supabase_url || !newConnection.supabase_key || !newConnection.name}
                  className="flex items-center space-x-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-xs hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isTesting || isDiscovering ? (
                    <RefreshCw size={14} className="animate-spin" />
                  ) : (
                    <ChevronRight size={14} />
                  )}
                  <span>{isTesting ? 'Connecting...' : isDiscovering ? 'Discovering Tables...' : 'Test Connection'}</span>
                </button>
                <button
                  onClick={resetWizard}
                  className="px-4 py-2.5 text-slate-500 hover:text-slate-800 font-bold text-xs transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Step: Discover */}
          {wizardStep === 'discover' && (
            <div className="space-y-5">
              <div className="flex items-center space-x-2 text-emerald-600 mb-2">
                <Database size={18} />
                <span className="text-sm font-black uppercase">Step 2: Tables Discovered</span>
              </div>

              <p className="text-sm text-slate-600">
                Found <span className="font-bold text-emerald-600">{discoveredTables.length}</span> tables in this database:
              </p>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {discoveredTables.map((table) => {
                  const isCustomerTable = ['customers', 'profiles', 'users'].includes(table.toLowerCase());
                  return (
                    <div
                      key={table}
                      className={`p-3 rounded-xl border-2 flex items-center space-x-2 ${
                        isCustomerTable
                          ? 'bg-emerald-50 border-emerald-200'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      {getTableIcon(table)}
                      <span className="text-sm font-bold text-slate-700">{table}</span>
                      {isCustomerTable && (
                        <span className="text-[8px] font-bold uppercase px-1.5 py-0.5 rounded bg-emerald-500 text-white">
                          Customer
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {discoveredTables.length === 0 && (
                <div className="text-center py-8 text-slate-400">
                  <AlertTriangle size={32} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm font-bold">No common tables found</p>
                  <p className="text-xs mt-1">Make sure your database has accessible tables</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center space-x-3 pt-2">
                <button
                  onClick={navigateBack}
                  className="flex items-center space-x-2 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold text-xs hover:bg-slate-200 transition"
                >
                  <ChevronLeft size={14} />
                  <span>Back</span>
                </button>
                <button
                  onClick={() => {
                    // Auto-select customer table if found
                    const customerTable = discoveredTables.find(t =>
                      ['customers', 'profiles', 'users'].includes(t.toLowerCase())
                    );
                    if (customerTable) {
                      handleSelectCustomerTable(customerTable);
                    }
                    setWizardStep('customers');
                  }}
                  disabled={discoveredTables.length === 0}
                  className="flex items-center space-x-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-xs hover:bg-emerald-700 transition disabled:opacity-50"
                >
                  <span>Continue</span>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Step: Customers */}
          {wizardStep === 'customers' && (
            <div className="space-y-5">
              <div className="flex items-center space-x-2 text-emerald-600 mb-2">
                <Users size={18} />
                <span className="text-sm font-black uppercase">Step 3: Configure Customers Table</span>
              </div>

              {/* Table Selection */}
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                  Select Customer Table
                </label>
                <select
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-emerald-500 transition"
                  value={customerTableConfig.table_name}
                  onChange={(e) => handleSelectCustomerTable(e.target.value)}
                >
                  <option value="">-- Select a table --</option>
                  {discoveredTables.map((table) => (
                    <option key={table} value={table}>
                      {table}
                    </option>
                  ))}
                </select>
              </div>

              {/* Field Mapping */}
              {customerTableConfig.table_name && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-slate-400 uppercase">Field Mapping</span>
                    <button
                      onClick={() => {
                        const mapping = autoMapFields(customerTableConfig.columns, 'customers');
                        setCustomerTableConfig((prev) => ({ ...prev, field_mapping: mapping }));
                      }}
                      className="text-[10px] font-bold text-emerald-600 hover:text-emerald-700"
                    >
                      Auto-Detect Fields
                    </button>
                  </div>
                  {renderFieldMappingInputs('customers', customerTableConfig, setCustomerTableConfig)}
                </>
              )}

              {/* Validation Warning */}
              {customerTableConfig.table_name && !customerTableConfig.field_mapping.email && (
                <div className="flex items-start space-x-2 p-3 bg-amber-50 border border-amber-100 rounded-xl">
                  <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm font-bold text-amber-700">Email field mapping is required</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center space-x-3 pt-2">
                <button
                  onClick={navigateBack}
                  className="flex items-center space-x-2 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold text-xs hover:bg-slate-200 transition"
                >
                  <ChevronLeft size={14} />
                  <span>Back</span>
                </button>
                <button
                  onClick={navigateNext}
                  disabled={!canProceedFromCustomers}
                  className="flex items-center space-x-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-xs hover:bg-emerald-700 transition disabled:opacity-50"
                >
                  <span>Continue</span>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Step: Data Types */}
          {wizardStep === 'data-types' && (
            <div className="space-y-5">
              <div className="flex items-center space-x-2 text-emerald-600 mb-2">
                <Layers size={18} />
                <span className="text-sm font-black uppercase">Step 4: What other data does this spoke have?</span>
              </div>

              <p className="text-sm text-slate-600 mb-4">
                Select any additional data types available in this database:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Orders Card */}
                <button
                  onClick={() => setSelectedDataTypes((prev) => ({ ...prev, orders: !prev.orders }))}
                  disabled={!discoveredTables.some(t => t.toLowerCase().includes('order') && !t.toLowerCase().includes('item'))}
                  className={`p-4 rounded-xl border-2 text-left transition ${
                    selectedDataTypes.orders
                      ? 'bg-blue-50 border-blue-300'
                      : discoveredTables.some(t => t.toLowerCase().includes('order') && !t.toLowerCase().includes('item'))
                      ? 'bg-white border-slate-200 hover:border-blue-200'
                      : 'bg-slate-50 border-slate-100 opacity-50 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        selectedDataTypes.orders ? 'bg-blue-100' : 'bg-slate-100'
                      }`}>
                        <Package size={20} className={selectedDataTypes.orders ? 'text-blue-600' : 'text-slate-400'} />
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-800">Orders</p>
                        <p className="text-[10px] text-slate-500">Purchase/order data</p>
                      </div>
                    </div>
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center ${
                      selectedDataTypes.orders ? 'bg-blue-500 border-blue-500' : 'border-slate-300'
                    }`}>
                      {selectedDataTypes.orders && <Check size={12} className="text-white" />}
                    </div>
                  </div>
                </button>

                {/* Order Items Card */}
                <button
                  onClick={() => setSelectedDataTypes((prev) => ({ ...prev, orderItems: !prev.orderItems }))}
                  disabled={!discoveredTables.some(t => t.toLowerCase().includes('item'))}
                  className={`p-4 rounded-xl border-2 text-left transition ${
                    selectedDataTypes.orderItems
                      ? 'bg-purple-50 border-purple-300'
                      : discoveredTables.some(t => t.toLowerCase().includes('item'))
                      ? 'bg-white border-slate-200 hover:border-purple-200'
                      : 'bg-slate-50 border-slate-100 opacity-50 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        selectedDataTypes.orderItems ? 'bg-purple-100' : 'bg-slate-100'
                      }`}>
                        <Layers size={20} className={selectedDataTypes.orderItems ? 'text-purple-600' : 'text-slate-400'} />
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-800">Order Items</p>
                        <p className="text-[10px] text-slate-500">Product-level data</p>
                      </div>
                    </div>
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center ${
                      selectedDataTypes.orderItems ? 'bg-purple-500 border-purple-500' : 'border-slate-300'
                    }`}>
                      {selectedDataTypes.orderItems && <Check size={12} className="text-white" />}
                    </div>
                  </div>
                </button>

                {/* Subscriptions Card */}
                <button
                  onClick={() => setSelectedDataTypes((prev) => ({ ...prev, subscriptions: !prev.subscriptions }))}
                  disabled={!discoveredTables.some(t => t.toLowerCase().includes('subscription'))}
                  className={`p-4 rounded-xl border-2 text-left transition ${
                    selectedDataTypes.subscriptions
                      ? 'bg-amber-50 border-amber-300'
                      : discoveredTables.some(t => t.toLowerCase().includes('subscription'))
                      ? 'bg-white border-slate-200 hover:border-amber-200'
                      : 'bg-slate-50 border-slate-100 opacity-50 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        selectedDataTypes.subscriptions ? 'bg-amber-100' : 'bg-slate-100'
                      }`}>
                        <CreditCard size={20} className={selectedDataTypes.subscriptions ? 'text-amber-600' : 'text-slate-400'} />
                      </div>
                      <div>
                        <p className="text-sm font-black text-slate-800">Subscriptions</p>
                        <p className="text-[10px] text-slate-500">Recurring billing data</p>
                      </div>
                    </div>
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center ${
                      selectedDataTypes.subscriptions ? 'bg-amber-500 border-amber-500' : 'border-slate-300'
                    }`}>
                      {selectedDataTypes.subscriptions && <Check size={12} className="text-white" />}
                    </div>
                  </div>
                </button>
              </div>

              {/* Actions */}
              <div className="flex items-center space-x-3 pt-2">
                <button
                  onClick={navigateBack}
                  className="flex items-center space-x-2 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold text-xs hover:bg-slate-200 transition"
                >
                  <ChevronLeft size={14} />
                  <span>Back</span>
                </button>
                <button
                  onClick={navigateNext}
                  className="flex items-center space-x-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-xs hover:bg-emerald-700 transition"
                >
                  <span>Continue</span>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Step: Orders */}
          {wizardStep === 'orders' && (
            <div className="space-y-5">
              <div className="flex items-center space-x-2 text-blue-600 mb-2">
                <Package size={18} />
                <span className="text-sm font-black uppercase">Step 5: Configure Order Tables</span>
              </div>

              <p className="text-sm text-slate-600">
                Select all tables that contain order/purchase data:
              </p>

              <div className="space-y-4">
                {discoveredTables
                  .filter(t => (t.toLowerCase().includes('order') && !t.toLowerCase().includes('item')) || t === 'purchases' || t === 'transactions')
                  .map(tableName => {
                    const isSelected = orderTableConfigs.some(c => c.table_name === tableName);
                    const config = orderTableConfigs.find(c => c.table_name === tableName);

                    return (
                      <div key={tableName} className={`border rounded-xl p-4 transition-colors ${isSelected ? 'border-blue-300 bg-blue-50/50' : 'bg-white border-slate-200'}`}>
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                handleAddOrderTable(tableName);
                              } else {
                                handleRemoveOrderTable(tableName);
                              }
                            }}
                            className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <Package className="w-4 h-4 text-blue-600" />
                          <span className="font-medium text-gray-900">{tableName}</span>
                          {isSelected && config && (
                            <span className="text-xs text-blue-600 ml-auto">
                              {Object.values(config.field_mapping).filter(Boolean).length} fields mapped
                            </span>
                          )}
                        </label>

                        {isSelected && config && (
                          <div className="mt-4 pt-4 border-t border-blue-200">
                            <div className="flex justify-between items-center mb-3">
                              <p className="text-xs font-semibold text-gray-500 uppercase">Field Mapping</p>
                              <button
                                onClick={() => {
                                  const autoMapping = autoMapFields(config.columns, 'orders');
                                  setOrderTableConfigs(prev => prev.map(c =>
                                    c.table_name === tableName ? { ...c, field_mapping: autoMapping } : c
                                  ));
                                }}
                                className="text-xs text-blue-600 hover:text-blue-700"
                              >
                                Auto-Detect Fields
                              </button>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                              {['id', 'customer_id', 'order_number', 'status', 'total', 'created_at', 'billing_city', 'billing_state', 'billing_zip', 'shipping_city', 'shipping_state', 'shipping_zip'].map(field => (
                                <div key={field}>
                                  <label className="block text-xs text-gray-500 mb-1">
                                    {field.replace(/_/g, ' ')}
                                    {field === 'id' && <span className="text-rose-500 ml-0.5">*</span>}
                                  </label>
                                  <select
                                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono text-slate-800 outline-none focus:border-blue-500"
                                    value={config.field_mapping[field] || ''}
                                    onChange={(e) => updateOrderTableMapping(tableName, field, e.target.value)}
                                  >
                                    <option value="">-- Select --</option>
                                    {config.columns.map((col) => (
                                      <option key={col} value={col}>{col}</option>
                                    ))}
                                  </select>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                {discoveredTables.filter(t => (t.toLowerCase().includes('order') && !t.toLowerCase().includes('item')) || t === 'purchases' || t === 'transactions').length === 0 && (
                  <div className="text-center py-6 text-slate-400">
                    <Package size={32} className="mx-auto mb-2 opacity-50" />
                    <p className="text-sm font-bold">No order tables found</p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center space-x-3 pt-2">
                <button
                  onClick={navigateBack}
                  className="flex items-center space-x-2 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold text-xs hover:bg-slate-200 transition"
                >
                  <ChevronLeft size={14} />
                  <span>Back</span>
                </button>
                <button
                  onClick={navigateNext}
                  disabled={orderTableConfigs.length === 0 || !orderTableConfigs.every(c => c.field_mapping.id)}
                  className="flex items-center space-x-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-xs hover:bg-emerald-700 transition disabled:opacity-50"
                >
                  <span>Continue</span>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Step: Order Items */}
          {wizardStep === 'order-items' && (
            <div className="space-y-5">
              <div className="flex items-center space-x-2 text-purple-600 mb-2">
                <Layers size={18} />
                <span className="text-sm font-black uppercase">Step {selectedDataTypes.orders ? '6' : '5'}: Configure Order Items Tables</span>
              </div>

              <p className="text-sm text-slate-600">
                Select tables that contain line-item/product details for orders:
              </p>

              <div className="space-y-4">
                {discoveredTables
                  .filter(t => t.toLowerCase().includes('item'))
                  .map(tableName => {
                    const isSelected = orderItemTableConfigs.some(c => c.table_name === tableName);
                    const config = orderItemTableConfigs.find(c => c.table_name === tableName);

                    return (
                      <div key={tableName} className={`border rounded-xl p-4 transition-colors ${isSelected ? 'border-purple-300 bg-purple-50/50' : 'bg-white border-slate-200'}`}>
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) {
                                handleAddOrderItemTable(tableName);
                              } else {
                                handleRemoveOrderItemTable(tableName);
                              }
                            }}
                            className="w-5 h-5 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                          />
                          <Layers className="w-4 h-4 text-purple-600" />
                          <span className="font-medium text-gray-900">{tableName}</span>
                          {isSelected && config && (
                            <span className="text-xs text-purple-600 ml-auto">
                              {Object.values(config.field_mapping).filter(Boolean).length} fields mapped
                            </span>
                          )}
                        </label>

                        {isSelected && config && (
                          <div className="mt-4 pt-4 border-t border-purple-200">
                            <div className="flex justify-between items-center mb-3">
                              <p className="text-xs font-semibold text-gray-500 uppercase">Field Mapping</p>
                              <button
                                onClick={() => {
                                  const autoMapping = autoMapFields(config.columns, 'order_items');
                                  setOrderItemTableConfigs(prev => prev.map(c =>
                                    c.table_name === tableName ? { ...c, field_mapping: autoMapping } : c
                                  ));
                                }}
                                className="text-xs text-purple-600 hover:text-purple-700"
                              >
                                Auto-Detect Fields
                              </button>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                              {['id', 'order_id', 'product_name', 'quantity', 'line_total'].map(field => (
                                <div key={field}>
                                  <label className="block text-xs text-gray-500 mb-1">
                                    {field.replace(/_/g, ' ')}
                                    {(field === 'id' || field === 'order_id') && <span className="text-rose-500 ml-0.5">*</span>}
                                  </label>
                                  <select
                                    className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono text-slate-800 outline-none focus:border-purple-500"
                                    value={config.field_mapping[field] || ''}
                                    onChange={(e) => updateOrderItemTableMapping(tableName, field, e.target.value)}
                                  >
                                    <option value="">-- Select --</option>
                                    {config.columns.map((col) => (
                                      <option key={col} value={col}>{col}</option>
                                    ))}
                                  </select>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                {discoveredTables.filter(t => t.toLowerCase().includes('item')).length === 0 && (
                  <div className="text-center py-6 text-slate-400">
                    <Layers size={32} className="mx-auto mb-2 opacity-50" />
                    <p className="text-sm font-bold">No order item tables found</p>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center space-x-3 pt-2">
                <button
                  onClick={navigateBack}
                  className="flex items-center space-x-2 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold text-xs hover:bg-slate-200 transition"
                >
                  <ChevronLeft size={14} />
                  <span>Back</span>
                </button>
                <button
                  onClick={navigateNext}
                  disabled={orderItemTableConfigs.length === 0 || !orderItemTableConfigs.every(c => c.field_mapping.id && c.field_mapping.order_id)}
                  className="flex items-center space-x-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-xs hover:bg-emerald-700 transition disabled:opacity-50"
                >
                  <span>Continue</span>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Step: Subscriptions */}
          {wizardStep === 'subscriptions' && (
            <div className="space-y-5">
              <div className="flex items-center space-x-2 text-amber-600 mb-2">
                <CreditCard size={18} />
                <span className="text-sm font-black uppercase">Step 6: Configure Subscriptions Table</span>
              </div>

              {/* Table Selection */}
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                  Select Subscriptions Table
                </label>
                <select
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-amber-500 transition"
                  value={subscriptionTableConfig.table_name}
                  onChange={(e) => handleSelectSubscriptionTable(e.target.value)}
                >
                  <option value="">-- Select a table --</option>
                  {discoveredTables
                    .filter(t => t.toLowerCase().includes('subscri') || t.toLowerCase().includes('newsletter') || t.toLowerCase().includes('member'))
                    .map((table) => (
                    <option key={table} value={table}>
                      {table}
                    </option>
                  ))}
                </select>
              </div>

              {/* Field Mapping */}
              {subscriptionTableConfig.table_name && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-slate-400 uppercase">Field Mapping</span>
                    <button
                      onClick={() => {
                        const mapping = autoMapFields(subscriptionTableConfig.columns, 'subscriptions');
                        setSubscriptionTableConfig((prev) => ({ ...prev, field_mapping: mapping }));
                      }}
                      className="text-[10px] font-bold text-amber-600 hover:text-amber-700"
                    >
                      Auto-Detect Fields
                    </button>
                  </div>
                  {renderFieldMappingInputs('subscriptions', subscriptionTableConfig, setSubscriptionTableConfig)}
                </>
              )}

              {/* Actions */}
              <div className="flex items-center space-x-3 pt-2">
                <button
                  onClick={navigateBack}
                  className="flex items-center space-x-2 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold text-xs hover:bg-slate-200 transition"
                >
                  <ChevronLeft size={14} />
                  <span>Back</span>
                </button>
                <button
                  onClick={navigateNext}
                  disabled={!subscriptionTableConfig.table_name || !subscriptionTableConfig.field_mapping.id}
                  className="flex items-center space-x-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-xs hover:bg-emerald-700 transition disabled:opacity-50"
                >
                  <span>Continue</span>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Step: Branch */}
          {wizardStep === 'branch' && (
            <div className="space-y-5">
              <div className="flex items-center space-x-2 text-emerald-600 mb-2">
                <GitBranch size={18} />
                <span className="text-sm font-black uppercase">Link to Branch</span>
              </div>

              <p className="text-sm text-slate-600">
                Which branch does <span className="font-bold">{newConnection.name}</span> belong to? This connects the data source to a branch identity (logo, colors, tone) in Trellis.
              </p>

              {isLoadingBranches ? (
                <div className="flex items-center justify-center py-8">
                  <RefreshCw size={20} className="animate-spin text-slate-400" />
                </div>
              ) : (
                <div className="space-y-3">
                  {availableBranches.length > 0 ? (
                    availableBranches.map(branch => (
                      <button
                        key={branch.id}
                        onClick={() => {
                          setBranchMode('existing');
                          setSelectedBranchId(branch.id);
                        }}
                        className={`w-full p-4 rounded-xl border-2 text-left transition ${
                          selectedBranchId === branch.id
                            ? 'bg-blue-50 border-blue-300'
                            : 'bg-white border-slate-200 hover:border-blue-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div
                              className="w-10 h-10 rounded-xl flex items-center justify-center"
                              style={{ backgroundColor: branch.primary_color ? `${branch.primary_color}20` : '#f1f5f9' }}
                            >
                              {branch.logo_url ? (
                                <img src={branch.logo_url} alt="" className="w-6 h-6 rounded object-contain" />
                              ) : (
                                <GitBranch size={20} style={{ color: branch.primary_color || '#94a3b8' }} />
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-black text-slate-800">{branch.name}</p>
                              <div className="flex items-center space-x-2 mt-0.5">
                                {branch.type && (
                                  <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">
                                    {branch.type}
                                  </span>
                                )}
                                <span className="text-[10px] text-slate-400 font-mono">{branch.slug}</span>
                                {branch.spoke_connection_id && (
                                  <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-50 text-amber-600">
                                    linked
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                            selectedBranchId === branch.id ? 'border-blue-500' : 'border-slate-300'
                          }`}>
                            {selectedBranchId === branch.id && (
                              <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />
                            )}
                          </div>
                        </div>
                      </button>
                    ))
                  ) : (
                    <div className="text-center py-8 space-y-3">
                      <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center mx-auto">
                        <GitBranch size={24} className="text-slate-400" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-700">No branches yet</p>
                        <p className="text-xs text-slate-500 mt-1">
                          Create a branch first on the <span className="font-bold text-emerald-600">Branches</span> page, then come back to connect this data source.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center space-x-3 pt-2">
                <button
                  onClick={navigateBack}
                  className="flex items-center space-x-2 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold text-xs hover:bg-slate-200 transition"
                >
                  <ChevronLeft size={14} />
                  <span>Back</span>
                </button>
                <button
                  onClick={navigateNext}
                  disabled={!selectedBranchId}
                  className="flex items-center space-x-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-xs hover:bg-emerald-700 transition disabled:opacity-50"
                >
                  <span>Continue</span>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}

          {/* Step: Review */}
          {wizardStep === 'review' && (
            <div className="space-y-5">
              <div className="flex items-center space-x-2 text-emerald-600 mb-2">
                <CheckCircle2 size={18} />
                <span className="text-sm font-black uppercase">Review & Save</span>
              </div>

              {/* Summary Card */}
              <div className="bg-slate-50 rounded-xl p-4 space-y-4">
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase">Connection Name</p>
                  <p className="text-sm font-bold text-slate-800">{newConnection.name}</p>
                </div>
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase">Supabase URL</p>
                  <p className="text-sm font-mono text-slate-600">{newConnection.supabase_url}</p>
                </div>

                <div className="border-t border-slate-200 pt-4">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-3">Configured Tables</p>
                  <div className="space-y-2">
                    {/* Customers Table */}
                    <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200">
                      <div className="flex items-center space-x-2">
                        <Users size={14} className="text-emerald-500" />
                        <span className="text-xs font-bold text-slate-700">Customers</span>
                        <span className="text-[9px] font-mono text-slate-400">{customerTableConfig.table_name}</span>
                      </div>
                      <span className="text-[9px] font-bold text-emerald-600">
                        {Object.values(customerTableConfig.field_mapping).filter(Boolean).length} fields
                      </span>
                    </div>

                    {/* Orders Tables */}
                    {selectedDataTypes.orders && orderTableConfigs.map((orderConfig) => (
                      <div key={orderConfig.table_name} className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200">
                        <div className="flex items-center space-x-2">
                          <Package size={14} className="text-blue-500" />
                          <span className="text-xs font-bold text-slate-700">Orders</span>
                          <span className="text-[9px] font-mono text-slate-400">{orderConfig.table_name}</span>
                        </div>
                        <span className="text-[9px] font-bold text-blue-600">
                          {Object.values(orderConfig.field_mapping).filter(Boolean).length} fields
                        </span>
                      </div>
                    ))}

                    {/* Order Items Tables */}
                    {selectedDataTypes.orderItems && orderItemTableConfigs.map((itemConfig) => (
                      <div key={itemConfig.table_name} className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200">
                        <div className="flex items-center space-x-2">
                          <Layers size={14} className="text-purple-500" />
                          <span className="text-xs font-bold text-slate-700">Order Items</span>
                          <span className="text-[9px] font-mono text-slate-400">{itemConfig.table_name}</span>
                        </div>
                        <span className="text-[9px] font-bold text-purple-600">
                          {Object.values(itemConfig.field_mapping).filter(Boolean).length} fields
                        </span>
                      </div>
                    ))}

                    {/* Subscriptions Table */}
                    {selectedDataTypes.subscriptions && subscriptionTableConfig.table_name && (
                      <div className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200">
                        <div className="flex items-center space-x-2">
                          <CreditCard size={14} className="text-amber-500" />
                          <span className="text-xs font-bold text-slate-700">Subscriptions</span>
                          <span className="text-[9px] font-mono text-slate-400">{subscriptionTableConfig.table_name}</span>
                        </div>
                        <span className="text-[9px] font-bold text-amber-600">
                          {Object.values(subscriptionTableConfig.field_mapping).filter(Boolean).length} fields
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Branch Linking */}
                <div className="border-t border-slate-200 pt-4">
                  <p className="text-[9px] font-black text-slate-400 uppercase mb-2">Branch</p>
                  <div className="flex items-center space-x-2 p-2 bg-white rounded-lg border border-slate-200">
                    <GitBranch size={14} className="text-emerald-500" />
                    <span className="text-xs font-bold text-slate-700">
                      {availableBranches.find(b => b.id === selectedBranchId)?.name || ''}
                    </span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center space-x-3 pt-2">
                <button
                  onClick={navigateBack}
                  className="flex items-center space-x-2 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-bold text-xs hover:bg-slate-200 transition"
                >
                  <ChevronLeft size={14} />
                  <span>Back</span>
                </button>
                <button
                  onClick={handleSaveConnection}
                  className="flex items-center space-x-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-xs hover:bg-emerald-700 transition"
                >
                  <CheckCircle2 size={14} />
                  <span>Save Connection</span>
                </button>
                <button
                  onClick={resetWizard}
                  className="px-4 py-2.5 text-slate-500 hover:text-slate-800 font-bold text-xs transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Success Summary Banner */}
      {successSummary && (
        <div className="mb-6 bg-emerald-50 border border-emerald-200 rounded-xl p-4 relative">
          <button
            onClick={() => setSuccessSummary(null)}
            className="absolute top-3 right-3 text-emerald-400 hover:text-emerald-600"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
              <Check className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h4 className="font-semibold text-emerald-900">Connection Created!</h4>
              <p className="text-sm text-emerald-700 mt-1">
                <span className="font-medium">{successSummary.name}</span> is now connected.
              </p>
              <div className="flex gap-2 mt-2 flex-wrap">
                {successSummary.tables.map((t, i) => (
                  <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full">
                    {t.type === 'customers' && <Users className="w-3 h-3" />}
                    {t.type === 'orders' && <Package className="w-3 h-3" />}
                    {t.type === 'order_items' && <Layers className="w-3 h-3" />}
                    {t.type === 'subscriptions' && <CreditCard className="w-3 h-3" />}
                    {t.type === 'order_items' ? 'Order Items' : t.type.charAt(0).toUpperCase() + t.type.slice(1)}: {t.fields} fields
                  </span>
                ))}
              </div>
            </div>
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
                  </div>
                  {/* Table badges */}
                  <div className="flex items-center space-x-1.5 mt-1.5">
                    {(connection.tables || []).filter(t => t.enabled).map((table) => (
                      <span
                        key={table.id}
                        className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded flex items-center space-x-1 ${
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
                        {table.table_type === 'customers' && <Users size={10} />}
                        {table.table_type === 'orders' && <Package size={10} />}
                        {table.table_type === 'order_items' && <Layers size={10} />}
                        {table.table_type === 'subscriptions' && <CreditCard size={10} />}
                        <span>{table.table_type === 'order_items' ? 'items' : table.table_type}</span>
                      </span>
                    ))}
                    {/* Legacy connection indicator */}
                    {(!connection.tables || connection.tables.length === 0) && (
                      <span className="text-[9px] font-bold uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-700 flex items-center space-x-1">
                        <AlertTriangle size={10} />
                        <span>Needs reconfiguration</span>
                      </span>
                    )}
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

        {connections.length === 0 && wizardStep === 'idle' && (
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
