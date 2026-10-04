'use client';
// Watches study/library stores and fires a toast the first time each achievement unlocks.
import { useEffect, useMemo, useRef } from 'react';
import { toast } from '@/hooks/use-toast';
import { useStudy, useLibrary } from '@/lib/stores';
import { ACHIEVEMENTS, evaluateAchievements } from '@/lib/achievements';

const SEEN_KEY = 'bunsan-ach-seen';

function loadSeen(): string[] {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'); } catch { return []; }
}

export function AchievementWatcher() {
  const cards = useStudy(s => s.cards);
  const reviewLog = useStudy(s => s.reviewLog);
  const quizLog = useStudy(s => s.quizLog);
  const activity = useStudy(s => s.activity);
  const library = useLibrary();
  // seen achievements live in a ref: they never affect rendering, only toast side-effects
  const seenRef = useRef<string[] | null>(null);

  const ctx = useMemo(() => ({
    cards, reviewLog, quizLog, activity,
    favoritesCount: library.favorites.words.length + library.favorites.kanji.length + library.favorites.sentences.length,
    listsCount: library.lists.length,
    listItems: library.lists.reduce((a, l) => a + l.wordIds.length + l.kanjiChars.length + l.sentenceIds.length, 0),
    tagsCount: library.tags.length,
    notesCount: Object.values(library.notes).filter(n => n.text).length,
    searches: library.history.length,
  }), [cards, reviewLog, quizLog, activity, library]);

  const unlocked = useMemo(() => evaluateAchievements(ctx), [ctx]);

  useEffect(() => {
    if (seenRef.current === null) seenRef.current = loadSeen();
    const seen = seenRef.current;
    const fresh = ACHIEVEMENTS.filter(a => unlocked[a.id] && !seen.includes(a.id));
    if (fresh.length === 0) return;
    const tierLabel: Record<string, string> = { bronze: '🥉', silver: '🥈', gold: '🥇', platinum: '💎' };
    fresh.forEach((a, i) => {
      setTimeout(() => toast({
        title: `Achievement unlocked · ${a.icon} ${a.name}`,
        description: `${tierLabel[a.tier]} ${a.jp} — ${a.description}`,
        duration: 6000,
      }), i * 500);
    });
    seenRef.current = [...seen, ...fresh.map(a => a.id)];
    try { localStorage.setItem(SEEN_KEY, JSON.stringify(seenRef.current)); } catch { /* noop */ }
  }, [unlocked]);

  return null;
}
