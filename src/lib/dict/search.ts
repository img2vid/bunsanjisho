// Search engine: words, kanji, sentences with filters, wildcard, romaji input
import type { WordEntry, KanjiEntry, SentenceEntry, JlptLevel } from './types';
import { WORDS, KANJI, SENTENCES, getWordSearchText, getKanjiSearchText, sentenceSearchText, verbClass, type VerbClass } from './index';
import { RADK } from '../data/radk';
import { toHira, toKata, romajiToHira, hasJapanese, isHira, isKata } from './convert';
import { deconjugate, type DeinflectedMatch } from './deconjugate';

export interface WordFilters {
  jlpt?: JlptLevel | 'all';
  pos?: string; // n, verb, adj-i, adj-na, adv, exp...
  commonOnly?: boolean;
  maxFreq?: number;
  tag?: string;
  starred?: boolean;
  listId?: string;
}

export interface SearchOptions {
  wildcard?: boolean;
}

function wildcardToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, ch => (ch === '*' ? '[\\s\\S]*' : ch === '?' ? '.' : `\\${ch}`));
  return new RegExp(`^${escaped}$`);
}

export function normalizeQuery(q: string): string {
  const t = q.trim();
  if (!t) return '';
  if (hasJapanese(t)) return t;
  // romaji input
  const lower = t.toLowerCase();
  if (/^[a-z' ?*-]+$/.test(lower)) {
    const hira = romajiToHira(lower.replace(/[*?]/g, ''));
    if (hira) return lower.includes('*') || lower.includes('?') ? hira : hira;
  }
  return t;
}

export interface Scored<T> { item: T; score: number; }

/**
 * Merge duplicate headwords (same kanji form + primary reading), keeping the
 * most frequent entry in each duplicate's ranking slot. JMdict imports can
 * contain the same word twice (e.g. 食べる at two frequencies) — users should
 * see it once in search results.
 */
export function dedupeWords(words: WordEntry[]): WordEntry[] {
  const seen = new Map<string, number>(); // key -> index in out
  const out: WordEntry[] = [];
  for (const w of words) {
    const key = `${w.k || ''}¦${w.a[0] || ''}`;
    const at = seen.get(key);
    if (at === undefined) {
      seen.set(key, out.length);
      out.push(w);
    } else if ((w.f ?? 99999) < (out[at].f ?? 99999)) {
      out[at] = w; // keep ranking position, swap in the more common duplicate
    }
  }
  return out;
}

export function searchWords(query: string, filters: WordFilters = {}, opts: SearchOptions = {}, limit = 60): WordEntry[] {
  const q = normalizeQuery(query);
  const qHira = isKata(q) ? toHira(q) : q;
  const qKata = isHira(q) ? toKata(q) : q;
  const isWildcard = q.includes('*') || q.includes('?');
  let pool: WordEntry[] = WORDS;

  // structural filters first (cheap)
  if (filters.jlpt && filters.jlpt !== 'all') pool = pool.filter(w => w.j === filters.jlpt);
  if (filters.commonOnly) pool = pool.filter(w => (w.f ?? 99999) <= 1500);
  if (filters.maxFreq) pool = pool.filter(w => (w.f ?? 99999) <= filters.maxFreq!);
  if (filters.tag) pool = pool.filter(w => (w.t || []).includes(filters.tag!));
  if (filters.pos) {
    const want: VerbClass | string = filters.pos;
    pool = pool.filter(w => {
      const cls = verbClass(w);
      const pos = w.s.flatMap(s => s.pos || []);
      if (want === 'verb') return ['ru', 'u', 'suru', 'kuru'].includes(cls as string);
      if (want === 'adj') return pos.some(p => p.startsWith('adj'));
      return pos.includes(want as string);
    });
  }

  if (!q) {
    // browse mode: by frequency
    return dedupeWords([...pool].sort((a, b) => (a.f ?? 99999) - (b.f ?? 99999))).slice(0, limit);
  }

  const results: Scored<WordEntry>[] = [];
  const matcher = opts.wildcard && isWildcard ? wildcardToRegex(q) : null;
  const lowerQ = q.toLowerCase();

  for (const w of pool) {
    if (matcher) {
      const forms = [w.k, ...(w.alt || []), ...w.a, toKata(w.a[0] || '')].filter(Boolean);
      if (!forms.some(f => matcher.test(f))) continue;
      results.push({ item: w, score: 100 });
      continue;
    }
    let score = -1;
    const forms = [w.k, ...(w.alt || [])];
    const readings = [...w.a, toKata(w.a[0] || '')].filter(Boolean);
    if (w.k && w.k === q) score = 1000;
    else if (forms.some(f => f === q)) score = 950;
    else if (readings.some(r => r === qHira || r === q)) score = 900;
    else if (w.k && w.k.startsWith(q)) score = 800;
    else if (readings.some(r => r.startsWith(qHira))) score = 750;
    else if (w.k && w.k.includes(q)) score = 600;
    else if (readings.some(r => r.includes(qHira))) score = 550;
    else {
      const st = getWordSearchText(w);
      if (st.includes(lowerQ)) {
        score = 300;
        if (st.split(' ').some(g => g === lowerQ)) score = 700;
        else if (st.split(' ').some(g => g.startsWith(lowerQ))) score = 500;
      }
    }
    if (score < 0) continue;
    // boost frequency + jlpt presence
    if (w.f) score += Math.max(0, 60 - Math.min(60, w.f / 40));
    if (w.j) score += 10;
    results.push({ item: w, score });
  }

  return dedupeWords(results.sort((a, b) => b.score - a.score || (a.item.f ?? 99999) - (b.item.f ?? 99999)).slice(0, limit).map(r => r.item));
}

export interface WordSearchResult {
  items: WordEntry[];
  /** non-null when the query was an inflected form resolved via deconjugation */
  deinflected: DeinflectedMatch[] | null;
}

/**
 * Word search with automatic deconjugation fallback: if the direct dictionary
 * search finds nothing (e.g. "tabemasu", 食べました, 食べたかった), inflected
 * forms are reduced back to their dictionary entries.
 */
export function searchWordsDeinflected(query: string, filters: WordFilters = {}, opts: SearchOptions = {}, limit = 60): WordSearchResult {
  const items = searchWords(query, filters, opts, limit);
  if (items.length > 0) return { items, deinflected: null };
  const q = query.trim();
  if (!q || q.includes('*') || q.includes('?')) return { items, deinflected: null };
  const matches = deconjugate(q, 6);
  if (matches.length === 0) return { items, deinflected: null };
  return { items: matches.map(m => m.word), deinflected: matches };
}

export function searchKanji(query: string, filters: { grade?: string; jlpt?: string; strokes?: string; radical?: string; components?: string[] } = {}, limit = 100): KanjiEntry[] {
  const q = query.trim();
  let pool: KanjiEntry[] = KANJI;
  if (filters.grade && filters.grade !== 'all') pool = pool.filter(k => String(k.g ?? '') === filters.grade);
  if (filters.jlpt && filters.jlpt !== 'all') pool = pool.filter(k => String(k.j ?? '') === filters.jlpt);
  if (filters.strokes && filters.strokes !== 'all') pool = pool.filter(k => String(k.st) === filters.strokes);
  if (filters.radical && filters.radical !== 'all') pool = pool.filter(k => k.r === filters.radical);
  if (filters.components && filters.components.length) {
    pool = pool.filter(k => filters.components!.every(c => k.rd?.includes(c)));
  }
  if (!q) return pool.slice(0, limit);
  const lowerQ = q.toLowerCase();
  const scored: Scored<KanjiEntry>[] = [];
  for (const k of pool) {
    let score = -1;
    if (k.c === q) score = 1000;
    else if (k.on.some(r => r === toKata(q))) score = 900;
    else if (k.kun.some(r => r.replace(/[-.]/g, '') === toHira(q))) score = 900;
    else if (k.on.some(r => r.startsWith(toKata(q))) && toKata(q).length > 0) score = 700;
    else if (k.kun.some(r => r.replace(/[-.]/g, '').startsWith(toHira(q)))) score = 700;
    else {
      const st = getKanjiSearchText(k);
      if (st.includes(lowerQ)) {
        score = 300;
        if (st.split(' ').some(g => g === lowerQ)) score = 700;
        else if (st.split(' ').some(g => g.startsWith(lowerQ))) score = 500;
      }
    }
    if (score < 0) continue;
    if (k.f) score += Math.max(0, 30 - Math.min(30, k.f / 60));
    scored.push({ item: k, score });
  }
  return scored.sort((a, b) => b.score - a.score || (a.item.f ?? 9999) - (b.item.f ?? 9999)).slice(0, limit).map(r => r.item);
}

export function searchSentences(query: string, filters: { jlpt?: string; tag?: string } = {}, limit = 60): SentenceEntry[] {
  let pool = SENTENCES;
  if (filters.jlpt && filters.jlpt !== 'all') pool = pool.filter(s => String(s.j ?? '') === filters.jlpt);
  if (filters.tag && filters.tag !== 'all') pool = pool.filter(s => (s.t || []).includes(filters.tag!));
  const q = query.trim().toLowerCase();
  if (!q) return pool.slice(0, limit);
  const qHira = toHira(q);
  return pool
    .filter(s => {
      const ja = s.ja;
      const st = sentenceSearchText(s);
      return ja.includes(q) || st.includes(q) || (hasJapanese(q) && toHira(ja).includes(qHira));
    })
    .slice(0, limit);
}

/** Find homophones: words sharing a reading */
export function homophones(w: WordEntry, limit = 12): WordEntry[] {
  return WORDS.filter(o => o.id !== w.id && o.a.some(a => w.a.includes(a))).slice(0, limit);
}

/** Words containing a kanji */
export function wordsWithKanji(kanji: string, limit = 30): WordEntry[] {
  return WORDS.filter(w => w.k?.includes(kanji)).sort((a, b) => (a.f ?? 99999) - (b.f ?? 99999)).slice(0, limit);
}

/** Similar kanji: share at least 2 components */
export function similarKanji(k: KanjiEntry, limit = 12): KanjiEntry[] {
  const comps = new Set(k.rd || []);
  if (comps.size === 0) return [];
  return KANJI.filter(o => o.c !== k.c)
    .map(o => ({ o, overlap: (o.rd || []).filter(c => comps.has(c)).length }))
    .filter(x => x.overlap >= 2)
    .sort((a, b) => b.overlap - a.overlap || (a.o.f ?? 9999) - (b.o.f ?? 9999))
    .slice(0, limit)
    .map(x => x.o);
}

/** Kanji that use a radical */
export function kanjiWithRadical(radical: string, limit = 120): KanjiEntry[] {
  return KANJI.filter(k => k.r === radical || k.rd?.includes(radical))
    .sort((a, b) => (a.f ?? 9999) - (b.f ?? 9999))
    .slice(0, limit);
}

/** Component variant -> canonical radical (radkfile keys use standalone forms) */
const VARIANT: Record<string, string[]> = {
  '氵': ['水'], '忄': ['心'], '扌': ['手'], '亻': ['人'], '刂': ['刀'], '犭': ['犬'],
  '礻': ['示'], '衤': ['衣'], '罒': ['网'], '王': ['玉'], '艹': ['艸'], '辶': ['辵'],
  '⺅': ['人'], '⺡': ['水'], '⺠': ['民'], '阝': ['阜', '邑'], '户': ['戶'],
};

/** Kanji whose radkfile radical set contains ALL given components */
export function kanjiWithComponents(components: string[], limit = 200): KanjiEntry[] {
  if (!components.length) return [];
  let pool: Set<string> | null = null;
  for (const comp of components) {
    const candidates = [comp, ...(VARIANT[comp] || [])];
    const set = new Set<string>();
    for (const cand of candidates) {
      const list = RADK[cand];
      if (list) for (const ch of list) set.add(ch);
    }
    for (const k of KANJI) if (k.rd?.includes(comp)) set.add(k.c);
    const prev: Set<string> = pool ?? set;
    pool = new Set<string>([...prev].filter(c => set.has(c)));
    if (pool.size === 0) break;
  }
  const set2 = pool || new Set<string>();
  return KANJI.filter(k => set2.has(k.c))
    .sort((a, b) => (a.st - b.st) || ((a.f ?? 9999) - (b.f ?? 9999)))
    .slice(0, limit);
}

export const ALL_TAGS: string[] = (() => {
  const s = new Set<string>();
  for (const w of WORDS) for (const t of w.t || []) s.add(t);
  return [...s].sort();
})();

export const ALL_SENTENCE_TAGS: string[] = (() => {
  const s = new Set<string>();
  for (const x of SENTENCES) for (const t of x.t || []) s.add(t);
  return [...s].sort();
})();
