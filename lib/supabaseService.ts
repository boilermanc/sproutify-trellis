import { supabase } from './supabase';
import { Profile, MarketingEvent, QueuedTask, FailedSync } from '../types';

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
