'use client';
// Manage views: Dashboard, Lists & Tags, Statistics, Settings, About
import React, { useEffect, useMemo, useState } from 'react';
import { useTheme } from 'next-themes';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import {
  Flame, CalendarDays, GraduationCap, BookA, SquarePen, Plus, Trash2, Pencil,
  Download, Upload, Printer, Star, Tags as TagsIcon, Search, NotebookPen, Zap,
  Palette, Type, Database, Keyboard, Heart, Info, Copyright, Award, Sparkles, BarChart3,
  Timer, MonitorSmartphone, CalendarClock, History as HistoryIcon, CheckCircle2, Map as MapIcon, ClipboardCheck, Target,
  Eye, ChevronRight, Layers,
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip as RTooltip, PieChart, Pie, Cell, CartesianGrid, LineChart, Line } from 'recharts';
import { buildForecast, longestStreak, estimatedRetention, formatInterval } from '@/lib/srs';
import { PASS_MARKS } from '@/lib/exam';
import type { JlptLevel } from '@/lib/dict/types';
import { WORDS, KANJI, SENTENCES, EXPRESSIONS, GRAMMAR, wordById, kanjiByChar } from '@/lib/dict/index';
import { hiraToRomaji } from '@/lib/dict/convert';
import { dateInfo } from '@/lib/kana-tools';
import { ACHIEVEMENTS, evaluateAchievements } from '@/lib/achievements';
import { currentStreakWithFreezes, getFreezes, useStreakInfo } from '@/lib/freezes';
import { useLibrary, useSettings, useStudy, useUi, type ViewId, PALETTE, furiMode } from '@/lib/stores';
import { useSpeak, downloadFile, todayKey, dayKeyOffset } from '@/lib/client';
import { FuriganaText, JlptBadge } from '../entry-cards';

// ==================================================================== DASHBOARD

/** Resolve an SRS card key ("w:123", "k:食", "s:500001", "e:4", "g:42") to a human label. */
function reviewKeyLabel(key: string): string {
  const kind = key[0];
  const id = key.slice(2);
  if (kind === 'w') { const w = wordById.get(Number(id)); return w ? (w.k || w.a[0]) : id; }
  if (kind === 'k') return id;
  if (kind === 's') { const s = SENTENCES.find(x => x.id === Number(id)); return s ? s.ja.slice(0, 18) + (s.ja.length > 18 ? '…' : '') : id; }
  if (kind === 'e') { const e = EXPRESSIONS.find(x => x.id === Number(id)); return e ? e.expr : id; }
  if (kind === 'g') { const g = GRAMMAR.find(x => x.id === Number(id)); return g ? g.p : id; }
  return id;
}
/**
 * Build an Anki-importable TSV deck (#separator:tab header format) from enrolled SRS cards.
 * Front/Back are resolved per card kind; Tags carry kind + JLPT level for deck filtering.
 */
function buildAnkiDeckTsv(): string {
  const study = useStudy.getState();
  const rows: string[] = ['#separator:tab', '#html:true', '#columns:Front\tBack\tTags'];
  const esc = (s: string) => s.replace(/\t/g, ' ').replace(/\n/g, '<br>');
  for (const key of Object.keys(study.cards)) {
    const kind = key[0];
    const id = key.slice(2);
    let front = '', back = '', tags = 'bunsan';
    if (kind === 'w') {
      const w = wordById.get(Number(id));
      if (!w) continue;
      front = w.k ? `${w.k}［${w.a[0]}］` : w.a[0];
      back = w.s.map(s => s.gloss).join('; ');
      if (w.j) tags += ` jlpt-N${w.j}`;
    } else if (kind === 'k') {
      const k = kanjiByChar.get(id);
      if (!k) continue;
      front = id;
      back = `${k.st} strokes — ${k.m.join(', ')}` + (k.on.length ? `<br>ON: ${k.on.join(' ')}` : '') + (k.kun.length ? `<br>KUN: ${k.kun.join(' ')}` : '');
      if (k.j) tags += ` jlpt-N${k.j}`;
    } else if (kind === 's') {
      const s = SENTENCES.find(x => x.id === Number(id));
      if (!s) continue;
      front = s.ja;
      back = s.en || '';
      tags += ' sentence';
    } else if (kind === 'e') {
      const e = EXPRESSIONS.find(x => x.id === Number(id));
      if (!e) continue;
      front = e.expr;
      back = e.m || '';
      tags += ' expression';
    } else if (kind === 'g') {
      const g = GRAMMAR.find(x => x.id === Number(id));
      if (!g) continue;
      front = `${g.p} — ${g.m}`;
      back = `${g.form ? `Formation: ${g.form}<br>` : ''}${g.ex.map(e => `${e.ja} — ${e.en}`).join('<br>')}`;
      if (g.j) tags += ` jlpt-N${g.j}`;
      tags += ' grammar';
    } else continue;
    rows.push(`${esc(front)}\t${esc(back)}\t${tags}`);
  }
  return rows.join('\n');
}

/** Shared full-backup JSON builder (used by Settings export + dashboard reminder). */
function buildBackupJson(): string {
  const library = useLibrary.getState();
  const study = useStudy.getState();
  const settings = useSettings.getState();
  return JSON.stringify({
    version: 1, exportedAt: new Date().toISOString(),
    library: { lists: library.lists, tags: library.tags, notes: library.notes, savedSearches: library.savedSearches, favorites: library.favorites, entryTags: library.entryTags, history: library.history, viewHistory: library.viewHistory },
    study: { cards: study.cards, reviewLog: study.reviewLog, quizLog: study.quizLog, activity: study.activity },
    settings: { ...settings },
  }, null, 2);
}

/** Gentle nudge to export a backup when data lives only in this browser (30-day cadence). */
function BackupReminderCard() {
  const [show, setShow] = useState(false);
  const [days, setDays] = useState<number | null>(null);
  useEffect(() => {
    Promise.resolve().then(() => {
      try {
        const snooze = Number(localStorage.getItem('bunsan-backup-snooze') || 0);
        if (Date.now() < snooze) return;
        const last = Number(localStorage.getItem('bunsan-last-backup') || 0);
        if (last && Date.now() - last < 30 * 86_400_000) return;
        setDays(last ? Math.floor((Date.now() - last) / 86_400_000) : null);
        setShow(true);
      } catch { /* ignore */ }
    });
  }, []);
  if (!show) return null;
  const dismiss = () => {
    try { localStorage.setItem('bunsan-backup-snooze', String(Date.now() + 7 * 86_400_000)); } catch { /* ignore */ }
    setShow(false);
  };
  const doBackup = () => {
    downloadFile(buildBackupJson(), `bunsan-backup-${todayKey()}.json`, 'application/json');
    try { localStorage.setItem('bunsan-last-backup', String(Date.now())); } catch { /* ignore */ }
    setShow(false);
    toast({ title: 'Backup downloaded', description: 'Your lists, progress and settings are safe.' });
  };
  return (
    <div className="rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-500/10 to-transparent px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 anim-fade-up" role="status">
      <div className="flex items-start gap-2.5 min-w-0">
        <Database className="h-4.5 w-4.5 mt-0.5 text-amber-600 shrink-0" />
        <div className="text-sm min-w-0">
          <b>Backup reminder:</b> your lists, SRS progress and notes live only in this browser.
          <span className="text-muted-foreground"> {days === null ? 'You have never exported a backup.' : `Last backup was ${days} day${days === 1 ? '' : 's'} ago.`}</span>
        </div>
      </div>
      <div className="sm:ml-auto flex gap-2 shrink-0">
        <Button size="sm" variant="ghost" className="text-muted-foreground" onClick={dismiss}>Later</Button>
        <Button size="sm" variant="outline" className="border-amber-500/50 hover:bg-amber-500/10" onClick={doBackup}><Download className="h-3.5 w-3.5 mr-1" />Export backup</Button>
      </div>
    </div>
  );
}

