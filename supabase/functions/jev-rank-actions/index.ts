import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.90.1';

const HUB_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TYPESAFE_API_KEY = Deno.env.get('TYPESAFE_API_KEY');
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

type Candidate = { id: string; title: string; detail: string; owner: string; effort: string };

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST.' }, 405);

  const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer /, '');
  if (!bearer) return json({ error: 'Authentication required.' }, 401);
  const db = createClient(HUB_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: identity, error: identityError } = await db.auth.getUser(bearer);
  if (identityError || !identity?.user) return json({ error: 'Authentication required.' }, 401);
  const operator = await db.from('trellis_users').select('status').eq('auth_user_id', identity.user.id).maybeSingle();
  if (operator.error || operator.data?.status !== 'active') return json({ error: 'Active Trellis access is required.' }, 403);
  if (!TYPESAFE_API_KEY) return json({ configured: false, ranked_ids: [] });

  const body = await req.json().catch(() => ({}));
  const candidates = (Array.isArray(body.candidates) ? body.candidates : [])
    .slice(0, 6)
    .map((candidate: any): Candidate => ({
      id: String(candidate.id || '').slice(0, 80),
      title: String(candidate.title || '').slice(0, 180),
      detail: String(candidate.detail || '').slice(0, 500),
      owner: String(candidate.owner || '').slice(0, 80),
      effort: String(candidate.effort || '').slice(0, 40),
    }))
    .filter((candidate: Candidate) => candidate.id && candidate.title);
  if (!candidates.length) return json({ configured: true, ranked_ids: [] });

  const questions = Object.fromEntries(candidates.map((candidate, index) => [`candidate_${index}`, {
    type: 'score',
    instructions: `How valuable is completing action ${candidate.id} this week for improving verified business visibility or conversion outcomes, while respecting the stated human effort?`,
    criteria: [
      'Low value now: weak evidence, blocked, duplicative, or not actionable this week.',
      'Useful: actionable and relevant, but another task may have clearer evidence or business impact.',
      'Highest value now: strong evidence, concrete outcome, reasonable effort, and unlocks an important business decision.',
    ],
  }]));

  try {
    const response = await fetch('https://api.typesafe.ai/v1/systemone', {
      method: 'POST',
      headers: { Authorization: `Bearer ${TYPESAFE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'jev-latest',
        state: { objective: 'Help Clint and Sheree understand the business quickly and complete at most two hours of useful weekly work.', candidates },
        questions,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return json({ configured: true, ranked_ids: [], fallback: true });
    const result = await response.json();
    const ranked = candidates.map((candidate, index) => ({
      id: candidate.id,
      score: Number(result?.answers?.[`candidate_${index}`]?.score ?? 0),
      confidence: Number(result?.answers?.[`candidate_${index}`]?.confidence ?? 0),
    })).sort((a, b) => b.score - a.score || b.confidence - a.confidence);
    return json({ configured: true, ranked_ids: ranked.map(item => item.id), judgments: ranked });
  } catch {
    return json({ configured: true, ranked_ids: [], fallback: true });
  }
});

