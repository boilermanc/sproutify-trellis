import { EnrichedProfile } from './types';
import {
  Segment,
  SegmentRule,
  SegmentRuleGroup,
  SEGMENT_FIELDS,
  SegmentOperator
} from './segmentTypes';
import { EngagementSummary, LinkInterestClickSummary } from './services/emailReportingService';
import { CampaignEngagementSummary } from './services/emailReportingService';

// Sentinel for last_opened_days_ago / last_clicked_days_ago when a profile has never
// opened/clicked (see SEGMENT_FIELDS 'engagement' category in segmentTypes.ts).
// Treated as "infinitely long ago": "at least/more than N days" style rules correctly
// include never-engaged profiles, while "in the last N days" style rules correctly
// exclude them. Kept as a large finite number (not Infinity) so `between` upper
// bounds still behave.
const NEVER_ENGAGED_DAYS = 999999;

const normalizeInterestUrl = (raw: string): { canonical: string; hostname: string } | null => {
  try {
    const url = new URL(raw.trim());
    url.hash = '';
    const pathname = url.pathname === '/' ? '' : url.pathname.replace(/\/+$/, '');
    return {
      canonical: `${url.protocol.toLowerCase()}//${url.hostname.toLowerCase()}${url.port ? `:${url.port}` : ''}${pathname}${url.search}`,
      hostname: url.hostname.toLowerCase().replace(/^www\./, ''),
    };
  } catch {
    return null;
  }
};

const matchesLinkInterest = (
  email: string,
  segment: Segment,
  linkInterestByEmail?: Map<string, LinkInterestClickSummary[]>,
): boolean => {
  const definition = segment.link_interest;
  if (!definition || !linkInterestByEmail) return false;
  const target = normalizeInterestUrl(definition.url);
  if (!target) return false;

  const campaignIds = new Set(definition.campaign_ids || []);
  const campaignSubjects = new Set((definition.campaign_subjects || []).map((subject) => subject.toLowerCase()));
  const cutoff = definition.lookback_days && definition.lookback_days > 0
    ? Date.now() - definition.lookback_days * 86400000
    : null;

  let clicks = 0;
  for (const row of linkInterestByEmail.get(email.trim().toLowerCase()) || []) {
    const candidate = normalizeInterestUrl(row.link_url);
    if (!candidate) continue;
    const urlMatches = definition.match_type === 'domain'
      ? candidate.hostname === target.hostname
      : definition.match_type === 'prefix'
        ? candidate.canonical.startsWith(target.canonical)
        : candidate.canonical === target.canonical;
    if (!urlMatches) continue;
    if (campaignIds.size > 0 && (!row.campaign_id || !campaignIds.has(row.campaign_id))) continue;
    if (campaignSubjects.size > 0 && (!row.campaign_subject || !campaignSubjects.has(row.campaign_subject.toLowerCase()))) continue;
    if (cutoff !== null && new Date(row.last_click_at).getTime() < cutoff) continue;
    clicks += Number(row.clicks || 0);
    if (clicks >= Math.max(1, definition.min_clicks || 1)) return true;
  }
  return false;
};

const daysSince = (iso: string | null | undefined): number => {
  if (!iso) return NEVER_ENGAGED_DAYS;
  const diffMs = Date.now() - new Date(iso).getTime();
  return Math.max(0, Math.floor(diffMs / 86400000));
};

// Resolve an 'engagement' category field against the bulk engagement map, keyed by
// lowercased email (see fetchEngagementByEmail in services/emailReportingService.ts).
const getEngagementValue = (
  profile: EnrichedProfile,
  fieldId: string,
  engagementByEmail: Map<string, EngagementSummary>
): number | boolean | undefined => {
  const summary = engagementByEmail.get((profile.email || '').toLowerCase());
  switch (fieldId) {
    case 'emails_opened':
      return summary?.opened ?? 0;
    case 'emails_clicked':
      return summary?.clicked ?? 0;
    case 'campaigns_delivered':
      return summary?.campaigns_delivered ?? 0;
    case 'campaigns_opened':
      return summary?.campaigns_opened ?? 0;
    case 'campaigns_clicked':
      return summary?.campaigns_clicked ?? 0;
    case 'last_opened_days_ago':
      return daysSince(summary?.last_opened_at);
    case 'last_clicked_days_ago':
      return daysSince(summary?.last_clicked_at);
    case 'has_opened':
      return (summary?.opened ?? 0) > 0;
    case 'has_clicked':
      return (summary?.clicked ?? 0) > 0;
    default:
      return undefined;
  }
};

// Get nested value from object using dot notation path
const getValueByPath = (obj: any, path: string): any => {
  const parts = path.split('.');
  let value = obj;

  for (const part of parts) {
    if (value === null || value === undefined) return undefined;

    // Handle array length
    if (part === 'length' && Array.isArray(value)) {
      return value.length;
    }

    value = value[part];
  }

  return value;
};

