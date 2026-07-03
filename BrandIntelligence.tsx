import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BrandIdentity, BrandAnalysisState, GeneratedBrandAsset, BranchContext, EmailTemplate } from './types';
import { MOCK_BRAND_IDENTITIES } from './constants';
import { extractBrandFromUrl, generateBrandFromDescription } from './brandService';
import { parseCSS, suggestColorRoles } from './cssParser';
import {
  fetchAllBrands,
  createBrand,
  updateBrand,
  archiveBrand,
  activateBrand,
  deleteBrand,
  fetchAssetsByBrand,
  fetchTemplatesForBranch,
  upsertTemplate,
  deleteTemplate as deleteTemplateFromDb
} from './brandRepository';
import {
  Dna, Globe, Palette, Type, Target, Megaphone, Sparkles,
  ArrowRight, ArrowLeft, RefreshCw, Loader2, CheckCircle2, AlertCircle,
  ChevronDown, Eye, Edit3, Save, X, Instagram, Linkedin,
  Facebook, Twitter, Video, Plus, ExternalLink, Copy, Upload,
  Image as ImageIcon, Settings, Archive, Trash2, RotateCcw,
  Mail, Code, FileText
} from 'lucide-react';
import { supabase } from './supabaseService';
import EmailEditor, { EditorRef, EmailEditorProps } from 'react-email-editor';

interface BrandIntelligenceProps {
  onBrandUpdate?: (brand: BrandIdentity) => void;
  geminiApiKey?: string;
  branchContext?: BranchContext;
}

const FALLBACK_SITES = ['farm.sproutify.app', 'school.sproutify.app', 'micro.sproutify.app', 'letsrejoice.app', 'atlurbanfarms.com'];

