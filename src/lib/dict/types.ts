// Bunsan Jisho — core dictionary type contracts
// Dataset modules in src/lib/data/ must conform to these types exactly.

export type JlptLevel = 5 | 4 | 3 | 2 | 1;

export interface Sense {
  /** part-of-speech codes: n, v1, v5, vs, vk, adj-i, adj-na, adv, exp, int, pn, ctr, num, conj, aux, prt */
  pos?: string[];
  /** English gloss */
  gloss: string;
  /** sense-level hints e.g. "usually kana", "polite", "slang" */
  tags?: string[];
}

export interface WordEntry {
  /** unique numeric id */
  id: number;
  /** main written form (kanji) — "" if kana-only word */
  k: string;
  /** readings in hiragana (first is primary) */
  a: string[];
  /** alternate written kanji forms */
  alt?: string[];
  /** senses (glosses) */
  s: Sense[];
  /** JLPT level, 5 = beginner … 1 = advanced */
  j?: JlptLevel;
  /** frequency rank (lower = more common) */
  f?: number;
  /** pitch accent: "0" heiban, "1" atamadaka, "3" nakadaka(3rd mora down), "-1" odaka; "3;0" = variants */
  p?: string;
  /** content tags e.g. ["food","verb"] */
  t?: string[];
  /** related word ids */
  rel?: number[];
  /** antonym word ids */
  ant?: number[];
}

export interface KanjiEntry {
  /** the kanji character itself */
  c: string;
  /** stroke count */
  st: number;
  /** main radical character */
  r: string;
  /** grade: 1-6 school, 8 junior-high (jouyou advanced) */
  g?: number;
  /** JLPT level */
  j?: JlptLevel;
  /** meanings */
  m: string[];
  /** on'yomi in KATAKANA */
  on: string[];
  /** kun'yomi in hiragana; okurigana after "-" e.g. "た-べる"; "." = okurigana in middle */
  kun: string[];
  /** component radicals (chars) */
  rd: string[];
  /** frequency rank 1..2501 (lower = more common) */
  f?: number;
  /** nanori (name readings) */
  nn?: string[];
}

/** Raw generated kanji entries — readings/decomposition optional before normalization at aggregation */
export interface KanjiEntryRaw {
  c: string;
  st: number;
  r: string;
  g?: number;
  j?: JlptLevel;
  m: string[];
  on?: string[];
  kun?: string[];
  rd?: string[];
  f?: number;
  nn?: string[];
}

export interface SentenceEntry {
  id: number;
  ja: string;
  en: string;
  j?: JlptLevel;
  t?: string[];
}

export interface RadicalEntry {
  /** radical character (or katakana fallback form) */
  c: string;
  /** stroke count */
  st: number;
  /** meanings */
  m: string[];
  /** alternate names e.g. "bo","rope" */
  a?: string[];
}

export interface ExpressionEntry {
  id: number;
  /** the expression / proverb / greeting */
  expr: string;
  /** reading in hiragana */
  rd: string;
  /** meaning */
  m: string;
  /** type tag: proverb, idiom, greeting, saying */
  t?: string[];
  j?: JlptLevel;
}

export interface GrammarEntry {
  id: number;
  /** the pattern as written, e.g. "〜たことがある" */
  p: string;
  /** romaji of the pattern core, e.g. "ta koto ga aru" */
  rom: string;
  /** English meaning */
  m: string;
  /** how to form it, e.g. "verb (past) + ことがある" */
  form: string;
  /** example sentences */
  ex: Array<{ ja: string; en: string }>;
  /** usage note / nuance / register */
  note?: string;
  /** type tag: particle, conjunction, auxiliary, structure, sentence-ending, honorific, comparison, aspect */
  t?: string[];
  j?: JlptLevel;
}
