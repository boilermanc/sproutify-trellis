// Supported field types for segmentation
export type SegmentFieldType = 'string' | 'number' | 'date' | 'boolean' | 'array';

// Operators for different field types
export type StringOperator = 'is' | 'is_not' | 'contains' | 'not_contains' | 'starts_with' | 'ends_with' | 'is_blank' | 'is_not_blank';
export type NumberOperator = 'equals' | 'not_equals' | 'greater_than' | 'less_than' | 'greater_or_equal' | 'less_or_equal' | 'between';
export type DateOperator = 'before' | 'after' | 'on' | 'in_last_days' | 'not_in_last_days' | 'is_blank' | 'is_not_blank';
export type BooleanOperator = 'is_true' | 'is_false';
export type ArrayOperator = 'contains' | 'not_contains' | 'is_empty' | 'is_not_empty';

export type SegmentOperator = StringOperator | NumberOperator | DateOperator | BooleanOperator | ArrayOperator;

// Available fields for segmentation
export interface SegmentField {
  id: string;
  label: string;
  type: SegmentFieldType;
  category: 'profile' | 'orders' | 'products' | 'location' | 'demographics';
  path: string;
}

// A single rule in a segment
export interface SegmentRule {
  id: string;
  field: string;
  operator: SegmentOperator;
  value: string | number | boolean | string[] | null;
  value2?: string | number;
}

// A group of rules joined by AND/OR
export interface SegmentRuleGroup {
  id: string;
  join: 'AND' | 'OR';
  rules: SegmentRule[];
}

// A saved segment
export interface Segment {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  rule_groups: SegmentRuleGroup[];
  is_preset?: boolean;
  // 'rules' (default) evaluates rule_groups against profiles.
  // 'email_list' is a static test list — membership is the explicit set of
  // addresses in `email_list`, which are emailed directly (bypassing branch
  // scope + consent) when used as a campaign audience.
  kind?: 'rules' | 'email_list';
  email_list?: string[]; // lowercased addresses when kind === 'email_list'
  created_at: string;
  updated_at: string;
}

// Available fields for segmentation
export const SEGMENT_FIELDS: SegmentField[] = [
  // Profile fields
  { id: 'email', label: 'Email', type: 'string', category: 'profile', path: 'email' },
  { id: 'first_name', label: 'First Name', type: 'string', category: 'profile', path: 'first_name' },
  { id: 'last_name', label: 'Last Name', type: 'string', category: 'profile', path: 'last_name' },
  { id: 'phone', label: 'Phone', type: 'string', category: 'profile', path: 'phone' },
  { id: 'subscribed', label: 'Newsletter Subscribed', type: 'boolean', category: 'profile', path: 'subscribed' },
  { id: 'email_notifications', label: 'Email Notifications', type: 'boolean', category: 'profile', path: 'email_notifications' },
  { id: 'sms_notifications', label: 'SMS Notifications', type: 'boolean', category: 'profile', path: 'sms_notifications' },
  { id: 'created_at', label: 'Customer Since', type: 'date', category: 'profile', path: 'created_at' },
  { id: 'spoke', label: 'Source/Spoke', type: 'string', category: 'profile', path: '_spoke_name' },
  { id: 'referral_source', label: 'Referral Source', type: 'string', category: 'profile', path: 'referral_source' },

  // Order fields
  { id: 'ltv', label: 'Lifetime Value ($)', type: 'number', category: 'orders', path: 'order_stats.ltv' },
  { id: 'order_count', label: 'Total Orders', type: 'number', category: 'orders', path: 'order_stats.order_count' },
  { id: 'avg_order_value', label: 'Avg Order Value ($)', type: 'number', category: 'orders', path: 'order_stats.avg_order_value' },
  { id: 'last_purchase_at', label: 'Last Purchase Date', type: 'date', category: 'orders', path: 'order_stats.last_purchase_at' },
  { id: 'first_purchase_at', label: 'First Purchase Date', type: 'date', category: 'orders', path: 'order_stats.first_purchase_at' },

  // Product fields
  { id: 'products_purchased', label: 'Products Purchased', type: 'array', category: 'products', path: 'order_stats.products_purchased' },
  { id: 'product_count', label: 'Unique Products Bought', type: 'number', category: 'products', path: 'order_stats.products_purchased.length' },

  // Location fields
  { id: 'shipping_city', label: 'City', type: 'string', category: 'location', path: 'shipping_address.city' },
  { id: 'shipping_state', label: 'State', type: 'string', category: 'location', path: 'shipping_address.state' },
  { id: 'shipping_zip', label: 'ZIP Code', type: 'string', category: 'location', path: 'shipping_address.zip' },

  // Predicted Demographics fields
  { id: 'predicted_gender', label: 'Predicted Gender', type: 'string', category: 'demographics', path: '_predicted_demographics.gender.gender' },
  { id: 'predicted_age', label: 'Predicted Age Range', type: 'string', category: 'demographics', path: '_predicted_demographics.age.age_range' },
  { id: 'gender_confidence', label: 'Gender Confidence', type: 'string', category: 'demographics', path: '_predicted_demographics.gender.confidence' },
  { id: 'name_origin', label: 'Name Origin', type: 'string', category: 'demographics', path: '_predicted_demographics.gender.origin' },
];

