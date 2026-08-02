import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles, Wand2, RefreshCw, Trash2, CheckCircle2, Loader2, Download,
  AlertTriangle, Info, CalendarClock, Image as ImageIcon, Send, BookOpen,
  History, X, ImagePlus, Images,
} from 'lucide-react';
import { ApiKeyConfig, BranchContext, BranchInfo } from '../types';
import { generateCardConcepts, type ScripturePolicy, CARD_BRIEF_PRESETS, CardConceptWithRef } from '../services/creativeDirectorService';
import { getBrandCardStyle } from '../services/brandCardStyles';
import { fetchPassage } from '../services/bibleService';
import { renderCardConcept, renderCardPreviewDataUrl } from '../utils/cardRenderer';
import { uploadPostImage, createScheduledPosts } from '../services/scheduledPostService';
import { submitStaticAdJob, pollVideoAdJob } from '../services/videoAdService';
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

type Platform = 'instagram' | 'facebook' | 'tiktok';

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
  // Set only while an "editorial" card's background photo upload is in
  // flight — the "use existing" pick is synchronous-feeling enough not to
  // need its own flag (the modal itself shows the loading state).
  isUploadingBackground?: boolean;
  // How `concept.backgroundUrl` was set — captured alongside it so the
  // approve step can record creative provenance (see handleApprove) for
  // the Post Performance leaderboard. Absent whenever backgroundUrl is
  // absent, i.e. the card is falling back to its gradient/flat fill.
  backgroundSource?: 'upload' | 'library' | 'generated';
  // Set while "Generate photo" is running its ~60-90s Creative Studio job.
  isGeneratingBackground?: boolean;
  // User-editable scene description for "Generate photo" — seeded from the
  // director's photo_brief but fully overridable ("flowers and a coffee cup
  // at a kitchen table"). undefined = not touched, fall back to the brief.
  photoBriefDraft?: string;
}

const COUNT_OPTIONS = [1, 2, 3, 4, 5, 6];

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
  // Give the model the REAL website or none at all. This used to send
  // "Site: rejoice" (the slug) — a half-domain the model happily completed
  // into an invented "REJOICE.SITE" on a rendered card's footer.
  const site = branch.website_url ? ` Website: ${branch.website_url}.` : '';
  return `Brand: ${branch.name}.${site}`;
}