// Apply an operator to an already-resolved value. Extracted so 'engagement' fields
// (resolved from the bulk engagement map, not a profile path) share the exact same
// operator semantics as every other field category.
const applyOperator = (value: any, rule: SegmentRule): boolean => {
  const ruleValue = rule.value;

  // Handle different operators
  switch (rule.operator) {
    // String operators
    case 'is':
      return String(value || '').toLowerCase() === String(ruleValue || '').toLowerCase();
    case 'is_not':
      return String(value || '').toLowerCase() !== String(ruleValue || '').toLowerCase();
    case 'contains':
      return String(value || '').toLowerCase().includes(String(ruleValue || '').toLowerCase());
    case 'not_contains':
      return !String(value || '').toLowerCase().includes(String(ruleValue || '').toLowerCase());
    case 'starts_with':
      return String(value || '').toLowerCase().startsWith(String(ruleValue || '').toLowerCase());
    case 'ends_with':
      return String(value || '').toLowerCase().endsWith(String(ruleValue || '').toLowerCase());
    case 'is_blank':
      return value === null || value === undefined || value === '';
    case 'is_not_blank':
      return value !== null && value !== undefined && value !== '';

    // Number operators
    case 'equals':
      return Number(value || 0) === Number(ruleValue || 0);
    case 'not_equals':
      return Number(value || 0) !== Number(ruleValue || 0);
    case 'greater_than':
      return Number(value || 0) > Number(ruleValue || 0);
    case 'less_than':
      return Number(value || 0) < Number(ruleValue || 0);
    case 'greater_or_equal':
      return Number(value || 0) >= Number(ruleValue || 0);
    case 'less_or_equal':
      return Number(value || 0) <= Number(ruleValue || 0);
    case 'between':
      const numVal = Number(value || 0);
      return numVal >= Number(ruleValue || 0) && numVal <= Number(rule.value2 || 0);

    // Date operators
    case 'before':
      if (!value) return false;
      return new Date(value) < new Date(ruleValue as string);
    case 'after':
      if (!value) return false;
      return new Date(value) > new Date(ruleValue as string);
    case 'on':
      if (!value) return false;
      return new Date(value).toDateString() === new Date(ruleValue as string).toDateString();
    case 'in_last_days':
      if (!value) return false;
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - Number(ruleValue || 0));
      return new Date(value) >= daysAgo;
    case 'not_in_last_days':
      if (!value) return false;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - Number(ruleValue || 0));
      return new Date(value) < cutoffDate;

    // Boolean operators
    case 'is_true':
      return value === true;
    case 'is_false':
      return value === false || value === null || value === undefined;

    // Array operators (for products)
    case 'is_empty':
      return !Array.isArray(value) || value.length === 0;
    case 'is_not_empty':
      return Array.isArray(value) && value.length > 0;

    default:
      return false;
  }
};

// Evaluate a single rule against a profile
const evaluateRule = (
  profile: EnrichedProfile,
  rule: SegmentRule,
  engagementByEmail?: Map<string, EngagementSummary>
): boolean => {
  const field = SEGMENT_FIELDS.find(f => f.id === rule.field);
  if (!field) return false;

  if (field.category === 'engagement') {
    // No engagement data supplied — rules in this category simply don't match, so
    // existing evaluateSegment(profile, segment) callers keep working unchanged.
    if (!engagementByEmail) return false;
    const value = getEngagementValue(profile, field.id, engagementByEmail);
    return applyOperator(value, rule);
  }

  const value = getValueByPath(profile, field.path);
  return applyOperator(value, rule);
};

// Special handling for array 'contains' on products_purchased
const evaluateArrayContains = (profile: EnrichedProfile, rule: SegmentRule, negate: boolean = false): boolean => {
  const field = SEGMENT_FIELDS.find(f => f.id === rule.field);
  if (!field) return false;

  const value = getValueByPath(profile, field.path);
  if (!Array.isArray(value)) return negate;

  // For products_purchased, search by product_name
  const searchTerm = String(rule.value || '').toLowerCase();
  const found = value.some((item: any) => {
    if (typeof item === 'string') {
      return item.toLowerCase().includes(searchTerm);
    }
    if (item && item.product_name) {
      return item.product_name.toLowerCase().includes(searchTerm);
    }
    return false;
  });

  return negate ? !found : found;
};

// Evaluate a rule, with special handling for array contains. Applies to any
// array-typed field (products_purchased, customer_tags, …) — evaluateArrayContains
// matches both string members (tag names) and object members by product_name.
const evaluateRuleWithArrays = (
  profile: EnrichedProfile,
  rule: SegmentRule,
  engagementByEmail?: Map<string, EngagementSummary>
): boolean => {
  const field = SEGMENT_FIELDS.find(f => f.id === rule.field);
  if (field?.type === 'array' && rule.operator === 'contains') {
    return evaluateArrayContains(profile, rule, false);
  }
  if (field?.type === 'array' && rule.operator === 'not_contains') {
    return evaluateArrayContains(profile, rule, true);
  }
  return evaluateRule(profile, rule, engagementByEmail);
};

