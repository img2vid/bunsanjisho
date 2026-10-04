'use client';
// Study views: SRS flashcards + Quiz Center
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/hooks/use-toast';
import {
  Play, RotateCcw, GraduationCap, Zap, CheckCircle2, XCircle, Volume2,
  Trophy, Timer, Layers, Frown, Meh, Smile, PartyPopper, Upload, Download,
  PenLine, BookA, Languages, MessageSquareText, Type, Activity, Brush, ScrollText, BookOpen,
  Repeat2, CalendarClock, History as HistoryIcon, ClipboardCheck, Flag, ChevronLeft,
  ChevronRight, Send, Headphones, Pause, AlertTriangle, BadgeCheck, SkipForward, Keyboard,
} from 'lucide-react';
import { buildExam, formatClock, PASS_MARKS, LEVEL_LABELS, type ExamPaper, type ExamQuestion } from '@/lib/exam';
import type { JlptLevel } from '@/lib/dict/types';
import { AreaChart, Area, ResponsiveContainer as RC2 } from 'recharts';
import { WORDS, KANJI, SENTENCES, EXPRESSIONS, GRAMMAR, wordById, verbClass, pitchPattern } from '@/lib/dict/index';
import { loadStrokes } from '@/lib/dict/strokes';
import { hiraToRomaji, toHira } from '@/lib/dict/convert';
import type { WordEntry, KanjiEntry, GrammarEntry } from '@/lib/dict/types';
import { FuriganaText, JlptBadge } from '../entry-cards';
import { useStudy, useSettings, useUi, useLibrary } from '@/lib/stores';
import { useSpeak, shuffle, todayKey } from '@/lib/client';
import { conjugate } from '@/lib/dict/conjugate';
import { formatInterval, buildForecast } from '@/lib/srs';
import { KanjiCard } from '../entry-cards';
import { PronunciationCheck } from './tutor';
import { StrokeOrderAnim } from '../stroke-order';
import { parseDeckCsv, matchCsvRows } from '@/lib/dict/import';
import { downloadFile } from '@/lib/client';

// ==================================================================== SRS STUDY
type SessionCard = { key: string; kind: 'w' | 'k' | 's' | 'e' | 'g' };

// ---------------- ambient sound engine (WebAudio, no assets) ----------------
function useAmbient() {
  const [kind, setKindState] = useState<'off' | 'rain' | 'brown' | 'drone'>('off');
  const [vol, setVol] = useState(0.35);
  const ref = useRef<{ ctx: AudioContext; gain: GainNode; stop: () => void } | null>(null);
  const stopAll = () => { ref.current?.stop(); try { ref.current?.ctx.close(); } catch { /* noop */ } ref.current = null; };
  const start = (k: 'rain' | 'brown' | 'drone') => {
    stopAll();
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctor();
    const gain = ctx.createGain();
    gain.gain.value = vol;
    gain.connect(ctx.destination);
    let stop: () => void = () => {};
    if (k === 'rain' || k === 'brown') {
      const len = 2 * ctx.sampleRate;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        if (k === 'brown') { last = (last + 0.02 * white) / 1.02; d[i] = last * 3.5; }
        else d[i] = white * 0.4;
      }
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
      const filter = ctx.createBiquadFilter();
      if (k === 'rain') { filter.type = 'lowpass'; filter.frequency.value = 1400; } else { filter.type = 'lowshelf'; filter.frequency.value = 400; }
      src.connect(filter); filter.connect(gain); src.start();
      stop = () => { try { src.stop(); } catch { /* noop */ } };
    } else {
      // drone: two detuned sines + gentle lowpass
      const o1 = ctx.createOscillator(); o1.frequency.value = 110; o1.type = 'sine';
      const o2 = ctx.createOscillator(); o2.frequency.value = 110.7; o2.type = 'sine';
      const o3 = ctx.createOscillator(); o3.frequency.value = 220.4; o3.type = 'triangle';
      const g3 = ctx.createGain(); g3.gain.value = 0.25;
      o1.connect(gain); o2.connect(gain); o3.connect(g3); g3.connect(gain);
      o1.start(); o2.start(); o3.start();
      stop = () => { try { o1.stop(); o2.stop(); o3.stop(); } catch { /* noop */ } };
    }
    ref.current = { ctx, gain, stop };
  };
  const setKind = (k: 'off' | 'rain' | 'brown' | 'drone') => { setKindState(k); if (k === 'off') stopAll(); else start(k); };
  const changeVol = (v: number) => { setVol(v); if (ref.current) ref.current.gain.gain.value = v; };
  useEffect(() => () => stopAll(), []);
  return { kind, setKind, vol, setVol: changeVol };
}

// ---------------- live session clock ----------------
function useElapsed(from: number, active: boolean) {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setT(Math.floor((Date.now() - from) / 1000)), 1000);
    return () => clearInterval(id);
  }, [from, active]);
  return t;
}

function fmtClock(totalSec: number): string {
  const m = Math.floor(totalSec / 60), s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// ---------------- Pomodoro focus timer (ポモドーロ・タイマー) ----------------
type PomoPhase = 'focus' | 'break' | 'long';
const POMO_RING = ['#e46a8b', '#d05a4e'];   // focus gradient stops
const POMO_RING_BREAK = ['#3f8f6b', '#2a9d8f']; // break gradient stops

function PomodoroCard({ ambient }: { ambient?: ReturnType<typeof useAmbient> }) {
  const [focusMin, setFocusMin] = useState(25);
  const [phase, setPhase] = useState<PomoPhase>('focus');
  const [left, setLeft] = useState(25 * 60);
  const [running, setRunning] = useState(false);
  const [cycles, setCycles] = useState(0);
  const [autoRain, setAutoRain] = useState(false);
  const stateRef = useRef({ phase: 'focus' as PomoPhase, focusMin, cycles, autoRain });
  useEffect(() => { stateRef.current = { phase, focusMin, cycles, autoRain }; });
  // pomodoro ↔ SRS linkage: count reviews completed during the current focus phase
  const reviewCount = useStudy(s => s.reviewLog.length);
  const focusStartCount = useRef<number | null>(null);
  const [focusReviews, setFocusReviews] = useState(0);
  useEffect(() => {
    if (focusStartCount.current === null) return;
    const n = Math.max(0, reviewCount - focusStartCount.current);
    Promise.resolve().then(() => setFocusReviews(n));
  }, [reviewCount]);

  // restore today's completed pomodoro count (async to avoid sync setState-in-effect)
  useEffect(() => {
    let alive = true;
    Promise.resolve().then(() => {
      if (!alive) return;
      try {
        const raw = localStorage.getItem('bunsan-pomodoro');
        if (raw) {
          const d = JSON.parse(raw) as { date: string; cycles: number };
          if (d.date === todayKey()) setCycles(d.cycles);
        }
      } catch { /* ignore */ }
    });
    return () => { alive = false; };
  }, []);

  const chime = useCallback(() => {
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor();
      [659.25, 830.61, 987.77].forEach((f, i) => {  // E5 · G♯5 · B5 arpeggio
        const o = ctx.createOscillator(); const g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        const t0 = ctx.currentTime + i * 0.16;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
        o.connect(g); g.connect(ctx.destination);
        o.start(t0); o.stop(t0 + 0.55);
      });
      setTimeout(() => { ctx.close().catch(() => { /* noop */ }); }, 1200);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setLeft(l => Math.max(0, l - 1)), 1000);
    return () => clearInterval(id);
  }, [running]);

  // phase completion side-effects
  useEffect(() => {
    if (left !== 0 || !running) return;
    chime();
    const s = stateRef.current;
    if (s.phase === 'focus') {
      const n = s.cycles + 1;
      const during = focusStartCount.current !== null ? Math.max(0, useStudy.getState().reviewLog.length - focusStartCount.current) : 0;
      focusStartCount.current = null;
      setCycles(n);
      try { localStorage.setItem('bunsan-pomodoro', JSON.stringify({ date: todayKey(), cycles: n })); } catch { /* ignore */ }
      const nextPhase: PomoPhase = n % 4 === 0 ? 'long' : 'break';
      setPhase(nextPhase);
      setLeft((nextPhase === 'long' ? 15 : 5) * 60);
      setRunning(true); // break auto-starts
      if (s.autoRain) ambient?.setKind('off');
      toast({ title: nextPhase === 'long' ? 'Pomodoro #4 done — long break! 🎉' : 'Focus complete — break time ☕', description: `${nextPhase === 'long' ? '15' : '5'} minute break auto-started · pomodoro #${n} logged${during > 0 ? ` · ${during} review${during === 1 ? '' : 's'} done` : ''}` });
    } else {
      setPhase('focus');
      setLeft(s.focusMin * 60);
      setRunning(false);
      toast({ title: 'Break over — お疲れ様！', description: `${s.focusMin} min focus session ready — press start when you are` });
    }
  }, [left, running, chime, ambient]);

  const total = (phase === 'focus' ? focusMin : phase === 'long' ? 15 : 5) * 60;
  const frac = 1 - left / total;
  const R = 66, C = 2 * Math.PI * R;
  const ringStops = phase === 'focus' ? POMO_RING : POMO_RING_BREAK;

  const toggleRun = () => {
    if (running) {
      setRunning(false);
      if (stateRef.current.autoRain) ambient?.setKind('off');
    } else {
      setRunning(true);
      if (stateRef.current.phase === 'focus') {
        focusStartCount.current = useStudy.getState().reviewLog.length;
        setFocusReviews(0);
        if (stateRef.current.autoRain) ambient?.setKind('rain');
      }
    }
  };
  const skipPhase = () => {  // jump to the end of the current phase WITHOUT counting a cycle
    setRunning(false);
    const s = stateRef.current;
    if (s.phase === 'focus') {
      const nextPhase: PomoPhase = s.cycles % 4 === 3 ? 'long' : 'break';
      setPhase(nextPhase); setLeft((nextPhase === 'long' ? 15 : 5) * 60);
    } else {
      setPhase('focus'); setLeft(s.focusMin * 60);
    }
    if (s.autoRain) ambient?.setKind('off');
  };
  const resetAll = () => {
    setRunning(false); setPhase('focus'); setLeft(stateRef.current.focusMin * 60);
    if (stateRef.current.autoRain) ambient?.setKind('off');
  };
  const pickFocus = (v: number) => {
    setFocusMin(v);
    if (stateRef.current.phase === 'focus' && !running) setLeft(v * 60);
  };

  const phaseLabel = phase === 'focus' ? '集中 focus' : phase === 'long' ? '長い休憩 long break' : '休憩 break';
  return (
    <Card className="overflow-hidden"><CardContent className="p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="text-sm font-semibold flex items-center gap-1.5"><Timer className="h-4 w-4 text-primary" />Focus timer <span className="jp-sans text-xs text-muted-foreground font-normal">ポモドーロ</span></div>
        <div className="flex items-center gap-1.5">
          <Badge variant="secondary" className="text-[10px]">🍅 {cycles} today</Badge>
          {focusReviews > 0 && running && phase === 'focus' && <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-600 dark:text-emerald-300">📚 {focusReviews} review{focusReviews === 1 ? '' : 's'} this focus</Badge>}
        </div>
      </div>
      <div className="flex flex-col sm:flex-row items-center gap-6">
        {/* ring */}
        <div className="relative shrink-0">
          <svg viewBox="0 0 160 160" className="w-40 h-40" role="img" aria-label={`${phaseLabel} timer, ${fmtClock(left)} remaining`}>
            <circle cx="80" cy="80" r={R} fill="none" stroke="currentColor" className="text-muted" strokeWidth="10" />
            <circle cx="80" cy="80" r={R} fill="none" stroke={`url(#pomoGrad)`} strokeWidth="10" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C * (1 - frac)} transform="rotate(-90 80 80)"
              className="transition-[stroke-dashoffset] duration-1000 ease-linear" />
            <defs>
              <linearGradient id="pomoGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor={ringStops[0]} />
                <stop offset="100%" stopColor={ringStops[1]} />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className={`text-2xl font-bold tabular-nums ${left === 0 && running ? 'animate-pulse' : ''}`}>{fmtClock(left)}</span>
            <span className={`text-[10px] uppercase tracking-wide mt-0.5 ${phase === 'focus' ? 'text-primary' : 'text-emerald-600'}`}>{phaseLabel}</span>
          </div>
        </div>
        {/* controls */}
        <div className="flex-1 w-full space-y-3">
          <div className="flex gap-1.5">
            <Button size="lg" className="flex-1" onClick={toggleRun}>{running ? <><Pause className="h-4 w-4 mr-1.5" />Pause</> : <><Play className="h-4 w-4 mr-1.5" />{phase === 'focus' && left === total ? 'Start focus' : 'Resume'}</>}</Button>
            <Button size="lg" variant="outline" onClick={skipPhase} aria-label="skip phase"><SkipForward className="h-4 w-4" /></Button>
            <Button size="lg" variant="ghost" onClick={resetAll} aria-label="reset timer"><RotateCcw className="h-4 w-4" /></Button>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground flex justify-between mb-1.5"><span>Focus length</span><span className="text-primary font-semibold">{focusMin} min</span></Label>
            <div className="grid grid-cols-4 gap-1.5">
              {([15, 25, 35, 50] as const).map(v => (
                <button key={v} onClick={() => pickFocus(v)}
                  className={`rounded-lg border py-1.5 text-xs transition ${focusMin === v ? 'border-primary bg-primary/10 text-primary font-semibold' : 'hover:border-primary/40 text-muted-foreground'}`}>{v}m</button>
              ))}
            </div>
          </div>
          {ambient && (
            <label className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 cursor-pointer hover:border-primary/30 transition">
              <span className="flex items-center gap-2 text-xs"><Headphones className="h-3.5 w-3.5 text-primary" />Auto-play rain during focus</span>
              <Switch checked={autoRain} onCheckedChange={v => { setAutoRain(v); if (!v && stateRef.current.phase === 'focus') ambient.setKind('off'); }} aria-label="auto rain during focus" />
            </label>
          )}
          <p className="text-[11px] text-muted-foreground">Classic 25/5 pomodoro · long 15-min break every 4th cycle · chime on phase change{cycles > 0 ? ` · ${cycles} pomodoro${cycles === 1 ? '' : 's'} completed today` : ''}</p>
        </div>
      </div>
    </CardContent></Card>
  );
}

