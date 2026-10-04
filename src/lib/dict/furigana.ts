// Text annotation tokenizer: longest-match word segmentation with furigana
import type { WordEntry } from './types';
import { WORDS, wordByText, kanjiByChar } from './index';
import { splitFurigana, hasKanji } from './convert';
import { deconjugate } from './deconjugate';

export interface Token {
  text: string;          // surface text
  wordId?: number;       // matched dictionary word
  segments?: Array<{ base: string; ruby?: string }>; // furigana segments
  pos?: string[];
  gloss?: string;
  /** surface is an inflected form — resolved via the deconjugation engine */
  deinflected?: boolean;
  /** human-readable conjugation chain, e.g. "polite past negative" */
  conjChain?: string;
}

// Build a head-word lookup for tokenization (kanji forms and kana readings, length>=1)
const tokIndex = new Map<string, number>(); // surface -> wordId (first wins, prefer frequent)
for (const w of WORDS) {
  const freq = w.f ?? 99999;
  if (w.k) {
    const cur = tokIndex.get(w.k);
    if (cur === undefined || freq < (WORDS.find(x => x.id === cur)?.f ?? 99999)) tokIndex.set(w.k, w.id);
  }
}
for (const w of WORDS) {
  const a = w.a[0];
  if (!a || w.k) continue; // kana-only words
  const cur = tokIndex.get(a);
  if (cur === undefined || (w.f ?? 99999) < (WORDS.find(x => x.id === cur)?.f ?? 99999)) tokIndex.set(a, w.id);
}

const MAX_TOKEN_LEN = 8;
/** longest run we attempt to deconjugate (perf cap for long texts) */
const MAX_DEINFLECT_LEN = 6;

export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    let matched: { len: number; word: WordEntry } | null = null;
    const maxLen = Math.min(MAX_TOKEN_LEN, text.length - i);
    for (let len = maxLen; len >= 1; len--) {
      const sub = text.slice(i, i + len);
      const id = tokIndex.get(sub);
      if (id !== undefined) {
        const w = WORDS.find(x => x.id === id)!;
        matched = { len, word: w };
        break;
      }
    }
    // deconjugation-aware extension: when a direct match exists but a LONGER
    // run inflects back to a dictionary word (面白かった → 面白い, 行った → 行く),
    // prefer the single inflected token over direct-match + fragments
    const maxDe = Math.min(MAX_DEINFLECT_LEN, text.length - i);
    let deMatched: { len: number; word: WordEntry; chain: string } | null = null;
    if (matched && matched.len < maxDe) {
      for (let len = maxDe; len > matched.len; len--) {
        const m = deconjugate(text.slice(i, i + len), 1)[0];
        if (m) { deMatched = { len, word: m.word, chain: m.chain }; break; }
      }
    }
    if (!matched) {
      // deconjugation fallback: try to reduce an inflected run (食べました, 遊んでいる…)
      // to its dictionary entry before giving up on this position
      for (let len = maxDe; len >= 2; len--) {
        const m = deconjugate(text.slice(i, i + len), 1)[0];
        if (m) { deMatched = { len, word: m.word, chain: m.chain }; break; }
      }
    }
    if (deMatched) {
      const w = deMatched.word;
      tokens.push({
        text: text.slice(i, i + deMatched.len),
        wordId: w.id,
        deinflected: true,
        conjChain: deMatched.chain || 'inflected form',
        pos: w.s[0]?.pos,
        gloss: w.s.map(s => s.gloss).join('; ').slice(0, 120),
      });
      i += deMatched.len;
      continue;
    }
    if (matched) {
      const w = matched.word;
      const segments = w.k ? buildSegments(w) : undefined;
      tokens.push({
        text: text.slice(i, i + matched.len),
        wordId: w.id,
        segments,
        pos: w.s[0]?.pos,
        gloss: w.s.map(s => s.gloss).join('; ').slice(0, 120),
      });
      i += matched.len;
    } else {
      // accumulate plain char
      const last = tokens[tokens.length - 1];
      const ch = text[i];
      if (last && !last.wordId && !last.segments) last.text += ch;
      else tokens.push({ text: ch });
      i++;
    }
  }
  return tokens;
}

export function buildSegments(w: WordEntry): Array<{ base: string; ruby?: string }> {
  if (!w.k) return [{ base: w.a[0] }];
  const segs = splitFurigana(w.k, w.a[0]);
  return segs.map(s => ({ base: s.base, ruby: 'ruby' in s ? s.ruby : undefined }));
}

/** Get a quick kanji gloss for hover */
export function kanjiQuickInfo(ch: string): { m: string[]; on: string[]; kun: string[]; st: number } | null {
  const k = kanjiByChar.get(ch);
  if (!k) return null;
  return { m: k.m, on: k.on, kun: k.kun, st: k.st };
}
