
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
  isPasswordRecovery: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (password: string) => Promise<{ error: string | null }>;
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
  // Brand styling — used to render on-brand text overlays on generated creative.
  secondary_color?: string;
  accent_color?: string;
  font_family?: string;
  website_url?: string;
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
  supabase_key: string;            // service_role key — only set in the wizard before save; '' for stored connections (decrypted server-side)
  key_preview?: string;            // masked first-chars preview of the stored key, for display only
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
  resend_from_address: string;
  twilio_sid: string;
  twilio_token: string;
  meta_app_id?: string;
  meta_app_secret?: string;
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

export type ViewState = 'dashboard' | 'profiles' | 'segments' | 'intelligence' | 'branches' | 'automations' | 'tasks' | 'email-preview' | 'dev-tools' | 'campaign-builder' | 'campaigns' | 'social-hub' | 'brand-intelligence' | 'settings' | 'support-hub' | 'reports' | 'knowledge-base' | 'help-center' | 'team' | 'user-profile' | 'platform-wizard' | 'marketing-wizard' | 'marketing-brands' | 'reddit-growth' | 'video-ad-lab' | 'trellis-studio' | 'studio-albums' | 'trellis-episodes' | 'clip-studio' | 'ad-performance' | 'post-scheduler' | 'card-studio' | 'post-performance';

export interface StudioAlbum {
  id: string;
  organization_id: string;
  created_by: string;
  title: string;
  artist_name: string;
  description: string | null;
  genre: string | null;
  mood: string | null;
  era: string | null;
  theme: string | null;
  vocal_direction: string;
  target_duration_seconds: number;
  actual_duration_seconds: number | null;
  status: string;
  music_generation_status: string;
  master_status: string;
  artwork_status: string;
  video_status: string;
  metadata_status: string;
  publishing_status: string;
  release_subtitle: string | null;
  series_name: string | null;
  subgenre: string | null;
  short_description: string | null;
  credits: string | null;
  ai_disclosure: string | null;
  copyright_note: string | null;
  catalog_number: string | null;
  release_identity_status: 'not_started' | 'draft' | 'approved';
  created_at: string;
  updated_at: string;
}

export interface StudioTrack {
  id: string;
  album_id: string;
  track_number: number;
  title: string;
  prompt: string | null;
  duration_seconds: number | null;
  review_status: 'planned' | 'generated' | 'pending_review' | 'approved' | 'rejected' | 'regenerating' | 'locked' | 'failed';
  rejection_reason: string | null;
  audio_url?: string | null;
}

export interface StudioMaster {
  status: 'not_started' | 'queued' | 'processing' | 'pending_review' | 'approved' | 'failed';
  audio_url?: string | null;
  duration_seconds?: number | null;
  error_message?: string | null;
}

export interface StudioReleaseIdentity {
  release_subtitle: string;
  series_name: string;
  subgenre: string;
  short_description: string;
  credits: string;
  ai_disclosure: string;
  copyright_note: string;
  catalog_number: string;
}

export interface StudioCoverConcept { id: string; version: number; image_url?: string | null; metadata_json?: { selection_status?: 'unselected' | 'selected' | 'approved'; direction?: string }; }

