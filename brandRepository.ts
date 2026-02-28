import { supabase } from './supabaseService';
import { BrandIdentity, GeneratedBrandAsset, BrandColorPalette, BrandTypography, EmailTemplate } from './types';

// ═══════════════════════════════════════════════════════════════
// TYPE CONVERTERS (DB <-> App)
// ═══════════════════════════════════════════════════════════════

interface DbBrandIdentity {
  id: string;
  branch_id: string;
  name: string;
  tagline: string | null;
  mission: string | null;
  values: string[];
  target_audience: string | null;
  voice: string | null;
  website_url: string | null;
  screenshot_url: string | null;
  color_palette: BrandColorPalette;
  typography: BrandTypography;
  image_prompt: string | null;
  marketing_hooks: string[];
  site_preview_description: string | null;
  extracted_images: string[];
  status: 'draft' | 'active' | 'archived';
  created_at: string;
  updated_at: string;
}

interface DbBrandAsset {
  id: string;
  brand_id: string;
  asset_type: 'logo' | 'social' | 'banner' | 'mockup';
  platform: 'Instagram' | 'LinkedIn' | 'TikTok' | 'Facebook' | 'X' | null;
  asset_data: string | null;
  prompt_used: string | null;
  aspect_ratio: '1:1' | '16:9' | '9:16' | '4:5';
  created_at: string;
}

function dbToBrandIdentity(db: DbBrandIdentity): BrandIdentity {
  return {
    id: db.id,
    branch_id: db.branch_id,
    name: db.name,
    tagline: db.tagline || '',
    mission: db.mission || '',
    values: db.values || [],
    target_audience: db.target_audience || '',
    voice: db.voice || '',
    website_url: db.website_url || undefined,
    screenshot_url: db.screenshot_url || undefined,
    color_palette: db.color_palette,
    typography: db.typography,
    image_prompt: db.image_prompt || '',
    marketing_hooks: db.marketing_hooks || [],
    site_preview_description: db.site_preview_description || undefined,
    extracted_images: db.extracted_images || [],
    status: db.status,
    created_at: db.created_at,
    updated_at: db.updated_at
  };
}

function brandIdentityToDb(brand: Omit<BrandIdentity, 'id' | 'created_at' | 'updated_at'>): Omit<DbBrandIdentity, 'id' | 'created_at' | 'updated_at'> {
  return {
    branch_id: brand.branch_id,
    name: brand.name,
    tagline: brand.tagline || null,
    mission: brand.mission || null,
    values: brand.values,
    target_audience: brand.target_audience || null,
    voice: brand.voice || null,
    website_url: brand.website_url || null,
    screenshot_url: brand.screenshot_url || null,
    color_palette: brand.color_palette,
    typography: brand.typography,
    image_prompt: brand.image_prompt || null,
    marketing_hooks: brand.marketing_hooks,
    site_preview_description: brand.site_preview_description || null,
    extracted_images: brand.extracted_images || [],
    status: brand.status
  };
}

function dbToBrandAsset(db: DbBrandAsset): GeneratedBrandAsset {
  return {
    id: db.id,
    brand_id: db.brand_id,
    type: db.asset_type,
    platform: db.platform || undefined,
    url: db.asset_data || '',
    prompt_used: db.prompt_used || undefined,
    aspect_ratio: db.aspect_ratio,
    created_at: db.created_at
  };
}

// ═══════════════════════════════════════════════════════════════
// BRAND IDENTITY CRUD
// ═══════════════════════════════════════════════════════════════

export async function fetchAllBrands(): Promise<BrandIdentity[]> {
  const { data, error } = await supabase
    .from('brand_identities')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching brands:', error);
    throw new Error(`Failed to fetch brands: ${error.message}`);
  }

  return (data || []).map(dbToBrandIdentity);
}

export async function fetchBrandsByStatus(status: 'draft' | 'active' | 'archived'): Promise<BrandIdentity[]> {
  const { data, error } = await supabase
    .from('brand_identities')
    .select('*')
    .eq('status', status)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Error fetching brands by status:', error);
    throw new Error(`Failed to fetch brands: ${error.message}`);
  }

  return (data || []).map(dbToBrandIdentity);
}

export async function fetchBrandByBranch(branchId: string): Promise<BrandIdentity | null> {
  const { data, error } = await supabase
    .from('brand_identities')
    .select('*')
    .eq('branch_id', branchId)
    .eq('status', 'active')
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
    console.error('Error fetching brand by branch:', error);
    throw new Error(`Failed to fetch brand: ${error.message}`);
  }

  return data ? dbToBrandIdentity(data) : null;
}

export async function fetchBrandById(id: string): Promise<BrandIdentity | null> {
  const { data, error } = await supabase
    .from('brand_identities')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching brand:', error);
    throw new Error(`Failed to fetch brand: ${error.message}`);
  }

  return data ? dbToBrandIdentity(data) : null;
}

