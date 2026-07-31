import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles, Wand2, RefreshCw, Trash2, CheckCircle2, Loader2, Download,
  AlertTriangle, Info, CalendarClock, Image as ImageIcon, Send, BookOpen,
  History, X,
} from 'lucide-react';
import { ApiKeyConfig, BranchContext, BranchInfo } from '../types';
import { generateCardConcepts, type ScripturePolicy, CARD_BRIEF_PRESETS, CardConceptWithRef } from '../services/creativeDirectorService';
import { fetchPassage } from '../services/bibleService';
import { renderCardConcept, renderCardPreviewDataUrl } from '../utils/cardRenderer';
import { uploadPostImage, createScheduledPosts } from '../services/scheduledPostService';
import { supabase as hubClient } from '../lib/supabase';

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
  concept: CardConceptWithRef;
  caption: string;
  previewUrl: string | null;
  previewError: string | null;
  isRendering: boolean;
  isRegenerating: boolean;
  isApproving: boolean;
  status: 'reviewing' | 'approved';
  platform: Platform;
  scheduledFor: string; // ISO
  // Set only for verse concepts once their real text has been fetched —
  // shown as a small muted attribution line since BSB attribution is good
  // practice even though it isn't strictly required.
  passageTranslation?: string;
  passageLicense?: string;
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

const TEMPLATE_LABEL: Record<CardConceptWithRef['template'], string> = {
  verse: 'Verse',
  statement: 'Statement',
  grid: 'Grid',
};

const NO_BIBLE_SOURCE_MESSAGE = 'Scripture unavailable for this brand — verse cards need a connected Bible source.';

// ─── Draft persistence ──────────────────────────────────────────────
// A generated batch lives only in React state until it's approved or
// discarded, so navigating away (or a reload) used to lose it outright.
// We persist the working batch to localStorage, keyed by branch slug so
// switching brands never clobbers another brand's in-progress batch.
//
// Rendered preview data URLs are NOT persisted — they're large and cheap
// to re-render from the concept on restore. Approved-out or discarded
// cards are dropped from the persisted set as soon as they leave `cards`.
// ────────────────────────────────────────────────────────────────────
const DRAFT_STORAGE_KEY = 'trellis_card_studio_draft_v1';
const VALID_TEMPLATES = new Set(['verse', 'statement', 'grid']);
const VALID_PLATFORMS = new Set(['instagram', 'facebook']);

interface PersistedCardDraftItem {
  concept: CardConceptWithRef;
  caption: string;
  platform: Platform;
  scheduledFor: string;
  passageTranslation?: string;
  passageLicense?: string;
}

interface PersistedCardDraft {
  savedAt: string;
  items: PersistedCardDraftItem[];
}

type CardDraftStore = Record<string, PersistedCardDraft>;

// Restored data comes from a previous session (possibly an older app
// version) — never trust its shape blindly. Anything that doesn't look
// like a real draft item is dropped rather than crashing the page.
function isValidDraftItem(raw: unknown): raw is PersistedCardDraftItem {
  if (!raw || typeof raw !== 'object') return false;
  const item = raw as Record<string, unknown>;
  const concept = item.concept as Record<string, unknown> | undefined;
  if (!concept || typeof concept !== 'object') return false;
  if (typeof concept.id !== 'string' || !concept.id) return false;
  if (typeof concept.template !== 'string' || !VALID_TEMPLATES.has(concept.template)) return false;
  if (!concept.palette || typeof concept.palette !== 'object') return false;
  if (typeof concept.eyebrow !== 'string') return false;
  if (typeof concept.logoText !== 'string') return false;
  if (typeof concept.caption !== 'string') return false;
  if (typeof item.caption !== 'string') return false;
  if (typeof item.platform !== 'string' || !VALID_PLATFORMS.has(item.platform)) return false;
  if (typeof item.scheduledFor !== 'string' || Number.isNaN(new Date(item.scheduledFor).getTime())) return false;
  return true;
}

function loadDraftStore(): CardDraftStore {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as CardDraftStore;
  } catch {
    return {};
  }
}

