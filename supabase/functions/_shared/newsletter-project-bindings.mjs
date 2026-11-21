import { ResendSafetyError } from './newsletter-resend.mjs';

// Source consent policies stay fixed; only server-owned project bindings vary.
// Native contracts reviewed 2026-11-15; default-off Farm/LaneWise RPCs prepared
// 2026-11-16. These are not guesses from generic field mappings.
export const NEWSLETTER_CONSENT = Object.freeze({
  atlurbanfarms: { project:'povudgtvzggnxwgtjexa', kind:'atl' },
  rekkrd: { project:'cvqqiuhloefvaaacwxkg', kind:'flags', table:'profiles', fields:['email_digest_optin','email_updates_optin'] },
  rejoice: { project:'btjttjjmmebwwouuwvmh', kind:'flags', table:'user_profiles', fields:['marketing_opt_in'] },
  'once-upon-a-drawing': { project:'cdhymstkzhlxcucbzipr', kind:'flags', table:'profiles', fields:['subscribed'] },
  'sproutify-home': { project:'xzckfyipgrgpwnydddev', kind:'home', table:'profiles' },
  'sproutify-farm': { project:'qffmtkmetkfysmqmughg', kind:'marketing-rpc' },
  lanewise: { project:'imdvzbqbzcagduupydxv', kind:'marketing-rpc' },
  spectiq: { kind:'hub' },
  'still-janes-daughter': { kind:'hub' },
  'sweetwater-technology': { kind:'hub' },
  'sweetwater-urban-farms': { kind:'hub' },
});
export const NEWSLETTER_PRODUCTION_HUB = 'horvjqqifgrzxesuxtfm';
const production = new Set([NEWSLETTER_PRODUCTION_HUB, ...Object.values(NEWSLETTER_CONSENT).map(c=>c.project).filter(Boolean)]);
const object = value => value!==null && typeof value==='object' && !Array.isArray(value);
const project = value => typeof value==='string' && /^[a-z0-9]{20}$/.test(value);
const fail = () => { throw new ResendSafetyError('Newsletter project bindings are missing, invalid, or do not match this environment. Configure the server manifest before retrying.'); };

export function resolveNewsletterProjectBindings(environment, raw, hubUrl) {
  if (!['production','staging'].includes(environment) || typeof raw!=='string') fail();
  let config;
  try { config=JSON.parse(raw); } catch { fail(); }
  if (!object(config) || Object.keys(config).sort().join(',')!=='branches,hub' || !project(config.hub) ||
    !object(config.branches) || !Object.keys(config.branches).length) fail();
  if (hubUrl!==`https://${config.hub}.supabase.co` && hubUrl!==`https://${config.hub}.supabase.co/`) fail();
  if (environment==='production' ? config.hub!==NEWSLETTER_PRODUCTION_HUB : production.has(config.hub)) fail();
  const seen = new Set([config.hub]);
  for (const [slug,ref] of Object.entries(config.branches)) {
    if (!Object.hasOwn(NEWSLETTER_CONSENT,slug)) fail();
    const contract=NEWSLETTER_CONSENT[slug];
    if (contract.kind==='hub') { if (ref!=='hub') fail(); continue; }
    if (!project(ref) || seen.has(ref) || (environment==='production' ? ref!==contract.project : production.has(ref))) fail();
    seen.add(ref);
  }
  return Object.freeze({ environment, hub:config.hub, branches:Object.freeze({...config.branches}) });
}

export function readNewsletterProjectBindings(getEnv) {
  return resolveNewsletterProjectBindings(getEnv('NEWSLETTER_ENVIRONMENT'),getEnv('NEWSLETTER_PROJECT_BINDINGS'),getEnv('SUPABASE_URL'));
}

export function newsletterBranchProject(bindings, slug) {
  if (!bindings || !Object.hasOwn(bindings.branches || {},slug)) {
    throw new ResendSafetyError('This branch is not enabled in the server newsletter project manifest.');
  }
  return bindings.branches[slug];
}

export function newsletterDispatchAllowed(bindings, enabled) {
  // Staging can preview/queue synthetic fixtures, but can never dispatch mail.
  return bindings?.environment==='production' && enabled==='true';
}
