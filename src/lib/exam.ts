// Bunsan Jisho — JLPT mock exam engine (模試)
// Builds section-based, timed exam papers from the dictionary corpus.
import type { JlptLevel } from './dict/types';
import { WORDS, KANJI, SENTENCES, verbClass, wordByText } from './dict/index';
import { conjugate } from './dict/conjugate';
import { shuffle } from './client';

export interface ExamQuestion {
  prompt: string;
  promptSub?: string;
  choices: string[];
  answer: string;
  speakText?: string;
  /** short label shown in results, e.g. "kanji reading" */
  tag: string;
}

export interface ExamSection {
  id: string;
  jp: string;
  en: string;
  questions: ExamQuestion[];
  /** seconds allowed for this section */
  seconds: number;
  /** max points (official-style: 60 per section) */
  points: number;
}

export interface ExamPaper {
  level: JlptLevel;
  sections: ExamSection[];
  totalQuestions: number;
  totalSeconds: number;
  passMark: number;
}

/** Official-style minimum overall scores (out of 180) */
export const PASS_MARKS: Record<JlptLevel, number> = { 5: 80, 4: 90, 3: 95, 2: 90, 1: 100 };

export const LEVEL_LABELS: Record<JlptLevel, string> = {
  5: 'N5 — Beginner', 4: 'N4 — Elementary', 3: 'N3 — Intermediate', 2: 'N2 — Upper-Int.', 1: 'N1 — Advanced',
};

const PLAN: Record<JlptLevel, { vocab: number; grammar: number; reading: number }> = {
  5: { vocab: 12, grammar: 8, reading: 6 },
  4: { vocab: 14, grammar: 10, reading: 7 },
  3: { vocab: 16, grammar: 12, reading: 8 },
  2: { vocab: 18, grammar: 13, reading: 9 },
  1: { vocab: 20, grammar: 14, reading: 10 },
};

// ---------------- curated particle bank (grammar cloze) ----------------
interface ParticleQ { level: JlptLevel; ja: string; blank: string; choices: string[]; en: string; }
const PARTICLE_BANK: ParticleQ[] = [
  { level: 5, ja: '私＿学生です。', blank: 'は', choices: ['は', 'が', 'を', 'に'], en: 'I am a student.' },
  { level: 5, ja: '朝ご飯＿食べます。', blank: 'を', choices: ['を', 'が', 'に', 'で'], en: 'I eat breakfast.' },
  { level: 5, ja: '7時＿起きます。', blank: 'に', choices: ['に', 'で', 'を', 'と'], en: 'I get up at 7 o\u2019clock.' },
  { level: 5, ja: '図書館＿勉強します。', blank: 'で', choices: ['で', 'に', 'を', 'は'], en: 'I study at the library.' },
  { level: 5, ja: '学校＿行きます。', blank: 'へ', choices: ['へ', 'を', 'が', 'で'], en: 'I go to school.' },
  { level: 5, ja: '友達＿話します。', blank: 'と', choices: ['と', 'を', 'に', 'で'], en: 'I talk with a friend.' },
  { level: 5, ja: 'これ＿あれ、どちらがいいですか。', blank: 'と', choices: ['と', 'や', 'は', 'も'], en: 'Which is better, this or that?' },
  { level: 4, ja: '机の上＿本があります。', blank: 'に', choices: ['に', 'で', 'を', 'へ'], en: 'There is a book on the desk.' },
  { level: 4, ja: '日本語＿英語どちらが難しいですか。', blank: 'と', choices: ['と', 'が', 'は', 'を'], en: 'Which is harder, Japanese or English?' },
  { level: 4, ja: '雨＿降りそうです。', blank: 'が', choices: ['が', 'を', 'に', 'で'], en: 'It looks like it will rain.' },
  { level: 4, ja: '肉＿＿野菜を買いました。', blank: 'とか', choices: ['とか', 'など', 'から', 'でも'], en: 'I bought meat, vegetables and so on.' },
  { level: 3, ja: '彼＿＿来ても、会議は始まりません。', blank: 'が', choices: ['が', 'を', 'に', 'で'], en: 'Even if he comes, the meeting won\u2019t start.' },
  { level: 3, ja: '病気＿＿学校を休みました。', blank: 'で', choices: ['で', 'に', 'を', 'が'], en: 'I was absent from school because of illness.' },
  { level: 3, ja: '3時＿＿帰らなければなりません。', blank: 'までに', choices: ['までに', 'まで', 'に', 'から'], en: 'I must go home by 3 o\u2019clock.' },
  { level: 2, ja: '努力＿＿、成功はあり得ない。', blank: 'なしに', choices: ['なしに', 'なくて', 'ないで', 'ぬきで'], en: 'Without effort, success is impossible.' },
  { level: 2, ja: '天気＿＿かかわらず、試合は行われた。', blank: 'に', choices: ['に', 'を', 'の', 'で'], en: 'Despite the weather, the game was held.' },
  { level: 2, ja: '彼は来る＿＿、すべて準備してくれた。', blank: 'まえに', choices: ['まえに', 'うちに', 'あとで', 'ばかり'], en: 'He prepared everything before I came.' },
  { level: 1, ja: '事故＿＿、電車が止まってしまった。', blank: 'のため', choices: ['のため', 'のせいに', 'にして', 'をもって'], en: 'The trains stopped due to an accident.' },
  { level: 1, ja: '練習＿＿練習を重ねて、ようやく上達した。', blank: 'に', choices: ['に', 'を', 'が', 'で'], en: 'Practice upon practice, and finally I improved.' },
  { level: 1, ja: '周囲の反対＿＿かねない決断だった。', blank: 'もあり得る', choices: ['もあり得る', 'しかねる', 'かねない', '得ない'], en: 'It was a decision that could even face opposition.' },
];