// Get operators for a field type
export const getOperatorsForType = (type: SegmentFieldType): { value: SegmentOperator; label: string }[] => {
  switch (type) {
    case 'string':
      return [
        { value: 'is', label: 'is' },
        { value: 'is_not', label: 'is not' },
        { value: 'contains', label: 'contains' },
        { value: 'not_contains', label: 'does not contain' },
        { value: 'starts_with', label: 'starts with' },
        { value: 'ends_with', label: 'ends with' },
        { value: 'is_blank', label: 'is blank' },
        { value: 'is_not_blank', label: 'is not blank' },
      ];
    case 'number':
      return [
        { value: 'equals', label: 'equals' },
        { value: 'not_equals', label: 'does not equal' },
        { value: 'greater_than', label: 'is greater than' },
        { value: 'less_than', label: 'is less than' },
        { value: 'greater_or_equal', label: 'is at least' },
        { value: 'less_or_equal', label: 'is at most' },
        { value: 'between', label: 'is between' },
      ];
    case 'date':
      return [
        { value: 'before', label: 'is before' },
        { value: 'after', label: 'is after' },
        { value: 'on', label: 'is on' },
        { value: 'in_last_days', label: 'in the last X days' },
        { value: 'not_in_last_days', label: 'not in the last X days' },
        { value: 'is_blank', label: 'is blank' },
        { value: 'is_not_blank', label: 'has a value' },
      ];
    case 'boolean':
      return [
        { value: 'is_true', label: 'is true' },
        { value: 'is_false', label: 'is false' },
      ];
    case 'array':
      return [
        { value: 'contains', label: 'includes product' },
        { value: 'not_contains', label: 'does not include' },
        { value: 'is_empty', label: 'is empty' },
        { value: 'is_not_empty', label: 'has items' },
      ];
    default:
      return [];
  }
};

// Preset segments
export const PRESET_SEGMENTS: Omit<Segment, 'id' | 'created_at' | 'updated_at'>[] = [
  {
    name: 'VIP Customers',
    description: 'High-value customers with LTV ≥ $100',
    icon: 'crown',
    color: 'amber',
    is_preset: true,
    rule_groups: [{
      id: 'vip-group',
      join: 'AND',
      rules: [{ id: 'vip-rule', field: 'ltv', operator: 'greater_or_equal', value: 100 }]
    }]
  },
  {
    name: 'First-Time Buyers',
    description: 'Customers with exactly 1 order',
    icon: 'sparkles',
    color: 'blue',
    is_preset: true,
    rule_groups: [{
      id: 'first-group',
      join: 'AND',
      rules: [{ id: 'first-rule', field: 'order_count', operator: 'equals', value: 1 }]
    }]
  },
  {
    name: 'Lapsed Customers',
    description: 'No purchase in 90+ days',
    icon: 'clock',
    color: 'red',
    is_preset: true,
    rule_groups: [{
      id: 'lapsed-group',
      join: 'AND',
      rules: [
        { id: 'lapsed-rule-1', field: 'order_count', operator: 'greater_than', value: 0 },
        { id: 'lapsed-rule-2', field: 'last_purchase_at', operator: 'not_in_last_days', value: 90 }
      ]
    }]
  },
  {
    name: 'Repeat Buyers',
    description: 'Customers with 2+ orders',
    icon: 'repeat',
    color: 'emerald',
    is_preset: true,
    rule_groups: [{
      id: 'repeat-group',
      join: 'AND',
      rules: [{ id: 'repeat-rule', field: 'order_count', operator: 'greater_or_equal', value: 2 }]
    }]
  },
  {
    name: 'Newsletter Subscribers',
    description: 'Opted in to email marketing',
    icon: 'mail',
    color: 'purple',
    is_preset: true,
    rule_groups: [{
      id: 'subscribed-group',
      join: 'AND',
      rules: [{ id: 'subscribed-rule', field: 'subscribed', operator: 'is_true', value: true }]
    }]
  },
  {
    name: 'Never Purchased',
    description: 'Profiles with no order history',
    icon: 'user-x',
    color: 'gray',
    is_preset: true,
    rule_groups: [{
      id: 'never-group',
      join: 'AND',
      rules: [{ id: 'never-rule', field: 'order_count', operator: 'equals', value: 0 }]
    }]
  },
  {
    name: 'Local Atlanta',
    description: 'Customers in Georgia',
    icon: 'map-pin',
    color: 'teal',
    is_preset: true,
    rule_groups: [{
      id: 'local-group',
      join: 'AND',
      rules: [{ id: 'local-rule', field: 'shipping_state', operator: 'is', value: 'GA' }]
    }]
  },
  {
    name: 'Female Customers',
    description: 'Customers predicted to be female',
    icon: 'users',
    color: 'pink',
    is_preset: true,
    rule_groups: [{
      id: 'female-group',
      join: 'AND',
      rules: [{ id: 'female-rule', field: 'predicted_gender', operator: 'is', value: 'female' }]
    }]
  },
  {
    name: 'Male Customers',
    description: 'Customers predicted to be male',
    icon: 'users',
    color: 'blue',
    is_preset: true,
    rule_groups: [{
      id: 'male-group',
      join: 'AND',
      rules: [{ id: 'male-rule', field: 'predicted_gender', operator: 'is', value: 'male' }]
    }]
  },
];
