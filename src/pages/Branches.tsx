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
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-slate-400" />
            </button>
            <div
              className="w-12 h-12 rounded-lg flex items-center justify-center text-xl font-bold text-white"
              style={{ backgroundColor: editedBranch.primary_color || '#10b981' }}
            >
              {editedBranch.logo_url ? (
                <img src={editedBranch.logo_url} alt="Logo" className="w-full h-full object-contain rounded-lg" />
              ) : (
                editedBranch.name?.charAt(0) || 'B'
              )}
            </div>
            <div>
              <h1
                className="text-xl font-bold"
                style={{ color: editedBranch.primary_color || '#10b981' }}
              >
                {selectedBranch.name}
              </h1>
              <p className="text-slate-400 text-sm font-mono">/{selectedBranch.slug}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {!selectedBranch.is_active && (
              <span className="px-3 py-1 text-xs font-bold uppercase bg-slate-700 text-slate-400 rounded">
                Archived
              </span>
            )}
            <span className={`px-3 py-1 text-xs font-bold uppercase rounded ${
              selectedBranch.type === 'internal'
                ? 'bg-blue-500/20 text-blue-400'
                : 'bg-purple-500/20 text-purple-400'
            }`}>
              {selectedBranch.type}
            </span>
          </div>
        </div>

        {/* Form Sections */}
        <div className="space-y-6">
          {/* Basic Info */}
          <div className="bg-slate-800 rounded-lg p-6">
            <h2 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Basic Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Name</label>
                <input
                  type="text"
                  value={editedBranch.name || ''}
                  onChange={(e) => setEditedBranch({ ...editedBranch, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Slug</label>
                <input
                  type="text"
                  value={editedBranch.slug || ''}
                  onChange={(e) => setEditedBranch({ ...editedBranch, slug: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
                <p className="mt-1 text-xs text-amber-500 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Changing slug may affect data linkage
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Type</label>
                <select
                  value={editedBranch.type || 'external'}
                  onChange={(e) => setEditedBranch({ ...editedBranch, type: e.target.value as 'internal' | 'external' })}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="internal">Internal</option>
                  <option value="external">External</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Tagline</label>
                <input
                  type="text"
                  value={editedBranch.tagline || ''}
                  onChange={(e) => setEditedBranch({ ...editedBranch, tagline: e.target.value })}
                  placeholder="Your catchy tagline..."
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Logo URL</label>
                <input
                  type="url"
                  value={editedBranch.logo_url || ''}
                  onChange={(e) => setEditedBranch({ ...editedBranch, logo_url: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Website URL</label>
                <input
                  type="url"
                  value={editedBranch.website_url || ''}
                  onChange={(e) => setEditedBranch({ ...editedBranch, website_url: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-400 mb-1">Description</label>
                <textarea
                  value={editedBranch.description || ''}
                  onChange={(e) => setEditedBranch({ ...editedBranch, description: e.target.value })}
                  placeholder="Describe this branch..."
                  rows={3}
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>
            </div>
          </div>

          {/* Colors */}
          <div className="bg-slate-800 rounded-lg p-6">
            <h2 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
              <Palette className="w-4 h-4" />
              Brand Colors
            </h2>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Primary</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={editedBranch.primary_color || '#10b981'}
                    onChange={(e) => setEditedBranch({ ...editedBranch, primary_color: e.target.value })}
                    className="w-10 h-10 rounded cursor-pointer border-0 bg-transparent"
                  />
                  <input
                    type="text"
                    value={editedBranch.primary_color || '#10b981'}
                    onChange={(e) => setEditedBranch({ ...editedBranch, primary_color: e.target.value })}
                    className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Secondary</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={editedBranch.secondary_color || '#1e293b'}
                    onChange={(e) => setEditedBranch({ ...editedBranch, secondary_color: e.target.value })}
                    className="w-10 h-10 rounded cursor-pointer border-0 bg-transparent"
                  />
                  <input
                    type="text"
                    value={editedBranch.secondary_color || '#1e293b'}
                    onChange={(e) => setEditedBranch({ ...editedBranch, secondary_color: e.target.value })}
                    className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Accent</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={editedBranch.accent_color || '#f59e0b'}
                    onChange={(e) => setEditedBranch({ ...editedBranch, accent_color: e.target.value })}
                    className="w-10 h-10 rounded cursor-pointer border-0 bg-transparent"
                  />
                  <input
                    type="text"
                    value={editedBranch.accent_color || '#f59e0b'}
                    onChange={(e) => setEditedBranch({ ...editedBranch, accent_color: e.target.value })}
                    className="flex-1 px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white text-sm font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <div className="flex-1 h-8 rounded" style={{ backgroundColor: editedBranch.primary_color || '#10b981' }} />
              <div className="flex-1 h-8 rounded" style={{ backgroundColor: editedBranch.secondary_color || '#1e293b' }} />
              <div className="flex-1 h-8 rounded" style={{ backgroundColor: editedBranch.accent_color || '#f59e0b' }} />
            </div>
          </div>

          {/* Brand Voice & Typography */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-slate-800 rounded-lg p-6">
              <h2 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                <Type className="w-4 h-4" />
                Typography & Voice
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Font Family</label>
                  <select
                    value={editedBranch.font_family || 'Inter'}
                    onChange={(e) => setEditedBranch({ ...editedBranch, font_family: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  >
                    {FONT_OPTIONS.map(font => (
                      <option key={font} value={font}>{font}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Tone</label>
                  <select
                    value={editedBranch.tone || 'friendly'}
                    onChange={(e) => setEditedBranch({ ...editedBranch, tone: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-emerald-500"
                  >
                    {TONE_OPTIONS.map(tone => (
                      <option key={tone} value={tone}>{tone.charAt(0).toUpperCase() + tone.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Brand Keywords</label>
                  <input
                    type="text"
                    value={(editedBranch.brand_keywords || []).join(', ')}
                    onChange={(e) => setEditedBranch({
                      ...editedBranch,
                      brand_keywords: e.target.value.split(',').map(k => k.trim()).filter(Boolean)
                    })}
                    placeholder="innovative, sustainable, premium..."
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                  <p className="mt-1 text-xs text-slate-500">Comma-separated keywords</p>
                </div>
              </div>
            </div>

            <div className="bg-slate-800 rounded-lg p-6">
              <h2 className="text-sm font-semibold text-slate-300 mb-4 flex items-center gap-2">
                <Mail className="w-4 h-4" />
                Email Settings
              </h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Contact Email</label>
                  <input
                    type="email"
                    value={editedBranch.contact_email || ''}
                    onChange={(e) => setEditedBranch({ ...editedBranch, contact_email: e.target.value })}
                    placeholder="contact@example.com"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Default From Name</label>
                  <input
                    type="text"
                    value={editedBranch.default_from_name || ''}
                    onChange={(e) => setEditedBranch({ ...editedBranch, default_from_name: e.target.value })}
                    placeholder="Your Brand Name"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">Default Reply-To</label>
                  <input
                    type="email"
                    value={editedBranch.default_reply_to || ''}
                    onChange={(e) => setEditedBranch({ ...editedBranch, default_reply_to: e.target.value })}
                    placeholder="reply@example.com"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-700">
          <div>
            {selectedBranch.type === 'external' && (
              <button
                onClick={handleArchive}
                disabled={isSaving}
                className="px-4 py-2 rounded-lg border border-red-500/50 text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-2 disabled:opacity-50 text-sm"
              >
                <Archive className="w-4 h-4" />
                Archive Branch
              </button>
            )}
          </div>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
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
          <h1 className="text-3xl font-black text-emerald-400 flex items-center gap-3">
            <GitBranch className="w-8 h-8 text-emerald-500" />
            Branch Registry
          </h1>
          <p className="text-slate-300 mt-1">Manage your data sources and brand identities</p>
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
        <div className="bg-slate-800 rounded-[2rem] p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Total Branches</p>
          <p className="text-3xl font-black text-white mt-1">{stats.total}</p>
        </div>
        <div className="bg-slate-800 rounded-[2rem] p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Internal</p>
          <p className="text-3xl font-black text-blue-400 mt-1">{stats.internal}</p>
        </div>
        <div className="bg-slate-800 rounded-[2rem] p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">External</p>
          <p className="text-3xl font-black text-purple-400 mt-1">{stats.external}</p>
        </div>
        <div className="bg-slate-800 rounded-[2rem] p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400">Active</p>
          <p className="text-3xl font-black text-emerald-400 mt-1">{stats.active}</p>
        </div>
      </div>

      {/* Branch Grid */}
      {branches.length === 0 ? (
        <div className="bg-slate-800 rounded-[3rem] p-12 text-center">
          <GitBranch className="w-16 h-16 text-slate-500 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">No branches yet</h3>
          <p className="text-slate-300 mb-6">Create your first branch to start organizing your data sources.</p>
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
          <div className="bg-slate-800 rounded-2xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-700">
                  <th className="text-left px-6 py-4 text-xs font-bold uppercase tracking-widest text-slate-400">Name</th>
                  <th className="text-left px-6 py-4 text-xs font-bold uppercase tracking-widest text-slate-400">Slug</th>
                  <th className="text-left px-6 py-4 text-xs font-bold uppercase tracking-widest text-slate-400">Type</th>
                  <th className="text-left px-6 py-4 text-xs font-bold uppercase tracking-widest text-slate-400">Status</th>
                </tr>
              </thead>
              <tbody>
                {branches
                  .slice((currentPage - 1) * pageSize, currentPage * pageSize)
                  .map((branch) => (
                  <tr
                    key={branch.id}
                    onClick={() => handleSelectBranch(branch)}
                    className="border-b border-slate-700/50 hover:bg-slate-700/50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4">
                      <span className="text-white font-medium">{branch.name}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-slate-300">/{branch.slug}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-bold uppercase rounded ${
                        branch.type === 'internal'
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'bg-purple-500/20 text-purple-400'
                      }`}>
                        {branch.type === 'internal' ? <Building2 className="w-3 h-3" /> : <ExternalLink className="w-3 h-3" />}
                        {branch.type}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-block px-2 py-1 text-xs font-bold uppercase rounded ${
                        branch.is_active
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-slate-600 text-slate-400'
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
              <p className="text-sm text-slate-400">
                Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, branches.length)} of {branches.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="px-4 py-2 rounded-lg bg-slate-700 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-600 transition-colors"
                >
                  Previous
                </button>
                <span className="text-slate-300 px-3">
                  Page {currentPage} of {Math.ceil(branches.length / pageSize)}
                </span>
                <button
                  onClick={() => setCurrentPage(p => Math.min(Math.ceil(branches.length / pageSize), p + 1))}
                  disabled={currentPage >= Math.ceil(branches.length / pageSize)}
                  className="px-4 py-2 rounded-lg bg-slate-700 text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-600 transition-colors"
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
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 rounded-[2rem] p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-black text-white mb-6 flex items-center gap-3">
              <Plus className="w-6 h-6 text-emerald-500" />
              Create Branch
            </h2>

            <div className="space-y-4">
              {/* Name (Required) */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
                  Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={newBranch.name || ''}
                  onChange={(e) => setNewBranch({ ...newBranch, name: e.target.value })}
                  placeholder="My Branch"
                  className="w-full px-4 py-3 bg-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Type */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
                  Type
                </label>
                <select
                  value={newBranch.type || 'external'}
                  onChange={(e) => setNewBranch({ ...newBranch, type: e.target.value as 'internal' | 'external' })}
                  className="w-full px-4 py-3 bg-slate-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                >
                  <option value="internal">Internal</option>
                  <option value="external">External</option>
                </select>
              </div>

              {/* Tagline */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
                  Tagline
                </label>
                <input
                  type="text"
                  value={newBranch.tagline || ''}
                  onChange={(e) => setNewBranch({ ...newBranch, tagline: e.target.value })}
                  placeholder="Your catchy tagline..."
                  className="w-full px-4 py-3 bg-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Website URL */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
                  Website URL
                </label>
                <input
                  type="url"
                  value={newBranch.website_url || ''}
                  onChange={(e) => setNewBranch({ ...newBranch, website_url: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-4 py-3 bg-slate-800 rounded-xl text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Primary Color */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-slate-500 mb-2">
                  Primary Color
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={newBranch.primary_color || '#10b981'}
                    onChange={(e) => setNewBranch({ ...newBranch, primary_color: e.target.value })}
                    className="w-12 h-12 rounded-xl cursor-pointer border-0"
                  />
                  <input
                    type="text"
                    value={newBranch.primary_color || '#10b981'}
                    onChange={(e) => setNewBranch({ ...newBranch, primary_color: e.target.value })}
                    className="flex-1 px-4 py-3 bg-slate-800 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 mt-8">
              <button
                onClick={() => setIsCreating(false)}
                className="px-6 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={isSaving || !newBranch.name?.trim()}
                className="px-6 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-white font-bold transition-colors disabled:opacity-50 flex items-center gap-2"
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
