
import React, { useState, useEffect } from 'react';
import { ViewState } from '../types';
import { Article } from '../src/data/helpContent';
import { ARTICLES } from '../src/data/helpContent';
import {
  HelpCircle, X, Lightbulb, ArrowRight,
  ShieldCheck, Terminal, Book, Zap, BarChart2,
  Network, Users, Rocket, Database
} from 'lucide-react';

interface ContextHelpProps {
  activeView: ViewState;
  onOpenArticle: (article: Article) => void;
  onOpenHelpCenter: () => void;
}

interface HelpItem {
  label: string;
  icon: any;
  articleId: string;
  tip: string;
}

interface HelpContext {
  title: string;
  items: HelpItem[];
}

const HELP_MAP: Record<string, HelpContext> = {
  'dashboard': {
    title: 'Dashboard',
    items: [
      {
        label: 'Ecosystem Harmony Score',
        icon: BarChart2,
        articleId: 'art_gs_monitor_reports',
        tip: 'The harmony score is a composite of audience growth, campaign velocity, social sentiment, and support load.'
      },
      {
        label: 'Understanding the Sage Briefing',
        icon: Lightbulb,
        articleId: 'art_gs_monitor_reports',
        tip: 'Sage runs a cross-spoke analysis daily. Refresh it manually anytime from the briefing card.'
      }
    ]
  },
  'profiles': {
    title: 'Profiles',
    items: [
      {
        label: 'How Identity Resolution Works',
        icon: ShieldCheck,
        articleId: 'art_federated_model',
        tip: 'Trellis matches customers across spokes by email — one email = one Golden Record, regardless of how many sites they use.'
      },
      {
        label: 'Branch & Tag Filters',
        icon: Users,
        articleId: 'art_gs_build_segment',
        tip: 'Branch filters narrow by which spoke a profile came from. Tags are freeform labels you can add manually or via webhook.'
      },
      {
        label: 'Hardened Delete Lifecycle',
        icon: ShieldCheck,
        articleId: 'art_delete_lifecycle',
        tip: "Deleting a profile from one spoke doesn't remove them globally if they exist on another site."
      }
    ]
  },
  'campaign-builder': {
    title: 'Campaign Builder',
    items: [
      {
        label: 'Token Injection Syntax',
        icon: Terminal,
        articleId: 'art_gs_launch_campaign',
        tip: 'Use {{first_name}}, {{brand_name}}, and {{site_name}} in your content. Trellis replaces these per-recipient at send time.'
      },
      {
        label: 'Audience Segment Filters',
        icon: Users,
        articleId: 'art_gs_build_segment',
        tip: 'The audience step re-evaluates your filters live — profiles added after you save the campaign will be included if they match.'
      },
      {
        label: 'Logic Gate Delays',
        icon: Zap,
        articleId: 'art_gs_launch_campaign',
        tip: 'Link an automation rule to delay sending — e.g. wait 24h after a purchase before pitching a related course.'
      }
    ]
  },
  'automations': {
    title: 'Automations',
    items: [
      {
        label: 'Webhook Throttling Pattern',
        icon: Zap,
        articleId: 'art_queuing',
        tip: 'High-volume events write to the task queue first. A worker n8n flow processes them in controlled batches to prevent 429 errors.'
      },
      {
        label: 'n8n Webhook Endpoints',
        icon: Network,
        articleId: 'art_n8n_webhooks',
        tip: 'All five active webhook URLs, their payload shapes, and security requirements are in the Technical Reference.'
      }
    ]
  },
  'social-hub': {
    title: 'Social Hub',
    items: [
      {
        label: 'Instagram Intent Loop',
        icon: Zap,
        articleId: 'art_n8n_webhooks',
        tip: 'The ig-intent-loop webhook polls or receives Instagram comments and DMs, scores intent, and routes to the support queue.'
      },
      {
        label: 'AI Response Compliance',
        icon: ShieldCheck,
        articleId: 'art_external_apis',
        tip: 'All AI-generated social responses go through the Resend compliance flow to check subscription status before dispatch.'
      }
    ]
  },
  'reports': {
    title: 'Reports',
    items: [
      {
        label: 'Campaign Delivery Metrics',
        icon: BarChart2,
        articleId: 'art_gs_monitor_reports',
        tip: 'Delivery, open, click, bounce, and unsubscribe data flows in automatically from Resend via the compliance webhook.'
      },
      {
        label: 'Dead Letter Queue',
        icon: Terminal,
        articleId: 'art_gs_monitor_reports',
        tip: 'Failed syncs land in DevTools > DLQ. Check weekly — common causes are expired spoke API keys or malformed payloads.'
      }
    ]
  },
  'dev-tools': {
    title: 'Dev Tools',
    items: [
      {
        label: 'Schema Engine & Tables',
        icon: Database,
        articleId: 'art_db_tables',
        tip: 'The Schema Engine tab shows the full Hub schema. Copy and paste it into your Supabase SQL Editor to stamp a new instance.'
      },
      {
        label: 'TTL & Data Hygiene',
        icon: Book,
        articleId: 'art_ttl_hygiene',
        tip: 'The pg_cron job runs nightly at 3 AM. High-value events archive to cold storage. Noise events are purged after 90 days.'
      }
    ]
  },
  'settings': {
    title: 'Settings',
    items: [
      {
        label: 'Connecting a Spoke',
        icon: Network,
        articleId: 'art_gs_connect_spokes',
        tip: 'Each spoke needs a site name, API key, and optional webhook secret. ATL Urban Farms is pre-configured.'
      },
      {
        label: 'API Keys Directory',
        icon: Terminal,
        articleId: 'art_external_apis',
        tip: 'See the full External API Directory for auth methods, env var names, and where each key is configured.'
      }
    ]
  },
  'support-hub': {
    title: 'Support Hub',
    items: [
      {
        label: 'Subscription & Consent States',
        icon: ShieldCheck,
        articleId: 'art_identity_subscription_states',
        tip: 'Tickets from customers with is_subscribed = false or status = archived should not receive marketing follow-ups. Check their profile state before closing.'
      },
      {
        label: 'AI Confidence Score',
        icon: Lightbulb,
        articleId: 'art_campaigns_sage_assist',
        tip: 'AI reply confidence below 70 flags the ticket for human review. Edit the draft or write a manual reply before sending.'
      }
    ]
  },
  'knowledge-base': {
    title: 'Knowledge Base',
    items: [
      {
        label: 'RAG Index vs Stale Docs',
        icon: Book,
        articleId: 'art_db_tables',
        tip: 'Stale docs are not included in Sage context. Open the doc and click Commit & Index to refresh its status.'
      },
      {
        label: 'Federated Data Scope',
        icon: Database,
        articleId: 'art_federated_model',
        tip: 'Knowledge Base docs should reference spoke data by query, not by copy-paste. The federated model keeps spoke data current at the source.'
      }
    ]
  }
};

