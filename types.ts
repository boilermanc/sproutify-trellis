
export type Role = 'admin' | 'marketer' | 'developer' | 'viewer';
export type LlmProvider = 'gemini' | 'openai' | 'anthropic';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatar?: string;
  timezone: string;
}

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
}

// DEPRECATED: Use BrandIdentity instead. Keeping for backwards compatibility during migration.
export interface Brand {
  id: string;
  name: string;
  industry: string;
  tone: string;
  primaryColor: string;
  logoUrl?: string;
}

export interface BranchInfo {
  id: string;
  name: string;
  slug: string;
  type: 'internal' | 'external';
  is_active: boolean;
  primary_color: string;
  logo_url?: string;
}

export interface BranchContext {
  allBranches: BranchInfo[];
  activeBranchSlugs: string[];
  setActiveBranchSlugs: (slugs: string[]) => void;
  isAllSelected: boolean;
}

export interface Integration {
  id: string;
  name: string;
  type: 'webhook' | 'api' | 'oauth' | 'custom';
  description?: string;
  credentials: {
    api_key?: string;
    webhook_url?: string;
    secret?: string;
    [key: string]: string | undefined;
  };
  status: 'active' | 'inactive';
  created_at: string;
  last_used_at?: string;
}

// Legacy alias for backwards compatibility
export type SpokeConfig = Integration;

// Field mapping interfaces for each table type
export interface CustomerFieldMapping {
  id?: string;           // Needed to link to orders
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  subscribed?: string;
  created_at?: string;
}

export interface OrderFieldMapping {
  id?: string;
  order_number?: string;
  customer_id?: string;
  guest_email?: string;
  status?: string;
  total?: string;
  subtotal?: string;
  tax?: string;
  paid_at?: string;
  created_at?: string;
  shipped_at?: string;
  delivered_at?: string;
  // Address fields
  billing_address?: string;
  billing_city?: string;
  billing_state?: string;
  billing_zip?: string;
  shipping_address?: string;
  shipping_city?: string;
  shipping_state?: string;
  shipping_zip?: string;
}

export interface OrderItemFieldMapping {
  id: string;
  order_id: string;
  product_name?: string;
  product_price?: string;
  quantity?: string;
  line_total?: string;
}

export interface SubscriptionFieldMapping {
  id: string;
  customer_id?: string;
  email?: string;
  status?: string;
  plan?: string;
  started_at?: string;
  expires_at?: string;
  created_at?: string;
}

export interface SpokeTableConfig {
  id: string;
  table_type: 'customers' | 'orders' | 'order_items' | 'subscriptions';
  table_name: string;           // actual table name in the database
  field_mapping: Record<string, string>;  // our_field -> their_column
  enabled: boolean;
}

export interface SpokeConnection {
  id: string;
  name: string;                    // Display name: "ATL Urban Farms"
  supabase_url: string;            // https://xxxxx.supabase.co
  supabase_key: string;            // anon key
  tables: SpokeTableConfig[];      // Multiple tables per connection
  status: 'active' | 'disconnected' | 'error';
  last_tested_at?: string;
  last_error?: string;
  branch_skipped?: boolean;
  created_at: string;
}

export interface ProfileAddress {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}

export interface NormalizedSpokeProfile {
  id?: string;           // Customer ID for linking to orders
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  subscribed?: boolean;
  created_at?: string;
  referral_source?: string;
  email_notifications?: boolean;
  sms_notifications?: boolean;
  billing_address?: ProfileAddress;
  shipping_address?: ProfileAddress;
  _spoke_id: string;
  _spoke_name: string;
}

export interface ProductPurchase {
  product_name: string;
  total_quantity: number;
  total_spent: number;
  last_purchased_at?: string;
}

export interface ProfileOrderStats {
  ltv: number;              // Lifetime value (sum of order totals)
  order_count: number;      // Number of orders
  last_purchase_at?: string; // Most recent order date
  first_purchase_at?: string; // First order date
  avg_order_value: number;  // LTV / order_count
  products_purchased?: ProductPurchase[];  // Products this customer has bought
}

export interface EnrichedProfile extends NormalizedSpokeProfile {
  order_stats?: ProfileOrderStats;
  _predicted_demographics?: {
    gender: {
      gender: 'male' | 'female' | 'unknown';
      confidence: 'high' | 'medium' | 'low';
      method: string;
      origin?: string;
    };
    age: {
      age_range: string;
      confidence: 'high' | 'medium' | 'low';
      method: string;
    };
  };
}

export interface QueuedTask {
  id: string;
  task_type: 'email_dispatch' | 'ai_generation' | 'social_push';
  payload: any;
  priority: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: string;
  processed_at?: string;
}

