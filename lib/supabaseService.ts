import { supabase } from './supabase';
import { Profile, MarketingEvent, QueuedTask, FailedSync, Branch, Role } from '../types';

/**
 * Fetch all profiles from the profiles table
 */
export async function getProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching profiles:', error);
    throw error;
  }

  return data || [];
}

/**
 * Fetch a single profile by ID
 */
export async function getProfile(id: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error(`Error fetching profile ${id}:`, error);
    return null;
  }

  return data;
}

/**
 * Fetch a single profile by email
 */
export async function getProfileByEmail(email: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('email', email)
    .maybeSingle();

  if (error) {
    console.error(`Error fetching profile by email ${email}:`, error);
    return null;
  }

  return data;
}

/**
 * Fetch marketing events, optionally filtered by profile ID
 */
export async function getMarketingEvents(profileId?: string): Promise<MarketingEvent[]> {
  let query = supabase
    .from('marketing_events')
    .select('*')
    .order('created_at', { ascending: false });

  if (profileId) {
    query = query.eq('profile_id', profileId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching marketing events:', error);
    throw error;
  }

  return data || [];
}

/**
 * Fetch tasks from the marketing_task_queue table
 */
export async function getTasks(): Promise<QueuedTask[]> {
  const { data, error } = await supabase
    .from('marketing_task_queue')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching tasks:', error);
    throw error;
  }

  return data || [];
}

/**
 * Fetch failed syncs from the failed_syncs table
 */
export async function getFailedSyncs(): Promise<FailedSync[]> {
  const { data, error } = await supabase
    .from('failed_syncs')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching failed syncs:', error);
    throw error;
  }

  return data || [];
}

/**
 * Fetch team members (profiles with a role assigned)
 */
export async function getTeamMembers(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching team members:', error);
    return [];
  }

  // Filter for profiles with a role assigned
  return (data || []).filter(profile => profile.role != null);
}

/**
 * Invite a new team member. Calls the `invite-user` Edge Function,
 * which (as service_role) creates the auth user, sends the invite
 * email, and upserts the profile row with the assigned role.
 * The caller must be a signed-in admin.
 */
export async function inviteUser(input: {
  email: string;
  first_name: string;
  role: Role;
}): Promise<{ success: boolean; error?: string }> {
  const { data, error } = await supabase.functions.invoke('invite-user', {
    body: input,
  });

  if (error) {
    // Edge Function non-2xx responses surface here; try to read the body message
    let message = error.message;
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        const payload = await ctx.json();
        if (payload?.error) message = payload.error;
      }
    } catch {
      /* fall back to error.message */
    }
    console.error('Error inviting user:', message);
    return { success: false, error: message };
  }

  if (data?.error) return { success: false, error: data.error };
  return { success: true };
}

/**
 * Update a profile by ID
 */
