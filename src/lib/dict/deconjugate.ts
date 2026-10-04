// Deconjugation (de-inflection) engine for Bunsan Jisho.
// Maps inflected verb/adjective forms back to their dictionary entries so that
// "tabemasu", 食べました, 食べたかった, のんでいる… all find the right entry.
//
// Strategy: rule-based BFS over suffix-stripping candidates with dictionary
// existence checks (reading map + kanji-prefix scan). No pre-built index —
// runs in well under a millisecond per query and stays allocation-light.
import { WORDS } from './index';
import { toHira, hasJapanese, isKata, romajiToHira } from './convert';
import type { WordEntry } from './types';

export interface DeinflectedMatch {
  word: WordEntry;
  /** human-readable conjugation chain, e.g. "polite past negative" */
  chain: string;
  /** the surface form that matched (kana reading candidate) */
  form: string;
}

// ---------- kana-row morph tables ----------
// い-column (renyou) → dictionary う-column
const I2U: Record<string, string> = { い: 'う', き: 'く', ぎ: 'ぐ', し: 'す', ち: 'つ', に: 'ぬ', び: 'ぶ', み: 'む', り: 'る' };
// 未然形 (a-column) → dictionary う-column  (のませる → のむ, かかせる → かく, 買わない → 買う)
const A2U: Record<string, string> = { か: 'く', が: 'ぐ', さ: 'す', た: 'つ', な: 'ぬ', ば: 'ぶ', ま: 'む', ら: 'る', わ: 'う' };
// え-column (conditional / imperative / potential) → dictionary う-column (のめば → のむ, いけ → いく)
const E2U: Record<string, string> = { え: 'う', け: 'く', げ: 'ぐ', せ: 'す', て: 'つ', ね: 'ぬ', べ: 'ぶ', め: 'む', れ: 'る' };
const MORPH: Record<string, string> = { ...A2U, ...I2U, ...E2U };
// all う-column endings, tried for volitional stems (のもう → のむ)
const U_COL = ['う', 'く', 'ぐ', 'す', 'つ', 'ぬ', 'ぶ', 'む', 'る'];

// ---------- dictionary lookup maps (lazy, built once) ----------
let READING_MAP: Map<string, WordEntry[]> | null = null;
let KANJI_BY_FIRST: Map<string, WordEntry[]> | null = null;

function ensureMaps() {
  if (READING_MAP) return;
  READING_MAP = new Map();
  KANJI_BY_FIRST = new Map();
  for (const w of WORDS) {
    const r = toHira(w.a[0] || '');
    if (r && r.length >= 2) {
      const arr = READING_MAP.get(r);
      if (arr) arr.push(w); else READING_MAP.set(r, [w]);
    }
    if (w.k && w.k.length >= 2) {
      const c = w.k[0];
      const arr = KANJI_BY_FIRST.get(c);
      if (arr) arr.push(w); else KANJI_BY_FIRST.set(c, [w]);
    }
  }
}

// ---------- candidate-stem reconstruction ----------
/** sound morphs: っ-doubling and ん-nasal endings regenerate candidate stems */
function kanaMorphs(st: string): string[] {
  const out = new Set<string>([st]);
  if (st.endsWith('っ')) {
    out.add(st.slice(0, -1) + 'つ');
    out.add(st.slice(0, -1));
  }
  if (st.endsWith('ん')) {
    for (const r of ['む', 'ぶ', 'ぬ']) out.add(st.slice(0, -1) + r);
  }
  return [...out];
}