export interface FailedSync {
  id: string;
  event_id: string;
  source_site: string;
  raw_payload: any;
  error_message: string;
  retry_count: number;
  created_at: string;
}

export interface ProcessedEvent {
  event_id: string;
  processed_at: string;
}

export interface N8nWebhooks {
  chat: string;      // AI chat/Sage conversations
  workflow: string;  // General workflow automation
}

export interface ApiKeyConfig {
  active_llm: LlmProvider;
  gemini_api_key: string;
  openai_api_key: string;
  anthropic_api_key: string;
  n8n_webhooks: N8nWebhooks;
  slack_webhook?: string;
  woo_consumer_key: string;
  woo_consumer_secret: string;
  resend_token: string;
  twilio_sid: string;
  twilio_token: string;
}

export type TicketStatus = 'open' | 'pending' | 'resolved' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TicketSource = 'email' | 'voice' | 'chat' | 'web' | 'app';
export type Sentiment = 'positive' | 'neutral' | 'negative' | 'frustrated';

export interface Ticket {
  id: string;
  profile_id: string; 
  subject: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  source: TicketSource;
  sentiment: Sentiment;
  ai_draft?: string;
  ai_confidence?: number; // 0-100
  needs_human_review: boolean;
  transcript?: string;
  created_at: string;
}

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

export interface DailyBriefing {
  short_summary: string;
  detailed_analysis: {
    audience_growth: { total: number; trend: string; insight: string };
    campaign_velocity: { active: number; avg_ctr: string; insight: string };
    social_sentiment: { score: number; mood: string; intent_count: number };
    support_load: { open_tickets: number; urgent_count: number; avg_response_time: string };
  };
  last_updated: string;
}

export interface ChatMessage {
  role: 'user' | 'sage';
  content: string;
  timestamp: string;
}

export interface Profile {
  id: string;
  spoke_uuid?: string; // The specific external ID from a source site
  email: string;
  first_name: string;
  last_name?: string;
  phone?: string;
  avatar_url?: string;
  bio?: string;
  is_subscribed: boolean;
  marketing_pause: boolean;
  tags: string[];
  segments: string[];
  branches: string[];
  status: 'active' | 'archived' | 'banned' | 'deleted';
  ltv: number;
  churn_risk: 'minimal' | 'moderate' | 'high' | 'critical';
  last_active?: string;
  last_event_timestamp?: string; // For Version-Based Upserts
  engagement_score?: number;
  metadata?: Record<string, any>;
  role?: Role; // For team members: admin, marketer, developer, viewer
}

export interface MarketingEvent {
  id: string;
  profile_id: string; 
  event_type: 'purchase' | 'signup' | 'check-in' | 'social_intent' | 'support_ticket' | string;
  source: 'woo' | 'app' | 'local' | 'instagram' | 'x' | 'linkedin' | 'twilio' | 'email' | string;
  payload: Record<string, any>;
  created_at: string;
}

export type TaskType = 'copywriting' | 'design' | 'audience' | 'technical' | 'analysis' | 'social';

export interface AuditLogEntry {
  action: string;
  timestamp: string;
  user: string;
}

export interface MarketingTask {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in-progress' | 'completed' | 'archived';
  priority: 'low' | 'medium' | 'high';
  type: TaskType;
  due_date: string;
  audit_log?: AuditLogEntry[];
}

export type ViewState = 'dashboard' | 'profiles' | 'segments' | 'intelligence' | 'branches' | 'automations' | 'tasks' | 'email-preview' | 'dev-tools' | 'campaign-builder' | 'social-hub' | 'brand-intelligence' | 'settings' | 'support-hub' | 'reports' | 'knowledge-base' | 'help-center' | 'team' | 'user-profile' | 'saved-connections';

export interface TrellisReport {
  id: string;
  name: string;
  type: 'system' | 'custom';
  created_at: string;
  last_generated: string;
  metrics: string[];
  spokes: string[];
  status: 'ready' | 'generating';
}

export type EmailModule = 'hero' | 'intro' | 'events' | 'products' | 'app_promo' | 'social_proof' | 'footer';

export interface FooterConfig {
  style: 'minimal' | 'corporate' | 'social' | 'marketing';
  showSocial: boolean;
  platforms: ('instagram' | 'twitter' | 'facebook' | 'tiktok')[];
  address: string;
  legalDisclaimer: string;
}

export interface DraftPost {
  id: string;
  base_content: string;
  versions: Record<string, string>;
  status: 'drafting' | 'scheduled' | 'archived';
  created_at: string;
  scheduled_for?: string;
}

export interface SocialActivity {
  id: string;
  platform: 'instagram' | 'x' | 'linkedin';
  username: string;
  content: string;
  intent_type: string;
  profile_matched: boolean;
  created_at: string;
}

