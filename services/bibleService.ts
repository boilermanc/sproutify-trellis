import { supabase } from '../lib/supabase';

// ─── Bible passage lookup (Card Studio) ────────────────────────────
// Mirrors the Rejoice app's own pattern: an AI director may PICK a
// reference, but only this service (via the spoke-query Edge Function)
// ever supplies the actual verse text. The Rejoice spoke's service-role
// key never reaches the browser — the Edge Function decrypts it
// server-side from the saved spoke connection.
// ────────────────────────────────────────────────────────────────────

export interface BiblePassage {
  reference: string;
  text: string;
  translation: string;
  license?: string;
  verseCount?: number;
}

export interface VerseReference {
  book_id: string;
  chapter: number;
  verse_start: number;
  verse_end?: number;
}

/**
 * Fetches the exact wording of a passage from the Rejoice spoke's Berean
 * Standard Bible table via the spoke-query Edge Function. Never returns
 * placeholder or partial scripture — any failure throws with a clear
 * message so the caller can surface it rather than render a broken card.
 */
export async function fetchPassage(connectionId: string, ref: VerseReference): Promise<BiblePassage> {
  if (!connectionId) {
    throw new Error('No Bible source connected for this brand.');
  }
  if (!ref || !ref.book_id || !ref.chapter || !ref.verse_start) {
    throw new Error('Incomplete verse reference — cannot fetch scripture.');
  }

  const { data, error } = await supabase.functions.invoke('spoke-query', {
    body: {
      op: 'bible_passage',
      connection_id: connectionId,
      book_id: ref.book_id,
      chapter: ref.chapter,
      verse_start: ref.verse_start,
      verse_end: ref.verse_end,
    },
  });

  if (error) throw new Error(error.message || 'Bible passage request failed.');
  if (data?.error) throw new Error(data.error);
  if (!data?.ok || !data?.text) throw new Error('Bible passage lookup returned no text.');

  return {
    reference: String(data.reference || ''),
    text: String(data.text),
    translation: String(data.translation || 'BSB'),
    license: data.license ? String(data.license) : undefined,
    verseCount: typeof data.verse_count === 'number' ? data.verse_count : undefined,
  };
}

// ─── USFM book vocabulary ───────────────────────────────────────────
// The exact, closed vocabulary of book ids the AI director is allowed to
// choose from, and that `bible_passage` / `bible_verses` rows key on.
export const USFM_BOOKS: { id: string; name: string }[] = [
  { id: 'GEN', name: 'Genesis' },
  { id: 'EXO', name: 'Exodus' },
  { id: 'LEV', name: 'Leviticus' },
  { id: 'NUM', name: 'Numbers' },
  { id: 'DEU', name: 'Deuteronomy' },
  { id: 'JOS', name: 'Joshua' },
  { id: 'JDG', name: 'Judges' },
  { id: 'RUT', name: 'Ruth' },
  { id: '1SA', name: '1 Samuel' },
  { id: '2SA', name: '2 Samuel' },
  { id: '1KI', name: '1 Kings' },
  { id: '2KI', name: '2 Kings' },
  { id: '1CH', name: '1 Chronicles' },
  { id: '2CH', name: '2 Chronicles' },
  { id: 'EZR', name: 'Ezra' },
  { id: 'NEH', name: 'Nehemiah' },
  { id: 'EST', name: 'Esther' },
  { id: 'JOB', name: 'Job' },
  { id: 'PSA', name: 'Psalms' },
  { id: 'PRO', name: 'Proverbs' },
  { id: 'ECC', name: 'Ecclesiastes' },
  { id: 'SNG', name: 'Song of Solomon' },
  { id: 'ISA', name: 'Isaiah' },
  { id: 'JER', name: 'Jeremiah' },
  { id: 'LAM', name: 'Lamentations' },
  { id: 'EZK', name: 'Ezekiel' },
  { id: 'DAN', name: 'Daniel' },
  { id: 'HOS', name: 'Hosea' },
  { id: 'JOL', name: 'Joel' },
  { id: 'AMO', name: 'Amos' },
  { id: 'OBA', name: 'Obadiah' },
  { id: 'JON', name: 'Jonah' },
  { id: 'MIC', name: 'Micah' },
  { id: 'NAM', name: 'Nahum' },
  { id: 'HAB', name: 'Habakkuk' },
  { id: 'ZEP', name: 'Zephaniah' },
  { id: 'HAG', name: 'Haggai' },
  { id: 'ZEC', name: 'Zechariah' },
  { id: 'MAL', name: 'Malachi' },
  { id: 'MAT', name: 'Matthew' },
  { id: 'MRK', name: 'Mark' },
  { id: 'LUK', name: 'Luke' },
  { id: 'JHN', name: 'John' },
  { id: 'ACT', name: 'Acts' },
  { id: 'ROM', name: 'Romans' },
  { id: '1CO', name: '1 Corinthians' },
  { id: '2CO', name: '2 Corinthians' },
  { id: 'GAL', name: 'Galatians' },
  { id: 'EPH', name: 'Ephesians' },
  { id: 'PHP', name: 'Philippians' },
  { id: 'COL', name: 'Colossians' },
  { id: '1TH', name: '1 Thessalonians' },
  { id: '2TH', name: '2 Thessalonians' },
  { id: '1TI', name: '1 Timothy' },
  { id: '2TI', name: '2 Timothy' },
  { id: 'TIT', name: 'Titus' },
  { id: 'PHM', name: 'Philemon' },
  { id: 'HEB', name: 'Hebrews' },
  { id: 'JAS', name: 'James' },
  { id: '1PE', name: '1 Peter' },
  { id: '2PE', name: '2 Peter' },
  { id: '1JN', name: '1 John' },
  { id: '2JN', name: '2 John' },
  { id: '3JN', name: '3 John' },
  { id: 'JUD', name: 'Jude' },
  { id: 'REV', name: 'Revelation' },
];

/**
 * Best-effort parse of a free-text reference like "Philippians 4:6-7" or
 * "PHP 4:6" into a structured VerseReference, matched against USFM_BOOKS by
 * either the full book name or the USFM id (case-insensitive). Returns null
 * whenever it can't parse with confidence — callers must not guess a
 * reference from a failed parse.
 */
export function parseReference(input: string): VerseReference | null {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(.+?)\s+(\d+)\s*:\s*(\d+)(?:\s*[-–]\s*(\d+))?\s*$/);
  if (!match) return null;

  const [, rawBook, chapterStr, verseStartStr, verseEndStr] = match;
  const bookKey = rawBook.trim().replace(/\.$/, '').toLowerCase();
  const book = USFM_BOOKS.find(
    (b) => b.id.toLowerCase() === bookKey || b.name.toLowerCase() === bookKey,
  );
  if (!book) return null;

  const chapter = parseInt(chapterStr, 10);
  const verseStart = parseInt(verseStartStr, 10);
  if (!Number.isInteger(chapter) || chapter <= 0) return null;
  if (!Number.isInteger(verseStart) || verseStart <= 0) return null;

  const ref: VerseReference = { book_id: book.id, chapter, verse_start: verseStart };
  if (verseEndStr) {
    const verseEnd = parseInt(verseEndStr, 10);
    if (!Number.isInteger(verseEnd) || verseEnd < verseStart) return null;
    ref.verse_end = verseEnd;
  }
  return ref;
}
