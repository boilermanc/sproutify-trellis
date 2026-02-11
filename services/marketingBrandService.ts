import { supabase } from '../lib/supabase';
import { MarketingBrand } from '../types';

export const marketingBrandService = {

  async getBrandsByBranch(branchId: string): Promise<MarketingBrand[]> {
    const { data, error } = await supabase
      .from('marketing_brands')
      .select('*')
      .eq('branch_id', branchId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async getAllBrands(): Promise<MarketingBrand[]> {
    const { data, error } = await supabase
      .from('marketing_brands')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async getBrandById(brandId: string): Promise<MarketingBrand | null> {
    const { data, error } = await supabase
      .from('marketing_brands')
      .select('*')
      .eq('id', brandId)
      .single();
    if (error && error.code !== 'PGRST116') throw error;
    return data || null;
  },

  async createBrand(brand: Omit<MarketingBrand, 'id' | 'created_at' | 'updated_at'>): Promise<MarketingBrand> {
    const { data, error } = await supabase
      .from('marketing_brands')
      .insert(brand)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateBrand(brandId: string, updates: Partial<MarketingBrand>): Promise<MarketingBrand> {
    const { id, created_at, ...safeUpdates } = updates as any;
    const { data, error } = await supabase
      .from('marketing_brands')
      .update({ ...safeUpdates, updated_at: new Date().toISOString() })
      .eq('id', brandId)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async deleteBrand(brandId: string): Promise<void> {
    const { error } = await supabase
      .from('marketing_brands')
      .delete()
      .eq('id', brandId);
    if (error) throw error;
  },

  async getBrandsByBranchSlugs(branchIds: string[]): Promise<MarketingBrand[]> {
    if (branchIds.length === 0) return [];
    const { data, error } = await supabase
      .from('marketing_brands')
      .select('*')
      .in('branch_id', branchIds)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  },
};