export interface KnowledgeDoc {
  id: string;
  title: string;
  content: string;
  category: string;
  sites: string[];
  status: 'indexed' | 'stale';
  last_updated: string;
  author: string;
}

export interface FAQ {
  id: string;
  question: string;
  answer: string;
  category: string;
  sites: string[];
  last_updated: string;
  status: 'indexed' | 'stale';
}

export interface Branch {
  id: string;
  name: string;
  slug: string;
  type: 'internal' | 'external';
  logo_url?: string;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  font_family: string;
  tagline?: string;
  tone: string;
  brand_keywords?: string[];
  website_url?: string;
  contact_email?: string;
  description?: string;
  is_active: boolean;
  default_from_name?: string;
  default_reply_to?: string;
  spoke_connection_id?: string | null;
  created_at: string;
  updated_at: string;
}

// ═══════════════════════════════════════════════════════════════
// BRAND INTELLIGENCE (Pomelli-style Brand DNA)
// ═══════════════════════════════════════════════════════════════

export interface BrandColorPalette {
  primary: string;
  secondary: string;
  accent: string;
  neutral: string;
}

export interface BrandTypography {
  heading: string;
  body: string;
}

export interface BrandIdentity {
  id: string;
  branch_id: string;
  name: string;
  tagline: string;
  mission: string;
  values: string[];
  target_audience: string;
  voice: string;
  website_url?: string;
  screenshot_url?: string;
  color_palette: BrandColorPalette;
  typography: BrandTypography;
  image_prompt: string;
  marketing_hooks: string[];
  site_preview_description?: string;
  extracted_images?: string[];
  status: 'draft' | 'active' | 'archived';
  created_at: string;
  updated_at: string;
}

export interface GeneratedBrandAsset {
  id: string;
  brand_id: string;
  type: 'logo' | 'social' | 'banner' | 'mockup';
  platform?: 'Instagram' | 'LinkedIn' | 'TikTok' | 'Facebook' | 'X';
  url: string;
  prompt_used?: string;
  aspect_ratio: '1:1' | '16:9' | '9:16' | '4:5';
  created_at: string;
}

export type BrandAnalysisState =
  | 'idle'
  | 'analyzing_site'
  | 'generating_strategy'
  | 'generating_visuals'
  | 'results'
  | 'error';

export interface SavedConnection {
  id: string;
  name: string;
  type: 'mailchimp' | 'supabase';
  icon_type: 'mail' | 'database' | 'file';
  last_used: string;
  is_favorite: boolean;
  config?: Record<string, any>;
  status: 'connected' | 'disconnected' | 'error';
  profile_count?: number;
}

// ═══════════════════════════════════════════════════════════════
// BRANCH STATS (Shared computation layer for Branch Command Center)
// ═══════════════════════════════════════════════════════════════

export interface SpokeStats {
  spokeId: string;
  spokeName: string;
  supabaseUrl: string;
  connectionStatus: 'active' | 'disconnected' | 'error';
  lastTestedAt?: string;
  lastError?: string;

  profileCount: number;
  subscribedCount: number;
  unsubscribedCount: number;

  totalRevenue: number;
  totalOrders: number;
  avgOrderValue: number;
  avgLTV: number;
  repeatBuyerCount: number;
  oneTimeBuyerCount: number;
  profilesWithOrders: number;
  profilesWithoutOrders: number;
  vipCount: number;

  activeIn90Days: number;
  dormantCount: number;

  genderDistribution: { male: number; female: number; unknown: number };
  ageDistribution: Record<string, number>;

  topProducts: Array<{ name: string; revenue: number; quantity: number; buyers: number }>;
}

export interface BranchStatsResult {
  enrichedProfiles: EnrichedProfile[];

  spokeStats: Record<string, SpokeStats>;
  spokeStatsList: SpokeStats[];

  totals: {
    profiles: number;
    revenue: number;
    orders: number;
    avgOrderValue: number;
    avgLTV: number;
    subscribedCount: number;
    unsubscribedCount: number;
    vipCount: number;
    repeatBuyers: number;
    activeIn90Days: number;
    profilesWithOrders: number;
  };

  isLoading: boolean;
  errors: string[];
  lastFetchedAt: string | null;

  refresh: () => Promise<void>;
}

export interface MergedBranch {
  branchId: string | null;
  spokeConnectionId: string | null;

  name: string;
  slug: string | null;
  type: 'internal' | 'external' | null;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  websiteUrl: string | null;
  tagline: string | null;
  tone: string | null;
  fontFamily: string | null;

  connection: SpokeConnection | null;
  branch: Branch | null;
  brandIdentity: BrandIdentity | null;
  stats: SpokeStats | null;

  linkStatus: 'linked' | 'connection-only' | 'branch-only';
}