function slugifyForFilename(text: string): string {
  const slug = (text || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return slug || 'card';
}

const TEMPLATE_LABEL: Record<CardConceptWithRef['template'], string> = {
  verse: 'Verse',
  statement: 'Statement',
  grid: 'Grid',
  editorial: 'Editorial',
  list: 'List',
  conversation: 'Conversation',
  stat: 'Stat',
  quote: 'Quote',
};

const NO_BIBLE_SOURCE_MESSAGE = 'Scripture unavailable for this brand — verse cards need a connected Bible source.';

// A recent piece of completed/awaiting-approval Creative Studio output,
// offered as a ready-made background photo for an "editorial" card — that
// pipeline already produces clean, text-free, negative-space-aware images,
// which is exactly what a layout drawn over a photo needs.
interface LibraryImage {
  id: string;
  url: string;
  format: string;
}

// ─── Draft persistence ──────────────────────────────────────────────
// A generated batch lives only in React state until it's approved or
// discarded, so navigating away (or a reload) used to lose it outright.
// We persist the working batch to localStorage, keyed by branch slug so
// switching brands never clobbers another brand's in-progress batch.
//
// Rendered preview data URLs are NOT persisted — they're large and cheap
// to re-render from the concept on restore. Approved-out or discarded
// cards are dropped from the persisted set as soon as they leave `cards`.
// An "editorial" concept's `backgroundUrl` IS persisted, because it's just
// part of `concept` — no special-casing needed here.
// ────────────────────────────────────────────────────────────────────
const DRAFT_STORAGE_KEY = 'trellis_card_studio_draft_v1';
const VALID_TEMPLATES = new Set(['verse', 'statement', 'grid', 'editorial']);
const VALID_PLATFORMS = new Set(['instagram', 'facebook', 'tiktok']);

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

  // (The Generate button's blockers are now surfaced in the UI next to the
  // button itself, so no console diagnostic is needed for them.)

  // ── Editorial background photo: upload ──────────────────────────
  // One shared hidden file input, retargeted per click via `uploadTargetId`
  // rather than mounting a dozen file inputs (one per card).
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadTargetId, setUploadTargetId] = useState<string | null>(null);

  // ── Editorial background photo: pick from recent Creative Studio output ──
  const [libraryModalForId, setLibraryModalForId] = useState<string | null>(null);
  const [libraryItems, setLibraryItems] = useState<LibraryImage[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);

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

  // Whether a brand actually has BSB installed in its spoke — cached per
  // branch, since it takes a real probe query to know (see below).
  const bibleSourceCache = useRef<Record<string, boolean>>({});

  // Resolve up front whether this brand has a Bible source, so the Scripture
  // control can disable itself before a batch is generated rather than after
  // three verse cards come back broken.
  //
  // Having a spoke connection is NOT the same as having scripture: ATL and
  // Rekkrd both have their own spoke databases (for customer data) with no
  // bible_verses table, so checking "does a connection exist" showed the
  // Scripture control on every brand. The only way to know for certain is to
  // actually ask for a verse — Genesis 1:1 is the cheapest possible probe,
  // and its success/failure IS the real answer.
  useEffect(() => {
    let cancelled = false;
    if (!selectedBranch) { setHasBibleSource(null); return; }
    if (selectedBranch.id in bibleSourceCache.current) {
      setHasBibleSource(bibleSourceCache.current[selectedBranch.id]);
      return;
    }
    setHasBibleSource(null);
    (async () => {
      try {
        const connectionId = await resolveSpokeConnectionId(selectedBranch);
        if (!connectionId) throw new Error('no connection');
        await fetchPassage(connectionId, { book_id: 'GEN', chapter: 1, verse_start: 1, verse_end: 1 });
        if (!cancelled) {
          bibleSourceCache.current[selectedBranch.id] = true;
          setHasBibleSource(true);
        }
      } catch {
        if (!cancelled) {
          bibleSourceCache.current[selectedBranch.id] = false;
          setHasBibleSource(false);
        }
      }
    })();
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
  // schedule, approve, discard, regenerate, background photo). Skipped
  // while no brand is selected — there's nothing to key the entry by.
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
  // rendered or shown to the reviewer. Statement/grid/editorial concepts
  // pass through untouched. Never fabricates or leaves placeholder
  // scripture — any failure (no spoke connection, RPC error, bad reference)
  // is returned as an `error` string so the caller can block that one card
  // instead of rendering it.
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
  // placeholder scripture. Statement/grid/editorial concepts render
  // immediately (an editorial concept with no backgroundUrl yet still
  // renders fine — the renderer falls back to a palette gradient).
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
    console.log('[CardStudio] Generate clicked', {
      brand: selectedBranch?.name ?? null,
      briefLength: brief.trim().length,
      count,
      scripturePolicy,
      hasBibleSource,
      hasGeminiKey: !!geminiKey,
    });
    if (!selectedBranch) { addToast('Choose a brand first.', 'error'); return; }
    if (!brief.trim()) { addToast('Write a brief first.', 'error'); return; }
    if (!geminiKey) { addToast('Gemini API key not configured. Set it in Settings.', 'error'); return; }

    setIsGenerating(true);
    setCards([]);
    setDraftRestoredAt(null);
    try {
      console.log('[CardStudio] Calling Gemini…');
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
        // Per-brand style: fonts, palette-lock, template restriction. Undefined
        // for brands not yet styled, which leaves generation exactly as before.
        cardStyle: getBrandCardStyle(selectedBranch.slug),
      });

      console.log('[CardStudio] Gemini returned', concepts.length, 'usable concept(s):',
        concepts.map((c) => c.template));

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
      console.error('[CardStudio] Generate failed:', e);
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
        // Per-brand style: fonts, palette-lock, template restriction. Undefined
        // for brands not yet styled, which leaves generation exactly as before.
        cardStyle: getBrandCardStyle(selectedBranch.slug),
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

  // Attaches a background photo (from upload or the library picker) to one
  // editorial card's concept and re-renders its preview. This is the only
  // place `concept.backgroundUrl` is ever set — the director never invents
  // one, per the contract in creativeDirectorService.
  const applyBackgroundUrl = (id: string, url: string, source: 'upload' | 'library' | 'generated') => {
    const card = cards.find((c) => c.concept.id === id);
    if (!card) return;
    const updatedConcept: CardConceptWithRef = { ...card.concept, backgroundUrl: url };
    setCards((prev) =>
      prev.map((c) => (c.concept.id === id ? { ...c, concept: updatedConcept, previewUrl: null, previewError: null, isRendering: true, backgroundSource: source } : c)),
    );
    renderPreviewFor(updatedConcept);
  };

  // "Generate photo" — the missing third background source. Upload and
  // "Use existing" both assume a suitable photo already exists somewhere;
  // this one briefs the Creative Studio photo pipeline FROM the card itself
  // (the director's photo_brief, or a scene derived from the card's copy),
  // waits for the render, and attaches it. The reference look this exists
  // for: a warm still-life scene with the left side kept calm for the text
  // column — which Background-mode images (deliberately empty washes) and
  // random uploads rarely give you.
  const handleGenerateBackground = async (card: ConceptCardState) => {
    if (!selectedBranch) return;
    const concept = card.concept;
    const scene = (card.photoBriefDraft ?? concept.photo_brief ?? '').trim()
      || `A warm, inviting still-life scene that fits this message: ${concept.statement || concept.eyebrow || card.caption}`;

    setCards((prev) => prev.map((c) => (c.concept.id === card.concept.id ? { ...c, isGeneratingBackground: true } : c)));
    addToast('Generating a background photo — takes about a minute.', 'info');
    try {
      const { job_id } = await submitStaticAdJob({
        branch: selectedBranch.slug,
        message: scene,
        target_segment: '',
        platform: 'general',
        aspect_ratio: '4:5',
        setting: '',
        // Style notes take priority over the pipeline's default photographic
        // direction, so this is where the editorial-specific composition
        // lives: subject weighted right, LEFT side calm for the text column.
        style_notes: 'Warm editorial still life, soft natural light, cozy and inviting. Compose with the subject weighted to the RIGHT side of the frame and keep the LEFT half calm, bright and uncluttered — a designed text column will be placed over the left side.',
        image_style: 'photo',
        purpose: 'card_background',
      });

      // Poll until the frame exists. The static pipeline lands at
      // awaiting_approval with frame_url set; that image IS our background —
      // approval of the background job itself is irrelevant here.
      const POLL_MS = 5000;
      const TIMEOUT_MS = 4 * 60 * 1000;
      const started = Date.now();
      let attached = false;
      while (Date.now() - started < TIMEOUT_MS) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        const job = await pollVideoAdJob(job_id).catch(() => null);
        if (!job) continue;
        if (job.status === 'failed' || job.status === 'cancelled') {
          throw new Error(job.error_message || 'Background generation failed.');
        }
        if (job.frame_url) {
          applyBackgroundUrl(card.concept.id, job.frame_url, 'generated');
          attached = true;
          break;
        }
      }
      if (!attached) throw new Error('Background generation timed out — check Creative Studio for the job, it may still finish.');
      addToast('Background photo attached.', 'success');
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Background generation failed.', 'error');
    } finally {
      setCards((prev) => prev.map((c) => (c.concept.id === card.concept.id ? { ...c, isGeneratingBackground: false } : c)));
    }
  };

  const triggerUploadFor = (id: string) => {
    setUploadTargetId(id);
    fileInputRef.current?.click();
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    const targetId = uploadTargetId;
    e.target.value = ''; // allow picking the same file again later
    setUploadTargetId(null);
    if (!file || !targetId || !selectedBranch) return;

    updateCard(targetId, { isUploadingBackground: true });
    try {
      const url = await uploadPostImage(selectedBranch.slug, file);
      applyBackgroundUrl(targetId, url, 'upload');
      addToast('Background photo attached.', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to upload that photo.', 'error');
    } finally {
      updateCard(targetId, { isUploadingBackground: false });
    }
  };

  const handleBackgroundDrop = async (id: string, e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (!file || !selectedBranch) return;
    if (!file.type.startsWith('image/')) { addToast('Drop an image file.', 'error'); return; }

    updateCard(id, { isUploadingBackground: true });
    try {
      const url = await uploadPostImage(selectedBranch.slug, file);
      applyBackgroundUrl(id, url, 'upload');
      addToast('Background photo attached.', 'success');
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to upload that photo.', 'error');
    } finally {
      updateCard(id, { isUploadingBackground: false });
    }
  };

  // "Use existing" — offers recent Creative Studio output (static/carousel
  // creative, completed or awaiting approval) as ready-made backgrounds.
  // That pipeline already produces clean, text-free, negative-space-aware
  // images, which is exactly what an editorial layout needs.
  const openLibraryPicker = async (id: string) => {
    if (!selectedBranch) return;
    setLibraryModalForId(id);
    setIsLoadingLibrary(true);
    setLibraryItems([]);
    try {
      const { data, error } = await hubClient
        .from('video_ad_jobs')
        .select('id, format, status, composite_url, frame_url, media_urls, created_at')
        .eq('branch', selectedBranch.slug)
        .in('format', ['static', 'carousel'])
        .in('status', ['completed', 'awaiting_approval'])
        .order('created_at', { ascending: false })
        .limit(24);

      if (error) throw error;

      const items: LibraryImage[] = (data || [])
        .map((job: any) => ({
          id: String(job.id),
          url: (job.composite_url || job.frame_url || (Array.isArray(job.media_urls) ? job.media_urls[0] : '') || '') as string,
          format: (job.format as string) || 'static',
        }))
        .filter((item: LibraryImage) => !!item.url);

      setLibraryItems(items);
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Failed to load recent creative.', 'error');
    } finally {
      setIsLoadingLibrary(false);
    }
  };

  const closeLibraryPicker = () => {
    setLibraryModalForId(null);
    setLibraryItems([]);
    setIsLoadingLibrary(false);
  };

  const handlePickLibraryImage = (url: string) => {
    if (!libraryModalForId) return;
    applyBackgroundUrl(libraryModalForId, url, 'library');
    addToast('Background photo attached.', 'success');
    closeLibraryPicker();
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

      const created = await createScheduledPosts([
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

      // Capture the creative DNA of the card that was actually approved —
      // template + palette + the director's rationale — so Post Performance
      // can later attribute engagement back to "which template/angle wins"
      // instead of a pile of numbers with no creative signal. This lands via
      // a follow-up update rather than the insert above because
      // createScheduledPosts() (services/scheduledPostService.ts) only
      // accepts NewScheduledPost's fixed field set; scoped this way, the
      // post is still queued even if this best-effort write fails.
      const createdId = created[0]?.id;
      if (createdId) {
        const isEditorial = card.concept.template === 'editorial';
        const creativeMeta: Record<string, unknown> = {
          palette: card.concept.palette,
          rationale: card.concept.rationale ?? null,
          has_scripture: card.concept.template === 'verse',
          ...(isEditorial
            ? { background_source: card.concept.backgroundUrl ? (card.backgroundSource ?? 'upload') : 'gradient' }
            : {}),
        };
        const { error: metaError } = await hubClient
          .from('scheduled_social_posts')
          .update({ creative_template: card.concept.template, creative_meta: creativeMeta })
          .eq('id', createdId);
        if (metaError) {
          console.warn('Failed to attach creative metadata to scheduled post', metaError);
        }
      }

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
      {/* Hidden shared file input for "editorial" background photo uploads —
          retargeted per card via triggerUploadFor/uploadTargetId. */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileInputChange}
      />

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
          Most of these are drawn layouts, not photographs — a verse on a gradient, a bold statement, a grid. "Editorial" is the hybrid: the same
          kind of structured layout, drawn over a real photograph you attach. Image models can't render text or lay out a grid reliably, so an AI
          creative director writes the concept and a renderer draws it. Nothing gets queued until you approve it.
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
            <div className="flex flex-col gap-1 lg:w-72">
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
              title={preset.hint}
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

        {/* A disabled button that explains nothing is indistinguishable from a
            broken one — say out loud why it can't run, instead of leaving the
            click to do nothing silently. */}
        <div className="flex items-center justify-end gap-3 pt-2">
          {!isGenerating && !selectedBranch && (
            <span className="text-xs text-amber-600 font-medium">Pick a brand first.</span>
          )}
          {!isGenerating && selectedBranch && !brief.trim() && (
            <span className="text-xs text-amber-600 font-medium">Write a brief (or click a preset) first.</span>
          )}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || !selectedBranch || !brief.trim()}
            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-widest transition disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
          >
            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            {isGenerating ? 'Directing…' : `Generate ${count} Concept${count === 1 ? '' : 's'}`}
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
            {cards.map((card) => {
              const isEditorial = card.concept.template === 'editorial';
              const needsBackground = isEditorial && !card.concept.backgroundUrl;
              return (
                <div key={card.concept.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                  {/* Preview */}
                  <div
                    className="relative w-full aspect-[4/5] bg-slate-100 flex items-center justify-center"
                    onDragOver={isEditorial && card.status === 'reviewing' ? (e) => e.preventDefault() : undefined}
                    onDrop={isEditorial && card.status === 'reviewing' ? (e) => handleBackgroundDrop(card.concept.id, e) : undefined}
                  >
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
                    {needsBackground && (
                      <span className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-amber-500/90 text-white">
                        <AlertTriangle className="w-3 h-3" />
                        Needs photo
                      </span>
                    )}
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

                    {/* Editorial: background photo control. No photo yet still
                        renders fine (gradient fallback is a legitimate look), so
                        this is a nudge, not a gate — Approve is never blocked on it. */}
                    {isEditorial && (
                      <div className="flex flex-col gap-1.5 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Background photo</span>
                          {needsBackground && (
                            <span className="text-[9px] font-bold uppercase tracking-widest text-amber-600">Using gradient fallback</span>
                          )}
                        </div>
                        <textarea
                          value={card.photoBriefDraft ?? card.concept.photo_brief ?? ''}
                          onChange={(e) => updateCard(card.concept.id, { photoBriefDraft: e.target.value })}
                          rows={2}
                          disabled={card.isGeneratingBackground || card.status === 'approved'}
                          placeholder="Describe the photo — e.g. flowers and a coffee cup on a kitchen table, soft morning light"
                          className="w-full text-[11px] border border-slate-200 rounded-lg p-2 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40 resize-y disabled:opacity-50"
                        />
                        <div className="flex items-center gap-2">
                          {card.concept.backgroundUrl ? (
                            <img
                              src={card.concept.backgroundUrl}
                              alt=""
                              className="w-10 h-10 rounded-md object-cover border border-slate-200 shrink-0"
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-md border border-dashed border-slate-300 flex items-center justify-center text-slate-300 shrink-0">
                              <ImageIcon className="w-4 h-4" />
                            </div>
                          )}
                          <div className="flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleGenerateBackground(card)}
                              disabled={card.isGeneratingBackground || card.isUploadingBackground || card.status === 'approved'}
                              title="Generate a matching background photo with Creative Studio (~1 min)"
                              className="flex items-center gap-1 px-2 py-1.5 bg-emerald-600 text-white rounded-lg text-[10px] font-bold hover:bg-emerald-700 transition disabled:opacity-40"
                            >
                              {card.isGeneratingBackground ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                              {card.isGeneratingBackground ? 'Generating…' : 'Generate photo'}
                            </button>
                            <button
                              type="button"
                              onClick={() => triggerUploadFor(card.concept.id)}
                              disabled={card.isUploadingBackground || card.isGeneratingBackground || card.status === 'approved'}
                              className="flex items-center gap-1 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 hover:bg-slate-50 transition disabled:opacity-40"
                            >
                              {card.isUploadingBackground ? <Loader2 className="w-3 h-3 animate-spin" /> : <ImagePlus className="w-3 h-3" />}
                              Upload
                            </button>
                            <button
                              type="button"
                              onClick={() => openLibraryPicker(card.concept.id)}
                              disabled={card.isUploadingBackground || card.isGeneratingBackground || card.status === 'approved'}
                              className="flex items-center gap-1 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-[10px] font-bold text-slate-600 hover:bg-slate-50 transition disabled:opacity-40"
                            >
                              <Images className="w-3 h-3" />
                              Use existing
                            </button>
                          </div>
                        </div>
                      </div>
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
                          <option value="tiktok">TikTok</option>
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
                        {card.platform === 'tiktok' && (
                          <p className="basis-full flex items-center gap-1.5 text-[10px] font-bold text-amber-600">
                            <Info className="w-3 h-3 shrink-0" />
                            TikTok posts stay private (SELF_ONLY) until the app clears TikTok's audit.
                          </p>
                        )}
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
              );
            })}
          </div>
        )}
      </div>

      {/* "Use existing" background picker — recent completed/awaiting-approval
          static or carousel creative for this brand, from Creative Studio. */}
      {libraryModalForId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          onClick={closeLibraryPicker}
        >
          <div
            className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Images className="w-4 h-4 text-emerald-600" />
                <h3 className="text-sm font-black text-slate-800 uppercase tracking-tight">Recent Creative Studio Images</h3>
              </div>
              <button
                type="button"
                onClick={closeLibraryPicker}
                className="text-slate-400 hover:text-slate-600 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto">
              {isLoadingLibrary ? (
                <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-300">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <p className="text-xs font-bold uppercase tracking-widest">Loading…</p>
                </div>
              ) : libraryItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-300 text-center">
                  <ImageIcon className="w-6 h-6" />
                  <p className="text-xs font-bold uppercase tracking-widest">
                    No completed static or carousel creative yet for this brand
                  </p>
                  <p className="text-[11px] text-slate-400">Generate some in Creative Studio, or upload your own photo instead.</p>
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {libraryItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handlePickLibraryImage(item.url)}
                      className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 hover:border-emerald-400 transition"
                    >
                      <img src={item.url} alt="" className="w-full h-full object-cover" />
                      <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest bg-slate-900/70 text-white">
                        {item.format}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CardStudio;
