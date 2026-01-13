
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

export interface Brand {
  id: string;
  name: string;
  industry: string;
  tone: string;
  primaryColor: string;
  logoUrl?: string;
}

export interface SpokeConfig {
  id: string;
  site_name: string;
  api_key: string;
  webhook_secret?: string;
  status: 'active' | 'revoked';
  last_used_at?: string;
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

export interface ApiKeyConfig {
  active_llm: LlmProvider;
  gemini_api_key: string;
  openai_api_key: string;
  anthropic_api_key: string;
  n8n_webhook: string;
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
  phone?: string;
  is_subscribed: boolean;
  marketing_pause: boolean;
  tags: string[];
  segments: string[];
  source_sites: string[]; 
  status: 'active' | 'archived' | 'banned' | 'deleted';
  ltv: number;
  churn_risk: 'minimal' | 'moderate' | 'high' | 'critical';
  last_active?: string;
  last_event_timestamp?: string; // For Version-Based Upserts
  engagement_score?: number;
  metadata?: Record<string, any>;
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

export type ViewState = 'dashboard' | 'profiles' | 'automations' | 'tasks' | 'email-preview' | 'dev-tools' | 'campaign-builder' | 'social-hub' | 'settings' | 'support-hub' | 'reports' | 'knowledge-base' | 'help-center';

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
