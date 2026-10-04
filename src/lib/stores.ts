// Zustand stores with localStorage persistence
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SrsCard, ReviewLogEntry } from './srs';
import { newCard, review } from './srs';

// ---------------- UI store (session) ----------------
export type ViewId = 'dashboard' | 'words' | 'kanji' | 'radicals' | 'sentences' | 'expressions' | 'grammar' | 'annotator' | 'conjugator' | 'tutor' | 'study' | 'quizzes' | 'kana' | 'lists' | 'stats' | 'settings' | 'about';

interface UiState {
  view: ViewId;
  globalQuery: string;
  paletteOpen: boolean;
  detailWordId: number | null;
  detailKanji: string | null;
  detailSentenceId: number | null;
  /** dictionary context to attach to the next AI tutor message ("Ask AI about this word") */
  tutorContext: { title: string; detail: string; prompt: string } | null;
  /** pre-select a quiz mode when navigating from drill recommendations */
  quizPreset: string | null;
  /** pre-select a JLPT level filter in the Words view (from dashboard coverage rows) */
  wordsJlptPreset: string | null;
  setView: (v: ViewId) => void;
  setQuery: (q: string) => void;
  setPalette: (open: boolean) => void;
  openWord: (id: number | null) => void;
  openKanji: (c: string | null) => void;
  openSentence: (id: number | null) => void;
  setTutorContext: (c: { title: string; detail: string; prompt: string } | null) => void;
  setQuizPreset: (q: string | null) => void;
  setWordsJlptPreset: (l: string | null) => void;
}

export const useUi = create<UiState>((set) => ({
  view: 'dashboard',
  globalQuery: '',
  paletteOpen: false,
  detailWordId: null,
  detailKanji: null,
  detailSentenceId: null,
  tutorContext: null,
  quizPreset: null,
  wordsJlptPreset: null,
  setView: (view) => set({ view, paletteOpen: false }),
  setQuery: (globalQuery) => set({ globalQuery }),
  setPalette: (paletteOpen) => set({ paletteOpen }),
  openWord: (detailWordId) => {
    set({ detailWordId });
    if (detailWordId != null) useLibrary.getState().pushView('words', detailWordId);
  },
  openKanji: (detailKanji) => {
    set({ detailKanji });
    if (detailKanji != null) useLibrary.getState().pushView('kanji', detailKanji);
  },
  openSentence: (detailSentenceId) => {
    set({ detailSentenceId });
    if (detailSentenceId != null) useLibrary.getState().pushView('sentences', detailSentenceId);
  },
  setTutorContext: (tutorContext) => set({ tutorContext }),
  setQuizPreset: (quizPreset) => set({ quizPreset }),
  setWordsJlptPreset: (wordsJlptPreset) => set({ wordsJlptPreset }),
}));

// ---------------- Settings store ----------------
export type FuriganaMode = 'always' | 'hover' | 'never';
export interface Settings {
  accent: 'sakura' | 'shu' | 'matcha' | 'yamabuki' | 'sumire' | 'cha';
  fontSize: 'sm' | 'md' | 'lg' | 'xl';
  density: 'compact' | 'comfortable';
  showRomaji: boolean;
  showFurigana: boolean;
  /** furigana display mode — showFurigana is kept in sync for backwards compatibility */
  furiganaMode: FuriganaMode;
  showJlpt: boolean;
  autoPlayTts: boolean;
  jpFont: 'sans' | 'serif' | 'mincho';
  newPerDay: number;
  maxReviewsPerDay: number;
  dailyGoal: number;
  srsMode: 'fw' | 'rf' | 'mixed';
  learningSteps: 'default' | 'fast' | 'intensive';
  animations: boolean;
}

interface SettingsState extends Settings {
  update: (p: Partial<Settings>) => void;
}

export const DEFAULT_SETTINGS: Settings = {
  accent: 'sakura',
  fontSize: 'md',
  density: 'comfortable',
  showRomaji: true,
  showFurigana: true,
  furiganaMode: 'always',
  showJlpt: true,
  autoPlayTts: false,
  jpFont: 'sans',
  newPerDay: 12,
  maxReviewsPerDay: 80,
  dailyGoal: 20,
  srsMode: 'fw',
  learningSteps: 'default',
  animations: true,
};

export const useSettings = create<SettingsState>()(persist(
  (set) => ({
    ...DEFAULT_SETTINGS,
    update: (p) => {
      // keep the legacy boolean in sync when the furigana mode changes
      set(p.furiganaMode !== undefined ? { ...p, showFurigana: p.furiganaMode !== 'never' } : p);
    },
  }),
  { name: 'bunsan-settings' }
));

/** Resolve the effective furigana mode, honouring pre-furiganaMode persisted state */
export function furiMode(s: Pick<Settings, 'furiganaMode' | 'showFurigana'>): FuriganaMode {
  return s.furiganaMode ?? (s.showFurigana ? 'always' : 'never');
}