function loadBranchDraft(branchSlug: string): PersistedCardDraft | null {
  try {
    const store = loadDraftStore();
    const entry = store[branchSlug];
    if (!entry || !Array.isArray(entry.items)) return null;
    const items = entry.items.filter(isValidDraftItem);
    if (items.length === 0) return null;
    const savedAt = typeof entry.savedAt === 'string' && !Number.isNaN(new Date(entry.savedAt).getTime())
      ? entry.savedAt
      : new Date().toISOString();
    return { savedAt, items };
  } catch {
    return null;
  }
}

// Only `reviewing` cards are worth persisting — an approved card is already
// safely in the scheduler queue, and a discarded one is meant to be gone.
function saveBranchDraft(branchSlug: string, cards: ConceptCardState[]): void {
  try {
    const items: PersistedCardDraftItem[] = cards
      .filter((c) => c.status === 'reviewing')
      .map((c) => ({
        concept: c.concept,
        caption: c.caption,
        platform: c.platform,
        scheduledFor: c.scheduledFor,
        passageTranslation: c.passageTranslation,
        passageLicense: c.passageLicense,
      }));

    const store = loadDraftStore();
    if (items.length === 0) {
      delete store[branchSlug];
    } else {
      store[branchSlug] = { savedAt: new Date().toISOString(), items };
    }
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Quota exceeded, storage disabled, whatever — the batch just won't
    // survive navigation this time. Not worth surfacing to the user.
  }
}

