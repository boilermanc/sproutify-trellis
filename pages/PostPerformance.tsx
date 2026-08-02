import React, { useEffect, useMemo, useState } from 'react';
import {
  Award, RefreshCw, Loader2, Sparkles, ImageOff, ArrowUpDown, Info, Bookmark, Share2, Eye,
} from 'lucide-react';
import { ApiKeyConfig, BranchContext, CardTemplate, CardPalette } from '../types';
import { supabase } from '../lib/supabase';
import { generateText } from '../services/aiService';
import { fetchLatestInsights, engagementRate, saveRate, shareRate, PostInsightSnapshot } from '../services/socialInsightsService';

// ─── Post Performance ───────────────────────────────────────────────
// The organic mirror of AdPerformance.tsx: joins published Instagram posts
// back to the creative that produced them so "which template/angle wins"
// is a stated fact instead of a pile of engagement numbers with no
// creative signal. The join key is `creative_template`/`creative_meta` on
// scheduled_social_posts, written at approve time in CardStudio.tsx.
// Insight numbers (saves/shares/impressions) come from social_post_insights
// via services/socialInsightsService.ts, synced by a separate n8n worker.
// ────────────────────────────────────────────────────────────────────

interface PostPerformanceProps {
  apiKeys?: ApiKeyConfig;
  branchContext?: BranchContext;
  addToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const DEFAULT_KEYS: ApiKeyConfig = {
  active_llm: 'gemini',
  gemini_api_key: '',
  openai_api_key: '',
  anthropic_api_key: '',
  n8n_webhooks: { chat: '', workflow: '' },
  resend_token: '',
  resend_from_address: '',
  twilio_sid: '',
  twilio_token: '',
  woo_consumer_key: '',
  woo_consumer_secret: '',
};

// A post approved via Card Studio carries a template + a compact creative
// summary; a post uploaded straight into Post Scheduler carries neither —
// that's a real bucket ("uploaded"), not missing data.
type TemplateBucket = CardTemplate | 'uploaded';

const TEMPLATE_LABEL: Record<TemplateBucket, string> = {
  verse: 'Verse',
  statement: 'Statement',
  grid: 'Grid',
  editorial: 'Editorial',
  list: 'List',
  conversation: 'Conversation',
  stat: 'Stat',
  quote: 'Quote',
  uploaded: 'Uploaded (no template)',
};

interface CreativeMeta {
  palette?: CardPalette;
  rationale?: string | null;
  has_scripture?: boolean;
  background_source?: 'upload' | 'library' | 'gradient';
  [key: string]: unknown;
}

interface PublishedPost {
  id: string;
  branch_id: string;
  branch_slug: string | null;
  platform: string;
  caption: string;
  media_type: string;
  media_urls: string[];
  scheduled_for: string;
  published_at: string | null;
  post_id: string | null;
  source: string | null;
  creative_template: CardTemplate | null;
  creative_meta: CreativeMeta | null;
  insight: PostInsightSnapshot | null;
}

interface TemplateLeaderboardEntry {
  template: TemplateBucket;
  totalPosts: number;
  measuredPosts: number;
  totalSaves: number;
  totalShares: number;
  totalImpressions: number;
  avgSaves: number | null;
  avgShares: number | null;
  avgEngagementRate: number | null;
  avgSaveRate: number | null;
  hasEnoughData: boolean;
  samplePalette: CardPalette | null;
}

// Minimum published-and-measured posts before a template bucket's averages
// are treated as signal rather than noise — stated in the UI, not hidden.
const MIN_POSTS_FOR_SIGNIFICANCE = 3;

const NO_FABRICATION_RULE =
  'Base every observation strictly on the LEADERBOARD DATA and POST DATA provided below. Never invent, estimate, simulate, or illustrate a metric. ' +
  'If a template bucket does not have enough measured posts to judge (has_enough_data: false), say plainly there is not enough data for it rather than guessing. ' +
  'Never present hypothetical or example figures as findings. Only cite numbers that actually appear in the data above.';

type SortKey = 'saves' | 'shares' | 'impressions' | 'recent';

const fmtNumber = (n: number | null | undefined): string => (n === null || n === undefined ? '—' : n.toLocaleString());
const fmtPct = (n: number | null): string => (n === null ? '—' : `${n.toFixed(2)}%`);
const fmtAvg = (n: number | null): string => (n === null ? '—' : n.toFixed(1));
const fmtDate = (iso?: string | null): string => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
  catch { return iso; }
};

