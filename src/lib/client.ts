'use client';
// Client-side helpers: TTS, exports, shared hooks
import { useCallback } from 'react';
import { speakWithUncloseAI } from './uncloseai';

// ---------------- TTS ----------------
export function useSpeak() {
  return useCallback(async (text: string, rate = 1) => {
    if (!text) return;

    try {
      await speakWithUncloseAI(text);
    } catch {
      // Browser-native fallback keeps speech useful even if the external AI service is unavailable.
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'ja-JP';
        u.rate = rate;
        window.speechSynthesis.speak(u);
      } catch {
        // noop
      }
    }
  }, []);
}

// ---------------- Exports ----------------
export function downloadFile(content: string, filename: string, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
}

export function toCsv(rows: (string | number)[][]): string {
  return rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
}

export function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(text).then(() => true, () => false);
  }
  return Promise.resolve(false);
}

// ---------------- misc ----------------
export function todayKey(now = Date.now()): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function dayKeyOffset(offsetDays: number, now = Date.now()): string {
  const d = new Date(now);
  d.setDate(d.getDate() + offsetDays);
  return todayKey(d.getTime());
}

export function clamp(n: number, min: number, max: number) { return Math.min(max, Math.max(min, n)); }

export function shuffle<T>(arr: T[], seed = Date.now()): T[] {
  const a = [...arr];
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