// ---------------- Library store (lists, tags, notes, saved searches, history) ----------------
export interface StudyList {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  wordIds: number[];
  kanjiChars: string[];
  sentenceIds: number[];
}

export interface TagDef { name: string; color: string; }
export interface NoteEntry { key: string; text: string; updatedAt: number; }
export interface SavedSearch { id: string; name: string; query: string; kind: 'words' | 'kanji' | 'sentences'; filters?: Record<string, unknown>; createdAt: number; }
export interface HistoryEntry { q: string; kind: 'words' | 'kanji' | 'sentences'; ts: number; }
export interface ViewHistoryEntry { kind: 'words' | 'kanji' | 'sentences'; id: string; ts: number; }

export interface LibraryState {
  lists: StudyList[];
  tags: TagDef[];
  notes: Record<string, NoteEntry>;
  savedSearches: SavedSearch[];
  history: HistoryEntry[];
  /** recently viewed dictionary entries (persists across sessions) */
  viewHistory: ViewHistoryEntry[];
  favorites: { words: number[]; kanji: string[]; sentences: number[]; grammar: number[] };
  entryTags: Record<string, string[]>;
  createList: (name: string, description?: string) => StudyList;
  deleteList: (id: string) => void;
  renameList: (id: string, name: string, description?: string) => void;
  addToList: (listId: string, kind: 'w' | 'k' | 's', id: string | number) => void;
  removeFromList: (listId: string, kind: 'w' | 'k' | 's', id: string | number) => void;
  addTag: (name: string, color: string) => void;
  deleteTag: (name: string) => void;
  tagEntry: (key: string, tag: string) => void;
  untagEntry: (key: string, tag: string) => void;
  setNote: (key: string, text: string) => void;
  saveSearch: (name: string, query: string, kind: 'words' | 'kanji' | 'sentences', filters?: Record<string, unknown>) => void;
  deleteSavedSearch: (id: string) => void;
  pushHistory: (q: string, kind: 'words' | 'kanji' | 'sentences') => void;
  clearHistory: () => void;
  pushView: (kind: 'words' | 'kanji' | 'sentences', id: string | number) => void;
  clearViewHistory: () => void;
  toggleFavorite: (kind: 'words' | 'kanji' | 'sentences' | 'grammar', id: string | number) => void;
  importData: (json: string) => boolean;
}

const PALETTE = ['#e46a8b', '#d05a4e', '#3f8f6b', '#b8860b', '#7d5ba6', '#2a9d8f', '#bc4b51', '#8a9a5b', '#c97b63', '#5c7fa3'];

export const useLibrary = create<LibraryState>()(persist(
  (set, get) => ({
    lists: [{ id: 'core', name: 'Core Vocabulary', description: 'Starter list', createdAt: Date.now(), wordIds: [], kanjiChars: [], sentenceIds: [] }],
    tags: [],
    notes: {},
    savedSearches: [],
    history: [],
    viewHistory: [],
    favorites: { words: [], kanji: [], sentences: [], grammar: [] },
    entryTags: {},
    createList: (name, description = '') => {
      const list: StudyList = { id: `l-${Date.now()}`, name, description, createdAt: Date.now(), wordIds: [], kanjiChars: [], sentenceIds: [] };
      set({ lists: [...get().lists, list] });
      return list;
    },
    deleteList: (id) => set({ lists: get().lists.filter(l => l.id !== id) }),
    renameList: (id, name, description) => set({ lists: get().lists.map(l => l.id === id ? { ...l, name, description: description ?? l.description } : l) }),
    addToList: (listId, kind, id) => set({
      lists: get().lists.map(l => {
        if (l.id !== listId) return l;
        if (kind === 'w') return { ...l, wordIds: l.wordIds.includes(Number(id)) ? l.wordIds : [...l.wordIds, Number(id)] };
        if (kind === 'k') return { ...l, kanjiChars: l.kanjiChars.includes(String(id)) ? l.kanjiChars : [...l.kanjiChars, String(id)] };
        return { ...l, sentenceIds: l.sentenceIds.includes(Number(id)) ? l.sentenceIds : [...l.sentenceIds, Number(id)] };
      }),
    }),
    removeFromList: (listId, kind, id) => set({
      lists: get().lists.map(l => {
        if (l.id !== listId) return l;
        if (kind === 'w') return { ...l, wordIds: l.wordIds.filter(x => x !== Number(id)) };
        if (kind === 'k') return { ...l, kanjiChars: l.kanjiChars.filter(x => x !== String(id)) };
        return { ...l, sentenceIds: l.sentenceIds.filter(x => x !== Number(id)) };
      }),
    }),
    addTag: (name, color) => { if (!get().tags.find(t => t.name === name)) set({ tags: [...get().tags, { name, color }] }); },
    deleteTag: (name) => set({ tags: get().tags.filter(t => t.name !== name) }),
    tagEntry: (key, tag) => set({ entryTags: { ...get().entryTags, [key]: [...new Set([...(get().entryTags[key] || []), tag])] } }),
    untagEntry: (key, tag) => set({ entryTags: { ...get().entryTags, [key]: (get().entryTags[key] || []).filter(t => t !== tag) } }),
    setNote: (key, text) => set({ notes: { ...get().notes, [key]: { key, text, updatedAt: Date.now() } } }),
    saveSearch: (name, query, kind, filters) => set({ savedSearches: [...get().savedSearches, { id: `ss-${Date.now()}`, name, query, kind, filters, createdAt: Date.now() }] }),
    deleteSavedSearch: (id) => set({ savedSearches: get().savedSearches.filter(s => s.id !== id) }),
    pushHistory: (q, kind) => {
      if (!q.trim()) return;
      const h = [{ q, kind, ts: Date.now() }, ...get().history.filter(x => x.q !== q)].slice(0, 100);
      set({ history: h });
    },
    clearHistory: () => set({ history: [] }),
    pushView: (kind, id) => {
      const sid = String(id);
      const v = [{ kind, id: sid, ts: Date.now() }, ...get().viewHistory.filter(x => !(x.kind === kind && x.id === sid))].slice(0, 60);
      set({ viewHistory: v });
    },
    clearViewHistory: () => set({ viewHistory: [] }),
    toggleFavorite: (kind, id) => {
      const fav = get().favorites;
      const arr = fav[kind] ?? [];
      const val = kind === 'kanji' ? String(id) : Number(id);
      const next = arr.includes(val as never) ? arr.filter(x => x !== val) : [...arr, val as never];
      set({ favorites: { ...fav, [kind]: next } });
    },
    importData: (json) => {
      try {
        const d = JSON.parse(json);
        if (d.lists) set({ lists: d.lists });
        if (d.tags) set({ tags: d.tags });
        if (d.notes) set({ notes: d.notes });
        if (d.savedSearches) set({ savedSearches: d.savedSearches });
        if (d.favorites) set({ favorites: d.favorites });
        if (d.entryTags) set({ entryTags: d.entryTags });
        if (d.viewHistory) set({ viewHistory: d.viewHistory });
        return true;
      } catch { return false; }
    },
  }),
  { name: 'bunsan-library' }
));

