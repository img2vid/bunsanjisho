'use client';
// Shared entry display components: cards, furigana, pitch viz, detail sheets
import React, { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from '@/hooks/use-toast';
import {
  Volume2, Star, StarOff, ListPlus, Copy, NotebookPen, Tags, GraduationCap, Flame,
  Trash2, Sparkles, Type as KanjiIcon, BookOpen, Play, Link2, Zap, Bot, Undo2, Eye, EyeOff, Printer,
} from 'lucide-react';
import type { WordEntry, KanjiEntry, SentenceEntry } from '@/lib/dict/types';
import { wordById, kanjiByChar, pitchPattern, type PitchPattern } from '@/lib/dict/index';
import { hiraToRomaji, toHira, toKata } from '@/lib/dict/convert';
import { homophones, wordsWithKanji, similarKanji } from '@/lib/dict/search';
import { conjugate } from '@/lib/dict/conjugate';
import { buildSegments } from '@/lib/dict/furigana';
import { useLibrary, useSettings, useStudy, useUi } from '@/lib/stores';
import { useSpeak, copyText } from '@/lib/client';
import { generateAiExampleSentence } from '@/lib/uncloseai';
import { loadStrokes } from '@/lib/dict/strokes';
import { StrokeOrderAnim } from './stroke-order';
import { PracticeSheetDialog } from './practice-sheet';

// ---------------- Furigana text ----------------
export function FuriganaText({ kanji, kana, size = 'text-2xl' }: { kanji: string; kana?: string; size?: string }) {
  const furi = useSettings(s => s.furiganaMode ?? (s.showFurigana ? 'always' as const : 'never' as const));
  const segments = useMemo(() => {
    if (!kanji) return [{ base: kana || '' }];
    if (!kana || !kanji) return [{ base: kanji }];
    return buildSegments({ ...({ k: kanji, a: [kana] } as unknown as WordEntry) });
  }, [kanji, kana]);
  if (!kana || segments.length === 1 && !segments[0].ruby) {
    return <span className={`${size} font-medium`}>{kanji || kana}</span>;
  }
  return (
    <ruby className={`${size} font-medium leading-loose ${furi === 'never' ? 'furi-hidden' : ''}`}>
      {segments.map((s, i) => (
        <React.Fragment key={i}>
          {s.base}
          {s.ruby ? <rt>{s.ruby}</rt> : null}
        </React.Fragment>
      ))}
    </ruby>
  );
}

// ---------------- Pitch viz ----------------
export function PitchViz({ w }: { w: WordEntry }) {
  const pat = useMemo(() => pitchPattern(w), [w]);
  if (!pat) return null;
  return <PitchBars pat={pat} />;
}

export function PitchBars({ pat }: { pat: PitchPattern }) {
  return (
    <div className="flex items-end gap-1.5" title={pat.label}>
      {pat.mora.map((m, i) => (
        <div key={i} className="flex flex-col items-center gap-0.5">
          <span className="text-sm font-medium">{m}</span>
          <div className={`w-5 h-1.5 rounded-full pitch-bar ${pat.high[i] ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
        </div>
      ))}
    </div>
  );
}

// ---------------- badges ----------------
const JLPT_COLORS: Record<number, string> = { 5: 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-300', 4: 'bg-teal-600/15 text-teal-700 dark:text-teal-300', 3: 'bg-amber-600/15 text-amber-700 dark:text-amber-300', 2: 'bg-orange-600/15 text-orange-700 dark:text-orange-300', 1: 'bg-red-600/15 text-red-700 dark:text-red-300' };
const JLPT_ACCENT: Record<number, string> = { 5: 'border-l-emerald-500', 4: 'border-l-teal-500', 3: 'border-l-amber-500', 2: 'border-l-orange-500', 1: 'border-l-red-500' };

export function JlptBadge({ level }: { level?: number }) {
  if (!level) return null;
  return <Badge variant="secondary" className={`text-[10px] px-1.5 ${JLPT_COLORS[level]}`}>N{level}</Badge>;
}

export function PosChips({ pos }: { pos?: string[] }) {
  if (!pos?.length) return null;
  const labels: Record<string, string> = {
    n: 'noun', v1: 'ichidan verb', v5: 'godan verb', vs: 'suru verb', vk: 'kuru verb',
    'adj-i': 'i-adjective', 'adj-na': 'na-adjective', adv: 'adverb', exp: 'expression',
    int: 'interjection', pn: 'pronoun', ctr: 'counter', num: 'number', conj: 'conjunction', aux: 'auxiliary', prt: 'particle', adj: 'adjectival',
  };
  return <div className="flex flex-wrap gap-1">{pos.map(p => <Badge key={p} variant="outline" className="text-[10px] px-1.5">{labels[p] ?? p}</Badge>)}</div>;
}

// ---------------- entry actions hook ----------------
function useEntryActions(kind: 'w' | 'k' | 's') {
  const lists = useLibrary(s => s.lists);
  const addToList = useLibrary(s => s.addToList);
  const removeFromList = useLibrary(s => s.removeFromList);
  const favorites = useLibrary(s => s.favorites);
  const toggleFavorite = useLibrary(s => s.toggleFavorite);
  const tags = useLibrary(s => s.tags);
  const tagEntry = useLibrary(s => s.tagEntry);
  const untagEntry = useLibrary(s => s.untagEntry);
  const enroll = useStudy(s => s.enroll);
  const unenroll = useStudy(s => s.unenroll);
  const cards = useStudy(s => s.cards);
  const entryTags = useLibrary(s => s.entryTags);
  const ui = useUi();
  const speak = useSpeak();

  const entryKeyOf = (id: string | number) => `${kind}:${id}`;
  const inList = (listId: string, id: string | number) => {
    const l = lists.find(x => x.id === listId);
    if (!l) return false;
    if (kind === 'w') return l.wordIds.includes(Number(id));
    if (kind === 'k') return l.kanjiChars.includes(String(id));
    return l.sentenceIds.includes(Number(id));
  };
  const fav = kind === 'w' ? favorites.words.includes(Number(idOf())) : kind === 'k' ? favorites.kanji.includes(String(idOf())) : favorites.sentences.includes(Number(idOf()));
  function idOf() { return ''; }
  return { lists, addToList, removeFromList, fav, toggleFavorite, tags, tagEntry, untagEntry, enroll, unenroll, cards, entryTags, ui, speak, entryKeyOf, inList };
}

// ---------------- Ask-AI helpers (inject dictionary context into the tutor) ----------------
function askAiAboutWord(w: WordEntry, ui: ReturnType<typeof useUi.getState>) {
  ui.setTutorContext({
    title: `${w.k || w.a[0]}（${w.a[0]}）`,
    detail: `${w.s.map(s => s.gloss).join('; ')}${w.s[0]?.pos?.length ? ` — ${w.s[0].pos.join(', ')}` : ''}${w.j ? ` — JLPT N${w.j}` : ''}`,
    prompt: `Please explain the Japanese word ${w.k || w.a[0]}（${w.a[0]}）. Cover: nuance, common usage patterns, one or two natural example sentences with translations, and common mistakes learners make with it.`,
  });
  ui.openWord(null);
  ui.setView('tutor');
}

function askAiAboutKanji(k: KanjiEntry, ui: ReturnType<typeof useUi.getState>) {
  ui.setTutorContext({
    title: `${k.c} — ${k.m.join(', ')}`,
    detail: `${k.st} strokes, radical ${k.r}${k.g ? `, grade ${k.g}` : ''}${k.j ? `, JLPT N${k.j}` : ''}, readings: on ${k.on.join(' ')} / kun ${k.kun.join(' ')}`,
    prompt: `Please teach me the kanji ${k.c} (${k.m.join(', ')}). Include its components and a mnemonic to remember it, the difference between its on'yomi and kun'yomi usage, two or three common vocabulary words that use it, and one example sentence.`,
  });
  ui.openKanji(null);
  ui.setView('tutor');
}

// ---------------- Empty state ----------------
export function EmptyState({ jp, title, hint }: { jp: string; title: string; hint?: string }) {
  return (
    <div className="relative rounded-xl border border-dashed p-10 text-center overflow-hidden anim-fade-up">
      <span className="absolute inset-0 flex items-center justify-center jp-serif text-[7rem] font-bold pointer-events-none select-none pad-kanji" aria-hidden>{jp}</span>
      <div className="relative">
        <p className="jp-sans text-lg font-medium mb-1">{title}</p>
        {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

// ---------------- Word card ----------------
export function WordCard({ w, compact = false, idx = 0 }: { w: WordEntry; compact?: boolean; idx?: number }) {
  const speak = useSpeak();
  const ui = useUi();
  const favs = useLibrary(s => s.favorites.words);
  const toggleFavorite = useLibrary(s => s.toggleFavorite);
  const cards = useStudy(s => s.cards);
  const enroll = useStudy(s => s.enroll);
  const unenroll = useStudy(s => s.unenroll);
  const romaji = useSettings(s => s.showRomaji);
  const isFav = favs.includes(w.id);
  const cardKey = `w:${w.id}`;
  const enrolled = !!cards[cardKey];
  const gloss = w.s[0]?.gloss || '';
  const pos = w.s[0]?.pos || [];
  const [aiLoading, setAiLoading] = useState(false);

  const aiExample = async () => {
    setAiLoading(true);
    try {
      const data = await generateAiExampleSentence({
        word: w.k || w.a[0],
        reading: w.a[0],
        level: w.j || 4,
        meaning: gloss,
      });
      toast({ title: 'AI example generated', duration: 20000, description: `${data.ja}${data.en ? ` — ${data.en}` : ''}` });
    } catch {
      toast({ title: 'AI example unavailable', variant: 'destructive' });
    } finally { setAiLoading(false); }
  };

  return (
    <div className={`group rounded-xl border border-l-4 hover:border-primary/40 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer anim-fade-up ${compact ? 'p-3' : 'p-4'} ${w.j ? JLPT_ACCENT[w.j] : 'border-l-border'}`}
      style={{ animationDelay: `${Math.min(idx * 25, 500)}ms` }}
      onClick={() => ui.openWord(w.id)}
      role="button" tabIndex={0} aria-label={`word ${w.k || w.a[0]}`}
      onKeyDown={e => { if (e.key === 'Enter') ui.openWord(w.id); }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {w.k ? <FuriganaText kanji={w.k} kana={w.a[0]} size={compact ? 'text-xl' : 'text-2xl'} /> : <span className={`${compact ? 'text-xl' : 'text-2xl'} font-medium`}>{w.a[0]}</span>}
            {w.alt?.slice(0, 1).map(a => <span key={a} className="text-sm text-muted-foreground">({a})</span>)}
            <JlptBadge level={w.j} />
            {enrolled && <Badge variant="secondary" className="text-[10px] px-1.5 bg-primary/10 text-primary"><Zap className="w-3 h-3 mr-0.5 inline" />SRS</Badge>}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {w.a.join('・')}
            {romaji && w.a[0] ? <span className="ml-1 italic">({hiraToRomaji(w.a[0])})</span> : null}
            {w.f ? <span className="ml-2">#freq {w.f}</span> : null}
          </div>
          {!compact && <div className="mt-1.5 text-sm"><PosChips pos={pos} /></div>}
          <div className="text-sm mt-1.5 line-clamp-2 text-foreground/90">{gloss}{w.s.length > 1 ? ` (+${w.s.length - 1} more)` : ''}</div>
        </div>
        <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
          <TooltipProvider>
            <div className="flex gap-1">
              <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => speak(w.k || w.a[0])} aria-label="play audio"><Volume2 className="h-3.5 w-3.5" /></Button></TooltipTrigger><TooltipContent>Audio</TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger asChild><Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggleFavorite('words', w.id)} aria-label="favorite">{isFav ? <StarOff className="h-3.5 w-3.5 text-primary" /> : <Star className="h-3.5 w-3.5" />}</Button></TooltipTrigger><TooltipContent>{isFav ? 'Unfavorite' : 'Favorite'}</TooltipContent></Tooltip>
              <WordMenu w={w} />
            </div>
          </TooltipProvider>
        </div>
      </div>
      {!compact && (
        <div className="flex gap-2 mt-3 opacity-70 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
          <Button size="sm" variant="secondary" className="h-7 text-xs" onClick={() => enrolled ? unenroll(cardKey) : enroll([cardKey])}>
            {enrolled ? 'Remove from SRS' : 'Study this'}
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={aiExample} disabled={aiLoading}>
            <Sparkles className="h-3 w-3 mr-1" />{aiLoading ? 'Thinking…' : 'AI example'}
          </Button>
        </div>
      )}
    </div>
  );
}

function WordMenu({ w }: { w: WordEntry }) {
  const lists = useLibrary(s => s.lists);
  const addToList = useLibrary(s => s.addToList);
  const removeFromList = useLibrary(s => s.removeFromList);
  const tags = useLibrary(s => s.tags);
  const tagEntry = useLibrary(s => s.tagEntry);
  const untagEntry = useLibrary(s => s.untagEntry);
  const entryTags = useLibrary(s => s.entryTags);
  const copy = async () => {
    await copyText(`${w.k || ''}【${w.a[0]}】 ${w.s.map(s => s.gloss).join('; ')}`);
    toast({ title: 'Copied to clipboard' });
  };
  const myTags = entryTags[`w:${w.id}`] || [];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="more actions"><ListPlus className="h-3.5 w-3.5" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem onClick={copy}><Copy className="h-3.5 w-3.5 mr-2" />Copy entry</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Add to list</DropdownMenuLabel>
        {lists.length === 0 && <DropdownMenuItem disabled>No lists yet</DropdownMenuItem>}
        {lists.map(l => {
          const has = l.wordIds.includes(w.id);
          return (
            <DropdownMenuItem key={l.id} onClick={() => has ? removeFromList(l.id, 'w', w.id) : addToList(l.id, 'w', w.id)}>
              {has ? <Trash2 className="h-3.5 w-3.5 mr-2 text-destructive" /> : <ListPlus className="h-3.5 w-3.5 mr-2" />}
              {has ? `Remove from ${l.name}` : `Add to ${l.name}`}
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Tags</DropdownMenuLabel>
        {tags.length === 0 && <DropdownMenuItem disabled>Create tags in Lists view</DropdownMenuItem>}
        {tags.map(t => {
          const has = myTags.includes(t.name);
          return (
            <DropdownMenuItem key={t.name} onClick={() => has ? untagEntry(`w:${w.id}`, t.name) : tagEntry(`w:${w.id}`, t.name)}>
              <Tags className="h-3.5 w-3.5 mr-2" style={{ color: t.color }} />
              {has ? `Remove “${t.name}”` : `Tag “${t.name}”`}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---------------- Kanji card ----------------
export function KanjiCard({ k, compact = false, idx = 0 }: { k: KanjiEntry; compact?: boolean; idx?: number }) {
  const ui = useUi();
  const speak = useSpeak();
  const favs = useLibrary(s => s.favorites.kanji);
  const toggleFavorite = useLibrary(s => s.toggleFavorite);
  const isFav = favs.includes(k.c);
  return (
    <div className={`group rounded-xl border bg-card hover:border-primary/40 hover:shadow-md transition-all cursor-pointer anim-fade-up ${compact ? 'p-3' : 'p-4'}`}
      style={{ animationDelay: `${Math.min(idx * 20, 400)}ms` }}
      onClick={() => ui.openKanji(k.c)} role="button" tabIndex={0} aria-label={`kanji ${k.c}`}
      onKeyDown={e => { if (e.key === 'Enter') ui.openKanji(k.c); }}>
      <div className="flex items-start gap-3">
        <div className="flex items-center justify-center w-14 h-14 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/10 shrink-0">
          <span className="text-3xl jp-serif">{k.c}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">{k.st} strokes</span>
            {k.g ? <Badge variant="outline" className="text-[10px] px-1.5">Grade {k.g}</Badge> : null}
            <JlptBadge level={k.j} />
            {k.f ? <span className="text-[10px] text-muted-foreground">#freq {k.f}</span> : null}
          </div>
          <div className="text-sm mt-1 line-clamp-1">{k.m.join(', ')}</div>
          {!compact && (
            <div className="text-xs text-muted-foreground mt-1 truncate">
              <span className="text-primary font-medium">ON</span> {k.on.slice(0, 2).join(' ')} {k.kun.length > 0 && <><span className="text-primary font-medium ml-1">KUN</span> {k.kun.slice(0, 2).join(' ')}</>}
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition" onClick={e => e.stopPropagation()}>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => speak(k.c)} aria-label="play audio"><Volume2 className="h-3.5 w-3.5" /></Button>
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggleFavorite('kanji', k.c)} aria-label="favorite">{isFav ? <StarOff className="h-3.5 w-3.5 text-primary" /> : <Star className="h-3.5 w-3.5" />}</Button>
        </div>
      </div>
    </div>
  );
}

// ---------------- Sentence card ----------------
export function SentenceCard({ s, idx = 0 }: { s: SentenceEntry; idx?: number }) {
  const speak = useSpeak();
  const ui = useUi();
  const showFuri = useSettings(st => st.showFurigana);
  return (
    <div className="group rounded-xl border bg-card hover:border-primary/40 hover:shadow-md transition-all cursor-pointer anim-fade-up p-4"
      style={{ animationDelay: `${Math.min(idx * 25, 500)}ms` }}
      onClick={() => ui.openSentence(s.id)} role="button" tabIndex={0} aria-label="sentence"
      onKeyDown={e => { if (e.key === 'Enter') ui.openSentence(s.id); }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className={`jp-sans text-lg leading-relaxed ${showFuri ? '' : ''}`}>{s.ja}</div>
          <div className="text-sm text-muted-foreground mt-1.5">{s.en}</div>
          <div className="flex gap-1.5 mt-2 flex-wrap">
            <JlptBadge level={s.j} />
            {(s.t || []).map(t => <Badge key={t} variant="outline" className="text-[10px] px-1.5">{t}</Badge>)}
          </div>
        </div>
        <div className="opacity-0 group-hover:opacity-100 transition" onClick={e => e.stopPropagation()}>
          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => speak(s.ja)} aria-label="play audio"><Volume2 className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>
  );
}

// ---------------- Word detail sheet ----------------
export function WordDetailSheet() {
  const ui = useUi();
  const id = ui.detailWordId;
  const w = id != null ? wordById.get(id) : null;
  const speak = useSpeak();
  const lists = useLibrary(s => s.lists);
  const addToList = useLibrary(s => s.addToList);
  const removeFromList = useLibrary(s => s.removeFromList);
  const notes = useLibrary(s => s.notes);
  const setNote = useLibrary(s => s.setNote);
  const favorites = useLibrary(s => s.favorites);
  const toggleFavorite = useLibrary(s => s.toggleFavorite);
  const cards = useStudy(s => s.cards);
  const enroll = useStudy(s => s.enroll);
  const unenroll = useStudy(s => s.unenroll);
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [aiExample, setAiExample] = useState<{ ja: string; en: string } | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const conj = useMemo(() => (w ? conjugate(w) : null), [w]);
  const homos = useMemo(() => (w ? homophones(w, 8) : []), [w]);
  const related = useMemo(() => (w?.rel || []).map(r => wordById.get(r)).filter(Boolean) as WordEntry[], [w]);
  const ants = useMemo(() => (w?.ant || []).map(r => wordById.get(r)).filter(Boolean) as WordEntry[], [w]);
  const noteKey = w ? `w:${w.id}` : '';

  const genAi = async () => {
    if (!w) return;
    setAiLoading(true);
    try {
      const data = await generateAiExampleSentence({
        word: w.k || w.a[0],
        reading: w.a[0],
        level: w.j || 4,
        meaning: w.s[0]?.gloss,
      });
      setAiExample(data);
    } catch {
      toast({ title: 'AI example unavailable', description: 'uncloseai.js could not generate an example.', variant: 'destructive' });
    } finally { setAiLoading(false); }
  };

  return (
    <Sheet open={!!w} onOpenChange={o => !o && ui.openWord(null)}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col">
        {w && (
          <>
            <SheetHeader className="p-6 pb-4 seigaiha-bg">
              <div className="flex items-start justify-between">
                <div>
                  <SheetTitle className="flex items-center gap-3 flex-wrap">
                    <FuriganaText kanji={w.k || w.a[0]} kana={w.k ? w.a[0] : undefined} size="text-4xl" />
                    <JlptBadge level={w.j} />
                  </SheetTitle>
                  <SheetDescription className="mt-2 text-sm">
                    {w.a.join('・')}
                    {w.a[0] && <span className="italic ml-1">({hiraToRomaji(w.a[0])})</span>}
                    {w.alt?.length ? <span className="ml-2">alt: {w.alt.join(', ')}</span> : null}
                  </SheetDescription>
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant="outline" onClick={() => speak(w.k || w.a[0])} aria-label="play audio"><Volume2 className="h-4 w-4" /></Button>
                  <Button size="icon" variant="outline" onClick={() => toggleFavorite('words', w.id)} aria-label="favorite">
                    {favorites.words.includes(w.id) ? <StarOff className="h-4 w-4 text-primary" /> : <Star className="h-4 w-4" />}
                  </Button>
                  <Button size="icon" variant="outline" onClick={async () => { await copyText(`${w.k || ''}【${w.a[0]}】 ${w.s.map(s => s.gloss).join('; ')}`); toast({ title: 'Copied' }); }} aria-label="copy"><Copy className="h-4 w-4" /></Button>
                </div>
              </div>
              {w.p && <div className="mt-3"><PitchViz w={w} /></div>}
            </SheetHeader>
            <ScrollArea className="flex-1 bunsan-scroll">
              <div className="p-6 pt-4 space-y-5">
                {/* senses */}
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Meanings</h3>
                  <ol className="space-y-2">
                    {w.s.map((s, i) => (
                      <li key={i} className="flex gap-2 text-sm">
                        <span className="text-primary font-bold">{i + 1}.</span>
                        <div>
                          <div>{s.gloss}</div>
                          <PosChips pos={s.pos} />
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
                <Separator />
                {/* actions */}
                <section className="flex flex-wrap gap-2">
                  <Button size="sm" variant={cards[`w:${w.id}`] ? 'destructive' : 'default'} onClick={() => cards[`w:${w.id}`] ? unenroll(`w:${w.id}`) : enroll([`w:${w.id}`])}>
                    <Zap className="h-3.5 w-3.5 mr-1" />{cards[`w:${w.id}`] ? 'Remove from SRS' : 'Add to SRS'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={genAi} disabled={aiLoading}><Sparkles className="h-3.5 w-3.5 mr-1" />{aiLoading ? 'Generating…' : 'AI example sentence'}</Button>
                  <Button size="sm" variant="outline" className="border-primary/40 text-primary hover:bg-primary/10" onClick={() => askAiAboutWord(w, ui)}>
                    <Bot className="h-3.5 w-3.5 mr-1" />Ask AI about this word
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button size="sm" variant="outline"><ListPlus className="h-3.5 w-3.5 mr-1" />Lists</Button></DropdownMenuTrigger>
                    <DropdownMenuContent>{lists.map(l => {
                      const has = l.wordIds.includes(w.id);
                      return <DropdownMenuItem key={l.id} onClick={() => has ? removeFromList(l.id, 'w', w.id) : addToList(l.id, 'w', w.id)}>{has ? '✓' : '+'} {l.name}</DropdownMenuItem>;
                    })}</DropdownMenuContent>
                  </DropdownMenu>
                </section>
                {aiExample && (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm anim-fade-up">
                    <div className="text-[10px] uppercase tracking-wide text-primary mb-1 font-semibold">AI example</div>
                    <div className="jp-sans text-base">{aiExample.ja}</div>
                    <div className="text-muted-foreground mt-1">{aiExample.en}</div>
                  </div>
                )}
                {/* conjugation */}
                {conj && (
                  <>
                    <Separator />
                    <section>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5"><BookOpen className="h-3.5 w-3.5" />Conjugations — {({ ru: 'Ichidan verb', u: 'Godan verb', suru: 'Suru verb', kuru: 'Kuru verb', 'adj-i': 'I-adjective', 'adj-na': 'Na-adjective', null: '' } as Record<string, string>)[conj.cls ?? '']}</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {conj.forms.map(f => (
                          <div key={f.name} className="flex items-baseline justify-between gap-2 rounded-md border px-2.5 py-1.5 text-sm hover:bg-accent/50">
                            <span className="text-muted-foreground text-xs">{f.name}</span>
                            <span className="jp-sans font-medium">{f.form}</span>
                          </div>
                        ))}
                      </div>
                    </section>
                  </>
                )}
                {related.length > 0 && (
                  <>
                    <Separator />
                    <section>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2"><Link2 className="h-3.5 w-3.5 inline mr-1" />Related words</h3>
                      <div className="flex flex-wrap gap-2">
                        {related.map(r => <Button key={r.id} size="sm" variant="secondary" className="h-8" onClick={() => ui.openWord(r.id)}>{r.k || r.a[0]} <span className="text-muted-foreground ml-1 text-xs hidden sm:inline">{r.s[0]?.gloss.slice(0, 24)}</span></Button>)}
                      </div>
                    </section>
                  </>
                )}
                {ants.length > 0 && (
                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Antonyms</h3>
                    <div className="flex flex-wrap gap-2">
                      {ants.map(r => <Button key={r.id} size="sm" variant="secondary" className="h-8" onClick={() => ui.openWord(r.id)}>{r.k || r.a[0]}</Button>)}
                    </div>
                  </section>
                )}
                {homos.length > 0 && (
                  <>
                    <Separator />
                    <section>
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1"><Flame className="h-3.5 w-3.5" />Homophones (same reading)</h3>
                      <div className="flex flex-wrap gap-2">
                        {homos.map(h => <Button key={h.id} size="sm" variant="ghost" className="h-8 border" onClick={() => ui.openWord(h.id)}>{h.k || h.a[0]} <span className="text-muted-foreground ml-1 text-xs hidden sm:inline">{h.s[0]?.gloss.slice(0, 22)}</span></Button>)}
                      </div>
                    </section>
                  </>
                )}
                <Separator />
                {/* note */}
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5"><NotebookPen className="h-3.5 w-3.5" />Personal note</h3>
                  <Textarea placeholder="Write a mnemonic, memory hook or note…" value={noteDraft ?? notes[noteKey]?.text ?? ''} onChange={e => setNoteDraft(e.target.value)} className="min-h-20" />
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" onClick={() => { setNote(noteKey, noteDraft ?? ''); setNoteDraft(null); toast({ title: 'Note saved' }); }}>Save note</Button>
                    {(noteDraft !== null || notes[noteKey]?.text) && <Button size="sm" variant="ghost" onClick={() => { setNote(noteKey, ''); setNoteDraft(null); }}>Clear</Button>}
                  </div>
                </section>
              </div>
            </ScrollArea>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ---------------- Kanji detail sheet ----------------
export function KanjiDetailSheet() {
  const ui = useUi();
  const ch = ui.detailKanji;
  const k = ch ? kanjiByChar.get(ch) : null;
  const speak = useSpeak();
  const notes = useLibrary(s => s.notes);
  const setNote = useLibrary(s => s.setNote);
  const enroll = useStudy(s => s.enroll);
  const unenroll = useStudy(s => s.unenroll);
  const cards = useStudy(s => s.cards);
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const words = useMemo(() => (k ? wordsWithKanji(k.c, 16) : []), [k]);
  const similar = useMemo(() => (k ? similarKanji(k, 12) : []), [k]);
  const noteKey = k ? `k:${k.c}` : '';
  const [padChar, setPadChar] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <Sheet open={!!k} onOpenChange={o => { if (!o) { ui.openKanji(null); setPadChar(null); setSheetOpen(false); } }}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col">
        {k && (
          <>
            <SheetHeader className="p-6 pb-4 seigaiha-bg">
              <div className="flex items-start gap-4">
                <div className="w-24 h-24 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 border border-primary/15 flex items-center justify-center shrink-0">
                  <span className="text-6xl jp-serif">{k.c}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <SheetTitle className="text-lg flex items-center gap-2 flex-wrap">{k.m.join(', ')}</SheetTitle>
                  <SheetDescription className="mt-1 flex items-center gap-2 flex-wrap text-xs">
                    <span>{k.st} strokes</span>
                    {k.g ? <Badge variant="outline" className="text-[10px]">Grade {k.g}</Badge> : null}
                    <JlptBadge level={k.j} />
                    {k.f ? <span>freq #{k.f}</span> : null}
                  </SheetDescription>
                  <div className="flex gap-1 mt-2">
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => speak(k.c)} aria-label="audio"><Volume2 className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => enroll([`k:${k.c}`])} aria-label="study"><GraduationCap className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setPadChar(k.c)} aria-label="practice"><KanjiIcon className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => setSheetOpen(true)} aria-label="practice sheet" title="Printable writing practice sheet"><Printer className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="outline" className="h-7 w-7 border-primary/40 text-primary hover:bg-primary/10" onClick={() => askAiAboutKanji(k, ui)} aria-label="ask AI"><Bot className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              </div>
            </SheetHeader>
            <ScrollArea className="flex-1 bunsan-scroll">
              <div className="p-6 pt-4 space-y-5">
                {padChar && <PracticePad ch={padChar} onClose={() => setPadChar(null)} />}
                <section className="rounded-xl border p-4 bg-gradient-to-br from-primary/5 to-transparent anim-fade-up">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3 flex items-center gap-1.5">
                    <KanjiIcon className="h-3.5 w-3.5" />Stroke order <span className="jp-sans font-normal normal-case">書き順</span>
                  </h3>
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    <StrokeOrderAnim ch={k.c} size={200} />
                    <div className="flex-1 space-y-2 text-sm w-full">
                      <div className="rounded-lg border bg-background/60 p-3">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1">Radical</div>
                        <span className="jp-serif text-2xl">{k.r}</span> <span className="text-xs text-muted-foreground">· {k.st} strokes total</span>
                      </div>
                      <Button size="sm" variant="outline" className="w-full" onClick={() => setPadChar(padChar ? null : k.c)}>
                        <Play className="h-3.5 w-3.5 mr-1" />{padChar ? 'Hide writing pad' : 'Practice writing'}
                      </Button>
                    </div>
                  </div>
                </section>
                <section className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-lg border p-3">
                    <div className="text-[10px] uppercase tracking-wide text-primary font-semibold mb-1">On'yomi</div>
                    {k.on.length ? k.on.map(r => <div key={r} className="jp-sans cursor-pointer hover:text-primary" onClick={() => speak(r)}>{r} <span className="text-[10px] text-muted-foreground italic">{hiraToRomaji(toHira(r))}</span></div>) : <span className="text-muted-foreground text-xs">none</span>}
                  </div>
                  <div className="rounded-lg border p-3">
                    <div className="text-[10px] uppercase tracking-wide text-primary font-semibold mb-1">Kun'yomi</div>
                    {k.kun.length ? k.kun.map(r => <div key={r} className="jp-sans cursor-pointer hover:text-primary" onClick={() => speak(r.replace(/[-.]/g, ''))}>{r}</div>) : <span className="text-muted-foreground text-xs">none</span>}
                  </div>
                </section>
                {k.nn?.length ? (
                  <section className="text-sm">
                    <span className="text-[10px] uppercase tracking-wide text-primary font-semibold">Nanori: </span>
                    <span className="jp-sans">{k.nn.join('、 ')}</span>
                  </section>
                ) : null}
                {k.rd?.length ? (
                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Components</h3>
                    <div className="flex flex-wrap gap-2">
                      {k.rd.map(c => (
                        <Popover key={c}>
                          <PopoverTrigger asChild>
                            <button className="w-10 h-10 rounded-lg border bg-card text-2xl jp-serif hover:border-primary/50 transition" aria-label={`component ${c}`}>{c}</button>
                          </PopoverTrigger>
                          <PopoverContent className="w-48 p-3 text-xs">
                            <div className="text-2xl jp-serif mb-1">{c}</div>
                            <div className="text-muted-foreground">{kanjiByChar.get(c)?.m?.join(', ') || 'radical component'}</div>
                          </PopoverContent>
                        </Popover>
                      ))}
                    </div>
                  </section>
                ) : null}
                <Separator />
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5"><BookOpen className="h-3.5 w-3.5" />Words using {k.c}</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {words.slice(0, 10).map(wd => (
                      <button key={wd.id} className="text-left rounded-md border px-2.5 py-1.5 text-sm hover:bg-accent/50 transition" onClick={() => ui.openWord(wd.id)}>
                        <span className="jp-sans font-medium">{wd.k || wd.a[0]}</span>
                        <span className="text-muted-foreground text-xs ml-1.5">{wd.s[0]?.gloss.slice(0, 30)}</span>
                      </button>
                    ))}
                  </div>
                </section>
                {similar.length > 0 && (
                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Similar kanji (shared components)</h3>
                    <div className="flex flex-wrap gap-2">
                      {similar.map(s => (
                        <button key={s.c} className="flex flex-col items-center rounded-lg border px-2.5 py-1.5 hover:border-primary/50 transition" onClick={() => ui.openKanji(s.c)}>
                          <span className="text-2xl jp-serif">{s.c}</span>
                          <span className="text-[9px] text-muted-foreground">{s.m[0]}</span>
                        </button>
                      ))}
                    </div>
                  </section>
                )}
                <Separator />
                <section>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Mnemonic / note</h3>
                  <Textarea placeholder="Story, radical memory hook…" value={noteDraft ?? notes[noteKey]?.text ?? ''} onChange={e => setNoteDraft(e.target.value)} className="min-h-20" />
                  <div className="flex gap-2 mt-2">
                    <Button size="sm" onClick={() => { setNote(noteKey, noteDraft ?? ''); setNoteDraft(null); toast({ title: 'Note saved' }); }}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => setNoteDraft('')}>Clear draft</Button>
                  </div>
                </section>
              </div>
            </ScrollArea>
          </>
        )}
        {k && <PracticeSheetDialog kanjiList={[k.c]} open={sheetOpen} onOpenChange={setSheetOpen} />}
      </SheetContent>
    </Sheet>
  );
}

// ---------------- Sentence detail sheet ----------------
export function SentenceDetailSheet() {
  const ui = useUi();
  const id = ui.detailSentenceId;
  const s = useSentenceById(id);
  const speak = useSpeak();
  const showFuri = useSettings(st => st.showFurigana);
  const [showFuriLocal, setShowFuriLocal] = useState(showFuri);
  const enroll = useStudy(st => st.enroll);
  if (!s) return <Sheet open={false} onOpenChange={() => ui.openSentence(null)}><SheetContent /></Sheet>;
  return (
    <Sheet open onOpenChange={o => !o && ui.openSentence(null)}>
      <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col">
        <SheetHeader className="p-6 pb-4 seigaiha-bg">
          <SheetTitle className="text-base">Sentence</SheetTitle>
          <SheetDescription />
          <div className="jp-sans text-xl leading-relaxed mt-2" style={{ fontFeatureSettings: '"ruby"' }}>{s.ja}</div>
          <div className="flex gap-2 mt-2">
            <Button size="sm" variant="outline" onClick={() => speak(s.ja)}><Volume2 className="h-3.5 w-3.5 mr-1" />Audio</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowFuriLocal(v => !v)}>{showFuriLocal ? 'Hide' : 'Show'} furigana</Button>
            <Button size="sm" variant="ghost" onClick={() => enroll([`s:${s.id}`])}><GraduationCap className="h-3.5 w-3.5 mr-1" />Study</Button>
          </div>
        </SheetHeader>
        <ScrollArea className="flex-1 bunsan-scroll"><div className="p-6 space-y-4">
          <div className="rounded-lg border p-4 text-sm text-muted-foreground">{s.en}</div>
          <div className="flex gap-1.5 flex-wrap"><JlptBadge level={s.j} />{(s.t || []).map(t => <Badge key={t} variant="outline" className="text-[10px]">{t}</Badge>)}</div>
          <Separator />
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Words in this sentence</h3>
            <div className="flex flex-wrap gap-2">
              {[...new Set((s.ja.match(/[\u4e00-\u9faf々]+|[ぁ-んー]+/g) || [])).values()].slice(0, 12).map(t => (
                <SentenceWordChip key={t} token={t} />
              ))}
            </div>
          </div>
          <div className="text-xs text-muted-foreground">{showFuriLocal ? 'Furigana available in the Annotator for full tokenization.' : ''}</div>
        </div></ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function SentenceWordChip({ token }: { token: string }) {
  const word = [...wordById.values()].find(w => (w.k && w.k === token) || w.a[0] === toHira(token));
  const ui = useUi();
  if (word) return <Button size="sm" variant="secondary" className="h-8" onClick={() => ui.openWord(word.id)}>{token}</Button>;
  if (/[\u4e00-\u9faf]/.test(token) && kanjiByChar.has(token[0])) {
    return <Button size="sm" variant="ghost" className="h-8 border" onClick={() => ui.openKanji(token[0])}>{token}</Button>;
  }
  return <span className="text-sm px-2 py-1 rounded bg-muted">{token}</span>;
}

function useSentenceById(id: number | null) {
  return useMemo(() => {
    if (id == null) return null;
    return SENTENCES_LIST.find(s => s.id === id) || null;
  }, [id]);
}
import { SENTENCES as SENTENCES_LIST } from '@/lib/dict/index';

// ---------------- Practice pad ----------------
export function PracticePad({ ch, onClose }: { ch: string; onClose: () => void }) {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const drawing = React.useRef(false);
  const snapshots = React.useRef<ImageData[]>([]);
  const [strokes, setStrokes] = useState(0);
  const [snapCount, setSnapCount] = useState(0);
  const [showGhost, setShowGhost] = useState(true);
  const [actualInfo, setActualInfo] = useState<{ ch: string; n: number } | null>(null);

  // load the real stroke count for verification
  useEffect(() => {
    let alive = true;
    loadStrokes(ch).then(p => { if (alive) setActualInfo({ ch, n: p && p.length ? p.length : 0 }); });
    return () => { alive = false; };
  }, [ch]);
  const actual = actualInfo && actualInfo.ch === ch ? actualInfo.n : null;

  const start = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const rect = canvas.getBoundingClientRect();
    // snapshot for undo (cap 40)
    try {
      snapshots.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
      if (snapshots.current.length > 40) snapshots.current.shift();
      setSnapCount(snapshots.current.length);
    } catch { /* ignore */ }
    drawing.current = true;
    ctx.beginPath();
    ctx.moveTo((e.clientX - rect.left) * (canvas.width / rect.width), (e.clientY - rect.top) * (canvas.height / rect.height));
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const rect = canvas.getBoundingClientRect();
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'oklch(0.55 0.16 27)';
    ctx.lineTo((e.clientX - rect.left) * (canvas.width / rect.width), (e.clientY - rect.top) * (canvas.height / rect.height));
    ctx.stroke();
  };
  const end = () => { drawing.current = false; setStrokes(s => s + 1); };
  const undo = () => {
    const snap = snapshots.current.pop();
    if (!snap) return;
    const canvas = canvasRef.current!;
    canvas.getContext('2d')!.putImageData(snap, 0, 0);
    setSnapCount(snapshots.current.length);
    setStrokes(s => Math.max(0, s - 1));
  };
  const clear = () => {
    const canvas = canvasRef.current!;
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height);
    snapshots.current = [];
    setSnapCount(0);
    setStrokes(0);
  };

  const match = actual != null && strokes === actual;
  return (
    <div className="rounded-xl border p-4 bg-card anim-fade-up">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
        <h3 className="text-sm font-semibold flex items-center gap-1.5"><Play className="h-3.5 w-3.5" />Writing practice — {ch}</h3>
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowGhost(v => !v)} aria-label="toggle ghost">
            {showGhost ? <><EyeOff className="h-3 w-3 mr-1" />Ghost</> : <><Eye className="h-3 w-3 mr-1" />Hidden</>}
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={undo} disabled={snapCount === 0} aria-label="undo stroke"><Undo2 className="h-3 w-3 mr-1" />Undo</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={clear}>Clear</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={onClose}>Close</Button>
        </div>
      </div>
      <div className="relative mx-auto" style={{ width: 240, height: 240 }}>
        <span className={`pad-kanji absolute inset-0 flex items-center justify-center text-[190px] jp-serif select-none pointer-events-none transition-opacity duration-300 ${showGhost ? 'opacity-100' : 'opacity-0'}`}>{ch}</span>
        <canvas
          ref={canvasRef} width={480} height={480}
          className="absolute inset-0 w-full h-full cursor-crosshair touch-none rounded-lg"
          onPointerDown={start} onPointerMove={move} onPointerUp={end} onPointerLeave={end}
        />
        <div className="absolute inset-0 border-2 border-dashed border-muted-foreground/20 rounded-lg pointer-events-none" />
      </div>
      <div className="flex items-center justify-center gap-2 mt-2">
        <span className={`text-[10px] rounded-full px-2 py-0.5 border ${strokes === 0 ? 'text-muted-foreground border-muted' : match ? 'text-emerald-600 border-emerald-500/40 bg-emerald-500/10' : actual != null && strokes > (actual ?? 0) ? 'text-red-500 border-red-500/40 bg-red-500/10' : 'text-amber-600 border-amber-500/40 bg-amber-500/10'}`}>
          {strokes} stroke{strokes === 1 ? '' : 's'}{actual != null && strokes > 0 ? ` · target ${actual} ${match ? '— perfect ✓' : ''}` : ''}
        </span>
      </div>
      <p className="text-[10px] text-muted-foreground text-center mt-1.5">Trace over the ghost, then toggle it off and write from memory — match the target stroke count.</p>
    </div>
  );
}