/** Dictionary keys (2+ chars) sorted longest-first for cloze blanking. */
const CLOZE_KEYS: string[] = (() => {
  const keys = new Set<string>();
  for (const w of wordByText.values()) {
    if (w.k) keys.add(w.k);
    if (w.a[0]) keys.add(w.a[0]);
  }
  return [...keys].filter(k => k.length >= 2).sort((a, b) => b.length - a.length);
})();

/** Blank a dictionary-matched word inside a sentence for cloze review. */
function clozeForSentence(ja: string): string {
  const core = ja.replace(/[。！？、．]/g, '');
  const hit = CLOZE_KEYS.find(key => core.includes(key));
  if (hit) return ja.replace(hit, '＿'.repeat(Math.min(hit.length, 6)));
  const run = ja.match(/[\u4e00-\u9faf]{2,}/)?.[0];
  return run ? ja.replace(run, '＿'.repeat(Math.min(run.length, 6))) : ja;
}

/** Blank the grammar pattern core inside its best-matching example for cloze review. */
function grammarCloze(g: GrammarEntry): string | null {
  const segs = g.p.split('〜').filter(Boolean);
  const full = segs.join('');
  const candidates = [full, ...[...segs].sort((a, b) => b.length - a.length)].filter(s => s.length >= 2);
  for (const core of candidates) {
    for (const ex of g.ex) {
      if (ex.ja.includes(core)) return ex.ja.replace(core, '＿'.repeat(Math.min(core.length, 8)));
    }
  }
  return null;
}