/** continuations for a verb stem that preceded a suffix (ます/ない/た …) */
function verbStems(st: string): string[] {
  const out = new Set<string>();
  // sound-morphed candidates (っ-doubling, ん-nasal) are FULL candidates only:
  // they must not receive further suffix reconstruction, otherwise fragmentary
  // runs like "った" regenerate bogus words (っ→つ + る = つる 鶴).
  for (const m of kanaMorphs(st)) {
    if (m !== st) out.add(m);                            // のん → 飲む, まっ → 待つ
  }
  // suffix reconstruction applies only to the raw stem
  out.add(st + 'る');                                    // ichidan
  const last = st[st.length - 1];
  if (last && MORPH[last]) out.add(st.slice(0, -1) + MORPH[last]); // godan rows
  if (last === 'し') {                                   // する/くる family: 勉強し… → 勉強(する)
    out.add(st.slice(0, -1));
    out.add(st.slice(0, -1) + 'する');
    out.add(st.slice(0, -1) + 'ずる');
    out.add(st.slice(0, -1) + 'じる');
  }
  if (last === 'き') { out.add(st.slice(0, -1) + 'くる'); out.add(st.slice(0, -1) + 'く'); } // 来ます → 来る
  if (last === 'く') out.add(st.slice(0, -1) + 'い');    // adj-i adverbial stem (青くない → 青い)
  if (last === 'い') out.add(st.slice(0, -1) + 'く');    // く-godan te-form (書いて → 書く)
  return [...out].filter(s => s.length >= 2);
}

interface Rule { s: string; name: string; gen: (stem: string) => string[]; }