export interface TrellisReport {
  id: string;
  name: string;
  type: 'system' | 'custom';
  metrics: string[];
  spokes: string[];
  // Only set once a report has actually been generated — never seed these with
  // placeholder values, they are surfaced to users as real generation history.
  created_at?: string;
  last_generated?: string;
  status?: 'ready' | 'generating';
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
  image_urls?: string[];
  /** Media imported into Social Studio. image_urls is retained for older drafts. */
  media_urls?: string[];
  media_type?: 'image' | 'video' | 'carousel';
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
  // Standing call to action appended to every generated social caption for this
  // brand — Instagram captions can't hold links, so this carries "link in bio".
  default_cta?: string;
  website_url?: string;
  contact_email?: string;
  description?: string;
  is_active: boolean;
  default_from_name?: string;
  default_reply_to?: string;
  resend_from_address?: string;
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

export interface EmailTemplate {
  id: string;
  organization_id: string;
  branch_id: string;
  brand_identity_id?: string;
  name: string;
  description?: string;
  thumbnail_url?: string;
  html_body: string;
  design_json?: any; // Unlayer visual-editor design; source of truth for re-editing. html_body is the rendered send-time HTML.
  is_default: boolean;
  created_at: string;
  updated_at: string;
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

export type VideoAdStatus = 'queued' | 'generating_script' | 'generating_frame' | 'awaiting_approval' | 'rendering' | 'generating_face' | 'generating_audio' | 'generating_video' | 'completed' | 'failed' | 'cancelled' | 'publishing' | 'published';

export type VideoAdFormat = 'video' | 'static' | 'carousel';

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
  platform: 'general' | 'tiktok' | 'instagram_reels' | 'youtube_shorts';
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
  platform: string | null;
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
  publish_status: string | null;
  scheduled_for: string | null;
  format?: VideoAdFormat;
  media_urls?: string[];
  caption?: string;
  frame_url?: string;
  frame_prompt?: string;
  frame_attempt?: number;
  frame_approved_at?: string;
  setting?: string;
  actor_gender?: string;
  actor_style?: string;
  aspect_ratio?: string;
  pipeline?: string;
  // The original webhook body, kept so a job can be regenerated as-is.
  request_payload?: Record<string, any>;
  revision_of?: string;
  revision_notes?: string;
  // Real-text overlay: the generated image stays clean (no AI-drawn text) and
  // the headline is composited on top in the actual brand font.
  overlay_config?: TextOverlayConfig;
  composite_url?: string;
  // Which models actually produced this creative — provenance for comparing
  // performance across model changes.
  image_model?: string;
  text_model?: string;
}

// Editable text layer drawn over a generated image. Positions are fractions of
// the image (0-1) so a config survives any output resolution.
export interface TextOverlayLayer {
  id: string;
  text: string;
  x: number;
  y: number;
  widthPct: number;
  fontSize: number;
  fontFamily: string;
  fontWeight: number;
  color: string;
  align: 'left' | 'center' | 'right';
  lineHeight: number;
  letterSpacing: number;
  uppercase: boolean;
  shadow: boolean;
}

export interface TextOverlayConfig {
  layers: TextOverlayLayer[];
  scrim?: 'none' | 'bottom' | 'top' | 'full';
}

// ─── Designed post cards ────────────────────────────────────────────
// Some posts are layouts, not photographs — a verse on a gradient, a
// typographic statement, a grid. Image models can't render text or lay out
// a grid reliably, so these are DRAWN from data instead of generated: an AI
// "creative director" writes the concept, a renderer builds the PNG.
export type CardTemplate = 'verse' | 'statement' | 'grid' | 'editorial';

export interface CardPalette {
  bg1: string;        // background / gradient start
  bg2?: string;       // gradient end; flat fill when omitted
  text: string;       // primary text
  muted: string;      // secondary text
  accent: string;     // emphasis, highlighted grid cell, rules
}

// One row of an editorial card's feature list: an icon, a line of text, and an
// optional fragment within it to emphasise.
export interface CardBullet {
  text: string;
  emphasis?: string;
  icon?: 'heart' | 'book' | 'leaf' | 'sparkle' | 'check' | 'sun';
}

export interface CardConcept {
  id: string;
  template: CardTemplate;
  palette: CardPalette;
  eyebrow: string;          // small tracked label, e.g. "FOR WHEN YOU FEEL ANXIOUS"
  logoText: string;         // brand mark line
  caption: string;          // the Instagram caption that ships with it
  // verse
  body?: string;
  reference?: string;       // "Philippians 4:6 · NIV"
  // statement
  statement?: string;
  statementEmphasis?: string;
  subline?: string;
  // grid
  heading?: string;
  items?: string[];
  highlightIndex?: number;
  footnote?: string;
  // editorial — a structured layout drawn OVER a photograph, rather than over a
  // flat or gradient fill. The layout engine is the same; only the backdrop and
  // the extra zones differ.
  backgroundUrl?: string;   // the photo the layout sits on
  wordmark?: string;        // brand mark line, set larger than logoText
  wordmarkSubtitle?: string;// small tracked line under the wordmark
  bullets?: CardBullet[];   // icon + text feature rows
  footer?: string;          // tracked caps line in a footer band
  scrimStrength?: number;   // 0-1, how strongly to wash the photo for legibility

