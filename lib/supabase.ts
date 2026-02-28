import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Service-role client for privileged operations (tenant_secrets, etc.)
const hubKey = import.meta.env.VITE_TRELLIS_HUB_KEY;
export const supabaseHub = hubKey
  ? createClient(supabaseUrl, hubKey)
  : null;