export function StudyView() {
  const study = useStudy();
  const settings = useSettings();
  const library = useLibrary();
  const ui = useUi();
  const [session, setSession] = useState<SessionCard[]>([]);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [stats, setStats] = useState({ again: 0, hard: 0, good: 0, easy: 0 });
  const [startedAt, setStartedAt] = useState(0);
  const [done, setDone] = useState(false);
  const [browseLimit, setBrowseLimit] = useState(30);
  const speak = useSpeak();

  const now = Date.now();
  const allCards = Object.values(study.cards);
  const dueCards = allCards.filter(c => c.state !== 'new' && c.due <= now);
  const newCount = allCards.filter(c => c.state === 'new').length;
  const learning = allCards.filter(c => c.state === 'learning' || c.state === 'relearning');
  const reviewState = allCards.filter(c => c.state === 'review');

  const startSession = () => {
    const newToday = Math.min(settings.newPerDay, newCount);
    const reviewToday = Math.min(settings.maxReviewsPerDay, dueCards.length);
    const picked: SessionCard[] = [];
    const newSorted = allCards.filter(c => c.state === 'new').sort((a, b) => a.addedAt - b.addedAt).slice(0, newToday);
    const dueSorted = [...dueCards].sort((a, b) => a.due - b.due).slice(0, reviewToday);
    const learningCards = learning.filter(c => c.due <= now);
    for (const c of [...learningCards, ...dueSorted, ...newSorted]) {
      picked.push({ key: c.key, kind: c.key[0] as 'w' | 'k' | 's' | 'e' | 'g' });
    }
    if (picked.length === 0) return toast({ title: 'Nothing to study right now 🎉', description: 'Add entries to SRS or come back later.' });
    setSession(shuffle(picked, Date.now()));
    setIdx(0); setRevealed(false); setStats({ again: 0, hard: 0, good: 0, easy: 0 }); setStartedAt(Date.now()); setDone(false);
  };

  const current = session[idx];
  const elapsed = useElapsed(startedAt, !!current && !done);
  const ambient = useAmbient();
  const word: WordEntry | null = current?.kind === 'w' ? wordById.get(Number(current.key.slice(2))) || null : null;
  const kanji: KanjiEntry | null = current?.kind === 'k' ? KANJI.find(k => k.c === current.key.slice(2)) || null : null;
  const sentence = current?.kind === 's' ? SENTENCES.find(s => s.id === Number(current.key.slice(2))) || null : null;
  const expr = current?.kind === 'e' ? EXPRESSIONS.find(e => e.id === Number(current.key.slice(2))) || null : null;
  const grammar: GrammarEntry | null = current?.kind === 'g' ? GRAMMAR.find(g => g.id === Number(current.key.slice(2))) || null : null;
  const card = current ? study.cards[current.key] : null;

  const answer = (quality: 0 | 3 | 4 | 5) => {
    if (!current || done) return;
    study.answer(current.key, quality, Date.now() - startedAt);
    setStats(s => ({ ...s, [quality === 0 ? 'again' : quality === 3 ? 'hard' : quality === 4 ? 'good' : 'easy']: (s as Record<string, number>)[quality === 0 ? 'again' : quality === 3 ? 'hard' : quality === 4 ? 'good' : 'easy'] + 1 }));
    setRevealed(false);
    if (idx + 1 >= session.length) {
      setDone(true);
      toast({ title: 'Session complete! 🎌', description: `${session.length} cards reviewed` });
    } else setIdx(i => i + 1);
  };

  // keyboard grading: Space/Enter reveals, 1-4 grades (Anki-style), typing-safe
  useEffect(() => {
    if (!current || done) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (!revealed) {
          setRevealed(true);
          const w: WordEntry | null = current.kind === 'w' ? wordById.get(Number(current.key.slice(2))) || null : null;
          const k = current.kind === 'k' ? current.key.slice(2) : null;
          const s = current.kind === 's' ? SENTENCES.find(x => x.id === Number(current.key.slice(2))) : null;
          const gr = current.kind === 'g' ? GRAMMAR.find(x => x.id === Number(current.key.slice(2))) : null;
          speak(w ? (w.k || w.a[0]) : k ? k : gr ? gr.ex[0].ja : s?.ja || '');
        }
      } else if (revealed && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        answer(({ '1': 0, '2': 3, '3': 4, '4': 5 } as const)[e.key as '1' | '2' | '3' | '4']);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [current, done, revealed]);

  // ---------------- render ----------------
  if (done) {
    const total = session.length;
    const correct = stats.good + stats.easy;
    return (
      <div className="max-w-xl mx-auto space-y-6 text-center py-10">
        <PartyPopper className="h-14 w-14 mx-auto text-primary" />
        <h1 className="text-2xl font-bold">Session complete!</h1>
        <p className="text-muted-foreground">{total} cards · {Math.max(1, Math.round((Date.now() - startedAt) / 60000))} min</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {([['Again', stats.again, 'bg-red-500/15 text-red-600'], ['Hard', stats.hard, 'bg-amber-500/15 text-amber-600'], ['Good', stats.good, 'bg-emerald-500/15 text-emerald-600'], ['Easy', stats.easy, 'bg-teal-500/15 text-teal-600']] as const).map(([label, n, cls]) => (
            <div key={label} className={`rounded-xl p-4 ${cls}`}>
              <div className="text-2xl font-bold">{n}</div>
              <div className="text-xs">{label}</div>
            </div>
          ))}
        </div>
        <div className="text-sm text-muted-foreground">Accuracy: {total ? Math.round((correct / total) * 100) : 0}% · Mature knowledge grows one review at a time.</div>
        <div className="flex gap-2 justify-center">
          <Button onClick={startSession}><RotateCcw className="h-4 w-4 mr-1" />Study again</Button>
          <Button variant="outline" onClick={() => ui.setView('stats')}>View statistics</Button>
        </div>
      </div>
    );
  }

  if (current && card) {
    const mode = card.mode;
    const frontIsJa = mode === 'fw' || card.state === 'new';
    const streakDays = computeStreak(study.activity);
    return (
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Timer className="h-4 w-4 text-primary" /><span className="font-mono tabular-nums text-foreground font-medium">{fmtClock(elapsed)}</span>
            <span>·</span>{idx + 1}/{session.length}
          </div>
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant={ambient.kind === 'off' ? 'ghost' : 'secondary'} className="h-7 text-xs gap-1" aria-label="focus sounds">
                  <Headphones className="h-3.5 w-3.5" />{ambient.kind === 'off' ? 'Focus sounds' : ambient.kind}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-60 p-3" align="end">
                <div className="text-xs font-semibold mb-2">集中モード — ambient focus sounds</div>
                <div className="grid grid-cols-3 gap-1.5 mb-3">
                  {([['rain', '雨 Rain'], ['brown', '波 Waves'], ['drone', '音 Drone']] as const).map(([k, label]) => (
                    <button key={k} onClick={() => ambient.setKind(k)} className={`rounded-lg border px-2 py-1.5 text-xs transition hover:border-primary/50 ${ambient.kind === k ? 'border-primary bg-primary/10 text-primary font-medium' : ''}`}>{label}</button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <Volume2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <Slider value={[ambient.vol * 100]} min={0} max={100} step={5} onValueChange={([v]) => ambient.setVol(v / 100)} />
                  {ambient.kind !== 'off' && <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => ambient.setKind('off')} aria-label="stop sound"><Pause className="h-3 w-3" /></Button>}
                </div>
              </PopoverContent>
            </Popover>
            <Badge variant="outline" className="text-xs"><FlameIcon />{streakDays}d streak</Badge>
            <Badge variant="secondary" className="text-xs">{card.state}</Badge>
          </div>
        </div>
        <Progress value={(idx / session.length) * 100} className="h-1.5" />

        <Card className="min-h-72 flex items-center justify-center relative overflow-hidden seigaiha-bg cursor-pointer select-none" onClick={() => { if (!revealed) { setRevealed(true); speak(word ? (word.k || word.a[0]) : kanji ? kanji.c : grammar ? grammar.ex[0].ja : sentence?.ja || ''); } }}>
          <CardContent className="p-8 text-center w-full">
            {!revealed ? (
              <div className="space-y-4">
                {frontIsJa ? (
                  word ? <FuriganaText kanji={word.k || word.a[0]} kana={word.k ? word.a[0] : undefined} size="text-5xl" />
                    : kanji ? <span className="text-6xl jp-serif">{kanji.c}</span>
                      : expr ? <span className="jp-sans text-3xl">{expr.expr}</span>
                        : grammar ? (() => { const cz = grammarCloze(grammar); return cz ? (
                          <>
                            <span className="jp-sans text-2xl leading-relaxed">{cz}</span>
                            <p className="text-[11px] text-primary/80 mt-2">cloze — recall the missing pattern · “{grammar.m}”</p>
                          </>
                        ) : (
                          <>
                            <span className="text-2xl">{grammar.m}</span>
                            <p className="text-[11px] text-primary/80 mt-2">recall the pattern — {grammar.form}</p>
                          </>
                        ); })()
                          : <>
                            <span className="jp-sans text-3xl leading-relaxed">{sentence ? clozeForSentence(sentence.ja) : ''}</span>
                            <p className="text-[11px] text-primary/80 mt-2">cloze — recall the missing word before revealing</p>
                          </>
                ) : (
                  word ? <span className="text-2xl">{word.s.map(s => s.gloss).join('; ')}</span>
                    : kanji ? <span className="text-2xl">{kanji.m.join(', ')}</span>
                      : expr ? <span className="text-2xl">{expr.m}</span>
                        : grammar ? <span className="text-2xl">{grammar.m}</span>
                          : <span className="text-xl">{sentence?.en}</span>
                )}
                <p className="text-xs text-muted-foreground mt-6">Click to reveal <kbd className="text-[10px] border rounded px-1">space</kbd> · grade with <kbd className="text-[10px] border rounded px-1">1-4</kbd></p>
              </div>
            ) : (
              <div className="space-y-4 anim-fade-up">
                {word ? (
                  <>
                    <FuriganaText kanji={word.k || word.a[0]} kana={word.k ? word.a[0] : undefined} size="text-4xl" />
                    <div className="text-sm text-muted-foreground">{word.a.join('・')} {word.a[0] && <i>({hiraToRomaji(word.a[0])})</i>}</div>
                    <div className="text-xl">{word.s.map(s => s.gloss).join('; ')}</div>
                    <div className="flex justify-center gap-1.5 flex-wrap"><JlptBadge level={word.j} />{word.s[0]?.pos?.map(p => <Badge key={p} variant="outline" className="text-[10px]">{p}</Badge>)}</div>
                  </>
                ) : kanji ? (
                  <>
                    <div className="flex items-center justify-center gap-6 flex-wrap">
                      <span className="text-6xl jp-serif">{kanji.c}</span>
                      <StrokeOrderAnim ch={kanji.c} size={132} compact />
                    </div>
                    <div className="text-xl">{kanji.m.join(', ')}</div>
                    <div className="text-sm text-muted-foreground">ON: {kanji.on.join(' ')} · KUN: {kanji.kun.join(' ')}</div>
                    <div className="flex justify-center gap-1.5"><JlptBadge level={kanji.j} /><Badge variant="outline" className="text-[10px]">{kanji.st} strokes</Badge></div>
                  </>
                ) : expr ? (
                  <>
                    <span className="jp-sans text-3xl">{expr.expr}</span>
                    <div className="text-sm text-muted-foreground">{expr.rd} <i>({hiraToRomaji(expr.rd)})</i></div>
                    <div className="text-lg">{expr.m}</div>
                  </>
                ) : grammar ? (
                  <>
                    <span className="jp-sans text-3xl">{grammar.p}</span>
                    <div className="text-xs text-muted-foreground"><i>{grammar.rom}</i></div>
                    <div className="text-lg">{grammar.m}</div>
                    <div className="text-xs text-muted-foreground jp-sans">作り方: {grammar.form}</div>
                    <div className="text-sm jp-sans mt-1">{grammar.ex[0].ja}</div>
                    <div className="text-xs text-muted-foreground">{grammar.ex[0].en}</div>
                    {grammar.note && <div className="text-[11px] text-muted-foreground mt-1">💡 {grammar.note}</div>}
                  </>
                ) : (
                  <>
                    <span className="jp-sans text-2xl">{sentence?.ja}</span>
                    <div className="text-lg text-muted-foreground">{sentence?.en}</div>
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {revealed && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 anim-fade-up">
            <Button variant="outline" className="border-red-400/50 hover:bg-red-500/10 h-12 flex-col gap-0.5" onClick={() => answer(0)}><span className="flex items-center gap-1"><Frown className="h-4 w-4" />Again</span><span className="text-[10px] text-muted-foreground">&lt;1m</span></Button>
            <Button variant="outline" className="border-amber-400/50 hover:bg-amber-500/10 h-12 flex-col gap-0.5" onClick={() => answer(3)}><span className="flex items-center gap-1"><Meh className="h-4 w-4" />Hard</span><span className="text-[10px] text-muted-foreground">+1d</span></Button>
            <Button variant="outline" className="border-emerald-400/50 hover:bg-emerald-500/10 h-12 flex-col gap-0.5" onClick={() => answer(4)}><span className="flex items-center gap-1"><Smile className="h-4 w-4" />Good</span><span className="text-[10px] text-muted-foreground">+{Math.max(1, Math.round(card.interval * (card.ease || 2.5)))}d</span></Button>
            <Button variant="outline" className="border-teal-400/50 hover:bg-teal-500/10 h-12 flex-col gap-0.5" onClick={() => answer(5)}><span className="flex items-center gap-1"><Zap className="h-4 w-4" />Easy</span><span className="text-[10px] text-muted-foreground">+{Math.max(2, Math.round(card.interval * (card.ease || 2.5) * 1.3))}d</span></Button>
          </div>
        )}

        {word && revealed && (() => { const c = conjugate(word); return c ? (
          <Card><CardContent className="p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Conjugations</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-sm">
              {c.forms.slice(0, 6).map(f => <div key={f.name} className="flex justify-between gap-2 rounded border px-2 py-1"><span className="text-[10px] text-muted-foreground">{f.name}</span><span className="jp-sans">{f.form}</span></div>)}
            </div>
          </CardContent></Card>
        ) : null; })()}

        {revealed && word && (
          <PronunciationCheck expected={word.a[0]} label={`${word.k || word.a[0]}`} />
        )}
        {revealed && kanji && (
          <PronunciationCheck expected={(kanji.on[0] ? kanji.on[0].toLowerCase() : '') || (kanji.kun[0] || '').replace(/[-.]/g, '')} label={kanji.c} />
        )}
      </div>
    );
  }

  // idle / browse
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Study <span className="text-muted-foreground font-normal text-lg">復習</span></h1>
        <p className="text-sm text-muted-foreground">Spaced repetition (SM-2) — recognition & recall modes</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile label="Due now" value={dueCards.length} icon={<Timer className="h-4 w-4" />} tone="text-red-500" />
        <StatTile label="Learning" value={learning.length} icon={<Layers className="h-4 w-4" />} tone="text-amber-500" />
        <StatTile label="Young+Mature" value={reviewState.length} icon={<CheckCircle2 className="h-4 w-4" />} tone="text-emerald-500" />
        <StatTile label="New waiting" value={newCount} icon={<GraduationCap className="h-4 w-4" />} tone="text-primary" />
      </div>
      <Card><CardContent className="p-5 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row items-center gap-4 justify-between">
          <div>
            <div className="font-semibold">Ready to study?</div>
            <div className="text-sm text-muted-foreground">{Math.min(settings.newPerDay, newCount)} new + {dueCards.length} due today · daily goal {settings.dailyGoal} reviews</div>
          </div>
          <Button size="lg" onClick={startSession}><Play className="h-4 w-4 mr-1" />Start session</Button>
        </div>
        {(() => {
          const fc = buildForecast(study.cards, settings.newPerDay, 7).map(f => ({ label: f.label, load: f.due + f.fresh }));
          if (fc.every(f => f.load === 0)) return null;
          return (
            <div className="h-16 -mx-2" aria-hidden>
              <RC2 width="100%" height="100%">
                <AreaChart data={fc} margin={{ top: 2, right: 2, bottom: 0, left: 2 }}>
                  <defs>
                    <linearGradient id="fcGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="load" stroke="var(--chart-1)" strokeWidth={2} fill="url(#fcGrad)" />
                </AreaChart>
              </RC2>
            </div>
          );
        })()}
      </CardContent></Card>

      <PomodoroCard ambient={ambient} />

      <ImportDeckCard />

      <div>
        <h3 className="text-sm font-semibold mb-2">Enrolled cards</h3>
        <div className="space-y-1.5 max-h-96 overflow-y-auto bunsan-scroll pr-1">
          {allCards.slice(0, browseLimit).map(c => {
            const wEntry = c.key.startsWith('w:') ? wordById.get(Number(c.key.slice(2))) : undefined;
            const label = wEntry ? (wEntry.k || wEntry.a[0])
              : c.key.startsWith('k:') ? c.key.slice(2) : c.key.startsWith('e:') ? (EXPRESSIONS.find(e => e.id === Number(c.key.slice(2)))?.expr || `expression #${c.key.slice(2)}`) : `sentence #${c.key.slice(2)}`;
            const kindIcon = c.key.startsWith('w:') ? <BookA className="h-3 w-3 text-primary/70 shrink-0" />
              : c.key.startsWith('k:') ? <PenLine className="h-3 w-3 text-primary/70 shrink-0" />
              : c.key.startsWith('e:') ? <ScrollText className="h-3 w-3 text-primary/70 shrink-0" />
              : <MessageSquareText className="h-3 w-3 text-primary/70 shrink-0" />;
            const stateColors: Record<string, string> = { new: 'bg-blue-500/10 text-blue-600 dark:text-blue-300', learning: 'bg-amber-500/10 text-amber-600 dark:text-amber-300', relearning: 'bg-orange-500/10 text-orange-600', review: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' };
            return (
              <div key={c.key} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm bg-card hover:border-primary/30 transition">
                <span className="flex items-center gap-2 min-w-0">{kindIcon}<span className="jp-sans font-medium truncate">{label}</span></span>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant="secondary" className={`text-[10px] ${stateColors[c.state]}`}>{c.state}</Badge>
                  <span className="text-xs text-muted-foreground w-10 text-right">{formatInterval(c.interval)}</span>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => study.unenroll(c.key)} aria-label="remove"><XCircle className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
            );
          })}
          {allCards.length > browseLimit && <Button size="sm" variant="ghost" onClick={() => setBrowseLimit(l => l + 50)}>Show more ({allCards.length - browseLimit} hidden)</Button>}
          {allCards.length === 0 && <p className="text-sm text-muted-foreground p-4 text-center">No cards yet — add words/kanji via “Study this” or Lists → bulk actions.</p>}
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone?: string }) {
  return (
    <Card><CardContent className="p-4">
      <div className={`flex items-center gap-1.5 text-xs ${tone}`}>{icon}{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </CardContent></Card>
  );
}

function computeStreak(activity: Record<string, number>): number {
  let streak = 0;
  const d = new Date();
  for (;;) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (activity[key]) streak++;
    else break;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

function FlameIcon() { return <Flame className="h-3 w-3 inline mr-0.5 text-orange-500" />; }

// ---------------- CSV / Anki bulk import ----------------
function ImportDeckCard() {
  const study = useStudy();
  const lists = useLibrary(s => s.lists);
  const addToList = useLibrary(s => s.addToList);
  const [open, setOpen] = useState(false);
  const [paste, setPaste] = useState('');
  const [enrollSrs, setEnrollSrs] = useState(true);
  const [listId, setListId] = useState('none');
  const fileRef = React.useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => (paste.trim() ? matchCsvRows(parseDeckCsv(paste).slice(0, 300)) : []), [paste]);
  const matched = parsed.filter(p => p.matchId != null);
  const unmatched = parsed.filter(p => p.matchId == null);

  const onFile = async (f: File | null) => {
    if (!f) return;
    const txt = await f.text();
    setPaste(txt.slice(0, 200000));
    toast({ title: `Loaded ${f.name}`, description: 'Review the preview below, then import.' });
  };

  const doImport = () => {
    if (matched.length === 0) return toast({ title: 'Nothing matched the dictionary', variant: 'destructive' });
    const keys = [...new Set(matched.map(m => `w:${m.matchId!}`))];
    if (enrollSrs) study.enroll(keys);
    if (listId !== 'none') for (const id of [...new Set(matched.map(m => m.matchId!))]) addToList(listId, 'w', id);
    study.logQuiz('import', matched.length, parsed.length);
    toast({
      title: `Imported ${matched.length}/${parsed.length} rows`,
      description: `${enrollSrs ? 'Enrolled to SRS. ' : ''}${listId !== 'none' ? 'Added to list. ' : ''}${unmatched.length} unmatched.`,
    });
    setPaste('');
  };

  const downloadTemplate = () => {
    const csv = 'word,reading,meaning\n食べる,たべる,to eat\n日本,にほん,Japan\n大学生,だいがくせい,university student';
    downloadFile(csv, 'bunsan-import-template.csv', 'text/csv');
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="w-full rounded-xl border border-dashed border-primary/30 bg-primary/5 hover:bg-primary/10 transition p-4 flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-primary group">
        <Upload className="h-4 w-4 transition group-hover:-translate-y-0.5" />
        <span className="font-medium">Bulk import — CSV / Anki deck export</span>
        <span className="text-xs opacity-70 hidden sm:inline">match against the 12k dictionary, enroll to SRS</span>
      </button>
    );
  }

  return (
    <Card className="border-primary/30 anim-fade-up"><CardContent className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold flex items-center gap-1.5"><Upload className="h-4 w-4 text-primary" />Bulk import (CSV / TSV / Anki export)</div>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={downloadTemplate}>Template</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setOpen(false)}>Close</Button>
        </div>
      </div>
      <div
        className="rounded-lg border-2 border-dashed p-4 text-center cursor-pointer hover:border-primary/50 transition"
        onClick={() => fileRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={e => { e.preventDefault(); onFile(e.dataTransfer.files?.[0] || null); }}
        role="button" tabIndex={0} aria-label="upload deck file"
      >
        <p className="text-sm">Drop a <b>.csv / .txt</b> file here, or click to browse</p>
        <p className="text-xs text-muted-foreground mt-1">Columns: word [, reading [, meaning]] — tab or comma separated, lines starting with # are skipped</p>
        <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={e => onFile(e.target.files?.[0] || null)} />
      </div>
      <Textarea
        value={paste}
        onChange={e => setPaste(e.target.value)}
        placeholder={'…or paste rows here:\n食べる,たべる,to eat\n日本,にほん,Japan'}
        className="min-h-24 jp-sans text-sm"
        aria-label="paste deck data"
      />
      {parsed.length > 0 && (
        <div className="space-y-2 anim-fade-up">
          <div className="flex items-center gap-3 text-xs">
            <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-0">{matched.length} matched</Badge>
            {unmatched.length > 0 && <Badge variant="outline" className="text-amber-600 dark:text-amber-300">{unmatched.length} unmatched</Badge>}
            <span className="text-muted-foreground">{parsed.length} rows parsed (max 300)</span>
          </div>
          <div className="rounded-lg border max-h-44 overflow-y-auto bunsan-scroll">
            {parsed.slice(0, 10).map((p, i) => (
              <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 text-sm border-b last:border-0">
                {p.matchId != null ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" /> : <XCircle className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                <span className="jp-sans font-medium">{p.word}</span>
                {p.reading && <span className="text-xs text-muted-foreground">{p.reading}</span>}
                <span className="text-xs text-muted-foreground truncate flex-1">{p.meaning || '—'}</span>
                <Badge variant="outline" className="text-[9px] shrink-0">{p.via}</Badge>
              </div>
            ))}
            {parsed.length > 10 && <div className="px-2.5 py-1.5 text-xs text-muted-foreground">…{parsed.length - 10} more</div>}
          </div>
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <label className="flex items-center gap-2 text-sm"><Switch checked={enrollSrs} onCheckedChange={setEnrollSrs} aria-label="enroll to SRS" />Enroll to SRS</label>
            <Select value={listId} onValueChange={setListId}>
              <SelectTrigger className="w-full sm:w-56 h-9"><SelectValue placeholder="Also add to list…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No list</SelectItem>
                {lists.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button className="sm:ml-auto" onClick={doImport} disabled={matched.length === 0}>
              <Download className="h-4 w-4 mr-1" />Import {matched.length} words
            </Button>
          </div>
          {unmatched.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Unmatched: {unmatched.slice(0, 6).map(u => u.word).join('、')}{unmatched.length > 6 ? ` +${unmatched.length - 6} more` : ''} — these were skipped.
            </p>
          )}
        </div>
      )}
    </CardContent></Card>
  );
}
import { Flame } from 'lucide-react';

// ==================================================================== QUIZZES
type QuizKind = 'kanji-meaning' | 'word-reading' | 'word-meaning' | 'sentence-blank' | 'kana-romaji' | 'listening' | 'pitch' | 'conjugation' | 'grammar' | 'reading-recall' | 'stroke' | 'exam';

// ==================================================================== JLPT MOCK EXAM
function ExamRunner({ level, onExit }: { level: JlptLevel; onExit: () => void }) {
  const study = useStudy();
  const speak = useSpeak();
  const [paper] = useState<ExamPaper>(() => buildExam(level));
  const [si, setSi] = useState(0);
  const [qi, setQi] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [flags, setFlags] = useState<Set<string>>(new Set());
  const [left, setLeft] = useState(paper.sections[0]?.seconds ?? 60);
  const [phase, setPhase] = useState<'running' | 'results'>('running');
  const [results, setResults] = useState<{ perSection: Array<{ jp: string; en: string; correct: number; total: number; points: number }>; correct: number; total: number; score: number; pass: boolean } | null>(null);
  const submittedRef = useRef(false);

  const section = paper.sections[si];
  const q: ExamQuestion | undefined = section?.questions[qi];
  const ansKey = q ? `${si}:${qi}` : '';
  const answeredCount = Object.keys(answers).length;

  const submit = () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    const perSection = paper.sections.map(s => {
      const correct = s.questions.reduce((a, qq, i) => a + (answers[`${paper.sections.indexOf(s)}:${i}`] === qq.answer ? 1 : 0), 0);
      return { jp: s.jp, en: s.en, correct, total: s.questions.length, points: Math.round((correct / s.questions.length) * s.points) };
    });
    const correct = perSection.reduce((a, s) => a + s.correct, 0);
    const total = paper.totalQuestions;
    const score = perSection.reduce((a, s) => a + s.points, 0);
    const pass = score >= paper.passMark;
    study.logQuiz(`exam:N${level}`, correct, total, perSection.map(s => `${s.en} ${s.correct}/${s.total}`));
    setResults({ perSection, correct, total, score, pass });
    setPhase('results');
  };

  // per-section countdown
  useEffect(() => {
    if (phase !== 'running') return;
    const id = setInterval(() => setLeft(l => {
      if (l <= 1) {
        // time up for this section: advance or submit
        if (si + 1 < paper.sections.length) { setSi(si + 1); setQi(0); return paper.sections[si + 1].seconds; }
        setTimeout(submit, 0);
        return 0;
      }
      return l - 1;
    }), 1000);
    return () => clearInterval(id);
  }, [si, phase]);

  const pickAnswer = (choice: string) => { if (phase === 'running' && q) setAnswers(a => ({ ...a, [ansKey]: choice })); };
  const toggleFlag = () => { if (!q) return; setFlags(f => { const n = new Set(f); if (n.has(ansKey)) n.delete(ansKey); else n.add(ansKey); return n; }); };
  const goSection = (i: number) => { if (phase !== 'running' || i >= si) return; setSi(i); setQi(0); setLeft(paper.sections[i].seconds); };

  const nextQ = () => {
    if (!section) return;
    if (qi + 1 < section.questions.length) return setQi(qi + 1);
    // end of section
    if (si + 1 < paper.sections.length) { setSi(si + 1); setQi(0); setLeft(paper.sections[si + 1].seconds); }
  };
  const prevQ = () => {
    if (qi > 0) return setQi(qi - 1);
    if (si > 0) { const p = si - 1; setSi(p); setQi(paper.sections[p].questions.length - 1); setLeft(paper.sections[p].seconds); }
  };

  if (phase === 'results' && results) {
    const missed = paper.sections.flatMap((s, sIdx) => s.questions.map((qq, qIdx) => ({ qq, sIdx, qIdx })).filter(x => answers[`${x.sIdx}:${x.qIdx}`] !== x.qq.answer));
    return (
      <div className="max-w-2xl mx-auto space-y-5 py-4">
        <div className="text-center space-y-2">
          <BadgeCheck className={`h-14 w-14 mx-auto ${results.pass ? 'text-emerald-500' : 'text-muted-foreground'}`} />
          <h2 className="text-2xl font-bold">{results.pass ? '合格見込み！ Pass!' : 'あと少し！ Keep studying'}</h2>
          <p className="text-muted-foreground text-sm">JLPT N{level} mock exam · official-style scoring</p>
        </div>
        <Card className="overflow-hidden"><CardContent className="p-6">
          <div className="flex items-end justify-center gap-2">
            <span className={`text-5xl font-bold ${results.pass ? 'text-emerald-600' : 'text-amber-600'}`}>{results.score}</span>
            <span className="text-lg text-muted-foreground mb-1">/ 180</span>
            <Badge variant={results.pass ? 'default' : 'outline'} className="mb-1.5 ml-2">pass mark {paper.passMark}</Badge>
          </div>
          <Progress value={(results.score / 180) * 100} className="h-2.5 mt-4" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5">
            {results.perSection.map(s => (
              <div key={s.en} className="rounded-xl border p-3">
                <div className="text-xs font-semibold flex justify-between"><span>{s.en}</span><span className="text-muted-foreground">{s.points}/60</span></div>
                <Progress value={(s.correct / s.total) * 100} className="h-1.5 mt-2" />
                <div className="text-[11px] text-muted-foreground mt-1.5">{s.correct}/{s.total} correct</div>
              </div>
            ))}
          </div>
          <div className="text-center text-sm text-muted-foreground mt-4">{results.correct}/{results.total} correct ({Math.round((results.correct / results.total) * 100)}% accuracy)</div>
        </CardContent></Card>
        {missed.length > 0 && (
          <Card><CardContent className="p-4">
            <div className="text-sm font-semibold mb-2 flex items-center gap-1.5"><AlertTriangle className="h-4 w-4 text-amber-500" />Review your misses ({missed.length})</div>
            <div className="max-h-72 overflow-y-auto bunsan-scroll space-y-2 pr-1">
              {missed.map(({ qq, sIdx, qIdx }) => (
                <div key={`${sIdx}-${qIdx}`} className="rounded-lg border p-2.5 text-sm space-y-1">
                  <div className="jp-sans font-medium">{qq.prompt}</div>
                  {qq.promptSub && <div className="text-xs text-muted-foreground">{qq.promptSub}</div>}
                  <div className="flex flex-wrap gap-x-3 text-xs">
                    <span className="text-emerald-600">✓ {qq.answer}</span>
                    {answers[`${sIdx}:${qIdx}`] && <span className="text-red-500 line-through">your pick: {answers[`${sIdx}:${qIdx}`]}</span>}
                    <Badge variant="outline" className="text-[9px]">{qq.tag}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent></Card>
        )}
        <div className="flex gap-2 justify-center">
          <Button variant="outline" onClick={onExit}><RotateCcw className="h-4 w-4 mr-1" />Back to Quiz Center</Button>
        </div>
      </div>
    );
  }

  if (!section || !q) return null;
  const timeFrac = left / section.seconds;
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* exam header */}
      <div className="rounded-xl border bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-3.5 flex flex-wrap items-center gap-2.5">
        <ClipboardCheck className="h-5 w-5 text-primary shrink-0" />
        <div className="min-w-0">
          <div className="font-semibold text-sm leading-tight">JLPT N{level} Mock Exam <span className="jp-sans text-xs text-muted-foreground font-normal">日本語能力試験・模試</span></div>
          <div className="text-[11px] text-muted-foreground">Section {si + 1}/{paper.sections.length} · {section.jp} ({section.en}) · {answeredCount}/{paper.totalQuestions} answered</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-mono tabular-nums font-semibold ${timeFrac < 0.2 ? 'bg-red-500/15 text-red-600 animate-pulse' : timeFrac < 0.5 ? 'bg-amber-500/15 text-amber-600' : 'bg-primary/10 text-primary'}`}>
            <Timer className="h-3.5 w-3.5" />{formatClock(left)}
          </span>
          <Button size="sm" variant="outline" className="h-8 gap-1" onClick={submit}><Send className="h-3.5 w-3.5" />Submit</Button>
        </div>
      </div>
      {/* section tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {paper.sections.map((s, i) => {
          const secAnswered = s.questions.filter((_, j) => answers[`${i}:${j}`]).length;
          const done = i < si;
          return (
            <button key={s.id} onClick={() => goSection(i)} disabled={i > si}
              className={`rounded-full px-3 py-1 text-xs border transition ${i === si ? 'border-primary bg-primary text-primary-foreground font-medium' : done ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-600' : 'opacity-50 cursor-not-allowed'}`}>
              {done && '✓ '}{s.jp} · {secAnswered}/{s.questions.length}
            </button>
          );
        })}
      </div>
      {/* question nav dots */}
      <div className="flex flex-wrap gap-1.5">
        {section.questions.map((_, j) => {
          const key = `${si}:${j}`;
          return (
            <button key={j} onClick={() => setQi(j)}
              className={`h-7 w-7 rounded-md text-[11px] font-medium border transition ${j === qi ? 'border-primary bg-primary text-primary-foreground' : answers[key] ? 'border-primary/40 bg-primary/10 text-primary' : 'text-muted-foreground'} ${flags.has(key) ? 'ring-2 ring-amber-400' : ''}`}
              aria-label={`question ${j + 1}`}>
              {j + 1}{flags.has(key) && <Flag className="h-2.5 w-2.5 inline ml-0.5" />}
            </button>
          );
        })}
      </div>
      <Progress value={((si * 100 + (qi / section.questions.length) * 100) / paper.sections.length)} className="h-1" />
      {/* question card */}
      <Card className="min-h-56 seigaiha-bg">
        <CardContent className="p-6 sm:p-8 text-center space-y-3">
          <div className="flex items-center justify-between">
            <Badge variant="outline" className="text-[10px]">{q.tag}</Badge>
            <button onClick={e => { e.stopPropagation(); toggleFlag(); }} className={`text-xs flex items-center gap-1 transition ${flags.has(ansKey) ? 'text-amber-500' : 'text-muted-foreground hover:text-amber-500'}`}>
              <Flag className="h-3.5 w-3.5" />{flags.has(ansKey) ? 'Flagged' : 'Flag for review'}
            </button>
          </div>
          <div className="jp-sans text-2xl font-medium leading-relaxed">{q.prompt}</div>
          {q.promptSub && <div className="text-sm text-muted-foreground">{q.promptSub}</div>}
          {q.speakText && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => speak(q.speakText!)} aria-label="play audio"><Volume2 className="h-4 w-4" /></Button>}
        </CardContent>
      </Card>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {q.choices.map(c => {
          const sel = answers[ansKey] === c;
          return (
            <button key={c} onClick={() => pickAnswer(c)}
              className={`min-h-12 rounded-lg border px-4 py-2.5 text-left jp-sans text-base transition-all ${sel ? 'border-primary bg-primary/10 ring-1 ring-primary font-medium' : 'hover:border-primary/50 hover:bg-accent/50'}`}>
              {c}
            </button>
          );
        })}
      </div>
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={prevQ} disabled={si === 0 && qi === 0}><ChevronLeft className="h-4 w-4" />Prev</Button>
        {si === paper.sections.length - 1 && qi === section.questions.length - 1 ? (
          <Button size="sm" onClick={submit} className="gap-1"><Send className="h-3.5 w-3.5" />Submit exam</Button>
        ) : (
          <Button size="sm" onClick={nextQ}>Next <ChevronRight className="h-4 w-4" /></Button>
        )}
      </div>
    </div>
  );
}

export function QuizzesView() {
  const study = useStudy();
  const ui = useUi();
  const [kind, setKind] = useState<QuizKind>('kanji-meaning');
  const [jlpt, setJlpt] = useState('all');
  const [count, setCount] = useState(10);
  const [examLevel, setExamLevel] = useState<JlptLevel | null>(null);
  const [examPick, setExamPick] = useState<JlptLevel>(5);
  const [quiz, setQuiz] = useState<Array<{ prompt: string; promptSub?: string; choices: string[]; answer: string; speakText?: string; input?: boolean }> | null>(null);
  const [qi, setQi] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState({ correct: 0, wrong: 0 });
  const [wrongList, setWrongList] = useState<string[]>([]);
  const [strokeRun, setStrokeRun] = useState<string[] | null>(null);
  const speak = useSpeak();
  const finished = quiz && qi >= quiz.length;

  // consume a quiz preset coming from drill recommendations / exam analytics
  useEffect(() => {
    if (!ui.quizPreset) return;
    const preset = ui.quizPreset;
    Promise.resolve().then(() => {
      setKind(preset as QuizKind);
      ui.setQuizPreset(null);
    });
  }, [ui.quizPreset]);

  const start = () => {
    if (kind === 'exam') { setExamLevel(examPick); return; }
    if (kind === 'stroke') {
      const kPool = jlpt === 'all' ? KANJI : KANJI.filter(k => k.j === Number(jlpt));
      const source = kPool.length >= 4 ? kPool : KANJI;
      const run = shuffle(source).slice(0, count).map(k => k.c);
      if (run.length === 0) return toast({ title: 'Not enough data for this quiz', variant: 'destructive' });
      setStrokeRun(run);
      return;
    }
    const qs = buildQuiz(kind, jlpt, count);
    if (qs.length === 0) return toast({ title: 'Not enough data for this quiz', variant: 'destructive' });
    setQuiz(qs); setQi(0); setPicked(null); setScore({ correct: 0, wrong: 0 }); setWrongList([]);
  };

  const pick = (choice: string) => {
    if (picked) return;
    setPicked(choice);
    const q = quiz![qi];
    const ok = choice === q.answer;
    setScore(s => ok ? { ...s, correct: s.correct + 1 } : { ...s, wrong: s.wrong + 1 });
    if (!ok) setWrongList(l => [...l, q.prompt]);
    setTimeout(() => { setQi(i => i + 1); setPicked(null); }, ok ? 700 : 1400);
  };

  // typed answer for reading-recall questions (romaji or kana accepted)
  const submitTyped = (raw: string) => {
    if (picked || !quiz) return;
    const q = quiz[qi];
    const given = toHira(raw.trim().toLowerCase().replace(/ /g, ''));
    const want = toHira(q.answer.replace(/ /g, ''));
    if (!given) return;
    const ok = given === want;
    setPicked(ok ? q.answer : `✗${q.answer}`);
    setScore(s => ok ? { ...s, correct: s.correct + 1 } : { ...s, wrong: s.wrong + 1 });
    if (!ok) setWrongList(l => [...l, `${q.prompt} → ${q.answer}`]);
    setTimeout(() => { setQi(i => i + 1); setPicked(null); }, ok ? 700 : 1800);
  };

  useEffect(() => {
    if (finished && quiz) {
      study.logQuiz(kind, score.correct, quiz.length, wrongList);
      toast({ title: 'Quiz logged', description: `${score.correct}/${quiz.length} correct` });
    }
  }, [finished]);

  if (examLevel) {
    return <ExamRunner level={examLevel} onExit={() => setExamLevel(null)} />;
  }

  if (!quiz && !strokeRun) {
    const QUIZ_INFO: Array<[QuizKind, string, string, string, React.ElementType]> = [
      ['kanji-meaning', '漢字', 'Kanji → meaning', 'Pick the correct meaning of a kanji', PenLine],
      ['word-reading', '読み', 'Word → reading', 'Pick the correct reading of a word', BookA],
      ['word-meaning', '意味', 'Word → meaning', 'Pick the correct meaning of a word', Languages],
      ['sentence-blank', '穴埋め', 'Sentence fill-in', 'Complete the sentence with the missing word', MessageSquareText],
      ['kana-romaji', 'かな', 'Kana → romaji', 'Pick the romaji for a kana character', Type],
      ['listening', '聴解', 'Listening', 'Listen and pick the word you hear', Volume2],
      ['pitch', '高低', 'Pitch accent drill', 'Identify the pitch accent pattern of a word', Activity],
      ['conjugation', '活用', 'Conjugation drill', 'Pick the correct conjugated form of a verb or adjective', Repeat2],
      ['reading-recall', '書取', 'Reading recall', 'Type the kana reading of a word — recall instead of recognition', Keyboard],
      ['grammar', '文法', 'Grammar patterns', 'Pick the pattern that completes the sentence (N5–N1)', BookOpen],
      ['stroke', '書順', 'Stroke-order game', 'Click the strokes of a kanji in the correct writing order', Brush],
    ];
    const examHistory = study.quizLog.filter(q => q.kind.startsWith('exam:'));
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Quiz Center <span className="text-muted-foreground font-normal text-lg">テスト</span></h1>
          <p className="text-sm text-muted-foreground">11 quiz modes + timed JLPT mock exams — multiple choice with instant feedback, typed recall & interactive stroke game</p>
        </div>
        {/* JLPT mock exam — flagship mode with distinct gradient styling */}
        <Card className={`overflow-hidden transition-all duration-200 hover:shadow-md ${kind === 'exam' ? 'border-primary ring-1 ring-primary' : 'hover:border-primary/40'}`} onClick={() => setKind('exam')}>
          <CardContent className="p-5 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent">
            <div className="flex items-start gap-4">
              <span className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl transition-transform ${kind === 'exam' ? 'bg-primary text-primary-foreground scale-105' : 'bg-primary/10 text-primary group-hover:scale-110'}`}><ClipboardCheck className="h-6 w-6" /></span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">JLPT Mock Exam <span className="jp-sans text-sm">日本語能力試験・模試</span></span>
                  <Badge variant="secondary" className="text-[10px]">timed · 3 sections</Badge>
                  <Badge variant="secondary" className="text-[10px]">official-style /180 scoring</Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">A full mini-paper: 言語知識・語彙 → 文法 → 読解 with per-section countdowns, question flagging, and a pass/fail estimate on official pass marks.</p>
                {kind === 'exam' && (
                  <div className="mt-3" onClick={e => e.stopPropagation()}>
                    <div className="grid grid-cols-5 gap-1.5 max-w-md">
                      {([5, 4, 3, 2, 1] as JlptLevel[]).map(l => (
                        <button key={l} onClick={() => setExamPick(l)}
                          className={`rounded-lg border px-2 py-2 text-center transition ${examPick === l ? 'border-primary bg-primary text-primary-foreground shadow-sm' : 'hover:border-primary/50 hover:bg-accent/50'}`}>
                          <div className="text-sm font-bold">N{l}</div>
                          <div className={`text-[9px] ${examPick === l ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>{PASS_MARKS[l]} pts</div>
                        </button>
                      ))}
                    </div>
                    <div className="text-xs text-muted-foreground mt-2">{LEVEL_LABELS[examPick]} · 3 sections · {examPick >= 3 ? '~13' : examPick === 4 ? '~12' : '~11'} min</div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {QUIZ_INFO.map(([k, jp, title, desc, Icon]) => (
            <Card key={k} className={`group cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-primary/40 ${kind === k ? 'border-primary ring-1 ring-primary' : ''}`} onClick={() => setKind(k)}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className={`inline-flex h-8 w-8 items-center justify-center rounded-lg transition-colors ${kind === k ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary group-hover:scale-110'}`}><Icon className="h-4 w-4" /></span>
                  <span className="jp-serif text-xl text-primary/60">{jp}</span>
                </div>
                <div className="font-semibold mt-2 text-sm">{title}</div>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{desc}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        {kind !== 'exam' && (
          <Card><CardContent className="p-4 flex flex-col sm:flex-row items-center gap-4">
            <div className="flex items-center gap-3">
              <Label className="text-sm">{kind === 'stroke' ? 'Kanji' : 'Questions'}: {count}</Label>
              <Slider value={[count]} min={5} max={30} step={5} onValueChange={([v]) => setCount(v)} className="w-40" />
            </div>
            <Select value={jlpt} onValueChange={setJlpt}>
              <SelectTrigger className="w-32 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any level</SelectItem>
                {['5', '4', '3', '2', '1'].map(j => <SelectItem key={j} value={j}>N{j}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="lg" className="sm:ml-auto" onClick={start}><Play className="h-4 w-4 mr-1" />{kind === 'stroke' ? 'Start game' : 'Start quiz'}</Button>
          </CardContent></Card>
        )}
        {kind === 'exam' && (
          <Card><CardContent className="p-4 flex items-center gap-4">
            <div className="text-sm text-muted-foreground flex-1">
              <b className="text-foreground">Ready, {examPick >= 3 ? '頑張って' : 'がんばって'}!</b> Answered questions are saved as you go — the timer advances sections automatically when time runs out. Unanswered questions score 0, just like the real test.
            </div>
            <Button size="lg" onClick={start}><Play className="h-4 w-4 mr-1" />Begin N{examPick} exam</Button>
          </CardContent></Card>
        )}
        {examHistory.length > 0 && (
          <Card><CardContent className="p-4">
            <div className="text-sm font-semibold mb-2 flex items-center gap-1.5"><Trophy className="h-4 w-4 text-amber-500" />Past exam attempts</div>
            <div className="space-y-1">
              {[...examHistory].reverse().slice(0, 6).map((q, i) => {
                const pct = Math.round((q.correct / q.total) * 180);
                const lvl = q.kind.replace('exam:', '');
                const pass = pct >= 80 + (['N5', 'N4', 'N3', 'N2', 'N1'].indexOf(lvl)) * 5;
                const lvlCls: Record<string, string> = { N5: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300', N4: 'bg-teal-500/15 text-teal-600 dark:text-teal-300', N3: 'bg-sky-500/15 text-sky-600 dark:text-sky-300', N2: 'bg-orange-500/15 text-orange-600 dark:text-orange-300', N1: 'bg-red-500/15 text-red-600 dark:text-red-300' };
                return (
                  <div key={i} className="flex items-center gap-2.5 rounded-lg border px-3 py-1.5 text-sm bg-card hover:border-primary/30 transition">
                    <Badge className={`border-0 font-bold text-[10px] w-9 justify-center ${lvlCls[lvl] || 'bg-muted'}`}>{lvl}</Badge>
                    <span className="text-muted-foreground">mock exam</span>
                    <span className="ml-auto tabular-nums text-xs">est. <b className="text-foreground">{pct}</b>/180</span>
                    {pass && <Badge variant="outline" className="text-[9px] border-emerald-500/50 text-emerald-600 dark:text-emerald-300">pass</Badge>}
                    <span className="text-[10px] text-muted-foreground w-14 text-right">{new Date(q.ts).toLocaleDateString()}</span>
                  </div>
                );
              })}
            </div>
          </CardContent></Card>
        )}
        {study.quizLog.filter(q => !q.kind.startsWith('exam:')).length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-2">Recent quiz results</h3>
            <div className="space-y-1">
              {[...study.quizLog].reverse().filter(q => !q.kind.startsWith('exam:')).slice(0, 8).map((q, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg border px-3 py-1.5 text-sm bg-card">
                  <span>{q.kind}</span>
                  <span className="text-muted-foreground">{q.correct}/{q.total} · {new Date(q.ts).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (strokeRun) {
    return <StrokeQuizGame kanjiList={strokeRun} onExit={() => setStrokeRun(null)} />;
  }

  if (!quiz) return null;

  if (finished) {
    const pct = Math.round((score.correct / quiz.length) * 100);
    return (
      <div className="max-w-xl mx-auto text-center space-y-5 py-10">
        <Trophy className={`h-14 w-14 mx-auto ${pct >= 80 ? 'text-amber-500' : 'text-muted-foreground'}`} />
        <h2 className="text-2xl font-bold">{pct >= 90 ? '素晴らしい!' : pct >= 70 ? 'よくできました!' : 'Keep practicing!'}</h2>
        <p className="text-muted-foreground">{score.correct} / {quiz.length} correct ({pct}%)</p>
        <Progress value={pct} className="h-2 max-w-xs mx-auto" />
        {wrongList.length > 0 && (
          <div className="rounded-xl border p-4 text-left">
            <div className="text-sm font-semibold mb-1.5">Missed items</div>
            <div className="flex flex-wrap gap-1.5">{wrongList.map((w, i) => <Badge key={i} variant="destructive" className="jp-sans">{w}</Badge>)}</div>
          </div>
        )}
        <div className="flex gap-2 justify-center">
          <Button onClick={start}><RotateCcw className="h-4 w-4 mr-1" />Retry same settings</Button>
          <Button variant="outline" onClick={() => setQuiz(null)}>Change quiz</Button>
        </div>
      </div>
    );
  }

  const q = quiz[qi];
  const isInputQ = !q.choices || q.choices.length === 0;
  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>Question {qi + 1} / {quiz.length}</span>
        <span className="flex gap-3"><span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />{score.correct}</span><span className="text-red-500 flex items-center gap-1"><XCircle className="h-3.5 w-3.5" />{score.wrong}</span></span>
      </div>
      <Progress value={(qi / quiz.length) * 100} className="h-1.5" />
      <Card className="min-h-48 flex items-center justify-center seigaiha-bg" onClick={() => picked && q.speakText && speak(q.speakText)}>
        <CardContent className="p-8 text-center space-y-2">
          {picked && q.speakText && <Button size="icon" variant="ghost" className="mx-auto mb-2" onClick={e => { e.stopPropagation(); speak(q.speakText!); }} aria-label="play"><Volume2 className="h-5 w-5" /></Button>}
          <div className={`${kind === 'kanji-meaning' ? 'text-6xl jp-serif' : 'jp-sans text-2xl'} font-medium`}>{q.prompt}</div>
          {q.promptSub && <div className="text-sm text-muted-foreground">{q.promptSub}</div>}
          {isInputQ && picked && (
            <div className={`pt-1 font-semibold jp-sans ${picked.startsWith('✗') ? 'text-red-500' : 'text-emerald-600'}`}>
              {picked.startsWith('✗') ? <>惜しい！ correct reading: <span className="underline">{q.answer}</span></> : '正解！'}
            </div>
          )}
        </CardContent>
      </Card>
      {isInputQ ? (
        <ReadingRecallInput key={qi} disabled={!!picked} onSubmit={submitTyped} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {q.choices.map(c => {
            const isAnswer = c === q.answer;
            const isPicked = picked === c;
            let cls = 'border hover:border-primary/50';
            if (picked) {
              if (isAnswer) cls = 'border-emerald-500 bg-emerald-500/10';
              else if (isPicked) cls = 'border-red-500 bg-red-500/10';
              else cls = 'border opacity-50';
            }
            return (
              <Button key={c} variant="outline" className={`h-12 justify-start jp-sans text-base ${cls}`} onClick={() => pick(c)} disabled={!!picked}>{c}</Button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Typed reading input for the recall quiz — romaji or kana, Enter to submit (keyed per question) */
function ReadingRecallInput({ disabled, onSubmit }: { disabled: boolean; onSubmit: (v: string) => void }) {
  const [val, setVal] = useState('');
  return (
    <form
      className="flex gap-2"
      onSubmit={e => { e.preventDefault(); if (!disabled && val.trim()) onSubmit(val); }}
    >
      <div className="relative flex-1">
        <Keyboard className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          autoFocus
          value={val}
          onChange={e => setVal(e.target.value)}
          disabled={disabled}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="Type the reading — kana or romaji (e.g. たべる / taberu)…"
          aria-label="reading answer"
          className="w-full h-12 pl-9 pr-3 rounded-lg border bg-card jp-sans text-base outline-none transition focus:border-primary focus:ring-1 focus:ring-primary disabled:opacity-60"
        />
      </div>
      <Button type="submit" size="lg" className="gap-1" disabled={disabled || !val.trim()}><Send className="h-4 w-4" />Check</Button>
    </form>
  );
}

function shortPitchLabel(p: string): string {
  const v = p.split(';')[0];
  if (v === '0') return '平板 (heiban) [0]';
  if (v === '1') return '頭高 (atamadaka) [1]';
  if (v === '-1') return '尾高 (odaka) [-1]';
  const n = parseInt(v);
  if (isNaN(n)) return '平板 (heiban) [0]';
  return `中高 (nakadaka) [${n}]`;
}

// ---------------- Stroke-order game (click strokes in writing order) ----------------
function StrokeQuizGame({ kanjiList, onExit }: { kanjiList: string[]; onExit: () => void }) {
  const study = useStudy();
  const [qi, setQi] = useState(0);
  const [paths, setPaths] = useState<string[] | null>(null);
  const [next, setNext] = useState(0);        // next stroke index the user must click (render mirror)
  const [mistakes, setMistakes] = useState(0);          // mistakes for current kanji (render mirror)
  const [totalMistakes, setTotalMistakes] = useState(0);
  const [totalCorrect, setTotalCorrect] = useState(0);
  const [perfect, setPerfect] = useState(0);
  const [flash, setFlash] = useState<number | null>(null); // wrongly clicked stroke
  const [celebrate, setCelebrate] = useState(false);
  const [done, setDone] = useState(false);
  const [missed, setMissed] = useState<string[]>([]);
  const ch = kanjiList[qi];
  // refs = source of truth (robust against same-frame rapid clicks)
  const nextRef = useRef(0);
  const mistakesRef = useRef(0);
  const totalCorrectRef = useRef(0);
  const totalMistakesRef = useRef(0);
  const perfectRef = useRef(0);
  const missedRef = useRef<string[]>([]);
  const finishedRef = useRef(false);
  const lockRef = useRef(false); // true while celebrating / waiting to advance

  useEffect(() => {
    let alive = true;
    loadStrokes(ch).then(p => {
      if (!alive) return;
      setPaths(p && p.length ? p : []);
      nextRef.current = 0; mistakesRef.current = 0; lockRef.current = false;
      setNext(0); setMistakes(0); setCelebrate(false);
    });
    return () => { alive = false; };
  }, [ch]);

  const finish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const total = totalCorrectRef.current + totalMistakesRef.current;
    study.logQuiz('stroke-order', totalCorrectRef.current, total, missedRef.current);
    if (total > 0) toast({ title: 'Game complete! 🖌️', description: `${perfectRef.current} perfect · ${totalMistakesRef.current} mis-clicks` });
    setDone(true);
  };

  const advance = () => {
    if (qi + 1 >= kanjiList.length) { finish(); return; }
    setTimeout(() => setQi(i => i + 1), 850);
  };

  const clickStroke = (i: number) => {
    if (!paths || lockRef.current || done) return;
    if (i === nextRef.current) {
      nextRef.current = i + 1;
      totalCorrectRef.current += 1;
      setTotalCorrect(totalCorrectRef.current);
      setNext(i + 1);
      if (nextRef.current >= paths.length) {
        lockRef.current = true;
        setCelebrate(true);
        if (mistakesRef.current === 0) perfectRef.current += 1;
        setPerfect(perfectRef.current);
        advance();
      }
    } else {
      mistakesRef.current += 1;
      totalMistakesRef.current += 1;
      setMistakes(mistakesRef.current);
      setTotalMistakes(totalMistakesRef.current);
      setFlash(i);
      setTimeout(() => setFlash(null), 380);
    }
  };

  const skip = () => {
    if (!paths || lockRef.current || done) return;
    lockRef.current = true;
    missedRef.current = [...missedRef.current, ch];
    setMissed(missedRef.current);
    totalMistakesRef.current += (paths.length - nextRef.current);
    setTotalMistakes(totalMistakesRef.current);
    advance();
  };

  if (done) {
    const total = totalCorrect + totalMistakes;
    const acc = total ? Math.round((totalCorrect / total) * 100) : 0;
    return (
      <div className="max-w-xl mx-auto text-center space-y-5 py-10">
        <Brush className={`h-14 w-14 mx-auto ${acc >= 90 ? 'text-amber-500' : 'text-muted-foreground'}`} />
        <h2 className="text-2xl font-bold">{perfect === kanjiList.length && kanjiList.length > 0 ? '完璧！ All perfect!' : acc >= 90 ? '見事！ Great writing sense!' : 'Keep practicing!'}</h2>
        <p className="text-muted-foreground">{kanjiList.length} kanji · {perfect} written perfectly · {acc}% stroke accuracy</p>
        <Progress value={acc} className="h-2 max-w-xs mx-auto" />
        {missed.length > 0 && (
          <div className="rounded-xl border p-4 text-left">
            <div className="text-sm font-semibold mb-1.5">Kanji you skipped</div>
            <div className="flex flex-wrap gap-1.5">{missed.map((c, i) => <Badge key={i} variant="outline" className="jp-serif text-base">{c}</Badge>)}</div>
          </div>
        )}
        <Button variant="outline" onClick={onExit}><RotateCcw className="h-4 w-4 mr-1" />Back to Quiz Center</Button>
      </div>
    );
  }

  const kanjiMeta = KANJI.find(k => k.c === ch);
  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <button className="flex items-center gap-1 hover:text-foreground transition" onClick={onExit}><XCircle className="h-4 w-4" />Exit game</button>
        <span>Kanji {qi + 1} / {kanjiList.length}</span>
        <span className="flex gap-3">
          <span className="text-amber-600 flex items-center gap-1"><Flame className="h-3.5 w-3.5" />{totalMistakes}</span>
          <span className="text-emerald-600 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />{totalCorrect}</span>
        </span>
      </div>
      <Progress value={(qi / kanjiList.length) * 100} className="h-1.5" />
      <Card className="seigaiha-bg overflow-hidden">
        <CardContent className="p-6 sm:p-8 flex flex-col items-center gap-4">
          <div className="flex items-center gap-2 flex-wrap justify-center">
            <span className="text-3xl jp-serif font-bold">{ch}</span>
            {kanjiMeta && <span className="text-xs text-muted-foreground">{kanjiMeta.m[0]} · {paths?.length ?? kanjiMeta.st} strokes</span>}
          </div>
          {paths === null ? (
            <div className="w-64 h-64 rounded-xl border bg-card animate-pulse flex items-center justify-center text-xs text-muted-foreground">loading strokes…</div>
          ) : paths.length === 0 ? (
            <div className="w-64 h-64 rounded-xl border bg-card flex flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <span>No stroke data for {ch}</span>
              <Button size="sm" variant="secondary" onClick={skip}>Skip →</Button>
            </div>
          ) : (
            <div className={`relative rounded-xl overflow-hidden border border-primary/15 shadow-inner transition-transform ${celebrate ? 'scale-105' : ''}`} style={{ width: 264, height: 264, background: 'linear-gradient(135deg, hsl(var(--card)) 0%, hsl(var(--primary) / 0.05) 100%)' }}>
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 109 109" aria-hidden>
                <line x1="54.5" y1="0" x2="54.5" y2="109" stroke="currentColor" strokeWidth="0.4" className="text-primary/15" />
                <line x1="0" y1="54.5" x2="109" y2="54.5" stroke="currentColor" strokeWidth="0.4" className="text-primary/15" />
                <line x1="0" y1="0" x2="109" y2="109" stroke="currentColor" strokeWidth="0.25" className="text-primary/10" strokeDasharray="2 3" />
                <line x1="109" y1="0" x2="0" y2="109" stroke="currentColor" strokeWidth="0.25" className="text-primary/10" strokeDasharray="2 3" />
              </svg>
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 109 109" role="img" aria-label={`stroke order game for ${ch}`}>
                {/* ghost outline of full kanji */}
                {paths.map((d, i) => (
                  <path key={`g${i}`} d={d} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-foreground/10" />
                ))}
                {/* revealed strokes */}
                {paths.map((d, i) => (
                  i < next ? (
                    <path key={`r${i}`} d={d} fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" className={flash === i ? 'text-red-500' : 'text-foreground'} />
                  ) : null
                ))}
                {/* clickable hit areas (next stroke = hint pulse) */}
                {paths.map((d, i) => (
                  <path
                    key={`h${i}`}
                    d={d}
                    fill="none"
                    stroke={flash === i ? 'hsl(0 84% 55% / 0.65)' : 'transparent'}
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="cursor-pointer transition-[stroke] duration-200"
                    style={{ pointerEvents: 'stroke' }}
                    onClick={() => clickStroke(i)}
                    aria-label={`stroke ${i + 1}`}
                  />
                ))}
                {/* celebration mark */}
                {celebrate && (
                  <text x="54.5" y="58" textAnchor="middle" fontSize="14" fontWeight="800" style={{ fill: 'hsl(var(--primary))' }}>完璧!</text>
                )}
              </svg>
              <div className="absolute top-2 left-2.5 text-[11px] font-medium text-primary bg-background/85 rounded-full px-2 py-0.5 shadow-sm">
                stroke {Math.min(next + 1, paths.length)} / {paths.length}{mistakes > 0 && <span className="text-amber-600 ml-1.5">✗{mistakes}</span>}
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground text-center max-w-sm">
            {paths && paths.length > 0 ? 'Click the strokes in writing order — general rule: top → bottom, left → right. Red flash = wrong stroke.' : '\u00A0'}
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" className="text-xs" onClick={skip}>Skip kanji</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function buildQuiz(kind: QuizKind, jlpt: string, count: number) {
  const pool = jlpt === 'all' ? WORDS : WORDS.filter(w => w.j === Number(jlpt));
  const kPool = jlpt === 'all' ? KANJI : KANJI.filter(k => k.j === Number(jlpt));
  const questions: Array<{ prompt: string; promptSub?: string; choices: string[]; answer: string; speakText?: string; input?: boolean }> = [];
  if (kind === 'kanji-meaning') {
    const source = (kPool.length >= 8 ? kPool : KANJI);
    const sample = shuffle(source).slice(0, count);
    for (const k of sample) {
      const others = shuffle(KANJI.filter(x => x.c !== k.c)).slice(0, 3).map(x => x.m[0]);
      questions.push({ prompt: k.c, choices: shuffle([k.m[0], ...others]), answer: k.m[0] });
    }
  } else if (kind === 'word-reading') {
    const source = pool.filter(w => w.k).length >= 8 ? pool.filter(w => w.k) : WORDS.filter(w => w.k);
    for (const w of shuffle(source).slice(0, count)) {
      const others = shuffle(WORDS.filter(x => x.id !== w.id && x.a[0] !== w.a[0])).slice(0, 3).map(x => x.a[0]);
      questions.push({ prompt: w.k || w.a[0], choices: shuffle([w.a[0], ...others]), answer: w.a[0], speakText: w.k || w.a[0] });
    }
  } else if (kind === 'word-meaning') {
    for (const w of shuffle(pool).slice(0, count)) {
      const others = shuffle(WORDS.filter(x => x.id !== w.id)).slice(0, 3).map(x => x.s[0]?.gloss || '?');
      questions.push({ prompt: w.k || w.a[0], promptSub: w.a[0], choices: shuffle([w.s[0]?.gloss || '?', ...others]), answer: w.s[0]?.gloss || '?' });
    }
  } else if (kind === 'sentence-blank') {
    const sentences = jlpt === 'all' ? SENTENCES : SENTENCES.filter(s => s.j === Number(jlpt));
    const source = sentences.length >= 6 ? sentences : SENTENCES;
    for (const s of shuffle(source).slice(0, count)) {
      const wordsIn = [...new Set(s.ja.match(/[\u4e00-\u9faf々\u3040-\u309f]{2,}/g) || [])].filter(t => wordByText.has(t) || [...wordById.values()].some(w => w.k === t));
      const target = wordsIn[0];
      if (!target) continue;
      const realWord = [...wordById.values()].find(w => w.k === target) || undefined;
      const answer = realWord ? realWord.k! : target;
      const others = shuffle(WORDS.filter(w => w.k && w.k !== answer)).slice(0, 3).map(w => w.k!);
      questions.push({ prompt: s.ja.replace(answer, '＿＿'), promptSub: s.en, choices: shuffle([answer, ...others]), answer });
    }
  } else if (kind === 'reading-recall') {
    // type-the-reading: prefer kanji words with common readings, skip katakana-only loans (どれでも読みが曖昧)
    const withReading = pool.filter(w => w.k && w.a[0] && (w.f ?? 99999) <= 3000);
    const source = withReading.length >= 8 ? withReading : WORDS.filter(w => w.k && w.a[0]);
    for (const w of shuffle(source).slice(0, count)) {
      questions.push({
        prompt: w.k!,
        promptSub: w.s[0]?.gloss ? `meaning: ${w.s[0].gloss}` : undefined,
        choices: [],
        answer: w.a[0],
        input: true,
      });
    }
  } else if (kind === 'kana-romaji') {
    const KANA = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんがぎぐげござじずぜぞだでどばびぶべぼぱぴぷぺぽゃゅょっ'.split('');
    for (let i = 0; i < count; i++) {
      const k = KANA[Math.floor(Math.random() * KANA.length)];
      const rom = hiraToRomaji(k) || k;
      const others = shuffle(KANA.filter(x => x !== k)).slice(0, 3).map(x => hiraToRomaji(x) || x);
      questions.push({ prompt: k, choices: shuffle([rom, ...others]), answer: rom });
    }
  } else if (kind === 'pitch') {
    const withPitch = pool.filter(w => w.p && w.a[0] && w.p.split(';')[0] !== '-1');
    const source = withPitch.length >= 8 ? withPitch : WORDS.filter(w => w.p && w.a[0]);
    for (const w of shuffle(source).slice(0, count)) {
      const pVal = w.p;
      const pat = pitchPattern(w);
      if (!pVal || !pat) continue;
      const n = pat.mora.length;
      const answer = shortPitchLabel(pVal);
      const distractors = new Set<string>();
      const candidates = ['平板 (heiban) [0]', '頭高 (atamadaka) [1]', '尾高 (odaka) [-1]'];
      if (n >= 2) for (let d = 2; d <= Math.min(4, n); d++) candidates.push(`中高 (nakadaka) [${d}]`);
      shuffle(candidates);
      for (const c of candidates) { if (c !== answer && distractors.size < 3) distractors.add(c); }
      if (distractors.size < 3) continue;
      questions.push({ prompt: w.k || w.a[0], promptSub: `${w.a[0]} · ${n} morae — pick the pitch pattern`, choices: shuffle([answer, ...distractors]), answer, speakText: w.k || w.a[0] });
    }
  } else if (kind === 'listening') {
    for (const w of shuffle(pool.filter(x => x.a[0])).slice(0, count)) {
      const others = shuffle(WORDS.filter(x => x.id !== w.id)).slice(0, 3).map(x => x.s[0]?.gloss || '?');
      questions.push({ prompt: '🔊 Listen…', choices: shuffle([w.s[0]?.gloss || '?', ...others]), answer: w.s[0]?.gloss || '?', speakText: w.k || w.a[0] });
    }
  } else if (kind === 'grammar') {
    const gPool = jlpt === 'all' ? GRAMMAR : GRAMMAR.filter(g => String(g.j) === jlpt);
    const source = gPool.length >= 8 ? gPool : GRAMMAR;
    for (const g of shuffle(source).slice(0, count)) {
      const segs = g.p.split('〜').filter(Boolean);
      const full = segs.join('');
      const longest = [...segs].sort((a, b) => b.length - a.length)[0] || '';
      let clozeSentence = '';
      for (const core of [full, longest]) {
        if (core.length < 2) continue;
        const ex = g.ex.find(e => e.ja.includes(core));
        if (ex) { clozeSentence = ex.ja.replace(core, '＿＿'); break; }
      }
      const others = shuffle(GRAMMAR.filter(x => x.id !== g.id && x.m !== g.m)).slice(0, 3).map(x => x.p);
      if (others.length < 3) continue;
      if (clozeSentence) {
        questions.push({ prompt: clozeSentence, promptSub: `意味: ${g.m} — pick the pattern that fills the blank`, choices: shuffle([g.p, ...others]), answer: g.p });
      } else {
        questions.push({ prompt: g.m, promptSub: `${g.form} — pick the matching pattern`, choices: shuffle([g.p, ...others]), answer: g.p });
      }
    }
  } else if (kind === 'conjugation') {
    const conjugables = pool.filter(w => verbClass(w));
    const source = conjugables.length >= 8 ? conjugables : WORDS.filter(w => verbClass(w));
    for (const w of shuffle(source).slice(0, count * 2)) {
      const c = conjugate(w);
      if (!c || c.forms.length < 4) continue;
      // pick a random non-trivial form (skip masu-stem which often equals dictionary info)
      const candidates = c.forms.filter(f => f.form && f.form !== w.a[0]);
      if (candidates.length < 4) continue;
      const target = candidates[Math.floor(Math.random() * candidates.length)];
      // distractors: forms of the same verb (plausible but wrong) then other verbs' forms
      const sameForms = shuffle(c.forms.filter(f => f.form !== target.form && f.form && f.form !== w.a[0])).slice(0, 2).map(f => f.form);
      const others = shuffle(WORDS.filter(x => x.id !== w.id && verbClass(x) && x.a[0] !== w.a[0]).slice(0, 30))
        .map(x => conjugate(x))
        .filter(xc => xc)
        .map(xc => xc!.forms.find(f => f.name === target.name && f.form !== target.form)?.form)
        .filter((f): f is string => !!f);
      const distractors = [...new Set([...sameForms, ...others])].slice(0, 3);
      if (distractors.length < 3) continue;
      questions.push({
        prompt: w.k || w.a[0],
        promptSub: `${w.a[0]} (${c.cls === 'ru' ? 'ichidan' : c.cls === 'u' ? 'godan' : c.cls}) — give the ${target.name.toLowerCase()}`,
        choices: shuffle([target.form, ...distractors]),
        answer: target.form,
        speakText: w.k || w.a[0],
      });
    }
  }
  return questions.filter(q => q.input || q.choices.filter(Boolean).length === 4).slice(0, count);
}

import { wordByText } from '@/lib/dict/index';

export function StudyViews({ view }: { view: 'study' | 'quizzes' }) {
  return view === 'study' ? <StudyView /> : <QuizzesView />;
}