const RULES: Rule[] = [
  // polite forms — longest first
  { s: 'ませんでした', name: 'polite past negative', gen: verbStems },
  { s: 'ませ', name: 'polite (masu-stem)', gen: verbStems },
  { s: 'ません', name: 'polite negative', gen: verbStems },
  { s: 'ました', name: 'polite past', gen: verbStems },
  { s: 'ましょう', name: 'polite volitional', gen: verbStems },
  { s: 'ます', name: 'polite', gen: verbStems },
  // たい family
  { s: 'たくなかった', name: 'past negative want', gen: verbStems },
  { s: 'たくない', name: 'negative want', gen: verbStems },
  { s: 'たかった', name: 'past want', gen: verbStems },
  { s: 'たい', name: 'want to (たい)', gen: verbStems },
  { s: 'たく', name: 'want-stem', gen: verbStems },
  // adjectives
  { s: 'くなかった', name: 'past negative (adj-i)', gen: verbStems },
  { s: 'くありません', name: 'polite negative (adj-i)', gen: verbStems },
  { s: 'かった', name: 'past (adj-i)', gen: st => [st + 'い', ...verbStems(st)] },
  { s: 'ければ', name: 'conditional (adj-i)', gen: verbStems },
  { s: 'くて', name: 'te-form (adj-i)', gen: verbStems },
  { s: 'すぎ', name: 'excessive (すぎ)', gen: verbStems },
  { s: 'そう', name: 'appearance (そう)', gen: verbStems },
  { s: 'く', name: 'adverbial (adj-i)', gen: verbStems },
  { s: 'に', name: 'adverbial (adj-na)', gen: s => s.length >= 2 ? [s] : [] },
  // voice / mood
  { s: 'させられる', name: 'causative-passive', gen: verbStems },
  { s: 'せられる', name: 'causative-passive', gen: verbStems },
  { s: 'させる', name: 'causative', gen: verbStems },
  { s: 'される', name: 'passive (する)', gen: st => kanaMorphs(st).map(m => m + 'する') },
  { s: 'せる', name: 'causative', gen: verbStems },
  { s: 'られる', name: 'passive/potential', gen: verbStems },
  { s: 'れる', name: 'passive/potential', gen: verbStems },
  { s: 'できる', name: 'potential (する)', gen: st => kanaMorphs(st).map(m => m + 'する') },
  { s: 'んでいる', name: 'progressive (ている)', gen: st => [st + 'む', st + 'ぶ', st + 'ぬ', ...kanaMorphs(st).filter(m => m !== st)] },
  { s: 'でいる', name: 'progressive (ている)', gen: st => [st + 'む', st + 'ぶ', st + 'ぬ', ...kanaMorphs(st).filter(m => m !== st)] },
  { s: 'ています', name: 'polite progressive (ている)', gen: verbStems },
  { s: 'でいます', name: 'polite progressive (ている)', gen: st => [st + 'む', st + 'ぶ', st + 'ぬ', ...kanaMorphs(st).filter(m => m !== st)] },
  { s: 'ていました', name: 'polite progressive past (ている)', gen: verbStems },
  // polite いる-auxiliary — 走っています → 走って → 走る (identity stem, next BFS depth applies te/って rules)
  { s: 'いました', name: 'polite past (いる aux.)', gen: st => [st] },
  { s: 'います', name: 'polite (いる aux.)', gen: st => [st] },
  // polite copula — 面白かったです → 面白い, 学生でした → 学生
  { s: 'でした', name: 'polite past (です)', gen: st => [st] },
  { s: 'です', name: 'polite (です)', gen: st => [st] },
  { s: 'ている', name: 'progressive (ている)', gen: verbStems },
  { s: 'でる', name: 'progressive (contr.)', gen: verbStems },
  { s: 'てる', name: 'progressive (contr.)', gen: verbStems },
  { s: 'でた', name: 'progressive past (contr.)', gen: verbStems },
  { s: 'てた', name: 'progressive past (contr.)', gen: verbStems },
  { s: 'てない', name: 'progressive negative', gen: verbStems },
  { s: 'でない', name: 'progressive negative', gen: verbStems },
  { s: 'ずに', name: 'classical negative (ずに)', gen: verbStems },
  { s: 'ず', name: 'classical negative (ず)', gen: verbStems },
  { s: 'ぬ', name: 'classical negative (ぬ)', gen: verbStems },
  { s: 'れば', name: 'conditional (ば)', gen: verbStems },
  { s: 'おう', name: 'volitional', gen: st => kanaMorphs(st).flatMap(m => U_COL.map(u => m + u)) },
  { s: 'よう', name: 'volitional', gen: verbStems },
  { s: 'って', name: 'te-form', gen: st => kanaMorphs(st).flatMap(m => [m + 'つ', m + 'る', m + 'う', m + 'く']) },
  { s: 'いで', name: 'te-form', gen: verbStems },
  { s: 'んで', name: 'te-form', gen: st => [st + 'む', st + 'ぶ', st + 'ぬ', ...kanaMorphs(st).filter(m => m !== st)] },
  { s: 'て', name: 'te-form', gen: verbStems },
  { s: 'で', name: 'te-form', gen: verbStems },
  { s: 'なかった', name: 'past negative', gen: verbStems },
  { s: 'ない', name: 'negative', gen: verbStems },
  { s: 'んだ', name: 'past', gen: st => [st + 'む', st + 'ぶ', st + 'ぬ', ...kanaMorphs(st).filter(m => m !== st)] },
  { s: 'いた', name: 'past', gen: verbStems },
  { s: 'った', name: 'past', gen: st => kanaMorphs(st).flatMap(m => [m + 'つ', m + 'る', m + 'う', m + 'く']) },
  { s: 'だ', name: 'past', gen: verbStems },
  { s: 'た', name: 'past', gen: verbStems },
  { s: 'ろ', name: 'imperative', gen: verbStems },
  // godan imperatives end on the え-column of the row: いけ → 行く, のめ → 飲む, だせ → 出す
  { s: 'け', name: 'imperative', gen: st => [st + 'く', ...verbStems(st)] },
  { s: 'げ', name: 'imperative', gen: st => [st + 'ぐ', ...verbStems(st)] },
  { s: 'せ', name: 'imperative', gen: st => [st + 'す', st + 'する', ...verbStems(st)] },
  { s: 'め', name: 'imperative', gen: st => [st + 'む', ...verbStems(st)] },
  { s: 'べ', name: 'imperative', gen: st => [st + 'ぶ', ...verbStems(st)] },
  { s: 'ね', name: 'imperative', gen: st => [st + 'ぬ', ...verbStems(st)] },
  { s: 'え', name: 'imperative', gen: st => [...verbStems(st), ...U_COL.map(u => st + u)] },
];

const RULES_SORTED = [...RULES].sort((a, b) => b.s.length - a.s.length);

// ---------- BFS deconjugation over kana ----------
interface Node { s: string; chain: string[]; }

