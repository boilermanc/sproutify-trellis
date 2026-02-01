import { supabase } from './supabase';
import { Profile, MarketingEvent, QueuedTask, FailedSync, Branch } from '../types';

/**
 * Capitalize each word in a string (for names)
 */
function capitalizeWords(str: string): string {
  if (!str) return str;
  return str.split(' ').map(word =>
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ');
}

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
    .single();

  if (error) {
    if (error.code !== 'PGRST116') { // Not found is expected
      console.error(`Error fetching profile by email ${email}:`, error);
    }
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

/**
 * Batch import profiles from CSV with progress tracking
 * Uses Supabase upsert with onConflict for deduplication
 */
export async function batchImportProfiles(
  profiles: Partial<Profile>[],
  onProgress?: (current: number, total: number) => void
): Promise<{ created: number; merged: number; errors: string[] }> {
  const result = {
    created: 0,
    merged: 0,
    errors: [] as string[]
  };

  const BATCH_SIZE = 15;
  const total = profiles.length;

  // Filter out profiles without email and normalize emails
  const validProfiles = profiles.filter((p, idx) => {
    if (!p.email) {
      result.errors.push(`Row ${idx + 1}: Missing email address`);
      return false;
    }
    // Normalize email
    p.email = p.email.toLowerCase().trim();
    return true;
  });

  // Fetch existing profiles by email for array merging
  const emails = validProfiles.map(p => p.email!);
  const { data: existingProfiles } = await supabase
    .from('profiles')
    .select('id, email, spoke_uuid, branches, tags, segments, first_name')
    .in('email', emails);

  // Build lookup map by email
  const existingByEmail = new Map<string, any>();
  for (const p of existingProfiles || []) {
    if (p.email) {
      existingByEmail.set(p.email.toLowerCase().trim(), p);
    }
  }

  console.log('=== BATCH IMPORT ===', {
    validProfileCount: validProfiles.length,
    existingProfilesFound: existingProfiles?.length || 0
  });

  // Build upsert records with merged arrays for existing profiles
  const upsertRecords: any[] = [];
  const existingEmails = new Set<string>();

  for (const profile of validProfiles) {
    const emailLower = profile.email!;
    const existing = existingByEmail.get(emailLower);

    if (existing) {
      existingEmails.add(emailLower);
      // Merge arrays with existing data
      const mergedBranches = [...new Set([
        ...(existing.branches || []),
        ...(profile.branches || [])
      ])];
      const mergedTags = [...new Set([
        ...(existing.tags || []),
        ...(profile.tags || [])
      ])];
      const mergedSegments = [...new Set([
        ...(existing.segments || []),
        ...(profile.segments || [])
      ])];

      upsertRecords.push({
        email: emailLower,
        first_name: capitalizeWords(profile.first_name || '') || existing.first_name,
        last_name: capitalizeWords(profile.last_name || ''),
        phone: profile.phone || existing.phone,
        branches: mergedBranches,
        tags: mergedTags,
        segments: mergedSegments,
        // Only set spoke_uuid if not already present on existing profile
        spoke_uuid: existing.spoke_uuid || profile.spoke_uuid || null,
        engagement_score: profile.engagement_score ?? existing.engagement_score ?? 0,
        metadata: profile.metadata || existing.metadata || {},
        updated_at: new Date().toISOString()
      });
    } else {
      // New profile
      upsertRecords.push({
        email: emailLower,
        first_name: capitalizeWords(profile.first_name || ''),
        last_name: capitalizeWords(profile.last_name || ''),
        phone: profile.phone || null,
        branches: profile.branches || [],
        tags: profile.tags || [],
        segments: profile.segments || [],
        is_subscribed: profile.is_subscribed ?? true,
        marketing_pause: profile.marketing_pause ?? false,
        status: profile.status || 'active',
        ltv: profile.ltv ?? 0,
        churn_risk: profile.churn_risk || 'minimal',
        spoke_uuid: profile.spoke_uuid || null,
        engagement_score: profile.engagement_score || 0,
        metadata: profile.metadata || {}
      });
    }
  }

  console.log('=== BATCH IMPORT PLAN ===', {
    totalUpserts: upsertRecords.length,
    existingToMerge: existingEmails.size,
    newToCreate: upsertRecords.length - existingEmails.size
  });

  let processed = profiles.length - validProfiles.length; // Start with invalid count

  // Batched upserts
  for (let i = 0; i < upsertRecords.length; i += BATCH_SIZE) {
    const batch = upsertRecords.slice(i, i + BATCH_SIZE);

    try {
      const { data, error } = await supabase
        .from('profiles')
        .upsert(batch, {
          onConflict: 'email',
          ignoreDuplicates: false
        })
        .select('email');

      if (error) {
        console.error('Batch upsert error:', error);
        batch.forEach(p => {
          result.errors.push(`Upsert ${p.email}: ${error.message}`);
        });
      } else {
        // Count created vs merged based on whether email existed
        for (const record of batch) {
          if (existingEmails.has(record.email)) {
            result.merged++;
          } else {
            result.created++;
          }
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      batch.forEach(p => {
        result.errors.push(`Upsert ${p.email}: ${message}`);
      });
    }

    processed += batch.length;
    if (onProgress) {
      onProgress(processed, total);
    }
  }

  console.log('=== IMPORT COMPLETE ===', result);
  return result;
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
    console.error('Error creating branch:', error);
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
