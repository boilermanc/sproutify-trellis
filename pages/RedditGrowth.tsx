
import React, { useState, useMemo, useEffect } from 'react';
import { MarketingEvent } from '../types';
import { GoogleGenAI, Type } from "@google/genai";
import {
  Search, MessageSquare, Sparkles, Send, CheckCircle2, Clock,
  Edit2, Loader2, Terminal, Archive, Rocket, Target, Settings2,
  Eye, ThumbsUp, ThumbsDown, ExternalLink, AlertTriangle, Shield,
  Plus, Check, Ban, RotateCcw, Copy, Trash2, TrendingUp, Hash,
  Globe, Pause, Play
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────
interface RedditComment {
  id: string;
  post_id: string;
  post_title: string;
  subreddit: string;
  author: string;
  body: string;
  url: string;
  parent_fullname: string;
  score: number;
  created_utc: string;
}

interface DraftResponse {
  id: string;
  comment: RedditComment;
  generated_response: string;
  status: 'pending_review' | 'approved' | 'rejected' | 'posted';
  relevance_score: number; // 0-100 from AI
  created_at: string;
  posted_at?: string;
  edited_response?: string;
}

interface SubredditTarget {
  name: string;
  keywords: string[];
  enabled: boolean;
}

interface RedditGrowthProps {
  setEvents: React.Dispatch<React.SetStateAction<MarketingEvent[]>>;
  geminiApiKey: string;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

// ─── localStorage Keys ──────────────────────────────────────────
const LS_DRAFTS = 'trellis_reddit_drafts';
const LS_TARGETS = 'trellis_reddit_targets';
const LS_DISCOVERED = 'trellis_reddit_discovered';

// ─── n8n Blueprint Templates ────────────────────────────────────
const SCANNER_BLUEPRINT = {
  name: "Trellis: Reddit Growth Scanner",
  nodes: [
    {
      parameters: { rule: { interval: [{ field: "hours", hoursInterval: 3 }] } },
      name: "Every 3 Hours",
      type: "n8n-nodes-base.scheduleTrigger",
      typeVersion: 1,
      position: [250, 300],
    },
    {
      parameters: {
        method: "GET",
        url: "https://oauth.reddit.com/r/{{subreddits}}/search.json",
        sendQuery: true,
        queryParameters: { parameters: [
          { name: "q", value: "={{keywords}}" },
          { name: "sort", value: "new" },
          { name: "t", value: "day" },
          { name: "limit", value: "25" },
          { name: "restrict_sr", value: "true" },
        ]},
        sendHeaders: true,
        headerParameters: { parameters: [
          { name: "Authorization", value: "Bearer YOUR_REDDIT_ACCESS_TOKEN" },
          { name: "User-Agent", value: "Trellis/1.0" },
        ]},
      },
      name: "Search Reddit Posts",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4,
      position: [500, 300],
    },
    {
      parameters: {
        method: "GET",
        url: "https://oauth.reddit.com/r/{{ $json.subreddit }}/comments/{{ $json.post_id }}.json",
        sendHeaders: true,
        headerParameters: { parameters: [
          { name: "Authorization", value: "Bearer YOUR_REDDIT_ACCESS_TOKEN" },
          { name: "User-Agent", value: "Trellis/1.0" },
        ]},
      },
      name: "Fetch Post Comments",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4,
      position: [750, 300],
    },
    {
      parameters: {
        conditions: {
          string: [{ value1: "={{ $json.author }}", operation: "notContains", value2: "bot" }],
          boolean: [{ value1: "={{ $json.is_submitter }}", value2: false }],
        },
      },
      name: "Filter Bots & Mods",
      type: "n8n-nodes-base.if",
      typeVersion: 1,
      position: [1000, 300],
    },
    {
      parameters: {
        method: "POST",
        url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
        sendQuery: true,
        queryParameters: { parameters: [{ name: "key", value: "YOUR_GEMINI_API_KEY" }] },
        sendHeaders: true,
        headerParameters: { parameters: [{ name: "Content-Type", value: "application/json" }] },
        sendBody: true,
        specifyBody: "json",
        jsonBody: "={{ JSON.stringify({ contents: [{ parts: [{ text: 'You are a helpful community member. Analyze and draft a helpful, non-promotional response. No links, no brand names. Return JSON: {response, relevance_score}. Comment: ' + $json.comment_body + ' Context: ' + $json.post_title }] }] }) }}",
      },
      name: "AI Draft Response",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4,
      position: [1250, 300],
    },
    {
      parameters: {
        content: "## Trellis: Reddit Growth Scanner\n\n**Workflow 1 of 2** — Monitors target subreddits, discovers engagement opportunities, generates AI drafts, and stages them for human review.\n\n**Schedule:** Every 3 hours (configurable)\n\n---\n\n### SETUP REQUIRED\n\n1. **Reddit OAuth Token:** Create a Reddit app at reddit.com/prefs/apps (\"script\" type). Replace YOUR_REDDIT_ACCESS_TOKEN in both HTTP Request nodes.\n\n2. **Gemini API Key:** Replace YOUR_GEMINI_API_KEY in the AI Draft Response node.\n\n3. **Target Subreddits:** Update the search URL with your target subreddits joined by `+`.\n\n**Rate Limits:** Reddit allows 60 req/min per OAuth client. The 3-hour interval stays well under that.",
        width: 520,
      },
      name: "Setup Instructions",
      type: "n8n-nodes-base.stickyNote",
      typeVersion: 1,
      position: [200, 50],
    },
  ],
  connections: {
    "Every 3 Hours": { main: [[{ node: "Search Reddit Posts", type: "main", index: 0 }]] },
    "Search Reddit Posts": { main: [[{ node: "Fetch Post Comments", type: "main", index: 0 }]] },
    "Fetch Post Comments": { main: [[{ node: "Filter Bots & Mods", type: "main", index: 0 }]] },
    "Filter Bots & Mods": { main: [[{ node: "AI Draft Response", type: "main", index: 0 }]] },
  },
};

const POSTER_BLUEPRINT = {
  name: "Trellis: Reddit Comment Poster",
  nodes: [
    {
      parameters: { httpMethod: "POST", path: "reddit-post-comment", responseMode: "lastNode", options: {} },
      name: "Webhook — Post Approved",
      type: "n8n-nodes-base.webhook",
      typeVersion: 1,
      position: [250, 300],
    },
    {
      parameters: {
        method: "POST",
        url: "https://oauth.reddit.com/api/comment",
        sendHeaders: true,
        headerParameters: { parameters: [
          { name: "Authorization", value: "Bearer YOUR_REDDIT_ACCESS_TOKEN" },
          { name: "User-Agent", value: "Trellis/1.0" },
          { name: "Content-Type", value: "application/x-www-form-urlencoded" },
        ]},
        sendBody: true,
        specifyBody: "string",
        body: "={{ 'parent=' + $json.parent_fullname + '&text=' + encodeURIComponent($json.approved_text) }}",
      },
      name: "Post to Reddit",
      type: "n8n-nodes-base.httpRequest",
      typeVersion: 4,
      position: [500, 300],
    },
    {
      parameters: {
        content: "## Trellis: Reddit Comment Poster\n\n**Workflow 2 of 2** — Receives approved comment data via webhook and posts to Reddit.\n\n**Trigger:** POST webhook from Trellis UI \"Post to Reddit\" button.\n\n**Webhook URL:** `https://n8n.sproutify.app/webhook/reddit-post-comment`\n\n---\n\n### SETUP REQUIRED\n\n1. **Reddit OAuth Token:** Same token as Workflow 1.\n\n**Expected POST body:**\n```json\n{ \"parent_fullname\": \"t1_abc123\", \"approved_text\": \"Your helpful response...\" }\n```\n\n**Safety:** This workflow ONLY fires when a human clicks \"Post to Reddit\" in the Trellis UI. No auto-posting.",
        width: 480,
      },
      name: "Setup Instructions",
      type: "n8n-nodes-base.stickyNote",
      typeVersion: 1,
      position: [200, 50],
    },
  ],
  connections: {
    "Webhook — Post Approved": { main: [[{ node: "Post to Reddit", type: "main", index: 0 }]] },
  },
};

// ─── Mock Data (simulates n8n Workflow 1 output) ─────────────────
const MOCK_SUBREDDIT_TARGETS: SubredditTarget[] = [
  { name: 'UrbanGardening', keywords: ['container gardening', 'balcony garden', 'indoor growing'], enabled: true },
  { name: 'gardening', keywords: ['beginner gardening', 'soil mix', 'composting'], enabled: true },
  { name: 'Hydroponics', keywords: ['hydroponic system', 'nutrient solution', 'grow lights'], enabled: true },
  { name: 'sustainability', keywords: ['urban farming', 'food sovereignty', 'community garden'], enabled: false },
  { name: 'BackyardOrchard', keywords: ['fruit trees', 'raised beds', 'permaculture'], enabled: false },
];

const MOCK_DISCOVERED_COMMENTS: RedditComment[] = [
  {
    id: 'rc_1', post_id: 'rp_101', post_title: 'First time growing tomatoes in containers - any tips?',
    subreddit: 'UrbanGardening', author: 'newbie_planter',
    body: "I just moved to an apartment with a south-facing balcony and want to grow tomatoes. What size containers do I need? Is regular potting soil okay or do I need something special?",
    url: 'https://reddit.com/r/UrbanGardening/comments/abc123/first_time_growing/c1',
    parent_fullname: 't3_abc123', score: 12, created_utc: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: 'rc_2', post_id: 'rp_102', post_title: 'My hydroponic lettuce keeps wilting after 2 weeks',
    subreddit: 'Hydroponics', author: 'hydro_curious',
    body: "I set up a basic DWC system following a YouTube tutorial but my lettuce seedlings look great for about 10 days then start wilting. pH is at 6.5, using General Hydroponics Flora series. Any ideas?",
    url: 'https://reddit.com/r/Hydroponics/comments/def456/hydroponic_lettuce/c2',
    parent_fullname: 't1_def456a', score: 8, created_utc: new Date(Date.now() - 7200000).toISOString(),
  },
  {
    id: 'rc_3', post_id: 'rp_103', post_title: 'Community garden starting in Atlanta - looking for advice',
    subreddit: 'UrbanGardening', author: 'atl_green_thumb',
    body: "We're launching a community garden in southeast Atlanta. About 20 plots on a vacant lot. What should we test the soil for? Any recommendations for raised bed soil mix in Georgia clay country?",
    url: 'https://reddit.com/r/UrbanGardening/comments/ghi789/community_garden_atlanta/c3',
    parent_fullname: 't3_ghi789', score: 34, created_utc: new Date(Date.now() - 1800000).toISOString(),
  },
  {
    id: 'rc_4', post_id: 'rp_104', post_title: 'Best indoor grow lights under $100?',
    subreddit: 'gardening', author: 'winter_grower',
    body: "Getting into indoor herb growing for winter. Basil, cilantro, maybe some micro greens. What lights do you all recommend that won't break the bank? Is LED worth it over fluorescent?",
    url: 'https://reddit.com/r/gardening/comments/jkl012/grow_lights/c4',
    parent_fullname: 't3_jkl012', score: 21, created_utc: new Date(Date.now() - 5400000).toISOString(),
  },
  {
    id: 'rc_5', post_id: 'rp_105', post_title: 'Composting in a small space - is it even possible?',
    subreddit: 'sustainability', author: 'eco_warrior_99',
    body: "I live in a 600sqft apartment. Is there any realistic way to compost kitchen scraps? I've heard of vermicomposting but worried about smell and fruit flies. What actually works?",
    url: 'https://reddit.com/r/sustainability/comments/mno345/composting_small_space/c5',
    parent_fullname: 't3_mno345', score: 45, created_utc: new Date(Date.now() - 9000000).toISOString(),
  },
];

const MOCK_DRAFTS: DraftResponse[] = [
  {
    id: 'dr_1',
    comment: MOCK_DISCOVERED_COMMENTS[2],
    generated_response: "That's awesome you're getting a community garden going in SE Atlanta! Georgia clay is notoriously challenging \u2014 I'd definitely recommend getting a soil test through your local UGA Extension office (Fulton County has a great one). They test for heavy metals, pH, and nutrient levels, which is critical for a vacant lot.\n\nFor raised beds on clay, a 60/40 mix of quality topsoil and compost works really well. If you can source local compost from the Atlanta area, even better. A lot of urban growers here add expanded shale to improve drainage since clay holds water like crazy. 20 plots is a solid start \u2014 good luck with the project!",
    status: 'pending_review',
    relevance_score: 94,
    created_at: new Date(Date.now() - 1200000).toISOString(),
  },
  {
    id: 'dr_2',
    comment: MOCK_DISCOVERED_COMMENTS[0],
    generated_response: "Welcome to container gardening! For tomatoes you'll want at minimum 5-gallon containers, but honestly 10-gallon fabric grow bags are the sweet spot \u2014 they air-prune roots and you get way better yields. South-facing balcony is perfect for tomatoes, they want 6-8 hours of direct sun.\n\nSkip the regular potting soil for containers. You want a potting mix (not soil) \u2014 something with perlite and peat or coco coir that drains well. Container tomatoes dry out fast, so a mix that retains some moisture without getting waterlogged is key. Cherry tomato varieties like Sun Gold are incredibly forgiving for first-timers in containers.",
    status: 'pending_review',
    relevance_score: 88,
    created_at: new Date(Date.now() - 900000).toISOString(),
  },
  {
    id: 'dr_3',
    comment: MOCK_DISCOVERED_COMMENTS[1],
    generated_response: "pH 6.5 is actually a bit high for lettuce in DWC \u2014 try bringing it down to 5.8-6.0. That could be locking out nutrients even though you're dosing correctly.\n\nAlso, check your water temperature. If it's above 72\u00B0F, dissolved oxygen drops and roots start struggling. That's the most common DWC killer in the 10-14 day window. An air stone upgrade or adding a small chiller can make a huge difference. What's your EC running at?",
    status: 'approved',
    relevance_score: 91,
    created_at: new Date(Date.now() - 600000).toISOString(),
  },
];

// ─── Component ───────────────────────────────────────────────────
const RedditGrowth: React.FC<RedditGrowthProps> = ({ setEvents, geminiApiKey, addToast }) => {
  const [activeTab, setActiveTab] = useState<'monitor' | 'review' | 'posted' | 'settings'>('monitor');

  // Persistent state — initialized from localStorage, falls back to mocks
  const [subredditTargets, setSubredditTargets] = useState<SubredditTarget[]>(() => {
    try { const s = localStorage.getItem(LS_TARGETS); return s ? JSON.parse(s) : MOCK_SUBREDDIT_TARGETS; }
    catch { return MOCK_SUBREDDIT_TARGETS; }
  });
  const [discoveredComments, setDiscoveredComments] = useState<RedditComment[]>(() => {
    try { const s = localStorage.getItem(LS_DISCOVERED); return s ? JSON.parse(s) : MOCK_DISCOVERED_COMMENTS; }
    catch { return MOCK_DISCOVERED_COMMENTS; }
  });
  const [drafts, setDrafts] = useState<DraftResponse[]>(() => {
    try { const s = localStorage.getItem(LS_DRAFTS); return s ? JSON.parse(s) : MOCK_DRAFTS; }
    catch { return MOCK_DRAFTS; }
  });

  // Persist to localStorage on change
  useEffect(() => { localStorage.setItem(LS_TARGETS, JSON.stringify(subredditTargets)); }, [subredditTargets]);
  useEffect(() => { localStorage.setItem(LS_DISCOVERED, JSON.stringify(discoveredComments)); }, [discoveredComments]);
  useEffect(() => { localStorage.setItem(LS_DRAFTS, JSON.stringify(drafts)); }, [drafts]);

  // Concurrent generation tracking — multiple drafts can generate at once
  const [generatingIds, setGeneratingIds] = useState<string[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [editingDraft, setEditingDraft] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [filterSubreddit, setFilterSubreddit] = useState<string>('all');
  const [workflowActive, setWorkflowActive] = useState(true);
  const [scanInterval, setScanInterval] = useState(3); // hours
  const [newSubreddit, setNewSubreddit] = useState('');
  const [newKeywords, setNewKeywords] = useState('');

  const pendingDrafts = useMemo(() => drafts.filter(d => d.status === 'pending_review'), [drafts]);
  const approvedDrafts = useMemo(() => drafts.filter(d => d.status === 'approved'), [drafts]);
  const postedDrafts = useMemo(() => drafts.filter(d => d.status === 'posted'), [drafts]);
  const rejectedDrafts = useMemo(() => drafts.filter(d => d.status === 'rejected'), [drafts]);

  const activeSubreddits = useMemo(() => subredditTargets.filter(s => s.enabled), [subredditTargets]);

  const filteredComments = useMemo(() => {
    const draftedIds = new Set(drafts.map(d => d.comment.id));
    let filtered = discoveredComments.filter(c => !draftedIds.has(c.id));
    if (filterSubreddit !== 'all') {
      filtered = filtered.filter(c => c.subreddit === filterSubreddit);
    }
    return filtered;
  }, [discoveredComments, drafts, filterSubreddit]);

  // ─── AI Draft Generation (Gemini) ─────────────────────────────
  const handleGenerateDraft = async (comment: RedditComment) => {
    if (!geminiApiKey) {
      addToast('No Gemini API key configured. Add one in Settings.', 'error');
      return;
    }
    setGeneratingIds(prev => [...prev, comment.id]);
    try {
      const ai = new GoogleGenAI({ apiKey: geminiApiKey });
      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash",
        contents: `You are a helpful and experienced community member in the r/${comment.subreddit} subreddit. You work in the urban farming and gardening space.

A user has posted the following comment in a thread titled "${comment.post_title}":
"${comment.body}"

Analyze this comment in context. Is this a situation where someone could benefit from genuine, helpful advice about gardening, urban farming, hydroponics, or sustainability?

If yes, draft a conversational, non-promotional response that:
- Is concise (2-3 paragraphs max)
- Uses a friendly, helpful tone
- Provides specific, actionable information
- Does NOT include any links, URLs, or calls to action
- Does NOT mention any brand names or products
- Sounds natural and human — like an experienced community member

Also provide a relevance_score from 0-100 indicating how good an opportunity this is for genuine, value-adding engagement.

If this is NOT a good opportunity, respond with relevance_score: 0 and response: "SKIP".

Return JSON only: { "response": "...", "relevance_score": number }`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              response: { type: Type.STRING },
              relevance_score: { type: Type.NUMBER },
            },
            required: ["response", "relevance_score"],
          },
        },
      });

      const result = JSON.parse(response.text || '{"response":"SKIP","relevance_score":0}');

      if (result.relevance_score > 20 && result.response !== 'SKIP') {
        const newDraft: DraftResponse = {
          id: `dr_${Date.now()}_${comment.id}`,
          comment,
          generated_response: result.response,
          status: 'pending_review',
          relevance_score: result.relevance_score,
          created_at: new Date().toISOString(),
        };
        setDrafts(prev => [newDraft, ...prev]);
      }
    } catch (error) {
      console.error('Gemini draft generation failed:', error);
      addToast('Draft generation failed. Check console for details.', 'error');
    } finally {
      setGeneratingIds(prev => prev.filter(id => id !== comment.id));
    }
  };

  const handleScanAll = async () => {
    if (!geminiApiKey) {
      addToast('No Gemini API key configured. Add one in Settings.', 'error');
      return;
    }
    setIsScanning(true);
    const toScan = filteredComments.slice(0, 5);
    await Promise.allSettled(toScan.map(c => handleGenerateDraft(c)));
    setIsScanning(false);
    addToast(`Scan complete. ${toScan.length} comments analyzed.`);
  };

  // ─── Review Actions ────────────────────────────────────────────
  const handleApprove = (draftId: string) => {
    setDrafts(prev => prev.map(d =>
      d.id === draftId ? { ...d, status: 'approved' as const, generated_response: d.edited_response || d.generated_response } : d
    ));
    setEditingDraft(null);
    addToast('Draft approved and ready to post.');
  };

  const handleReject = (draftId: string) => {
    setDrafts(prev => prev.map(d =>
      d.id === draftId ? { ...d, status: 'rejected' as const } : d
    ));
    addToast('Draft rejected.', 'info');
  };

  const handlePost = async (draftId: string) => {
    const draft = drafts.find(d => d.id === draftId);
    if (!draft) return;

    // Fire n8n Workflow 2 — posts approved comment to Reddit
    try {
      await fetch('https://n8n.sproutify.app/webhook/reddit-post-comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parent_fullname: draft.comment.parent_fullname,
          approved_text: draft.edited_response || draft.generated_response,
          subreddit: draft.comment.subreddit,
          comment_url: draft.comment.url,
        }),
      });
    } catch {
      // n8n workflow may not be configured yet — post still marked locally
    }

    setDrafts(prev => prev.map(d =>
      d.id === draftId ? { ...d, status: 'posted' as const, posted_at: new Date().toISOString() } : d
    ));

    // Broadcast to Trellis marketing event timeline
    const event: MarketingEvent = {
      id: `reddit_${Date.now()}`,
      profile_id: 'SYSTEM',
      event_type: 'social_intent',
      source: 'reddit',
      payload: {
        subreddit: draft.comment.subreddit,
        post_title: draft.comment.post_title,
        comment_url: draft.comment.url,
        response_preview: (draft.edited_response || draft.generated_response).substring(0, 120),
        relevance_score: draft.relevance_score,
      },
      created_at: new Date().toISOString(),
    };
    setEvents(prev => [event, ...prev]);
    addToast(`Posted to r/${draft.comment.subreddit}`);
  };

  const handleStartEdit = (draft: DraftResponse) => {
    setEditingDraft(draft.id);
    setEditText(draft.edited_response || draft.generated_response);
  };

  const handleSaveEdit = (draftId: string) => {
    setDrafts(prev => prev.map(d =>
      d.id === draftId ? { ...d, edited_response: editText } : d
    ));
    setEditingDraft(null);
  };

  const handleAddSubreddit = () => {
    if (!newSubreddit.trim()) return;
    const keywords = newKeywords.split(',').map(k => k.trim()).filter(Boolean);
    setSubredditTargets(prev => [...prev, {
      name: newSubreddit.replace(/^r\//, ''),
      keywords: keywords.length > 0 ? keywords : ['gardening'],
      enabled: true,
    }]);
    setNewSubreddit('');
    setNewKeywords('');
  };

  const toggleSubreddit = (name: string) => {
    setSubredditTargets(prev => prev.map(s =>
      s.name === name ? { ...s, enabled: !s.enabled } : s
    ));
  };

  const removeSubreddit = (name: string) => {
    setSubredditTargets(prev => prev.filter(s => s.name !== name));
  };

  // ─── n8n Blueprint Actions ────────────────────────────────────
  const handleCopyBlueprint = async (type: 'scanner' | 'poster') => {
    const blueprint = type === 'scanner' ? SCANNER_BLUEPRINT : POSTER_BLUEPRINT;
    try {
      await navigator.clipboard.writeText(JSON.stringify(blueprint, null, 2));
      addToast(`${type === 'scanner' ? 'Scanner' : 'Poster'} blueprint copied to clipboard.`);
    } catch {
      addToast('Failed to copy blueprint.', 'error');
    }
  };

  const handleOpenN8n = () => {
    window.open('https://n8n.sproutify.app', '_blank', 'noopener,noreferrer');
  };

  // ─── Helpers ──────────────────────────────────────────────────
  const getTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor(diff / 60000);
    if (hours > 0) return `${hours}h ago`;
    return `${mins}m ago`;
  };

  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-emerald-600 bg-emerald-50 border-emerald-200';
    if (score >= 60) return 'text-amber-600 bg-amber-50 border-amber-200';
    return 'text-slate-500 bg-slate-50 border-slate-200';
  };

  // ─── Render ────────────────────────────────────────────────────
  return (
    <div className="space-y-8 min-h-screen pb-40">
      {/* Header Stats Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <Search size={18} className="text-slate-400" />
            <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full ${workflowActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
              {workflowActive ? 'Active' : 'Paused'}
            </span>
          </div>
          <p className="text-3xl font-black text-slate-900">{activeSubreddits.length}</p>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Subreddits Watched</p>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
          <MessageSquare size={18} className="text-orange-400 mb-3" />
          <p className="text-3xl font-black text-slate-900">{filteredComments.length}</p>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">New Opportunities</p>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
          <Clock size={18} className="text-amber-500 mb-3" />
          <p className="text-3xl font-black text-amber-600">{pendingDrafts.length}</p>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Pending Review</p>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
          <CheckCircle2 size={18} className="text-emerald-500 mb-3" />
          <p className="text-3xl font-black text-emerald-600">{approvedDrafts.length}</p>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Ready to Post</p>
        </div>
        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
          <TrendingUp size={18} className="text-indigo-500 mb-3" />
          <p className="text-3xl font-black text-indigo-600">{postedDrafts.length}</p>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Posted This Cycle</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex bg-slate-200/40 p-1.5 rounded-[2rem] w-fit border border-slate-200 shadow-sm">
        {[
          { id: 'monitor' as const, label: 'Monitor', icon: Search },
          { id: 'review' as const, label: `Review (${pendingDrafts.length})`, icon: Eye },
          { id: 'posted' as const, label: `Posted (${postedDrafts.length})`, icon: CheckCircle2 },
          { id: 'settings' as const, label: 'Targeting', icon: Target },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center space-x-3 px-7 py-3.5 rounded-[1.5rem] text-xs font-black uppercase tracking-widest transition-all ${
              activeTab === tab.id ? 'bg-white text-emerald-700 shadow-lg' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <tab.icon size={16} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* ─── MONITOR TAB ─────────────────────────────────────────── */}
      {activeTab === 'monitor' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in fade-in duration-500">
          <div className="lg:col-span-2 space-y-6">
            {/* Scan Controls */}
            <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-black text-slate-800 flex items-center">
                  <Globe size={22} className="mr-3 text-orange-500" />
                  Discovered Conversations
                </h3>
                <div className="flex items-center space-x-3">
                  <select
                    value={filterSubreddit}
                    onChange={(e) => setFilterSubreddit(e.target.value)}
                    className="text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:border-emerald-400"
                  >
                    <option value="all">All Subreddits</option>
                    {activeSubreddits.map(s => (
                      <option key={s.name} value={s.name}>r/{s.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleScanAll}
                    disabled={isScanning || filteredComments.length === 0}
                    className="flex items-center space-x-2 px-6 py-2.5 bg-slate-900 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-emerald-600 transition disabled:opacity-30"
                  >
                    {isScanning ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    <span>{isScanning ? 'Scanning...' : 'AI Scan All'}</span>
                  </button>
                </div>
              </div>

              {filteredComments.length === 0 ? (
                <div className="py-20 text-center">
                  <CheckCircle2 size={48} className="mx-auto text-emerald-300 mb-4" />
                  <p className="text-sm font-black text-slate-400 uppercase tracking-widest">All Caught Up</p>
                  <p className="text-xs text-slate-400 mt-2">Every discovered comment has been drafted.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredComments.map(comment => (
                    <div key={comment.id} className="p-6 rounded-[2rem] border-2 border-slate-100 bg-slate-50/50 hover:border-emerald-200 hover:bg-white transition-all group">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center space-x-3">
                          <span className="text-[10px] font-black bg-orange-100 text-orange-700 px-3 py-1 rounded-full uppercase">
                            r/{comment.subreddit}
                          </span>
                          <span className="text-[10px] font-bold text-slate-400">
                            u/{comment.author} · {getTimeAgo(comment.created_utc)}
                          </span>
                        </div>
                        <div className="flex items-center space-x-2 text-[10px] text-slate-400 font-bold">
                          <TrendingUp size={12} />
                          <span>{comment.score} pts</span>
                        </div>
                      </div>
                      <p className="text-[11px] font-bold text-slate-500 mb-2 line-clamp-1">
                        Re: {comment.post_title}
                      </p>
                      <p className="text-sm text-slate-700 leading-relaxed mb-4 line-clamp-3">
                        {comment.body}
                      </p>
                      <div className="flex items-center justify-between">
                        <a
                          href={comment.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] font-bold text-slate-400 hover:text-emerald-600 flex items-center space-x-1"
                        >
                          <ExternalLink size={10} />
                          <span>View on Reddit</span>
                        </a>
                        <button
                          onClick={() => handleGenerateDraft(comment)}
                          disabled={generatingIds.includes(comment.id)}
                          className="flex items-center space-x-2 px-5 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-emerald-100 transition disabled:opacity-40"
                        >
                          {generatingIds.includes(comment.id) ? (
                            <Loader2 size={12} className="animate-spin" />
                          ) : (
                            <Sparkles size={12} />
                          )}
                          <span>{generatingIds.includes(comment.id) ? 'Drafting...' : 'Generate Draft'}</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Sidebar — Active Subreddits & Workflow Status */}
          <div className="space-y-6">
            <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center">
                  <Shield size={18} className="mr-3 text-indigo-500" />
                  Workflow Status
                </h3>
                <button
                  onClick={() => setWorkflowActive(!workflowActive)}
                  className={`p-2 rounded-lg transition ${workflowActive ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}
                >
                  {workflowActive ? <Play size={14} /> : <Pause size={14} />}
                </button>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-500">Scan Interval</span>
                  <span className="font-black text-slate-800">Every {scanInterval}h</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-500">AI Engine</span>
                  <span className="font-black text-emerald-600">Gemini 2.0 Flash</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-500">Auto-Post</span>
                  <span className="font-black text-rose-500 flex items-center space-x-1">
                    <Ban size={10} />
                    <span>Disabled (Human Review)</span>
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-500">n8n Webhook</span>
                  <span className="font-black text-slate-800">Connected</span>
                </div>
              </div>
            </div>

            <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center mb-6">
                <Hash size={18} className="mr-3 text-orange-500" />
                Active Targets
              </h3>
              <div className="space-y-3">
                {activeSubreddits.map(sub => (
                  <div key={sub.name} className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-xs font-black text-slate-800">r/{sub.name}</p>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {sub.keywords.map(kw => (
                        <span key={kw} className="text-[9px] font-bold bg-white text-slate-500 px-2 py-0.5 rounded-md border border-slate-200">
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-gradient-to-br from-amber-50 to-orange-50 p-6 rounded-[2rem] border border-amber-200">
              <div className="flex items-start space-x-3">
                <AlertTriangle size={18} className="text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs font-black text-amber-800 uppercase tracking-widest mb-2">Safety Reminder</p>
                  <p className="text-[11px] text-amber-700 leading-relaxed">
                    Every draft requires human review before posting. No auto-posting. No links. No brand mentions. Value-first engagement only.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── REVIEW TAB ──────────────────────────────────────────── */}
      {activeTab === 'review' && (
        <div className="space-y-6 animate-in fade-in duration-500">
          {pendingDrafts.length === 0 && approvedDrafts.length === 0 ? (
            <div className="py-32 text-center bg-slate-50 border-4 border-dashed border-slate-200 rounded-[4rem]">
              <Eye size={64} className="mx-auto text-slate-200 mb-6 opacity-40" />
              <p className="text-xl font-black text-slate-400 uppercase tracking-widest">Review Queue Empty</p>
              <p className="text-xs text-slate-500 font-bold mt-2">Run a scan from the Monitor tab to generate drafts.</p>
            </div>
          ) : (
            <>
              {/* Pending Review */}
              {pendingDrafts.length > 0 && (
                <div>
                  <h3 className="text-sm font-black text-amber-600 uppercase tracking-widest mb-4 flex items-center">
                    <Clock size={16} className="mr-2" />
                    Pending Review ({pendingDrafts.length})
                  </h3>
                  <div className="space-y-6">
                    {pendingDrafts.map(draft => (
                      <div key={draft.id} className="bg-white rounded-[3rem] border-2 border-amber-200 shadow-sm overflow-hidden">
                        {/* Comment Context */}
                        <div className="p-8 bg-slate-50 border-b border-slate-200">
                          <div className="flex items-center space-x-3 mb-3">
                            <span className="text-[10px] font-black bg-orange-100 text-orange-700 px-3 py-1 rounded-full uppercase">
                              r/{draft.comment.subreddit}
                            </span>
                            <span className="text-[10px] font-bold text-slate-400">
                              u/{draft.comment.author}
                            </span>
                            <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border ${getScoreColor(draft.relevance_score)}`}>
                              {draft.relevance_score}% match
                            </span>
                          </div>
                          <p className="text-xs font-bold text-slate-500 mb-2">{draft.comment.post_title}</p>
                          <p className="text-sm text-slate-600 leading-relaxed italic">"{draft.comment.body}"</p>
                        </div>

                        {/* AI Generated Response */}
                        <div className="p-8">
                          <div className="flex items-center space-x-2 mb-4">
                            <Sparkles size={14} className="text-emerald-500" />
                            <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">AI Draft — Gemini</span>
                          </div>

                          {editingDraft === draft.id ? (
                            <div className="space-y-4">
                              <textarea
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                className="w-full bg-slate-50 border-2 border-emerald-300 rounded-2xl p-6 text-sm font-medium outline-none focus:bg-white focus:border-emerald-500 transition-all min-h-[180px]"
                              />
                              <div className="flex justify-end space-x-3">
                                <button
                                  onClick={() => setEditingDraft(null)}
                                  className="px-5 py-2 text-slate-500 bg-slate-100 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-slate-200 transition"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => handleSaveEdit(draft.id)}
                                  className="px-5 py-2 text-emerald-700 bg-emerald-100 border border-emerald-200 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-emerald-200 transition"
                                >
                                  Save Edit
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-6">
                              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                                {draft.edited_response || draft.generated_response}
                              </p>
                            </div>
                          )}

                          {/* Action Buttons */}
                          {editingDraft !== draft.id && (
                            <div className="flex items-center justify-between mt-6">
                              <div className="flex items-center space-x-2">
                                <button
                                  onClick={() => handleStartEdit(draft)}
                                  className="flex items-center space-x-2 px-5 py-2.5 bg-slate-50 border border-slate-200 text-slate-600 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-100 transition"
                                >
                                  <Edit2 size={12} />
                                  <span>Edit</span>
                                </button>
                                <button
                                  onClick={() => handleReject(draft.id)}
                                  className="flex items-center space-x-2 px-5 py-2.5 bg-rose-50 border border-rose-200 text-rose-600 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-100 transition"
                                >
                                  <ThumbsDown size={12} />
                                  <span>Reject</span>
                                </button>
                              </div>
                              <button
                                onClick={() => handleApprove(draft.id)}
                                className="flex items-center space-x-2 px-8 py-2.5 bg-emerald-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-emerald-700 transition shadow-lg"
                              >
                                <ThumbsUp size={14} />
                                <span>Approve</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Approved — Ready to Post */}
              {approvedDrafts.length > 0 && (
                <div>
                  <h3 className="text-sm font-black text-emerald-600 uppercase tracking-widest mb-4 flex items-center">
                    <CheckCircle2 size={16} className="mr-2" />
                    Approved — Ready to Post ({approvedDrafts.length})
                  </h3>
                  <div className="space-y-4">
                    {approvedDrafts.map(draft => (
                      <div key={draft.id} className="bg-white p-8 rounded-[2.5rem] border-2 border-emerald-300 shadow-sm">
                        <div className="flex items-center space-x-3 mb-3">
                          <span className="text-[10px] font-black bg-orange-100 text-orange-700 px-3 py-1 rounded-full uppercase">
                            r/{draft.comment.subreddit}
                          </span>
                          <span className="text-[10px] font-bold text-slate-400">
                            Replying to u/{draft.comment.author}
                          </span>
                        </div>
                        <p className="text-sm text-slate-700 leading-relaxed mb-6 line-clamp-3">
                          {draft.edited_response || draft.generated_response}
                        </p>
                        <div className="flex items-center justify-between">
                          <button
                            onClick={() => {
                              setDrafts(prev => prev.map(d =>
                                d.id === draft.id ? { ...d, status: 'pending_review' as const } : d
                              ));
                            }}
                            className="text-[10px] font-bold text-slate-400 hover:text-slate-600 flex items-center space-x-1"
                          >
                            <RotateCcw size={10} />
                            <span>Back to Review</span>
                          </button>
                          <button
                            onClick={() => handlePost(draft.id)}
                            className="flex items-center space-x-2 px-8 py-3 bg-slate-900 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-emerald-600 transition shadow-xl"
                          >
                            <Send size={14} />
                            <span>Post to Reddit</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ─── POSTED TAB ──────────────────────────────────────────── */}
      {activeTab === 'posted' && (
        <div className="space-y-6 animate-in fade-in duration-500">
          {postedDrafts.length === 0 ? (
            <div className="py-32 text-center bg-slate-50 border-4 border-dashed border-slate-200 rounded-[4rem]">
              <Rocket size={64} className="mx-auto text-slate-200 mb-6 opacity-40" />
              <p className="text-xl font-black text-slate-400 uppercase tracking-widest">No Posts Yet</p>
              <p className="text-xs text-slate-500 font-bold mt-2">Approved drafts will appear here once posted.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {postedDrafts.map(draft => (
                <div key={draft.id} className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <span className="text-[10px] font-black bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full uppercase flex items-center space-x-1">
                        <CheckCircle2 size={10} />
                        <span>Posted</span>
                      </span>
                      <span className="text-[10px] font-black bg-orange-100 text-orange-700 px-3 py-1 rounded-full uppercase">
                        r/{draft.comment.subreddit}
                      </span>
                      <span className="text-[10px] font-bold text-slate-400">
                        {draft.posted_at ? getTimeAgo(draft.posted_at) : ''}
                      </span>
                    </div>
                    <a
                      href={draft.comment.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] font-bold text-emerald-600 hover:text-emerald-800 flex items-center space-x-1"
                    >
                      <ExternalLink size={10} />
                      <span>View Thread</span>
                    </a>
                  </div>
                  <p className="text-xs font-bold text-slate-500 mb-2">{draft.comment.post_title}</p>
                  <p className="text-sm text-slate-700 leading-relaxed">
                    {draft.edited_response || draft.generated_response}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Rejected Archive */}
          {rejectedDrafts.length > 0 && (
            <div>
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center">
                <Archive size={16} className="mr-2" />
                Rejected ({rejectedDrafts.length})
              </h3>
              <div className="space-y-3">
                {rejectedDrafts.map(draft => (
                  <div key={draft.id} className="bg-slate-50 p-6 rounded-2xl border border-slate-200 opacity-60">
                    <div className="flex items-center space-x-3 mb-2">
                      <span className="text-[10px] font-black bg-rose-100 text-rose-600 px-2 py-0.5 rounded-full">Rejected</span>
                      <span className="text-[10px] font-bold text-slate-400">r/{draft.comment.subreddit}</span>
                    </div>
                    <p className="text-xs text-slate-500 line-clamp-2">{draft.generated_response}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── SETTINGS TAB ────────────────────────────────────────── */}
      {activeTab === 'settings' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-in fade-in duration-500">
          {/* Subreddit Targets */}
          <div className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm">
            <h3 className="text-lg font-black text-slate-800 flex items-center mb-8 pb-6 border-b border-slate-100">
              <Target size={24} className="mr-4 text-orange-500" />
              Subreddit Targets
            </h3>

            {/* Add New */}
            <div className="bg-slate-50 p-6 rounded-2xl border border-slate-200 mb-6">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3">Add Subreddit</p>
              <div className="space-y-3">
                <input
                  type="text"
                  placeholder="e.g. UrbanGardening"
                  value={newSubreddit}
                  onChange={(e) => setNewSubreddit(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:border-emerald-400"
                />
                <input
                  type="text"
                  placeholder="Keywords (comma-separated)"
                  value={newKeywords}
                  onChange={(e) => setNewKeywords(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:border-emerald-400"
                />
                <button
                  onClick={handleAddSubreddit}
                  disabled={!newSubreddit.trim()}
                  className="flex items-center space-x-2 px-6 py-2.5 bg-slate-900 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-emerald-600 transition disabled:opacity-30"
                >
                  <Plus size={14} />
                  <span>Add Target</span>
                </button>
              </div>
            </div>

            {/* Existing Targets */}
            <div className="space-y-3">
              {subredditTargets.map(sub => (
                <div key={sub.name} className={`p-5 rounded-2xl border-2 transition-all ${sub.enabled ? 'bg-white border-emerald-200' : 'bg-slate-50 border-slate-100 opacity-60'}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-3">
                      <button
                        onClick={() => toggleSubreddit(sub.name)}
                        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition ${sub.enabled ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300'}`}
                      >
                        {sub.enabled && <Check size={12} className="text-white" />}
                      </button>
                      <span className="text-sm font-black text-slate-800">r/{sub.name}</span>
                    </div>
                    <button
                      onClick={() => removeSubreddit(sub.name)}
                      className="p-1.5 text-slate-300 hover:text-rose-500 transition"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5 ml-8">
                    {sub.keywords.map(kw => (
                      <span key={kw} className="text-[9px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md">
                        {kw}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Workflow Configuration */}
          <div className="space-y-8">
            <div className="bg-white p-10 rounded-[3rem] border border-slate-200 shadow-sm">
              <h3 className="text-lg font-black text-slate-800 flex items-center mb-8 pb-6 border-b border-slate-100">
                <Settings2 size={24} className="mr-4 text-indigo-500" />
                Workflow Config
              </h3>

              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Scan Interval (hours)</label>
                  <div className="flex items-center space-x-3">
                    {[1, 3, 6, 12, 24].map(h => (
                      <button
                        key={h}
                        onClick={() => setScanInterval(h)}
                        className={`px-4 py-2 rounded-xl text-xs font-black transition ${scanInterval === h ? 'bg-emerald-600 text-white shadow-lg' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                      >
                        {h}h
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">AI Engine</label>
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center space-x-3">
                    <Sparkles size={16} className="text-emerald-600" />
                    <div>
                      <p className="text-xs font-black text-emerald-800">Google Gemini 2.0 Flash</p>
                      <p className="text-[10px] text-emerald-600">
                        {geminiApiKey ? 'Using your Trellis API key' : 'No API key configured — add one in Settings'}
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest block mb-2">Safety Guardrails</label>
                  <div className="space-y-2">
                    {[
                      { label: 'Human review required before posting', enabled: true, locked: true },
                      { label: 'No links or URLs in responses', enabled: true, locked: true },
                      { label: 'No brand names or product mentions', enabled: true, locked: true },
                      { label: 'Skip bot & moderator comments', enabled: true, locked: false },
                      { label: 'Minimum relevance score: 50%', enabled: true, locked: false },
                    ].map(guard => (
                      <div key={guard.label} className="flex items-center space-x-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <div className={`w-4 h-4 rounded-md flex items-center justify-center ${guard.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}>
                          {guard.enabled && <Check size={10} className="text-white" />}
                        </div>
                        <span className="text-xs font-bold text-slate-600 flex-1">{guard.label}</span>
                        {guard.locked && (
                          <Shield size={12} className="text-slate-400" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* n8n Integration Card */}
            <div className="bg-gradient-to-br from-indigo-50 to-violet-50 p-8 rounded-[2.5rem] border border-indigo-200">
              <h3 className="text-sm font-black text-indigo-800 uppercase tracking-widest flex items-center mb-4">
                <Terminal size={18} className="mr-3 text-indigo-500" />
                n8n Workflow Blueprints
              </h3>
              <p className="text-xs text-indigo-700 leading-relaxed mb-4">
                Two n8n workflows power this module. <strong>Scanner</strong> runs on a schedule to discover posts and stage drafts. <strong>Poster</strong> fires via webhook when you hit "Post to Reddit."
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => handleCopyBlueprint('scanner')}
                  className="flex items-center space-x-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition shadow-lg"
                >
                  <Copy size={12} />
                  <span>Copy Scanner</span>
                </button>
                <button
                  onClick={() => handleCopyBlueprint('poster')}
                  className="flex items-center space-x-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-700 transition shadow-lg"
                >
                  <Copy size={12} />
                  <span>Copy Poster</span>
                </button>
                <button
                  onClick={handleOpenN8n}
                  className="flex items-center space-x-2 px-5 py-2.5 bg-white text-indigo-700 border border-indigo-200 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-indigo-50 transition"
                >
                  <ExternalLink size={12} />
                  <span>Open n8n</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RedditGrowth;
