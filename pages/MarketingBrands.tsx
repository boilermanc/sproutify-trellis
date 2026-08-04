import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Palette,
  Plus,
  Pencil,
  Trash2,
  Building2,
  Globe,
  Tag,
  Users,
  Sparkles,
  X,
  Loader2,
  ChevronDown,
  Mail,
  MapPin,
  Phone,
} from 'lucide-react';
import { MarketingBrand, BranchContext } from '../types';
import { marketingBrandService } from '../services/marketingBrandService';
import { formatBranchName } from '../utils';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */

interface MarketingBrandsProps {
  branchContext: BranchContext;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

/* ------------------------------------------------------------------ */
/*  Form defaults                                                      */
/* ------------------------------------------------------------------ */

const EMPTY_FORM = {
  branch_id: '',
  name: '',
  industry: '',
  description: '',
  target_audience: '',
  tone: '',
  value_proposition: '',
  website_url: '',
  legal_name: '',
  contact_email: '',
  contact_phone: '',
  address_line_1: '',
  address_line_2: '',
  city: '',
  state_region: '',
  postal_code: '',
  country_code: 'US',
  primary_color: '#10b981',
  keywords: '',
  competitors: '',
};

type FormData = typeof EMPTY_FORM;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function MarketingBrands({
  branchContext,
  addToast,
}: MarketingBrandsProps) {
  const [brands, setBrands] = useState<MarketingBrand[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingBrand, setEditingBrand] = useState<MarketingBrand | null>(null);
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  /* ---- branch helpers ---- */

  const branchMap = useMemo(() => {
    return branchContext.allBranches.reduce(
      (acc, b) => {
        acc[b.id] = b;
        acc[b.slug] = b;
        return acc;
      },
      {} as Record<string, (typeof branchContext.allBranches)[number]>,
    );
  }, [branchContext.allBranches]);

  const activeBranchIds = useMemo(() => {
    if (branchContext.isAllSelected)
      return branchContext.allBranches.map((b) => b.id);
    return branchContext.allBranches
      .filter((b) => branchContext.activeBranchSlugs.includes(b.slug))
      .map((b) => b.id);
  }, [branchContext.isAllSelected, branchContext.allBranches, branchContext.activeBranchSlugs]);

  /* ---- data loading ---- */

  const loadBrands = useCallback(async () => {
    setIsLoading(true);
    try {
      const all = await marketingBrandService.getAllBrands();
      setBrands(all);
    } catch (err) {
      console.error('Failed to load brands', err);
      addToast('Failed to load brand profiles.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    loadBrands();
  }, [loadBrands]);

  /* ---- escape key dismiss ---- */

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowCreateModal(false);
        setEditingBrand(null);
      }
    };
    if (showCreateModal) window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [showCreateModal]);

  /* ---- filtered brands ---- */

  const filteredBrands = useMemo(() => {
    return brands.filter((b) => activeBranchIds.includes(b.branch_id));
  }, [brands, activeBranchIds]);

  const availableCreateBranches = useMemo(() => {
    const configuredBranchIds = new Set(brands.map((brand) => brand.branch_id));
    return branchContext.allBranches.filter(
      (branch) => branch.is_active && !configuredBranchIds.has(branch.id),
    );
  }, [brands, branchContext.allBranches]);

  /* ---- form helpers ---- */

  const openCreate = () => {
    if (availableCreateBranches.length === 0) {
      addToast('Every active branch already has a brand profile.', 'info');
      return;
    }
    setEditingBrand(null);
    setFormData({
      ...EMPTY_FORM,
      branch_id:
        availableCreateBranches.length === 1 ? availableCreateBranches[0].id : '',
    });
    setShowCreateModal(true);
  };

