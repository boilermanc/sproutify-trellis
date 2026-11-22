import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createAnalyticsHandler } from './runtime.mjs';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const db = createClient(supabaseUrl, serviceKey);
async function one(table: string, select: string, id: string) {
  const { data, error } = await db.from(table).select(select).eq('id', id).maybeSingle();
  if (error) throw new Error('Database lookup unavailable');
  return data;
}

Deno.serve(createAnalyticsHandler({
  serviceKey, supabaseUrl,
  async loadPublication(source: string, id: string) {
    const studio = source === 'studio';
    const row = await one(studio ? 'studio_publications' : 'trellis_episode_publications',
      `id,platform,status,youtube_account_id,external_id,external_url,${studio ? 'album_id,response_json' : 'episode_id,response'}`, id);
    if (!row) return null;
    // Match the existing publication-account validation trigger's branch contract.
    const parent = studio ? null : await one('trellis_episodes', 'branch', row.episode_id);
    return { ...row, branch_slug: studio ? 'rekkrd' : parent?.branch };
  },
  async loadAccount(id: string) {
    const account = await one('branch_social_accounts', 'id,branch_id,external_account_id,platform,status', id);
    if (!account) return null;
    const branch = await one('branches', 'slug', account.branch_id);
    return { ...account, branch_slug: branch?.slug };
  },
}));