// ---------------- helpers ----------------
function pick<T>(arr: T[], n: number): T[] { return shuffle(arr).slice(0, n); }

function plausibleReadings(correct: string, pool: string[]): string[] {
  const cands = pool.filter(r => r !== correct && Math.abs(r.length - correct.length) <= 2);
  return pick(cands.length >= 3 ? cands : pool.filter(r => r !== correct), 3);
}

function wordPool(level: JlptLevel): typeof WORDS {
  const exact = WORDS.filter(w => w.j === level);
  if (exact.length >= 120) return exact;
  // widen: level and one step easier
  const easier = level < 5 ? WORDS.filter(w => w.j === (level + 1) as JlptLevel) : [];
  const merged = [...exact, ...easier];
  return merged.length >= 120 ? merged : WORDS;
}

function kanjiPool(level: JlptLevel): typeof KANJI {
  const exact = KANJI.filter(k => k.j === level);
  if (exact.length >= 80) return exact;
  const easier = level < 5 ? KANJI.filter(k => k.j === (level + 1) as JlptLevel) : [];
  const merged = [...exact, ...easier];
  return merged.length >= 80 ? merged : KANJI;
}

// ---------------- question generators ----------------
function qKanjiReading(level: JlptLevel): ExamQuestion | null {
  const pool = wordPool(level).filter(w => w.k && w.k.length <= 4 && w.a[0]);
  const w = pick(pool, 1)[0];
  if (!w) return null;
  const readings = wordPool(level).map(x => x.a[0]).filter(Boolean);
  const distractors = plausibleReadings(w.a[0], readings);
  if (distractors.length < 3) return null;
  return {
    prompt: w.k!, promptSub: ' ____ の読み方として最もよいものを一つ選んでください。',
    choices: shuffle([w.a[0], ...distractors]), answer: w.a[0], speakText: w.k!, tag: 'kanji reading',
  };
}

function qOrthography(level: JlptLevel): ExamQuestion | null {
  const pool = wordPool(level).filter(w => w.k && w.k.length <= 4);
  const w = pick(pool, 1)[0];
  if (!w) return null;
  // plausible: same reading length, prefer sharing one kana
  const cands = pool.filter(x => x.id !== w.id && x.k && x.a[0] === w.a[0] ? false : x.k && Math.abs(x.a[0].length - w.a[0].length) <= 1);
  const share = cands.filter(x => [...x.a[0]].some(ch => w.a[0].includes(ch)));
  const forms = pick(share.length >= 3 ? share : cands, 3).map(x => x.k!);
  if (forms.length < 3) return null;
  return {
    prompt: `${w.a[0]}`, promptSub: '____ の言葉はどう書きますか。最もよいものを一つ選んでください。',
    choices: shuffle([w.k!, ...forms]), answer: w.k!, speakText: w.a[0], tag: 'orthography',
  };
}

function qWordMeaning(level: JlptLevel): ExamQuestion | null {
  const pool = wordPool(level);
  const w = pick(pool, 1)[0];
  if (!w) return null;
  const gloss = w.s[0]?.gloss || '?';
  const distractors = pick(WORDS.filter(x => x.id !== w.id), 3).map(x => x.s[0]?.gloss || '?');
  if (new Set([gloss, ...distractors]).size < 4) return null;
  return { prompt: w.k || w.a[0], promptSub: w.a[0], choices: shuffle([gloss, ...distractors]), answer: gloss, speakText: w.k || w.a[0], tag: 'word meaning' };
}

function qSentenceCloze(level: JlptLevel): ExamQuestion | null {
  const pool = SENTENCES.filter(s => s.j === level);
  const src = pool.length >= 10 ? pool : SENTENCES;
  for (const s of pick(src, 6)) {
    const tokens = [...new Set(s.ja.match(/[\u4e00-\u9faf々\u3040-\u309f]{2,}/g) || [])];
    const matched = tokens.map(t => wordByText.get(t)).filter(Boolean);
    const target = matched[Math.floor(Math.random() * matched.length)];
    if (!target?.k) continue;
    const others = pick(WORDS.filter(w => w.k && w.k !== target.k), 3).map(w => w.k!);
    if (others.length < 3) continue;
    return { prompt: s.ja.replace(target.k, '＿＿'), promptSub: s.en, choices: shuffle([target.k!, ...others]), answer: target.k!, tag: 'context cloze' };
  }
  return null;
}