  const openEdit = (brand: MarketingBrand) => {
    setEditingBrand(brand);
    setFormData({
      branch_id: brand.branch_id,
      name: brand.name,
      industry: brand.industry ?? '',
      description: brand.description ?? '',
      target_audience: brand.target_audience ?? '',
      tone: brand.tone ?? '',
      value_proposition: brand.value_proposition ?? '',
      website_url: brand.website_url ?? '',
      legal_name: brand.legal_name ?? '',
      contact_email: brand.contact_email ?? '',
      contact_phone: brand.contact_phone ?? '',
      address_line_1: brand.address_line_1 ?? '',
      address_line_2: brand.address_line_2 ?? '',
      city: brand.city ?? '',
      state_region: brand.state_region ?? '',
      postal_code: brand.postal_code ?? '',
      country_code: brand.country_code ?? 'US',
      primary_color: brand.primary_color ?? '#10b981',
      keywords: (brand.keywords ?? []).join(', '),
      competitors: (brand.competitors ?? []).join(', '),
    });
    setShowCreateModal(true);
  };

  const closeModal = () => {
    setShowCreateModal(false);
    setEditingBrand(null);
    setFormData(EMPTY_FORM);
  };

  const handleChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      addToast('Brand name is required.', 'error');
      return;
    }
    if (!formData.branch_id) {
      addToast('Please select a branch.', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        branch_id: formData.branch_id,
        name: formData.name.trim(),
        industry: formData.industry.trim() || undefined,
        description: formData.description.trim() || undefined,
        target_audience: formData.target_audience.trim() || undefined,
        tone: formData.tone.trim() || undefined,
        value_proposition: formData.value_proposition.trim() || undefined,
        website_url: formData.website_url.trim() || undefined,
        legal_name: formData.legal_name.trim() || undefined,
        contact_email: formData.contact_email.trim() || undefined,
        contact_phone: formData.contact_phone.trim() || undefined,
        address_line_1: formData.address_line_1.trim() || undefined,
        address_line_2: formData.address_line_2.trim() || undefined,
        city: formData.city.trim() || undefined,
        state_region: formData.state_region.trim() || undefined,
        postal_code: formData.postal_code.trim() || undefined,
        country_code: formData.country_code.trim().toUpperCase() || 'US',
        primary_color: formData.primary_color,
        keywords: formData.keywords
          .split(',')
          .map((k) => k.trim())
          .filter(Boolean),
        competitors: formData.competitors
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean),
        metadata: editingBrand ? editingBrand.metadata : {},
      };

      if (editingBrand) {
        await marketingBrandService.updateBrand(editingBrand.id, payload);
        addToast(`Updated "${payload.name}".`, 'success');
      } else {
        await marketingBrandService.createBrand(payload);
        addToast(`Created "${payload.name}".`, 'success');
      }
      closeModal();
      await loadBrands();
    } catch (err) {
      console.error('Save failed', err);
      addToast('Failed to save brand.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  /* ---- delete ---- */

  const handleDelete = async (brand: MarketingBrand) => {
    if (!window.confirm(`Are you sure you want to delete "${brand.name}"?`))
      return;
    setDeletingId(brand.id);
    try {
      await marketingBrandService.deleteBrand(brand.id);
      addToast(`Deleted "${brand.name}".`, 'success');
      await loadBrands();
    } catch (err) {
      console.error('Delete failed', err);
      addToast('Failed to delete brand.', 'error');
    } finally {
      setDeletingId(null);
    }
  };

  /* ---- branch display ---- */

  const getBranchLabel = (branchId: string) => {
    const branch = branchMap[branchId];
    return branch ? formatBranchName(branch.slug) : branchId;
  };

  const getBranchColor = (branchId: string) => {
    return branchMap[branchId]?.primary_color ?? '#64748b';
  };

  const formatCompanyAddress = (brand: MarketingBrand) => {
    if (!brand.address_line_1 && !brand.city) return '';
    const locality = [brand.city, brand.state_region, brand.postal_code]
      .filter(Boolean)
      .join(', ')
      .replace(/, ([^,]+)$/, ' $1');
    return [brand.address_line_1, brand.address_line_2, locality, brand.country_code]
      .filter(Boolean)
      .join(', ');
  };

  /* ================================================================ */
  /*  Render                                                           */
  /* ================================================================ */

  return (
    <div className="space-y-8">
      {/* ---- Header ---- */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
            <Palette size={28} className="text-emerald-600" />
            Brand Profiles
          </h2>
          <p className="text-sm text-slate-500 mt-1 font-medium">
            Manage brand identities for AI-powered campaign generation
          </p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-emerald-600/20 transition-all"
        >
          <Plus size={16} />
          New Brand
        </button>
      </div>

      {/* ---- Loading ---- */}
      {isLoading && (
        <div className="flex items-center justify-center py-32">
          <Loader2 size={32} className="text-emerald-600 animate-spin" />
        </div>
      )}

      {/* ---- Empty state ---- */}
      {!isLoading && filteredBrands.length === 0 && (
        <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-16 text-center">
          <div className="w-20 h-20 bg-emerald-50 rounded-[1.5rem] flex items-center justify-center mx-auto mb-6">
            <Sparkles size={36} className="text-emerald-500" />
          </div>
          <h3 className="text-lg font-black text-slate-800 mb-2">
            Create your first brand profile
          </h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto mb-8">
            Brand profiles power AI-generated campaigns with your voice, audience, and identity baked in.
          </p>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-8 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-widest rounded-2xl shadow-lg shadow-emerald-600/20 transition-all"
          >
            <Plus size={16} />
            New Brand
          </button>
        </div>
      )}

      {/* ---- Brand Grid ---- */}
      {!isLoading && filteredBrands.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredBrands.map((brand) => (
            <div
              key={brand.id}
              className="bg-white rounded-[2rem] border border-slate-200 shadow-sm hover:shadow-md transition-shadow p-7 flex flex-col"
            >
              {/* Card header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-4 h-4 rounded-full shrink-0"
                    style={{
                      backgroundColor: brand.primary_color,
                      boxShadow: `0 0 0 2px white, 0 0 0 4px ${brand.primary_color}`,
                    }}
                  />
                  <h3 className="text-base font-black text-slate-800 truncate">
                    {brand.name}
                  </h3>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  <button
                    onClick={() => openEdit(brand)}
                    className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition"
                    title="Edit brand"
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    onClick={() => handleDelete(brand)}
                    disabled={deletingId === brand.id}
                    className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition disabled:opacity-40"
                    title="Delete brand"
                  >
                    {deletingId === brand.id ? (
                      <Loader2 size={15} className="animate-spin" />
                    ) : (
                      <Trash2 size={15} />
                    )}
                  </button>
                </div>
              </div>

              {/* Branch badge */}
              <div className="mb-3">
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider"
                  style={{
                    backgroundColor: getBranchColor(brand.branch_id) + '18',
                    color: getBranchColor(brand.branch_id),
                  }}
                >
                  <div
                    className="w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: getBranchColor(brand.branch_id) }}
                  />
                  {getBranchLabel(brand.branch_id)}
                </span>
              </div>

              {/* Industry */}
              {brand.industry && (
                <div className="flex items-center gap-2 text-xs text-slate-500 font-bold mb-2">
                  <Building2 size={13} className="text-slate-400" />
                  {brand.industry}
                </div>
              )}

              {/* Description */}
              {brand.description && (
                <p className="text-sm text-slate-600 leading-relaxed mb-4 line-clamp-2">
                  {brand.description}
                </p>
              )}

              <div className="space-y-2 mb-4">
                {brand.contact_email && (
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                    <Mail size={13} className="text-slate-400" />
                    <span className="truncate">{brand.contact_email}</span>
                  </div>
                )}
                {brand.contact_phone && (
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-500">
                    <Phone size={13} className="text-slate-400" />
                    <span>{brand.contact_phone}</span>
                  </div>
                )}
                {formatCompanyAddress(brand) ? (
                  <div className="flex items-start gap-2 text-xs font-bold text-slate-500">
                    <MapPin size={13} className="text-slate-400 mt-0.5 shrink-0" />
                    <span>{formatCompanyAddress(brand)}</span>
                  </div>
                ) : (
                  <button
                    onClick={() => openEdit(brand)}
                    className="flex items-center gap-2 text-xs font-black text-amber-700 hover:text-amber-800"
                  >
                    <MapPin size={13} />
                    Add mailing address
                  </button>
                )}
              </div>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Stats row */}
              <div className="flex items-center gap-4 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-1.5 text-xs text-slate-500 font-bold">
                  <Tag size={12} className="text-emerald-500" />
                  {brand.keywords?.length ?? 0} keywords
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-500 font-bold">
                  <Users size={12} className="text-violet-500" />
                  {brand.competitors?.length ?? 0} competitors
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ================================================================ */}
      {/*  Create / Edit Slide-over                                        */}
      {/* ================================================================ */}
      {showCreateModal && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-40"
            onClick={closeModal}
          />

          {/* Panel */}
          <div className="fixed top-0 right-0 h-full w-full max-w-xl bg-white shadow-2xl z-50 animate-in slide-in-from-right duration-300 flex flex-col">
            {/* Header */}
            <div className="p-8 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="font-black text-slate-800 uppercase tracking-widest text-xs">
                {editingBrand ? 'Edit Brand' : 'New Brand'}
              </h3>
              <button
                onClick={closeModal}
                className="p-2 text-slate-400 hover:text-slate-900 bg-slate-50 rounded-xl transition"
              >
                <X size={20} />
              </button>
            </div>

            {/* Scrollable body */}
            <div className="p-8 space-y-6 flex-1 overflow-y-auto custom-scrollbar">
              {/* Branch selector */}
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">
                  Branch *
                </span>
                <div className="relative">
                  <select
                    name="branch_id"
                    value={formData.branch_id}
                    onChange={handleChange}
                    disabled={!!editingBrand}
                    className="w-full appearance-none px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition pr-10"
                  >
                    <option value="">Select a branch…</option>
                    {(editingBrand
                      ? branchContext.allBranches.filter((b) => b.is_active)
                      : availableCreateBranches
                    )
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          {formatBranchName(b.slug)}
                        </option>
                      ))}
                  </select>
                  <ChevronDown
                    size={16}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                  />
                </div>
              </label>

              {/* Name */}
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">
                  Brand Name *
                </span>
                <input
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="e.g. Sproutify Organic"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition"
                />
              </label>

              {/* Industry */}
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">
                  Industry
                </span>
                <input
                  name="industry"
                  value={formData.industry}
                  onChange={handleChange}
                  placeholder="e.g. Organic Agriculture"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition"
                />
              </label>

              {/* Description */}
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">
                  Description
                </span>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleChange}
                  rows={3}
                  placeholder="Brief overview of the brand…"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition resize-none"
                />
              </label>

              {/* Target Audience */}
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">
                  Target Audience
                </span>
                <textarea
                  name="target_audience"
                  value={formData.target_audience}
                  onChange={handleChange}
                  rows={2}
                  placeholder="Who is this brand speaking to?"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition resize-none"
                />
              </label>

              {/* Brand Voice / Tone */}
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">
                  Brand Voice / Tone
                </span>
                <input
                  name="tone"
                  value={formData.tone}
                  onChange={handleChange}
                  placeholder="Professional yet earthy and encouraging"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition"
                />
              </label>

              {/* Value Proposition */}
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">
                  Value Proposition
                </span>
                <textarea
                  name="value_proposition"
                  value={formData.value_proposition}
                  onChange={handleChange}
                  rows={2}
                  placeholder="What makes this brand unique?"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition resize-none"
                />
              </label>

              {/* Website URL */}
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">
                  Website URL
                </span>
                <div className="relative">
                  <Globe
                    size={15}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    name="website_url"
                    value={formData.website_url}
                    onChange={handleChange}
                    placeholder="https://example.com"
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition"
                  />
                </div>
              </label>

              <div className="pt-2 border-t border-slate-100">
                <h4 className="text-xs font-black uppercase tracking-widest text-slate-800">
                  Company &amp; Compliance
                </h4>
                <p className="text-xs text-slate-500 mt-1">
                  Used for sender identity, campaign contact information, and required email footers.
                </p>
              </div>

              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">
                  Legal Company Name
                </span>
                <input
                  name="legal_name"
                  value={formData.legal_name}
                  onChange={handleChange}
                  placeholder="Registered business or organization name"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition"
                />
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">
                    Contact Email
                  </span>
                  <input
                    type="email"
                    name="contact_email"
                    value={formData.contact_email}
                    onChange={handleChange}
                    placeholder="hello@example.com"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">
                    Contact Phone
                  </span>
                  <input
                    type="tel"
                    name="contact_phone"
                    value={formData.contact_phone}
                    onChange={handleChange}
                    placeholder="(404) 555-0123"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition"
                  />
                </label>
              </div>

              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">
                  Mailing Address
                </span>
                <input
                  name="address_line_1"
                  value={formData.address_line_1}
                  onChange={handleChange}
                  placeholder="Street address or P.O. box"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition"
                />
                <input
                  name="address_line_2"
                  value={formData.address_line_2}
                  onChange={handleChange}
                  placeholder="Suite, unit, or attention line"
                  className="w-full mt-2 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition"
                />
              </label>

              <div className="grid grid-cols-2 gap-4">
                <label className="block col-span-2 sm:col-span-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">
                    City
                  </span>
                  <input
                    name="city"
                    value={formData.city}
                    onChange={handleChange}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">
                    State / Region
                  </span>
                  <input
                    name="state_region"
                    value={formData.state_region}
                    onChange={handleChange}
                    placeholder="GA"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">
                    Postal Code
                  </span>
                  <input
                    name="postal_code"
                    value={formData.postal_code}
                    onChange={handleChange}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition"
                  />
                </label>
                <label className="block">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">
                    Country Code
                  </span>
                  <input
                    name="country_code"
                    value={formData.country_code}
                    onChange={handleChange}
                    maxLength={2}
                    placeholder="US"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold uppercase text-slate-800 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition"
                  />
                </label>
              </div>

              {/* Primary Color */}
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">
                  Primary Color
                </span>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    name="primary_color"
                    value={formData.primary_color}
                    onChange={handleChange}
                    className="w-12 h-12 rounded-xl border border-slate-200 cursor-pointer p-1"
                  />
                  <span className="text-sm font-bold text-slate-600 uppercase">
                    {formData.primary_color}
                  </span>
                </div>
              </label>

              {/* Keywords */}
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">
                  Keywords
                </span>
                <input
                  name="keywords"
                  value={formData.keywords}
                  onChange={handleChange}
                  placeholder="organic, sustainable, farm-to-table"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Comma-separated
                </span>
              </label>

              {/* Competitors */}
              <label className="block">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5 block">
                  Competitors
                </span>
                <input
                  name="competitors"
                  value={formData.competitors}
                  onChange={handleChange}
                  placeholder="Brand A, Brand B, Brand C"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Comma-separated
                </span>
              </label>
            </div>

            {/* Footer */}
            <div className="p-8 border-t border-slate-100 flex items-center justify-end gap-3 shrink-0">
              <button
                onClick={closeModal}
                className="px-6 py-3 text-xs font-black uppercase tracking-widest text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="flex items-center gap-2 px-8 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-widest rounded-xl shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-50"
              >
                {isSaving && <Loader2 size={14} className="animate-spin" />}
                {editingBrand ? 'Save Changes' : 'Create Brand'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
