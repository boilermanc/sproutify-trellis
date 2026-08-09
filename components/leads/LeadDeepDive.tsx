import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Download, ExternalLink, Loader2, RefreshCw, Telescope } from 'lucide-react';
import { Lead } from '../../types';
import { LeadResearch, fetchLeadResearch, startDeepDive } from '../../services/manusService';
import { renderMarkdown } from '../../utils/miniMarkdown';

interface LeadDeepDiveProps {
  lead: Lead;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const leadDisplayName = (lead: Lead): string => {
  const name = [lead.profile?.first_name, lead.profile?.last_name].filter(Boolean).join(' ').trim();
  return name || lead.profile?.email || 'lead';
};

const formatWhen = (value?: string | null): string => {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const LeadDeepDive: React.FC<LeadDeepDiveProps> = ({ lead, addToast }) => {
  const [items, setItems] = useState<LeadResearch[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const rows = await fetchLeadResearch(lead.id);
    setItems(rows);
    return rows;
  }, [lead.id]);

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load().finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [load]);

  // Poll while the latest run is in flight, then stop.
  const latest = items[0];
  const isRunning = latest?.status === 'running' || latest?.status === 'queued';
  useEffect(() => {
    if (isRunning && !pollRef.current) {
      pollRef.current = setInterval(() => { void load(); }, 15000);
    }
    if (!isRunning && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    };
  }, [isRunning, load]);

  const handleStart = async () => {
    setStarting(true);
    const result = await startDeepDive(lead.id);
    if (result.ok) {
      addToast('Deep dive started — this can take a few minutes.', 'success');
      await load();
    } else {
      addToast(result.error || 'Could not start the deep dive.', 'error');
    }
    setStarting(false);
  };

  const handleDownload = (research: LeadResearch) => {
    if (!research.result_md) return;
    const blob = new Blob([research.result_md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const slug = leadDisplayName(lead).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    link.download = `deep-dive-${slug || 'lead'}-${(research.completed_at || research.created_at).slice(0, 10)}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
          <Telescope size={13} /> Deep Dive
        </span>
        <button
          type="button"
          onClick={handleStart}
          disabled={starting || isRunning}
          className="flex items-center gap-1.5 rounded-xl bg-[#00D9FF] px-3 py-2 text-[10px] font-black uppercase tracking-wider text-[#07101D] transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {starting ? <Loader2 size={13} className="animate-spin" /> : <Telescope size={13} />}
          {items.length > 0 ? 'Run again' : 'Run deep dive'}
        </button>
      </div>

      <div className="mt-3">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-slate-400"><Loader2 size={14} className="animate-spin text-cyan-300" /> Loading…</div>
        ) : !latest ? (
          <p className="text-xs leading-5 text-slate-400">No deep dive yet. Run one to generate an AI research brief on this lead — their operation, market, online presence, fit, and talking points. It runs in the background and takes a few minutes.</p>
        ) : isRunning ? (
          <div className="flex items-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-400/[0.06] p-3 text-xs font-bold text-cyan-300">
            <Loader2 size={14} className="animate-spin" /> Researching this lead… this can take a few minutes. You can leave this page — it keeps running.
          </div>
        ) : latest.status === 'failed' ? (
          <div className="flex items-start gap-2 rounded-xl border border-rose-400/25 bg-rose-400/[0.06] p-3 text-xs leading-5 text-rose-200">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <span><strong className="block text-rose-100">Deep dive failed</strong>{latest.error || 'Manus did not return a result.'} Try running it again.</span>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-emerald-400/25 bg-emerald-400/[0.08] px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-300">Complete</span>
              <span className="text-[10px] text-slate-500">{formatWhen(latest.completed_at || latest.created_at)}{latest.model ? ` · ${latest.model}` : ''}</span>
              <div className="ml-auto flex items-center gap-2">
                <button type="button" onClick={() => handleDownload(latest)} className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-300 hover:bg-white/[0.08]"><Download size={12} /> .md</button>
                {latest.manus_task_url && <a href={latest.manus_task_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-300 hover:bg-white/[0.08]"><ExternalLink size={12} /> Source</a>}
              </div>
            </div>

            <div
              className="max-h-[28rem] overflow-y-auto rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-700"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(latest.result_md || '') }}
            />

            {latest.attachments?.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {latest.attachments.map((a, i) => (
                  <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[10px] font-bold text-cyan-300 hover:bg-white/[0.08]">
                    <Download size={12} /> {a.name}
                  </a>
                ))}
              </div>
            )}

            {items.length > 1 && (
              <p className="text-[10px] text-slate-500">{items.length} deep dives run for this lead. Showing the latest.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default LeadDeepDive;