function qParticle(level: JlptLevel): ExamQuestion | null {
  const bank = PARTICLE_BANK.filter(p => p.level === level || (level <= 3 ? p.level >= level : p.level <= level));
  const pool = bank.length ? bank : PARTICLE_BANK;
  const q = pick(pool, 1)[0];
  if (!q) return null;
  return { prompt: q.ja.replace(q.blank, '＿＿'), promptSub: q.en, choices: shuffle(q.choices), answer: q.blank, tag: 'particle' };
}

function qConjugation(level: JlptLevel): ExamQuestion | null {
  const pool = wordPool(level).filter(w => verbClass(w));
  const src = pool.length >= 10 ? pool : WORDS.filter(w => verbClass(w));
  for (const w of pick(src, 4)) {
    const c = conjugate(w);
    if (!c || c.forms.length < 4) continue;
    const candidates = c.forms.filter(f => f.form && f.form !== w.a[0]);
    if (candidates.length < 4) continue;
    const target = candidates[Math.floor(Math.random() * candidates.length)];
    const sameForms = shuffle(c.forms.filter(f => f.form !== target.form && f.form && f.form !== w.a[0])).slice(0, 2).map(f => f.form);
    const others = pick(WORDS.filter(x => x.id !== w.id && verbClass(x) && x.a[0] !== w.a[0]), 20)
      .map(x => conjugate(x)).filter(xc => xc)
      .map(xc => xc!.forms.find(f => f.name === target.name && f.form !== target.form)?.form)
      .filter((f): f is string => !!f);
    const distractors = [...new Set([...sameForms, ...others])].slice(0, 3);
    if (distractors.length < 3) continue;
    return { prompt: w.k || w.a[0], promptSub: `${w.a[0]} — give the ${target.name.toLowerCase()}`, choices: shuffle([target.form, ...distractors]), answer: target.form, speakText: w.k || w.a[0], tag: 'conjugation' };
  }
  return null;
}

function qSentenceMeaning(level: JlptLevel): ExamQuestion | null {
  const pool = SENTENCES.filter(s => s.j === level);
  const minLen = level <= 4 ? 0 : 14;
  const src = (pool.length >= 10 ? pool : SENTENCES).filter(s => s.ja.length >= minLen);
  const s = pick(src.length ? src : SENTENCES, 1)[0];
  if (!s) return null;
  const distractors = pick(SENTENCES.filter(x => x.id !== s.id), 3).map(x => x.en);
  if (new Set([s.en, ...distractors]).size < 4) return null;
  return { prompt: s.ja, promptSub: 'この文の意味として最もよいものを選んでください。', choices: shuffle([s.en, ...distractors]), answer: s.en, speakText: s.ja, tag: 'reading' };
}

function fillUnique(gens: Array<() => ExamQuestion | null>, n: number, used: Set<string>): ExamQuestion[] {
  const out: ExamQuestion[] = [];
  let guard = 0;
  while (out.length < n && guard < n * 40) {
    guard++;
    const q = gens[guard % gens.length]();
    if (!q || used.has(q.prompt)) continue;
    used.add(q.prompt);
    out.push(q);
  }
  return out;
}

/** Build a full mock-exam paper for a JLPT level. */
export function buildExam(level: JlptLevel): ExamPaper {
  const plan = PLAN[level];
  const used = new Set<string>();

  const vocab = fillUnique(
    [() => qKanjiReading(level), () => qOrthography(level), () => qWordMeaning(level), () => qSentenceCloze(level)],
    plan.vocab, used,
  );
  const grammar = fillUnique(
    [() => qParticle(level), () => qConjugation(level), () => qSentenceCloze(level)],
    plan.grammar, used,
  );
  const reading = fillUnique([() => qSentenceMeaning(level)], plan.reading, used);

  const round30 = (s: number) => Math.max(60, Math.round(s / 30) * 30);
  const sections: ExamSection[] = [
    {
      id: 'vocab', jp: '言語知識・語彙', en: 'Vocabulary', questions: vocab,
      seconds: round30(vocab.length * 25), points: 60,
    },
    {
      id: 'grammar', jp: '言語知識・文法', en: 'Grammar', questions: grammar,
      seconds: round30(grammar.length * 30), points: 60,
    },
    {
      id: 'reading', jp: '読解', en: 'Reading Comprehension', questions: reading,
      seconds: round30(reading.length * 45), points: 60,
    },
  ].filter(s => s.questions.length > 0);

  return {
    level,
    sections,
    totalQuestions: sections.reduce((a, s) => a + s.questions.length, 0),
    totalSeconds: sections.reduce((a, s) => a + s.seconds, 0),
    passMark: PASS_MARKS[level],
  };
}

export function formatClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