function clearBranchDraft(branchSlug: string): void {
  try {
    const store = loadDraftStore();
    delete store[branchSlug];
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(store));
  } catch {
    // ignore
  }
}

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
  const [scripturePolicy, setScripturePolicy] = useState<ScripturePolicy>('mix');
  // Null until resolved. A brand with no spoke connection has no Bible source,
  // so verse cards can't render and scripture must be forced off.
  const [hasBibleSource, setHasBibleSource] = useState<boolean | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [cards, setCards] = useState<ConceptCardState[]>([]);
  // Timestamp of the restored draft this batch came from, if any — drives
  // the "these are restored drafts, not fresh output" banner. Cleared on a
  // fresh Generate, a branch switch, or an explicit Clear.
  const [draftRestoredAt, setDraftRestoredAt] = useState<string | null>(null);

  const geminiKey = apiKeys?.gemini_api_key;

  // Spoke connection id per branch, resolved from the `branches` table and
  // cached for the session — a ref (not state) so async lookups always see
  // the latest value instead of a stale render's closure.
  const branchConnectionCache = useRef<Record<string, string | null>>({});

  const resolveSpokeConnectionId = async (branch: BranchInfo): Promise<string | null> => {
    if (branch.id in branchConnectionCache.current) return branchConnectionCache.current[branch.id];
    try {
      const { data, error } = await hubClient
        .from('branches')
        .select('spoke_connection_id')
        .eq('slug', branch.slug)
        .maybeSingle();
      const connectionId = !error && data?.spoke_connection_id ? String(data.spoke_connection_id) : null;
      branchConnectionCache.current[branch.id] = connectionId;
      return connectionId;
    } catch {
      branchConnectionCache.current[branch.id] = null;
      return null;
    }
  };

  // Resolve up front whether this brand has a Bible source, so the Scripture
  // control can disable itself before a batch is generated rather than after
  // three verse cards come back broken.
  useEffect(() => {
    let cancelled = false;
    if (!selectedBranch) { setHasBibleSource(null); return; }
    setHasBibleSource(null);
    resolveSpokeConnectionId(selectedBranch)
      .then((id) => { if (!cancelled) setHasBibleSource(!!id); })
      .catch(() => { if (!cancelled) setHasBibleSource(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranch?.id]);

  const renderPreviewFor = async (concept: CardConceptWithRef) => {
    try {
      const dataUrl = await renderCardPreviewDataUrl(concept);
      setCards((prev) => prev.map((c) => (c.concept.id === concept.id ? { ...c, previewUrl: dataUrl, isRendering: false, previewError: null } : c)));
    } catch (e) {
      setCards((prev) =>
        prev.map((c) => (c.concept.id === concept.id ? { ...c, isRendering: false, previewError: e instanceof Error ? e.message : 'Preview render failed.' } : c)))
      ;
    }
  };

  // On mount / branch switch: restore that brand's persisted batch, if any,
  // and re-render its previews (never persisted — cheap to redo, expensive
  // to store). No brand, or no valid draft, just means an empty gallery.
  useEffect(() => {
    if (!selectedBranch) {
      setCards([]);
      setDraftRestoredAt(null);
      return;
    }
    const draft = loadBranchDraft(selectedBranch.slug);
    if (!draft) {
      setCards([]);
      setDraftRestoredAt(null);
      return;
    }
    const restored: ConceptCardState[] = draft.items.map((item) => ({
      concept: item.concept,
      caption: item.caption,
      previewUrl: null,
      previewError: null,
      isRendering: true,
      isRegenerating: false,
      isApproving: false,
      status: 'reviewing',
      platform: item.platform,
      scheduledFor: item.scheduledFor,
      passageTranslation: item.passageTranslation,
      passageLicense: item.passageLicense,
    }));
    setCards(restored);
    setDraftRestoredAt(draft.savedAt);
    restored.forEach((c) => { renderPreviewFor(c.concept); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBranch?.id]);

  // Keep the persisted batch in sync with every edit (caption, platform,
  // schedule, approve, discard, regenerate). Skipped while no brand is
  // selected — there's nothing to key the entry by.
  useEffect(() => {
    if (!selectedBranch) return;
    saveBranchDraft(selectedBranch.slug, cards);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards]);

  const handleClearDraft = () => {
    if (selectedBranch) clearBranchDraft(selectedBranch.slug);
    setCards([]);
    setDraftRestoredAt(null);
    addToast('Cleared the draft batch.', 'success');
  };

  // Fetches the real BSB text for a `verse` concept before it's ever
  // rendered or shown to the reviewer. Statement/grid concepts pass through
  // untouched. Never fabricates or leaves placeholder scripture — any
  // failure (no spoke connection, RPC error, bad reference) is returned as
  // an `error` string so the caller can block that one card instead of
  // rendering it.
  const hydrateVerseConcept = async (
    concept: CardConceptWithRef,
    branch: BranchInfo,
  ): Promise<{ concept: CardConceptWithRef; translation?: string; license?: string; error?: string }> => {
    if (concept.template !== 'verse') return { concept };
    if (!concept.verse_ref) return { concept, error: 'This verse concept is missing a valid reference.' };

    const connectionId = await resolveSpokeConnectionId(branch);
    if (!connectionId) return { concept, error: NO_BIBLE_SOURCE_MESSAGE };

    try {
      const passage = await fetchPassage(connectionId, concept.verse_ref);
      return {
        concept: { ...concept, body: passage.text, reference: `${passage.reference} · ${passage.translation}` },
        translation: passage.translation,
        license: passage.license,
      };
    } catch (e) {
      return { concept, error: e instanceof Error ? e.message : 'Scripture lookup failed.' };
    }
  };

  // A preset tagged to another brand is just noise — show only this brand's
  // presets plus the brand-agnostic ones.
  const visiblePresets = useMemo(
    () => CARD_BRIEF_PRESETS.filter((p) => !p.branchSlug || p.branchSlug === selectedBranch?.slug),
    [selectedBranch?.slug],
  );

  const applyPreset = (preset: (typeof CARD_BRIEF_PRESETS)[number]) => {
    setBrief(preset.brief);
    setActivePreset(preset.label);
    if (preset.branchSlug) {
      const match = branchOptions.find((b) => b.slug === preset.branchSlug);
      if (match) setBranchId(match.id);
    }
  };

  // For a `verse` concept: fetch the real text first, then render — never
  // render (or let the reviewer approve) a verse card with missing or
  // placeholder scripture. Statement/grid concepts render immediately.
  const hydrateAndRenderFor = async (concept: CardConceptWithRef, branch: BranchInfo, cardId: string) => {
    const { concept: hydrated, translation, license, error } = await hydrateVerseConcept(concept, branch);
    if (error) {
      setCards((prev) => prev.map((c) => (c.concept.id === cardId ? { ...c, isRendering: false, previewError: error } : c)));
      return;
    }
    setCards((prev) =>
      prev.map((c) => (c.concept.id === cardId ? { ...c, concept: hydrated, passageTranslation: translation, passageLicense: license } : c)),
    );
    renderPreviewFor(hydrated);
  };

  const handleGenerate = async () => {
    if (!selectedBranch) { addToast('Choose a brand first.', 'error'); return; }
    if (!brief.trim()) { addToast('Write a brief first.', 'error'); return; }
    if (!geminiKey) { addToast('Gemini API key not configured. Set it in Settings.', 'error'); return; }

    setIsGenerating(true);
    setCards([]);
    setDraftRestoredAt(null);
    try {
      const concepts = await generateCardConcepts({
        apiKey: geminiKey,
        brandName: selectedBranch.name,
        brandContext: buildBrandContext(selectedBranch),
        brief,
        count,
        scripturePolicy: hasBibleSource === false ? 'avoid' : scripturePolicy,
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
      // (or, for a verse concept, a failed scripture fetch) shouldn't block
      // or hide the rest of the gallery.
      initialCards.forEach((card) => { hydrateAndRenderFor(card.concept, selectedBranch, card.concept.id); });
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
        scripturePolicy: hasBibleSource === false ? 'avoid' : scripturePolicy,
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
                passageTranslation: undefined,
                passageLicense: undefined,
              }
            : c
        )
      );
      // newConcept.id is now this card's key — hydrateAndRenderFor fetches
      // real scripture first for a `verse` concept, same as first generation.
      hydrateAndRenderFor(newConcept, selectedBranch, newConcept.id);
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
      const file = new File([blob], `card-${card.concept.id}.jpg`, { type: 'image/jpeg' });
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

  const handleDownload = async (concept: CardConceptWithRef) => {
    try {
      const blob = await renderCardConcept(concept);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${slugifyForFilename(concept.eyebrow || concept.logoText || concept.template)}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Download failed.', 'error');
    }
  };

  const reviewingCount = useMemo(() => cards.filter((c) => c.status === 'reviewing').length, [cards]);

  const draftRestoredLabel = useMemo(() => {
    if (!draftRestoredAt) return null;
    try {
      return new Date(draftRestoredAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    } catch { return null; }
  }, [draftRestoredAt]);

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

      {/* Restored draft banner */}
      {draftRestoredAt && cards.length > 0 && (
        <div className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 text-amber-700 min-w-0">
            <History className="w-4 h-4 shrink-0" />
            <p className="text-xs font-bold truncate">
              Restored draft{draftRestoredLabel ? ` from ${draftRestoredLabel}` : ''} — not freshly generated. Review before approving.
            </p>
          </div>
          <button
            type="button"
            onClick={handleClearDraft}
            className="shrink-0 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-amber-700 hover:text-amber-900 transition"
          >
            <X className="w-3.5 h-3.5" />
            Clear
          </button>
        </div>
      )}

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

          {/* Only brands with a connected Bible source can make verse cards, so
              for every other brand this control is noise — hide it entirely
              rather than showing a disabled dropdown. */}
          {hasBibleSource === true && (
            <div className="flex flex-col gap-1 lg:w-44">
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Scripture</span>
              <select
                value={scripturePolicy}
                onChange={(e) => setScripturePolicy(e.target.value as ScripturePolicy)}
                className="text-sm font-bold border border-slate-200 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              >
                <option value="mix">Mix — some with, some without</option>
                <option value="require">Every card</option>
                <option value="avoid">None</option>
              </select>
            </div>
          )}

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
          {visiblePresets.map((preset) => (
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

                  {card.concept.template === 'verse' && card.passageTranslation && (
                    <p className="flex items-center gap-1 text-[10px] text-slate-400">
                      <BookOpen className="w-3 h-3 shrink-0" />
                      {card.passageTranslation}
                      {card.passageLicense ? ` · ${card.passageLicense}` : ''}
                    </p>
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
                      disabled={!card.previewUrl}
                      className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-lg text-[11px] font-bold text-slate-600 hover:bg-slate-50 transition disabled:opacity-40"
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
