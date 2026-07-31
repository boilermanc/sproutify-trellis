import React, { useEffect, useMemo, useState } from 'react';
import {
  Sparkles, Wand2, RefreshCw, Trash2, CheckCircle2, Loader2, Download,
  AlertTriangle, Info, CalendarClock, Image as ImageIcon, Send,
} from 'lucide-react';
import { ApiKeyConfig, BranchContext, BranchInfo, CardConcept } from '../types';
import { generateCardConcepts, CARD_BRIEF_PRESETS } from '../services/creativeDirectorService';
import { renderCardConcept, renderCardPreviewDataUrl } from '../utils/cardRenderer';
import { uploadPostImage, createScheduledPosts } from '../services/scheduledPostService';

// ─── Card Studio ────────────────────────────────────────────────────
// The review half of the designed-post-card pipeline: brief -> concepts ->
// review -> render -> send to scheduler. `services/creativeDirectorService`
// is the "brief in, concepts out" AI half; `utils/cardRenderer` (owned by a
// different pass) turns an approved CardConcept into the actual PNG that
// ships. This page is the human-in-the-loop gallery between the two.
// ────────────────────────────────────────────────────────────────────

interface CardStudioProps {
  apiKeys: ApiKeyConfig;
  branchContext?: BranchContext;
  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

type Platform = 'instagram' | 'facebook';

interface ConceptCardState {
  concept: CardConcept;
  caption: string;
  previewUrl: string | null;
  previewError: string | null;
  isRendering: boolean;
  isRegenerating: boolean;
  isApproving: boolean;
  status: 'reviewing' | 'approved';
  platform: Platform;
  scheduledFor: string; // ISO
}

const COUNT_OPTIONS = [2, 3, 4, 5, 6];

function tomorrowMorningIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}

