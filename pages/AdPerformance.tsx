import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  TrendingUp, TrendingDown, Upload, FileSpreadsheet, CheckCircle2, XCircle,
  AlertTriangle, Loader2, Sparkles, ImageOff, ArrowUpDown, RefreshCw, Info,
} from 'lucide-react';
import { ApiKeyConfig, BranchContext, MatchedAdRow, CreativeLeaderboardEntry } from '../types';
import {
  parseAdsManagerCsv, matchRowsToJobs, fetchCreativeJobsForMatching,
  importAdPerformance, fetchCreativeLeaderboard, MIN_IMPRESSIONS_FOR_SIGNIFICANCE,
} from '../services/adPerformanceService';
import { generateText } from '../services/aiService';

interface AdPerformanceProps {
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

// Guardrail carried into every AI call on this page — this repo has a hard
// no-fabrication rule for AI analysis of real business data (see Reports.tsx).
const NO_FABRICATION_RULE =
  'Base every recommendation strictly on the LEADERBOARD DATA provided. Never invent, estimate, simulate, or illustrate a metric. ' +
  'If a creative does not have enough impressions to judge (has_enough_data: false), say plainly that there is not enough data for it rather than guessing. ' +
  'Never present hypothetical or example figures as findings. Only cite numbers that actually appear in the data above.';

type SortKey = 'spend' | 'ctr' | 'cost_per_conversion';

const fmtMoney = (n: number): string => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtMoneyN = (n: number | null): string => (n === null ? '—' : fmtMoney(n));
const fmtNumber = (n: number): string => n.toLocaleString();
const fmtPct = (n: number | null): string => (n === null ? '—' : `${n.toFixed(2)}%`);
const fmtDate = (iso?: string | null): string => {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }
  catch { return iso; }
};

const entryKey = (e: CreativeLeaderboardEntry): string => e.creative_job_id || `unmatched:${e.ad_name}`;

