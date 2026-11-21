import { NEWSLETTER_CONSENT, NEWSLETTER_PRODUCTION_HUB, resolveNewsletterProjectBindings } from '../../supabase/functions/_shared/newsletter-project-bindings.mjs';
export const productionManifest = {hub:NEWSLETTER_PRODUCTION_HUB,branches:Object.fromEntries(Object.entries(NEWSLETTER_CONSENT).map(([slug,c])=>[slug,c.project || 'hub']))};
export const productionBindings = resolveNewsletterProjectBindings('production',JSON.stringify(productionManifest),`https://${productionManifest.hub}.supabase.co`);
export const stagingManifest = {hub:'ssssssssssssssssssss',branches:{'sproutify-farm':'ffffffffffffffffffff',lanewise:'llllllllllllllllllll'}};
export const stagingBindings = resolveNewsletterProjectBindings('staging',JSON.stringify(stagingManifest),`https://${stagingManifest.hub}.supabase.co`);
export const workerToken = 'fixture_newsletter_scheduler_012345678901234567890123456789';
