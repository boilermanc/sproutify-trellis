
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
  metadata?: Record<string, any>;
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
export type TicketSource = 'email' | 'voice' | 'chat' | 'web' | 'app' | 'instagram' | 'x' | 'linkedin';
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

export interface BranchConsentEntry {
  subscribed: boolean;
  paused: boolean;
  updated_at: string;
}

/** JSONB shape: { "atl-urban-farms": { subscribed: true, paused: false, updated_at: "..." } } */
export type BranchConsentMap = Record<string, BranchConsentEntry>;

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
  branch_consent?: BranchConsentMap; // Per-branch subscription state
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
  source: 'woo' | 'app' | 'local' | 'instagram' | 'x' | 'linkedin' | 'reddit' | 'twilio' | 'email' | string;
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

export type ViewState = 'dashboard' | 'profiles' | 'segments' | 'intelligence' | 'branches' | 'automations' | 'tasks' | 'email-preview' | 'dev-tools' | 'campaign-builder' | 'social-hub' | 'brand-intelligence' | 'settings' | 'support-hub' | 'reports' | 'knowledge-base' | 'help-center' | 'team' | 'user-profile' | 'saved-connections' | 'platform-wizard' | 'marketing-wizard' | 'marketing-brands' | 'reddit-growth' | 'video-ad-lab';

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
  platforms: ('instagram' | 'x' | 'facebook' | 'tiktok')[];
  address: string;
  legalDisclaimer: string;
}

export interface DraftPost {
  id: string;
  branch_id?: string;
  base_content: string;
  versions: Record<string, string>;
  status: 'drafting' | 'approved' | 'scheduled' | 'published' | 'archived';
  created_at: string;
  scheduled_for?: string;
  published_at?: string;
  publish_results?: PlatformPublishResult[];
  approval_status?: ApprovalStatus;
  approval_note?: string;
  approved_by?: string;
  compliance_score?: number;
}

export type SignalStatus = 'new' | 'reviewed' | 'actioned' | 'dismissed';
export type IntentType = 'buying_intent' | 'support_request' | 'brand_mention' | 'engagement' | 'complaint' | 'partnership' | 'spam';

export interface SocialActivity {
  id: string;
  platform: SocialPlatform;
  username: string;
  content: string;
  intent_type: IntentType;
  confidence: number;
  branch_id?: string;
  matched_profile_id?: string;
  profile_matched: boolean;
  source_post_id?: string;
  source_post_url?: string;
  status: SignalStatus;
  created_at: string;
  actioned_at?: string;
}

// Profile.metadata.social_handles convention:
// { instagram: 'garden_guru_99', x: 'gardenguruX', linkedin: 'jane-gardener-123' }

// ═══════════════════════════════════════════════════════════════
// SOCIAL DISTRIBUTION ENGINE
// ═══════════════════════════════════════════════════════════════

export type SocialPlatform = 'instagram' | 'x' | 'linkedin' | 'facebook' | 'tiktok' | 'youtube';

export interface SocialAccount {
  platform: SocialPlatform;
  handle: string;
  profile_url?: string;
  is_connected: boolean;
}

/** localStorage sidecar shape: branchId → social accounts */
export type BranchSocialAccountsMap = Record<string, SocialAccount[]>;

/** Non-sensitive connection status returned by Supabase RPC */
export interface SocialConnectionStatus {
  platform: SocialPlatform;
  is_connected: boolean;
  platform_username?: string;
  connected_at?: string;
}

/** Per-platform result after a publish attempt */
export interface PlatformPublishResult {
  platform: SocialPlatform;
  success: boolean;
  post_id?: string;
  post_url?: string;
  error?: string;
}

/** Aggregate result from publishToSocial */
export interface PublishResult {
  success: boolean;
  results: PlatformPublishResult[];
  error?: string;
}

// ═══════════════════════════════════════════════════════════════
// CROSS-CHANNEL CAMPAIGN ORCHESTRATION (Phase 5)
// ═══════════════════════════════════════════════════════════════

export type CampaignChannel = 'email' | 'instagram' | 'x' | 'linkedin' | 'sms';

export interface ChannelContent {
  channel: CampaignChannel;
  enabled: boolean;
  content: string;
  template?: string;
  media_urls?: string[];
  char_limit?: number;
}

export interface CampaignTimingRule {
  channel: CampaignChannel;
  delay_hours: number;
  condition?: {
    type: 'no_open' | 'no_click' | 'no_purchase' | 'always';
    reference_channel: CampaignChannel;
    window_hours: number;
  };
}

export interface ChannelDeployResult {
  channel: CampaignChannel;
  status: 'success' | 'failed' | 'skipped' | 'pending';
  post_id?: string;
  error?: string;
  recipients?: number;
}

export interface DeployedCampaign {
  id: string;
  name: string;
  date: string;
  reach: number;
  channels: ChannelDeployResult[];
}

