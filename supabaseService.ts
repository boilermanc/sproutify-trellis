import { createClient } from '@supabase/supabase-js';
import { Profile } from './types';

// Initialize Supabase client
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Campaign interface
export interface Campaign {
  id: string;
  name: string;
  status: 'draft' | 'scheduled' | 'active' | 'completed' | 'paused';
  template: string;
  subject: string;
  trigger_type: 'immediate' | 'scheduled' | 'event_based';
  scheduled_at: string | null;
  segments: string[];
  tags: string[];
  branches: string[];
  audience_size: number;
  metadata: Record<string, any> | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  launched_at: string | null;
}

/**
 * Fetch all active profiles from the profiles table
 * Orders by last_active descending
 */
export async function fetchProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('status', 'active')
    .order('last_active', { ascending: false });

  if (error) {
    console.error('Error fetching profiles:', error);
    throw error;
  }

  // Map database rows to Profile type, handling JSONB arrays
  return (data || []).map((row: any) => ({
    id: row.id,
    spoke_uuid: row.spoke_uuid,
    email: row.email,
    first_name: row.first_name,
    last_name: row.last_name,
    phone: row.phone,
    avatar_url: row.avatar_url,
    bio: row.bio,
    is_subscribed: row.is_subscribed,
    marketing_pause: row.marketing_pause,
    tags: Array.isArray(row.tags) ? row.tags : [],
    segments: Array.isArray(row.segments) ? row.segments : [],
    branches: Array.isArray(row.branches) ? row.branches : [],
    status: row.status,
    ltv: row.ltv,
    churn_risk: row.churn_risk,
    last_active: row.last_active,
    last_event_timestamp: row.last_event_timestamp,
    engagement_score: row.engagement_score,
    metadata: row.metadata,
    role: row.role,
  }));
}

/**
 * Fetch all campaigns from the campaigns table
 * Orders by created_at descending
 */
export async function fetchCampaigns(): Promise<Campaign[]> {
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching campaigns:', error);
    throw error;
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    template: row.template,
    subject: row.subject,
    trigger_type: row.trigger_type,
    scheduled_at: row.scheduled_at,
    segments: Array.isArray(row.segments) ? row.segments : [],
    tags: Array.isArray(row.tags) ? row.tags : [],
    branches: Array.isArray(row.branches) ? row.branches : [],
    audience_size: row.audience_size,
    metadata: row.metadata,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    launched_at: row.launched_at,
  }));
}

/**
 * Create a new campaign
 * Returns the created campaign or null on error
 */
export async function createCampaign(
  campaign: Omit<Campaign, 'id' | 'created_at' | 'updated_at'>
): Promise<Campaign | null> {
  const { data, error } = await supabase
    .from('campaigns')
    .insert(campaign)
    .select()
    .single();

  if (error) {
    console.error('Error creating campaign:', error);
    return null;
  }

  return data;
}

/**
 * Update a campaign's status
 * Optionally set launched_at timestamp
 * Returns true on success, false on failure
 */
export async function updateCampaignStatus(
  id: string,
  status: Campaign['status'],
  launchedAt?: string
): Promise<boolean> {
  const updates: Partial<Campaign> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (launchedAt) {
    updates.launched_at = launchedAt;
  }

  const { error } = await supabase
    .from('campaigns')
    .update(updates)
    .eq('id', id);

  if (error) {
    console.error('Error updating campaign status:', error);
    return false;
  }

  return true;
}
