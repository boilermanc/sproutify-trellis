
import React, { useState, useMemo } from 'react';
import { 
  Search, Book, Zap, ShieldCheck, Database, Rocket, 
  Workflow, Users, Mail, Terminal, ChevronRight, 
  ArrowUpRight, ExternalLink, Play, Clock, Sparkles,
  Info, Cpu, Layers, Split, Network, CheckCircle2, HelpCircle,
  ArrowLeft, Share2, Printer, Bug, Fingerprint, History, Timer,
  UserMinus, ShieldAlert, Recycle, Archive
} from 'lucide-react';

const CATEGORIES = [
  { id: 'basics', title: 'Trellis Basics', icon: Book, color: 'text-blue-500', bg: 'bg-blue-50' },
  { id: 'identity', title: 'Identity Resolution', icon: Users, color: 'text-emerald-500', bg: 'bg-emerald-50' },
  { id: 'campaigns', title: 'Campaign Architecture', icon: Rocket, color: 'text-indigo-500', bg: 'bg-indigo-50' },
  { id: 'orchestration', title: 'n8n & Logic Gates', icon: Workflow, color: 'text-amber-500', bg: 'bg-amber-50' },
  { id: 'dispatch', title: 'Resend Lab', icon: Mail, color: 'text-rose-500', bg: 'bg-rose-50' },
  { id: 'advanced', title: 'Developer Tools', icon: Terminal, color: 'text-slate-500', bg: 'bg-slate-50' },
];

interface Article {
  id: string;
  cat: string;
  title: string;
  desc: string;
  time: string;
  content: string;
}

const ARTICLES: Article[] = [
  {
    id: 'art_ttl_hygiene',
    cat: 'advanced',
    title: 'TTL Policy & Data Hygiene',
    desc: 'Maintaining a lean Hub by purging noise and tiering event storage.',
    time: '4m',
    content: `
      ## The Data Bloat Challenge
      In a multi-spoke ecosystem, high-volume events like "Email Open" and "Link Click" can generate millions of rows monthly. Storing these indefinitely in the "Hot" production table slows down identity lookups and increases Postgres costs.

      ## Trellis Solution: 90-Day TTL (Time To Live)
      Trellis implements a multi-tier storage policy enforced via **pg_cron**.

      ### 1. The 90-Day Gate
      Events in the \`marketing_events\` table are checked daily. Any record older than 90 days is processed based on its value.

      ### 2. Tiered Archival (Business Logic)
      - **High-Value Events**: Signups, Purchases, and Support Resolutions are moved to the \`compressed_archive_events\` table. This allows for long-term LTV analysis without impacting production performance.
      - **Noise Purge**: Purely behavioral logs (Opens, Clicks, heartbeats) are deleted entirely after 90 days.

      ### 3. Master Profiles are Forever
      The TTL policy **never** affects the \`profiles\` table. A customer's identity, total spend (LTV), and cross-site segments are preserved indefinitely.

      ### Configuration Tip
      You can manually trigger a purge cycle in the **DevTools > Data Hygiene** tab to see the current storage distribution.
    `
  },
  { 
    id: 'art_delete_lifecycle', 
    cat: 'identity', 
    title: 'Hardened Delete Lifecycle', 
    desc: 'Preventing "Zombie" marketing via cross-site check logic.', 
    time: '6m',
    content: `
      ## The Zombie Profile Problem
      In a multi-site ecosystem, a user might delete their account on one site (e.g., micro.sproutify.app) but remain active on another (e.g., farm.sproutify.app). A naïve delete webhook would either erase their entire master history or leave them subscribed to global marketing they no longer want.

      ## Trellis Solution: Global Check Logic
      Trellis implements a **Harden Delete Lifecycle** that preserves identity while respecting privacy.

      ### 1. Spoke-Specific Cleanup
      When a DELETE webhook arrives, the Hub removes only that specific site from the user's \`source_sites\` array. 

      ### 2. The Global Check
      The orchestration engine immediately performs a check: "Does this user still exist on any other Sproutify sites?"

      ### 3. Zombie Prevention
      - **IF** \`source_sites.length > 0\`: The Hub keeps the profile active but marks that specific spoke as inactive.
      - **IF** \`source_sites.length == 0\`: The Hub automatically sets \`is_subscribed = false\` and \`status = 'deleted'\`. 

      This ensures that once a user has completely left the Sproutify ecosystem, no further marketing dispatches (Resend) or AI social intents (Gemini) are processed for that identity.
    `
  },
  { 
    id: 'art_queuing', 
    cat: 'orchestration', 
    title: 'Throttling & Worker Architecture', 
    desc: 'Protecting downstream APIs from high-volume surges.', 
    time: '8m',
    content: `
      ## The Rate Limit Problem
      Downstream APIs like **Gemini** (LLM) and **Resend** (Email) have hard rate limits (e.g., 10 RPM or 100 requests/sec). If a Sproutify spoke sends 1,000 signups in one second, a direct ingest workflow will trigger 429 errors and drop data.

      ## Trellis Solution: Producer-Consumer Pattern
      Trellis implements a **Rate-Limit Queue** using Supabase and a separate Worker workflow.

      ### 1. The Producer (Webhook Ingest)
      Instead of executing marketing logic, the ingestion webhook merely writes the payload to the \`marketing_task_queue\` table. This operation is sub-10ms and extremely resilient.

      ### 2. The Consumer (The Worker)
      A separate n8n workflow is configured with a **Cron Trigger** (e.g., every 1 minute) or a **Recursive Loop**.
      - It pulls a fixed batch (e.g., 50 records) from the queue.
      - It processes them sequentially or with a delay (e.g., 100ms pause between items).
      - It marks the record as \`completed\` or \`failed\`.
    `
  },
  { 
    id: 'art_versioning', 
    cat: 'advanced', 
    title: 'Version-Based Sync Protocol', 
    desc: 'Preventing stale data from overwriting fresh Hub records.', 
    time: '5m',
    content: `
      ## The Stale Data Problem
      In a multi-site ecosystem, webhooks don't always arrive in chronological order. A "Signup" event from school.sproutify.app might be delayed by network latency, arriving *after* a more recent "Purchase" event from farm.sproutify.app.

      ## Trellis Solution: Event Timestamps
      To maintain absolute identity integrity, Trellis implements **Version-Based Upserts**.

      ### How it Works
      1. **Source Timestamp**: Every webhook sent by n8n *must* include the \`event_timestamp\` from the source database.
      2. **Conditional Update**: When the Hub processes the payload, it compares the incoming timestamp with the existing \`last_event_timestamp\` in the master Hub.
      3. **The Logic Gate**:
         - **IF** \`incoming_timestamp > current_hub_timestamp\`: The Hub updates the profile and advances the version.
         - **IF** \`incoming_timestamp <= current_hub_timestamp\`: The Hub rejects the update as "stale" and logs a Warning in the internal audit trail.
    `
  },
];