const ContextAwareHelp: React.FC<ContextHelpProps> = ({ activeView, onOpenArticle, onOpenHelpCenter }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [hasNewTip, setHasNewTip] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<number | null>(null);

  useEffect(() => {
    setIsOpen(false);
    if (activeView !== 'help-center') {
      setHasNewTip(true);
      const timer = setTimeout(() => setHasNewTip(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [activeView]);

  const helpContext = HELP_MAP[activeView];

  if (activeView === 'help-center') return null;
  if (!helpContext) return null;

  const handleItemClick = (articleId: string) => {
    const article = ARTICLES.find(a => a.id === articleId);
    if (article) {
      setIsOpen(false);
      onOpenArticle(article);
    }
  };

  return (
    <div className="fixed bottom-32 right-8 z-[80] flex flex-col items-end pointer-events-none">

      {/* Popover */}
      {isOpen && (
        <div className="mb-6 w-80 bg-white rounded-[2rem] shadow-2xl border border-slate-200 overflow-hidden animate-in slide-in-from-bottom-4 duration-300 pointer-events-auto">

          {/* Header */}
          <div className="p-5 bg-slate-900 text-white flex justify-between items-center">
            <div className="flex items-center space-x-3">
              <div className="w-7 h-7 bg-emerald-500 rounded-lg flex items-center justify-center shadow-lg">
                <Lightbulb size={14} />
              </div>
              <h4 className="text-[11px] font-black uppercase tracking-widest">{helpContext.title} Help</h4>
            </div>
            <button onClick={() => setIsOpen(false)} className="p-1.5 text-slate-500 hover:text-white transition rounded-lg hover:bg-white/10">
              <X size={16} />
            </button>
          </div>

          {/* Items */}
          <div className="p-4 space-y-2">
            {helpContext.items.map((item, i) => (
              <button
                key={i}
                onClick={() => handleItemClick(item.articleId)}
                onMouseEnter={() => setHoveredItem(i)}
                onMouseLeave={() => setHoveredItem(null)}
                className="w-full text-left transition-all"
              >
                <div className="p-3.5 bg-slate-50 hover:bg-emerald-50 border border-slate-100 hover:border-emerald-200 rounded-xl flex items-start justify-between group transition-all">
                  <div className="flex items-start space-x-3 flex-1 min-w-0">
                    <div className="mt-0.5 text-slate-400 group-hover:text-emerald-600 transition shrink-0">
                      <item.icon size={14} />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[11px] font-bold text-slate-700 group-hover:text-slate-900 transition block">{item.label}</span>
                      {hoveredItem === i && (
                        <span className="text-[10px] text-slate-500 leading-relaxed block mt-1 animate-in fade-in duration-150">{item.tip}</span>
                      )}
                    </div>
                  </div>
                  <ArrowRight size={12} className="shrink-0 mt-1 ml-2 opacity-0 group-hover:opacity-100 -translate-x-1 group-hover:translate-x-0 transition-all text-emerald-600" />
                </div>
              </button>
            ))}
          </div>

          {/* Footer */}
          <div className="px-4 pb-4">
            <button
              onClick={() => { setIsOpen(false); onOpenHelpCenter(); }}
              className="w-full py-2.5 text-[10px] font-black text-slate-400 hover:text-emerald-600 uppercase tracking-widest transition border border-slate-100 hover:border-emerald-200 rounded-xl hover:bg-emerald-50"
            >
              Open Help Center
            </button>
          </div>
        </div>
      )}

      {/* FAB */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`pointer-events-auto w-12 h-12 rounded-2xl flex items-center justify-center shadow-xl transition-all duration-300 relative border-2 ${
          isOpen
            ? 'bg-slate-900 text-emerald-400 border-slate-800'
            : 'bg-white text-slate-400 border-slate-100 hover:border-emerald-300 hover:text-emerald-600'
        }`}
      >
        {isOpen ? <X size={20} /> : <HelpCircle size={22} />}

        {!isOpen && hasNewTip && (
          <div className="absolute -top-10 right-0 bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest shadow-xl animate-in slide-in-from-bottom-2 duration-300 whitespace-nowrap">
            Tips for {helpContext.title}
            <div className="absolute bottom-[-4px] right-5 w-2 h-2 bg-emerald-600 rotate-45" />
          </div>
        )}
      </button>
    </div>
  );
};

export default ContextAwareHelp;