export function DashboardView() {
  const study = useStudy();
  const settings = useSettings();
  const ui = useUi();
  const library = useLibrary();
  const date = useMemo(() => dateInfo(), []);
  const speak = useSpeak();

  const wotd = useMemo(() => {
    const seed = new Date().toDateString().split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    return WORDS.filter(w => w.j && w.j >= 4)[seed % Math.max(1, WORDS.filter(w => w.j && w.j >= 4).length)] || WORDS[0];
  }, []);
  const kotd = useMemo(() => {
    const seed = new Date().getDate() + new Date().getMonth() * 31;
    return KANJI.filter(k => k.g)[seed % Math.max(1, KANJI.filter(k => k.g).length)] || KANJI[0];
  }, []);

  const now = Date.now();
  const due = Object.values(study.cards).filter(c => c.state !== 'new' && c.due <= now).length;
  const fresh = Object.values(study.cards).filter(c => c.state === 'new').length;
  const todayReviews = study.activity[todayKey()] || 0;
  const baseStreak = computeStreak(study.activity);
  const { streak: fzStreak, freezes } = useStreakInfo(study.activity, baseStreak);
  const streak = Math.max(baseStreak, fzStreak);
  const goalPct = Math.min(100, Math.round((todayReviews / settings.dailyGoal) * 100));

  return (
    <div className="space-y-5">
      {/* hero */}
      <div className="rounded-2xl border bg-gradient-to-br from-primary/10 via-card to-card seigaiha-bg hero-shimmer p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row lg:items-end gap-5">
          <div className="flex-1">
            <p className="text-sm text-muted-foreground flex items-center gap-2"><CalendarDays className="h-4 w-4" />{date.kanji}</p>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mt-1">Welcome back <span className="text-primary">分散辞書</span></h1>
            <p className="text-muted-foreground mt-1.5 max-w-xl">Your advanced Japanese dictionary & study platform — {WORDS.length.toLocaleString()} words, {KANJI.length.toLocaleString()} kanji, {SENTENCES.length} sentences, SRS, quizzes and 20+ tools.</p>
            <div className="flex flex-wrap gap-2 mt-4">
              <Button onClick={() => ui.setView('study')}><GraduationCap className="h-4 w-4 mr-1.5" />Study {due > 0 ? `(${due} due)` : 'now'}</Button>
              <Button variant="outline" onClick={() => ui.setView('words')}><BookA className="h-4 w-4 mr-1.5" />Browse words</Button>
              <Button variant="outline" onClick={() => ui.setView('quizzes')}><Zap className="h-4 w-4 mr-1.5" />Take a quiz</Button>
            </div>
          </div>
          <div className="flex gap-3">
            <div className="rounded-xl border bg-card p-4 text-center min-w-24 relative overflow-hidden">
              <Flame className={`h-5 w-5 mx-auto ${streak > 0 ? 'text-orange-500' : 'text-muted-foreground/40'}`} />
              <div className="text-2xl font-bold mt-1">{streak}</div>
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">day streak</div>
              {freezes > 0 && (
                <div className="mt-0.5 inline-flex items-center gap-0.5 rounded-full bg-sky-500/10 px-1.5 py-px text-[9px] font-medium text-sky-600 dark:text-sky-300" title={`${freezes} streak freeze${freezes === 1 ? '' : 's'} banked — protects against a missed day`}>
                  ❄ {freezes} freeze{freezes === 1 ? '' : 's'}
                </div>
              )}
              {streak >= 3 && <span className="absolute -right-1 -bottom-1 text-2xl opacity-20 jp-serif" aria-hidden>炎</span>}
            </div>
            <div className={`rounded-xl border p-4 text-center min-w-24 relative overflow-hidden ${goalPct >= 100 ? 'border-emerald-500/50 bg-emerald-500/10' : 'bg-card'}`}>
              {goalPct >= 100 ? (
                <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 300, damping: 15 }}>
                  <CheckCircle2 className="h-5 w-5 mx-auto text-emerald-500" />
                  <div className="text-2xl font-bold mt-1 text-emerald-600 dark:text-emerald-400">100%</div>
                  <div className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 uppercase tracking-wide">goal reached!</div>
                </motion.div>
              ) : (
                <>
                  <Award className="h-5 w-5 mx-auto text-primary" />
                  <div className="text-2xl font-bold mt-1">{todayReviews}</div>
                  <div className="text-[10px] text-muted-foreground uppercase tracking-wide">today · goal {goalPct}%</div>
                </>
              )}
            </div>
          </div>
        </div>
        <Progress value={goalPct} className="h-1.5 mt-4 max-w-md" />
      </div>

      <BackupReminderCard />

      {/* cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {/* word of the day */}
        <Card className="overflow-hidden"><CardContent className="p-0">
          <div className="px-4 pt-4 pb-2 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-primary">Word of the day</span>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => speak(wotd.k || wotd.a[0])} aria-label="audio">🔊</Button>
          </div>
          <div className="px-4 pb-4">
            <div className="flex items-center gap-2 flex-wrap">
              <button className="hover:text-primary transition" onClick={() => ui.openWord(wotd.id)}>
                <FuriganaText kanji={wotd.k || wotd.a[0]} kana={wotd.k ? wotd.a[0] : undefined} size="text-3xl" />
              </button>
              <JlptBadge level={wotd.j} />
            </div>
            <div className="text-xs text-muted-foreground mt-1">{wotd.a.join('・')} <i>{wotd.a[0] && hiraToRomaji(wotd.a[0])}</i></div>
            <p className="text-sm mt-2">{wotd.s.map(s => s.gloss).join('; ')}</p>
          </div>
        </CardContent></Card>
        {/* kanji of the day */}
        <Card className="overflow-hidden"><CardContent className="p-0">
          <div className="px-4 pt-4 pb-2"><span className="text-xs font-semibold uppercase tracking-wide text-primary">Kanji of the day</span></div>
          <div className="px-4 pb-4 flex items-center gap-4">
            <button className="w-20 h-20 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/15 flex items-center justify-center shrink-0 hover:scale-105 transition" onClick={() => ui.openKanji(kotd.c)} aria-label={kotd.c}>
              <span className="text-4xl jp-serif">{kotd.c}</span>
            </button>
            <div className="min-w-0">
              <div className="text-sm font-medium line-clamp-2">{kotd.m.join(', ')}</div>
              <div className="text-xs text-muted-foreground mt-1">ON {kotd.on.slice(0, 2).join(' ')}</div>
              <div className="text-xs text-muted-foreground">KUN {kotd.kun.slice(0, 2).join(' ')}</div>
              <div className="text-[10px] text-muted-foreground mt-1">{kotd.st} strokes {kotd.g ? `· grade ${kotd.g}` : ''}</div>
            </div>
          </div>
        </CardContent></Card>
        {/* srs summary */}
        <Card><CardContent className="p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-primary mb-3">Study queue</div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg bg-red-500/10 py-3"><div className="text-xl font-bold text-red-600">{due}</div><div className="text-[10px] text-muted-foreground">due</div></div>
            <div className="rounded-lg bg-amber-500/10 py-3"><div className="text-xl font-bold text-amber-600">{fresh}</div><div className="text-[10px] text-muted-foreground">new</div></div>
            <div className="rounded-lg bg-emerald-500/10 py-3"><div className="text-xl font-bold text-emerald-600">{Object.keys(study.cards).length}</div><div className="text-[10px] text-muted-foreground">total</div></div>
          </div>
          <Button size="sm" variant="outline" className="w-full mt-3" onClick={() => ui.setView('study')}>Open study session</Button>
        </CardContent></Card>
      </div>

      {/* recently viewed strip */}
      <RecentlyViewedCard />

      {/* heatmap + quick */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2"><CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold">Activity (last 12 weeks)</span>
            <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => ui.setView('stats')}>Full statistics →</Button>
          </div>
          <HeatMap activity={study.activity} weeks={12} />
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-sm font-semibold mb-3">Quick actions</div>
          <div className="grid grid-cols-2 gap-2">
            {([['Random word', BookA, () => ui.openWord(WORDS[Math.floor(Math.random() * WORDS.length)].id)], ['Random kanji', SquarePen, () => ui.openKanji(KANJI[Math.floor(Math.random() * KANJI.length)].c)], ['Annotate text', NotebookPen, () => ui.setView('annotator' as ViewId)], ['Conjugate', Type, () => ui.setView('conjugator' as ViewId)], ['Kana tables', Palette, () => ui.setView('kana' as ViewId)], ['My lists', TagsIcon, () => ui.setView('lists' as ViewId)]] as const).map(([label, Icon, fn]) => (
              <Button key={label} variant="secondary" size="sm" className="h-9 text-xs justify-start gap-1.5 hover:bg-primary/10 hover:text-primary hover:border-primary/40 transition-colors" onClick={fn}><Icon className="h-3.5 w-3.5 text-primary/80" />{label}</Button>
            ))}
          </div>
          <Separator className="my-3" />
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-1">
            <Database className="h-3.5 w-3.5 text-primary/70" />{library.lists.reduce((a, l) => a + l.wordIds.length + l.kanjiChars.length + l.sentenceIds.length, 0)} entries across {library.lists.length} lists · {library.favorites.words.length + library.favorites.kanji.length} favorites
          </div>
        </CardContent></Card>
      </div>

      {/* JLPT vocabulary coverage */}
      <JlptCoverageCard />
    </div>
  );
}

// ==================================================================== RECENTLY VIEWED (dashboard)
function RecentlyViewedCard() {
  const ui = useUi();
  const viewHistory = useLibrary(s => s.viewHistory);
  const clearViewHistory = useLibrary(s => s.clearViewHistory);
  const items = viewHistory.slice(0, 14);
  if (items.length === 0) return null;
  return (
    <Card className="overflow-hidden"><CardContent className="p-4">
      <div className="flex items-center justify-between mb-3 gap-2">
        <span className="text-sm font-semibold flex items-center gap-1.5"><Eye className="h-4 w-4 text-primary" />Recently viewed <span className="jp-sans text-xs text-muted-foreground font-normal">閲覧履歴</span></span>
        <Button size="sm" variant="ghost" className="text-xs h-7 text-muted-foreground hover:text-destructive" onClick={clearViewHistory}>Clear</Button>
      </div>
      <div className="flex gap-2 overflow-x-auto bunsan-scroll pb-1 -mx-1 px-1">
        {items.map(v => {
          if (v.kind === 'words') {
            const w = wordById.get(Number(v.id));
            if (!w) return null;
            return (
              <button key={`w-${v.id}`} onClick={() => ui.openWord(w.id)} className="shrink-0 rounded-lg border bg-card px-3 py-2 text-left hover:border-primary/50 hover:bg-primary/5 transition" title={w.s[0]?.gloss}>
                <div className="jp-sans font-semibold text-sm">{w.k || w.a[0]}</div>
                <div className="text-[10px] text-muted-foreground max-w-32 truncate">{w.s[0]?.gloss}</div>
              </button>
            );
          }
          if (v.kind === 'kanji') {
            const k = kanjiByChar.get(v.id);
            if (!k) return null;
            return (
              <button key={`k-${v.id}`} onClick={() => ui.openKanji(k.c)} className="shrink-0 rounded-lg border bg-card px-3 py-2 text-left hover:border-primary/50 hover:bg-primary/5 transition" title={k.m.join(', ')}>
                <div className="jp-serif text-lg leading-none">{k.c}</div>
                <div className="text-[10px] text-muted-foreground max-w-24 truncate mt-0.5">{k.m[0]}</div>
              </button>
            );
          }
          const s = SENTENCES.find(x => x.id === Number(v.id));
          if (!s) return null;
          return (
            <button key={`s-${v.id}`} onClick={() => ui.openSentence(s.id)} className="shrink-0 rounded-lg border bg-card px-3 py-2 text-left hover:border-primary/50 hover:bg-primary/5 transition" title={s.en}>
              <div className="jp-sans text-sm max-w-44 truncate">{s.ja}</div>
              <div className="text-[10px] text-muted-foreground max-w-44 truncate">{s.en}</div>
            </button>
          );
        })}
      </div>
    </CardContent></Card>
  );
}

// ==================================================================== JLPT VOCAB COVERAGE (dashboard)
function JlptCoverageCard() {
  const study = useStudy();
  const ui = useUi();
  const rows = useMemo(() => ([5, 4, 3, 2, 1] as const).map(l => {
    const total = WORDS.filter(w => w.j === l).length;
    const enrolled = Object.keys(study.cards).reduce((a, k) => {
      if (!k.startsWith('w:')) return a;
      const w = wordById.get(Number(k.slice(2)));
      return w && w.j === l ? a + 1 : a;
    }, 0);
    return { l, total, enrolled, pct: total ? Math.round((enrolled / total) * 100) : 0 };
  }), [study.cards]);
  const totalAll = rows.reduce((a, r) => a + r.total, 0);
  const enrolledAll = rows.reduce((a, r) => a + r.enrolled, 0);
  const overall = totalAll ? Math.round((enrolledAll / totalAll) * 100) : 0;
  return (
    <Card className="overflow-hidden"><CardContent className="p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="text-sm font-semibold flex items-center gap-1.5"><GraduationCap className="h-4 w-4 text-primary" />JLPT vocabulary coverage <span className="jp-sans text-xs text-muted-foreground font-normal">語彙カバレッジ</span></div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">{overall}% of N5–N1 list</Badge>
          <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => ui.setView('words')}>Browse words →</Button>
        </div>
      </div>
      <div className="space-y-2">
        {rows.map(r => (
          <button
            key={r.l}
            className="w-full flex items-center gap-3 rounded-lg px-2 py-1.5 -mx-2 hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition group"
            onClick={() => { ui.setWordsJlptPreset(String(r.l)); ui.setView('words'); }}
            title={`Browse the ${r.total} N${r.l} words`}
            aria-label={`Browse N${r.l} vocabulary in Words view`}
          >
            <JlptBadge level={r.l} />
            <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-primary/70 to-primary transition-all duration-500 group-hover:from-primary group-hover:to-primary" style={{ width: `${r.pct}%` }} />
            </div>
            <span className="text-xs text-muted-foreground w-28 text-right tabular-nums">{r.enrolled} / {r.total} words · {r.pct}%</span>
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-primary group-hover:translate-x-0.5 transition" />
          </button>
        ))}
      </div>
      <div className="text-xs text-muted-foreground mt-3 pt-3 border-t flex flex-wrap items-center justify-between gap-1">
        <span>{enrolledAll.toLocaleString()} of {totalAll.toLocaleString()} graded dictionary words enrolled in SRS — enroll more from any word's detail sheet or via Lists bulk actions.</span>
        {enrolledAll === 0 && <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => ui.setView('study')}>Start studying</Button>}
      </div>
    </CardContent></Card>
  );
}