// n8n's Supabase node (and, defensively, any other writer) can stringify a
// JSONB column instead of leaving it native — normalize on read the same
// way services/scheduledPostService.ts and services/videoAdService.ts do.
function parseJsonbField<T>(value: unknown, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value as T;
  try {
    const parsed = JSON.parse(value);
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

const PostPerformance: React.FC<PostPerformanceProps> = ({ apiKeys, branchContext, addToast }) => {
  const activeKeys = apiKeys || DEFAULT_KEYS;

  const [posts, setPosts] = useState<PublishedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('saves');

  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const branchLabel = (slug: string | null): string => {
    if (!slug) return '—';
    return branchContext?.allBranches.find(b => b.slug === slug)?.name || slug;
  };

  const loadPosts = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { data, error } = await supabase
        .from('scheduled_social_posts')
        .select('id, branch_id, branch_slug, platform, caption, media_type, media_urls, scheduled_for, published_at, post_id, source, creative_template, creative_meta')
        .eq('status', 'published')
        .eq('platform', 'instagram')
        .order('published_at', { ascending: false });

      if (error) throw error;

      const rows: PublishedPost[] = (data || []).map((row: any) => ({
        id: row.id,
        branch_id: row.branch_id,
        branch_slug: row.branch_slug ?? null,
        platform: row.platform,
        caption: row.caption || '',
        media_type: row.media_type,
        media_urls: parseJsonbField<string[]>(row.media_urls, []),
        scheduled_for: row.scheduled_for,
        published_at: row.published_at ?? null,
        post_id: row.post_id ?? null,
        source: row.source ?? null,
        creative_template: (row.creative_template as CardTemplate | null) ?? null,
        creative_meta: parseJsonbField<CreativeMeta | null>(row.creative_meta, null),
        insight: null,
      }));

      if (rows.length > 0) {
        const insights = await fetchLatestInsights(rows.map(r => r.id));
        for (const row of rows) {
          row.insight = insights.get(row.id) ?? null;
        }
      }

      setPosts(rows);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to load published posts.';
      setLoadError(message);
      addToast?.(message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadPosts(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Branch scoping — creative is per-brand, so a mixed leaderboard would
  // compare posts that were never speaking to the same audience. ──
  const branchOptions = useMemo(() => {
    const slugs: string[] = Array.from(
      new Set<string>(posts.map(p => p.branch_slug).filter((b): b is string => !!b)),
    );
    return slugs.sort((a, b) => branchLabel(a).localeCompare(branchLabel(b)));
  }, [posts, branchContext]);

  const scopedPosts = useMemo(
    () => (branchFilter === 'all' ? posts : posts.filter(p => p.branch_slug === branchFilter)),
    [posts, branchFilter],
  );

  const measuredCount = useMemo(() => scopedPosts.filter(p => p.insight).length, [scopedPosts]);

  // ── Leaderboard by creative template ──
  const templateLeaderboard = useMemo<TemplateLeaderboardEntry[]>(() => {
    const buckets = new Map<TemplateBucket, PublishedPost[]>();
    for (const post of scopedPosts) {
      const key: TemplateBucket = post.creative_template ?? 'uploaded';
      const bucket = buckets.get(key);
      if (bucket) bucket.push(post);
      else buckets.set(key, [post]);
    }

    const entries: TemplateLeaderboardEntry[] = [];
    for (const [template, bucketPosts] of buckets) {
      const measured = bucketPosts.filter(p => p.insight);
      const totalSaves = measured.reduce((sum, p) => sum + (p.insight?.saves ?? 0), 0);
      const totalShares = measured.reduce((sum, p) => sum + (p.insight?.shares ?? 0), 0);
      const totalImpressions = measured.reduce((sum, p) => sum + (p.insight?.impressions ?? 0), 0);

      const engagementRates = measured.map(p => (p.insight ? engagementRate(p.insight) : null)).filter((n): n is number => n !== null);
      const saveRates = measured.map(p => (p.insight ? saveRate(p.insight) : null)).filter((n): n is number => n !== null);

      const samplePalette = bucketPosts.find(p => p.creative_meta?.palette)?.creative_meta?.palette ?? null;

      entries.push({
        template,
        totalPosts: bucketPosts.length,
        measuredPosts: measured.length,
        totalSaves,
        totalShares,
        totalImpressions,
        avgSaves: measured.length ? totalSaves / measured.length : null,
        avgShares: measured.length ? totalShares / measured.length : null,
        avgEngagementRate: engagementRates.length ? engagementRates.reduce((a, b) => a + b, 0) / engagementRates.length : null,
        avgSaveRate: saveRates.length ? saveRates.reduce((a, b) => a + b, 0) / saveRates.length : null,
        hasEnoughData: measured.length >= MIN_POSTS_FOR_SIGNIFICANCE,
        samplePalette,
      });
    }

    return entries.sort((a, b) => (b.avgSaves ?? -1) - (a.avgSaves ?? -1));
  }, [scopedPosts]);

  const bestTemplateKey = useMemo(() => {
    const qualifying = templateLeaderboard.filter(e => e.hasEnoughData && e.avgSaves !== null);
    if (qualifying.length === 0) return null;
    return qualifying.reduce((best, e) => ((e.avgSaves as number) > (best.avgSaves as number) ? e : best)).template;
  }, [templateLeaderboard]);

  // ── Individual post list ──
  const sortedPosts = useMemo(() => {
    const copy = [...scopedPosts];
    copy.sort((a, b) => {
      if (sortKey === 'recent') {
        return new Date(b.published_at || b.scheduled_for).getTime() - new Date(a.published_at || a.scheduled_for).getTime();
      }
      const aVal = sortKey === 'saves' ? a.insight?.saves : sortKey === 'shares' ? a.insight?.shares : a.insight?.impressions;
      const bVal = sortKey === 'saves' ? b.insight?.saves : sortKey === 'shares' ? b.insight?.shares : b.insight?.impressions;
      if (aVal === undefined && bVal === undefined) return 0;
      if (aVal === undefined) return 1;
      if (bVal === undefined) return -1;
      return (bVal as number) - (aVal as number);
    });
    return copy;
  }, [scopedPosts, sortKey]);

  // ── AI advisor ──
  const buildAdvisorPrompt = (entries: TemplateLeaderboardEntry[], individualPosts: PublishedPost[]): string => {
    const leaderboardSummary = entries.map(e => ({
      template: TEMPLATE_LABEL[e.template],
      total_posts_published: e.totalPosts,
      measured_posts: e.measuredPosts,
      total_saves: e.totalSaves,
      total_shares: e.totalShares,
      total_impressions: e.totalImpressions,
      avg_saves_per_post: e.avgSaves === null ? null : Number(e.avgSaves.toFixed(2)),
      avg_shares_per_post: e.avgShares === null ? null : Number(e.avgShares.toFixed(2)),
      avg_engagement_rate_pct: e.avgEngagementRate === null ? null : Number(e.avgEngagementRate.toFixed(2)),
      avg_save_rate_pct: e.avgSaveRate === null ? null : Number(e.avgSaveRate.toFixed(2)),
      has_enough_data: e.hasEnoughData,
    }));

    const postSummary = individualPosts
      .filter(p => p.insight)
      .slice(0, 40)
      .map(p => ({
        template: p.creative_template ? TEMPLATE_LABEL[p.creative_template] : TEMPLATE_LABEL.uploaded,
        rationale: p.creative_meta?.rationale ?? null,
        has_scripture: p.creative_meta?.has_scripture ?? null,
        background_source: p.creative_meta?.background_source ?? null,
        caption_preview: p.caption.slice(0, 120),
        saves: p.insight?.saves ?? null,
        shares: p.insight?.shares ?? null,
        impressions: p.insight?.impressions ?? null,
        published_at: p.published_at,
      }));

    return `You are advising on organic Instagram content for Sproutify Trellis. Below is the complete, factual performance leaderboard, grouped by the creative template used ("verse", "statement", "grid", "editorial", or "uploaded" for bring-your-own-creative posts with no template), plus the individual measured posts with the creative director's original rationale for each concept.

MINIMUM SIGNIFICANCE THRESHOLD: a template bucket needs at least ${MIN_POSTS_FOR_SIGNIFICANCE} measured (insight-synced) posts before its averages are meaningful. Any bucket with has_enough_data: false has too little data — say so plainly rather than judging it.

TEMPLATE LEADERBOARD:
${JSON.stringify(leaderboardSummary, null, 2)}

INDIVIDUAL MEASURED POSTS:
${JSON.stringify(postSummary, null, 2)}

${NO_FABRICATION_RULE}

Write a concise brief with exactly two sections:
1. WHAT'S WORKING — name the specific template(s)/angle(s) with the strongest saves/shares/engagement, citing the exact numbers that justify it. If nothing has enough data yet, say so plainly.
2. PATTERNS & NEXT ANGLES — using the rationale text on the winning posts, what do they have in common (subject matter, tone, use of scripture, photo vs. flat background)? Propose 2-3 specific next creative angles worth testing, grounded only in what is already working.

Keep it under 300 words.`;
  };

  const handleAskAdvisor = async () => {
    if (templateLeaderboard.length === 0) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const response = await generateText(activeKeys, {
        prompt: buildAdvisorPrompt(templateLeaderboard, scopedPosts),
        maxTokens: 1024,
        temperature: 0.4,
      });
      if (response.error) {
        setAiError(response.error);
      } else {
        setAiResult(response.text || 'The advisor returned no recommendation. Try again.');
      }
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Failed to reach the AI advisor.');
    } finally {
      setAiLoading(false);
    }
  };

  const PaletteSwatch: React.FC<{ palette: CardPalette | null | undefined }> = ({ palette }) => {
    if (!palette) return <span className="text-[10px] text-slate-300">—</span>;
    const dots = [palette.bg1, palette.accent, palette.text].filter(Boolean);
    return (
      <div className="flex items-center gap-1">
        {dots.map((color, i) => (
          <span key={i} className="w-2.5 h-2.5 rounded-full border border-white shadow-sm shrink-0" style={{ backgroundColor: color }} />
        ))}
      </div>
    );
  };

  return (
    <div className="p-6 lg:p-10 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center shadow-lg">
            <Award className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Post Performance</h1>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
              Published Instagram posts · which template/angle actually performs
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={loadPosts}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 flex items-center justify-center text-slate-400 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" /> Loading published posts…
        </div>
      ) : loadError ? (
        <div className="bg-white rounded-2xl border border-rose-200 shadow-sm p-8 text-center space-y-2">
          <p className="text-sm font-bold text-rose-600">Failed to load post performance.</p>
          <p className="text-xs text-slate-400">{loadError}</p>
        </div>
      ) : posts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center space-y-2">
          <Award className="w-8 h-8 text-slate-200 mx-auto" />
          <p className="text-sm font-bold text-slate-500">No organic posts have published yet.</p>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Once posts approved in Card Studio or queued in Post Scheduler go live on Instagram, they'll show up here ranked by saves, shares, and impressions — grouped by the creative template that produced them.
          </p>
        </div>
      ) : (
        <>
          {/* Branch scoping */}
          {branchOptions.length > 1 && (
            <div className="flex items-center justify-end">
              <select
                value={branchFilter}
                onChange={e => { setBranchFilter(e.target.value); setAiResult(null); }}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-slate-600 focus:outline-none focus:border-emerald-500 transition"
                title="Creative is per-brand — compare within one brand at a time"
              >
                <option value="all">All brands</option>
                {branchOptions.map(slug => (
                  <option key={slug} value={slug}>{branchLabel(slug)}</option>
                ))}
              </select>
            </div>
          )}

          {measuredCount === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center space-y-2">
              <Info className="w-6 h-6 text-slate-300 mx-auto" />
              <p className="text-sm font-bold text-slate-500">
                {scopedPosts.length} post{scopedPosts.length === 1 ? '' : 's'} published, but no engagement data has synced yet.
              </p>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                The insights sync worker pulls saves, shares, and impressions from Instagram on a schedule. Check back once it's had a chance to run — the leaderboard will populate automatically.
              </p>
            </div>
          ) : (
            <>
              {/* Template leaderboard */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                <div className="flex items-center gap-2">
                  <Award className="w-4 h-4 text-emerald-600" />
                  <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight">Leaderboard By Template</h2>
                </div>

                <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                  <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-slate-500">
                    A template needs at least <strong>{MIN_POSTS_FOR_SIGNIFICANCE} measured posts</strong> before its averages are treated as signal —
                    below that it's marked "not enough data" instead of ranked.
                  </p>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50">
                      <tr className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        <th className="text-left px-3 py-2">Template</th>
                        <th className="text-right px-3 py-2">Published</th>
                        <th className="text-right px-3 py-2">Measured</th>
                        <th className="text-right px-3 py-2">Avg Saves</th>
                        <th className="text-right px-3 py-2">Avg Shares</th>
                        <th className="text-right px-3 py-2">Avg Engagement</th>
                        <th className="text-right px-3 py-2">Avg Save Rate</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {templateLeaderboard.map((entry) => (
                        <tr key={entry.template} className={`hover:bg-slate-50 ${entry.template === bestTemplateKey ? 'bg-emerald-50/50' : ''}`}>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-2">
                              <PaletteSwatch palette={entry.samplePalette} />
                              <div>
                                <p className="font-bold text-slate-700">{TEMPLATE_LABEL[entry.template]}</p>
                                <div className="flex items-center gap-1.5">
                                  {entry.template === bestTemplateKey && (
                                    <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600">Best Avg Saves</span>
                                  )}
                                  {!entry.hasEnoughData && (
                                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Not enough data</span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right text-slate-700">{fmtNumber(entry.totalPosts)}</td>
                          <td className="px-3 py-2 text-right text-slate-700">{fmtNumber(entry.measuredPosts)}</td>
                          <td className="px-3 py-2 text-right font-bold text-slate-700">{fmtAvg(entry.avgSaves)}</td>
                          <td className="px-3 py-2 text-right text-slate-700">{fmtAvg(entry.avgShares)}</td>
                          <td className="px-3 py-2 text-right text-slate-700">{fmtPct(entry.avgEngagementRate)}</td>
                          <td className="px-3 py-2 text-right text-slate-700">{fmtPct(entry.avgSaveRate)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Individual post list */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 text-emerald-600" />
                    <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight">Published Posts</h2>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                    {(['saves', 'shares', 'impressions', 'recent'] as SortKey[]).map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSortKey(key)}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition ${
                          sortKey === key ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        {key === 'saves' ? 'Saves' : key === 'shares' ? 'Shares' : key === 'impressions' ? 'Impressions' : 'Recent'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50">
                      <tr className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        <th className="text-left px-3 py-2">Post</th>
                        <th className="text-left px-3 py-2">Template</th>
                        <th className="text-left px-3 py-2">Palette</th>
                        <th className="text-left px-3 py-2">Branch</th>
                        <th className="text-right px-3 py-2">Saves</th>
                        <th className="text-right px-3 py-2">Shares</th>
                        <th className="text-right px-3 py-2">Impressions</th>
                        <th className="text-right px-3 py-2">Published</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {sortedPosts.map((post) => {
                        const bucket: TemplateBucket = post.creative_template ?? 'uploaded';
                        return (
                          <tr key={post.id} className="hover:bg-slate-50">
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                {post.media_urls[0] ? (
                                  <img src={post.media_urls[0]} alt="" className="w-9 h-9 rounded-lg object-cover border border-slate-200 shrink-0" />
                                ) : (
                                  <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                                    <ImageOff className="w-4 h-4 text-slate-300" />
                                  </div>
                                )}
                                <p className="text-slate-600 truncate max-w-[220px]">{post.caption || '—'}</p>
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 bg-slate-100 rounded-full px-2 py-1">
                                {TEMPLATE_LABEL[bucket]}
                              </span>
                            </td>
                            <td className="px-3 py-2"><PaletteSwatch palette={post.creative_meta?.palette} /></td>
                            <td className="px-3 py-2 text-slate-500">{branchLabel(post.branch_slug)}</td>
                            <td className="px-3 py-2 text-right text-slate-700">
                              {post.insight ? (
                                <span className="inline-flex items-center gap-1"><Bookmark className="w-3 h-3 text-slate-300" />{fmtNumber(post.insight.saves)}</span>
                              ) : '—'}
                            </td>
                            <td className="px-3 py-2 text-right text-slate-700">
                              {post.insight ? (
                                <span className="inline-flex items-center gap-1"><Share2 className="w-3 h-3 text-slate-300" />{fmtNumber(post.insight.shares)}</span>
                              ) : '—'}
                            </td>
                            <td className="px-3 py-2 text-right text-slate-700">{post.insight ? fmtNumber(post.insight.impressions) : '—'}</td>
                            <td className="px-3 py-2 text-right text-slate-500 whitespace-nowrap">{fmtDate(post.published_at || post.scheduled_for)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* AI advisor */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-600" />
                <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight">Sage: What's Working?</h2>
              </div>
              <button
                type="button"
                onClick={handleAskAdvisor}
                disabled={aiLoading || measuredCount === 0}
                className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest transition disabled:opacity-40 shadow-sm"
              >
                {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Ask Sage
              </button>
            </div>

            {measuredCount === 0 ? (
              <p className="text-xs text-slate-400">Sage needs at least one post with synced engagement data before it can spot a pattern.</p>
            ) : aiError ? (
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-700">{aiError}</div>
            ) : aiResult ? (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{aiResult}</div>
            ) : (
              <p className="text-xs text-slate-400">
                Sage will only cite the numbers in the leaderboard above — including each post's original creative rationale from Card Studio — and will say "not enough data" rather than guess when a template hasn't run long enough.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default PostPerformance;