export async function createBrand(brand: Omit<BrandIdentity, 'id' | 'created_at' | 'updated_at'>): Promise<BrandIdentity> {
  const dbBrand = brandIdentityToDb(brand);

  const { data, error } = await supabase
    .from('brand_identities')
    .insert(dbBrand)
    .select()
    .single();

  if (error) {
    console.error('Error creating brand:', error);
    throw new Error(`Failed to create brand: ${error.message}`);
  }

  return dbToBrandIdentity(data);
}

export async function updateBrand(id: string, updates: Partial<BrandIdentity>): Promise<BrandIdentity> {
  // Remove fields that shouldn't be updated directly
  const { id: _, created_at, ...updateData } = updates as any;

  const { data, error } = await supabase
    .from('brand_identities')
    .update({ ...updateData, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating brand:', error);
    throw new Error(`Failed to update brand: ${error.message}`);
  }

  return dbToBrandIdentity(data);
}

export async function archiveBrand(id: string): Promise<BrandIdentity> {
  return updateBrand(id, { status: 'archived' });
}

export async function activateBrand(id: string, branchId: string): Promise<BrandIdentity> {
  // First, archive any existing active brand for this branch
  const { error: archiveError } = await supabase
    .from('brand_identities')
    .update({ status: 'archived', updated_at: new Date().toISOString() })
    .eq('branch_id', branchId)
    .eq('status', 'active');

  if (archiveError) {
    console.error('Error archiving existing brand:', archiveError);
  }

  // Now activate the new brand
  return updateBrand(id, { status: 'active' });
}

export async function deleteBrand(id: string): Promise<void> {
  // Assets will cascade delete due to FK constraint
  const { error } = await supabase
    .from('brand_identities')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting brand:', error);
    throw new Error(`Failed to delete brand: ${error.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// BRAND ASSETS CRUD
// ═══════════════════════════════════════════════════════════════

export async function fetchAssetsByBrand(brandId: string): Promise<GeneratedBrandAsset[]> {
  const { data, error } = await supabase
    .from('brand_assets')
    .select('*')
    .eq('brand_id', brandId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching assets:', error);
    throw new Error(`Failed to fetch assets: ${error.message}`);
  }

  return (data || []).map(dbToBrandAsset);
}

export async function createAsset(asset: {
  brand_id: string;
  type: 'logo' | 'social' | 'banner' | 'mockup';
  platform?: 'Instagram' | 'LinkedIn' | 'TikTok' | 'Facebook' | 'X';
  url: string;
  prompt_used?: string;
  aspect_ratio?: '1:1' | '16:9' | '9:16' | '4:5';
}): Promise<GeneratedBrandAsset> {
  const dbAsset = {
    brand_id: asset.brand_id,
    asset_type: asset.type,
    platform: asset.platform || null,
    asset_data: asset.url,
    prompt_used: asset.prompt_used || null,
    aspect_ratio: asset.aspect_ratio || '1:1'
  };

  const { data, error } = await supabase
    .from('brand_assets')
    .insert(dbAsset)
    .select()
    .single();

  if (error) {
    console.error('Error creating asset:', error);
    throw new Error(`Failed to create asset: ${error.message}`);
  }

  return dbToBrandAsset(data);
}

export async function deleteAsset(id: string): Promise<void> {
  const { error } = await supabase
    .from('brand_assets')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting asset:', error);
    throw new Error(`Failed to delete asset: ${error.message}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// HELPER: Save brand with assets in one flow
// ═══════════════════════════════════════════════════════════════

export async function saveBrandWithAssets(
  brand: Omit<BrandIdentity, 'id' | 'created_at' | 'updated_at'>,
  assets: { type: 'logo' | 'social' | 'banner' | 'mockup'; url: string }[]
): Promise<{ brand: BrandIdentity; assets: GeneratedBrandAsset[] }> {
  // Create brand first
  const savedBrand = await createBrand(brand);

  // Create assets
  const savedAssets: GeneratedBrandAsset[] = [];
  for (const asset of assets) {
    const savedAsset = await createAsset({
      brand_id: savedBrand.id,
      type: asset.type,
      url: asset.url
    });
    savedAssets.push(savedAsset);
  }

  return { brand: savedBrand, assets: savedAssets };
}

// ═══════════════════════════════════════════════════════════════
// EMAIL TEMPLATES CRUD
// ═══════════════════════════════════════════════════════════════

export async function fetchTemplatesForBranch(branchId: string): Promise<EmailTemplate[]> {
  const { data, error } = await supabase
    .from('email_templates')
    .select('*')
    .eq('branch_id', branchId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function upsertTemplate(template: Partial<EmailTemplate>): Promise<EmailTemplate> {
  const { data, error } = await supabase
    .from('email_templates')
    .upsert({ ...template, updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteTemplate(id: string): Promise<void> {
  const { error } = await supabase
    .from('email_templates')
    .delete()
    .eq('id', id);
  if (error) throw error;
}