const AdPerformance: React.FC<AdPerformanceProps> = ({ apiKeys, branchContext, addToast }) => {
  const activeKeys = apiKeys || DEFAULT_KEYS;

  // ── Import state ──
  const [csvText, setCsvText] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [matchedRows, setMatchedRows] = useState<MatchedAdRow[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Leaderboard state ──
  const [leaderboard, setLeaderboard] = useState<CreativeLeaderboardEntry[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);
  const [sortKey, setSortKey] = useState<SortKey>('spend');
  const [branchFilter, setBranchFilter] = useState<string>('all');

  // ── AI advisor state ──
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const loadLeaderboard = async () => {
    setLeaderboardLoading(true);
    try {
      const entries = await fetchCreativeLeaderboard();
      setLeaderboard(entries);
    } catch (e) {
      addToast?.(e instanceof Error ? e.message : 'Failed to load the creative leaderboard.', 'error');
    } finally {
      setLeaderboardLoading(false);
    }
  };

  useEffect(() => { loadLeaderboard(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const branchLabel = (slug: string | null): string => {
    if (!slug) return '—';
    return branchContext?.allBranches.find(b => b.slug === slug)?.name || slug;
  };

  // ── Import flow: paste/upload -> parse -> match -> preview -> confirm ──
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setCsvText(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = () => addToast?.('Could not read that file.', 'error');
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleParse = async () => {
    if (!csvText.trim()) {
      addToast?.('Paste your Ads Manager export or choose a CSV file first.', 'error');
      return;
    }
    setIsParsing(true);
    setMatchedRows([]);
    setParseErrors([]);
    try {
      const { rows, errors } = parseAdsManagerCsv(csvText);
      const jobs = await fetchCreativeJobsForMatching();
      const matched = matchRowsToJobs(rows, jobs);
      setMatchedRows(matched);
      setParseErrors(errors);
      if (matched.length === 0 && errors.length === 0) {
        addToast?.('No rows found in that file.', 'error');
      }
    } catch (e) {
      addToast?.(e instanceof Error ? e.message : 'Failed to parse the CSV.', 'error');
    } finally {
      setIsParsing(false);
    }
  };

  const handleImport = async () => {
    if (matchedRows.length === 0) return;
    setIsImporting(true);
    try {
      const { inserted, skipped } = await importAdPerformance(matchedRows);
      addToast?.(
        `Imported ${inserted} row${inserted === 1 ? '' : 's'}${skipped ? ` · ${skipped} duplicate${skipped === 1 ? '' : 's'} skipped` : ''}.`,
        'success',
      );
      setMatchedRows([]);
      setParseErrors([]);
      setCsvText('');
      setFileName(null);
      setAiResult(null);
      loadLeaderboard();
    } catch (e) {
      addToast?.(e instanceof Error ? e.message : 'Import failed.', 'error');
    } finally {
      setIsImporting(false);
    }
  };

  const matchedCount = matchedRows.filter(r => r.creative_job_id).length;
  const unmatchedCount = matchedRows.length - matchedCount;

  // ── Branch scoping ──
  // Creative is per-brand, so a cross-brand leaderboard compares ads that were
  // never competing. Filter before ranking, flagging winners, or advising.
  const branchOptions = useMemo(() => {
    const slugs: string[] = Array.from(
      new Set<string>(leaderboard.map(e => e.branch).filter((b): b is string => !!b)),
    );
    return slugs.sort((a, b) => branchLabel(a).localeCompare(branchLabel(b)));
  }, [leaderboard, branchContext]);

  const scopedLeaderboard = useMemo(
    () => (branchFilter === 'all' ? leaderboard : leaderboard.filter(e => e.branch === branchFilter)),
    [leaderboard, branchFilter],
  );

  // ── Leaderboard sorting + winner/loser flags ──
  const sortedLeaderboard = useMemo(() => {
    const copy = [...scopedLeaderboard];
    copy.sort((a, b) => {
      if (sortKey === 'spend') return b.spend - a.spend;
      if (sortKey === 'ctr') {
        if (a.ctr === null && b.ctr === null) return 0;
        if (a.ctr === null) return 1;
        if (b.ctr === null) return -1;
        return b.ctr - a.ctr;
      }
      // cost_per_conversion — lower is better, nulls sink to the bottom
      if (a.cost_per_conversion === null && b.cost_per_conversion === null) return 0;
      if (a.cost_per_conversion === null) return 1;
      if (b.cost_per_conversion === null) return -1;
      return a.cost_per_conversion - b.cost_per_conversion;
    });
    return copy;
  }, [scopedLeaderboard, sortKey]);

  const { bestKey, worstKey } = useMemo(() => {
    const qualifying = scopedLeaderboard.filter(e => e.has_enough_data && e.ctr !== null);
    if (qualifying.length < 2) return { bestKey: null as string | null, worstKey: null as string | null };
    let best = qualifying[0];
    let worst = qualifying[0];
    for (const e of qualifying) {
      if ((e.ctr as number) > (best.ctr as number)) best = e;
      if ((e.ctr as number) < (worst.ctr as number)) worst = e;
    }
    return { bestKey: entryKey(best), worstKey: entryKey(worst) };
  }, [scopedLeaderboard]);

  // ── AI advisor ──
  const buildAdvisorPrompt = (entries: CreativeLeaderboardEntry[]): string => {
    const summary = entries.map(e => ({
      ad_name: e.ad_name,
      branch: e.branch,
      format: e.format,
      headline_used: e.headline_used,
      generation_prompt: e.frame_prompt,
      impressions: e.impressions,
      reach: e.reach,
      clicks: e.clicks,
      spend: Number(e.spend.toFixed(2)),
      conversions: e.conversions,
      conversion_value: Number(e.conversion_value.toFixed(2)),
      ctr_pct: e.ctr === null ? null : Number(e.ctr.toFixed(2)),
      cpc: e.cpc === null ? null : Number(e.cpc.toFixed(2)),
      cpm: e.cpm === null ? null : Number(e.cpm.toFixed(2)),
      cost_per_conversion: e.cost_per_conversion === null ? null : Number(e.cost_per_conversion.toFixed(2)),
      roas: e.roas === null ? null : Number(e.roas.toFixed(2)),
      has_enough_data: e.has_enough_data,
    }));

    return `You are advising on manually-run Meta (Facebook/Instagram) ads for Sproutify Trellis. Below is the complete, factual performance leaderboard — one entry per creative, joined against the AI image-generation prompt and headline that produced each ad.

MINIMUM SIGNIFICANCE THRESHOLD: a creative needs at least ${MIN_IMPRESSIONS_FOR_SIGNIFICANCE} impressions before its CTR/CPC numbers are meaningful. Any entry with has_enough_data: false has too little data — say so plainly rather than judging it.

LEADERBOARD DATA:
${JSON.stringify(summary, null, 2)}

${NO_FABRICATION_RULE}

Write a concise brief with exactly three sections:
1. KILL — name specific creatives (by ad_name) to pause, citing the exact numbers that justify it.
2. SCALE — name specific creatives (by ad_name) to increase budget on, citing the exact numbers.
3. PATTERNS & NEXT ANGLES — what do the winning creatives have in common (subject matter, prompt style, headline angle, format)? Propose 2-3 specific next creative angles worth testing, grounded in what is already working.

If there isn't enough data yet to recommend killing or scaling anything, say so plainly instead of forcing a recommendation. Keep it under 350 words.`;
  };

  const handleAskAdvisor = async () => {
    if (scopedLeaderboard.length === 0) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const response = await generateText(activeKeys, {
        prompt: buildAdvisorPrompt(scopedLeaderboard),
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

  return (
    <div className="p-6 lg:p-10 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center shadow-lg">
            <TrendingUp className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Ad Performance</h1>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
              Import Ads Manager results · match to creative · let Sage tell you what to kill or scale
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={loadLeaderboard}
          disabled={leaderboardLoading}
          className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50 transition disabled:opacity-50"
        >
          {leaderboardLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          Refresh
        </button>
      </div>

      {/* Import panel */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Upload className="w-4 h-4 text-emerald-600" />
          <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight">Import Results CSV</h2>
        </div>
        <p className="text-xs text-slate-500">
          In Ads Manager: Ads tab → select your date range → Export → Export table data (.csv). Paste the file contents below, or choose the file directly.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3 items-start">
          <textarea
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
            placeholder="Paste the exported CSV contents here…"
            rows={6}
            className="w-full text-xs font-mono border border-slate-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 resize-y"
          />
          <div className="flex flex-col gap-2 lg:w-48">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-600 transition"
            >
              <FileSpreadsheet className="w-4 h-4" />
              Choose .csv
            </button>
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleFileChange} className="hidden" />
            {fileName && <p className="text-[10px] text-slate-400 truncate text-center">{fileName}</p>}
            <button
              type="button"
              onClick={handleParse}
              disabled={isParsing || !csvText.trim()}
              className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition disabled:opacity-40"
            >
              {isParsing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />}
              Parse
            </button>
          </div>
        </div>

        {/* Parse errors */}
        {parseErrors.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1 max-h-40 overflow-y-auto">
            <div className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span className="text-[10px] font-black uppercase tracking-widest">{parseErrors.length} parse note{parseErrors.length === 1 ? '' : 's'}</span>
            </div>
            {parseErrors.map((err, i) => (
              <p key={i} className="text-[11px] text-amber-800 pl-5">{err}</p>
            ))}
          </div>
        )}

        {/* Preview + confirm */}
        {matchedRows.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-widest">
                <span className="flex items-center gap-1 text-emerald-600">
                  <CheckCircle2 className="w-3.5 h-3.5" /> {matchedCount} matched to creative
                </span>
                <span className="flex items-center gap-1 text-slate-400">
                  <XCircle className="w-3.5 h-3.5" /> {unmatchedCount} unmatched
                </span>
              </div>
              <button
                type="button"
                onClick={handleImport}
                disabled={isImporting}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition disabled:opacity-40 shadow-sm"
              >
                {isImporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Confirm Import ({matchedRows.length})
              </button>
            </div>

            <div className="border border-slate-200 rounded-xl overflow-x-auto max-h-96">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 sticky top-0">
                  <tr className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    <th className="text-left px-3 py-2">Creative</th>
                    <th className="text-left px-3 py-2">Campaign / Ad Set</th>
                    <th className="text-left px-3 py-2">Dates</th>
                    <th className="text-right px-3 py-2">Impr.</th>
                    <th className="text-right px-3 py-2">Clicks</th>
                    <th className="text-right px-3 py-2">Spend</th>
                    <th className="text-right px-3 py-2">Conv.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {matchedRows.map((row) => (
                    <tr key={row.row_number} className="hover:bg-slate-50">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          {row.matched_image_url ? (
                            <img src={row.matched_image_url} alt="" className="w-8 h-8 rounded-lg object-cover border border-slate-200 shrink-0" />
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                              <ImageOff className="w-3.5 h-3.5 text-slate-300" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-bold text-slate-700 truncate max-w-[180px]">{row.ad_name || row.external_ad_id || 'Unnamed ad'}</p>
                            {row.creative_job_id ? (
                              <span className={`text-[9px] font-black uppercase tracking-widest ${row.match_confidence === 'exact' ? 'text-emerald-600' : 'text-amber-600'}`}>
                                {row.match_confidence === 'exact' ? 'Matched' : 'Matched (fuzzy)'}
                              </span>
                            ) : (
                              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Unmatched</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-slate-500">
                        <p className="truncate max-w-[160px]">{row.campaign_name || '—'}</p>
                        <p className="truncate max-w-[160px] text-slate-400">{row.adset_name || ''}</p>
                      </td>
                      <td className="px-3 py-2 text-slate-500 whitespace-nowrap">
                        {fmtDate(row.reporting_start)} – {fmtDate(row.reporting_end)}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-700">{row.impressions !== undefined ? fmtNumber(row.impressions) : '—'}</td>
                      <td className="px-3 py-2 text-right text-slate-700">{row.clicks !== undefined ? fmtNumber(row.clicks) : '—'}</td>
                      <td className="px-3 py-2 text-right text-slate-700">{row.spend !== undefined ? fmtMoney(row.spend) : '—'}</td>
                      <td className="px-3 py-2 text-right text-slate-700">{row.conversions !== undefined ? fmtNumber(row.conversions) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {matchedRows.length === 0 && parseErrors.length === 0 && (
          <div className="text-center py-6 text-xs text-slate-400">
            No file parsed yet. Paste or choose your Ads Manager export, then click Parse to preview the matches before importing.
          </div>
        )}
      </div>

      {/* Leaderboard */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-600" />
            <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight">Creative Leaderboard</h2>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {branchOptions.length > 1 && (
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
            )}
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
            {(['spend', 'ctr', 'cost_per_conversion'] as SortKey[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setSortKey(key)}
                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition ${
                  sortKey === key ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {key === 'spend' ? 'Spend' : key === 'ctr' ? 'CTR' : 'Cost / Conv.'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
          <Info className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
          <p className="text-[11px] text-slate-500">
            Best/worst CTR badges only apply to creatives with at least <strong>{MIN_IMPRESSIONS_FOR_SIGNIFICANCE.toLocaleString()} impressions</strong> —
            below that, CTR swings are mostly noise and the creative is marked "not enough data" instead.
          </p>
        </div>

        {leaderboardLoading ? (
          <div className="flex items-center justify-center py-12 text-slate-400 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" /> Loading leaderboard…
          </div>
        ) : sortedLeaderboard.length === 0 ? (
          <div className="text-center py-10 space-y-2">
            <TrendingUp className="w-8 h-8 text-slate-200 mx-auto" />
            <p className="text-sm font-bold text-slate-500">No ad performance imported yet.</p>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Once you import a results CSV above, every creative you've run in Ads Manager will show up here ranked by spend, CTR, and cost per conversion.
            </p>
          </div>
        ) : (
          <div className="border border-slate-200 rounded-xl overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50">
                <tr className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  <th className="text-left px-3 py-2">Creative</th>
                  <th className="text-left px-3 py-2">Branch</th>
                  <th className="text-right px-3 py-2">Spend</th>
                  <th className="text-right px-3 py-2">Impressions</th>
                  <th className="text-right px-3 py-2">CTR</th>
                  <th className="text-right px-3 py-2">CPC</th>
                  <th className="text-right px-3 py-2">Conv.</th>
                  <th className="text-right px-3 py-2">Cost / Conv.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedLeaderboard.map((entry) => {
                  const key = entryKey(entry);
                  const isBest = key === bestKey;
                  const isWorst = key === worstKey;
                  return (
                    <tr key={key} className={`hover:bg-slate-50 ${isBest ? 'bg-emerald-50/50' : isWorst ? 'bg-rose-50/50' : ''}`}>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          {entry.image_url ? (
                            <img src={entry.image_url} alt="" className="w-9 h-9 rounded-lg object-cover border border-slate-200 shrink-0" />
                          ) : (
                            <div className="w-9 h-9 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                              <ImageOff className="w-4 h-4 text-slate-300" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="font-bold text-slate-700 truncate max-w-[200px]">{entry.ad_name}</p>
                            <div className="flex items-center gap-1.5">
                              {!entry.creative_job_id && (
                                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Unlinked</span>
                              )}
                              {isBest && (
                                <span className="flex items-center gap-0.5 text-[9px] font-black uppercase tracking-widest text-emerald-600">
                                  <TrendingUp className="w-2.5 h-2.5" /> Best CTR
                                </span>
                              )}
                              {isWorst && (
                                <span className="flex items-center gap-0.5 text-[9px] font-black uppercase tracking-widest text-rose-600">
                                  <TrendingDown className="w-2.5 h-2.5" /> Lowest CTR
                                </span>
                              )}
                              {!entry.has_enough_data && (
                                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Not enough data</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-slate-500">{branchLabel(entry.branch)}</td>
                      <td className="px-3 py-2 text-right font-bold text-slate-700">{fmtMoney(entry.spend)}</td>
                      <td className="px-3 py-2 text-right text-slate-700">{fmtNumber(entry.impressions)}</td>
                      <td className="px-3 py-2 text-right text-slate-700">{fmtPct(entry.ctr)}</td>
                      <td className="px-3 py-2 text-right text-slate-700">{fmtMoneyN(entry.cpc)}</td>
                      <td className="px-3 py-2 text-right text-slate-700">{fmtNumber(entry.conversions)}</td>
                      <td className="px-3 py-2 text-right text-slate-700">{fmtMoneyN(entry.cost_per_conversion)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* AI advisor */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-emerald-600" />
            <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight">Sage: What Should I Kill Or Scale?</h2>
          </div>
          <button
            type="button"
            onClick={handleAskAdvisor}
            disabled={aiLoading || scopedLeaderboard.length === 0}
            className="flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-black uppercase tracking-widest transition disabled:opacity-40 shadow-sm"
          >
            {aiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Ask Sage
          </button>
        </div>

        {scopedLeaderboard.length === 0 ? (
          <p className="text-xs text-slate-400">Import at least one results CSV above before asking for recommendations.</p>
        ) : aiError ? (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-xs text-rose-700">
            {aiError}
          </div>
        ) : aiResult ? (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">
            {aiResult}
          </div>
        ) : (
          <p className="text-xs text-slate-400">
            Sage will only cite the numbers in the leaderboard above — including each creative's original generation prompt and headline — and will say "not enough data" rather than guess when a creative hasn't run long enough.
          </p>
        )}
      </div>
    </div>
  );
};

export default AdPerformance;
