// Bunsan Jisho — dictionary aggregation index
import type { WordEntry, KanjiEntry, SentenceEntry, RadicalEntry, ExpressionEntry, GrammarEntry } from './types';
import { wordsN5a } from '../data/words-n5a';
import { wordsN5b } from '../data/words-n5b';
import { wordsN4a } from '../data/words-n4a';
import { wordsJm0 } from '../data/words-jm-0';
import { wordsJm1 } from '../data/words-jm-1';
import { wordsJm2 } from '../data/words-jm-2';
import { wordsJm3 } from '../data/words-jm-3';
import { wordsJm4 } from '../data/words-jm-4';
import { wordsJm5 } from '../data/words-jm-5';
import { kanjiBasic1 } from '../data/kanji-basic1';
import { kanjiBasic2 } from '../data/kanji-basic2';
import { kanjiJm0 } from '../data/kanji-jm-0';
import { kanjiJm1 } from '../data/kanji-jm-1';
import { sentences } from '../data/sentences';
import { radicals as radicalsRaw } from '../data/radicals';
import { expressions as expressionsData } from '../data/expressions';
import { grammar as grammarData } from '../data/grammar';
import { toHira, toKata, hiraToRomaji, romajiToHira } from './convert';

export const WORDS: WordEntry[] = [...wordsN5a, ...wordsN5b, ...wordsN4a, ...wordsJm0, ...wordsJm1, ...wordsJm2, ...wordsJm3, ...wordsJm4, ...wordsJm5];

// dedup kanji: KANJIDIC2 (kanjiJm*) authoritative; curated files fill missing chars
const kanjiByCharMap = new Map<string, KanjiEntry>();
for (const k of [...kanjiJm0, ...kanjiJm1]) {
  if (!kanjiByCharMap.has(k.c)) {
    kanjiByCharMap.set(k.c, { ...k, on: k.on ?? [], kun: k.kun ?? [], rd: k.rd ?? [] });
  }
}
export const KANJI: KanjiEntry[] = [...kanjiByCharMap.values()];

export const SENTENCES: SentenceEntry[] = sentences;
export const RADICALS: RadicalEntry[] = radicalsRaw;

export const wordById = new Map<number, WordEntry>();
for (const w of WORDS) wordById.set(w.id, w);

export const wordByText = new Map<string, WordEntry>();
for (const w of WORDS) {
  if (w.k && !wordByText.has(w.k)) wordByText.set(w.k, w);
  for (const alt of w.alt || []) if (!wordByText.has(alt)) wordByText.set(alt, w);
  for (const a of w.a) if (!wordByText.has(a)) wordByText.set(a, w);
}

export const kanjiByChar = kanjiByCharMap;
export const radicalByChar = new Map<string, RadicalEntry>();
for (const r of RADICALS) if (!radicalByChar.has(r.c)) radicalByChar.set(r.c, r);

// ---------- search text ----------
export function wordSearchText(w: WordEntry): string {
  return [w.k, ...(w.alt || []), ...w.a, ...w.s.map(s => s.gloss), ...(w.t || [])].join(' ').toLowerCase();
}
export function kanjiSearchText(k: KanjiEntry): string {
  return [k.c, ...k.m, ...k.on, ...k.kun, ...(k.nn || [])].join(' ').toLowerCase();
}
export function sentenceSearchText(s: SentenceEntry): string {
  return [s.ja, s.en, ...(s.t || [])].join(' ').toLowerCase();
}
// precompute
const wordSearchCache = new Map<number, string>();
for (const w of WORDS) wordSearchCache.set(w.id, wordSearchText(w));
const kanjiSearchCache = new Map<string, string>();
for (const k of KANJI) kanjiSearchCache.set(k.c, kanjiSearchText(k));

export function getWordSearchText(w: WordEntry) { return wordSearchCache.get(w.id) || wordSearchText(w); }
export function getKanjiSearchText(k: KanjiEntry) { return kanjiSearchCache.get(k.c) || kanjiSearchText(k); }

// ---------- conjugation class ----------
export type VerbClass = 'ru' | 'u' | 'suru' | 'kuru' | 'adj-i' | 'adj-na' | null;
export function verbClass(w: WordEntry): VerbClass {
  const pos = w.s.flatMap(s => s.pos || []);
  if (pos.includes('vk')) return 'kuru';
  if (pos.includes('vs')) return 'suru';
  if (pos.includes('v1')) return 'ru';
  if (pos.includes('v5')) return 'u';
  if (pos.includes('adj-i')) return 'adj-i';
  if (pos.includes('adj-na')) return 'adj-na';
  // heuristics when pos missing
  const r = w.a[0];
  if (r?.endsWith('する')) return 'suru';
  if (r?.endsWith('くる') && w.k === '来る') return 'kuru';
  if (r?.endsWith('る')) {
    const stem = r.slice(0, -1);
    if ('いうえお'.includes(stem[stem.length - 1])) return 'ru'; // みる、たべる etc. (rough)
  }
  if (r?.endsWith('い')) return 'adj-i';
  return null;
}

// ---------- pitch accent rendering ----------
export interface PitchPattern { mora: string[]; high: boolean[]; label: string; }
export function pitchPattern(w: WordEntry): PitchPattern | null {
  if (!w.p || !w.a[0]) return null;
  const reading = toHira(w.a[0]);
  // count morae (small kana join)
  const mora: string[] = [];
  const smalls = 'ゃゅょぁぃぅぇぉャュョァィゥェォ';
  for (let i = 0; i < reading.length; i++) {
    const c = reading[i];
    if (i > 0 && smalls.includes(c)) mora[mora.length - 1] += c;
    else mora.push(c);
  }
  const n = mora.length;
  if (n === 0) return null;
  let high: boolean[];
  let label: string;
  const p = w.p.split(';')[0];
  if (p === '0') { // heiban: low first, then high, particle high
    high = mora.map((_, i) => i > 0);
    label = '平板 (heiban) [0]';
  } else if (p === '1') { // atamadaka: high first then low
    high = mora.map(() => false); high[0] = true;
    label = '頭高 (atamadaka) [1]';
  } else if (p === '-1') { // odaka: low start, high, particle low
    high = mora.map(() => true); high[0] = false;
    label = '尾高 (odaka) [-1]';
  } else {
    const down = parseInt(p);
    if (isNaN(down) || down < 2 || down > n) return null;
    high = mora.map((_, i) => i > 0 && i < down);
    label = `中高 (nakadaka) [${down}]`;
  }
  return { mora, high, label };
}

// ---------- expressions (proverbs, idioms, greetings, yojijukugo) ----------
export const EXPRESSIONS: ExpressionEntry[] = expressionsData;

// ---------- grammar patterns ----------
export const GRAMMAR: GrammarEntry[] = grammarData;
export const grammarById = new Map<number, GrammarEntry>();
for (const g of GRAMMAR) grammarById.set(g.id, g);

export { toHira, toKata, hiraToRomaji, romajiToHira };