// Evaluate a group of rules (joined by AND or OR)
const evaluateRuleGroup = (
  profile: EnrichedProfile,
  group: SegmentRuleGroup,
  engagementByEmail?: Map<string, EngagementSummary>
): boolean => {
  if (group.rules.length === 0) return true;

  if (group.join === 'AND') {
    return group.rules.every(rule => evaluateRuleWithArrays(profile, rule, engagementByEmail));
  } else {
    return group.rules.some(rule => evaluateRuleWithArrays(profile, rule, engagementByEmail));
  }
};

// Evaluate a complete segment against a profile.
//
// `engagementByEmail` is an OPTIONAL third argument (from
// fetchEngagementByEmail() in services/emailReportingService.ts). Every existing
// call site (Segments.tsx, pages/CampaignBuilder.tsx) calls this with just
// (profile, segment) and keeps working exactly as before — segments with no
// 'engagement' category rules are entirely unaffected, and segments that do use
// engagement rules simply evaluate those rules as non-matching until a caller
// opts in by passing the map.
export const evaluateSegment = (
  profile: EnrichedProfile,
  segment: Segment,
  engagementByEmail?: Map<string, EngagementSummary>,
  linkInterestByEmail?: Map<string, LinkInterestClickSummary[]>,
  campaignEngagementByEmail?: Map<string, CampaignEngagementSummary>,
): boolean => {
  // Static test list: membership is the explicit set of addresses.
  if (segment.kind === 'email_list') {
    const list = segment.email_list || [];
    return list.includes((profile.email || '').toLowerCase());
  }

  if (segment.kind === 'link_interest') {
    return matchesLinkInterest(profile.email || '', segment, linkInterestByEmail);
  }

  if (segment.kind === 'campaign_engagement') {
    const definition = segment.campaign_engagement;
    if (!definition || definition.campaign_ids.length === 0 || !campaignEngagementByEmail) return false;
    const summary = campaignEngagementByEmail.get((profile.email || '').toLowerCase());
    if (!summary) return false;
    const selected = new Set(definition.campaign_ids);
    const delivered = summary.delivered_campaign_ids.filter((id) => selected.has(id)).length;
    if (definition.delivery_requirement === 'all_selected' && delivered !== selected.size) return false;
    const opened = summary.opened_campaign_ids.filter((id) => selected.has(id)).length;
    return opened === definition.opened_count;
  }

  if (segment.rule_groups.length === 0) return true;

  // All rule groups are joined by AND
  return segment.rule_groups.every(group => evaluateRuleGroup(profile, group, engagementByEmail));
};

// Filter profiles by a segment
export const filterProfilesBySegment = (
  profiles: EnrichedProfile[],
  segment: Segment,
  engagementByEmail?: Map<string, EngagementSummary>,
  linkInterestByEmail?: Map<string, LinkInterestClickSummary[]>,
  campaignEngagementByEmail?: Map<string, CampaignEngagementSummary>,
): EnrichedProfile[] => {
  return profiles.filter(profile => evaluateSegment(profile, segment, engagementByEmail, linkInterestByEmail, campaignEngagementByEmail));
};

// Get count of profiles matching a segment
export const countProfilesInSegment = (
  profiles: EnrichedProfile[],
  segment: Segment,
  engagementByEmail?: Map<string, EngagementSummary>,
  linkInterestByEmail?: Map<string, LinkInterestClickSummary[]>,
): number => {
  return profiles.filter(profile => evaluateSegment(profile, segment, engagementByEmail, linkInterestByEmail)).length;
};

// Get all segments a profile belongs to
export const getProfileSegments = (
  profile: EnrichedProfile,
  segments: Segment[],
  engagementByEmail?: Map<string, EngagementSummary>,
  linkInterestByEmail?: Map<string, LinkInterestClickSummary[]>,
): Segment[] => {
  return segments.filter(segment => evaluateSegment(profile, segment, engagementByEmail, linkInterestByEmail));
};

// Create a product-based segment dynamically
export const createProductSegment = (productName: string): Segment => {
  return {
    id: `product-${productName.toLowerCase().replace(/\s+/g, '-')}`,
    name: `Bought: ${productName}`,
    description: `Customers who purchased ${productName}`,
    icon: 'package',
    color: 'green',
    is_preset: false,
    rule_groups: [{
      id: crypto.randomUUID(),
      join: 'AND',
      rules: [{
        id: crypto.randomUUID(),
        field: 'products_purchased',
        operator: 'contains',
        value: productName,
      }]
    }],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
};