const HelpCenter: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);

  const filteredArticles = useMemo(() => {
    return ARTICLES.filter(art => {
      const matchesSearch = art.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
                           art.desc.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCat = !selectedCategory || art.cat === selectedCategory;
      return matchesSearch && matchesCat;
    });
  }, [searchTerm, selectedCategory]);

  const renderArticle = (article: Article) => (
    <div className="max-w-4xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-8 duration-500 pb-24">
      <button onClick={() => setSelectedArticle(null)} className="flex items-center space-x-3 text-slate-500 hover:text-emerald-600 transition-colors group">
        <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
        <span className="text-xs font-black uppercase tracking-widest">Back to Academy</span>
      </button>

      <div className="space-y-6 border-b border-slate-100 pb-12">
        <div className="flex items-center space-x-3 text-xs font-black text-emerald-600 uppercase tracking-widest">
           <span className="px-3 py-1 bg-emerald-50 rounded-full border border-emerald-100">{article.cat}</span>
           <span className="text-slate-300">•</span>
           <span className="flex items-center"><Clock size={14} className="mr-2" /> {article.time} Read</span>
        </div>
        <h1 className="text-5xl font-black text-slate-800 tracking-tighter uppercase leading-[0.9]">{article.title}</h1>
        <p className="text-xl text-slate-500 font-medium italic leading-relaxed max-w-2xl">{article.desc}</p>
      </div>

      <div className="prose prose-slate prose-lg max-w-none">
        {article.content.split('\n').map((line, i) => {
          if (line.trim().startsWith('###')) {
            return <h3 key={i} className="text-xl font-black text-slate-800 uppercase mt-12 mb-6">{line.replace('###', '').trim()}</h3>;
          }
          if (line.trim().startsWith('##')) {
            return <h2 key={i} className="text-3xl font-black text-slate-800 uppercase mt-16 mb-8">{line.replace('##', '').trim()}</h2>;
          }
          if (line.trim().startsWith('-')) {
            return <li key={i} className="text-slate-600 font-medium mb-2 ml-4 list-disc">{line.replace('-', '').trim()}</li>;
          }
          if (line.trim().match(/^\d\./)) {
             return <li key={i} className="text-slate-600 font-medium mb-2 ml-4 list-decimal">{line.replace(/^\d\./, '').trim()}</li>;
          }
          return line.trim() ? <p key={i} className="text-slate-600 leading-relaxed mb-6 font-medium">{line.trim()}</p> : null;
        })}
      </div>

      <div className="pt-12 border-t border-slate-100 flex items-center justify-between">
         <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-300"><Info size={24} /></div>
            <div>
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Last Updated</p>
               <p className="text-xs font-bold text-slate-800">Feb 12, 2024 by DevOps Core</p>
            </div>
         </div>
      </div>
    </div>
  );

  if (selectedArticle) return renderArticle(selectedArticle);

  return (
    <div className="max-w-7xl mx-auto space-y-12 pb-40 animate-in fade-in duration-500">
      <div className="bg-slate-900 rounded-[4rem] p-16 text-center relative overflow-hidden shadow-2xl">
         <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle, #10b981 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>
         <div className="relative z-10 max-w-2xl mx-auto">
            <h1 className="text-5xl font-black text-white tracking-tighter uppercase mb-6">Orchestration Academy</h1>
            <p className="text-slate-400 text-lg font-medium mb-10">Master the Sproutify Trellis Hub. Explore protocols, worker patterns, and identity logic.</p>
            <div className="relative group">
               <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-500 transition-colors" size={24} />
               <input className="w-full bg-white/5 border-2 border-white/10 rounded-3xl pl-16 pr-8 py-6 text-xl text-white outline-none focus:border-emerald-500 transition shadow-2xl" placeholder="Search protocol docs..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
         </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
         {CATEGORIES.map(cat => (
           <button key={cat.id} onClick={() => setSelectedCategory(selectedCategory === cat.id ? null : cat.id)} className={`p-8 rounded-[2.5rem] border-2 transition-all group flex flex-col items-center ${selectedCategory === cat.id ? 'bg-slate-900 border-emerald-500 shadow-xl scale-105' : 'bg-white border-slate-200 hover:border-emerald-400'}`}>
              <div className={`p-4 rounded-2xl ${selectedCategory === cat.id ? 'bg-white/10 text-emerald-400' : `${cat.bg} ${cat.color}`} mb-6 shadow-inner`}><cat.icon size={28} /></div>
              <h3 className={`text-[10px] font-black uppercase tracking-widest ${selectedCategory === cat.id ? 'text-white' : 'text-slate-800'}`}>{cat.title}</h3>
           </button>
         ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
         <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between mb-4">
               <h2 className="text-2xl font-black text-slate-800 uppercase tracking-tight">{selectedCategory ? `${selectedCategory.replace('-', ' ')} Protocols` : 'Key Protocols'}</h2>
            </div>
            {filteredArticles.map((art) => (
              <button key={art.id} onClick={() => setSelectedArticle(art)} className="group p-8 bg-white border border-slate-100 rounded-[2.5rem] hover:border-emerald-500 transition-all flex items-center justify-between cursor-pointer text-left w-full shadow-sm">
                <div className="flex items-center space-x-8">
                  <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 shadow-inner group-hover:bg-emerald-50 group-hover:text-emerald-600 transition">
                    {art.id === 'art_ttl_hygiene' ? <Recycle size={32} /> : art.id === 'art_delete_lifecycle' ? <UserMinus size={32} /> : art.id === 'art_queuing' ? <Timer size={32} /> : art.id === 'art_versioning' ? <History size={32} /> : <Book size={32} />}
                  </div>
                  <div>
                    <div className="flex items-center space-x-3 mb-1">
                      <h4 className="text-lg font-black text-slate-800 uppercase">{art.title}</h4>
                    </div>
                    <p className="text-sm text-slate-500 font-medium">{art.desc}</p>
                  </div>
                </div>
                <ChevronRight size={24} className="text-slate-300 group-hover:text-emerald-500 transition" />
              </button>
            ))}
         </div>
         <div className="space-y-8">
            <div className="bg-emerald-50 border border-emerald-100 p-10 rounded-[3rem] shadow-sm relative overflow-hidden">
               <div className="absolute top-0 right-0 p-4 opacity-10"><ShieldCheck size={120} className="text-emerald-600" /></div>
               <h3 className="text-xs font-black text-emerald-900 uppercase tracking-widest mb-6">Status Overview</h3>
               <div className="space-y-4 relative z-10">
                  <div className="flex justify-between items-center text-[10px] font-black text-emerald-700 uppercase">
                     <span>Queue Worker</span>
                     <span className="flex items-center"><CheckCircle2 size={12} className="mr-2" /> Active</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-black text-emerald-700 uppercase">
                     <span>Data Hygiene</span>
                     <span className="flex items-center"><Recycle size={12} className="mr-2" /> Tiered TTL</span>
                  </div>
                  <div className="flex justify-between items-center text-[10px] font-black text-emerald-700 uppercase">
                     <span>Zombie Protection</span>
                     <span className="flex items-center"><ShieldCheck size={12} className="mr-2" /> Enforced</span>
                  </div>
               </div>
            </div>
         </div>
      </div>
    </div>
  );
};

export default HelpCenter;
