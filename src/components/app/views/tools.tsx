'use client';
// Tool views: Text Annotator, Conjugator, Kana & Tools
import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/hooks/use-toast';
import { Sparkles, Download, Copy, Volume2, Eraser, Calculator, CalendarDays, Zap, Landmark, Repeat } from 'lucide-react';
import { tokenize, kanjiQuickInfo } from '@/lib/dict/furigana';
import { wordById, WORDS, verbClass } from '@/lib/dict/index';
import { conjugate } from '@/lib/dict/conjugate';
import { hiraToRomaji, toHira, toKata, romajiToHira, hasKanji } from '@/lib/dict/convert';
import { HIRAGANA_GROUPS, HIRAGANA_DAKUTEN, HIRAGANA_COMBO, katakanaOf, numberToKanji, numberToReading, kanjiToNumber, ERAS, gregorianToEra, formatEraYear, eraToGregorian, dateInfo, COUNTERS, PARTICLE_GUIDES, GRAMMAR_PATTERNS } from '@/lib/kana-tools';
import { useUi, useSettings, useStudy } from '@/lib/stores';
import { useSpeak, copyText, downloadFile } from '@/lib/client';
import { JlptBadge } from '../entry-cards';

// ==================================================================== ANNOTATOR
export function AnnotatorView() {
  const [text, setText] = useState('日本語を勉強するのは楽しいです。毎朝、学校で友達とご飯を食べます。');
  const [hover, setHover] = useState<{ x: number; y: number; content: React.ReactNode } | null>(null);
  const ui = useUi();
  const study = useStudy();
  const showFuri = useSettings(s => s.showFurigana);
  const settings = useSettings();

  const tokens = useMemo(() => tokenize(text), [text]);
  const stats = useMemo(() => {
    const known = tokens.filter(t => t.wordId && study.cards[`w:${t.wordId}`]).length;
    const dictHits = tokens.filter(t => t.wordId).length;
    const deinf = tokens.filter(t => t.deinflected).length;
    const kanjiChars = new Set([...text].filter(c => /[\u4e00-\u9faf々]/.test(c)));
    const uniqueWords = new Set(tokens.filter(t => t.wordId).map(t => t.wordId));
    return { known, dictHits, deinf, kanji: kanjiChars.size, unique: uniqueWords.size, total: tokens.length };
  }, [tokens, text, study.cards]);

  // unique unknown dictionary words → mining targets
  const mineable = useMemo(() => {
    const seen = new Set<number>();
    const out: Array<{ id: number; text: string; gloss: string; key: string; chain?: string }> = [];
    for (const t of tokens) {
      if (!t.wordId || seen.has(t.wordId) || study.cards[`w:${t.wordId}`]) continue;
      seen.add(t.wordId);
      out.push({ id: t.wordId, text: t.text, gloss: t.gloss || '', key: `w:${t.wordId}`, chain: t.conjChain });
    }
    return out;
  }, [tokens, study.cards]);

  const mineKeys = useMemo(() => mineable.map(m => m.key), [mineable]);

  const mineAll = () => {
    if (mineKeys.length === 0) { toast({ title: 'Everything is already in your SRS! 🎉' }); return; }
    study.enroll(mineKeys, settings.srsMode === 'mixed' ? 'fw' : settings.srsMode);
    toast({ title: `Mined ${mineKeys.length} word${mineKeys.length > 1 ? 's' : ''} → SRS`, description: 'They will appear in your next study session.' });
  };

  const exportMinedCsv = () => {
    const rows = [['word', 'reading', 'meaning', 'jlpt']];
    for (const m of mineable) {
      const w = wordById.get(m.id);
      if (!w) continue;
      rows.push([w.k || w.a[0], w.a[0], w.s.map(s => s.gloss).join('; '), w.j ? `N${w.j}` : '']);
    }
    downloadFile(rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n'), 'mined-words.csv', 'text/csv');
    toast({ title: `Exported ${mineable.length} words to mined-words.csv` });
  };

  const exportHtml = () => {
    const html = `<div style="font-family:sans-serif;line-height:2.2">${tokens.map(t => {
      if (!t.segments) return t.text;
      return t.segments.map(s => s.ruby ? `<ruby>${s.base}<rt style="font-size:.5em">${s.ruby}</rt></ruby>` : s.base).join('');
    }).join('')}</div>`;
    downloadFile(html, 'annotated.html', 'text/html');
    toast({ title: 'Exported annotated.html' });
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Text Annotator <span className="text-muted-foreground font-normal text-lg">文章解析</span></h1>
        <p className="text-sm text-muted-foreground">Paste Japanese text — conjugated forms are auto-deconjugated, with furigana, dictionary links, kanji popups and readability stats</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-3">
          <Textarea value={text} onChange={e => setText(e.target.value)} className="min-h-28 jp-sans text-lg" placeholder="Paste or type Japanese text here…" aria-label="text to annotate" />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={exportHtml}><Download className="h-3.5 w-3.5 mr-1" />Export HTML</Button>
            <Button size="sm" variant="outline" onClick={async () => { await copyText(text); toast({ title: 'Text copied' }); }}><Copy className="h-3.5 w-3.5 mr-1" />Copy text</Button>
            <Button size="sm" variant="outline" onClick={exportMinedCsv} disabled={mineable.length === 0}><Download className="h-3.5 w-3.5 mr-1" />Unknown CSV ({mineable.length})</Button>
            <Button size="sm" onClick={mineAll} className="relative">
              <Zap className="h-3.5 w-3.5 mr-1" />Mine {mineable.length || ''} → SRS
              {mineable.length > 0 && <span className="absolute -top-1.5 -right-1.5 h-4 min-w-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center px-1 anim-pop">{mineable.length}</span>}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setText('')}><Eraser className="h-3.5 w-3.5 mr-1" />Clear</Button>
          </div>
          <Card><CardContent className="p-5 jp-sans leading-loose text-xl" style={{ fontFeatureSettings: '"ruby"' }}>
            {tokens.map((t, i) => {
              if (!t.wordId && !t.segments) return <span key={i} className="text-muted-foreground">{t.text}</span>;
              const known = t.wordId && study.cards[`w:${t.wordId}`];
              const tokenCls = known
                ? 'underline decoration-emerald-500 decoration-2 underline-offset-4'
                : t.deinflected
                  ? 'underline decoration-violet-500 decoration-dotted decoration-2 underline-offset-4'
                  : t.wordId
                    ? 'underline decoration-amber-500/60 decoration-dotted decoration-2 underline-offset-4'
                    : '';
              return (
                <span
                  key={i}
                  className={`cursor-pointer rounded px-0.5 hover:bg-primary/15 transition ${tokenCls}`}
                  onClick={e => {
                    if (t.wordId) ui.openWord(t.wordId);
                    else if (/[\u4e00-\u9faf々]/.test(t.text[0])) ui.openKanji(t.text[0]);
                  }}
                  onMouseEnter={e => {
                    const r = (e.target as HTMLElement).getBoundingClientRect();
                    const ki = kanjiQuickInfo(t.text[0]);
                    setHover({
                      x: Math.min(r.left, window.innerWidth - 280), y: r.bottom + 6,
                      content: t.wordId ? (
                        <div>
                          <div className="font-semibold jp-sans text-base">{t.text}</div>
                          {t.deinflected && (() => {
                            const dw = wordById.get(t.wordId!);
                            return (
                              <div className="mt-1 inline-flex items-center gap-1 rounded-full border border-violet-500/40 bg-violet-500/10 px-2 py-0.5 text-[10px] text-violet-700 dark:text-violet-300">
                                <Repeat className="h-2.5 w-2.5" />{t.conjChain} of <span className="jp-sans font-semibold">{dw ? (dw.k || dw.a[0]) : ''}</span>
                              </div>
                            );
                          })()}
                          <div className="text-xs text-muted-foreground mt-0.5">{t.gloss}</div>
                          <div className="text-[10px] mt-1 text-primary">click to open entry</div>
                        </div>
                      ) : ki ? (
                        <div>
                          <div className="jp-serif text-xl">{t.text[0]} <span className="text-xs text-muted-foreground">{ki.st} strokes</span></div>
                          <div className="text-xs">{ki.m.join(', ')}</div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">ON {ki.on.join(' ')} · KUN {ki.kun.join(' ')}</div>
                        </div>
                      ) : <span className="text-xs">no dictionary data</span>,
                    });
                  }}
                  onMouseLeave={() => setHover(null)}
                >
                  {t.segments ? t.segments.map((s, j) => s.ruby && showFuri ? <ruby key={j}>{s.base}<rt>{s.ruby}</rt></ruby> : <span key={j}>{s.base}</span>) : t.text}
                </span>
              );
            })}
          </CardContent></Card>
          <div className="flex items-center gap-4 text-[11px] text-muted-foreground px-1 flex-wrap">
            <span className="inline-flex items-center gap-1.5"><span className="inline-block w-6 border-b-2 border-emerald-500" />known (in SRS)</span>
            <span className="inline-flex items-center gap-1.5"><span className="inline-block w-6 border-b-2 border-dotted border-amber-500/70" />unknown word</span>
            <span className="inline-flex items-center gap-1.5"><span className="inline-block w-6 border-b-2 border-dotted border-violet-500" />deconjugated form</span>
            <span>click any token to open its entry</span>
          </div>
          {hover && (
            <div className="fixed z-50 w-64 rounded-lg border bg-popover p-3 shadow-xl pointer-events-none" style={{ left: hover.x, top: hover.y }}>
              {hover.content}
            </div>
          )}
        </div>
        <div className="space-y-3">
          <Card><CardContent className="p-4 space-y-2.5">
            <div className="text-sm font-semibold mb-1">Analysis</div>
            {([['Tokens', stats.total], ['Dictionary hits', stats.dictHits], ['Deconjugated', stats.deinf], ['Unique words', stats.unique], ['Kanji characters', stats.kanji], ['Known (SRS)', stats.known]] as const).map(([l, v]) => (
              <div key={l} className="flex justify-between text-sm"><span className="text-muted-foreground">{l}</span><span className={`font-medium ${l === 'Deconjugated' && v > 0 ? 'text-violet-600 dark:text-violet-400' : ''}`}>{v}</span></div>
            ))}
            <Separator />
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Known ratio</span>
              <span className="font-medium">{stats.dictHits ? Math.round((stats.known / stats.dictHits) * 100) : 0}%</span>
            </div>
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="text-sm font-semibold mb-2 flex items-center justify-between">
              <span>Mining tray</span>
              {mineable.length > 0 && <Button size="sm" variant="ghost" className="h-6 text-xs text-primary" onClick={mineAll}><Zap className="h-3 w-3 mr-0.5" />all</Button>}
            </div>
            {mineable.length === 0 ? (
              <div className="text-xs text-muted-foreground py-6 text-center rounded-lg border border-dashed">
                <span className="block text-2xl jp-serif mb-1 opacity-40">採掘</span>
                No unknown words — paste new text or mine away!
              </div>
            ) : (
              <div className="space-y-1 max-h-72 overflow-y-auto bunsan-scroll pr-1">
                {mineable.slice(0, 40).map((m, i) => (
                  <div key={m.id} className="group flex items-center gap-1.5 rounded border px-2 py-1 text-sm hover:border-primary/40 anim-fade-up" style={{ animationDelay: `${Math.min(i * 30, 400)}ms` }}>
                    <button className="jp-sans font-medium hover:text-primary min-w-0 truncate text-left" onClick={() => ui.openWord(m.id)} title={m.chain ? `${m.text} — ${m.chain}` : m.gloss}>{m.text}</button>
                    {m.chain && <span className="shrink-0 rounded-full border border-violet-500/40 bg-violet-500/10 px-1.5 text-[9px] text-violet-700 dark:text-violet-300" title={m.chain}>{m.chain}</span>}
                    <span className="text-[10px] text-muted-foreground truncate flex-1">{m.gloss.slice(0, 34)}</span>
                    <button
                      className="shrink-0 rounded p-1 text-primary opacity-60 group-hover:opacity-100 hover:bg-primary/10 transition"
                      onClick={() => { study.enroll([m.key]); toast({ title: `Added ${m.text} to SRS` }); }}
                      aria-label={`add ${m.text} to SRS`}
                    >
                      <Zap className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </CardContent></Card>
          <Card><CardContent className="p-4">
            <div className="text-sm font-semibold mb-2">All words in text</div>
            <div className="space-y-1 max-h-56 overflow-y-auto bunsan-scroll pr-1">
              {tokens.filter(t => t.wordId).slice(0, 40).map((t, i) => (
                <button key={i} className={`w-full flex items-center justify-between gap-2 rounded border px-2 py-1 text-left text-sm hover:bg-accent/50 ${study.cards[`w:${t.wordId}`] ? 'border-emerald-500/30' : ''}`} onClick={() => t.wordId && ui.openWord(t.wordId)}>
                  <span className="jp-sans">{t.text}</span>
                  <span className="text-xs text-muted-foreground truncate">{t.gloss?.slice(0, 40)}</span>
                </button>
              ))}
            </div>
          </CardContent></Card>
        </div>
      </div>
    </div>
  );
}

// ==================================================================== CONJUGATOR
export function ConjugatorView() {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<number | null>(null);
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return WORDS.filter(w => (w.k || '').includes(query) || w.a.some(a => a.includes(toHira(query)))).slice(0, 8);
  }, [query]);
  const word = selected ? wordById.get(selected) : null;
  const conj = word ? conjugate(word) : null;
  const romajiIn = useMemo(() => (query && !/[\u3040-\u30ff\u4e00-\u9faf]/.test(query) ? romajiToHira(query) : null), [query]);

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Conjugator <span className="text-muted-foreground font-normal text-lg">活用</span></h1>
        <p className="text-sm text-muted-foreground">Full conjugation tables for verbs and adjectives</p>
      </div>
      <div className="relative">
        <Input className="h-11 text-base" placeholder="Search a verb/adjective: 食べる, のむ, hanasu…" value={query} onChange={e => { setQuery(e.target.value); setSelected(null); }} aria-label="conjugator search" />
        {suggestions.length > 0 && !word && (
          <Card className="absolute top-12 w-full z-20"><CardContent className="p-1.5">
            {suggestions.map(w => (
              <button key={w.id} className="w-full flex items-center justify-between rounded px-2.5 py-1.5 text-sm hover:bg-accent text-left" onClick={() => setSelected(w.id)}>
                <span className="jp-sans font-medium">{w.k || w.a[0]}</span>
                <span className="text-xs text-muted-foreground">{w.a[0]} {w.s[0]?.gloss.slice(0, 40)}</span>
              </button>
            ))}
          </CardContent></Card>
        )}
      </div>
      {romajiIn && <p className="text-sm text-muted-foreground">Romaji → kana: <span className="jp-sans text-foreground font-medium">{romajiIn}</span> <span className="italic">({hiraToRomaji(romajiIn)})</span></p>}
      {word && conj ? (
        <Card className="anim-fade-up"><CardContent className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <span className="jp-sans text-3xl font-medium">{word.k || word.a[0]}</span>
            <Badge variant="secondary">{({ ru: 'Ichidan (る)', u: 'Godan (う)', suru: 'Suru (する)', kuru: 'Kuru (来る)', 'adj-i': 'I-adjective', 'adj-na': 'Na-adjective', null: '' } as Record<string, string>)[conj.cls ?? '']}</Badge>
            <span className="text-sm text-muted-foreground">{word.s[0]?.gloss}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {conj.forms.map(f => (
              <div key={f.name} className="flex items-baseline justify-between gap-3 rounded-lg border px-3 py-2 hover:bg-accent/40 transition">
                <span className="text-xs text-muted-foreground">{f.name}</span>
                <span className="jp-sans font-medium text-lg">{f.form}</span>
              </div>
            ))}
          </div>
        </CardContent></Card>
      ) : word ? <p className="text-sm text-muted-foreground">This entry is not conjugable (noun, adverb…).</p> : (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Search for any Japanese verb or adjective above.</div>
      )}
    </div>
  );
}

// ==================================================================== KANA & TOOLS
export function KanaView() {
  const speak = useSpeak();
  const [num, setNum] = useState(42);
  const date = useMemo(() => dateInfo(), []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Kana & Tools <span className="text-muted-foreground font-normal text-lg">かな・道具</span></h1>
        <p className="text-sm text-muted-foreground">Kana tables with audio, number & date converters, counters, particles and grammar patterns</p>
      </div>

      <Tabs defaultValue="hiragana">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="hiragana">Hiragana</TabsTrigger>
          <TabsTrigger value="katakana">Katakana</TabsTrigger>
          <TabsTrigger value="dakuten">Dakuten</TabsTrigger>
          <TabsTrigger value="combo">Combos</TabsTrigger>
          <TabsTrigger value="numbers">Numbers</TabsTrigger>
          <TabsTrigger value="reference">Reference</TabsTrigger>
        </TabsList>

        <TabsContent value="hiragana" className="mt-4"><KanaTable groups={HIRAGANA_GROUPS} onSpeak={speak} /></TabsContent>
        <TabsContent value="katakana" className="mt-4"><KataTable onSpeak={speak} /></TabsContent>
        <TabsContent value="dakuten" className="mt-4"><KanaTable groups={HIRAGANA_DAKUTEN} onSpeak={speak} /></TabsContent>
        <TabsContent value="combo" className="mt-4"><KanaTable groups={HIRAGANA_COMBO} onSpeak={speak} /></TabsContent>

        <TabsContent value="numbers" className="mt-4 space-y-4">
          <NumberConverterCard num={num} setNum={setNum} />
          <EraConverterCard date={date} />
          <Card><CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold"><CalendarDays className="h-4 w-4 text-primary" />Today in Japanese</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border p-3"><div className="text-[10px] uppercase text-muted-foreground mb-1">Date</div><div className="jp-sans text-lg">{date.kanji}</div><div className="text-xs text-muted-foreground mt-0.5">{date.reading}</div></div>
              <div className="rounded-lg border p-3"><div className="text-[10px] uppercase text-muted-foreground mb-1">Era (元号)</div><div className="jp-sans text-lg">{date.era}</div><div className="text-xs text-muted-foreground mt-0.5">Old month name: {date.oldMonth}</div></div>
            </div>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="reference" className="mt-4 space-y-4">
          <Card><CardContent className="p-5">
            <h3 className="text-sm font-semibold mb-3">Counters (助数詞)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {COUNTERS.map(c => (
                <div key={c.c} className="rounded-lg border p-2.5 text-sm flex items-center justify-between">
                  <div><span className="jp-sans font-medium">{c.c}</span> <span className="text-muted-foreground text-xs">{c.r} — {c.use}</span></div>
                  <span className="jp-sans text-muted-foreground text-xs">{c.ex}</span>
                </div>
              ))}
            </div>
          </CardContent></Card>
          <Card><CardContent className="p-5">
            <h3 className="text-sm font-semibold mb-3">Particle guide (助詞)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {PARTICLE_GUIDES.map(p => (
                <div key={p.p} className="rounded-lg border p-2.5 text-sm">
                  <span className="jp-sans font-bold text-lg text-primary">{p.p}</span> <span className="text-xs italic text-muted-foreground">({p.r})</span>
                  <div className="text-xs text-muted-foreground">{p.use}</div>
                  <div className="jp-sans text-xs mt-0.5">{p.ex}</div>
                </div>
              ))}
            </div>
          </CardContent></Card>
          <Card><CardContent className="p-5">
            <h3 className="text-sm font-semibold mb-3">Grammar patterns</h3>
            <div className="space-y-2">
              {GRAMMAR_PATTERNS.map(p => (
                <div key={p.pat} className="rounded-lg border p-2.5 text-sm flex items-center gap-3 flex-wrap">
                  <span className="jp-sans font-semibold">{p.pat}</span>
                  <JlptBadge level={p.lvl as 5} />
                  <span className="text-muted-foreground text-xs flex-1">{p.use}</span>
                  <span className="jp-sans text-xs">{p.ex}</span>
                </div>
              ))}
            </div>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function KanaTable({ groups, onSpeak }: { groups: typeof HIRAGANA_GROUPS; onSpeak: (t: string) => void }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
      {groups.map(gr => (
        <Card key={gr.label}><CardContent className="p-3">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">{gr.label}</div>
          <div className="grid grid-cols-5 gap-1">
            {gr.rows.map((row, i) => row.kana ? (
              <button key={i} className="flex flex-col items-center rounded-lg py-1.5 hover:bg-primary/10 transition" onClick={() => onSpeak(row.kana)} aria-label={`${row.kana} ${row.romaji}`}>
                <span className="jp-sans text-xl">{row.kana}</span>
                <span className="text-[9px] text-muted-foreground">{row.romaji}</span>
              </button>
            ) : <div key={i} />)}
          </div>
        </CardContent></Card>
      ))}
    </div>
  );
}

// ---------------- Number converter (bidirectional) ----------------
function NumberConverterCard({ num, setNum }: { num: number; setNum: (n: number) => void }) {
  const [kanjiInput, setKanjiInput] = useState('');
  const parsed = kanjiInput.trim() ? kanjiToNumber(kanjiInput) : null;
  const invalid = kanjiInput.trim() !== '' && parsed === null;
  return (
    <Card><CardContent className="p-5 space-y-4">
      <div className="flex items-center gap-3">
        <Calculator className="h-4 w-4 text-primary" />
        <Label>Number ↔ Kanji converter</Label>
      </div>
      <Input type="number" value={num} onChange={e => setNum(Math.min(999999999999, Math.max(0, Number(e.target.value) || 0)))} className="max-w-52" aria-label="number input" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border p-3"><div className="text-[10px] uppercase text-muted-foreground mb-1">Kanji</div><div className="jp-sans text-2xl">{numberToKanji(num)}</div></div>
        <div className="rounded-lg border p-3"><div className="text-[10px] uppercase text-muted-foreground mb-1">Reading</div><div className="jp-sans text-lg">{numberToReading(num)}</div></div>
        <div className="rounded-lg border p-3"><div className="text-[10px] uppercase text-muted-foreground mb-1">Katakana-ish</div><div className="jp-sans text-lg">{toKata(numberToReading(num).replace(/ /g, ''))}</div></div>
      </div>
      <Separator />
      <Label className="text-xs text-muted-foreground">…or parse kanji numerals → arabic (e.g. 一万二千三百四十五)</Label>
      <div className="flex flex-col sm:flex-row gap-2">
        <Input
          value={kanjiInput}
          onChange={e => setKanjiInput(e.target.value)}
          placeholder="千九百八十九"
          className="jp-sans max-w-xs"
          aria-label="kanji number input"
        />
        <div className={`rounded-lg border px-4 py-2 jp-sans text-xl ${invalid ? 'border-red-400/50 text-red-500' : 'bg-primary/5'}`} aria-live="polite">
          {invalid ? 'invalid kanji numeral' : parsed !== null ? parsed.toLocaleString() : '—'}
        </div>
      </div>
    </CardContent></Card>
  );
}

// ---------------- Era converter ----------------
function EraConverterCard({ date }: { date: ReturnType<typeof dateInfo> }) {
  const [gy, setGy] = useState(2026);
  const [eraIdx, setEraIdx] = useState(0);
  const [eraYear, setEraYear] = useState(8);
  const era = gregorianToEra(gy);
  const west = eraToGregorian(ERAS[eraIdx].name, eraYear);
  return (
    <Card><CardContent className="p-5 space-y-4">
      <div className="flex items-center gap-3">
        <Landmark className="h-4 w-4 text-primary" />
        <Label>Era converter 和暦 ↔ 西暦</Label>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Gregorian → Era */}
        <div className="rounded-lg border p-3 space-y-2">
          <div className="text-[10px] uppercase text-muted-foreground font-semibold">Gregorian → era</div>
          <Input type="number" min={1868} max={2200} value={gy} onChange={e => setGy(Math.min(2200, Math.max(1868, Number(e.target.value) || 1868)))} className="max-w-36" aria-label="gregorian year" />
          <div className="jp-sans text-lg" aria-live="polite">
            {era ? <>{era.name} <span className="text-primary font-semibold">{formatEraYear(era.eraYear)}</span> <span className="text-xs text-muted-foreground">({era.en} {era.eraYear})</span></> : '—'}
          </div>
        </div>
        {/* Era → Gregorian */}
        <div className="rounded-lg border p-3 space-y-2">
          <div className="text-[10px] uppercase text-muted-foreground font-semibold">Era → Gregorian</div>
          <div className="flex gap-2 flex-wrap">
            <Select value={String(eraIdx)} onValueChange={v => setEraIdx(Number(v))}>
              <SelectTrigger className="w-28 h-9" aria-label="era"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ERAS.map((e, i) => <SelectItem key={e.name} value={String(i)}>{e.name} <span className="text-xs text-muted-foreground">{e.en}</span></SelectItem>)}
              </SelectContent>
            </Select>
            <Input type="number" min={1} max={100} value={eraYear} onChange={e => setEraYear(Math.min(100, Math.max(1, Number(e.target.value) || 1)))} className="w-24" aria-label="era year" />
          </div>
          <div className="jp-sans text-lg" aria-live="polite">
            {west ? <>{west}年 <span className="text-xs text-muted-foreground">{formatEraYear(eraYear)} · {ERAS[eraIdx].kana}</span></> : '—'}
          </div>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Today is {date.era}. Quick jump:</p>
      <div className="flex gap-1.5 flex-wrap">
        {[1868, 1926, 1945, 1964, 1989, 2019].map(y => (
          <Button key={y} size="sm" variant="outline" className="h-7 text-xs" onClick={() => setGy(y)}>{y}</Button>
        ))}
      </div>
    </CardContent></Card>
  );
}

function KataTable({ onSpeak }: { onSpeak: (t: string) => void }) {
  const groups = useMemo(() => HIRAGANA_GROUPS.map(g => ({ label: g.label, rows: g.rows.map(katakanaOf) })), []);
  return <KanaTable groups={groups} onSpeak={onSpeak} />;
}

export function ToolViews({ view }: { view: 'annotator' | 'conjugator' | 'kana' }) {
  if (view === 'annotator') return <AnnotatorView />;
  if (view === 'conjugator') return <ConjugatorView />;
  return <KanaView />;
}