// ---------------- Study store (SRS cards + logs) ----------------
export interface StudyState {
  cards: Record<string, SrsCard>;
  reviewLog: ReviewLogEntry[];
  quizLog: Array<{ kind: string; correct: number; total: number; ts: number; details?: string[] }>;
  activity: Record<string, number>; // yyyy-mm-dd -> review count
  enroll: (keys: string[], mode?: 'fw' | 'rf') => void;
  unenroll: (key: string) => void;
  answer: (key: string, quality: number, timeMs: number) => void;
  logQuiz: (kind: string, correct: number, total: number, details?: string[]) => void;
  resetCard: (key: string) => void;
  importData: (json: string) => boolean;
}

function todayKey(now = Date.now()): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const useStudy = create<StudyState>()(persist(
  (set, get) => ({
    cards: {},
    reviewLog: [],
    quizLog: [],
    activity: {},
    enroll: (keys, mode = 'fw') => set(() => {
      const cards = { ...get().cards };
      for (const key of keys) if (!cards[key]) cards[key] = newCard(key, mode);
      return { cards };
    }),
    unenroll: (key) => set(() => {
      const cards = { ...get().cards };
      delete cards[key];
      return { cards };
    }),
    answer: (key, quality, timeMs) => set(() => {
      const cards = { ...get().cards };
      const log = [...get().reviewLog];
      const activity = { ...get().activity };
      const c = cards[key];
      if (!c) return {};
      const before = c.state;
      cards[key] = review(c, quality);
      log.push({ key, ts: Date.now(), quality: quality as 0, state: before, timeMs });
      if (log.length > 20000) log.splice(0, log.length - 20000);
      const t = todayKey();
      activity[t] = (activity[t] || 0) + 1;
      return { cards, reviewLog: log, activity };
    }),
    logQuiz: (kind, correct, total, details) => set(() => {
      const quizLog = [...get().quizLog, { kind, correct, total, ts: Date.now(), details }];
      if (quizLog.length > 2000) quizLog.splice(0, quizLog.length - 2000);
      const activity = { ...get().activity };
      const t = todayKey();
      activity[t] = (activity[t] || 0) + total;
      return { quizLog, activity };
    }),
    resetCard: (key) => set(() => {
      const cards = { ...get().cards };
      if (cards[key]) cards[key] = newCard(key, cards[key].mode);
      return { cards };
    }),
    importData: (json) => {
      try {
        const d = JSON.parse(json);
        if (d.cards) set({ cards: d.cards });
        if (d.reviewLog) set({ reviewLog: d.reviewLog });
        if (d.quizLog) set({ quizLog: d.quizLog });
        if (d.activity) set({ activity: d.activity });
        return true;
      } catch { return false; }
    },
  }),
  { name: 'bunsan-study' }
));

export { PALETTE };
