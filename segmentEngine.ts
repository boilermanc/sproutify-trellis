import { EnrichedProfile } from './types';
import {
  Segment,
  SegmentRule,
  SegmentRuleGroup,
  SEGMENT_FIELDS,
  SegmentOperator
} from './segmentTypes';

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

// Evaluate a single rule against a profile
const evaluateRule = (profile: EnrichedProfile, rule: SegmentRule): boolean => {
  const field = SEGMENT_FIELDS.find(f => f.id === rule.field);
  if (!field) return false;

  const value = getValueByPath(profile, field.path);
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

// Evaluate a rule, with special handling for array contains
const evaluateRuleWithArrays = (profile: EnrichedProfile, rule: SegmentRule): boolean => {
  if (rule.operator === 'contains' && rule.field === 'products_purchased') {
    return evaluateArrayContains(profile, rule, false);
  }
  if (rule.operator === 'not_contains' && rule.field === 'products_purchased') {
    return evaluateArrayContains(profile, rule, true);
  }
  return evaluateRule(profile, rule);
};

// Evaluate a group of rules (joined by AND or OR)
const evaluateRuleGroup = (profile: EnrichedProfile, group: SegmentRuleGroup): boolean => {
  if (group.rules.length === 0) return true;

  if (group.join === 'AND') {
    return group.rules.every(rule => evaluateRuleWithArrays(profile, rule));
  } else {
    return group.rules.some(rule => evaluateRuleWithArrays(profile, rule));
  }
};

// Evaluate a complete segment against a profile
export const evaluateSegment = (profile: EnrichedProfile, segment: Segment): boolean => {
  if (segment.rule_groups.length === 0) return true;

  // All rule groups are joined by AND
  return segment.rule_groups.every(group => evaluateRuleGroup(profile, group));
};

// Filter profiles by a segment
export const filterProfilesBySegment = (
  profiles: EnrichedProfile[],
  segment: Segment
): EnrichedProfile[] => {
  return profiles.filter(profile => evaluateSegment(profile, segment));
};

// Get count of profiles matching a segment
export const countProfilesInSegment = (
  profiles: EnrichedProfile[],
  segment: Segment
): number => {
  return profiles.filter(profile => evaluateSegment(profile, segment)).length;
};

// Get all segments a profile belongs to
export const getProfileSegments = (
  profile: EnrichedProfile,
  segments: Segment[]
): Segment[] => {
  return segments.filter(segment => evaluateSegment(profile, segment));
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
