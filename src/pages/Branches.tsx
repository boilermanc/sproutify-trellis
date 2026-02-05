import { useState, useEffect } from 'react';
import {
  GitBranch,
  Plus,
  ArrowLeft,
  Palette,
  Type,
  Mail,
  Archive,
  Building2,
  ExternalLink,
  AlertTriangle
} from 'lucide-react';
import { Branch } from '../../types';
import {
  fetchAllBranches,
  createBranch,
  updateBranch,
  deleteBranch
} from '../../lib/supabaseService';

const FONT_OPTIONS = ['Inter', 'Poppins', 'Roboto', 'System'];
const TONE_OPTIONS = ['friendly', 'professional', 'playful', 'authoritative'];

export default function Branches() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedBranch, setSelectedBranch] = useState<Branch | null>(null);
  const [editedBranch, setEditedBranch] = useState<Partial<Branch>>({});
  const [isCreating, setIsCreating] = useState(false);
  const [newBranch, setNewBranch] = useState<Partial<Branch>>({
    type: 'external',
    primary_color: '#10b981',
    secondary_color: '#1e293b',
    accent_color: '#f59e0b',
    font_family: 'Inter',
    tone: 'friendly',
    is_active: true
  });
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    loadBranches();
  }, []);

  useEffect(() => {
    if (selectedBranch) {
      setEditedBranch({ ...selectedBranch });
    }
  }, [selectedBranch]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  async function loadBranches() {
    setIsLoading(true);
    try {
      const data = await fetchAllBranches();
      setBranches(data);
    } catch (err) {
      console.error('Failed to load branches:', err);
      showToast('Failed to load branches', 'error');
    } finally {
      setIsLoading(false);
    }
  }

  function showToast(message: string, type: 'success' | 'error') {
    setToast({ message, type });
  }

  function handleSelectBranch(branch: Branch) {
    setSelectedBranch(branch);
  }

  function handleBack() {
    setSelectedBranch(null);
    setEditedBranch({});
  }

  async function handleSave() {
    if (!selectedBranch || !editedBranch) return;

    setIsSaving(true);
    try {
      await updateBranch(selectedBranch.id, editedBranch);
      showToast('Branch updated successfully', 'success');
      await loadBranches();
      // Update selectedBranch with new data
      const updated = branches.find(b => b.id === selectedBranch.id);
      if (updated) setSelectedBranch({ ...updated, ...editedBranch } as Branch);
    } catch (err) {
      console.error('Failed to update branch:', err);
      showToast('Failed to update branch', 'error');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleArchive() {
    if (!selectedBranch) return;

    if (!confirm(`Are you sure you want to archive "${selectedBranch.name}"? This will deactivate the branch.`)) {
      return;
    }

    setIsSaving(true);
    try {
      await deleteBranch(selectedBranch.id);
      showToast('Branch archived successfully', 'success');
      handleBack();
      await loadBranches();
    } catch (err) {
      console.error('Failed to archive branch:', err);
      showToast('Failed to archive branch', 'error');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleCreate() {
    if (!newBranch.name?.trim()) {
      showToast('Branch name is required', 'error');
      return;
    }

    setIsSaving(true);
    try {
      await createBranch(newBranch);
      showToast('Branch created successfully', 'success');
      setIsCreating(false);
      setNewBranch({
        type: 'external',
        primary_color: '#10b981',
        secondary_color: '#1e293b',
        accent_color: '#f59e0b',
        font_family: 'Inter',
        tone: 'friendly',
        is_active: true
      });
      await loadBranches();
    } catch (err) {
      console.error('Failed to create branch:', err);
      showToast('Failed to create branch', 'error');
    } finally {
      setIsSaving(false);
    }
  }

  // Stats calculation
  const stats = {
    total: branches.length,
    internal: branches.filter(b => b.type === 'internal').length,
    external: branches.filter(b => b.type === 'external').length,
    active: branches.filter(b => b.is_active).length
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" />
      </div>
    );
  }

  // Detail View
  if (selectedBranch) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Toast */}
        {toast && (
          <div className={`fixed top-4 right-4 z-50 px-6 py-3 rounded-lg shadow-lg ${
            toast.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'
          }`}>
            {toast.message}
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={handleBack}
              className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 transition-colors shadow-sm"
            >
              <ArrowLeft className="w-5 h-5 text-slate-600" />
            </button>
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center text-xl font-bold text-white shadow-lg"
              style={{ backgroundColor: editedBranch.primary_color || '#10b981' }}
            >
              {editedBranch.logo_url ? (
                <img src={editedBranch.logo_url} alt="Logo" className="w-full h-full object-contain rounded-xl" />
              ) : (
                editedBranch.name?.charAt(0) || 'B'
              )}
            </div>
            <div>
              <h1
                className="text-xl font-black"
                style={{ color: editedBranch.primary_color || '#10b981' }}
              >
                {selectedBranch.name}
              </h1>
              <p className="text-slate-500 text-sm font-mono">/{selectedBranch.slug}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {!selectedBranch.is_active && (
              <span className="px-3 py-1 text-xs font-bold uppercase bg-slate-100 text-slate-500 rounded-lg border border-slate-200">
                Archived
              </span>
            )}
            <span className={`px-3 py-1 text-xs font-bold uppercase rounded-lg ${
              selectedBranch.type === 'internal'
                ? 'bg-blue-50 text-blue-600 border border-blue-100'
                : 'bg-purple-50 text-purple-600 border border-purple-100'
            }`}>
              {selectedBranch.type}
            </span>
          </div>
        </div>

        {/* Form Sections */}
        <div className="space-y-6">
          {/* Basic Info */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
            <h2 className="text-[10px] font-black text-slate-400 mb-4 flex items-center gap-2 uppercase tracking-widest">
              <Building2 className="w-4 h-4" />
              Basic Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Name</label>
                <input
                  type="text"
                  value={editedBranch.name || ''}
                  onChange={(e) => setEditedBranch({ ...editedBranch, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 font-bold"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Slug</label>
                <input
                  type="text"
                  value={editedBranch.slug || ''}
                  onChange={(e) => setEditedBranch({ ...editedBranch, slug: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-mono placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                />
                <p className="mt-1 text-xs text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Changing slug may affect data linkage
                </p>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Type</label>
                <select
                  value={editedBranch.type || 'external'}
                  onChange={(e) => setEditedBranch({ ...editedBranch, type: e.target.value as 'internal' | 'external' })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-emerald-500 font-bold"
                >
                  <option value="internal">Internal</option>
                  <option value="external">External</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Tagline</label>
                <input
                  type="text"
                  value={editedBranch.tagline || ''}
                  onChange={(e) => setEditedBranch({ ...editedBranch, tagline: e.target.value })}
                  placeholder="Your catchy tagline..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Logo URL</label>
                <input
                  type="url"
                  value={editedBranch.logo_url || ''}
                  onChange={(e) => setEditedBranch({ ...editedBranch, logo_url: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Website URL</label>
                <input
                  type="url"
                  value={editedBranch.website_url || ''}
                  onChange={(e) => setEditedBranch({ ...editedBranch, website_url: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 font-mono text-sm"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Description</label>
                <textarea
                  value={editedBranch.description || ''}
                  onChange={(e) => setEditedBranch({ ...editedBranch, description: e.target.value })}
                  placeholder="Describe this branch..."
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>
            </div>
          </div>

          {/* Colors */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
            <h2 className="text-[10px] font-black text-slate-400 mb-4 flex items-center gap-2 uppercase tracking-widest">
              <Palette className="w-4 h-4" />
              Brand Colors
            </h2>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Primary</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={editedBranch.primary_color || '#10b981'}
                    onChange={(e) => setEditedBranch({ ...editedBranch, primary_color: e.target.value })}
                    className="w-10 h-10 rounded-lg cursor-pointer border border-slate-200"
                  />
                  <input
                    type="text"
                    value={editedBranch.primary_color || '#10b981'}
                    onChange={(e) => setEditedBranch({ ...editedBranch, primary_color: e.target.value })}
                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Secondary</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={editedBranch.secondary_color || '#1e293b'}
                    onChange={(e) => setEditedBranch({ ...editedBranch, secondary_color: e.target.value })}
                    className="w-10 h-10 rounded-lg cursor-pointer border border-slate-200"
                  />
                  <input
                    type="text"
                    value={editedBranch.secondary_color || '#1e293b'}
                    onChange={(e) => setEditedBranch({ ...editedBranch, secondary_color: e.target.value })}
                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Accent</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={editedBranch.accent_color || '#f59e0b'}
                    onChange={(e) => setEditedBranch({ ...editedBranch, accent_color: e.target.value })}
                    className="w-10 h-10 rounded-lg cursor-pointer border border-slate-200"
                  />
                  <input
                    type="text"
                    value={editedBranch.accent_color || '#f59e0b'}
                    onChange={(e) => setEditedBranch({ ...editedBranch, accent_color: e.target.value })}
                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 text-sm font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <div className="flex-1 h-8 rounded-lg shadow-inner" style={{ backgroundColor: editedBranch.primary_color || '#10b981' }} />
              <div className="flex-1 h-8 rounded-lg shadow-inner" style={{ backgroundColor: editedBranch.secondary_color || '#1e293b' }} />
              <div className="flex-1 h-8 rounded-lg shadow-inner" style={{ backgroundColor: editedBranch.accent_color || '#f59e0b' }} />
            </div>
          </div>

          {/* Brand Voice & Typography */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
              <h2 className="text-[10px] font-black text-slate-400 mb-4 flex items-center gap-2 uppercase tracking-widest">
                <Type className="w-4 h-4" />
                Typography & Voice
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Font Family</label>
                  <select
                    value={editedBranch.font_family || 'Inter'}
                    onChange={(e) => setEditedBranch({ ...editedBranch, font_family: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-emerald-500 font-bold"
                  >
                    {FONT_OPTIONS.map(font => (
                      <option key={font} value={font}>{font}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Tone</label>
                  <select
                    value={editedBranch.tone || 'friendly'}
                    onChange={(e) => setEditedBranch({ ...editedBranch, tone: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:border-emerald-500 font-bold"
                  >
                    {TONE_OPTIONS.map(tone => (
                      <option key={tone} value={tone}>{tone.charAt(0).toUpperCase() + tone.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Brand Keywords</label>
                  <input
                    type="text"
                    value={(editedBranch.brand_keywords || []).join(', ')}
                    onChange={(e) => setEditedBranch({
                      ...editedBranch,
                      brand_keywords: e.target.value.split(',').map(k => k.trim()).filter(Boolean)
                    })}
                    placeholder="innovative, sustainable, premium..."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                  />
                  <p className="mt-1 text-xs text-slate-500">Comma-separated keywords</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
              <h2 className="text-[10px] font-black text-slate-400 mb-4 flex items-center gap-2 uppercase tracking-widest">
                <Mail className="w-4 h-4" />
                Email Settings
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Contact Email</label>
                  <input
                    type="email"
                    value={editedBranch.contact_email || ''}
                    onChange={(e) => setEditedBranch({ ...editedBranch, contact_email: e.target.value })}
                    placeholder="contact@example.com"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Default From Name</label>
                  <input
                    type="text"
                    value={editedBranch.default_from_name || ''}
                    onChange={(e) => setEditedBranch({ ...editedBranch, default_from_name: e.target.value })}
                    placeholder="Your Brand Name"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase tracking-widest">Default Reply-To</label>
                  <input
                    type="email"
                    value={editedBranch.default_reply_to || ''}
                    onChange={(e) => setEditedBranch({ ...editedBranch, default_reply_to: e.target.value })}
                    placeholder="reply@example.com"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:border-emerald-500 font-mono text-sm"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-200">
          <div>
            {selectedBranch.type === 'external' && (
              <button
                onClick={handleArchive}
                disabled={isSaving}
                className="px-4 py-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2 disabled:opacity-50 text-sm font-bold"
              >
                <Archive className="w-4 h-4" />
                Archive Branch
              </button>
            )}
          </div>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    );
  }

  // Main View - Branch List
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
            <GitBranch className="w-7 h-7 text-emerald-600" />
            Branch Registry
          </h1>
          <p className="text-slate-500 mt-1 text-sm">Manage your data sources and brand identities</p>
        </div>
        <button
          onClick={() => setIsCreating(true)}
          className="px-6 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold transition-colors flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Add Branch
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Total Branches</p>
          <p className="text-3xl font-black text-yale-blue mt-1">{stats.total}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Internal</p>
          <p className="text-3xl font-black text-blue-600 mt-1">{stats.internal}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">External</p>
          <p className="text-3xl font-black text-purple-600 mt-1">{stats.external}</p>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Active</p>
          <p className="text-3xl font-black text-emerald-600 mt-1">{stats.active}</p>
        </div>
      </div>

      {/* Branch Grid */}
      {branches.length === 0 ? (
        <div className="bg-white rounded-[2.5rem] p-12 text-center border border-slate-200 shadow-sm">
          <GitBranch className="w-16 h-16 text-slate-300 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-slate-800 mb-2">No branches yet</h3>
          <p className="text-slate-500 mb-6">Create your first branch to start organizing your data sources.</p>
          <button
            onClick={() => setIsCreating(true)}
            className="px-6 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold transition-colors inline-flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Create Branch
          </button>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-[2.5rem] overflow-hidden border border-slate-200 shadow-sm">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Name</th>
                  <th className="text-left px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Slug</th>
                  <th className="text-left px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Type</th>
                  <th className="text-left px-6 py-4 text-[10px] font-black uppercase tracking-widest text-slate-400">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {branches
                  .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                  .map((branch) => (
                  <tr
                    key={branch.id}
                    onClick={() => handleSelectBranch(branch)}
                    className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4">
                      <span className="text-slate-800 font-bold">{branch.name}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-slate-500 font-mono text-sm">/{branch.slug}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold uppercase rounded-lg ${
                        branch.type === 'internal'
                          ? 'bg-blue-50 text-blue-600 border border-blue-100'
                          : 'bg-purple-50 text-purple-600 border border-purple-100'
                      }`}>
                        {branch.type === 'internal' ? <Building2 className="w-3 h-3" /> : <ExternalLink className="w-3 h-3" />}
                        {branch.type}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-block px-2.5 py-1 text-xs font-bold uppercase rounded-lg ${
                        branch.is_active
                          ? 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                          : 'bg-slate-100 text-slate-500 border border-slate-200'
                      }`}>
                        {branch.is_active ? 'Active' : 'Archived'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Pagination */}
          {branches.length > pageSize && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-slate-500">
                Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, branches.length)} of {branches.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors font-bold text-sm"
                >
                  Previous
                </button>
                <span className="text-slate-600 px-3 text-sm font-bold">
                  Page {currentPage} of {Math.ceil(branches.length / pageSize)}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(Math.ceil(branches.length / pageSize), p + 1))}
                  disabled={currentPage >= Math.ceil(branches.length / pageSize)}
                  className="px-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors font-bold text-sm"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Create Modal */}
      {isCreating && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-[2rem] p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-3 uppercase tracking-tight">
              <Plus className="w-6 h-6 text-emerald-500" />
              Create Branch
            </h2>

            <div className="space-y-4">
              {/* Name (Required) */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newBranch.name || ''}
                  onChange={(e) => setNewBranch({ ...newBranch, name: e.target.value })}
                  placeholder="My Branch"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold"
                />
              </div>

              {/* Type */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                  Type
                </label>
                <select
                  value={newBranch.type || 'external'}
                  onChange={(e) => setNewBranch({ ...newBranch, type: e.target.value as 'internal' | 'external' })}
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-bold"
                >
                  <option value="internal">Internal</option>
                  <option value="external">External</option>
                </select>
              </div>

              {/* Tagline */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                  Tagline
                </label>
                <input
                  type="text"
                  value={newBranch.tagline || ''}
                  onChange={(e) => setNewBranch({ ...newBranch, tagline: e.target.value })}
                  placeholder="Your catchy tagline..."
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Website URL */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                  Website URL
                </label>
                <input
                  type="url"
                  value={newBranch.website_url || ''}
                  onChange={(e) => setNewBranch({ ...newBranch, website_url: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-sm"
                />
              </div>

              {/* Primary Color */}
              <div>
                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                  Primary Color
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={newBranch.primary_color || '#10b981'}
                    onChange={(e) => setNewBranch({ ...newBranch, primary_color: e.target.value })}
                    className="w-12 h-12 rounded-xl cursor-pointer border border-slate-200"
                  />
                  <input
                    type="text"
                    value={newBranch.primary_color || '#10b981'}
                    onChange={(e) => setNewBranch({ ...newBranch, primary_color: e.target.value })}
                    className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 mt-8">
              <button
                onClick={() => setIsCreating(false)}
                className="px-6 py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors font-bold"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={isSaving || !newBranch.name?.trim()}
                className="px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isSaving ? 'Creating...' : 'Create Branch'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