function deconjugateKana(q: string, limit = 8): DeinflectedMatch[] {
  ensureMaps();
  const hits: DeinflectedMatch[] = [];
  const seen = new Set<string>([q]);
  const direct = READING_MAP!.get(q);
  if (direct) for (const w of direct) hits.push({ word: w, chain: '', form: q });
  // depth-0: query may itself be a stem (かき → 書く, たべ → 食べる)
  for (const cand of verbStems(q)) {
    if (seen.has(cand)) continue;
    seen.add(cand);
    const arr = READING_MAP!.get(cand);
    if (arr) for (const w of arr) hits.push({ word: w, chain: 'stem', form: cand });
  }
  let frontier: Node[] = [{ s: q, chain: [] }];
  for (let depth = 1; depth <= 3 && frontier.length && hits.length < limit * 3; depth++) {
    const next: Node[] = [];
    for (const node of frontier) {
      for (const rule of RULES_SORTED) {
        if (!node.s.endsWith(rule.s) || node.s.length <= rule.s.length) continue;
        const stem = node.s.slice(0, node.s.length - rule.s.length);
        for (const cand of rule.gen(stem)) {
          if (!cand || seen.has(cand)) continue;
          seen.add(cand);
          const chain = [...node.chain, rule.name];
          const arr = READING_MAP!.get(cand);
          if (arr) for (const w of arr) hits.push({ word: w, chain: chain.join(' · '), form: cand });
          if (hits.length < limit * 6) next.push({ s: cand, chain });
        }
      }
    }
    frontier = next;
  }
  // rank: shortest chain first, then frequency
  hits.sort((a, b) => a.chain.split(' · ').length - b.chain.split(' · ').length || (a.word.f ?? 99999) - (b.word.f ?? 99999));
  // dedupe by word id, keep best chain
  const out: DeinflectedMatch[] = [];
  const usedIds = new Set<number>();
  for (const h of hits) {
    if (usedIds.has(h.word.id) || out.length >= limit) continue;
    usedIds.add(h.word.id);
    out.push(h);
  }
  return out;
}

// ---------- kanji surface path (食べました → 食べる) ----------
/** longest common suffix between kanji form and reading (tail alignment) */
function commonSuffix(k: string, r: string): number {
  let n = 0;
  while (n < k.length && n < r.length && k[k.length - 1 - n] === r[r.length - 1 - n]) n++;
  return n;
}

function deconjugateSurface(q: string, limit = 4): DeinflectedMatch[] {
  ensureMaps();
  const bucket = KANJI_BY_FIRST!.get(q[0]);
  if (!bucket) return [];
  const hits: DeinflectedMatch[] = [];
  for (const w of bucket) {
    if (!w.k || w.k.length < 2 || w.a.length === 0) continue;
    const r = toHira(w.a[0]);
    if (!r) continue;
    const cs = commonSuffix(w.k, r);
    const kanjiPrefix = w.k.slice(0, w.k.length - cs);
    if (kanjiPrefix.length < 1 || !q.startsWith(kanjiPrefix) || q === w.k) continue;
    const remainder = q.slice(kanjiPrefix.length);
    if (!remainder) continue;
    const readingEquivalent = r.slice(0, r.length - cs) + remainder;
    // generous sub-limit: ranking is chain-length-first, so shallow false matches
    // (はし → 橋) must not crowd out the deeper correct chain (走って → 走る)
    const sub = deconjugateKana(readingEquivalent, 6);
    for (const m of sub) {
      if (m.word.id === w.id) hits.push({ word: w, chain: m.chain, form: q });
    }
    if (hits.length >= limit) break;
  }
  return hits;
}

// ---------- public API ----------
/** Normalize any input script to hiragana for deconjugation (romaji → kana too) */
function normalize(q: string): string {
  let s = q.trim();
  if (!s) return '';
  if (!hasJapanese(s)) {
    const h = romajiToHira(s.toLowerCase());
    return h || s.toLowerCase();
  }
  if (isKata(s)) s = toHira(s);
  return s;
}

/**
 * Deconjugate an inflected form to its dictionary entries.
 * Handles kana, romaji ("tabemasu"), katakana and kanji surface forms (食べました).
 */
export function deconjugate(query: string, limit = 6): DeinflectedMatch[] {
  const q = normalize(query);
  if (!q || q.length < 2) return [];
  const out = deconjugateKana(q, limit);
  if (hasJapanese(query) && out.length < limit) {
    const surf = deconjugateSurface(q, Math.max(0, limit - out.length));
    for (const s of surf) if (!out.some(o => o.word.id === s.word.id)) out.push(s);
  }
  return out;
}