export function HeatMap({ activity, weeks = 26 }: { activity: Record<string, number>; weeks?: number }) {
  const cells = useMemo(() => {
    const out: Array<{ key: string; count: number }> = [];
    for (let i = weeks * 7 - 1; i >= 0; i--) {
      const key = dayKeyOffset(-i);
      out.push({ key, count: activity[key] || 0 });
    }
    return out;
  }, [activity, weeks]);
  const level = (c: number) => c === 0 ? 'bg-muted' : c < 5 ? 'bg-primary/25' : c < 15 ? 'bg-primary/50' : c < 30 ? 'bg-primary/75' : 'bg-primary';
  const totalActive = cells.filter(c => c.count > 0).length;
  return (
    <div>
      <div className="flex gap-[3px] overflow-x-auto bunsan-scroll pb-1">
        {Array.from({ length: weeks }, (_, w) => (
          <div key={w} className="flex flex-col gap-[3px]">
            {Array.from({ length: 7 }, (_, d) => {
              const cell = cells[w * 7 + d];
              if (!cell) return <div key={d} className="w-3 h-3" />;
              return <div key={d} title={`${cell.key}: ${cell.count} reviews`} className={`w-3 h-3 rounded-[3px] ${level(cell.count)} transition-colors hover:ring-1 hover:ring-primary/60`} />;
            })}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
        <span>{totalActive} active {totalActive === 1 ? 'day' : 'days'} · {weeks} weeks</span>
        <span className="flex items-center gap-1">less
          {['bg-muted', 'bg-primary/25', 'bg-primary/50', 'bg-primary/75', 'bg-primary'].map(l => <span key={l} className={`w-2.5 h-2.5 rounded-[2px] ${l}`} />)}
        more</span>
      </div>
    </div>
  );
}

function computeStreak(activity: Record<string, number>): number {
  let streak = 0;
  const d = new Date();
  for (;;) {
    const key = todayKey(d.getTime());
    if (activity[key]) streak++;
    else break;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

// ==================================================================== LISTS & TAGS
export function ListsView() {
  const library = useLibrary();
  const study = useStudy();
  const ui = useUi();
  const [selectedList, setSelectedList] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [tagName, setTagName] = useState('');
  const [tagColor, setTagColor] = useState(PALETTE[0]);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

  const list = library.lists.find(l => l.id === selectedList);
  const exportListCsv = () => {
    if (!list) return;
    const rows: (string | number)[][] = [['Type', 'Form', 'Reading', 'Gloss']];
    for (const id of list.wordIds) { const w = wordById.get(id); if (w) rows.push(['word', w.k || '', w.a[0] || '', w.s.map(s => s.gloss).join('; ')]); }
    for (const c of list.kanjiChars) { const k = kanjiByChar.get(c); if (k) rows.push(['kanji', c, k.on[0] || k.kun[0] || '', k.m.join(', ')]); }
    downloadFile(rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n'), `${list.name.replace(/\s+/g, '-')}.csv`, 'text/csv');
    toast({ title: 'List exported as CSV' });
  };
  const addListToSrs = () => {
    if (!list) return;
    const keys = [...list.wordIds.map(id => `w:${id}`), ...list.kanjiChars.map(c => `k:${c}`), ...list.sentenceIds.map(id => `s:${id}`)];
    study.enroll(keys);
    toast({ title: `${keys.length} entries enrolled in SRS` });
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Lists & Tags <span className="text-muted-foreground font-normal text-lg">リスト</span></h1>
        <p className="text-sm text-muted-foreground">Study lists, colored tags, notes, favorites and saved searches</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* lists */}
        <Card><CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold">Study lists ({library.lists.length})</span>
          </div>
          <div className="flex gap-2 mb-3">
            <Input placeholder="New list name…" value={newName} onChange={e => setNewName(e.target.value)} className="h-8 text-xs" />
            <Button size="sm" className="h-8" onClick={() => { if (!newName.trim()) return; library.createList(newName.trim(), newDesc); setNewName(''); setNewDesc(''); toast({ title: 'List created' }); }}><Plus className="h-3.5 w-3.5" /></Button>
          </div>
          <div className="space-y-1 max-h-72 overflow-y-auto bunsan-scroll pr-1">
            {library.lists.map(l => (
              <div key={l.id} className={`flex items-center justify-between rounded-lg border px-2.5 py-2 text-sm transition ${selectedList === l.id ? 'border-primary bg-primary/5' : 'bg-card hover:border-primary/30'}`}>
                <button className="flex-1 text-left" onClick={() => setSelectedList(l.id)}>
                  <span className="font-medium">{l.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">{l.wordIds.length + l.kanjiChars.length + l.sentenceIds.length} items</span>
                </button>
                <button className="p-1 text-muted-foreground hover:text-foreground" onClick={() => setRenaming({ id: l.id, name: l.name })} aria-label="rename"><Pencil className="h-3 w-3" /></button>
                {l.id !== 'core' && <button className="p-1 text-muted-foreground hover:text-destructive" onClick={() => { library.deleteList(l.id); if (selectedList === l.id) setSelectedList(null); }} aria-label="delete"><Trash2 className="h-3 w-3" /></button>}
              </div>
            ))}
          </div>
        </CardContent></Card>

        {/* list detail */}
        <Card className="lg:col-span-2"><CardContent className="p-4">
          {list ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <div className="font-semibold">{list.name}</div>
                  <div className="text-xs text-muted-foreground">{list.description || 'No description'} · {list.wordIds.length} words · {list.kanjiChars.length} kanji · {list.sentenceIds.length} sentences</div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={addListToSrs}><Zap className="h-3.5 w-3.5 mr-1" />Add all to SRS</Button>
                  <Button size="sm" variant="outline" onClick={exportListCsv}><Download className="h-3.5 w-3.5 mr-1" />CSV</Button>
                  <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="h-3.5 w-3.5 mr-1" />Print</Button>
                </div>
              </div>
              <div className="space-y-1 max-h-96 overflow-y-auto bunsan-scroll pr-1">
                {list.wordIds.map(id => {
                  const w = wordById.get(id);
                  if (!w) return null;
                  return (
                    <div key={`w${id}`} className="flex items-center justify-between rounded-lg border px-3 py-1.5 text-sm bg-card">
                      <button className="flex items-center gap-2 min-w-0 flex-1 text-left" onClick={() => ui.openWord(id)}>
                        <span className="jp-sans font-medium">{w.k || w.a[0]}</span>
                        <span className="text-muted-foreground text-xs truncate">{w.s[0]?.gloss.slice(0, 50)}</span>
                      </button>
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => library.removeFromList(list.id, 'w', id)} aria-label="remove"><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  );
                })}
                {list.kanjiChars.map(c => {
                  const k = kanjiByChar.get(c);
                  return (
                    <div key={`k${c}`} className="flex items-center justify-between rounded-lg border px-3 py-1.5 text-sm bg-card">
                      <button className="flex items-center gap-2 flex-1 text-left" onClick={() => ui.openKanji(c)}>
                        <span className="jp-serif text-lg">{c}</span>
                        <span className="text-muted-foreground text-xs truncate">{k?.m.join(', ')}</span>
                      </button>
                      <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => library.removeFromList(list.id, 'k', c)} aria-label="remove"><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  );
                })}
                {list.wordIds.length + list.kanjiChars.length + list.sentenceIds.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Empty — add entries from any card's menu “Add to list”.</p>}
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground text-center py-10">Select a list to view its contents.</div>
          )}
        </CardContent></Card>
      </div>

      {/* tags + notes + favorites + saved searches */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card><CardContent className="p-4">
          <div className="text-sm font-semibold mb-3 flex items-center gap-1.5"><TagsIcon className="h-4 w-4 text-primary" />Tags</div>
          <div className="flex gap-2 mb-3">
            <Input placeholder="Tag name…" value={tagName} onChange={e => setTagName(e.target.value)} className="h-8 text-xs" />
            <div className="flex gap-1">{PALETTE.slice(0, 5).map(c => <button key={c} className={`w-5 h-5 rounded-full border-2 ${tagColor === c ? 'border-foreground' : 'border-transparent'}`} style={{ background: c }} onClick={() => setTagColor(c)} aria-label={`color ${c}`} />)}</div>
            <Button size="sm" className="h-8" onClick={() => { if (!tagName.trim()) return; library.addTag(tagName.trim(), tagColor); setTagName(''); toast({ title: 'Tag created' }); }}><Plus className="h-3.5 w-3.5" /></Button>
          </div>
          <div className="space-y-1 max-h-44 overflow-y-auto bunsan-scroll">
            {library.tags.map(t => (
              <div key={t.name} className="flex items-center justify-between rounded border px-2 py-1.5 text-sm">
                <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ background: t.color }} />{t.name}</span>
                <button onClick={() => library.deleteTag(t.name)} aria-label="delete tag"><Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" /></button>
              </div>
            ))}
            {library.tags.length === 0 && <p className="text-xs text-muted-foreground">No tags yet. Tag entries from card menus.</p>}
          </div>
        </CardContent></Card>

        <Card><CardContent className="p-4">
          <div className="text-sm font-semibold mb-3 flex items-center gap-1.5"><NotebookPen className="h-4 w-4 text-primary" />Notes</div>
          <div className="space-y-1 max-h-52 overflow-y-auto bunsan-scroll">
            {Object.values(library.notes).filter(n => n.text).map(n => (
              <div key={n.key} className="rounded border px-2 py-1.5 text-xs">
                <div className="font-medium jp-sans">{n.key}</div>
                <div className="text-muted-foreground line-clamp-2">{n.text}</div>
              </div>
            ))}
            {Object.values(library.notes).filter(n => n.text).length === 0 && <p className="text-xs text-muted-foreground">No notes yet — add notes in entry details.</p>}
          </div>
        </CardContent></Card>

        <Card><CardContent className="p-4">
          <div className="text-sm font-semibold mb-3 flex items-center gap-1.5"><Star className="h-4 w-4 text-primary" />Favorites</div>
          <div className="flex flex-wrap gap-1.5 max-h-52 overflow-y-auto bunsan-scroll">
            {library.favorites.words.map(id => {
              const w = wordById.get(id);
              return w ? <Button key={id} size="sm" variant="secondary" className="h-7 text-xs jp-sans" onClick={() => ui.openWord(id)}>{w.k || w.a[0]}</Button> : null;
            })}
            {library.favorites.kanji.map(c => <Button key={c} size="sm" variant="secondary" className="h-7 text-base jp-serif" onClick={() => ui.openKanji(c)}>{c}</Button>)}
            {library.favorites.words.length + library.favorites.kanji.length === 0 && <p className="text-xs text-muted-foreground">No favorites — star any entry.</p>}
          </div>
        </CardContent></Card>

        <Card><CardContent className="p-4">
          <div className="text-sm font-semibold mb-3 flex items-center gap-1.5"><Search className="h-4 w-4 text-primary" />Saved searches</div>
          <div className="space-y-1 max-h-52 overflow-y-auto bunsan-scroll">
            {library.savedSearches.map(ss => (
              <div key={ss.id} className="flex items-center justify-between rounded border px-2 py-1.5 text-sm">
                <button className="flex-1 text-left truncate" onClick={() => { ui.setQuery(ss.query); ui.setView(ss.kind === 'sentences' ? 'sentences' : 'words'); }}>
                  <span className="font-medium">{ss.name}</span> <span className="text-xs text-muted-foreground">“{ss.query}”</span>
                </button>
                <button onClick={() => library.deleteSavedSearch(ss.id)} aria-label="delete"><Trash2 className="h-3 w-3 text-muted-foreground hover:text-destructive" /></button>
              </div>
            ))}
            {library.savedSearches.length === 0 && <p className="text-xs text-muted-foreground">Save searches from the Words view.</p>}
          </div>
        </CardContent></Card>
      </div>

      {/* rename dialog */}
      <Dialog open={!!renaming} onOpenChange={o => !o && setRenaming(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Rename list</DialogTitle></DialogHeader>
          <Input value={renaming?.name || ''} onChange={e => setRenaming(r => r ? { ...r, name: e.target.value } : r)} />
          <DialogFooter>
            <Button onClick={() => { if (renaming) { library.renameList(renaming.id, renaming.name); setRenaming(null); toast({ title: 'Renamed' }); } }}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==================================================================== STATISTICS
// ==================================================================== KANJI COVERAGE MAP
function KanjiCoverageMap() {
  const study = useStudy();
  const ui = useUi();
  const [filter, setFilter] = useState<'all' | '5' | '4' | '3' | '2' | '1'>('all');

  const list = useMemo(() => (filter === 'all' ? KANJI : KANJI.filter(k => k.j === Number(filter))), [filter]);
  const bucketOf = (c: string): 'unseen' | 'new' | 'learning' | 'young' | 'mature' => {
    const card = study.cards[`k:${c}`];
    if (!card) return 'unseen';
    if (card.state === 'new') return 'new';
    if (card.state === 'learning' || card.state === 'relearning') return 'learning';
    return card.interval >= 21 ? 'mature' : 'young';
  };
  const counts: Record<string, number> = { unseen: 0, new: 0, learning: 0, young: 0, mature: 0 };
  for (const k of list) counts[bucketOf(k.c)]++;
  const touched = list.length - counts.unseen;
  const mastery = list.length ? Math.round(((counts.mature + counts.young * 0.5 + counts.learning * 0.2) / list.length) * 100) : 0;

  const cellCls: Record<string, string> = {
    unseen: 'border-border/50 text-muted-foreground/25 hover:text-muted-foreground/60',
    new: 'border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300',
    learning: 'border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300',
    young: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
    mature: 'border-emerald-600 bg-emerald-600/85 text-white shadow-sm',
  };

  return (
    <Card className="overflow-hidden"><CardContent className="p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold flex items-center gap-1.5"><MapIcon className="h-4 w-4 text-primary" />Kanji coverage map <span className="jp-sans text-xs text-muted-foreground font-normal">漢字カバレッジ</span></div>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={v => setFilter(v as typeof filter)}>
            <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All kanji ({KANJI.length})</SelectItem>
              {(['5', '4', '3', '2', '1'] as const).map(j => {
                const n = KANJI.filter(k => k.j === Number(j)).length;
                return <SelectItem key={j} value={j}>N{j} ({n})</SelectItem>;
              })}
            </SelectContent>
          </Select>
        </div>
      </div>
      {/* mastery summary */}
      <div className="rounded-xl border bg-gradient-to-r from-primary/8 to-transparent p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">Weighted mastery</span>
          <span className="text-lg font-bold text-primary">{mastery}%</span>
        </div>
        <Progress value={mastery} className="h-2 mt-2" />
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground mt-2">
          <span>{touched}/{list.length} kanji enrolled</span>
          <span className="text-emerald-600">● {counts.mature} mature</span>
          <span className="text-emerald-500/70">● {counts.young} young</span>
          <span className="text-amber-600">● {counts.learning} learning</span>
          <span className="text-sky-600">● {counts.new} new</span>
          <span>○ {counts.unseen} unseen</span>
        </div>
      </div>
      {/* the map grid */}
      <div className="flex flex-wrap gap-1 max-h-72 overflow-y-auto bunsan-scroll p-1 rounded-lg border bg-background/50">
        {list.map(k => {
          const b = bucketOf(k.c);
          return (
            <button key={k.c} onClick={() => ui.openKanji(k.c)} title={`${k.c} · ${k.m.slice(0, 2).join(', ')} · ${b}`}
              className={`w-7 h-7 rounded-md border text-sm jp-serif leading-none transition-all hover:scale-110 hover:z-10 hover:ring-2 hover:ring-primary/50 ${cellCls[b]}`}
              aria-label={`kanji ${k.c} ${b}`}>
              {k.c}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">Solid green = mature (21d+ interval) · light green = young · amber = learning · blue = new · faint = not yet enrolled. Click any kanji to open its detail sheet.</p>
    </CardContent></Card>
  );
}

// ==================================================================== EXAM ANALYTICS (statistics)
interface ExamAttempt {
  ts: number; level: string; lvl: JlptLevel; score: number; passMark: number; pass: boolean;
  sections: Record<string, { c: number; t: number }>;
}

function ExamAnalyticsCard() {
  const study = useStudy();
  const ui = useUi();
  const exams = useMemo<ExamAttempt[]>(() =>
    study.quizLog
      .filter(q => q.kind.startsWith('exam:'))
      .map(q => {
        const level = q.kind.replace('exam:', '');
        const lvl = (Number(level.replace('N', '')) || 5) as JlptLevel;
        const score = Math.round((q.correct / Math.max(1, q.total)) * 180);
        const passMark = PASS_MARKS[lvl] || 80;
        const sections: Record<string, { c: number; t: number }> = {};
        for (const d of q.details || []) {
          const m = d.match(/^([A-Za-z ]+?) (\d+)\/(\d+)$/);
          if (m && Number(m[3]) > 0) {
            const k = m[1].trim();
            sections[k] = { c: (sections[k]?.c || 0) + Number(m[2]), t: (sections[k]?.t || 0) + Number(m[3]) };
          }
        }
        return { ts: q.ts, level, lvl, score, passMark, pass: score >= passMark, sections };
      })
      .reverse(), // oldest → newest
  [study.quizLog]);

  if (exams.length === 0) {
    return (
      <Card className="overflow-hidden border-dashed"><CardContent className="p-6 text-center space-y-2">
        <ClipboardCheck className="h-8 w-8 mx-auto text-muted-foreground/40" />
        <div className="text-sm font-semibold">Exam progress <span className="jp-sans text-xs text-muted-foreground font-normal">模試の記録</span></div>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">Take your first JLPT mock exam to unlock score tracking, per-section analytics and a progress chart.</p>
        <Button size="sm" className="mt-2" onClick={() => ui.setView('quizzes')}>Go to mock exams →</Button>
      </CardContent></Card>
    );
  }
  const chartData = exams.map((e, i) => ({
    name: `#${i + 1} ${e.level}`,
    score: e.score,
    passMark: e.passMark,
    date: new Date(e.ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
    pass: e.pass,
  }));
  const best = Math.max(...exams.map(e => e.score));
  const avg = Math.round(exams.reduce((a, e) => a + e.score, 0) / exams.length);
  const passRate = Math.round((exams.filter(e => e.pass).length / exams.length) * 100);
  const secAgg = (['Vocabulary', 'Grammar', 'Reading Comprehension'] as const).map(name => {
    const agg = exams.reduce((a, e) => ({ c: a.c + (e.sections[name]?.c || 0), t: a.t + (e.sections[name]?.t || 0) }), { c: 0, t: 0 });
    return { name: name === 'Reading Comprehension' ? 'Reading' : name, pct: agg.t ? Math.round((agg.c / agg.t) * 100) : null, correct: agg.c, total: agg.t };
  }).filter(s => s.pct !== null) as Array<{ name: string; pct: number; correct: number; total: number }>;

  return (
    <Card className="overflow-hidden"><CardContent className="p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm font-semibold flex items-center gap-1.5"><ClipboardCheck className="h-4 w-4 text-primary" />Exam progress <span className="jp-sans text-xs text-muted-foreground font-normal">模試の記録</span></div>
        <Badge variant="outline" className="text-[10px]">{exams.length} attempt{exams.length === 1 ? '' : 's'}</Badge>
      </div>
      {/* summary tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {([['Best score', `${best}`, 'text-emerald-600', '/180'], ['Average', `${avg}`, 'text-primary', '/180'], ['Pass rate', `${passRate}%`, passRate >= 50 ? 'text-emerald-600' : 'text-amber-600', ''], ['Latest', `${exams[exams.length - 1].score}`, 'text-foreground', '/180']] as const).map(([l, v, tone, suffix]) => (
          <div key={l} className="rounded-xl border p-3">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{l}</div>
            <div className={`text-xl font-bold mt-0.5 ${tone}`}><span className="tabular-nums">{v}</span>{suffix && <span className="text-xs text-muted-foreground font-normal"> {suffix}</span>}</div>
          </div>
        ))}
      </div>
      {/* score-over-time line */}
      <div className="h-52"><ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
          <XAxis dataKey="name" fontSize={10} />
          <YAxis domain={[0, 180]} fontSize={10} />
          <RTooltip
            contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
            formatter={(value: number | string, name: string) => (name === 'score' ? [`${value}/180`, 'estimated score'] : [value, 'pass mark'])}
          />
          <Line dataKey="passMark" stroke="#94a3b8" strokeDasharray="4 4" strokeWidth={1.2} dot={false} name="pass mark" />
          <Line
            dataKey="score" stroke="var(--chart-1)" strokeWidth={2.4} name="score"
            dot={(p: { cx?: number; cy?: number; index?: number; payload?: { pass?: boolean } }) => (
              <circle
                key={`dot-${p.index}`}
                cx={p.cx} cy={p.cy} r={4.5}
                fill={p.payload?.pass ? '#059669' : '#f59e0b'}
                stroke="var(--card)" strokeWidth={1.5}
              />
            )}
            activeDot={{ r: 6 }}
          />
        </LineChart>
      </ResponsiveContainer></div>
      <div className="flex items-center gap-4 text-[10px] text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />pass</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" />below pass mark</span>
        <span className="flex items-center gap-1"><span className="w-4 border-t-2 border-dashed border-slate-400" />pass mark</span>
      </div>
      {/* per-section aggregates */}
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Section strengths (all attempts)</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {secAgg.map(s => (
            <div key={s.name} className="rounded-xl border p-3">
              <div className="flex items-center justify-between text-xs"><span className="font-medium">{s.name}</span><span className="tabular-nums text-muted-foreground">{s.correct}/{s.total}</span></div>
              <Progress value={s.pct} className="h-1.5 mt-2" />
              <div className={`text-[11px] mt-1.5 font-medium ${s.pct >= 70 ? 'text-emerald-600' : s.pct >= 50 ? 'text-amber-600' : 'text-red-500'}`}>{s.pct}% correct — {s.pct >= 70 ? 'strong' : s.pct >= 50 ? 'developing' : 'focus area'}</div>
            </div>
          ))}
        </div>
      </div>
      {/* weakest-section drill recommendation */}
      {secAgg.length >= 2 && (() => {
        const weakest = [...secAgg].sort((a, b) => a.pct - b.pct)[0];
        const drills: Record<string, { kind: string; label: string }> = {
          Vocabulary: { kind: 'word-meaning', label: 'word → meaning quiz' },
          Grammar: { kind: 'grammar', label: 'grammar patterns quiz' },
          Reading: { kind: 'sentence-blank', label: 'sentence fill-in quiz' },
        };
        const d = weakest ? drills[weakest.name] : undefined;
        if (!weakest || !d) return null;
        return (
          <div className="rounded-xl border border-primary/30 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2.5">
            <Target className="h-4 w-4 text-primary shrink-0" />
            <div className="text-sm min-w-0"><b>Focus drill:</b> {weakest.name} is your weakest section ({weakest.pct}% correct). A targeted {d.label} will sharpen it fastest.</div>
            <Button size="sm" className="sm:ml-auto shrink-0" onClick={() => { ui.setQuizPreset(d.kind); ui.setView('quizzes'); }}>Start drill →</Button>
          </div>
        );
      })()}
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={() => ui.setView('quizzes')}>Take another mock exam →</Button>
      </div>
    </CardContent></Card>
  );
}

export function StatsView() {
  const study = useStudy();
  const settings = useSettings();
  const library = useLibrary();
  const cards = Object.values(study.cards);
  const byState = ['new', 'learning', 'relearning', 'review'].map(s => ({ name: s, value: cards.filter(c => c.state === s).length })).filter(x => x.value > 0);
  const COLORS: Record<string, string> = { new: '#8a9a5b', learning: '#d97706', relearning: '#ea580c', review: '#059669' };
  const last14 = Array.from({ length: 14 }, (_, i) => {
    const key = dayKeyOffset(-(13 - i));
    return { day: key.slice(5), reviews: study.activity[key] || 0 };
  });
  const forecast = useMemo(() => buildForecast(study.cards, settings.newPerDay, 14), [study.cards, settings.newPerDay]);
  const forecastData = forecast.map(f => ({ ...f, due: f.due, new: f.fresh }));
  const weekLoad = forecast.slice(0, 7).reduce((a, f) => a + f.due + f.fresh, 0);
  const reviewed = cards.filter(c => c.state === 'review');
  const young = reviewed.filter(c => c.interval > 0 && c.interval < 21).length;
  const mature = reviewed.filter(c => c.interval >= 21).length;
  const retention = reviewed.length ? Math.round((reviewed.reduce((a, c) => a + estimatedRetention(c), 0) / reviewed.length) * 100) : 0;
  const bestStreak = longestStreak(study.activity);
  const upcoming = [...reviewed].sort((a, b) => a.due - b.due)[0];
  const totalReviews = study.reviewLog.length;
  const quizTotals = study.quizLog.reduce((a, q) => ({ c: a.c + q.correct, t: a.t + q.total }), { c: 0, t: 0 });
  const accuracy = totalReviews ? Math.round((study.reviewLog.filter(r => r.quality >= 3).length / totalReviews) * 100) : 0;
  const listItems = library.lists.reduce((a, l) => a + l.wordIds.length + l.kanjiChars.length + l.sentenceIds.length, 0);
  const newRemaining = cards.filter(c => c.state === 'new').length;
  const dueNow = cards.filter(c => c.state !== 'new' && c.due <= Date.now()).length;
  const [planNew, setPlanNew] = useState(settings.newPerDay);
  const planDays = planNew > 0 ? Math.ceil(newRemaining / planNew) : 0;
  const planDate = planDays > 0 ? new Date(Date.now() + planDays * 86_400_000) : null;
  const planFinish = planDate ? planDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : null;
  const recentReviews = [...study.reviewLog].reverse().slice(0, 10);
  const achCtx = {
    cards: study.cards, reviewLog: study.reviewLog, quizLog: study.quizLog, activity: study.activity,
    favoritesCount: library.favorites.words.length + library.favorites.kanji.length,
    listsCount: library.lists.length, listItems, tagsCount: library.tags.length,
    notesCount: Object.values(library.notes).filter(n => n.text).length,
    searches: library.history.length,
  };
  const achievements = evaluateAchievements(achCtx);
  const earned = ACHIEVEMENTS.filter(a => achievements[a.id]).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Statistics <span className="text-muted-foreground font-normal text-lg">統計</span></h1>
        <p className="text-sm text-muted-foreground">Your learning progress at a glance</p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {([['Total reviews', totalReviews], ['Review accuracy', `${accuracy}%`], ['Quiz questions', quizTotals.t], ['Cards enrolled', cards.length]] as const).map(([l, v]) => (
          <Card key={l as string}><CardContent className="p-4"><div className="text-xs text-muted-foreground">{l}</div><div className="text-2xl font-bold mt-1">{v}</div></CardContent></Card>
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {([['Est. retention', retention === 0 ? '—' : `${retention}%`, 'text-emerald-500'], ['Young cards (1-20d)', young, 'text-sky-600'], ['Mature cards (21d+)', mature, 'text-emerald-600'], ['Longest streak', `${bestStreak}d`, 'text-orange-500']] as const).map(([l, v, tone]) => (
          <Card key={l as string}><CardContent className="p-4"><div className="text-xs text-muted-foreground">{l}</div><div className={`text-2xl font-bold mt-1 ${tone}`}>{v}</div></CardContent></Card>
        ))}
      </div>
      <Card className="overflow-hidden"><CardContent className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <div className="text-sm font-semibold">Workload forecast (next 14 days)</div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500" />due</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-primary" />new</span>
            <Badge variant="outline" className="text-[10px]">{weekLoad} reviews planned · 7d</Badge>
          </div>
        </div>
        {cards.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Enroll cards to see your projected review workload.</p>
        ) : (
          <div className="h-56 mt-2"><ResponsiveContainer width="100%" height="100%">
            <BarChart data={forecastData}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="label" fontSize={10} interval={1} /><YAxis fontSize={10} allowDecimals={false} />
              <RTooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="due" stackId="w" fill="#f59e0b" radius={[0, 0, 0, 0]} />
              <Bar dataKey="new" stackId="w" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer></div>
        )}
        {upcoming && (
          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
            <Timer className="h-3.5 w-3.5" />Next scheduled review: <b className="text-foreground">{formatInterval(Math.max(0, (upcoming.due - Date.now()) / 86_400_000))}</b> from now
          </div>
        )}
      </CardContent></Card>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card><CardContent className="p-4">
          <div className="text-sm font-semibold mb-3">Daily activity (14 days)</div>
          <div className="h-52"><ResponsiveContainer width="100%" height="100%">
            <BarChart data={last14}><CartesianGrid strokeDasharray="3 3" opacity={0.3} /><XAxis dataKey="day" fontSize={10} /><YAxis fontSize={10} allowDecimals={false} />
              <RTooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="reviews" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer></div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-sm font-semibold mb-3">Card states</div>
          <div className="h-52"><ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={byState} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>
                {byState.map(e => <Cell key={e.name} fill={COLORS[e.name]} />)}
              </Pie>
              <RTooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer></div>
          <div className="flex justify-center gap-3 text-xs">
            {byState.map(e => <span key={e.name} className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[e.name] }} />{e.name} ({e.value})</span>)}
          </div>
        </CardContent></Card>
      </div>
      <Card><CardContent className="p-4">
        <div className="text-sm font-semibold mb-3">Full activity heatmap (26 weeks)</div>
        <HeatMap activity={study.activity} weeks={26} />
      </CardContent></Card>
      <KanjiCoverageMap />
      <ExamAnalyticsCard />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* study planner */}
        <Card className="overflow-hidden"><CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-1.5 text-sm font-semibold"><CalendarClock className="h-4 w-4 text-primary" />Study planner <span className="jp-sans text-xs text-muted-foreground font-normal">計画</span></div>
          {cards.length === 0 ? (
            <p className="text-sm text-muted-foreground">Enroll cards to plan your study schedule.</p>
          ) : (
            <>
              <div className="rounded-xl border bg-gradient-to-br from-primary/10 to-transparent p-4 text-center">
                {planFinish ? (
                  <>
                    <div className="text-xs text-muted-foreground">at <b className="text-primary">{planNew} new/day</b> you finish the backlog by</div>
                    <div className="text-2xl font-bold mt-1">{planFinish}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{planDays} days · {newRemaining} new cards queued{dueNow > 0 ? ` · ${dueNow} due today` : ''}</div>
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground">No new cards queued — everything scheduled 🎉</div>
                )}
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex justify-between"><span>Adjust pace to see the finish date</span><span className="text-primary font-semibold">{planNew}/day</span></Label>
                <Slider value={[planNew]} min={3} max={40} step={1} onValueChange={([v]) => setPlanNew(v)} />
                {planNew !== settings.newPerDay && (
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => { settings.update({ newPerDay: planNew }); toast({ title: 'Daily pace updated', description: `New cards per day set to ${planNew}` }); }}>
                    Apply {planNew}/day to my settings
                  </Button>
                )}
              </div>
            </>
          )}
        </CardContent></Card>
        {/* recent reviews */}
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-1.5 text-sm font-semibold mb-3"><HistoryIcon className="h-4 w-4 text-primary" />Recent reviews</div>
          {recentReviews.length === 0 ? (
            <p className="text-sm text-muted-foreground">No reviews yet — start a study session to see history here.</p>
          ) : (
            <div className="rounded-lg border max-h-56 overflow-y-auto bunsan-scroll">
              {recentReviews.map((r, i) => {
                const label = reviewKeyLabel(r.key);
                const qCls = r.quality === 0 ? 'text-red-500' : r.quality === 3 ? 'text-amber-500' : 'text-emerald-500';
                return (
                  <div key={i} className="flex items-center gap-2 px-2.5 py-1.5 text-sm border-b last:border-0">
                    <span className={`jp-sans font-medium ${r.quality === 0 ? 'text-muted-foreground line-through' : ''}`}>{label}</span>
                    <Badge variant="outline" className="text-[9px] ml-auto">{r.state}</Badge>
                    <span className={`text-xs font-semibold w-4 text-center ${qCls}`}>{r.quality === 0 ? '✗' : r.quality === 3 ? '~' : '✓'}</span>
                    <span className="text-[10px] text-muted-foreground w-10 text-right">{Math.max(1, Math.round(r.timeMs / 1000))}s</span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent></Card>
      </div>
      <Card><CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="text-sm font-semibold flex items-center gap-1.5"><Award className="h-4 w-4 text-primary" />Achievements — {earned}/{ACHIEVEMENTS.length}</div>
          <Progress value={(earned / ACHIEVEMENTS.length) * 100} className="w-40 h-1.5" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
          {ACHIEVEMENTS.map(a => {
            const got = achievements[a.id];
            const tierCls: Record<string, string> = { bronze: 'from-amber-700/20 to-amber-700/5', silver: 'from-slate-400/20 to-slate-400/5', gold: 'from-yellow-500/25 to-yellow-500/5', platinum: 'from-cyan-500/20 to-cyan-500/5' };
            const prog = !got && a.progress ? a.progress(achCtx) : null;
            const pct = prog ? Math.min(100, Math.round((prog.cur / Math.max(1, prog.target)) * 100)) : 0;
            return (
              <div key={a.id} className={`rounded-xl border p-3 bg-gradient-to-br ${tierCls[a.tier]} ${got ? '' : 'opacity-45 grayscale'} flex flex-col`}>
                <div className="text-2xl">{a.icon}</div>
                <div className="text-sm font-semibold mt-1">{a.name} <span className="jp-sans text-xs text-muted-foreground">{a.jp}</span></div>
                <div className="text-[11px] text-muted-foreground">{a.description}</div>
                {prog && (
                  <div className="mt-1.5">
                    <Progress value={pct} className="h-1.5" />
                    <div className="text-[9px] text-muted-foreground mt-0.5 tabular-nums" aria-label={`progress ${prog.cur} of ${prog.target}`}>{Math.min(prog.cur, prog.target).toLocaleString()} / {prog.target.toLocaleString()}</div>
                  </div>
                )}
                <div className="mt-auto pt-1.5">
                  <Badge variant="outline" className={`text-[9px] ${got ? 'border-primary/50 text-primary' : ''}`}>{got ? '✓ unlocked' : a.tier}</Badge>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent></Card>
    </div>
  );
}

// ==================================================================== SETTINGS
export function SettingsView() {
  const settings = useSettings();
  const { theme, setTheme } = useTheme();
  const library = useLibrary();
  const study = useStudy();
  const [importText, setImportText] = useState('');
  const [installable, setInstallable] = useState(false);

  useEffect(() => {
    const check = () => setInstallable(!!(window as unknown as { __bunsanInstallPrompt?: unknown }).__bunsanInstallPrompt);
    check();
    window.addEventListener('bunsan-install-available', check);
    return () => window.removeEventListener('bunsan-install-available', check);
  }, []);

  const installApp = async () => {
    const prompt = (window as unknown as { __bunsanInstallPrompt?: { prompt: () => Promise<void> } }).__bunsanInstallPrompt;
    if (!prompt) return;
    await prompt.prompt();
    (window as unknown as { __bunsanInstallPrompt?: unknown }).__bunsanInstallPrompt = null;
    setInstallable(false);
    toast({ title: 'Install prompt shown', description: 'Bunsan Jisho will be added to your home screen / apps.' });
  };

  const exportAll = () => {
    const data = JSON.stringify({
      version: 1, exportedAt: new Date().toISOString(),
      library: { lists: library.lists, tags: library.tags, notes: library.notes, savedSearches: library.savedSearches, favorites: library.favorites, entryTags: library.entryTags, history: library.history, viewHistory: library.viewHistory },
      study: { cards: study.cards, reviewLog: study.reviewLog, quizLog: study.quizLog, activity: study.activity },
      settings: { ...settings },
    }, null, 2);
    downloadFile(data, `bunsan-backup-${todayKey()}.json`, 'application/json');
    try { localStorage.setItem('bunsan-last-backup', String(Date.now())); } catch { /* ignore */ }
    toast({ title: 'Backup downloaded', description: 'Your lists, progress and settings are safe.' });
  };

  const importAll = () => {
    try {
      const d = JSON.parse(importText);
      let ok = false;
      if (d.library) ok = library.importData(JSON.stringify(d.library)) || ok;
      if (d.study) ok = study.importData(JSON.stringify(d.study)) || ok;
      if (d.settings && typeof d.settings === 'object') { settings.update(d.settings); ok = true; }
      toast({ title: ok ? 'Data imported ✓' : 'Nothing recognizable found', variant: ok ? 'default' : 'destructive' });
      setImportText('');
    } catch { toast({ title: 'Invalid JSON', variant: 'destructive' }); }
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings <span className="text-muted-foreground font-normal text-lg">設定</span></h1>
        <p className="text-sm text-muted-foreground">Personalize Bunsan Jisho</p>
      </div>

      <Card><CardContent className="p-5 space-y-5">
        <div className="flex items-center gap-2 text-sm font-semibold"><Palette className="h-4 w-4 text-primary" />Appearance</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="space-y-2">
            <Label className="text-xs">Theme</Label>
            <Select value={theme} onValueChange={setTheme}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="light">Light (和紙 washi)</SelectItem>
                <SelectItem value="dark">Dark (夜 yoru)</SelectItem>
                <SelectItem value="system">System</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Accent color</Label>
            <div className="flex gap-2 flex-wrap">
              {([['sakura', 'Sakura'], ['shu', 'Shu-iro'], ['matcha', 'Matcha'], ['yamabuki', 'Yamabuki'], ['sumire', 'Sumire'], ['cha', 'Cha-iro']] as const).map(([id, label]) => (
                <button key={id} className={`px-3 h-9 rounded-lg border text-xs transition ${settings.accent === id ? 'border-primary ring-1 ring-primary' : ''}`} onClick={() => settings.update({ accent: id })}>{label}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="space-y-2">
            <Label className="text-xs">Font size <span className="text-muted-foreground">— applied live across the app</span></Label>
            <div className="flex gap-1.5">
              {([['sm', 'S', 'あ'], ['md', 'M', 'あ'], ['lg', 'L', 'あ'], ['xl', 'XL', 'あ']] as const).map(([v, label, sample]) => (
                <button key={v} onClick={() => settings.update({ fontSize: v })} aria-pressed={settings.fontSize === v}
                  className={`flex-1 h-11 rounded-lg border flex flex-col items-center justify-center transition ${settings.fontSize === v ? 'border-primary ring-1 ring-primary bg-primary/5' : 'hover:border-primary/50 hover:bg-accent/50'}`}>
                  <span className={`leading-none ${v === 'sm' ? 'text-xs' : v === 'md' ? 'text-sm' : v === 'lg' ? 'text-base' : 'text-lg'}`}>{sample}</span>
                  <span className={`text-[9px] mt-0.5 ${settings.fontSize === v ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>{label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Japanese font</Label>
            <div className="flex gap-1.5">
              {([['sans', 'Gothic', 'ゴ', 'rounded geometric gothic'], ['serif', 'Mincho', '明', 'classic serif mincho']] as const).map(([v, label, sample, hint]) => (
                <button key={v} onClick={() => settings.update({ jpFont: v })} aria-pressed={settings.jpFont === v}
                  className={`flex-1 h-11 rounded-lg border flex items-center justify-center gap-2 transition ${settings.jpFont === v ? 'border-primary ring-1 ring-primary bg-primary/5' : 'hover:border-primary/50 hover:bg-accent/50'}`}>
                  <span className="jp-serif text-lg leading-none">{sample}</span>
                  <span className="text-left">
                    <span className={`block text-xs font-medium ${settings.jpFont === v ? 'text-primary' : ''}`}>{label}</span>
                    <span className="block text-[9px] text-muted-foreground">{hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="flex items-center gap-2">
            <Switch id="showRomaji" checked={settings.showRomaji} onCheckedChange={v => settings.update({ showRomaji: v })} />
            <Label htmlFor="showRomaji" className="text-xs">Show romaji under readings</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="showJlpt" checked={settings.showJlpt} onCheckedChange={v => settings.update({ showJlpt: v })} />
            <Label htmlFor="showJlpt" className="text-xs">Show JLPT badges</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="autoPlayTts" checked={settings.autoPlayTts} onCheckedChange={v => settings.update({ autoPlayTts: v })} />
            <Label htmlFor="autoPlayTts" className="text-xs">Auto-play audio on cards</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="animations" checked={settings.animations} onCheckedChange={v => settings.update({ animations: v })} />
            <Label htmlFor="animations" className="text-xs">Animations & transitions</Label>
          </div>
          <div className="sm:col-span-2 space-y-2">
            <Label className="text-xs">Furigana display <span className="jp-sans text-muted-foreground">ふりがな</span></Label>
            <div className="flex gap-1.5">
              {([['always', 'Always show', '読める'], ['hover', 'On hover', '補助'], ['never', 'Hidden', '隠す']] as const).map(([v, label, jp]) => (
                <button key={v} onClick={() => settings.update({ furiganaMode: v })} aria-pressed={furiMode(settings) === v}
                  className={`flex-1 h-11 rounded-lg border flex flex-col items-center justify-center transition ${furiMode(settings) === v ? 'border-primary ring-1 ring-primary bg-primary/5' : 'hover:border-primary/50 hover:bg-accent/50'}`}>
                  <span className={`jp-sans text-sm leading-none ${furiMode(settings) === v ? 'text-primary font-semibold' : ''}`}>{jp}</span>
                  <span className="text-[9px] text-muted-foreground mt-0.5">{label}</span>
                </button>
              ))}
            </div>
            <p className="text-[10px] text-muted-foreground">On hover: furigana appears when you point at or focus a word — great for testing yourself while reading.</p>
          </div>
        </div>
      </CardContent></Card>

      <Card><CardContent className="p-5 space-y-5">
        <div className="flex items-center gap-2 text-sm font-semibold"><GraduationCap className="h-4 w-4 text-primary" />Spaced repetition</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div className="space-y-2">
            <Label className="text-xs flex justify-between"><span>New cards / day</span><span>{settings.newPerDay}</span></Label>
            <Slider value={[settings.newPerDay]} min={3} max={40} step={1} onValueChange={([v]) => settings.update({ newPerDay: v })} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs flex justify-between"><span>Max reviews / day</span><span>{settings.maxReviewsPerDay}</span></Label>
            <Slider value={[settings.maxReviewsPerDay]} min={20} max={300} step={10} onValueChange={([v]) => settings.update({ maxReviewsPerDay: v })} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs flex justify-between"><span>Daily goal</span><span>{settings.dailyGoal}</span></Label>
            <Slider value={[settings.dailyGoal]} min={5} max={100} step={5} onValueChange={([v]) => settings.update({ dailyGoal: v })} />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Card direction</Label>
            <Select value={settings.srsMode} onValueChange={v => settings.update({ srsMode: v as never })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fw">Recognition (JP → EN)</SelectItem>
                <SelectItem value="rf">Recall (EN → JP)</SelectItem>
                <SelectItem value="mixed">Mixed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Learning steps <span className="text-muted-foreground font-normal">(interval before graduation)</span></Label>
            <Select value={settings.learningSteps} onValueChange={v => settings.update({ learningSteps: v as never })}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default — 1m → 6m</SelectItem>
                <SelectItem value="fast">Fast — 30s → 3m</SelectItem>
                <SelectItem value="intensive">Intensive — 1m → 10m → 30m</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">{settings.learningSteps === 'fast' ? 'Graduate quicker — best for kana & familiar words.' : settings.learningSteps === 'intensive' ? 'One extra drilling step — best for stubborn kanji.' : 'Balanced: most cards graduate in one day.'}</p>
          </div>
        </div>
      </CardContent></Card>

      <Card><CardContent className="p-5 space-y-4">
        <div className="flex items-center gap-2 text-sm font-semibold"><Database className="h-4 w-4 text-primary" />Data management</div>
        <p className="text-xs text-muted-foreground">All data (lists, SRS cards, notes, stats) is stored locally in your browser. Export regular backups!</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={exportAll}><Download className="h-3.5 w-3.5 mr-1" />Export backup</Button>
          <Button
            size="sm"
            variant="outline"
            disabled={Object.keys(study.cards).length === 0}
            title="Exports every enrolled card (words, kanji, sentences, expressions, grammar) as an Anki-importable TSV deck with JLPT tags"
            onClick={() => {
              const n = Object.keys(study.cards).length;
              downloadFile(buildAnkiDeckTsv(), `bunsan-anki-deck-${todayKey()}.txt`, 'text/plain');
              toast({ title: `Anki deck exported (${n} cards)`, description: 'In Anki: File → Import — fields and tags are pre-mapped.' });
            }}
          >
            <Layers className="h-3.5 w-3.5 mr-1" />Export Anki deck ({Object.keys(study.cards).length})
          </Button>
          <Button size="sm" variant={installable ? 'default' : 'outline'} onClick={installApp} disabled={!installable} title={installable ? 'Install Bunsan Jisho as an app' : 'Open in a supported browser to enable installation'}>
            <MonitorSmartphone className="h-3.5 w-3.5 mr-1" />{installable ? 'Install app' : 'Install app (available when prompted)' }
          </Button>
        </div>
        <Textarea placeholder="Paste a backup JSON here to restore…" value={importText} onChange={e => setImportText(e.target.value)} className="min-h-24 text-xs font-mono" />
        <Button size="sm" onClick={importAll} disabled={!importText.trim()}><Upload className="h-3.5 w-3.5 mr-1" />Import backup</Button>
      </CardContent></Card>

      <Card><CardContent className="p-5">
        <div className="flex items-center gap-2 text-sm font-semibold mb-3"><Keyboard className="h-4 w-4 text-primary" />Keyboard shortcuts</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          {([['/', 'Focus search'], ['Ctrl / ⌘ + K', 'Command palette'], ['Space', 'Reveal flashcard'], ['Esc', 'Close panels'], ['D', 'Dashboard'], ['W', 'Words'], ['K', 'Kanji'], ['Q', 'Quiz Center'], ['S', 'Study (SRS)'], ['T', 'AI Tutor'], ['?', 'Shortcut help']] as const).map(([k, d]) => (
            <div key={k} className="flex items-center justify-between rounded border px-3 py-2"><span className="text-muted-foreground">{d}</span><kbd className="rounded border bg-muted px-1.5 py-0.5">{k}</kbd></div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">Single-key shortcuts are ignored while typing in a text field.</p>
      </CardContent></Card>
    </div>
  );
}

// ==================================================================== ABOUT
export function AboutView() {
  const CREDITS = [
    { name: 'JMdict / EDICT', by: 'Electronic Dictionary Research and Development Group (EDRDG)', url: 'https://www.edrdg.org/jmdict/', note: 'Japanese–English dictionary data — licensed under Creative Commons Attribution-ShareAlike 4.0 (CC BY-SA 4.0) & EDRDG Licence' },
    { name: 'KANJIDIC2', by: 'EDRDG', url: 'https://www.edrdg.org/wiki/index.php/KANJIDIC_Project', note: 'Kanji readings, meanings, grades, frequency & radicals — CC BY-SA 4.0' },
    { name: 'KRADFILE / RADKFILE', by: 'Michael Raine, James Breen, EDRDG', url: 'https://www.edrdg.org/krad/', note: 'Kanji → component radical decomposition' },
    { name: 'KanjiVG', by: 'Ulrich Apel & the KanjiVG project', url: 'https://github.com/KanjiVG/kanjivg', note: 'Stroke-order path data powering the animated 書き順 player — CC BY-SA 3.0' },
    { name: 'JLPT vocabulary lists', by: 'tanos.co.uk lists via open-anki-jlpt-decks', url: 'https://github.com/jamsinclair/open-anki-jlpt-decks', note: 'JLPT N5–N1 level tagging' },
    { name: 'Example sentences', by: 'Curated + Tatoeba-style corpus', url: 'https://tatoeba.org', note: 'Graded example sentences with translations' },
    { name: 'Tagaini Jisho', by: 'Alexandre Courbot & contributors', url: 'https://www.tagaini.net', note: 'The original open-source inspiration for this project' },
  ];
  const FEATURE_GROUPS: Array<[string, string[]]> = [
    ['Dictionary & search', [
      '12,000+ word entries (JMdict)', '3,000+ kanji (KANJIDIC2)', 'Multi-script search (kanji/kana/romaji/English)', 'Duplicate-aware results — identical headwords merged to the most common entry', 'Romaji → kana normalization', 'Katakana ↔ hiragana normalization', 'Deconjugation search — inflected forms (tabemasu, 食べました, のんでいる…) resolve to dictionary entries with form labels', 'One-click “Add dict form to SRS” from the deinflection banner (search dropdown & Words view)', 'Kanji-surface deconjugation (食べたかった → 食べる)', 'Kunrei-shiki romaji tolerance (si/ti/tu/hu → shi/chi/tsu/fu) in grammar search', 'Wildcard search (* and ?)', 'JLPT N5–N1 filters', 'Part-of-speech filters', 'Content tag filters', 'Common-words toggle', 'List-scoped filtering', 'Frequency ranking', 'Search normalization display', 'Debounced search history', 'Recent searches popover', 'Saved searches', 'Global search dropdown', 'Command palette search', 'Kanji search by grade', 'Kanji search by JLPT', 'Kanji search by stroke count', 'Radical-based kanji search', 'Multi-radical component search (up to 4)', 'Radical stroke grouping', 'Radical usage counts', 'Homophone finder', 'Related words via xrefs', 'Antonym links', 'Similar kanji (shared components)', 'Words containing a kanji', 'Sentence search by text & tags', 'Sentence JLPT & topic filters',
    ]],
    ['Entry details', [
      'Word detail sheet', 'Alternative kanji forms', 'Multiple readings with romaji', '3-level senses with POS chips', 'Pitch accent visualization (heiban/atamadaka/nakadaka/odaka)', 'Frequency display', 'Conjugation tables (13+ forms)', 'Godan/ichidan/suru/kuru verb classes', 'I/na adjective inflections', 'Kanji detail sheet', 'On/kun readings with audio', 'Nanori (name readings)', 'Component radical popovers', 'Kanji writing practice pad (canvas tracing)', 'Practice pad undo & stroke snapshots', 'Practice pad ghost-character toggle (write from memory)', 'Practice stroke-count verification (✓ target match)', 'Animated stroke-order player (KanjiVG 書き順)', 'Rainbow stroke coloring mode in 書き順 player', 'Stroke-by-stroke playback controls', 'Stroke-order in SRS review cards', 'Stroke counts & grades', 'Personal notes per entry', 'Mnemonic notes per kanji', 'Copy entry to clipboard', 'Sentence detail with word chips', 'Furigana rendering (ruby)', 'Furigana toggle', 'Ask AI about a word (context-aware tutor)', 'Ask AI about a kanji (mnemonic + usage teaching)',
    ]],
    ['Study system', [
      'SM-2 spaced repetition engine', 'Learning steps (1m/6m)', 'Adjustable learning-step presets (default/fast/intensive)', 'Graduating & easy intervals', 'Ease factor with lapse penalty', 'Relearning state', 'Recognition mode', 'Recall mode', 'Per-card due scheduling', 'New-card daily limit', 'Review daily cap', '4-button grading with interval preview', 'Session statistics', 'Streak tracking', 'Activity heatmap', 'Enrolled card browser', 'Card unenroll/reset', 'Daily goal with progress', 'Study planner (finish-date projection + pace slider)', 'Recent review history table', 'Lists → bulk SRS enrollment', 'CSV/TSV/Anki deck import with dictionary matching', 'Import preview with match badges (form/reading/gloss)', 'Import into SRS + list simultaneously', 'Pronunciation check (ASR scoring) in reviews', 'Cloze sentence cards (auto-blanked keyword recall)', 'Live session clock (mm:ss)', 'Ambient focus sounds (rain/waves/drone, WebAudio, volume control)', 'Pomodoro focus timer (15/25/35/50-min focus, 5-min breaks)', 'Automatic long break every 4th pomodoro', 'Phase-change chime (WebAudio arpeggio)', 'Auto rain ambience during focus phases', 'Daily pomodoro cycle counter (persisted)', 'Timer skip & reset controls',
    ]],
    ['Quizzes', [
      'Kanji → meaning quiz', 'Word → reading quiz', 'Word → meaning quiz', 'Sentence fill-in-the-blank', 'Kana → romaji quiz', 'Listening quiz (TTS audio)', 'Pitch accent pattern drill (heiban/atamadaka/nakadaka/odaka)', 'Conjugation drill (verb/adj form MCQ with plausible distractors)', 'Reading recall quiz — type the kana/romaji reading (active recall)', 'Stroke-order click game with writing-order validation', 'Perfect-kanji & mis-click tracking in stroke game', 'JLPT level scoping', 'Configurable question count', 'Instant right/wrong feedback', 'Missed-item review', 'Quiz history logging', 'Accuracy tracking', 'JLPT mock exam engine (模試) with official-style /180 scoring', 'Exam sections: 語彙 → 文法 → 読解 with per-section countdowns', 'Exam question flagging & navigation grid', 'Timer auto-advance on section expiry', 'Pass/fail estimate on official pass marks (N1-N5)', 'Per-section score breakdown & missed-question review', 'Past exam attempt history with estimated scores', 'Exam progress line chart (score vs pass mark over attempts)', 'Per-section exam strength analysis (vocab/grammar/reading)', 'Exam best/average/pass-rate summary tiles',
    ]],
    ['Text tools', [
      'Japanese text annotator', 'Tokenization with furigana', 'Hover popovers (word/kanji)', 'Clickable dictionary links', 'Known-word underlining (SRS aware)', 'Unknown-word dotted underlining', 'In-annotator deconjugation (conjugated forms like 食べました resolve to entries)', 'Deconjugation-aware longest-match tokenizer (面白かった → 面白い in one token)', 'Deinflected-token highlighting with conjugation-chain labels', 'Mining tray (unknown → SRS in one click)', 'Bulk mine-to-SRS button', 'Unknown-words CSV export', 'Readability statistics', 'Known-ratio calculation', 'HTML export with ruby', 'Conjugator with suggestions', 'Romaji → kana converter', 'Kana tables (hiragana/katakana/dakuten/combos)', 'Click-to-speak kana', 'Number → kanji converter', 'Kanji numeral parser (一万二千三百四十五 → 12,345)', 'Number readings', 'Japanese date display', 'Era (元号) converter 和暦↔西暦 (bidirectional, 5 eras)', 'Old month names', 'Counter reference (12 counters)', 'Particle guide (12 particles)',
    ]],
    ['Library & organization', [
      'Unlimited study lists', 'List CRUD with rename dialog', 'Mixed content lists (words/kanji/sentences)', 'Colored user tags', 'Tag/untag from entry menus', 'Notes browser', 'Favorites', 'Search history (100 entries)', 'Recently-viewed history strip on dashboard (words/kanji/sentences, persistent, one-click reopen, clearable)', 'CSV export', 'JSON export', 'Anki TSV export', 'Anki deck export of the whole SRS collection (pre-mapped Front/Back/Tags, JLPT-tagged)', 'Printable kanji practice sheets (genkō yōshi grid, trace model + options, from kanji view or detail sheet)', 'Print-friendly views', 'List CSV export', 'Bulk list actions',
    ]],
    ['Statistics & gamification', [
      'Review accuracy stats', 'Daily activity bar chart', 'Card-state donut chart', '26-week heatmap', '14-day workload forecast chart (due + new stacking)', '7-day planned-review projection', 'Next scheduled review countdown', 'Estimated retention modeling (forgetting curve)', 'Young vs mature card split (1-20d / 21d+)', 'Longest-streak tracking', '20 achievement badges', '4 achievement tiers', 'Per-achievement progress bars with cur/target counters (locked badges)', 'Streak milestones', 'Quiz history log', '7-day workload sparkline on Study hub', 'Kanji coverage map (all kanji colored by SRS mastery, JLPT filters)', 'Weighted mastery % with per-state counts', 'Achievement unlock toast celebrations', 'JLPT vocabulary coverage bars on dashboard (per-level enrolled/total)', 'Coverage rows deep-link into Words view with the level pre-filtered', 'Overall N5–N1 coverage badge', 'Streak freeze mechanic (earn per 7-day milestone, bank up to 2, auto-protect missed days)', 'Freeze-aware streak display with ❄ bank counter', 'Backup reminder banner (30-day cadence, snoozable, one-click export)',
    ]],
    ['Grammar (文法)', [
      '120 curated grammar patterns N5→N1', 'Pattern-of-the-day hero', 'Pattern search (pattern/romaji/meaning/formation/examples)', 'JLPT level filter', '13 grammar type filters (structure, particle, conjunction, condition…)', 'Expandable example sentences with per-example TTS', 'Formation (作り方) line per pattern', 'Usage/nuance notes', 'JLPT accent stripes on grammar cards', 'Grammar favorites', 'Grammar → SRS enrollment with grammar cloze cards', 'Grammar cloze review (pattern blanked inside example)', 'Grammar patterns quiz mode (cloze MCQ, 10th quiz mode)', 'Weakest-section focus drill recommendations after mock exams', 'Exam-analytics → quiz preset deep-linking',
    ]],
    ['Interface & experience', [
      'Dark/light/system theme', '6 Japanese accent palettes', 'Washi & seigaiha textures', 'Glassmorphism topbar', 'Sticky footer', 'Responsive mobile drawer nav', 'Command palette (Ctrl+K)', 'Keyboard shortcuts (/ focus, Esc close)', 'Shortcut help overlay (?)', 'Single-key view navigation (D/W/K/Q/S/T)', 'Live typography engine — font size & Japanese font apply instantly app-wide', 'Furigana display modes — always / on hover / hidden', 'Animation toggle', 'Density-conscious cards', 'Toasts & feedback', 'Loading-safe hydration', 'Accessibility labels & ARIA', 'Semantic HTML structure', 'Touch-friendly targets', 'Local backup export/import', 'Audio playback with fallback (Web Speech)', 'Per-entry TTS with caching', 'Installable PWA (manifest + icons + shortcuts)', 'Offline static caching via service worker (production)', 'Safe-area aware viewport (notch devices)', 'Heatmap legend & active-day count', 'Hero shimmer light sweep (reduced-motion aware)',
    ]],
  ];
  const totalFeatures = FEATURE_GROUPS.reduce((a, [, f]) => a + f.length, 0);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="rounded-2xl border seigaiha-bg bg-gradient-to-br from-primary/10 to-card p-8">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center shadow-xl shadow-primary/25"><span className="text-3xl font-bold jp-serif">分</span></div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Bunsan Jisho <span className="jp-sans text-xl text-muted-foreground font-normal">分散辞書</span></h1>
            <p className="text-muted-foreground">An advanced, open Japanese dictionary & study platform — {totalFeatures}+ features and counting</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          <Badge><Copyright className="h-3 w-3 mr-1" />Created by Aishik Dutta</Badge>
          <Badge variant="secondary">v1.7 “Ajisai”</Badge>
          <Badge variant="outline">Inspired by Tagaini Jisho</Badge>
          <Badge variant="outline">100% client-side · your data stays with you</Badge>
        </div>
      </div>

      <Card><CardContent className="p-5">
        <h2 className="text-lg font-semibold flex items-center gap-2"><Heart className="h-4 w-4 text-primary" />Data & resource credits</h2>
        <p className="text-xs text-muted-foreground mb-3">Bunsan Jisho is built on the shoulders of open Japanese-language projects. Huge thanks to all contributors.</p>
        <div className="space-y-2.5">
          {CREDITS.map(c => (
            <div key={c.name} className="rounded-lg border p-3">
              <div className="flex items-center justify-between flex-wrap gap-1">
                <span className="font-medium text-sm">{c.name}</span>
                <a href={c.url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">{c.url.replace('https://', '')}</a>
              </div>
              <div className="text-xs text-muted-foreground">by {c.by}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{c.note}</div>
            </div>
          ))}
        </div>
        <Separator className="my-4" />
        <p className="text-xs text-muted-foreground">Japanese dictionary files are the property of the Electronic Dictionary Research and Development Group, and are used in conformance with the Group's licence. The words/kanji data in this app were processed from JMdict_e and KANJIDIC2 (EDRDG). Thank you to James Breen and the JMdict/EDICT project community.</p>
      </CardContent></Card>

      <Card><CardContent className="p-5">
        <h2 className="text-lg font-semibold flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" />Feature catalog — {totalFeatures} implemented features</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
          {FEATURE_GROUPS.map(([group, features]) => (
            <div key={group} className="rounded-lg border p-3">
              <div className="text-sm font-semibold mb-2 flex items-center justify-between"><span>{group}</span><Badge variant="secondary" className="text-[10px]">{features.length}</Badge></div>
              <ul className="space-y-1">
                {features.map(f => <li key={f} className="text-xs text-muted-foreground flex gap-1.5"><Info className="h-3 w-3 mt-0.5 shrink-0 text-primary/60" />{f}</li>)}
              </ul>
            </div>
          ))}
        </div>
      </CardContent></Card>

      <Card><CardContent className="p-5">
        <h2 className="text-lg font-semibold flex items-center gap-2"><BarChart3 className="h-4 w-4 text-primary" />Tech stack</h2>
        <div className="flex flex-wrap gap-1.5 mt-2">
          {['Next.js 16', 'React 19', 'TypeScript 5', 'Tailwind CSS 4', 'shadcn/ui', 'Zustand (localStorage persistence)', 'Recharts', 'Lucide icons', 'SM-2 SRS engine', 'Custom JMdict pipeline'].map(t => <Badge key={t} variant="outline">{t}</Badge>)}
        </div>
        <p className="text-xs text-muted-foreground mt-3">Designed & built by <span className="font-medium text-foreground">Aishik Dutta</span>. Dictionary corpus processed from EDRDG open data — no personal data ever leaves your browser.</p>
      </CardContent></Card>
    </div>
  );
}

export function ManageViews({ view }: { view: 'dashboard' | 'lists' | 'stats' | 'settings' | 'about' }) {
  if (view === 'dashboard') return <DashboardView />;
  if (view === 'lists') return <ListsView />;
  if (view === 'stats') return <StatsView />;
  if (view === 'settings') return <SettingsView />;
  return <AboutView />;
}