const BrandIntelligence: React.FC<BrandIntelligenceProps> = ({ onBrandUpdate, geminiApiKey = '', branchContext }) => {
  const branchSlugs = branchContext?.allBranches.map(b => b.slug) || FALLBACK_SITES;
  // Email templates are keyed by the stable branch UUID; resolve the
  // (now-immutable) slug to it, normalizing slug/domain/hyphen variants.
  const resolveBranchId = (slug: string) => {
    const norm = (s: string) => (s || '').toLowerCase().replace(/\.(com|app|io|net|org)$/, '').replace(/[^a-z0-9]/g, '');
    const target = norm(slug);
    return branchContext?.allBranches.find(b => norm(b.slug) === target)?.id || slug;
  };
  // State
  const [brands, setBrands] = useState<BrandIdentity[]>(MOCK_BRAND_IDENTITIES);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [analysisState, setAnalysisState] = useState<BrandAnalysisState>('idle');
  const [error, setError] = useState<string | null>(null);

  // Input mode
  const [inputMode, setInputMode] = useState<'url' | 'description' | 'manual'>('url');
  const [urlInput, setUrlInput] = useState('');
  const [descriptionInput, setDescriptionInput] = useState('');
  const [targetBranch, setTargetBranch] = useState<string>(branchSlugs[0] || '');

  // Manual upload state
  const [uploadedLogo, setUploadedLogo] = useState<string | null>(null);
  const [uploadedIcon, setUploadedIcon] = useState<string | null>(null);
  const [parsedColors, setParsedColors] = useState<string[]>([]);
  const [parsedFonts, setParsedFonts] = useState<string[]>([]);
  const [manualColors, setManualColors] = useState({
    primary: '#3B82F6',
    secondary: '#6B7280',
    accent: '#F59E0B',
    neutral: '#F3F4F6'
  });
  const [manualFonts, setManualFonts] = useState({
    heading: 'Inter',
    body: 'Inter'
  });
  const [messagingUrl, setMessagingUrl] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualTagline, setManualTagline] = useState('');

  // Preview state
  const [previewBrand, setPreviewBrand] = useState<BrandIdentity | null>(null);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);

  // Management state
  const [isLoading, setIsLoading] = useState(true);
  const [editingBrand, setEditingBrand] = useState<BrandIdentity | null>(null);
  const [brandAssets, setBrandAssets] = useState<Record<string, GeneratedBrandAsset[]>>({});
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [viewingBrand, setViewingBrand] = useState<BrandIdentity | null>(null);
  const [activeTab, setActiveTab] = useState<'create' | 'manage' | 'templates'>('create');

  // Email Templates state
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateDescription, setTemplateDescription] = useState('');
  const [templateHtml, setTemplateHtml] = useState('');
  const [templateBranchFilter, setTemplateBranchFilter] = useState<string>(branchSlugs[0] || '');
  const [templateDirty, setTemplateDirty] = useState(false);
  const [templateSaving, setTemplateSaving] = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [codeMode, setCodeMode] = useState(false); // paste-raw-HTML mode vs Unlayer visual editor
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const htmlTextareaRef = useRef<HTMLTextAreaElement>(null);
  const emailEditorRef = useRef<EditorRef>(null);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [galleryImages, setGalleryImages] = useState<{ url: string; name: string }[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(false);
  const [galleryUploading, setGalleryUploading] = useState(false);

  // Load brands from Supabase on mount
  useEffect(() => {
    const loadBrands = async () => {
      setIsLoading(true);
      try {
        const data = await fetchAllBrands();
        setBrands(data.length > 0 ? data : MOCK_BRAND_IDENTITIES);
      } catch (err) {
        console.error('Failed to load brands:', err);
        setBrands(MOCK_BRAND_IDENTITIES);
      } finally {
        setIsLoading(false);
      }
    };
    loadBrands();
  }, []);

  // Load templates when branch filter changes
  const loadTemplates = useCallback(async (branchId: string) => {
    setTemplateLoading(true);
    try {
      const data = await fetchTemplatesForBranch(branchId);
      setTemplates(data);
    } catch (err) {
      console.error('Failed to load templates:', err);
      setTemplates([]);
    } finally {
      setTemplateLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'templates' && templateBranchFilter) {
      loadTemplates(resolveBranchId(templateBranchFilter));
    }
  }, [activeTab, templateBranchFilter, loadTemplates, branchContext]);

  // Debounce HTML preview
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPreviewHtml(templateHtml);
    }, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [templateHtml]);

  // Generate starter HTML scaffold from active brand
  const generateStarterHtml = useCallback((branchId: string): string => {
    const brand = brands.find(b => b.branch_id === branchId && b.status === 'active');
    const primaryColor = brand?.color_palette.primary || '#059669';
    const accentColor = brand?.color_palette.accent || '#F59E0B';
    const headingFont = brand?.typography.heading || 'Inter';
    const bodyFont = brand?.typography.body || 'Inter';
    const brandName = brand?.name || 'Your Brand';

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <style>
    body { font-family: ${bodyFont}, Arial, sans-serif; margin: 0; padding: 0; background: #f5f5f5; }
    .container { max-width: 600px; margin: 0 auto; background: white; }
    .header { background: ${primaryColor}; padding: 32px 40px; text-align: center; }
    .header img { height: 48px; }
    .body { padding: 40px; }
    .headline { font-family: ${headingFont}, Arial, sans-serif; font-size: 28px; color: #1a1a1a; margin-bottom: 16px; }
    .body-copy { font-size: 16px; color: #444; line-height: 1.6; }
    .cta { display: inline-block; margin-top: 32px; padding: 14px 32px; background: ${accentColor}; color: white; text-decoration: none; border-radius: 8px; font-weight: bold; }
    .footer { padding: 24px 40px; text-align: center; font-size: 11px; color: #999; border-top: 1px solid #eee; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <img src="{{logo_url}}" alt="${brandName}">
    </div>
    <div class="body">
      <h1 class="headline">{{headline}}</h1>
      <div class="body-copy">{{body_copy}}</div>
      <a href="{{cta_url}}" class="cta">{{cta_text}}</a>
    </div>
    <div class="footer">
      You're receiving this because you subscribed to ${brandName} updates.<br>
      <a href="{{unsubscribe_url}}" style="color:#999;">Unsubscribe</a>
    </div>
  </div>
</body>
</html>`;
  }, [brands]);

  // Template editor helpers
  const handleNewTemplate = () => {
    setSelectedTemplate(null);
    setTemplateName('');
    setTemplateDescription('');
    setTemplateHtml(generateStarterHtml(templateBranchFilter));
    setTemplateDirty(true);
  };

  const handleSelectTemplate = (tmpl: EmailTemplate) => {
    setSelectedTemplate(tmpl);
    setTemplateName(tmpl.name);
    setTemplateDescription(tmpl.description || '');
    setTemplateHtml(tmpl.html_body);
    setTemplateDirty(false);
    setTimeout(() => {
      if (emailEditorRef.current?.editor && tmpl.html_body) {
        try {
          const design = JSON.parse(tmpl.html_body);
          emailEditorRef.current.editor.loadDesign(design);
        } catch {
          // Plain HTML template — load as body
          emailEditorRef.current.editor.loadDesign({
            body: { rows: [], values: { backgroundColor: '#f1f5f9' } }
          });
        }
      }
    }, 300);
  };

  const handleSaveTemplate = async () => {
    if (!templateName.trim()) return;
    setTemplateSaving(true);
    try {
      // Code mode saves the raw pasted HTML directly; visual mode exports Unlayer's HTML.
      const exportedHtml = codeMode ? templateHtml : await new Promise<string>((resolve) => {
        if (emailEditorRef.current?.editor) {
          emailEditorRef.current.editor.exportHtml((data) => resolve(data.html));
        } else {
          resolve(templateHtml);
        }
      });
      setTemplateHtml(exportedHtml);
      const payload: Partial<EmailTemplate> = {
        ...(selectedTemplate?.id ? { id: selectedTemplate.id } : {}),
        branch_id: resolveBranchId(templateBranchFilter),
        brand_identity_id: brands.find(b => b.branch_id === templateBranchFilter && b.status === 'active')?.id,
        name: templateName.trim(),
        description: templateDescription.trim() || undefined,
        html_body: exportedHtml,
      };
      const saved = await upsertTemplate(payload);
      setSelectedTemplate(saved);
      setTemplateDirty(false);
      await loadTemplates(resolveBranchId(templateBranchFilter));
    } catch (err) {
      console.error('Failed to save template:', err);
    } finally {
      setTemplateSaving(false);
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      await deleteTemplateFromDb(id);
      if (selectedTemplate?.id === id) {
        setSelectedTemplate(null);
        setTemplateName('');
        setTemplateDescription('');
        setTemplateHtml('');
        setTemplateDirty(false);
      }
      await loadTemplates(resolveBranchId(templateBranchFilter));
    } catch (err) {
      console.error('Failed to delete template:', err);
    }
  };

  const insertTokenAtCursor = (token: string) => {
    const ta = htmlTextareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = templateHtml.substring(0, start);
    const after = templateHtml.substring(end);
    const newHtml = before + token + after;
    setTemplateHtml(newHtml);
    setTemplateDirty(true);
    requestAnimationFrame(() => {
      ta.selectionStart = ta.selectionEnd = start + token.length;
      ta.focus();
    });
  };

  const handleTemplateImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const filePath = `templates/${templateBranchFilter}/${Date.now()}_${file.name}`;
    const { error: uploadError } = await supabase.storage
      .from('email-assets')
      .upload(filePath, file, { upsert: true });
    if (uploadError) {
      console.error('Upload failed:', uploadError);
      return;
    }
    const { data } = supabase.storage.from('email-assets').getPublicUrl(filePath);
    if (data?.publicUrl) {
      insertTokenAtCursor(`<img src="${data.publicUrl}" alt="" style="max-width:100%;height:auto;" />`);
    }
  };

  const loadGallery = async () => {
    if (!templateBranchFilter) return;
    setGalleryLoading(true);
    try {
      const { data, error } = await supabase.storage
        .from('email-assets')
        .list(`${templateBranchFilter}/gallery`, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });
      if (error) throw error;
      const images = (data || [])
        .filter(f => f.name !== '.emptyFolderPlaceholder')
        .map(f => {
          const { data: urlData } = supabase.storage
            .from('email-assets')
            .getPublicUrl(`${templateBranchFilter}/gallery/${f.name}`);
          return { url: urlData.publicUrl, name: f.name };
        });
      setGalleryImages(images);
    } catch (err) {
      console.error('Failed to load gallery:', err);
    } finally {
      setGalleryLoading(false);
    }
  };

  const handleGalleryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !templateBranchFilter) return;
    setGalleryUploading(true);
    try {
      const path = `${templateBranchFilter}/gallery/${Date.now()}_${file.name}`;
      const { error } = await supabase.storage.from('email-assets').upload(path, file, { upsert: true });
      if (error) throw error;
      await loadGallery();
    } catch (err) {
      console.error('Gallery upload failed:', err);
    } finally {
      setGalleryUploading(false);
      e.target.value = '';
    }
  };

  const handleGalleryDeleteImage = async (name: string) => {
    if (!templateBranchFilter) return;
    await supabase.storage.from('email-assets').remove([`${templateBranchFilter}/gallery/${name}`]);
    await loadGallery();
  };

  const insertGalleryImage = (url: string) => {
    emailEditorRef.current?.editor?.loadDesign({
      body: { rows: [] }
    });
    // Copy URL to clipboard as fallback
    navigator.clipboard.writeText(url);
    setGalleryOpen(false);
  };

  // Get active brand for a branch
  const getActiveBrand = (branchId: string) =>
    brands.find(b => b.branch_id === branchId && b.status === 'active');

  // Branches without active brands
  const branchesWithoutBrands = branchSlugs.filter(site => !getActiveBrand(site));

  // Handle URL analysis
  const handleAnalyzeUrl = async () => {
    if (!urlInput.trim()) return;

    setAnalysisState('analyzing_site');
    setError(null);

    // Show screenshot preview immediately
    const formattedUrl = urlInput.startsWith('http') ? urlInput : `https://${urlInput}`;
    setScreenshotUrl(`https://s0.wp.com/mshots/v1/${encodeURIComponent(formattedUrl)}?w=1024&h=768`);

    try {
      const brandData = await extractBrandFromUrl(urlInput, targetBranch, geminiApiKey);
      const newBrand: BrandIdentity = {
        ...brandData,
        id: `brand_${Date.now()}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      setPreviewBrand(newBrand);
      setAnalysisState('results');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
      setAnalysisState('error');
    }
  };

  // Handle description generation
  const handleGenerateFromDescription = async () => {
    if (!descriptionInput.trim()) return;

    setAnalysisState('generating_strategy');
    setError(null);
    setScreenshotUrl(null);

    try {
      const brandData = await generateBrandFromDescription(descriptionInput, targetBranch, geminiApiKey);
      const newBrand: BrandIdentity = {
        ...brandData,
        id: `brand_${Date.now()}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      setPreviewBrand(newBrand);
      setAnalysisState('results');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
      setAnalysisState('error');
    }
  };

  // Save brand to Supabase
  const handleSaveBrand = async () => {
    if (!previewBrand) return;

    setIsLoading(true);
    try {
      // Create brand in Supabase (without id, created_at, updated_at)
      const { id, created_at, updated_at, ...brandData } = previewBrand;
      const savedBrand = await createBrand(brandData);

      // Activate the brand (archives any existing active brand for this branch)
      const activatedBrand = await activateBrand(savedBrand.id, savedBrand.branch_id);

      // Refresh brands list
      const allBrands = await fetchAllBrands();
      setBrands(allBrands);

      onBrandUpdate?.(activatedBrand);
      handleReset();
      setActiveTab('manage');
    } catch (err) {
      console.error('Failed to save brand:', err);
      setError(err instanceof Error ? err.message : 'Failed to save brand');
    } finally {
      setIsLoading(false);
    }
  };

  // Reset to idle
  const handleReset = () => {
    setAnalysisState('idle');
    setPreviewBrand(null);
    setScreenshotUrl(null);
    setUrlInput('');
    setDescriptionInput('');
    setError(null);
  };

  // ════════════════════════════════════════════════════════════════
  // MANAGEMENT FUNCTIONS
  // ════════════════════════════════════════════════════════════════

  const handleEditBrand = async (brand: BrandIdentity) => {
    setEditingBrand({ ...brand });
    // Load assets for this brand
    try {
      const assets = await fetchAssetsByBrand(brand.id);
      setBrandAssets(prev => ({ ...prev, [brand.id]: assets }));
    } catch (err) {
      console.error('Failed to load brand assets:', err);
    }
  };

  const handleUpdateBrand = async () => {
    if (!editingBrand) return;

    setIsLoading(true);
    try {
      await updateBrand(editingBrand.id, editingBrand);
      const allBrands = await fetchAllBrands();
      setBrands(allBrands);
      // Refresh detail view if viewing this brand
      if (viewingBrand?.id === editingBrand.id) {
        const updated = allBrands.find(b => b.id === editingBrand.id);
        if (updated) setViewingBrand(updated);
      }
      setEditingBrand(null);
    } catch (err) {
      console.error('Failed to update brand:', err);
      setError(err instanceof Error ? err.message : 'Failed to update brand');
    } finally {
      setIsLoading(false);
    }
  };

  const handleArchiveBrand = async (id: string) => {
    setIsLoading(true);
    try {
      await archiveBrand(id);
      const allBrands = await fetchAllBrands();
      setBrands(allBrands);
    } catch (err) {
      console.error('Failed to archive brand:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteBrand = async (id: string) => {
    setIsLoading(true);
    try {
      await deleteBrand(id);
      const allBrands = await fetchAllBrands();
      setBrands(allBrands);
      setShowDeleteConfirm(null);
    } catch (err) {
      console.error('Failed to delete brand:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReactivateBrand = async (id: string, branchId: string) => {
    setIsLoading(true);
    try {
      await activateBrand(id, branchId);
      const allBrands = await fetchAllBrands();
      setBrands(allBrands);
    } catch (err) {
      console.error('Failed to reactivate brand:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle CSS file upload
  const handleCSSUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const parsed = parseCSS(content);
      setParsedColors(parsed.colors);
      setParsedFonts(parsed.fonts);

      // Auto-suggest color roles
      const suggested = suggestColorRoles(parsed.colors);
      setManualColors(suggested);

      // Use first parsed font for headings, second for body
      if (parsed.fonts.length > 0) {
        setManualFonts({
          heading: parsed.fonts[0],
          body: parsed.fonts[1] || parsed.fonts[0]
        });
      }
    };
    reader.readAsText(file);
  };

  // Handle image upload (logo or icon)
  const handleImageUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (value: string | null) => void
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setter(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Handle manual upload submission - scan URL for messaging only
  const handleManualSubmit = async () => {
    setAnalysisState('generating_strategy');
    setError(null);

    try {
      // If URL provided, fetch messaging from it
      let messaging = {
        mission: '',
        values: [] as string[],
        target_audience: '',
        voice: '',
        marketing_hooks: [] as string[],
        site_preview_description: ''
      };

      if (messagingUrl.trim()) {
        const ai = new (await import('@google/genai')).GoogleGenAI({
          apiKey: geminiApiKey
        });

        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: `Analyze the website at "${messagingUrl}" and extract ONLY the messaging/copy:
            - Mission statement or core purpose
            - Brand values (3-5)
            - Target audience description
            - Brand voice/tone
            - Marketing hooks (3 compelling angles)
            - Site description (1 sentence)

            Return as JSON with keys: mission, values, targetAudience, voice, marketingHooks, sitePreviewDescription`,
          config: {
            responseMimeType: "application/json"
          }
        });

        const parsed = JSON.parse(response.text || '{}');
        messaging = {
          mission: parsed.mission || '',
          values: parsed.values || [],
          target_audience: parsed.targetAudience || '',
          voice: parsed.voice || '',
          marketing_hooks: parsed.marketingHooks || [],
          site_preview_description: parsed.sitePreviewDescription || ''
        };
      }

      // Build brand from manual inputs + AI messaging
      const newBrand: BrandIdentity = {
        id: `brand_${Date.now()}`,
        branch_id: targetBranch,
        name: manualName || 'Unnamed Brand',
        tagline: manualTagline || '',
        mission: messaging.mission,
        values: messaging.values,
        target_audience: messaging.target_audience,
        voice: messaging.voice,
        website_url: messagingUrl || undefined,
        screenshot_url: messagingUrl ? `https://s0.wp.com/mshots/v1/${encodeURIComponent(messagingUrl.startsWith('http') ? messagingUrl : 'https://' + messagingUrl)}?w=1280&h=960` : undefined,
        color_palette: manualColors,
        typography: manualFonts,
        image_prompt: `Professional brand imagery for ${manualName}, using colors ${manualColors.primary} and ${manualColors.accent}`,
        marketing_hooks: messaging.marketing_hooks,
        site_preview_description: messaging.site_preview_description,
        extracted_images: [uploadedLogo, uploadedIcon].filter(Boolean) as string[],
        status: 'draft',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      setPreviewBrand(newBrand);
      setAnalysisState('results');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to process');
      setAnalysisState('error');
    }
  };

  // Color swatch component
  const ColorSwatch = ({ color, label }: { color: string; label: string }) => (
    <div className="flex items-center gap-3">
      <div
        className="w-10 h-10 rounded-xl shadow-inner border border-white/20"
        style={{ backgroundColor: color }}
      />
      <div>
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
        <p className="text-xs font-mono text-slate-600">{color}</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-8 min-h-screen pb-40">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-4 bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl shadow-lg">
            <Dna className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight">Brand Intelligence</h1>
            <p className="text-sm text-slate-500">Extract and manage Brand DNA for each branch</p>
          </div>
        </div>
      </div>

      {/* Loading Overlay */}
      {isLoading && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl p-8 shadow-2xl flex items-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-violet-600" />
            <span className="text-lg font-bold text-slate-700">Processing...</span>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      {analysisState === 'idle' && (
        <div className="flex bg-slate-100 p-1.5 rounded-2xl w-fit">
          <button
            onClick={() => { handleReset(); setActiveTab('create'); setViewingBrand(null); }}
            className={`px-8 py-3 rounded-xl text-sm font-black uppercase tracking-wider transition-all ${
              activeTab === 'create'
                ? 'bg-white text-violet-600 shadow-md'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Plus className="w-4 h-4 inline mr-2" />
            Create New
          </button>
          <button
            onClick={() => { setActiveTab('manage'); setViewingBrand(null); }}
            className={`px-8 py-3 rounded-xl text-sm font-black uppercase tracking-wider transition-all ${
              activeTab === 'manage'
                ? 'bg-white text-violet-600 shadow-md'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Settings className="w-4 h-4 inline mr-2" />
            Manage ({brands.filter(b => b.status === 'active').length})
          </button>
          <button
            onClick={() => { setActiveTab('templates'); setViewingBrand(null); }}
            className={`px-8 py-3 rounded-xl text-sm font-black uppercase tracking-wider transition-all ${
              activeTab === 'templates'
                ? 'bg-white text-violet-600 shadow-md'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Mail className="w-4 h-4 inline mr-2" />
            Email Templates
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* IDLE STATE - CREATE TAB */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {analysisState === 'idle' && activeTab === 'create' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Input Form */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-8">
              <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-3">
                <Sparkles className="w-6 h-6 text-violet-500" />
                Extract Brand DNA
              </h2>

              {/* Mode Toggle */}
              <div className="flex bg-slate-100 p-1.5 rounded-2xl w-fit mb-8">
                <button
                  onClick={() => setInputMode('url')}
                  className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                    inputMode === 'url'
                      ? 'bg-white text-violet-600 shadow-md'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Globe className="w-4 h-4 inline mr-2" />
                  From Website
                </button>
                <button
                  onClick={() => setInputMode('description')}
                  className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                    inputMode === 'description'
                      ? 'bg-white text-violet-600 shadow-md'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Type className="w-4 h-4 inline mr-2" />
                  From Description
                </button>
                <button
                  onClick={() => setInputMode('manual')}
                  className={`px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all ${
                    inputMode === 'manual'
                      ? 'bg-white text-violet-600 shadow-md'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <Upload className="w-4 h-4 inline mr-2" />
                  Manual Upload
                </button>
              </div>

              {/* Target Branch Selector */}
              <div className="mb-6">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                  Target Branch
                </label>
                <select
                  value={targetBranch}
                  onChange={(e) => setTargetBranch(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-violet-500 outline-none"
                >
                  {branchSlugs.map(site => (
                    <option key={site} value={site}>
                      {site} {getActiveBrand(site) ? '(has brand)' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* URL Input */}
              {inputMode === 'url' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                      Website URL
                    </label>
                    <input
                      type="text"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      placeholder="https://example.com"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-4 text-lg font-medium text-slate-700 focus:ring-2 focus:ring-violet-500 outline-none"
                    />
                  </div>
                  <button
                    onClick={handleAnalyzeUrl}
                    disabled={!urlInput.trim()}
                    className="w-full py-5 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-2xl font-black text-lg flex items-center justify-center gap-3 shadow-xl shadow-violet-500/20 hover:shadow-violet-500/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Analyze & Extract <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
              )}

              {/* Description Input */}
              {inputMode === 'description' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                      Describe Your Brand
                    </label>
                    <textarea
                      value={descriptionInput}
                      onChange={(e) => setDescriptionInput(e.target.value)}
                      placeholder="A sustainable urban farming company focused on community education..."
                      rows={5}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-4 text-base font-medium text-slate-700 focus:ring-2 focus:ring-violet-500 outline-none resize-none"
                    />
                  </div>
                  <button
                    onClick={handleGenerateFromDescription}
                    disabled={!descriptionInput.trim()}
                    className="w-full py-5 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-2xl font-black text-lg flex items-center justify-center gap-3 shadow-xl shadow-violet-500/20 hover:shadow-violet-500/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Generate Brand DNA <Sparkles className="w-5 h-5" />
                  </button>
                </div>
              )}

              {/* Manual Upload */}
              {inputMode === 'manual' && (
                <div className="space-y-6">
                  {/* Brand Name & Tagline */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                        Brand Name *
                      </label>
                      <input
                        type="text"
                        value={manualName}
                        onChange={(e) => setManualName(e.target.value)}
                        placeholder="Your Brand"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-violet-500 outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                        Tagline
                      </label>
                      <input
                        type="text"
                        value={manualTagline}
                        onChange={(e) => setManualTagline(e.target.value)}
                        placeholder="Your catchy tagline"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-violet-500 outline-none"
                      />
                    </div>
                  </div>

                  {/* File Uploads */}
                  <div className="grid grid-cols-3 gap-4">
                    {/* CSS Upload */}
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                        CSS File
                      </label>
                      <label className="flex flex-col items-center justify-center h-32 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:border-violet-400 hover:bg-violet-50/50 transition-all">
                        <Upload className="w-6 h-6 text-slate-400 mb-2" />
                        <span className="text-xs text-slate-500 font-medium">
                          {parsedColors.length > 0 ? `${parsedColors.length} colors found` : 'Upload CSS'}
                        </span>
                        <input type="file" accept=".css" onChange={handleCSSUpload} className="hidden" />
                      </label>
                    </div>

                    {/* Logo Upload */}
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                        Logo
                      </label>
                      <label className="flex flex-col items-center justify-center h-32 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:border-violet-400 hover:bg-violet-50/50 transition-all overflow-hidden">
                        {uploadedLogo ? (
                          <img src={uploadedLogo} alt="Logo" className="w-full h-full object-contain p-2" />
                        ) : (
                          <>
                            <ImageIcon className="w-6 h-6 text-slate-400 mb-2" />
                            <span className="text-xs text-slate-500 font-medium">Upload Logo</span>
                          </>
                        )}
                        <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, setUploadedLogo)} className="hidden" />
                      </label>
                    </div>

                    {/* Icon Upload */}
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                        Icon/Favicon
                      </label>
                      <label className="flex flex-col items-center justify-center h-32 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:border-violet-400 hover:bg-violet-50/50 transition-all overflow-hidden">
                        {uploadedIcon ? (
                          <img src={uploadedIcon} alt="Icon" className="w-full h-full object-contain p-2" />
                        ) : (
                          <>
                            <ImageIcon className="w-6 h-6 text-slate-400 mb-2" />
                            <span className="text-xs text-slate-500 font-medium">Upload Icon</span>
                          </>
                        )}
                        <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, setUploadedIcon)} className="hidden" />
                      </label>
                    </div>
                  </div>

                  {/* Color Palette */}
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                      Color Palette {parsedColors.length > 0 && <span className="text-violet-500">(auto-detected)</span>}
                    </label>
                    <div className="grid grid-cols-4 gap-4">
                      {(['primary', 'secondary', 'accent', 'neutral'] as const).map((role) => (
                        <div key={role} className="space-y-2">
                          <label className="block text-[10px] font-bold text-slate-500 capitalize">{role}</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={manualColors[role]}
                              onChange={(e) => setManualColors(prev => ({ ...prev, [role]: e.target.value }))}
                              className="w-10 h-10 rounded-lg cursor-pointer border border-slate-200"
                            />
                            <input
                              type="text"
                              value={manualColors[role]}
                              onChange={(e) => setManualColors(prev => ({ ...prev, [role]: e.target.value }))}
                              className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-mono"
                            />
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Parsed colors preview */}
                    {parsedColors.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className="text-[10px] text-slate-400 font-medium">All detected:</span>
                        {parsedColors.slice(0, 12).map((color, i) => (
                          <button
                            key={i}
                            onClick={() => {
                              // Click to set as primary
                              setManualColors(prev => ({ ...prev, primary: color }));
                            }}
                            className="w-6 h-6 rounded border border-slate-200 hover:scale-110 transition-transform"
                            style={{ backgroundColor: color }}
                            title={color}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Typography */}
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                      Typography {parsedFonts.length > 0 && <span className="text-violet-500">(auto-detected)</span>}
                    </label>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-1">Heading Font</label>
                        <input
                          type="text"
                          value={manualFonts.heading}
                          onChange={(e) => setManualFonts(prev => ({ ...prev, heading: e.target.value }))}
                          placeholder="Inter"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-1">Body Font</label>
                        <input
                          type="text"
                          value={manualFonts.body}
                          onChange={(e) => setManualFonts(prev => ({ ...prev, body: e.target.value }))}
                          placeholder="Inter"
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium"
                        />
                      </div>
                    </div>

                    {/* Parsed fonts preview */}
                    {parsedFonts.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {parsedFonts.map((font, i) => (
                          <button
                            key={i}
                            onClick={() => setManualFonts(prev => ({ ...prev, heading: font }))}
                            className="px-3 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-medium hover:bg-violet-100 hover:text-violet-700 transition-colors"
                          >
                            {font}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Website URL for messaging */}
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                      Website URL <span className="text-slate-300">(optional - for AI messaging extraction)</span>
                    </label>
                    <input
                      type="text"
                      value={messagingUrl}
                      onChange={(e) => setMessagingUrl(e.target.value)}
                      placeholder="https://yoursite.com"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 focus:ring-2 focus:ring-violet-500 outline-none"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">AI will scan this URL to extract mission, values, and marketing copy</p>
                  </div>

                  {/* Submit */}
                  <button
                    onClick={handleManualSubmit}
                    disabled={!manualName.trim()}
                    className="w-full py-5 bg-gradient-to-r from-violet-600 to-purple-600 text-white rounded-2xl font-black text-lg flex items-center justify-center gap-3 shadow-xl shadow-violet-500/20 hover:shadow-violet-500/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {messagingUrl ? 'Build Brand DNA with AI Messaging' : 'Build Brand DNA'}
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right: Existing Brands */}
          <div className="space-y-6">
            <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-6">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider mb-4 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                Active Brand DNA
              </h3>
              <div className="space-y-3">
                {brands.filter(b => b.status === 'active').map(brand => (
                  <div
                    key={brand.id}
                    onClick={() => { setActiveTab('manage'); setViewingBrand(brand); }}
                    className="p-4 bg-slate-50 rounded-xl border border-slate-100 hover:border-violet-300 transition-all cursor-pointer group"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div
                        className="w-8 h-8 rounded-lg"
                        style={{ backgroundColor: brand.color_palette.primary }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate">{brand.name}</p>
                        <p className="text-[10px] text-slate-500 font-mono">{brand.branch_id}</p>
                      </div>
                      <Eye className="w-4 h-4 text-slate-300 group-hover:text-violet-500 transition-colors" />
                    </div>
                  </div>
                ))}
                {brands.filter(b => b.status === 'active').length === 0 && (
                  <p className="text-sm text-slate-400 italic text-center py-4">No brands configured yet</p>
                )}
              </div>
            </div>

            {branchesWithoutBrands.length > 0 && (
              <div className="bg-amber-50 rounded-2xl border border-amber-200 p-4">
                <p className="text-xs font-bold text-amber-800 mb-2">Missing Brand DNA:</p>
                <div className="flex flex-wrap gap-2">
                  {branchesWithoutBrands.map(site => (
                    <span key={site} className="text-[10px] font-mono bg-amber-100 text-amber-700 px-2 py-1 rounded-lg">
                      {site}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* IDLE STATE - MANAGE TAB */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {analysisState === 'idle' && activeTab === 'manage' && !viewingBrand && (
        <div className="space-y-8">
          {/* Active Brands */}
          <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-8">
            <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-3">
              <CheckCircle2 className="w-6 h-6 text-emerald-500" />
              Active Brand DNA
            </h2>

            {brands.filter(b => b.status === 'active').length === 0 ? (
              <div className="text-center py-12">
                <Dna className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-500">No active brands. Create one to get started.</p>
                <button
                  onClick={() => setActiveTab('create')}
                  className="mt-4 px-6 py-2 bg-violet-600 text-white rounded-xl font-bold text-sm"
                >
                  Create Brand
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {brands.filter(b => b.status === 'active').map(brand => (
                  <div
                    key={brand.id}
                    onClick={() => setViewingBrand(brand)}
                    className="p-6 bg-slate-50 rounded-2xl border border-slate-100 hover:border-violet-300 transition-all group cursor-pointer"
                  >
                    <div className="flex items-start gap-4 mb-4">
                      <div
                        className="w-12 h-12 rounded-xl shadow-inner"
                        style={{ backgroundColor: brand.color_palette.primary }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-lg font-bold text-slate-800 truncate">{brand.name}</p>
                        <p className="text-[10px] text-slate-500 font-mono">{brand.branch_id}</p>
                      </div>
                    </div>

                    {brand.tagline && (
                      <p className="text-sm text-slate-600 italic mb-4 line-clamp-2">"{brand.tagline}"</p>
                    )}

                    <div className="flex items-center gap-2 pt-4 border-t border-slate-200">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleEditBrand(brand); }}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:border-violet-300 hover:text-violet-600 transition-colors"
                      >
                        <Edit3 className="w-3 h-3" /> Edit
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleArchiveBrand(brand.id); }}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:border-amber-300 hover:text-amber-600 transition-colors"
                      >
                        <Archive className="w-3 h-3" /> Archive
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Archived Brands */}
          {brands.filter(b => b.status === 'archived').length > 0 && (
            <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-8">
              <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-3">
                <Archive className="w-6 h-6 text-slate-400" />
                Archived Brands
              </h2>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {brands.filter(b => b.status === 'archived').map(brand => (
                  <div
                    key={brand.id}
                    className="p-6 bg-slate-100 rounded-2xl border border-slate-200 opacity-75 hover:opacity-100 transition-all"
                  >
                    <div className="flex items-start gap-4 mb-4">
                      <div
                        className="w-12 h-12 rounded-xl shadow-inner grayscale"
                        style={{ backgroundColor: brand.color_palette.primary }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-lg font-bold text-slate-600 truncate">{brand.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{brand.branch_id}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-4 border-t border-slate-200">
                      <button
                        onClick={() => handleReactivateBrand(brand.id, brand.branch_id)}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:border-emerald-300 hover:text-emerald-600 transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" /> Reactivate
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(brand.id)}
                        className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:border-red-300 hover:text-red-600 transition-colors"
                      >
                        <Trash2 className="w-3 h-3" /> Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* BRAND DETAIL VIEW */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {analysisState === 'idle' && activeTab === 'manage' && viewingBrand && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Actions Bar */}
          <div className="flex items-center justify-between bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <button
              onClick={() => setViewingBrand(null)}
              className="flex items-center gap-2 px-4 py-2 text-slate-500 hover:text-slate-700 font-bold text-sm transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Brands
            </button>
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                {viewingBrand.branch_id}
              </span>
              <button
                onClick={() => handleEditBrand(viewingBrand)}
                className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-bold hover:border-violet-300 hover:text-violet-600 transition-colors"
              >
                <Edit3 className="w-4 h-4" /> Edit
              </button>
              <button
                onClick={() => { handleArchiveBrand(viewingBrand.id); setViewingBrand(null); }}
                className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-sm font-bold hover:border-amber-300 hover:text-amber-600 transition-colors"
              >
                <Archive className="w-4 h-4" /> Archive
              </button>
            </div>
          </div>

          {/* Brand DNA Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column */}
            <div className="lg:col-span-7 space-y-6">
              {/* Name & Tagline */}
              <div className="bg-white rounded-[2rem] border border-slate-200 p-8 shadow-sm">
                <div className="flex items-center gap-4 mb-3">
                  <div
                    className="w-14 h-14 rounded-2xl shadow-inner border border-white/20"
                    style={{ backgroundColor: viewingBrand.color_palette.primary }}
                  />
                  <div>
                    <h2 className="text-4xl font-black text-slate-800">{viewingBrand.name}</h2>
                    {viewingBrand.tagline && (
                      <p className="text-xl text-slate-500 italic mt-1">"{viewingBrand.tagline}"</p>
                    )}
                  </div>
                </div>
                {viewingBrand.website_url && (
                  <a
                    href={viewingBrand.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 mt-4 text-sm text-violet-600 hover:text-violet-700 font-medium"
                  >
                    <ExternalLink className="w-4 h-4" />
                    {viewingBrand.website_url}
                  </a>
                )}
              </div>

              {/* Mission & Values */}
              <div className="bg-white rounded-[2rem] border border-slate-200 p-8 shadow-sm">
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Target className="w-4 h-4" /> Mission & Values
                </h3>
                {viewingBrand.mission ? (
                  <p className="text-lg text-slate-700 leading-relaxed mb-6">{viewingBrand.mission}</p>
                ) : (
                  <p className="text-sm text-slate-400 italic mb-6">No mission statement set</p>
                )}
                {viewingBrand.values && viewingBrand.values.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {viewingBrand.values.map((value, i) => (
                      <span
                        key={i}
                        className="px-4 py-2 bg-slate-100 text-slate-700 rounded-full text-sm font-bold"
                      >
                        {value}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Marketing Hooks */}
              {viewingBrand.marketing_hooks && viewingBrand.marketing_hooks.length > 0 && (
                <div className="bg-white rounded-[2rem] border border-slate-200 p-8 shadow-sm">
                  <h3 className="text-sm font-black text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Megaphone className="w-4 h-4" /> Marketing Hooks
                  </h3>
                  <div className="space-y-4">
                    {viewingBrand.marketing_hooks.map((hook, i) => (
                      <div key={i} className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                        <span className="text-[10px] font-mono text-violet-500 mb-1 block">HOOK_{String(i + 1).padStart(2, '0')}</span>
                        <p className="text-slate-700 font-medium italic">"{hook}"</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Image Prompt */}
              {viewingBrand.image_prompt && (
                <div className="bg-white rounded-[2rem] border border-slate-200 p-8 shadow-sm">
                  <h3 className="text-sm font-black text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <ImageIcon className="w-4 h-4" /> Image Generation Prompt
                  </h3>
                  <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 p-4 rounded-xl border border-slate-100 font-mono">
                    {viewingBrand.image_prompt}
                  </p>
                </div>
              )}
            </div>

            {/* Right Column */}
            <div className="lg:col-span-5 space-y-6">
              {/* Screenshot */}
              {viewingBrand.screenshot_url && (
                <div className="bg-white rounded-[2rem] border border-slate-200 overflow-hidden shadow-sm">
                  <img
                    src={viewingBrand.screenshot_url}
                    alt="Website screenshot"
                    className="w-full aspect-video object-cover object-top"
                  />
                </div>
              )}

              {/* Color Palette */}
              <div className="bg-white rounded-[2rem] border border-slate-200 p-6 shadow-sm">
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Palette className="w-4 h-4" /> Color Palette
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <ColorSwatch color={viewingBrand.color_palette.primary} label="Primary" />
                  <ColorSwatch color={viewingBrand.color_palette.secondary} label="Secondary" />
                  <ColorSwatch color={viewingBrand.color_palette.accent} label="Accent" />
                  <ColorSwatch color={viewingBrand.color_palette.neutral} label="Neutral" />
                </div>
              </div>

              {/* Typography */}
              <div className="bg-white rounded-[2rem] border border-slate-200 p-6 shadow-sm">
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Type className="w-4 h-4" /> Typography
                </h3>
                <div className="space-y-4">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Headings</p>
                    <p className="text-2xl font-bold text-slate-800">{viewingBrand.typography.heading}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Body</p>
                    <p className="text-lg text-slate-600">{viewingBrand.typography.body}</p>
                  </div>
                </div>
              </div>

              {/* Voice & Audience */}
              <div className="bg-white rounded-[2rem] border border-slate-200 p-6 shadow-sm">
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-wider mb-4">Brand Voice</h3>
                {viewingBrand.voice ? (
                  <p className="text-sm text-slate-600 leading-relaxed mb-4">{viewingBrand.voice}</p>
                ) : (
                  <p className="text-sm text-slate-400 italic mb-4">No voice defined</p>
                )}
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-wider mb-2 mt-6">Target Audience</h3>
                {viewingBrand.target_audience ? (
                  <p className="text-sm text-slate-600 leading-relaxed">{viewingBrand.target_audience}</p>
                ) : (
                  <p className="text-sm text-slate-400 italic">No target audience defined</p>
                )}
              </div>

              {/* Extracted Images */}
              {viewingBrand.extracted_images && viewingBrand.extracted_images.length > 0 && (
                <div className="bg-white rounded-[2rem] border border-slate-200 p-6 shadow-sm">
                  <h3 className="text-sm font-black text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <ImageIcon className="w-4 h-4" /> Extracted Images
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {viewingBrand.extracted_images.map((img, i) => (
                      <img
                        key={i}
                        src={img}
                        alt={`Extracted ${i + 1}`}
                        className="w-full h-24 object-cover rounded-xl border border-slate-100"
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Metadata */}
              <div className="bg-slate-50 rounded-2xl border border-slate-100 p-6">
                <div className="grid grid-cols-2 gap-4 text-sm font-mono text-slate-500">
                  <div>
                    <span className="font-bold uppercase">Created</span>
                    <p>{new Date(viewingBrand.created_at).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <span className="font-bold uppercase">Updated</span>
                    <p>{new Date(viewingBrand.updated_at).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <span className="font-bold uppercase">Status</span>
                    <p className="text-emerald-500 font-bold">{viewingBrand.status}</p>
                  </div>
                  <div>
                    <span className="font-bold uppercase">ID</span>
                    <p className="truncate">{viewingBrand.id}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* IDLE STATE - EMAIL TEMPLATES TAB */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {analysisState === 'idle' && activeTab === 'templates' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Panel — Template List */}
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                  <Mail className="w-5 h-5 text-violet-500" />
                  Email Templates
                </h2>
                <button
                  onClick={handleNewTemplate}
                  className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 text-white rounded-xl text-xs font-black hover:bg-violet-500 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> New Template
                </button>
              </div>

              {/* Branch Filter */}
              <div className="mb-4">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Branch</label>
                <div className="relative">
                  <select
                    value={templateBranchFilter}
                    onChange={(e) => setTemplateBranchFilter(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold appearance-none cursor-pointer focus:border-violet-400 outline-none"
                  >
                    {branchSlugs.map(slug => (
                      <option key={slug} value={slug}>{slug}</option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {/* Template List */}
              {templateLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
                </div>
              ) : templates.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm text-slate-500">No templates yet for this branch</p>
                  <button
                    onClick={handleNewTemplate}
                    className="mt-3 text-xs font-bold text-violet-600 hover:text-violet-700"
                  >
                    Create your first template
                  </button>
                </div>
              ) : (
                <div className="space-y-2 max-h-[500px] overflow-y-auto">
                  {templates.map(tmpl => (
                    <button
                      key={tmpl.id}
                      onClick={() => handleSelectTemplate(tmpl)}
                      className={`w-full text-left p-4 rounded-xl border transition-all ${
                        selectedTemplate?.id === tmpl.id
                          ? 'border-violet-400 bg-violet-50'
                          : 'border-slate-100 bg-slate-50 hover:border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-800 truncate">{tmpl.name}</p>
                          {tmpl.description && (
                            <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{tmpl.description}</p>
                          )}
                          <p className="text-[10px] text-slate-400 font-mono mt-1">
                            {new Date(tmpl.updated_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={(ev) => { ev.stopPropagation(); handleSelectTemplate(tmpl); }}
                            className="p-1.5 text-slate-400 hover:text-violet-600 transition-colors"
                            title="Edit"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(ev) => { ev.stopPropagation(); handleDeleteTemplate(tmpl.id); }}
                            className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Panel — Template Editor */}
          <div className="lg:col-span-8 space-y-4">
            {!templateName && !templateHtml && !selectedTemplate ? (
              <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-12 text-center">
                <Code className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <h3 className="text-xl font-black text-slate-800 mb-2">Template Editor</h3>
                <p className="text-sm text-slate-500 mb-6">Select a template from the list or create a new one to start editing.</p>
                <button
                  onClick={handleNewTemplate}
                  className="px-6 py-3 bg-violet-600 text-white rounded-xl font-bold text-sm hover:bg-violet-500 transition-colors"
                >
                  <Plus className="w-4 h-4 inline mr-2" /> New Template
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm">
                {/* Template Name & Description */}
                <div className="p-6 border-b border-slate-100 space-y-3">
                  <input
                    type="text"
                    placeholder="Template name"
                    value={templateName}
                    onChange={(e) => { setTemplateName(e.target.value); setTemplateDirty(true); }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold focus:bg-white focus:border-violet-400 outline-none transition-all"
                  />
                  <input
                    type="text"
                    placeholder="Description (optional)"
                    value={templateDescription}
                    onChange={(e) => { setTemplateDescription(e.target.value); setTemplateDirty(true); }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs focus:bg-white focus:border-violet-400 outline-none transition-all"
                  />
                </div>

                {/* Toolbar */}
                <div className="px-6 py-3 border-b border-slate-100 flex items-center gap-2 flex-wrap">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest mr-1">Tokens:</span>
                  {['{{first_name}}', '{{unsubscribe_url}}', '{{headline}}', '{{body_copy}}', '{{cta_text}}', '{{cta_url}}'].map(token => (
                    <button
                      key={token}
                      onClick={() => { if (codeMode) { insertTokenAtCursor(token); } else { navigator.clipboard.writeText(token); } }}
                      title={codeMode ? 'Insert at cursor' : 'Click to copy'}
                      className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-[9px] font-bold text-slate-600 hover:border-violet-400 hover:text-violet-600 transition-all font-mono"
                    >
                      {token}
                    </button>
                  ))}
                  <div className="ml-auto flex items-center gap-2">
                    <div className="flex rounded-lg overflow-hidden border border-slate-200">
                      <button onClick={() => setCodeMode(false)} className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-widest transition ${!codeMode ? 'bg-violet-600 text-white' : 'bg-white text-slate-500 hover:text-slate-700'}`}>Visual</button>
                      <button onClick={() => setCodeMode(true)} className={`px-3 py-1.5 text-[9px] font-black uppercase tracking-widest transition ${codeMode ? 'bg-violet-600 text-white' : 'bg-white text-slate-500 hover:text-slate-700'}`}>Code</button>
                    </div>
                    <button
                      onClick={() => { setGalleryOpen(true); loadGallery(); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 border border-violet-200 rounded-lg text-[9px] font-bold text-violet-600 hover:bg-violet-100 transition-all"
                    >
                      <ImageIcon className="w-3 h-3" /> Brand Gallery
                    </button>
                  </div>
                </div>

                {/* Editor: Visual (Unlayer) or Code (paste raw HTML + tokens) */}
                <div style={{ height: 'calc(100vh - 280px)', minHeight: 600 }}>
                  {codeMode ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 h-full">
                      <textarea
                        ref={htmlTextareaRef}
                        value={templateHtml}
                        onChange={(e) => { setTemplateHtml(e.target.value); setTemplateDirty(true); }}
                        spellCheck={false}
                        placeholder={'Paste your email HTML here. Put a token where you want a fill-in box in Compose:\n\n  {{headline}}   {{body_copy}}   {{cta_text}}   {{cta_url}}\n\n...plus {{first_name}} / {{unsubscribe_url}} for personalization. Click a token chip above to insert it at the cursor.'}
                        className="w-full h-full p-4 font-mono text-xs bg-slate-900 text-slate-100 resize-none outline-none leading-relaxed"
                      />
                      <iframe title="HTML preview" srcDoc={templateHtml} className="w-full h-full bg-white border-l border-slate-200" />
                    </div>
                  ) : (
                    <EmailEditor
                      ref={emailEditorRef}
                      onReady={() => {
                        if (selectedTemplate?.html_body) {
                          try {
                            const design = JSON.parse(selectedTemplate.html_body);
                            emailEditorRef.current?.editor?.loadDesign(design);
                          } catch {
                            emailEditorRef.current?.editor?.loadDesign({
                              body: { rows: [], values: { backgroundColor: '#f1f5f9' } }
                            });
                          }
                        }
                      }}
                      options={{
                        mergeTags: {
                          first_name: { name: 'First Name', value: '{{first_name}}' },
                          unsubscribe_url: { name: 'Unsubscribe URL', value: '{{unsubscribe_url}}' },
                          headline: { name: 'Headline', value: '{{headline}}' },
                          body_copy: { name: 'Body Copy', value: '{{body_copy}}' },
                          cta_text: { name: 'CTA Text', value: '{{cta_text}}' },
                          cta_url: { name: 'CTA URL', value: '{{cta_url}}' },
                        },
                        features: { stockImages: false, codeEditor: { enabled: true } },
                        tools: { image: { enabled: true } },
                        appearance: { theme: 'modern_light' },
                      }}
                    />
                  )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <div className="text-[10px] font-bold uppercase tracking-wider">
                    {templateSaving ? (
                      <span className="text-violet-500 flex items-center gap-1.5"><Loader2 className="w-3 h-3 animate-spin" /> Saving...</span>
                    ) : templateDirty ? (
                      <span className="text-amber-500">Unsaved changes</span>
                    ) : selectedTemplate ? (
                      <span className="text-emerald-500 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Saved</span>
                    ) : null}
                  </div>
                  <button
                    onClick={handleSaveTemplate}
                    disabled={!templateName.trim() || templateSaving}
                    className="flex items-center gap-2 px-6 py-2.5 bg-violet-600 text-white rounded-xl text-xs font-black hover:bg-violet-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Save className="w-3.5 h-3.5" /> Save Template
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Brand Image Gallery Drawer */}
      {galleryOpen && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setGalleryOpen(false)} />
          <div className="relative ml-auto w-full max-w-md bg-white h-full shadow-2xl flex flex-col">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest">Brand Gallery</h3>
                <p className="text-[10px] text-slate-400 mt-1">{templateBranchFilter}</p>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 px-3 py-2 bg-violet-600 text-white rounded-xl text-[10px] font-black cursor-pointer hover:bg-violet-500 transition-all">
                  {galleryUploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                  Upload
                  <input type="file" accept="image/*" className="hidden" onChange={handleGalleryUpload} disabled={galleryUploading} />
                </label>
                <button onClick={() => setGalleryOpen(false)} className="p-2 text-slate-400 hover:text-slate-600 transition">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {galleryLoading ? (
                <div className="flex items-center justify-center h-40">
                  <Loader2 className="w-6 h-6 text-violet-500 animate-spin" />
                </div>
              ) : galleryImages.length === 0 ? (
                <div className="text-center py-16">
                  <ImageIcon className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm text-slate-400 font-bold">No images yet</p>
                  <p className="text-[11px] text-slate-400 mt-1">Upload brand assets to use in templates</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {galleryImages.map(img => (
                    <div key={img.name} className="group relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50 aspect-video">
                      <img src={img.url} alt={img.name} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
                        <button
                          onClick={() => { navigator.clipboard.writeText(img.url); setGalleryOpen(false); }}
                          className="w-full px-3 py-1.5 bg-white text-slate-800 rounded-lg text-[9px] font-black uppercase tracking-wide hover:bg-violet-600 hover:text-white transition-all"
                        >
                          Copy URL
                        </button>
                        <button
                          onClick={() => handleGalleryDeleteImage(img.name)}
                          className="w-full px-3 py-1.5 bg-rose-500 text-white rounded-lg text-[9px] font-black uppercase tracking-wide hover:bg-rose-600 transition-all"
                        >
                          Delete
                        </button>
                      </div>
                      <p className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[8px] px-2 py-1 truncate">{img.name}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ANALYZING STATE */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {(analysisState === 'analyzing_site' || analysisState === 'generating_strategy') && (
        <div className="flex items-center justify-center min-h-[600px]">
          <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-[3rem] p-12 max-w-2xl w-full text-center shadow-2xl">
            <div className="space-y-6 mb-10">
              <h2 className="text-4xl font-black text-white">
                {analysisState === 'analyzing_site' ? 'Analyzing Website' : 'Generating Brand'}
              </h2>
              <p className="text-lg text-slate-400">Extracting your Business DNA...</p>
            </div>

            <div className="inline-flex items-center gap-3 px-6 py-3 bg-violet-500/20 text-violet-300 rounded-full font-bold mb-8">
              <Loader2 className="w-5 h-5 animate-spin" />
              {analysisState === 'analyzing_site' ? 'Scanning brand assets' : 'Crafting identity'}
            </div>

            {analysisState === 'analyzing_site' && (
              <div className="relative rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
                <div className="h-10 bg-slate-700 flex items-center px-4 gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                  <div className="flex-1 mx-4">
                    <div className="bg-slate-600 rounded-lg px-3 py-1 text-xs text-slate-400 font-mono truncate">
                      {urlInput}
                    </div>
                  </div>
                </div>
                {/* Branded scanning panel — no external screenshot service */}
                <div className="relative aspect-video bg-gradient-to-br from-slate-800 to-slate-900 flex items-center justify-center overflow-hidden">
                  <Globe className="w-16 h-16 text-violet-500/40 animate-pulse" />
                  <div className="absolute inset-x-0 top-0 h-1 bg-violet-500/60"
                       style={{ animation: 'scan 2s linear infinite' }} />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* ERROR STATE */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {analysisState === 'error' && (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="bg-white rounded-[2rem] border border-red-200 p-12 max-w-md text-center shadow-lg">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-2xl font-black text-slate-800 mb-2">Analysis Failed</h2>
            <p className="text-slate-500 mb-6">{error}</p>
            <button
              onClick={handleReset}
              className="px-8 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* RESULTS STATE */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {analysisState === 'results' && previewBrand && (
        <div className="space-y-8 animate-in fade-in duration-500">
          {/* Actions Bar */}
          <div className="flex items-center justify-between bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center gap-4">
              <button
                onClick={handleReset}
                className="flex items-center gap-2 px-4 py-2 text-slate-500 hover:text-slate-700 font-bold text-sm"
              >
                <X className="w-4 h-4" /> Discard
              </button>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-400 uppercase">
                Target: {previewBrand.branch_id}
              </span>
              <button
                onClick={handleSaveBrand}
                className="flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white rounded-xl font-black shadow-lg hover:bg-emerald-500 transition-colors"
              >
                <Save className="w-4 h-4" /> Save & Activate
              </button>
            </div>
          </div>

          {/* Brand DNA Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column */}
            <div className="lg:col-span-7 space-y-6">
              {/* Name & Tagline */}
              <div className="bg-white rounded-[2rem] border border-slate-200 p-8 shadow-sm">
                <h2 className="text-4xl font-black text-slate-800 mb-2">{previewBrand.name}</h2>
                <p className="text-xl text-slate-500 italic">"{previewBrand.tagline}"</p>
                {previewBrand.website_url && (
                  <a
                    href={previewBrand.website_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 mt-4 text-sm text-violet-600 hover:text-violet-700 font-medium"
                  >
                    <ExternalLink className="w-4 h-4" />
                    {previewBrand.website_url}
                  </a>
                )}
              </div>

              {/* Mission & Values */}
              <div className="bg-white rounded-[2rem] border border-slate-200 p-8 shadow-sm">
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Target className="w-4 h-4" /> Mission & Values
                </h3>
                <p className="text-lg text-slate-700 leading-relaxed mb-6">{previewBrand.mission}</p>
                <div className="flex flex-wrap gap-2">
                  {previewBrand.values.map((value, i) => (
                    <span
                      key={i}
                      className="px-4 py-2 bg-slate-100 text-slate-700 rounded-full text-sm font-bold"
                    >
                      {value}
                    </span>
                  ))}
                </div>
              </div>

              {/* Marketing Hooks */}
              <div className="bg-white rounded-[2rem] border border-slate-200 p-8 shadow-sm">
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Megaphone className="w-4 h-4" /> Marketing Hooks
                </h3>
                <div className="space-y-4">
                  {previewBrand.marketing_hooks.map((hook, i) => (
                    <div key={i} className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                      <span className="text-[10px] font-mono text-violet-500 mb-1 block">HOOK_{String(i + 1).padStart(2, '0')}</span>
                      <p className="text-slate-700 font-medium italic">"{hook}"</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column */}
            <div className="lg:col-span-5 space-y-6">
              {/* Screenshot */}
              {previewBrand.screenshot_url && (
                <div className="bg-white rounded-[2rem] border border-slate-200 overflow-hidden shadow-sm">
                  <img
                    src={previewBrand.screenshot_url}
                    alt="Website screenshot"
                    className="w-full aspect-video object-cover object-top"
                  />
                </div>
              )}

              {/* Color Palette */}
              <div className="bg-white rounded-[2rem] border border-slate-200 p-6 shadow-sm">
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Palette className="w-4 h-4" /> Color Palette
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <ColorSwatch color={previewBrand.color_palette.primary} label="Primary" />
                  <ColorSwatch color={previewBrand.color_palette.secondary} label="Secondary" />
                  <ColorSwatch color={previewBrand.color_palette.accent} label="Accent" />
                  <ColorSwatch color={previewBrand.color_palette.neutral} label="Neutral" />
                </div>
              </div>

              {/* Typography */}
              <div className="bg-white rounded-[2rem] border border-slate-200 p-6 shadow-sm">
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Type className="w-4 h-4" /> Typography
                </h3>
                <div className="space-y-4">
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Headings</p>
                    <p className="text-2xl font-bold text-slate-800">{previewBrand.typography.heading}</p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Body</p>
                    <p className="text-lg text-slate-600">{previewBrand.typography.body}</p>
                  </div>
                </div>
              </div>

              {/* Voice & Audience */}
              <div className="bg-white rounded-[2rem] border border-slate-200 p-6 shadow-sm">
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-wider mb-4">Brand Voice</h3>
                <p className="text-sm text-slate-600 leading-relaxed mb-4">{previewBrand.voice}</p>
                <h3 className="text-sm font-black text-slate-400 uppercase tracking-wider mb-2 mt-6">Target Audience</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{previewBrand.target_audience}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* EDIT BRAND MODAL */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {editingBrand && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-[2rem] max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-white border-b border-slate-200 p-6 flex items-center justify-between rounded-t-[2rem]">
              <h2 className="text-xl font-black text-slate-800">Edit Brand: {editingBrand.name}</h2>
              <button
                onClick={() => setEditingBrand(null)}
                className="p-2 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                    Brand Name
                  </label>
                  <input
                    type="text"
                    value={editingBrand.name}
                    onChange={(e) => setEditingBrand({ ...editingBrand, name: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                    Tagline
                  </label>
                  <input
                    type="text"
                    value={editingBrand.tagline}
                    onChange={(e) => setEditingBrand({ ...editingBrand, tagline: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm"
                  />
                </div>
              </div>

              {/* Mission */}
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                  Mission
                </label>
                <textarea
                  value={editingBrand.mission}
                  onChange={(e) => setEditingBrand({ ...editingBrand, mission: e.target.value })}
                  rows={3}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm resize-none"
                />
              </div>

              {/* Colors */}
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">
                  Color Palette
                </label>
                <div className="grid grid-cols-4 gap-4">
                  {(['primary', 'secondary', 'accent', 'neutral'] as const).map((role) => (
                    <div key={role} className="space-y-2">
                      <label className="block text-[10px] font-bold text-slate-500 capitalize">{role}</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={editingBrand.color_palette[role]}
                          onChange={(e) => setEditingBrand({
                            ...editingBrand,
                            color_palette: { ...editingBrand.color_palette, [role]: e.target.value }
                          })}
                          className="w-10 h-10 rounded-lg cursor-pointer border border-slate-200"
                        />
                        <input
                          type="text"
                          value={editingBrand.color_palette[role]}
                          onChange={(e) => setEditingBrand({
                            ...editingBrand,
                            color_palette: { ...editingBrand.color_palette, [role]: e.target.value }
                          })}
                          className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs font-mono"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Typography */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                    Heading Font
                  </label>
                  <input
                    type="text"
                    value={editingBrand.typography.heading}
                    onChange={(e) => setEditingBrand({
                      ...editingBrand,
                      typography: { ...editingBrand.typography, heading: e.target.value }
                    })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                    Body Font
                  </label>
                  <input
                    type="text"
                    value={editingBrand.typography.body}
                    onChange={(e) => setEditingBrand({
                      ...editingBrand,
                      typography: { ...editingBrand.typography, body: e.target.value }
                    })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm"
                  />
                </div>
              </div>

              {/* Voice */}
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                  Brand Voice
                </label>
                <textarea
                  value={editingBrand.voice}
                  onChange={(e) => setEditingBrand({ ...editingBrand, voice: e.target.value })}
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm resize-none"
                />
              </div>

              {/* Target Audience */}
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
                  Target Audience
                </label>
                <textarea
                  value={editingBrand.target_audience}
                  onChange={(e) => setEditingBrand({ ...editingBrand, target_audience: e.target.value })}
                  rows={2}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm resize-none"
                />
              </div>
            </div>

            <div className="sticky bottom-0 bg-white border-t border-slate-200 p-6 flex items-center justify-end gap-3 rounded-b-[2rem]">
              <button
                onClick={() => setEditingBrand(null)}
                className="px-6 py-3 text-slate-600 font-bold hover:text-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateBrand}
                className="px-8 py-3 bg-violet-600 text-white rounded-xl font-bold shadow-lg hover:bg-violet-500 transition-colors flex items-center gap-2"
              >
                <Save className="w-4 h-4" /> Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════ */}
      {/* DELETE CONFIRMATION MODAL */}
      {/* ══════════════════════════════════════════════════════════════ */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full shadow-2xl text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Trash2 className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-xl font-black text-slate-800 mb-2">Delete Brand?</h2>
            <p className="text-slate-500 mb-6">
              This will permanently delete the brand and all associated assets. This action cannot be undone.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setShowDeleteConfirm(null)}
                className="px-6 py-3 text-slate-600 font-bold hover:text-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleDeleteBrand(showDeleteConfirm)}
                className="px-8 py-3 bg-red-600 text-white rounded-xl font-bold shadow-lg hover:bg-red-500 transition-colors"
              >
                Delete Forever
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scan animation keyframes */}
      <style>{`
        @keyframes scan {
          0% { transform: translateY(0); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(300px); opacity: 0; }
        }
      `}</style>
    </div>
  );
};

export default BrandIntelligence;