export async function updateProfile(
  id: string,
  updates: Partial<Profile>
): Promise<{ success: boolean; error?: string }> {
  const { error } = await supabase
    .from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error('Error updating profile:', error);
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Upload an avatar image and return the public URL
 */
export async function uploadAvatar(
  userId: string,
  file: File
): Promise<{ url: string | null; error?: string }> {
  const fileExt = file.name.split('.').pop();
  const fileName = `${userId}-${Date.now()}.${fileExt}`;
  const filePath = `avatars/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(filePath, file, { upsert: true });

  if (uploadError) {
    console.error('Error uploading avatar:', uploadError);
    return { url: null, error: uploadError.message };
  }

  const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);

  return { url: data.publicUrl };
}

/**
 * Upload a social post image and return the public URL.
 * Reuses the public `avatars` bucket under a `social/` prefix (no new bucket/policy setup needed).
 */
export async function uploadSocialImage(
  branchId: string,
  file: File
): Promise<{ url: string | null; error?: string }> {
  const fileExt = file.name.split('.').pop() || 'png';
  const safeBranch = (branchId || 'brand').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 40);
  const rand = Math.random().toString(36).slice(2, 8);
  const filePath = `social/${safeBranch}-${Date.now()}-${rand}.${fileExt}`;

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(filePath, file, { upsert: true, contentType: file.type || undefined });

  if (uploadError) {
    console.error('Error uploading social image:', uploadError);
    return { url: null, error: uploadError.message };
  }

  const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
  return { url: data.publicUrl };
}

/**
 * Fetch all profiles (alias for getProfiles for import consistency)
 */
export async function fetchProfiles(): Promise<Profile[]> {
  return getProfiles();
}

/**
 * Upsert a profile - merges if email exists, creates if new
 */
export async function upsertProfile(profile: Partial<Profile>): Promise<Profile> {
  if (!profile.email) {
    throw new Error('Email is required for profile upsert');
  }

  // Check if profile with this email already exists
  const existing = await getProfileByEmail(profile.email);

  if (existing) {
    // MERGE: append branches and tags, deduplicate
    const mergedSourceSites = [...new Set([
      ...(existing.branches || []),
      ...(profile.branches || [])
    ])];
    const mergedTags = [...new Set([
      ...(existing.tags || []),
      ...(profile.tags || [])
    ])];

    const { data, error } = await supabase
      .from('profiles')
      .update({
        first_name: profile.first_name || existing.first_name,
        last_name: profile.last_name || existing.last_name,
        phone: profile.phone || existing.phone,
        branches: mergedSourceSites,
        tags: mergedTags,
        segments: profile.segments || existing.segments,
        updated_at: new Date().toISOString()
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) {
      console.error('Error merging profile:', error);
      throw error;
    }

    return data;
  } else {
    // CREATE: insert new profile with defaults (let Supabase auto-generate id)
    const newProfile = {
      email: profile.email,
      first_name: profile.first_name || '',
      last_name: profile.last_name || '',
      phone: profile.phone || null,
      branches: profile.branches || [],
      tags: profile.tags || [],
      segments: profile.segments || [],
      is_subscribed: profile.is_subscribed ?? true,
      marketing_pause: profile.marketing_pause ?? false,
      status: profile.status || 'active',
      ltv: profile.ltv ?? 0,
      churn_risk: profile.churn_risk || 'minimal'
    };

    const { data, error } = await supabase
      .from('profiles')
      .insert(newProfile)
      .select()
      .single();

    if (error) {
      console.error('Error creating profile:', error);
      throw error;
    }

    return data;
  }
}

// ============================================================================
// Branch Management
// ============================================================================

/**
 * Generate a URL-friendly slug from a name
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
}

/**
 * Fetch active branches from the branches table
 */
export async function fetchBranches(): Promise<Branch[]> {
  const { data, error } = await supabase
    .from('branches')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching branches:', error);
    throw error;
  }

  return data || [];
}

/**
 * Fetch ALL branches including inactive ones
 */
export async function fetchAllBranches(): Promise<Branch[]> {
  const { data, error } = await supabase
    .from('branches')
    .select('*')
    .order('type', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching all branches:', error);
    throw error;
  }

  return data || [];
}

/**
 * Create a new branch
 */
export async function createBranch(branch: Partial<Branch>): Promise<Branch> {
  if (!branch.name) {
    throw new Error('Branch name is required');
  }

  const slug = branch.slug || generateSlug(branch.name);

  const { data, error } = await supabase
    .from('branches')
    .insert({
      ...branch,
      slug,
      is_active: branch.is_active ?? true
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Update a branch by ID
 */
export async function updateBranch(id: string, updates: Partial<Branch>): Promise<Branch> {
  const { data, error } = await supabase
    .from('branches')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating branch:', error);
    throw error;
  }

  return data;
}

/**
 * Soft delete a branch (sets is_active = false)
 */
export async function deleteBranch(id: string): Promise<void> {
  const { error } = await supabase
    .from('branches')
    .update({
      is_active: false,
      updated_at: new Date().toISOString()
    })
    .eq('id', id);

  if (error) {
    console.error('Error deleting branch:', error);
    throw error;
  }
}

// ============================================================================
// Dashboard Phase 2 Functions
// ============================================================================

/**
 * Fetch total count of active profiles
 */
export async function fetchProfileCount(): Promise<number> {
  try {
    const { count, error } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    if (error) {
      console.error('Error fetching profile count:', error);
      return 0;
    }

    return count ?? 0;
  } catch (err) {
    console.error('Error fetching profile count:', err);
    return 0;
  }
}

/**
 * Fetch branch distribution - counts profiles per source_site
 * Iterates through the JSONB array field branches
 */
export async function fetchBranchDistribution(): Promise<Record<string, number>> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('branches')
      .eq('status', 'active');

    if (error) {
      console.error('Error fetching branch distribution:', error);
      return {};
    }

    const distribution: Record<string, number> = {};

    for (const profile of data || []) {
      const sourceSites = profile.branches || [];
      for (const site of sourceSites) {
        distribution[site] = (distribution[site] || 0) + 1;
      }
    }

    return distribution;
  } catch (err) {
    console.error('Error fetching branch distribution:', err);
    return {};
  }
}

/**
 * A published social post, normalized from a marketing_events row
 * with event_type='social_publish'. image_url and post_id may be null
 * (older rows predate the image_url payload field).
 */
export interface PublishedPost {
  id: string;
  source: string;            // platform: 'instagram' | 'facebook' | ...
  branch_id: string | null;
  post_id: string | null;
  caption: string;
  image_url: string | null;
  published_at: string | null;
  created_at: string;
  permalink: string | null;  // public link if one can be built reliably, else null
}

/**
 * Build a public permalink for a published post.
 * - facebook: post_id is already in `pageid_postid` form → https://www.facebook.com/{post_id}
 * - instagram: there is no reliable public URL derivable from the post_id alone → null
 *   (the UI shows the post_id as text instead of a broken link).
 */
function buildPostPermalink(source: string, postId: string | null): string | null {
  if (!postId) return null;
  if (source === 'facebook') return `https://www.facebook.com/${postId}`;
  return null;
}

/**
 * Fetch all published social posts from marketing_events (event_type='social_publish'),
 * newest first. Returns a clean, normalized shape. Never throws — returns [] on error.
 */
export async function getPublishedPosts(): Promise<PublishedPost[]> {
  try {
    const { data, error } = await supabase
      .from('marketing_events')
      .select('*')
      .eq('event_type', 'social_publish')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching published posts:', error);
      return [];
    }

    return (data || []).map((row: any) => {
      // payload is jsonb (object); be defensive in case a row stored it as a string.
      let payload: any = row.payload;
      if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch { payload = {}; }
      }
      if (!payload || typeof payload !== 'object') payload = {};

      const source: string = row.source || payload.platform || 'unknown';
      const postId: string | null = payload.post_id ?? null;

      return {
        id: row.id,
        source,
        branch_id: payload.branch_id ?? null,
        post_id: postId,
        caption: payload.caption || '',
        image_url: payload.image_url ?? null,
        published_at: payload.published_at ?? row.created_at ?? null,
        created_at: row.created_at,
        permalink: buildPostPermalink(source, postId),
      } as PublishedPost;
    });
  } catch (err) {
    console.error('Error fetching published posts:', err);
    return [];
  }
}

/**
 * Fetch recent marketing events ordered by created_at desc
 */
export async function fetchRecentEvents(limit: number = 10): Promise<MarketingEvent[]> {
  try {
    const { data, error } = await supabase
      .from('marketing_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching recent events:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Error fetching recent events:', err);
    return [];
  }
}

/**
 * Fetch active profiles ordered by updated_at desc
 */
export async function fetchActiveProfiles(limit: number = 100): Promise<Profile[]> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('status', 'active')
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching active profiles:', error);
      return [];
    }

    return data || [];
  } catch (err) {
    console.error('Error fetching active profiles:', err);
    return [];
  }
}