// datetime-local inputs work in local time strings with no timezone —
// convert to/from ISO explicitly so times don't silently drift to UTC.
function isoToLocalInputValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localInputValueToIso(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

function buildBrandContext(branch: BranchInfo | null): string {
  if (!branch) return 'n/a';
  return `Brand: ${branch.name}. Site: ${branch.slug}.`;
}

function slugifyForFilename(text: string): string {
  const slug = (text || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return slug || 'card';
}

const TEMPLATE_LABEL: Record<CardConcept['template'], string> = {
  verse: 'Verse',
  statement: 'Statement',
  grid: 'Grid',
};

const CardStudio: React.FC<CardStudioProps> = ({ apiKeys, branchContext, addToast }) => {
  const branchOptions = branchContext?.allBranches ?? [];
  const [branchId, setBranchId] = useState('');
  useEffect(() => {
    if (!branchId && branchOptions.length > 0) setBranchId(branchOptions[0].id);
  }, [branchOptions, branchId]);
  const selectedBranch = branchOptions.find((b) => b.id === branchId) || null;

  const [brief, setBrief] = useState(CARD_BRIEF_PRESETS[0]?.brief || '');
  const [activePreset, setActivePreset] = useState<string | null>(CARD_BRIEF_PRESETS[0]?.label ?? null);
  const [count, setCount] = useState(3);
  const [isGenerating, setIsGenerating] = useState(false);
  const [cards, setCards] = useState<ConceptCardState[]>([]);

  const geminiKey = apiKeys?.gemini_api_key;

  const applyPreset = (preset: (typeof CARD_BRIEF_PRESETS)[number]) => {
    setBrief(preset.brief);
    setActivePreset(preset.label);
    if (preset.branchSlug) {
      const match = branchOptions.find((b) => b.slug === preset.branchSlug);
      if (match) setBranchId(match.id);
    }
  };

  const renderPreviewFor = async (concept: CardConcept) => {
    try {
      const dataUrl = await renderCardPreviewDataUrl(concept);
      setCards((prev) => prev.map((c) => (c.concept.id === concept.id ? { ...c, previewUrl: dataUrl, isRendering: false, previewError: null } : c)));
    } catch (e) {
      setCards((prev) =>
        prev.map((c) => (c.concept.id === concept.id ? { ...c, isRendering: false, previewError: e instanceof Error ? e.message : 'Preview render failed.' } : c)))
      ;
    }
  };

  const handleGenerate = async () => {
    if (!selectedBranch) { addToast('Choose a brand first.', 'error'); return; }
    if (!brief.trim()) { addToast('Write a brief first.', 'error'); return; }
    if (!geminiKey) { addToast('Gemini API key not configured. Set it in Settings.', 'error'); return; }

    setIsGenerating(true);
    setCards([]);
    try {
      const concepts = await generateCardConcepts({
        apiKey: geminiKey,
        brandName: selectedBranch.name,
        brandContext: buildBrandContext(selectedBranch),
        brief,
        count,
        palette: {
          primary: selectedBranch.primary_color,
          secondary: selectedBranch.secondary_color,
          accent: selectedBranch.accent_color,
        },
      });

      if (concepts.length === 0) {
        addToast('The director came back empty-handed — try a different brief.', 'error');
        return;
      }

      const initialCards: ConceptCardState[] = concepts.map((concept) => ({
        concept,
        caption: concept.caption,
        previewUrl: null,
        previewError: null,
        isRendering: true,
        isRegenerating: false,
        isApproving: false,
        status: 'reviewing',
        platform: 'instagram',
        scheduledFor: tomorrowMorningIso(),
      }));
      setCards(initialCards);
      addToast(`${concepts.length} concept${concepts.length === 1 ? '' : 's'} ready for review.`, 'success');

      // Render previews as they arrive, independently — one failing render
      // shouldn't block or hide the rest of the gallery.
      initialCards.forEach((card) => { renderPreviewFor(card.concept); });
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Card generation failed.', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRegenerate = async (id: string) => {
    if (!selectedBranch) return;
    if (!geminiKey) { addToast('Gemini API key not configured. Set it in Settings.', 'error'); return; }

    setCards((prev) => prev.map((c) => (c.concept.id === id ? { ...c, isRegenerating: true } : c)));

    try {
      const others = cards.filter((c) => c.concept.id !== id);
      const othersSummary = others
        .map((c) => `- ${TEMPLATE_LABEL[c.concept.template]}: "${(c.concept.eyebrow || c.concept.caption).slice(0, 70)}"`)
        .join('\n');
      const augmentedBrief = `${brief}\n\nAdditional instruction: generate ONE replacement concept only. It is replacing a discarded option alongside concepts that are being KEPT — make this new one visually and thematically DIFFERENT from all of them (different template where reasonable, different palette, different angle):\n${othersSummary || '(none — this will be the only concept)'}`;

      const replacement = await generateCardConcepts({
        apiKey: geminiKey,
        brandName: selectedBranch.name,
        brandContext: buildBrandContext(selectedBranch),
        brief: augmentedBrief,
        count: 1,
        palette: {
          primary: selectedBranch.primary_color,
          secondary: selectedBranch.secondary_color,
          accent: selectedBranch.accent_color,
        },
      });

      if (replacement.length === 0) {
        addToast('Regeneration came back empty — try again.', 'error');
        setCards((prev) => prev.map((c) => (c.concept.id === id ? { ...c, isRegenerating: false } : c)));
        return;
      }

      const newConcept = replacement[0];
      setCards((prev) =>
        prev.map((c) =>
          c.concept.id === id
            ? {
                ...c,
                concept: newConcept,
                caption: newConcept.caption,
                previewUrl: null,
                previewError: null,
                isRendering: true,
                isRegenerating: false,
              }
            : c
        )
      );
      renderPreviewFor(newConcept);
      addToast('Regenerated that concept.', 'success');
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Regeneration failed.', 'error');
      setCards((prev) => prev.map((c) => (c.concept.id === id ? { ...c, isRegenerating: false } : c)));
    }
  };

  const handleDiscard = (id: string) => {
    setCards((prev) => prev.filter((c) => c.concept.id !== id));
  };

  const updateCard = (id: string, patch: Partial<ConceptCardState>) => {
    setCards((prev) => prev.map((c) => (c.concept.id === id ? { ...c, ...patch } : c)));
  };

  const handleApprove = async (id: string) => {
    const card = cards.find((c) => c.concept.id === id);
    if (!card || !selectedBranch) return;
    if (!card.caption.trim()) { addToast('Add a caption before approving.', 'error'); return; }

    updateCard(id, { isApproving: true });
    try {
      const blob = await renderCardConcept(card.concept);
      const file = new File([blob], `card-${card.concept.id}.png`, { type: 'image/png' });
      const url = await uploadPostImage(selectedBranch.slug, file);

      await createScheduledPosts([
        {
          branch_id: selectedBranch.id,
          branch_slug: selectedBranch.slug,
          platform: card.platform,
          caption: card.caption.trim(),
          media_type: 'image',
          media_urls: [url],
          scheduled_for: card.scheduledFor,
          source: 'card_studio',
        },
      ]);

      updateCard(id, { isApproving: false, status: 'approved' });
      const when = new Date(card.scheduledFor).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
      addToast(`Sent to the scheduler for ${when}.`, 'success');
    } catch (e) {
      updateCard(id, { isApproving: false });
      addToast(e instanceof Error ? e.message : 'Failed to send that card to the scheduler.', 'error');
    }
  };

  const handleDownload = async (concept: CardConcept) => {
    try {
      const blob = await renderCardConcept(concept);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slugifyForFilename(concept.eyebrow || concept.logoText || concept.template)}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Download failed.', 'error');
    }
  };

  const reviewingCount = useMemo(() => cards.filter((c) => c.status === 'reviewing').length, [cards]);

  return (
    <div className="p-6 lg:p-10 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center shadow-lg">
          <Sparkles className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Card Studio</h1>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
            Loose brief in, finished designed-post concepts out — reviewed by you, rendered, and queued
          </p>
        </div>
      </div>

      {/* Explainer */}
      <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
        <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-500">
          These are drawn layouts, not photographs — a verse on a gradient, a bold statement, a grid. Image models can't render text or lay out a
          grid reliably, so an AI creative director writes the concept and a renderer draws it. Nothing gets queued until you approve it.
        </p>
      </div>

      {/* Brief form */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex flex-col gap-1 lg:w-64">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Brand</span>
            {branchOptions.length === 0 ? (
              <p className="text-sm text-slate-400 py-2">No brands available yet.</p>
            ) : (
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="text-sm font-bold border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              >
                {branchOptions.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            )}
          </div>

          <div className="flex flex-col gap-1 lg:w-40">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">How many concepts</span>
            <select
              value={count}
              onChange={(e) => setCount(parseInt(e.target.value, 10) || 3)}
              className="text-sm font-bold border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            >
              {COUNT_OPTIONS.map((n) => (
                <option key={n} value={n}>{n} concepts</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Brief</span>
          <textarea
            value={brief}
            onChange={(e) => { setBrief(e.target.value); setActivePreset(null); }}
            rows={4}
            placeholder="e.g. Create some Instagram ads, motivational ideas we'd post daily that tie into Rejoice..."
            className="w-full text-sm border border-slate-200 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 resize-y"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {CARD_BRIEF_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => applyPreset(preset)}
              className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition ${
                activePreset === preset.label
                  ? 'bg-emerald-600 border-emerald-600 text-white'
                  : 'bg-white border-slate-200 text-slate-500 hover:border-emerald-400 hover:text-emerald-600'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-end pt-2">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || !selectedBranch || !brief.trim()}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition disabled:opacity-40 shadow-sm"
          >
            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            {isGenerating ? 'Directing…' : `Generate ${count} Concepts`}
          </button>
        </div>
      </div>

      {/* Gallery */}
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <ImageIcon className="w-4 h-4 text-emerald-600" />
          <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight">
            Concepts {cards.length > 0 ? `· ${reviewingCount} in review` : ''}
          </h2>
        </div>

        {isGenerating && cards.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 bg-white rounded-2xl border border-slate-200 shadow-sm py-16 text-slate-300">
            <Loader2 className="w-6 h-6 animate-spin" />
            <p className="text-xs font-bold uppercase tracking-widest">Consulting the creative director…</p>
          </div>
        )}

        {!isGenerating && cards.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 bg-white rounded-2xl border border-slate-200 shadow-sm py-16 text-slate-300">
            <Sparkles className="w-6 h-6" />
            <p className="text-xs font-bold uppercase tracking-widest">No concepts yet — write a brief and generate</p>
          </div>
        )}

        {cards.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {cards.map((card) => (
              <div key={card.concept.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                {/* Preview */}
                <div className="relative w-full aspect-[4/5] bg-slate-100 flex items-center justify-center">
                  {card.previewUrl ? (
                    <img src={card.previewUrl} alt={card.concept.eyebrow || card.concept.template} className="w-full h-full object-cover" />
                  ) : card.previewError ? (
                    <div className="flex flex-col items-center gap-2 text-rose-500 px-4 text-center">
                      <AlertTriangle className="w-6 h-6" />
                      <p className="text-[11px] font-bold">{card.previewError}</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-slate-300 animate-pulse">
                      <Loader2 className="w-6 h-6 animate-spin" />
                      <p className="text-[10px] font-bold uppercase tracking-widest">Rendering preview…</p>
                    </div>
                  )}
                  <span className="absolute top-2 left-2 px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-slate-900/70 text-white">
                    {TEMPLATE_LABEL[card.concept.template]}
                  </span>
                  {card.status === 'approved' && (
                    <span className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-600 text-white">
                      <CheckCircle2 className="w-3 h-3" />
                      Queued
                    </span>
                  )}
                </div>

                {/* Body */}
                <div className="p-4 space-y-3 flex-1 flex flex-col">
                  {card.concept.rationale && (
                    <p className="text-[11px] text-slate-400 italic">"{card.concept.rationale}"</p>
                  )}

                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Caption</span>
                    <textarea
                      value={card.caption}
                      onChange={(e) => updateCard(card.concept.id, { caption: e.target.value })}
                      rows={3}
                      disabled={card.status === 'approved'}
                      className="w-full text-xs border border-slate-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 resize-y disabled:opacity-50"
                    />
                  </div>

                  {card.status === 'reviewing' && (
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={card.platform}
                        onChange={(e) => updateCard(card.concept.id, { platform: e.target.value as Platform })}
                        className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                      >
                        <option value="instagram">Instagram</option>
                        <option value="facebook">Facebook</option>
                      </select>
                      <div className="flex items-center gap-1">
                        <CalendarClock className="w-3.5 h-3.5 text-slate-400" />
                        <input
                          type="datetime-local"
                          value={isoToLocalInputValue(card.scheduledFor)}
                          onChange={(e) => updateCard(card.concept.id, { scheduledFor: localInputValueToIso(e.target.value) })}
                          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                        />
                      </div>
                    </div>
                  )}

                  <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => handleDownload(card.concept)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-lg text-[11px] font-bold text-slate-600 hover:bg-slate-50 transition"
                    >
                      <Download className="w-3.5 h-3.5" />
                      PNG
                    </button>

                    {card.status === 'reviewing' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleRegenerate(card.concept.id)}
                          disabled={card.isRegenerating || card.isApproving}
                          className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-lg text-[11px] font-bold text-slate-600 hover:bg-slate-50 transition disabled:opacity-40"
                        >
                          {card.isRegenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                          Regenerate
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDiscard(card.concept.id)}
                          disabled={card.isRegenerating || card.isApproving}
                          className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-lg text-[11px] font-bold text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition disabled:opacity-40"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Discard
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApprove(card.concept.id)}
                          disabled={card.isApproving || card.isRegenerating || !card.previewUrl}
                          className="ml-auto flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-black uppercase tracking-widest transition disabled:opacity-40"
                        >
                          {card.isApproving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                          Approve
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CardStudio;
