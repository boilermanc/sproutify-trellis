import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.90.1';
import { bridgeConfig, handleBridge } from '../_shared/project-room-bridge.mjs';

const checked = (result: any) => { if (result.error) throw new Error('Database request failed.'); return result.data || []; };
Deno.serve(async (req: Request) => {
  const config = bridgeConfig((name: string) => Deno.env.get(name));
  // The integration's secret is independent of the Supabase service key.
  // The worker receives only the scoped secret, never database credentials.
  const db = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  return handleBridge(req, config, {
    async authorization(c: any) {
      const client = db();
      const [members, users] = await Promise.all([
        client.from('project_room_members').select('room_id,user_id').in('room_id', c.rooms).in('user_id', c.audience),
        client.from('trellis_users').select('auth_user_id').in('auth_user_id', c.audience).eq('status', 'active').in('role', ['owner', 'admin', 'operator']),
      ]);
      return { members: checked(members), users: checked(users) };
    },
    async rooms(ids: string[]) {
      return checked(await db().from('project_rooms').select('id,client_id,title,brief,status,state,version,updated_at,locked_until,client:project_room_clients(id,name,website,status,archived_at,follow_up_date,follow_up_note)').in('id', ids));
    },
  });
});
