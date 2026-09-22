import { createClient } from '@supabase/supabase-js';
import { createBriefHandler } from './handler.mjs';

const url = Deno.env.get('SUPABASE_URL')!;
Deno.serve(createBriefHandler({
  authenticate: (authorization: string) => createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authorization } }, auth: { persistSession: false },
  }).auth.getUser(),
  createDatabase: () => createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  }),
}));
