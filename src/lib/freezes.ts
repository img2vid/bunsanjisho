'use client';
// Streak freeze mechanic (ストリークフリーズ) — survive missed study days.
// Earn: +1 freeze for every 7-day consecutive streak milestone (bank capped at 2).
// Consume: when the previous day was missed but the streak was alive, one freeze
// patches that day so the streak survives (Anki-style vacation protection, lite).
import React from 'react';
import { toast } from '@/hooks/use-toast';

export interface FreezeState {
  count: number;
  /** highest 7-day milestone already credited */
  earnedMilestone: number;
  /** day keys (yyyy-mm-dd) protected by a spent freeze */
  used: string[];
}

const KEY = 'bunsan-freeze';
export const FREEZE_CAP = 2;

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getFreezes(): FreezeState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<FreezeState>;
      return { count: p.count || 0, earnedMilestone: p.earnedMilestone || 0, used: Array.isArray(p.used) ? p.used : [] };
    }
  } catch { /* ignore */ }
  return { count: 0, earnedMilestone: 0, used: [] };
}

function save(s: FreezeState) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
  window.dispatchEvent(new Event('bunsan-freeze-changed'));
}

function isActive(activity: Record<string, number>, key: string, s: FreezeState): boolean {
  return (activity[key] || 0) > 0 || s.used.includes(key);
}

/** Current streak length counting freeze-protected days (walks back from today). */
export function currentStreakWithFreezes(activity: Record<string, number>, s: FreezeState): number {
  let streak = 0;
  const d = new Date();
  for (;;) {
    const key = dayKey(d);
    if (isActive(activity, key, s)) streak++;
    else break;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

/**
 * Earn + consume pass. Call on app mount (catch-up) and after each review.
 * Earn: every new multiple-of-7 of the freeze-aware streak grants +1 (cap 2).
 * Consume: yesterday inactive + streak alive into yesterday + have a freeze → patch it.
 */
export function checkFreezes(activity: Record<string, number>): FreezeState {
  const s = getFreezes();

  // --- consume: yesterday missed but streak alive before it
  const yestKey = dayKey(new Date(Date.now() - 86_400_000));
  const beforeKey = dayKey(new Date(Date.now() - 2 * 86_400_000));
  if (
    s.count > 0 && !s.used.includes(yestKey) && !(activity[yestKey] > 0) &&
    isActive(activity, beforeKey, s)
  ) {
    s.count -= 1;
    s.used = [...s.used, yestKey].slice(-30);
    save(s);
    toast({ title: '❄ Streak freeze used', description: `You missed ${yestKey} — a freeze kept your streak alive (${s.count} left).` });
    return s;
  }

  // --- earn: 7-day milestones of the freeze-aware streak
  const streak = currentStreakWithFreezes(activity, s);
  const milestone = Math.floor(streak / 7);
  if (milestone > s.earnedMilestone) {
    const granted = milestone - s.earnedMilestone;
    s.count = Math.min(FREEZE_CAP, s.count + granted);
    s.earnedMilestone = milestone;
    save(s);
    toast({ title: '❄ Streak freeze earned!', description: `${streak}-day streak — banked a freeze (${s.count}/${FREEZE_CAP}).` });
  }
  return s;
}

/** React to freeze changes from anywhere (component hook). */
export function useFreezeCount(): number {
  const [count, setCount] = React.useState(0);
  React.useEffect(() => {
    const sync = () => setCount(getFreezes().count);
    Promise.resolve().then(sync);
    window.addEventListener('bunsan-freeze-changed', sync);
    return () => window.removeEventListener('bunsan-freeze-changed', sync);
  }, []);
  return count;
}

/** Freeze-aware streak + banked count, hydration-safe (updates after mount). */
export function useStreakInfo(activity: Record<string, number>, initialStreak = 0): { streak: number; freezes: number } {
  const [info, setInfo] = React.useState(() => ({ streak: initialStreak, freezes: 0 }));
  React.useEffect(() => {
    const sync = () => {
      const s = getFreezes();
      setInfo({ streak: currentStreakWithFreezes(activity, s), freezes: s.count });
    };
    Promise.resolve().then(sync);
    window.addEventListener('bunsan-freeze-changed', sync);
    return () => window.removeEventListener('bunsan-freeze-changed', sync);
  }, [activity]);
  return info;
}