  // provenance
  rationale?: string;       // why this concept, for the human reviewing it
  model?: string;
}

// ─── Trellis Studio (AI music generation) ───────────────────────────
export type MusicGenerationStatus =
  | 'queued' | 'generating' | 'completed' | 'failed' | 'archived';

export interface MusicGeneration {
  id: string;
  campaign_id: string | null;
  branch: string;
  created_by: string | null;
  title: string;
  prompt: string;
  final_prompt: string | null;
  genre: string | null;
  mood: string | null;
  vocal_style: string | null;
  duration_seconds: number | null;
  provider: string;
  model: string | null;
  status: MusicGenerationStatus;
  progress: number;
  error_message: string | null;
  retry_count: number;
  storage_bucket: string | null;
  storage_path: string | null;
  audio_url: string | null;
  audio_mime_type: string | null;
  file_size_bytes: number | null;
  cost_estimate: number | null;
  generation_started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MusicGenConfig {
  branch: string;
  title: string;
  prompt: string;
  genre?: string;
  mood?: string;
  vocal_style?: string;
  duration_seconds?: number;
}

// ─── Trellis Sessions (multi-track music sessions → stitched master) ─
export type SessionStatus =
  | 'draft' | 'planning' | 'planned' | 'generating' | 'review' | 'stitching' | 'ready' | 'failed' | 'archived';
export type TrackStatus = 'planned' | 'queued' | 'generating' | 'completed' | 'failed';
export type RenderStatus = 'queued' | 'processing' | 'ready' | 'failed';

export interface MusicSession {
  id: string;
  branch: string | null;
  created_by: string | null;
  title: string;
  target_duration_seconds: number | null;
  actual_duration_seconds: number | null;
  genre: string | null;
  mood: string | null;
  track_count: number | null;
  avg_track_length_seconds: number | null;
  status: SessionStatus;
  final_audio_url: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface MusicTrack {
  id: string;
  session_id: string;
  track_number: number;
  title: string;
  prompt: string;
  final_prompt: string | null;
  genre: string | null;
  mood: string | null;
  vocal_style: string | null;
  duration_seconds: number | null;
  provider: string;
  model: string | null;
  status: TrackStatus;
  approved: boolean;
  storage_bucket: string | null;
  storage_path: string | null;
  audio_url: string | null;
  audio_mime_type: string | null;
  file_size_bytes: number | null;
  error_message: string | null;
  retry_count: number;
  created_at: string;
  updated_at: string;
}

export interface MusicRender {
  id: string;
  session_id: string;
  render_type: 'master' | 'preview';
  status: RenderStatus;
  track_ids: string[];
  final_audio_url: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  duration_seconds: number | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CreateSessionConfig {
  branch: string;
  title: string;
  genre?: string;
  mood?: string;
  target_duration_seconds?: number;
  track_count?: number;
  avg_track_length_seconds?: number;
  vocal_style?: string;
}

// ─── Trellis Episodes (top-level AI content production pipeline) ─────
export type EpisodeStatus =
  | 'draft' | 'music' | 'master' | 'artwork' | 'video' | 'metadata' | 'publishing' | 'published' | 'archived' | 'failed';
export type AssetType = 'master_mp3' | 'master_wav' | 'cover_art' | 'thumbnail' | 'vertical' | 'video_mp4';
export type AssetStatus = 'queued' | 'processing' | 'ready' | 'failed';
export type PublishPlatform = 'youtube' | 'spotify' | 'apple_podcasts' | 'rekkrd' | 'social';
export type PublishStatus = 'pending' | 'uploading' | 'processing' | 'live' | 'failed';

export interface Episode {
  id: string;
  branch: string | null;
  created_by: string | null;
  title: string;
  show_name: string | null;
  theme: string | null;
  session_id: string | null;
  status: EpisodeStatus;
  publish_status: string | null;
  youtube_url: string | null;
  analytics: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface EpisodeAsset {
  id: string;
  episode_id: string;
  asset_type: AssetType;
  status: AssetStatus;
  approved: boolean;
  version: number;
  storage_bucket: string | null;
  storage_path: string | null;
  url: string | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  file_size_bytes: number | null;
  metadata: Record<string, unknown>;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface EpisodeChapter { time: string; title: string; }

export interface EpisodeMetadata {
  id: string;
  episode_id: string;
  title: string | null;
  description: string | null;
  tags: string[];
  chapters: EpisodeChapter[];
  hashtags: string[];
  status: 'draft' | 'ready' | 'approved';
  created_at: string;
  updated_at: string;
}

export interface EpisodePublication {
  id: string;
  episode_id: string;
  platform: PublishPlatform;
  status: PublishStatus;
  external_id: string | null;
  external_url: string | null;
  response: Record<string, unknown>;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface YouTubeDailyMetric {
  id: string;
  episode_id: string | null;
  publication_id: string | null;
  youtube_video_id: string;
  metric_date: string;
  views: number | null;
  engaged_views: number | null;
  estimated_minutes_watched: number | null;
  average_view_duration: number | null;
  average_view_percentage: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  subscribers_gained: number | null;
  subscribers_lost: number | null;
  traffic_sources: Record<string, unknown>;
  countries: Record<string, unknown>;
  raw: Record<string, unknown>;
  synced_at: string | null;
  created_at: string;
}

export interface CreateEpisodeConfig {
  branch: string;
  title: string;
  show_name?: string;
  theme?: string;
  session_id?: string | null;
}

// ─── Clip Studio (short-form video: script → B-roll → publish) ───────
export type ClipProjectStatus =
  | 'draft' | 'scripting' | 'approved' | 'broll' | 'production' | 'publishing' | 'published' | 'archived' | 'failed';
export type ClipSourceKind = 'url' | 'pasted_text' | 'file';
export type ClipBeatLane = 'aroll' | 'sot';
export type ClipFormat = 'interview' | 'promotion';

export interface ClipProject {
  id: string;
  branch: string | null;
  created_by: string | null;
  title: string;
  hook_line: string | null;
  status: ClipProjectStatus;
  format: { kinds: ClipFormat[]; sponsor?: string; talking_points?: string };
  steering: string | null;
  target_seconds: number;
  rating: number | null;
  current_generation_id: string | null;
  final_video_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClipSource {
  id: string;
  project_id: string;
  kind: ClipSourceKind;
  label: string;            // S1, S2… — referenced by beat receipts
  url: string | null;
  filename: string | null;
  raw_text: string | null;
  created_at: string;
}

export interface ClipScriptBeat {
  lane: ClipBeatLane;
  speaker: string;          // 'YOU' for A-roll, quoted speaker's name for SOT
  text: string;             // A-roll: line to record. SOT: verbatim quote.
  rationale: string;        // why this cut / what was trimmed / risk flags
  source_label: string | null; // receipt link (S1, S2…)
}

export interface ClipFactCheck {
  claim: string;
  advice: string;           // verify / soften / omit guidance
}

export interface ClipHookAlternative {
  archetype: string;        // e.g. 'question · Naive Question to Mechanism'
  text: string;
  rationale: string;
}

export interface ClipReceipt {
  source_label: string;
  claim: string;            // paraphrase of what the script asserts
  quote: string;            // exact verbatim excerpt backing it
}

export interface ClipGeneration {
  id: string;
  project_id: string;
  version: number;
  model: string;
  script: ClipScriptBeat[];
  fact_checks: ClipFactCheck[];
  hooks: ClipHookAlternative[];
  receipts: ClipReceipt[];
  formula: string | null;   // the learned-formula summary this script follows
  feedback_prompt: string | null; // what the user asked for (null for v1)
  word_count: number;
  est_seconds: number;
  tokens_used: number | null;
  is_current: boolean;
  created_at: string;
}

export interface CreateClipConfig {
  branch: string;
  steering?: string;
  target_seconds: number;
  format: { kinds: ClipFormat[]; sponsor?: string; talking_points?: string };
  sources: Array<{ kind: ClipSourceKind; url?: string; filename?: string; raw_text?: string }>;
}

// ─── Clip Studio: B-roll, rendering, publish (Phases C2–C4) ──────────
export type ClipBeatType =
  | 'motion_graphic' | 'kinetic_quote_card' | 'animation' | 'ui_callout'
  | 'timeline' | 'source_receipt_card' | 'text_highlight';
export type ClipTriage = 'undecided' | 'kept' | 'rejected' | 'winner' | 'edited';
export type ClipRenderJobStatus = 'queued' | 'running' | 'completed' | 'failed';

// One flexible param bag drives all 7 Remotion templates — the planner
// fills the fields the chosen template needs.
export interface ClipTemplateParams {
  headline?: string;
  subtext?: string;
  quote?: string;
  attribution?: string;
  accent?: string;            // hex
  bg?: string;                // hex
  items?: Array<{ label: string; sublabel?: string }>;
  highlight_words?: string[];
}

export interface ClipBrollBeat {
  id: string;
  project_id: string;
  generation_id: string | null;
  position: number;
  time_start: number;
  time_end: number;
  beat_type: ClipBeatType;
  headline: string;           // the script line this beat covers
  rationale: string | null;
  remotion_prompt: string | null; // human-readable direction (editable)
  template_params: ClipTemplateParams;
  footage_prompts: string[];  // Seedance/Veo real-footage lane
  triage: ClipTriage;
  created_at: string;
  updated_at: string;
}

export interface ClipRenderJob {
  id: string;
  project_id: string;
  beat_id: string | null;     // null for assemble jobs
  job_type: 'beat' | 'assemble';
  status: ClipRenderJobStatus;
  attempts: number;
  payload: Record<string, unknown>; // assemble: { clip_urls: string[] }
  qa: Record<string, unknown>;
  output_url: string | null;
  storage_path: string | null;
  duration_seconds: number | null;
  width: number | null;
  height: number | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClipPublication {
  id: string;
  project_id: string;
  platform: 'youtube' | 'social';
  status: 'pending' | 'uploading' | 'processing' | 'live' | 'failed';
  external_id: string | null;
  external_url: string | null;
  response: Record<string, unknown>;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface VideoAdBatchRequest {
  configs: VideoAdConfig[];
  variants: number;
}

export interface TrellisUserBranch {
  branch_id: string;
  branch_name: string;
  branch_role: 'lead' | 'member' | 'viewer';
}

export interface TrellisUser {
  id: string;
  auth_user_id: string | null;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: 'owner' | 'admin' | 'operator' | 'analyst' | 'viewer';
  status: 'active' | 'invited' | 'suspended' | 'deleted';
  last_login_at: string | null;
  created_at: string;
  branches: TrellisUserBranch[];
}

// ═══════════════════════════════════════════════════════════════
// AD PERFORMANCE (manual Meta Ads Manager import + creative matching)
// ═══════════════════════════════════════════════════════════════

/** One row parsed from a Meta Ads Manager results CSV, before creative matching. */
export interface ParsedAdRow {
  row_number: number;
  campaign_name?: string;
  adset_name?: string;
  ad_name?: string;
  external_ad_id?: string;
  reporting_start?: string; // YYYY-MM-DD
  reporting_end?: string;   // YYYY-MM-DD
  impressions?: number;
  reach?: number;
  clicks?: number;
  spend?: number;
  conversions?: number;
  conversion_value?: number;
  /** Columns present in the export that weren't mapped to a known field. */
  raw: Record<string, string>;
}

/** A ParsedAdRow after attempting to link it back to the video_ad_jobs creative that produced it. */
export interface MatchedAdRow extends ParsedAdRow {
  creative_job_id: string | null;
  match_confidence: 'exact' | 'normalized' | 'none';
  /** The ad name the match was found against (job.ad_export.ad_name), for display. */
  matched_ad_name?: string;
  matched_branch?: string | null;
  matched_headline?: string | null;
  matched_image_url?: string | null;
}

/** A row as stored in (or read back from) the Hub `ad_performance` table. */
export interface AdPerformanceRow {
  id: string;
  creative_job_id: string | null;
  branch: string | null;
  platform: string;
  campaign_name: string | null;
  adset_name: string | null;
  ad_name: string | null;
  external_ad_id: string | null;
  headline_used: string | null;
  reporting_start: string | null;
  reporting_end: string | null;
  impressions: number;
  reach: number;
  clicks: number;
  spend: number;
  conversions: number;
  conversion_value: number;
  raw: Record<string, any>;
  imported_at: string;
  created_at: string;
}

/** Per-creative aggregate across all imported reporting periods, joined to the video_ad_jobs row that produced it. */
export interface CreativeLeaderboardEntry {
  creative_job_id: string | null;
  ad_name: string;
  branch: string | null;
  format: string | null;
  image_url: string | null;
  frame_prompt: string | null;
  headline_used: string | null;
  row_count: number;
  impressions: number;
  reach: number;
  clicks: number;
  spend: number;
  conversions: number;
  conversion_value: number;
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  cost_per_conversion: number | null;
  roas: number | null;
  has_enough_data: boolean;
}

// ─── Post Scheduler: "bring your own creative" ─────────────────────
// Queue table on Hub Supabase (scheduled_social_posts). An n8n worker
// polls for due rows every ~10 minutes and publishes them. This is a
// separate queue from DraftPost's localStorage-only scheduling.
export interface ScheduledPost {
  id: string;
  branch_id: string;
  branch_slug: string | null;
  platform: 'instagram' | 'facebook' | 'tiktok';
  caption: string;
  media_type: 'image' | 'video' | 'carousel';
  media_urls: string[];
  scheduled_for: string;
  status: 'scheduled' | 'publishing' | 'published' | 'failed' | 'cancelled';
  attempts: number | null;
  last_error: string | null;
  post_id: string | null;
  published_at: string | null;
  source: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface NewScheduledPost {
  branch_id: string;
  branch_slug?: string | null;
  platform: 'instagram' | 'facebook' | 'tiktok';
  caption: string;
  media_type: 'image' | 'video' | 'carousel';
  media_urls: string[];
  scheduled_for: string;
  source?: string;
  created_by?: string | null;
}