// === CONTENT CALENDAR & BRAND GOVERNANCE ===

export type ApprovalStatus = 'draft' | 'pending_review' | 'approved' | 'rejected';

export interface CalendarEvent {
  id: string;
  type: 'social_post' | 'campaign_channel' | 'email_blast';
  branch_id: string;
  branch_name: string;
  branch_color: string;
  channel: CampaignChannel;
  title: string;
  content_preview?: string;
  scheduled_for: string;
  status: ApprovalStatus | 'scheduled' | 'published' | 'failed';
  source: 'social_hub' | 'campaign_builder';
  source_id: string;
}

export interface ComplianceCheck {
  category: 'tone' | 'competitor_mentions' | 'compliance_disclaimers' | 'sensitivity' | 'brand_consistency';
  status: 'pass' | 'warning' | 'fail';
  message: string;
  suggestion?: string;
}

export interface ComplianceResult {
  overall_score: number;
  status: 'approved' | 'warning' | 'blocked';
  checks: ComplianceCheck[];
  audited_at: string;
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

// ═══════════════════════════════════════════════════════════════
// MARKETING WIZARD & BRAND ENGINE
// ═══════════════════════════════════════════════════════════════

export interface MarketingBrand {
  id: string;
  branch_id: string;
  name: string;
  industry?: string;
  description?: string;
  target_audience?: string;
  tone?: string;
  value_proposition?: string;
  primary_color: string;
  logo_url?: string;
  website_url?: string;
  keywords: string[];
  competitors: string[];
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface MarketingWizardState {
  brand_id: string;
  objective: 'lead_generation' | 'product_launch' | 'awareness';
  product_description: string;
  target_segments: string[];
  positioning?: PositioningResult;
  lead_magnet?: LeadMagnetResult;
  ad_copy?: AdCopyBundle;
  email_sequence?: EmailSequenceResult;
  wizard_step: number;
  last_saved_at: string;
}

export interface PositioningResult {
  statement: string;
  differentiators: string[];
  competitive_analysis: CompetitorAnalysis[];
  market_gap: string;
  unique_angle: string;
}

export interface CompetitorAnalysis {
  name: string;
  strengths: string[];
  weaknesses: string[];
  positioning: string;
}

export interface LeadMagnetResult {
  title: string;
  subtitle: string;
  type: 'ebook' | 'checklist' | 'playbook' | 'guide';
  outline: LeadMagnetChapter[];
  content_markdown: string;
}

export interface LeadMagnetChapter {
  title: string;
  description: string;
  key_points: string[];
}

export interface AdCopyBundle {
  google_search: AdVariation[];
  linkedin: AdVariation[];
  meta: AdVariation[];
  x: AdVariation[];
}

export interface AdVariation {
  headline: string;
  body: string;
  cta: string;
  platform_notes?: string;
}

export interface EmailSequenceResult {
  emails: NurtureEmail[];
  strategy_notes: string;
}

export interface NurtureEmail {
  sequence_number: number;
  delay_days: number;
  subject: string;
  preview_text: string;
  body_markdown: string;
  cta_text: string;
  cta_url_placeholder: string;
}

export interface MarketingGenerationLog {
  id: string;
  campaign_id?: string;
  brand_id?: string;
  branch_id?: string;
  generation_type: 'positioning' | 'lead_magnet_outline' | 'lead_magnet_content' | 'ad_copy' | 'email_sequence' | 'competitive_analysis';
  provider: string;
  model: string;
  prompt_hash?: string;
  input_tokens?: number;
  output_tokens?: number;
  cost_estimate?: number;
  duration_ms?: number;
  status: 'pending' | 'completed' | 'failed' | 'cached';
  output: Record<string, any>;
  error?: string;
  created_at: string;
}

// ─── Video Ad Lab ───

export type VideoAdStatus = 'queued' | 'generating_face' | 'generating_audio' | 'generating_video' | 'completed' | 'failed' | 'cancelled';

export interface VideoAdConfig {
  branch: string;
  product_description: string;
  target_segment: string;
  tone: string;
  cta: string;
  actor_style: string;
  actor_gender: 'male' | 'female';
  voice_style: string;
  video_duration: 15 | 30 | 60;
  pipeline: 'talking_head' | 'full_scene';
}

export interface VideoAdJob {
  id: string;
  campaign_id: string | null;
  branch: string;
  script: string | null;
  actor_prompt: string | null;
  voice_id: string | null;
  voice_style: string | null;
  target_segment: string | null;
  status: VideoAdStatus;
  progress: number;
  face_image_url: string | null;
  audio_url: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  cost_estimate: number | null;
  error_message: string | null;
  retry_count: number;
  created_at: string;
  completed_at: string | null;
  created_by: string | null;
}

export interface VideoAdBatchRequest {
  configs: VideoAdConfig[];
  variants: number;
}
