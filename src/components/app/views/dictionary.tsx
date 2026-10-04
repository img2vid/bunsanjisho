'use client';
// Dictionary views: Words, Kanji, Radicals, Sentences
import React, { useEffect, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from '@/hooks/use-toast';
import {
  Search, SlidersHorizontal, X, Save, Download, Printer,
  History, Trash2, Volume2, Star, StarOff, GraduationCap, Sparkles, Zap,
} from 'lucide-react';
import { searchWords, searchWordsDeinflected, searchKanji, searchSentences, kanjiWithComponents, ALL_TAGS, ALL_SENTENCE_TAGS, normalizeQuery } from '@/lib/dict/search';
import { RADK } from '@/lib/data/radk';
import { WORDS, KANJI, RADICALS, EXPRESSIONS, GRAMMAR } from '@/lib/dict/index';
import type { WordEntry, KanjiEntry, GrammarEntry } from '@/lib/dict/types';
import { WordCard, KanjiCard, SentenceCard, JlptBadge, EmptyState } from '../entry-cards';
import { PracticeSheetDialog } from '../practice-sheet';
import { useLibrary, useUi, useStudy } from '@/lib/stores';
import { downloadFile, toCsv, useSpeak } from '@/lib/client';
import { toHira, hiraToRomaji, kunreiToHepburn } from '@/lib/dict/convert';

// ==================================================================== WORDS
export function WordsView() {
  const ui = useUi();
  const library = useLibrary();
  const study = useStudy();
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(48);
  const [showFilters, setShowFilters] = useState(false);
  const [jlpt, setJlpt] = useState('all');
  const [pos, setPos] = useState('all');
  const [tag, setTag] = useState('all');
  const [commonOnly, setCommonOnly] = useState(false);
  const [listFilter, setListFilter] = useState('all');

  const gq = useUi(s => s.globalQuery);
  const [consumedGq, setConsumedGq] = useState('');
  if (gq && gq !== consumedGq) { setConsumedGq(gq); setQuery(gq); }

  // deep-link from dashboard JLPT coverage rows
  const jlptPreset = useUi(s => s.wordsJlptPreset);
  const setWordsJlptPreset = useUi(s => s.setWordsJlptPreset);
  useEffect(() => {
    if (!jlptPreset) return;
    const preset = jlptPreset;
    Promise.resolve().then(() => {
      setJlpt(preset);
      setWordsJlptPreset(null);
    });
  }, [jlptPreset, setWordsJlptPreset]);

  const results = useMemo(() => {
    let r = searchWordsDeinflected(query, { jlpt: jlpt === 'all' ? undefined : (Number(jlpt) as 5 | 4 | 3 | 2 | 1), pos: pos === 'all' ? undefined : pos, tag: tag === 'all' ? undefined : tag, commonOnly }, { wildcard: true }, limit);
    if (listFilter !== 'all') {
      const l = library.lists.find(x => x.id === listFilter);
      if (l) r = { ...r, items: r.items.filter(w => l.wordIds.includes(w.id)) };
    }
    return r;
  }, [query, jlpt, pos, tag, commonOnly, limit, listFilter, library.lists]);

  useEffect(() => {
    if (query.trim()) {
      const t = setTimeout(() => library.pushHistory(query.trim(), 'words'), 600);
      return () => clearTimeout(t);
    }
  }, [query]);

  const exportCsv = () => {
    const rows: (string | number)[][] = [['Form', 'Reading', 'Glosses', 'JLPT', 'Tags']];
    for (const w of results.items) rows.push([w.k || '', w.a[0] || '', w.s.map(s => s.gloss).join('; '), w.j ? `N${w.j}` : '', (w.t || []).join(' ')]);
    downloadFile(toCsv(rows), `bunsan-words-${Date.now()}.csv`, 'text/csv');
    toast({ title: `Exported ${results.items.length} words as CSV` });
  };
  const exportJson = () => {
    downloadFile(JSON.stringify(results.items, null, 2), `bunsan-words-${Date.now()}.json`, 'application/json');
    toast({ title: `Exported ${results.items.length} words as JSON` });
  };
  const exportAnki = () => {
    const rows = results.items.map(w => [w.k || w.a[0], w.a[0], w.s.map(s => s.gloss).join('<br>')].join('\t'));
    downloadFile(rows.join('\n'), `bunsan-anki-${Date.now()}.txt`, 'text/plain');
    toast({ title: `Exported Anki TSV (${results.items.length} cards)` });
  };
  const saveSearch = () => {
    if (!query.trim()) return toast({ title: 'Type a query first' });
    library.saveSearch(query.trim(), query.trim(), 'words', { jlpt, pos, tag, commonOnly });
    toast({ title: 'Search saved', description: 'Find it in Lists & Tags → Saved searches' });
  };

  const recent = library.history.filter(h => h.kind === 'words').slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Words <span className="text-muted-foreground font-normal text-lg">単語</span></h1>
          <p className="text-sm text-muted-foreground">{WORDS.length.toLocaleString()} entries — search by kanji, kana, romaji or English</p>
        </div>
        <div className="md:ml-auto flex flex-wrap gap-2">
          <Button size="sm" variant="outline" onClick={saveSearch}><Save className="h-3.5 w-3.5 mr-1" />Save search</Button>
          <Button size="sm" variant="outline" onClick={exportCsv}><Download className="h-3.5 w-3.5 mr-1" />CSV</Button>
          <Button size="sm" variant="outline" onClick={exportJson}>JSON</Button>
          <Button size="sm" variant="outline" onClick={exportAnki}>Anki</Button>
          <Button size="sm" variant="outline" onClick={() => window.print()}><Printer className="h-3.5 w-3.5 mr-1" />Print</Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9 pr-10 h-11 text-base" placeholder="例: 食べる, たべる, taberu, eat, み*…" value={query} onChange={e => setQuery(e.target.value)} aria-label="word search" />
        {query && <Button size="icon" variant="ghost" className="absolute right-1.5 top-1/2 -translate-y-1/2 h-7 w-7" onClick={() => setQuery('')} aria-label="clear"><X className="h-4 w-4" /></Button>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={showFilters ? 'default' : 'outline'} onClick={() => setShowFilters(v => !v)}><SlidersHorizontal className="h-3.5 w-3.5 mr-1" />Filters</Button>
        <ToggleGroup type="single" value={jlpt} onValueChange={v => v && setJlpt(v)} size="sm">
          <ToggleGroupItem value="all" className="text-xs h-7">All</ToggleGroupItem>
          {['5', '4', '3', '2', '1'].map(n => <ToggleGroupItem key={n} value={n} className="text-xs h-7">N{n}</ToggleGroupItem>)}
        </ToggleGroup>
        {recent.length > 0 && (
          <Popover>
            <PopoverTrigger asChild><Button size="sm" variant="ghost" className="text-xs"><History className="h-3.5 w-3.5 mr-1" />Recent</Button></PopoverTrigger>
            <PopoverContent className="w-64 p-2">
              {recent.map((h, i) => (
                <button key={i} className="w-full text-left text-sm rounded px-2 py-1.5 hover:bg-accent" onClick={() => setQuery(h.q)}>{h.q}</button>
              ))}
              <Separator className="my-1" />
              <button className="w-full text-left text-xs text-destructive rounded px-2 py-1 hover:bg-accent flex items-center" onClick={() => library.clearHistory()}><Trash2 className="h-3 w-3 mr-1" />Clear history</button>
            </PopoverContent>
          </Popover>
        )}
      </div>

      {showFilters && (
        <Card className="anim-fade-up"><CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Part of speech</Label>
            <Select value={pos} onValueChange={setPos}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any</SelectItem>
                <SelectItem value="verb">Verbs</SelectItem>
                <SelectItem value="adj">Adjectives</SelectItem>
                <SelectItem value="n">Nouns</SelectItem>
                <SelectItem value="adv">Adverbs</SelectItem>
                <SelectItem value="exp">Expressions</SelectItem>
                <SelectItem value="ctr">Counters</SelectItem>
                <SelectItem value="prt">Particles</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Tag</Label>
            <Select value={tag} onValueChange={setTag}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any tag</SelectItem>
                {ALL_TAGS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">From list</Label>
            <Select value={listFilter} onValueChange={setListFilter}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All entries</SelectItem>
                {library.lists.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 pt-5">
            <Switch id="common" checked={commonOnly} onCheckedChange={setCommonOnly} />
            <Label htmlFor="common" className="text-xs">Common words only</Label>
          </div>
        </CardContent></Card>
      )}

      {query.trim() === '' && recent.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Recent searches</h3>
          <div className="flex flex-wrap gap-2">
            {recent.map((h, i) => <Button key={i} size="sm" variant="secondary" className="h-7 text-xs" onClick={() => setQuery(h.q)}>{h.q}</Button>)}
          </div>
        </div>
      )}

      {query.trim() !== '' && results.items.length > 0 && (
        <p className="text-xs text-muted-foreground">Normalized query: <span className="jp-sans font-medium text-foreground">{normalizeQuery(query)}</span></p>
      )}

      {results.deinflected && results.deinflected.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
          <Sparkles className="h-4 w-4 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <div className="text-sm leading-relaxed">
            <span className="jp-sans font-semibold">“{query.trim()}”</span> is <span className="text-emerald-700 dark:text-emerald-300 font-medium">{results.deinflected[0].chain || 'an inflected form'}</span> of{' '}
            <button className="jp-sans font-bold underline underline-offset-2 decoration-emerald-500/60 hover:decoration-emerald-500" onClick={() => ui.openWord(results.deinflected![0].word.id)}>
              {results.deinflected[0].word.k || results.deinflected[0].word.a[0]}
            </button>
            {results.deinflected.length > 1 && (
              <span className="text-muted-foreground"> — also matches: {results.deinflected.slice(1, 4).map(m => m.word.k || m.word.a[0]).join('、')}</span>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">Deconjugation engine: inflected forms are reduced back to their dictionary entry automatically.</p>
          </div>
          <Button
            size="sm"
            className="ml-auto shrink-0 h-8 border-emerald-500/40 bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-600/25 border"
            variant="ghost"
            onClick={() => {
              const w0 = results.deinflected![0].word;
              study.enroll([`w:${w0.id}`]);
              toast({ title: `Added ${w0.k || w0.a[0]} to SRS`, description: `The dictionary form behind “${query.trim()}” will appear in your next session.` });
            }}
          >
            <Zap className="h-3.5 w-3.5 mr-1" />Add dict form
          </Button>
        </div>
      )}
      {results.deinflected && results.deinflected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {results.deinflected.map(m => (
            <button key={m.word.id} onClick={() => ui.openWord(m.word.id)} className="group flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-sm hover:border-emerald-500/50 hover:bg-emerald-500/5 transition">
              <span className="jp-sans font-semibold">{m.word.k || m.word.a[0]}</span>
              <span className="text-xs text-muted-foreground group-hover:text-emerald-700 dark:group-hover:text-emerald-400">{m.chain}</span>
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {results.items.map((w, i) => <WordCard key={w.id} w={w} idx={i} />)}
      </div>
      {results.items.length === 0 && (
        <EmptyState jp="言" title="該当なし — no words found" hint="Try romaji (e.g. “taberu”), a shorter query, or relax the filters." />
      )}
      {results.items.length >= limit && (
        <div className="text-center">
          <Button variant="outline" onClick={() => setLimit(l => l + 48)}>Load more ({results.items.length} shown)</Button>
        </div>
      )}
    </div>
  );
}

// ==================================================================== KANJI
export function KanjiView() {
  const [query, setQuery] = useState('');
  const [grade, setGrade] = useState('all');
  const [jlpt, setJlpt] = useState('all');
  const [strokes, setStrokes] = useState('all');
  const [limit, setLimit] = useState(60);
  const [sheetOpen, setSheetOpen] = useState(false);
  const strokeOptions = useMemo(() => [...new Set(KANJI.map(k => k.st))].sort((a, b) => a - b), []);

  const results = useMemo(() => searchKanji(query, { grade, jlpt, strokes }, limit), [query, grade, jlpt, strokes, limit]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Kanji <span className="text-muted-foreground font-normal text-lg">漢字</span></h1>
          <p className="text-sm text-muted-foreground">{KANJI.length.toLocaleString()} characters — by grade, JLPT, strokes, radicals & more</p>
        </div>
        <Button variant="outline" className="gap-1.5 h-9" onClick={() => setSheetOpen(true)} disabled={results.length === 0}>
          <Printer className="h-4 w-4 text-primary" />Practice sheet
        </Button>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9 h-11 text-base" placeholder="Search by character, reading (ニチ / ひ) or meaning…" value={query} onChange={e => setQuery(e.target.value)} aria-label="kanji search" />
      </div>
      <div className="flex flex-wrap gap-3">
        <Select value={grade} onValueChange={setGrade}>
          <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="Grade" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any grade</SelectItem>
            {[1, 2, 3, 4, 5, 6, 8].map(g => <SelectItem key={g} value={String(g)}>Grade {g}{g === 8 ? ' (JH)' : ''}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={jlpt} onValueChange={setJlpt}>
          <SelectTrigger className="w-32 h-8 text-xs"><SelectValue placeholder="JLPT" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any JLPT</SelectItem>
            {[1, 2, 3, 4, 5].map(j => <SelectItem key={j} value={String(j)}>N{j}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={strokes} onValueChange={setStrokes}>
          <SelectTrigger className="w-36 h-8 text-xs"><SelectValue placeholder="Strokes" /></SelectTrigger>
          <SelectContent className="max-h-64">
            <SelectItem value="all">Any strokes</SelectItem>
            {strokeOptions.map(s => <SelectItem key={s} value={String(s)}>{s} strokes</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
        {results.map((k, i) => <KanjiCard key={k.c} k={k} idx={i} />)}
      </div>
      {results.length === 0 && <EmptyState jp="漢" title="No kanji match" hint="Try 漢, ニチ, ひ, “sun”… or use the radical search below." />}
      {results.length >= limit && <div className="text-center"><Button variant="outline" onClick={() => setLimit(l => l + 60)}>Load more</Button></div>}
      <PracticeSheetDialog kanjiList={results.map(k => k.c)} open={sheetOpen} onOpenChange={setSheetOpen} />
    </div>
  );
}

// ==================================================================== RADICALS
export function RadicalsView() {
  const [selected, setSelected] = useState<string[]>([]);
  const [strokeFilter, setStrokeFilter] = useState<number | 'all'>('all');
  const [radicalQuery, setRadicalQuery] = useState('');
  const ui = useUi();

  const groups = useMemo(() => {
    const byStrokes: Record<number, typeof RADICALS> = {};
    for (const r of RADICALS) {
      if (strokeFilter !== 'all' && r.st !== strokeFilter) continue;
      if (radicalQuery && !r.m.some(m => m.toLowerCase().includes(radicalQuery.toLowerCase())) && !r.c.includes(radicalQuery) && !(r.a || []).some(a => a.toLowerCase().includes(radicalQuery.toLowerCase()))) continue;
      (byStrokes[r.st] ||= []).push(r);
    }
    return Object.entries(byStrokes).sort((a, b) => Number(a[0]) - Number(b[0]));
  }, [strokeFilter, radicalQuery]);

  const matches = useMemo(() => selected.length ? kanjiWithComponents(selected, 120) : [], [selected]);
  const radicalCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const [rad, kanji] of Object.entries(RADK)) m.set(rad, kanji.length);
    for (const k of KANJI) for (const c of k.rd || []) if (!m.has(c)) m.set(c, 1);
    return m;
  }, []);

  const toggle = (c: string) => setSelected(sel => sel.includes(c) ? sel.filter(x => x !== c) : sel.length < 4 ? [...sel, c] : sel);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Radicals <span className="text-muted-foreground font-normal text-lg">部首</span></h1>
        <p className="text-sm text-muted-foreground">{RADICALS.length} radicals — pick up to 4 components to find kanji</p>
      </div>

      <Card><CardContent className="p-4">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-sm font-medium">Selected:</span>
          {selected.length === 0 && <span className="text-sm text-muted-foreground">none — click radicals below</span>}
          {selected.map(c => (
            <Badge key={c} variant="default" className="text-lg px-2.5 jp-serif cursor-pointer" onClick={() => toggle(c)}>{c} <X className="h-3 w-3 ml-1" /></Badge>
          ))}
          {selected.length > 0 && <Button size="sm" variant="ghost" onClick={() => setSelected([])}>Clear all</Button>}
        </div>
        {selected.length > 0 && (
          <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2 max-h-72 overflow-y-auto bunsan-scroll p-1">
            {matches.map(k => (
              <button key={k.c} onClick={() => ui.openKanji(k.c)} className="flex flex-col items-center rounded-lg border bg-card p-2 hover:border-primary/50 hover:shadow transition" aria-label={`kanji ${k.c}`}>
                <span className="text-2xl jp-serif">{k.c}</span>
                <span className="text-[9px] text-muted-foreground text-center line-clamp-1">{k.m[0]}</span>
              </button>
            ))}
            {matches.length === 0 && <p className="col-span-full text-sm text-muted-foreground py-4 text-center">No kanji contain all of those components together.</p>}
          </div>
        )}
      </CardContent></Card>

      <div className="flex flex-wrap gap-3 items-center">
        <Input className="max-w-56 h-9" placeholder="Filter radicals (e.g. water)…" value={radicalQuery} onChange={e => setRadicalQuery(e.target.value)} />
        <ToggleGroup type="single" value={String(strokeFilter)} onValueChange={v => setStrokeFilter(v === 'all' ? 'all' : Number(v))} size="sm">
          <ToggleGroupItem value="all" className="text-xs h-7">All</ToggleGroupItem>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => <ToggleGroupItem key={n} value={String(n)} className="text-xs h-7">{n}</ToggleGroupItem>)}
        </ToggleGroup>
      </div>

      <div className="space-y-4">
        {groups.map(([strokes, rads]) => (
          <div key={strokes}>
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{strokes} stroke{Number(strokes) > 1 ? 's' : ''} · {rads.length}</h3>
            <div className="flex flex-wrap gap-2">
              {rads.map(r => {
                const isSel = selected.includes(r.c);
                const count = radicalCounts.get(r.c) || 0;
                return (
                  <button key={r.c} onClick={() => toggle(r.c)}
                    className={`flex flex-col items-center rounded-lg border px-2.5 py-1.5 transition min-w-14 ${isSel ? 'border-primary bg-primary/10 shadow-sm' : 'bg-card hover:border-primary/40'}`}
                    title={`${r.m.join(', ')}${count ? ` — ${count} kanji` : ''}`}>
                    <span className="text-2xl jp-serif">{r.c}</span>
                    <span className="text-[9px] text-muted-foreground line-clamp-1 max-w-16">{r.m[0]}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==================================================================== SENTENCES
export function SentencesView() {
  const [query, setQuery] = useState('');
  const [jlpt, setJlpt] = useState('all');
  const [tag, setTag] = useState('all');
  const [limit, setLimit] = useState(40);
  const results = useMemo(() => searchSentences(query, { jlpt, tag }, limit), [query, jlpt, tag, limit]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sentences <span className="text-muted-foreground font-normal text-lg">例文</span></h1>
        <p className="text-sm text-muted-foreground">{SEARCH_SENTENCES_COUNT} example sentences with translations & audio</p>
      </div>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9 h-11 text-base" placeholder="Search Japanese text or English meaning…" value={query} onChange={e => setQuery(e.target.value)} aria-label="sentence search" />
      </div>
      <div className="flex flex-wrap gap-3">
        <ToggleGroup type="single" value={jlpt} onValueChange={v => v && setJlpt(v)} size="sm">
          <ToggleGroupItem value="all" className="text-xs h-7">All</ToggleGroupItem>
          {['5', '4', '3', '2', '1'].map(n => <ToggleGroupItem key={n} value={n} className="text-xs h-7">N{n}</ToggleGroupItem>)}
        </ToggleGroup>
        <Select value={tag} onValueChange={setTag}>
          <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any topic</SelectItem>
            {ALL_SENTENCE_TAGS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {results.map((s, i) => <SentenceCard key={s.id} s={s} idx={i} />)}
      </div>
      {results.length === 0 && <EmptyState jp="文" title="No sentences match" hint="Try a different keyword, tag or JLPT level." />}
      {results.length >= limit && <div className="text-center"><Button variant="outline" onClick={() => setLimit(l => l + 40)}>Load more</Button></div>}
    </div>
  );
}

const SEARCH_SENTENCES_COUNT = 140;

// ==================================================================== EXPRESSIONS
const EXPR_TYPES = ['all', 'proverb', 'idiom', 'greeting', 'yojijukugo'] as const;

export function ExpressionsView() {
  const [query, setQuery] = useState('');
  const [type, setType] = useState<string>('all');
  const speak = useSpeak();
  const library = useLibrary();
  const study = useStudy();

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return EXPRESSIONS.filter(e => {
      if (type !== 'all' && !(e.t || []).includes(type)) return false;
      if (!q) return true;
      return e.expr.toLowerCase().includes(q) || e.rd.includes(q) || e.m.toLowerCase().includes(q) || toHira(e.rd).includes(toHira(q));
    });
  }, [query, type]);

  const exprOfDay = useMemo(() => {
    const d = new Date();
    const seed = d.getDate() + d.getMonth() * 31;
    return EXPRESSIONS.filter(e => (e.t || []).includes('proverb'))[seed % 30] || EXPRESSIONS[0];
  }, []);

  const typeLabel: Record<string, string> = { proverb: '諺 proverb', idiom: '慣用句 idiom', greeting: '挨拶 greeting', yojijukugo: '四字熟語 4-kanji idiom' };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Expressions <span className="text-muted-foreground font-normal text-lg">言い回し</span></h1>
        <p className="text-sm text-muted-foreground">{EXPRESSIONS.length} proverbs, idioms, greetings & yojijukugo</p>
      </div>

      <Card className="overflow-hidden"><CardContent className="p-0">
        <div className="px-5 py-3 seigaiha-bg flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-primary">Expression of the day</span>
            <div className="jp-sans text-xl font-medium mt-0.5">{exprOfDay.expr}</div>
            <div className="text-xs text-muted-foreground">{exprOfDay.rd}</div>
            <div className="text-sm mt-1">{exprOfDay.m}</div>
          </div>
          <Button size="icon" variant="outline" className="shrink-0" onClick={() => speak(exprOfDay.rd)} aria-label="play expression"><Volume2 className="h-4 w-4" /></Button>
        </div>
      </CardContent></Card>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9 h-10" placeholder="Search expressions or meanings…" value={query} onChange={e => setQuery(e.target.value)} aria-label="expression search" />
      </div>
      <ToggleGroup type="single" value={type} onValueChange={v => v && setType(v)} size="sm" className="flex-wrap gap-1.5 [&>[data-slot=toggle-group-item]]:rounded-full">
        {EXPR_TYPES.map(t => <ToggleGroupItem key={t} value={t} className="text-xs h-7 flex-none rounded-full first:rounded-full last:rounded-full border border-transparent data-[state=on]:border-primary">{t === 'all' ? 'All' : typeLabel[t]}</ToggleGroupItem>)}
      </ToggleGroup>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {results.map((e, i) => {
          const enrolled = !!study.cards[`e:${e.id}`];
          const isFav = library.favorites.sentences.includes(e.id);
          return (
            <div key={e.id} className="group rounded-xl border bg-card hover:border-primary/40 hover:shadow-md transition-all anim-fade-up p-4" style={{ animationDelay: `${Math.min(i * 25, 500)}ms` }}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="jp-sans text-lg font-medium leading-relaxed">{e.expr}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{e.rd} <i>({hiraToRomaji(e.rd)})</i></div>
                  <div className="text-sm mt-2">{e.m}</div>
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    <JlptBadge level={e.j} />
                    {(e.t || []).map(t => <Badge key={t} variant="outline" className="text-[10px] px-1.5">{t}</Badge>)}
                    {enrolled && <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary">SRS</Badge>}
                  </div>
                </div>
                <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => speak(e.rd)} aria-label="audio"><Volume2 className="h-3.5 w-3.5" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => library.toggleFavorite('sentences', e.id)} aria-label="favorite">{isFav ? <StarOff className="h-3.5 w-3.5 text-primary" /> : <Star className="h-3.5 w-3.5" />}</Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => enrolled ? study.unenroll(`e:${e.id}`) : study.enroll([`e:${e.id}`])} aria-label="study"><GraduationCap className={`h-3.5 w-3.5 ${enrolled ? 'text-primary' : ''}`} /></Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {results.length === 0 && <div className="rounded-xl border border-dashed p-10 text-center text-muted-foreground text-sm">No expressions match.</div>}
    </div>
  );
}

// ==================================================================== GRAMMAR
const GRAMMAR_TYPES = ['all', 'structure', 'particle', 'conjunction', 'auxiliary', 'sentence-ending', 'condition', 'aspect', 'comparison', 'obligation', 'desire', 'causative', 'passive', 'give-receive'] as const;
const GRAMMAR_TYPE_LABEL: Record<string, string> = {
  structure: '構文 structure', particle: '助詞 particle', conjunction: '接続 conjunction', auxiliary: '助動詞 auxiliary',
  'sentence-ending': '文末 sentence-ending', condition: '条件 condition', aspect: '相 aspect', comparison: '比較 comparison',
  obligation: '義務 obligation', desire: '願望 desire', causative: '使役 causative', passive: '受身 passive', 'give-receive': '授受 give/receive',
};
/** JLPT accent stripe per level (matches WordCards: N5 emerald → N1 red) */
const GRAMMAR_LEVEL_STRIPE: Record<number, string> = { 5: 'border-l-emerald-500', 4: 'border-l-teal-500', 3: 'border-l-sky-500', 2: 'border-l-orange-500', 1: 'border-l-red-500' };

export function GrammarView() {
  const [query, setQuery] = useState('');
  const [jlpt, setJlpt] = useState('all');
  const [type, setType] = useState<string>('all');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [limit, setLimit] = useState(30);
  const speak = useSpeak();
  const library = useLibrary();
  const study = useStudy();
  const grammarFavs = library.favorites.grammar ?? [];

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return GRAMMAR.filter(g => {
      if (jlpt !== 'all' && String(g.j) !== jlpt) return false;
      if (type !== 'all' && !(g.t || []).includes(type)) return false;
      if (!q) return true;
      // romaji search tolerant of kunrei-shiki input (si→shi, ti→chi, tu→tsu, hu→fu…)
      const rom = g.rom.toLowerCase();
      return g.p.toLowerCase().includes(q) || rom.includes(q) || rom.includes(kunreiToHepburn(q)) || g.m.toLowerCase().includes(q) || g.form.toLowerCase().includes(q) || g.ex.some(e => e.ja.includes(q) || e.en.toLowerCase().includes(q));
    });
  }, [query, jlpt, type]);

  const patternOfDay = useMemo(() => {
    const d = new Date();
    const seed = d.getDate() + d.getMonth() * 31;
    return GRAMMAR[seed % GRAMMAR.length];
  }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Grammar <span className="text-muted-foreground font-normal text-lg">文法</span></h1>
        <p className="text-sm text-muted-foreground">{GRAMMAR.length} curated patterns from N5 to N1 — with formation, examples & SRS</p>
      </div>

      {/* Pattern of the day hero */}
      <Card className="overflow-hidden"><CardContent className="p-0">
        <div className="px-5 py-3 seigaiha-bg flex items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-primary">Pattern of the day</span>
            <div className="jp-sans text-xl font-medium mt-0.5">{patternOfDay.p}</div>
            <div className="text-xs text-muted-foreground">{patternOfDay.rom}</div>
            <div className="text-sm mt-1">{patternOfDay.m}</div>
          </div>
          <Button size="icon" variant="outline" className="shrink-0" onClick={() => speak(patternOfDay.ex[0].ja)} aria-label="play pattern example"><Volume2 className="h-4 w-4" /></Button>
        </div>
      </CardContent></Card>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9 h-10" placeholder="Search patterns, meanings or examples…" value={query} onChange={e => setQuery(e.target.value)} aria-label="grammar search" />
      </div>
      <div className="flex flex-col gap-2">
        <ToggleGroup type="single" value={jlpt} onValueChange={v => v && setJlpt(v)} size="sm" className="flex-wrap gap-1.5 [&>[data-slot=toggle-group-item]]:rounded-full">
          <ToggleGroupItem value="all" className="text-xs h-7 rounded-full first:rounded-full last:rounded-full border border-transparent data-[state=on]:border-primary">All levels</ToggleGroupItem>
          {['5', '4', '3', '2', '1'].map(n => <ToggleGroupItem key={n} value={n} className="text-xs h-7 rounded-full first:rounded-full last:rounded-full border border-transparent data-[state=on]:border-primary">N{n}</ToggleGroupItem>)}
        </ToggleGroup>
        <ToggleGroup type="single" value={type} onValueChange={v => v && setType(v)} size="sm" className="flex-wrap gap-1.5 [&>[data-slot=toggle-group-item]]:rounded-full">
          {GRAMMAR_TYPES.map(t => <ToggleGroupItem key={t} value={t} className="text-xs h-7 flex-none rounded-full first:rounded-full last:rounded-full border border-transparent data-[state=on]:border-primary">{t === 'all' ? 'All types' : GRAMMAR_TYPE_LABEL[t]}</ToggleGroupItem>)}
        </ToggleGroup>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {results.slice(0, limit).map((g: GrammarEntry, i) => {
          const enrolled = !!study.cards[`g:${g.id}`];
          const isFav = grammarFavs.includes(g.id);
          const open = expanded === g.id;
          return (
            <div key={g.id} className={`group rounded-xl border border-l-4 bg-card hover:border-primary/40 hover:shadow-md transition-all anim-fade-up p-4 ${GRAMMAR_LEVEL_STRIPE[g.j || 5]}`} style={{ animationDelay: `${Math.min(i * 25, 500)}ms` }}>
              <button className="w-full text-left" onClick={() => setExpanded(open ? null : g.id)} aria-expanded={open} aria-label={`toggle pattern ${g.p}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="jp-sans text-lg font-medium leading-snug">{g.p}</div>
                    <div className="text-xs text-muted-foreground mt-0.5"><i>{g.rom}</i></div>
                    <div className="text-sm mt-1.5">{g.m}</div>
                  </div>
                  <span className={`shrink-0 mt-1 text-muted-foreground/50 transition-transform duration-200 ${open ? 'rotate-180' : ''} group-hover:text-primary`}>▾</span>
                </div>
                <div className="mt-2 text-[11px] text-muted-foreground rounded-md bg-muted/60 px-2 py-1 inline-block jp-sans">作り方: {g.form}</div>
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  <JlptBadge level={g.j} />
                  {(g.t || []).map(t => <Badge key={t} variant="outline" className="text-[10px] px-1.5">{t}</Badge>)}
                  {enrolled && <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary">SRS</Badge>}
                </div>
              </button>
              {open && (
                <div className="mt-3 pt-3 border-t space-y-2 anim-fade-up">
                  {g.ex.map((ex, j) => (
                    <div key={j} className="flex items-start gap-2 text-sm">
                      <button className="shrink-0 mt-0.5 text-primary hover:text-primary/70" onClick={() => speak(ex.ja)} aria-label="play example"><Volume2 className="h-3.5 w-3.5" /></button>
                      <div className="min-w-0">
                        <div className="jp-sans">{ex.ja}</div>
                        <div className="text-xs text-muted-foreground">{ex.en}</div>
                      </div>
                    </div>
                  ))}
                  {g.note && <div className="text-xs rounded-lg border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5 text-amber-700 dark:text-amber-300">💡 {g.note}</div>}
                </div>
              )}
              <div className="flex gap-1 mt-2 -mb-1">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => speak(g.ex[0].ja)} aria-label="audio"><Volume2 className="h-3.5 w-3.5" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => library.toggleFavorite('grammar', g.id)} aria-label="favorite">{isFav ? <StarOff className="h-3.5 w-3.5 text-primary" /> : <Star className="h-3.5 w-3.5" />}</Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { study.enroll([`g:${g.id}`]); if (!enrolled) toast({ title: 'Added to SRS', description: `${g.p} will appear in your next study session` }); }} aria-label="study"><GraduationCap className={`h-3.5 w-3.5 ${enrolled ? 'text-primary' : ''}`} /></Button>
                {enrolled && <Button size="sm" variant="ghost" className="h-7 text-[11px] text-muted-foreground ml-auto" onClick={() => study.unenroll(`g:${g.id}`)}>remove from SRS</Button>}
              </div>
            </div>
          );
        })}
      </div>
      {results.length === 0 && <EmptyState jp="文" title="No grammar patterns match" hint="Try a different keyword, type or JLPT level." />}
      {results.length > limit && <div className="text-center"><Button variant="outline" onClick={() => setLimit(l => l + 30)}>Load more ({results.length - limit} hidden)</Button></div>}
    </div>
  );
}

export function DictionaryViews({ view }: { view: 'words' | 'kanji' | 'radicals' | 'sentences' | 'expressions' | 'grammar' }) {
  if (view === 'words') return <WordsView />;
  if (view === 'kanji') return <KanjiView />;
  if (view === 'radicals') return <RadicalsView />;
  if (view === 'expressions') return <ExpressionsView />;
  if (view === 'grammar') return <GrammarView />;
  return <SentencesView />;
}
