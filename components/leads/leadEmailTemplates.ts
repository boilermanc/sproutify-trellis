// Reusable lead-email templates surfaced in the Send Email modal so operators pick
// a polished, on-brand message instead of retyping it each time. Bodies use the same
// light formatting the sender understands: blank lines separate paragraphs, single
// newlines become line breaks, **double-asterisks** render bold, and {{first_name}}
// is substituted with the lead's first name (falling back to "there") on selection.
import type { LeadEmailBodyFormat } from '../../leadService';
import { SPROUTIFY_FARM_PARTNERSHIP_HTML } from './templates/sproutifyFarmPartnershipHtml';

export interface LeadEmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  bodyFormat: LeadEmailBodyFormat;
}

export const LEAD_EMAIL_TEMPLATES: LeadEmailTemplate[] = [
  {
    id: 'new-tower-farm-welcome',
    name: 'Tower Farm — Introduction',
    subject: 'Introducing Sproutify Farm for your Tower Farm project',
    bodyFormat: 'text',
    body: `Hi {{first_name}},

I'm Sheree, a tower farmer and co-founder of Sproutify. I wanted to personally introduce myself and share [Sproutify Farm](https://farm.sproutify.app/), the operational software Tower Farm Corp partners with to help aeroponic farms plan, organize, and run successfully.

**What Sproutify does:** We've built farm management software specifically for aeroponic tower operations — tower capacity planning, port management, seed-to-harvest workflows, and task coordination that generic farm tools simply can't handle. Tower Farm gives you great equipment; Sproutify gives you the operational system to run it profitably day-to-day.

**Start where you are:** Whether you're exploring a project, waiting on equipment, mid-installation, or already growing, there's no wrong time to get organized. Since seedling production takes several weeks, early seeding and capacity planning can make harvests run much more smoothly.

**Your complimentary access:** Tower Farm Corp is covering your first 3 months on us. No cost, no obligation — just full access to the platform while you get your operation off the ground.

**What this isn't:** Sproutify Farm is purely an operational tool (think QuickBooks for accounting). It doesn't replace or interfere with any consulting relationship you have — it's just here to help you run the business side of your farm.

We built this because we run our own tower farm and know firsthand the gap between "equipment arrives" and "profitable operation," especially for first-time farmers.

I'd love to set up a quick demo whenever works for you — just let me know a good time, or reply with any questions. You can also explore the platform anytime at [farm.sproutify.app](https://farm.sproutify.app/).

With blessings,
Sheree
Co-Founder, Sproutify`,
  },
  {
    id: 'new-farm-partnership-html',
    name: 'Introducing Sproutify Farm — HTML',
    subject: 'Introducing Sproutify Farm for your Tower Farm project',
    bodyFormat: 'html',
    body: SPROUTIFY_FARM_PARTNERSHIP_HTML,
  },
];

/** Fill {{first_name}} with the lead's first name, or a friendly fallback. */
export function applyLeadTemplate(template: LeadEmailTemplate, firstName?: string | null): { subject: string; body: string; bodyFormat: LeadEmailBodyFormat } {
  const name = (firstName || '').trim() || 'there';
  return {
    subject: template.subject,
    body: template.body.replace(/\{\{\s*first_name\s*\}\}/g, name),
    bodyFormat: template.bodyFormat,
  };
}
